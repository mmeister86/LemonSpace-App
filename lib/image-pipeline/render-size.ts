import type {
  RenderOptions,
  RenderSizeLimits,
  ResolvedRenderSize,
} from "@/lib/image-pipeline/render-types";

const DEFAULT_MAX_DIMENSION = 8192;
const DEFAULT_MAX_PIXELS = 33_554_432;

function sanitizeLimit(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid render limit '${name}'. Expected a positive finite number.`);
  }

  return Math.max(1, Math.floor(value));
}

function sanitizeDimension(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}. Expected a positive finite number.`);
  }

  return Math.max(1, Math.round(value));
}

function scaleDimensions(
  width: number,
  height: number,
  factor: number,
): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
}

export function resolveRenderSize(options: {
  sourceWidth: number;
  sourceHeight: number;
  render: RenderOptions;
  limits?: RenderSizeLimits;
}): ResolvedRenderSize {
  const sourceWidth = sanitizeDimension("sourceWidth", options.sourceWidth);
  const sourceHeight = sanitizeDimension("sourceHeight", options.sourceHeight);

  const maxDimension = sanitizeLimit(
    "maxDimension",
    options.limits?.maxDimension,
    DEFAULT_MAX_DIMENSION,
  );
  const maxPixels = sanitizeLimit("maxPixels", options.limits?.maxPixels, DEFAULT_MAX_PIXELS);

  let targetWidth = sourceWidth;
  let targetHeight = sourceHeight;

  if (options.render.resolution === "2x") {
    targetWidth = sourceWidth * 2;
    targetHeight = sourceHeight * 2;
  } else if (options.render.resolution === "custom") {
    if (!options.render.customSize) {
      throw new Error("Invalid render options: resolution 'custom' requires customSize.");
    }

    targetWidth = sanitizeDimension("customSize.width", options.render.customSize.width);
    targetHeight = sanitizeDimension("customSize.height", options.render.customSize.height);
  } else if (options.render.resolution !== "original") {
    throw new Error(`Unsupported render resolution '${options.render.resolution}'.`);
  }

  targetWidth = sanitizeDimension("targetWidth", targetWidth);
  targetHeight = sanitizeDimension("targetHeight", targetHeight);

  let scaleFactor = 1;
  let wasClamped = false;

  const dimensionScale = Math.min(1, maxDimension / Math.max(targetWidth, targetHeight));
  if (dimensionScale < 1) {
    const scaled = scaleDimensions(targetWidth, targetHeight, dimensionScale);
    targetWidth = scaled.width;
    targetHeight = scaled.height;
    scaleFactor *= dimensionScale;
    wasClamped = true;
  }

  const pixelCount = targetWidth * targetHeight;
  if (pixelCount > maxPixels) {
    const pixelScale = Math.sqrt(maxPixels / pixelCount);
    const scaled = scaleDimensions(targetWidth, targetHeight, pixelScale);
    targetWidth = scaled.width;
    targetHeight = scaled.height;
    scaleFactor *= pixelScale;
    wasClamped = true;
  }

  return {
    width: targetWidth,
    height: targetHeight,
    scaleFactor,
    wasClamped,
  };
}
