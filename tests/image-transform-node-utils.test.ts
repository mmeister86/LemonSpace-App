import { describe, expect, it } from "vitest";

import { getSourcePreviewMeta } from "@/components/canvas/nodes/image-transform-node";

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
});
