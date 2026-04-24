export const PHASE1_CANVAS_NODE_TYPES = [
  "image",
  "text",
  "prompt",
  "video-prompt",
  "ai-image",
  "group",
  "frame",
  "note",
  "compare",
] as const;

export const CANVAS_NODE_TYPES = [
  "image",
  "text",
  "prompt",
  "video-prompt",
  "color",
  "video",
  "asset-video",
  "asset",
  "ai-image",
  "ai-text",
  "ai-text-output",
  "ai-video",
  "agent-output",
  "crop",
  "bg-remove",
  "upscale",
  "style-transfer",
  "face-restore",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
  "render",
  "splitter",
  "loop",
  "agent",
  "mixer",
  "switch",
  "group",
  "frame",
  "note",
  "compare",
  "text-overlay",
  "comment",
  "presentation",
] as const;

export const ADJUSTMENT_NODE_TYPES = [
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
  "render",
] as const;

export const ADJUSTMENT_PRESET_NODE_TYPES = [
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
] as const;

export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[number];
export type Phase1CanvasNodeType = (typeof PHASE1_CANVAS_NODE_TYPES)[number];
export type AdjustmentNodeType = (typeof ADJUSTMENT_NODE_TYPES)[number];
export type AdjustmentPresetNodeType = (typeof ADJUSTMENT_PRESET_NODE_TYPES)[number];

const CANVAS_NODE_TYPE_SET = new Set<CanvasNodeType>(CANVAS_NODE_TYPES);
const ADJUSTMENT_NODE_TYPE_SET = new Set<AdjustmentNodeType>(ADJUSTMENT_NODE_TYPES);
const ADJUSTMENT_PRESET_NODE_TYPE_SET = new Set<AdjustmentPresetNodeType>(
  ADJUSTMENT_PRESET_NODE_TYPES,
);

export function isCanvasNodeType(value: string): value is CanvasNodeType {
  return CANVAS_NODE_TYPE_SET.has(value as CanvasNodeType);
}

export function isAdjustmentNodeType(value: string): value is AdjustmentNodeType {
  return ADJUSTMENT_NODE_TYPE_SET.has(value as AdjustmentNodeType);
}

export function isAdjustmentPresetNodeType(
  value: string,
): value is AdjustmentPresetNodeType {
  return ADJUSTMENT_PRESET_NODE_TYPE_SET.has(value as AdjustmentPresetNodeType);
}
