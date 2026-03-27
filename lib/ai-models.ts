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
  // Phase 2 — uncomment when model selector UI is ready:
  // {
  //   id: "black-forest-labs/flux.2-klein-4b",
  //   name: "FLUX.2 Klein",
  //   tier: "budget",
  //   description: "Photorealism, fastest Flux",
  //   estimatedCost: "~€0.02",
  //   minTier: "free",
  // },
  // {
  //   id: "openai/gpt-5-image",
  //   name: "GPT-5 Image",
  //   tier: "premium",
  //   description: "Best instruction following, text in image",
  //   estimatedCost: "~€0.15",
  //   minTier: "starter",
  // },
];

export const DEFAULT_MODEL_ID = "google/gemini-2.5-flash-image";

export function getModel(id: string): AiModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}
