/**
 * Onboarding note:
 * Image pipeline utility for contracts. Keep CPU/WebGL/worker behavior deterministic so preview and render tests can assert parity.
 */

export type PipelineStep<TNodeType extends string = string, TData = unknown> = {
  nodeId: string;
  type: TNodeType;
  params: TData;
};

type IdLike = string | number;

export type PipelineNodeLike<
  TNodeType extends string = string,
  TData = unknown,
  TId extends IdLike = string,
> = {
  id: TId;
  type: TNodeType;
  data?: TData;
};

export type PipelineEdgeLike<TId extends IdLike = string> = {
  source: TId;
  target: TId;
};

type UpstreamTraversalOptions<
  TNode extends PipelineNodeLike,
  TEdge extends PipelineEdgeLike,
> = {
  nodeId: TNode["id"];
  nodes: readonly TNode[];
  edges: readonly TEdge[];
  getNodeId?: (node: TNode) => TNode["id"];
  getNodeType?: (node: TNode) => TNode["type"];
  getNodeData?: (node: TNode) => TNode["data"];
  getEdgeSource?: (edge: TEdge) => TNode["id"];
  getEdgeTarget?: (edge: TEdge) => TNode["id"];
};

type UpstreamWalkResult<TNode extends PipelineNodeLike, TEdge extends PipelineEdgeLike> = {
  path: TNode[];
  selectedEdges: TEdge[];
};

function toComparableId(value: IdLike): string {
  return String(value);
}

function selectIncomingEdge<TNode extends PipelineNodeLike, TEdge extends PipelineEdgeLike>(
  incomingEdges: readonly TEdge[],
  getEdgeSource: (edge: TEdge) => TNode["id"],
): TEdge | null {
  if (incomingEdges.length === 0) {
    return null;
  }

  const sortedIncoming = [...incomingEdges].sort((left, right) =>
    toComparableId(getEdgeSource(left)).localeCompare(toComparableId(getEdgeSource(right))),
  );

  return sortedIncoming[0] ?? null;
}

function walkUpstream<TNode extends PipelineNodeLike, TEdge extends PipelineEdgeLike>(
  options: UpstreamTraversalOptions<TNode, TEdge>,
): UpstreamWalkResult<TNode, TEdge> {
  const getNodeId = options.getNodeId ?? ((node: TNode) => node.id);
  const getEdgeSource = options.getEdgeSource ?? ((edge: TEdge) => edge.source as TNode["id"]);
  const getEdgeTarget = options.getEdgeTarget ?? ((edge: TEdge) => edge.target as TNode["id"]);

  const byId = new Map<string, TNode>();
  for (const node of options.nodes) {
    byId.set(toComparableId(getNodeId(node)), node);
  }

  const incomingByTarget = new Map<string, TEdge[]>();
  for (const edge of options.edges) {
    const key = toComparableId(getEdgeTarget(edge));
    const existing = incomingByTarget.get(key);
    if (existing) {
      existing.push(edge);
    } else {
      incomingByTarget.set(key, [edge]);
    }
  }

  const path: TNode[] = [];
  const selectedEdges: TEdge[] = [];
  const visiting = new Set<string>();

  const visit = (currentId: TNode["id"]): void => {
    const key = toComparableId(currentId);
    if (visiting.has(key)) {
      throw new Error(`Cycle detected in pipeline graph at node '${key}'.`);
    }

    visiting.add(key);

    const incomingEdges = incomingByTarget.get(key) ?? [];
    const incoming = selectIncomingEdge(incomingEdges, getEdgeSource);
    if (incoming) {
      selectedEdges.push(incoming);
      visit(getEdgeSource(incoming));
    }

    visiting.delete(key);

    const current = byId.get(key);
    if (current) {
      path.push(current);
    }
  };

  visit(options.nodeId);

  return {
    path,
    selectedEdges,
  };
}

export function collectPipeline<
  TNode extends PipelineNodeLike,
  TEdge extends PipelineEdgeLike,
>(
  options: UpstreamTraversalOptions<TNode, TEdge> & {
    isPipelineNode: (node: TNode) => boolean;
  },
): PipelineStep<TNode["type"], TNode["data"]>[] {
  const getNodeId = options.getNodeId ?? ((node: TNode) => node.id);
  const getNodeType = options.getNodeType ?? ((node: TNode) => node.type);
  const getNodeData = options.getNodeData ?? ((node: TNode) => node.data);

  const traversal = walkUpstream(options);

  const steps: PipelineStep<TNode["type"], TNode["data"]>[] = [];
  for (const node of traversal.path) {
    if (!options.isPipelineNode(node)) {
      continue;
    }

    steps.push({
      nodeId: toComparableId(getNodeId(node)),
      type: getNodeType(node),
      params: getNodeData(node),
    });
  }

  return steps;
}

export function getSourceImage<
  TNode extends PipelineNodeLike,
  TEdge extends PipelineEdgeLike,
  TSourceImage,
>(
  options: UpstreamTraversalOptions<TNode, TEdge> & {
    isSourceNode: (node: TNode) => boolean;
    getSourceImageFromNode: (node: TNode) => TSourceImage | null | undefined;
  },
): TSourceImage | null {
  const traversal = walkUpstream(options);

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

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  const valueType = typeof value;
  if (valueType === "number" || valueType === "boolean") {
    return JSON.stringify(value);
  }

  if (valueType === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (valueType === "object") {
    const record = value as Record<string, unknown>;
    const sortedEntries = Object.entries(record).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    const serialized = sortedEntries
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(",");
    return `{${serialized}}`;
  }

  return JSON.stringify(String(value));
}

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashPipeline(
  sourceImage: unknown,
  steps: readonly PipelineStep[],
): string {
  return fnv1aHash(
    stableStringify({
      sourceImage,
      steps,
    }),
  );
}
