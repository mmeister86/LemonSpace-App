/**
 * Onboarding note:
 * Owns connection creation and validation from the Canvas UI, including reconnect semantics and policy messages.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Connection, Edge as RFEdge, Node as RFNode, OnConnectEnd, OnConnectStart } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import type { CanvasNodeType } from "@/lib/canvas-node-types";

import {
  getConnectEndClientPoint,
  isOptimisticEdgeId,
  logCanvasConnectionDebug,
} from "./canvas-helpers";
import {
  validateCanvasConnection,
} from "./canvas-connection-validation";
import { useCanvasConnectionMagnetism } from "./canvas-connection-magnetism-context";
import { useCanvasReconnectHandlers } from "./canvas-reconnect";
import type { ConnectionDropMenuState } from "./canvas-connection-drop-menu";
import { resolveAdjustmentAutoSplit } from "./canvas-connection-auto-split";
import { resolveConnectionDropTarget } from "./canvas-connection-drop-target";
import {
  buildConnectionDropMenuNodeAction,
  settleConnectionDropMenuNodeAction,
} from "./canvas-connection-drop-menu-actions";

type UseCanvasConnectionsParams = {
  canvasId: Id<"canvases">;
  nodes: RFNode[];
  edges: RFEdge[];
  nodesRef: MutableRefObject<RFNode[]>;
  edgesRef: MutableRefObject<RFEdge[]>;
  edgeReconnectSuccessful: MutableRefObject<boolean>;
  isReconnectDragActiveRef: MutableRefObject<boolean>;
  pendingConnectionCreatesRef: MutableRefObject<Set<string>>;
  resolvedRealIdByClientRequestRef: MutableRefObject<Map<string, Id<"nodes">>>;
  setEdges: Dispatch<SetStateAction<RFEdge[]>>;
  setEdgeSyncNonce: Dispatch<SetStateAction<number>>;
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
  syncPendingMoveForClientRequest: (
    clientRequestId: string,
    realId?: Id<"nodes">,
  ) => Promise<unknown>;
  runCreateEdgeMutation: (args: {
    canvasId: Id<"canvases">;
    sourceNodeId: Id<"nodes">;
    targetNodeId: Id<"nodes">;
    sourceHandle?: string;
    targetHandle?: string;
    edgeIdToIgnore?: Id<"edges">;
  }) => Promise<unknown>;
  runSplitEdgeAtExistingNodeMutation: (args: {
    canvasId: Id<"canvases">;
    splitEdgeId: Id<"edges">;
    middleNodeId: Id<"nodes">;
    splitSourceHandle?: string;
    splitTargetHandle?: string;
    newNodeSourceHandle?: string;
    newNodeTargetHandle?: string;
  }) => Promise<unknown>;
  runRemoveEdgeMutation: (args: { edgeId: Id<"edges"> }) => Promise<unknown>;
  runSwapMixerInputsMutation: (args: {
    canvasId: Id<"canvases">;
    edgeId: Id<"edges">;
    otherEdgeId: Id<"edges">;
  }) => Promise<unknown>;
  runCreateNodeWithEdgeFromSourceOnlineOnly: (args: {
    canvasId: Id<"canvases">;
    type: CanvasNodeType;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: Record<string, unknown>;
    clientRequestId?: string;
    sourceNodeId: string;
    parentId?: Id<"nodes">;
    zIndex?: number;
    sourceHandle?: string;
    targetHandle?: string;
  }) => Promise<Id<"nodes"> | string>;
  runCreateNodeWithEdgeToTargetOnlineOnly: (args: {
    canvasId: Id<"canvases">;
    type: CanvasNodeType;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: Record<string, unknown>;
    clientRequestId?: string;
    targetNodeId: string;
    parentId?: Id<"nodes">;
    zIndex?: number;
    sourceHandle?: string;
    targetHandle?: string;
  }) => Promise<Id<"nodes"> | string>;
  showConnectionRejectedToast: (reason: CanvasConnectionValidationReason) => void;
};

export function useCanvasConnections({
  canvasId,
  nodes,
  edges,
  nodesRef,
  edgesRef,
  edgeReconnectSuccessful,
  isReconnectDragActiveRef,
  pendingConnectionCreatesRef,
  resolvedRealIdByClientRequestRef,
  setEdges,
  setEdgeSyncNonce,
  screenToFlowPosition,
  syncPendingMoveForClientRequest,
  runCreateEdgeMutation,
  runSplitEdgeAtExistingNodeMutation,
  runRemoveEdgeMutation,
  runCreateNodeWithEdgeFromSourceOnlineOnly,
  runCreateNodeWithEdgeToTargetOnlineOnly,
  runSwapMixerInputsMutation,
  showConnectionRejectedToast,
}: UseCanvasConnectionsParams) {
  const { activeTarget, setActiveTarget } = useCanvasConnectionMagnetism();
  const [connectionDropMenu, setConnectionDropMenu] =
    useState<ConnectionDropMenuState | null>(null);
  const connectionDropMenuRef = useRef<ConnectionDropMenuState | null>(null);
  const isConnectDragActiveRef = useRef(false);
  const closeConnectionDropMenu = useCallback(() => setConnectionDropMenu(null), []);

  useEffect(() => {
    connectionDropMenuRef.current = connectionDropMenu;
  }, [connectionDropMenu]);

  const onConnectStart = useCallback<OnConnectStart>((_event, params) => {
    setActiveTarget(null);
    isConnectDragActiveRef.current = true;
    logCanvasConnectionDebug("connect:start", {
      nodeId: params.nodeId,
      handleId: params.handleId,
      handleType: params.handleType,
    });
  }, [setActiveTarget]);

  const onConnect = useCallback(
    (connection: Connection) => {
      isConnectDragActiveRef.current = false;
      try {
        const validationError = validateCanvasConnection(connection, nodes, edges);
        if (validationError) {
          logCanvasConnectionDebug("connect:invalid-direct", {
            sourceNodeId: connection.source ?? null,
            targetNodeId: connection.target ?? null,
            sourceHandle: connection.sourceHandle ?? null,
            targetHandle: connection.targetHandle ?? null,
            validationError,
          });
          showConnectionRejectedToast(validationError);
          return;
        }

        if (!connection.source || !connection.target) {
          logCanvasConnectionDebug("connect:missing-endpoint", {
            sourceNodeId: connection.source ?? null,
            targetNodeId: connection.target ?? null,
            sourceHandle: connection.sourceHandle ?? null,
            targetHandle: connection.targetHandle ?? null,
          });
          return;
        }

        logCanvasConnectionDebug("connect:direct", {
          sourceNodeId: connection.source,
          targetNodeId: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
        });

        void runCreateEdgeMutation({
          canvasId,
          sourceNodeId: connection.source as Id<"nodes">,
          targetNodeId: connection.target as Id<"nodes">,
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
        });
      } finally {
        setActiveTarget(null);
      }
    },
    [canvasId, edges, nodes, runCreateEdgeMutation, setActiveTarget, showConnectionRejectedToast],
  );

  const resolveMixerSwapReconnect = useCallback(
    (oldEdge: RFEdge, newConnection: Connection, validationError: string) => {
      if (validationError !== "mixer-handle-incoming-limit") {
        return null;
      }

      if (!newConnection.target || oldEdge.target !== newConnection.target) {
        return null;
      }

      const targetNode = nodes.find((node) => node.id === newConnection.target);
      if (!targetNode || targetNode.type !== "mixer") {
        return null;
      }

      const normalizeMixerHandle = (handle: string | null | undefined): "base" | "overlay" | null => {
        if (handle == null || handle === "" || handle === "null") {
          return "base";
        }
        if (handle === "base" || handle === "overlay") {
          return handle;
        }
        return null;
      };

      const oldHandle = normalizeMixerHandle(oldEdge.targetHandle);
      const requestedHandle = normalizeMixerHandle(newConnection.targetHandle);
      if (!oldHandle || !requestedHandle || oldHandle === requestedHandle) {
        return null;
      }

      const mixerIncomingEdges = edges.filter(
        (edge) =>
          edge.className !== "temp" &&
          !isOptimisticEdgeId(edge.id) &&
          edge.target === newConnection.target,
      );

      if (mixerIncomingEdges.length !== 2) {
        return null;
      }

      const otherEdge = mixerIncomingEdges.find(
        (candidate) => candidate.id !== oldEdge.id,
      );
      if (!otherEdge) {
        return null;
      }

      const otherHandle = normalizeMixerHandle(otherEdge.targetHandle);
      if (!otherHandle || otherHandle !== requestedHandle) {
        return null;
      }

      return {
        edgeId: oldEdge.id as Id<"edges">,
        otherEdgeId: otherEdge.id as Id<"edges">,
        nextEdgeHandle: requestedHandle,
        nextOtherEdgeHandle: oldHandle,
      };
    },
    [edges, nodes],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      if (!isConnectDragActiveRef.current) {
        setActiveTarget(null);
        logCanvasConnectionDebug("connect:end-ignored", {
          reason: "drag-not-active",
          isValid: connectionState.isValid ?? null,
          fromNodeId: connectionState.fromNode?.id ?? null,
          fromHandleId: connectionState.fromHandle?.id ?? null,
          toNodeId: connectionState.toNode?.id ?? null,
          toHandleId: connectionState.toHandle?.id ?? null,
        });
        return;
      }

      isConnectDragActiveRef.current = false;
      try {
        if (isReconnectDragActiveRef.current) {
          logCanvasConnectionDebug("connect:end-ignored", {
            reason: "reconnect-active",
            isValid: connectionState.isValid ?? null,
            fromNodeId: connectionState.fromNode?.id ?? null,
            fromHandleId: connectionState.fromHandle?.id ?? null,
            toNodeId: connectionState.toNode?.id ?? null,
            toHandleId: connectionState.toHandle?.id ?? null,
          });
          return;
        }
        if (connectionState.isValid === true) {
          logCanvasConnectionDebug("connect:end-ignored", {
            reason: "react-flow-valid-connection",
            fromNodeId: connectionState.fromNode?.id ?? null,
            fromHandleId: connectionState.fromHandle?.id ?? null,
            toNodeId: connectionState.toNode?.id ?? null,
            toHandleId: connectionState.toHandle?.id ?? null,
          });
          return;
        }
        const fromNode = connectionState.fromNode;
        const fromHandle = connectionState.fromHandle;
        if (!fromNode || !fromHandle) {
          logCanvasConnectionDebug("connect:end-aborted", {
            reason: "missing-from-node-or-handle",
            fromNodeId: fromNode?.id ?? null,
            fromHandleId: fromHandle?.id ?? null,
            toNodeId: connectionState.toNode?.id ?? null,
            toHandleId: connectionState.toHandle?.id ?? null,
          });
          return;
        }

        const pt = getConnectEndClientPoint(event);
        if (!pt) {
          logCanvasConnectionDebug("connect:end-aborted", {
            reason: "missing-client-point",
            fromNodeId: fromNode.id,
            fromHandleId: fromHandle.id ?? null,
            fromHandleType: fromHandle.type,
          });
          return;
        }

        logCanvasConnectionDebug("connect:end", {
          point: pt,
          fromNodeId: fromNode.id,
          fromHandleId: fromHandle.id ?? null,
          fromHandleType: fromHandle.type,
          toNodeId: connectionState.toNode?.id ?? null,
          toHandleId: connectionState.toHandle?.id ?? null,
        });

        const flow = screenToFlowPosition({ x: pt.x, y: pt.y });
        const droppedConnection = resolveConnectionDropTarget({
          point: pt,
          fromNodeId: fromNode.id,
          fromHandleId: fromHandle.id ?? undefined,
          fromHandleType: fromHandle.type,
          nodes: nodesRef.current,
          edges: edgesRef.current,
          activeMagnetTarget: activeTarget,
        });

        logCanvasConnectionDebug("connect:end-drop-result", {
          point: pt,
          flow,
          fromNodeId: fromNode.id,
          fromHandleId: fromHandle.id ?? null,
          fromHandleType: fromHandle.type,
          droppedConnection,
        });

        if (droppedConnection) {
          const validationError = validateCanvasConnection(
            {
              source: droppedConnection.sourceNodeId,
              target: droppedConnection.targetNodeId,
              sourceHandle: droppedConnection.sourceHandle ?? null,
              targetHandle: droppedConnection.targetHandle ?? null,
            },
            nodesRef.current,
            edgesRef.current,
          );
          if (validationError) {
            const autoSplit = resolveAdjustmentAutoSplit({
              validationError,
              droppedConnection,
              fromNodeId: fromNode.id,
              fromHandleType: fromHandle.type,
              nodes: nodesRef.current,
              edges: edgesRef.current,
            });

            logCanvasConnectionDebug("connect:end-auto-split-eval", {
              point: pt,
              flow,
              droppedConnection,
              validationError,
              shouldAttemptAutoSplit: autoSplit !== null,
              splitValidationError: autoSplit?.splitValidationError ?? null,
              fromNodeId: fromNode.id,
              fromNodeType: autoSplit?.middleNode.type ?? null,
              incomingEdgeId: autoSplit?.splitEdge.id ?? null,
              incomingEdgeSourceNodeId: autoSplit?.splitEdge.source ?? null,
              incomingEdgeTargetNodeId: autoSplit?.splitEdge.target ?? null,
            });

            if (autoSplit && !autoSplit.splitValidationError) {
              logCanvasConnectionDebug("connect:end-auto-split", {
                point: pt,
                flow,
                droppedConnection,
                splitEdgeId: autoSplit.splitEdge.id,
                middleNodeId: autoSplit.middleNode.id,
              });
              void runSplitEdgeAtExistingNodeMutation({
                canvasId,
                splitEdgeId: autoSplit.splitEdge.id as Id<"edges">,
                middleNodeId: autoSplit.middleNode.id as Id<"nodes">,
                splitSourceHandle: autoSplit.splitSourceHandle,
                splitTargetHandle: autoSplit.splitTargetHandle,
                newNodeSourceHandle: autoSplit.newNodeSourceHandle,
                newNodeTargetHandle: autoSplit.newNodeTargetHandle,
              });
              return;
            }

            logCanvasConnectionDebug("connect:end-drop-rejected", {
              point: pt,
              flow,
              droppedConnection,
              validationError,
              attemptedAutoSplit:
                validationError === "adjustment-incoming-limit" &&
                droppedConnection.sourceNodeId === fromNode.id &&
                fromHandle.type === "source",
              splitValidationError: autoSplit?.splitValidationError ?? null,
            });
            showConnectionRejectedToast(validationError);
            return;
          }

          logCanvasConnectionDebug("connect:end-create-edge", {
            point: pt,
            flow,
            droppedConnection,
          });

          void runCreateEdgeMutation({
            canvasId,
            sourceNodeId: droppedConnection.sourceNodeId as Id<"nodes">,
            targetNodeId: droppedConnection.targetNodeId as Id<"nodes">,
            sourceHandle: droppedConnection.sourceHandle,
            targetHandle: droppedConnection.targetHandle,
          });
          return;
        }

        logCanvasConnectionDebug("connect:end-open-menu", {
          point: pt,
          flow,
          fromNodeId: fromNode.id,
          fromHandleId: fromHandle.id ?? null,
          fromHandleType: fromHandle.type,
        });

        setConnectionDropMenu({
          screenX: pt.x,
          screenY: pt.y,
          flowX: flow.x,
          flowY: flow.y,
          fromNodeId: fromNode.id as Id<"nodes">,
          fromHandleId: fromHandle.id ?? undefined,
          fromHandleType: fromHandle.type,
        });
      } finally {
        setActiveTarget(null);
      }
    },
    [
      canvasId,
      edgesRef,
      isReconnectDragActiveRef,
      nodesRef,
      runCreateEdgeMutation,
      runSplitEdgeAtExistingNodeMutation,
      screenToFlowPosition,
      setActiveTarget,
      showConnectionRejectedToast,
      activeTarget,
    ],
  );

  const handleConnectionDropPick = useCallback(
    (template: CanvasNodeTemplate) => {
      const ctx = connectionDropMenuRef.current;
      if (!ctx) return;

      const fromNode = nodesRef.current.find((node) => node.id === ctx.fromNodeId);
      if (!fromNode) {
        showConnectionRejectedToast("unknown-node");
        return;
      }

      const clientRequestId = crypto.randomUUID();
      const action = buildConnectionDropMenuNodeAction({
        canvasId,
        ctx,
        fromNode,
        template,
        edges: edgesRef.current,
        clientRequestId,
      });

      if ("validationError" in action) {
        showConnectionRejectedToast(action.validationError);
        return;
      }

      pendingConnectionCreatesRef.current.add(clientRequestId);

      const settle = (realId: Id<"nodes"> | string) => {
        void settleConnectionDropMenuNodeAction({
          realId,
          clientRequestId,
          resolvedRealIdByClientRequest: resolvedRealIdByClientRequestRef.current,
          syncPendingMoveForClientRequest,
          setEdgeSyncNonce,
        }).catch((error: unknown) => {
          console.error("[Canvas] settle syncPendingMove failed", error);
        });
      };

      if (action.direction === "from-source") {
        void runCreateNodeWithEdgeFromSourceOnlineOnly({
          ...action.mutationArgs,
        })
          .then(settle)
          .catch((error) => {
            pendingConnectionCreatesRef.current.delete(clientRequestId);
            console.error("[Canvas] createNodeWithEdgeFromSource failed", error);
          });
      } else {
        void runCreateNodeWithEdgeToTargetOnlineOnly({
          ...action.mutationArgs,
        })
          .then(settle)
          .catch((error) => {
            pendingConnectionCreatesRef.current.delete(clientRequestId);
            console.error("[Canvas] createNodeWithEdgeToTarget failed", error);
          });
      }
    },
    [
      canvasId,
      edgesRef,
      nodesRef,
      pendingConnectionCreatesRef,
      resolvedRealIdByClientRequestRef,
      runCreateNodeWithEdgeFromSourceOnlineOnly,
      runCreateNodeWithEdgeToTargetOnlineOnly,
      setEdgeSyncNonce,
      showConnectionRejectedToast,
      syncPendingMoveForClientRequest,
    ],
  );

  const { onReconnectStart, onReconnect, onReconnectEnd } = useCanvasReconnectHandlers({
    canvasId,
    edgeReconnectSuccessful,
    isReconnectDragActiveRef,
    setEdges,
    runCreateEdgeMutation,
    runRemoveEdgeMutation,
    runSwapMixerInputsMutation,
    validateConnection: (oldEdge, nextConnection) =>
      validateCanvasConnection(nextConnection, nodes, edges, oldEdge.id),
    resolveMixerSwapReconnect,
    onInvalidConnection: (reason) => {
      showConnectionRejectedToast(reason as CanvasConnectionValidationReason);
    },
    clearActiveMagnetTarget: () => {
      setActiveTarget(null);
    },
  });

    return {
      connectionDropMenu,
      closeConnectionDropMenu,
      handleConnectionDropPick,
      onConnect,
      onConnectStart,
      onConnectEnd,
      onReconnectStart,
      onReconnect,
      onReconnectEnd,
    };
}
