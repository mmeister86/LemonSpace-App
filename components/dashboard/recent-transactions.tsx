"use client";

import { useQuery } from "convex/react";
import { Activity, Coins } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import { formatEurFromCents, cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-time";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  switch (status) {
    case "committed":
      return <Badge variant="secondary" className="text-xs font-normal">Abgeschlossen</Badge>;
    case "reserved":
      return (
        <Badge variant="outline" className="border-amber-300 text-xs font-normal text-amber-700 dark:border-amber-700 dark:text-amber-400">
          Reserviert
        </Badge>
      );
    case "released":
      return (
        <Badge variant="secondary" className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
          Rückerstattet
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive" className="text-xs font-normal">Fehlgeschlagen</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs font-normal">Unbekannt</Badge>;
  }
}

function truncatedDescription(text: string, maxLen = 40) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentTransactions() {
  const transactions = useQuery(api.credits.getRecentTransactions, {
    limit: 10,
  });

  // ── Loading State ──────────────────────────────────────────────────────
  if (transactions === undefined) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm shadow-foreground/3">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Activity className="size-3.5 text-muted-foreground" />
            Letzte Aktivität
          </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-1 py-3.5">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────────────────────
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm shadow-foreground/3">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Activity className="size-3.5 text-muted-foreground" />
            Letzte Aktivität
          </div>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Coins className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              Noch keine Aktivität
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Erstelle dein erstes KI-Bild im Canvas
            </p>
          </div>
        </div>
      );
    }

  // ── Transaction List ───────────────────────────────────────────────────
  return (
    <div className="rounded-xl border bg-card shadow-sm shadow-foreground/3">
      <div className="flex items-center gap-2 px-5 pt-5 pb-3 text-sm font-medium">
        <Activity className="size-3.5 text-muted-foreground" />
        Letzte Aktivität
      </div>
      <div className="divide-y">
        {transactions.map((t) => {
          const isCredit = t.amount > 0;
          return (
            <div
              key={t._id}
              className="flex items-center gap-6 px-5 py-3.5"
            >
              {/* Status Indicator */}
              <div className="shrink-0">
                {statusBadge(t.status)}
              </div>

              {/* Description */}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium"
                  title={t.description}
                >
                  {truncatedDescription(t.description)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatRelativeTime(t._creationTime)}
                </p>
              </div>

              {/* Credits */}
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "text-sm tabular-nums font-medium",
                    isCredit
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground",
                  )}
                >
                  {isCredit ? "+" : "−"}
                  {formatEurFromCents(Math.abs(t.amount))}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
