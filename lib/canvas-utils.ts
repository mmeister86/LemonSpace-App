import {
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  type Node as RFNode,
  type Edge as RFEdge,
} from "@xyflow/react";
import type { Doc, Id } from "@/convex/_generated/dataModel";

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

/** Compare: Ziel-Handles blau/smaragd, Quelle compare-out grau (wie in compare-node.tsx). */
const COMPARE_HANDLE_CONNECTION_RGB: Record<
  string,
  readonly [number, number, number]
> = {
  left: [59, 130, 246],
  right: [16, 185, 129],
  "compare-out": [100, 116, 139],
};

const CONNECTION_LINE_FALLBACK_RGB: readonly [number, number, number] = [
  13, 148, 136,
];

/**
 * RGB für die temporäre Verbindungslinie (Quell-Node + optional Handle, z. B. Reconnect).
 */
export function connectionLineAccentRgb(
  nodeType: string | undefined,
  handleId: string | null | undefined,
): readonly [number, number, number] {
  if (nodeType === "compare" && handleId) {
    const byHandle = COMPARE_HANDLE_CONNECTION_RGB[handleId];
    if (byHandle) return byHandle;
  }
  if (!nodeType) return CONNECTION_LINE_FALLBACK_RGB;
  return SOURCE_NODE_GLOW_RGB[nodeType] ?? CONNECTION_LINE_FALLBACK_RGB;
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
