"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useTheme } from "next-themes";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnConnectEnd,
  BackgroundVariant,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import "@xyflow/react/dist/style.css";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";
import {
  enqueueCanvasOp,
  readCanvasSnapshot,
  resolveCanvasOp,
  resolveCanvasOps,
  writeCanvasSnapshot,
} from "@/lib/canvas-local-persistence";
import {
  ackCanvasSyncOp,
  type CanvasSyncOpPayloadByType,
  countCanvasSyncOps,
  dropExpiredCanvasSyncOps,
  enqueueCanvasSyncOp,
  listCanvasSyncOps,
  markCanvasSyncOpFailed,
} from "@/lib/canvas-op-queue";

import {
  useConvexAuth,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";

import { nodeTypes } from "./node-types";
import {
  convexNodeDocWithMergedStorageUrl,
  convexNodeToRF,
  convexEdgeToRF,
  convexEdgeToRFWithSourceGlow,
  NODE_DEFAULTS,
  NODE_HANDLE_MAP,
} from "@/lib/canvas-utils";
import CanvasToolbar, {
  type CanvasNavTool,
} from "@/components/canvas/canvas-toolbar";
import { CanvasAppMenu } from "@/components/canvas/canvas-app-menu";
import { CanvasCommandPalette } from "@/components/canvas/canvas-command-palette";
import {
  CanvasConnectionDropMenu,
  type ConnectionDropMenuState,
} from "@/components/canvas/canvas-connection-drop-menu";
import { CanvasPlacementProvider } from "@/components/canvas/canvas-placement-context";
import {
  AssetBrowserTargetContext,
  type AssetBrowserTargetApi,
} from "@/components/canvas/asset-browser-panel";
import CustomConnectionLine from "@/components/canvas/custom-connection-line";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import {
  applyPinnedNodePositions,
  applyPinnedNodePositionsReadOnly,
  CANVAS_MIN_ZOOM,
  clientRequestIdFromOptimisticEdgeId,
  clientRequestIdFromOptimisticNodeId,
  createCanvasOpId,
  DEFAULT_EDGE_OPTIONS,
  EDGE_INTERSECTION_HIGHLIGHT_STYLE,
  getConnectEndClientPoint,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getNodeCenterClientPosition,
  getIntersectedEdgeId,
  getPendingMovePinsFromLocalOps,
  hasHandleKey,
  inferPendingConnectionNodeHandoff,
  isEditableKeyboardTarget,
  isOptimisticEdgeId,
  isOptimisticNodeId,
  mergeNodesPreservingLocalState,
  normalizeHandle,
  OPTIMISTIC_EDGE_PREFIX,
  OPTIMISTIC_NODE_PREFIX,
  positionsMatchPin,
  type PendingEdgeSplit,
  rfEdgeConnectionSignature,
  withResolvedCompareData,
} from "./canvas-helpers";
import { adjustNodeDimensionChanges } from "./canvas-node-change-helpers";
import { useGenerationFailureWarnings } from "./canvas-generation-failures";
import { useCanvasDeleteHandlers } from "./canvas-delete-handlers";
import { getImageDimensions } from "./canvas-media-utils";
import { useCanvasReconnectHandlers } from "./canvas-reconnect";
import { useCanvasScissors } from "./canvas-scissors";
import { CanvasSyncProvider } from "./canvas-sync-context";

interface CanvasInnerProps {
  canvasId: Id<"canvases">;
}

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

function CanvasInner({ canvasId }: CanvasInnerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const shouldSkipCanvasQueries =
    isSessionPending || isAuthLoading || !isAuthenticated;
  const convexAuthUserProbe = useQuery(
    api.auth.safeGetAuthUser,
    shouldSkipCanvasQueries ? "skip" : {},
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!isAuthLoading && !isAuthenticated) {
      console.warn("[Canvas debug] mounted without Convex auth", { canvasId });
    }
  }, [canvasId, isAuthLoading, isAuthenticated]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (isAuthLoading || isSessionPending) return;

    console.info("[Canvas auth state]", {
      canvasId,
      convex: {
        isAuthenticated,
        shouldSkipCanvasQueries,
        probeUserId: convexAuthUserProbe?.userId ?? null,
        probeRecordId: convexAuthUserProbe?._id ?? null,
      },
      session: {
        hasUser: Boolean(session?.user),
        email: session?.user?.email ?? null,
      },
    });
  }, [
    canvasId,
    convexAuthUserProbe?._id,
    convexAuthUserProbe?.userId,
    isAuthLoading,
    isAuthenticated,
    isSessionPending,
    session?.user,
    shouldSkipCanvasQueries,
  ]);

  // ─── Convex Realtime Queries ───────────────────────────────────
  const convexNodes = useQuery(
    api.nodes.list,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );
  const convexEdges = useQuery(
    api.edges.list,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );
  const storageUrlsById = useQuery(
    api.storage.batchGetUrlsForCanvas,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );
  const canvas = useQuery(
    api.canvases.get,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );

  // ─── Convex Mutations (exakte Signaturen aus nodes.ts / edges.ts) ──
  const moveNode = useMutation(api.nodes.move);
  const resizeNode = useMutation(api.nodes.resize);
  const updateNodeData = useMutation(api.nodes.updateData);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const connectionState = useConvexConnectionState();
  const pendingMoveAfterCreateRef = useRef(
    new Map<string, { positionX: number; positionY: number }>(),
  );
  const resolvedRealIdByClientRequestRef = useRef(new Map<string, Id<"nodes">>());
  const pendingEdgeSplitByClientRequestRef = useRef(
    new Map<string, PendingEdgeSplit>(),
  );
  /** Connection-Drop → neue Node: erlaubt Carry-over der Kante in der Rollback-Lücke (ohne Phantom nach Fehler). */
  const pendingConnectionCreatesRef = useRef(new Set<string>());
  /** Nach create+drag: Convex liefert oft noch Erstellkoordinaten, bis `moveNode` committed — bis dahin Position pinnen. */
  const pendingLocalPositionUntilConvexMatchesRef = useRef(
    new Map<string, { x: number; y: number }>(),
  );
  /** Vorheriger Stand von api.nodes.list-IDs — um genau die neu eingetretene Node-ID vor Mutation-.then zu erkennen. */
  const convexNodeIdsSnapshotForEdgeCarryRef = useRef(new Set<string>());

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

      localStore.setQuery(
        api.nodes.list,
        { canvasId: args.canvasId },
        [...current, synthetic],
      );
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

    const syntheticEdge: Doc<"edges"> = {
      _id: tempEdgeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      sourceNodeId: args.sourceNodeId,
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

    const syntheticEdge: Doc<"edges"> = {
      _id: tempEdgeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      sourceNodeId: tempNodeId,
      targetNodeId: args.targetNodeId,
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

  const createNodeWithEdgeSplit = useMutation(api.nodes.createWithEdgeSplit);

  const batchRemoveNodes = useMutation(api.nodes.batchRemove).withOptimisticUpdate(
    (localStore, args) => {
      const nodeList = localStore.getQuery(api.nodes.list, { canvasId });
      const edgeList = localStore.getQuery(api.edges.list, { canvasId });
      if (nodeList === undefined || edgeList === undefined) return;

      const removeSet = new Set<string>(
        args.nodeIds.map((id: Id<"nodes">) => id as string),
      );
      localStore.setQuery(
        api.nodes.list,
        { canvasId },
        nodeList.filter((n: Doc<"nodes">) => !removeSet.has(n._id)),
      );
      localStore.setQuery(
        api.edges.list,
        { canvasId },
        edgeList.filter(
          (e: Doc<"edges">) =>
            !removeSet.has(e.sourceNodeId) && !removeSet.has(e.targetNodeId),
        ),
      );
    },
  );

  const createEdge = useMutation(api.edges.create).withOptimisticUpdate(
    (localStore, args) => {
      const edgeList = localStore.getQuery(api.edges.list, {
        canvasId: args.canvasId,
      });
      if (edgeList === undefined) return;

      const tempId = `${OPTIMISTIC_EDGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}` as Id<"edges">;
      const synthetic: Doc<"edges"> = {
        _id: tempId,
        _creationTime: Date.now(),
        canvasId: args.canvasId,
        sourceNodeId: args.sourceNodeId,
        targetNodeId: args.targetNodeId,
        sourceHandle: args.sourceHandle,
        targetHandle: args.targetHandle,
      };
      localStore.setQuery(
        api.edges.list,
        { canvasId: args.canvasId },
        [...edgeList, synthetic],
      );
    },
  );

  const removeEdge = useMutation(api.edges.remove).withOptimisticUpdate(
    (localStore, args) => {
      const edgeList = localStore.getQuery(api.edges.list, { canvasId });
      if (edgeList === undefined) return;
      localStore.setQuery(
        api.edges.list,
        { canvasId },
        edgeList.filter((e: Doc<"edges">) => e._id !== args.edgeId),
      );
    },
  );

  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const syncInFlightRef = useRef(false);
  const lastOfflineUnsupportedToastAtRef = useRef(0);

  const isSyncOnline =
    isBrowserOnline === true && connectionState.isWebSocketConnected === true;

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

  const notifyOfflineUnsupported = useCallback((label: string) => {
    const now = Date.now();
    if (now - lastOfflineUnsupportedToastAtRef.current < 1500) return;
    lastOfflineUnsupportedToastAtRef.current = now;
    toast.warning(
      "Offline aktuell nicht unterstützt",
      `${label} ist in Stufe 1 nur online verfügbar.`,
    );
  }, []);

  const runCreateNodeOnlineOnly = useCallback(
    async (args: Parameters<typeof createNode>[0]) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Node erstellen");
        throw new Error("offline-unsupported");
      }
      return await createNode(args);
    },
    [createNode, isSyncOnline, notifyOfflineUnsupported],
  );

  const runCreateNodeWithEdgeFromSourceOnlineOnly = useCallback(
    async (args: Parameters<typeof createNodeWithEdgeFromSource>[0]) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Node mit Verbindung erstellen");
        throw new Error("offline-unsupported");
      }
      return await createNodeWithEdgeFromSource(args);
    },
    [createNodeWithEdgeFromSource, isSyncOnline, notifyOfflineUnsupported],
  );

  const runCreateNodeWithEdgeToTargetOnlineOnly = useCallback(
    async (args: Parameters<typeof createNodeWithEdgeToTarget>[0]) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Node mit Verbindung erstellen");
        throw new Error("offline-unsupported");
      }
      return await createNodeWithEdgeToTarget(args);
    },
    [createNodeWithEdgeToTarget, isSyncOnline, notifyOfflineUnsupported],
  );

  const runCreateNodeWithEdgeSplitOnlineOnly = useCallback(
    async (args: Parameters<typeof createNodeWithEdgeSplit>[0]) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Kanten-Split");
        throw new Error("offline-unsupported");
      }
      return await createNodeWithEdgeSplit(args);
    },
    [createNodeWithEdgeSplit, isSyncOnline, notifyOfflineUnsupported],
  );

  const refreshPendingSyncCount = useCallback(async () => {
    const count = await countCanvasSyncOps(canvasId as string);
    setPendingSyncCount(count);
  }, [canvasId]);

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

      const queue = await listCanvasSyncOps(canvasId as string);
      let permanentFailures = 0;

      for (const op of queue) {
        if (op.expiresAt <= now) continue;
        if (op.nextRetryAt > now) continue;

        try {
          if (op.type === "moveNode") {
            await moveNode(op.payload);
          } else if (op.type === "resizeNode") {
            await resizeNode(op.payload);
          } else if (op.type === "updateData") {
            await updateNodeData(op.payload);
          }

          await ackCanvasSyncOp(op.id);
          resolveCanvasOp(canvasId as string, op.id);
        } catch (error: unknown) {
          const transient =
            !isSyncOnline || isLikelyTransientSyncError(error);
          if (transient) {
            const backoffMs = Math.min(30_000, 1000 * 2 ** Math.min(op.attemptCount, 5));
            await markCanvasSyncOpFailed(op.id, {
              nextRetryAt: Date.now() + backoffMs,
              lastError: getErrorMessage(error),
            });
            break;
          }

          permanentFailures += 1;
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
  }, [canvasId, isSyncOnline, moveNode, refreshPendingSyncCount, resizeNode, updateNodeData]);

  const enqueueSyncMutation = useCallback(
    async <TType extends keyof CanvasSyncOpPayloadByType>(
      type: TType,
      payload: CanvasSyncOpPayloadByType[TType],
    ) => {
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
      void flushCanvasSyncQueue();
    },
    [canvasId, flushCanvasSyncQueue, refreshPendingSyncCount],
  );

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

  const runMoveNodeMutation = useCallback(
    async (args: { nodeId: Id<"nodes">; positionX: number; positionY: number }) => {
      await enqueueSyncMutation("moveNode", args);
    },
    [enqueueSyncMutation],
  );

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

  const runResizeNodeMutation = useCallback(
    async (args: { nodeId: Id<"nodes">; width: number; height: number }) => {
      await enqueueSyncMutation("resizeNode", args);
    },
    [enqueueSyncMutation],
  );

  const runUpdateNodeDataMutation = useCallback(
    async (args: { nodeId: Id<"nodes">; data: unknown }) => {
      await enqueueSyncMutation("updateData", args);
    },
    [enqueueSyncMutation],
  );

  const runBatchRemoveNodesMutation = useCallback(
    async (args: Parameters<typeof batchRemoveNodes>[0]) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Löschen");
        return;
      }
      await batchRemoveNodes(args);
    },
    [batchRemoveNodes, isSyncOnline, notifyOfflineUnsupported],
  );

  const runCreateEdgeMutation = useCallback(
    async (args: Parameters<typeof createEdge>[0]) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Kante erstellen");
        return;
      }
      await createEdge(args);
    },
    [createEdge, isSyncOnline, notifyOfflineUnsupported],
  );

  const runRemoveEdgeMutation = useCallback(
    async (args: Parameters<typeof removeEdge>[0]) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Kante entfernen");
        return;
      }
      await removeEdge(args);
    },
    [isSyncOnline, notifyOfflineUnsupported, removeEdge],
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

    const removed = edgeList.find(
      (e: Doc<"edges">) => e._id === args.splitEdgeId,
    );
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

  const runSplitEdgeAtExistingNodeMutation = useCallback(
    async (args: Parameters<typeof splitEdgeAtExistingNodeMut>[0]) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Kanten-Split");
        return;
      }
      await splitEdgeAtExistingNodeMut(args);
    },
    [isSyncOnline, notifyOfflineUnsupported, splitEdgeAtExistingNodeMut],
  );

  /** Freepik-Panel: State canvas-weit, damit es den optimistic_… → Real-ID-Wechsel überlebt. */
  const [assetBrowserTargetNodeId, setAssetBrowserTargetNodeId] = useState<
    string | null
  >(null);
  const assetBrowserTargetApi: AssetBrowserTargetApi = useMemo(
    () => ({
      targetNodeId: assetBrowserTargetNodeId,
      openForNode: (nodeId: string) => setAssetBrowserTargetNodeId(nodeId),
      close: () => setAssetBrowserTargetNodeId(null),
    }),
    [assetBrowserTargetNodeId],
  );

  /** Pairing: create kann vor oder nach Drag-Ende fertig sein. Kanten-Split + Position in einem Convex-Roundtrip wenn split ansteht. */
  const syncPendingMoveForClientRequest = useCallback(
    async (
      clientRequestId: string | undefined,
      realId?: Id<"nodes">,
    ): Promise<void> => {
      if (!clientRequestId) return;

      if (realId !== undefined) {
        const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}`;
        setAssetBrowserTargetNodeId((current) =>
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
          try {
            await runSplitEdgeAtExistingNodeMutation({
              canvasId,
              splitEdgeId: splitPayload.intersectedEdgeId,
              middleNodeId: realId,
              splitSourceHandle: splitPayload.intersectedSourceHandle,
              splitTargetHandle: splitPayload.intersectedTargetHandle,
              newNodeSourceHandle: splitPayload.middleSourceHandle,
              newNodeTargetHandle: splitPayload.middleTargetHandle,
              positionX: pendingMove?.positionX ?? splitPayload.positionX,
              positionY: pendingMove?.positionY ?? splitPayload.positionY,
            });
          } catch (error: unknown) {
            console.error("[Canvas pending edge split failed]", {
              clientRequestId,
              realId,
              error: String(error),
            });
          }
          return;
        }

        if (pendingMove) {
          pendingMoveAfterCreateRef.current.delete(clientRequestId);
          // Ref bewusst NICHT löschen: Edge-Sync braucht clientRequestId→realId für
          // Remap/Carry-over, solange convexNodes/convexEdges nach Mutation kurz auseinanderlaufen.
          resolvedRealIdByClientRequestRef.current.set(clientRequestId, realId);
          pendingLocalPositionUntilConvexMatchesRef.current.set(
            realId as string,
            {
              x: pendingMove.positionX,
              y: pendingMove.positionY,
            },
          );
          await runMoveNodeMutation({
            nodeId: realId,
            positionX: pendingMove.positionX,
            positionY: pendingMove.positionY,
          });
          return;
        }

        resolvedRealIdByClientRequestRef.current.set(clientRequestId, realId);
        return;
      }

      const r = resolvedRealIdByClientRequestRef.current.get(clientRequestId);
      const p = pendingMoveAfterCreateRef.current.get(clientRequestId);
      if (!r || !p) return;
      pendingMoveAfterCreateRef.current.delete(clientRequestId);
      resolvedRealIdByClientRequestRef.current.delete(clientRequestId);

      const splitPayload =
        pendingEdgeSplitByClientRequestRef.current.get(clientRequestId);
      if (splitPayload) {
        pendingEdgeSplitByClientRequestRef.current.delete(clientRequestId);
        try {
          await runSplitEdgeAtExistingNodeMutation({
            canvasId,
            splitEdgeId: splitPayload.intersectedEdgeId,
            middleNodeId: r,
            splitSourceHandle: splitPayload.intersectedSourceHandle,
            splitTargetHandle: splitPayload.intersectedTargetHandle,
            newNodeSourceHandle: splitPayload.middleSourceHandle,
            newNodeTargetHandle: splitPayload.middleTargetHandle,
            positionX: splitPayload.positionX ?? p.positionX,
            positionY: splitPayload.positionY ?? p.positionY,
          });
        } catch (error: unknown) {
          console.error("[Canvas pending edge split failed]", {
            clientRequestId,
            realId: r,
            error: String(error),
          });
        }
      } else {
        pendingLocalPositionUntilConvexMatchesRef.current.set(r as string, {
          x: p.positionX,
          y: p.positionY,
        });
        await runMoveNodeMutation({
          nodeId: r,
          positionX: p.positionX,
          positionY: p.positionY,
        });
      }
    },
    [canvasId, runMoveNodeMutation, runSplitEdgeAtExistingNodeMutation],
  );

  // ─── Lokaler State (für flüssiges Dragging) ───────────────────
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const nodesRef = useRef<RFNode[]>(nodes);
  nodesRef.current = nodes;
  const [hasHydratedLocalSnapshot, setHasHydratedLocalSnapshot] = useState(false);
  /** Erzwingt Edge-Merge nach Mutation, falls clientRequestId→realId-Ref erst im Promise gesetzt wird. */
  const [edgeSyncNonce, setEdgeSyncNonce] = useState(0);
  const [connectionDropMenu, setConnectionDropMenu] =
    useState<ConnectionDropMenuState | null>(null);
  const connectionDropMenuRef = useRef<ConnectionDropMenuState | null>(null);
  connectionDropMenuRef.current = connectionDropMenu;

  const [scissorsMode, setScissorsMode] = useState(false);
  const [scissorStrokePreview, setScissorStrokePreview] = useState<
    { x: number; y: number }[] | null
  >(null);
  const [navTool, setNavTool] = useState<CanvasNavTool>("select");

  useEffect(() => {
    const snapshot = readCanvasSnapshot<RFNode, RFEdge>(canvasId as string);
    if (snapshot) {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
    }
    setHasHydratedLocalSnapshot(true);
  }, [canvasId]);

  useEffect(() => {
    if (!hasHydratedLocalSnapshot) return;
    writeCanvasSnapshot(canvasId as string, { nodes, edges });
  }, [canvasId, edges, hasHydratedLocalSnapshot, nodes]);

  const handleNavToolChange = useCallback((tool: CanvasNavTool) => {
    if (tool === "scissor") {
      setScissorsMode(true);
      setNavTool("scissor");
      return;
    }
    setScissorsMode(false);
    setNavTool(tool);
  }, []);

  // Auswahl (V) / Hand (H) — ergänzt die Leertaste (Standard: panActivationKeyCode Space beim Ziehen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : "";
      if (key === "v") {
        e.preventDefault();
        handleNavToolChange("select");
        return;
      }
      if (key === "h") {
        e.preventDefault();
        handleNavToolChange("hand");
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleNavToolChange]);

  const { flowPanOnDrag, flowSelectionOnDrag } = useMemo(() => {
    const panMiddleRight: number[] = [1, 2];
    if (scissorsMode) {
      return { flowPanOnDrag: panMiddleRight, flowSelectionOnDrag: false };
    }
    if (navTool === "hand") {
      return { flowPanOnDrag: true, flowSelectionOnDrag: false };
    }
    if (navTool === "comment") {
      return { flowPanOnDrag: panMiddleRight, flowSelectionOnDrag: true };
    }
    return { flowPanOnDrag: panMiddleRight, flowSelectionOnDrag: true };
  }, [scissorsMode, navTool]);

  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const scissorsModeRef = useRef(scissorsMode);
  scissorsModeRef.current = scissorsMode;

  // Drag-Lock: während des Drags kein Convex-Override
  const isDragging = useRef(false);
  /** Convex-Merge: Position nicht mit veraltetem Snapshot überschreiben (RF-`dragging` kommt oft verzögert). */
  const preferLocalPositionNodeIdsRef = useRef(new Set<string>());
  // Resize-Lock: kein Convex→lokal während aktiver Größenänderung (veraltete Maße überschreiben sonst den Resize)
  const isResizing = useRef(false);

  // Delete-Lock: Nodes die gerade gelöscht werden, nicht aus Convex-Sync wiederherstellen
  const deletingNodeIds = useRef<Set<string>>(new Set());

  // Delete Edge on Drop
  const edgeReconnectSuccessful = useRef(true);
  const isReconnectDragActiveRef = useRef(false);
  const overlappedEdgeRef = useRef<string | null>(null);
  const highlightedEdgeRef = useRef<string | null>(null);
  const highlightedEdgeOriginalStyleRef = useRef<RFEdge["style"] | undefined>(
    undefined,
  );
  useGenerationFailureWarnings(convexNodes);

  const { onEdgeClickScissors, onScissorsFlowPointerDownCapture } = useCanvasScissors({
    scissorsMode,
    scissorsModeRef,
    edgesRef,
    setScissorsMode,
    setNavTool,
    setScissorStrokePreview,
    runRemoveEdgeMutation,
  });

  const { onBeforeDelete, onNodesDelete, onEdgesDelete } = useCanvasDeleteHandlers({
    canvasId,
    isOffline: !isSyncOnline,
    nodes,
    edges,
    deletingNodeIds,
    setAssetBrowserTargetNodeId,
    runBatchRemoveNodesMutation,
    runCreateEdgeMutation,
    runRemoveEdgeMutation,
  });

  const { onReconnectStart, onReconnect, onReconnectEnd } = useCanvasReconnectHandlers({
    edgeReconnectSuccessful,
    isReconnectDragActiveRef,
    setEdges,
    runRemoveEdgeMutation,
  });

  // ─── Convex → Lokaler State Sync ──────────────────────────────
  /**
   * 1) Kanten: Carry/Inferenz setzt ggf. `resolvedRealIdByClientRequestRef` (auch bevor Mutation-.then läuft).
   * 2) Nodes: gleicher Commit, vor Paint — echte Node-IDs passen zu Kanten-Endpunkten (verhindert „reißende“ Kanten).
   * Während Drag (`isDraggingRef` oder `node.dragging`): nur optimistic→real-Handoff.
   */
  useLayoutEffect(() => {
    if (!convexEdges) return;
    setEdges((prev) => {
      const prevConvexSnap = convexNodeIdsSnapshotForEdgeCarryRef.current;
      const currentConvexIdList =
        convexNodes !== undefined
          ? convexNodes.map((n: Doc<"nodes">) => n._id as string)
          : [];
      const currentConvexIdSet = new Set(currentConvexIdList);
      const newlyAppearedIds: string[] = [];
      for (const id of currentConvexIdList) {
        if (!prevConvexSnap.has(id)) newlyAppearedIds.push(id);
      }

      const tempEdges = prev.filter((e) => e.className === "temp");
      const sourceTypeByNodeId =
        convexNodes !== undefined
          ? new Map(
              convexNodes.map((n: Doc<"nodes">) => [n._id as string, n.type]),
            )
          : undefined;
      const glowMode = resolvedTheme === "dark" ? "dark" : "light";
      const mapped = convexEdges.map((edge: Doc<"edges">) =>
        sourceTypeByNodeId
          ? convexEdgeToRFWithSourceGlow(
              edge,
              sourceTypeByNodeId.get(edge.sourceNodeId),
              glowMode,
            )
          : convexEdgeToRF(edge),
      );

      const mappedSignatures = new Set(mapped.map(rfEdgeConnectionSignature));
      const convexNodeIds =
        convexNodes !== undefined
          ? new Set(convexNodes.map((n: Doc<"nodes">) => n._id as string))
          : null;
      const realIdByClientRequest = resolvedRealIdByClientRequestRef.current;
      const isAnyNodeDragging =
        isDragging.current ||
        nodesRef.current.some((n) =>
          Boolean((n as { dragging?: boolean }).dragging),
        );

      const localHasOptimisticNode = (nodeId: string): boolean => {
        if (!isOptimisticNodeId(nodeId)) return false;
        return nodesRef.current.some((n) => n.id === nodeId);
      };

      const resolveEndpoint = (nodeId: string): string => {
        if (!isOptimisticNodeId(nodeId)) return nodeId;
        const cr = clientRequestIdFromOptimisticNodeId(nodeId);
        if (!cr) return nodeId;
        if (isAnyNodeDragging && localHasOptimisticNode(nodeId)) {
          return nodeId;
        }
        const real = realIdByClientRequest.get(cr);
        return real !== undefined ? (real as string) : nodeId;
      };

      /** Wenn Mutation-.then noch nicht lief: echte ID aus Delta (eine neue Node) + gleiche clientRequestId wie Kante. */
      const resolveEndpointWithInference = (
        nodeId: string,
        edge: RFEdge,
      ): string => {
        const base = resolveEndpoint(nodeId);
        if (!isOptimisticNodeId(base)) return base;
        if (isAnyNodeDragging) return base;
        const nodeCr = clientRequestIdFromOptimisticNodeId(base);
        if (nodeCr === null) return base;
        const edgeCr = clientRequestIdFromOptimisticEdgeId(edge.id);
        if (edgeCr === null || edgeCr !== nodeCr) return base;
        if (!pendingConnectionCreatesRef.current.has(nodeCr)) return base;
        if (newlyAppearedIds.length !== 1) return base;
        const inferred = newlyAppearedIds[0];
        resolvedRealIdByClientRequestRef.current.set(
          nodeCr,
          inferred as Id<"nodes">,
        );
        return inferred;
      };

      const endpointUsable = (nodeId: string): boolean => {
        if (isAnyNodeDragging && localHasOptimisticNode(nodeId)) return true;
        const resolved = resolveEndpoint(nodeId);
        if (convexNodeIds?.has(resolved)) return true;
        if (convexNodeIds?.has(nodeId)) return true;
        return false;
      };

      const optimisticEndpointHasPendingCreate = (nodeId: string): boolean => {
        if (!isOptimisticNodeId(nodeId)) return false;
        const cr = clientRequestIdFromOptimisticNodeId(nodeId);
        return (
          cr !== null && pendingConnectionCreatesRef.current.has(cr)
        );
      };

      const shouldCarryOptimisticEdge = (
        original: RFEdge,
        remapped: RFEdge,
      ): boolean => {
        if (mappedSignatures.has(rfEdgeConnectionSignature(remapped))) {
          return false;
        }

        const sourceOk = endpointUsable(remapped.source);
        const targetOk = endpointUsable(remapped.target);
        if (sourceOk && targetOk) return true;

        if (!pendingConnectionCreatesRef.current.size) {
          return false;
        }

        if (
          sourceOk &&
          optimisticEndpointHasPendingCreate(original.target)
        ) {
          return true;
        }

        if (
          targetOk &&
          optimisticEndpointHasPendingCreate(original.source)
        ) {
          return true;
        }

        return false;
      };

      const carriedOptimistic: RFEdge[] = [];
      for (const e of prev) {
        if (e.className === "temp") continue;
        if (!isOptimisticEdgeId(e.id)) continue;

        const remapped: RFEdge = {
          ...e,
          source: resolveEndpointWithInference(e.source, e),
          target: resolveEndpointWithInference(e.target, e),
        };

        if (!shouldCarryOptimisticEdge(e, remapped)) continue;

        carriedOptimistic.push(remapped);
      }

      if (convexNodes !== undefined) {
        convexNodeIdsSnapshotForEdgeCarryRef.current = currentConvexIdSet;
      }

      /** Erst löschen, wenn Convex die neue Kante geliefert hat — sonst kurzes Fenster: pending=0, Kanten-Query noch alt, Carry schlägt fehl. */
      for (const cr of [...pendingConnectionCreatesRef.current]) {
        const realId = resolvedRealIdByClientRequestRef.current.get(cr);
        if (realId === undefined) continue;
        const nodePresent =
          convexNodes !== undefined &&
          convexNodes.some((n: Doc<"nodes">) => n._id === realId);
        const edgeTouchesNewNode = convexEdges.some(
          (e: Doc<"edges">) =>
            e.sourceNodeId === realId || e.targetNodeId === realId,
        );
        if (nodePresent && edgeTouchesNewNode) {
          pendingConnectionCreatesRef.current.delete(cr);
        }
      }

      return [...mapped, ...carriedOptimistic, ...tempEdges];
    });
  }, [convexEdges, convexNodes, resolvedTheme, edgeSyncNonce]);

  useLayoutEffect(() => {
    if (!convexNodes || isResizing.current) return;
    setNodes((previousNodes) => {
      inferPendingConnectionNodeHandoff(
        previousNodes,
        convexNodes,
        pendingConnectionCreatesRef.current,
        resolvedRealIdByClientRequestRef.current,
      );

      /** RF setzt `node.dragging` + Position oft bevor `onNodeDragStart` `isDraggingRef` setzt — ohne diese Zeile zieht useLayoutEffect Convex-Stand darüber („Kleben“). */
      const anyRfNodeDragging = previousNodes.some((n) =>
        Boolean((n as { dragging?: boolean }).dragging),
      );
      if (isDragging.current || anyRfNodeDragging) {
        // Kritisch für UX: Kein optimistic->real-ID-Handoff während aktivem Drag.
        // Sonst kann React Flow den Drag verlieren ("Node klebt"), sobald der
        // Server-Create zurückkommt und die ID im laufenden Pointer-Stream wechselt.
        return previousNodes;
      }

      const prevDataById = new Map(
        previousNodes.map((node) => [node.id, node.data as Record<string, unknown>]),
      );
      const enriched = convexNodes.map((node: Doc<"nodes">) =>
        convexNodeDocWithMergedStorageUrl(
          node,
          storageUrlsById,
          prevDataById,
        ),
      );
      const incomingNodes = withResolvedCompareData(
        enriched.map(convexNodeToRF),
        edges,
      );
      // Nodes, die gerade optimistisch gelöscht werden, nicht wiederherstellen
      const filteredIncoming = deletingNodeIds.current.size > 0
        ? incomingNodes.filter((node) => !deletingNodeIds.current.has(node.id))
        : incomingNodes;
      const merged = applyPinnedNodePositions(
        mergeNodesPreservingLocalState(
          previousNodes,
          filteredIncoming,
          resolvedRealIdByClientRequestRef.current,
          preferLocalPositionNodeIdsRef.current,
        ),
        pendingLocalPositionUntilConvexMatchesRef.current,
      );
      const mergedWithOpPins = applyPinnedNodePositionsReadOnly(
        merged,
        getPendingMovePinsFromLocalOps(canvasId as string),
      );
      /** Nicht am Drag-Ende leeren (moveNode läuft oft async): solange Convex alt ist, Eintrag behalten und erst bei übereinstimmendem Snapshot entfernen. */
      const incomingById = new Map(
        filteredIncoming.map((n) => [n.id, n]),
      );
      for (const n of mergedWithOpPins) {
        if (!preferLocalPositionNodeIdsRef.current.has(n.id)) continue;
        const inc = incomingById.get(n.id);
        if (!inc) continue;
        if (
          positionsMatchPin(n.position, {
            x: inc.position.x,
            y: inc.position.y,
          })
        ) {
          preferLocalPositionNodeIdsRef.current.delete(n.id);
        }
      }
      return mergedWithOpPins;
    });
  }, [canvasId, convexNodes, edges, storageUrlsById]);

  useEffect(() => {
    if (isDragging.current) return;
    setNodes((nds) => withResolvedCompareData(nds, edges));
  }, [edges]);

  // ─── Node Changes (Drag, Select, Remove) ─────────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "dimensions") {
          if (c.resizing === true) {
            isResizing.current = true;
          } else if (c.resizing === false) {
            isResizing.current = false;
          }
        }
      }

      const removedIds = new Set<string>();
      for (const c of changes) {
        if (c.type === "remove") {
          removedIds.add(c.id);
        }
      }

      setNodes((nds) => {
        for (const c of changes) {
          if (c.type === "position" && "id" in c) {
            pendingLocalPositionUntilConvexMatchesRef.current.delete(c.id);
            preferLocalPositionNodeIdsRef.current.add(c.id);
          }
        }

        const adjustedChanges = adjustNodeDimensionChanges(changes, nds);

        const nextNodes = applyNodeChanges(adjustedChanges, nds);

        for (const change of adjustedChanges) {
          if (change.type !== "dimensions") continue;
          if (!change.dimensions) continue;
          if (removedIds.has(change.id)) continue;
          const prevNode = nds.find((node) => node.id === change.id);
          const nextNode = nextNodes.find((node) => node.id === change.id);
          void prevNode;
          void nextNode;
          if (change.resizing !== false) continue;

          void runResizeNodeMutation({
            nodeId: change.id as Id<"nodes">,
            width: change.dimensions.width,
            height: change.dimensions.height,
          }).catch((error: unknown) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[Canvas] resizeNode failed", error);
            }
          });
        }

        return nextNodes;
      });
    },
    [runResizeNodeMutation],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onFlowError = useCallback((id: string, error: string) => {
    if (process.env.NODE_ENV === "production") return;
    console.error("[ReactFlow error]", { canvasId, id, error });
  }, [canvasId]);

  const setHighlightedIntersectionEdge = useCallback((edgeId: string | null) => {
    const previousHighlightedEdgeId = highlightedEdgeRef.current;
    if (previousHighlightedEdgeId === edgeId) {
      return;
    }

    setEdges((currentEdges) => {
      let nextEdges = currentEdges;

      if (previousHighlightedEdgeId) {
        nextEdges = nextEdges.map((edge) =>
          edge.id === previousHighlightedEdgeId
            ? {
                ...edge,
                style: highlightedEdgeOriginalStyleRef.current,
              }
            : edge,
        );
      }

      if (!edgeId) {
        highlightedEdgeOriginalStyleRef.current = undefined;
        return nextEdges;
      }

      const edgeToHighlight = nextEdges.find((edge) => edge.id === edgeId);
      if (!edgeToHighlight || edgeToHighlight.className === "temp") {
        highlightedEdgeOriginalStyleRef.current = undefined;
        return nextEdges;
      }

      highlightedEdgeOriginalStyleRef.current = edgeToHighlight.style;

      return nextEdges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              style: {
                ...(edge.style ?? {}),
                ...EDGE_INTERSECTION_HIGHLIGHT_STYLE,
              },
            }
          : edge,
      );
    });

    highlightedEdgeRef.current = edgeId;
  }, []);

  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
      const nodeCenter = getNodeCenterClientPosition(node.id);
      if (!nodeCenter) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      const intersectedEdgeId = getIntersectedEdgeId(nodeCenter);
      if (!intersectedEdgeId) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      const intersectedEdge = edges.find(
        (edge) => edge.id === intersectedEdgeId && edge.className !== "temp",
      );
      if (!intersectedEdge) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      if (
        intersectedEdge.source === node.id ||
        intersectedEdge.target === node.id
      ) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      const handles = NODE_HANDLE_MAP[node.type ?? ""];
      if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      overlappedEdgeRef.current = intersectedEdge.id;
      setHighlightedIntersectionEdge(intersectedEdge.id);
    },
    [edges, setHighlightedIntersectionEdge],
  );

  // ─── Drag Start → Lock ────────────────────────────────────────
  const onNodeDragStart = useCallback(
    (_event: ReactMouseEvent, _node: RFNode, draggedNodes: RFNode[]) => {
      isDragging.current = true;
      overlappedEdgeRef.current = null;
      setHighlightedIntersectionEdge(null);
      for (const n of draggedNodes) {
        pendingLocalPositionUntilConvexMatchesRef.current.delete(n.id);
      }
    },
    [setHighlightedIntersectionEdge],
  );

  // ─── Drag Stop → Commit zu Convex ─────────────────────────────
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: RFNode, draggedNodes: RFNode[]) => {
      const primaryNode = (node as RFNode | undefined) ?? draggedNodes[0];
      const intersectedEdgeId = overlappedEdgeRef.current;

      void (async () => {
        if (!primaryNode) {
          overlappedEdgeRef.current = null;
          setHighlightedIntersectionEdge(null);
          isDragging.current = false;
          return;
        }
        try {
          const intersectedEdge = intersectedEdgeId
            ? edges.find(
                (edge) =>
                  edge.id === intersectedEdgeId && edge.className !== "temp",
              )
            : undefined;

          const splitHandles = NODE_HANDLE_MAP[primaryNode.type ?? ""];
          const splitEligible =
            intersectedEdge !== undefined &&
            splitHandles !== undefined &&
            intersectedEdge.source !== primaryNode.id &&
            intersectedEdge.target !== primaryNode.id &&
            hasHandleKey(splitHandles, "source") &&
            hasHandleKey(splitHandles, "target");

          if (draggedNodes.length > 1) {
            for (const n of draggedNodes) {
              const cid = clientRequestIdFromOptimisticNodeId(n.id);
              if (cid) {
                pendingMoveAfterCreateRef.current.set(cid, {
                  positionX: n.position.x,
                  positionY: n.position.y,
                });
                await syncPendingMoveForClientRequest(cid);
              }
            }
            const realMoves = draggedNodes.filter((n) => !isOptimisticNodeId(n.id));
            if (realMoves.length > 0) {
              await runBatchMoveNodesMutation({
                moves: realMoves.map((n) => ({
                  nodeId: n.id as Id<"nodes">,
                  positionX: n.position.x,
                  positionY: n.position.y,
                })),
              });
            }

            if (!splitEligible || !intersectedEdge) {
              return;
            }

            const multiCid = clientRequestIdFromOptimisticNodeId(primaryNode.id);
            let middleId = primaryNode.id as Id<"nodes">;
            if (multiCid) {
              const r = resolvedRealIdByClientRequestRef.current.get(multiCid);
              if (!r) {
                pendingEdgeSplitByClientRequestRef.current.set(multiCid, {
                  intersectedEdgeId: intersectedEdge.id as Id<"edges">,
                  sourceNodeId: intersectedEdge.source as Id<"nodes">,
                  targetNodeId: intersectedEdge.target as Id<"nodes">,
                  intersectedSourceHandle: normalizeHandle(
                    intersectedEdge.sourceHandle,
                  ),
                  intersectedTargetHandle: normalizeHandle(
                    intersectedEdge.targetHandle,
                  ),
                  middleSourceHandle: normalizeHandle(splitHandles.source),
                  middleTargetHandle: normalizeHandle(splitHandles.target),
                  positionX: primaryNode.position.x,
                  positionY: primaryNode.position.y,
                });
                return;
              }
              middleId = r;
            }

            await runSplitEdgeAtExistingNodeMutation({
              canvasId,
              splitEdgeId: intersectedEdge.id as Id<"edges">,
              middleNodeId: middleId,
              splitSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
              splitTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
              newNodeSourceHandle: normalizeHandle(splitHandles.source),
              newNodeTargetHandle: normalizeHandle(splitHandles.target),
            });
            return;
          }

          if (!splitEligible || !intersectedEdge) {
            const cidSingle = clientRequestIdFromOptimisticNodeId(primaryNode.id);
            if (cidSingle) {
              pendingMoveAfterCreateRef.current.set(cidSingle, {
                positionX: primaryNode.position.x,
                positionY: primaryNode.position.y,
              });
              await syncPendingMoveForClientRequest(cidSingle);
            } else {
              await runMoveNodeMutation({
                nodeId: primaryNode.id as Id<"nodes">,
                positionX: primaryNode.position.x,
                positionY: primaryNode.position.y,
              });
            }
            return;
          }

          const singleCid = clientRequestIdFromOptimisticNodeId(primaryNode.id);
          if (singleCid) {
            const resolvedSingle =
              resolvedRealIdByClientRequestRef.current.get(singleCid);
            if (!resolvedSingle) {
              pendingMoveAfterCreateRef.current.set(singleCid, {
                positionX: primaryNode.position.x,
                positionY: primaryNode.position.y,
              });
              pendingEdgeSplitByClientRequestRef.current.set(singleCid, {
                intersectedEdgeId: intersectedEdge.id as Id<"edges">,
                sourceNodeId: intersectedEdge.source as Id<"nodes">,
                targetNodeId: intersectedEdge.target as Id<"nodes">,
                intersectedSourceHandle: normalizeHandle(
                  intersectedEdge.sourceHandle,
                ),
                intersectedTargetHandle: normalizeHandle(
                  intersectedEdge.targetHandle,
                ),
                middleSourceHandle: normalizeHandle(splitHandles.source),
                middleTargetHandle: normalizeHandle(splitHandles.target),
                positionX: primaryNode.position.x,
                positionY: primaryNode.position.y,
              });
              await syncPendingMoveForClientRequest(singleCid);
              return;
            }
            await runSplitEdgeAtExistingNodeMutation({
              canvasId,
              splitEdgeId: intersectedEdge.id as Id<"edges">,
              middleNodeId: resolvedSingle,
              splitSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
              splitTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
              newNodeSourceHandle: normalizeHandle(splitHandles.source),
              newNodeTargetHandle: normalizeHandle(splitHandles.target),
              positionX: primaryNode.position.x,
              positionY: primaryNode.position.y,
            });
            pendingMoveAfterCreateRef.current.delete(singleCid);
            return;
          }

          await runSplitEdgeAtExistingNodeMutation({
            canvasId,
            splitEdgeId: intersectedEdge.id as Id<"edges">,
            middleNodeId: primaryNode.id as Id<"nodes">,
            splitSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
            splitTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
            newNodeSourceHandle: normalizeHandle(splitHandles.source),
            newNodeTargetHandle: normalizeHandle(splitHandles.target),
            positionX: primaryNode.position.x,
            positionY: primaryNode.position.y,
          });
        } catch (error) {
          console.error("[Canvas edge intersection split failed]", {
            canvasId,
            nodeId: primaryNode?.id ?? null,
            nodeType: primaryNode?.type ?? null,
            intersectedEdgeId,
            error: String(error),
          });
        } finally {
          overlappedEdgeRef.current = null;
          setHighlightedIntersectionEdge(null);
          isDragging.current = false;
        }
      })();
    },
    [
      canvasId,
      edges,
      runBatchMoveNodesMutation,
      runMoveNodeMutation,
      setHighlightedIntersectionEdge,
      runSplitEdgeAtExistingNodeMutation,
      syncPendingMoveForClientRequest,
    ],
  );

  // ─── Neue Verbindung → Convex Edge ────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        void runCreateEdgeMutation({
          canvasId,
          sourceNodeId: connection.source as Id<"nodes">,
          targetNodeId: connection.target as Id<"nodes">,
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
        });
      }
    },
    [canvasId, runCreateEdgeMutation],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      if (isReconnectDragActiveRef.current) return;
      if (connectionState.isValid === true) return;
      const fromNode = connectionState.fromNode;
      const fromHandle = connectionState.fromHandle;
      if (!fromNode || !fromHandle) return;

      const pt = getConnectEndClientPoint(event);
      if (!pt) return;

      const flow = screenToFlowPosition({ x: pt.x, y: pt.y });
      setConnectionDropMenu({
        screenX: pt.x,
        screenY: pt.y,
        flowX: flow.x,
        flowY: flow.y,
        fromNodeId: fromNode.id as Id<"nodes">,
        fromHandleId: fromHandle.id ?? undefined,
        fromHandleType: fromHandle.type,
      });
    },
    [screenToFlowPosition],
  );

  const handleConnectionDropPick = useCallback(
    (template: CanvasNodeTemplate) => {
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Node mit Verbindung erstellen");
        return;
      }
      const ctx = connectionDropMenuRef.current;
      if (!ctx) return;

      const defaults = NODE_DEFAULTS[template.type] ?? {
        width: 200,
        height: 100,
        data: {},
      };
      const clientRequestId = crypto.randomUUID();
      pendingConnectionCreatesRef.current.add(clientRequestId);
      const handles = NODE_HANDLE_MAP[template.type];
      const width = template.width ?? defaults.width;
      const height = template.height ?? defaults.height;
      const data = {
        ...defaults.data,
        ...(template.defaultData as Record<string, unknown>),
        canvasId,
      };

      const base = {
        canvasId,
        type: template.type,
        positionX: ctx.flowX,
        positionY: ctx.flowY,
        width,
        height,
        data,
        clientRequestId,
      };

      const settle = (realId: Id<"nodes">) => {
        void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
          (error: unknown) => {
            console.error("[Canvas] settle syncPendingMove failed", error);
          },
        );
      };

      if (ctx.fromHandleType === "source") {
        void runCreateNodeWithEdgeFromSourceOnlineOnly({
          ...base,
          sourceNodeId: ctx.fromNodeId,
          sourceHandle: ctx.fromHandleId,
          targetHandle: handles?.target ?? undefined,
        })
          .then((realId) => {
            resolvedRealIdByClientRequestRef.current.set(
              clientRequestId,
              realId,
            );
            settle(realId);
            setEdgeSyncNonce((n) => n + 1);
          })
          .catch((error) => {
            pendingConnectionCreatesRef.current.delete(clientRequestId);
            console.error("[Canvas] createNodeWithEdgeFromSource failed", error);
          });
      } else {
        void runCreateNodeWithEdgeToTargetOnlineOnly({
          ...base,
          targetNodeId: ctx.fromNodeId,
          sourceHandle: handles?.source ?? undefined,
          targetHandle: ctx.fromHandleId,
        })
          .then((realId) => {
            resolvedRealIdByClientRequestRef.current.set(
              clientRequestId,
              realId,
            );
            settle(realId);
            setEdgeSyncNonce((n) => n + 1);
          })
          .catch((error) => {
            pendingConnectionCreatesRef.current.delete(clientRequestId);
            console.error("[Canvas] createNodeWithEdgeToTarget failed", error);
          });
      }
    },
    [
      canvasId,
      isSyncOnline,
      notifyOfflineUnsupported,
      runCreateNodeWithEdgeFromSourceOnlineOnly,
      runCreateNodeWithEdgeToTargetOnlineOnly,
      syncPendingMoveForClientRequest,
    ],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const hasFiles = event.dataTransfer.types.includes("Files");
    event.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      if (!isSyncOnline) {
        notifyOfflineUnsupported("Node erstellen");
        return;
      }

      const rawData = event.dataTransfer.getData(
        "application/lemonspace-node-type",
      );
      if (!rawData) {
        const hasFiles = event.dataTransfer.files && event.dataTransfer.files.length > 0;
        if (hasFiles) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith("image/")) {
            try {
              let dimensions: { width: number; height: number } | undefined;
              try {
                dimensions = await getImageDimensions(file);
              } catch {
                dimensions = undefined;
              }

              const uploadUrl = await generateUploadUrl();
              const result = await fetch(uploadUrl, {
                method: "POST",
                headers: { "Content-Type": file.type },
                body: file,
              });

              if (!result.ok) {
                throw new Error("Upload failed");
              }

              const { storageId } = (await result.json()) as { storageId: string };

              const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              const clientRequestId = crypto.randomUUID();

              void runCreateNodeOnlineOnly({
                canvasId,
                type: "image",
                positionX: position.x,
                positionY: position.y,
                width: NODE_DEFAULTS.image.width,
                height: NODE_DEFAULTS.image.height,
                data: {
                  storageId,
                  filename: file.name,
                  mimeType: file.type,
                  ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
                  canvasId,
                },
                clientRequestId,
              }).then((realId) => {
                void syncPendingMoveForClientRequest(
                  clientRequestId,
                  realId,
                ).catch((error: unknown) => {
                  console.error(
                    "[Canvas] drop createNode syncPendingMove failed",
                    error,
                  );
                });
              });
            } catch (err) {
              console.error("Failed to upload dropped file:", err);
              toast.error(msg.canvas.uploadFailed.title, err instanceof Error ? err.message : undefined);
            }
            return;
          }
        }
        return;
      }

      // Support both plain type string (sidebar) and JSON payload (browser panels)
      let nodeType: string;
      let payloadData: Record<string, unknown> | undefined;

      try {
        const parsed = JSON.parse(rawData);
        if (typeof parsed === "object" && parsed.type) {
          nodeType = parsed.type;
          payloadData = parsed.data;
        } else {
          nodeType = rawData;
        }
      } catch {
        nodeType = rawData;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const defaults = NODE_DEFAULTS[nodeType] ?? {
        width: 200,
        height: 100,
        data: {},
      };

      const clientRequestId = crypto.randomUUID();
      void runCreateNodeOnlineOnly({
        canvasId,
        type: nodeType,
        positionX: position.x,
        positionY: position.y,
        width: defaults.width,
        height: defaults.height,
        data: { ...defaults.data, ...payloadData, canvasId },
        clientRequestId,
      }).then((realId) => {
        void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
          (error: unknown) => {
            console.error(
              "[Canvas] createNode syncPendingMove failed",
              error,
            );
          },
        );
      });
    },
    [
      screenToFlowPosition,
      canvasId,
      generateUploadUrl,
      isSyncOnline,
      notifyOfflineUnsupported,
      runCreateNodeOnlineOnly,
      syncPendingMoveForClientRequest,
    ],
  );

  const canvasSyncContextValue = useMemo(
    () => ({
      queueNodeDataUpdate: runUpdateNodeDataMutation,
      queueNodeResize: runResizeNodeMutation,
      status: {
        pendingCount: pendingSyncCount,
        isSyncing,
        isOffline: !isSyncOnline,
      },
    }),
    [isSyncOnline, isSyncing, pendingSyncCount, runResizeNodeMutation, runUpdateNodeDataMutation],
  );

  // ─── Loading State ────────────────────────────────────────────
  if (convexNodes === undefined || convexEdges === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Canvas lädt…</span>
        </div>
      </div>
    );
  }

  return (
    <CanvasSyncProvider value={canvasSyncContextValue}>
      <CanvasPlacementProvider
        canvasId={canvasId}
        createNode={runCreateNodeOnlineOnly}
        createNodeWithEdgeSplit={runCreateNodeWithEdgeSplitOnlineOnly}
        createNodeWithEdgeFromSource={runCreateNodeWithEdgeFromSourceOnlineOnly}
        createNodeWithEdgeToTarget={runCreateNodeWithEdgeToTargetOnlineOnly}
        onCreateNodeSettled={({ clientRequestId, realId }) => {
          void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
            (error: unknown) => {
              console.error(
                "[Canvas] onCreateNodeSettled syncPendingMove failed",
                error,
              );
            },
          );
        }}
      >
        <AssetBrowserTargetContext.Provider value={assetBrowserTargetApi}>
      <div className="relative h-full w-full">
        <CanvasToolbar
          canvasName={canvas?.name ?? "canvas"}
          activeTool={navTool}
          onToolChange={handleNavToolChange}
        />
        <CanvasAppMenu canvasId={canvasId} />
        <CanvasCommandPalette />
        <CanvasConnectionDropMenu
          state={connectionDropMenu}
          onClose={() => setConnectionDropMenu(null)}
          onPick={handleConnectionDropPick}
        />
        {scissorsMode ? (
          <div className="pointer-events-none absolute top-14 left-1/2 z-50 max-w-[min(100%-2rem,28rem)] -translate-x-1/2 rounded-lg bg-popover/95 px-3 py-1.5 text-center text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
            Scherenmodus — Kante anklicken oder ziehen zum Durchtrennen ·{" "}
            <span className="whitespace-nowrap">Esc oder K beenden</span> · Mitte/Rechtsklick zum
            Verschieben
          </div>
        ) : null}
        {scissorStrokePreview && scissorStrokePreview.length > 1 ? (
          <svg
            className="pointer-events-none fixed inset-0 z-60 overflow-visible"
            aria-hidden
          >
            <polyline
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.85}
              points={scissorStrokePreview
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
            />
          </svg>
        ) : null}
        <div
          className="relative h-full min-h-0 w-full"
          onPointerDownCapture={
            scissorsMode ? onScissorsFlowPointerDownCapture : undefined
          }
        >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onlyRenderVisibleElements
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          connectionLineComponent={CustomConnectionLine}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onReconnect={onReconnect}
          onReconnectStart={onReconnectStart}
          onReconnectEnd={onReconnectEnd}
          onBeforeDelete={onBeforeDelete}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onEdgeClick={scissorsMode ? onEdgeClickScissors : undefined}
          onError={onFlowError}
          onDragOver={onDragOver}
          onDrop={onDrop}
          fitView
          minZoom={CANVAS_MIN_ZOOM}
          snapToGrid={false}
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode="Shift"
          nodesConnectable={!scissorsMode}
          panOnDrag={flowPanOnDrag}
          selectionOnDrag={flowSelectionOnDrag}
          panActivationKeyCode="Space"
          proOptions={{ hideAttribution: true }}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          className={cn("bg-background", scissorsMode && "canvas-scissors-mode")}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls className="bg-card! border! shadow-sm! rounded-lg!" />
          <MiniMap
            className="bg-card! border! shadow-sm! rounded-lg!"
            nodeColor={getMiniMapNodeColor}
            nodeStrokeColor={getMiniMapNodeStrokeColor}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
        </div>
      </div>
        </AssetBrowserTargetContext.Provider>
      </CanvasPlacementProvider>
    </CanvasSyncProvider>
  );
}

interface CanvasProps {
  canvasId: Id<"canvases">;
}

export default function Canvas({ canvasId }: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner canvasId={canvasId} />
    </ReactFlowProvider>
  );
}
