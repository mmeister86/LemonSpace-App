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
  sourceUrl: string;
  steps: PipelineStep[];
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

const SOURCE_NODE_TYPES = new Set(["image", "ai-image", "asset"]);

export const RENDER_PREVIEW_PIPELINE_TYPES = new Set([
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

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
  steps: PipelineStep[];
  data: unknown;
}): string | null {
  if (!args.sourceUrl) {
    return null;
  }

  return hashPipeline(
    { sourceUrl: args.sourceUrl, render: resolveRenderFingerprint(args.data) },
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
}): { sourceUrl: string | null; steps: PipelineStep[] } {
  const sourceUrl = getSourceImageFromGraph(args.graph, {
    nodeId: args.nodeId,
    isSourceNode: (node) => SOURCE_NODE_TYPES.has(node.type ?? ""),
    getSourceImageFromNode: (node) => resolveNodeImageUrl(node.data),
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
}): { sourceUrl: string | null; steps: PipelineStep[] } {
  return resolveRenderPreviewInputFromGraph({
    nodeId: args.nodeId,
    graph: buildGraphSnapshot(args.nodes, args.edges),
  });
}
