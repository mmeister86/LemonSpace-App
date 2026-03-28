import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";
import type { Doc } from "@/convex/_generated/dataModel";

/**
 * Convex Node → React Flow Node
 *
 * Convex speichert positionX/positionY als separate Felder,
 * React Flow erwartet position: { x, y }.
 */
/**
 * Reichert Node-Dokumente mit `data.url` an (aus gebündelter Storage-URL-Map).
 * Behält eine zuvor gemappte URL bei, solange die Batch-Query noch lädt.
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
const SOURCE_NODE_GLOW_RGB: Record<string, readonly [number, number, number]> = {
  prompt: [139, 92, 246],
  "ai-image": [139, 92, 246],
  image: [13, 148, 136],
  text: [13, 148, 136],
  note: [13, 148, 136],
  asset: [13, 148, 136],
  group: [100, 116, 139],
  frame: [249, 115, 22],
  compare: [100, 116, 139],
};

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

/** Wie convexEdgeToRF, setzt zusätzlich filter am Pfad nach Quell-Node-Typ. */
export function convexEdgeToRFWithSourceGlow(
  edge: Doc<"edges">,
  sourceNodeType: string | undefined,
  colorMode: EdgeGlowColorMode = "light",
): RFEdge {
  const base = convexEdgeToRF(edge);
  const filter = sourceGlowFilterForNodeType(sourceNodeType, colorMode);
  if (!filter) return base;
  return {
    ...base,
    style: { ...(base.style ?? {}), filter },
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
  "ai-image": { source: "image-out", target: "prompt-in" },
  group: { source: undefined, target: undefined },
  frame: { source: "frame-out", target: "frame-in" },
  note: { source: undefined, target: undefined },
  compare: { source: "compare-out", target: "left" },
  asset: { source: undefined, target: undefined },
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
  prompt: { width: 288, height: 220, data: { prompt: "", aspectRatio: "1:1" } },
  // 1:1 viewport 320 + chrome 88 ≈ äußere Höhe (siehe lib/image-formats.ts)
  "ai-image": { width: 320, height: 408, data: {} },
  group: { width: 400, height: 300, data: { label: "Gruppe" } },
  frame: {
    width: 400,
    height: 300,
    data: { label: "Frame", resolution: "1080x1080" },
  },
  note: { width: 208, height: 100, data: { content: "" } },
  compare: { width: 500, height: 380, data: {} },
  asset: { width: 260, height: 240, data: {} },
};

type MediaNodeKind = "asset" | "image";

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
