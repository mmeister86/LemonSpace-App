import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Id } from "./_generated/dataModel";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Signierte URLs für alle Storage-Assets eines Canvas (gebündelt).
 * `nodes.list` liefert keine URLs mehr, damit Node-Liste schnell bleibt.
 */
export const batchGetUrlsForCanvas = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const user = await requireAuth(ctx);
    const canvas = await ctx.db.get(canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      throw new Error("Canvas not found");
    }

    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();

    const ids = new Set<Id<"_storage">>();
    for (const node of nodes) {
      const data = node.data as Record<string, unknown> | undefined;
      const sid = data?.storageId;
      if (typeof sid === "string" && sid.length > 0) {
        ids.add(sid as Id<"_storage">);
      }
    }

    const entries = await Promise.all(
      [...ids].map(
        async (id) =>
          [id, (await ctx.storage.getUrl(id)) ?? undefined] as const,
      ),
    );

    return Object.fromEntries(entries) as Record<string, string | undefined>;
  },
});
