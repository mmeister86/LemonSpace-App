/**
 * Onboarding note:
 * Processes the persisted Canvas operation queue. Retry, optimistic-ID remapping, and ACK behavior keep offline-tolerant edits consistent.
 */

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
} from "./canvas-helpers";
import {
  getCanvasGraphEdgesFromQuery,
  getCanvasGraphNodesFromQuery,
  setCanvasGraphEdgesInQuery,
  setCanvasGraphNodesInQuery,
} from "./canvas-graph-query-cache";
import {
  createCanvasSyncPendingController,
  type QueueSyncMutation,
  type RunBatchRemoveNodesMutation,
  type RunMoveNodeMutation,
  type RunSetNodeParentMutation,
  type RunSplitEdgeAtExistingNodeMutation,
} from "./canvas-sync-pending-controller";
import {
  createOptimisticEdgeId,
  createOptimisticNodeId,
  optimisticEdgeIdForClientRequest,
  optimisticNodeIdForClientRequest,
  remapOptimisticEdgeId,
  remapOptimisticEdgeNodeReferences,
  remapOptimisticNodeReferences,
} from "./canvas-sync-optimistic-updates";
import {
  dispatchCanvasSyncQueueOp,
  getCanvasSyncErrorMessage,
  shouldRetryCanvasSyncError,
} from "./canvas-sync-queue-flusher";
import {
  ensureCanvasSyncClientRequestId,
  shouldRunCreateWithPersistedEndpoint,
} from "./canvas-sync-node-create-actions";

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

export const createCanvasSyncEngineController = createCanvasSyncPendingController;

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
  const setNodeParent = useMutation(api.nodes.setParent);
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
  const runSetNodeParentMutationRef = useRef<RunSetNodeParentMutation>(
    async () => undefined,
  );
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
      const current = getCanvasGraphNodesFromQuery(localStore, {
        canvasId: args.canvasId,
      });
      if (current === undefined) return;

      const tempId = createOptimisticNodeId(args.clientRequestId) as Id<"nodes">;

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

      setCanvasGraphNodesInQuery(localStore, {
        canvasId: args.canvasId,
        nodes: [...current, synthetic],
      });
    },
  );

  const createNodeWithEdgeFromSource = useMutation(
    api.nodes.createWithEdgeFromSource,
  ).withOptimisticUpdate((localStore, args) => {
    const nodeList = getCanvasGraphNodesFromQuery(localStore, {
      canvasId: args.canvasId,
    });
    const edgeList = getCanvasGraphEdgesFromQuery(localStore, {
      canvasId: args.canvasId,
    });
    if (nodeList === undefined || edgeList === undefined) return;

      const tempNodeId = createOptimisticNodeId(args.clientRequestId) as Id<"nodes">;

      const tempEdgeId = createOptimisticEdgeId(args.clientRequestId) as Id<"edges">;

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

    setCanvasGraphNodesInQuery(localStore, {
      canvasId: args.canvasId,
      nodes: [...nodeList, syntheticNode],
    });
    setCanvasGraphEdgesInQuery(localStore, {
      canvasId: args.canvasId,
      edges: [...edgeList, syntheticEdge],
    });
  });

  const createNodeWithEdgeToTarget = useMutation(
    api.nodes.createWithEdgeToTarget,
  ).withOptimisticUpdate((localStore, args) => {
    const nodeList = getCanvasGraphNodesFromQuery(localStore, {
      canvasId: args.canvasId,
    });
    const edgeList = getCanvasGraphEdgesFromQuery(localStore, {
      canvasId: args.canvasId,
    });
    if (nodeList === undefined || edgeList === undefined) return;

      const tempNodeId = createOptimisticNodeId(args.clientRequestId) as Id<"nodes">;

      const tempEdgeId = createOptimisticEdgeId(args.clientRequestId) as Id<"edges">;

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

    setCanvasGraphNodesInQuery(localStore, {
      canvasId: args.canvasId,
      nodes: [...nodeList, syntheticNode],
    });
    setCanvasGraphEdgesInQuery(localStore, {
      canvasId: args.canvasId,
      edges: [...edgeList, syntheticEdge],
    });
  });

  const createNodeWithEdgeSplitMut = useMutation(api.nodes.createWithEdgeSplit);

  const createEdge = useMutation(api.edges.create).withOptimisticUpdate(
    (localStore, args) => {
      const edgeList = getCanvasGraphEdgesFromQuery(localStore, {
        canvasId: args.canvasId,
      });
      const nodeList = getCanvasGraphNodesFromQuery(localStore, {
        canvasId: args.canvasId,
      });
      if (edgeList === undefined || nodeList === undefined) return;

      const sourceNode = nodeList.find((node) => node._id === args.sourceNodeId);
      const targetNode = nodeList.find((node) => node._id === args.targetNodeId);
      if (!sourceNode || !targetNode) return;

      const tempId = createOptimisticEdgeId(args.clientRequestId) as Id<"edges">;
      const synthetic: Doc<"edges"> = {
        _id: tempId,
        _creationTime: Date.now(),
        canvasId: args.canvasId,
        sourceNodeId: sourceNode._id,
        targetNodeId: targetNode._id,
        sourceHandle: args.sourceHandle,
        targetHandle: args.targetHandle,
      };
      setCanvasGraphEdgesInQuery(localStore, {
        canvasId: args.canvasId,
        edges: [...edgeList, synthetic],
      });
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

  const runSetNodeParentMutation = useCallback<RunSetNodeParentMutation>(
    async (args) => {
      await controller.queueNodeParentUpdate(args);
    },
    [controller],
  );
  runSetNodeParentMutationRef.current = runSetNodeParentMutation;

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
      const optimisticNodeId = optimisticNodeIdForClientRequest(args.clientRequestId);
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
      const optimisticEdgeId = optimisticEdgeIdForClientRequest(args.clientRequestId);
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

      const optimisticSplitEdgeBase = optimisticEdgeIdForClientRequest(args.clientRequestId);
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
      const optimisticNodeId = optimisticNodeIdForClientRequest(args.clientRequestId);
      const optimisticEdgeId = optimisticEdgeIdForClientRequest(args.clientRequestId);

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
      controller.pendingLocalNodeDataUntilConvexMatchesRef.current.delete(
        optimisticNodeId,
      );
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
      const optimisticNodeId = optimisticNodeIdForClientRequest(clientRequestId);
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
        remapOptimisticNodeReferences(current, optimisticNodeId, realNodeId),
      );
      setEdges((current) =>
        remapOptimisticEdgeNodeReferences(current, optimisticNodeId, realNodeId),
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

      const pinnedData =
        controller.pendingLocalNodeDataUntilConvexMatchesRef.current.get(
          optimisticNodeId,
        );
      if (pinnedData !== undefined) {
        controller.pendingLocalNodeDataUntilConvexMatchesRef.current.delete(
          optimisticNodeId,
        );
        controller.pendingLocalNodeDataUntilConvexMatchesRef.current.set(
          realNodeId,
          pinnedData,
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

  const remapOptimisticEdgeLocally = useCallback(
    (clientRequestId: string, realId: Id<"edges">): void => {
      const optimisticEdgeId = optimisticEdgeIdForClientRequest(clientRequestId);
      const realEdgeId = realId as string;

      setEdges((current) =>
        remapOptimisticEdgeId(current, optimisticEdgeId, realEdgeId),
      );
    },
    [setEdges],
  );

  const splitEdgeAtExistingNodeMut = useMutation(
    api.nodes.splitEdgeAtExistingNode,
  ).withOptimisticUpdate((localStore, args) => {
    const edgeList = getCanvasGraphEdgesFromQuery(localStore, {
      canvasId: args.canvasId,
    });
    const nodeList = getCanvasGraphNodesFromQuery(localStore, {
      canvasId: args.canvasId,
    });
    if (edgeList === undefined || nodeList === undefined) return;

    const removed = edgeList.find((e: Doc<"edges">) => e._id === args.splitEdgeId);
    if (!removed) return;

    const t1 = createOptimisticEdgeId(`s1_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`) as Id<"edges">;
    const t2 = createOptimisticEdgeId(`s2_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`) as Id<"edges">;
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
    setCanvasGraphEdgesInQuery(localStore, {
      canvasId: args.canvasId,
      edges: nextEdges,
    });

    if (args.positionX !== undefined && args.positionY !== undefined) {
      const px = args.positionX;
      const py = args.positionY;
      setCanvasGraphNodesInQuery(localStore, {
        canvasId: args.canvasId,
        nodes: nodeList.map((n: Doc<"nodes">) =>
          n._id === args.middleNodeId
            ? {
                ...n,
                positionX: px,
                positionY: py,
              }
            : n,
        ),
      });
    }
  });

  const runSplitEdgeAtExistingNodeMutation = useCallback<
    RunSplitEdgeAtExistingNodeMutation
  >(
    async (args) => {
      const payload = ensureCanvasSyncClientRequestId(args);
      const clientRequestId = payload.clientRequestId;
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
      const payload = ensureCanvasSyncClientRequestId(args);
      const clientRequestId = payload.clientRequestId;

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
      const payload = ensureCanvasSyncClientRequestId(args);
      const clientRequestId = payload.clientRequestId;
      const sourceNodeId = payload.sourceNodeId as string;

      controller.pendingConnectionCreatesRef.current.add(clientRequestId);
      if (
        shouldRunCreateWithPersistedEndpoint(
          isSyncOnline,
          sourceNodeId,
          isOptimisticNodeId,
        )
      ) {
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
      const payload = ensureCanvasSyncClientRequestId(args);
      const clientRequestId = payload.clientRequestId;
      const targetNodeId = payload.targetNodeId as string;

      controller.pendingConnectionCreatesRef.current.add(clientRequestId);
      if (
        shouldRunCreateWithPersistedEndpoint(
          isSyncOnline,
          targetNodeId,
          isOptimisticNodeId,
        )
      ) {
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
      const payload = ensureCanvasSyncClientRequestId(args);
      const clientRequestId = payload.clientRequestId;

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
      const payload = ensureCanvasSyncClientRequestId(args);
      const clientRequestId = payload.clientRequestId;

      addOptimisticEdgeLocally({
        clientRequestId,
        sourceNodeId: payload.sourceNodeId,
        targetNodeId: payload.targetNodeId,
        sourceHandle: payload.sourceHandle,
        targetHandle: payload.targetHandle,
      });

      if (isSyncOnline) {
        try {
          const realId = await createEdge(payload);
          remapOptimisticEdgeLocally(clientRequestId, realId);
        } catch (error) {
          removeOptimisticCreateLocally({
            clientRequestId,
            removeEdge: true,
          });
          throw error;
        }
        return;
      }

      await enqueueSyncMutation("createEdge", payload);
    },
    [
      addOptimisticEdgeLocally,
      createEdge,
      enqueueSyncMutation,
      isSyncOnline,
      remapOptimisticEdgeLocally,
      removeOptimisticCreateLocally,
    ],
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
          await dispatchCanvasSyncQueueOp(op, {
            createNode: (payload) =>
              createNodeRaw(payload as Parameters<typeof createNodeRaw>[0]),
            createNodeWithEdgeFromSource: (payload) =>
              createNodeWithEdgeFromSourceRaw(
                payload as Parameters<typeof createNodeWithEdgeFromSourceRaw>[0],
              ),
            createNodeWithEdgeToTarget: (payload) =>
              createNodeWithEdgeToTargetRaw(
                payload as Parameters<typeof createNodeWithEdgeToTargetRaw>[0],
              ),
            createNodeWithEdgeSplit: (payload) =>
              createNodeWithEdgeSplitRaw(
                payload as Parameters<typeof createNodeWithEdgeSplitRaw>[0],
              ),
            createEdge: (payload) => createEdgeRaw(payload),
            removeEdge: (payload) => removeEdgeRaw(payload),
            batchRemoveNodes: (payload) => batchRemoveNodesRaw(payload),
            splitEdgeAtExistingNode: (payload) => splitEdgeAtExistingNodeRaw(payload),
            moveNode: (payload) => moveNode(payload),
            setNodeParent: (payload) => setNodeParent(payload),
            resizeNode: (payload) => resizeNode(payload),
            updateData: (payload) => updateNodeData(payload),
            onCreatedNode: async (clientRequestId, realId) => {
              const typedRealId = realId as Id<"nodes">;
              await remapOptimisticNodeLocally(clientRequestId, typedRealId);
              await controller.syncPendingMoveForClientRequest(
                clientRequestId,
                typedRealId,
              );
            },
            onCreatedEdge: (clientRequestId, realId) => {
              remapOptimisticEdgeLocally(clientRequestId, realId as Id<"edges">);
            },
            onEdgeTopologyChanged: () => setEdgeSyncNonce((value) => value + 1),
          });

          await ackCanvasSyncOp(op.id);
          resolveCanvasOp(canvasId as string, op.id);
        } catch (error: unknown) {
          const transient = shouldRetryCanvasSyncError(error, isSyncOnline);
          if (transient) {
            const backoffMs = Math.min(
              30_000,
              1000 * 2 ** Math.min(op.attemptCount, 5),
            );
            await markCanvasSyncOpFailed(op.id, {
              nextRetryAt: Date.now() + backoffMs,
              lastError: getCanvasSyncErrorMessage(error),
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
          } else if (op.type === "updateData") {
            controller.pendingLocalNodeDataUntilConvexMatchesRef.current.delete(
              op.payload.nodeId as string,
            );
          } else if (op.type === "setNodeParent") {
            controller.pendingLocalNodeParentUntilConvexMatchesRef.current.delete(
              op.payload.nodeId as string,
            );
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
    remapOptimisticEdgeLocally,
    removeEdgeRaw,
    removeOptimisticCreateLocally,
    resizeNode,
    setNodeParent,
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
      pendingLocalNodeDataUntilConvexMatchesRef:
        controller.pendingLocalNodeDataUntilConvexMatchesRef,
      pendingLocalNodeSizeUntilConvexMatchesRef:
        controller.pendingLocalNodeSizeUntilConvexMatchesRef,
      pendingLocalNodeParentUntilConvexMatchesRef:
        controller.pendingLocalNodeParentUntilConvexMatchesRef,
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
      setNodeParent: runSetNodeParentMutation,
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
