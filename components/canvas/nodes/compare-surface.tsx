"use client";

import { usePipelinePreview } from "@/hooks/use-pipeline-preview";
import type { RenderPreviewInput } from "@/lib/canvas-render-preview";

const EMPTY_STEPS: RenderPreviewInput["steps"] = [];

type CompareSurfaceProps = {
  finalUrl?: string;
  label?: string;
  previewInput?: RenderPreviewInput;
  nodeWidth: number;
  clipWidthPercent?: number;
  preferPreview?: boolean;
};

export default function CompareSurface({
  finalUrl,
  label,
  previewInput,
  nodeWidth,
  clipWidthPercent,
  preferPreview,
}: CompareSurfaceProps) {
  const usePreview = Boolean(previewInput && (preferPreview || !finalUrl));
  const previewSourceUrl = usePreview ? previewInput?.sourceUrl ?? null : null;
  const previewSteps = usePreview ? previewInput?.steps ?? EMPTY_STEPS : EMPTY_STEPS;
  const visibleFinalUrl = usePreview ? undefined : finalUrl;

  const { canvasRef, isRendering, error } = usePipelinePreview({
    sourceUrl: previewSourceUrl,
    steps: previewSteps,
    nodeWidth,
    includeHistogram: false,
    // Compare-Nodes zeigen nur eine kompakte Live-Ansicht; kleinere Kacheln
    // halten lange Workflows spürbar reaktionsfreudiger.
    previewScale: 0.5,
    maxPreviewWidth: 720,
    maxDevicePixelRatio: 1.25,
  });

  const hasPreview = Boolean(usePreview && previewInput);
  const clipStyle =
    typeof clipWidthPercent === "number"
      ? {
          clipPath: `inset(0 ${100 - clipWidthPercent}% 0 0)`,
          WebkitClipPath: `inset(0 ${100 - clipWidthPercent}% 0 0)`,
        }
      : undefined;

  return (
    <div className="pointer-events-none absolute inset-0" style={clipStyle}>
      {visibleFinalUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={visibleFinalUrl}
          alt={label ?? "Comparison image"}
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      ) : hasPreview ? (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {hasPreview ? (
        <div className="absolute bottom-2 left-2 rounded bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-medium text-black/90 backdrop-blur-sm">
          {isRendering ? "Live Preview..." : "Live Preview"}
        </div>
      ) : null}

      {hasPreview && error ? (
        <div className="absolute bottom-2 right-2 rounded bg-destructive/85 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          Preview error
        </div>
      ) : null}
    </div>
  );
}
