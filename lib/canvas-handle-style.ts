/**
 * Onboarding note:
 * Shared TypeScript utility for canvas handle style. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

/**
 * Akzentfarben der Handles je Node-Typ (s. jeweilige Node-Komponente).
 * Für einen dezenten Glow entlang der Kante (drop-shadow am Pfad).
 */
export type RgbColor = readonly [number, number, number];

export const SOURCE_NODE_GLOW_RGB: Record<string, RgbColor> = {
  prompt: [139, 92, 246],
  "video-prompt": [124, 58, 237],
  "ai-image": [139, 92, 246],
  "ai-text": [139, 92, 246],
  "ai-text-output": [139, 92, 246],
  "ai-video": [124, 58, 237],
  "bg-remove-output": [13, 148, 136],
  image: [13, 148, 136],
  text: [13, 148, 136],
  note: [13, 148, 136],
  comment: [13, 148, 136],
  asset: [13, 148, 136],
  video: [13, 148, 136],
  "asset-video": [13, 148, 136],
  group: [100, 116, 139],
  frame: [249, 115, 22],
  compare: [100, 116, 139],
  curves: [16, 185, 129],
  "color-adjust": [6, 182, 212],
  "light-adjust": [245, 158, 11],
  "detail-adjust": [99, 102, 241],
  mask: [148, 163, 184],
  crop: [139, 92, 246],
  "change-camera": [14, 165, 233],
  render: [14, 165, 233],
  agent: [245, 158, 11],
  "agent-output": [245, 158, 11],
  "instagram-post-mockup": [236, 72, 153],
  mixer: [100, 116, 139],
};

/** Compare: Ziel-Handles blau/smaragd, Quelle compare-out grau (wie in compare-node.tsx). */
const COMPARE_HANDLE_CONNECTION_RGB: Record<string, RgbColor> = {
  left: [59, 130, 246],
  right: [16, 185, 129],
  "compare-out": [100, 116, 139],
};

const MIXER_HANDLE_CONNECTION_RGB: Record<string, RgbColor> = {
  base: [14, 165, 233],
  overlay: [236, 72, 153],
  "layer-in": [14, 165, 233],
  "layer-in-2": [236, 72, 153],
  "mixer-out": [100, 116, 139],
};

const STYLE_TRANSFER_HANDLE_CONNECTION_RGB: Record<string, RgbColor> = {
  image: [20, 184, 166],
  reference: [236, 72, 153],
};

const AI_TEXT_HANDLE_CONNECTION_RGB: Record<"instruction" | "draft", RgbColor> = {
  instruction: [245, 158, 11],
  draft: [20, 184, 166],
};

const CONNECTION_LINE_FALLBACK_RGB: RgbColor = [13, 148, 136];

export type EdgeGlowColorMode = "light" | "dark";

export function canvasHandleAccentRgb(args: {
  nodeType: string | undefined;
  handleId?: string | null;
  handleType: "source" | "target";
}): RgbColor {
  const nodeType = args.nodeType;
  const handleId = args.handleId ?? undefined;
  const handleType = args.handleType;

  if (nodeType === "ai-text" && handleType === "target" && handleId) {
    if (handleId.startsWith("ai-text-instruction-in")) {
      return AI_TEXT_HANDLE_CONNECTION_RGB.instruction;
    }
    if (handleId.startsWith("ai-text-in")) {
      return AI_TEXT_HANDLE_CONNECTION_RGB.draft;
    }
  }

  if (nodeType === "compare" && handleId) {
    if (handleType === "target" && handleId === "compare-out") {
      return SOURCE_NODE_GLOW_RGB.compare;
    }
    const byHandle = COMPARE_HANDLE_CONNECTION_RGB[handleId];
    if (byHandle) {
      return byHandle;
    }
  }

  if (nodeType === "mixer" && handleId) {
    if (handleType === "target" && handleId === "mixer-out") {
      return SOURCE_NODE_GLOW_RGB.mixer;
    }
    if (handleId.startsWith("layer-in-")) {
      return handleId === "layer-in-2" ? MIXER_HANDLE_CONNECTION_RGB["layer-in-2"] : SOURCE_NODE_GLOW_RGB.mixer;
    }
    const byHandle = MIXER_HANDLE_CONNECTION_RGB[handleId];
    if (byHandle) {
      return byHandle;
    }
  }

  if (nodeType === "style-transfer" && handleId) {
    const byHandle = STYLE_TRANSFER_HANDLE_CONNECTION_RGB[handleId];
    if (byHandle) {
      return byHandle;
    }
  }

  if (
    (nodeType === "curves" ||
      nodeType === "color-adjust" ||
      nodeType === "light-adjust" ||
      nodeType === "detail-adjust") &&
    handleId === "mask"
  ) {
    return SOURCE_NODE_GLOW_RGB.mask;
  }

  if (!nodeType) {
    return CONNECTION_LINE_FALLBACK_RGB;
  }

  return SOURCE_NODE_GLOW_RGB[nodeType] ?? CONNECTION_LINE_FALLBACK_RGB;
}

export function canvasHandleAccentColor(args: {
  nodeType: string | undefined;
  handleId?: string | null;
  handleType: "source" | "target";
}): string {
  const [r, g, b] = canvasHandleAccentRgb(args);
  return `rgb(${r}, ${g}, ${b})`;
}

export function canvasHandleAccentColorWithAlpha(
  args: {
    nodeType: string | undefined;
    handleId?: string | null;
    handleType: "source" | "target";
  },
  alpha: number,
): string {
  const [r, g, b] = canvasHandleAccentRgb(args);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

export function canvasHandleGlowShadow(args: {
  nodeType: string | undefined;
  handleId?: string | null;
  handleType: "source" | "target";
  strength: number;
  colorMode: EdgeGlowColorMode;
}): string | undefined {
  const strength = clampUnit(args.strength);
  if (strength <= 0) {
    return undefined;
  }

  const [r, g, b] = canvasHandleAccentRgb(args);
  const isDark = args.colorMode === "dark";

  const ringAlpha = isDark ? lerp(0.08, 0.3, strength) : lerp(0.06, 0.2, strength);
  const glowAlpha = isDark ? lerp(0.12, 0.58, strength) : lerp(0.08, 0.34, strength);
  const ringSize = isDark ? lerp(1.8, 6.4, strength) : lerp(1.5, 5.2, strength);
  const glowSize = isDark ? lerp(4.5, 15, strength) : lerp(3.5, 12, strength);

  return `0 0 0 ${ringSize.toFixed(2)}px rgba(${r}, ${g}, ${b}, ${ringAlpha.toFixed(3)}), 0 0 ${glowSize.toFixed(2)}px rgba(${r}, ${g}, ${b}, ${glowAlpha.toFixed(3)})`;
}

export function connectionLineGlowFilter(args: {
  nodeType: string | undefined;
  handleId: string | null | undefined;
  strength: number;
  colorMode: EdgeGlowColorMode;
}): string | undefined {
  const strength = clampUnit(args.strength);
  if (strength <= 0) {
    return undefined;
  }

  const [r, g, b] = connectionLineAccentRgb(args.nodeType, args.handleId);
  const isDark = args.colorMode === "dark";

  const innerAlpha = isDark ? lerp(0.22, 0.72, strength) : lerp(0.12, 0.42, strength);
  const outerAlpha = isDark ? lerp(0.12, 0.38, strength) : lerp(0.06, 0.2, strength);
  const innerBlur = isDark ? lerp(2.4, 4.2, strength) : lerp(2, 3.4, strength);
  const outerBlur = isDark ? lerp(5.4, 9.8, strength) : lerp(4.6, 7.8, strength);

  return `drop-shadow(0 0 ${innerBlur.toFixed(2)}px rgba(${r}, ${g}, ${b}, ${innerAlpha.toFixed(3)})) drop-shadow(0 0 ${outerBlur.toFixed(2)}px rgba(${r}, ${g}, ${b}, ${outerAlpha.toFixed(3)}))`;
}

/**
 * RGB für die temporäre Verbindungslinie (Quell-Node + optional Handle, z. B. Reconnect).
 */
export function connectionLineAccentRgb(
  nodeType: string | undefined,
  handleId: string | null | undefined,
): RgbColor {
  return canvasHandleAccentRgb({
    nodeType,
    handleId,
    handleType: "source",
  });
}

export function sourceGlowFilterForNodeType(
  type: string | undefined,
  colorMode: EdgeGlowColorMode,
): string | undefined {
  if (!type) return undefined;
  const rgb = SOURCE_NODE_GLOW_RGB[type];
  if (!rgb) return undefined;
  const [r, g, b] = rgb;
  if (colorMode === "dark") {
    /* Zwei kleine Schatten statt gestapelter großer Blur — weniger GPU-Last beim Pan/Zoom */
    return `drop-shadow(0 0 4px rgba(${r},${g},${b},0.72)) drop-shadow(0 0 9px rgba(${r},${g},${b},0.38))`;
  }
  return `drop-shadow(0 0 3px rgba(${r},${g},${b},0.42)) drop-shadow(0 0 7px rgba(${r},${g},${b},0.2))`;
}

export function sourceEdgeStrokeForNodeType(
  type: string | undefined,
  colorMode: EdgeGlowColorMode,
): string | undefined {
  if (colorMode !== "light" || !type) return undefined;
  const rgb = SOURCE_NODE_GLOW_RGB[type];
  if (!rgb) return undefined;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, 0.5)`;
}

/**
 * Handle-IDs pro Node-Typ für Proximity Connect.
 * `undefined` = default handle (kein explizites `id`-Attribut auf dem Handle).
 * Fehlendes Feld = Node hat keinen Handle dieses Typs.
 */
export const NODE_HANDLE_MAP: Record<
  string,
  { source?: string; target?: string }
> = {
  image: { source: undefined, target: undefined },
  text: { source: undefined, target: undefined },
  prompt: { source: "prompt-out", target: "image-in" },
  "video-prompt": { source: "video-prompt-out", target: "video-prompt-in" },
  "ai-image": { source: "image-out", target: "prompt-in" },
  "ai-text": { source: "ai-text-out", target: "ai-text-in" },
  "ai-text-output": { source: "ai-text-output-out", target: "ai-text-output-in" },
  "ai-video": { source: "video-out", target: "video-in" },
  "bg-remove-output": { source: undefined, target: undefined },
  group: { source: undefined, target: undefined },
  frame: { source: "frame-out", target: "frame-in" },
  note: { source: undefined, target: undefined },
  comment: {},
  compare: { source: "compare-out", target: "left" },
  asset: { source: undefined, target: undefined },
  video: { source: undefined, target: undefined },
  "asset-video": { source: undefined, target: undefined },
  curves: { source: undefined, target: undefined },
  "color-adjust": { source: undefined, target: undefined },
  "light-adjust": { source: undefined, target: undefined },
  "detail-adjust": { source: undefined, target: undefined },
  mask: { source: "mask-out", target: "image-in" },
  crop: { source: undefined, target: undefined },
  "bg-remove": { source: undefined, target: undefined },
  upscale: { source: undefined, target: undefined },
  "style-transfer": { source: undefined, target: "image" },
  "face-restore": { source: undefined, target: undefined },
  "change-camera": { source: undefined, target: undefined },
  render: { source: undefined, target: undefined },
  agent: { target: "agent-in" },
  mixer: { source: "mixer-out", target: "layer-in" },
  "agent-output": { target: "agent-output-in" },
  "instagram-post-mockup": { target: "visual-in" },
};
