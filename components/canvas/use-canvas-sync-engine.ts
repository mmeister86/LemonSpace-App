import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { useConvexConnectionState, useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ackCanvasSyncOp,
  countCanvasSyncOps,
  type CanvasSyncOpPayloadByType,
  dropCanvasSyncOpsByClientRequestIds,
  dropCanvasSyncOpsByEdgeIds,
  dropCanvasSyncOpsByNodeIds,
  dropExpiredCanvasSyncOps,
  enqueueCanvasSyncOp,
  listCanvasSyncOps,
  markCanvasSyncOpFailed,
  remapCanvasSyncNodeId,
} from "@/lib/canvas-op-queue";
import {
  dropCanvasOpsByClientRequestIds,
  dropCanvasOpsByEdgeIds,
  dropCanvasOpsByNodeIds,
  enqueueCanvasOp,
  remapCanvasOpNodeId,
  resolveCanvasOp,
  resolveCanvasOps,
} from "@/lib/canvas-local-persistence";
import { toast } from "@/lib/toast";
import {
  clientRequestIdFromOptimisticEdgeId,
  clientRequestIdFromOptimisticNodeId,
  createCanvasOpId,
  isOptimisticEdgeId,
  isOptimisticNodeId,
  OPTIMISTIC_EDGE_PREFIX,
  OPTIMISTIC_NODE_PREFIX,
  type PendingEdgeSplit,
} from "./canvas-helpers";

type QueueSyncMutation = <TType extends keyof CanvasSyncOpPayloadByType>(
  type: TType,
  payload: CanvasSyncOpPayloadByType[TType],
) => Promise<void>;

type DynamicValue<T> = T | (() => T);

function resolveDynamicValue<T>(value: DynamicValue<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

type RunMoveNodeMutation = (args: {
  nodeId: Id<"nodes">;
  positionX: number;
  positionY: number;
}) => Promise<void>;

type RunBatchRemoveNodesMutation = (args: {
  nodeIds: Id<"nodes">[];
}) => Promise<void>;

type RunSplitEdgeAtExistingNodeMutation = (args: {
  canvasId: Id<"canvases">;
  splitEdgeId: Id<"edges">;
  middleNodeId: Id<"nodes">;
  splitSourceHandle?: string;
  splitTargetHandle?: string;
  newNodeSourceHandle?: string;
  newNodeTargetHandle?: string;
  positionX?: number;
  positionY?: number;
  clientRequestId?: string;
}) => Promise<void>;

type CanvasSyncEngineControllerParams = {
  canvasId: DynamicValue<Id<"canvases">>;
  isSyncOnline: DynamicValue<boolean>;
  getEnqueueSyncMutation: () => QueueSyncMutation;
  getRunMoveNodeMutation?: () => RunMoveNodeMutation | undefined;
  getRunBatchRemoveNodes?: () => RunBatchRemoveNodesMutation | undefined;
  getRunSplitEdgeAtExistingNode?: () => RunSplitEdgeAtExistingNodeMutation | undefined;
  getSetAssetBrowserTargetNodeId?: () =>
    | Dispatch<SetStateAction<string | null>>
    | undefined;
  getSetNodes?: () => Dispatch<SetStateAction<RFNode[]>> | undefined;
  getSetEdges?: () => Dispatch<SetStateAction<RFEdge[]>> | undefined;
  getDeletingNodeIds?: () => MutableRefObject<Set<string>> | undefined;
};

type UseCanvasSyncEngineParams = {
  canvasId: Id<"canvases">;
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  setEdges: Dispatch<SetStateAction<RFEdge[]>>;
  edgesRef: MutableRefObject<RFEdge[]>;
  setAssetBrowserTargetNodeId: Dispatch<SetStateAction<string | null>>;
  setEdgeSyncNonce: Dispatch<SetStateAction<number>>;
  deletingNodeIds: MutableRefObject<Set<string>>;
};

export type CanvasSyncEngineController = ReturnType<
  typeof createCanvasSyncEngineController
>;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function isLikelyTransientSyncError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("network") ||
    message.includes("websocket") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("temporarily") ||
    message.includes("connection")
  );
}

function summarizeUpdateDataPayload(payload: unknown): Record<string, unknown> {
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

function summarizeResizePayload(payload: unknown): Record<string, unknown> {
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

export function createCanvasSyncEngineController({
  canvasId,
  isSyncOnline,
  getEnqueueSyncMutation,
  getRunMoveNodeMutation,
  getRunBatchRemoveNodes,
  getRunSplitEdgeAtExistingNode,
  getSetAssetBrowserTargetNodeId,
  getSetNodes,
  getSetEdges,
  getDeletingNodeIds,
}: CanvasSyncEngineControllerParams) {
  const getCanvasId = () => resolveDynamicValue(canvasId);
  const getIsSyncOnline = () => resolveDynamicValue(isSyncOnline);

  const pendingMoveAfterCreateRef = {
    current: new Map<string, { positionX: number; positionY: number }>(),
  };
  const pendingResizeAfterCreateRef = {
    current: new Map<string, { width: number; height: number }>(),
  };
  const pendingDataAfterCreateRef = { current: new Map<string, unknown>() };
  const resolvedRealIdByClientRequestRef = {
    current: new Map<string, Id<"nodes">>(),
  };
  const pendingEdgeSplitByClientRequestRef = {
    current: new Map<string, PendingEdgeSplit>(),
  };
  const pendingDeleteAfterCreateClientRequestIdsRef = {
    current: new Set<string>(),
  };
  const pendingConnectionCreatesRef = { current: new Set<string>() };
  const pendingLocalPositionUntilConvexMatchesRef = {
    current: new Map<string, { x: number; y: number }>(),
  };
  const preferLocalPositionNodeIdsRef = { current: new Set<string>() };

  const flushPendingResizeForClientRequest = async (
    clientRequestId: string,
    realId: Id<"nodes">,
  ): Promise<void> => {
    const pendingResize = pendingResizeAfterCreateRef.current.get(clientRequestId);
    if (!pendingResize) return;
    pendingResizeAfterCreateRef.current.delete(clientRequestId);
    await getEnqueueSyncMutation()("resizeNode", {
      nodeId: realId,
      width: pendingResize.width,
      height: pendingResize.height,
    });
  };

  const flushPendingDataForClientRequest = async (
    clientRequestId: string,
    realId: Id<"nodes">,
  ): Promise<void> => {
    if (!pendingDataAfterCreateRef.current.has(clientRequestId)) return;
    const pendingData = pendingDataAfterCreateRef.current.get(clientRequestId);
    pendingDataAfterCreateRef.current.delete(clientRequestId);
    await getEnqueueSyncMutation()("updateData", {
      nodeId: realId,
      data: pendingData,
    });
  };

  const queueNodeResize = async (args: {
    nodeId: Id<"nodes">;
    width: number;
    height: number;
  }): Promise<void> => {
    const rawNodeId = args.nodeId as string;
    if (!isOptimisticNodeId(rawNodeId) || !getIsSyncOnline()) {
      await getEnqueueSyncMutation()("resizeNode", args);
      return;
    }

    const clientRequestId = clientRequestIdFromOptimisticNodeId(rawNodeId);
    const resolvedRealId = clientRequestId
      ? resolvedRealIdByClientRequestRef.current.get(clientRequestId)
      : undefined;

    if (resolvedRealId) {
      await getEnqueueSyncMutation()("resizeNode", {
        nodeId: resolvedRealId,
        width: args.width,
        height: args.height,
      });
      return;
    }

    if (clientRequestId) {
      pendingResizeAfterCreateRef.current.set(clientRequestId, {
        width: args.width,
        height: args.height,
      });
    }
  };

  const queueNodeDataUpdate = async (args: {
    nodeId: Id<"nodes">;
    data: unknown;
  }): Promise<void> => {
    const rawNodeId = args.nodeId as string;
    if (!isOptimisticNodeId(rawNodeId) || !getIsSyncOnline()) {
      await getEnqueueSyncMutation()("updateData", args);
      return;
    }

    const clientRequestId = clientRequestIdFromOptimisticNodeId(rawNodeId);
    const resolvedRealId = clientRequestId
      ? resolvedRealIdByClientRequestRef.current.get(clientRequestId)
      : undefined;

    if (resolvedRealId) {
      await getEnqueueSyncMutation()("updateData", {
        nodeId: resolvedRealId,
        data: args.data,
      });
      return;
    }

    if (clientRequestId) {
      pendingDataAfterCreateRef.current.set(clientRequestId, args.data);
    }
  };

  const syncPendingMoveForClientRequest = async (
    clientRequestId: string | undefined,
    realId?: Id<"nodes">,
  ): Promise<void> => {
    if (!clientRequestId) return;

    if (realId !== undefined) {
      if (isOptimisticNodeId(realId as string)) {
        return;
      }

      if (pendingDeleteAfterCreateClientRequestIdsRef.current.has(clientRequestId)) {
        pendingDeleteAfterCreateClientRequestIdsRef.current.delete(clientRequestId);
        pendingMoveAfterCreateRef.current.delete(clientRequestId);
        pendingResizeAfterCreateRef.current.delete(clientRequestId);
        pendingDataAfterCreateRef.current.delete(clientRequestId);
        pendingEdgeSplitByClientRequestRef.current.delete(clientRequestId);
        pendingConnectionCreatesRef.current.delete(clientRequestId);
        resolvedRealIdByClientRequestRef.current.delete(clientRequestId);

        const realNodeId = realId as string;
        const deletingNodeIds = getDeletingNodeIds?.();
        const setNodes = getSetNodes?.();
        const setEdges = getSetEdges?.();
        deletingNodeIds?.current.add(realNodeId);
        setNodes?.((current) => current.filter((node) => node.id !== realNodeId));
        setEdges?.((current) =>
          current.filter(
            (edge) => edge.source !== realNodeId && edge.target !== realNodeId,
          ),
        );
        const batchRemoveNodes = getRunBatchRemoveNodes?.();
        if (batchRemoveNodes) {
          await batchRemoveNodes({ nodeIds: [realId] });
        }
        return;
      }

      const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}`;
      const setAssetBrowserTargetNodeId = getSetAssetBrowserTargetNodeId?.();
      setAssetBrowserTargetNodeId?.((current) =>
        current === optimisticNodeId ? (realId as string) : current,
      );

      const pendingMove = pendingMoveAfterCreateRef.current.get(clientRequestId);
      const splitPayload =
        pendingEdgeSplitByClientRequestRef.current.get(clientRequestId);

      if (splitPayload) {
        pendingEdgeSplitByClientRequestRef.current.delete(clientRequestId);
        if (pendingMove) {
          pendingMoveAfterCreateRef.current.delete(clientRequestId);
        }
        resolvedRealIdByClientRequestRef.current.delete(clientRequestId);
        const splitEdgeAtExistingNode = getRunSplitEdgeAtExistingNode?.();
        if (splitEdgeAtExistingNode) {
          await splitEdgeAtExistingNode({
            canvasId: getCanvasId(),
            splitEdgeId: splitPayload.intersectedEdgeId,
            middleNodeId: realId,
            splitSourceHandle: splitPayload.intersectedSourceHandle,
            splitTargetHandle: splitPayload.intersectedTargetHandle,
            newNodeSourceHandle: splitPayload.middleSourceHandle,
            newNodeTargetHandle: splitPayload.middleTargetHandle,
            positionX: pendingMove?.positionX ?? splitPayload.positionX,
            positionY: pendingMove?.positionY ?? splitPayload.positionY,
          });
        }
        await flushPendingResizeForClientRequest(clientRequestId, realId);
        await flushPendingDataForClientRequest(clientRequestId, realId);
        return;
      }

      if (pendingMove) {
        pendingMoveAfterCreateRef.current.delete(clientRequestId);
        resolvedRealIdByClientRequestRef.current.set(clientRequestId, realId);
        pendingLocalPositionUntilConvexMatchesRef.current.set(realId as string, {
          x: pendingMove.positionX,
          y: pendingMove.positionY,
        });
        const moveNodeMutation = getRunMoveNodeMutation?.();
        if (moveNodeMutation) {
          await moveNodeMutation({
            nodeId: realId,
            positionX: pendingMove.positionX,
            positionY: pendingMove.positionY,
          });
        } else {
          await getEnqueueSyncMutation()("moveNode", {
            nodeId: realId,
            positionX: pendingMove.positionX,
            positionY: pendingMove.positionY,
          });
        }
        await flushPendingResizeForClientRequest(clientRequestId, realId);
        await flushPendingDataForClientRequest(clientRequestId, realId);
        return;
      }

      resolvedRealIdByClientRequestRef.current.set(clientRequestId, realId);
      await flushPendingResizeForClientRequest(clientRequestId, realId);
      await flushPendingDataForClientRequest(clientRequestId, realId);
      return;
    }

    const resolvedRealId =
      resolvedRealIdByClientRequestRef.current.get(clientRequestId);
    const pendingMove = pendingMoveAfterCreateRef.current.get(clientRequestId);
    if (!resolvedRealId || !pendingMove) return;

    pendingMoveAfterCreateRef.current.delete(clientRequestId);
    resolvedRealIdByClientRequestRef.current.delete(clientRequestId);

    const splitPayload = pendingEdgeSplitByClientRequestRef.current.get(clientRequestId);
    if (splitPayload) {
      pendingEdgeSplitByClientRequestRef.current.delete(clientRequestId);
      const splitEdgeAtExistingNode = getRunSplitEdgeAtExistingNode?.();
      if (splitEdgeAtExistingNode) {
        await splitEdgeAtExistingNode({
          canvasId: getCanvasId(),
          splitEdgeId: splitPayload.intersectedEdgeId,
          middleNodeId: resolvedRealId,
          splitSourceHandle: splitPayload.intersectedSourceHandle,
          splitTargetHandle: splitPayload.intersectedTargetHandle,
          newNodeSourceHandle: splitPayload.middleSourceHandle,
          newNodeTargetHandle: splitPayload.middleTargetHandle,
          positionX: splitPayload.positionX ?? pendingMove.positionX,
          positionY: splitPayload.positionY ?? pendingMove.positionY,
        });
      }
      await flushPendingDataForClientRequest(clientRequestId, resolvedRealId);
      return;
    }

    pendingLocalPositionUntilConvexMatchesRef.current.set(resolvedRealId as string, {
      x: pendingMove.positionX,
      y: pendingMove.positionY,
    });
    const moveNodeMutation = getRunMoveNodeMutation?.();
    if (moveNodeMutation) {
      await moveNodeMutation({
        nodeId: resolvedRealId,
        positionX: pendingMove.positionX,
        positionY: pendingMove.positionY,
      });
    } else {
      await getEnqueueSyncMutation()("moveNode", {
        nodeId: resolvedRealId,
        positionX: pendingMove.positionX,
        positionY: pendingMove.positionY,
      });
    }
    await flushPendingDataForClientRequest(clientRequestId, resolvedRealId);
  };

  return {
    pendingMoveAfterCreateRef,
    pendingResizeAfterCreateRef,
    pendingDataAfterCreateRef,
    resolvedRealIdByClientRequestRef,
    pendingEdgeSplitByClientRequestRef,
    pendingDeleteAfterCreateClientRequestIdsRef,
    pendingConnectionCreatesRef,
    pendingLocalPositionUntilConvexMatchesRef,
    preferLocalPositionNodeIdsRef,
    flushPendingResizeForClientRequest,
    flushPendingDataForClientRequest,
    queueNodeResize,
    queueNodeDataUpdate,
    syncPendingMoveForClientRequest,
  };
}

export function useCanvasSyncEngine({
  canvasId,
  setNodes,
  setEdges,
  edgesRef,
  setAssetBrowserTargetNodeId,
  setEdgeSyncNonce,
  deletingNodeIds,
}: UseCanvasSyncEngineParams) {
  const moveNode = useMutation(api.nodes.move);
  const resizeNode = useMutation(api.nodes.resize);
  const updateNodeData = useMutation(api.nodes.updateData);
  const connectionState = useConvexConnectionState();
  const syncInFlightRef = useRef(false);
  const lastOfflineUnsupportedToastAtRef = useRef(0);
  const pendingCreatePromiseByClientRequestRef = useRef(
    new Map<string, Promise<Id<"nodes">>>(),
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const isSyncOnline =
    isBrowserOnline === true && connectionState.isWebSocketConnected === true;
  const canvasIdRef = useRef(canvasId);
  canvasIdRef.current = canvasId;
  const isSyncOnlineRef = useRef(isSyncOnline);
  isSyncOnlineRef.current = isSyncOnline;
  const setNodesRef = useRef(setNodes);
  setNodesRef.current = setNodes;
  const setEdgesRef = useRef(setEdges);
  setEdgesRef.current = setEdges;
  const setAssetBrowserTargetNodeIdRef = useRef(setAssetBrowserTargetNodeId);
  setAssetBrowserTargetNodeIdRef.current = setAssetBrowserTargetNodeId;
  const deletingNodeIdsRef = useRef(deletingNodeIds);
  deletingNodeIdsRef.current = deletingNodeIds;

  const enqueueSyncMutationRef = useRef<QueueSyncMutation>(async () => undefined);
  const runMoveNodeMutationRef = useRef<RunMoveNodeMutation>(async () => undefined);
  const runBatchRemoveNodesMutationRef = useRef<RunBatchRemoveNodesMutation>(
    async () => {},
  );
  const runSplitEdgeAtExistingNodeMutationRef =
    useRef<RunSplitEdgeAtExistingNodeMutation>(async () => {});

  const refreshPendingSyncCount = useCallback(async () => {
    const count = await countCanvasSyncOps(canvasId as string);
    setPendingSyncCount(count);
  }, [canvasId]);

  const enqueueSyncMutation = useCallback<QueueSyncMutation>(
    async (type, payload) => {
      const opId = createCanvasOpId();
      const now = Date.now();
      const result = await enqueueCanvasSyncOp({
        id: opId,
        canvasId: canvasId as string,
        type,
        payload,
        now,
      });
      enqueueCanvasOp(canvasId as string, {
        id: opId,
        type,
        payload,
        enqueuedAt: now,
      });
      resolveCanvasOps(canvasId as string, result.replacedIds);
      await refreshPendingSyncCount();
      void flushCanvasSyncQueueRef.current();
    },
    [canvasId, refreshPendingSyncCount],
  );
  enqueueSyncMutationRef.current = enqueueSyncMutation;

  const runMoveNodeMutation = useCallback<RunMoveNodeMutation>(
    async (args) => {
      await enqueueSyncMutation("moveNode", args);
    },
    [enqueueSyncMutation],
  );
  runMoveNodeMutationRef.current = runMoveNodeMutation;

  const runBatchMoveNodesMutation = useCallback(
    async (args: {
      moves: { nodeId: Id<"nodes">; positionX: number; positionY: number }[];
    }) => {
      for (const move of args.moves) {
        await enqueueSyncMutation("moveNode", move);
      }
    },
    [enqueueSyncMutation],
  );

  const createNode = useMutation(api.nodes.create).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.nodes.list, {
        canvasId: args.canvasId,
      });
      if (current === undefined) return;

      const tempId = (
        args.clientRequestId
          ? `${OPTIMISTIC_NODE_PREFIX}${args.clientRequestId}`
          : `${OPTIMISTIC_NODE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      ) as Id<"nodes">;

      const synthetic: Doc<"nodes"> = {
        _id: tempId,
        _creationTime: Date.now(),
        canvasId: args.canvasId,
        type: args.type as Doc<"nodes">["type"],
        positionX: args.positionX,
        positionY: args.positionY,
        width: args.width,
        height: args.height,
        status: "idle",
        retryCount: 0,
        data: args.data,
        parentId: args.parentId,
        zIndex: args.zIndex,
      };

      localStore.setQuery(api.nodes.list, { canvasId: args.canvasId }, [
        ...current,
        synthetic,
      ]);
    },
  );

  const createNodeWithEdgeFromSource = useMutation(
    api.nodes.createWithEdgeFromSource,
  ).withOptimisticUpdate((localStore, args) => {
    const nodeList = localStore.getQuery(api.nodes.list, {
      canvasId: args.canvasId,
    });
    const edgeList = localStore.getQuery(api.edges.list, {
      canvasId: args.canvasId,
    });
    if (nodeList === undefined || edgeList === undefined) return;

    const tempNodeId = (
      args.clientRequestId
        ? `${OPTIMISTIC_NODE_PREFIX}${args.clientRequestId}`
        : `${OPTIMISTIC_NODE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    ) as Id<"nodes">;

    const tempEdgeId = (
      args.clientRequestId
        ? `${OPTIMISTIC_EDGE_PREFIX}${args.clientRequestId}`
        : `${OPTIMISTIC_EDGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    ) as Id<"edges">;

    const syntheticNode: Doc<"nodes"> = {
      _id: tempNodeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    };

    const sourceNode = nodeList.find((node) => node._id === args.sourceNodeId);
    if (!sourceNode) return;

    const syntheticEdge: Doc<"edges"> = {
      _id: tempEdgeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      sourceNodeId: sourceNode._id,
      targetNodeId: tempNodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    };

    localStore.setQuery(api.nodes.list, { canvasId: args.canvasId }, [
      ...nodeList,
      syntheticNode,
    ]);
    localStore.setQuery(api.edges.list, { canvasId: args.canvasId }, [
      ...edgeList,
      syntheticEdge,
    ]);
  });

  const createNodeWithEdgeToTarget = useMutation(
    api.nodes.createWithEdgeToTarget,
  ).withOptimisticUpdate((localStore, args) => {
    const nodeList = localStore.getQuery(api.nodes.list, {
      canvasId: args.canvasId,
    });
    const edgeList = localStore.getQuery(api.edges.list, {
      canvasId: args.canvasId,
    });
    if (nodeList === undefined || edgeList === undefined) return;

    const tempNodeId = (
      args.clientRequestId
        ? `${OPTIMISTIC_NODE_PREFIX}${args.clientRequestId}`
        : `${OPTIMISTIC_NODE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    ) as Id<"nodes">;

    const tempEdgeId = (
      args.clientRequestId
        ? `${OPTIMISTIC_EDGE_PREFIX}${args.clientRequestId}`
        : `${OPTIMISTIC_EDGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    ) as Id<"edges">;

    const syntheticNode: Doc<"nodes"> = {
      _id: tempNodeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    };

    const targetNode = nodeList.find((node) => node._id === args.targetNodeId);
    if (!targetNode) return;

    const syntheticEdge: Doc<"edges"> = {
      _id: tempEdgeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      sourceNodeId: tempNodeId,
      targetNodeId: targetNode._id,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    };

    localStore.setQuery(api.nodes.list, { canvasId: args.canvasId }, [
      ...nodeList,
      syntheticNode,
    ]);
    localStore.setQuery(api.edges.list, { canvasId: args.canvasId }, [
      ...edgeList,
      syntheticEdge,
    ]);
  });

  const createNodeWithEdgeSplitMut = useMutation(api.nodes.createWithEdgeSplit);

  const createEdge = useMutation(api.edges.create).withOptimisticUpdate(
    (localStore, args) => {
      const edgeList = localStore.getQuery(api.edges.list, {
        canvasId: args.canvasId,
      });
      const nodeList = localStore.getQuery(api.nodes.list, {
        canvasId: args.canvasId,
      });
      if (edgeList === undefined || nodeList === undefined) return;

      const sourceNode = nodeList.find((node) => node._id === args.sourceNodeId);
      const targetNode = nodeList.find((node) => node._id === args.targetNodeId);
      if (!sourceNode || !targetNode) return;

      const tempId = (
        args.clientRequestId
          ? `${OPTIMISTIC_EDGE_PREFIX}${args.clientRequestId}`
          : `${OPTIMISTIC_EDGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      ) as Id<"edges">;
      const synthetic: Doc<"edges"> = {
        _id: tempId,
        _creationTime: Date.now(),
        canvasId: args.canvasId,
        sourceNodeId: sourceNode._id,
        targetNodeId: targetNode._id,
        sourceHandle: args.sourceHandle,
        targetHandle: args.targetHandle,
      };
      localStore.setQuery(api.edges.list, { canvasId: args.canvasId }, [
        ...edgeList,
        synthetic,
      ]);
    },
  );

  const createNodeRaw = useMutation(api.nodes.create);
  const createNodeWithEdgeFromSourceRaw = useMutation(
    api.nodes.createWithEdgeFromSource,
  );
  const createNodeWithEdgeToTargetRaw = useMutation(
    api.nodes.createWithEdgeToTarget,
  );
  const createNodeWithEdgeSplitRaw = useMutation(api.nodes.createWithEdgeSplit);
  const createEdgeRaw = useMutation(api.edges.create);
  const batchRemoveNodesRaw = useMutation(api.nodes.batchRemove);
  const removeEdgeRaw = useMutation(api.edges.remove);
  const splitEdgeAtExistingNodeRaw = useMutation(api.nodes.splitEdgeAtExistingNode);

  const flushCanvasSyncQueueRef = useRef(async () => {});

  const controllerRef = useRef<CanvasSyncEngineController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createCanvasSyncEngineController({
      canvasId: () => canvasIdRef.current,
      isSyncOnline: () => isSyncOnlineRef.current,
      getEnqueueSyncMutation: () => enqueueSyncMutationRef.current,
      getRunMoveNodeMutation: () => runMoveNodeMutationRef.current,
      getRunBatchRemoveNodes: () => async (args: { nodeIds: Id<"nodes">[] }) => {
        await runBatchRemoveNodesMutationRef.current(args);
      },
      getRunSplitEdgeAtExistingNode: () => async (
        args: Parameters<RunSplitEdgeAtExistingNodeMutation>[0],
      ) => {
        await runSplitEdgeAtExistingNodeMutationRef.current(args);
      },
      getSetAssetBrowserTargetNodeId: () => setAssetBrowserTargetNodeIdRef.current,
      getSetNodes: () => setNodesRef.current,
      getSetEdges: () => setEdgesRef.current,
      getDeletingNodeIds: () => deletingNodeIdsRef.current,
    });
  }
  const controller = controllerRef.current;

  const trackPendingNodeCreate = useCallback(
    (
      clientRequestId: string,
      createPromise: Promise<Id<"nodes">>,
    ): Promise<Id<"nodes">> => {
      const trackedPromise = createPromise
        .then((realId) => {
          controller.resolvedRealIdByClientRequestRef.current.set(
            clientRequestId,
            realId,
          );
          return realId;
        })
        .finally(() => {
          pendingCreatePromiseByClientRequestRef.current.delete(clientRequestId);
        });

      pendingCreatePromiseByClientRequestRef.current.set(
        clientRequestId,
        trackedPromise,
      );
      return trackedPromise;
    },
    [controller.resolvedRealIdByClientRequestRef],
  );

  const addOptimisticNodeLocally = useCallback(
    (
      args: Parameters<typeof createNode>[0] & { clientRequestId: string },
    ): Id<"nodes"> => {
      const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${args.clientRequestId}`;
      setNodes((current) => {
        if (current.some((node) => node.id === optimisticNodeId)) {
          return current;
        }
        return [
          ...current,
          {
            id: optimisticNodeId,
            type: args.type,
            position: { x: args.positionX, y: args.positionY },
            data: args.data,
            style: { width: args.width, height: args.height },
            parentId: args.parentId as string | undefined,
            zIndex: args.zIndex,
            selected: false,
          },
        ];
      });
      return optimisticNodeId as Id<"nodes">;
    },
    [setNodes],
  );

  const addOptimisticEdgeLocally = useCallback(
    (args: {
      clientRequestId: string;
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandle?: string;
      targetHandle?: string;
    }): Id<"edges"> => {
      const optimisticEdgeId = `${OPTIMISTIC_EDGE_PREFIX}${args.clientRequestId}`;
      setEdges((current) => {
        if (current.some((edge) => edge.id === optimisticEdgeId)) {
          return current;
        }
        return [
          ...current,
          {
            id: optimisticEdgeId,
            source: args.sourceNodeId,
            target: args.targetNodeId,
            sourceHandle: args.sourceHandle,
            targetHandle: args.targetHandle,
          },
        ];
      });
      return optimisticEdgeId as Id<"edges">;
    },
    [setEdges],
  );

  const applyEdgeSplitLocally = useCallback(
    (args: {
      clientRequestId: string;
      splitEdgeId: Id<"edges">;
      middleNodeId: Id<"nodes">;
      splitSourceHandle?: string;
      splitTargetHandle?: string;
      newNodeSourceHandle?: string;
      newNodeTargetHandle?: string;
      positionX?: number;
      positionY?: number;
    }): boolean => {
      const splitEdgeId = args.splitEdgeId as string;
      const splitEdge = edgesRef.current.find(
        (edge) =>
          edge.id === splitEdgeId &&
          edge.className !== "temp" &&
          !isOptimisticEdgeId(edge.id),
      );
      if (!splitEdge) {
        return false;
      }

      const optimisticSplitEdgeBase = `${OPTIMISTIC_EDGE_PREFIX}${args.clientRequestId}`;
      const optimisticSplitEdgeAId = `${optimisticSplitEdgeBase}_split_a`;
      const optimisticSplitEdgeBId = `${optimisticSplitEdgeBase}_split_b`;

      setEdges((current) => {
        const existingSplitEdge = current.find((edge) => edge.id === splitEdgeId);
        if (!existingSplitEdge) {
          return current;
        }

        const next = current.filter(
          (edge) =>
            edge.id !== splitEdgeId &&
            edge.id !== optimisticSplitEdgeAId &&
            edge.id !== optimisticSplitEdgeBId,
        );

        next.push(
          {
            id: optimisticSplitEdgeAId,
            source: existingSplitEdge.source,
            target: args.middleNodeId as string,
            sourceHandle: args.splitSourceHandle,
            targetHandle: args.newNodeTargetHandle,
          },
          {
            id: optimisticSplitEdgeBId,
            source: args.middleNodeId as string,
            target: existingSplitEdge.target,
            sourceHandle: args.newNodeSourceHandle,
            targetHandle: args.splitTargetHandle,
          },
        );

        return next;
      });

      if (args.positionX !== undefined && args.positionY !== undefined) {
        const x = args.positionX;
        const y = args.positionY;
        const middleNodeId = args.middleNodeId as string;
        setNodes((current) =>
          current.map((node) =>
            node.id === middleNodeId
              ? {
                  ...node,
                  position: { x, y },
                }
              : node,
          ),
        );
      }

      return true;
    },
    [edgesRef, setEdges, setNodes],
  );

  const removeOptimisticCreateLocally = useCallback(
    (args: {
      clientRequestId: string;
      removeNode?: boolean;
      removeEdge?: boolean;
    }): void => {
      const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${args.clientRequestId}`;
      const optimisticEdgeId = `${OPTIMISTIC_EDGE_PREFIX}${args.clientRequestId}`;

      if (args.removeNode) {
        setNodes((current) =>
          current.filter((node) => node.id !== optimisticNodeId),
        );
        setEdges((current) =>
          current.filter(
            (edge) =>
              edge.source !== optimisticNodeId && edge.target !== optimisticNodeId,
          ),
        );
      }

      if (args.removeEdge) {
        const optimisticEdgePrefix = `${optimisticEdgeId}_`;
        setEdges((current) =>
          current.filter(
            (edge) =>
              edge.id !== optimisticEdgeId &&
              !edge.id.startsWith(optimisticEdgePrefix),
          ),
        );
      }

      controller.pendingMoveAfterCreateRef.current.delete(args.clientRequestId);
      controller.pendingResizeAfterCreateRef.current.delete(args.clientRequestId);
      controller.pendingDataAfterCreateRef.current.delete(args.clientRequestId);
      pendingCreatePromiseByClientRequestRef.current.delete(args.clientRequestId);
      controller.pendingEdgeSplitByClientRequestRef.current.delete(
        args.clientRequestId,
      );
      controller.pendingConnectionCreatesRef.current.delete(args.clientRequestId);
      controller.resolvedRealIdByClientRequestRef.current.delete(
        args.clientRequestId,
      );
    },
    [controller, setEdges, setNodes],
  );

  const remapOptimisticNodeLocally = useCallback(
    async (clientRequestId: string, realId: Id<"nodes">): Promise<void> => {
      const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}`;
      const realNodeId = realId as string;

      if (
        controller.pendingDeleteAfterCreateClientRequestIdsRef.current.has(
          clientRequestId,
        )
      ) {
        controller.pendingDeleteAfterCreateClientRequestIdsRef.current.delete(
          clientRequestId,
        );
        removeOptimisticCreateLocally({
          clientRequestId,
          removeNode: true,
          removeEdge: true,
        });
        deletingNodeIds.current.add(realNodeId);
        await enqueueSyncMutation("batchRemoveNodes", {
          nodeIds: [realId],
        });
        return;
      }

      setNodes((current) =>
        current.map((node) => {
          const nextParentId =
            node.parentId === optimisticNodeId ? realNodeId : node.parentId;
          if (node.id !== optimisticNodeId && nextParentId === node.parentId) {
            return node;
          }
          return {
            ...node,
            id: node.id === optimisticNodeId ? realNodeId : node.id,
            parentId: nextParentId,
          };
        }),
      );
      setEdges((current) =>
        current.map((edge) => {
          const nextSource =
            edge.source === optimisticNodeId ? realNodeId : edge.source;
          const nextTarget =
            edge.target === optimisticNodeId ? realNodeId : edge.target;
          if (nextSource === edge.source && nextTarget === edge.target) {
            return edge;
          }
          return {
            ...edge,
            source: nextSource,
            target: nextTarget,
          };
        }),
      );
      setAssetBrowserTargetNodeId((current) =>
        current === optimisticNodeId ? realNodeId : current,
      );

      const pinnedPos =
        controller.pendingLocalPositionUntilConvexMatchesRef.current.get(
          optimisticNodeId,
        );
      if (pinnedPos) {
        controller.pendingLocalPositionUntilConvexMatchesRef.current.delete(
          optimisticNodeId,
        );
        controller.pendingLocalPositionUntilConvexMatchesRef.current.set(
          realNodeId,
          pinnedPos,
        );
      }

      if (
        controller.preferLocalPositionNodeIdsRef.current.has(optimisticNodeId)
      ) {
        controller.preferLocalPositionNodeIdsRef.current.delete(optimisticNodeId);
        controller.preferLocalPositionNodeIdsRef.current.add(realNodeId);
      }

      controller.resolvedRealIdByClientRequestRef.current.set(clientRequestId, realId);
      await remapCanvasSyncNodeId(canvasId as string, optimisticNodeId, realNodeId);
      remapCanvasOpNodeId(canvasId as string, optimisticNodeId, realNodeId);
    },
    [
      canvasId,
      controller,
      deletingNodeIds,
      enqueueSyncMutation,
      removeOptimisticCreateLocally,
      setAssetBrowserTargetNodeId,
      setEdges,
      setNodes,
    ],
  );

  const splitEdgeAtExistingNodeMut = useMutation(
    api.nodes.splitEdgeAtExistingNode,
  ).withOptimisticUpdate((localStore, args) => {
    const edgeList = localStore.getQuery(api.edges.list, {
      canvasId: args.canvasId,
    });
    const nodeList = localStore.getQuery(api.nodes.list, {
      canvasId: args.canvasId,
    });
    if (edgeList === undefined || nodeList === undefined) return;

    const removed = edgeList.find((e: Doc<"edges">) => e._id === args.splitEdgeId);
    if (!removed) return;

    const t1 = `${OPTIMISTIC_EDGE_PREFIX}s1_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` as Id<"edges">;
    const t2 = `${OPTIMISTIC_EDGE_PREFIX}s2_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` as Id<"edges">;
    const now = Date.now();

    const nextEdges = edgeList.filter(
      (e: Doc<"edges">) => e._id !== args.splitEdgeId,
    );
    nextEdges.push(
      {
        _id: t1,
        _creationTime: now,
        canvasId: args.canvasId,
        sourceNodeId: removed.sourceNodeId,
        targetNodeId: args.middleNodeId,
        sourceHandle: args.splitSourceHandle,
        targetHandle: args.newNodeTargetHandle,
      },
      {
        _id: t2,
        _creationTime: now,
        canvasId: args.canvasId,
        sourceNodeId: args.middleNodeId,
        targetNodeId: removed.targetNodeId,
        sourceHandle: args.newNodeSourceHandle,
        targetHandle: args.splitTargetHandle,
      },
    );
    localStore.setQuery(api.edges.list, { canvasId: args.canvasId }, nextEdges);

    if (args.positionX !== undefined && args.positionY !== undefined) {
      const px = args.positionX;
      const py = args.positionY;
      localStore.setQuery(
        api.nodes.list,
        { canvasId: args.canvasId },
        nodeList.map((n: Doc<"nodes">) =>
          n._id === args.middleNodeId
            ? {
                ...n,
                positionX: px,
                positionY: py,
              }
            : n,
        ),
      );
    }
  });

  const runSplitEdgeAtExistingNodeMutation = useCallback<
    RunSplitEdgeAtExistingNodeMutation
  >(
    async (args) => {
      const clientRequestId = args.clientRequestId ?? crypto.randomUUID();
      const payload = { ...args, clientRequestId };
      if (isSyncOnline) {
        await splitEdgeAtExistingNodeMut(payload);
        return;
      }

      const splitApplied = applyEdgeSplitLocally({
        clientRequestId,
        splitEdgeId: payload.splitEdgeId,
        middleNodeId: payload.middleNodeId,
        splitSourceHandle: payload.splitSourceHandle,
        splitTargetHandle: payload.splitTargetHandle,
        newNodeSourceHandle: payload.newNodeSourceHandle,
        newNodeTargetHandle: payload.newNodeTargetHandle,
        positionX: payload.positionX,
        positionY: payload.positionY,
      });
      if (!splitApplied) return;

      await enqueueSyncMutation("splitEdgeAtExistingNode", payload);
    },
    [applyEdgeSplitLocally, enqueueSyncMutation, isSyncOnline, splitEdgeAtExistingNodeMut],
  );

  runSplitEdgeAtExistingNodeMutationRef.current = runSplitEdgeAtExistingNodeMutation;

  const runCreateNodeOnlineOnly = useCallback(
    async (args: Parameters<typeof createNode>[0]) => {
      const clientRequestId = args.clientRequestId ?? crypto.randomUUID();
      const payload = { ...args, clientRequestId };

      if (isSyncOnline) {
        return await trackPendingNodeCreate(clientRequestId, createNode(payload));
      }

      const optimisticNodeId = addOptimisticNodeLocally(payload);
      await enqueueSyncMutation("createNode", payload);
      return optimisticNodeId;
    },
    [addOptimisticNodeLocally, createNode, enqueueSyncMutation, isSyncOnline, trackPendingNodeCreate],
  );

  const runCreateNodeWithEdgeFromSourceOnlineOnly = useCallback(
    async (args: Parameters<typeof createNodeWithEdgeFromSource>[0]) => {
      const clientRequestId = args.clientRequestId ?? crypto.randomUUID();
      const payload = { ...args, clientRequestId };
      const sourceNodeId = payload.sourceNodeId as string;

      controller.pendingConnectionCreatesRef.current.add(clientRequestId);
      if (isSyncOnline && !isOptimisticNodeId(sourceNodeId)) {
        return await trackPendingNodeCreate(
          clientRequestId,
          createNodeWithEdgeFromSource(payload),
        );
      }

      const optimisticNodeId = addOptimisticNodeLocally(payload);
      addOptimisticEdgeLocally({
        clientRequestId,
        sourceNodeId: payload.sourceNodeId,
        targetNodeId: optimisticNodeId,
        sourceHandle: payload.sourceHandle,
        targetHandle: payload.targetHandle,
      });

      if (isSyncOnline) {
        try {
          const realId = await trackPendingNodeCreate(
            clientRequestId,
            createNodeWithEdgeFromSourceRaw({ ...payload }),
          );
          await remapOptimisticNodeLocally(clientRequestId, realId);
          return realId;
        } catch (error) {
          removeOptimisticCreateLocally({
            clientRequestId,
            removeNode: true,
            removeEdge: true,
          });
          throw error;
        }
      }

      await enqueueSyncMutation("createNodeWithEdgeFromSource", payload);
      return optimisticNodeId;
    },
    [
      addOptimisticEdgeLocally,
      addOptimisticNodeLocally,
      controller.pendingConnectionCreatesRef,
      createNodeWithEdgeFromSource,
      createNodeWithEdgeFromSourceRaw,
      enqueueSyncMutation,
      isSyncOnline,
      remapOptimisticNodeLocally,
      removeOptimisticCreateLocally,
      trackPendingNodeCreate,
    ],
  );

  const runCreateNodeWithEdgeToTargetOnlineOnly = useCallback(
    async (args: Parameters<typeof createNodeWithEdgeToTarget>[0]) => {
      const clientRequestId = args.clientRequestId ?? crypto.randomUUID();
      const payload = { ...args, clientRequestId };
      const targetNodeId = payload.targetNodeId as string;

      controller.pendingConnectionCreatesRef.current.add(clientRequestId);
      if (isSyncOnline && !isOptimisticNodeId(targetNodeId)) {
        return await trackPendingNodeCreate(
          clientRequestId,
          createNodeWithEdgeToTarget(payload),
        );
      }

      const optimisticNodeId = addOptimisticNodeLocally(payload);
      addOptimisticEdgeLocally({
        clientRequestId,
        sourceNodeId: optimisticNodeId,
        targetNodeId: payload.targetNodeId,
        sourceHandle: payload.sourceHandle,
        targetHandle: payload.targetHandle,
      });

      if (isSyncOnline) {
        try {
          const realId = await trackPendingNodeCreate(
            clientRequestId,
            createNodeWithEdgeToTargetRaw({ ...payload }),
          );
          await remapOptimisticNodeLocally(clientRequestId, realId);
          return realId;
        } catch (error) {
          removeOptimisticCreateLocally({
            clientRequestId,
            removeNode: true,
            removeEdge: true,
          });
          throw error;
        }
      }

      await enqueueSyncMutation("createNodeWithEdgeToTarget", payload);
      return optimisticNodeId;
    },
    [
      addOptimisticEdgeLocally,
      addOptimisticNodeLocally,
      controller.pendingConnectionCreatesRef,
      createNodeWithEdgeToTarget,
      createNodeWithEdgeToTargetRaw,
      enqueueSyncMutation,
      isSyncOnline,
      remapOptimisticNodeLocally,
      removeOptimisticCreateLocally,
      trackPendingNodeCreate,
    ],
  );

  const runCreateNodeWithEdgeSplitOnlineOnly = useCallback(
    async (args: Parameters<typeof createNodeWithEdgeSplitMut>[0]) => {
      const clientRequestId = args.clientRequestId ?? crypto.randomUUID();
      const payload = { ...args, clientRequestId };

      if (isSyncOnline) {
        return await createNodeWithEdgeSplitMut(payload);
      }

      const optimisticNodeId = addOptimisticNodeLocally(payload);
      const splitApplied = applyEdgeSplitLocally({
        clientRequestId,
        splitEdgeId: payload.splitEdgeId,
        middleNodeId: optimisticNodeId,
        splitSourceHandle: payload.splitSourceHandle,
        splitTargetHandle: payload.splitTargetHandle,
        newNodeSourceHandle: payload.newNodeSourceHandle,
        newNodeTargetHandle: payload.newNodeTargetHandle,
        positionX: payload.positionX,
        positionY: payload.positionY,
      });

      if (splitApplied) {
        await enqueueSyncMutation("createNodeWithEdgeSplit", payload);
      } else {
        await enqueueSyncMutation("createNode", {
          canvasId: payload.canvasId,
          type: payload.type,
          positionX: payload.positionX,
          positionY: payload.positionY,
          width: payload.width,
          height: payload.height,
          data: payload.data,
          parentId: payload.parentId,
          zIndex: payload.zIndex,
          clientRequestId,
        });
      }

      return optimisticNodeId;
    },
    [addOptimisticNodeLocally, applyEdgeSplitLocally, createNodeWithEdgeSplitMut, enqueueSyncMutation, isSyncOnline],
  );

  const runBatchRemoveNodesMutation = useCallback<RunBatchRemoveNodesMutation>(
    async (args) => {
      const ids = args.nodeIds.map((id) => id as string);
      const optimisticNodeIds = ids.filter((id) => isOptimisticNodeId(id));
      const persistedNodeIds = ids.filter((id) => !isOptimisticNodeId(id));

      const createClientRequestIds = optimisticNodeIds
        .map((id) => clientRequestIdFromOptimisticNodeId(id))
        .filter((id): id is string => id !== null);

      if (createClientRequestIds.length > 0) {
        if (isSyncOnline) {
          for (const clientRequestId of createClientRequestIds) {
            controller.pendingDeleteAfterCreateClientRequestIdsRef.current.add(
              clientRequestId,
            );
          }
        }

        const droppedSync = await dropCanvasSyncOpsByClientRequestIds(
          canvasId as string,
          createClientRequestIds,
        );
        const droppedLocal = dropCanvasOpsByClientRequestIds(
          canvasId as string,
          createClientRequestIds,
        );
        for (const clientRequestId of createClientRequestIds) {
          removeOptimisticCreateLocally({
            clientRequestId,
            removeNode: true,
            removeEdge: true,
          });
        }
        resolveCanvasOps(canvasId as string, droppedSync);
        resolveCanvasOps(canvasId as string, droppedLocal);
      }

      if (persistedNodeIds.length === 0) {
        await refreshPendingSyncCount();
        return;
      }

      const droppedSyncByNode = await dropCanvasSyncOpsByNodeIds(
        canvasId as string,
        persistedNodeIds,
      );
      const droppedLocalByNode = dropCanvasOpsByNodeIds(
        canvasId as string,
        persistedNodeIds,
      );
      resolveCanvasOps(canvasId as string, droppedSyncByNode);
      resolveCanvasOps(canvasId as string, droppedLocalByNode);

      await enqueueSyncMutation("batchRemoveNodes", {
        nodeIds: persistedNodeIds as Id<"nodes">[],
      });
    },
    [
      canvasId,
      controller.pendingDeleteAfterCreateClientRequestIdsRef,
      enqueueSyncMutation,
      isSyncOnline,
      refreshPendingSyncCount,
      removeOptimisticCreateLocally,
    ],
  );
  runBatchRemoveNodesMutationRef.current = runBatchRemoveNodesMutation;

  const runCreateEdgeMutation = useCallback(
    async (args: Parameters<typeof createEdge>[0]) => {
      const clientRequestId = args.clientRequestId ?? crypto.randomUUID();
      const payload = { ...args, clientRequestId };

      if (isSyncOnline) {
        await createEdge(payload);
        return;
      }

      addOptimisticEdgeLocally({
        clientRequestId,
        sourceNodeId: payload.sourceNodeId,
        targetNodeId: payload.targetNodeId,
        sourceHandle: payload.sourceHandle,
        targetHandle: payload.targetHandle,
      });
      await enqueueSyncMutation("createEdge", payload);
    },
    [addOptimisticEdgeLocally, createEdge, enqueueSyncMutation, isSyncOnline],
  );

  const runRemoveEdgeMutation = useCallback(
    async (args: { edgeId: Id<"edges"> }) => {
      const edgeId = args.edgeId as string;
      setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      if (isOptimisticEdgeId(edgeId)) {
        const clientRequestId = clientRequestIdFromOptimisticEdgeId(edgeId);
        if (clientRequestId) {
          const droppedSync = await dropCanvasSyncOpsByClientRequestIds(
            canvasId as string,
            [clientRequestId],
          );
          const droppedLocal = dropCanvasOpsByClientRequestIds(canvasId as string, [
            clientRequestId,
          ]);
          resolveCanvasOps(canvasId as string, droppedSync);
          resolveCanvasOps(canvasId as string, droppedLocal);
        }
        await refreshPendingSyncCount();
        return;
      }

      const droppedSync = await dropCanvasSyncOpsByEdgeIds(canvasId as string, [
        edgeId,
      ]);
      const droppedLocal = dropCanvasOpsByEdgeIds(canvasId as string, [edgeId]);
      resolveCanvasOps(canvasId as string, droppedSync);
      resolveCanvasOps(canvasId as string, droppedLocal);

      await enqueueSyncMutation("removeEdge", {
        edgeId: edgeId as Id<"edges">,
      });
    },
    [canvasId, enqueueSyncMutation, refreshPendingSyncCount, setEdges],
  );

  const flushCanvasSyncQueue = useCallback(async () => {
    if (!isSyncOnline) return;
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setIsSyncing(true);

    try {
      const now = Date.now();
      const expiredIds = await dropExpiredCanvasSyncOps(canvasId as string, now);
      if (expiredIds.length > 0) {
        resolveCanvasOps(canvasId as string, expiredIds);
        toast.info(
          "Lokale Änderungen verworfen",
          `${expiredIds.length} ältere Offline-Änderungen (älter als 24h) wurden entfernt.`,
        );
      }

      let permanentFailures = 0;
      let processedInThisPass = 0;

      while (processedInThisPass < 500) {
        const nowLoop = Date.now();
        const queue = await listCanvasSyncOps(canvasId as string);
        const op = queue.find(
          (entry) => entry.expiresAt > nowLoop && entry.nextRetryAt <= nowLoop,
        );
        if (!op) break;
        processedInThisPass += 1;

        try {
          if (op.type === "createNode") {
            const realId = await createNodeRaw(
              op.payload as Parameters<typeof createNodeRaw>[0],
            );
            await remapOptimisticNodeLocally(op.payload.clientRequestId, realId);
            await controller.syncPendingMoveForClientRequest(
              op.payload.clientRequestId,
              realId,
            );
            setEdgeSyncNonce((value) => value + 1);
          } else if (op.type === "createNodeWithEdgeFromSource") {
            const realId = await createNodeWithEdgeFromSourceRaw(
              op.payload as Parameters<typeof createNodeWithEdgeFromSourceRaw>[0],
            );
            await remapOptimisticNodeLocally(op.payload.clientRequestId, realId);
            await controller.syncPendingMoveForClientRequest(
              op.payload.clientRequestId,
              realId,
            );
            setEdgeSyncNonce((value) => value + 1);
          } else if (op.type === "createNodeWithEdgeToTarget") {
            const realId = await createNodeWithEdgeToTargetRaw(
              op.payload as Parameters<typeof createNodeWithEdgeToTargetRaw>[0],
            );
            await remapOptimisticNodeLocally(op.payload.clientRequestId, realId);
            await controller.syncPendingMoveForClientRequest(
              op.payload.clientRequestId,
              realId,
            );
            setEdgeSyncNonce((value) => value + 1);
          } else if (op.type === "createNodeWithEdgeSplit") {
            const realId = await createNodeWithEdgeSplitRaw(
              op.payload as Parameters<typeof createNodeWithEdgeSplitRaw>[0],
            );
            await remapOptimisticNodeLocally(op.payload.clientRequestId, realId);
            await controller.syncPendingMoveForClientRequest(
              op.payload.clientRequestId,
              realId,
            );
            setEdgeSyncNonce((value) => value + 1);
          } else if (op.type === "createEdge") {
            await createEdgeRaw(op.payload);
          } else if (op.type === "removeEdge") {
            await removeEdgeRaw(op.payload);
          } else if (op.type === "batchRemoveNodes") {
            await batchRemoveNodesRaw(op.payload);
          } else if (op.type === "splitEdgeAtExistingNode") {
            await splitEdgeAtExistingNodeRaw(op.payload);
            setEdgeSyncNonce((value) => value + 1);
          } else if (op.type === "moveNode") {
            await moveNode(op.payload);
          } else if (op.type === "resizeNode") {
            if (process.env.NODE_ENV !== "production") {
              console.info("[Canvas sync debug] resizeNode enqueue->flush", {
                opId: op.id,
                attemptCount: op.attemptCount,
                ...summarizeResizePayload(op.payload),
              });
            }
            await resizeNode(op.payload);
          } else if (op.type === "updateData") {
            if (process.env.NODE_ENV !== "production") {
              console.info("[Canvas sync debug] updateData enqueue->flush", {
                opId: op.id,
                attemptCount: op.attemptCount,
                ...summarizeUpdateDataPayload(op.payload),
              });
            }
            await updateNodeData(op.payload);
          }

          await ackCanvasSyncOp(op.id);
          resolveCanvasOp(canvasId as string, op.id);
        } catch (error: unknown) {
          const transient = !isSyncOnline || isLikelyTransientSyncError(error);
          if (transient) {
            const backoffMs = Math.min(
              30_000,
              1000 * 2 ** Math.min(op.attemptCount, 5),
            );
            await markCanvasSyncOpFailed(op.id, {
              nextRetryAt: Date.now() + backoffMs,
              lastError: getErrorMessage(error),
            });
            break;
          }

          permanentFailures += 1;
          if (op.type === "createNode") {
            removeOptimisticCreateLocally({
              clientRequestId: op.payload.clientRequestId,
              removeNode: true,
            });
          } else if (
            op.type === "createNodeWithEdgeFromSource" ||
            op.type === "createNodeWithEdgeToTarget"
          ) {
            removeOptimisticCreateLocally({
              clientRequestId: op.payload.clientRequestId,
              removeNode: true,
              removeEdge: true,
            });
          } else if (op.type === "createNodeWithEdgeSplit") {
            removeOptimisticCreateLocally({
              clientRequestId: op.payload.clientRequestId,
              removeNode: true,
              removeEdge: true,
            });
            setEdgeSyncNonce((value) => value + 1);
          } else if (op.type === "createEdge") {
            removeOptimisticCreateLocally({
              clientRequestId: op.payload.clientRequestId,
              removeEdge: true,
            });
          } else if (op.type === "splitEdgeAtExistingNode") {
            removeOptimisticCreateLocally({
              clientRequestId: op.payload.clientRequestId,
              removeEdge: true,
            });
            setEdgeSyncNonce((value) => value + 1);
          } else if (op.type === "batchRemoveNodes") {
            for (const nodeId of op.payload.nodeIds) {
              deletingNodeIds.current.delete(nodeId as string);
            }
          }
          await ackCanvasSyncOp(op.id);
          resolveCanvasOp(canvasId as string, op.id);
        }
      }

      if (permanentFailures > 0) {
        toast.warning(
          "Einige Änderungen konnten nicht synchronisiert werden",
          `${permanentFailures} lokale Änderungen wurden übersprungen.`,
        );
      }
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
      await refreshPendingSyncCount();
    }
  }, [
    batchRemoveNodesRaw,
    canvasId,
    controller,
    createEdgeRaw,
    createNodeRaw,
    createNodeWithEdgeFromSourceRaw,
    createNodeWithEdgeSplitRaw,
    createNodeWithEdgeToTargetRaw,
    deletingNodeIds,
    isSyncOnline,
    moveNode,
    refreshPendingSyncCount,
    remapOptimisticNodeLocally,
    removeEdgeRaw,
    removeOptimisticCreateLocally,
    resizeNode,
    setEdgeSyncNonce,
    splitEdgeAtExistingNodeRaw,
    updateNodeData,
  ]);
  flushCanvasSyncQueueRef.current = flushCanvasSyncQueue;

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    void refreshPendingSyncCount();
  }, [refreshPendingSyncCount]);

  useEffect(() => {
    if (!isSyncOnline) return;
    void flushCanvasSyncQueue();
  }, [flushCanvasSyncQueue, isSyncOnline]);

  useEffect(() => {
    if (!isSyncOnline || pendingSyncCount <= 0) return;
    const interval = window.setInterval(() => {
      void flushCanvasSyncQueue();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [flushCanvasSyncQueue, isSyncOnline, pendingSyncCount]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (!isSyncOnline) return;
      void flushCanvasSyncQueue();
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [flushCanvasSyncQueue, isSyncOnline]);

  const notifyOfflineUnsupported = useCallback((label: string) => {
    const now = Date.now();
    if (now - lastOfflineUnsupportedToastAtRef.current < 1500) return;
    lastOfflineUnsupportedToastAtRef.current = now;
    toast.warning(
      "Offline aktuell nicht unterstützt",
      `${label} ist aktuell nur online verfügbar.`,
    );
  }, []);

  return {
    status: {
      pendingSyncCount,
      isSyncing,
      isBrowserOnline,
      isSyncOnline,
    },
    refs: {
      pendingMoveAfterCreateRef: controller.pendingMoveAfterCreateRef,
      pendingResizeAfterCreateRef: controller.pendingResizeAfterCreateRef,
      pendingDataAfterCreateRef: controller.pendingDataAfterCreateRef,
      resolvedRealIdByClientRequestRef:
        controller.resolvedRealIdByClientRequestRef,
      pendingEdgeSplitByClientRequestRef:
        controller.pendingEdgeSplitByClientRequestRef,
      pendingDeleteAfterCreateClientRequestIdsRef:
        controller.pendingDeleteAfterCreateClientRequestIdsRef,
      pendingConnectionCreatesRef: controller.pendingConnectionCreatesRef,
      pendingLocalPositionUntilConvexMatchesRef:
        controller.pendingLocalPositionUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef: controller.preferLocalPositionNodeIdsRef,
      pendingCreatePromiseByClientRequestRef,
    },
    actions: {
      createNode: runCreateNodeOnlineOnly,
      createNodeWithEdgeFromSource: runCreateNodeWithEdgeFromSourceOnlineOnly,
      createNodeWithEdgeToTarget: runCreateNodeWithEdgeToTargetOnlineOnly,
      createNodeWithEdgeSplit: runCreateNodeWithEdgeSplitOnlineOnly,
      moveNode: runMoveNodeMutation,
      batchMoveNodes: runBatchMoveNodesMutation,
      resizeNode: controller.queueNodeResize,
      updateNodeData: controller.queueNodeDataUpdate,
      batchRemoveNodes: runBatchRemoveNodesMutation,
      createEdge: runCreateEdgeMutation,
      removeEdge: runRemoveEdgeMutation,
      splitEdgeAtExistingNode: runSplitEdgeAtExistingNodeMutation,
      syncPendingMoveForClientRequest: controller.syncPendingMoveForClientRequest,
      notifyOfflineUnsupported,
      flushCanvasSyncQueue,
      refreshPendingSyncCount,
      remapOptimisticNodeLocally,
    },
  };
}
