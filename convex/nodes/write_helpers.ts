import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isAdjustmentNodeType } from "../../lib/canvas-node-types";
import { normalizeCropNodeData } from "../../lib/image-pipeline/crop-node-data";
import { preserveNodeFavorite } from "../../lib/canvas-node-favorite";

const DISALLOWED_ADJUSTMENT_DATA_KEYS = [
  "blob",
  "blobUrl",
  "imageData",
] as const;

const DISALLOWED_NON_RENDER_ADJUSTMENT_DATA_KEYS = [
  "storageId",
  "url",
] as const;

const RENDER_OUTPUT_RESOLUTIONS = ["original", "2x", "custom"] as const;
const RENDER_FORMATS = ["png", "jpeg", "webp"] as const;
const CUSTOM_RENDER_DIMENSION_MIN = 1;
const CUSTOM_RENDER_DIMENSION_MAX = 16384;
const DEFAULT_RENDER_OUTPUT_RESOLUTION = "original" as const;
const DEFAULT_RENDER_FORMAT = "png" as const;
const DEFAULT_RENDER_JPEG_QUALITY = 90;

type RenderOutputResolution = (typeof RENDER_OUTPUT_RESOLUTIONS)[number];
type RenderFormat = (typeof RENDER_FORMATS)[number];

export function estimateSerializedBytes(value: unknown): number | null {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoAdjustmentImagePayload(
  nodeType: Doc<"nodes">["type"],
  data: unknown,
): void {
  if (!isAdjustmentNodeType(nodeType) || !isRecord(data)) {
    return;
  }

  for (const key of DISALLOWED_ADJUSTMENT_DATA_KEYS) {
    if (key in data) {
      throw new Error(
        `Adjustment nodes accept parameter data only. '${key}' is not allowed in data.`,
      );
    }
  }

  if (nodeType === "render") {
    return;
  }

  for (const key of DISALLOWED_NON_RENDER_ADJUSTMENT_DATA_KEYS) {
    if (key in data) {
      throw new Error(
        `Adjustment nodes '${nodeType}' do not allow '${key}' in data.`,
      );
    }
  }
}

function parseRenderOutputResolution(value: unknown): RenderOutputResolution {
  if (value === undefined) {
    return DEFAULT_RENDER_OUTPUT_RESOLUTION;
  }
  if (
    typeof value !== "string" ||
    !RENDER_OUTPUT_RESOLUTIONS.includes(value as RenderOutputResolution)
  ) {
    throw new Error("Render data 'outputResolution' must be one of: original, 2x, custom.");
  }
  return value as RenderOutputResolution;
}

function parseRenderCustomDimension(fieldName: "customWidth" | "customHeight", value: unknown): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < CUSTOM_RENDER_DIMENSION_MIN ||
    (value as number) > CUSTOM_RENDER_DIMENSION_MAX
  ) {
    throw new Error(
      `Render data '${fieldName}' must be an integer between ${CUSTOM_RENDER_DIMENSION_MIN} and ${CUSTOM_RENDER_DIMENSION_MAX}.`,
    );
  }
  return value as number;
}

function parseRenderFormat(value: unknown): RenderFormat {
  if (value === undefined) {
    return DEFAULT_RENDER_FORMAT;
  }
  if (typeof value !== "string" || !RENDER_FORMATS.includes(value as RenderFormat)) {
    throw new Error("Render data 'format' must be one of: png, jpeg, webp.");
  }
  return value as RenderFormat;
}

function parseRenderJpegQuality(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_RENDER_JPEG_QUALITY;
  }
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw new Error("Render data 'jpegQuality' must be an integer between 1 and 100.");
  }
  return value as number;
}

function parseOptionalPositiveInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Render data '${fieldName}' must be a positive integer.`);
  }
  return value as number;
}

function parseOptionalNonNegativeInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Render data '${fieldName}' must be a non-negative integer.`);
  }
  return value as number;
}

function normalizeRenderData(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) {
    throw new Error("Render node data must be an object.");
  }

  assertNoAdjustmentImagePayload("render", data);

  const outputResolution = parseRenderOutputResolution(data.outputResolution);

  const normalized: Record<string, unknown> = {
    outputResolution,
    format: parseRenderFormat(data.format),
    jpegQuality: parseRenderJpegQuality(data.jpegQuality),
  };

  if (outputResolution === "custom") {
    if (data.customWidth !== undefined) {
      normalized.customWidth = parseRenderCustomDimension("customWidth", data.customWidth);
    }
    if (data.customHeight !== undefined) {
      normalized.customHeight = parseRenderCustomDimension("customHeight", data.customHeight);
    }
  }

  if (data.lastRenderedAt !== undefined) {
    if (typeof data.lastRenderedAt !== "number" || !Number.isFinite(data.lastRenderedAt)) {
      throw new Error("Render data 'lastRenderedAt' must be a finite number.");
    }
    normalized.lastRenderedAt = data.lastRenderedAt;
  }

  if (data.lastRenderedHash !== undefined) {
    if (typeof data.lastRenderedHash !== "string" || data.lastRenderedHash.length === 0) {
      throw new Error("Render data 'lastRenderedHash' must be a non-empty string when provided.");
    }
    normalized.lastRenderedHash = data.lastRenderedHash;
  }

  if (data.lastRenderWidth !== undefined) {
    normalized.lastRenderWidth = parseOptionalPositiveInteger("lastRenderWidth", data.lastRenderWidth);
  }

  if (data.lastRenderHeight !== undefined) {
    normalized.lastRenderHeight = parseOptionalPositiveInteger("lastRenderHeight", data.lastRenderHeight);
  }

  if (data.lastRenderFormat !== undefined) {
    normalized.lastRenderFormat = parseRenderFormat(data.lastRenderFormat);
  }

  if (data.lastRenderMimeType !== undefined) {
    if (typeof data.lastRenderMimeType !== "string" || data.lastRenderMimeType.length === 0) {
      throw new Error("Render data 'lastRenderMimeType' must be a non-empty string when provided.");
    }
    normalized.lastRenderMimeType = data.lastRenderMimeType;
  }

  if (data.lastRenderSizeBytes !== undefined) {
    normalized.lastRenderSizeBytes = parseOptionalNonNegativeInteger(
      "lastRenderSizeBytes",
      data.lastRenderSizeBytes,
    );
  }

  if (data.lastRenderQuality !== undefined) {
    if (data.lastRenderQuality !== null) {
      if (
        typeof data.lastRenderQuality !== "number" ||
        !Number.isFinite(data.lastRenderQuality) ||
        data.lastRenderQuality < 0 ||
        data.lastRenderQuality > 1
      ) {
        throw new Error("Render data 'lastRenderQuality' must be null or a number between 0 and 1.");
      }
    }
    normalized.lastRenderQuality = data.lastRenderQuality;
  }

  if (data.lastRenderSourceWidth !== undefined) {
    normalized.lastRenderSourceWidth = parseOptionalPositiveInteger(
      "lastRenderSourceWidth",
      data.lastRenderSourceWidth,
    );
  }

  if (data.lastRenderSourceHeight !== undefined) {
    normalized.lastRenderSourceHeight = parseOptionalPositiveInteger(
      "lastRenderSourceHeight",
      data.lastRenderSourceHeight,
    );
  }

  if (data.lastRenderWasSizeClamped !== undefined) {
    if (typeof data.lastRenderWasSizeClamped !== "boolean") {
      throw new Error("Render data 'lastRenderWasSizeClamped' must be a boolean when provided.");
    }
    normalized.lastRenderWasSizeClamped = data.lastRenderWasSizeClamped;
  }

  if (data.lastRenderError !== undefined) {
    if (typeof data.lastRenderError !== "string" || data.lastRenderError.length === 0) {
      throw new Error("Render data 'lastRenderError' must be a non-empty string when provided.");
    }
    normalized.lastRenderError = data.lastRenderError;
  }

  if (data.lastRenderErrorHash !== undefined) {
    if (typeof data.lastRenderErrorHash !== "string" || data.lastRenderErrorHash.length === 0) {
      throw new Error("Render data 'lastRenderErrorHash' must be a non-empty string when provided.");
    }
    normalized.lastRenderErrorHash = data.lastRenderErrorHash;
  }

  if (data.lastUploadedAt !== undefined) {
    if (typeof data.lastUploadedAt !== "number" || !Number.isFinite(data.lastUploadedAt)) {
      throw new Error("Render data 'lastUploadedAt' must be a finite number.");
    }
    normalized.lastUploadedAt = data.lastUploadedAt;
  }

  if (data.lastUploadedHash !== undefined) {
    if (typeof data.lastUploadedHash !== "string" || data.lastUploadedHash.length === 0) {
      throw new Error("Render data 'lastUploadedHash' must be a non-empty string when provided.");
    }
    normalized.lastUploadedHash = data.lastUploadedHash;
  }

  if (data.lastUploadStorageId !== undefined) {
    if (typeof data.lastUploadStorageId !== "string" || data.lastUploadStorageId.length === 0) {
      throw new Error("Render data 'lastUploadStorageId' must be a non-empty string when provided.");
    }
    normalized.lastUploadStorageId = data.lastUploadStorageId;
  }

  if (data.lastUploadUrl !== undefined) {
    if (typeof data.lastUploadUrl !== "string" || data.lastUploadUrl.length === 0) {
      throw new Error("Render data 'lastUploadUrl' must be a non-empty string when provided.");
    }
    normalized.lastUploadUrl = data.lastUploadUrl;
  }

  if (data.lastUploadMimeType !== undefined) {
    if (typeof data.lastUploadMimeType !== "string" || data.lastUploadMimeType.length === 0) {
      throw new Error("Render data 'lastUploadMimeType' must be a non-empty string when provided.");
    }
    normalized.lastUploadMimeType = data.lastUploadMimeType;
  }

  if (data.lastUploadSizeBytes !== undefined) {
    normalized.lastUploadSizeBytes = parseOptionalNonNegativeInteger(
      "lastUploadSizeBytes",
      data.lastUploadSizeBytes,
    );
  }

  if (data.lastUploadFilename !== undefined) {
    if (typeof data.lastUploadFilename !== "string" || data.lastUploadFilename.length === 0) {
      throw new Error("Render data 'lastUploadFilename' must be a non-empty string when provided.");
    }
    normalized.lastUploadFilename = data.lastUploadFilename;
  }

  if (data.lastUploadError !== undefined) {
    if (typeof data.lastUploadError !== "string" || data.lastUploadError.length === 0) {
      throw new Error("Render data 'lastUploadError' must be a non-empty string when provided.");
    }
    normalized.lastUploadError = data.lastUploadError;
  }

  if (data.lastUploadErrorHash !== undefined) {
    if (typeof data.lastUploadErrorHash !== "string" || data.lastUploadErrorHash.length === 0) {
      throw new Error("Render data 'lastUploadErrorHash' must be a non-empty string when provided.");
    }
    normalized.lastUploadErrorHash = data.lastUploadErrorHash;
  }

  if (data.storageId !== undefined) {
    if (typeof data.storageId !== "string" || data.storageId.length === 0) {
      throw new Error("Render data 'storageId' must be a non-empty string when provided.");
    }
    normalized.storageId = data.storageId;
  }

  if (data.url !== undefined) {
    if (typeof data.url !== "string" || data.url.length === 0) {
      throw new Error("Render data 'url' must be a non-empty string when provided.");
    }
    normalized.url = data.url;
  }

  return normalized;
}

export function normalizeNodeDataForWrite(
  nodeType: Doc<"nodes">["type"],
  data: unknown,
): unknown {
  if (nodeType === "crop") {
    return preserveNodeFavorite(
      normalizeCropNodeData(data, {
        rejectDisallowedPayloadFields: true,
      }),
      data,
    );
  }

  if (!isAdjustmentNodeType(nodeType)) {
    return data;
  }

  if (!isRecord(data)) {
    throw new Error(`Adjustment node '${nodeType}' data must be an object.`);
  }

  if (nodeType === "render") {
    return preserveNodeFavorite(normalizeRenderData(data), data);
  }

  assertNoAdjustmentImagePayload(nodeType, data);
  return preserveNodeFavorite(data, data);
}

export async function insertNodeForWrite(
  ctx: MutationCtx,
  args: {
    canvasId: Id<"canvases">;
    type: Doc<"nodes">["type"];
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: unknown;
    parentId?: Id<"nodes">;
    zIndex?: number;
  },
): Promise<Id<"nodes">> {
  return await ctx.db.insert("nodes", {
    canvasId: args.canvasId,
    type: args.type,
    positionX: args.positionX,
    positionY: args.positionY,
    width: args.width,
    height: args.height,
    status: "idle",
    retryCount: 0,
    data: normalizeNodeDataForWrite(args.type, args.data),
    parentId: args.parentId,
    zIndex: args.zIndex,
  });
}
