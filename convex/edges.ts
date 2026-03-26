import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

// ============================================================================
// Queries
// ============================================================================

/**
 * Alle Edges eines Canvas laden.
 */
export const list = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const user = await requireAuth(ctx);
    const canvas = await ctx.db.get(canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      return [];
    }

    return await ctx.db
      .query("edges")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Neue Edge (Verbindung) zwischen zwei Nodes erstellen.
 */
export const create = mutation({
  args: {
    canvasId: v.id("canvases"),
    sourceNodeId: v.id("nodes"),
    targetNodeId: v.id("nodes"),
    sourceHandle: v.optional(v.string()),
    targetHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const canvas = await ctx.db.get(args.canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      throw new Error("Canvas not found");
    }

    // Prüfen ob beide Nodes existieren und zum gleichen Canvas gehören
    const source = await ctx.db.get(args.sourceNodeId);
    const target = await ctx.db.get(args.targetNodeId);
    if (!source || !target) {
      throw new Error("Source or target node not found");
    }
    if (source.canvasId !== args.canvasId || target.canvasId !== args.canvasId) {
      throw new Error("Nodes must belong to the same canvas");
    }

    // Keine Self-Loops
    if (args.sourceNodeId === args.targetNodeId) {
      throw new Error("Cannot connect a node to itself");
    }

    const edgeId = await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    });

    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
    return edgeId;
  },
});

/**
 * Edge löschen.
 */
export const remove = mutation({
  args: { edgeId: v.id("edges") },
  handler: async (ctx, { edgeId }) => {
    const user = await requireAuth(ctx);
    console.info("[edges.remove] request", {
      edgeId,
      userId: user.userId,
    });

    const edge = await ctx.db.get(edgeId);
    if (!edge) {
      console.info("[edges.remove] edge already removed (idempotent no-op)", {
        edgeId,
        userId: user.userId,
      });
      return;
    }

    const canvas = await ctx.db.get(edge.canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      console.warn("[edges.remove] unauthorized canvas access", {
        edgeId,
        canvasId: edge.canvasId,
        userId: user.userId,
        hasCanvas: Boolean(canvas),
      });
      throw new Error("Canvas not found");
    }

    await ctx.db.delete(edgeId);
    await ctx.db.patch(edge.canvasId, { updatedAt: Date.now() });

    console.info("[edges.remove] success", {
      edgeId,
      canvasId: edge.canvasId,
      userId: user.userId,
    });
  },
});
