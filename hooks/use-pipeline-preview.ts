"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { hashPipeline, type PipelineStep } from "@/lib/image-pipeline/contracts";
import { emptyHistogram, type HistogramData } from "@/lib/image-pipeline/histogram";
import {
  getLastBackendDiagnostics,
  isPipelineAbortError,
  renderPreviewWithWorkerFallback,
  type PreviewRenderResult,
} from "@/lib/image-pipeline/worker-client";

type UsePipelinePreviewOptions = {
  sourceUrl: string | null;
  steps: readonly PipelineStep[];
  nodeWidth: number;
  includeHistogram?: boolean;
  previewScale?: number;
  maxPreviewWidth?: number;
  maxDevicePixelRatio?: number;
};

const PREVIEW_RENDER_DEBOUNCE_MS = 48;

type PreviewLatencyTrace = {
  sequence: number;
  changedAtMs: number;
  nodeType: string;
  origin: string;
};

function readPreviewLatencyTrace(): PreviewLatencyTrace | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const debugGlobals = globalThis as typeof globalThis & {
    __LEMONSPACE_DEBUG_PREVIEW_LATENCY__?: boolean;
    __LEMONSPACE_LAST_PREVIEW_TRACE__?: PreviewLatencyTrace;
  };

  if (debugGlobals.__LEMONSPACE_DEBUG_PREVIEW_LATENCY__ !== true) {
    return null;
  }

  return debugGlobals.__LEMONSPACE_LAST_PREVIEW_TRACE__ ?? null;
}

function logPreviewLatency(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const debugGlobals = globalThis as typeof globalThis & {
    __LEMONSPACE_DEBUG_PREVIEW_LATENCY__?: boolean;
  };

  if (debugGlobals.__LEMONSPACE_DEBUG_PREVIEW_LATENCY__ !== true) {
    return;
  }

  console.info("[Preview latency]", event, payload);
}

function computePreviewWidth(
  nodeWidth: number,
  previewScale: number,
  maxPreviewWidth: number,
  maxDevicePixelRatio: number,
): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const effectiveDpr = Math.max(1, Math.min(dpr, maxDevicePixelRatio));
  return Math.max(
    1,
    Math.round(Math.min(nodeWidth * effectiveDpr * previewScale, maxPreviewWidth)),
  );
}

export function usePipelinePreview(options: UsePipelinePreviewOptions): {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  histogram: HistogramData;
  isRendering: boolean;
  hasSource: boolean;
  previewAspectRatio: number;
  error: string | null;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [histogram, setHistogram] = useState<HistogramData>(() => emptyHistogram());
  const [isRendering, setIsRendering] = useState(false);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const stableRenderInputRef = useRef<{
    pipelineHash: string;
    sourceUrl: string | null;
    steps: readonly PipelineStep[];
  } | null>(null);

  const previewScale = useMemo(() => {
    if (typeof options.previewScale !== "number" || !Number.isFinite(options.previewScale)) {
      return 1;
    }
    return Math.max(0.2, Math.min(1, options.previewScale));
  }, [options.previewScale]);

  const maxPreviewWidth = useMemo(() => {
    if (typeof options.maxPreviewWidth !== "number" || !Number.isFinite(options.maxPreviewWidth)) {
      return 1024;
    }
    return Math.max(128, Math.round(options.maxPreviewWidth));
  }, [options.maxPreviewWidth]);

  const maxDevicePixelRatio = useMemo(() => {
    if (
      typeof options.maxDevicePixelRatio !== "number" ||
      !Number.isFinite(options.maxDevicePixelRatio)
    ) {
      return 1.5;
    }
    return Math.max(1, options.maxDevicePixelRatio);
  }, [options.maxDevicePixelRatio]);

  const previewWidth = useMemo(
    () => computePreviewWidth(options.nodeWidth, previewScale, maxPreviewWidth, maxDevicePixelRatio),
    [maxDevicePixelRatio, maxPreviewWidth, options.nodeWidth, previewScale],
  );

  const pipelineHash = useMemo(() => {
    if (!options.sourceUrl) {
      return "no-source";
    }
    return hashPipeline(options.sourceUrl, options.steps);
  }, [options.sourceUrl, options.steps]);

  useEffect(() => {
    if (stableRenderInputRef.current?.pipelineHash === pipelineHash) {
      return;
    }

    stableRenderInputRef.current = {
      pipelineHash,
      sourceUrl: options.sourceUrl,
      steps: options.steps,
    };
  }, [pipelineHash, options.sourceUrl, options.steps]);

  useEffect(() => {
    const sourceUrl = stableRenderInputRef.current?.sourceUrl ?? null;
    if (!sourceUrl) {
      const frameId = window.requestAnimationFrame(() => {
        setHistogram(emptyHistogram());
        setError(null);
        setIsRendering(false);
      });
      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    const currentRun = runIdRef.current + 1;
    runIdRef.current = currentRun;
    const abortController = new AbortController();
    const effectStartedAtMs = performance.now();

    const timer = window.setTimeout(() => {
      const requestStartedAtMs = performance.now();
      const trace = readPreviewLatencyTrace();

      logPreviewLatency("request-start", {
        currentRun,
        pipelineHash,
        previewWidth,
        includeHistogram: options.includeHistogram !== false,
        debounceWaitMs: requestStartedAtMs - effectStartedAtMs,
        sinceChangeMs: trace ? requestStartedAtMs - trace.changedAtMs : null,
        sourceNodeType: trace?.nodeType ?? null,
        sourceOrigin: trace?.origin ?? null,
      });

      setIsRendering(true);
      setError(null);
      void renderPreviewWithWorkerFallback({
        sourceUrl,
        steps: stableRenderInputRef.current?.steps ?? [],
        previewWidth,
        includeHistogram: options.includeHistogram,
        signal: abortController.signal,
      })
        .then((result: PreviewRenderResult) => {
          if (runIdRef.current !== currentRun) return;

          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.width = result.width;
          canvas.height = result.height;
          const context = canvas.getContext("2d");
          if (!context) {
            setError("Preview context unavailable");
            return;
          }
          context.putImageData(result.imageData, 0, 0);
          const paintedAtMs = performance.now();
          setHistogram(result.histogram);
          setPreviewAspectRatio(result.width / result.height);

          logPreviewLatency("paint-end", {
            currentRun,
            pipelineHash,
            previewWidth,
            imageWidth: result.width,
            imageHeight: result.height,
            requestDurationMs: paintedAtMs - requestStartedAtMs,
            sinceChangeMs: trace ? paintedAtMs - trace.changedAtMs : null,
            diagnostics: getLastBackendDiagnostics(),
          });
        })
        .catch((renderError: unknown) => {
          if (runIdRef.current !== currentRun) return;
          if (isPipelineAbortError(renderError)) return;

          const message =
            renderError instanceof Error
              ? renderError.message
              : "Preview rendering failed";

          if (process.env.NODE_ENV !== "production") {
            console.error("[usePipelinePreview] render failed", {
              message,
              sourceUrl,
              pipelineHash,
              previewWidth,
              includeHistogram: options.includeHistogram,
              diagnostics: getLastBackendDiagnostics(),
              error: renderError,
            });
          }

          setError(message);
        })
        .finally(() => {
          if (runIdRef.current !== currentRun) return;
          setIsRendering(false);
        });
    }, PREVIEW_RENDER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [options.includeHistogram, pipelineHash, previewWidth]);

  return {
    canvasRef,
    histogram,
    isRendering,
    hasSource: Boolean(options.sourceUrl),
    previewAspectRatio,
    error,
  };
}
