import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  convexEdgeToRF,
  convexEdgeToRFWithSourceGlow,
  convexNodeDocWithMergedStorageUrl,
  convexNodeToRF,
} from "@/lib/canvas-utils";

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

  return withResolvedCompareData(enrichedNodes.map(convexNodeToRF), args.edges);
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

  return {
    edges: [...mapped, ...carriedOptimistic, ...tempEdges],
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

function nodeDataIncludesPin(incoming: unknown, pin: unknown): boolean {
  if (Array.isArray(pin)) {
    return (
      Array.isArray(incoming) &&
      incoming.length === pin.length &&
      pin.every((pinEntry, index) => nodeDataIncludesPin(incoming[index], pinEntry))
    );
  }

  if (isNodeDataRecord(pin)) {
    if (!isNodeDataRecord(incoming)) {
      return false;
    }

    return Object.keys(pin).every((key) =>
      nodeDataIncludesPin(incoming[key], pin[key]),
    );
  }

  return Object.is(incoming, pin);
}

function mergeNodeDataWithPin(incoming: unknown, pin: unknown): unknown {
  if (Array.isArray(pin)) {
    return pin;
  }

  if (isNodeDataRecord(pin)) {
    const base = isNodeDataRecord(incoming) ? incoming : {};
    const next: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(pin)) {
      next[key] = mergeNodeDataWithPin(base[key], value);
    }

    return next;
  }

  return pin;
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

    if (nodeDataIncludesPin(node.data, pin)) {
      nextPendingLocalNodeDataPins.delete(node.id);
      return node;
    }

    return {
      ...node,
      data: mergeNodeDataWithPin(node.data, pin) as Record<string, unknown>,
    };
  });

  return {
    nodes,
    nextPendingLocalNodeDataPins,
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
  pendingMovePins: ReadonlyMap<string, { x: number; y: number }>;
}): {
  nodes: RFNode[];
  inferredRealIdByClientRequest: Map<string, Id<"nodes">>;
  nextPendingLocalPositionPins: Map<string, { x: number; y: number }>;
  nextPendingLocalNodeDataPins: Map<string, unknown>;
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
  const pinnedNodes = applyLocalPositionPins({
    nodes: dataPinnedNodes.nodes,
    pendingLocalPositionPins: args.pendingLocalPositionPins,
  });
  const nodes = applyPinnedNodePositionsReadOnly(
    pinnedNodes.nodes,
    args.pendingMovePins,
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
    clearedPreferLocalPositionNodeIds,
  };
}
