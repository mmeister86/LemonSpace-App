/**
 * Onboarding note:
 * Convex backend module for authz helpers. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type DbCtx = QueryCtx | MutationCtx;
type NodeCanvasRef = {
  canvasId: string;
};

export async function getOwnedCanvasOrNull(
  ctx: DbCtx,
  canvasId: Id<"canvases">,
  userId: string,
): Promise<Doc<"canvases"> | null> {
  const canvas = await ctx.db.get(canvasId);
  if (!canvas || canvas.ownerId !== userId) {
    return null;
  }
  return canvas;
}

export async function requireOwnedCanvas(
  ctx: DbCtx,
  canvasId: Id<"canvases">,
  userId: string,
): Promise<Doc<"canvases">> {
  const canvas = await getOwnedCanvasOrNull(ctx, canvasId, userId);
  if (!canvas) {
    throw new Error("Canvas not found");
  }
  return canvas;
}

export function assertNodeBelongsToCanvasOrThrow(
  node: NodeCanvasRef,
  canvasId: string,
  message = "Node does not belong to canvas",
): void {
  if (node.canvasId !== canvasId) {
    throw new Error(message);
  }
}

export async function requireNodeOnCanvas(
  ctx: DbCtx,
  nodeId: Id<"nodes">,
  canvasId: Id<"canvases">,
): Promise<Doc<"nodes">> {
  const node = await ctx.db.get(nodeId);
  if (!node) {
    throw new Error("Node not found");
  }
  assertNodeBelongsToCanvasOrThrow(node, canvasId);
  return node;
}
