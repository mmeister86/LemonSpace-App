import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export async function isNodeDescendantOf(
  ctx: MutationCtx,
  candidateId: Id<"nodes">,
  ancestorId: Id<"nodes">,
): Promise<boolean> {
  if (candidateId === ancestorId) return true;
  let current = await ctx.db.get(candidateId);
  const visited = new Set<Id<"nodes">>();
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (visited.has(current.parentId)) {
      throw new Error("Invalid parent cycle");
    }
    visited.add(current.parentId);
    current = await ctx.db.get(current.parentId);
  }
  return false;
}

export async function assertParentAllowedForNode(
  ctx: MutationCtx,
  args: {
    nodeId: Id<"nodes">;
    canvasId: Id<"canvases">;
    parentId?: Id<"nodes">;
  },
): Promise<void> {
  if (!args.parentId) return;

  if (args.parentId === args.nodeId) {
    throw new Error("Parent cycle is not allowed");
  }

  const parent = await ctx.db.get(args.parentId);
  if (!parent || parent.canvasId !== args.canvasId) {
    throw new Error("Parent not found");
  }
  if (parent.type !== "group" && parent.type !== "frame") {
    throw new Error("Parent must be a group or frame node");
  }
  if (await isNodeDescendantOf(ctx, args.parentId, args.nodeId)) {
    throw new Error("Parent cycle is not allowed");
  }
}

export async function assertSelectedNodesHaveNoSelectedAncestors(
  ctx: MutationCtx,
  args: {
    canvasId: Id<"canvases">;
    selectedNodes: Doc<"nodes">[];
    selectedNodeIds: Id<"nodes">[];
  },
): Promise<void> {
  const selectedNodeIdSet = new Set(args.selectedNodeIds);
  for (const node of args.selectedNodes) {
    let parentId = node.parentId;
    const visited = new Set<Id<"nodes">>();
    while (parentId) {
      if (selectedNodeIdSet.has(parentId)) {
        throw new Error("Selected descendants must be filtered before grouping");
      }
      if (visited.has(parentId)) {
        throw new Error("Invalid parent cycle");
      }
      visited.add(parentId);
      const parent = await ctx.db.get(parentId);
      if (!parent || parent.canvasId !== args.canvasId) {
        throw new Error("Invalid parent chain");
      }
      parentId = parent.parentId;
    }
  }
}
