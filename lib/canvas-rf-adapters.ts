import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  sourceEdgeStrokeForNodeType,
  sourceGlowFilterForNodeType,
  type EdgeGlowColorMode,
} from "@/lib/canvas-handle-style";

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

/**
 * Convex Node -> React Flow Node.
 * Convex speichert positionX/positionY als separate Felder,
 * React Flow erwartet position: { x, y }.
 */
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
 * Convex Edge -> React Flow Edge.
 * Sanitize handles: null/undefined/"null" -> undefined.
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

export type { EdgeGlowColorMode } from "@/lib/canvas-handle-style";
