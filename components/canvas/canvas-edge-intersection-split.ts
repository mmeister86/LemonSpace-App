/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas edge intersection split. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import { NODE_HANDLE_MAP } from "@/lib/canvas-utils";
import {
  clientRequestIdFromOptimisticNodeId,
  hasHandleKey,
  isOptimisticEdgeId,
  normalizeHandle,
} from "./canvas-helpers";

export type PendingEdgeSplit = {
  intersectedEdgeId: Id<"edges">;
  sourceNodeId: Id<"nodes">;
  targetNodeId: Id<"nodes">;
  intersectedSourceHandle?: string;
  intersectedTargetHandle?: string;
  middleSourceHandle?: string;
  middleTargetHandle?: string;
  positionX: number;
  positionY: number;
};

export type SplitHandles = {
  source?: string;
  target?: string;
};

export function getEffectiveSplitMiddleNode(
  node: RFNode,
  resolvedRealIdByClientRequest: ReadonlyMap<string, Id<"nodes"> | string>,
): RFNode {
  const clientRequestId = clientRequestIdFromOptimisticNodeId(node.id);
  if (!clientRequestId) {
    return node;
  }

  const resolvedRealId = resolvedRealIdByClientRequest.get(clientRequestId);
  if (!resolvedRealId) {
    return node;
  }

  return {
    ...node,
    id: resolvedRealId,
  };
}

export function getSplitHandlesForNode(node: RFNode): SplitHandles | null {
  const handles = NODE_HANDLE_MAP[node.type ?? ""];
  if (!handles) return null;
  if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
    return null;
  }
  return handles;
}

export function getSplitCandidateEdge(
  edgeId: string | null | undefined,
  edges: RFEdge[],
): RFEdge | undefined {
  if (!edgeId) return undefined;
  return edges.find(
    (edge) =>
      edge.id === edgeId &&
      edge.className !== "temp" &&
      !isOptimisticEdgeId(edge.id),
  );
}

export function edgeTouchesNode(edge: RFEdge, nodeId: string): boolean {
  return edge.source === nodeId || edge.target === nodeId;
}

export function buildPendingEdgeSplit(args: {
  intersectedEdge: RFEdge;
  splitHandles: SplitHandles;
  position: { x: number; y: number };
}): PendingEdgeSplit {
  const { intersectedEdge, splitHandles, position } = args;
  return {
    intersectedEdgeId: intersectedEdge.id as Id<"edges">,
    sourceNodeId: intersectedEdge.source as Id<"nodes">,
    targetNodeId: intersectedEdge.target as Id<"nodes">,
    intersectedSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
    intersectedTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
    middleSourceHandle: normalizeHandle(splitHandles.source),
    middleTargetHandle: normalizeHandle(splitHandles.target),
    positionX: position.x,
    positionY: position.y,
  };
}

export function buildSplitEdgeAtExistingNodeArgs(args: {
  canvasId: Id<"canvases">;
  intersectedEdge: RFEdge;
  middleNodeId: Id<"nodes">;
  splitHandles: SplitHandles;
  position?: { x: number; y: number };
}) {
  const { canvasId, intersectedEdge, middleNodeId, splitHandles, position } = args;
  return {
    canvasId,
    splitEdgeId: intersectedEdge.id as Id<"edges">,
    middleNodeId,
    splitSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
    splitTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
    newNodeSourceHandle: normalizeHandle(splitHandles.source),
    newNodeTargetHandle: normalizeHandle(splitHandles.target),
    ...(position ? { positionX: position.x, positionY: position.y } : {}),
  };
}
