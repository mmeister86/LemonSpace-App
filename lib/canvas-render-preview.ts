import {
  hashPipeline,
  type PipelineStep,
} from "@/lib/image-pipeline/contracts";

export type RenderPreviewGraphNode = {
  id: string;
  type: string;
  data?: unknown;
};

export type RenderPreviewGraphEdge = {
  source: string;
  target: string;
};

export type RenderPreviewInput = {
  sourceUrl: string | null;
  sourceComposition?: RenderPreviewSourceComposition;
  steps: PipelineStep[];
};

export type MixerBlendMode = "normal" | "multiply" | "screen" | "overlay";

export type RenderPreviewSourceComposition = {
  kind: "mixer";
  baseUrl: string;
  overlayUrl: string;
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
};

export type CanvasGraphNodeLike = {
  id: string;
  type: string;
  data?: unknown;
};

export type CanvasGraphEdgeLike = {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  className?: string | null;
};

export type CanvasGraphSnapshot = {
  nodesById: ReadonlyMap<string, CanvasGraphNodeLike>;
  incomingEdgesByTarget: ReadonlyMap<string, readonly CanvasGraphEdgeLike[]>;
};

type RenderPreviewResolvedInput = RenderPreviewInput;

export type CanvasGraphNodeDataOverrides = ReadonlyMap<string, unknown>;

export function shouldFastPathPreviewPipeline(
  steps: readonly Pick<PipelineStep, "nodeId">[],
  overrides: CanvasGraphNodeDataOverrides,
): boolean {
  if (steps.length === 0 || overrides.size === 0) {
    return false;
  }

  return steps.some((step) => overrides.has(step.nodeId));
}

export type BuildGraphSnapshotOptions = {
  includeTempEdges?: boolean;
  nodeDataOverrides?: CanvasGraphNodeDataOverrides;
};

function hashNodeData(value: unknown): string {
  return JSON.stringify(value);
}

function pruneNodeDataOverride(data: unknown, override: unknown): unknown {
  return hashNodeData(data) === hashNodeData(override) ? undefined : override;
}

export function pruneCanvasGraphNodeDataOverrides(
  nodes: readonly CanvasGraphNodeLike[],
  overrides: CanvasGraphNodeDataOverrides,
): CanvasGraphNodeDataOverrides {
  if (overrides.size === 0) {
    return overrides;
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  let nextOverrides: Map<string, unknown> | null = null;

  for (const [nodeId, override] of overrides) {
    const node = nodesById.get(nodeId);
    const nextOverride = node ? pruneNodeDataOverride(node.data, override) : undefined;

    if (nextOverride === undefined) {
      nextOverrides ??= new Map(overrides);
      nextOverrides.delete(nodeId);
      continue;
    }

    if (nextOverride !== override && !nextOverrides) {
      nextOverrides = new Map(overrides);
    }

    if (nextOverrides) {
      nextOverrides.set(nodeId, nextOverride);
    }
  }

  return nextOverrides ?? overrides;
}

type RenderResolutionOption = "original" | "2x" | "custom";
type RenderFormatOption = "png" | "jpeg" | "webp";

const DEFAULT_OUTPUT_RESOLUTION: RenderResolutionOption = "original";
const DEFAULT_FORMAT: RenderFormatOption = "png";
const DEFAULT_JPEG_QUALITY = 90;
const MIN_CUSTOM_DIMENSION = 1;
const MAX_CUSTOM_DIMENSION = 16_384;

function sanitizeDimension(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const rounded = Math.round(value);
  if (rounded < MIN_CUSTOM_DIMENSION || rounded > MAX_CUSTOM_DIMENSION) {
    return undefined;
  }

  return rounded;
}

const SOURCE_NODE_TYPES = new Set([
  "image",
  "ai-image",
  "asset",
  "video",
  "asset-video",
  "ai-video",
]);

export const RENDER_PREVIEW_PIPELINE_TYPES = new Set([
  "crop",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

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
const DEFAULT_CROP_LEFT = 0;
const DEFAULT_CROP_TOP = 0;
const DEFAULT_CROP_RIGHT = 0;
const DEFAULT_CROP_BOTTOM = 0;
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

function normalizeMixerCompositionRect(data: Record<string, unknown>): Pick<
  RenderPreviewSourceComposition,
  "overlayX" | "overlayY" | "overlayWidth" | "overlayHeight"
> {
  const hasLegacyOffset = data.offsetX !== undefined || data.offsetY !== undefined;
  const hasOverlayRectField =
    data.overlayX !== undefined ||
    data.overlayY !== undefined ||
    data.overlayWidth !== undefined ||
    data.overlayHeight !== undefined;

  if (hasLegacyOffset && !hasOverlayRectField) {
    return {
      overlayX: DEFAULT_OVERLAY_X,
      overlayY: DEFAULT_OVERLAY_Y,
      overlayWidth: DEFAULT_OVERLAY_WIDTH,
      overlayHeight: DEFAULT_OVERLAY_HEIGHT,
    };
  }

  const overlayX = clamp(
    normalizeOverlayNumber(data.overlayX, DEFAULT_OVERLAY_X),
    MIN_OVERLAY_POSITION,
    MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE,
  );
  const overlayY = clamp(
    normalizeOverlayNumber(data.overlayY, DEFAULT_OVERLAY_Y),
    MIN_OVERLAY_POSITION,
    MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE,
  );
  const overlayWidth = clamp(
    normalizeOverlayNumber(data.overlayWidth, DEFAULT_OVERLAY_WIDTH),
    MIN_OVERLAY_SIZE,
    Math.min(MAX_OVERLAY_SIZE, MAX_OVERLAY_POSITION - overlayX),
  );
  const overlayHeight = clamp(
    normalizeOverlayNumber(data.overlayHeight, DEFAULT_OVERLAY_HEIGHT),
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

function normalizeMixerCompositionCropEdges(data: Record<string, unknown>): Pick<
  RenderPreviewSourceComposition,
  "cropLeft" | "cropTop" | "cropRight" | "cropBottom"
> {
  const hasCropField =
    data.cropLeft !== undefined ||
    data.cropTop !== undefined ||
    data.cropRight !== undefined ||
    data.cropBottom !== undefined;
  const hasLegacyContentRectField =
    data.contentX !== undefined ||
    data.contentY !== undefined ||
    data.contentWidth !== undefined ||
    data.contentHeight !== undefined;

  if (!hasCropField && hasLegacyContentRectField) {
    const contentX = clamp(
      normalizeOverlayNumber(data.contentX, 0),
      MIN_OVERLAY_POSITION,
      MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE,
    );
    const contentY = clamp(
      normalizeOverlayNumber(data.contentY, 0),
      MIN_OVERLAY_POSITION,
      MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE,
    );
    const contentWidth = clamp(
      normalizeOverlayNumber(data.contentWidth, 1),
      MIN_OVERLAY_SIZE,
      Math.min(MAX_OVERLAY_SIZE, MAX_OVERLAY_POSITION - contentX),
    );
    const contentHeight = clamp(
      normalizeOverlayNumber(data.contentHeight, 1),
      MIN_OVERLAY_SIZE,
      Math.min(MAX_OVERLAY_SIZE, MAX_OVERLAY_POSITION - contentY),
    );

    return {
      cropLeft: contentX,
      cropTop: contentY,
      cropRight: 1 - (contentX + contentWidth),
      cropBottom: 1 - (contentY + contentHeight),
    };
  }

  const cropLeft = clamp(
    normalizeOverlayNumber(data.cropLeft, DEFAULT_CROP_LEFT),
    0,
    1 - MIN_OVERLAY_SIZE,
  );
  const cropTop = clamp(
    normalizeOverlayNumber(data.cropTop, DEFAULT_CROP_TOP),
    0,
    1 - MIN_OVERLAY_SIZE,
  );
  const cropRight = clamp(
    normalizeOverlayNumber(data.cropRight, DEFAULT_CROP_RIGHT),
    0,
    1 - cropLeft - MIN_OVERLAY_SIZE,
  );
  const cropBottom = clamp(
    normalizeOverlayNumber(data.cropBottom, DEFAULT_CROP_BOTTOM),
    0,
    1 - cropTop - MIN_OVERLAY_SIZE,
  );

  return {
    cropLeft,
    cropTop,
    cropRight,
    cropBottom,
  };
}

export function resolveRenderFingerprint(data: unknown): {
  resolution: RenderResolutionOption;
  customWidth?: number;
  customHeight?: number;
  format: RenderFormatOption;
  jpegQuality?: number;
} {
  const record = (data ?? {}) as Record<string, unknown>;
  const resolution: RenderResolutionOption =
    record.outputResolution === "2x" || record.outputResolution === "custom"
      ? record.outputResolution
      : DEFAULT_OUTPUT_RESOLUTION;

  const format: RenderFormatOption =
    record.format === "jpeg" || record.format === "webp"
      ? record.format
      : DEFAULT_FORMAT;

  const jpegQuality =
    typeof record.jpegQuality === "number" && Number.isFinite(record.jpegQuality)
      ? Math.max(1, Math.min(100, Math.round(record.jpegQuality)))
      : DEFAULT_JPEG_QUALITY;

  return {
    resolution,
    customWidth: resolution === "custom" ? sanitizeDimension(record.customWidth) : undefined,
    customHeight: resolution === "custom" ? sanitizeDimension(record.customHeight) : undefined,
    format,
    jpegQuality: format === "jpeg" ? jpegQuality : undefined,
  };
}

export function resolveRenderPipelineHash(args: {
  sourceUrl: string | null;
  sourceComposition?: RenderPreviewSourceComposition;
  steps: PipelineStep[];
  data: unknown;
}): string | null {
  if (!args.sourceUrl && !args.sourceComposition) {
    return null;
  }

  return hashPipeline(
    {
      source: args.sourceComposition ?? args.sourceUrl,
      render: resolveRenderFingerprint(args.data),
    },
    args.steps,
  );
}

export function resolveNodeImageUrl(data: unknown): string | null {
  const record = (data ?? {}) as Record<string, unknown>;
  const directUrl = typeof record.url === "string" ? record.url : null;
  if (directUrl && directUrl.length > 0) {
    return directUrl;
  }

  const previewUrl =
    typeof record.previewUrl === "string" ? record.previewUrl : null;
  if (previewUrl && previewUrl.length > 0) {
    return previewUrl;
  }

  return null;
}

function resolveSourceNodeUrl(node: CanvasGraphNodeLike): string | null {
  const data = (node.data ?? {}) as Record<string, unknown>;

  if (node.type === "asset-video") {
    const mp4Url = typeof data.mp4Url === "string" ? data.mp4Url : null;
    if (mp4Url && mp4Url.length > 0) {
      return `/api/pexels-video?u=${encodeURIComponent(mp4Url)}`;
    }
  }

  if (node.type === "video" || node.type === "ai-video") {
    const directUrl = typeof data.url === "string" ? data.url : null;
    if (directUrl && directUrl.length > 0) {
      return directUrl;
    }
  }

  return resolveNodeImageUrl(node.data);
}

function resolveRenderOutputUrl(node: CanvasGraphNodeLike): string | null {
  const data = (node.data ?? {}) as Record<string, unknown>;

  const lastUploadUrl =
    typeof data.lastUploadUrl === "string" && data.lastUploadUrl.length > 0
      ? data.lastUploadUrl
      : null;
  if (lastUploadUrl) {
    return lastUploadUrl;
  }

  return resolveNodeImageUrl(node.data);
}

function resolveMixerHandleEdge(args: {
  incomingEdges: readonly CanvasGraphEdgeLike[];
  handle: "base" | "overlay";
}): CanvasGraphEdgeLike | null {
  const filtered = args.incomingEdges.filter((edge) => {
    if (args.handle === "base") {
      return edge.targetHandle === "base" || edge.targetHandle == null || edge.targetHandle === "";
    }

    return edge.targetHandle === "overlay";
  });

  if (filtered.length !== 1) {
    return null;
  }

  return filtered[0] ?? null;
}

function resolveMixerSourceUrlFromNode(args: {
  node: CanvasGraphNodeLike;
  graph: CanvasGraphSnapshot;
}): string | null {
  if (!MIXER_SOURCE_NODE_TYPES.has(args.node.type)) {
    return null;
  }

  if (args.node.type === "render") {
    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: args.node.id,
      graph: args.graph,
    });
    if (preview.sourceComposition) {
      return null;
    }
    if (preview.sourceUrl) {
      return preview.sourceUrl;
    }

    const directRenderUrl = resolveRenderOutputUrl(args.node);
    if (directRenderUrl) {
      return directRenderUrl;
    }

    return null;
  }

  return resolveNodeImageUrl(args.node.data);
}

function resolveMixerSourceUrlFromEdge(args: {
  edge: CanvasGraphEdgeLike | null;
  graph: CanvasGraphSnapshot;
}): string | null {
  if (!args.edge) {
    return null;
  }

  const sourceNode = args.graph.nodesById.get(args.edge.source);
  if (!sourceNode) {
    return null;
  }

  return resolveMixerSourceUrlFromNode({
    node: sourceNode,
    graph: args.graph,
  });
}

function resolveRenderMixerCompositionFromGraph(args: {
  node: CanvasGraphNodeLike;
  graph: CanvasGraphSnapshot;
}): RenderPreviewSourceComposition | null {
  const incomingEdges = args.graph.incomingEdgesByTarget.get(args.node.id) ?? [];
  const baseEdge = resolveMixerHandleEdge({ incomingEdges, handle: "base" });
  const overlayEdge = resolveMixerHandleEdge({ incomingEdges, handle: "overlay" });
  const baseUrl = resolveMixerSourceUrlFromEdge({ edge: baseEdge, graph: args.graph });
  const overlayUrl = resolveMixerSourceUrlFromEdge({ edge: overlayEdge, graph: args.graph });

  if (!baseUrl || !overlayUrl) {
    return null;
  }

  const data = (args.node.data ?? {}) as Record<string, unknown>;
  const blendMode = MIXER_BLEND_MODES.has(data.blendMode as MixerBlendMode)
    ? (data.blendMode as MixerBlendMode)
    : DEFAULT_BLEND_MODE;

  return {
    kind: "mixer",
    baseUrl,
    overlayUrl,
    blendMode,
    opacity: normalizeOpacity(data.opacity),
    ...normalizeMixerCompositionRect(data),
    ...normalizeMixerCompositionCropEdges(data),
  };
}

export function buildGraphSnapshot(
  nodes: readonly CanvasGraphNodeLike[],
  edges: readonly CanvasGraphEdgeLike[],
  options: boolean | BuildGraphSnapshotOptions = false,
): CanvasGraphSnapshot {
  const includeTempEdges =
    typeof options === "boolean" ? options : (options.includeTempEdges ?? false);
  const nodeDataOverrides = typeof options === "boolean" ? undefined : options.nodeDataOverrides;
  const nodesById = new Map<string, CanvasGraphNodeLike>();
  for (const node of nodes) {
    const nextNode = nodeDataOverrides?.has(node.id)
      ? { ...node, data: nodeDataOverrides.get(node.id) }
      : node;
    nodesById.set(node.id, nextNode);
  }

  const incomingEdgesByTarget = new Map<string, CanvasGraphEdgeLike[]>();
  for (const edge of edges) {
    if (!includeTempEdges && edge.className === "temp") {
      continue;
    }

    const bucket = incomingEdgesByTarget.get(edge.target);
    if (bucket) {
      bucket.push(edge);
    } else {
      incomingEdgesByTarget.set(edge.target, [edge]);
    }
  }

  for (const edgesForTarget of incomingEdgesByTarget.values()) {
    edgesForTarget.sort((left, right) => {
      const sourceCompare = left.source.localeCompare(right.source);
      if (sourceCompare !== 0) return sourceCompare;
      const leftHandle = left.sourceHandle ?? "";
      const rightHandle = right.sourceHandle ?? "";
      const handleCompare = leftHandle.localeCompare(rightHandle);
      if (handleCompare !== 0) return handleCompare;
      return (left.targetHandle ?? "").localeCompare(right.targetHandle ?? "");
    });
  }

  return {
    nodesById,
    incomingEdgesByTarget,
  };
}

function getSortedIncomingEdge(
  incomingEdges: readonly CanvasGraphEdgeLike[] | undefined,
): CanvasGraphEdgeLike | null {
  if (!incomingEdges || incomingEdges.length === 0) {
    return null;
  }

  return incomingEdges[0] ?? null;
}

function walkUpstreamFromGraph(
  graph: CanvasGraphSnapshot,
  nodeId: string,
): { path: CanvasGraphNodeLike[]; selectedEdges: CanvasGraphEdgeLike[] } {
  const path: CanvasGraphNodeLike[] = [];
  const selectedEdges: CanvasGraphEdgeLike[] = [];
  const visiting = new Set<string>();

  const visit = (currentId: string): void => {
    if (visiting.has(currentId)) {
      throw new Error(`Cycle detected in pipeline graph at node '${currentId}'.`);
    }

    visiting.add(currentId);

    const incoming = getSortedIncomingEdge(graph.incomingEdgesByTarget.get(currentId));
    if (incoming) {
      selectedEdges.push(incoming);
      visit(incoming.source);
    }

    visiting.delete(currentId);

    const current = graph.nodesById.get(currentId);
    if (current) {
      path.push(current);
    }
  };

  visit(nodeId);

  return {
    path,
    selectedEdges,
  };
}

export function collectPipelineFromGraph(
  graph: CanvasGraphSnapshot,
  options: {
    nodeId: string;
    isPipelineNode: (node: CanvasGraphNodeLike) => boolean;
  },
): PipelineStep[] {
  const traversal = walkUpstreamFromGraph(graph, options.nodeId);

  const steps: PipelineStep[] = [];
  for (const node of traversal.path) {
    if (!options.isPipelineNode(node)) {
      continue;
    }

    steps.push({
      nodeId: node.id,
      type: node.type,
      params: node.data,
    });
  }

  return steps;
}

export function getSourceImageFromGraph<TSourceImage>(
  graph: CanvasGraphSnapshot,
  options: {
    nodeId: string;
    isSourceNode: (node: CanvasGraphNodeLike) => boolean;
    getSourceImageFromNode: (node: CanvasGraphNodeLike) => TSourceImage | null | undefined;
  },
): TSourceImage | null {
  const traversal = walkUpstreamFromGraph(graph, options.nodeId);

  for (let index = traversal.path.length - 1; index >= 0; index -= 1) {
    const node = traversal.path[index];
    if (!options.isSourceNode(node)) {
      continue;
    }

    const sourceImage = options.getSourceImageFromNode(node);
    if (sourceImage != null) {
      return sourceImage;
    }
  }

  return null;
}

export function findSourceNodeFromGraph(
  graph: CanvasGraphSnapshot,
  options: {
    nodeId: string;
    isSourceNode: (node: CanvasGraphNodeLike) => boolean;
    getSourceImageFromNode: (node: CanvasGraphNodeLike) => unknown;
  },
): CanvasGraphNodeLike | null {
  const traversal = walkUpstreamFromGraph(graph, options.nodeId);

  for (let index = traversal.path.length - 1; index >= 0; index -= 1) {
    const node = traversal.path[index];
    if (!options.isSourceNode(node)) {
      continue;
    }

    if (options.getSourceImageFromNode(node) != null) {
      return node;
    }
  }

  return null;
}

export function resolveRenderPreviewInputFromGraph(args: {
  nodeId: string;
  graph: CanvasGraphSnapshot;
}): RenderPreviewResolvedInput {
  const renderIncoming = getSortedIncomingEdge(
    args.graph.incomingEdgesByTarget.get(args.nodeId),
  );
  const renderInputNode = renderIncoming
    ? args.graph.nodesById.get(renderIncoming.source)
    : null;

  if (renderInputNode?.type === "mixer") {
    const sourceComposition = resolveRenderMixerCompositionFromGraph({
      node: renderInputNode,
      graph: args.graph,
    });

    const steps = collectPipelineFromGraph(args.graph, {
      nodeId: args.nodeId,
      isPipelineNode: (node) => RENDER_PREVIEW_PIPELINE_TYPES.has(node.type ?? ""),
    });

    return {
      sourceUrl: null,
      sourceComposition: sourceComposition ?? undefined,
      steps,
    };
  }

  const sourceUrl = getSourceImageFromGraph(args.graph, {
    nodeId: args.nodeId,
    isSourceNode: (node) => SOURCE_NODE_TYPES.has(node.type ?? ""),
    getSourceImageFromNode: (node) => resolveSourceNodeUrl(node),
  });

  const steps = collectPipelineFromGraph(args.graph, {
    nodeId: args.nodeId,
    isPipelineNode: (node) => RENDER_PREVIEW_PIPELINE_TYPES.has(node.type ?? ""),
  });

  return {
    sourceUrl,
    steps,
  };
}

export function resolveRenderPreviewInput(args: {
  nodeId: string;
  nodes: readonly RenderPreviewGraphNode[];
  edges: readonly RenderPreviewGraphEdge[];
}): RenderPreviewResolvedInput {
  return resolveRenderPreviewInputFromGraph({
    nodeId: args.nodeId,
    graph: buildGraphSnapshot(args.nodes, args.edges),
  });
}
