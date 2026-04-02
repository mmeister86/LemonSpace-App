import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { requireAuth } from "./helpers";
import { adjustmentPresetNodeTypeValidator } from "./node-type-validator";

export const list = query({
  args: {
    nodeType: v.optional(adjustmentPresetNodeTypeValidator),
  },
  handler: async (ctx, { nodeType }) => {
    const user = await requireAuth(ctx);

    if (nodeType) {
      return await ctx.db
        .query("adjustmentPresets")
        .withIndex("by_userId_nodeType", (q) =>
          q.eq("userId", user.userId).eq("nodeType", nodeType),
        )
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("adjustmentPresets")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
      .order("desc")
      .collect();
  },
});

export const save = mutation({
  args: {
    name: v.string(),
    nodeType: adjustmentPresetNodeTypeValidator,
    params: v.any(),
  },
  handler: async (ctx, { name, nodeType, params }) => {
    const user = await requireAuth(ctx);
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("Preset name cannot be empty.");
    }

    return await ctx.db.insert("adjustmentPresets", {
      userId: user.userId,
      name: normalizedName,
      nodeType,
      params,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    presetId: v.id("adjustmentPresets"),
  },
  handler: async (ctx, { presetId }) => {
    const user = await requireAuth(ctx);
    const preset = await ctx.db.get(presetId);
    if (!preset) {
      return false;
    }
    if (preset.userId !== user.userId) {
      throw new Error("Forbidden");
    }

    await ctx.db.delete(presetId);
    return true;
  },
});
