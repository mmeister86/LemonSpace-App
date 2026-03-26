"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Coins } from "lucide-react";
import { toast } from "sonner";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

const TIER_COLORS: Record<string, string> = {
  free: "text-muted-foreground",
  starter: "text-blue-500",
  pro: "text-purple-500",
  business: "text-amber-500",
};

const showTestCreditGrant =
  typeof process.env.NEXT_PUBLIC_ALLOW_TEST_CREDIT_GRANT === "string" &&
  process.env.NEXT_PUBLIC_ALLOW_TEST_CREDIT_GRANT === "true";

export function CreditDisplay() {
  const balance = useQuery(api.credits.getBalance);
  const subscription = useQuery(api.credits.getSubscription);
  const grantTestCredits = useMutation(api.credits.grantTestCredits);

  if (balance === undefined || subscription === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 animate-pulse">
        <Coins className="h-4 w-4 text-muted-foreground" />
        <div className="h-4 w-16 rounded bg-muted" />
      </div>
    );
  }

  const available = balance.balance - balance.reserved;
  const tier = subscription.tier;
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const tierColor = TIER_COLORS[tier] ?? "text-muted-foreground";

  const isLow = available < 10;
  const isEmpty = available <= 0;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors ${
          isEmpty
            ? "bg-destructive/10"
            : isLow
              ? "bg-amber-500/10"
              : "bg-muted/50"
        }`}
      >
        <Coins
          className={`h-4 w-4 ${
            isEmpty
              ? "text-destructive"
              : isLow
                ? "text-amber-500"
                : "text-muted-foreground"
          }`}
        />
        <span
          className={`text-sm font-medium tabular-nums ${
            isEmpty ? "text-destructive" : isLow ? "text-amber-500" : "text-foreground"
          }`}
        >
          {available.toLocaleString("de-DE")} Cr
        </span>
        {balance.reserved > 0 && (
          <span className="text-xs text-muted-foreground/70">
            ({balance.reserved} reserved)
          </span>
        )}
        <span className="text-xs text-muted-foreground/70">·</span>
        <span className={`text-xs font-medium ${tierColor}`}>{tierLabel}</span>
      </div>
      {showTestCreditGrant && (
        <button
          type="button"
          title="Testphase: +2000 Cr"
          className="rounded-md border border-dashed border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => {
            void grantTestCredits({ amount: 2000 })
              .then((r) => {
                toast.success(`+2000 Cr — Stand: ${r.newBalance.toLocaleString("de-DE")}`);
              })
              .catch((e: unknown) => {
                toast.error(
                  e instanceof Error ? e.message : "Gutschrift fehlgeschlagen",
                );
              });
          }}
        >
          Test +2000
        </button>
      )}
    </div>
  );
}
