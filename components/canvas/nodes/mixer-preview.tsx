"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from "react";

import type { MixerPreviewState } from "@/lib/canvas-mixer-preview";
import type { MixerLayerSource } from "@/lib/canvas-render-preview";

import { RichTextCard } from "./rich-text-card";
import { MixerOverlayResizeHandles } from "./mixer-overlay-resize-handles";
import type { FrameHandle, LoadedImageSize } from "./mixer-types";

export function MixerPreview({
  previewRef,
  overlayImageRef,
  previewState,
  showReadyPreview,
  showPreviewError,
  baseLayerSource,
  overlayLayerSource,
  displayedBaseRect,
  overlayFrameStyle,
  overlayContentStyle,
  resizeHandleRect,
  onBaseImageLoad,
  onOverlayImageLoad,
  onImageError,
  onFrameMouseDown,
  onResizeHandleMouseDown,
}: {
  previewRef: RefObject<HTMLDivElement | null>;
  overlayImageRef: RefObject<HTMLImageElement | null>;
  previewState: MixerPreviewState;
  showReadyPreview: boolean;
  showPreviewError: boolean;
  baseLayerSource: MixerLayerSource | undefined;
  overlayLayerSource: MixerLayerSource | undefined;
  displayedBaseRect: { x: number; y: number; width: number; height: number } | null;
  overlayFrameStyle: CSSProperties;
  overlayContentStyle: CSSProperties;
  resizeHandleRect: { left: number; top: number; width: number; height: number };
  onBaseImageLoad: (size: LoadedImageSize) => void;
  onOverlayImageLoad: (size: LoadedImageSize) => void;
  onImageError: () => void;
  onFrameMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResizeHandleMouseDown: (event: ReactMouseEvent<HTMLDivElement>, handle: FrameHandle) => void;
}) {
  const baseLayerStyle = displayedBaseRect
    ? {
        left: `${displayedBaseRect.x * 100}%`,
        top: `${displayedBaseRect.y * 100}%`,
        width: `${displayedBaseRect.width * 100}%`,
        height: `${displayedBaseRect.height * 100}%`,
      }
    : undefined;

  return (
    <div
      ref={previewRef}
      data-testid="mixer-preview"
      className="relative min-h-[140px] overflow-hidden bg-muted/40 nodrag nopan"
    >
      {showReadyPreview ? (
        <>
          {baseLayerSource?.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={baseLayerSource.url}
              alt="Mixer base"
              className={displayedBaseRect ? "absolute max-w-none" : "absolute inset-0 h-full w-full object-contain"}
              draggable={false}
              onLoad={(event) => {
                onBaseImageLoad({
                  url: event.currentTarget.currentSrc || event.currentTarget.src,
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
              onError={onImageError}
              style={baseLayerStyle}
            />
          ) : null}
          {baseLayerSource?.kind === "text" ? (
            <div
              data-testid="mixer-base-text"
              className="absolute overflow-hidden"
              style={baseLayerStyle ?? { inset: 0 }}
            >
              <RichTextCard data={baseLayerSource.richText} />
            </div>
          ) : null}

          <div
            data-testid="mixer-overlay"
            data-interaction-role="frame"
            data-anchor-source="frame"
            className="absolute cursor-move overflow-hidden border border-white/70 nodrag nopan"
            onMouseDown={onFrameMouseDown}
            style={overlayFrameStyle}
          >
            {overlayLayerSource?.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={overlayLayerSource.url}
                alt="Mixer overlay"
                data-testid="mixer-overlay-content"
                data-interaction-role="content"
                data-anchor-source="frame"
                ref={overlayImageRef}
                className="absolute max-w-none nodrag nopan cursor-default"
                draggable={false}
                onLoad={(event) => {
                  onOverlayImageLoad({
                    url: event.currentTarget.currentSrc || event.currentTarget.src,
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                onError={onImageError}
                style={overlayContentStyle}
              />
            ) : null}
            {overlayLayerSource?.kind === "text" ? (
              <div
                data-testid="mixer-overlay-content"
                data-interaction-role="content"
                data-anchor-source="frame"
                className="absolute max-w-none nodrag nopan cursor-default"
                style={overlayContentStyle}
              >
                <RichTextCard data={overlayLayerSource.richText} />
              </div>
            ) : null}
          </div>

          <MixerOverlayResizeHandles
            resizeHandleRect={resizeHandleRect}
            onResizeHandleMouseDown={onResizeHandleMouseDown}
          />
        </>
      ) : null}

      {previewState.status === "empty" && !showPreviewError ? (
        <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs text-muted-foreground">
          Connect base and overlay inputs
        </div>
      ) : null}

      {previewState.status === "partial" && !showPreviewError ? (
        <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs text-muted-foreground">
          Waiting for second input
        </div>
      ) : null}

      {showPreviewError ? (
        <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs text-red-600">
          Preview unavailable
        </div>
      ) : null}
    </div>
  );
}
