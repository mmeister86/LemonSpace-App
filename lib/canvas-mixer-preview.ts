/**
 * Onboarding note:
 * Shared TypeScript utility for canvas mixer preview. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import {
  buildGraphSnapshot,
  resolveNodeImageUrl,
  resolveRenderOutputUrl,
  resolveRenderPreviewInputFromGraph,
  resolveTextLayerSource,
  type CanvasGraphEdgeLike,
  type CanvasGraphNodeLike,
  type CanvasGraphSnapshot,
  type MixerLayerSource,
  type RenderPreviewSourceQuality,
} from "@/lib/canvas-render-preview";
import {
  createDefaultMixerLayerData,
  MIXER_SOURCE_NODE_TYPES,
  normalizeMixerLayerCompositionData,
  normalizeMixerLayerHandle,
  normalizeMixerCompositionData,
  type MixerBlendMode,
  type NormalizedMixerLayerData,
} from "@/lib/canvas-mixer-normalization";
import { resolveMixerBaseStageFromGraph } from "@/lib/canvas-mixer-stage";
import { readNodeBypassed } from "@/lib/canvas-node-favorite";

export type MixerPreviewStatus = "empty" | "partial" | "ready" | "error";

export type MixerPreviewError = "duplicate-handle-edge";

export type MixerPreviewLayer = NormalizedMixerLayerData & {
  source: MixerLayerSource;
};

export type MixerPreviewState = {
  status: MixerPreviewStatus;
  stage?: { width: number; height: number } | null;
  layers?: MixerPreviewLayer[];
  baseUrl?: string;
  overlayUrl?: string;
  baseSource?: MixerLayerSource;
  overlaySource?: MixerLayerSource;
  blendMode: MixerBlendMode;
  opacity: number;
  overlayX: number;
  overlayY: number;
  overlayWidth: number;
  overlayHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  error?: MixerPreviewError;
};

export function normalizeMixerPreviewData(data: unknown): Pick<
  MixerPreviewState,
  | "blendMode"
  | "opacity"
  | "overlayX"
  | "overlayY"
  | "overlayWidth"
  | "overlayHeight"
  | "cropLeft"
  | "cropTop"
  | "cropRight"
  | "cropBottom"
> {
  return normalizeMixerCompositionData(data);
}

function isV2MixerData(data: unknown): boolean {
  const record = (data ?? {}) as Record<string, unknown>;
  return record.mixerVersion === 2 || Array.isArray(record.layers);
}

function isV2MixerHandle(handle: string | null | undefined): boolean {
  return typeof handle === "string" && (handle === "layer-in" || handle.startsWith("layer-in-"));
}

function mergeLayersWithIncomingHandles(args: {
  layers: readonly NormalizedMixerLayerData[];
  incomingEdges: readonly CanvasGraphEdgeLike[];
}): NormalizedMixerLayerData[] {
  const layers = [...args.layers];
  const seen = new Set(layers.map((layer) => layer.handleId));
  const incomingHandles = args.incomingEdges
    .map((edge) => normalizeMixerLayerHandle(edge.targetHandle))
    .filter((handle): handle is string => Boolean(handle));

  for (const handle of incomingHandles) {
    if (seen.has(handle)) {
      continue;
    }
    seen.add(handle);
    layers.push(createDefaultMixerLayerData(handle, layers.length));
  }

  return layers;
}

function resolveHandleEdge(args: {
  incomingEdges: readonly CanvasGraphEdgeLike[];
  handle: "base" | "overlay";
}): { edge: CanvasGraphEdgeLike | null; duplicate: boolean } {
  const edges = args.incomingEdges.filter((edge) => {
    if (args.handle === "base") {
      return edge.targetHandle === "base" || edge.targetHandle == null || edge.targetHandle === "";
    }

    return edge.targetHandle === "overlay";
  });

  if (edges.length > 1) {
    return { edge: null, duplicate: true };
  }

  return { edge: edges[0] ?? null, duplicate: false };
}

function resolveLayerSourceFromNode(args: {
  sourceNode: CanvasGraphNodeLike;
  graph: CanvasGraphSnapshot;
  sourceQuality?: RenderPreviewSourceQuality;
}): MixerLayerSource | undefined {
  if (readNodeBypassed(args.sourceNode.data)) {
    return undefined;
  }

  if (!MIXER_SOURCE_NODE_TYPES.has(args.sourceNode.type)) {
    return undefined;
  }

  if (args.sourceNode.type === "text") {
    return resolveTextLayerSource(args.sourceNode);
  }

  if (args.sourceNode.type === "render") {
    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: args.sourceNode.id,
      graph: args.graph,
      sourceQuality: args.sourceQuality,
    });
    if (preview.sourceComposition) {
      return undefined;
    }
    if (preview.sourceUrl) {
      return { kind: "image", url: preview.sourceUrl };
    }

    const renderOutputUrl = resolveRenderOutputUrl(args.sourceNode, {
      sourceQuality: args.sourceQuality,
    }) ?? undefined;
    if (renderOutputUrl) {
      return { kind: "image", url: renderOutputUrl };
    }

    return undefined;
  }

  const url = resolveNodeImageUrl(args.sourceNode.data, {
    sourceQuality: args.sourceQuality,
  });
  return url ? { kind: "image", url } : undefined;
}

function resolveLayerSourceFromEdge(args: {
  edge: CanvasGraphEdgeLike | null;
  graph: CanvasGraphSnapshot;
  sourceQuality?: RenderPreviewSourceQuality;
}): MixerLayerSource | undefined {
  if (!args.edge) {
    return undefined;
  }

  const sourceNode = args.graph.nodesById.get(args.edge.source);
  if (!sourceNode) {
    return undefined;
  }

  return resolveLayerSourceFromNode({
    sourceNode,
    graph: args.graph,
    sourceQuality: args.sourceQuality,
  });
}

function resolveV2LayerSources(args: {
  incomingEdges: readonly CanvasGraphEdgeLike[];
  graph: CanvasGraphSnapshot;
  layers: readonly NormalizedMixerLayerData[];
  sourceQuality?: RenderPreviewSourceQuality;
}): { layers: MixerPreviewLayer[]; duplicate: boolean; expectedVisibleCount: number } {
  const edgeByHandle = new Map<string, CanvasGraphEdgeLike>();
  let duplicate = false;

  for (const edge of args.incomingEdges) {
    const handle = normalizeMixerLayerHandle(edge.targetHandle);
    if (!handle) {
      continue;
    }
    if (edgeByHandle.has(handle)) {
      duplicate = true;
      continue;
    }
    edgeByHandle.set(handle, edge);
  }

  const layers: MixerPreviewLayer[] = [];
  let expectedVisibleCount = 0;
  for (const layer of args.layers) {
    if (!layer.visible) {
      continue;
    }

    expectedVisibleCount += 1;
    const source = resolveLayerSourceFromEdge({
      edge: edgeByHandle.get(layer.handleId) ?? null,
      graph: args.graph,
      sourceQuality: args.sourceQuality,
    });
    if (!source) {
      continue;
    }

    layers.push({ ...layer, source });
  }

  return { layers, duplicate, expectedVisibleCount };
}

export function resolveMixerPreviewFromGraph(args: {
  nodeId: string;
  graph: CanvasGraphSnapshot;
  sourceQuality?: RenderPreviewSourceQuality;
}): MixerPreviewState {
  const node = args.graph.nodesById.get(args.nodeId);
  const normalized = normalizeMixerPreviewData(node?.data);
  if (!node || readNodeBypassed(node.data)) {
    return {
      status: "empty",
      ...normalized,
    };
  }

  const incomingEdges = args.graph.incomingEdgesByTarget.get(args.nodeId) ?? [];
  if (isV2MixerData(node.data) || incomingEdges.some((edge) => isV2MixerHandle(edge.targetHandle))) {
    const v2 = normalizeMixerLayerCompositionData(node.data);
    const layers = mergeLayersWithIncomingHandles({
      layers: v2.layers,
      incomingEdges,
    });
    const resolved = resolveV2LayerSources({
      incomingEdges,
      graph: args.graph,
      layers,
      sourceQuality: args.sourceQuality,
    });
    const stage =
      v2.stage ??
      resolveMixerBaseStageFromGraph({
        incomingEdges,
        graph: args.graph,
      });

    if (resolved.duplicate) {
      return {
        status: "error",
        stage,
        layers: [],
        ...normalized,
        error: "duplicate-handle-edge",
      };
    }

    if (resolved.layers.length > 0) {
      return {
        status: resolved.layers.length === resolved.expectedVisibleCount ? "ready" : "partial",
        stage,
        layers: resolved.layers,
        ...normalized,
      };
    }

    return {
      status: layers.length > 0 ? "partial" : "empty",
      stage,
      layers: [],
      ...normalized,
    };
  }

  const base = resolveHandleEdge({ incomingEdges, handle: "base" });
  const overlay = resolveHandleEdge({ incomingEdges, handle: "overlay" });

  if (base.duplicate || overlay.duplicate) {
    return {
      status: "error",
      baseUrl: undefined,
      overlayUrl: undefined,
      ...normalized,
      error: "duplicate-handle-edge",
    };
  }

  const baseSource = resolveLayerSourceFromEdge({
    edge: base.edge,
    graph: args.graph,
    sourceQuality: args.sourceQuality,
  });
  const overlaySource = resolveLayerSourceFromEdge({
    edge: overlay.edge,
    graph: args.graph,
    sourceQuality: args.sourceQuality,
  });
  const baseUrl = baseSource?.kind === "image" ? baseSource.url : undefined;
  const overlayUrl = overlaySource?.kind === "image" ? overlaySource.url : undefined;

  if (baseSource && overlaySource) {
    return {
      status: "ready",
      ...normalized,
      ...(baseUrl ? { baseUrl } : { baseSource }),
      ...(overlayUrl ? { overlayUrl } : { overlaySource }),
    };
  }

  if (baseSource || overlaySource) {
    return {
      status: "partial",
      ...normalized,
      baseUrl,
      overlayUrl,
      ...(baseSource ? (baseSource.kind === "image" ? {} : { baseSource }) : {}),
      ...(overlaySource ? (overlaySource.kind === "image" ? {} : { overlaySource }) : {}),
    };
  }

  return {
    status: "empty",
    ...normalized,
  };
}

export function resolveMixerPreview(args: {
  nodeId: string;
  nodes: readonly CanvasGraphNodeLike[];
  edges: readonly CanvasGraphEdgeLike[];
  sourceQuality?: RenderPreviewSourceQuality;
}): MixerPreviewState {
  return resolveMixerPreviewFromGraph({
    nodeId: args.nodeId,
    graph: buildGraphSnapshot(args.nodes, args.edges),
    sourceQuality: args.sourceQuality,
  });
}
