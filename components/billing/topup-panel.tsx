"use client";

import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";
import { TOPUP_PRODUCTS } from "@/lib/polar-products";
import { toast } from "@/lib/toast";

export function TopupPanel() {
  const t = useTranslations('toasts');

  async function handleTopup(polarProductId: string) {
    toast.info(
      t('billing.redirectingToCheckoutTitle'),
      t('billing.redirectingToCheckoutDesc'),
    );
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

      <p className="text-xs text-muted-foreground">
        Angezeigt werden nur kaufbare Top-up Pakete aus der serverseitigen Polar-Produktkonfiguration.
      </p>
    </div>
  );
}
