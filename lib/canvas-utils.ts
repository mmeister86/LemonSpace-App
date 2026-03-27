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
  // #region agent log
  fetch('http://127.0.0.1:7733/ingest/db1ec129-24cb-483b-98e2-3e7beef6d9cd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'594b9f'},body:JSON.stringify({sessionId:'594b9f',runId:'run1',hypothesisId:'H1-H3-H4',location:'canvas-utils.ts:convexEdgeToRF',message:'raw edge from convex',data:{edgeId:edge._id,sourceNodeId:edge.sourceNodeId,targetNodeId:edge.targetNodeId,rawSourceHandle:edge.sourceHandle,rawTargetHandle:edge.targetHandle,typeofSourceHandle:typeof edge.sourceHandle,typeofTargetHandle:typeof edge.targetHandle,isNullSH:edge.sourceHandle===null,isNullTH:edge.targetHandle===null,isUndefinedSH:edge.sourceHandle===undefined,isUndefinedTH:edge.targetHandle===undefined,isStringNullSH:edge.sourceHandle==='null',isStringNullTH:edge.targetHandle==='null',sanitizedSH:sanitize(edge.sourceHandle),sanitizedTH:sanitize(edge.targetHandle)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return {
    id: edge._id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: sanitize(edge.sourceHandle),
    targetHandle: sanitize(edge.targetHandle),
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
};
