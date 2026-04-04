"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { hashPipeline, type PipelineStep } from "@/lib/image-pipeline/contracts";
import { emptyHistogram, type HistogramData } from "@/lib/image-pipeline/histogram";
import {
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

    const timer = window.setTimeout(() => {
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
          setHistogram(result.histogram);
          setPreviewAspectRatio(result.width / result.height);
        })
        .catch((renderError: unknown) => {
          if (runIdRef.current !== currentRun) return;
          if (isPipelineAbortError(renderError)) return;

          const message =
            renderError instanceof Error
              ? renderError.message
              : "Preview rendering failed";
          setError(message);
        })
        .finally(() => {
          if (runIdRef.current !== currentRun) return;
          setIsRendering(false);
        });
    }, 16);

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
