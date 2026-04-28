import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function deleteConnectedEdges(
  ctx: MutationCtx,
  nodeId: Id<"nodes">,
): Promise<void> {
  const sourceEdges = await ctx.db
    .query("edges")
    .withIndex("by_source", (q) => q.eq("sourceNodeId", nodeId))
    .collect();
  for (const edge of sourceEdges) {
    await ctx.db.delete(edge._id);
  }

  const targetEdges = await ctx.db
    .query("edges")
    .withIndex("by_target", (q) => q.eq("targetNodeId", nodeId))
    .collect();
  for (const edge of targetEdges) {
    await ctx.db.delete(edge._id);
  }
}

export async function detachChildrenFromParent(
  ctx: MutationCtx,
  parentId: Id<"nodes">,
): Promise<void> {
  const children = await ctx.db
    .query("nodes")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .collect();
  for (const child of children) {
    await ctx.db.patch(child._id, { parentId: undefined });
  }
}

export async function deleteNodeWithCleanup(
  ctx: MutationCtx,
  args: {
    nodeId: Id<"nodes">;
    canvasId?: Id<"canvases">;
    patchCanvasUpdatedAt?: boolean;
  },
): Promise<void> {
  await deleteConnectedEdges(ctx, args.nodeId);
  await detachChildrenFromParent(ctx, args.nodeId);
  await ctx.db.delete(args.nodeId);

  if (args.canvasId && args.patchCanvasUpdatedAt !== false) {
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
  }
}

export async function deleteGroupNodeWithEdges(
  ctx: MutationCtx,
  groupNodeId: Id<"nodes">,
): Promise<void> {
  await deleteConnectedEdges(ctx, groupNodeId);
  await ctx.db.delete(groupNodeId);
}
