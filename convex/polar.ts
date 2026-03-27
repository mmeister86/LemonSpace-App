import { v } from "convex/values";

import { internalMutation, type MutationCtx } from "./_generated/server";

type DbCtx = Pick<MutationCtx, "db">;

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
  const existing = await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .order("desc")
    .first();

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
  const sub = await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .order("desc")
    .first();

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
  const duplicate = await ctx.db
    .query("creditTransactions")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .filter((q) => q.eq(q.field("description"), `Top-up order ${args.polarOrderId}`))
    .first();

  if (duplicate) {
    return;
  }

  const balance = await ctx.db
    .query("creditBalances")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .unique();

  if (!balance) {
    return;
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
