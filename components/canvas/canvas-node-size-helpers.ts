/**
 * Onboarding note:
 * Shared sizing helpers for canvas nodes. Keep this pure so resize controls,
 * DOM measurement, and interaction persistence can use the same minimums.
 */

export interface ResizeConfig {
  minWidth: number;
  minHeight: number;
  keepAspectRatio?: boolean;
  autoGrowWidth?: boolean;
  autoGrowHeight?: boolean;
}

export type NodeMinimumSize = {
  minWidth: number;
  minHeight: number;
};

export const CANVAS_NODE_RESIZE_CONFIGS: Record<string, ResizeConfig> = {
  frame: { minWidth: 200, minHeight: 150 },
  group: { minWidth: 150, minHeight: 100 },
  image: { minWidth: 140, minHeight: 120, keepAspectRatio: true },
  asset: { minWidth: 200, minHeight: 240, keepAspectRatio: false },
  "asset-video": { minWidth: 200, minHeight: 120, keepAspectRatio: true },
  video: { minWidth: 200, minHeight: 120, keepAspectRatio: true },
  // Chrome 88 + min. viewport 120 => outer minimum height 208.
  "ai-image": { minWidth: 200, minHeight: 208, keepAspectRatio: false },
  compare: { minWidth: 300, minHeight: 200 },
  prompt: { minWidth: 260, minHeight: 260 },
  "video-prompt": { minWidth: 260, minHeight: 260 },
  "ai-text": { minWidth: 320, minHeight: 320, autoGrowWidth: false },
  "ai-text-output": { minWidth: 320, minHeight: 240, autoGrowWidth: false },
  curves: { minWidth: 300, minHeight: 620 },
  "color-adjust": { minWidth: 300, minHeight: 760 },
  "light-adjust": { minWidth: 300, minHeight: 860 },
  "detail-adjust": { minWidth: 300, minHeight: 820 },
  crop: { minWidth: 320, minHeight: 520 },
  "bg-remove": { minWidth: 300, minHeight: 340 },
  render: { minWidth: 260, minHeight: 300, keepAspectRatio: true },
  agent: { minWidth: 300, minHeight: 280, autoGrowWidth: false },
  text: { minWidth: 220, minHeight: 90, autoGrowWidth: false },
  note: { minWidth: 200, minHeight: 90 },
  comment: { minWidth: 260, minHeight: 180 },
  mixer: { minWidth: 320, minHeight: 280 },
  "agent-output": { minWidth: 320, minHeight: 220, autoGrowWidth: false },
};

export const DEFAULT_NODE_RESIZE_CONFIG: ResizeConfig = {
  minWidth: 80,
  minHeight: 50,
};

const CONTENT_OVERFLOW_EPSILON_PX = 1;

function ceilPositiveFinite(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.ceil(value);
}

function overflowSize(scrollSize: number, clientSize: number): number | null {
  const scroll = ceilPositiveFinite(scrollSize);
  const client = ceilPositiveFinite(clientSize);
  if (scroll === null || client === null) {
    return null;
  }
  return scroll > client + CONTENT_OVERFLOW_EPSILON_PX ? scroll : null;
}

export function getCanvasNodeResizeConfig(nodeType: string | undefined): ResizeConfig {
  return nodeType
    ? (CANVAS_NODE_RESIZE_CONFIGS[nodeType] ?? DEFAULT_NODE_RESIZE_CONFIG)
    : DEFAULT_NODE_RESIZE_CONFIG;
}

export function getCanvasNodeStaticMinimumSize(
  nodeType: string | undefined,
): NodeMinimumSize {
  const config = getCanvasNodeResizeConfig(nodeType);
  return {
    minWidth: config.minWidth,
    minHeight: config.minHeight,
  };
}

export function computeContentAwareNodeMinimumSize(args: {
  nodeType: string | undefined;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  contentBoundsHeight?: number;
}): NodeMinimumSize {
  const config = getCanvasNodeResizeConfig(args.nodeType);
  const contentWidth =
    config.autoGrowWidth === true
      ? overflowSize(args.scrollWidth, args.clientWidth)
      : null;
  const contentBoundsHeight = ceilPositiveFinite(args.contentBoundsHeight);
  const contentHeight =
    config.autoGrowHeight === false
      ? null
      : Math.max(
          overflowSize(args.scrollHeight, args.clientHeight) ?? 0,
          contentBoundsHeight ?? 0,
        );

  return {
    minWidth: Math.max(config.minWidth, contentWidth ?? 0),
    minHeight: Math.max(config.minHeight, contentHeight ?? 0),
  };
}

export function resolveNextContentMinimumSize(
  current: NodeMinimumSize,
  measured: NodeMinimumSize,
): NodeMinimumSize | null {
  const minWidth = Math.max(current.minWidth, measured.minWidth);
  const minHeight = Math.max(current.minHeight, measured.minHeight);
  if (minWidth === current.minWidth && minHeight === current.minHeight) {
    return null;
  }
  return { minWidth, minHeight };
}

export function clampNodeDimensionsToMinimum(args: {
  nodeType: string | undefined;
  width: number;
  height: number;
}): { width: number; height: number } {
  const minimum = getCanvasNodeStaticMinimumSize(args.nodeType);
  return {
    width: Math.max(args.width, minimum.minWidth),
    height: Math.max(args.height, minimum.minHeight),
  };
}

export function growNodeDimensionsToMinimum(args: {
  width: number;
  height: number;
  minimum: NodeMinimumSize;
}): { width: number; height: number } | null {
  const width = ceilPositiveFinite(args.width);
  const height = ceilPositiveFinite(args.height);
  if (width === null || height === null) {
    return null;
  }

  const nextWidth = Math.max(width, args.minimum.minWidth);
  const nextHeight = Math.max(height, args.minimum.minHeight);
  if (
    nextWidth <= width + CONTENT_OVERFLOW_EPSILON_PX &&
    nextHeight <= height + CONTENT_OVERFLOW_EPSILON_PX
  ) {
    return null;
  }

  return {
    width: nextWidth,
    height: nextHeight,
  };
}
