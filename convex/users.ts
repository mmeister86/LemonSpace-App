import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const setLocale = mutation({
  args: {
    locale: v.union(v.literal("de"), v.literal("en")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAuth(ctx);

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        locale: args.locale,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        locale: args.locale,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const getLocale = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireAuth(ctx);

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return existing?.locale ?? null;
  },
});
