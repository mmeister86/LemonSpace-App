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
          data: {
            blendMode: "screen",
            opacity: 70,
            overlayX: 0.12,
            overlayY: 0.2,
            overlayWidth: 0.6,
            overlayHeight: 0.5,
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
      overlayX: 0,
      overlayY: 0,
      overlayWidth: 1,
      overlayHeight: 1,
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
    });
  });

  it("normalizes rect values and clamps", () => {
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
      error: "duplicate-handle-edge",
    });
  });
});
