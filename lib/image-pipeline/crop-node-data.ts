/**
 * Onboarding note:
 * Image pipeline utility for crop node data. Keep CPU/WebGL/worker behavior deterministic so preview and render tests can assert parity.
 */

export type CropResizeMode = "source" | "custom";
export type CropFitMode = "cover" | "contain" | "fill";

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropResizeSettings = {
  mode: CropResizeMode;
  width?: number;
  height?: number;
  fit: CropFitMode;
  keepAspect: boolean;
};

export type CropNodeData = {
  crop: CropRect;
  resize: CropResizeSettings;
};

const CROP_MIN_SIZE = 0.01;
const CUSTOM_SIZE_MIN = 1;
const CUSTOM_SIZE_MAX = 16_384;
const DEFAULT_CUSTOM_SIZE = 1024;

const DISALLOWED_CROP_PAYLOAD_KEYS = [
  "blob",
  "blobUrl",
  "imageData",
  "storageId",
  "url",
] as const;

export const DEFAULT_CROP_NODE_DATA: CropNodeData = {
  crop: {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  },
  resize: {
    mode: "source",
    fit: "cover",
    keepAspect: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampUnit(value: number | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }
  return clamp(value, 0, 1);
}

function normalizeCropRect(value: unknown): CropRect {
  const source = isRecord(value) ? value : {};
  const base = DEFAULT_CROP_NODE_DATA.crop;

  const xInput = readFiniteNumber(source.x);
  const yInput = readFiniteNumber(source.y);

  const widthInput = readFiniteNumber(source.width);
  const heightInput = readFiniteNumber(source.height);

  const width = widthInput !== null && widthInput > 0
    ? clamp(widthInput, CROP_MIN_SIZE, 1)
    : base.width;
  const height = heightInput !== null && heightInput > 0
    ? clamp(heightInput, CROP_MIN_SIZE, 1)
    : base.height;

  const x = clamp(clampUnit(xInput, base.x), 0, Math.max(0, 1 - width));
  const y = clamp(clampUnit(yInput, base.y), 0, Math.max(0, 1 - height));

  return {
    x,
    y,
    width,
    height,
  };
}

function normalizeCustomSize(value: unknown): number | undefined {
  if (!Number.isInteger(value)) {
    return undefined;
  }

  const parsed = value as number;
  if (parsed < CUSTOM_SIZE_MIN || parsed > CUSTOM_SIZE_MAX) {
    return undefined;
  }

  return parsed;
}

function normalizeResizeSettings(value: unknown): CropResizeSettings {
  const source = isRecord(value) ? value : {};
  const defaults = DEFAULT_CROP_NODE_DATA.resize;

  const mode: CropResizeMode = source.mode === "custom" ? "custom" : defaults.mode;
  const fit: CropFitMode =
    source.fit === "contain" || source.fit === "fill" || source.fit === "cover"
      ? source.fit
      : defaults.fit;
  const keepAspect = typeof source.keepAspect === "boolean" ? source.keepAspect : defaults.keepAspect;

  if (mode !== "custom") {
    return {
      mode,
      fit,
      keepAspect,
    };
  }

  return {
    mode,
    width: normalizeCustomSize(source.width) ?? DEFAULT_CUSTOM_SIZE,
    height: normalizeCustomSize(source.height) ?? DEFAULT_CUSTOM_SIZE,
    fit,
    keepAspect,
  };
}

function assertNoDisallowedPayloadFields(data: Record<string, unknown>): void {
  for (const key of DISALLOWED_CROP_PAYLOAD_KEYS) {
    if (key in data) {
      throw new Error(`Crop node accepts parameter data only. '${key}' is not allowed in data.`);
    }
  }
}

export function normalizeCropNodeData(
  value: unknown,
  options?: {
    rejectDisallowedPayloadFields?: boolean;
  },
): CropNodeData {
  const source = isRecord(value) ? value : {};

  if (options?.rejectDisallowedPayloadFields) {
    assertNoDisallowedPayloadFields(source);
  }

  return {
    crop: normalizeCropRect(source.crop),
    resize: normalizeResizeSettings(source.resize),
  };
}
