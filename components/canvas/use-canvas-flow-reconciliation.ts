/**
 * Onboarding note:
 * Reconciles server graph updates with local React Flow state without clobbering active optimistic edits.
 */

import { useLayoutEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { logCanvasDebug, shouldLogCanvasNodeDebug } from "./canvas-debug";
import {
  buildIncomingCanvasFlowNodes,
  reconcileCanvasFlowEdges,
  reconcileCanvasFlowNodes,
} from "./canvas-flow-reconciliation-helpers";

type PositionPin = { x: number; y: number };

type CanvasFlowReconciliationRefs = {
  nodesRef: MutableRefObject<RFNode[]>;
  edgesRef: MutableRefObject<RFEdge[]>;
  deletingNodeIds: MutableRefObject<Set<string>>;
  convexNodeIdsSnapshotForEdgeCarryRef: MutableRefObject<Set<string>>;
  resolvedRealIdByClientRequestRef: MutableRefObject<Map<string, Id<"nodes">>>;
  pendingConnectionCreatesRef: MutableRefObject<Set<string>>;
  pendingLocalPositionUntilConvexMatchesRef: MutableRefObject<
    Map<string, PositionPin>
  >;
  pendingLocalNodeDataUntilConvexMatchesRef: MutableRefObject<Map<string, unknown>>;
  pendingLocalNodeSizeUntilConvexMatchesRef: MutableRefObject<
    Map<string, { width: number; height: number }>
  >;
  pendingLocalNodeParentUntilConvexMatchesRef: MutableRefObject<
    Map<string, { parentId?: string; x: number; y: number }>
  >;
  preferLocalPositionNodeIdsRef: MutableRefObject<Set<string>>;
  isDragging: MutableRefObject<boolean>;
  isResizing: MutableRefObject<boolean>;
};

export function useCanvasFlowReconciliation(args: {
  convexNodes: Doc<"nodes">[] | undefined;
  convexEdges: Doc<"edges">[] | undefined;
  storageUrlsById: Record<string, string | undefined> | undefined;
  themeMode: "light" | "dark";
  pendingRemovedEdgeIds: ReadonlySet<string>;
  pendingRemovedNodeIds: ReadonlySet<string>;
  pendingMovePins: ReadonlyMap<string, PositionPin>;
  pendingNodeSizePins: ReadonlyMap<string, { width: number; height: number }>;
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  setEdges: Dispatch<SetStateAction<RFEdge[]>>;
  refs: CanvasFlowReconciliationRefs;
}) {
  const {
    convexEdges,
    convexNodes,
    storageUrlsById,
    themeMode,
    pendingRemovedEdgeIds,
    pendingRemovedNodeIds,
    pendingMovePins,
    pendingNodeSizePins,
    setNodes,
    setEdges,
  } = args;
  const {
    nodesRef,
    edgesRef,
    deletingNodeIds,
    convexNodeIdsSnapshotForEdgeCarryRef,
    resolvedRealIdByClientRequestRef,
    pendingConnectionCreatesRef,
    pendingLocalPositionUntilConvexMatchesRef,
    pendingLocalNodeDataUntilConvexMatchesRef,
    pendingLocalNodeSizeUntilConvexMatchesRef,
    pendingLocalNodeParentUntilConvexMatchesRef,
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
        pendingRemovedEdgeIds,
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
    convexEdges,
    convexNodes,
    pendingRemovedEdgeIds,
    setEdges,
    themeMode,
    convexNodeIdsSnapshotForEdgeCarryRef,
    edgesRef,
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
        edges: edgesRef.current,
      });
      const pendingDeleteIds = new Set([
        ...deletingNodeIds.current,
        ...pendingRemovedNodeIds,
      ]);
      const mergedSizePins = new Map([
        ...pendingNodeSizePins,
        ...pendingLocalNodeSizeUntilConvexMatchesRef.current,
      ]);

      const reconciliation = reconcileCanvasFlowNodes({
        previousNodes,
        incomingNodes,
        convexNodes,
        deletingNodeIds: pendingDeleteIds,
        resolvedRealIdByClientRequest: resolvedRealIdByClientRequestRef.current,
        pendingConnectionCreateIds: pendingConnectionCreatesRef.current,
        preferLocalPositionNodeIds: preferLocalPositionNodeIdsRef.current,
        pendingLocalPositionPins: pendingLocalPositionUntilConvexMatchesRef.current,
        pendingLocalNodeDataPins:
          pendingLocalNodeDataUntilConvexMatchesRef.current,
        pendingLocalNodeSizePins: mergedSizePins,
        pendingLocalNodeParentPins:
          pendingLocalNodeParentUntilConvexMatchesRef.current,
        pendingMovePins,
      });

      const previousById = new Map(previousNodes.map((node) => [node.id, node]));
      const incomingById = new Map(incomingNodes.map((node) => [node.id, node]));
      for (const node of reconciliation.nodes) {
        const nodeType = node.type ?? null;
        if (!shouldLogCanvasNodeDebug(nodeType)) continue;

        const previous = previousById.get(node.id);
        const incoming = incomingById.get(node.id);
        const pin = mergedSizePins.get(node.id);
        const sizeChanged =
          previous?.style?.width !== node.style?.width ||
          previous?.style?.height !== node.style?.height;
        const convexDiffers =
          incoming?.style?.width !== node.style?.width ||
          incoming?.style?.height !== node.style?.height;

        if (!pin && !sizeChanged && !convexDiffers) continue;

        logCanvasDebug(
          "reconcile-node-size",
          {
            nodeId: node.id,
            nodeType,
            previousStyle: previous?.style ?? null,
            incomingStyle: incoming?.style ?? null,
            outputStyle: node.style ?? null,
            pendingSizePin: pin ?? null,
            pendingDelete: pendingDeleteIds.has(node.id),
          },
          { nodeType },
        );
      }

      if (pendingDeleteIds.size > 0) {
        logCanvasDebug("reconcile-pending-deletes", {
          nodeIds: Array.from(pendingDeleteIds),
          incomingNodeIds: incomingNodes.map((node) => node.id),
          outputNodeIds: reconciliation.nodes.map((node) => node.id),
        });
      }

      resolvedRealIdByClientRequestRef.current =
        reconciliation.inferredRealIdByClientRequest;
      pendingLocalPositionUntilConvexMatchesRef.current =
        reconciliation.nextPendingLocalPositionPins;
      pendingLocalNodeDataUntilConvexMatchesRef.current =
        reconciliation.nextPendingLocalNodeDataPins;
      pendingLocalNodeSizeUntilConvexMatchesRef.current =
        reconciliation.nextPendingLocalNodeSizePins;
      pendingLocalNodeParentUntilConvexMatchesRef.current =
        reconciliation.nextPendingLocalNodeParentPins;
      for (const nodeId of reconciliation.clearedPreferLocalPositionNodeIds) {
        preferLocalPositionNodeIdsRef.current.delete(nodeId);
      }

      return reconciliation.nodes;
    });
  }, [
    convexNodes,
    edgesRef,
    pendingMovePins,
    pendingNodeSizePins,
    pendingRemovedNodeIds,
    setNodes,
    storageUrlsById,
    deletingNodeIds,
    isDragging,
    isResizing,
    pendingConnectionCreatesRef,
    pendingLocalPositionUntilConvexMatchesRef,
    pendingLocalNodeDataUntilConvexMatchesRef,
    pendingLocalNodeSizeUntilConvexMatchesRef,
    pendingLocalNodeParentUntilConvexMatchesRef,
    preferLocalPositionNodeIdsRef,
    resolvedRealIdByClientRequestRef,
  ]);
}
