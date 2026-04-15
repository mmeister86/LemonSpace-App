import type { PipelineStep } from "@/lib/image-pipeline/contracts";

export const RENDER_FORMAT_TO_MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

export type RenderResolution = "original" | "2x" | "custom";
export type RenderFormat = keyof typeof RENDER_FORMAT_TO_MIME;

export type RenderOptions = {
  resolution: RenderResolution;
  customSize?: {
    width: number;
    height: number;
  };
  format: RenderFormat;
  jpegQuality?: number;
};

export type RenderSizeLimits = {
  maxDimension?: number;
  maxPixels?: number;
};

export type RenderSourceComposition = {
  kind: "mixer";
  baseUrl: string;
  overlayUrl: string;
  blendMode: "normal" | "multiply" | "screen" | "overlay";
  opacity: number;
  overlayX: number;
  overlayY: number;
  overlayWidth: number;
  overlayHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
};

export type ResolvedRenderSize = {
  width: number;
  height: number;
  scaleFactor: number;
  wasClamped: boolean;
};

export type RenderFullOptions = {
  sourceUrl?: string;
  sourceComposition?: RenderSourceComposition;
  steps: readonly PipelineStep[];
  render: RenderOptions;
  limits?: RenderSizeLimits;
  signal?: AbortSignal;
};

export type RenderFullResult = {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  format: RenderFormat;
  quality: number | null;
  sizeBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  wasSizeClamped: boolean;
};
