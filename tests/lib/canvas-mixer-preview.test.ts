import { describe, expect, it } from "vitest";

import { buildGraphSnapshot } from "@/lib/canvas-render-preview";
import { resolveMixerPreviewFromGraph } from "@/lib/canvas-mixer-preview";

describe("resolveMixerPreviewFromGraph", () => {
  it("resolves base and overlay URLs by target handle", () => {
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
          data: { blendMode: "screen", opacity: 70, offsetX: 12, offsetY: -8 },
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
      offsetX: 12,
      offsetY: -8,
    });
  });

  it("prefers render output URL over upstream preview source when available", () => {
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
      overlayUrl: "https://cdn.example.com/render-output.png",
      blendMode: "normal",
      opacity: 100,
      offsetX: 0,
      offsetY: 0,
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
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("normalizes blend mode and clamps numeric values", () => {
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
            offsetX: 9999,
            offsetY: "-9999",
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
      offsetX: 2048,
      offsetY: -2048,
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
      offsetX: 0,
      offsetY: 0,
      error: "duplicate-handle-edge",
    });
  });
});
