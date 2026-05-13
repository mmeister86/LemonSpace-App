import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_ID,
  IMAGE_MODELS,
  getAvailableImageModels,
  getModel,
} from "@/lib/ai-models";
import { IMAGE_MODELS as OPENROUTER_MODELS } from "@/convex/openrouter";

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

  it("keeps frontend and backend image model ids and credit costs in sync", () => {
    expect(Object.keys(OPENROUTER_MODELS)).toEqual(IMAGE_MODELS.map((model) => model.id));

    for (const model of IMAGE_MODELS) {
      expect(OPENROUTER_MODELS[model.id]?.creditCost).toBe(model.creditCost);
      expect(OPENROUTER_MODELS[model.id]?.supportsImageReferences).toBe(
        model.supportsImageReferences,
      );
      expect(OPENROUTER_MODELS[model.id]?.maxReferenceImages).toBe(model.maxReferenceImages);
    }
  });

  it("only enables verified image-reference models for the six-reference workflow", () => {
    const enabled = IMAGE_MODELS.filter((model) => model.supportsImageReferences);

    expect(enabled.map((model) => model.id)).toEqual([
      "google/gemini-2.5-flash-image",
      "google/gemini-3.1-flash-image-preview",
      "openai/gpt-5-image-mini",
      "google/gemini-3-pro-image-preview",
      "openai/gpt-5-image",
    ]);
    expect(enabled.every((model) => model.maxReferenceImages === 6)).toBe(true);
    expect(getAvailableImageModels("starter", { requiresImageReferences: true }).map((model) => model.id)).toEqual([
      "google/gemini-2.5-flash-image",
      "google/gemini-3.1-flash-image-preview",
      "openai/gpt-5-image-mini",
      "google/gemini-3-pro-image-preview",
      "openai/gpt-5-image",
    ]);
  });
});
