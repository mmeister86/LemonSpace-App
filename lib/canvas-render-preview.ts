/**
 * Onboarding note:
 * Builds preview pipelines from Canvas graph structure so render and crop nodes can share traversal logic.
 */

import {
  hashPipeline,
  type PipelineStep,
} from "@/lib/image-pipeline/contracts";
import {
  editorJsDataToPlainText,
  normalizeTextNodeRichText,
  toPersistedEditorJsRichText,
  type EditorJsRichTextData,
} from "@/lib/canvas-rich-text";
import {
  MIXER_SOURCE_NODE_TYPES,
  normalizeMixerCompositionData,
  type MixerBlendMode,
} from "@/lib/canvas-mixer-normalization";
import { readNodeBypassed } from "@/lib/canvas-node-favorite";

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

export type MixerImageLayerSource = {
  kind: "image";
  url: string;
};

export type MixerTextLayerSource = {
  kind: "text";
  content: string;
  richText: EditorJsRichTextData;
  width: number;
  height: number;
};

export type MixerLayerSource = MixerImageLayerSource | MixerTextLayerSource;

export type RenderPreviewSourceComposition = {
  kind: "mixer";
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
};

export type CanvasGraphNodeLike = {
  id: string;
  type: string;
  data?: unknown;
  width?: number | null;
  height?: number | null;
  measured?: {
    width?: number | null;
    height?: number | null;
  } | null;
  style?: {
    width?: number | string | null;
    height?: number | string | null;
  } | null;
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
  "change-camera",
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

const DEFAULT_TEXT_SOURCE_WIDTH = 256;
const DEFAULT_TEXT_SOURCE_HEIGHT = 120;

function resolvePositiveDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function resolveNodeDimension(
  node: CanvasGraphNodeLike,
  key: "width" | "height",
  fallback: number,
): number {
  return (
    resolvePositiveDimension(node[key]) ??
    resolvePositiveDimension(node.measured?.[key]) ??
    resolvePositiveDimension(node.style?.[key]) ??
    fallback
  );
}

export function resolveTextLayerSource(node: CanvasGraphNodeLike): MixerTextLayerSource {
  const data = (node.data ?? {}) as { content?: string; richText?: unknown };
  const normalizedRichText = normalizeTextNodeRichText(data);
  const richText = toPersistedEditorJsRichText(normalizedRichText);
  const content =
    typeof data.content === "string" && data.content.length > 0
      ? data.content
      : editorJsDataToPlainText(normalizedRichText);

  return {
    kind: "text",
    content,
    richText,
    width: resolveNodeDimension(node, "width", DEFAULT_TEXT_SOURCE_WIDTH),
    height: resolveNodeDimension(node, "height", DEFAULT_TEXT_SOURCE_HEIGHT),
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
  if (readNodeBypassed(node.data)) {
    return null;
  }

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
  if (readNodeBypassed(node.data)) {
    return null;
  }

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

function resolveMixerLayerSourceFromNode(args: {
  node: CanvasGraphNodeLike;
  graph: CanvasGraphSnapshot;
}): MixerLayerSource | null {
  if (readNodeBypassed(args.node.data)) {
    return null;
  }

  if (!MIXER_SOURCE_NODE_TYPES.has(args.node.type)) {
    return null;
  }

  if (args.node.type === "text") {
    return resolveTextLayerSource(args.node);
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
      return { kind: "image", url: preview.sourceUrl };
    }

    const directRenderUrl = resolveRenderOutputUrl(args.node);
    if (directRenderUrl) {
      return { kind: "image", url: directRenderUrl };
    }

    return null;
  }

  const url = resolveNodeImageUrl(args.node.data);
  return url ? { kind: "image", url } : null;
}

function resolveMixerLayerSourceFromEdge(args: {
  edge: CanvasGraphEdgeLike | null;
  graph: CanvasGraphSnapshot;
}): MixerLayerSource | null {
  if (!args.edge) {
    return null;
  }

  const sourceNode = args.graph.nodesById.get(args.edge.source);
  if (!sourceNode) {
    return null;
  }

  return resolveMixerLayerSourceFromNode({
    node: sourceNode,
    graph: args.graph,
  });
}

function resolveRenderMixerCompositionFromGraph(args: {
  node: CanvasGraphNodeLike;
  graph: CanvasGraphSnapshot;
}): RenderPreviewSourceComposition | null {
  if (readNodeBypassed(args.node.data)) {
    return null;
  }

  const incomingEdges = args.graph.incomingEdgesByTarget.get(args.node.id) ?? [];
  const baseEdge = resolveMixerHandleEdge({ incomingEdges, handle: "base" });
  const overlayEdge = resolveMixerHandleEdge({ incomingEdges, handle: "overlay" });
  const baseSource = resolveMixerLayerSourceFromEdge({ edge: baseEdge, graph: args.graph });
  const overlaySource = resolveMixerLayerSourceFromEdge({ edge: overlayEdge, graph: args.graph });

  if (!baseSource || !overlaySource) {
    return null;
  }

  const normalized = normalizeMixerCompositionData(args.node.data);

  return {
    kind: "mixer",
    ...(baseSource.kind === "image" ? { baseUrl: baseSource.url } : { baseSource }),
    ...(overlaySource.kind === "image"
      ? { overlayUrl: overlaySource.url }
      : { overlaySource }),
    ...normalized,
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
    if (readNodeBypassed(node.data)) {
      continue;
    }

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
    if (readNodeBypassed(node.data)) {
      continue;
    }

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
    if (readNodeBypassed(node.data)) {
      continue;
    }

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
  const targetNode = args.graph.nodesById.get(args.nodeId);
  if (targetNode && readNodeBypassed(targetNode.data)) {
    return {
      sourceUrl: null,
      steps: [],
    };
  }

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
