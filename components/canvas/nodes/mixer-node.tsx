"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Position, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";
import { useNodeLocalData } from "./use-node-local-data";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import {
  normalizeMixerPreviewData,
  resolveMixerPreviewFromGraph,
  type MixerBlendMode,
} from "@/lib/canvas-mixer-preview";
import type { Id } from "@/convex/_generated/dataModel";
import CanvasHandle from "@/components/canvas/canvas-handle";
import {
  computeMixerCropImageStyle,
  computeMixerFrameRectInSurface,
  computeVisibleMixerContentRect,
} from "@/lib/mixer-crop-layout";

const BLEND_MODE_OPTIONS: MixerBlendMode[] = ["normal", "multiply", "screen", "overlay"];
const MIN_OVERLAY_SIZE = 0.1;
const MIN_CROP_REMAINING_SIZE = 0.1;
const MAX_OVERLAY_POSITION = 1;
const SAVE_DELAY_MS = 160;
const MIXER_DIAGNOSTICS_ENABLED =
  process.env.NODE_ENV !== "test" && process.env.NEXT_PUBLIC_MIXER_DIAGNOSTICS === "1";

type MixerLocalData = ReturnType<typeof normalizeMixerPreviewData>;
type FrameHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

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

type LoadedImageSize = {
  url: string | null;
  width: number;
  height: number;
};

type PreviewSurfaceSize = {
  width: number;
  height: number;
};

const ZERO_SURFACE_SIZE: PreviewSurfaceSize = { width: 0, height: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeAspectRatio(width: number, height: number): number | null {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const ratio = width / height;
  return Number.isFinite(ratio) ? ratio : null;
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function resolveSourceImageSize(data: unknown): PreviewSurfaceSize {
  const record = (data ?? {}) as Record<string, unknown>;
  const width =
    readPositiveNumber(record.intrinsicWidth) ??
    readPositiveNumber(record.outputWidth) ??
    readPositiveNumber(record.width);
  const height =
    readPositiveNumber(record.intrinsicHeight) ??
    readPositiveNumber(record.outputHeight) ??
    readPositiveNumber(record.height);

  if (!width || !height) {
    return ZERO_SURFACE_SIZE;
  }

  return { width, height };
}

function roundDiagnosticNumber(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 1000) / 1000;
}

function diffMixerData(before: MixerLocalData, after: MixerLocalData) {
  const keys: Array<keyof MixerLocalData> = [
    "blendMode",
    "opacity",
    "overlayX",
    "overlayY",
    "overlayWidth",
    "overlayHeight",
    "cropLeft",
    "cropTop",
    "cropRight",
    "cropBottom",
  ];

  return keys.reduce<Record<string, { before: unknown; after: unknown }>>((acc, key) => {
    if (before[key] !== after[key]) {
      acc[key] = {
        before: before[key],
        after: after[key],
      };
    }
    return acc;
  }, {});
}

function normalizeLocalMixerData(data: MixerLocalData): MixerLocalData {
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

  return {
    x,
    y,
    width,
    height,
  };
}

function resizeOverlayRect(args: {
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

    if (handle.includes("w")) {
      left = clamp(startRect.x + deltaX, 0, startRight - MIN_OVERLAY_SIZE);
    }
    if (handle.includes("e")) {
      right = clamp(startRight + deltaX, startRect.x + MIN_OVERLAY_SIZE, 1);
    }
    if (handle.includes("n")) {
      top = clamp(startRect.y + deltaY, 0, startBottom - MIN_OVERLAY_SIZE);
    }
    if (handle.includes("s")) {
      bottom = clamp(startBottom + deltaY, startRect.y + MIN_OVERLAY_SIZE, 1);
    }

    return clampOverlayRect({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
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

export default function MixerNode({ id, data, selected, width, height }: NodeProps) {
  const graph = useCanvasGraph();
  const { queueNodeDataUpdate } = useCanvasSync();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);
  const latestNodeDataRef = useRef((data ?? {}) as Record<string, unknown>);
  const [hasImageLoadError, setHasImageLoadError] = useState(false);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [baseImageSize, setBaseImageSize] = useState<LoadedImageSize>({
    url: null,
    width: 0,
    height: 0,
  });
  const [overlayImageSize, setOverlayImageSize] = useState<LoadedImageSize>({
    url: null,
    width: 0,
    height: 0,
  });
  const [previewSurfaceSize, setPreviewSurfaceSize] = useState<PreviewSurfaceSize>(ZERO_SURFACE_SIZE);

  useEffect(() => {
    latestNodeDataRef.current = (data ?? {}) as Record<string, unknown>;
  }, [data]);

  const { localData, updateLocalData } = useNodeLocalData<MixerLocalData>({
    nodeId: id,
    data,
    normalize: normalizeMixerPreviewData,
    saveDelayMs: SAVE_DELAY_MS,
    onSave: (next) =>
      queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...latestNodeDataRef.current,
          ...next,
        },
      }),
    debugLabel: "mixer",
  });

  const previewState = useMemo(
    () => resolveMixerPreviewFromGraph({ nodeId: id, graph }),
    [graph, id],
  );
  const baseSourceNode = useMemo(() => {
    const incomingEdges = graph.incomingEdgesByTarget.get(id) ?? [];
    const baseEdge = incomingEdges.find(
      (edge) => edge.targetHandle === "base" || edge.targetHandle == null || edge.targetHandle === "",
    );

    return baseEdge ? graph.nodesById.get(baseEdge.source) : undefined;
  }, [graph, id]);
  const baseSourceSize = useMemo(
    () => resolveSourceImageSize(baseSourceNode?.data),
    [baseSourceNode?.data],
  );
  const overlayImageUrl = previewState.status === "ready" ? previewState.overlayUrl : null;
  const baseImageUrl = previewState.status === "ready" ? previewState.baseUrl : null;

  useEffect(() => {
    const previewElement = previewRef.current;
    if (!previewElement) {
      return;
    }

    const updatePreviewSurfaceSize = (nextWidth: number, nextHeight: number) => {
      setPreviewSurfaceSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    const measurePreview = () => {
      const rect = previewElement.getBoundingClientRect();
      updatePreviewSurfaceSize(rect.width, rect.height);
    };

    measurePreview();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updatePreviewSurfaceSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(previewElement);
    return () => observer.disconnect();
  }, []);

  const overlayNaturalSize =
    overlayImageUrl && overlayImageUrl === overlayImageSize.url
      ? {
          width: overlayImageSize.width,
          height: overlayImageSize.height,
        }
      : { width: 0, height: 0 };
  const baseNaturalSize =
    baseImageUrl && baseImageUrl === baseImageSize.url
      ? {
          width: baseImageSize.width,
          height: baseImageSize.height,
        }
      : baseSourceSize;

  const emitMixerDiagnostics = (reason: string, extra?: Record<string, unknown>) => {
    if (!MIXER_DIAGNOSTICS_ENABLED) {
      return;
    }

    const previewRect = previewRef.current?.getBoundingClientRect();
    const overlayImage = overlayImageRef.current;

    const frameRect = previewRect
      ? {
          x: localData.overlayX * previewRect.width,
          y: localData.overlayY * previewRect.height,
          width: localData.overlayWidth * previewRect.width,
          height: localData.overlayHeight * previewRect.height,
        }
      : null;

    const contentBoundsRect = frameRect
      ? {
          x: frameRect.x + localData.cropLeft * frameRect.width,
          y: frameRect.y + localData.cropTop * frameRect.height,
          width: Math.max(1 - localData.cropLeft - localData.cropRight, MIN_CROP_REMAINING_SIZE) * frameRect.width,
          height:
            Math.max(1 - localData.cropTop - localData.cropBottom, MIN_CROP_REMAINING_SIZE) * frameRect.height,
        }
      : null;

    const visibleContentRect =
      frameRect && overlayImage
        ? computeVisibleMixerContentRect({
            frameAspectRatio: computeAspectRatio(frameRect.width, frameRect.height) ?? 1,
            sourceWidth: overlayImage.naturalWidth,
            sourceHeight: overlayImage.naturalHeight,
            cropLeft: localData.cropLeft,
            cropTop: localData.cropTop,
            cropRight: localData.cropRight,
            cropBottom: localData.cropBottom,
          })
        : null;
    const visibleContentRectPx =
      frameRect && visibleContentRect
        ? {
            x: frameRect.x + visibleContentRect.x * frameRect.width,
            y: frameRect.y + visibleContentRect.y * frameRect.height,
            width: visibleContentRect.width * frameRect.width,
            height: visibleContentRect.height * frameRect.height,
          }
        : null;

    const frameAspectRatio = frameRect
      ? computeAspectRatio(frameRect.width, frameRect.height)
      : null;
    const contentBoundsAspectRatio = contentBoundsRect
      ? computeAspectRatio(contentBoundsRect.width, contentBoundsRect.height)
      : null;
    const visibleContentAspectRatio = visibleContentRectPx
      ? computeAspectRatio(visibleContentRectPx.width, visibleContentRectPx.height)
      : null;

    const currentHandleRect = frameRect;

    const handleOffsetFromVisibleContent =
      currentHandleRect && visibleContentRectPx
        ? {
            x: roundDiagnosticNumber(currentHandleRect.x - visibleContentRectPx.x),
            y: roundDiagnosticNumber(currentHandleRect.y - visibleContentRectPx.y),
            width: roundDiagnosticNumber(currentHandleRect.width - visibleContentRectPx.width),
            height: roundDiagnosticNumber(currentHandleRect.height - visibleContentRectPx.height),
          }
        : null;

    console.debug("[mixer-diagnostics]", {
      nodeId: id,
      reason,
      mode: "frame-resize",
      intent: "move/resize should update overlay frame predictably",
      currentHandleAnchorSource: "frame",
      expectedHandleAnchorSource: "frame",
      interactionKind: interaction?.kind ?? null,
      previewRect,
      frameRect,
      frameAspectRatio: roundDiagnosticNumber(frameAspectRatio),
      contentBoundsRect,
      contentBoundsAspectRatio: roundDiagnosticNumber(contentBoundsAspectRatio),
      visibleContentRect,
      visibleContentAspectRatio: roundDiagnosticNumber(visibleContentAspectRatio),
      currentHandleRect,
      handleOffsetFromVisibleContent,
      overlayNaturalSize: overlayImage
        ? {
            width: overlayImage.naturalWidth,
            height: overlayImage.naturalHeight,
          }
        : null,
      localData,
      ...extra,
    });
  };

  useEffect(() => {
    emitMixerDiagnostics("mode-or-geometry-changed");
  }, [
    localData.overlayX,
    localData.overlayY,
    localData.overlayWidth,
    localData.overlayHeight,
    localData.cropLeft,
    localData.cropTop,
    localData.cropRight,
    localData.cropBottom,
  ]);

  const onBlendModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setHasImageLoadError(false);
    updateLocalData((current) => ({
      ...current,
      blendMode: event.target.value as MixerBlendMode,
    }));
  };

  const onNumberChange = (
    field:
      | "opacity"
      | "overlayX"
      | "overlayY"
      | "overlayWidth"
      | "overlayHeight",
  ) =>
    (event: FormEvent<HTMLInputElement>) => {
    setHasImageLoadError(false);
    const nextValue = Number(event.currentTarget.value);

    updateLocalData((current) => {
      if (!Number.isFinite(nextValue)) {
        return current;
      }

      if (field === "opacity") {
        return {
          ...current,
          opacity: clamp(nextValue, 0, 100),
        };
      }

      return normalizeLocalMixerData({
        ...current,
        [field]: nextValue,
      });
    });
  };

  const startInteraction = (
    event: ReactMouseEvent<HTMLElement>,
    kind: InteractionState["kind"],
    handle?: FrameHandle,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const previewRect = previewRef.current?.getBoundingClientRect();
    if (!previewRect || previewRect.width <= 0 || previewRect.height <= 0) {
      return;
    }

    emitMixerDiagnostics("interaction-start", {
      requestedInteractionKind: kind,
      resizeCorner: handle ?? null,
      target: event.target instanceof HTMLElement ? event.target.dataset : null,
      currentTarget: event.currentTarget.dataset,
      currentTargetClassName:
        event.currentTarget instanceof HTMLElement ? event.currentTarget.className : null,
      pointer: {
        clientX: event.clientX,
        clientY: event.clientY,
      },
    });

    const activeGeometryRect = displayedBaseRect;
    const activeGeometryWidth =
      (activeGeometryRect?.width ?? 1) * previewRect.width || previewRect.width;
    const activeGeometryHeight =
      (activeGeometryRect?.height ?? 1) * previewRect.height || previewRect.height;

    if (kind === "frame-resize") {
      if (!handle) {
        return;
      }

      setInteraction({
        kind,
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startData: localData,
        previewWidth: activeGeometryWidth,
        previewHeight: activeGeometryHeight,
      });
      return;
    }

    setInteraction({
      kind,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startData: localData,
      previewWidth: activeGeometryWidth,
      previewHeight: activeGeometryHeight,
    });
  };

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const pointerDeltaX = event.clientX - interaction.startClientX;
      const pointerDeltaY = event.clientY - interaction.startClientY;
      const deltaX = pointerDeltaX / interaction.previewWidth;
      const deltaY = pointerDeltaY / interaction.previewHeight;

      const emitInteractionMoveDiagnostics = (
        nextData: MixerLocalData,
        extra?: Record<string, unknown>,
      ) => {
        const changedFields = diffMixerData(interaction.startData, nextData);
        emitMixerDiagnostics("interaction-move", {
          requestedInteractionKind: interaction.kind,
          resizeCorner: interaction.kind === "frame-resize" ? interaction.handle : null,
          pointer: {
            clientX: event.clientX,
            clientY: event.clientY,
          },
          pointerDeltaPx: {
            x: roundDiagnosticNumber(pointerDeltaX),
            y: roundDiagnosticNumber(pointerDeltaY),
          },
          deltaInPreviewSpace: {
            x: roundDiagnosticNumber(deltaX),
            y: roundDiagnosticNumber(deltaY),
          },
          changedFields,
          beforeAspectRatio: {
            overlay: roundDiagnosticNumber(
              computeAspectRatio(
                interaction.startData.overlayWidth,
                interaction.startData.overlayHeight,
              ),
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

        const nextData = {
          ...interaction.startData,
          overlayX: nextX,
          overlayY: nextY,
        };

        emitInteractionMoveDiagnostics(nextData, {
          deltaInFrameSpace: {
            x: roundDiagnosticNumber(deltaX),
            y: roundDiagnosticNumber(deltaY),
          },
        });

        updateLocalData((current) => ({
          ...current,
          overlayX: nextX,
          overlayY: nextY,
        }));
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
        keepAspect: keepAspectRatio,
        aspectRatio:
          interaction.startData.overlayWidth /
          Math.max(MIN_OVERLAY_SIZE, interaction.startData.overlayHeight),
      });

      const nextData = normalizeLocalMixerData({
        ...interaction.startData,
        overlayX: nextRect.x,
        overlayY: nextRect.y,
        overlayWidth: nextRect.width,
        overlayHeight: nextRect.height,
      });

      emitInteractionMoveDiagnostics(
        nextData,
        {
          deltaInFrameSpace: {
            x: roundDiagnosticNumber(deltaX),
            y: roundDiagnosticNumber(deltaY),
          },
        },
      );

      updateLocalData(() => nextData);
    };

    const handleMouseUp = () => {
      emitMixerDiagnostics("interaction-end");
      setInteraction(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [interaction, keepAspectRatio, updateLocalData]);

  const showReadyPreview = previewState.status === "ready" && !hasImageLoadError;
  const showPreviewError = hasImageLoadError || previewState.status === "error";
  const effectivePreviewSurfaceWidth = previewSurfaceSize.width || width || 0;
  const effectivePreviewSurfaceHeight = previewSurfaceSize.height || height || 0;
  const displayedBaseRect = computeMixerFrameRectInSurface({
    surfaceWidth: effectivePreviewSurfaceWidth,
    surfaceHeight: effectivePreviewSurfaceHeight,
    baseWidth: baseNaturalSize.width,
    baseHeight: baseNaturalSize.height,
    overlayX: 0,
    overlayY: 0,
    overlayWidth: 1,
    overlayHeight: 1,
  });
  const displayedOverlayFrameRect = computeMixerFrameRectInSurface({
    surfaceWidth: effectivePreviewSurfaceWidth,
    surfaceHeight: effectivePreviewSurfaceHeight,
    baseWidth: baseNaturalSize.width,
    baseHeight: baseNaturalSize.height,
    overlayX: localData.overlayX,
    overlayY: localData.overlayY,
    overlayWidth: localData.overlayWidth,
    overlayHeight: localData.overlayHeight,
  });
  const resizeHandleRect = displayedOverlayFrameRect
    ? {
        left: displayedOverlayFrameRect.x,
        top: displayedOverlayFrameRect.y,
        width: displayedOverlayFrameRect.width,
        height: displayedOverlayFrameRect.height,
      }
    : {
        left: localData.overlayX,
        top: localData.overlayY,
        width: localData.overlayWidth,
        height: localData.overlayHeight,
      };
  const overlayFrameStyle = {
    mixBlendMode: localData.blendMode,
    opacity: localData.opacity / 100,
    left: `${(displayedOverlayFrameRect?.x ?? localData.overlayX) * 100}%`,
    top: `${(displayedOverlayFrameRect?.y ?? localData.overlayY) * 100}%`,
    width: `${(displayedOverlayFrameRect?.width ?? localData.overlayWidth) * 100}%`,
    height: `${(displayedOverlayFrameRect?.height ?? localData.overlayHeight) * 100}%`,
  } as const;

  const overlayContentStyle = computeMixerCropImageStyle({
    sourceWidth: overlayNaturalSize.width,
    sourceHeight: overlayNaturalSize.height,
    cropLeft: localData.cropLeft,
    cropTop: localData.cropTop,
    cropRight: localData.cropRight,
    cropBottom: localData.cropBottom,
  });
  const overlayResizeHandles = [
    { corner: "nw", cursor: "nwse-resize" },
    { corner: "n", cursor: "ns-resize" },
    { corner: "ne", cursor: "nesw-resize" },
    { corner: "e", cursor: "ew-resize" },
    { corner: "se", cursor: "nwse-resize" },
    { corner: "s", cursor: "ns-resize" },
    { corner: "sw", cursor: "nesw-resize" },
    { corner: "w", cursor: "ew-resize" },
  ] as const;

  return (
    <BaseNodeWrapper nodeType="mixer" selected={selected} className="p-0">
      <CanvasHandle
        nodeId={id}
        nodeType="mixer"
        type="target"
        position={Position.Left}
        id="base"
        style={{ top: "35%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-sky-500"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="mixer"
        type="target"
        position={Position.Left}
        id="overlay"
        style={{ top: "58%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-pink-500"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="mixer"
        type="source"
        position={Position.Right}
        id="mixer-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />

      <div className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Mixer
        </div>

        <div
          ref={previewRef}
          data-testid="mixer-preview"
          className="relative min-h-[140px] overflow-hidden bg-muted/40 nodrag nopan"
        >
          {showReadyPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewState.baseUrl}
                alt="Mixer base"
                className={displayedBaseRect ? "absolute max-w-none" : "absolute inset-0 h-full w-full object-contain"}
                draggable={false}
                onLoad={(event) => {
                  setBaseImageSize({
                    url: event.currentTarget.currentSrc || event.currentTarget.src,
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                onError={() => setHasImageLoadError(true)}
                style={
                  displayedBaseRect
                    ? {
                        left: `${displayedBaseRect.x * 100}%`,
                        top: `${displayedBaseRect.y * 100}%`,
                        width: `${displayedBaseRect.width * 100}%`,
                        height: `${displayedBaseRect.height * 100}%`,
                      }
                    : undefined
                }
              />
              <div
                data-testid="mixer-overlay"
                data-interaction-role="frame"
                data-anchor-source="frame"
                className="absolute cursor-move overflow-hidden border border-white/70 nodrag nopan"
                onMouseDown={(event) => {
                  startInteraction(event, "frame-move");
                }}
                style={overlayFrameStyle}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewState.overlayUrl}
                  alt="Mixer overlay"
                  data-testid="mixer-overlay-content"
                  data-interaction-role="content"
                  data-anchor-source="frame"
                  ref={overlayImageRef}
                  className="absolute max-w-none nodrag nopan cursor-default"
                  draggable={false}
                  onLoad={(event) => {
                    setOverlayImageSize({
                      url: event.currentTarget.currentSrc || event.currentTarget.src,
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                    emitMixerDiagnostics("overlay-image-loaded");
                  }}
                  onError={() => setHasImageLoadError(true)}
                  style={overlayContentStyle}
                />
              </div>

              {overlayResizeHandles.map(({ corner, cursor }) => (
                <div
                  key={corner}
                  role="button"
                  tabIndex={-1}
                  data-testid={`mixer-resize-${corner}`}
                  data-interaction-role="frame-resize-handle"
                  data-anchor-source="frame"
                  data-resize-corner={corner}
                  className="absolute z-10 h-3 w-3 rounded-full border border-white/80 bg-foreground/80 nodrag nopan"
                  onMouseDown={(event) => {
                    emitMixerDiagnostics("resize-handle-mousedown", {
                      resizeCorner: corner,
                      requestedInteractionKind: "frame-resize",
                    });
                    startInteraction(event, "frame-resize", corner);
                  }}
                  style={{
                    left: `${(
                      corner.includes("w")
                        ? resizeHandleRect.left
                        : corner.includes("e")
                          ? resizeHandleRect.left + resizeHandleRect.width
                          : resizeHandleRect.left + resizeHandleRect.width / 2
                    ) * 100}%`,
                    top: `${(
                      corner.includes("n")
                        ? resizeHandleRect.top
                        : corner.includes("s")
                          ? resizeHandleRect.top + resizeHandleRect.height
                          : resizeHandleRect.top + resizeHandleRect.height / 2
                    ) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    cursor,
                  }}
                />
              ))}
            </>
          ) : null}

          {previewState.status === "empty" && !showPreviewError ? (
            <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs text-muted-foreground">
              Connect base and overlay images
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

        <div className="grid grid-cols-2 gap-2 border-t border-border p-2 text-[11px]">
          <label className="col-span-2 flex flex-col gap-1 text-muted-foreground">
            <span>Blend mode</span>
            <select
              name="blendMode"
              value={localData.blendMode}
              onChange={onBlendModeChange}
              className="nodrag nopan h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {BLEND_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Opacity</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="opacity"
              min={0}
              max={100}
              step={1}
              value={localData.opacity}
              onInput={onNumberChange("opacity")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Overlay X</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="overlayX"
              min={0}
              max={0.9}
              step={0.01}
              value={localData.overlayX}
              onInput={onNumberChange("overlayX")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Overlay Y</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="overlayY"
              min={0}
              max={0.9}
              step={0.01}
              value={localData.overlayY}
              onInput={onNumberChange("overlayY")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Overlay W</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="overlayWidth"
              min={MIN_OVERLAY_SIZE}
              max={1}
              step={0.01}
              value={localData.overlayWidth}
              onInput={onNumberChange("overlayWidth")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Overlay H</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="overlayHeight"
              min={MIN_OVERLAY_SIZE}
              max={1}
              step={0.01}
              value={localData.overlayHeight}
              onInput={onNumberChange("overlayHeight")}
            />
          </label>

          <label className="col-span-2 flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              data-testid="mixer-keep-aspect"
              checked={keepAspectRatio}
              onChange={(event) => setKeepAspectRatio(event.currentTarget.checked)}
              className="nodrag nopan h-3.5 w-3.5 rounded border-input"
            />
            <span>Keep aspect ratio while resizing</span>
          </label>
        </div>
      </div>
    </BaseNodeWrapper>
  );
}
