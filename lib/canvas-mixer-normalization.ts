/**
 * Onboarding note:
 * Shared TypeScript utility for canvas mixer normalization. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

export type MixerBlendMode = "normal" | "multiply" | "screen" | "overlay";

export const MAX_MIXER_LAYERS = 8;
export const MIXER_LAYER_HANDLE_BASE_ID = "layer-in";

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

export type NormalizedMixerLayerData = {
  id: string;
  handleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  crop: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  opacity: number;
  blendMode: MixerBlendMode;
  visible: boolean;
  locked: boolean;
};

export type NormalizedMixerLayerCompositionData = {
  mixerVersion: 2;
  stage: { width: number; height: number } | null;
  layers: NormalizedMixerLayerData[];
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
const DEFAULT_LAYER_ID_PREFIX = "layer";

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

function roundNormalized(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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

export function buildMixerLayerHandleId(index: number): string {
  if (index <= 0) {
    return MIXER_LAYER_HANDLE_BASE_ID;
  }

  return `${MIXER_LAYER_HANDLE_BASE_ID}-${index + 1}`;
}

export function normalizeMixerLayerHandle(
  handle: string | null | undefined,
): string | null {
  if (handle == null || handle === "" || handle === "null" || handle === "base") {
    return buildMixerLayerHandleId(0);
  }

  if (handle === "overlay") {
    return buildMixerLayerHandleId(1);
  }

  if (handle === MIXER_LAYER_HANDLE_BASE_ID) {
    return handle;
  }

  const prefix = `${MIXER_LAYER_HANDLE_BASE_ID}-`;
  if (!handle.startsWith(prefix)) {
    return null;
  }

  const slot = Number.parseInt(handle.slice(prefix.length), 10);
  if (!Number.isFinite(slot) || slot < 2 || slot > MAX_MIXER_LAYERS) {
    return null;
  }

  return buildMixerLayerHandleId(slot - 1);
}

function normalizeRotation(value: unknown): number {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return 0;
  }

  return ((parsed % 360) + 360) % 360;
}

function normalizeStage(data: unknown): { width: number; height: number } | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const width = parseNumeric(record.width);
  const height = parseNumeric(record.height);
  if (!width || !height || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

function normalizeLayerCrop(data: unknown): NormalizedMixerLayerData["crop"] {
  const record = (data ?? {}) as Record<string, unknown>;
  const cropLeft = clamp(
    normalizeOverlayNumber(record.left, DEFAULT_CROP_LEFT),
    0,
    1 - MIN_OVERLAY_SIZE,
  );
  const cropTop = clamp(
    normalizeOverlayNumber(record.top, DEFAULT_CROP_TOP),
    0,
    1 - MIN_OVERLAY_SIZE,
  );
  const cropRight = clamp(
    normalizeOverlayNumber(record.right, DEFAULT_CROP_RIGHT),
    0,
    1 - cropLeft - MIN_OVERLAY_SIZE,
  );
  const cropBottom = clamp(
    normalizeOverlayNumber(record.bottom, DEFAULT_CROP_BOTTOM),
    0,
    1 - cropTop - MIN_OVERLAY_SIZE,
  );

  return {
    left: roundNormalized(cropLeft),
    top: roundNormalized(cropTop),
    right: roundNormalized(cropRight),
    bottom: roundNormalized(cropBottom),
  };
}

function normalizeMixerLayer(
  layer: unknown,
  fallbackIndex: number,
): NormalizedMixerLayerData | null {
  if (typeof layer !== "object" || layer === null) {
    return null;
  }

  const record = layer as Record<string, unknown>;
  const handleId = normalizeMixerLayerHandle(
    typeof record.handleId === "string" ? record.handleId : undefined,
  );
  if (!handleId) {
    return null;
  }

  const rect = normalizeUnitRect({
    x: record.x,
    y: record.y,
    width: record.width,
    height: record.height,
    defaults: { x: 0, y: 0, width: 1, height: 1 },
  });
  const blendMode = MIXER_BLEND_MODES.has(record.blendMode as MixerBlendMode)
    ? (record.blendMode as MixerBlendMode)
    : DEFAULT_BLEND_MODE;
  const id =
    typeof record.id === "string" && record.id.trim().length > 0
      ? record.id
      : `${DEFAULT_LAYER_ID_PREFIX}-${fallbackIndex + 1}`;

  return {
    id,
    handleId,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: normalizeRotation(record.rotation),
    crop: normalizeLayerCrop(record.crop),
    opacity: normalizeOpacity(record.opacity),
    blendMode,
    visible: record.visible === false ? false : true,
    locked: record.locked === true,
  };
}

function normalizeV2MixerLayerData(
  record: Record<string, unknown>,
): NormalizedMixerLayerCompositionData {
  const rawLayers = Array.isArray(record.layers) ? record.layers : [];
  const seenHandles = new Set<string>();
  const layers: NormalizedMixerLayerData[] = [];

  for (const [index, rawLayer] of rawLayers.entries()) {
    if (layers.length >= MAX_MIXER_LAYERS) {
      break;
    }

    const layer = normalizeMixerLayer(rawLayer, index);
    if (!layer || seenHandles.has(layer.handleId)) {
      continue;
    }

    seenHandles.add(layer.handleId);
    layers.push(layer);
  }

  return {
    mixerVersion: 2,
    stage: normalizeStage(record.stage),
    layers,
  };
}

function legacyLayer(args: {
  id: string;
  handleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  crop?: NormalizedMixerLayerData["crop"];
  opacity: number;
  blendMode: MixerBlendMode;
}): NormalizedMixerLayerData {
  return {
    id: args.id,
    handleId: args.handleId,
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    rotation: args.rotation ?? 0,
    crop: args.crop ?? { left: 0, top: 0, right: 0, bottom: 0 },
    opacity: args.opacity,
    blendMode: args.blendMode,
    visible: true,
    locked: false,
  };
}

export function createDefaultMixerLayerData(
  handleId: string,
  index: number,
): NormalizedMixerLayerData {
  return legacyLayer({
    id: `layer-${index + 1}`,
    handleId,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    opacity: 100,
    blendMode: "normal",
  });
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

export function normalizeMixerLayerCompositionData(
  data: unknown,
): NormalizedMixerLayerCompositionData {
  const record = (data ?? {}) as Record<string, unknown>;
  if (record.mixerVersion === 2 || Array.isArray(record.layers)) {
    return normalizeV2MixerLayerData(record);
  }

  const legacy = normalizeMixerCompositionData(record);

  return {
    mixerVersion: 2,
    stage: null,
    layers: [
      legacyLayer({
        id: "legacy-base",
        handleId: buildMixerLayerHandleId(0),
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        opacity: 100,
        blendMode: "normal",
      }),
      legacyLayer({
        id: "legacy-overlay",
        handleId: buildMixerLayerHandleId(1),
        x: legacy.overlayX,
        y: legacy.overlayY,
        width: legacy.overlayWidth,
        height: legacy.overlayHeight,
        crop: {
          left: legacy.cropLeft,
          top: legacy.cropTop,
          right: legacy.cropRight,
          bottom: legacy.cropBottom,
        },
        opacity: legacy.opacity,
        blendMode: legacy.blendMode,
      }),
    ],
  };
}
