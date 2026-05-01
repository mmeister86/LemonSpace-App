"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas mixer node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Position, type NodeProps } from "@xyflow/react";

import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import type { Id } from "@/convex/_generated/dataModel";
import {
  normalizeMixerPreviewData,
  resolveMixerPreviewFromGraph,
} from "@/lib/canvas-mixer-preview";
import type { MixerBlendMode } from "@/lib/canvas-mixer-normalization";
import type { MixerLayerSource } from "@/lib/canvas-render-preview";
import {
  computeMixerCropImageStyle,
  computeMixerFrameRectInSurface,
} from "@/lib/mixer-crop-layout";

import BaseNodeWrapper from "./base-node-wrapper";
import { buildMixerDiagnosticsPayload } from "./mixer-diagnostics";
import { MixerControls } from "./mixer-controls";
import { MixerPreview } from "./mixer-preview";
import {
  clamp,
  computeAspectRatio,
  type LoadedImageSize,
  type MixerLocalData,
  type PreviewSurfaceSize,
  ZERO_SURFACE_SIZE,
} from "./mixer-types";
import { useMixerInteraction, normalizeLocalMixerData } from "./use-mixer-interaction";
import { useMixerPreviewSize } from "./use-mixer-preview-size";
import { useNodeLocalData } from "./use-node-local-data";

const SAVE_DELAY_MS = 160;
const MIXER_DIAGNOSTICS_ENABLED =
  process.env.NODE_ENV !== "test" && process.env.NEXT_PUBLIC_MIXER_DIAGNOSTICS === "1";

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

function imageLayerSource(url: string | undefined): MixerLayerSource | undefined {
  return url ? { kind: "image", url } : undefined;
}

function resolveLayerSize(args: {
  source: MixerLayerSource | undefined;
  loadedImageSize: LoadedImageSize;
  fallbackImageSize: PreviewSurfaceSize;
}): PreviewSurfaceSize {
  if (args.source?.kind === "text") {
    return { width: args.source.width, height: args.source.height };
  }

  if (args.source?.kind === "image" && args.source.url === args.loadedImageSize.url) {
    return { width: args.loadedImageSize.width, height: args.loadedImageSize.height };
  }

  return args.fallbackImageSize;
}

export default function MixerNode({ id, data, selected, width, height }: NodeProps) {
  const graph = useCanvasGraph();
  const { queueNodeDataUpdate } = useCanvasSync();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);
  const latestNodeDataRef = useRef((data ?? {}) as Record<string, unknown>);
  const interactionKindRef = useRef<string | null>(null);
  const [hasImageLoadError, setHasImageLoadError] = useState(false);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [baseImageSize, setBaseImageSize] = useState<LoadedImageSize>({ url: null, width: 0, height: 0 });
  const [overlayImageSize, setOverlayImageSize] = useState<LoadedImageSize>({ url: null, width: 0, height: 0 });
  const previewSurfaceSize = useMixerPreviewSize(previewRef);

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
        data: { ...latestNodeDataRef.current, ...next },
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
  const baseLayerSource =
    previewState.status === "ready"
      ? (previewState.baseSource ?? imageLayerSource(previewState.baseUrl))
      : undefined;
  const overlayLayerSource =
    previewState.status === "ready"
      ? (previewState.overlaySource ?? imageLayerSource(previewState.overlayUrl))
      : undefined;
  const overlayNaturalSize = resolveLayerSize({
    source: overlayLayerSource,
    loadedImageSize: overlayImageSize,
    fallbackImageSize: ZERO_SURFACE_SIZE,
  });
  const baseNaturalSize = resolveLayerSize({
    source: baseLayerSource,
    loadedImageSize: baseImageSize,
    fallbackImageSize: baseSourceSize,
  });
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
  const displayedOverlayFrameAspectRatio = resolveDisplayedRectAspectRatio({
    rect: displayedOverlayFrameRect,
    surfaceWidth: effectivePreviewSurfaceWidth,
    surfaceHeight: effectivePreviewSurfaceHeight,
    fallback: localData.overlayWidth > 0 && localData.overlayHeight > 0
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
  const overlayFrameStyle = {
    mixBlendMode: localData.blendMode,
    opacity: localData.opacity / 100,
    left: `${(displayedOverlayFrameRect?.x ?? localData.overlayX) * 100}%`,
    top: `${(displayedOverlayFrameRect?.y ?? localData.overlayY) * 100}%`,
    width: `${(displayedOverlayFrameRect?.width ?? localData.overlayWidth) * 100}%`,
    height: `${(displayedOverlayFrameRect?.height ?? localData.overlayHeight) * 100}%`,
  } as const;
  const overlayContentStyle = computeMixerCropImageStyle({
    frameAspectRatio: displayedOverlayFrameAspectRatio,
    sourceWidth: overlayNaturalSize.width,
    sourceHeight: overlayNaturalSize.height,
    cropLeft: localData.cropLeft,
    cropTop: localData.cropTop,
    cropRight: localData.cropRight,
    cropBottom: localData.cropBottom,
  });

  const emitMixerDiagnostics = useCallback((reason: string, extra?: Record<string, unknown>) => {
    if (!MIXER_DIAGNOSTICS_ENABLED) {
      return;
    }

    const previewRect = previewRef.current?.getBoundingClientRect();
    console.debug(
      "[mixer-diagnostics]",
      buildMixerDiagnosticsPayload({
        nodeId: id,
        reason,
        localData,
        interactionKind: interactionKindRef.current,
        previewRect: previewRect ? { width: previewRect.width, height: previewRect.height } : null,
        overlayNaturalSize: overlayImageRef.current
          ? {
              width: overlayImageRef.current.naturalWidth,
              height: overlayImageRef.current.naturalHeight,
            }
          : null,
        extra,
      }),
    );
  }, [id, localData]);

  const { interaction, startInteraction } = useMixerInteraction({
    previewRef,
    localData,
    updateLocalData,
    keepAspectRatio,
    displayedBaseRect,
    emitMixerDiagnostics,
  });

  useEffect(() => {
    interactionKindRef.current = interaction?.kind ?? null;
  }, [interaction?.kind]);

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
    emitMixerDiagnostics,
  ]);

  const onBlendModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setHasImageLoadError(false);
    updateLocalData((current) => ({ ...current, blendMode: event.target.value as MixerBlendMode }));
  };

  const onNumberChange = (
    field: "opacity" | "overlayX" | "overlayY" | "overlayWidth" | "overlayHeight",
  ) =>
    (event: FormEvent<HTMLInputElement>) => {
      setHasImageLoadError(false);
      const nextValue = Number(event.currentTarget.value);

      updateLocalData((current) => {
        if (!Number.isFinite(nextValue)) {
          return current;
        }

        if (field === "opacity") {
          return { ...current, opacity: clamp(nextValue, 0, 100) };
        }

        return normalizeLocalMixerData({ ...current, [field]: nextValue });
      });
    };

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
        <MixerPreview
          previewRef={previewRef}
          overlayImageRef={overlayImageRef}
          previewState={previewState}
          showReadyPreview={showReadyPreview}
          showPreviewError={showPreviewError}
          baseLayerSource={baseLayerSource}
          overlayLayerSource={overlayLayerSource}
          displayedBaseRect={displayedBaseRect}
          overlayFrameStyle={overlayFrameStyle}
          overlayContentStyle={overlayContentStyle}
          resizeHandleRect={resizeHandleRect}
          onBaseImageLoad={setBaseImageSize}
          onOverlayImageLoad={(size) => {
            setOverlayImageSize(size);
            emitMixerDiagnostics("overlay-image-loaded");
          }}
          onImageError={() => setHasImageLoadError(true)}
          onFrameMouseDown={(event) => startInteraction(event, "frame-move")}
          onResizeHandleMouseDown={(event, handle) => {
            emitMixerDiagnostics("resize-handle-mousedown", {
              resizeCorner: handle,
              requestedInteractionKind: "frame-resize",
            });
            startInteraction(event, "frame-resize", handle);
          }}
        />
        <MixerControls
          localData={localData}
          keepAspectRatio={keepAspectRatio}
          onBlendModeChange={onBlendModeChange}
          onNumberChange={onNumberChange}
          onKeepAspectRatioChange={setKeepAspectRatio}
        />
      </div>
    </BaseNodeWrapper>
  );
}
