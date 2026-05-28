/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas flow reconciliation helpers. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  convexEdgeToRF,
  convexEdgeToRFWithSourceGlow,
  convexNodeDocWithMergedStorageUrl,
  convexNodeToRF,
} from "@/lib/canvas-utils";
import { assignDisplayHandlesToRepeatingInputEdges } from "@/lib/canvas-repeating-input-handles";

import {
  applyPinnedNodePositionsReadOnly,
  clientRequestIdFromOptimisticEdgeId,
  clientRequestIdFromOptimisticNodeId,
  isOptimisticEdgeId,
  isOptimisticNodeId,
  mergeNodesPreservingLocalState,
  OPTIMISTIC_NODE_PREFIX,
  positionsMatchPin,
  rfEdgeConnectionSignature,
  withResolvedCompareData,
} from "./canvas-helpers";

type FlowConvexNodeRecord = Pick<Doc<"nodes">, "_id" | "type">;
type FlowConvexEdgeRecord = Pick<
  Doc<"edges">,
  "_id" | "sourceNodeId" | "targetNodeId" | "sourceHandle" | "targetHandle"
>;

export function buildIncomingCanvasFlowNodes(args: {
  convexNodes: Doc<"nodes">[];
  storageUrlsById: Record<string, string | undefined> | undefined;
  previousNodes: RFNode[];
  edges: RFEdge[];
}): RFNode[] {
  const previousDataById = new Map(
    args.previousNodes.map((node) => [node.id, node.data as Record<string, unknown>]),
  );
  const enrichedNodes = args.convexNodes.map((node) =>
    convexNodeDocWithMergedStorageUrl(node, args.storageUrlsById, previousDataById),
  );

  return sortParentNodesBeforeChildren(
    withResolvedCompareData(enrichedNodes.map(convexNodeToRF), args.edges),
  );
}

export function sortParentNodesBeforeChildren(nodes: RFNode[]): RFNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const orderById = new Map(nodes.map((node, index) => [node.id, index]));

  const depthCache = new Map<string, number>();
  const getDepth = (node: RFNode, visiting = new Set<string>()): number => {
    const cached = depthCache.get(node.id);
    if (cached !== undefined) return cached;
    if (!node.parentId || !nodeById.has(node.parentId) || visiting.has(node.id)) {
      depthCache.set(node.id, 0);
      return 0;
    }

    visiting.add(node.id);
    const parent = nodeById.get(node.parentId)!;
    const depth = getDepth(parent, visiting) + 1;
    visiting.delete(node.id);
    depthCache.set(node.id, depth);
    return depth;
  };

  return [...nodes].sort((a, b) => {
    const depthDelta = getDepth(a) - getDepth(b);
    if (depthDelta !== 0) return depthDelta;
    return (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0);
  });
}

function dedupeNodesById(nodes: RFNode[]): RFNode[] {
  const nodeById = new Map<string, RFNode>();

  for (const node of nodes) {
    const existing = nodeById.get(node.id);
    if (!existing) {
      nodeById.set(node.id, node);
      continue;
    }

    const existingData = isNodeDataRecord(existing.data) ? existing.data : {};
    const nodeData = isNodeDataRecord(node.data) ? node.data : {};
    nodeById.set(node.id, {
      ...existing,
      ...node,
      data: {
        ...existingData,
        ...nodeData,
      },
      selected: Boolean(existing.selected || node.selected),
    });
  }

  return Array.from(nodeById.values());
}

export function inferPendingConnectionNodeHandoff(args: {
  previousNodes: RFNode[];
  incomingConvexNodes: FlowConvexNodeRecord[];
  pendingConnectionCreateIds: ReadonlySet<string>;
  resolvedRealIdByClientRequest: ReadonlyMap<string, Id<"nodes">>;
}): Map<string, Id<"nodes">> {
  const nextResolvedRealIdByClientRequest = new Map(args.resolvedRealIdByClientRequest);
  const unresolvedClientRequestIds: string[] = [];

  for (const clientRequestId of args.pendingConnectionCreateIds) {
    if (nextResolvedRealIdByClientRequest.has(clientRequestId)) continue;

    const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}`;
    const optimisticNodePresent = args.previousNodes.some(
      (node) => node.id === optimisticNodeId,
    );
    if (optimisticNodePresent) {
      unresolvedClientRequestIds.push(clientRequestId);
    }
  }

  if (unresolvedClientRequestIds.length !== 1) {
    return nextResolvedRealIdByClientRequest;
  }

  const previousIds = new Set(args.previousNodes.map((node) => node.id));
  const newlyAppearedIncomingRealNodeIds = args.incomingConvexNodes
    .map((node) => node._id as string)
    .filter((id) => !isOptimisticNodeId(id))
    .filter((id) => !previousIds.has(id));

  if (newlyAppearedIncomingRealNodeIds.length !== 1) {
    return nextResolvedRealIdByClientRequest;
  }

  nextResolvedRealIdByClientRequest.set(
    unresolvedClientRequestIds[0]!,
    newlyAppearedIncomingRealNodeIds[0] as Id<"nodes">,
  );
  return nextResolvedRealIdByClientRequest;
}

export function reconcileCanvasFlowEdges(args: {
  previousEdges: RFEdge[];
  convexEdges: FlowConvexEdgeRecord[];
  convexNodes?: FlowConvexNodeRecord[];
  previousConvexNodeIdsSnapshot: ReadonlySet<string>;
  pendingRemovedEdgeIds: ReadonlySet<string>;
  pendingConnectionCreateIds: ReadonlySet<string>;
  resolvedRealIdByClientRequest: ReadonlyMap<string, Id<"nodes">>;
  localNodeIds: ReadonlySet<string>;
  isAnyNodeDragging: boolean;
  colorMode: "light" | "dark";
}): {
  edges: RFEdge[];
  nextConvexNodeIdsSnapshot: Set<string>;
  inferredRealIdByClientRequest: Map<string, Id<"nodes">>;
  settledPendingConnectionCreateIds: string[];
} {
  const currentConvexIdList = args.convexNodes?.map((node) => node._id as string) ?? [];
  const currentConvexIdSet = new Set(currentConvexIdList);
  const newlyAppearedIds = currentConvexIdList.filter(
    (id) => !args.previousConvexNodeIdsSnapshot.has(id),
  );

  const tempEdges = args.previousEdges.filter((edge) => edge.className === "temp");
  const sourceTypeByNodeId = args.convexNodes
    ? new Map(args.convexNodes.map((node) => [node._id as string, node.type as string]))
    : undefined;
  const mapped = args.convexEdges
    .filter((edge) => !args.pendingRemovedEdgeIds.has(edge._id as string))
    .map((edge) =>
      sourceTypeByNodeId
        ? convexEdgeToRFWithSourceGlow(
            edge as Doc<"edges">,
            sourceTypeByNodeId.get(edge.sourceNodeId),
            args.colorMode,
          )
        : convexEdgeToRF(edge as Doc<"edges">),
    );

  const mappedSignatures = new Set(mapped.map(rfEdgeConnectionSignature));
  const convexNodeIds = args.convexNodes
    ? new Set(args.convexNodes.map((node) => node._id as string))
    : null;
  const inferredRealIdByClientRequest = new Map(args.resolvedRealIdByClientRequest);

  const resolveEndpoint = (nodeId: string): string => {
    if (!isOptimisticNodeId(nodeId)) return nodeId;

    const clientRequestId = clientRequestIdFromOptimisticNodeId(nodeId);
    if (!clientRequestId) return nodeId;

    if (args.isAnyNodeDragging && args.localNodeIds.has(nodeId)) {
      return nodeId;
    }

    const realId = inferredRealIdByClientRequest.get(clientRequestId);
    return realId !== undefined ? (realId as string) : nodeId;
  };

  const resolveEndpointWithInference = (nodeId: string, edge: RFEdge): string => {
    const baseNodeId = resolveEndpoint(nodeId);
    if (!isOptimisticNodeId(baseNodeId)) return baseNodeId;
    if (args.isAnyNodeDragging) return baseNodeId;

    const nodeClientRequestId = clientRequestIdFromOptimisticNodeId(baseNodeId);
    if (nodeClientRequestId === null) return baseNodeId;

    const edgeClientRequestId = clientRequestIdFromOptimisticEdgeId(edge.id);
    if (edgeClientRequestId === null || edgeClientRequestId !== nodeClientRequestId) {
      return baseNodeId;
    }

    if (!args.pendingConnectionCreateIds.has(nodeClientRequestId)) {
      return baseNodeId;
    }

    if (newlyAppearedIds.length !== 1) {
      return baseNodeId;
    }

    const inferredRealId = newlyAppearedIds[0] as Id<"nodes">;
    inferredRealIdByClientRequest.set(nodeClientRequestId, inferredRealId);
    return inferredRealId;
  };

  const endpointUsable = (nodeId: string): boolean => {
    if (args.isAnyNodeDragging && args.localNodeIds.has(nodeId)) {
      return true;
    }

    const resolvedNodeId = resolveEndpoint(nodeId);
    return Boolean(convexNodeIds?.has(resolvedNodeId) || convexNodeIds?.has(nodeId));
  };

  const optimisticEndpointHasPendingCreate = (nodeId: string): boolean => {
    if (!isOptimisticNodeId(nodeId)) return false;
    const clientRequestId = clientRequestIdFromOptimisticNodeId(nodeId);
    return clientRequestId !== null && args.pendingConnectionCreateIds.has(clientRequestId);
  };

  const shouldCarryOptimisticEdge = (original: RFEdge, remapped: RFEdge): boolean => {
    if (mappedSignatures.has(rfEdgeConnectionSignature(remapped))) {
      return false;
    }

    const sourceOk = endpointUsable(remapped.source);
    const targetOk = endpointUsable(remapped.target);
    if (sourceOk && targetOk) return true;

    if (!args.pendingConnectionCreateIds.size) {
      return false;
    }

    if (sourceOk && optimisticEndpointHasPendingCreate(original.target)) {
      return true;
    }

    if (targetOk && optimisticEndpointHasPendingCreate(original.source)) {
      return true;
    }

    return false;
  };

  const carriedOptimistic: RFEdge[] = [];
  for (const edge of args.previousEdges) {
    if (edge.className === "temp") continue;
    if (!isOptimisticEdgeId(edge.id)) continue;

    const remappedEdge: RFEdge = {
      ...edge,
      source: resolveEndpointWithInference(edge.source, edge),
      target: resolveEndpointWithInference(edge.target, edge),
    };

    if (!shouldCarryOptimisticEdge(edge, remappedEdge)) continue;
    carriedOptimistic.push(remappedEdge);
  }

  const settledPendingConnectionCreateIds: string[] = [];
  for (const clientRequestId of args.pendingConnectionCreateIds) {
    const realId = inferredRealIdByClientRequest.get(clientRequestId);
    if (realId === undefined) continue;

    const nodePresent = args.convexNodes?.some((node) => node._id === realId) ?? false;
    const edgeTouchesNewNode = args.convexEdges.some(
      (edge) => edge.sourceNodeId === realId || edge.targetNodeId === realId,
    );
    if (nodePresent && edgeTouchesNewNode) {
      settledPendingConnectionCreateIds.push(clientRequestId);
    }
  }

  const reconciledEdges = [...mapped, ...carriedOptimistic, ...tempEdges];

  return {
    edges: sourceTypeByNodeId
      ? assignDisplayHandlesToRepeatingInputEdges(reconciledEdges, sourceTypeByNodeId)
      : reconciledEdges,
    nextConvexNodeIdsSnapshot: args.convexNodes
      ? currentConvexIdSet
      : new Set(args.previousConvexNodeIdsSnapshot),
    inferredRealIdByClientRequest,
    settledPendingConnectionCreateIds,
  };
}

function applyLocalPositionPins(args: {
  nodes: RFNode[];
  pendingLocalPositionPins: ReadonlyMap<string, { x: number; y: number }>;
}): {
  nodes: RFNode[];
  nextPendingLocalPositionPins: Map<string, { x: number; y: number }>;
} {
  const nextPendingLocalPositionPins = new Map(args.pendingLocalPositionPins);
  const nodes = args.nodes.map((node) => {
    const pin = nextPendingLocalPositionPins.get(node.id);
    if (!pin) return node;

    if (positionsMatchPin(node.position, pin)) {
      nextPendingLocalPositionPins.delete(node.id);
      return node;
    }

    return {
      ...node,
      position: { x: pin.x, y: pin.y },
    };
  });

  return {
    nodes,
    nextPendingLocalPositionPins,
  };
}

function isNodeDataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CLIENT_RUNTIME_NODE_DATA_KEYS = new Set([
  "canvasId",
  "_status",
  "_statusMessage",
  "_groupDropTarget",
  "_uploadState",
  "_executionStepIndex",
  "_executionStepTotal",
  "retryCount",
]);

function clonePinnedPersistentNodeData(pin: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(pin)) {
    if (!CLIENT_RUNTIME_NODE_DATA_KEYS.has(key)) {
      next[key] = value;
    }
  }
  return next;
}

function preserveIncomingRuntimeNodeData(
  incoming: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  for (const key of CLIENT_RUNTIME_NODE_DATA_KEYS) {
    if (next[key] === undefined && incoming[key] !== undefined) {
      next[key] = incoming[key];
    }
  }

  const incomingLooksLikeGeneratedOutput =
    incoming._status === "done" ||
    typeof incoming.generatedAt === "number" ||
    typeof incoming.storageId === "string";
  if (incomingLooksLikeGeneratedOutput) {
    for (const key of [
      "storageId",
      "previewUrl",
      "lastUploadStorageId",
      "lastUploadUrl",
      "imageUrl",
      "generatedAt",
      "creditCost",
      "modelLabel",
      "modelTier",
      "outputWidth",
      "outputHeight",
      "referenceImages",
    ]) {
      if (next[key] === undefined && incoming[key] !== undefined) {
        next[key] = incoming[key];
      }
    }
  }

  if (
    next.url === undefined &&
    typeof incoming.url === "string" &&
    typeof incoming.storageId === "string" &&
    next.storageId === incoming.storageId
  ) {
    next.url = incoming.url;
  }

  if (
    next.lastUploadUrl === undefined &&
    typeof incoming.lastUploadUrl === "string" &&
    typeof incoming.lastUploadStorageId === "string" &&
    next.lastUploadStorageId === incoming.lastUploadStorageId
  ) {
    next.lastUploadUrl = incoming.lastUploadUrl;
  }
}

function replaceNodeDataWithPin(incoming: unknown, pin: unknown): unknown {
  if (!isNodeDataRecord(pin)) {
    return pin;
  }

  const incomingRecord = isNodeDataRecord(incoming) ? incoming : {};
  const next = clonePinnedPersistentNodeData(pin);
  preserveIncomingRuntimeNodeData(incomingRecord, next);
  return next;
}

function nodeDataEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    return (
      left.length === right.length &&
      left.every((entry, index) => nodeDataEqual(entry, right[index]))
    );
  }

  if (isNodeDataRecord(left) || isNodeDataRecord(right)) {
    if (!isNodeDataRecord(left) || !isNodeDataRecord(right)) {
      return false;
    }

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every(
      (key) => Object.hasOwn(right, key) && nodeDataEqual(left[key], right[key]),
    );
  }

  return false;
}

function nodeDataMatchesPin(incoming: unknown, pin: unknown): boolean {
  return nodeDataEqual(incoming, replaceNodeDataWithPin(incoming, pin));
}

function applyLocalNodeDataPins(args: {
  nodes: RFNode[];
  pendingLocalNodeDataPins: ReadonlyMap<string, unknown>;
}): {
  nodes: RFNode[];
  nextPendingLocalNodeDataPins: Map<string, unknown>;
} {
  const nodeIds = new Set(args.nodes.map((node) => node.id));
  const nextPendingLocalNodeDataPins = new Map(
    [...args.pendingLocalNodeDataPins].filter(([nodeId]) => nodeIds.has(nodeId)),
  );
  const nodes = args.nodes.map((node) => {
    const pin = nextPendingLocalNodeDataPins.get(node.id);
    if (pin === undefined) return node;

    if (nodeDataMatchesPin(node.data, pin)) {
      nextPendingLocalNodeDataPins.delete(node.id);
      return node;
    }

    return {
      ...node,
      data: replaceNodeDataWithPin(node.data, pin) as Record<string, unknown>,
    };
  });

  return {
    nodes,
    nextPendingLocalNodeDataPins,
  };
}

function nodeStyleIncludesSizePin(
  style: RFNode["style"] | undefined,
  pin: { width: number; height: number },
): boolean {
  return style?.width === pin.width && style?.height === pin.height;
}

function applyLocalNodeSizePins(args: {
  nodes: RFNode[];
  pendingLocalNodeSizePins: ReadonlyMap<string, { width: number; height: number }>;
}): {
  nodes: RFNode[];
  nextPendingLocalNodeSizePins: Map<string, { width: number; height: number }>;
} {
  const nodeIds = new Set(args.nodes.map((node) => node.id));
  const nextPendingLocalNodeSizePins = new Map(
    [...args.pendingLocalNodeSizePins].filter(([nodeId]) => nodeIds.has(nodeId)),
  );
  const nodes = args.nodes.map((node) => {
    const pin = nextPendingLocalNodeSizePins.get(node.id);
    if (!pin) return node;

    if (nodeStyleIncludesSizePin(node.style, pin)) {
      nextPendingLocalNodeSizePins.delete(node.id);
      return node;
    }

    return {
      ...node,
      style: {
        ...(node.style ?? {}),
        width: pin.width,
        height: pin.height,
      },
    };
  });

  return {
    nodes,
    nextPendingLocalNodeSizePins,
  };
}

function applyLocalNodeParentPins(args: {
  nodes: RFNode[];
  pendingLocalNodeParentPins: ReadonlyMap<string, { parentId?: string; x: number; y: number }>;
}): {
  nodes: RFNode[];
  nextPendingLocalNodeParentPins: Map<string, { parentId?: string; x: number; y: number }>;
} {
  const nodeIds = new Set(args.nodes.map((node) => node.id));
  const nextPendingLocalNodeParentPins = new Map(
    [...args.pendingLocalNodeParentPins].filter(([nodeId]) => nodeIds.has(nodeId)),
  );
  const nodes = args.nodes.map((node) => {
    const pin = nextPendingLocalNodeParentPins.get(node.id);
    if (!pin) return node;

    const parentMatches = node.parentId === pin.parentId;
    const positionMatches = positionsMatchPin(node.position, {
      x: pin.x,
      y: pin.y,
    });
    if (parentMatches && positionMatches) {
      nextPendingLocalNodeParentPins.delete(node.id);
      return node;
    }

    return {
      ...node,
      parentId: pin.parentId,
      position: { x: pin.x, y: pin.y },
    };
  });

  return {
    nodes: sortParentNodesBeforeChildren(nodes),
    nextPendingLocalNodeParentPins,
  };
}

export function reconcileCanvasFlowNodes(args: {
  previousNodes: RFNode[];
  incomingNodes: RFNode[];
  convexNodes: FlowConvexNodeRecord[];
  deletingNodeIds: ReadonlySet<string>;
  resolvedRealIdByClientRequest: ReadonlyMap<string, Id<"nodes">>;
  pendingConnectionCreateIds: ReadonlySet<string>;
  preferLocalPositionNodeIds: ReadonlySet<string>;
  pendingLocalPositionPins: ReadonlyMap<string, { x: number; y: number }>;
  pendingLocalNodeDataPins?: ReadonlyMap<string, unknown>;
  pendingLocalNodeSizePins?: ReadonlyMap<string, { width: number; height: number }>;
  pendingLocalNodeParentPins?: ReadonlyMap<string, { parentId?: string; x: number; y: number }>;
  pendingMovePins: ReadonlyMap<string, { x: number; y: number }>;
}): {
  nodes: RFNode[];
  inferredRealIdByClientRequest: Map<string, Id<"nodes">>;
  nextPendingLocalPositionPins: Map<string, { x: number; y: number }>;
  nextPendingLocalNodeDataPins: Map<string, unknown>;
  nextPendingLocalNodeSizePins: Map<string, { width: number; height: number }>;
  nextPendingLocalNodeParentPins: Map<string, { parentId?: string; x: number; y: number }>;
  clearedPreferLocalPositionNodeIds: string[];
} {
  const inferredRealIdByClientRequest = inferPendingConnectionNodeHandoff({
    previousNodes: args.previousNodes,
    incomingConvexNodes: args.convexNodes,
    pendingConnectionCreateIds: args.pendingConnectionCreateIds,
    resolvedRealIdByClientRequest: args.resolvedRealIdByClientRequest,
  });

  const filteredIncomingNodes = args.deletingNodeIds.size
    ? args.incomingNodes.filter((node) => !args.deletingNodeIds.has(node.id))
    : args.incomingNodes;
  const mergedNodes = mergeNodesPreservingLocalState(
    args.previousNodes,
    filteredIncomingNodes,
    inferredRealIdByClientRequest,
    args.preferLocalPositionNodeIds,
  );
  const dataPinnedNodes = applyLocalNodeDataPins({
    nodes: mergedNodes,
    pendingLocalNodeDataPins: args.pendingLocalNodeDataPins ?? new Map(),
  });
  const sizePinnedNodes = applyLocalNodeSizePins({
    nodes: dataPinnedNodes.nodes,
    pendingLocalNodeSizePins: args.pendingLocalNodeSizePins ?? new Map(),
  });
  const parentPinnedNodes = applyLocalNodeParentPins({
    nodes: sizePinnedNodes.nodes,
    pendingLocalNodeParentPins: args.pendingLocalNodeParentPins ?? new Map(),
  });
  const pinnedNodes = applyLocalPositionPins({
    nodes: parentPinnedNodes.nodes,
    pendingLocalPositionPins: args.pendingLocalPositionPins,
  });
  const nodes = sortParentNodesBeforeChildren(
    dedupeNodesById(
      applyPinnedNodePositionsReadOnly(pinnedNodes.nodes, args.pendingMovePins),
    ),
  );

  const incomingById = new Map(filteredIncomingNodes.map((node) => [node.id, node]));
  const clearedPreferLocalPositionNodeIds: string[] = [];
  for (const node of nodes) {
    if (!args.preferLocalPositionNodeIds.has(node.id)) continue;

    const incomingNode = incomingById.get(node.id);
    if (!incomingNode) continue;

    if (positionsMatchPin(node.position, incomingNode.position)) {
      clearedPreferLocalPositionNodeIds.push(node.id);
    }
  }

  return {
    nodes,
    inferredRealIdByClientRequest,
    nextPendingLocalPositionPins: pinnedNodes.nextPendingLocalPositionPins,
    nextPendingLocalNodeDataPins: dataPinnedNodes.nextPendingLocalNodeDataPins,
    nextPendingLocalNodeSizePins: sizePinnedNodes.nextPendingLocalNodeSizePins,
    nextPendingLocalNodeParentPins:
      parentPinnedNodes.nextPendingLocalNodeParentPins,
    clearedPreferLocalPositionNodeIds,
  };
}
