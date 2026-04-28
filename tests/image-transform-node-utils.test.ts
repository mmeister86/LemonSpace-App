import { describe, expect, it } from "vitest";

import {
  defaultOperation,
  getSourcePreviewMeta,
  hasStyleTransferReferenceInput,
  normalizeOperation,
} from "@/components/canvas/nodes/image-transform-node";

describe("image transform node preview helpers", () => {
  it("reads source preview URL and dimensions from the incoming source node", () => {
    expect(
      getSourcePreviewMeta({
        nodeId: "upscale-1",
        edges: [{ source: "image-1", target: "upscale-1" }],
        nodes: [
          {
            id: "image-1",
            type: "image",
            data: {
              url: "https://example.com/source.jpg",
              width: 1600,
              height: 900,
            },
          },
        ],
      }),
    ).toEqual({
      url: "https://example.com/source.jpg",
      width: 1600,
      height: 900,
    });
  });

  it("reads source preview by target handle", () => {
    expect(
      getSourcePreviewMeta({
        nodeId: "style-1",
        targetHandle: "reference",
        edges: [
          { source: "image-1", target: "style-1", targetHandle: "image" },
          { source: "style-ref", target: "style-1", targetHandle: "reference" },
        ],
        nodes: [
          { id: "image-1", type: "image", data: { url: "https://example.com/source.jpg" } },
          { id: "style-ref", type: "image", data: { url: "https://example.com/style.jpg" } },
        ],
      }),
    ).toEqual({ url: "https://example.com/style.jpg" });
  });

  it("requires a reference image before running style transfer", () => {
    expect(
      hasStyleTransferReferenceInput({
        nodeId: "style-1",
        edges: [{ source: "image-1", target: "style-1", targetHandle: "image" }],
      }),
    ).toBe(false);

    expect(
      hasStyleTransferReferenceInput({
        nodeId: "style-1",
        edges: [
          { source: "image-1", target: "style-1", targetHandle: "image" },
          { source: "style-ref", target: "style-1", targetHandle: "reference" },
        ],
      }),
    ).toBe(true);
  });
});

describe("image transform operation defaults", () => {
  it("creates stable defaults for each operation", () => {
    expect(defaultOperation("bg-remove")).toEqual({ type: "bg-remove" });
    expect(defaultOperation("upscale")).toEqual({
      type: "upscale",
      scale: 2,
      outputFormat: "png",
      flavor: "photo",
      sharpen: 7,
      grain: 7,
      ultraDetail: 30,
    });
    expect(defaultOperation("style-transfer")).toEqual({
      type: "style-transfer",
      styleStrength: 100,
      structureStrength: 50,
      flavor: "faithful",
      engine: "balanced",
      fixedGeneration: false,
      isPortrait: false,
      portraitStyle: "standard",
      portraitBeautifier: "none",
    });
    expect(defaultOperation("face-restore")).toEqual({
      type: "face-restore",
      mode: "faithful",
    });
    expect(defaultOperation("change-camera")).toEqual({
      type: "change-camera",
      horizontalAngle: 0,
      verticalAngle: 0,
      zoom: 5,
      outputFormat: "png",
    });
  });

  it("normalizes invalid parameters back to operation-safe values", () => {
    expect(
      normalizeOperation("upscale", {
        type: "upscale",
        scale: 3,
        outputFormat: "webp",
        flavor: "invalid",
        sharpen: "high",
        grain: null,
        ultraDetail: undefined,
      }),
    ).toEqual(defaultOperation("upscale"));

    expect(
      normalizeOperation("change-camera", {
        type: "change-camera",
        horizontalAngle: 45,
        verticalAngle: "15",
        zoom: 9,
        outputFormat: "jpeg",
        seed: 123,
      }),
    ).toEqual({
      type: "change-camera",
      horizontalAngle: 45,
      verticalAngle: 0,
      zoom: 9,
      outputFormat: "jpeg",
      seed: 123,
    });
  });
});
