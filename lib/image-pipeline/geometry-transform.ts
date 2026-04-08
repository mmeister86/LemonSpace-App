import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import { normalizeCropResizeStepParams } from "@/lib/image-pipeline/adjustment-types";

type SupportedCanvas = HTMLCanvasElement | OffscreenCanvas;
type SupportedContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type GeometryTransformResult = {
  canvas: SupportedCanvas;
  context: SupportedContext;
  width: number;
  height: number;
};

type ApplyGeometryStepsOptions = {
  source: CanvasImageSource;
  sourceWidth?: number;
  sourceHeight?: number;
  steps: readonly PipelineStep[];
  signal?: AbortSignal;
};

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
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
      throw new Error("Geometry transform could not create a 2D context.");
    }

    return { canvas, context };
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Geometry transform could not create an offscreen 2D context.");
    }

    return { canvas, context };
  }

  throw new Error("Geometry transform is not available in this environment.");
}

function ensurePositiveDimension(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}. Expected a positive finite number.`);
  }

  return Math.max(1, Math.round(value));
}

export function partitionPipelineSteps(steps: readonly PipelineStep[]): {
  geometrySteps: PipelineStep[];
  tonalSteps: PipelineStep[];
} {
  const geometrySteps: PipelineStep[] = [];
  const tonalSteps: PipelineStep[] = [];

  for (const step of steps) {
    if (step.type === "crop") {
      geometrySteps.push(step);
      continue;
    }

    tonalSteps.push(step);
  }

  return { geometrySteps, tonalSteps };
}

export function applyGeometryStepsToSource(options: ApplyGeometryStepsOptions): GeometryTransformResult {
  throwIfAborted(options.signal);

  const sourceWidth =
    options.sourceWidth ?? (options.source as { width?: number }).width ?? Number.NaN;
  const sourceHeight =
    options.sourceHeight ?? (options.source as { height?: number }).height ?? Number.NaN;

  let currentWidth = ensurePositiveDimension("sourceWidth", sourceWidth);
  let currentHeight = ensurePositiveDimension("sourceHeight", sourceHeight);

  let current = createCanvasContext(currentWidth, currentHeight);
  current.context.drawImage(options.source, 0, 0, currentWidth, currentHeight);

  for (const step of options.steps) {
    throwIfAborted(options.signal);

    if (step.type !== "crop") {
      continue;
    }

    const normalized = normalizeCropResizeStepParams(step.params);
    const sourceX = Math.max(0, Math.floor(normalized.cropRect.x * currentWidth));
    const sourceY = Math.max(0, Math.floor(normalized.cropRect.y * currentHeight));
    const maxSourceWidth = Math.max(1, currentWidth - sourceX);
    const maxSourceHeight = Math.max(1, currentHeight - sourceY);
    const sourceWidth = Math.max(
      1,
      Math.min(maxSourceWidth, Math.round(normalized.cropRect.width * currentWidth)),
    );
    const sourceHeight = Math.max(
      1,
      Math.min(maxSourceHeight, Math.round(normalized.cropRect.height * currentHeight)),
    );

    const targetWidth = normalized.resize?.width ?? sourceWidth;
    const targetHeight = normalized.resize?.height ?? sourceHeight;

    const next = createCanvasContext(targetWidth, targetHeight);
    next.context.drawImage(
      current.canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      targetWidth,
      targetHeight,
    );

    current = next;
    currentWidth = targetWidth;
    currentHeight = targetHeight;
  }

  return {
    canvas: current.canvas,
    context: current.context,
    width: currentWidth,
    height: currentHeight,
  };
}
