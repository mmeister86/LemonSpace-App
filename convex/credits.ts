import { query, mutation, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { optionalAuth, requireAuth } from "./helpers";
import { internal } from "./_generated/api";
import { MONTHLY_TIER_CREDITS, normalizeBillingTier } from "../lib/tier-credits";
import { prioritizeRecentCreditTransactions } from "../lib/credits-activity";

// ============================================================================
// Tier-Konfiguration
// ============================================================================

export const TIER_CONFIG = {
  free: {
    monthlyCredits: MONTHLY_TIER_CREDITS.free,
    dailyGenerationCap: 10,
    concurrencyLimit: 1,
    premiumModels: false,
    topUpLimit: 50000,
  },
  starter: {
    monthlyCredits: MONTHLY_TIER_CREDITS.starter,
    dailyGenerationCap: 50,
    concurrencyLimit: 2,
    premiumModels: true,
    topUpLimit: 2000,             // €20 pro Monat
  },
  pro: {
    monthlyCredits: MONTHLY_TIER_CREDITS.pro,
    dailyGenerationCap: 200,
    concurrencyLimit: 2,
    premiumModels: true,
    topUpLimit: 10000,            // €100 pro Monat
  },
  max: {
    monthlyCredits: MONTHLY_TIER_CREDITS.max,
    dailyGenerationCap: 500,
    concurrencyLimit: 2,
    premiumModels: true,
    topUpLimit: 50000,
  },
  business: {
    monthlyCredits: MONTHLY_TIER_CREDITS.business,
    dailyGenerationCap: 500,
    concurrencyLimit: 2,
    premiumModels: true,
    topUpLimit: 50000,            // €500 pro Monat
  },
} as const;

export type Tier = keyof typeof TIER_CONFIG;

const PERFORMANCE_LOG_THRESHOLD_MS = 250;
const ACTIVITY_DEFAULT_PAGE_SIZE = 25;
const ACTIVITY_MIN_PAGE_SIZE = 1;
const ACTIVITY_MAX_PAGE_SIZE = 1000;
const ACTIVITY_DAY_MS = 24 * 60 * 60 * 1000;
const STALE_RESERVATION_MAX_AGE_MS = ACTIVITY_DAY_MS;
const STALE_RESERVATION_CLEANUP_LIMIT = 100;

type ActivityDateRange = "all" | "7d" | "30d" | "month" | "custom";
type ActivitySortBy = "date" | "amount" | "model";
type ActivitySortDirection = "asc" | "desc";

type ActivityTransaction = {
  _creationTime: number;
  amount: number;
  type: "subscription" | "topup" | "usage" | "reservation" | "refund";
  status: "committed" | "reserved" | "released" | "failed";
  model?: string;
  videoMeta?: {
    model: string;
  };
};

function normalizeActivityPage(page: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.max(1, Math.floor(page));
}

function normalizeActivityPageSize(pageSize: number | undefined): number {
  if (!Number.isFinite(pageSize ?? Number.NaN)) {
    return ACTIVITY_DEFAULT_PAGE_SIZE;
  }

  return Math.min(
    ACTIVITY_MAX_PAGE_SIZE,
    Math.max(ACTIVITY_MIN_PAGE_SIZE, Math.floor(pageSize!)),
  );
}

function parseDateInput(value: string | undefined, endOfDay: boolean): number | null {
  if (!value) {
    return null;
  }

  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = Date.parse(
    isoDateOnly
      ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
      : value,
  );

  return Number.isFinite(timestamp) ? timestamp : null;
}

function getActivityDateBounds(
  dateRange: ActivityDateRange,
  startDate: string | undefined,
  endDate: string | undefined,
  nowMs = Date.now(),
): { startMs: number | null; endMs: number | null } {
  if (dateRange === "all") {
    return { startMs: null, endMs: null };
  }

  if (dateRange === "7d") {
    return { startMs: nowMs - 7 * ACTIVITY_DAY_MS, endMs: null };
  }

  if (dateRange === "30d") {
    return { startMs: nowMs - 30 * ACTIVITY_DAY_MS, endMs: null };
  }

  if (dateRange === "month") {
    const now = new Date(nowMs);
    return {
      startMs: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      endMs: null,
    };
  }

  return {
    startMs: parseDateInput(startDate, false),
    endMs: parseDateInput(endDate, true),
  };
}

function getActivityModel(transaction: ActivityTransaction): string | null {
  const model = transaction.model?.trim() || transaction.videoMeta?.model?.trim();
  return model && model.length > 0 ? model : null;
}

function compareActivityTransactions<T extends ActivityTransaction>(
  left: T,
  right: T,
  sortBy: ActivitySortBy,
  sortDirection: ActivitySortDirection,
): number {
  const direction = sortDirection === "asc" ? 1 : -1;

  if (sortBy === "amount") {
    const amountOrder = Math.abs(left.amount) - Math.abs(right.amount);
    if (amountOrder !== 0) {
      return amountOrder * direction;
    }
  } else if (sortBy === "model") {
    const modelOrder = (getActivityModel(left) ?? "").localeCompare(
      getActivityModel(right) ?? "",
      "de",
    );
    if (modelOrder !== 0) {
      return modelOrder * direction;
    }
  }

  return (left._creationTime - right._creationTime) * direction;
}

function transactionMatchesDateRange<T extends ActivityTransaction>(
  transaction: T,
  bounds: { startMs: number | null; endMs: number | null },
): boolean {
  if (bounds.startMs !== null && transaction._creationTime < bounds.startMs) {
    return false;
  }

  if (bounds.endMs !== null && transaction._creationTime > bounds.endMs) {
    return false;
  }

  return true;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Credit-Balance des eingeloggten Users abrufen.
 * Gibt balance, reserved und computed available zurück.
 */
export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const startedAt = Date.now();

    try {
      console.info("[credits.getBalance] start", {
        durationMs: Date.now() - startedAt,
      });

      const user = await optionalAuth(ctx);
      console.info("[credits.getBalance] auth resolved", {
        durationMs: Date.now() - startedAt,
        userId: user?.userId ?? null,
      });

      if (!user) {
        return { balance: 0, reserved: 0, available: 0, monthlyAllocation: 0 };
      }
      const balance = await ctx.db
        .query("creditBalances")
        .withIndex("by_user", (q) => q.eq("userId", user.userId))
        .unique();

      console.info("[credits.getBalance] balance query resolved", {
        durationMs: Date.now() - startedAt,
        userId: user.userId,
        foundBalance: Boolean(balance),
      });

      if (!balance) {
        return { balance: 0, reserved: 0, available: 0, monthlyAllocation: 0 };
      }

      return {
        balance: balance.balance,
        reserved: balance.reserved,
        available: balance.balance - balance.reserved,
        monthlyAllocation: balance.monthlyAllocation,
      };
    } catch (error) {
      const identity = await ctx.auth.getUserIdentity();
      console.error("[credits.getBalance] failed", {
        durationMs: Date.now() - startedAt,
        hasIdentity: Boolean(identity),
        identityIssuer: identity?.issuer ?? null,
        identitySubject: identity?.subject ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});

/**
 * Letzte Transaktionen des Users abrufen.
 */
export const listTransactions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireAuth(ctx);
    return await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .take(limit ?? 50);
  },
});

/**
 * Vollständiger Credit-Audit-Trail für die Detailseite.
 */
export const listActivity = query({
  args: {
    page: v.number(),
    pageSize: v.optional(v.number()),
    dateRange: v.union(
      v.literal("all"),
      v.literal("7d"),
      v.literal("30d"),
      v.literal("month"),
      v.literal("custom"),
    ),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    model: v.optional(v.string()),
    sortBy: v.union(v.literal("date"), v.literal("amount"), v.literal("model")),
    sortDirection: v.union(v.literal("asc"), v.literal("desc")),
  },
  handler: async (ctx, args) => {
    const normalizedPage = normalizeActivityPage(args.page);
    const normalizedPageSize = normalizeActivityPageSize(args.pageSize);
    const user = await optionalAuth(ctx);

    if (!user) {
      return {
        items: [],
        page: normalizedPage,
        pageSize: normalizedPageSize,
        totalPages: 0,
        totalCount: 0,
        modelOptions: [],
        summary: {
          netCredits: 0,
          usageCredits: 0,
          entryCount: 0,
        },
      };
    }

    const transactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .collect();

    const dateBounds = getActivityDateBounds(
      args.dateRange,
      args.startDate,
      args.endDate,
    );
    const dateFiltered = transactions.filter((transaction) =>
      transactionMatchesDateRange(transaction, dateBounds),
    );
    const modelOptions = Array.from(
      new Set(
        dateFiltered
          .map(getActivityModel)
          .filter((model): model is string => model !== null),
      ),
    ).sort((left, right) => left.localeCompare(right, "de"));

    const selectedModel = args.model?.trim();
    const filtered =
      selectedModel && selectedModel.length > 0
        ? dateFiltered.filter((transaction) => getActivityModel(transaction) === selectedModel)
        : dateFiltered;
    const sorted = [...filtered].sort((left, right) =>
      compareActivityTransactions(left, right, args.sortBy, args.sortDirection),
    );

    const totalCount = sorted.length;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / normalizedPageSize) : 0;
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const items = sorted.slice(offset, offset + normalizedPageSize);
    const summary = filtered.reduce(
      (acc, transaction) => {
        acc.netCredits += transaction.amount;
        if (transaction.type === "usage" && transaction.status === "committed") {
          acc.usageCredits += Math.abs(transaction.amount);
        }
        acc.entryCount += 1;
        return acc;
      },
      {
        netCredits: 0,
        usageCredits: 0,
        entryCount: 0,
      },
    );

    return {
      items,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages,
      totalCount,
      modelOptions,
      summary,
    };
  },
});

/**
 * Aktuelle Subscription des Users abrufen (kompakt, immer definiert für die UI).
 */
export const getSubscription = query({
  args: {},
  handler: async (ctx) => {
    const startedAt = Date.now();

    try {
      console.info("[credits.getSubscription] start", {
        durationMs: Date.now() - startedAt,
      });

      const user = await optionalAuth(ctx);
      console.info("[credits.getSubscription] auth resolved", {
        durationMs: Date.now() - startedAt,
        userId: user?.userId ?? null,
      });

      if (!user) {
        return {
          tier: "free" as const,
          status: "active" as const,
        };
      }

      const row = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", user.userId))
        .order("desc")
        .first();

      console.info("[credits.getSubscription] subscription query resolved", {
        userId: user.userId,
        durationMs: Date.now() - startedAt,
        foundRow: Boolean(row),
      });

      if (!row) {
        console.info("[credits.getSubscription] no subscription row", {
          userId: user.userId,
          durationMs: Date.now() - startedAt,
        });

        return {
          tier: "free" as const,
          status: "active" as const,
        };
      }

      console.info("[credits.getSubscription] resolved subscription", {
        userId: user.userId,
        subscriptionId: row._id,
        tier: row.tier,
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
        durationMs: Date.now() - startedAt,
      });

      return {
        tier: row.tier,
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
      };
    } catch (error) {
      const identity = await ctx.auth.getUserIdentity();
      console.error("[credits.getSubscription] failed", {
        durationMs: Date.now() - startedAt,
        hasIdentity: Boolean(identity),
        identityIssuer: identity?.issuer ?? null,
        identitySubject: identity?.subject ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});

/**
 * Heutige Nutzung des Users abrufen (für Abuse Prevention).
 */
export const getDailyUsage = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const today = new Date().toISOString().split("T")[0]; // "2026-03-25"

    const usage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user.userId).eq("date", today)
      )
      .unique();

    return usage ?? { generationCount: 0, concurrentJobs: 0 };
  },
});

/**
 * Neueste Transaktionen des Users abrufen (für Dashboard "Recent Activity").
 * Ähnlich wie listTransactions, aber als dedizierter Query mit explizitem Limit.
 */
export const getRecentTransactions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) {
      return [];
    }
    const limit = args.limit ?? 10;
    const readLimit = Math.min(Math.max(limit * 4, 20), 100);

    const transactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .take(readLimit);

    return prioritizeRecentCreditTransactions(transactions, limit);
  },
});

/**
 * Monatliche Credit-Statistiken des Users abrufen (für Dashboard Verbrauchsbalken).
 * Berechnet: monatlicher Verbrauch (nur committed usage-Transaktionen) + Anzahl Generierungen.
 */
export const getUsageStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) {
      return {
        monthlyUsage: 0,
        totalGenerations: 0,
      };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startedAt = Date.now();

    const transactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", user.userId).eq("type", "usage")
      )
      .order("desc")
      .collect();

    const monthlyTransactions = [] as Array<typeof transactions[0]>;

    for (const transaction of transactions) {
      if (transaction._creationTime < monthStart) {
        break;
      }
      if (transaction.status === "committed") {
        monthlyTransactions.push(transaction);
      }
    }

    const durationMs = Date.now() - startedAt;
    if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
      console.warn("[credits.getUsageStats] slow usage stats query", {
        userId: user.userId,
        durationMs,
        scannedTransactionCount: transactions.length,
        includedCount: monthlyTransactions.length,
      });
    }

    return {
      monthlyUsage: monthlyTransactions.reduce(
        (sum, t) => sum + Math.abs(t.amount),
        0
      ),
      totalGenerations: monthlyTransactions.length,
    };
  },
});

// ============================================================================
// Mutations — Credit Balance Management
// ============================================================================

/**
 * Credit-Balance für einen neuen User initialisieren.
 * Wird beim ersten Login / Signup aufgerufen.
 */
export const initBalance = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    // Prüfen ob schon existiert
    const existing = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();

    if (existing) {
      return { balanceId: existing._id, created: false };
    }

    // Free-Tier Credits als Startguthaben
    const balanceId = await ctx.db.insert("creditBalances", {
      userId: user.userId,
      balance: TIER_CONFIG.free.monthlyCredits,
      reserved: 0,
      monthlyAllocation: TIER_CONFIG.free.monthlyCredits,
      updatedAt: Date.now(),
    });

    // Initiale Subscription (Free)
    await ctx.db.insert("subscriptions", {
      userId: user.userId,
      tier: "free",
      status: "active",
      currentPeriodStart: Date.now(),
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000, // +30 Tage
    });

    // Initiale Transaktion loggen
    await ctx.db.insert("creditTransactions", {
      userId: user.userId,
      amount: TIER_CONFIG.free.monthlyCredits,
      type: "subscription",
      status: "committed",
      description: "Startguthaben — Free Tier",
    });

    return { balanceId, created: true };
  },
});

/**
 * Nur Testphase: schreibt dem eingeloggten User Gutschrift gut.
 * In Produktion deaktiviert, außer ALLOW_TEST_CREDIT_GRANT ist in Convex auf "true" gesetzt.
 */
export const grantTestCredits = mutation({
  args: {
    amount: v.optional(v.number()),
  },
  handler: async (ctx, { amount = 2000 }) => {
    if (process.env.ALLOW_TEST_CREDIT_GRANT !== "true") {
      throw new ConvexError({ code: "CREDITS_TEST_DISABLED" });
    }
    if (amount <= 0 || amount > 1_000_000) {
      throw new ConvexError({ code: "CREDITS_INVALID_AMOUNT" });
    }
    const user = await requireAuth(ctx);
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();

    if (!balance) {
      throw new ConvexError({ code: "CREDITS_BALANCE_NOT_FOUND" });
    }

    const next = balance.balance + amount;
    await ctx.db.patch(balance._id, {
      balance: next,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("creditTransactions", {
      userId: user.userId,
      amount,
      type: "subscription",
      status: "committed",
      description: `Testphase — Gutschrift (${amount} Cr)`,
    });

    return { newBalance: next };
  },
});

// ============================================================================
// Mutations — Reservation + Commit (Kern des Credit-Systems)
// ============================================================================

/**
 * Credits reservieren — vor einem KI-Call.
 *
 * Prüft: ausreichend verfügbare Credits, Daily Cap, Concurrency Limit.
 * Gibt die Transaction-ID zurück (wird zum Commit/Release benötigt).
 */
export const reserve = mutation({
  args: {
    estimatedCost: v.number(),    // Geschätzte Kosten in Cent
    description: v.string(),
    nodeId: v.optional(v.id("nodes")),
    canvasId: v.optional(v.id("canvases")),
    model: v.optional(v.string()),
    provider: v.optional(v.union(v.literal("openrouter"), v.literal("freepik"))),
    videoMeta: v.optional(v.object({
      model: v.string(),
      durationSeconds: v.number(),
      hasAudio: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Balance laden
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();
    if (!balance) throw new Error("No credit balance found. Call initBalance first.");

    const available = balance.balance - balance.reserved;
    if (available < args.estimatedCost) {
      throw new Error(
        `Insufficient credits. Available: ${available}, required: ${args.estimatedCost}`
      );
    }

    // Subscription laden für Tier-Checks
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .first();
    const tier = normalizeBillingTier(subscription?.tier);
    const config = TIER_CONFIG[tier];

    // Daily Cap prüfen
    const today = new Date().toISOString().split("T")[0];
    const dailyUsage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user.userId).eq("date", today)
      )
      .unique();

    if (dailyUsage && dailyUsage.generationCount >= config.dailyGenerationCap) {
      throw new ConvexError({
        code: "CREDITS_DAILY_CAP_REACHED",
        data: { limit: config.dailyGenerationCap, tier },
      });
    }

    // Concurrency Limit prüfen
    if (dailyUsage && dailyUsage.concurrentJobs >= config.concurrencyLimit) {
      throw new ConvexError({
        code: "CREDITS_CONCURRENCY_LIMIT",
        data: { limit: config.concurrencyLimit },
      });
    }

    // Credits reservieren
    await ctx.db.patch(balance._id, {
      reserved: balance.reserved + args.estimatedCost,
      updatedAt: Date.now(),
    });

    // Daily Usage aktualisieren
    if (dailyUsage) {
      await ctx.db.patch(dailyUsage._id, {
        generationCount: dailyUsage.generationCount + 1,
        concurrentJobs: dailyUsage.concurrentJobs + 1,
      });
    } else {
      await ctx.db.insert("dailyUsage", {
        userId: user.userId,
        date: today,
        generationCount: 1,
        concurrentJobs: 1,
      });
    }

    // Reservation-Transaktion erstellen
    const transactionId = await ctx.db.insert("creditTransactions", {
      userId: user.userId,
      amount: -args.estimatedCost,
      type: "reservation",
      status: "reserved",
      description: args.description,
      nodeId: args.nodeId,
      canvasId: args.canvasId,
      model: args.model,
      provider: args.provider,
      videoMeta: args.videoMeta,
    });

    return transactionId;
  },
});

/**
 * Reservation committen — interne Variante ohne Auth-Kontext.
 */
export const commitInternal = internalMutation({
  args: {
    transactionId: v.id("creditTransactions"),
    actualCost: v.number(),
    openRouterCost: v.optional(v.number()),
  },
  handler: async (ctx, { transactionId, actualCost, openRouterCost }) => {
    const transaction = await ctx.db.get(transactionId);
    if (!transaction) {
      throw new Error("Transaction not found");
    }
    if (transaction.status === "committed") {
      return { status: "already_committed" as const };
    }
    if (transaction.status === "released") {
      return { status: "already_released" as const };
    }
    if (transaction.status !== "reserved") {
      throw new Error(`Transaction is ${transaction.status}, expected reserved`);
    }

    const estimatedCost = Math.abs(transaction.amount);

    // Balance aktualisieren
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", transaction.userId))
      .unique();
    if (!balance) throw new Error("No credit balance found");

    await ctx.db.patch(balance._id, {
      balance: balance.balance - actualCost,
      reserved: Math.max(0, balance.reserved - estimatedCost),
      updatedAt: Date.now(),
    });

    // Transaktion committen
    await ctx.db.patch(transactionId, {
      amount: -actualCost,
      type: "usage",
      status: "committed",
      openRouterCost,
    });

    // Concurrent Jobs dekrementieren
    const today = new Date().toISOString().split("T")[0];
    const dailyUsage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", transaction.userId).eq("date", today)
      )
      .unique();
    if (dailyUsage && dailyUsage.concurrentJobs > 0) {
      await ctx.db.patch(dailyUsage._id, {
        concurrentJobs: dailyUsage.concurrentJobs - 1,
      });
    }

    return { status: "committed" as const };
  },
});

/**
 * Reservation committen — nach erfolgreichem KI-Call.
 *
 * Schreibt die tatsächlichen Kosten ab (können von Reservation abweichen).
 */
export const commit = mutation({
  args: {
    transactionId: v.id("creditTransactions"),
    actualCost: v.number(),
    openRouterCost: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { transactionId, actualCost, openRouterCost }
  ): Promise<
    { status: "already_committed" } |
    { status: "already_released" } |
    { status: "committed" }
  > => {
    const user = await requireAuth(ctx);
    const transaction = await ctx.db.get(transactionId);
    if (!transaction || transaction.userId !== user.userId) {
      throw new Error("Transaction not found");
    }

    return await ctx.runMutation(internal.credits.commitInternal, {
      transactionId,
      actualCost,
      openRouterCost,
    });
  },
});

/**
 * Reservation freigeben — interne Variante ohne Auth-Kontext.
 */
export const releaseInternal = internalMutation({
  args: {
    transactionId: v.id("creditTransactions"),
  },
  handler: async (ctx, { transactionId }) => {
    const transaction = await ctx.db.get(transactionId);
    if (!transaction) {
      throw new Error("Transaction not found");
    }
    if (transaction.status === "released") {
      return { status: "already_released" as const };
    }
    if (transaction.status === "committed") {
      return { status: "already_committed" as const };
    }
    if (transaction.status !== "reserved") {
      throw new Error(`Transaction is ${transaction.status}, expected reserved`);
    }

    const estimatedCost = Math.abs(transaction.amount);

    // Credits freigeben
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", transaction.userId))
      .unique();
    if (!balance) throw new Error("No credit balance found");

    await ctx.db.patch(balance._id, {
      reserved: Math.max(0, balance.reserved - estimatedCost),
      updatedAt: Date.now(),
    });

    // Transaktion als released markieren
    await ctx.db.patch(transactionId, {
      status: "released",
    });

    // Concurrent Jobs dekrementieren
    const today = new Date().toISOString().split("T")[0];
    const dailyUsage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", transaction.userId).eq("date", today)
      )
      .unique();
    if (dailyUsage && dailyUsage.concurrentJobs > 0) {
      await ctx.db.patch(dailyUsage._id, {
        concurrentJobs: dailyUsage.concurrentJobs - 1,
      });
    }

    // Generation Count NICHT zurücksetzen — der Versuch zählt
    return { status: "released" as const };
  },
});

/**
 * Reservation freigeben — bei fehlgeschlagenem KI-Call.
 *
 * Reservierte Credits werden komplett zurückgegeben.
 */
export const release = mutation({
  args: {
    transactionId: v.id("creditTransactions"),
  },
  handler: async (
    ctx,
    { transactionId }
  ): Promise<
    { status: "already_released" } |
    { status: "already_committed" } |
    { status: "released" }
  > => {
    const user = await requireAuth(ctx);
    const transaction = await ctx.db.get(transactionId);
    if (!transaction || transaction.userId !== user.userId) {
      throw new Error("Transaction not found");
    }

    return await ctx.runMutation(internal.credits.releaseInternal, {
      transactionId,
    });
  },
});

/**
 * Gibt reservierte Credits frei, wenn die Reservation deutlich älter ist als
 * jeder reguläre Background-Job. Das repariert hängengebliebene Jobs, ohne
 * normale Agent-, Bild- oder Video-Läufe aggressiv zu unterbrechen.
 */
export const releaseStaleReservations = internalMutation({
  args: {
    maxAgeMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const maxAgeMs =
      Number.isFinite(args.maxAgeMs ?? Number.NaN) && args.maxAgeMs! > 0
        ? args.maxAgeMs!
        : STALE_RESERVATION_MAX_AGE_MS;
    const cutoff = now - maxAgeMs;
    const limit =
      Number.isFinite(args.limit ?? Number.NaN) && args.limit! > 0
        ? Math.min(STALE_RESERVATION_CLEANUP_LIMIT, Math.floor(args.limit!))
        : STALE_RESERVATION_CLEANUP_LIMIT;

    const reservedTransactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_status_type", (q) =>
        q.eq("status", "reserved").eq("type", "reservation")
      )
      .take(limit);

    let releasedCount = 0;
    let releasedAmount = 0;

    for (const transaction of reservedTransactions) {
      if (transaction._creationTime > cutoff) {
        continue;
      }

      const estimatedCost = Math.abs(transaction.amount);
      const balance = await ctx.db
        .query("creditBalances")
        .withIndex("by_user", (q) => q.eq("userId", transaction.userId))
        .unique();

      if (balance) {
        await ctx.db.patch(balance._id, {
          reserved: Math.max(0, balance.reserved - estimatedCost),
          updatedAt: now,
        });
      }

      await ctx.db.patch(transaction._id, {
        status: "released",
        description: `${transaction.description} (auto-released after stale reservation timeout)`,
      });

      releasedCount += 1;
      releasedAmount += estimatedCost;
    }

    return { releasedCount, releasedAmount, cutoff };
  },
});

// ============================================================================
// Mutations — Subscription & Top-Up (von Lemon Squeezy Webhooks aufgerufen)
// ============================================================================

/**
 * Subscription aktivieren / ändern.
 * Wird vom Lemon Squeezy Webhook aufgerufen.
 */
export const activateSubscription = internalMutation({
  args: {
    userId: v.string(),
    tier: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("max"),
      v.literal("business")
    ),
    lemonSqueezySubscriptionId: v.string(),
    lemonSqueezyCustomerId: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const config = TIER_CONFIG[args.tier];

    // Bestehende Subscription deaktivieren
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { status: "cancelled" });
    }

    // Neue Subscription erstellen
    await ctx.db.insert("subscriptions", {
      userId: args.userId,
      tier: args.tier,
      status: "active",
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      lemonSqueezySubscriptionId: args.lemonSqueezySubscriptionId,
      lemonSqueezyCustomerId: args.lemonSqueezyCustomerId,
    });

    // Credits gutschreiben
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (balance) {
      await ctx.db.patch(balance._id, {
        balance: balance.balance + config.monthlyCredits,
        monthlyAllocation: config.monthlyCredits,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("creditBalances", {
        userId: args.userId,
        balance: config.monthlyCredits,
        reserved: 0,
        monthlyAllocation: config.monthlyCredits,
        updatedAt: Date.now(),
      });
    }

    // Transaktion loggen
    await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      amount: config.monthlyCredits,
      type: "subscription",
      status: "committed",
      description: `Abo-Gutschrift — ${args.tier} Tier`,
    });
  },
});

/**
 * Legacy Top-Up Endpoint.
 *
 * Security hardening (P0.1): direkte Credit-Gutschriften ueber einen oeffentlichen
 * Mutationspfad sind deaktiviert. Credits duerfen nur ueber verifizierte
 * Payment-Webhooks (convex/polar.ts) verbucht werden.
 */
export const topUp = mutation({
  args: {
    amount: v.number(), // Betrag in Cent
  },
  handler: async (ctx, { amount }) => {
    await requireAuth(ctx);

    if (amount <= 0) {
      throw new ConvexError({
        code: "TOPUP_INVALID_AMOUNT",
        data: { message: "Amount must be positive" },
      });
    }

    throw new ConvexError({
      code: "TOPUP_DISABLED",
      data: {
        message:
          "Direct top-up credits are disabled. Start checkout via Polar and wait for webhook confirmation.",
      },
    });
  },
});

// ============================================================================
// Internal Mutations — Abuse Prevention (für ai.ts Action)
// ============================================================================

/**
 * Prüft Daily Cap und Concurrency — wirft Fehler bei Verstoß.
 * Wird von generateImage aufgerufen BEVOR Credits reserviert werden.
 * Wird benötigt, wenn INTERNAL_CREDITS_ENABLED !== "true".
 */
export const checkAbuseLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .first();
    const tier = normalizeBillingTier(subscription?.tier);
    const config = TIER_CONFIG[tier];

    const today = new Date().toISOString().split("T")[0];
    const usage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user.userId).eq("date", today)
      )
      .unique();

    const dailyCount = usage?.generationCount ?? 0;
    if (dailyCount >= config.dailyGenerationCap) {
      throw new ConvexError({
        code: "CREDITS_DAILY_CAP_REACHED",
        data: { limit: config.dailyGenerationCap, tier },
      });
    }

    const currentConcurrency = usage?.concurrentJobs ?? 0;
    if (currentConcurrency >= config.concurrencyLimit) {
      throw new ConvexError({
        code: "CREDITS_CONCURRENCY_LIMIT",
        data: { limit: config.concurrencyLimit },
      });
    }
  },
});

/**
 * Erhöht generationCount und concurrentJobs atomar.
 * Nur aufrufen wenn INTERNAL_CREDITS_ENABLED !== "true"
 * (reserve übernimmt das bei aktivierten Credits).
 */
export const incrementUsage = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const today = new Date().toISOString().split("T")[0];

    const usage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user.userId).eq("date", today)
      )
      .unique();

    if (usage) {
      await ctx.db.patch(usage._id, {
        generationCount: usage.generationCount + 1,
        concurrentJobs: usage.concurrentJobs + 1,
      });
    } else {
      await ctx.db.insert("dailyUsage", {
        userId: user.userId,
        date: today,
        generationCount: 1,
        concurrentJobs: 1,
      });
    }
  },
});

/**
 * Verringert concurrentJobs um 1 (Minimum 0).
 * Nur aufrufen wenn INTERNAL_CREDITS_ENABLED !== "true"
 * (commit/release übernehmen das bei aktivierten Credits).
 */
export const decrementConcurrency = internalMutation({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resolvedUserId =
      args.userId ?? (await requireAuth(ctx)).userId;
    const today = new Date().toISOString().split("T")[0];

    const usage = await ctx.db
      .query("dailyUsage")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", resolvedUserId).eq("date", today)
      )
      .unique();

    if (usage && usage.concurrentJobs > 0) {
      await ctx.db.patch(usage._id, {
        concurrentJobs: usage.concurrentJobs - 1,
      });
    }
  },
});
