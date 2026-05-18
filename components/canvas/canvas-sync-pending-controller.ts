/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas sync pending controller. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { logCanvasDebug } from "@/components/canvas/canvas-debug";
import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasSyncOpPayloadByType } from "@/lib/canvas-op-queue";
import {
  clientRequestIdFromOptimisticNodeId,
  isOptimisticNodeId,
  OPTIMISTIC_NODE_PREFIX,
  type PendingEdgeSplit,
} from "./canvas-helpers";

export type QueueSyncMutation = <TType extends keyof CanvasSyncOpPayloadByType>(
  type: TType,
  payload: CanvasSyncOpPayloadByType[TType],
) => Promise<void>;

type DynamicValue<T> = T | (() => T);

function resolveDynamicValue<T>(value: DynamicValue<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

export type RunMoveNodeMutation = (args: {
  nodeId: Id<"nodes">;
  positionX: number;
  positionY: number;
}) => Promise<void>;

export type RunSetNodeParentMutation = (args: {
  nodeId: Id<"nodes">;
  parentId?: Id<"nodes">;
  positionX: number;
  positionY: number;
}) => Promise<void>;

export type RunBatchRemoveNodesMutation = (args: {
  nodeIds: Id<"nodes">[];
}) => Promise<void>;

export type RunSplitEdgeAtExistingNodeMutation = (args: {
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

export type CanvasSyncPendingControllerParams = {
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

export type CanvasSyncPendingController = ReturnType<
  typeof createCanvasSyncPendingController
>;

export function createCanvasSyncPendingController({
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
}: CanvasSyncPendingControllerParams) {
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
  const pendingLocalNodeDataUntilConvexMatchesRef = {
    current: new Map<string, unknown>(),
  };
  const pendingLocalNodeSizeUntilConvexMatchesRef = {
    current: new Map<string, { width: number; height: number }>(),
  };
  const pendingLocalNodeParentUntilConvexMatchesRef = {
    current: new Map<string, { parentId?: string; x: number; y: number }>(),
  };
  const preferLocalPositionNodeIdsRef = { current: new Set<string>() };

  const pinNodeDataLocally = (nodeId: string, data: unknown): void => {
    pendingLocalNodeDataUntilConvexMatchesRef.current.set(nodeId, data);
    const setNodes = getSetNodes?.();
    setNodes?.((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: data as Record<string, unknown>,
            }
          : node,
      ),
    );
  };

  const pinNodeSizeLocally = (
    nodeId: string,
    size: { width: number; height: number },
  ): void => {
    pendingLocalNodeSizeUntilConvexMatchesRef.current.set(nodeId, size);
    const setNodes = getSetNodes?.();
    setNodes?.((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              style: {
                ...(node.style ?? {}),
                width: size.width,
                height: size.height,
              },
            }
          : node,
      ),
    );
  };

  const pinNodeParentLocally = (
    nodeId: string,
    pin: { parentId?: string; x: number; y: number },
  ): void => {
    pendingLocalNodeParentUntilConvexMatchesRef.current.set(nodeId, pin);
    pendingLocalPositionUntilConvexMatchesRef.current.set(nodeId, {
      x: pin.x,
      y: pin.y,
    });
    const setNodes = getSetNodes?.();
    setNodes?.((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              parentId: pin.parentId,
              position: { x: pin.x, y: pin.y },
            }
          : node,
      ),
    );
  };

  const flushPendingResizeForClientRequest = async (
    clientRequestId: string,
    realId: Id<"nodes">,
  ): Promise<void> => {
    const pendingResize = pendingResizeAfterCreateRef.current.get(clientRequestId);
    if (!pendingResize) return;
    pendingResizeAfterCreateRef.current.delete(clientRequestId);
    pendingLocalNodeSizeUntilConvexMatchesRef.current.delete(
      `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}`,
    );
    pinNodeSizeLocally(realId as string, pendingResize);
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
    pinNodeDataLocally(realId as string, pendingData);
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
    logCanvasDebug(
      "queue-node-resize",
      {
        nodeId: rawNodeId,
        width: args.width,
        height: args.height,
        isOptimistic: isOptimisticNodeId(rawNodeId),
        isSyncOnline: getIsSyncOnline(),
      },
      { trace: true },
    );
    pinNodeSizeLocally(rawNodeId, {
      width: args.width,
      height: args.height,
    });
    if (!isOptimisticNodeId(rawNodeId) || !getIsSyncOnline()) {
      await getEnqueueSyncMutation()("resizeNode", args);
      return;
    }

    const clientRequestId = clientRequestIdFromOptimisticNodeId(rawNodeId);
    const resolvedRealId = clientRequestId
      ? resolvedRealIdByClientRequestRef.current.get(clientRequestId)
      : undefined;

    if (resolvedRealId) {
      pendingLocalNodeSizeUntilConvexMatchesRef.current.delete(rawNodeId);
      pinNodeSizeLocally(resolvedRealId as string, {
        width: args.width,
        height: args.height,
      });
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
    pinNodeDataLocally(rawNodeId, args.data);
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

  const queueNodeParentUpdate = async (args: {
    nodeId: Id<"nodes">;
    parentId?: Id<"nodes">;
    positionX: number;
    positionY: number;
  }): Promise<void> => {
    const rawNodeId = args.nodeId as string;
    pinNodeParentLocally(rawNodeId, {
      parentId: args.parentId as string | undefined,
      x: args.positionX,
      y: args.positionY,
    });
    await getEnqueueSyncMutation()("setNodeParent", args);
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
        pendingLocalNodeSizeUntilConvexMatchesRef.current.delete(realId as string);
        pendingLocalNodeDataUntilConvexMatchesRef.current.delete(realId as string);
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
    pendingLocalNodeDataUntilConvexMatchesRef,
    pendingLocalNodeSizeUntilConvexMatchesRef,
    pendingLocalNodeParentUntilConvexMatchesRef,
    preferLocalPositionNodeIdsRef,
    flushPendingResizeForClientRequest,
    flushPendingDataForClientRequest,
    queueNodeResize,
    queueNodeDataUpdate,
    queueNodeParentUpdate,
    syncPendingMoveForClientRequest,
  };
}
