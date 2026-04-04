// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import { applyPipelineStep } from "@/lib/image-pipeline/render-core";

import {
  createBackendRouter,
  runPreviewStepWithBackendRouter,
} from "@/lib/image-pipeline/backend/backend-router";
import { renderFull } from "@/lib/image-pipeline/bridge";

const sourceLoaderMocks = vi.hoisted(() => ({
  loadSourceBitmap: vi.fn(),
}));

vi.mock("@/lib/image-pipeline/source-loader", () => ({
  loadSourceBitmap: sourceLoaderMocks.loadSourceBitmap,
}));

function createPreviewPixels(): Uint8ClampedArray {
  return new Uint8ClampedArray([
    16,
    32,
    48,
    255,
    80,
    96,
    112,
    255,
    144,
    160,
    176,
    255,
    208,
    224,
    240,
    255,
  ]);
}

function createStep(): PipelineStep {
  return {
    nodeId: "color-1",
    type: "color-adjust",
    params: {
      hsl: {
        hue: 12,
        saturation: 18,
        luminance: -8,
      },
      temperature: 6,
      tint: -4,
      vibrance: 10,
    },
  };
}

describe("backend router", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    sourceLoaderMocks.loadSourceBitmap.mockResolvedValue({
      width: 2,
      height: 2,
    });

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: createPreviewPixels(),
      })),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function toBlob(
      callback: BlobCallback,
      type?: string,
    ) {
      callback(new Blob(["rendered-full-output"], { type: type ?? "image/png" }));
    });
  });

  it("keeps preview step output identical to render-core with cpu backend", () => {
    const width = 2;
    const height = 2;
    const step = createStep();
    const expected = createPreviewPixels();
    const actual = createPreviewPixels();

    applyPipelineStep(expected, step, width, height);

    runPreviewStepWithBackendRouter({
      pixels: actual,
      step,
      width,
      height,
      backendHint: "cpu",
    });

    expect([...actual]).toEqual([...expected]);
  });

  it("keeps full render output valid when routed through cpu backend", async () => {
    const result = await renderFull({
      sourceUrl: "https://cdn.example.com/full.png",
      steps: [createStep()],
      render: {
        resolution: "original",
        format: "png",
      },
    });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.mimeType).toBe("image/png");
  });

  it("falls back to cpu for unknown backend hint", () => {
    const width = 2;
    const height = 2;
    const step = createStep();
    const cpuPixels = createPreviewPixels();
    const unknownPixels = createPreviewPixels();

    const router = createBackendRouter();

    router.runPreviewStep({
      pixels: cpuPixels,
      step,
      width,
      height,
      backendHint: "cpu",
    });

    router.runPreviewStep({
      pixels: unknownPixels,
      step,
      width,
      height,
      backendHint: "backend-that-does-not-exist",
    });

    expect([...unknownPixels]).toEqual([...cpuPixels]);
  });
});
