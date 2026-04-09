import { describe, expect, it } from "vitest";

import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL_ID,
  getAgentModel,
  getAvailableAgentModels,
  isAgentModelAvailableForTier,
} from "@/lib/agent-models";
import { NODE_DEFAULTS } from "@/lib/canvas-utils";

describe("agent models registry", () => {
  it("contains approved models in stable order", () => {
    expect(Object.keys(AGENT_MODELS)).toEqual([
      "openai/gpt-5.4-nano",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.4",
      "openai/gpt-5.4-pro",
    ]);
    expect(DEFAULT_AGENT_MODEL_ID).toBe("openai/gpt-5.4-mini");
  });

  it("resolves model lookup and pricing", () => {
    expect(getAgentModel("openai/gpt-5.4-nano")?.creditCost).toBe(6);
    expect(getAgentModel("openai/gpt-5.4-mini")?.creditCost).toBe(15);
    expect(getAgentModel("openai/gpt-5.4")?.creditCost).toBe(38);
    expect(getAgentModel("openai/gpt-5.4-pro")?.creditCost).toBe(180);
    expect(getAgentModel("unknown-model")).toBeUndefined();
  });

  it("filters models by tier", () => {
    expect(getAvailableAgentModels("free").map((model) => model.id)).toEqual([]);
    expect(getAvailableAgentModels("starter").map((model) => model.id)).toEqual([
      "openai/gpt-5.4-nano",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.4",
    ]);
    expect(getAvailableAgentModels("max").map((model) => model.id)).toEqual([
      "openai/gpt-5.4-nano",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.4",
      "openai/gpt-5.4-pro",
    ]);
  });

  it("guards access by tier", () => {
    expect(isAgentModelAvailableForTier("starter", "openai/gpt-5.4")).toBe(true);
    expect(isAgentModelAvailableForTier("starter", "openai/gpt-5.4-pro")).toBe(false);
    expect(isAgentModelAvailableForTier("max", "openai/gpt-5.4-pro")).toBe(true);
  });

  it("uses the registry default in agent node defaults", () => {
    expect(NODE_DEFAULTS.agent?.data).toMatchObject({
      templateId: "campaign-distributor",
      modelId: DEFAULT_AGENT_MODEL_ID,
      clarificationQuestions: [],
      clarificationAnswers: {},
      outputNodeIds: [],
    });
  });
});
