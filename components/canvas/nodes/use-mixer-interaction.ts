"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { diffMixerData, roundDiagnosticNumber } from "./mixer-diagnostics";
import {
  clamp,
  computeAspectRatio,
  MAX_OVERLAY_POSITION,
  MIN_CROP_REMAINING_SIZE,
  MIN_OVERLAY_SIZE,
  type FrameHandle,
  type MixerLocalData,
} from "./mixer-types";

type InteractionState =
  | {
      kind: "frame-move";
      startClientX: number;
      startClientY: number;
      startData: MixerLocalData;
      previewWidth: number;
      previewHeight: number;
    }
  | {
      kind: "frame-resize";
      handle: FrameHandle;
      startClientX: number;
      startClientY: number;
      startData: MixerLocalData;
      previewWidth: number;
      previewHeight: number;
    };

export function normalizeLocalMixerData(data: MixerLocalData): MixerLocalData {
  const overlayX = clamp(data.overlayX, 0, MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE);
  const overlayY = clamp(data.overlayY, 0, MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE);
  const overlayWidth = clamp(data.overlayWidth, MIN_OVERLAY_SIZE, MAX_OVERLAY_POSITION - overlayX);
  const overlayHeight = clamp(data.overlayHeight, MIN_OVERLAY_SIZE, MAX_OVERLAY_POSITION - overlayY);
  const cropLeft = clamp(data.cropLeft, 0, MAX_OVERLAY_POSITION - MIN_CROP_REMAINING_SIZE);
  const cropTop = clamp(data.cropTop, 0, MAX_OVERLAY_POSITION - MIN_CROP_REMAINING_SIZE);
  const cropRight = clamp(data.cropRight, 0, MAX_OVERLAY_POSITION - cropLeft - MIN_CROP_REMAINING_SIZE);
  const cropBottom = clamp(data.cropBottom, 0, MAX_OVERLAY_POSITION - cropTop - MIN_CROP_REMAINING_SIZE);

  return {
    ...data,
    overlayX,
    overlayY,
    overlayWidth,
    overlayHeight,
    cropLeft,
    cropTop,
    cropRight,
    cropBottom,
  };
}

function clampOverlayRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const width = clamp(rect.width, MIN_OVERLAY_SIZE, 1);
  const height = clamp(rect.height, MIN_OVERLAY_SIZE, 1);
  const x = clamp(rect.x, 0, Math.max(0, 1 - width));
  const y = clamp(rect.y, 0, Math.max(0, 1 - height));

  return { x, y, width, height };
}

export function resizeOverlayRect(args: {
  startRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  handle: FrameHandle;
  deltaX: number;
  deltaY: number;
  keepAspect: boolean;
  aspectRatio: number;
}) {
  const { startRect, handle, deltaX, deltaY, keepAspect, aspectRatio } = args;
  const startRight = startRect.x + startRect.width;
  const startBottom = startRect.y + startRect.height;

  if (!keepAspect) {
    let left = startRect.x;
    let top = startRect.y;
    let right = startRight;
    let bottom = startBottom;

    if (handle.includes("w")) left = clamp(startRect.x + deltaX, 0, startRight - MIN_OVERLAY_SIZE);
    if (handle.includes("e")) right = clamp(startRight + deltaX, startRect.x + MIN_OVERLAY_SIZE, 1);
    if (handle.includes("n")) top = clamp(startRect.y + deltaY, 0, startBottom - MIN_OVERLAY_SIZE);
    if (handle.includes("s")) bottom = clamp(startBottom + deltaY, startRect.y + MIN_OVERLAY_SIZE, 1);

    return clampOverlayRect({ x: left, y: top, width: right - left, height: bottom - top });
  }

  const aspect = Math.max(MIN_OVERLAY_SIZE, aspectRatio);

  if (handle === "e" || handle === "w") {
    const centerY = startRect.y + startRect.height / 2;
    const maxWidth = handle === "e" ? 1 - startRect.x : startRight;
    const minWidth = Math.max(MIN_OVERLAY_SIZE, MIN_OVERLAY_SIZE * aspect);
    const rawWidth = handle === "e" ? startRect.width + deltaX : startRect.width - deltaX;
    const nextWidth = clamp(rawWidth, minWidth, Math.max(minWidth, maxWidth));
    const nextHeight = nextWidth / aspect;
    const nextY = clamp(centerY - nextHeight / 2, 0, Math.max(0, 1 - nextHeight));
    const nextX = handle === "e" ? startRect.x : startRight - nextWidth;
    return clampOverlayRect({ x: nextX, y: nextY, width: nextWidth, height: nextHeight });
  }

  if (handle === "n" || handle === "s") {
    const centerX = startRect.x + startRect.width / 2;
    const maxHeight = handle === "s" ? 1 - startRect.y : startBottom;
    const minHeight = Math.max(MIN_OVERLAY_SIZE, MIN_OVERLAY_SIZE / aspect);
    const rawHeight = handle === "s" ? startRect.height + deltaY : startRect.height - deltaY;
    const nextHeight = clamp(rawHeight, minHeight, Math.max(minHeight, maxHeight));
    const nextWidth = nextHeight * aspect;
    const nextX = clamp(centerX - nextWidth / 2, 0, Math.max(0, 1 - nextWidth));
    const nextY = handle === "s" ? startRect.y : startBottom - nextHeight;
    return clampOverlayRect({ x: nextX, y: nextY, width: nextWidth, height: nextHeight });
  }

  const movesRight = handle.includes("e");
  const movesDown = handle.includes("s");
  const rawWidth = startRect.width + (movesRight ? deltaX : -deltaX);
  const rawHeight = startRect.height + (movesDown ? deltaY : -deltaY);
  const widthByHeight = rawHeight * aspect;
  const heightByWidth = rawWidth / aspect;
  const useWidth = Math.abs(rawWidth - startRect.width) >= Math.abs(rawHeight - startRect.height);
  let nextWidth = useWidth ? rawWidth : widthByHeight;
  let nextHeight = useWidth ? heightByWidth : rawHeight;
  const anchorX = movesRight ? startRect.x : startRight;
  const anchorY = movesDown ? startRect.y : startBottom;
  const maxWidth = movesRight ? 1 - anchorX : anchorX;
  const maxHeight = movesDown ? 1 - anchorY : anchorY;
  const maxScaleByWidth = maxWidth / Math.max(MIN_OVERLAY_SIZE, nextWidth);
  const maxScaleByHeight = maxHeight / Math.max(MIN_OVERLAY_SIZE, nextHeight);
  const maxScale = Math.min(1, maxScaleByWidth, maxScaleByHeight);
  nextWidth *= maxScale;
  nextHeight *= maxScale;
  const minScaleByWidth = Math.max(1, MIN_OVERLAY_SIZE / Math.max(MIN_OVERLAY_SIZE, nextWidth));
  const minScaleByHeight = Math.max(1, MIN_OVERLAY_SIZE / Math.max(MIN_OVERLAY_SIZE, nextHeight));
  const minScale = Math.max(minScaleByWidth, minScaleByHeight);
  nextWidth *= minScale;
  nextHeight *= minScale;
  const nextX = movesRight ? anchorX : anchorX - nextWidth;
  const nextY = movesDown ? anchorY : anchorY - nextHeight;
  return clampOverlayRect({ x: nextX, y: nextY, width: nextWidth, height: nextHeight });
}

export function useMixerInteraction(args: {
  previewRef: RefObject<HTMLElement | null>;
  localData: MixerLocalData;
  updateLocalData: (updater: (current: MixerLocalData) => MixerLocalData) => void;
  keepAspectRatio: boolean;
  displayedBaseRect: { width: number; height: number } | null;
  emitMixerDiagnostics: (reason: string, extra?: Record<string, unknown>) => void;
}) {
  const [interaction, setInteraction] = useState<InteractionState | null>(null);

  const startInteraction = (
    event: ReactMouseEvent<HTMLElement>,
    kind: InteractionState["kind"],
    handle?: FrameHandle,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const previewRect = args.previewRef.current?.getBoundingClientRect();
    if (!previewRect || previewRect.width <= 0 || previewRect.height <= 0) {
      return;
    }

    args.emitMixerDiagnostics("interaction-start", {
      requestedInteractionKind: kind,
      resizeCorner: handle ?? null,
      target: event.target instanceof HTMLElement ? event.target.dataset : null,
      currentTarget: event.currentTarget.dataset,
      currentTargetClassName:
        event.currentTarget instanceof HTMLElement ? event.currentTarget.className : null,
      pointer: { clientX: event.clientX, clientY: event.clientY },
    });

    const activeGeometryWidth = (args.displayedBaseRect?.width ?? 1) * previewRect.width || previewRect.width;
    const activeGeometryHeight = (args.displayedBaseRect?.height ?? 1) * previewRect.height || previewRect.height;

    if (kind === "frame-resize") {
      if (!handle) return;
      setInteraction({
        kind,
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startData: args.localData,
        previewWidth: activeGeometryWidth,
        previewHeight: activeGeometryHeight,
      });
      return;
    }

    setInteraction({
      kind,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startData: args.localData,
      previewWidth: activeGeometryWidth,
      previewHeight: activeGeometryHeight,
    });
  };

  useEffect(() => {
    if (!interaction) return;

    const handleMouseMove = (event: MouseEvent) => {
      const pointerDeltaX = event.clientX - interaction.startClientX;
      const pointerDeltaY = event.clientY - interaction.startClientY;
      const deltaX = pointerDeltaX / interaction.previewWidth;
      const deltaY = pointerDeltaY / interaction.previewHeight;

      const emitInteractionMoveDiagnostics = (
        nextData: MixerLocalData,
        extra?: Record<string, unknown>,
      ) => {
        args.emitMixerDiagnostics("interaction-move", {
          requestedInteractionKind: interaction.kind,
          resizeCorner: interaction.kind === "frame-resize" ? interaction.handle : null,
          pointer: { clientX: event.clientX, clientY: event.clientY },
          pointerDeltaPx: {
            x: roundDiagnosticNumber(pointerDeltaX),
            y: roundDiagnosticNumber(pointerDeltaY),
          },
          deltaInPreviewSpace: {
            x: roundDiagnosticNumber(deltaX),
            y: roundDiagnosticNumber(deltaY),
          },
          changedFields: diffMixerData(interaction.startData, nextData),
          beforeAspectRatio: {
            overlay: roundDiagnosticNumber(
              computeAspectRatio(interaction.startData.overlayWidth, interaction.startData.overlayHeight),
            ),
          },
          afterAspectRatio: {
            overlay: roundDiagnosticNumber(computeAspectRatio(nextData.overlayWidth, nextData.overlayHeight)),
          },
          semanticChecks: {
            resizeChangedOverlayAspectRatio:
              interaction.kind === "frame-resize"
                ? interaction.startData.overlayWidth / interaction.startData.overlayHeight !==
                  nextData.overlayWidth / nextData.overlayHeight
                : null,
          },
          ...extra,
        });
      };

      if (interaction.kind === "frame-move") {
        const nextX = clamp(
          interaction.startData.overlayX + deltaX,
          0,
          MAX_OVERLAY_POSITION - interaction.startData.overlayWidth,
        );
        const nextY = clamp(
          interaction.startData.overlayY + deltaY,
          0,
          MAX_OVERLAY_POSITION - interaction.startData.overlayHeight,
        );
        const nextData = { ...interaction.startData, overlayX: nextX, overlayY: nextY };

        emitInteractionMoveDiagnostics(nextData, {
          deltaInFrameSpace: { x: roundDiagnosticNumber(deltaX), y: roundDiagnosticNumber(deltaY) },
        });
        args.updateLocalData((current) => ({ ...current, overlayX: nextX, overlayY: nextY }));
        return;
      }

      const nextRect = resizeOverlayRect({
        startRect: {
          x: interaction.startData.overlayX,
          y: interaction.startData.overlayY,
          width: interaction.startData.overlayWidth,
          height: interaction.startData.overlayHeight,
        },
        handle: interaction.handle,
        deltaX,
        deltaY,
        keepAspect: args.keepAspectRatio,
        aspectRatio: interaction.startData.overlayWidth / Math.max(MIN_OVERLAY_SIZE, interaction.startData.overlayHeight),
      });
      const nextData = normalizeLocalMixerData({
        ...interaction.startData,
        overlayX: nextRect.x,
        overlayY: nextRect.y,
        overlayWidth: nextRect.width,
        overlayHeight: nextRect.height,
      });

      emitInteractionMoveDiagnostics(nextData, {
        deltaInFrameSpace: { x: roundDiagnosticNumber(deltaX), y: roundDiagnosticNumber(deltaY) },
      });
      args.updateLocalData(() => nextData);
    };

    const handleMouseUp = () => {
      args.emitMixerDiagnostics("interaction-end");
      setInteraction(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [args, interaction]);

  return { interaction, startInteraction };
}
