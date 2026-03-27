"use client";

import { useEffect } from "react";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { CreditCard } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import { formatEurFromCents } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";

// ---------------------------------------------------------------------------
// Tier-Config — monatliches Credit-Kontingent pro Tier (in Cent)
// ---------------------------------------------------------------------------

const TIER_MONTHLY_CREDITS: Record<string, number> = {
  free: 50,
  starter: 400,
  pro: 3300,
  max: 6700,
  business: 6700,
};

const TIER_BADGE_STYLES: Record<string, string> = {
  free: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  pro: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  max: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  business: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LOW_CREDITS_THRESHOLD = 20;

export function CreditOverview() {
  const router = useRouter();
  const balance = useAuthQuery(api.credits.getBalance);
  const subscription = useAuthQuery(api.credits.getSubscription);
  const usageStats = useAuthQuery(api.credits.getUsageStats);

  useEffect(() => {
    if (balance === undefined) return;
    const available = balance.available;
    if (available <= 0 || available >= LOW_CREDITS_THRESHOLD) return;

    const key = "ls-low-credits-dashboard";
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    const { title, desc } = msg.billing.lowCredits(available);
    toast.action(title, {
      description: desc,
      label: msg.billing.topUp,
      onClick: () => router.push("/settings/billing"),
      type: "warning",
    });
  }, [balance, router]);

  // ── Loading State ──────────────────────────────────────────────────────
  if (
    balance === undefined ||
    subscription === undefined ||
    usageStats === undefined
  ) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm shadow-foreground/3">
        <div className="grid gap-6 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-8 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Computed Values ────────────────────────────────────────────────────
  const tier = subscription.tier;
  const monthlyCredits = TIER_MONTHLY_CREDITS[tier] ?? 0;
  const usagePercent = monthlyCredits > 0
    ? Math.min(100, Math.round((usageStats.monthlyUsage / monthlyCredits) * 100))
    : 0;

  const progressColorClass =
    usagePercent > 95
      ? "[&>[data-slot=progress-indicator]]:bg-destructive"
      : usagePercent >= 80
        ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
        : "";

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm shadow-foreground/3">
      <div className="grid gap-6 sm:grid-cols-3">
        {/* ── Block A: Verfügbare Credits ──────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Verfügbare Credits</p>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">
              {formatEurFromCents(balance.available)}
            </span>
            <Badge
              variant="secondary"
              className={cn(
                "text-xs font-medium",
                TIER_BADGE_STYLES[tier],
              )}
            >
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </Badge>
          </div>
          {balance.reserved > 0 && (
            <p className="text-xs text-muted-foreground">
              ({formatEurFromCents(balance.reserved)} reserviert)
            </p>
          )}
        </div>

        {/* ── Block B: Monatlicher Verbrauch ───────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-muted-foreground">Monatlicher Verbrauch</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {usagePercent}%
            </span>
          </div>
          <Progress
            value={usagePercent}
            className={cn("h-2", progressColorClass)}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatEurFromCents(usageStats.monthlyUsage)} von{" "}
              {formatEurFromCents(monthlyCredits)} verwendet
            </span>
            <span className="tabular-nums">
              {usageStats.totalGenerations} Generierungen
            </span>
          </div>
        </div>

        {/* ── Block C: Aufladen ───────────────────────────────────────── */}
        <div className="flex items-end">
          <Button variant="outline" className="w-full gap-2" asChild>
            <Link href="/settings/billing">
              <CreditCard className="size-4" />
              Credits aufladen
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
