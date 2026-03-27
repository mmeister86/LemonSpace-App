export const SUBSCRIPTION_PRODUCTS = {
  starter: {
    polarProductId: "81b6de07-cd41-430f-bd54-f0e7072deec6",
    price: 8,
    credits: 400,
    label: "Starter",
  },
  pro: {
    polarProductId: "efb5cdb6-2cd6-4861-9073-7b43e29bc9f5",
    price: 59,
    credits: 3300,
    label: "Pro",
  },
  max: {
    polarProductId: "40b850a9-0a07-4284-a749-c410ef532e80",
    price: 119,
    credits: 6700,
    label: "Max",
  },
} as const;

export const TOPUP_PRODUCTS = [
  {
    label: "Klein",
    price: 5,
    credits: 250,
    polarProductId: "539a18b1-375c-4d70-ae84-66c53cb365f8",
  },
  {
    label: "Mittel",
    price: 10,
    credits: 500,
    polarProductId: "d62970e4-fb5a-4f72-b4af-1bb92a575fa8",
  },
  {
    label: "Groß",
    price: 20,
    credits: 1000,
    polarProductId: "ed4f0c05-7d77-4087-bcf7-cf60174e1316",
  },
  {
    label: "XL",
    price: 50,
    credits: 3000,
    polarProductId: "79a27a33-e8bf-4205-b37b-b9431593310b",
  },
] as const;

export const TIER_MONTHLY_CREDITS = {
  free: 50,
  starter: 400,
  pro: 3300,
  max: 6700,
} as const;

export function normalizeTier(tier: string | undefined | null): keyof typeof TIER_MONTHLY_CREDITS {
  if (!tier || tier === "free") return "free";
  if (tier === "starter" || tier === "pro" || tier === "max") return tier;
  if (tier === "business") return "max";
  return "free";
}
