import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import { computeHistogram, type HistogramData } from "@/lib/image-pipeline/histogram";
import { applyPipelineStep } from "@/lib/image-pipeline/render-core";
import { loadSourceBitmap } from "@/lib/image-pipeline/source-loader";

export type PreviewRenderResult = {
  width: number;
  height: number;
  imageData: ImageData;
  histogram: HistogramData;
};

type PreviewCanvas = HTMLCanvasElement | OffscreenCanvas;
type PreviewContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createPreviewContext(width: number, height: number): PreviewContext {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Preview renderer could not create 2D context.");
    }

    return context;
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas: PreviewCanvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Preview renderer could not create offscreen 2D context.");
    }

    return context;
  }

  throw new Error("Preview rendering is not available in this environment.");
}

async function yieldToMainOrWorkerLoop(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(() => resolve(), 0);
  });
}

export async function renderPreview(options: {
  sourceUrl: string;
  steps: readonly PipelineStep[];
  previewWidth: number;
  signal?: AbortSignal;
}): Promise<PreviewRenderResult> {
  const bitmap = await loadSourceBitmap(options.sourceUrl, {
    signal: options.signal,
  });
  const width = Math.max(1, Math.round(options.previewWidth));
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));

  if (options.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const context = createPreviewContext(width, height);

  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);

  for (let index = 0; index < options.steps.length; index += 1) {
    applyPipelineStep(imageData.data, options.steps[index]!, width, height, {
      shouldAbort: () => Boolean(options.signal?.aborted),
    });
    await yieldToMainOrWorkerLoop();

    if (options.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
  }

  const histogram = computeHistogram(imageData.data);

  return {
    width,
    height,
    imageData,
    histogram,
  };
}
