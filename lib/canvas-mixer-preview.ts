import {
  buildGraphSnapshot,
  resolveNodeImageUrl,
  resolveRenderPreviewInputFromGraph,
  type CanvasGraphEdgeLike,
  type CanvasGraphNodeLike,
  type CanvasGraphSnapshot,
} from "@/lib/canvas-render-preview";

export type MixerBlendMode = "normal" | "multiply" | "screen" | "overlay";

export type MixerPreviewStatus = "empty" | "partial" | "ready" | "error";

export type MixerPreviewError = "duplicate-handle-edge";

export type MixerPreviewState = {
  status: MixerPreviewStatus;
  baseUrl?: string;
  overlayUrl?: string;
  blendMode: MixerBlendMode;
  opacity: number;
  overlayX: number;
  overlayY: number;
  overlayWidth: number;
  overlayHeight: number;
  error?: MixerPreviewError;
};

const MIXER_SOURCE_NODE_TYPES = new Set(["image", "asset", "ai-image", "render"]);
const MIXER_BLEND_MODES = new Set<MixerBlendMode>([
  "normal",
  "multiply",
  "screen",
  "overlay",
]);
const DEFAULT_BLEND_MODE: MixerBlendMode = "normal";
const DEFAULT_OPACITY = 100;
const MIN_OPACITY = 0;
const MAX_OPACITY = 100;
const DEFAULT_OVERLAY_X = 0;
const DEFAULT_OVERLAY_Y = 0;
const DEFAULT_OVERLAY_WIDTH = 1;
const DEFAULT_OVERLAY_HEIGHT = 1;
const MIN_OVERLAY_POSITION = 0;
const MAX_OVERLAY_POSITION = 1;
const MIN_OVERLAY_SIZE = 0.1;
const MAX_OVERLAY_SIZE = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeOpacity(value: unknown): number {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return DEFAULT_OPACITY;
  }

  return clamp(parsed, MIN_OPACITY, MAX_OPACITY);
}

function normalizeOverlayNumber(value: unknown, fallback: number): number {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return fallback;
  }

  return parsed;
}

function normalizeOverlayRect(record: Record<string, unknown>): Pick<
  MixerPreviewState,
  "overlayX" | "overlayY" | "overlayWidth" | "overlayHeight"
> {
  const hasLegacyOffset = record.offsetX !== undefined || record.offsetY !== undefined;
  const hasOverlayRectField =
    record.overlayX !== undefined ||
    record.overlayY !== undefined ||
    record.overlayWidth !== undefined ||
    record.overlayHeight !== undefined;

  if (hasLegacyOffset && !hasOverlayRectField) {
    return {
      overlayX: DEFAULT_OVERLAY_X,
      overlayY: DEFAULT_OVERLAY_Y,
      overlayWidth: DEFAULT_OVERLAY_WIDTH,
      overlayHeight: DEFAULT_OVERLAY_HEIGHT,
    };
  }

  const overlayX = clamp(
    normalizeOverlayNumber(record.overlayX, DEFAULT_OVERLAY_X),
    MIN_OVERLAY_POSITION,
    MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE,
  );
  const overlayY = clamp(
    normalizeOverlayNumber(record.overlayY, DEFAULT_OVERLAY_Y),
    MIN_OVERLAY_POSITION,
    MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE,
  );
  const overlayWidth = clamp(
    normalizeOverlayNumber(record.overlayWidth, DEFAULT_OVERLAY_WIDTH),
    MIN_OVERLAY_SIZE,
    Math.min(MAX_OVERLAY_SIZE, MAX_OVERLAY_POSITION - overlayX),
  );
  const overlayHeight = clamp(
    normalizeOverlayNumber(record.overlayHeight, DEFAULT_OVERLAY_HEIGHT),
    MIN_OVERLAY_SIZE,
    Math.min(MAX_OVERLAY_SIZE, MAX_OVERLAY_POSITION - overlayY),
  );

  return {
    overlayX,
    overlayY,
    overlayWidth,
    overlayHeight,
  };
}

export function normalizeMixerPreviewData(data: unknown): Pick<
  MixerPreviewState,
  "blendMode" | "opacity" | "overlayX" | "overlayY" | "overlayWidth" | "overlayHeight"
> {
  const record = (data ?? {}) as Record<string, unknown>;
  const blendMode = MIXER_BLEND_MODES.has(record.blendMode as MixerBlendMode)
    ? (record.blendMode as MixerBlendMode)
    : DEFAULT_BLEND_MODE;

  return {
    blendMode,
    opacity: normalizeOpacity(record.opacity),
    ...normalizeOverlayRect(record),
  };
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

function resolveSourceUrlFromNode(args: {
  sourceNode: CanvasGraphNodeLike;
  graph: CanvasGraphSnapshot;
}): string | undefined {
  if (!MIXER_SOURCE_NODE_TYPES.has(args.sourceNode.type)) {
    return undefined;
  }

  if (args.sourceNode.type === "render") {
    const renderData = (args.sourceNode.data ?? {}) as Record<string, unknown>;
    const renderOutputUrl =
      typeof renderData.lastUploadUrl === "string" && renderData.lastUploadUrl.length > 0
        ? renderData.lastUploadUrl
        : undefined;
    if (renderOutputUrl) {
      return renderOutputUrl;
    }

    const directRenderUrl = resolveNodeImageUrl(args.sourceNode.data);
    if (directRenderUrl) {
      return directRenderUrl;
    }

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: args.sourceNode.id,
      graph: args.graph,
    });
    return preview.sourceUrl ?? undefined;
  }

  return resolveNodeImageUrl(args.sourceNode.data) ?? undefined;
}

function resolveSourceUrlFromEdge(args: {
  edge: CanvasGraphEdgeLike | null;
  graph: CanvasGraphSnapshot;
}): string | undefined {
  if (!args.edge) {
    return undefined;
  }

  const sourceNode = args.graph.nodesById.get(args.edge.source);
  if (!sourceNode) {
    return undefined;
  }

  return resolveSourceUrlFromNode({ sourceNode, graph: args.graph });
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

  const baseUrl = resolveSourceUrlFromEdge({ edge: base.edge, graph: args.graph });
  const overlayUrl = resolveSourceUrlFromEdge({ edge: overlay.edge, graph: args.graph });

  if (baseUrl && overlayUrl) {
    return {
      status: "ready",
      ...normalized,
      baseUrl,
      overlayUrl,
    };
  }

  if (baseUrl || overlayUrl) {
    return {
      status: "partial",
      ...normalized,
      baseUrl,
      overlayUrl,
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
