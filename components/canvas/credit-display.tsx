"use client";

/**
 * Onboarding note:
 * Supports the Canvas editor workflow for credit display. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import { useMutation } from "convex/react";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Coins } from "lucide-react";
import { toast } from "@/lib/toast";

const showTestCreditGrant =
  typeof process.env.NEXT_PUBLIC_ALLOW_TEST_CREDIT_GRANT === "string" &&
  process.env.NEXT_PUBLIC_ALLOW_TEST_CREDIT_GRANT === "true";

type CreditDisplayProps = {
  compact?: boolean;
};

export function CreditDisplay({ compact = false }: CreditDisplayProps) {
  const t = useTranslations('toasts');
  const balance = useAuthQuery(api.credits.getBalance);
  const grantTestCredits = useMutation(api.credits.grantTestCredits);

  if (balance === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 animate-pulse">
        <Coins className="h-4 w-4 text-muted-foreground" />
        <div className={compact ? "h-4 w-12 rounded bg-muted" : "h-4 w-16 rounded bg-muted"} />
      </div>
    );
  }

  const available = balance.balance - balance.reserved;

  const isLow = available < 10;
  const isEmpty = available <= 0;

  return (
    <div className={compact ? "flex w-full items-center justify-center" : "flex items-center gap-2"}>
      <div
        className={`flex items-center rounded-lg transition-colors ${
          compact ? "w-full flex-col justify-center gap-0.5 px-1 py-2" : "gap-2 px-3 py-1.5"
        } ${
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
          className={`font-medium tabular-nums ${
            compact ? "text-[11px] leading-none" : "text-sm"
          } ${
            isEmpty ? "text-destructive" : isLow ? "text-amber-500" : "text-foreground"
          }`}
        >
          {compact ? available.toLocaleString("de-DE") : `${available.toLocaleString("de-DE")} Cr`}
        </span>
        {compact ? <span className="text-[10px] leading-none text-muted-foreground/70">Cr</span> : null}
        {balance.reserved > 0 && (
          <span className={compact ? "hidden" : "text-xs text-muted-foreground/70"}>
            ({balance.reserved} reserved)
          </span>
        )}
      </div>
      {showTestCreditGrant && (
        <button
          type="button"
          title="Testphase: +2000 Cr"
          className="rounded-md border border-dashed border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => {
            void grantTestCredits({ amount: 2000 })
              .then((r) => {
                toast.success(
                  t('billing.creditsAddedTitle'),
                  `${t('billing.creditsAddedDesc', { credits: 2000 })} — Stand: ${r.newBalance.toLocaleString("de-DE")}`,
                );
              })
              .catch((e: unknown) => {
                toast.error(
                  t('billing.testGrantFailedTitle'),
                  e instanceof Error ? e.message : undefined,
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
