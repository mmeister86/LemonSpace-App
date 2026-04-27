import {
  buildGraphSnapshot,
  resolveNodeImageUrl,
  resolveRenderPreviewInputFromGraph,
  resolveTextLayerSource,
  type CanvasGraphEdgeLike,
  type CanvasGraphNodeLike,
  type CanvasGraphSnapshot,
  type MixerLayerSource,
} from "@/lib/canvas-render-preview";
import {
  MIXER_SOURCE_NODE_TYPES,
  normalizeMixerCompositionData,
  type MixerBlendMode,
} from "@/lib/canvas-mixer-normalization";

export type MixerPreviewStatus = "empty" | "partial" | "ready" | "error";

export type MixerPreviewError = "duplicate-handle-edge";

export type MixerPreviewState = {
  status: MixerPreviewStatus;
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
}): MixerLayerSource | undefined {
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
    });
    if (preview.sourceComposition) {
      return undefined;
    }
    if (preview.sourceUrl) {
      return { kind: "image", url: preview.sourceUrl };
    }

    const renderData = (args.sourceNode.data ?? {}) as Record<string, unknown>;
    const renderOutputUrl =
      typeof renderData.lastUploadUrl === "string" && renderData.lastUploadUrl.length > 0
        ? renderData.lastUploadUrl
        : undefined;
    if (renderOutputUrl) {
      return { kind: "image", url: renderOutputUrl };
    }

    const directRenderUrl = resolveNodeImageUrl(args.sourceNode.data);
    if (directRenderUrl) {
      return { kind: "image", url: directRenderUrl };
    }

    return undefined;
  }

  const url = resolveNodeImageUrl(args.sourceNode.data);
  return url ? { kind: "image", url } : undefined;
}

function resolveLayerSourceFromEdge(args: {
  edge: CanvasGraphEdgeLike | null;
  graph: CanvasGraphSnapshot;
}): MixerLayerSource | undefined {
  if (!args.edge) {
    return undefined;
  }

  const sourceNode = args.graph.nodesById.get(args.edge.source);
  if (!sourceNode) {
    return undefined;
  }

  return resolveLayerSourceFromNode({ sourceNode, graph: args.graph });
}

export function resolveMixerPreviewFromGraph(args: {
  nodeId: string;
  graph: CanvasGraphSnapshot;
}): MixerPreviewState {
  const node = args.graph.nodesById.get(args.nodeId);
  const normalized = normalizeMixerPreviewData(node?.data);
  const incomingEdges = args.graph.incomingEdgesByTarget.get(args.nodeId) ?? [];
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

  const baseSource = resolveLayerSourceFromEdge({ edge: base.edge, graph: args.graph });
  const overlaySource = resolveLayerSourceFromEdge({ edge: overlay.edge, graph: args.graph });
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
}): MixerPreviewState {
  return resolveMixerPreviewFromGraph({
    nodeId: args.nodeId,
    graph: buildGraphSnapshot(args.nodes, args.edges),
  });
}
