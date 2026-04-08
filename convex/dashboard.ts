import { query } from "./_generated/server";

import { optionalAuth } from "./helpers";
import { prioritizeRecentCreditTransactions } from "../lib/credits-activity";
import { MONTHLY_TIER_CREDITS, normalizeBillingTier } from "../lib/tier-credits";

const DEFAULT_TIER = "free" as const;
const DEFAULT_SUBSCRIPTION_STATUS = "active" as const;

export const getSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);

    if (!user) {
      return {
        balance: { balance: 0, reserved: 0, available: 0, monthlyAllocation: 0 },
        subscription: {
          tier: DEFAULT_TIER,
          status: DEFAULT_SUBSCRIPTION_STATUS,
          currentPeriodEnd: undefined,
        },
        usageStats: {
          monthlyUsage: 0,
          totalGenerations: 0,
          monthlyCredits: MONTHLY_TIER_CREDITS[DEFAULT_TIER],
        },
        recentTransactions: [],
        canvases: [],
        generatedAt: Date.now(),
      };
    }

    const [balanceRow, subscriptionRow, usageTransactions, recentTransactionsRaw, canvases] =
      await Promise.all([
        ctx.db
          .query("creditBalances")
          .withIndex("by_user", (q) => q.eq("userId", user.userId))
          .unique(),
        ctx.db
          .query("subscriptions")
          .withIndex("by_user", (q) => q.eq("userId", user.userId))
          .order("desc")
          .first(),
        ctx.db
          .query("creditTransactions")
          .withIndex("by_user_type", (q) => q.eq("userId", user.userId).eq("type", "usage"))
          .order("desc")
          .collect(),
        ctx.db
          .query("creditTransactions")
          .withIndex("by_user", (q) => q.eq("userId", user.userId))
          .order("desc")
          .take(80),
        ctx.db
          .query("canvases")
          .withIndex("by_owner_updated", (q) => q.eq("ownerId", user.userId))
          .order("desc")
          .collect(),
      ]);

    const tier = normalizeBillingTier(subscriptionRow?.tier);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    let monthlyUsage = 0;
    let totalGenerations = 0;

    for (const transaction of usageTransactions) {
      if (transaction._creationTime < monthStart) {
        break;
      }

      if (transaction.status === "committed") {
        monthlyUsage += Math.abs(transaction.amount);
        totalGenerations += 1;
      }
    }

    const balance = {
      balance: balanceRow?.balance ?? 0,
      reserved: balanceRow?.reserved ?? 0,
      available: (balanceRow?.balance ?? 0) - (balanceRow?.reserved ?? 0),
      monthlyAllocation: balanceRow?.monthlyAllocation ?? MONTHLY_TIER_CREDITS[tier],
    };

    return {
      balance,
      subscription: {
        tier: subscriptionRow?.tier ?? DEFAULT_TIER,
        status: subscriptionRow?.status ?? DEFAULT_SUBSCRIPTION_STATUS,
        currentPeriodEnd: subscriptionRow?.currentPeriodEnd,
      },
      usageStats: {
        monthlyUsage,
        totalGenerations,
        monthlyCredits: MONTHLY_TIER_CREDITS[tier],
      },
      recentTransactions: prioritizeRecentCreditTransactions(recentTransactionsRaw, 20),
      canvases,
      generatedAt: Date.now(),
    };
  },
});
