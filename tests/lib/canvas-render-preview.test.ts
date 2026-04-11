import { describe, expect, it } from "vitest";

import {
  buildGraphSnapshot,
  resolveRenderPreviewInputFromGraph,
} from "@/lib/canvas-render-preview";

describe("resolveRenderPreviewInputFromGraph", () => {
  it("resolves mixer input as renderable mixer composition", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-image",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "overlay-image",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            blendMode: "overlay",
            opacity: 76,
            overlayX: 0.2,
            overlayY: 0.1,
            overlayWidth: 0.55,
            overlayHeight: 0.44,
          },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "base-image", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-image", target: "mixer-1", targetHandle: "overlay" },
        { source: "mixer-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview).toEqual({
      sourceUrl: null,
      sourceComposition: {
        kind: "mixer",
        baseUrl: "https://cdn.example.com/base.png",
        overlayUrl: "https://cdn.example.com/overlay.png",
        blendMode: "overlay",
        opacity: 76,
        overlayX: 0.2,
        overlayY: 0.1,
        overlayWidth: 0.55,
        overlayHeight: 0.44,
      },
      steps: [],
    });
  });

  it("normalizes mixer composition values for render input", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-image",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "overlay-image",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            blendMode: "unknown",
            opacity: 180,
            overlayX: -3,
            overlayY: "1.4",
            overlayWidth: 2,
            overlayHeight: 0,
          },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "base-image", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-image", target: "mixer-1", targetHandle: "overlay" },
        { source: "mixer-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceComposition).toEqual({
      kind: "mixer",
      baseUrl: "https://cdn.example.com/base.png",
      overlayUrl: "https://cdn.example.com/overlay.png",
      blendMode: "normal",
      opacity: 100,
      overlayX: 0,
      overlayY: 0.9,
      overlayWidth: 1,
      overlayHeight: 0.1,
    });
  });

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
    expect(preview.sourceComposition).toBeUndefined();
  });
});
