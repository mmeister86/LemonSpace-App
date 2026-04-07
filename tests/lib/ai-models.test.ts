import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_ID,
  IMAGE_MODELS,
  getAvailableImageModels,
  getModel,
} from "@/lib/ai-models";

describe("ai image models registry", () => {
  it("contains all 9 PRD models in stable order", () => {
    expect(IMAGE_MODELS.map((model) => model.id)).toEqual([
      "google/gemini-2.5-flash-image",
      "black-forest-labs/flux.2-klein-4b",
      "bytedance-seed/seedream-4.5",
      "google/gemini-3.1-flash-image-preview",
      "openai/gpt-5-image-mini",
      "sourceful/riverflow-v2-fast",
      "sourceful/riverflow-v2-pro",
      "google/gemini-3-pro-image-preview",
      "openai/gpt-5-image",
    ]);
    expect(DEFAULT_MODEL_ID).toBe("google/gemini-2.5-flash-image");
  });

  it("filters by subscription tier", () => {
    expect(getAvailableImageModels("free").every((model) => model.minTier === "free")).toBe(
      true,
    );
  });

  it("resolves model lookup", () => {
    expect(getModel(DEFAULT_MODEL_ID)?.creditCost).toBeGreaterThan(0);
  });
});
