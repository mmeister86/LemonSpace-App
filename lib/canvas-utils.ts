import type { Node as RFNode, Edge as RFEdge } from "@xyflow/react";
import type { Doc } from "@/convex/_generated/dataModel";

/**
 * Convex Node → React Flow Node
 *
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
 */
export function convexEdgeToRF(edge: Doc<"edges">): RFEdge {
  return {
    id: edge._id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
  };
}

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
};
