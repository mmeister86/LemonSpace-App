/**
 * Onboarding note:
 * Persists account-wide onboarding tour progress and first-value milestones.
 */

import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAuth } from "./helpers";

const tourValidator = v.union(v.literal("dashboardTour"), v.literal("canvasTour"));
const tourStatusValidator = v.union(
  v.literal("started"),
  v.literal("completed"),
  v.literal("skipped"),
);
const milestoneValidator = v.union(
  v.literal("firstWorkspace"),
  v.literal("firstOutput"),
);

async function getUserSettings(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export const getState = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireAuth(ctx);
    const settings = await getUserSettings(ctx, userId);
    return settings?.onboarding ?? null;
  },
});

export const markTourProgress = mutation({
  args: {
    tour: tourValidator,
    status: tourStatusValidator,
    lastStep: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAuth(ctx);
    const now = Date.now();
    const settings = await getUserSettings(ctx, userId);
    const onboarding = settings?.onboarding ?? {};
    const existingTour = onboarding[args.tour];
    const existingStatus = existingTour?.status;
    const isExistingTerminal =
      existingStatus === "completed" || existingStatus === "skipped";

    const nextTour =
      isExistingTerminal && args.status === "started"
        ? existingTour
        : {
            ...existingTour,
            status: args.status,
            lastStep: args.lastStep ?? existingTour?.lastStep ?? 0,
            startedAt: existingTour?.startedAt ?? now,
            completedAt:
              args.status === "completed"
                ? existingTour?.completedAt ?? now
                : existingTour?.completedAt,
            skippedAt:
              args.status === "skipped"
                ? existingTour?.skippedAt ?? now
                : existingTour?.skippedAt,
          };

    const nextOnboarding = {
      ...onboarding,
      [args.tour]: nextTour,
    };

    if (settings) {
      await ctx.db.patch(settings._id, {
        onboarding: nextOnboarding,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("userSettings", {
      userId,
      onboarding: nextOnboarding,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markMilestone = mutation({
  args: {
    milestone: milestoneValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAuth(ctx);
    const now = Date.now();
    const settings = await getUserSettings(ctx, userId);
    const onboarding = settings?.onboarding ?? {};
    const field =
      args.milestone === "firstWorkspace"
        ? "firstWorkspaceCreatedAt"
        : "firstOutputCreatedAt";

    if (onboarding[field] != null) return;

    const nextOnboarding = {
      ...onboarding,
      [field]: now,
    };

    if (settings) {
      await ctx.db.patch(settings._id, {
        onboarding: nextOnboarding,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("userSettings", {
      userId,
      onboarding: nextOnboarding,
      createdAt: now,
      updatedAt: now,
    });
  },
});
