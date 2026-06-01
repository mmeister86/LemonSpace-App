import { describe, expect, it } from "vitest";

import { buildGraphSnapshot } from "@/lib/canvas-render-preview";
import { resolveMixerPreviewFromGraph } from "@/lib/canvas-mixer-preview";

describe("resolveMixerPreviewFromGraph", () => {
  it("resolves v2 mixer layers in persisted z-order", () => {
    const richText = {
      format: "editorjs",
      version: 1,
      time: 42,
      blocks: [{ type: "paragraph", data: { text: "Caption" } }],
    };
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-bg",
          type: "image",
          data: { url: "https://cdn.example.com/bg.png" },
        },
        {
          id: "asset-logo",
          type: "asset",
          data: { url: "https://cdn.example.com/logo.png" },
        },
        {
          id: "text-caption",
          type: "text",
          data: { content: "Caption", richText },
          width: 320,
          height: 120,
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            mixerVersion: 2,
            stage: { width: 1024, height: 768 },
            layers: [
              {
                id: "background",
                handleId: "layer-in",
                x: 0,
                y: 0,
                width: 1,
                height: 1,
              },
              {
                id: "caption",
                handleId: "layer-in-3",
                x: 0.1,
                y: 0.75,
                width: 0.8,
                height: 0.18,
              },
              {
                id: "logo",
                handleId: "layer-in-2",
                x: 0.68,
                y: 0.08,
                width: 0.22,
                height: 0.22,
                rotation: 12,
                opacity: 84,
              },
            ],
          },
        },
      ],
      [
        { source: "image-bg", target: "mixer-1", targetHandle: "layer-in" },
        { source: "asset-logo", target: "mixer-1", targetHandle: "layer-in-2" },
        { source: "text-caption", target: "mixer-1", targetHandle: "layer-in-3" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toMatchObject({
      status: "ready",
      stage: { width: 1024, height: 768 },
      layers: [
        {
          id: "background",
          handleId: "layer-in",
          source: { kind: "image", url: "https://cdn.example.com/bg.png" },
        },
        {
          id: "caption",
          handleId: "layer-in-3",
          source: {
            kind: "text",
            content: "Caption",
            richText,
            width: 320,
            height: 120,
          },
        },
        {
          id: "logo",
          handleId: "layer-in-2",
          source: { kind: "image", url: "https://cdn.example.com/logo.png" },
          rotation: 12,
          opacity: 84,
        },
      ],
    });
  });

  it("resolves base and overlay URLs by target handle while keeping frame and crop trims independent", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "asset-source",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay.png" },
        },
        {
          id: "render-overlay",
          type: "render",
          data: {},
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            blendMode: "screen",
            opacity: 70,
            overlayX: 0.12,
            overlayY: 0.2,
            overlayWidth: 0.6,
            overlayHeight: 0.5,
            cropLeft: 0.08,
            cropTop: 0.15,
            cropRight: 0.22,
            cropBottom: 0.1,
          },
        },
      ],
      [
        { source: "asset-source", target: "render-overlay" },
        { source: "image-base", target: "mixer-1", targetHandle: "base" },
        { source: "render-overlay", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "ready",
      baseUrl: "https://cdn.example.com/base.png",
      overlayUrl: "https://cdn.example.com/overlay.png",
      blendMode: "screen",
      opacity: 70,
      overlayX: 0.12,
      overlayY: 0.2,
      overlayWidth: 0.6,
      overlayHeight: 0.5,
      cropLeft: 0.08,
      cropTop: 0.15,
      cropRight: 0.22,
      cropBottom: 0.1,
    });
  });

  it("resolves text nodes as rich-text mixer layer sources", () => {
    const richText = {
      format: "editorjs",
      version: 1,
      time: 42,
      blocks: [{ type: "header", data: { text: "Rich headline", level: 2 } }],
    };
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "text-overlay",
          type: "text",
          data: { content: "Plain fallback", richText },
          width: 300,
          height: 140,
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {},
        },
      ],
      [
        { source: "image-base", target: "mixer-1", targetHandle: "base" },
        { source: "text-overlay", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toMatchObject({
      status: "ready",
      baseUrl: "https://cdn.example.com/base.png",
      overlaySource: {
        kind: "text",
        content: "Plain fallback",
        richText,
        width: 300,
        height: 140,
      },
    });
  });

  it("preserves crop trims when frame resize data changes", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "overlay-asset",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            overlayX: 0.2,
            overlayY: 0.1,
            overlayWidth: 0.6,
            overlayHeight: 0.3,
            cropLeft: 0.15,
            cropTop: 0.05,
            cropRight: 0.4,
            cropBottom: 0.25,
          },
        },
      ],
      [
        { source: "image-base", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-asset", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual(
      expect.objectContaining({
        overlayX: 0.2,
        overlayY: 0.1,
        overlayWidth: 0.6,
        overlayHeight: 0.3,
        cropLeft: 0.15,
        cropTop: 0.05,
        cropRight: 0.4,
        cropBottom: 0.25,
      }),
    );
  });

  it("preserves overlayWidth and overlayHeight when crop trims change", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "overlay-asset",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            overlayX: 0.05,
            overlayY: 0.25,
            overlayWidth: 0.55,
            overlayHeight: 0.35,
            cropLeft: 0.4,
            cropTop: 0.1,
            cropRight: 0.3,
            cropBottom: 0.1,
          },
        },
      ],
      [
        { source: "image-base", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-asset", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual(
      expect.objectContaining({
        overlayX: 0.05,
        overlayY: 0.25,
        overlayWidth: 0.55,
        overlayHeight: 0.35,
        cropLeft: 0.4,
        cropTop: 0.1,
        cropRight: 0.3,
        cropBottom: 0.1,
      }),
    );
  });

  it("prefers live render preview URL over stale baked render output", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "image-upstream",
          type: "image",
          data: { url: "https://cdn.example.com/upstream.png" },
        },
        {
          id: "render-overlay",
          type: "render",
          data: {
            lastUploadUrl: "https://cdn.example.com/render-output.png",
          },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {},
        },
      ],
      [
        { source: "image-upstream", target: "render-overlay" },
        { source: "image-base", target: "mixer-1", targetHandle: "base" },
        { source: "render-overlay", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "ready",
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
    });
  });

  it("does not reuse stale baked render output when only live sourceComposition exists", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-image",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "overlay-base",
          type: "image",
          data: { url: "https://cdn.example.com/overlay-base.png" },
        },
        {
          id: "overlay-asset",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay-asset.png" },
        },
        {
          id: "upstream-mixer",
          type: "mixer",
          data: {},
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
      ],
      [
        { source: "overlay-base", target: "upstream-mixer", targetHandle: "base" },
        { source: "overlay-asset", target: "upstream-mixer", targetHandle: "overlay" },
        { source: "upstream-mixer", target: "render-overlay" },
        { source: "base-image", target: "mixer-1", targetHandle: "base" },
        { source: "render-overlay", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "partial",
      baseUrl: "https://cdn.example.com/base.png",
      overlayUrl: undefined,
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
    });
  });

  it("returns partial when one input is missing", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {},
        },
      ],
      [{ source: "image-base", target: "mixer-1", targetHandle: "base" }],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "partial",
      baseUrl: "https://cdn.example.com/base.png",
      overlayUrl: undefined,
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
    });
  });

  it("normalizes crop trims and clamps", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-ai",
          type: "ai-image",
          data: { url: "https://cdn.example.com/base-ai.png" },
        },
        {
          id: "overlay-asset",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay-asset.png" },
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
      ],
      [
        { source: "base-ai", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-asset", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "ready",
      baseUrl: "https://cdn.example.com/base-ai.png",
      overlayUrl: "https://cdn.example.com/overlay-asset.png",
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

  it("missing rect fields fallback to sensible defaults", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-ai",
          type: "ai-image",
          data: { url: "https://cdn.example.com/base-ai.png" },
        },
        {
          id: "overlay-asset",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay-asset.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            blendMode: "multiply",
            opacity: 42,
          },
        },
      ],
      [
        { source: "base-ai", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-asset", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "ready",
      baseUrl: "https://cdn.example.com/base-ai.png",
      overlayUrl: "https://cdn.example.com/overlay-asset.png",
      blendMode: "multiply",
      opacity: 42,
      overlayX: 0,
      overlayY: 0,
      overlayWidth: 1,
      overlayHeight: 1,
      cropLeft: 0,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
    });
  });

  it("maps legacy content rect fields into crop trims during normalization", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-ai",
          type: "ai-image",
          data: { url: "https://cdn.example.com/base-ai.png" },
        },
        {
          id: "overlay-asset",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay-asset.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            contentX: 0.2,
            contentY: 0.1,
            contentWidth: 0.5,
            contentHeight: 0.6,
          },
        },
      ],
      [
        { source: "base-ai", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-asset", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "ready",
      baseUrl: "https://cdn.example.com/base-ai.png",
      overlayUrl: "https://cdn.example.com/overlay-asset.png",
      blendMode: "normal",
      opacity: 100,
      overlayX: 0,
      overlayY: 0,
      overlayWidth: 1,
      overlayHeight: 1,
      cropLeft: 0.2,
      cropTop: 0.1,
      cropRight: 0.30000000000000004,
      cropBottom: 0.30000000000000004,
    });
  });

  it("legacy offset fields still yield visible overlay geometry", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "base-ai",
          type: "ai-image",
          data: { url: "https://cdn.example.com/base-ai.png" },
        },
        {
          id: "overlay-asset",
          type: "asset",
          data: { url: "https://cdn.example.com/overlay-asset.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {
            offsetX: 100,
            offsetY: -40,
          },
        },
      ],
      [
        { source: "base-ai", target: "mixer-1", targetHandle: "base" },
        { source: "overlay-asset", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "ready",
      baseUrl: "https://cdn.example.com/base-ai.png",
      overlayUrl: "https://cdn.example.com/overlay-asset.png",
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
    });
  });

  it("returns error when multiple edges target the same mixer handle", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-a",
          type: "image",
          data: { url: "https://cdn.example.com/a.png" },
        },
        {
          id: "image-b",
          type: "image",
          data: { url: "https://cdn.example.com/b.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {},
        },
      ],
      [
        { source: "image-a", target: "mixer-1", targetHandle: "base" },
        { source: "image-b", target: "mixer-1", targetHandle: "base" },
      ],
    );

    expect(resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph })).toEqual({
      status: "error",
      baseUrl: undefined,
      overlayUrl: undefined,
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
      error: "duplicate-handle-edge",
    });
  });
});
