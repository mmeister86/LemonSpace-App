export type AdjustmentNodeKind = "curves" | "color-adjust" | "light-adjust" | "detail-adjust";

export type CurvePoint = {
  x: number;
  y: number;
};

export type CurvesData = {
  channelMode: "rgb" | "red" | "green" | "blue";
  points: {
    rgb: CurvePoint[];
    red: CurvePoint[];
    green: CurvePoint[];
    blue: CurvePoint[];
  };
  levels: {
    blackPoint: number;
    whitePoint: number;
    gamma: number;
  };
  preset: string | null;
};

export type ColorAdjustData = {
  hsl: {
    hue: number;
    saturation: number;
    luminance: number;
  };
  temperature: number;
  tint: number;
  vibrance: number;
  preset: string | null;
};

export type LightAdjustData = {
  brightness: number;
  contrast: number;
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vignette: {
    amount: number;
    size: number;
    roundness: number;
  };
  preset: string | null;
};

export type DetailAdjustData = {
  sharpen: {
    amount: number;
    radius: number;
    threshold: number;
  };
  clarity: number;
  denoise: {
    luminance: number;
    color: number;
  };
  grain: {
    amount: number;
    size: number;
  };
  preset: string | null;
};

export type NormalizedCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropResizeOptions = {
  width: number | null;
  height: number | null;
};

export type CropResizeStepParams = {
  cropRect: NormalizedCropRect;
  resize: CropResizeOptions | null;
};

export const DEFAULT_CURVES_DATA: CurvesData = {
  channelMode: "rgb",
  points: {
    rgb: [
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ],
    red: [
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ],
    green: [
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ],
    blue: [
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ],
  },
  levels: {
    blackPoint: 0,
    whitePoint: 255,
    gamma: 1,
  },
  preset: null,
};

export const DEFAULT_COLOR_ADJUST_DATA: ColorAdjustData = {
  hsl: {
    hue: 0,
    saturation: 0,
    luminance: 0,
  },
  temperature: 0,
  tint: 0,
  vibrance: 0,
  preset: null,
};

export const DEFAULT_LIGHT_ADJUST_DATA: LightAdjustData = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  vignette: {
    amount: 0,
    size: 0.5,
    roundness: 1,
  },
  preset: null,
};

export const DEFAULT_DETAIL_ADJUST_DATA: DetailAdjustData = {
  sharpen: {
    amount: 0,
    radius: 1,
    threshold: 0,
  },
  clarity: 0,
  denoise: {
    luminance: 0,
    color: 0,
  },
  grain: {
    amount: 0,
    size: 1,
  },
  preset: null,
};

export const DEFAULT_CROP_RESIZE_STEP_PARAMS: CropResizeStepParams = {
  cropRect: {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  },
  resize: null,
};

export function cloneAdjustmentData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePositiveIntOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

function normalizeCropRect(value: unknown): NormalizedCropRect {
  const input = (value ?? {}) as Record<string, unknown>;

  const normalizedX = clamp(safeNumber(input.x, 0), 0, 1);
  const normalizedY = clamp(safeNumber(input.y, 0), 0, 1);
  const maxWidth = Math.max(0.0001, 1 - normalizedX);
  const maxHeight = Math.max(0.0001, 1 - normalizedY);

  return {
    x: normalizedX,
    y: normalizedY,
    width: clamp(safeNumber(input.width, 1), 0.0001, maxWidth),
    height: clamp(safeNumber(input.height, 1), 0.0001, maxHeight),
  };
}

export function normalizeCropResizeStepParams(value: unknown): CropResizeStepParams {
  const input = (value ?? {}) as Record<string, unknown>;
  const cropRectCandidate =
    (input.cropRect as Record<string, unknown> | undefined) ??
    (input.crop as Record<string, unknown> | undefined) ??
    (input.rect as Record<string, unknown> | undefined) ??
    input;
  const resizeCandidate = (input.resize ?? {}) as Record<string, unknown>;

  const resizeWidth = normalizePositiveIntOrNull(resizeCandidate.width ?? resizeCandidate.targetWidth);
  const resizeHeight = normalizePositiveIntOrNull(resizeCandidate.height ?? resizeCandidate.targetHeight);

  return {
    cropRect: normalizeCropRect(cropRectCandidate),
    resize:
      resizeWidth === null && resizeHeight === null
        ? null
        : {
            width: resizeWidth,
            height: resizeHeight,
          },
  };
}

function normalizeCurvePoints(points: unknown): CurvePoint[] {
  if (!Array.isArray(points)) {
    return cloneAdjustmentData(DEFAULT_CURVES_DATA.points.rgb);
  }

  const normalized = points
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const record = point as Record<string, unknown>;
      return {
        x: clamp(safeNumber(record.x, 0), 0, 255),
        y: clamp(safeNumber(record.y, 0), 0, 255),
      };
    })
    .filter((point): point is CurvePoint => point !== null)
    .sort((a, b) => a.x - b.x);

  if (normalized.length >= 2) return normalized;
  return cloneAdjustmentData(DEFAULT_CURVES_DATA.points.rgb);
}

export function normalizeCurvesData(value: unknown): CurvesData {
  const input = (value ?? {}) as Record<string, unknown>;
  const levels = (input.levels ?? {}) as Record<string, unknown>;
  const points = (input.points ?? {}) as Record<string, unknown>;
  const channelMode =
    input.channelMode === "red" ||
    input.channelMode === "green" ||
    input.channelMode === "blue" ||
    input.channelMode === "rgb"
      ? input.channelMode
      : DEFAULT_CURVES_DATA.channelMode;

  return {
    channelMode,
    points: {
      rgb: normalizeCurvePoints(points.rgb),
      red: normalizeCurvePoints(points.red),
      green: normalizeCurvePoints(points.green),
      blue: normalizeCurvePoints(points.blue),
    },
    levels: {
      blackPoint: clamp(safeNumber(levels.blackPoint, 0), 0, 255),
      whitePoint: clamp(safeNumber(levels.whitePoint, 255), 0, 255),
      gamma: clamp(safeNumber(levels.gamma, 1), 0.1, 10),
    },
    preset: typeof input.preset === "string" ? input.preset : null,
  };
}

export function normalizeColorAdjustData(value: unknown): ColorAdjustData {
  const input = (value ?? {}) as Record<string, unknown>;
  const hsl = (input.hsl ?? {}) as Record<string, unknown>;
  return {
    hsl: {
      hue: clamp(safeNumber(hsl.hue, 0), -180, 180),
      saturation: clamp(safeNumber(hsl.saturation, 0), -100, 100),
      luminance: clamp(safeNumber(hsl.luminance, 0), -100, 100),
    },
    temperature: clamp(safeNumber(input.temperature, 0), -100, 100),
    tint: clamp(safeNumber(input.tint, 0), -100, 100),
    vibrance: clamp(safeNumber(input.vibrance, 0), -100, 100),
    preset: typeof input.preset === "string" ? input.preset : null,
  };
}

export function normalizeLightAdjustData(value: unknown): LightAdjustData {
  const input = (value ?? {}) as Record<string, unknown>;
  const vignette = (input.vignette ?? {}) as Record<string, unknown>;
  return {
    brightness: clamp(safeNumber(input.brightness, 0), -100, 100),
    contrast: clamp(safeNumber(input.contrast, 0), -100, 100),
    exposure: clamp(safeNumber(input.exposure, 0), -5, 5),
    highlights: clamp(safeNumber(input.highlights, 0), -100, 100),
    shadows: clamp(safeNumber(input.shadows, 0), -100, 100),
    whites: clamp(safeNumber(input.whites, 0), -100, 100),
    blacks: clamp(safeNumber(input.blacks, 0), -100, 100),
    vignette: {
      amount: clamp(safeNumber(vignette.amount, 0), 0, 1),
      size: clamp(safeNumber(vignette.size, 0.5), 0, 1),
      roundness: clamp(safeNumber(vignette.roundness, 1), 0, 1),
    },
    preset: typeof input.preset === "string" ? input.preset : null,
  };
}

export function normalizeDetailAdjustData(value: unknown): DetailAdjustData {
  const input = (value ?? {}) as Record<string, unknown>;
  const sharpen = (input.sharpen ?? {}) as Record<string, unknown>;
  const denoise = (input.denoise ?? {}) as Record<string, unknown>;
  const grain = (input.grain ?? {}) as Record<string, unknown>;
  return {
    sharpen: {
      amount: clamp(safeNumber(sharpen.amount, 0), 0, 500),
      radius: clamp(safeNumber(sharpen.radius, 1), 0.5, 5),
      threshold: clamp(safeNumber(sharpen.threshold, 0), 0, 255),
    },
    clarity: clamp(safeNumber(input.clarity, 0), -100, 100),
    denoise: {
      luminance: clamp(safeNumber(denoise.luminance, 0), 0, 100),
      color: clamp(safeNumber(denoise.color, 0), 0, 100),
    },
    grain: {
      amount: clamp(safeNumber(grain.amount, 0), 0, 100),
      size: clamp(safeNumber(grain.size, 1), 0.5, 3),
    },
    preset: typeof input.preset === "string" ? input.preset : null,
  };
}
