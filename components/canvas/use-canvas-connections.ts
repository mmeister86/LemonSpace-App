import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Connection, Edge as RFEdge, Node as RFNode, OnConnectEnd } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import {
  NODE_DEFAULTS,
  NODE_HANDLE_MAP,
} from "@/lib/canvas-utils";
import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import type { CanvasNodeType } from "@/lib/canvas-node-types";

import { getConnectEndClientPoint, isOptimisticNodeId } from "./canvas-helpers";
import { resolveDroppedConnectionTarget } from "./canvas-helpers";
import {
  validateCanvasConnection,
  validateCanvasConnectionByType,
} from "./canvas-connection-validation";
import { useCanvasReconnectHandlers } from "./canvas-reconnect";
import type { ConnectionDropMenuState } from "./canvas-connection-drop-menu";

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
  }) => Promise<unknown>;
  runRemoveEdgeMutation: (args: { edgeId: Id<"edges"> }) => Promise<unknown>;
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
  runRemoveEdgeMutation,
  runCreateNodeWithEdgeFromSourceOnlineOnly,
  runCreateNodeWithEdgeToTargetOnlineOnly,
  showConnectionRejectedToast,
}: UseCanvasConnectionsParams) {
  const [connectionDropMenu, setConnectionDropMenu] =
    useState<ConnectionDropMenuState | null>(null);
  const connectionDropMenuRef = useRef<ConnectionDropMenuState | null>(null);
  const closeConnectionDropMenu = useCallback(() => setConnectionDropMenu(null), []);

  useEffect(() => {
    connectionDropMenuRef.current = connectionDropMenu;
  }, [connectionDropMenu]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const validationError = validateCanvasConnection(connection, nodes, edges);
      if (validationError) {
        showConnectionRejectedToast(validationError);
        return;
      }

      if (!connection.source || !connection.target) return;

      void runCreateEdgeMutation({
        canvasId,
        sourceNodeId: connection.source as Id<"nodes">,
        targetNodeId: connection.target as Id<"nodes">,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      });
    },
    [canvasId, edges, nodes, runCreateEdgeMutation, showConnectionRejectedToast],
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
      const droppedConnection = resolveDroppedConnectionTarget({
        point: pt,
        fromNodeId: fromNode.id,
        fromHandleId: fromHandle.id ?? undefined,
        fromHandleType: fromHandle.type,
        nodes: nodesRef.current,
        edges: edgesRef.current,
      });

      if (droppedConnection) {
        const validationError = validateCanvasConnection(
          {
            source: droppedConnection.sourceNodeId,
            target: droppedConnection.targetNodeId,
            sourceHandle: droppedConnection.sourceHandle,
            targetHandle: droppedConnection.targetHandle,
          },
          nodesRef.current,
          edgesRef.current,
        );
        if (validationError) {
          showConnectionRejectedToast(validationError);
          return;
        }

        void runCreateEdgeMutation({
          canvasId,
          sourceNodeId: droppedConnection.sourceNodeId as Id<"nodes">,
          targetNodeId: droppedConnection.targetNodeId as Id<"nodes">,
          sourceHandle: droppedConnection.sourceHandle,
          targetHandle: droppedConnection.targetHandle,
        });
        return;
      }

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
    [
      canvasId,
      edgesRef,
      isReconnectDragActiveRef,
      nodesRef,
      runCreateEdgeMutation,
      screenToFlowPosition,
      showConnectionRejectedToast,
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
        const validationError = validateCanvasConnectionByType({
          sourceType: fromNode.type ?? "",
          targetType: template.type,
          targetNodeId: `__pending_${template.type}_${Date.now()}`,
          edges: edgesRef.current,
        });
        if (validationError) {
          showConnectionRejectedToast(validationError);
          return;
        }

        void runCreateNodeWithEdgeFromSourceOnlineOnly({
          ...base,
          sourceNodeId: ctx.fromNodeId,
          sourceHandle: ctx.fromHandleId,
          targetHandle: handles?.target ?? undefined,
        })
          .then((realId) => {
            if (isOptimisticNodeId(realId as string)) {
              return;
            }
            const settledRealId = realId as Id<"nodes">;
            resolvedRealIdByClientRequestRef.current.set(clientRequestId, settledRealId);
            settle(settledRealId);
            setEdgeSyncNonce((n) => n + 1);
          })
          .catch((error) => {
            pendingConnectionCreatesRef.current.delete(clientRequestId);
            console.error("[Canvas] createNodeWithEdgeFromSource failed", error);
          });
      } else {
        const validationError = validateCanvasConnectionByType({
          sourceType: template.type,
          targetType: fromNode.type ?? "",
          targetNodeId: fromNode.id,
          edges: edgesRef.current,
        });
        if (validationError) {
          showConnectionRejectedToast(validationError);
          return;
        }

        void runCreateNodeWithEdgeToTargetOnlineOnly({
          ...base,
          targetNodeId: ctx.fromNodeId,
          sourceHandle: handles?.source ?? undefined,
          targetHandle: ctx.fromHandleId,
        })
          .then((realId) => {
            if (isOptimisticNodeId(realId as string)) {
              return;
            }
            const settledRealId = realId as Id<"nodes">;
            resolvedRealIdByClientRequestRef.current.set(clientRequestId, settledRealId);
            settle(settledRealId);
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
    validateConnection: (oldEdge, nextConnection) =>
      validateCanvasConnection(nextConnection, nodes, edges, oldEdge.id),
    onInvalidConnection: (reason) => {
      showConnectionRejectedToast(reason as CanvasConnectionValidationReason);
    },
  });

  return {
    connectionDropMenu,
    closeConnectionDropMenu,
    handleConnectionDropPick,
    onConnect,
    onConnectEnd,
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
  };
}
