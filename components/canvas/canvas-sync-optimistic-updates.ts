/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas sync optimistic updates. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import {
  OPTIMISTIC_EDGE_PREFIX,
  OPTIMISTIC_NODE_PREFIX,
} from "./canvas-helpers";

function randomOptimisticSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function optimisticNodeIdForClientRequest(clientRequestId: string): string {
  return `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}`;
}

export function optimisticEdgeIdForClientRequest(clientRequestId: string): string {
  return `${OPTIMISTIC_EDGE_PREFIX}${clientRequestId}`;
}

export function createOptimisticNodeId(clientRequestId?: string): string {
  return clientRequestId
    ? optimisticNodeIdForClientRequest(clientRequestId)
    : `${OPTIMISTIC_NODE_PREFIX}${randomOptimisticSuffix()}`;
}

export function createOptimisticEdgeId(clientRequestId?: string): string {
  return clientRequestId
    ? optimisticEdgeIdForClientRequest(clientRequestId)
    : `${OPTIMISTIC_EDGE_PREFIX}${randomOptimisticSuffix()}`;
}

export function remapOptimisticNodeReferences<TNode extends { id: string; parentId?: string }>(
  nodes: TNode[],
  optimisticNodeId: string,
  realNodeId: string,
): TNode[] {
  return nodes.map((node) => {
    const nextParentId =
      node.parentId === optimisticNodeId ? realNodeId : node.parentId;
    if (node.id !== optimisticNodeId && nextParentId === node.parentId) {
      return node;
    }
    return {
      ...node,
      id: node.id === optimisticNodeId ? realNodeId : node.id,
      parentId: nextParentId,
    };
  });
}

export function remapOptimisticEdgeNodeReferences<
  TEdge extends { source: string; target: string },
>(edges: TEdge[], optimisticNodeId: string, realNodeId: string): TEdge[] {
  return edges.map((edge) => {
    const nextSource = edge.source === optimisticNodeId ? realNodeId : edge.source;
    const nextTarget = edge.target === optimisticNodeId ? realNodeId : edge.target;
    if (nextSource === edge.source && nextTarget === edge.target) {
      return edge;
    }
    return {
      ...edge,
      source: nextSource,
      target: nextTarget,
    };
  });
}

export function remapOptimisticEdgeId<TEdge extends { id: string }>(
  edges: TEdge[],
  optimisticEdgeId: string,
  realEdgeId: string,
): TEdge[] {
  return edges.map((edge) =>
    edge.id === optimisticEdgeId
      ? {
          ...edge,
          id: realEdgeId,
        }
      : edge,
  );
}
