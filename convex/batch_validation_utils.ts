/**
 * Onboarding note:
 * Convex backend module for batch validation utils. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import type { Id } from "./_generated/dataModel";

type BatchNodeRecord = {
  _id: Id<"nodes">;
  canvasId: Id<"canvases">;
};

type BatchCanvasRecord = {
  _id: Id<"canvases">;
  ownerId: string;
};

type ValidateBatchArgs<N extends BatchNodeRecord> = {
  userId: string;
  nodeIds: Id<"nodes">[];
  getNodeById: (nodeId: Id<"nodes">) => Promise<N | null>;
  getCanvasById: (canvasId: Id<"canvases">) => Promise<BatchCanvasRecord | null>;
};

export async function validateBatchNodesForUserOrThrow<N extends BatchNodeRecord>(
  args: ValidateBatchArgs<N>,
): Promise<{ canvasId: Id<"canvases">; nodes: N[] }> {
  if (args.nodeIds.length === 0) {
    throw new Error("Batch must contain at least one node id");
  }

  const nodes: N[] = [];
  for (const nodeId of args.nodeIds) {
    const node = await args.getNodeById(nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    nodes.push(node);
  }

  const canvasId = nodes[0].canvasId;
  for (const node of nodes) {
    if (node.canvasId !== canvasId) {
      throw new Error("All nodes must belong to the same canvas");
    }
  }

  const canvas = await args.getCanvasById(canvasId);
  if (!canvas || canvas.ownerId !== args.userId) {
    throw new Error("Canvas not found");
  }

  return { canvasId, nodes };
}
