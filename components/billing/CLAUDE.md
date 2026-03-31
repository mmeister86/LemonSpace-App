# components/billing/ — Billing & Subscription UI

UI-Komponenten für Credit-Anzeige, Subscription-Management und Top-Up.

---

## Dateien

| Datei | Zweck |
|-------|-------|
| `pricing-cards.tsx` | Tier-Vergleich (Free / Starter / Pro / Max) |
| `manage-subscription.tsx` | Aktuelle Subscription verwalten (Upgrade, Kündigung) |
| `topup-panel.tsx` | Credit-Nachkauf-UI (fixe Pakete + Custom-Betrag) |

---

## Tier-Struktur

Tiers und ihre Credit-Mengen sind in `convex/credits.ts → TIER_CONFIG` definiert. Die Billing-UI liest diese Werte über Convex-Queries — keine doppelte Konfiguration hier.

```
Free:    50 Cr/Monat  (€0)
Starter: 400 Cr/Monat (€8)
Pro:     3.300 Cr/Monat (€59)
Max:     6.700 Cr/Monat (€119)
```

**1 Credit = €0,01** — Diese Umrechnung überall konsistent verwenden.

---

## Payment-Integration

**Polar.sh** ist der aktuelle Payment-Provider (MoR, VAT-Handling). Webhooks landen in `convex/http.ts` → `convex/polar.ts`.

> Hinweis: `convex/schema.ts` enthält noch `lemonSqueezySubscriptionId`-Felder — Überbleibsel einer früheren Integration. Lemon Squeezy ist nicht mehr aktiv. Polar-Felder (`polarSubscriptionId`) sind maßgeblich.

---

## Credit-Balance im Dashboard

Die Credit-Balance wird auch in `components/dashboard/credit-overview.tsx` angezeigt. Beide Komponenten nutzen dieselbe Convex-Query (`api.credits.getBalance`).

---

## Konventionen

- Tier-Upgrades immer über Polar-Checkout (kein direktes Schreiben in `subscriptions`-Tabelle)
- `topUp` Mutation (`convex/credits.ts`) für Credit-Nachkauf aufrufen
- Monatliches Top-Up-Limit pro Tier beachten (siehe `TIER_CONFIG.topUpLimit`)
