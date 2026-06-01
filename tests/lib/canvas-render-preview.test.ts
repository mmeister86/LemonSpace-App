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
  it("marks bg-remove-output adjustment chains as alpha-bearing", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "bg-output-1",
          type: "bg-remove-output",
          data: { url: "https://cdn.example.com/cutout.png" },
        },
        {
          id: "curves-1",
          type: "curves",
          data: { levels: { blackPoint: 24, whitePoint: 240, gamma: 0.9 } },
        },
        {
          id: "color-1",
          type: "color-adjust",
          data: { hsl: { hue: 14, saturation: 8, luminance: -2 } },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "bg-output-1", target: "curves-1" },
        { source: "curves-1", target: "color-1" },
        { source: "color-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview).toMatchObject({
      sourceUrl: "https://cdn.example.com/cutout.png",
      isAlphaBearing: true,
      steps: [
        { nodeId: "curves-1", type: "curves" },
        { nodeId: "color-1", type: "color-adjust" },
      ],
    });
  });

  it("defaults render preview source resolution to full-quality image URLs", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: {
            url: "https://cdn.example.com/full.png",
            previewUrl: "https://cdn.example.com/preview.webp",
          },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [{ source: "image-1", target: "render-1" }],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceUrl).toBe("https://cdn.example.com/full.png");
  });

  it("can resolve render preview sources through preview-quality image URLs", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: {
            url: "https://cdn.example.com/full.png",
            previewUrl: "https://cdn.example.com/preview.webp",
          },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [{ source: "image-1", target: "render-1" }],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
      sourceQuality: "preview",
    });

    expect(preview.sourceUrl).toBe("https://cdn.example.com/preview.webp");
  });

  it("keeps mixer render composition full-quality by default and preview-quality on request", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-image",
          type: "image",
          data: {
            url: "https://cdn.example.com/base-full.png",
            previewUrl: "https://cdn.example.com/base-preview.webp",
          },
        },
        {
          id: "overlay-image",
          type: "asset",
          data: {
            url: "https://cdn.example.com/overlay-full.png",
            previewUrl: "https://cdn.example.com/overlay-preview.webp",
          },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {},
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

    const full = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });
    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
      sourceQuality: "preview",
    });

    expect(full.sourceComposition).toMatchObject({
      baseUrl: "https://cdn.example.com/base-full.png",
      overlayUrl: "https://cdn.example.com/overlay-full.png",
    });
    expect(preview.sourceComposition).toMatchObject({
      baseUrl: "https://cdn.example.com/base-preview.webp",
      overlayUrl: "https://cdn.example.com/overlay-preview.webp",
    });
  });

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

  it("resolves v2 mixer input as a multi-layer render composition", () => {
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
          id: "top-image",
          type: "ai-image",
          data: { url: "https://cdn.example.com/top.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            mixerVersion: 2,
            stage: { width: 1200, height: 900 },
            layers: [
              {
                id: "base",
                handleId: "layer-in",
                x: 0,
                y: 0,
                width: 1,
                height: 1,
              },
              {
                id: "overlay",
                handleId: "layer-in-2",
                x: 0.18,
                y: 0.2,
                width: 0.5,
                height: 0.4,
                rotation: 15,
                opacity: 70,
                blendMode: "screen",
                crop: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.1 },
              },
              {
                id: "top",
                handleId: "layer-in-3",
                x: 0.6,
                y: 0.1,
                width: 0.25,
                height: 0.25,
                visible: false,
              },
            ],
          },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "base-image", target: "mixer-1", targetHandle: "layer-in" },
        { source: "overlay-image", target: "mixer-1", targetHandle: "layer-in-2" },
        { source: "top-image", target: "mixer-1", targetHandle: "layer-in-3" },
        { source: "mixer-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview).toMatchObject({
      sourceUrl: null,
      sourceComposition: {
        kind: "mixer",
        stage: { width: 1200, height: 900 },
        layers: [
          {
            id: "base",
            source: { kind: "image", url: "https://cdn.example.com/base.png" },
          },
          {
            id: "overlay",
            source: { kind: "image", url: "https://cdn.example.com/overlay.png" },
            x: 0.18,
            y: 0.2,
            width: 0.5,
            height: 0.4,
            rotation: 15,
            opacity: 70,
            blendMode: "screen",
            crop: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.1 },
          },
        ],
      },
      steps: [],
    });
  });

  it("derives v2 mixer render stage from layer-in when no stage is persisted", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-image",
          type: "image",
          data: {
            url: "https://cdn.example.com/base.png",
            intrinsicWidth: 2048,
            intrinsicHeight: 1536,
          },
        },
        {
          id: "overlay-image",
          type: "asset",
          data: {
            url: "https://cdn.example.com/overlay.png",
            intrinsicWidth: 500,
            intrinsicHeight: 200,
          },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            mixerVersion: 2,
            stage: null,
            layers: [
              {
                id: "base",
                handleId: "layer-in",
                x: 0,
                y: 0,
                width: 1,
                height: 1,
              },
              {
                id: "overlay",
                handleId: "layer-in-2",
                x: 0.18,
                y: 0.2,
                width: 0.5,
                height: 0.4,
              },
            ],
          },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "base-image", target: "mixer-1", targetHandle: "layer-in" },
        { source: "overlay-image", target: "mixer-1", targetHandle: "layer-in-2" },
        { source: "mixer-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceComposition).toMatchObject({
      kind: "mixer",
      stage: { width: 2048, height: 1536 },
      layers: [
        { id: "base", handleId: "layer-in" },
        { id: "overlay", handleId: "layer-in-2" },
      ],
    });
  });

  it("resolves text mixer layers for renderable mixer compositions", () => {
    const richText = {
      format: "editorjs",
      version: 1,
      blocks: [{ type: "paragraph", data: { text: "Overlay <b>copy</b>" } }],
      time: 7,
    };
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-text",
          type: "text",
          data: { content: "Overlay copy", richText },
          measured: { width: 280, height: 160 },
        },
        {
          id: "overlay-image",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {},
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "base-text", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-image", target: "mixer-1", targetHandle: "overlay" },
        { source: "mixer-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceComposition).toMatchObject({
      kind: "mixer",
      baseSource: {
        kind: "text",
        content: "Overlay copy",
        richText,
        width: 280,
        height: 160,
      },
      overlayUrl: "https://cdn.example.com/overlay.png",
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
          type: "asset-video",
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

  it("returns compare image styles that preserve AR with width-priority behavior", () => {
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
      left: "0%",
      top: "25%",
      width: "100%",
      height: "50%",
    });
  });

  it("uses the actual base-aware frame pixel ratio for width-priority compare crop math", () => {
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
