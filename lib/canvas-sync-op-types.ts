import type { Id } from "@/convex/_generated/dataModel";

export const DB_NAME = "lemonspace.canvas.sync";
export const DB_VERSION = 1;
export const STORE_NAME = "ops";
export const FALLBACK_STORAGE_KEY = "lemonspace.canvas:sync-fallback:v1";
export const CANVAS_SYNC_RETENTION_MS = 24 * 60 * 60 * 1000;

export type CanvasSyncOpPayloadByType = {
  createNode: {
    canvasId: Id<"canvases">;
    type: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: unknown;
    parentId?: Id<"nodes">;
    zIndex?: number;
    clientRequestId: string;
  };
  createNodeWithEdgeFromSource: {
    canvasId: Id<"canvases">;
    type: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: unknown;
    parentId?: Id<"nodes">;
    zIndex?: number;
    clientRequestId: string;
    sourceNodeId: string;
    sourceHandle?: string;
    targetHandle?: string;
  };
  createNodeWithEdgeToTarget: {
    canvasId: Id<"canvases">;
    type: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: unknown;
    parentId?: Id<"nodes">;
    zIndex?: number;
    clientRequestId: string;
    targetNodeId: string;
    sourceHandle?: string;
    targetHandle?: string;
  };
  createNodeWithEdgeSplit: {
    canvasId: Id<"canvases">;
    type: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: unknown;
    parentId?: Id<"nodes">;
    zIndex?: number;
    splitEdgeId: Id<"edges">;
    newNodeTargetHandle?: string;
    newNodeSourceHandle?: string;
    splitSourceHandle?: string;
    splitTargetHandle?: string;
    clientRequestId: string;
  };
  createEdge: {
    canvasId: Id<"canvases">;
    sourceNodeId: Id<"nodes">;
    targetNodeId: Id<"nodes">;
    sourceHandle?: string;
    targetHandle?: string;
    edgeIdToIgnore?: Id<"edges">;
    clientRequestId: string;
  };
  removeEdge: {
    edgeId: Id<"edges">;
  };
  batchRemoveNodes: {
    nodeIds: Id<"nodes">[];
  };
  splitEdgeAtExistingNode: {
    canvasId: Id<"canvases">;
    splitEdgeId: Id<"edges">;
    middleNodeId: Id<"nodes">;
    splitSourceHandle?: string;
    splitTargetHandle?: string;
    newNodeSourceHandle?: string;
    newNodeTargetHandle?: string;
    positionX?: number;
    positionY?: number;
    clientRequestId: string;
  };
  moveNode: { nodeId: Id<"nodes">; positionX: number; positionY: number };
  setNodeParent: {
    nodeId: Id<"nodes">;
    parentId?: Id<"nodes">;
    positionX: number;
    positionY: number;
  };
  resizeNode: { nodeId: Id<"nodes">; width: number; height: number };
  updateData: { nodeId: Id<"nodes">; data: unknown };
};

export type CanvasSyncOpType = keyof CanvasSyncOpPayloadByType;

export type CanvasSyncOpBase = {
  id: string;
  canvasId: string;
  enqueuedAt: number;
  attemptCount: number;
  nextRetryAt: number;
  expiresAt: number;
  lastError?: string;
};

export type CanvasSyncOp = {
  [TType in CanvasSyncOpType]: CanvasSyncOpBase & {
    type: TType;
    payload: CanvasSyncOpPayloadByType[TType];
  };
}[CanvasSyncOpType];

export type CanvasSyncOpFor<TType extends CanvasSyncOpType> = Extract<
  CanvasSyncOp,
  { type: TType }
>;

export type EnqueueCanvasSyncOpInput<TType extends CanvasSyncOpType> = {
  id: string;
  canvasId: string;
  type: TType;
  payload: CanvasSyncOpPayloadByType[TType];
  now?: number;
};
