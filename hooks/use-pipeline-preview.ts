"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { hashPipeline, type PipelineStep } from "@/lib/image-pipeline/contracts";
import { emptyHistogram, type HistogramData } from "@/lib/image-pipeline/histogram";
import {
  renderPreview,
  type PreviewRenderResult,
} from "@/lib/image-pipeline/preview-renderer";

type UsePipelinePreviewOptions = {
  sourceUrl: string | null;
  steps: readonly PipelineStep[];
  nodeWidth: number;
  previewScale?: number;
  maxPreviewWidth?: number;
};

function computePreviewWidth(nodeWidth: number, previewScale: number, maxPreviewWidth: number): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.round(Math.min(nodeWidth * dpr * previewScale, maxPreviewWidth)));
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

  const previewWidth = useMemo(
    () => computePreviewWidth(options.nodeWidth, previewScale, maxPreviewWidth),
    [maxPreviewWidth, options.nodeWidth, previewScale],
  );

  const pipelineHash = useMemo(() => {
    if (!options.sourceUrl) {
      return "no-source";
    }
    return hashPipeline(options.sourceUrl, options.steps);
  }, [options.sourceUrl, options.steps]);

  useEffect(() => {
    const sourceUrl = options.sourceUrl;
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

    const timer = window.setTimeout(() => {
      setIsRendering(true);
      setError(null);
      void renderPreview({
        sourceUrl,
        steps: options.steps,
        previewWidth,
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
    };
  }, [options.sourceUrl, options.steps, pipelineHash, previewWidth]);

  return {
    canvasRef,
    histogram,
    isRendering,
    hasSource: Boolean(options.sourceUrl),
    previewAspectRatio,
    error,
  };
}
