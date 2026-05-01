/**
 * Onboarding note:
 * Renders and manages the Canvas image transform operation config node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type {
  FaceRestoreMode,
  ImageTransformOperation,
  ImageTransformType,
  StyleTransferEngine,
  StyleTransferFlavor,
  StyleTransferPortraitBeautifier,
  StyleTransferPortraitStyle,
  UpscaleFlavor,
  UpscaleScale,
} from "@/lib/image-transform-models";

import type { TransformNodeData } from "./image-transform-node-types";

export const STYLE_TRANSFER_FLAVORS: StyleTransferFlavor[] = [
  "faithful",
  "gen_z",
  "psychedelia",
  "detaily",
  "clear",
  "donotstyle",
  "donotstyle_sharp",
];

export const STYLE_TRANSFER_ENGINES: StyleTransferEngine[] = [
  "balanced",
  "definio",
  "illusio",
  "3d_cartoon",
  "colorful_anime",
  "caricature",
  "real",
  "super_real",
  "softy",
];

export const STYLE_TRANSFER_PORTRAIT_STYLES: StyleTransferPortraitStyle[] = [
  "standard",
  "pop",
  "super_pop",
];

export const STYLE_TRANSFER_PORTRAIT_BEAUTIFIERS: StyleTransferPortraitBeautifier[] = [
  "none",
  "beautify_face",
  "beautify_face_max",
];

export function defaultOperation(type: ImageTransformType): ImageTransformOperation {
  switch (type) {
    case "bg-remove":
      return { type };
    case "upscale":
      return {
        type,
        scale: 2,
        outputFormat: "png",
        flavor: "photo",
        sharpen: 7,
        grain: 7,
        ultraDetail: 30,
      };
    case "style-transfer":
      return {
        type,
        styleStrength: 100,
        structureStrength: 50,
        flavor: "faithful",
        engine: "balanced",
        fixedGeneration: false,
        isPortrait: false,
        portraitStyle: "standard",
        portraitBeautifier: "none",
      };
    case "face-restore":
      return { type, mode: "faithful" };
    case "change-camera":
      return {
        type,
        horizontalAngle: 0,
        verticalAngle: 0,
        zoom: 5,
        outputFormat: "png",
      };
  }
}

export function normalizeOperation(
  type: ImageTransformType,
  parameters: TransformNodeData["parameters"],
): ImageTransformOperation {
  const fallback = defaultOperation(type);
  if (!parameters || parameters.type !== type) {
    return fallback;
  }

  if (type === "upscale") {
    return {
      type,
      scale: [2, 4, 8, 16].includes(parameters.scale as number)
        ? (parameters.scale as UpscaleScale)
        : 2,
      outputFormat: parameters.outputFormat === "jpeg" ? "jpeg" : "png",
      flavor:
        parameters.flavor === "sublime" ||
        parameters.flavor === "photo_denoiser" ||
        parameters.flavor === "photo"
          ? (parameters.flavor as UpscaleFlavor)
          : "photo",
      sharpen: typeof parameters.sharpen === "number" ? parameters.sharpen : 7,
      grain: typeof parameters.grain === "number" ? parameters.grain : 7,
      ultraDetail:
        typeof parameters.ultraDetail === "number" ? parameters.ultraDetail : 30,
    };
  }

  if (type === "style-transfer") {
    return {
      type,
      styleStrength:
        typeof parameters.styleStrength === "number" ? parameters.styleStrength : 100,
      structureStrength:
        typeof parameters.structureStrength === "number"
          ? parameters.structureStrength
          : 50,
      flavor: STYLE_TRANSFER_FLAVORS.includes(parameters.flavor as StyleTransferFlavor)
        ? (parameters.flavor as StyleTransferFlavor)
        : "faithful",
      engine: STYLE_TRANSFER_ENGINES.includes(parameters.engine as StyleTransferEngine)
        ? (parameters.engine as StyleTransferEngine)
        : "balanced",
      fixedGeneration:
        typeof parameters.fixedGeneration === "boolean"
          ? parameters.fixedGeneration
          : false,
      isPortrait:
        typeof parameters.isPortrait === "boolean" ? parameters.isPortrait : false,
      portraitStyle: STYLE_TRANSFER_PORTRAIT_STYLES.includes(
        parameters.portraitStyle as StyleTransferPortraitStyle,
      )
        ? (parameters.portraitStyle as StyleTransferPortraitStyle)
        : "standard",
      portraitBeautifier: STYLE_TRANSFER_PORTRAIT_BEAUTIFIERS.includes(
        parameters.portraitBeautifier as StyleTransferPortraitBeautifier,
      )
        ? (parameters.portraitBeautifier as StyleTransferPortraitBeautifier)
        : "none",
    };
  }

  if (type === "face-restore") {
    const mode =
      parameters.mode === "creative" || parameters.mode === "flexible" || parameters.mode === "faithful"
        ? (parameters.mode as FaceRestoreMode)
        : "faithful";
    return {
      type,
      mode,
      preset: typeof parameters.preset === "string" ? parameters.preset : undefined,
    };
  }

  if (type === "change-camera") {
    return {
      type,
      horizontalAngle:
        typeof parameters.horizontalAngle === "number" ? parameters.horizontalAngle : 0,
      verticalAngle:
        typeof parameters.verticalAngle === "number" ? parameters.verticalAngle : 0,
      zoom: typeof parameters.zoom === "number" ? parameters.zoom : 5,
      outputFormat: parameters.outputFormat === "jpeg" ? "jpeg" : "png",
      seed: typeof parameters.seed === "number" ? parameters.seed : undefined,
    };
  }

  return fallback;
}
