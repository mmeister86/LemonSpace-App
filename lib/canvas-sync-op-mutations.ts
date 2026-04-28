import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasSyncOp } from "@/lib/canvas-sync-op-types";

export function getCoalescingCanvasSyncNodeId(
  op: Pick<CanvasSyncOp, "type" | "payload">,
): string | null {
  if (op.type !== "moveNode" && op.type !== "resizeNode" && op.type !== "updateData") {
    return null;
  }
  const payload = op.payload as { nodeId?: string };
  return typeof payload.nodeId === "string" && payload.nodeId.length > 0
    ? payload.nodeId
    : null;
}

export function getCanvasSyncOpNodeId(op: CanvasSyncOp): string {
  const payload = op.payload as { nodeId?: string };
  return typeof payload.nodeId === "string" ? payload.nodeId : "";
}

export function remapNodeIdInCanvasSyncOp(
  op: CanvasSyncOp,
  fromNodeId: string,
  toNodeId: string,
): CanvasSyncOp {
  if (op.type === "createNode" && op.payload.parentId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, parentId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "createNodeWithEdgeFromSource") {
    let changed = false;
    const next = { ...op.payload };
    if (next.parentId === fromNodeId) {
      next.parentId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (next.sourceNodeId === fromNodeId) {
      next.sourceNodeId = toNodeId;
      changed = true;
    }
    if (changed) return { ...op, payload: next };
  }
  if (op.type === "createNodeWithEdgeToTarget") {
    let changed = false;
    const next = { ...op.payload };
    if (next.parentId === fromNodeId) {
      next.parentId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (next.targetNodeId === fromNodeId) {
      next.targetNodeId = toNodeId;
      changed = true;
    }
    if (changed) return { ...op, payload: next };
  }
  if (op.type === "createNodeWithEdgeSplit" && op.payload.parentId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, parentId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "splitEdgeAtExistingNode" && op.payload.middleNodeId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, middleNodeId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "moveNode" && op.payload.nodeId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, nodeId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "setNodeParent") {
    let changed = false;
    const next = { ...op.payload };
    if (next.nodeId === fromNodeId) {
      next.nodeId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (next.parentId === fromNodeId) {
      next.parentId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (changed) return { ...op, payload: next };
  }
  if (op.type === "resizeNode" && op.payload.nodeId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, nodeId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "updateData" && op.payload.nodeId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, nodeId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "createEdge") {
    let changed = false;
    const next = { ...op.payload };
    if (next.sourceNodeId === fromNodeId) {
      next.sourceNodeId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (next.targetNodeId === fromNodeId) {
      next.targetNodeId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (changed) return { ...op, payload: next };
  }
  if (op.type === "batchRemoveNodes") {
    if (!op.payload.nodeIds.includes(fromNodeId as Id<"nodes">)) return op;
    return {
      ...op,
      payload: {
        ...op.payload,
        nodeIds: op.payload.nodeIds.map((nodeId) =>
          nodeId === fromNodeId ? (toNodeId as Id<"nodes">) : nodeId,
        ),
      },
    };
  }
  return op;
}

export function canvasSyncOpTouchesNodeId(
  op: CanvasSyncOp,
  nodeIdSet: ReadonlySet<string>,
): boolean {
  if (
    op.type === "moveNode" ||
    op.type === "resizeNode" ||
    op.type === "updateData"
  ) {
    return nodeIdSet.has(op.payload.nodeId);
  }
  if (op.type === "setNodeParent") {
    return (
      nodeIdSet.has(op.payload.nodeId) ||
      (op.payload.parentId !== undefined && nodeIdSet.has(op.payload.parentId))
    );
  }
  if (op.type === "createEdge") {
    return (
      nodeIdSet.has(op.payload.sourceNodeId) || nodeIdSet.has(op.payload.targetNodeId)
    );
  }
  if (op.type === "createNode") {
    return op.payload.parentId !== undefined && nodeIdSet.has(op.payload.parentId);
  }
  if (op.type === "createNodeWithEdgeFromSource") {
    return (
      nodeIdSet.has(op.payload.sourceNodeId) ||
      (op.payload.parentId !== undefined && nodeIdSet.has(op.payload.parentId))
    );
  }
  if (op.type === "createNodeWithEdgeToTarget") {
    return (
      nodeIdSet.has(op.payload.targetNodeId) ||
      (op.payload.parentId !== undefined && nodeIdSet.has(op.payload.parentId))
    );
  }
  if (op.type === "createNodeWithEdgeSplit") {
    return op.payload.parentId !== undefined && nodeIdSet.has(op.payload.parentId);
  }
  if (op.type === "splitEdgeAtExistingNode") {
    return nodeIdSet.has(op.payload.middleNodeId);
  }
  if (op.type === "batchRemoveNodes") {
    return op.payload.nodeIds.some((nodeId) => nodeIdSet.has(nodeId));
  }
  return false;
}

export function canvasSyncOpHasClientRequestId(
  op: CanvasSyncOp,
  clientRequestIdSet: ReadonlySet<string>,
): boolean {
  if (op.type === "createNode") return clientRequestIdSet.has(op.payload.clientRequestId);
  if (op.type === "createNodeWithEdgeFromSource") {
    return clientRequestIdSet.has(op.payload.clientRequestId);
  }
  if (op.type === "createNodeWithEdgeToTarget") {
    return clientRequestIdSet.has(op.payload.clientRequestId);
  }
  if (op.type === "createEdge") return clientRequestIdSet.has(op.payload.clientRequestId);
  if (op.type === "createNodeWithEdgeSplit") {
    return clientRequestIdSet.has(op.payload.clientRequestId);
  }
  if (op.type === "splitEdgeAtExistingNode") {
    return clientRequestIdSet.has(op.payload.clientRequestId);
  }
  return false;
}

export function canvasSyncOpTouchesEdgeId(
  op: CanvasSyncOp,
  edgeIdSet: ReadonlySet<string>,
): boolean {
  if (op.type === "removeEdge") return edgeIdSet.has(op.payload.edgeId);
  if (op.type === "createNodeWithEdgeSplit") return edgeIdSet.has(op.payload.splitEdgeId);
  if (op.type === "splitEdgeAtExistingNode") return edgeIdSet.has(op.payload.splitEdgeId);
  return false;
}
