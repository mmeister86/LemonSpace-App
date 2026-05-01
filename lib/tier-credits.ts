/**
 * Onboarding note:
 * Shared TypeScript utility for tier credits. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

export const MONTHLY_TIER_CREDITS = {
  free: 50,
  starter: 400,
  pro: 3300,
  max: 6700,
  business: 6700,
} as const;

export type BillingTier = keyof typeof MONTHLY_TIER_CREDITS;

export const PUBLIC_TIER_MONTHLY_CREDITS = {
  free: MONTHLY_TIER_CREDITS.free,
  starter: MONTHLY_TIER_CREDITS.starter,
  pro: MONTHLY_TIER_CREDITS.pro,
  max: MONTHLY_TIER_CREDITS.max,
} as const;

export type PublicTier = keyof typeof PUBLIC_TIER_MONTHLY_CREDITS;

export function normalizeBillingTier(tier: string | undefined | null): BillingTier {
  if (!tier || tier === "free") return "free";
  if (tier === "starter" || tier === "pro" || tier === "max" || tier === "business") {
    return tier;
  }
  return "free";
}

export function normalizePublicTier(tier: string | undefined | null): PublicTier {
  const normalizedTier = normalizeBillingTier(tier);
  if (normalizedTier === "business") return "max";
  return normalizedTier;
}
