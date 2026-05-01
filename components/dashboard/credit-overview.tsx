"use client";

/**
 * Onboarding note:
 * Dashboard UI module for credit overview. It should consume the bundled dashboard snapshot rather than issuing separate Convex queries for the same data.
 */

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { DashboardSnapshot } from "@/hooks/use-dashboard-snapshot";
import { normalizeTier } from "@/lib/polar-products";
import { formatCredits } from "@/lib/credits-activity";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

const TIER_BADGE_STYLES: Record<string, string> = {
  free: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  pro: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  max: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LOW_CREDITS_THRESHOLD = 20;

type CreditOverviewProps = {
  balance?: DashboardSnapshot["balance"];
  subscription?: DashboardSnapshot["subscription"];
  usageStats?: DashboardSnapshot["usageStats"];
};

export function CreditOverview({ balance, subscription, usageStats }: CreditOverviewProps) {
  const t = useTranslations('toasts');
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (balance === undefined) return;
    const available = balance.available;
    if (available <= 0 || available >= LOW_CREDITS_THRESHOLD) return;

    const key = "ls-low-credits-dashboard";
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    toast.action(t('billing.lowCreditsTitle'), {
      description: t('billing.lowCreditsDesc', { remaining: available }),
      label: t('billing.topUp'),
      onClick: () => router.push("/settings/billing"),
      type: "warning",
    });
  }, [t, balance, router]);

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
  const tier = normalizeTier(subscription.tier);
  const monthlyCredits = usageStats.monthlyCredits;
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
              {formatCredits(balance.available, locale)}
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
              ({formatCredits(balance.reserved, locale)} reserviert)
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
              {formatCredits(usageStats.monthlyUsage, locale)} von{" "}
              {formatCredits(monthlyCredits, locale)} verwendet
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
