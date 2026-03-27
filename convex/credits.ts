import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

// ============================================================================
// Tier-Konfiguration
// ============================================================================

export const TIER_CONFIG = {
  free: {
    monthlyCredits: 50,
    dailyGenerationCap: 10,
    concurrencyLimit: 1,
    premiumModels: false,
    topUpLimit: 50000,
  },
  starter: {
    monthlyCredits: 400,
    dailyGenerationCap: 50,
    concurrencyLimit: 2,
    premiumModels: true,
    topUpLimit: 2000,             // €20 pro Monat
  },
  pro: {
    monthlyCredits: 3300,
    dailyGenerationCap: 200,
    concurrencyLimit: 2,
    premiumModels: true,
    topUpLimit: 10000,            // €100 pro Monat
  },
  max: {
    monthlyCredits: 6700,
    dailyGenerationCap: 500,
    concurrencyLimit: 2,
    premiumModels: true,
    topUpLimit: 50000,
  },
  business: {
    monthlyCredits: 6700,
    dailyGenerationCap: 500,
    concurrencyLimit: 2,
    premiumModels: true,
    topUpLimit: 50000,            // €500 pro Monat
  },
} as const;

export type Tier = keyof typeof TIER_CONFIG;

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
    const user = await requireAuth(ctx);
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();

    if (!balance) {
      return { balance: 0, reserved: 0, available: 0, monthlyAllocation: 0 };
    }

    return {
      balance: balance.balance,
      reserved: balance.reserved,
      available: balance.balance - balance.reserved,
      monthlyAllocation: balance.monthlyAllocation,
    };
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
 * Aktuelle Subscription des Users abrufen (kompakt, immer definiert für die UI).
 */
export const getSubscription = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const row = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .first();

    if (!row) {
      return {
        tier: "free" as const,
        status: "active" as const,
      };
    }

    return {
      tier: row.tier,
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
    };
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
    const user = await requireAuth(ctx);
    const limit = args.limit ?? 10;

    return await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Monatliche Credit-Statistiken des Users abrufen (für Dashboard Verbrauchsbalken).
 * Berechnet: monatlicher Verbrauch (nur committed usage-Transaktionen) + Anzahl Generierungen.
 */
export const getUsageStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const transactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .collect();

    const monthlyTransactions = transactions.filter(
      (t) =>
        t._creationTime >= monthStart &&
        t.status === "committed" &&
        t.type === "usage"
    );

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

    if (existing) return existing._id;

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

    return balanceId;
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
      throw new Error("Test-Gutschriften sind deaktiviert (ALLOW_TEST_CREDIT_GRANT).");
    }
    if (amount <= 0 || amount > 1_000_000) {
      throw new Error("Ungültiger Betrag.");
    }
    const user = await requireAuth(ctx);
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();

    if (!balance) {
      throw new Error("Keine Credit-Balance — zuerst einloggen / initBalance.");
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
    const tier = (subscription?.tier ?? "free") as Tier;
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
      throw new Error(
        `Daily generation limit reached (${config.dailyGenerationCap}/${tier})`
      );
    }

    // Concurrency Limit prüfen
    if (dailyUsage && dailyUsage.concurrentJobs >= config.concurrencyLimit) {
      throw new Error(
        `Concurrent job limit reached (${config.concurrencyLimit}/${tier})`
      );
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
    });

    return transactionId;
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
    actualCost: v.number(),       // Tatsächliche Kosten in Cent
    openRouterCost: v.optional(v.number()), // Echte API-Kosten
  },
  handler: async (ctx, { transactionId, actualCost, openRouterCost }) => {
    const user = await requireAuth(ctx);
    const transaction = await ctx.db.get(transactionId);
    if (!transaction || transaction.userId !== user.userId) {
      throw new Error("Transaction not found");
    }
    if (transaction.status !== "reserved") {
      throw new Error(`Transaction is ${transaction.status}, expected reserved`);
    }

    const estimatedCost = Math.abs(transaction.amount);

    // Balance aktualisieren
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();
    if (!balance) throw new Error("No credit balance found");

    await ctx.db.patch(balance._id, {
      balance: balance.balance - actualCost,
      reserved: balance.reserved - estimatedCost,
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
        q.eq("userId", user.userId).eq("date", today)
      )
      .unique();
    if (dailyUsage && dailyUsage.concurrentJobs > 0) {
      await ctx.db.patch(dailyUsage._id, {
        concurrentJobs: dailyUsage.concurrentJobs - 1,
      });
    }
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
  handler: async (ctx, { transactionId }) => {
    const user = await requireAuth(ctx);
    const transaction = await ctx.db.get(transactionId);
    if (!transaction || transaction.userId !== user.userId) {
      throw new Error("Transaction not found");
    }
    if (transaction.status !== "reserved") {
      throw new Error(`Transaction is ${transaction.status}, expected reserved`);
    }

    const estimatedCost = Math.abs(transaction.amount);

    // Credits freigeben
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();
    if (!balance) throw new Error("No credit balance found");

    await ctx.db.patch(balance._id, {
      reserved: balance.reserved - estimatedCost,
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
        q.eq("userId", user.userId).eq("date", today)
      )
      .unique();
    if (dailyUsage && dailyUsage.concurrentJobs > 0) {
      await ctx.db.patch(dailyUsage._id, {
        concurrentJobs: dailyUsage.concurrentJobs - 1,
      });
    }

    // Generation Count NICHT zurücksetzen — der Versuch zählt
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
 * Credits nachkaufen (Top-Up).
 */
export const topUp = mutation({
  args: {
    amount: v.number(), // Betrag in Cent
  },
  handler: async (ctx, { amount }) => {
    const user = await requireAuth(ctx);
    if (amount <= 0) throw new Error("Amount must be positive");

    // Tier-Limit prüfen
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .order("desc")
      .first();
    const tier = (subscription?.tier ?? "free") as Tier;
    const config = TIER_CONFIG[tier];

    // Monatliches Top-Up-Limit prüfen
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlyTopUps = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", user.userId).eq("type", "topup")
      )
      .collect();

    const thisMonthTopUps = monthlyTopUps
      .filter((t) => t._creationTime >= monthStart.getTime())
      .reduce((sum, t) => sum + t.amount, 0);

    if (thisMonthTopUps + amount > config.topUpLimit) {
      throw new Error(
        `Monthly top-up limit reached. Limit: ${config.topUpLimit}, used: ${thisMonthTopUps}`
      );
    }

    // Credits gutschreiben
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();
    if (!balance) throw new Error("No credit balance found");

    await ctx.db.patch(balance._id, {
      balance: balance.balance + amount,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("creditTransactions", {
      userId: user.userId,
      amount,
      type: "topup",
      status: "committed",
      description: `Credit-Nachkauf — ${(amount / 100).toFixed(2)}€`,
    });
  },
});
