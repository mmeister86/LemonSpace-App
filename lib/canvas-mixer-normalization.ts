export type MixerBlendMode = "normal" | "multiply" | "screen" | "overlay";

export type NormalizedMixerCompositionData = {
  blendMode: MixerBlendMode;
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

export const MIXER_SOURCE_NODE_TYPES = new Set([
  "image",
  "asset",
  "ai-image",
  "render",
  "text",
]);

const MIXER_BLEND_MODES = new Set<MixerBlendMode>([
  "normal",
  "multiply",
  "screen",
  "overlay",
]);
const DEFAULT_BLEND_MODE: MixerBlendMode = "normal";
const DEFAULT_OPACITY = 100;
const MIN_OPACITY = 0;
const MAX_OPACITY = 100;
const DEFAULT_OVERLAY_X = 0;
const DEFAULT_OVERLAY_Y = 0;
const DEFAULT_OVERLAY_WIDTH = 1;
const DEFAULT_OVERLAY_HEIGHT = 1;
const DEFAULT_CROP_LEFT = 0;
const DEFAULT_CROP_TOP = 0;
const DEFAULT_CROP_RIGHT = 0;
const DEFAULT_CROP_BOTTOM = 0;
const MIN_OVERLAY_POSITION = 0;
const MAX_OVERLAY_POSITION = 1;
const MIN_OVERLAY_SIZE = 0.1;
const MAX_OVERLAY_SIZE = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeOpacity(value: unknown): number {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return DEFAULT_OPACITY;
  }

  return clamp(parsed, MIN_OPACITY, MAX_OPACITY);
}

function normalizeOverlayNumber(value: unknown, fallback: number): number {
  const parsed = parseNumeric(value);
  return parsed === null ? fallback : parsed;
}

function normalizeUnitRect(args: {
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
  defaults: { x: number; y: number; width: number; height: number };
}): { x: number; y: number; width: number; height: number } {
  const x = clamp(
    normalizeOverlayNumber(args.x, args.defaults.x),
    MIN_OVERLAY_POSITION,
    MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE,
  );
  const y = clamp(
    normalizeOverlayNumber(args.y, args.defaults.y),
    MIN_OVERLAY_POSITION,
    MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE,
  );
  const width = clamp(
    normalizeOverlayNumber(args.width, args.defaults.width),
    MIN_OVERLAY_SIZE,
    Math.min(MAX_OVERLAY_SIZE, MAX_OVERLAY_POSITION - x),
  );
  const height = clamp(
    normalizeOverlayNumber(args.height, args.defaults.height),
    MIN_OVERLAY_SIZE,
    Math.min(MAX_OVERLAY_SIZE, MAX_OVERLAY_POSITION - y),
  );

  return { x, y, width, height };
}

function normalizeOverlayRect(record: Record<string, unknown>) {
  const hasLegacyOffset = record.offsetX !== undefined || record.offsetY !== undefined;
  const hasOverlayRectField =
    record.overlayX !== undefined ||
    record.overlayY !== undefined ||
    record.overlayWidth !== undefined ||
    record.overlayHeight !== undefined;

  if (hasLegacyOffset && !hasOverlayRectField) {
    return {
      overlayX: DEFAULT_OVERLAY_X,
      overlayY: DEFAULT_OVERLAY_Y,
      overlayWidth: DEFAULT_OVERLAY_WIDTH,
      overlayHeight: DEFAULT_OVERLAY_HEIGHT,
    };
  }

  const normalized = normalizeUnitRect({
    x: record.overlayX,
    y: record.overlayY,
    width: record.overlayWidth,
    height: record.overlayHeight,
    defaults: {
      x: DEFAULT_OVERLAY_X,
      y: DEFAULT_OVERLAY_Y,
      width: DEFAULT_OVERLAY_WIDTH,
      height: DEFAULT_OVERLAY_HEIGHT,
    },
  });

  return {
    overlayX: normalized.x,
    overlayY: normalized.y,
    overlayWidth: normalized.width,
    overlayHeight: normalized.height,
  };
}

function normalizeCropEdges(record: Record<string, unknown>) {
  const hasCropField =
    record.cropLeft !== undefined ||
    record.cropTop !== undefined ||
    record.cropRight !== undefined ||
    record.cropBottom !== undefined;
  const hasLegacyContentRectField =
    record.contentX !== undefined ||
    record.contentY !== undefined ||
    record.contentWidth !== undefined ||
    record.contentHeight !== undefined;

  if (!hasCropField && hasLegacyContentRectField) {
    const legacyRect = normalizeUnitRect({
      x: record.contentX,
      y: record.contentY,
      width: record.contentWidth,
      height: record.contentHeight,
      defaults: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });

    return {
      cropLeft: legacyRect.x,
      cropTop: legacyRect.y,
      cropRight: 1 - (legacyRect.x + legacyRect.width),
      cropBottom: 1 - (legacyRect.y + legacyRect.height),
    };
  }

  const cropLeft = clamp(
    normalizeOverlayNumber(record.cropLeft, DEFAULT_CROP_LEFT),
    0,
    1 - MIN_OVERLAY_SIZE,
  );
  const cropTop = clamp(
    normalizeOverlayNumber(record.cropTop, DEFAULT_CROP_TOP),
    0,
    1 - MIN_OVERLAY_SIZE,
  );
  const cropRight = clamp(
    normalizeOverlayNumber(record.cropRight, DEFAULT_CROP_RIGHT),
    0,
    1 - cropLeft - MIN_OVERLAY_SIZE,
  );
  const cropBottom = clamp(
    normalizeOverlayNumber(record.cropBottom, DEFAULT_CROP_BOTTOM),
    0,
    1 - cropTop - MIN_OVERLAY_SIZE,
  );

  return {
    cropLeft,
    cropTop,
    cropRight,
    cropBottom,
  };
}

export function normalizeMixerCompositionData(
  data: unknown,
): NormalizedMixerCompositionData {
  const record = (data ?? {}) as Record<string, unknown>;
  const blendMode = MIXER_BLEND_MODES.has(record.blendMode as MixerBlendMode)
    ? (record.blendMode as MixerBlendMode)
    : DEFAULT_BLEND_MODE;

  return {
    blendMode,
    opacity: normalizeOpacity(record.opacity),
    ...normalizeOverlayRect(record),
    ...normalizeCropEdges(record),
  };
}
