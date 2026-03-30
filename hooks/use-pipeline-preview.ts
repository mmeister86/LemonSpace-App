"use client";

import { useEffect, useMemo, useState } from "react";
import type { PipelineStep } from "@/lib/image-pipeline/pipeline";
import {
  canvasToBlob,
  loadImage,
  renderPipelineToCanvas,
} from "@/lib/image-pipeline/canvas-render";

type PipelinePreviewState = {
  previewUrl: string | null;
  isRendering: boolean;
  error: string | null;
};

export function usePipelinePreview(
  sourceUrl: string | null,
  steps: PipelineStep[],
  previewWidth: number,
): PipelinePreviewState {
  const [state, setState] = useState<PipelinePreviewState>({
    previewUrl: null,
    isRendering: false,
    error: null,
  });

  const stepsMemo = useMemo(() => steps, [steps]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!sourceUrl) {
      setState({ previewUrl: null, isRendering: false, error: null });
      return;
    }

    setState((current) => ({ ...current, isRendering: true, error: null }));

    void (async () => {
      try {
        const img = await loadImage(sourceUrl);
        if (cancelled) return;
        const canvas = renderPipelineToCanvas(img, stepsMemo, {
          mode: "original",
          maxWidth: previewWidth,
        });
        const blob = await canvasToBlob(canvas, "jpeg", 82);

        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setState((current) => {
          if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
          return { previewUrl: objectUrl, isRendering: false, error: null };
        });
      } catch (error) {
        if (cancelled) return;
        setState((current) => ({
          previewUrl: current.previewUrl,
          isRendering: false,
          error: error instanceof Error ? error.message : "Preview-Fehler",
        }));
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewWidth, sourceUrl, stepsMemo]);

  return state;
}
