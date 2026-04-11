// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyHistogram } from "@/lib/image-pipeline/histogram";

const histogramMocks = vi.hoisted(() => ({
  computeHistogram: vi.fn(),
}));

const renderCoreMocks = vi.hoisted(() => ({
  applyPipelineStep: vi.fn(),
}));

const sourceLoaderMocks = vi.hoisted(() => ({
  loadSourceBitmap: vi.fn(),
}));

vi.mock("@/lib/image-pipeline/histogram", async () => {
  const actual = await vi.importActual<typeof import("@/lib/image-pipeline/histogram")>(
    "@/lib/image-pipeline/histogram",
  );
  return {
    ...actual,
    computeHistogram: histogramMocks.computeHistogram,
  };
});

vi.mock("@/lib/image-pipeline/render-core", () => ({
  applyPipelineStep: renderCoreMocks.applyPipelineStep,
}));

vi.mock("@/lib/image-pipeline/source-loader", () => ({
  loadSourceBitmap: sourceLoaderMocks.loadSourceBitmap,
  loadRenderSourceBitmap: ({ sourceUrl }: { sourceUrl?: string }) => {
    if (!sourceUrl) {
      throw new Error("Render source is required.");
    }

    return sourceLoaderMocks.loadSourceBitmap(sourceUrl);
  },
}));

describe("preview-renderer cancellation", () => {
  beforeEach(() => {
    vi.resetModules();
    histogramMocks.computeHistogram.mockReset();
    renderCoreMocks.applyPipelineStep.mockReset();
    sourceLoaderMocks.loadSourceBitmap.mockReset();
    histogramMocks.computeHistogram.mockReturnValue(emptyHistogram());
    sourceLoaderMocks.loadSourceBitmap.mockResolvedValue({ width: 1, height: 1 });
    renderCoreMocks.applyPipelineStep.mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
  });

  it("skips histogram work when cancellation lands after step application", async () => {
    const { renderPreview } = await import("@/lib/image-pipeline/preview-renderer");

    let abortedReads = 0;
    const signal = {
      get aborted() {
        abortedReads += 1;
        return abortedReads >= 3;
      },
    } as AbortSignal;

    await expect(
      renderPreview({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [
          {
            nodeId: "light-1",
            type: "light-adjust",
            params: { exposure: 0.1 },
          },
        ],
        previewWidth: 1,
        includeHistogram: true,
        signal,
      }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(histogramMocks.computeHistogram).not.toHaveBeenCalled();
  });
});
