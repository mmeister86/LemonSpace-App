"use client";

import { useState } from "react";

import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { usePipelinePreview } from "@/hooks/use-pipeline-preview";
import {
  shouldFastPathPreviewPipeline,
  type RenderPreviewInput,
} from "@/lib/canvas-render-preview";
import type { MixerPreviewState } from "@/lib/canvas-mixer-preview";
import {
  computeMixerCompareOverlayImageStyle,
  computeMixerFrameRectInSurface,
  isMixerCropImageReady,
} from "@/lib/mixer-crop-layout";

const EMPTY_STEPS: RenderPreviewInput["steps"] = [];
const ZERO_SIZE = { width: 0, height: 0 };

type LoadedImageState = {
  url: string | null;
  width: number;
  height: number;
};

type CompareSurfaceProps = {
  finalUrl?: string;
  label?: string;
  previewInput?: RenderPreviewInput;
  mixerPreviewState?: MixerPreviewState;
  nodeWidth: number;
  nodeHeight: number;
  clipWidthPercent?: number;
  preferPreview?: boolean;
};

export default function CompareSurface({
  finalUrl,
  label,
  previewInput,
  mixerPreviewState,
  nodeWidth,
  nodeHeight,
  clipWidthPercent,
  preferPreview,
}: CompareSurfaceProps) {
  const graph = useCanvasGraph();
  const [baseImageState, setBaseImageState] = useState<LoadedImageState>({
    url: null,
    ...ZERO_SIZE,
  });
  const [overlayImageState, setOverlayImageState] = useState<LoadedImageState>({
    url: null,
    ...ZERO_SIZE,
  });
  const usePreview = Boolean(previewInput && (preferPreview || !finalUrl));
  const previewSourceUrl = usePreview ? previewInput?.sourceUrl ?? null : null;
  const previewSourceComposition = usePreview ? previewInput?.sourceComposition : undefined;
  const previewSteps = usePreview ? previewInput?.steps ?? EMPTY_STEPS : EMPTY_STEPS;
  const visibleFinalUrl = usePreview ? undefined : finalUrl;
  const previewDebounceMs = shouldFastPathPreviewPipeline(
    previewSteps,
    graph.previewNodeDataOverrides,
  )
    ? 16
    : undefined;

  const { canvasRef, isRendering, error } = usePipelinePreview({
    sourceUrl: previewSourceUrl,
    sourceComposition: previewSourceComposition,
    steps: previewSteps,
    nodeWidth,
    includeHistogram: false,
    debounceMs: previewDebounceMs,
    // Compare-Nodes zeigen nur eine kompakte Live-Ansicht; kleinere Kacheln
    // halten lange Workflows spürbar reaktionsfreudiger.
    previewScale: 0.5,
    maxPreviewWidth: 720,
    maxDevicePixelRatio: 1.25,
  });

  const hasPreview = Boolean(usePreview && previewInput);
  const hasMixerPreview = mixerPreviewState?.status === "ready";
  const clipStyle =
    typeof clipWidthPercent === "number"
      ? {
          clipPath: `inset(0 ${100 - clipWidthPercent}% 0 0)`,
          WebkitClipPath: `inset(0 ${100 - clipWidthPercent}% 0 0)`,
        }
      : undefined;

  const baseNaturalSize =
    mixerPreviewState?.baseUrl && mixerPreviewState.baseUrl === baseImageState.url
      ? { width: baseImageState.width, height: baseImageState.height }
      : ZERO_SIZE;
  const overlayNaturalSize =
    mixerPreviewState?.overlayUrl && mixerPreviewState.overlayUrl === overlayImageState.url
      ? { width: overlayImageState.width, height: overlayImageState.height }
      : ZERO_SIZE;

  const mixerCropReady = isMixerCropImageReady({
    currentOverlayUrl: mixerPreviewState?.overlayUrl,
    loadedOverlayUrl: overlayImageState.url,
    sourceWidth: overlayNaturalSize.width,
    sourceHeight: overlayNaturalSize.height,
  });
  const mixerFrameRect = hasMixerPreview
    ? computeMixerFrameRectInSurface({
        surfaceWidth: nodeWidth,
        surfaceHeight: nodeHeight,
        baseWidth: baseNaturalSize.width,
        baseHeight: baseNaturalSize.height,
        overlayX: mixerPreviewState.overlayX,
        overlayY: mixerPreviewState.overlayY,
        overlayWidth: mixerPreviewState.overlayWidth,
        overlayHeight: mixerPreviewState.overlayHeight,
        fit: "contain",
      })
    : null;

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
      ) : hasMixerPreview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mixerPreviewState.baseUrl}
            alt={label ?? "Comparison image"}
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
            onLoad={(event) => {
              setBaseImageState({
                url: event.currentTarget.currentSrc || event.currentTarget.src,
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
          />
          {mixerFrameRect ? (
            <div
              className="absolute overflow-hidden"
              style={{
                mixBlendMode: mixerPreviewState.blendMode,
                opacity: mixerPreviewState.opacity / 100,
                left: `${mixerFrameRect.x * 100}%`,
                top: `${mixerFrameRect.y * 100}%`,
                width: `${mixerFrameRect.width * 100}%`,
                height: `${mixerFrameRect.height * 100}%`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mixerPreviewState.overlayUrl}
                alt={label ?? "Comparison image"}
                className="absolute max-w-none"
                draggable={false}
                onLoad={(event) => {
                  setOverlayImageState({
                    url: event.currentTarget.currentSrc || event.currentTarget.src,
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                style={
                  mixerCropReady
                    ? computeMixerCompareOverlayImageStyle({
                      surfaceWidth: nodeWidth,
                      surfaceHeight: nodeHeight,
                      baseWidth: baseNaturalSize.width,
                      baseHeight: baseNaturalSize.height,
                      overlayX: mixerPreviewState.overlayX,
                      overlayY: mixerPreviewState.overlayY,
                      overlayWidth: mixerPreviewState.overlayWidth,
                      overlayHeight: mixerPreviewState.overlayHeight,
                      sourceWidth: overlayNaturalSize.width,
                      sourceHeight: overlayNaturalSize.height,
                      cropLeft: mixerPreviewState.cropLeft,
                      cropTop: mixerPreviewState.cropTop,
                      cropRight: mixerPreviewState.cropRight,
                      cropBottom: mixerPreviewState.cropBottom,
                    })
                    : { visibility: "hidden" }
                }
              />
            </div>
          ) : null}
        </>
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
