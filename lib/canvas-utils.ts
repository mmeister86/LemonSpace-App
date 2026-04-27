import {
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  type Node as RFNode,
  type Edge as RFEdge,
} from "@xyflow/react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_COLOR_ADJUST_DATA,
  DEFAULT_CURVES_DATA,
  DEFAULT_DETAIL_ADJUST_DATA,
  DEFAULT_LIGHT_ADJUST_DATA,
} from "@/lib/image-pipeline/adjustment-types";
import { DEFAULT_AGENT_MODEL_ID } from "@/lib/agent-models";
import { DEFAULT_CROP_NODE_DATA } from "@/lib/image-pipeline/crop-node-data";

/**
 * Convex Node → React Flow Node
 *
 * Convex speichert positionX/positionY als separate Felder,
 * React Flow erwartet position: { x, y }.
 */
/**
 * Reichert Node-Dokumente mit `data.url` an (aus gebündelter Storage-URL-Map).
 * Behält eine zuvor gemappte URL bei, solange die URL-Auflösung noch lädt.
 */
export function convexNodeDocWithMergedStorageUrl(
  node: Doc<"nodes">,
  urlByStorage: Record<string, string | undefined> | undefined,
  previousDataByNodeId: Map<string, Record<string, unknown>>,
): Doc<"nodes"> {
  const data = node.data as Record<string, unknown> | undefined;
  const sid = data?.storageId;
  if (typeof sid !== "string") {
    return node;
  }

  if (urlByStorage) {
    const fromBatch = urlByStorage[sid];
    if (fromBatch !== undefined) {
      return {
        ...node,
        data: { ...data, url: fromBatch },
      };
    }
  }

  const prev = previousDataByNodeId.get(node._id);
  if (
    prev?.url !== undefined &&
    typeof prev.storageId === "string" &&
    prev.storageId === sid
  ) {
    return {
      ...node,
      data: { ...data, url: prev.url },
    };
  }

  return node;
}

export function convexNodeToRF(node: Doc<"nodes">): RFNode {
  return {
    id: node._id,
    type: node.type,
    position: { x: node.positionX, y: node.positionY },
    data: {
      ...(node.data as Record<string, unknown>),
      // Status direkt in data durchreichen, damit Node-Komponenten darauf zugreifen können
      _status: node.status,
      _statusMessage: node.statusMessage,
      retryCount: node.retryCount,
    },
    parentId: node.parentId ?? undefined,
    zIndex: node.zIndex,
    style: {
      width: node.width,
      height: node.height,
    },
  };
}

/**
 * Convex Edge → React Flow Edge
 * Sanitize handles: null/undefined/"null" → undefined (ReactFlow erwartet string | null | undefined, aber nie den String "null")
 */
export function convexEdgeToRF(edge: Doc<"edges">): RFEdge {
  const sanitize = (h: string | undefined): string | undefined =>
    h === undefined || h === "null" ? undefined : h;
  return {
    id: edge._id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: sanitize(edge.sourceHandle),
    targetHandle: sanitize(edge.targetHandle),
  };
}

/**
 * Akzentfarben der Handles je Node-Typ (s. jeweilige Node-Komponente).
 * Für einen dezenten Glow entlang der Kante (drop-shadow am Pfad).
 */
type RgbColor = readonly [number, number, number];

const SOURCE_NODE_GLOW_RGB: Record<string, RgbColor> = {
  prompt: [139, 92, 246],
  "video-prompt": [124, 58, 237],
  "ai-image": [139, 92, 246],
  "ai-text": [139, 92, 246],
  "ai-text-output": [139, 92, 246],
  "ai-video": [124, 58, 237],
  image: [13, 148, 136],
  text: [13, 148, 136],
  note: [13, 148, 136],
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
  crop: [139, 92, 246],
  "change-camera": [14, 165, 233],
  render: [14, 165, 233],
  agent: [245, 158, 11],
  "agent-output": [245, 158, 11],
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
  "mixer-out": [100, 116, 139],
};

const STYLE_TRANSFER_HANDLE_CONNECTION_RGB: Record<string, RgbColor> = {
  image: [20, 184, 166],
  reference: [236, 72, 153],
};

const CONNECTION_LINE_FALLBACK_RGB: RgbColor = [13, 148, 136];

export function canvasHandleAccentRgb(args: {
  nodeType: string | undefined;
  handleId?: string | null;
  handleType: "source" | "target";
}): RgbColor {
  const nodeType = args.nodeType;
  const handleId = args.handleId ?? undefined;
  const handleType = args.handleType;

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

  const ringAlpha = isDark
    ? lerp(0.08, 0.3, strength)
    : lerp(0.06, 0.2, strength);
  const glowAlpha = isDark
    ? lerp(0.12, 0.58, strength)
    : lerp(0.08, 0.34, strength);
  const ringSize = isDark
    ? lerp(1.8, 6.4, strength)
    : lerp(1.5, 5.2, strength);
  const glowSize = isDark
    ? lerp(4.5, 15, strength)
    : lerp(3.5, 12, strength);

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

  const innerAlpha = isDark
    ? lerp(0.22, 0.72, strength)
    : lerp(0.12, 0.42, strength);
  const outerAlpha = isDark
    ? lerp(0.12, 0.38, strength)
    : lerp(0.06, 0.2, strength);
  const innerBlur = isDark
    ? lerp(2.4, 4.2, strength)
    : lerp(2, 3.4, strength);
  const outerBlur = isDark
    ? lerp(5.4, 9.8, strength)
    : lerp(4.6, 7.8, strength);

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

export type EdgeGlowColorMode = "light" | "dark";

function sourceGlowFilterForNodeType(
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

function sourceEdgeStrokeForNodeType(
  type: string | undefined,
  colorMode: EdgeGlowColorMode,
): string | undefined {
  if (colorMode !== "light" || !type) return undefined;
  const rgb = SOURCE_NODE_GLOW_RGB[type];
  if (!rgb) return undefined;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, 0.5)`;
}

/** Wie convexEdgeToRF, setzt zusätzlich filter am Pfad nach Quell-Node-Typ. */
export function convexEdgeToRFWithSourceGlow(
  edge: Doc<"edges">,
  sourceNodeType: string | undefined,
  colorMode: EdgeGlowColorMode = "light",
): RFEdge {
  const base = convexEdgeToRF(edge);
  const filter = sourceGlowFilterForNodeType(sourceNodeType, colorMode);
  const stroke = sourceEdgeStrokeForNodeType(sourceNodeType, colorMode);
  if (!filter && !stroke) return base;

  const style: NonNullable<RFEdge["style"]> = { ...(base.style ?? {}) };
  if (filter) style.filter = filter;
  if (stroke) style.stroke = stroke;

  return {
    ...base,
    style,
  };
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
  group: { source: undefined, target: undefined },
  frame: { source: "frame-out", target: "frame-in" },
  note: { source: undefined, target: undefined },
  compare: { source: "compare-out", target: "left" },
  asset: { source: undefined, target: undefined },
  video: { source: undefined, target: undefined },
  "asset-video": { source: undefined, target: undefined },
  curves: { source: undefined, target: undefined },
  "color-adjust": { source: undefined, target: undefined },
  "light-adjust": { source: undefined, target: undefined },
  "detail-adjust": { source: undefined, target: undefined },
  crop: { source: undefined, target: undefined },
  "bg-remove": { source: undefined, target: undefined },
  upscale: { source: undefined, target: undefined },
  "style-transfer": { source: undefined, target: "image" },
  "face-restore": { source: undefined, target: undefined },
  "change-camera": { source: undefined, target: undefined },
  render: { source: undefined, target: undefined },
  agent: { target: "agent-in" },
  mixer: { source: "mixer-out", target: "base" },
  "agent-output": { target: "agent-output-in" },
};

/**
 * Default-Größen für neue Nodes je nach Typ.
 */
export const NODE_DEFAULTS: Record<
  string,
  { width: number; height: number; data: Record<string, unknown> }
> = {
  image: { width: 280, height: 200, data: {} },
  text: { width: 256, height: 120, data: { content: "" } },
  prompt: {
    width: 288,
    height: 220,
    data: { prompt: "", model: "google/gemini-2.5-flash-image", aspectRatio: "1:1" },
  },
  "video-prompt": {
    width: 288,
    height: 220,
    data: {
      prompt: "",
      modelId: "wan-2-2-720p",
      durationSeconds: 5,
      hasAudio: false,
    },
  },
  // 1:1 viewport 320 + chrome 88 ≈ äußere Höhe (siehe lib/image-formats.ts)
  "ai-image": { width: 320, height: 408, data: {} },
  "ai-text": {
    width: 360,
    height: 360,
    data: {
      instruction: "",
      inputText: "",
      modelId: DEFAULT_AGENT_MODEL_ID,
    },
  },
  "ai-text-output": {
    width: 360,
    height: 280,
    data: {
      instruction: "",
      inputText: "",
      outputText: "",
      modelId: DEFAULT_AGENT_MODEL_ID,
    },
  },
  "ai-video": { width: 360, height: 280, data: {} },
  group: { width: 400, height: 300, data: { label: "Gruppe" } },
  frame: {
    width: 400,
    height: 300,
    data: { label: "Frame", resolution: "1080x1080" },
  },
  note: { width: 208, height: 100, data: { content: "" } },
  compare: { width: 500, height: 380, data: {} },
  asset: { width: 260, height: 240, data: {} },
  video: { width: 320, height: 180, data: {} },
  "asset-video": { width: 320, height: 180, data: {} },
  curves: { width: 320, height: 660, data: DEFAULT_CURVES_DATA },
  "color-adjust": { width: 320, height: 800, data: DEFAULT_COLOR_ADJUST_DATA },
  "light-adjust": { width: 320, height: 920, data: DEFAULT_LIGHT_ADJUST_DATA },
  "detail-adjust": { width: 320, height: 880, data: DEFAULT_DETAIL_ADJUST_DATA },
  crop: { width: 340, height: 620, data: DEFAULT_CROP_NODE_DATA },
  "bg-remove": {
    width: 300,
    height: 260,
    data: { operation: "bg-remove", parameters: { type: "bg-remove" } },
  },
  upscale: {
    width: 300,
    height: 320,
    data: {
      operation: "upscale",
      parameters: {
        type: "upscale",
        scale: 2,
        outputFormat: "png",
        flavor: "photo",
        sharpen: 7,
        grain: 7,
        ultraDetail: 30,
      },
    },
  },
  "style-transfer": {
    width: 340,
    height: 620,
    data: {
      operation: "style-transfer",
      parameters: {
        type: "style-transfer",
        styleStrength: 100,
        structureStrength: 50,
        flavor: "faithful",
        engine: "balanced",
        fixedGeneration: false,
        isPortrait: false,
        portraitStyle: "standard",
        portraitBeautifier: "none",
      },
    },
  },
  "face-restore": {
    width: 300,
    height: 300,
    data: {
      operation: "face-restore",
      parameters: { type: "face-restore", mode: "faithful" },
    },
  },
  "change-camera": {
    width: 320,
    height: 440,
    data: {
      operation: "change-camera",
      parameters: {
        type: "change-camera",
        horizontalAngle: 0,
        verticalAngle: 0,
        zoom: 5,
        outputFormat: "png",
      },
    },
  },
  render: {
    width: 300,
    height: 420,
    data: { outputResolution: "original", format: "png", jpegQuality: 90 },
  },
  agent: {
    width: 360,
    height: 320,
    data: {
      templateId: "campaign-distributor",
      modelId: DEFAULT_AGENT_MODEL_ID,
      clarificationQuestions: [],
      clarificationAnswers: {},
      outputNodeIds: [],
    },
  },
  mixer: {
    width: 360,
    height: 320,
    data: {
      blendMode: "normal",
      opacity: 100,
      overlayX: 0,
      overlayY: 0,
      overlayWidth: 1,
      overlayHeight: 1,
      cropLeft: 0,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
    },
  },
  "agent-output": {
    width: 360,
    height: 260,
    data: {
      title: "",
      channel: "",
      outputType: "",
      body: "",
    },
  },
};

type MediaNodeKind = "asset" | "image" | "video";

const MEDIA_NODE_CONFIG: Record<
  MediaNodeKind,
  {
    width: number;
    chromeHeight: number;
    minPreviewHeight: number;
    maxPreviewHeight: number;
  }
> = {
  asset: {
    width: 260,
    chromeHeight: 88,
    minPreviewHeight: 120,
    maxPreviewHeight: 300,
  },
  image: {
    width: 280,
    chromeHeight: 52,
    minPreviewHeight: 120,
    maxPreviewHeight: 320,
  },
  video: {
    width: 320,
    chromeHeight: 42,
    minPreviewHeight: 120,
    maxPreviewHeight: 320,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fallbackAspectRatio(orientation?: string): number {
  if (orientation === "horizontal") return 4 / 3;
  if (orientation === "vertical") return 3 / 4;
  return 1;
}

export function resolveMediaAspectRatio(
  intrinsicWidth?: number,
  intrinsicHeight?: number,
  orientation?: string,
): number {
  if (
    typeof intrinsicWidth === "number" &&
    typeof intrinsicHeight === "number" &&
    intrinsicWidth > 0 &&
    intrinsicHeight > 0
  ) {
    return intrinsicWidth / intrinsicHeight;
  }
  return fallbackAspectRatio(orientation);
}

export function computeMediaNodeSize(
  kind: MediaNodeKind,
  options?: {
    intrinsicWidth?: number;
    intrinsicHeight?: number;
    orientation?: string;
  },
): { width: number; height: number; previewHeight: number; aspectRatio: number } {
  const config = MEDIA_NODE_CONFIG[kind];
  const aspectRatio = resolveMediaAspectRatio(
    options?.intrinsicWidth,
    options?.intrinsicHeight,
    options?.orientation,
  );
  const previewHeight = clamp(
    Math.round(config.width / aspectRatio),
    config.minPreviewHeight,
    config.maxPreviewHeight,
  );

  return {
    width: config.width,
    height: previewHeight + config.chromeHeight,
    previewHeight,
    aspectRatio,
  };
}

function reconnectEdgeKey(edge: RFEdge): string {
  return `${edge.source}\0${edge.target}\0${edge.sourceHandle ?? ""}\0${edge.targetHandle ?? ""}`;
}

export type BridgeCreatePayload = {
  sourceNodeId: Id<"nodes">;
  targetNodeId: Id<"nodes">;
  sourceHandle?: string;
  targetHandle?: string;
};

/**
 * Nach Löschen mittlerer Knoten: Kanten wie im React-Flow-Beispiel
 * „Delete Middle Node“ fortschreiben; nur Kanten zurückgeben, die neu
 * angelegt werden müssen (nicht bereits vor dem Löschen vorhanden).
 */
export function computeBridgeCreatesForDeletedNodes(
  deletedNodes: RFNode[],
  allNodes: RFNode[],
  allEdges: RFEdge[],
): BridgeCreatePayload[] {
  if (deletedNodes.length === 0) return [];

  const initialPersisted = allEdges.filter((e) => e.className !== "temp");
  const initialKeys = new Set(initialPersisted.map(reconnectEdgeKey));

  let remainingNodes = [...allNodes];
  let acc = [...initialPersisted];

  for (const node of deletedNodes) {
    const incomers = getIncomers(node, remainingNodes, acc);
    const outgoers = getOutgoers(node, remainingNodes, acc);
    const connectedEdges = getConnectedEdges([node], acc);
    const remainingEdges = acc.filter((e) => !connectedEdges.includes(e));

    const createdEdges: RFEdge[] = [];
    for (const inc of incomers) {
      for (const out of outgoers) {
        const inEdge = connectedEdges.find(
          (e) => e.source === inc.id && e.target === node.id,
        );
        const outEdge = connectedEdges.find(
          (e) => e.source === node.id && e.target === out.id,
        );
        if (!inEdge || !outEdge || inc.id === out.id) continue;
        createdEdges.push({
          id: `reconnect-${inc.id}-${out.id}-${node.id}-${createdEdges.length}`,
          source: inc.id,
          target: out.id,
          sourceHandle: inEdge.sourceHandle,
          targetHandle: outEdge.targetHandle,
        });
      }
    }

    acc = [...remainingEdges, ...createdEdges];
    remainingNodes = remainingNodes.filter((rn) => rn.id !== node.id);
  }

  const result: BridgeCreatePayload[] = [];
  for (const e of acc) {
    if (!initialKeys.has(reconnectEdgeKey(e))) {
      result.push({
        sourceNodeId: e.source as Id<"nodes">,
        targetNodeId: e.target as Id<"nodes">,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      });
    }
  }
  return result;
}
