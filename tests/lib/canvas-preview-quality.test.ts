import { describe, expect, it } from "vitest";

import {
  computeZoomAwarePreviewQuality,
  previewPipelineWidthForQuality,
  resolveZoomAwarePreviewUrl,
  sourceQualityForPreviewQuality,
  type CanvasPreviewQuality,
  type CanvasPreviewSourceQuality,
} from "@/lib/canvas-preview-quality";

describe("computeZoomAwarePreviewQuality", () => {
  it("buckets the zoomed longest media edge into low, medium, and high quality", () => {
    expect(computeZoomAwarePreviewQuality({ width: 720, height: 480, zoom: 0.5 })).toBe("low");
    expect(computeZoomAwarePreviewQuality({ width: 720, height: 480, zoom: 0.5001 })).toBe("medium");
    expect(computeZoomAwarePreviewQuality({ width: 900, height: 600, zoom: 1 })).toBe("medium");
    expect(computeZoomAwarePreviewQuality({ width: 901, height: 600, zoom: 1 })).toBe("high");
  });

  it("clamps device pixel ratio to the default range before bucketing", () => {
    expect(computeZoomAwarePreviewQuality({ width: 600, height: 400, zoom: 1, devicePixelRatio: 2 })).toBe(
      "medium",
    );
    expect(computeZoomAwarePreviewQuality({ width: 500, height: 400, zoom: 1, devicePixelRatio: 0.5 })).toBe(
      "medium",
    );
  });

  it("allows callers to lower or raise the maximum device pixel ratio cap", () => {
    expect(
      computeZoomAwarePreviewQuality({
        width: 700,
        height: 400,
        zoom: 1,
        devicePixelRatio: 2,
        maxDevicePixelRatio: 1,
      }),
    ).toBe("medium");

    expect(
      computeZoomAwarePreviewQuality({
        width: 600,
        height: 400,
        zoom: 1,
        devicePixelRatio: 2,
        maxDevicePixelRatio: 2,
      }),
    ).toBe("high");
  });
});

describe("preview quality helpers", () => {
  it("maps preview quality buckets to pipeline widths", () => {
    expect(previewPipelineWidthForQuality("low")).toBe(360);
    expect(previewPipelineWidthForQuality("medium")).toBe(720);
    expect(previewPipelineWidthForQuality("high")).toBe(1280);
  });

  it("maps low and medium previews to preview sources and high previews to full sources", () => {
    expect(sourceQualityForPreviewQuality("low")).toBe("preview");
    expect(sourceQualityForPreviewQuality("medium")).toBe("preview");
    expect(sourceQualityForPreviewQuality("high")).toBe("full");
  });

  it("exports explicit quality type unions", () => {
    const previewQuality: CanvasPreviewQuality = "high";
    const sourceQuality: CanvasPreviewSourceQuality = "full";

    expect(previewQuality).toBe("high");
    expect(sourceQuality).toBe("full");
  });
});

describe("resolveZoomAwarePreviewUrl", () => {
  it("prefers preview URLs only when preview source quality is requested", () => {
    expect(
      resolveZoomAwarePreviewUrl({
        fullUrl: "https://cdn.example.com/full.png",
        previewUrl: "https://cdn.example.com/preview.webp",
        sourceQuality: "preview",
      }),
    ).toBe("https://cdn.example.com/preview.webp");
  });

  it("falls back to full URLs when preview source quality has no preview URL", () => {
    expect(
      resolveZoomAwarePreviewUrl({
        fullUrl: "https://cdn.example.com/full.png",
        sourceQuality: "preview",
      }),
    ).toBe("https://cdn.example.com/full.png");
  });

  it("prefers full URLs when full source quality is requested and falls back to previews", () => {
    expect(
      resolveZoomAwarePreviewUrl({
        fullUrl: "https://cdn.example.com/full.png",
        previewUrl: "https://cdn.example.com/preview.webp",
        sourceQuality: "full",
      }),
    ).toBe("https://cdn.example.com/full.png");

    expect(
      resolveZoomAwarePreviewUrl({
        previewUrl: "https://cdn.example.com/preview.webp",
        sourceQuality: "full",
      }),
    ).toBe("https://cdn.example.com/preview.webp");
  });
});
