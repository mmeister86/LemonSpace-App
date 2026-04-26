import { describe, expect, it } from "vitest";

import {
  getSourcePreviewMeta,
  hasStyleTransferReferenceInput,
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
