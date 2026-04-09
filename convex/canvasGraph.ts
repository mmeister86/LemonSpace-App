import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireAuth } from "./helpers";

const PERFORMANCE_LOG_THRESHOLD_MS = 250;

export async function loadCanvasGraph(
  ctx: QueryCtx,
  args: {
    canvasId: Id<"canvases">;
    userId: string;
  },
) {
  const canvas = await ctx.db.get(args.canvasId);
  if (!canvas || canvas.ownerId != args.userId) {
    throw new Error("Canvas not found");
  }

  const [nodes, edges] = await Promise.all([
    ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
      .collect(),
    ctx.db
      .query("edges")
      .withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
      .collect(),
  ]);

  return { canvas, nodes, edges };
}

export const get = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const startedAt = Date.now();
    const authStartedAt = Date.now();
    const user = await requireAuth(ctx);
    const authMs = Date.now() - authStartedAt;

    const graphStartedAt = Date.now();
    const { canvas, nodes, edges } = await loadCanvasGraph(ctx, {
      canvasId,
      userId: user.userId,
    });
    const graphMs = Date.now() - graphStartedAt;

    const durationMs = Date.now() - startedAt;
    if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
      console.warn("[canvasGraph.get] slow graph query", {
        canvasId,
        userId: user.userId,
        authMs,
        graphMs,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        canvasUpdatedAt: canvas.updatedAt,
        durationMs,
      });
    }

    return { nodes, edges };
  },
});

export const getInternal = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    userId: v.string(),
  },
  handler: async (ctx, { canvasId, userId }) => {
    return loadCanvasGraph(ctx, {
      canvasId,
      userId,
    });
  },
});
