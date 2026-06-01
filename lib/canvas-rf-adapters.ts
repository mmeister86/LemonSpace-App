/**
 * Onboarding note:
 * Shared TypeScript utility for canvas rf adapters. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  sourceEdgeStrokeForNodeType,
  sourceGlowFilterForNodeType,
  type EdgeGlowColorMode,
} from "@/lib/canvas-handle-style";
import { COLLAPSED_NODE_HEIGHT, readNodeCollapsed } from "@/lib/canvas-node-favorite";

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
  const previewStorageId = data?.previewStorageId;
  const lastUploadStorageId = data?.lastUploadStorageId;
  if (
    typeof sid !== "string" &&
    typeof previewStorageId !== "string" &&
    typeof lastUploadStorageId !== "string"
  ) {
    return node;
  }

  let nextData: Record<string, unknown> | null = null;
  if (urlByStorage) {
    if (typeof sid === "string") {
      const fromBatch = urlByStorage[sid];
      if (fromBatch !== undefined) {
        nextData = { ...(nextData ?? data), url: fromBatch };
      }
    }

    if (typeof previewStorageId === "string") {
      const fromBatch = urlByStorage[previewStorageId];
      if (fromBatch !== undefined) {
        nextData = { ...(nextData ?? data), previewUrl: fromBatch };
      }
    }

    if (typeof lastUploadStorageId === "string") {
      const fromBatch = urlByStorage[lastUploadStorageId];
      if (fromBatch !== undefined) {
        nextData = { ...(nextData ?? data), lastUploadUrl: fromBatch };
      }
    }

    if (nextData) {
      return { ...node, data: nextData };
    }
  }

  const prev = previousDataByNodeId.get(node._id);
  if (
    typeof sid === "string" &&
    prev?.url !== undefined &&
    typeof prev.storageId === "string" &&
    prev.storageId === sid
  ) {
    nextData = { ...(nextData ?? data), url: prev.url };
  }

  if (
    typeof previewStorageId === "string" &&
    prev?.previewUrl !== undefined &&
    typeof prev.previewStorageId === "string" &&
    prev.previewStorageId === previewStorageId
  ) {
    nextData = { ...(nextData ?? data), previewUrl: prev.previewUrl };
  }

  if (
    typeof lastUploadStorageId === "string" &&
    prev?.lastUploadUrl !== undefined &&
    typeof prev.lastUploadStorageId === "string" &&
    prev.lastUploadStorageId === lastUploadStorageId
  ) {
    nextData = { ...(nextData ?? data), lastUploadUrl: prev.lastUploadUrl };
  }

  if (nextData) {
    return {
      ...node,
      data: nextData,
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
  const nodeData = node.data as Record<string, unknown>;
  const renderedHeight = readNodeCollapsed(nodeData)
    ? COLLAPSED_NODE_HEIGHT
    : node.height;

  return {
    id: node._id,
    type: node.type,
    position: { x: node.positionX, y: node.positionY },
    data: {
      ...nodeData,
      canvasId: node.canvasId,
      // Status direkt in data durchreichen, damit Node-Komponenten darauf zugreifen können
      _status: node.status,
      _statusMessage: node.statusMessage,
      retryCount: node.retryCount,
    },
    parentId: node.parentId ?? undefined,
    zIndex: node.zIndex,
    width: node.width,
    height: renderedHeight,
    measured: {
      width: node.width,
      height: renderedHeight,
    },
    style: {
      width: node.width,
      height: renderedHeight,
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
