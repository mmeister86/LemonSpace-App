/**
 * Onboarding note:
 * Renders and manages the Canvas render node state node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { preserveNodeFavorite } from "@/lib/canvas-node-favorite";

export type RenderResolutionOption = "original" | "2x" | "custom";
export type RenderFormatOption = "png" | "jpeg" | "webp";

export type SourceNodeDescriptor = {
  id: string;
  type: string;
  data?: unknown;
};

export type RenderNodeData = {
  outputResolution?: RenderResolutionOption | string;
  customWidth?: number;
  customHeight?: number;
  format?: RenderFormatOption | string;
  jpegQuality?: number;
  lastRenderedAt?: number;
  lastRenderedHash?: string;
  lastRenderWidth?: number;
  lastRenderHeight?: number;
  lastRenderFormat?: RenderFormatOption;
  lastRenderMimeType?: string;
  lastRenderSizeBytes?: number;
  lastRenderQuality?: number | null;
  lastRenderSourceWidth?: number;
  lastRenderSourceHeight?: number;
  lastRenderWasSizeClamped?: boolean;
  lastRenderError?: string;
  lastRenderErrorHash?: string;
  storageId?: string;
  url?: string;
  lastUploadedAt?: number;
  lastUploadedHash?: string;
  lastUploadStorageId?: string;
  lastUploadUrl?: string;
  lastUploadMimeType?: string;
  lastUploadSizeBytes?: number;
  lastUploadFilename?: string;
  lastUploadError?: string;
  lastUploadErrorHash?: string;
  isFavorite?: true;
  _status?: string;
  _statusMessage?: string;
};

export type RenderState = "idle" | "rendering" | "done" | "error";

export type PersistedRenderData = {
  outputResolution: RenderResolutionOption;
  customWidth?: number;
  customHeight?: number;
  format: RenderFormatOption;
  jpegQuality: number;
  lastRenderedAt?: number;
  lastRenderedHash?: string;
  lastRenderWidth?: number;
  lastRenderHeight?: number;
  lastRenderFormat?: RenderFormatOption;
  lastRenderMimeType?: string;
  lastRenderSizeBytes?: number;
  lastRenderQuality?: number | null;
  lastRenderSourceWidth?: number;
  lastRenderSourceHeight?: number;
  lastRenderWasSizeClamped?: boolean;
  lastRenderError?: string;
  lastRenderErrorHash?: string;
  storageId?: string;
  url?: string;
  lastUploadedAt?: number;
  lastUploadedHash?: string;
  lastUploadStorageId?: string;
  lastUploadUrl?: string;
  lastUploadMimeType?: string;
  lastUploadSizeBytes?: number;
  lastUploadFilename?: string;
  lastUploadError?: string;
  lastUploadErrorHash?: string;
  isFavorite?: true;
};

export const DEFAULT_OUTPUT_RESOLUTION: RenderResolutionOption = "original";
export const DEFAULT_FORMAT: RenderFormatOption = "png";
export const DEFAULT_JPEG_QUALITY = 90;
export const MIN_CUSTOM_DIMENSION = 1;
export const MAX_CUSTOM_DIMENSION = 16_384;
export const RENDER_MIN_WIDTH = 260;
export const RENDER_MIN_HEIGHT = 300;
export const ASPECT_RATIO_TOLERANCE = 0.015;
export const SIZE_TOLERANCE_PX = 1;

export function logRenderDebug(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[RenderNode debug]", event, payload);
}

export function readPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function toRatioConstrainedSize(args: {
  currentWidth: number;
  currentHeight: number;
  aspectRatio: number;
  minWidth: number;
  minHeight: number;
}): { width: number; height: number } {
  const { currentWidth, currentHeight, aspectRatio, minWidth, minHeight } = args;

  const fromWidth = () => {
    let width = Math.max(minWidth, currentWidth);
    let height = width / aspectRatio;
    if (height < minHeight) {
      height = minHeight;
      width = height * aspectRatio;
    }
    return { width: Math.round(width), height: Math.round(height) };
  };

  const fromHeight = () => {
    let height = Math.max(minHeight, currentHeight);
    let width = height * aspectRatio;
    if (width < minWidth) {
      width = minWidth;
      height = width / aspectRatio;
    }
    return { width: Math.round(width), height: Math.round(height) };
  };

  const widthCandidate = fromWidth();
  const heightCandidate = fromHeight();
  const widthDistance =
    Math.abs(widthCandidate.width - currentWidth) +
    Math.abs(widthCandidate.height - currentHeight);
  const heightDistance =
    Math.abs(heightCandidate.width - currentWidth) +
    Math.abs(heightCandidate.height - currentHeight);

  return widthDistance <= heightDistance ? widthCandidate : heightCandidate;
}

export function sanitizeDimension(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_CUSTOM_DIMENSION || rounded > MAX_CUSTOM_DIMENSION) {
    return undefined;
  }
  return rounded;
}

export function sanitizeRenderData(data: RenderNodeData): PersistedRenderData {
  const outputResolution: RenderResolutionOption =
    data.outputResolution === "2x" || data.outputResolution === "custom"
      ? data.outputResolution
      : DEFAULT_OUTPUT_RESOLUTION;
  const format: RenderFormatOption =
    data.format === "jpeg" || data.format === "webp" ? data.format : DEFAULT_FORMAT;
  const jpegQuality =
    typeof data.jpegQuality === "number" && Number.isFinite(data.jpegQuality)
      ? Math.max(1, Math.min(100, Math.round(data.jpegQuality)))
      : DEFAULT_JPEG_QUALITY;
  const next: PersistedRenderData = { outputResolution, format, jpegQuality };

  if (outputResolution === "custom") {
    const width = sanitizeDimension(data.customWidth);
    const height = sanitizeDimension(data.customHeight);
    if (width !== undefined) next.customWidth = width;
    if (height !== undefined) next.customHeight = height;
  }
  if (typeof data.lastRenderedAt === "number" && Number.isFinite(data.lastRenderedAt)) next.lastRenderedAt = data.lastRenderedAt;
  if (typeof data.lastRenderedHash === "string" && data.lastRenderedHash.length > 0) next.lastRenderedHash = data.lastRenderedHash;
  if (typeof data.lastRenderWidth === "number" && Number.isFinite(data.lastRenderWidth)) next.lastRenderWidth = Math.max(1, Math.round(data.lastRenderWidth));
  if (typeof data.lastRenderHeight === "number" && Number.isFinite(data.lastRenderHeight)) next.lastRenderHeight = Math.max(1, Math.round(data.lastRenderHeight));
  if (data.lastRenderFormat === "png" || data.lastRenderFormat === "jpeg" || data.lastRenderFormat === "webp") next.lastRenderFormat = data.lastRenderFormat;
  if (typeof data.lastRenderMimeType === "string" && data.lastRenderMimeType.length > 0) next.lastRenderMimeType = data.lastRenderMimeType;
  if (typeof data.lastRenderSizeBytes === "number" && Number.isFinite(data.lastRenderSizeBytes)) next.lastRenderSizeBytes = Math.max(0, Math.round(data.lastRenderSizeBytes));
  if (data.lastRenderQuality === null || (typeof data.lastRenderQuality === "number" && Number.isFinite(data.lastRenderQuality))) next.lastRenderQuality = data.lastRenderQuality;
  if (typeof data.lastRenderSourceWidth === "number" && Number.isFinite(data.lastRenderSourceWidth)) next.lastRenderSourceWidth = Math.max(1, Math.round(data.lastRenderSourceWidth));
  if (typeof data.lastRenderSourceHeight === "number" && Number.isFinite(data.lastRenderSourceHeight)) next.lastRenderSourceHeight = Math.max(1, Math.round(data.lastRenderSourceHeight));
  if (typeof data.lastRenderWasSizeClamped === "boolean") next.lastRenderWasSizeClamped = data.lastRenderWasSizeClamped;
  if (typeof data.lastRenderError === "string" && data.lastRenderError.length > 0) next.lastRenderError = data.lastRenderError;
  if (typeof data.lastRenderErrorHash === "string" && data.lastRenderErrorHash.length > 0) next.lastRenderErrorHash = data.lastRenderErrorHash;
  if (typeof data.storageId === "string" && data.storageId.length > 0) next.storageId = data.storageId;
  if (typeof data.url === "string" && data.url.length > 0) next.url = data.url;
  if (typeof data.lastUploadedAt === "number" && Number.isFinite(data.lastUploadedAt)) next.lastUploadedAt = data.lastUploadedAt;
  if (typeof data.lastUploadedHash === "string" && data.lastUploadedHash.length > 0) next.lastUploadedHash = data.lastUploadedHash;
  if (typeof data.lastUploadStorageId === "string" && data.lastUploadStorageId.length > 0) next.lastUploadStorageId = data.lastUploadStorageId;
  if (typeof data.lastUploadUrl === "string" && data.lastUploadUrl.length > 0) next.lastUploadUrl = data.lastUploadUrl;
  if (typeof data.lastUploadMimeType === "string" && data.lastUploadMimeType.length > 0) next.lastUploadMimeType = data.lastUploadMimeType;
  if (typeof data.lastUploadSizeBytes === "number" && Number.isFinite(data.lastUploadSizeBytes)) next.lastUploadSizeBytes = Math.max(0, Math.round(data.lastUploadSizeBytes));
  if (typeof data.lastUploadFilename === "string" && data.lastUploadFilename.length > 0) next.lastUploadFilename = data.lastUploadFilename;
  if (typeof data.lastUploadError === "string" && data.lastUploadError.length > 0) next.lastUploadError = data.lastUploadError;
  if (typeof data.lastUploadErrorHash === "string" && data.lastUploadErrorHash.length > 0) next.lastUploadErrorHash = data.lastUploadErrorHash;

  return preserveNodeFavorite(next, data) as PersistedRenderData;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function extensionForFormat(format: RenderFormatOption): string {
  return format === "jpeg" ? "jpg" : format;
}
