import type { CanvasSyncOpPayloadByType } from "@/lib/canvas-op-queue";

type CanvasSyncOpType = keyof CanvasSyncOpPayloadByType;

export type CanvasSyncQueueOperation = {
  [TType in CanvasSyncOpType]: {
    id: string;
    type: TType;
    payload: CanvasSyncOpPayloadByType[TType];
    attemptCount: number;
  };
}[CanvasSyncOpType];

export type CanvasSyncQueueDispatchHandlers = {
  createNode: (payload: CanvasSyncOpPayloadByType["createNode"]) => Promise<string>;
  createNodeWithEdgeFromSource: (
    payload: CanvasSyncOpPayloadByType["createNodeWithEdgeFromSource"],
  ) => Promise<string>;
  createNodeWithEdgeToTarget: (
    payload: CanvasSyncOpPayloadByType["createNodeWithEdgeToTarget"],
  ) => Promise<string>;
  createNodeWithEdgeSplit: (
    payload: CanvasSyncOpPayloadByType["createNodeWithEdgeSplit"],
  ) => Promise<string>;
  createEdge: (payload: CanvasSyncOpPayloadByType["createEdge"]) => Promise<string>;
  removeEdge: (payload: CanvasSyncOpPayloadByType["removeEdge"]) => Promise<unknown>;
  batchRemoveNodes: (
    payload: CanvasSyncOpPayloadByType["batchRemoveNodes"],
  ) => Promise<unknown>;
  splitEdgeAtExistingNode: (
    payload: CanvasSyncOpPayloadByType["splitEdgeAtExistingNode"],
  ) => Promise<unknown>;
  moveNode: (payload: CanvasSyncOpPayloadByType["moveNode"]) => Promise<unknown>;
  setNodeParent: (
    payload: CanvasSyncOpPayloadByType["setNodeParent"],
  ) => Promise<unknown>;
  resizeNode: (payload: CanvasSyncOpPayloadByType["resizeNode"]) => Promise<unknown>;
  updateData: (payload: CanvasSyncOpPayloadByType["updateData"]) => Promise<unknown>;
  onCreatedNode: (clientRequestId: string, realId: string) => Promise<void>;
  onCreatedEdge: (clientRequestId: string, realId: string) => void;
  onEdgeTopologyChanged: () => void;
};

export function getCanvasSyncErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

export function shouldRetryCanvasSyncError(
  error: unknown,
  isSyncOnline: boolean,
): boolean {
  if (!isSyncOnline) return true;
  const message = getCanvasSyncErrorMessage(error).toLowerCase();
  return (
    message.includes("network") ||
    message.includes("websocket") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("temporarily") ||
    message.includes("connection")
  );
}

export function summarizeUpdateDataPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    return { payloadShape: "invalid" };
  }

  const p = payload as { nodeId?: unknown; data?: unknown };
  const data =
    typeof p.data === "object" && p.data !== null
      ? (p.data as Record<string, unknown>)
      : null;

  return {
    nodeId: typeof p.nodeId === "string" ? p.nodeId : null,
    hasData: Boolean(data),
    hasStorageId: typeof data?.storageId === "string" && data.storageId.length > 0,
    hasLastUploadStorageId:
      typeof data?.lastUploadStorageId === "string" &&
      data.lastUploadStorageId.length > 0,
    hasUrl: typeof data?.url === "string" && data.url.length > 0,
    hasLastUploadUrl:
      typeof data?.lastUploadUrl === "string" && data.lastUploadUrl.length > 0,
    lastUploadedAt:
      typeof data?.lastUploadedAt === "number" && Number.isFinite(data.lastUploadedAt)
        ? data.lastUploadedAt
        : null,
  };
}

export function summarizeResizePayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    return { payloadShape: "invalid" };
  }

  const p = payload as { nodeId?: unknown; width?: unknown; height?: unknown };
  return {
    nodeId: typeof p.nodeId === "string" ? p.nodeId : null,
    width: typeof p.width === "number" && Number.isFinite(p.width) ? p.width : null,
    height:
      typeof p.height === "number" && Number.isFinite(p.height) ? p.height : null,
  };
}

export async function dispatchCanvasSyncQueueOp(
  op: CanvasSyncQueueOperation,
  handlers: CanvasSyncQueueDispatchHandlers,
): Promise<void> {
  if (op.type === "createNode") {
    const realId = await handlers.createNode(op.payload);
    await handlers.onCreatedNode(op.payload.clientRequestId, realId);
    handlers.onEdgeTopologyChanged();
  } else if (op.type === "createNodeWithEdgeFromSource") {
    const realId = await handlers.createNodeWithEdgeFromSource(op.payload);
    await handlers.onCreatedNode(op.payload.clientRequestId, realId);
    handlers.onEdgeTopologyChanged();
  } else if (op.type === "createNodeWithEdgeToTarget") {
    const realId = await handlers.createNodeWithEdgeToTarget(op.payload);
    await handlers.onCreatedNode(op.payload.clientRequestId, realId);
    handlers.onEdgeTopologyChanged();
  } else if (op.type === "createNodeWithEdgeSplit") {
    const realId = await handlers.createNodeWithEdgeSplit(op.payload);
    await handlers.onCreatedNode(op.payload.clientRequestId, realId);
    handlers.onEdgeTopologyChanged();
  } else if (op.type === "createEdge") {
    const realEdgeId = await handlers.createEdge(op.payload);
    handlers.onCreatedEdge(op.payload.clientRequestId, realEdgeId);
  } else if (op.type === "removeEdge") {
    await handlers.removeEdge(op.payload);
  } else if (op.type === "batchRemoveNodes") {
    await handlers.batchRemoveNodes(op.payload);
  } else if (op.type === "splitEdgeAtExistingNode") {
    await handlers.splitEdgeAtExistingNode(op.payload);
    handlers.onEdgeTopologyChanged();
  } else if (op.type === "moveNode") {
    await handlers.moveNode(op.payload);
  } else if (op.type === "setNodeParent") {
    await handlers.setNodeParent(op.payload);
  } else if (op.type === "resizeNode") {
    if (process.env.NODE_ENV !== "production") {
      console.info("[Canvas sync debug] resizeNode enqueue->flush", {
        opId: op.id,
        attemptCount: op.attemptCount,
        ...summarizeResizePayload(op.payload),
      });
    }
    await handlers.resizeNode(op.payload);
  } else if (op.type === "updateData") {
    if (process.env.NODE_ENV !== "production") {
      console.info("[Canvas sync debug] updateData enqueue->flush", {
        opId: op.id,
        attemptCount: op.attemptCount,
        ...summarizeUpdateDataPayload(op.payload),
      });
    }
    await handlers.updateData(op.payload);
  }
}
