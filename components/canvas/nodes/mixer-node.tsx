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
import { computeMixerFrameRectInSurface } from "@/lib/mixer-crop-layout";

const BLEND_MODE_OPTIONS: MixerBlendMode[] = ["normal", "multiply", "screen", "overlay"];
const MIN_OVERLAY_SIZE = 0.1;
const MIN_CROP_REMAINING_SIZE = 0.1;
const MAX_OVERLAY_POSITION = 1;
const SAVE_DELAY_MS = 160;
const MIXER_DIAGNOSTICS_ENABLED =
  process.env.NODE_ENV !== "test" && process.env.NEXT_PUBLIC_MIXER_DIAGNOSTICS === "1";

type MixerLocalData = ReturnType<typeof normalizeMixerPreviewData>;
type ResizeCorner = "nw" | "ne" | "sw" | "se";
type CropHandle = ResizeCorner | "n" | "e" | "s" | "w";

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
      corner: ResizeCorner;
      startClientX: number;
      startClientY: number;
      startData: MixerLocalData;
      previewWidth: number;
      previewHeight: number;
    }
  | {
      kind: "content-resize";
      corner: CropHandle;
      startClientX: number;
      startClientY: number;
      startData: MixerLocalData;
      previewWidth: number;
      previewHeight: number;
    }
  | {
      kind: "content-move";
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

function resolveDisplayedRectAspectRatio(args: {
  rect: { width: number; height: number } | null;
  surfaceWidth: number;
  surfaceHeight: number;
  fallback: number;
}): number {
  if (args.rect && args.rect.width > 0 && args.rect.height > 0) {
    const ratio = computeAspectRatio(
      args.rect.width * args.surfaceWidth,
      args.rect.height * args.surfaceHeight,
    );
    if (ratio) {
      return ratio;
    }
  }

  return args.fallback;
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

function computeContainRect(args: {
  sourceWidth: number;
  sourceHeight: number;
  boundsX: number;
  boundsY: number;
  boundsWidth: number;
  boundsHeight: number;
}): { x: number; y: number; width: number; height: number } {
  const { sourceWidth, sourceHeight, boundsX, boundsY, boundsWidth, boundsHeight } = args;

  if (sourceWidth <= 0 || sourceHeight <= 0 || boundsWidth <= 0 || boundsHeight <= 0) {
    return {
      x: boundsX,
      y: boundsY,
      width: boundsWidth,
      height: boundsHeight,
    };
  }

  const scale = Math.min(boundsWidth / sourceWidth, boundsHeight / sourceHeight);
  if (!Number.isFinite(scale) || scale <= 0) {
    return {
      x: boundsX,
      y: boundsY,
      width: boundsWidth,
      height: boundsHeight,
    };
  }

  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: boundsX + (boundsWidth - width) / 2,
    y: boundsY + (boundsHeight - height) / 2,
    width,
    height,
  };
}

function computeCropImageStyle(args: {
  frameAspectRatio: number;
  sourceWidth: number;
  sourceHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}) {
  const safeWidth = Math.max(1 - args.cropLeft - args.cropRight, MIN_CROP_REMAINING_SIZE);
  const safeHeight = Math.max(1 - args.cropTop - args.cropBottom, MIN_CROP_REMAINING_SIZE);
  const visibleRect = computeVisibleContentRect({
    frameAspectRatio: args.frameAspectRatio,
    sourceWidth: args.sourceWidth,
    sourceHeight: args.sourceHeight,
    cropLeft: args.cropLeft,
    cropTop: args.cropTop,
    cropRight: args.cropRight,
    cropBottom: args.cropBottom,
  });

  if (!visibleRect) {
    return {
      left: `${(-args.cropLeft / safeWidth) * 100}%`,
      top: `${(-args.cropTop / safeHeight) * 100}%`,
      width: `${(1 / safeWidth) * 100}%`,
      height: `${(1 / safeHeight) * 100}%`,
    } as const;
  }

  const imageWidth = visibleRect.width / safeWidth;
  const imageHeight = visibleRect.height / safeHeight;

  return {
    left: `${(visibleRect.x - (args.cropLeft / safeWidth) * visibleRect.width) * 100}%`,
    top: `${(visibleRect.y - (args.cropTop / safeHeight) * visibleRect.height) * 100}%`,
    width: `${imageWidth * 100}%`,
    height: `${imageHeight * 100}%`,
  } as const;
}

function computeVisibleContentRect(args: {
  frameAspectRatio: number;
  sourceWidth: number;
  sourceHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}) {
  if (args.sourceWidth <= 0 || args.sourceHeight <= 0) {
    return null;
  }

  const cropWidth = Math.max(1 - args.cropLeft - args.cropRight, MIN_CROP_REMAINING_SIZE);
  const cropHeight = Math.max(1 - args.cropTop - args.cropBottom, MIN_CROP_REMAINING_SIZE);
  const frameAspectRatio = args.frameAspectRatio > 0 ? args.frameAspectRatio : 1;

  const rect = computeContainRect({
    sourceWidth: args.sourceWidth * cropWidth,
    sourceHeight: args.sourceHeight * cropHeight,
    boundsX: 0,
    boundsY: 0,
    boundsWidth: frameAspectRatio,
    boundsHeight: 1,
  });

  return {
    x: rect.x / frameAspectRatio,
    y: rect.y,
    width: rect.width / frameAspectRatio,
    height: rect.height,
  };
}

function cropRectFromData(data: Pick<
  MixerLocalData,
  "cropLeft" | "cropTop" | "cropRight" | "cropBottom"
>) {
  return {
    x: data.cropLeft,
    y: data.cropTop,
    width: 1 - data.cropLeft - data.cropRight,
    height: 1 - data.cropTop - data.cropBottom,
  };
}

function cropEdgesFromRect(rect: { x: number; y: number; width: number; height: number }) {
  return {
    cropLeft: rect.x,
    cropTop: rect.y,
    cropRight: 1 - (rect.x + rect.width),
    cropBottom: 1 - (rect.y + rect.height),
  };
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

function computeLockedAspectRect(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  minSize: number;
  corner: ResizeCorner;
  deltaX: number;
  deltaY: number;
  aspectRatio?: number;
}) {
  const { x, y, width, height, minSize, corner, deltaX, deltaY, aspectRatio } = args;
  const lockedAspectRatio = aspectRatio && aspectRatio > 0 ? aspectRatio : width / height;
  const lockedHeight = width / lockedAspectRatio;
  const anchorX = corner.includes("w") ? x + width : x;
  const anchorY = corner.includes("n") ? y + height : y;
  const requestedScaleX = (width + (corner.includes("w") ? -deltaX : deltaX)) / width;
  const requestedScaleY =
    (lockedHeight + (corner.includes("n") ? -deltaY : deltaY)) / lockedHeight;
  const dominantScale =
    Math.abs(requestedScaleX - 1) >= Math.abs(requestedScaleY - 1)
      ? requestedScaleX
      : requestedScaleY;
  const minScale = Math.max(minSize / width, minSize / lockedHeight);
  const maxWidth = corner.includes("w") ? anchorX : MAX_OVERLAY_POSITION - x;
  const maxHeight = corner.includes("n") ? anchorY : MAX_OVERLAY_POSITION - y;
  const maxScale = Math.min(maxWidth / width, maxHeight / lockedHeight);
  const scale = clamp(dominantScale, minScale, maxScale);
  const nextWidth = width * scale;
  const nextHeight = nextWidth / lockedAspectRatio;

  return {
    x: corner.includes("w") ? anchorX - nextWidth : x,
    y: corner.includes("n") ? anchorY - nextHeight : y,
    width: nextWidth,
    height: nextHeight,
  };
}

function computeResizeRect(args: {
  startData: MixerLocalData;
  corner: ResizeCorner;
  deltaX: number;
  deltaY: number;
  aspectRatio?: number;
}): Pick<MixerLocalData, "overlayX" | "overlayY" | "overlayWidth" | "overlayHeight"> {
  const { startData, corner, deltaX, deltaY, aspectRatio } = args;
  const nextRect = computeLockedAspectRect({
    x: startData.overlayX,
    y: startData.overlayY,
    width: startData.overlayWidth,
    height: startData.overlayHeight,
    minSize: MIN_OVERLAY_SIZE,
    corner,
    deltaX,
    deltaY,
    aspectRatio,
  });

  return normalizeLocalMixerData({
    ...startData,
    overlayX: nextRect.x,
    overlayY: nextRect.y,
    overlayWidth: nextRect.width,
    overlayHeight: nextRect.height,
  });
}

function computeContentResizeRect(args: {
  startData: MixerLocalData;
  corner: CropHandle;
  deltaX: number;
  deltaY: number;
}): Pick<MixerLocalData, "cropLeft" | "cropTop" | "cropRight" | "cropBottom"> {
  const { startData, corner, deltaX, deltaY } = args;
  const startRect = cropRectFromData(startData);
  const startRight = startRect.x + startRect.width;
  const startBottom = startRect.y + startRect.height;

  let nextX = startRect.x;
  let nextY = startRect.y;
  let nextWidth = startRect.width;
  let nextHeight = startRect.height;

  if (corner.includes("w")) {
    nextX = clamp(startRect.x + deltaX, 0, startRight - MIN_CROP_REMAINING_SIZE);
    nextWidth = startRight - nextX;
  }

  if (corner.includes("e")) {
    nextWidth = clamp(startRect.width + deltaX, MIN_CROP_REMAINING_SIZE, 1 - startRect.x);
  }

  if (corner.includes("n")) {
    nextY = clamp(startRect.y + deltaY, 0, startBottom - MIN_CROP_REMAINING_SIZE);
    nextHeight = startBottom - nextY;
  }

  if (corner.includes("s")) {
    nextHeight = clamp(startRect.height + deltaY, MIN_CROP_REMAINING_SIZE, 1 - startRect.y);
  }

  return normalizeLocalMixerData({
    ...startData,
    ...cropEdgesFromRect({
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    }),
  });
}

export default function MixerNode({ id, data, selected, width, height }: NodeProps) {
  const graph = useCanvasGraph();
  const { queueNodeDataUpdate } = useCanvasSync();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);
  const latestNodeDataRef = useRef((data ?? {}) as Record<string, unknown>);
  const [hasImageLoadError, setHasImageLoadError] = useState(false);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [isContentFramingMode, setIsContentFramingMode] = useState(false);
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

    const cropRect = cropRectFromData(localData);
    const contentBoundsRect = frameRect
      ? {
          x: frameRect.x + cropRect.x * frameRect.width,
          y: frameRect.y + cropRect.y * frameRect.height,
          width: cropRect.width * frameRect.width,
          height: cropRect.height * frameRect.height,
        }
      : null;

    const visibleContentRect =
      contentBoundsRect && overlayImage
        ? computeContainRect({
            sourceWidth: overlayImage.naturalWidth,
            sourceHeight: overlayImage.naturalHeight,
            boundsX: contentBoundsRect.x,
            boundsY: contentBoundsRect.y,
            boundsWidth: contentBoundsRect.width,
            boundsHeight: contentBoundsRect.height,
          })
        : null;

    const frameAspectRatio = frameRect
      ? computeAspectRatio(frameRect.width, frameRect.height)
      : null;
    const contentBoundsAspectRatio = contentBoundsRect
      ? computeAspectRatio(contentBoundsRect.width, contentBoundsRect.height)
      : null;
    const visibleContentAspectRatio = visibleContentRect
      ? computeAspectRatio(visibleContentRect.width, visibleContentRect.height)
      : null;

    const currentHandleRect =
      isContentFramingMode && visibleContentRect
        ? {
            x: visibleContentRect.x,
            y: visibleContentRect.y,
            width: visibleContentRect.width,
            height: visibleContentRect.height,
          }
        : frameRect;

    const handleOffsetFromVisibleContent =
      currentHandleRect && visibleContentRect
        ? {
            x: roundDiagnosticNumber(currentHandleRect.x - visibleContentRect.x),
            y: roundDiagnosticNumber(currentHandleRect.y - visibleContentRect.y),
            width: roundDiagnosticNumber(currentHandleRect.width - visibleContentRect.width),
            height: roundDiagnosticNumber(currentHandleRect.height - visibleContentRect.height),
          }
        : null;

    console.debug("[mixer-diagnostics]", {
      nodeId: id,
      reason,
      mode: isContentFramingMode ? "content-framing" : "frame-resize",
      intent: isContentFramingMode
        ? "crop should change visible area without changing displayed image size"
        : "resize should change displayed image size without changing aspect ratio",
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
    isContentFramingMode,
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
      | "overlayHeight"
      | "cropLeft"
      | "cropTop"
      | "cropRight"
      | "cropBottom",
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
    corner?: CropHandle,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const previewRect = previewRef.current?.getBoundingClientRect();
    if (!previewRect || previewRect.width <= 0 || previewRect.height <= 0) {
      return;
    }

    if (
      (kind === "content-move" || kind === "content-resize") &&
      (overlayNaturalSize.width <= 0 || overlayNaturalSize.height <= 0)
    ) {
      return;
    }

    emitMixerDiagnostics("interaction-start", {
      requestedInteractionKind: kind,
      resizeCorner: corner ?? null,
      target: event.target instanceof HTMLElement ? event.target.dataset : null,
      currentTarget: event.currentTarget.dataset,
      currentTargetClassName:
        event.currentTarget instanceof HTMLElement ? event.currentTarget.className : null,
      pointer: {
        clientX: event.clientX,
        clientY: event.clientY,
      },
    });

    const activeGeometryRect =
      kind === "content-move" || kind === "content-resize"
        ? displayedOverlayFrameRect ?? {
            x: localData.overlayX,
            y: localData.overlayY,
            width: localData.overlayWidth,
            height: localData.overlayHeight,
          }
        : displayedBaseRect;
    const activeGeometryWidth =
      (activeGeometryRect?.width ?? 1) * previewRect.width || previewRect.width;
    const activeGeometryHeight =
      (activeGeometryRect?.height ?? 1) * previewRect.height || previewRect.height;

    setInteraction({
      kind,
      corner:
        kind === "frame-resize" || kind === "content-resize"
          ? (corner as ResizeCorner)
          : undefined,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startData: localData,
      previewWidth: activeGeometryWidth,
      previewHeight: activeGeometryHeight,
    } as InteractionState);
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
        const beforeCropRect = cropRectFromData(interaction.startData);
        const afterCropRect = cropRectFromData(nextData);
        emitMixerDiagnostics("interaction-move", {
          requestedInteractionKind: interaction.kind,
          resizeCorner: interaction.kind === "frame-resize" || interaction.kind === "content-resize"
            ? interaction.corner
            : null,
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
            content: roundDiagnosticNumber(
              computeAspectRatio(
                beforeCropRect.width,
                beforeCropRect.height,
              ),
            ),
          },
          afterAspectRatio: {
            overlay: roundDiagnosticNumber(computeAspectRatio(nextData.overlayWidth, nextData.overlayHeight)),
            content: roundDiagnosticNumber(computeAspectRatio(afterCropRect.width, afterCropRect.height)),
          },
          semanticChecks: {
            resizeChangedOverlayAspectRatio:
              interaction.kind === "frame-resize"
                ? interaction.startData.overlayWidth / interaction.startData.overlayHeight !==
                  nextData.overlayWidth / nextData.overlayHeight
                : null,
            cropChangedOverlaySize:
              interaction.kind === "content-move" || interaction.kind === "content-resize"
                ? interaction.startData.overlayWidth !== nextData.overlayWidth ||
                  interaction.startData.overlayHeight !== nextData.overlayHeight
                : null,
            cropChangedContentSize:
              interaction.kind === "content-resize"
                ? beforeCropRect.width !== afterCropRect.width ||
                  beforeCropRect.height !== afterCropRect.height
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

      if (interaction.kind === "content-move") {
        const startCropRect = cropRectFromData(interaction.startData);
        const visibleRect = computeVisibleContentRect({
          frameAspectRatio:
            interaction.previewWidth > 0 && interaction.previewHeight > 0
              ? interaction.previewWidth / interaction.previewHeight
              : 1,
          sourceWidth: overlayNaturalSize.width,
          sourceHeight: overlayNaturalSize.height,
          cropLeft: interaction.startData.cropLeft,
          cropTop: interaction.startData.cropTop,
          cropRight: interaction.startData.cropRight,
          cropBottom: interaction.startData.cropBottom,
        });
        const contentDeltaX =
          (pointerDeltaX /
            (interaction.previewWidth * (visibleRect?.width ?? 1))) *
          startCropRect.width;
        const contentDeltaY =
          (pointerDeltaY /
            (interaction.previewHeight * (visibleRect?.height ?? 1))) *
          startCropRect.height;

        const nextX = clamp(
          startCropRect.x + contentDeltaX,
          0,
          MAX_OVERLAY_POSITION - startCropRect.width,
        );
        const nextY = clamp(
          startCropRect.y + contentDeltaY,
          0,
          MAX_OVERLAY_POSITION - startCropRect.height,
        );

        const nextData = {
          ...interaction.startData,
          ...cropEdgesFromRect({
            x: nextX,
            y: nextY,
            width: startCropRect.width,
            height: startCropRect.height,
          }),
        };

        emitInteractionMoveDiagnostics(nextData, {
          deltaInFrameSpace: {
            x: roundDiagnosticNumber(contentDeltaX),
            y: roundDiagnosticNumber(contentDeltaY),
          },
        });

        updateLocalData((current) => ({
          ...current,
          ...cropEdgesFromRect({
            x: nextX,
            y: nextY,
            width: startCropRect.width,
            height: startCropRect.height,
          }),
        }));
        return;
      }

      if (interaction.kind === "content-resize") {
        const startCropRect = cropRectFromData(interaction.startData);
        const visibleRect = computeVisibleContentRect({
          frameAspectRatio:
            interaction.previewWidth > 0 && interaction.previewHeight > 0
              ? interaction.previewWidth / interaction.previewHeight
              : 1,
          sourceWidth: overlayNaturalSize.width,
          sourceHeight: overlayNaturalSize.height,
          cropLeft: interaction.startData.cropLeft,
          cropTop: interaction.startData.cropTop,
          cropRight: interaction.startData.cropRight,
          cropBottom: interaction.startData.cropBottom,
        });
        const contentDeltaX =
          (pointerDeltaX /
            (interaction.previewWidth * (visibleRect?.width ?? 1))) *
          startCropRect.width;
        const contentDeltaY =
          (pointerDeltaY /
            (interaction.previewHeight * (visibleRect?.height ?? 1))) *
          startCropRect.height;

        const nextRect = computeContentResizeRect({
          startData: interaction.startData,
          corner: interaction.corner,
          deltaX: contentDeltaX,
          deltaY: contentDeltaY,
        });

        const nextData = {
          ...interaction.startData,
          ...nextRect,
        };

        emitInteractionMoveDiagnostics(nextData, {
          deltaInFrameSpace: {
            x: roundDiagnosticNumber(contentDeltaX),
            y: roundDiagnosticNumber(contentDeltaY),
          },
        });

        updateLocalData((current) => ({
          ...current,
          ...nextRect,
        }));
        return;
      }

      const nextRect = computeResizeRect({
        startData: interaction.startData,
        corner: interaction.corner,
        deltaX,
        deltaY,
        aspectRatio:
          interaction.startData.overlayWidth > 0 && interaction.startData.overlayHeight > 0
            ? interaction.startData.overlayWidth / interaction.startData.overlayHeight
            : undefined,
      });

      emitInteractionMoveDiagnostics(
        {
          ...interaction.startData,
          ...nextRect,
        },
        {
          deltaInFrameSpace: {
            x: roundDiagnosticNumber(deltaX),
            y: roundDiagnosticNumber(deltaY),
          },
        },
      );

      updateLocalData((current) => ({
        ...current,
        ...nextRect,
      }));
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
  }, [interaction, updateLocalData]);

  const showReadyPreview = previewState.status === "ready" && !hasImageLoadError;
  const showPreviewError = hasImageLoadError || previewState.status === "error";
  const hasOverlayNaturalSize = overlayNaturalSize.width > 0 && overlayNaturalSize.height > 0;
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
    fit: "cover",
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
    fit: "cover",
  });
  const displayedOverlayFrameAspectRatio = resolveDisplayedRectAspectRatio({
    rect: displayedOverlayFrameRect,
    surfaceWidth: effectivePreviewSurfaceWidth,
    surfaceHeight: effectivePreviewSurfaceHeight,
    fallback:
      localData.overlayWidth > 0 && localData.overlayHeight > 0
        ? localData.overlayWidth / localData.overlayHeight
        : 1,
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
  const visibleContentRect =
    computeVisibleContentRect({
      frameAspectRatio: displayedOverlayFrameAspectRatio,
      sourceWidth: overlayNaturalSize.width,
      sourceHeight: overlayNaturalSize.height,
      cropLeft: localData.cropLeft,
      cropTop: localData.cropTop,
      cropRight: localData.cropRight,
      cropBottom: localData.cropBottom,
    }) ?? { x: 0, y: 0, width: 1, height: 1 };
  const cropHandleRect = {
    left: resizeHandleRect.left + resizeHandleRect.width * visibleContentRect.x,
    top: resizeHandleRect.top + resizeHandleRect.height * visibleContentRect.y,
    width: resizeHandleRect.width * visibleContentRect.width,
    height: resizeHandleRect.height * visibleContentRect.height,
  };

  const overlayFrameStyle = {
    mixBlendMode: localData.blendMode,
    opacity: localData.opacity / 100,
    left: `${(displayedOverlayFrameRect?.x ?? localData.overlayX) * 100}%`,
    top: `${(displayedOverlayFrameRect?.y ?? localData.overlayY) * 100}%`,
    width: `${(displayedOverlayFrameRect?.width ?? localData.overlayWidth) * 100}%`,
    height: `${(displayedOverlayFrameRect?.height ?? localData.overlayHeight) * 100}%`,
  } as const;

  const overlayContentStyle = computeCropImageStyle({
    frameAspectRatio: displayedOverlayFrameAspectRatio,
    sourceWidth: overlayNaturalSize.width,
    sourceHeight: overlayNaturalSize.height,
    cropLeft: localData.cropLeft,
    cropTop: localData.cropTop,
    cropRight: localData.cropRight,
    cropBottom: localData.cropBottom,
  });
  const cropBoxStyle = {
    left: `${visibleContentRect.x * 100}%`,
    top: `${visibleContentRect.y * 100}%`,
    width: `${visibleContentRect.width * 100}%`,
    height: `${visibleContentRect.height * 100}%`,
  } as const;

  const frameResizeHandles = [
    { corner: "nw", cursor: "nwse-resize" },
    { corner: "ne", cursor: "nesw-resize" },
    { corner: "sw", cursor: "nesw-resize" },
    { corner: "se", cursor: "nwse-resize" },
  ] as const;
  const cropHandles = [
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
                className={displayedBaseRect ? "absolute max-w-none" : "absolute inset-0 h-full w-full object-cover"}
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
                className={`absolute overflow-hidden border border-white/70 nodrag nopan ${
                  isContentFramingMode ? "cursor-default" : "cursor-move"
                }`}
                onMouseDown={(event) => {
                  if (isContentFramingMode) {
                    return;
                  }
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

                {isContentFramingMode && hasOverlayNaturalSize ? (
                  <div
                    data-testid="mixer-crop-box"
                    data-interaction-role="crop-box"
                    className="absolute border border-white/80 bg-transparent nodrag nopan cursor-move"
                    onMouseDown={(event) => startInteraction(event, "content-move")}
                    style={cropBoxStyle}
                  />
                ) : null}
              </div>

              {((isContentFramingMode && hasOverlayNaturalSize) ? cropHandles : frameResizeHandles).map(({ corner, cursor }) => (
                <div
                  key={corner}
                  role="button"
                  tabIndex={-1}
                  data-testid={`mixer-resize-${corner}`}
                  data-interaction-role={(isContentFramingMode && hasOverlayNaturalSize) ? "content-resize-handle" : "frame-resize-handle"}
                  data-anchor-source={(isContentFramingMode && hasOverlayNaturalSize) ? "crop-box" : "frame"}
                  data-resize-corner={corner}
                  className="absolute z-10 h-3 w-3 rounded-full border border-white/80 bg-foreground/80 nodrag nopan"
                  onMouseDown={(event) => {
                      emitMixerDiagnostics("resize-handle-mousedown", {
                        resizeCorner: corner,
                        requestedInteractionKind:
                          (isContentFramingMode && hasOverlayNaturalSize) ? "content-resize" : "frame-resize",
                      });
                    startInteraction(
                      event,
                      (isContentFramingMode && hasOverlayNaturalSize) ? "content-resize" : "frame-resize",
                      corner,
                    );
                  }}
                  style={{
                    left: `${(
                      corner.includes("w")
                        ? ((isContentFramingMode && hasOverlayNaturalSize) ? cropHandleRect.left : resizeHandleRect.left)
                        : corner.includes("e")
                          ? ((isContentFramingMode && hasOverlayNaturalSize)
                              ? cropHandleRect.left + cropHandleRect.width
                              : resizeHandleRect.left + resizeHandleRect.width)
                          : ((isContentFramingMode && hasOverlayNaturalSize)
                              ? cropHandleRect.left + cropHandleRect.width / 2
                              : resizeHandleRect.left + resizeHandleRect.width / 2)
                    ) * 100}%`,
                    top: `${(
                      corner.includes("n")
                        ? ((isContentFramingMode && hasOverlayNaturalSize) ? cropHandleRect.top : resizeHandleRect.top)
                        : corner.includes("s")
                          ? ((isContentFramingMode && hasOverlayNaturalSize)
                              ? cropHandleRect.top + cropHandleRect.height
                              : resizeHandleRect.top + resizeHandleRect.height)
                          : ((isContentFramingMode && hasOverlayNaturalSize)
                              ? cropHandleRect.top + cropHandleRect.height / 2
                              : resizeHandleRect.top + resizeHandleRect.height / 2)
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
          <label className="col-span-2 flex items-center justify-between gap-2 text-muted-foreground">
            <span>Interaction mode</span>
            <button
              type="button"
              data-testid="mixer-content-mode-toggle"
              className="nodrag nopan rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground"
              onClick={() => setIsContentFramingMode((current) => !current)}
              onMouseDown={(event) => {
                emitMixerDiagnostics("mode-toggle-mousedown", {
                  target: event.target instanceof HTMLElement ? event.target.dataset : null,
                  currentTarget: event.currentTarget.dataset,
                });
              }}
            >
              {isContentFramingMode ? "Content framing" : "Frame resize"}
            </button>
          </label>

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

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Crop Left</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="cropLeft"
              min={0}
              max={1}
              step={0.01}
              value={localData.cropLeft}
              onInput={onNumberChange("cropLeft")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Crop Top</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="cropTop"
              min={0}
              max={1}
              step={0.01}
              value={localData.cropTop}
              onInput={onNumberChange("cropTop")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Crop Right</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="cropRight"
              min={0}
              max={1}
              step={0.01}
              value={localData.cropRight}
              onInput={onNumberChange("cropRight")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Crop Bottom</span>
            <input
              className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="cropBottom"
              min={0}
              max={1}
              step={0.01}
              value={localData.cropBottom}
              onInput={onNumberChange("cropBottom")}
            />
          </label>
        </div>
      </div>
    </BaseNodeWrapper>
  );
}
