export const IMAGE_TRANSFORM_TYPES = [
  "bg-remove",
  "upscale",
  "style-transfer",
  "face-restore",
] as const;

export type ImageTransformType = (typeof IMAGE_TRANSFORM_TYPES)[number];

export type UpscaleScale = 2 | 4 | 8 | 16;
export type UpscaleOutputFormat = "png" | "jpeg";
export type UpscaleFlavor = "sublime" | "photo" | "photo_denoiser";
export type FaceRestoreMode = "faithful" | "creative" | "flexible";
export type StyleTransferFlavor =
  | "faithful"
  | "gen_z"
  | "psychedelia"
  | "detaily"
  | "clear"
  | "donotstyle"
  | "donotstyle_sharp";
export type StyleTransferEngine =
  | "balanced"
  | "definio"
  | "illusio"
  | "3d_cartoon"
  | "colorful_anime"
  | "caricature"
  | "real"
  | "super_real"
  | "softy";
export type StyleTransferPortraitStyle = "standard" | "pop" | "super_pop";
export type StyleTransferPortraitBeautifier =
  | "none"
  | "beautify_face"
  | "beautify_face_max";

export type ImageTransformOperation =
  | { type: "bg-remove" }
  | {
      type: "upscale";
      scale: UpscaleScale;
      outputFormat: UpscaleOutputFormat;
      flavor: UpscaleFlavor;
      sharpen: number;
      grain: number;
      ultraDetail: number;
    }
  | {
      type: "style-transfer";
      styleStrength: number;
      structureStrength: number;
      flavor: StyleTransferFlavor;
      engine: StyleTransferEngine;
      fixedGeneration: boolean;
      isPortrait: boolean;
      portraitStyle: StyleTransferPortraitStyle;
      portraitBeautifier: StyleTransferPortraitBeautifier;
    }
  | {
      type: "face-restore";
      mode: FaceRestoreMode;
      preset?: string;
    };

export const IMAGE_TRANSFORM_CREDIT_COSTS = {
  "bg-remove": 4,
  upscale: {
    2: 8,
    4: 14,
    8: 24,
    16: 40,
  } satisfies Record<UpscaleScale, number>,
  "style-transfer": 12,
  "face-restore": 10,
} as const;

export function isImageTransformType(value: string): value is ImageTransformType {
  return (IMAGE_TRANSFORM_TYPES as readonly string[]).includes(value);
}

export function getImageTransformCreditCost(operation: ImageTransformOperation): number {
  if (operation.type === "upscale") {
    return IMAGE_TRANSFORM_CREDIT_COSTS.upscale[operation.scale];
  }
  return IMAGE_TRANSFORM_CREDIT_COSTS[operation.type];
}

export function getImageTransformLabel(type: ImageTransformType): string {
  switch (type) {
    case "bg-remove":
      return "BG entfernen";
    case "upscale":
      return "Upscale";
    case "style-transfer":
      return "Style Transfer";
    case "face-restore":
      return "Gesicht";
  }
}
