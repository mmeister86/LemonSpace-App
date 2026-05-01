"use client";

/**
 * Onboarding note:
 * Billing UI module for manage subscription. Keep display logic aligned with Convex credit tiers and route all payment state changes through provider-backed mutations/webhooks.
 */

import { useAuthQuery } from "@/hooks/use-auth-query";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { normalizeTier, TIER_MONTHLY_CREDITS } from "@/lib/polar-products";
import { toast } from "@/lib/toast";

const TIER_LABELS: Record<keyof typeof TIER_MONTHLY_CREDITS, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  max: "Max",
};

export function ManageSubscription() {
  const t = useTranslations('toasts');
  const [liveMessage, setLiveMessage] = useState("");
  const subscription = useAuthQuery(api.credits.getSubscription);
  const tier = normalizeTier(subscription?.tier);

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card p-6">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
      <div>
        <p className="text-sm text-muted-foreground">Current plan</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-lg font-medium">{TIER_LABELS[tier]}</span>
          <Badge variant={subscription?.status === "active" ? "default" : "secondary"}>
            {subscription?.status ?? "active"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {TIER_MONTHLY_CREDITS[tier].toLocaleString("de-DE")} Credits / month
          {subscription?.currentPeriodEnd ? (
            <> · renews {new Date(subscription.currentPeriodEnd).toLocaleDateString("de-DE")}</>
          ) : null}
        </p>
      </div>

      {tier !== "free" && (
        <Button
          variant="outline"
          onClick={() => {
            setLiveMessage(t('billing.openingPortalTitle'));
            toast.info(
              t('billing.openingPortalTitle'),
              t('billing.openingPortalDesc'),
            );
            void authClient.customer.portal();
          }}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Manage
        </Button>
      )}
    </div>
  );
}
