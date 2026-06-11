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
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Unlock } from "lucide-react";

import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { RepeatingInputHandles } from "@/components/canvas/repeating-input-handles";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useZoomAwarePreviewQuality } from "@/components/canvas/use-zoom-aware-preview-quality";
import type { Id } from "@/convex/_generated/dataModel";
import {
  normalizeMixerPreviewData,
  resolveMixerPreviewFromGraph,
  type MixerPreviewLayer,
} from "@/lib/canvas-mixer-preview";
import {
  MAX_MIXER_LAYER_POSITION,
  MAX_MIXER_LAYER_SIZE,
  MIN_MIXER_LAYER_POSITION,
  MIN_MIXER_LAYER_SIZE,
  normalizeMixerLayerCompositionData,
  type MixerBlendMode,
  type NormalizedMixerLayerCompositionData,
  type NormalizedMixerLayerData,
} from "@/lib/canvas-mixer-normalization";
import {
  computeMixerNodeSizeFromStage,
  mixerStageSizesEqual,
  resolveMixerBaseStageFromGraph,
} from "@/lib/canvas-mixer-stage";
import type { MixerLayerSource } from "@/lib/canvas-render-preview";
import { resolveVisibleRepeatingInputHandles } from "@/lib/canvas-repeating-input-handles";
import {
  computeMixerCropImageStyle,
  computeMixerFrameRectInSurface,
} from "@/lib/mixer-crop-layout";

import BaseNodeWrapper from "./base-node-wrapper";
import { buildMixerDiagnosticsPayload } from "./mixer-diagnostics";
import { MixerControls } from "./mixer-controls";
import { MixerFabricEditor } from "./mixer-fabric-editor";
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

function isLayerMixerData(data: unknown): boolean {
  const record = (data ?? {}) as Record<string, unknown>;
  return record.mixerVersion === 2 || Array.isArray(record.layers);
}

function isRawLayerHandle(handle: unknown): boolean {
  return typeof handle === "string" && (handle === "layer-in" || handle.startsWith("layer-in-"));
}

function stripLayerSource(layer: MixerPreviewLayer | NormalizedMixerLayerData): NormalizedMixerLayerData {
  const persisted = { ...layer } as NormalizedMixerLayerData & Partial<Pick<MixerPreviewLayer, "source">>;
  delete persisted.source;
  return persisted;
}

function mergePreviewLayersWithLocalLayerData(args: {
  previewLayers: readonly MixerPreviewLayer[];
  localLayers: readonly NormalizedMixerLayerData[];
}): MixerPreviewLayer[] {
  if (args.localLayers.length === 0) {
    return [...args.previewLayers];
  }

  const previewById = new Map(args.previewLayers.map((layer) => [layer.id, layer]));
  const previewByHandle = new Map(args.previewLayers.map((layer) => [layer.handleId, layer]));
  const usedHandles = new Set<string>();
  const layers: MixerPreviewLayer[] = [];

  for (const localLayer of args.localLayers) {
    const previewLayer =
      previewByHandle.get(localLayer.handleId) ?? previewById.get(localLayer.id);
    if (!previewLayer) {
      continue;
    }

    usedHandles.add(previewLayer.handleId);
    layers.push({
      ...previewLayer,
      ...localLayer,
      source: previewLayer.source,
    });
  }

  for (const previewLayer of args.previewLayers) {
    if (!usedHandles.has(previewLayer.handleId)) {
      layers.push(previewLayer);
    }
  }

  return layers;
}

function mergeEditableLayersWithPreviewHandles(args: {
  currentLayers: readonly NormalizedMixerLayerData[];
  previewLayers: readonly MixerPreviewLayer[];
}): NormalizedMixerLayerData[] {
  const layers = args.currentLayers.map((layer) => ({ ...layer }));
  const seenHandles = new Set(layers.map((layer) => layer.handleId));

  for (const previewLayer of args.previewLayers) {
    if (seenHandles.has(previewLayer.handleId)) {
      continue;
    }

    seenHandles.add(previewLayer.handleId);
    layers.push(stripLayerSource(previewLayer));
  }

  return layers;
}

function resolveLayerHandleForUpdate(args: {
  layerId: string;
  layers: readonly NormalizedMixerLayerData[];
  previewLayers: readonly MixerPreviewLayer[];
}): string | null {
  return (
    args.layers.find((layer) => layer.id === args.layerId)?.handleId ??
    args.previewLayers.find((layer) => layer.id === args.layerId)?.handleId ??
    null
  );
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

export function MixerNodeBody({
  id,
  data,
  width,
  height,
}: {
  id: string;
  data: unknown;
  width?: number | null;
  height?: number | null;
}) {
  const graph = useCanvasGraph();
  const { queueNodeDataUpdate, queueNodeResize } = useCanvasSync();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);
  const latestNodeDataRef = useRef((data ?? {}) as Record<string, unknown>);
  const interactionKindRef = useRef<string | null>(null);
  const lastQueuedStageDataRef = useRef<string | null>(null);
  const lastQueuedStageResizeRef = useRef<string | null>(null);
  const [hasImageLoadError, setHasImageLoadError] = useState(false);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [baseImageSize, setBaseImageSize] = useState<LoadedImageSize>({ url: null, width: 0, height: 0 });
  const [overlayImageSize, setOverlayImageSize] = useState<LoadedImageSize>({ url: null, width: 0, height: 0 });
  const previewSurfaceSize = useMixerPreviewSize(previewRef);
  const { previewQuality, sourceQuality } = useZoomAwarePreviewQuality({
    width: previewSurfaceSize.width || width,
    height: previewSurfaceSize.height || height,
  });
  const displaySourceQuality = previewQuality === "low" ? sourceQuality : "full";

  useEffect(() => {
    latestNodeDataRef.current = (data ?? {}) as Record<string, unknown>;
  }, [data]);

  const incomingEdges = useMemo(
    () => graph.incomingEdgesByTarget.get(id) ?? [],
    [graph.incomingEdgesByTarget, id],
  );
  const isLayerMode =
    isLayerMixerData(data) ||
    incomingEdges.some((edge) => isRawLayerHandle(edge.targetHandle));
  const derivedStage = useMemo(
    () =>
      isLayerMode
        ? resolveMixerBaseStageFromGraph({
            incomingEdges,
            graph,
          })
      : null,
    [graph, incomingEdges, isLayerMode],
  );

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
    previewOverrideEnabled: !isLayerMode,
  });

  const { localData: layerData, updateLocalData: updateLayerData } =
    useNodeLocalData<NormalizedMixerLayerCompositionData>({
      nodeId: id,
      data,
      normalize: normalizeMixerLayerCompositionData,
      saveDelayMs: SAVE_DELAY_MS,
      onSave: (next) =>
        queueNodeDataUpdate({
          nodeId: id as Id<"nodes">,
          data: { ...latestNodeDataRef.current, ...next },
        }),
      debugLabel: "mixer-layers",
    });

  const previewState = useMemo(
    () => resolveMixerPreviewFromGraph({ nodeId: id, graph, sourceQuality: displaySourceQuality }),
    [displaySourceQuality, graph, id],
  );
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const previewLayers = useMemo(() => previewState.layers ?? [], [previewState.layers]);
  const displayLayers = useMemo(
    () =>
      mergePreviewLayersWithLocalLayerData({
        previewLayers,
        localLayers: layerData.layers,
      }),
    [layerData.layers, previewLayers],
  );
  const selectedLayerId =
    activeLayerId && displayLayers.some((layer) => layer.id === activeLayerId)
      ? activeLayerId
      : (displayLayers.at(-1)?.id ?? null);

  const updateLayerById = useCallback(
    (layerId: string, updater: (layer: NormalizedMixerLayerData) => NormalizedMixerLayerData) => {
      updateLayerData((current) => {
        const baseLayers = mergeEditableLayersWithPreviewHandles({
          currentLayers: current.layers,
          previewLayers,
        });
        const targetHandle = resolveLayerHandleForUpdate({
          layerId,
          layers: baseLayers,
          previewLayers,
        });
        return {
          ...current,
          mixerVersion: 2,
          stage: current.stage ?? previewState.stage ?? null,
          layers: baseLayers.map((layer) =>
            layer.id === layerId || (targetHandle !== null && layer.handleId === targetHandle)
              ? updater(layer)
              : layer,
          ),
        };
      });
    },
    [previewLayers, previewState.stage, updateLayerData],
  );

  const moveLayer = useCallback(
    (layerId: string, direction: -1 | 1) => {
      updateLayerData((current) => {
        const layers = mergeEditableLayersWithPreviewHandles({
          currentLayers: current.layers,
          previewLayers,
        });
        const index = layers.findIndex((layer) => layer.id === layerId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) {
          return current;
        }
        const [layer] = layers.splice(index, 1);
        if (!layer) return current;
        layers.splice(nextIndex, 0, layer);
        return {
          ...current,
          mixerVersion: 2,
          stage: current.stage ?? previewState.stage ?? null,
          layers,
        };
      });
    },
    [previewLayers, previewState.stage, updateLayerData],
  );

  const onLayerNumberChange =
    (layerId: string, field: "opacity" | "x" | "y" | "width" | "height" | "rotation") =>
    (event: FormEvent<HTMLInputElement>) => {
      const nextValue = Number(event.currentTarget.value);
      if (!Number.isFinite(nextValue)) {
        return;
      }

      updateLayerById(layerId, (layer) => ({
        ...layer,
        [field]: field === "opacity"
          ? clamp(nextValue, 0, 100)
          : field === "x" || field === "y"
            ? clamp(nextValue, MIN_MIXER_LAYER_POSITION, MAX_MIXER_LAYER_POSITION)
            : field === "width" || field === "height"
              ? clamp(nextValue, MIN_MIXER_LAYER_SIZE, MAX_MIXER_LAYER_SIZE)
              : nextValue,
      }));
    };

  const onLayerCropChange =
    (layerId: string, field: keyof NormalizedMixerLayerData["crop"]) =>
    (event: FormEvent<HTMLInputElement>) => {
      const nextValue = Number(event.currentTarget.value);
      if (!Number.isFinite(nextValue)) {
        return;
      }

      updateLayerById(layerId, (layer) => ({
        ...layer,
        crop: {
          ...layer.crop,
          [field]: clamp(nextValue, 0, 0.9),
        },
      }));
    };

  const onLayerBlendModeChange = (layerId: string) => (event: ChangeEvent<HTMLSelectElement>) => {
    updateLayerById(layerId, (layer) => ({
      ...layer,
      blendMode: event.target.value as MixerBlendMode,
    }));
  };

  const onLayerToggle = (layerId: string, field: "visible" | "locked") => {
    updateLayerById(layerId, (layer) => ({ ...layer, [field]: !layer[field] }));
  };

  const onFabricTransformLayer = useCallback(
    (
      layerId: string,
      patch: Pick<MixerPreviewLayer, "x" | "y" | "width" | "height" | "rotation">,
    ) => {
      updateLayerById(layerId, (layer) => ({
        ...layer,
        x: clamp(patch.x, MIN_MIXER_LAYER_POSITION, MAX_MIXER_LAYER_POSITION),
        y: clamp(patch.y, MIN_MIXER_LAYER_POSITION, MAX_MIXER_LAYER_POSITION),
        width: clamp(patch.width, MIN_MIXER_LAYER_SIZE, MAX_MIXER_LAYER_SIZE),
        height: clamp(patch.height, MIN_MIXER_LAYER_SIZE, MAX_MIXER_LAYER_SIZE),
        rotation: patch.rotation,
      }));
    },
    [updateLayerById],
  );

  useEffect(() => {
    if (!isLayerMode || !derivedStage) {
      lastQueuedStageDataRef.current = null;
      lastQueuedStageResizeRef.current = null;
      return;
    }

    const stageKey = `${derivedStage.width}x${derivedStage.height}`;
    const baseLayers = mergeEditableLayersWithPreviewHandles({
      currentLayers: layerData.layers,
      previewLayers,
    });
    const stageDataKey = JSON.stringify({
      stage: derivedStage,
      layers: baseLayers,
    });

    if (!mixerStageSizesEqual(layerData.stage, derivedStage)) {
      if (lastQueuedStageDataRef.current !== stageDataKey) {
        lastQueuedStageDataRef.current = stageDataKey;
        void queueNodeDataUpdate({
          nodeId: id as Id<"nodes">,
          data: {
            ...latestNodeDataRef.current,
            mixerVersion: 2,
            stage: derivedStage,
            layers: baseLayers,
          },
        });
      }
    } else {
      lastQueuedStageDataRef.current = null;
    }

    if (lastQueuedStageResizeRef.current === stageKey) {
      return;
    }
    lastQueuedStageResizeRef.current = stageKey;

    void queueNodeResize({
      nodeId: id as Id<"nodes">,
      ...computeMixerNodeSizeFromStage(derivedStage),
      skipHistory: true,
    });
  }, [
    derivedStage,
    id,
    isLayerMode,
    layerData.layers,
    layerData.stage,
    previewLayers,
    queueNodeDataUpdate,
    queueNodeResize,
  ]);

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

  if (isLayerMode) {
    return (
      <div className="grid h-full min-h-[420px] w-full grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Merge layers
        </div>
        {previewState.status === "error" ? (
          <div className="flex items-center justify-center bg-muted/40 px-5 text-center text-xs text-red-600">
            Preview unavailable
          </div>
        ) : previewLayers.length > 0 ? (
          <MixerFabricEditor
            stage={previewState.stage ?? layerData.stage}
            layers={displayLayers}
            previewQuality={previewQuality}
            activeLayerId={selectedLayerId}
            onSelectLayer={setActiveLayerId}
            onTransformLayer={onFabricTransformLayer}
          />
        ) : (
          <div className="flex items-center justify-center bg-muted/40 px-5 text-center text-xs text-muted-foreground">
            Connect layer inputs
          </div>
        )}
        <MixerLayerControls
          layers={displayLayers}
          activeLayerId={selectedLayerId}
          onSelectLayer={setActiveLayerId}
          onMoveLayer={moveLayer}
          onNumberChange={onLayerNumberChange}
          onCropChange={onLayerCropChange}
          onBlendModeChange={onLayerBlendModeChange}
          onToggle={onLayerToggle}
        />
      </div>
    );
  }

  return (
      <div className="grid h-full min-h-[360px] w-full grid-rows-[auto_minmax(0,1fr)_auto]">
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
  );
}

function MixerLayerControls({
  layers,
  activeLayerId,
  onSelectLayer,
  onMoveLayer,
  onNumberChange,
  onCropChange,
  onBlendModeChange,
  onToggle,
}: {
  layers: MixerPreviewLayer[];
  activeLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onMoveLayer: (layerId: string, direction: -1 | 1) => void;
  onNumberChange: (
    layerId: string,
    field: "opacity" | "x" | "y" | "width" | "height" | "rotation",
  ) => (event: FormEvent<HTMLInputElement>) => void;
  onCropChange: (
    layerId: string,
    field: keyof NormalizedMixerLayerData["crop"],
  ) => (event: FormEvent<HTMLInputElement>) => void;
  onBlendModeChange: (layerId: string) => (event: ChangeEvent<HTMLSelectElement>) => void;
  onToggle: (layerId: string, field: "visible" | "locked") => void;
}) {
  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers.at(-1);

  return (
    <div className="border-t border-border p-2 text-[11px]">
      <div className="mb-2 flex max-h-24 flex-col gap-1 overflow-auto">
        {[...layers].reverse().map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => onSelectLayer(layer.id)}
            className={`nodrag nopan flex items-center justify-between rounded px-2 py-1 text-left ${
              layer.id === activeLayer?.id ? "bg-primary/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            <span className="truncate">{layer.id}</span>
            <span>{layer.handleId}</span>
          </button>
        ))}
      </div>

      {activeLayer ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3 flex items-center gap-1">
            <button type="button" className="nodrag nopan rounded border p-1" onClick={() => onMoveLayer(activeLayer.id, 1)} aria-label="Move layer up">
              <ArrowUp size={13} />
            </button>
            <button type="button" className="nodrag nopan rounded border p-1" onClick={() => onMoveLayer(activeLayer.id, -1)} aria-label="Move layer down">
              <ArrowDown size={13} />
            </button>
            <button type="button" className="nodrag nopan rounded border p-1" onClick={() => onToggle(activeLayer.id, "visible")} aria-label="Toggle layer visibility">
              {activeLayer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button type="button" className="nodrag nopan rounded border p-1" onClick={() => onToggle(activeLayer.id, "locked")} aria-label="Toggle layer lock">
              {activeLayer.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
            <select
              name="layerBlendMode"
              value={activeLayer.blendMode}
              onChange={onBlendModeChange(activeLayer.id)}
              className="nodrag nopan ml-auto h-7 rounded border border-input bg-background px-2 text-[11px]"
            >
              {(["normal", "multiply", "screen", "overlay"] as MixerBlendMode[]).map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>

          <LayerNumber label="Opacity" value={activeLayer.opacity} min={0} max={100} step={1} onInput={onNumberChange(activeLayer.id, "opacity")} />
          <LayerNumber label="X" value={activeLayer.x} min={MIN_MIXER_LAYER_POSITION} max={MAX_MIXER_LAYER_POSITION} step={0.01} onInput={onNumberChange(activeLayer.id, "x")} />
          <LayerNumber label="Y" value={activeLayer.y} min={MIN_MIXER_LAYER_POSITION} max={MAX_MIXER_LAYER_POSITION} step={0.01} onInput={onNumberChange(activeLayer.id, "y")} />
          <LayerNumber label="W" value={activeLayer.width} min={MIN_MIXER_LAYER_SIZE} max={MAX_MIXER_LAYER_SIZE} step={0.01} onInput={onNumberChange(activeLayer.id, "width")} />
          <LayerNumber label="H" value={activeLayer.height} min={MIN_MIXER_LAYER_SIZE} max={MAX_MIXER_LAYER_SIZE} step={0.01} onInput={onNumberChange(activeLayer.id, "height")} />
          <LayerNumber label="Rot" value={activeLayer.rotation} min={0} max={359} step={1} onInput={onNumberChange(activeLayer.id, "rotation")} />
          <LayerNumber label="Crop L" value={activeLayer.crop.left} min={0} max={0.9} step={0.01} onInput={onCropChange(activeLayer.id, "left")} />
          <LayerNumber label="Crop T" value={activeLayer.crop.top} min={0} max={0.9} step={0.01} onInput={onCropChange(activeLayer.id, "top")} />
          <LayerNumber label="Crop R" value={activeLayer.crop.right} min={0} max={0.9} step={0.01} onInput={onCropChange(activeLayer.id, "right")} />
          <LayerNumber label="Crop B" value={activeLayer.crop.bottom} min={0} max={0.9} step={0.01} onInput={onCropChange(activeLayer.id, "bottom")} />
        </div>
      ) : null}
    </div>
  );
}

function LayerNumber({
  label,
  value,
  min,
  max,
  step,
  onInput,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (event: FormEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-muted-foreground">
      <span>{label}</span>
      <input
        className="nodrag nopan nowheel h-7 rounded border border-input bg-background px-2 text-[11px] text-foreground"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={onInput}
      />
    </label>
  );
}

export default function MixerNode({ id, data, selected, width, height }: NodeProps) {
  const graph = useCanvasGraph();
  const nodeTypeById = useMemo(
    () => new Map([...graph.nodesById.values()].map((node) => [node.id, node.type ?? ""] as const)),
    [graph.nodesById],
  );
  const inputHandles = useMemo(
    () =>
      resolveVisibleRepeatingInputHandles({
        nodeType: "mixer",
        nodeId: id,
        edges: graph.incomingEdgesByTarget.get(id) ?? [],
        nodeTypeById,
      }),
    [graph.incomingEdgesByTarget, id, nodeTypeById],
  );

  return (
    <BaseNodeWrapper nodeType="mixer" selected={selected} className="p-0">
      <RepeatingInputHandles
        nodeId={id}
        nodeType="mixer"
        handles={inputHandles}
        className="!h-3 !w-3 !border-2 !border-background !bg-sky-500"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="mixer"
        type="source"
        position={Position.Right}
        id="mixer-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />

      <MixerNodeBody id={id} data={data} width={width} height={height} />
    </BaseNodeWrapper>
  );
}
