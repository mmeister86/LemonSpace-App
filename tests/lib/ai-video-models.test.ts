import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIDEO_MODEL_ID,
  VIDEO_MODELS,
  getAvailableVideoModels,
  getVideoModel,
  isVideoModelId,
} from "@/lib/ai-video-models";

describe("ai video models registry", () => {
  it("contains all planned MVP models", () => {
    expect(Object.keys(VIDEO_MODELS)).toHaveLength(5);
    expect(Object.keys(VIDEO_MODELS)).toEqual([
      "wan-2-2-480p",
      "wan-2-2-720p",
      "kling-std-2-1",
      "seedance-pro-1080p",
      "kling-pro-2-6",
    ]);
    expect(isVideoModelId(DEFAULT_VIDEO_MODEL_ID)).toBe(true);
  });

  it("keeps credit costs consistent for 5s and 10s durations", () => {
    for (const model of Object.values(VIDEO_MODELS)) {
      expect(model.creditCost[5]).toBeGreaterThan(0);
      expect(model.creditCost[10]).toBeGreaterThan(0);
      expect(model.creditCost[10]).toBe(model.creditCost[5] * 2);
    }
  });

  it("filters available models by tier", () => {
    expect(getAvailableVideoModels("free").map((model) => model.id)).toEqual([
      "wan-2-2-480p",
      "wan-2-2-720p",
    ]);
    expect(getAvailableVideoModels("starter").map((model) => model.id)).toEqual([
      "wan-2-2-480p",
      "wan-2-2-720p",
      "kling-std-2-1",
      "seedance-pro-1080p",
    ]);
    expect(getAvailableVideoModels("pro").map((model) => model.id)).toEqual([
      "wan-2-2-480p",
      "wan-2-2-720p",
      "kling-std-2-1",
      "seedance-pro-1080p",
      "kling-pro-2-6",
    ]);
  });

  it("supports lookup and model id guards", () => {
    expect(isVideoModelId("wan-2-2-480p")).toBe(true);
    expect(isVideoModelId("not-a-model")).toBe(false);

    const validModel = getVideoModel("wan-2-2-720p");
    expect(validModel?.label).toBe("WAN 2.2 720p");

    expect(getVideoModel("not-a-model")).toBeUndefined();
  });

  it("stores model-specific status endpoints for polling", () => {
    expect(getVideoModel("wan-2-2-480p")?.statusEndpointPath).toBe(
      "/v1/ai/text-to-video/wan-2-5-t2v-720p/{task-id}",
    );
    expect(getVideoModel("seedance-pro-1080p")?.statusEndpointPath).toBe(
      "/v1/ai/video/seedance-1-5-pro-1080p/{task-id}",
    );
    expect(getVideoModel("kling-std-2-1")?.statusEndpointPath).toBe(
      "/v1/ai/image-to-video/kling-v2-1/{task-id}",
    );
  });
});
