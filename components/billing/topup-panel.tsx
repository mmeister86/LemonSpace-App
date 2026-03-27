"use client";

import { useState } from "react";
import { CreditCard, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { authClient } from "@/lib/auth-client";
import { TOPUP_PRODUCTS } from "@/lib/polar-products";
import { calculateCustomTopup } from "@/lib/topup-calculator";

const CUSTOM_TOPUP_PRODUCT_ID = "POLAR_PRODUCT_ID_TOPUP_CUSTOM";

export function TopupPanel() {
  const [customAmount, setCustomAmount] = useState(20);
  const { credits, bonusRate } = calculateCustomTopup(customAmount);

  async function handleTopup(polarProductId: string) {
    await authClient.checkout({ products: [polarProductId] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium">Quick top-up</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOPUP_PRODUCTS.map((product) => (
            <button
              key={product.polarProductId}
              onClick={() => handleTopup(product.polarProductId)}
              className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary"
              type="button"
            >
              <p className="text-lg font-semibold tabular-nums">EUR {product.price}</p>
              <p className="text-sm text-muted-foreground">
                {product.credits.toLocaleString("de-DE")} Cr
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h3 className="text-sm font-medium">Custom amount</h3>
        <div className="flex items-center justify-between">
          <span className="text-3xl font-semibold tabular-nums">EUR {customAmount}</span>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-primary">
              {credits.toLocaleString("de-DE")} Cr
            </p>
            {bonusRate > 0 && (
              <p className="flex items-center justify-end gap-1 text-xs text-green-600">
                <Zap className="h-3 w-3" />
                +{Math.round(bonusRate * 100)}% bonus
              </p>
            )}
          </div>
        </div>

        <Slider
          min={5}
          max={200}
          step={1}
          value={[customAmount]}
          onValueChange={([value]) => setCustomAmount(value)}
        />

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>EUR 5</span>
          <span>EUR 200</span>
        </div>

        <Button
          className="w-full"
          onClick={() => handleTopup(CUSTOM_TOPUP_PRODUCT_ID)}
        >
          <CreditCard className="mr-2 h-4 w-4" />
          Buy {credits.toLocaleString("de-DE")} Credits for EUR {customAmount}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Larger amounts include a bonus. Top-ups are always available, even on free plan.
        </p>
      </div>
    </div>
  );
}
