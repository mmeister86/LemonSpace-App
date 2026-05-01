/**
 * Onboarding note:
 * Client image-model registry. Keep IDs, tiers, and credit costs synchronized with Convex OpenRouter configuration.
 */

// Client-side model definitions for the UI.
// Mirrors the backend config in convex/openrouter.ts — keep in sync.

export interface AiModel {
  id: string;
  name: string;
  tier: "budget" | "standard" | "premium";
  description: string;
  estimatedCost: string; // human-readable, e.g. "~€0.04"
  /** Credits pro Generierung — gleiche Einheit wie Convex reserve/commit (Euro-Cent). */
  creditCost: number;
  minTier: "free" | "starter" | "pro" | "max" | "business"; // minimum subscription tier
}

export const IMAGE_MODELS: AiModel[] = [
  {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash",
    tier: "standard",
    description: "Fast, high-quality generation",
    estimatedCost: "~€0.04",
    creditCost: 4,
    minTier: "free",
  },
  {
    id: "black-forest-labs/flux.2-klein-4b",
    name: "FLUX.2 Klein 4B",
    tier: "budget",
    description: "Low-cost image generation for quick drafts",
    estimatedCost: "~€0.02",
    creditCost: 2,
    minTier: "free",
  },
  {
    id: "bytedance-seed/seedream-4.5",
    name: "Seedream 4.5",
    tier: "standard",
    description: "Balanced detail and speed for everyday prompts",
    estimatedCost: "~€0.05",
    creditCost: 5,
    minTier: "free",
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    name: "Gemini 3.1 Flash Image",
    tier: "standard",
    description: "Fast multimodal image generation",
    estimatedCost: "~€0.06",
    creditCost: 6,
    minTier: "free",
  },
  {
    id: "openai/gpt-5-image-mini",
    name: "GPT-5 Image Mini",
    tier: "premium",
    description: "Higher-fidelity instruction following",
    estimatedCost: "~€0.08",
    creditCost: 8,
    minTier: "starter",
  },
  {
    id: "sourceful/riverflow-v2-fast",
    name: "Riverflow V2 Fast",
    tier: "premium",
    description: "Fast premium output for production workflows",
    estimatedCost: "~€0.09",
    creditCost: 9,
    minTier: "starter",
  },
  {
    id: "sourceful/riverflow-v2-pro",
    name: "Riverflow V2 Pro",
    tier: "premium",
    description: "Pro quality with stronger composition",
    estimatedCost: "~€0.12",
    creditCost: 12,
    minTier: "starter",
  },
  {
    id: "google/gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image",
    tier: "premium",
    description: "Advanced quality and prompt adherence",
    estimatedCost: "~€0.13",
    creditCost: 13,
    minTier: "starter",
  },
  {
    id: "openai/gpt-5-image",
    name: "GPT-5 Image",
    tier: "premium",
    description: "Highest quality and best text rendering",
    estimatedCost: "~€0.15",
    creditCost: 15,
    minTier: "starter",
  },
];

export const DEFAULT_MODEL_ID = "google/gemini-2.5-flash-image";

export function getModel(id: string): AiModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

const IMAGE_MODEL_TIER_ORDER: Record<AiModel["minTier"], number> = {
  free: 0,
  starter: 1,
  pro: 2,
  max: 3,
  business: 4,
};

export function getAvailableImageModels(tier: AiModel["minTier"]): AiModel[] {
  const maxTier = IMAGE_MODEL_TIER_ORDER[tier];
  return IMAGE_MODELS.filter((model) => IMAGE_MODEL_TIER_ORDER[model.minTier] <= maxTier);
}
