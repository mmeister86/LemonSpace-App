import { useLayoutEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Doc, Id } from "@/convex/_generated/dataModel";

import {
  getPendingMovePinsFromLocalOps,
  getPendingRemovedEdgeIdsFromLocalOps,
} from "./canvas-helpers";
import {
  buildIncomingCanvasFlowNodes,
  reconcileCanvasFlowEdges,
  reconcileCanvasFlowNodes,
} from "./canvas-flow-reconciliation-helpers";

type PositionPin = { x: number; y: number };

type CanvasFlowReconciliationRefs = {
  nodesRef: MutableRefObject<RFNode[]>;
  deletingNodeIds: MutableRefObject<Set<string>>;
  convexNodeIdsSnapshotForEdgeCarryRef: MutableRefObject<Set<string>>;
  resolvedRealIdByClientRequestRef: MutableRefObject<Map<string, Id<"nodes">>>;
  pendingConnectionCreatesRef: MutableRefObject<Set<string>>;
  pendingLocalPositionUntilConvexMatchesRef: MutableRefObject<
    Map<string, PositionPin>
  >;
  preferLocalPositionNodeIdsRef: MutableRefObject<Set<string>>;
  isDragging: MutableRefObject<boolean>;
  isResizing: MutableRefObject<boolean>;
};

export function useCanvasFlowReconciliation(args: {
  canvasId: Id<"canvases">;
  convexNodes: Doc<"nodes">[] | undefined;
  convexEdges: Doc<"edges">[] | undefined;
  storageUrlsById: Record<string, string | undefined> | undefined;
  themeMode: "light" | "dark";
  edges: RFEdge[];
  edgeSyncNonce: number;
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  setEdges: Dispatch<SetStateAction<RFEdge[]>>;
  refs: CanvasFlowReconciliationRefs;
}) {
  const {
    canvasId,
    convexEdges,
    convexNodes,
    storageUrlsById,
    themeMode,
    edges,
    edgeSyncNonce,
    setNodes,
    setEdges,
  } = args;
  const {
    nodesRef,
    deletingNodeIds,
    convexNodeIdsSnapshotForEdgeCarryRef,
    resolvedRealIdByClientRequestRef,
    pendingConnectionCreatesRef,
    pendingLocalPositionUntilConvexMatchesRef,
    preferLocalPositionNodeIdsRef,
    isDragging,
    isResizing,
  } = args.refs;

  useLayoutEffect(() => {
    if (!convexEdges) return;

    setEdges((previousEdges) => {
      const reconciliation = reconcileCanvasFlowEdges({
        previousEdges,
        convexEdges,
        convexNodes,
        previousConvexNodeIdsSnapshot: convexNodeIdsSnapshotForEdgeCarryRef.current,
        pendingRemovedEdgeIds: getPendingRemovedEdgeIdsFromLocalOps(canvasId as string),
        pendingConnectionCreateIds: pendingConnectionCreatesRef.current,
        resolvedRealIdByClientRequest: resolvedRealIdByClientRequestRef.current,
        localNodeIds: new Set(nodesRef.current.map((node) => node.id)),
        isAnyNodeDragging:
          isDragging.current ||
          nodesRef.current.some((node) =>
            Boolean((node as { dragging?: boolean }).dragging),
          ),
        colorMode: themeMode,
      });

      resolvedRealIdByClientRequestRef.current =
        reconciliation.inferredRealIdByClientRequest;
      convexNodeIdsSnapshotForEdgeCarryRef.current =
        reconciliation.nextConvexNodeIdsSnapshot;
      for (const clientRequestId of reconciliation.settledPendingConnectionCreateIds) {
        pendingConnectionCreatesRef.current.delete(clientRequestId);
      }

      return reconciliation.edges;
    });
  }, [
    canvasId,
    convexEdges,
    convexNodes,
    edgeSyncNonce,
    setEdges,
    themeMode,
    convexNodeIdsSnapshotForEdgeCarryRef,
    isDragging,
    nodesRef,
    pendingConnectionCreatesRef,
    resolvedRealIdByClientRequestRef,
  ]);

  useLayoutEffect(() => {
    if (!convexNodes || isResizing.current) return;

    setNodes((previousNodes) => {
      const anyRfNodeDragging = previousNodes.some((node) =>
        Boolean((node as { dragging?: boolean }).dragging),
      );
      if (isDragging.current || anyRfNodeDragging) {
        return previousNodes;
      }

      const incomingNodes = buildIncomingCanvasFlowNodes({
        convexNodes,
        storageUrlsById,
        previousNodes,
        edges,
      });

      const reconciliation = reconcileCanvasFlowNodes({
        previousNodes,
        incomingNodes,
        convexNodes,
        deletingNodeIds: deletingNodeIds.current,
        resolvedRealIdByClientRequest: resolvedRealIdByClientRequestRef.current,
        pendingConnectionCreateIds: pendingConnectionCreatesRef.current,
        preferLocalPositionNodeIds: preferLocalPositionNodeIdsRef.current,
        pendingLocalPositionPins: pendingLocalPositionUntilConvexMatchesRef.current,
        pendingMovePins: getPendingMovePinsFromLocalOps(canvasId as string),
      });

      resolvedRealIdByClientRequestRef.current =
        reconciliation.inferredRealIdByClientRequest;
      pendingLocalPositionUntilConvexMatchesRef.current =
        reconciliation.nextPendingLocalPositionPins;
      for (const nodeId of reconciliation.clearedPreferLocalPositionNodeIds) {
        preferLocalPositionNodeIdsRef.current.delete(nodeId);
      }

      return reconciliation.nodes;
    });
  }, [
    canvasId,
    convexNodes,
    edges,
    setNodes,
    storageUrlsById,
    deletingNodeIds,
    isDragging,
    isResizing,
    pendingConnectionCreatesRef,
    pendingLocalPositionUntilConvexMatchesRef,
    preferLocalPositionNodeIdsRef,
    resolvedRealIdByClientRequestRef,
  ]);
}
