import { v } from "convex/values";

import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  buildSubscriptionCycleIdempotencyKey,
  buildSubscriptionRevokedIdempotencyKey,
  buildTopUpPaidIdempotencyKey,
  registerWebhookEventOnce,
} from "./polar-utils";

type DbCtx = Pick<MutationCtx, "db">;

type IdempotencyScope =
  | "topup_paid"
  | "subscription_activated_cycle"
  | "subscription_revoked";

type ActivatedArgs = {
  userId: string;
  tier: "starter" | "pro" | "max";
  polarSubscriptionId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  monthlyCredits: number;
};

type RevokedArgs = {
  userId: string;
  polarSubscriptionId?: string;
};

type TopUpArgs = {
  userId: string;
  credits: number;
  polarOrderId: string;
  amountPaidEuroCents: number;
};

export async function applySubscriptionActivated(ctx: DbCtx, args: ActivatedArgs) {
  const existingByPolar = await ctx.db
    .query("subscriptions")
    .withIndex("by_polar", (q) => q.eq("polarSubscriptionId", args.polarSubscriptionId))
    .first();

  const existingByUser = existingByPolar
    ? null
    : await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .first();

  const existing = existingByPolar ?? existingByUser;

  if (existing) {
    await ctx.db.patch(existing._id, {
      tier: args.tier,
      status: "active",
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      polarSubscriptionId: args.polarSubscriptionId,
    });
  } else {
    await ctx.db.insert("subscriptions", {
      userId: args.userId,
      tier: args.tier,
      status: "active",
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      polarSubscriptionId: args.polarSubscriptionId,
    });
  }

  const cycleKey = buildSubscriptionCycleIdempotencyKey({
    polarSubscriptionId: args.polarSubscriptionId,
    currentPeriodStart: args.currentPeriodStart,
    currentPeriodEnd: args.currentPeriodEnd,
  });
  const isFirstCycleEvent = await registerWebhookEvent(ctx, {
    provider: "polar",
    scope: "subscription_activated_cycle",
    idempotencyKey: cycleKey,
    userId: args.userId,
    polarSubscriptionId: args.polarSubscriptionId,
  });

  if (!isFirstCycleEvent) {
    return;
  }

  const balance = await ctx.db
    .query("creditBalances")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .unique();

  if (balance) {
    await ctx.db.patch(balance._id, {
      balance: balance.balance + args.monthlyCredits,
      monthlyAllocation: args.monthlyCredits,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("creditBalances", {
      userId: args.userId,
      balance: args.monthlyCredits,
      reserved: 0,
      monthlyAllocation: args.monthlyCredits,
      updatedAt: Date.now(),
    });
  }

  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    amount: args.monthlyCredits,
    type: "subscription",
    status: "committed",
    description: `${args.tier} plan - ${args.monthlyCredits} credits allocated`,
  });
}

export async function applySubscriptionRevoked(ctx: DbCtx, args: RevokedArgs) {
  const subByPolar = args.polarSubscriptionId
    ? await ctx.db
        .query("subscriptions")
        .withIndex("by_polar", (q) => q.eq("polarSubscriptionId", args.polarSubscriptionId))
        .first()
    : null;

  const subByUser = subByPolar
    ? null
    : await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .first();

  const sub = subByPolar ?? subByUser;

  if (sub) {
    await ctx.db.patch(sub._id, {
      tier: "free",
      status: "cancelled",
    });
  }

  const balance = await ctx.db
    .query("creditBalances")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .unique();

  if (balance) {
    await ctx.db.patch(balance._id, {
      monthlyAllocation: 50,
      updatedAt: Date.now(),
    });
  }

  const revokedKey = buildSubscriptionRevokedIdempotencyKey({
    userId: args.userId,
    polarSubscriptionId: args.polarSubscriptionId,
  });
  const isFirstRevokedEvent = await registerWebhookEvent(ctx, {
    provider: "polar",
    scope: "subscription_revoked",
    idempotencyKey: revokedKey,
    userId: args.userId,
    polarSubscriptionId: args.polarSubscriptionId,
  });

  if (!isFirstRevokedEvent) {
    return;
  }

  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    amount: 0,
    type: "subscription",
    status: "committed",
    description: args.polarSubscriptionId
      ? `Subscription ${args.polarSubscriptionId} cancelled - downgraded to Free`
      : "Subscription cancelled - downgraded to Free",
  });
}

export async function applyTopUpPaid(ctx: DbCtx, args: TopUpArgs) {
  const isFirstTopUpEvent = await registerWebhookEvent(ctx, {
    provider: "polar",
    scope: "topup_paid",
    idempotencyKey: buildTopUpPaidIdempotencyKey(args.polarOrderId),
    userId: args.userId,
    polarOrderId: args.polarOrderId,
  });

  if (!isFirstTopUpEvent) {
    return;
  }

  const balance = await ctx.db
    .query("creditBalances")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .unique();

  if (!balance) {
    throw new Error(`Missing credit balance for user ${args.userId}`);
  }

  await ctx.db.patch(balance._id, {
    balance: balance.balance + args.credits,
    updatedAt: Date.now(),
  });

  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    amount: args.credits,
    type: "topup",
    status: "committed",
    description: `Top-up order ${args.polarOrderId} - ${args.credits} credits (EUR ${(args.amountPaidEuroCents / 100).toFixed(2)})`,
  });
}

async function registerWebhookEvent(
  ctx: DbCtx,
  args: {
    provider: "polar";
    scope: IdempotencyScope;
    idempotencyKey: string;
    userId: string;
    polarOrderId?: string;
    polarSubscriptionId?: string;
  }
) {
  return await registerWebhookEventOnce(
    {
      findByProviderAndKey: async ({ provider, idempotencyKey }) => {
        const existing = await ctx.db
          .query("webhookIdempotencyEvents")
          .withIndex("by_provider_key", (q) =>
            q.eq("provider", provider).eq("idempotencyKey", idempotencyKey)
          )
          .first();
        if (!existing) {
          return null;
        }
        return { _id: existing._id };
      },
      insert: async ({
        provider,
        scope,
        idempotencyKey,
        userId,
        polarOrderId,
        polarSubscriptionId,
        createdAt,
      }) => {
        await ctx.db.insert("webhookIdempotencyEvents", {
          provider,
          scope,
          idempotencyKey,
          userId,
          polarOrderId,
          polarSubscriptionId,
          createdAt,
        });
      },
    },
    args,
  );
}

export const handleSubscriptionActivated = internalMutation({
  args: {
    userId: v.string(),
    tier: v.union(v.literal("starter"), v.literal("pro"), v.literal("max")),
    polarSubscriptionId: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    monthlyCredits: v.number(),
  },
  handler: applySubscriptionActivated,
});

export const handleSubscriptionRevoked = internalMutation({
  args: {
    userId: v.string(),
    polarSubscriptionId: v.optional(v.string()),
  },
  handler: applySubscriptionRevoked,
});

export const handleTopUpPaid = internalMutation({
  args: {
    userId: v.string(),
    credits: v.number(),
    polarOrderId: v.string(),
    amountPaidEuroCents: v.number(),
  },
  handler: applyTopUpPaid,
});
