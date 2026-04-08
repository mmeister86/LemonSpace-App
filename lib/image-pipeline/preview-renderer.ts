import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import {
  getPreviewBackendHintForSteps,
  runPreviewStepWithBackendRouter,
} from "@/lib/image-pipeline/backend/backend-router";
import { computeHistogram, emptyHistogram, type HistogramData } from "@/lib/image-pipeline/histogram";
import {
  applyGeometryStepsToSource,
  partitionPipelineSteps,
} from "@/lib/image-pipeline/geometry-transform";
import { loadSourceBitmap } from "@/lib/image-pipeline/source-loader";

export type PreviewRenderResult = {
  width: number;
  height: number;
  imageData: ImageData;
  histogram: HistogramData;
};

type PreviewCanvas = HTMLCanvasElement | OffscreenCanvas;
type PreviewContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

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
  includeHistogram?: boolean;
  signal?: AbortSignal;
}): Promise<PreviewRenderResult> {
  const bitmap = await loadSourceBitmap(options.sourceUrl, {
    signal: options.signal,
  });
  const { geometrySteps, tonalSteps } = partitionPipelineSteps(options.steps);
  const geometryResult = applyGeometryStepsToSource({
    source: bitmap,
    sourceWidth: bitmap.width,
    sourceHeight: bitmap.height,
    steps: geometrySteps,
    signal: options.signal,
  });

  const width = Math.max(1, Math.round(options.previewWidth));
  const height = Math.max(1, Math.round((geometryResult.height / geometryResult.width) * width));

  throwIfAborted(options.signal);

  const context = createPreviewContext(width, height);

  context.drawImage(geometryResult.canvas, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const backendHint = getPreviewBackendHintForSteps(tonalSteps);

  for (let index = 0; index < tonalSteps.length; index += 1) {
    runPreviewStepWithBackendRouter({
      pixels: imageData.data,
      step: tonalSteps[index]!,
      width,
      height,
      backendHint,
      executionOptions: {
        shouldAbort: () => Boolean(options.signal?.aborted),
      },
    });
    await yieldToMainOrWorkerLoop();

    throwIfAborted(options.signal);
  }

  throwIfAborted(options.signal);

  const histogram = options.includeHistogram === false
    ? emptyHistogram()
    : computeHistogram(imageData.data);

  return {
    width,
    height,
    imageData,
    histogram,
  };
}
