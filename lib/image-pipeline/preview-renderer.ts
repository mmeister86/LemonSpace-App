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

export async function renderPreview(options: {
  sourceUrl: string;
  steps: readonly PipelineStep[];
  previewWidth: number;
}): Promise<PreviewRenderResult> {
  const bitmap = await loadSourceBitmap(options.sourceUrl);
  const width = Math.max(1, Math.round(options.previewWidth));
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Preview renderer could not create 2D context.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);

  for (let index = 0; index < options.steps.length; index += 1) {
    applyPipelineStep(imageData.data, options.steps[index]!, width, height);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  const histogram = computeHistogram(imageData.data);

  return {
    width,
    height,
    imageData,
    histogram,
  };
}
