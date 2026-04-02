import {
  cloneAdjustmentData,
  DEFAULT_COLOR_ADJUST_DATA,
  DEFAULT_CURVES_DATA,
  DEFAULT_DETAIL_ADJUST_DATA,
  DEFAULT_LIGHT_ADJUST_DATA,
  type ColorAdjustData,
  type CurvesData,
  type DetailAdjustData,
  type LightAdjustData,
} from "@/lib/image-pipeline/adjustment-types";

export const CURVE_PRESETS: Record<string, CurvesData> = {
  contrast: {
    ...cloneAdjustmentData(DEFAULT_CURVES_DATA),
    points: {
      ...cloneAdjustmentData(DEFAULT_CURVES_DATA.points),
      rgb: [
        { x: 0, y: 0 },
        { x: 64, y: 48 },
        { x: 192, y: 220 },
        { x: 255, y: 255 },
      ],
    },
    preset: "contrast",
  },
  brighten: {
    ...cloneAdjustmentData(DEFAULT_CURVES_DATA),
    levels: {
      blackPoint: 0,
      whitePoint: 245,
      gamma: 0.9,
    },
    preset: "brighten",
  },
  film: {
    ...cloneAdjustmentData(DEFAULT_CURVES_DATA),
    points: {
      ...cloneAdjustmentData(DEFAULT_CURVES_DATA.points),
      rgb: [
        { x: 0, y: 8 },
        { x: 74, y: 68 },
        { x: 180, y: 196 },
        { x: 255, y: 248 },
      ],
    },
    preset: "film",
  },
};

export const COLOR_PRESETS: Record<string, ColorAdjustData> = {
  warm: {
    ...cloneAdjustmentData(DEFAULT_COLOR_ADJUST_DATA),
    temperature: 24,
    tint: 6,
    vibrance: 22,
    preset: "warm",
  },
  cool: {
    ...cloneAdjustmentData(DEFAULT_COLOR_ADJUST_DATA),
    temperature: -22,
    tint: -4,
    vibrance: 14,
    preset: "cool",
  },
  vintage: {
    ...cloneAdjustmentData(DEFAULT_COLOR_ADJUST_DATA),
    hsl: { hue: -6, saturation: -18, luminance: 4 },
    temperature: 14,
    tint: 5,
    vibrance: -12,
    preset: "vintage",
  },
};

export const LIGHT_PRESETS: Record<string, LightAdjustData> = {
  hdr: {
    ...cloneAdjustmentData(DEFAULT_LIGHT_ADJUST_DATA),
    contrast: 24,
    exposure: 0.3,
    highlights: -34,
    shadows: 38,
    whites: 18,
    blacks: -16,
    preset: "hdr",
  },
  lowkey: {
    ...cloneAdjustmentData(DEFAULT_LIGHT_ADJUST_DATA),
    brightness: -18,
    contrast: 28,
    exposure: -0.4,
    highlights: -20,
    shadows: -8,
    whites: -10,
    blacks: -22,
    preset: "lowkey",
  },
  highkey: {
    ...cloneAdjustmentData(DEFAULT_LIGHT_ADJUST_DATA),
    brightness: 18,
    contrast: -8,
    exposure: 0.5,
    highlights: 22,
    shadows: 16,
    whites: 26,
    blacks: 8,
    preset: "highkey",
  },
};

export const DETAIL_PRESETS: Record<string, DetailAdjustData> = {
  web: {
    ...cloneAdjustmentData(DEFAULT_DETAIL_ADJUST_DATA),
    sharpen: {
      amount: 72,
      radius: 1,
      threshold: 6,
    },
    clarity: 10,
    preset: "web",
  },
  print: {
    ...cloneAdjustmentData(DEFAULT_DETAIL_ADJUST_DATA),
    sharpen: {
      amount: 120,
      radius: 1.6,
      threshold: 4,
    },
    denoise: {
      luminance: 8,
      color: 10,
    },
    preset: "print",
  },
  "film-grain": {
    ...cloneAdjustmentData(DEFAULT_DETAIL_ADJUST_DATA),
    grain: {
      amount: 22,
      size: 1.4,
    },
    clarity: -6,
    preset: "film-grain",
  },
};
