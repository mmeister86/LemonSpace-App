import { describe, expect, it } from "vitest";

import {
  buildAgentModelSelectorOptions,
  buildAiTextModelSelectorOptions,
  buildImageModelSelectorOptions,
  buildVideoModelSelectorOptions,
  inferModelProvider,
} from "@/components/canvas/nodes/canvas-ai-model-selector";

describe("canvas AI model selector mapping", () => {
  it("maps image models with provider groups and credit descriptions", () => {
    const options = buildImageModelSelectorOptions("starter");

    expect(options.some((model) => model.id === "google/gemini-2.5-flash-image")).toBe(true);
    expect(options).toContainEqual(
      expect.objectContaining({
        id: "black-forest-labs/flux.2-klein-4b",
        provider: "black-forest-labs",
        description: expect.stringContaining("2 Cr"),
      }),
    );
    expect(options).toContainEqual(
      expect.objectContaining({
        id: "sourceful/riverflow-v2-pro",
        provider: "sourceful",
      }),
    );
  });

  it("filters image selector options to reference-capable models when references are connected", () => {
    const options = buildImageModelSelectorOptions("starter", undefined, {
      requiresImageReferences: true,
    });

    expect(options.some((model) => model.id === "google/gemini-2.5-flash-image")).toBe(true);
    expect(options.some((model) => model.id === "openai/gpt-5-image-mini")).toBe(true);
    expect(options.some((model) => model.id === "black-forest-labs/flux.2-klein-4b")).toBe(false);
    expect(options.some((model) => model.id === "sourceful/riverflow-v2-pro")).toBe(false);
  });

  it("maps video models with LemonSpace-specific providers", () => {
    const options = buildVideoModelSelectorOptions(10);

    expect(options).toContainEqual(
      expect.objectContaining({
        id: "wan-2-2-720p",
        provider: "wan",
        description: expect.stringContaining("104 Cr"),
      }),
    );
    expect(options).toContainEqual(
      expect.objectContaining({
        id: "kling-pro-2-6",
        provider: "kling",
        description: expect.stringContaining("118 Cr"),
      }),
    );
  });

  it("maps video model features without duplicate badges", () => {
    const options = buildVideoModelSelectorOptions(5);
    const textToVideoModel = options.find((model) => model.id === "wan-2-2-720p");
    const imageToVideoModel = options.find((model) => model.id === "kling-std-2-1");

    expect(textToVideoModel?.features).toEqual(["video"]);
    expect(imageToVideoModel?.features).toEqual(["multimodal", "video"]);

    for (const model of options) {
      expect(new Set(model.features).size).toBe(model.features?.length);
    }
  });

  it("maps AI text and agent models through the agent registry", () => {
    expect(buildAiTextModelSelectorOptions("starter")).toContainEqual(
      expect.objectContaining({
        id: "openai/gpt-5.4-mini",
        provider: "openai",
        description: expect.stringContaining("15 Cr"),
      }),
    );

    expect(buildAgentModelSelectorOptions("max")).toContainEqual(
      expect.objectContaining({
        id: "openai/gpt-5.4-pro",
        provider: "openai",
        description: expect.stringContaining("180 Cr"),
      }),
    );
  });

  it("falls back to unknown provider for unsupported model ids", () => {
    expect(inferModelProvider("custom-provider/model-x")).toBe("unknown");
  });
});
