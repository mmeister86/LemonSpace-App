"use client";

import { useQuery } from "convex/react";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import {
  normalizeTier,
  SUBSCRIPTION_PRODUCTS,
  TIER_MONTHLY_CREDITS,
} from "@/lib/polar-products";

const TIER_ORDER = ["free", "starter", "pro", "max"] as const;

export function PricingCards() {
  const subscription = useQuery(api.credits.getSubscription);
  const currentTier = normalizeTier(subscription?.tier);

  async function handleCheckout(polarProductId: string) {
    await authClient.checkout({ products: [polarProductId] });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">Free</span>
            {currentTier === "free" && <Badge variant="secondary">Current</Badge>}
          </div>
          <p className="text-3xl font-semibold tabular-nums">EUR 0</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {TIER_MONTHLY_CREDITS.free} Credits / month
          </p>
        </div>
        <ul className="flex-1 space-y-1 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" /> Budget models only
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" /> 10 generations / day
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" /> 1 concurrent generation
          </li>
        </ul>
        <Button variant="outline" disabled>
          Free plan
        </Button>
      </div>

      {(["starter", "pro", "max"] as const).map((tier) => {
        const product = SUBSCRIPTION_PRODUCTS[tier];
        const isCurrent = currentTier === tier;
        const isUpgrade =
          TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(currentTier);

        return (
          <div
            key={tier}
            className={`flex flex-col gap-4 rounded-xl border bg-card p-6 ${tier === "pro" ? "ring-2 ring-primary" : ""}`}
          >
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{product.label}</span>
                {isCurrent && <Badge variant="secondary">Current</Badge>}
                {tier === "pro" && !isCurrent && <Badge>Popular</Badge>}
              </div>
              <p className="text-3xl font-semibold tabular-nums">EUR {product.price}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {product.credits.toLocaleString("de-DE")} Credits / month
              </p>
            </div>
            <ul className="flex-1 space-y-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" /> All models
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" /> {tier === "starter" ? "50" : tier === "pro" ? "200" : "500"} generations / day
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" /> 2 concurrent generations
              </li>
            </ul>
            <Button
              variant={tier === "pro" ? "default" : "outline"}
              disabled={isCurrent}
              onClick={() => handleCheckout(product.polarProductId)}
            >
              {isCurrent
                ? "Current plan"
                : isUpgrade
                  ? `Upgrade to ${product.label}`
                  : `Switch to ${product.label}`}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
