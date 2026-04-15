import { describe, expect, it } from "vitest";

import {
  buildGraphSnapshot,
  resolveRenderPreviewInputFromGraph,
} from "@/lib/canvas-render-preview";
import {
  computeMixerCompareOverlayImageStyle,
  computeMixerFrameRectInSurface,
  computeVisibleMixerContentRect,
  computeMixerCropImageStyle,
  isMixerCropImageReady,
} from "@/lib/mixer-crop-layout";

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
            cropLeft: 0.08,
            cropTop: 0.15,
            cropRight: 0.22,
            cropBottom: 0.1,
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
        cropLeft: 0.08,
        cropTop: 0.15,
        cropRight: 0.22,
        cropBottom: 0.1,
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
            cropLeft: "0.95",
            cropTop: -2,
            cropRight: "4",
            cropBottom: "0",
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
      cropLeft: 0.9,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
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

  it("prefers live render preview URLs over stale baked render URLs inside downstream mixer compositions", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-image",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "overlay-upstream",
          type: "image",
          data: { url: "https://cdn.example.com/upstream.png" },
        },
        {
          id: "render-overlay",
          type: "render",
          data: {
            lastUploadUrl: "https://cdn.example.com/stale-render-output.png",
          },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {},
        },
        {
          id: "render-2",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "overlay-upstream", target: "render-overlay" },
        { source: "base-image", target: "mixer-1", targetHandle: "base" },
        { source: "render-overlay", target: "mixer-1", targetHandle: "overlay" },
        { source: "mixer-1", target: "render-2" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({ nodeId: "render-2", graph });

    expect(preview).toEqual({
      sourceUrl: null,
      sourceComposition: {
        kind: "mixer",
        baseUrl: "https://cdn.example.com/base.png",
        overlayUrl: "https://cdn.example.com/upstream.png",
        blendMode: "normal",
        opacity: 100,
        overlayX: 0,
        overlayY: 0,
        overlayWidth: 1,
        overlayHeight: 1,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
      },
      steps: [],
    });
  });
});

describe("mixer crop layout parity", () => {
  it("contains a wide cropped source inside a square overlay frame", () => {
    expect(
      computeVisibleMixerContentRect({
        frameAspectRatio: 1,
        sourceWidth: 200,
        sourceHeight: 100,
        cropLeft: 0,
        cropTop: 0.25,
        cropRight: 0,
        cropBottom: 0.25,
      }),
    ).toEqual({
      x: 0,
      y: 0.375,
      width: 1,
      height: 0.25,
    });
  });

  it("returns compare image styles that preserve AR with cover behavior", () => {
    expect(
      computeMixerCropImageStyle({
        frameAspectRatio: 1,
        sourceWidth: 200,
        sourceHeight: 100,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
      }),
    ).toEqual({
      left: "-50%",
      top: "0%",
      width: "200%",
      height: "100%",
    });
  });

  it("uses the actual base-aware frame pixel ratio for compare crop math", () => {
    expect(
      computeMixerCompareOverlayImageStyle({
        surfaceWidth: 500,
        surfaceHeight: 380,
        baseWidth: 200,
        baseHeight: 100,
        overlayX: 0.1,
        overlayY: 0.2,
        overlayWidth: 0.4,
        overlayHeight: 0.4,
        sourceWidth: 200,
        sourceHeight: 100,
        cropLeft: 0.1,
        cropTop: 0,
        cropRight: 0.1,
        cropBottom: 0,
      }),
    ).toEqual({
      left: "-12.5%",
      top: "-12.5%",
      width: "125%",
      height: "125%",
    });
  });

  it("does not mark compare crop overlay ready before natural size is known", () => {
    expect(
      isMixerCropImageReady({
        currentOverlayUrl: "https://cdn.example.com/overlay-a.png",
        loadedOverlayUrl: null,
        sourceWidth: 0,
        sourceHeight: 0,
      }),
    ).toBe(false);
  });

  it("invalidates compare crop overlay readiness on source swap until the new image loads", () => {
    expect(
      isMixerCropImageReady({
        currentOverlayUrl: "https://cdn.example.com/overlay-b.png",
        loadedOverlayUrl: "https://cdn.example.com/overlay-a.png",
        sourceWidth: 200,
        sourceHeight: 100,
      }),
    ).toBe(false);
  });

  it("positions mixer overlay frame relative to the displayed base-image rect", () => {
    expect(
      computeMixerFrameRectInSurface({
        surfaceWidth: 1,
        surfaceHeight: 1,
        baseWidth: 200,
        baseHeight: 100,
        overlayX: 0.1,
        overlayY: 0.2,
        overlayWidth: 0.4,
        overlayHeight: 0.4,
      }),
    ).toEqual({
      x: 0.1,
      y: 0.35,
      width: 0.4,
      height: 0.2,
    });
  });

  it("returns null frame placement until base image natural size is known", () => {
    expect(
      computeMixerFrameRectInSurface({
        surfaceWidth: 1,
        surfaceHeight: 1,
        baseWidth: 0,
        baseHeight: 0,
        overlayX: 0.1,
        overlayY: 0.2,
        overlayWidth: 0.4,
        overlayHeight: 0.4,
      }),
    ).toBeNull();
  });
});
