import { describe, expect, it } from "vitest";

import {
  buildGraphSnapshot,
  resolveRenderPreviewInputFromGraph,
} from "@/lib/canvas-render-preview";

describe("resolveRenderPreviewInputFromGraph", () => {
  it("includes crop in collected pipeline steps", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: { url: "https://cdn.example.com/source.png" },
        },
        {
          id: "crop-1",
          type: "crop",
          data: { cropRect: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 } },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "image-1", target: "crop-1" },
        { source: "crop-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.steps).toEqual([
      {
        nodeId: "crop-1",
        type: "crop",
        params: { cropRect: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 } },
      },
    ]);
  });

  it("derives proxied pexels video source URL from mp4Url", () => {
    const mp4Url = "https://player.pexels.com/videos/example.mp4";
    const graph = buildGraphSnapshot(
      [
        {
          id: "video-1",
          type: "video",
          data: { mp4Url },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [{ source: "video-1", target: "render-1" }],
    );

    const preview = resolveRenderPreviewInputFromGraph({ nodeId: "render-1", graph });

    expect(preview.sourceUrl).toBe(`/api/pexels-video?u=${encodeURIComponent(mp4Url)}`);
  });

  it("uses ai-video data.url as source URL when available", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "ai-video-1",
          type: "ai-video",
          data: { url: "https://cdn.example.com/generated-video.mp4" },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [{ source: "ai-video-1", target: "render-1" }],
    );

    const preview = resolveRenderPreviewInputFromGraph({ nodeId: "render-1", graph });

    expect(preview.sourceUrl).toBe("https://cdn.example.com/generated-video.mp4");
  });
});
