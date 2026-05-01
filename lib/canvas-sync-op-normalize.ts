/**
 * Onboarding note:
 * Shared TypeScript utility for canvas sync op normalize. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import type { Id } from "@/convex/_generated/dataModel";
import { isJsonRecord } from "@/lib/browser-storage-cache";
import {
  CANVAS_SYNC_RETENTION_MS,
  type CanvasSyncOp,
  type CanvasSyncOpBase,
  type CanvasSyncOpPayloadByType,
  type CanvasSyncOpType,
} from "@/lib/canvas-sync-op-types";

export { CANVAS_SYNC_RETENTION_MS } from "@/lib/canvas-sync-op-types";

const CANVAS_SYNC_OP_TYPES = new Set<string>([
  "createNode",
  "createNodeWithEdgeFromSource",
  "createNodeWithEdgeToTarget",
  "createNodeWithEdgeSplit",
  "createEdge",
  "removeEdge",
  "batchRemoveNodes",
  "splitEdgeAtExistingNode",
  "moveNode",
  "setNodeParent",
  "resizeNode",
  "updateData",
]);

function normalizeOptionalNodeId(value: unknown): Id<"nodes"> | undefined {
  return typeof value === "string" ? (value as Id<"nodes">) : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function normalizeBase(raw: Record<string, unknown>): CanvasSyncOpBase | null {
  const id = raw.id;
  const canvasId = raw.canvasId;
  if (typeof id !== "string" || !id || typeof canvasId !== "string" || !canvasId) {
    return null;
  }

  const enqueuedAt = typeof raw.enqueuedAt === "number" ? raw.enqueuedAt : Date.now();
  return {
    id,
    canvasId,
    enqueuedAt,
    attemptCount: typeof raw.attemptCount === "number" ? raw.attemptCount : 0,
    nextRetryAt: typeof raw.nextRetryAt === "number" ? raw.nextRetryAt : enqueuedAt,
    expiresAt:
      typeof raw.expiresAt === "number"
        ? raw.expiresAt
        : enqueuedAt + CANVAS_SYNC_RETENTION_MS,
    lastError: typeof raw.lastError === "string" ? raw.lastError : undefined,
  };
}

function normalizeNodeCreateFields(payload: Record<string, unknown>) {
  if (
    typeof payload.canvasId !== "string" ||
    typeof payload.type !== "string" ||
    typeof payload.positionX !== "number" ||
    typeof payload.positionY !== "number" ||
    typeof payload.width !== "number" ||
    typeof payload.height !== "number" ||
    typeof payload.clientRequestId !== "string"
  ) {
    return null;
  }

  return {
    canvasId: payload.canvasId as Id<"canvases">,
    type: payload.type,
    positionX: payload.positionX,
    positionY: payload.positionY,
    width: payload.width,
    height: payload.height,
    data: payload.data,
    parentId: normalizeOptionalNodeId(payload.parentId),
    zIndex: normalizeOptionalNumber(payload.zIndex),
    clientRequestId: payload.clientRequestId,
  };
}

function normalizeCreateNodePayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["createNode"] | null {
  return normalizeNodeCreateFields(payload);
}

function normalizeCreateNodeWithEdgeFromSourcePayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["createNodeWithEdgeFromSource"] | null {
  const nodeFields = normalizeNodeCreateFields(payload);
  if (!nodeFields || typeof payload.sourceNodeId !== "string") return null;
  return {
    ...nodeFields,
    sourceNodeId: payload.sourceNodeId,
    sourceHandle: normalizeOptionalString(payload.sourceHandle),
    targetHandle: normalizeOptionalString(payload.targetHandle),
  };
}

function normalizeCreateNodeWithEdgeToTargetPayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["createNodeWithEdgeToTarget"] | null {
  const nodeFields = normalizeNodeCreateFields(payload);
  if (!nodeFields || typeof payload.targetNodeId !== "string") return null;
  return {
    ...nodeFields,
    targetNodeId: payload.targetNodeId,
    sourceHandle: normalizeOptionalString(payload.sourceHandle),
    targetHandle: normalizeOptionalString(payload.targetHandle),
  };
}

function normalizeCreateNodeWithEdgeSplitPayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["createNodeWithEdgeSplit"] | null {
  const nodeFields = normalizeNodeCreateFields(payload);
  if (!nodeFields || typeof payload.splitEdgeId !== "string") return null;
  return {
    ...nodeFields,
    splitEdgeId: payload.splitEdgeId as Id<"edges">,
    newNodeTargetHandle: normalizeOptionalString(payload.newNodeTargetHandle),
    newNodeSourceHandle: normalizeOptionalString(payload.newNodeSourceHandle),
    splitSourceHandle: normalizeOptionalString(payload.splitSourceHandle),
    splitTargetHandle: normalizeOptionalString(payload.splitTargetHandle),
  };
}

function normalizeCreateEdgePayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["createEdge"] | null {
  if (
    typeof payload.canvasId !== "string" ||
    typeof payload.sourceNodeId !== "string" ||
    typeof payload.targetNodeId !== "string" ||
    typeof payload.clientRequestId !== "string"
  ) {
    return null;
  }

  return {
    canvasId: payload.canvasId as Id<"canvases">,
    sourceNodeId: payload.sourceNodeId as Id<"nodes">,
    targetNodeId: payload.targetNodeId as Id<"nodes">,
    sourceHandle: normalizeOptionalString(payload.sourceHandle),
    targetHandle: normalizeOptionalString(payload.targetHandle),
    edgeIdToIgnore:
      typeof payload.edgeIdToIgnore === "string"
        ? (payload.edgeIdToIgnore as Id<"edges">)
        : undefined,
    clientRequestId: payload.clientRequestId,
  };
}

function normalizeRemoveEdgePayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["removeEdge"] | null {
  if (typeof payload.edgeId !== "string") return null;
  return { edgeId: payload.edgeId as Id<"edges"> };
}

function normalizeBatchRemoveNodesPayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["batchRemoveNodes"] | null {
  if (
    !Array.isArray(payload.nodeIds) ||
    !payload.nodeIds.every((entry) => typeof entry === "string")
  ) {
    return null;
  }
  return { nodeIds: payload.nodeIds as Id<"nodes">[] };
}

function normalizeSplitEdgeAtExistingNodePayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["splitEdgeAtExistingNode"] | null {
  if (
    typeof payload.canvasId !== "string" ||
    typeof payload.splitEdgeId !== "string" ||
    typeof payload.middleNodeId !== "string" ||
    typeof payload.clientRequestId !== "string"
  ) {
    return null;
  }

  return {
    canvasId: payload.canvasId as Id<"canvases">,
    splitEdgeId: payload.splitEdgeId as Id<"edges">,
    middleNodeId: payload.middleNodeId as Id<"nodes">,
    splitSourceHandle: normalizeOptionalString(payload.splitSourceHandle),
    splitTargetHandle: normalizeOptionalString(payload.splitTargetHandle),
    newNodeSourceHandle: normalizeOptionalString(payload.newNodeSourceHandle),
    newNodeTargetHandle: normalizeOptionalString(payload.newNodeTargetHandle),
    positionX: normalizeOptionalNumber(payload.positionX),
    positionY: normalizeOptionalNumber(payload.positionY),
    clientRequestId: payload.clientRequestId,
  };
}

function normalizeMoveNodePayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["moveNode"] | null {
  if (
    typeof payload.nodeId !== "string" ||
    typeof payload.positionX !== "number" ||
    typeof payload.positionY !== "number"
  ) {
    return null;
  }
  return {
    nodeId: payload.nodeId as Id<"nodes">,
    positionX: payload.positionX,
    positionY: payload.positionY,
  };
}

function normalizeSetNodeParentPayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["setNodeParent"] | null {
  if (
    typeof payload.nodeId !== "string" ||
    typeof payload.positionX !== "number" ||
    typeof payload.positionY !== "number"
  ) {
    return null;
  }
  return {
    nodeId: payload.nodeId as Id<"nodes">,
    parentId: normalizeOptionalNodeId(payload.parentId),
    positionX: payload.positionX,
    positionY: payload.positionY,
  };
}

function normalizeResizeNodePayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["resizeNode"] | null {
  if (
    typeof payload.nodeId !== "string" ||
    typeof payload.width !== "number" ||
    typeof payload.height !== "number"
  ) {
    return null;
  }
  return {
    nodeId: payload.nodeId as Id<"nodes">,
    width: payload.width,
    height: payload.height,
  };
}

function normalizeUpdateDataPayload(
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType["updateData"] | null {
  if (typeof payload.nodeId !== "string") return null;
  return { nodeId: payload.nodeId as Id<"nodes">, data: payload.data };
}

function normalizePayload(
  type: CanvasSyncOpType,
  payload: Record<string, unknown>,
): CanvasSyncOpPayloadByType[CanvasSyncOpType] | null {
  switch (type) {
    case "createNode":
      return normalizeCreateNodePayload(payload);
    case "createNodeWithEdgeFromSource":
      return normalizeCreateNodeWithEdgeFromSourcePayload(payload);
    case "createNodeWithEdgeToTarget":
      return normalizeCreateNodeWithEdgeToTargetPayload(payload);
    case "createNodeWithEdgeSplit":
      return normalizeCreateNodeWithEdgeSplitPayload(payload);
    case "createEdge":
      return normalizeCreateEdgePayload(payload);
    case "removeEdge":
      return normalizeRemoveEdgePayload(payload);
    case "batchRemoveNodes":
      return normalizeBatchRemoveNodesPayload(payload);
    case "splitEdgeAtExistingNode":
      return normalizeSplitEdgeAtExistingNodePayload(payload);
    case "moveNode":
      return normalizeMoveNodePayload(payload);
    case "setNodeParent":
      return normalizeSetNodeParentPayload(payload);
    case "resizeNode":
      return normalizeResizeNodePayload(payload);
    case "updateData":
      return normalizeUpdateDataPayload(payload);
  }
}

export function normalizeCanvasSyncOp(raw: unknown): CanvasSyncOp | null {
  if (!isJsonRecord(raw)) return null;
  const type = raw.type;
  const payload = raw.payload;
  if (typeof type !== "string" || !CANVAS_SYNC_OP_TYPES.has(type)) return null;
  if (!isJsonRecord(payload)) return null;

  const base = normalizeBase(raw);
  if (!base) return null;

  const normalizedPayload = normalizePayload(type as CanvasSyncOpType, payload);
  if (!normalizedPayload) return null;

  return {
    ...base,
    type: type as CanvasSyncOpType,
    payload: normalizedPayload,
  } as CanvasSyncOp;
}
