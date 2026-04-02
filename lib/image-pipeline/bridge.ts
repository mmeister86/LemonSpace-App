import { applyPipelineSteps } from "@/lib/image-pipeline/render-core";
import { resolveRenderSize } from "@/lib/image-pipeline/render-size";
import {
  RENDER_FORMAT_TO_MIME,
  type RenderFormat,
  type RenderFullOptions,
  type RenderFullResult,
} from "@/lib/image-pipeline/render-types";
import { loadSourceBitmap } from "@/lib/image-pipeline/source-loader";

type SupportedCanvas = HTMLCanvasElement | OffscreenCanvas;
type SupportedContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function normalizeJpegQuality(value: number | undefined): number {
  if (value === undefined) {
    return 0.92;
  }

  if (!Number.isFinite(value)) {
    throw new Error("Invalid render options: jpegQuality must be a finite number.");
  }

  return Math.max(0, Math.min(1, value));
}

function createCanvasContext(width: number, height: number): {
  canvas: SupportedCanvas;
  context: SupportedContext;
} {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Render bridge could not create a 2D context.");
    }

    return {
      canvas,
      context,
    };
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Render bridge could not create an offscreen 2D context.");
    }

    return {
      canvas,
      context,
    };
  }

  throw new Error("Canvas rendering is not available in this environment.");
}

async function canvasToBlob(
  canvas: SupportedCanvas,
  mimeType: string,
  quality: number | undefined,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return await canvas.convertToBlob({ type: mimeType, quality });
  }

  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Render bridge could not encode output blob."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function resolveMimeType(format: RenderFormat): string {
  const mimeType = RENDER_FORMAT_TO_MIME[format];
  if (!mimeType) {
    throw new Error(`Unsupported render format '${format}'.`);
  }

  return mimeType;
}

export async function renderFull(options: RenderFullOptions): Promise<RenderFullResult> {
  const bitmap = await loadSourceBitmap(options.sourceUrl);
  const resolvedSize = resolveRenderSize({
    sourceWidth: bitmap.width,
    sourceHeight: bitmap.height,
    render: options.render,
    limits: options.limits,
  });

  const { canvas, context } = createCanvasContext(resolvedSize.width, resolvedSize.height);

  context.drawImage(bitmap, 0, 0, resolvedSize.width, resolvedSize.height);

  const imageData = context.getImageData(0, 0, resolvedSize.width, resolvedSize.height);
  applyPipelineSteps(
    imageData.data,
    options.steps,
    resolvedSize.width,
    resolvedSize.height,
  );
  context.putImageData(imageData, 0, 0);

  const mimeType = resolveMimeType(options.render.format);
  const quality = options.render.format === "jpeg" ? normalizeJpegQuality(options.render.jpegQuality) : null;
  const blob = await canvasToBlob(canvas, mimeType, quality ?? undefined);

  return {
    blob,
    width: resolvedSize.width,
    height: resolvedSize.height,
    mimeType,
    format: options.render.format,
    quality,
    sizeBytes: blob.size,
    sourceWidth: bitmap.width,
    sourceHeight: bitmap.height,
    wasSizeClamped: resolvedSize.wasClamped,
  };
}

export const bridge = {
  renderFull,
};
