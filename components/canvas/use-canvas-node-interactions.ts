import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  applyNodeChanges,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeChange,
} from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";
import {
  clientRequestIdFromOptimisticNodeId,
  EDGE_INTERSECTION_HIGHLIGHT_STYLE,
  getIntersectedEdgeId,
  getNodeCenterClientPosition,
  isOptimisticNodeId,
} from "./canvas-helpers";
import { validateCanvasEdgeSplit } from "./canvas-connection-validation";
import { adjustNodeDimensionChanges } from "./canvas-node-change-helpers";
import {
  buildPendingEdgeSplit,
  buildSplitEdgeAtExistingNodeArgs,
  edgeTouchesNode,
  getEffectiveSplitMiddleNode,
  getSplitCandidateEdge,
  getSplitHandlesForNode,
  type PendingEdgeSplit,
} from "./canvas-edge-intersection-split";
import {
  clearGroupDropTargetData,
  findOverlappingGroupTarget,
  markGroupDropTarget,
} from "./canvas-node-group-drop-target";
import { computeParentChangesForDraggedNodes } from "./canvas-node-parent-changes";
import {
  computeResizeChangesToPersist,
  updateResizeInteractionState,
} from "./canvas-node-resize-persistence";

type PositionPin = { x: number; y: number };
type MovePin = { positionX: number; positionY: number };

type RunResizeNodeMutation = (args: {
  nodeId: Id<"nodes">;
  width: number;
  height: number;
}) => Promise<void>;

type RunMoveNodeMutation = (args: {
  nodeId: Id<"nodes">;
  positionX: number;
  positionY: number;
}) => Promise<void>;

type RunBatchMoveNodesMutation = (args: {
  moves: {
    nodeId: Id<"nodes">;
    positionX: number;
    positionY: number;
  }[];
}) => Promise<void>;

type RunSetNodeParentMutation = (args: {
  nodeId: Id<"nodes">;
  parentId?: Id<"nodes">;
  positionX: number;
  positionY: number;
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
}) => Promise<void>;

type CanvasNodeInteractionRefs = {
  isDragging: MutableRefObject<boolean>;
  isResizing: MutableRefObject<boolean>;
  pendingLocalPositionUntilConvexMatchesRef: MutableRefObject<Map<string, PositionPin>>;
  preferLocalPositionNodeIdsRef: MutableRefObject<Set<string>>;
  pendingMoveAfterCreateRef: MutableRefObject<Map<string, MovePin>>;
  resolvedRealIdByClientRequestRef: MutableRefObject<Map<string, Id<"nodes">>>;
  pendingEdgeSplitByClientRequestRef: MutableRefObject<
    Map<string, PendingEdgeSplit>
  >;
};

export function useCanvasNodeInteractions(args: {
  canvasId: Id<"canvases">;
  nodes: RFNode[];
  edges: RFEdge[];
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  setEdges: Dispatch<SetStateAction<RFEdge[]>>;
  refs: CanvasNodeInteractionRefs;
  runResizeNodeMutation: RunResizeNodeMutation;
  runMoveNodeMutation: RunMoveNodeMutation;
  runBatchMoveNodesMutation: RunBatchMoveNodesMutation;
  runSetNodeParentMutation: RunSetNodeParentMutation;
  runSplitEdgeAtExistingNodeMutation: RunSplitEdgeAtExistingNodeMutation;
  onInvalidConnection: (reason: CanvasConnectionValidationReason) => void;
  syncPendingMoveForClientRequest: (
    clientRequestId: string,
    realId?: Id<"nodes">,
  ) => Promise<void>;
  onHistoryCapture?: () => void;
}) {
  const {
    canvasId,
    nodes,
    edges,
    setNodes,
    setEdges,
    runResizeNodeMutation,
    runMoveNodeMutation,
    runBatchMoveNodesMutation,
    runSetNodeParentMutation,
    runSplitEdgeAtExistingNodeMutation,
    onInvalidConnection,
    syncPendingMoveForClientRequest,
    onHistoryCapture,
  } = args;
  const {
    isDragging,
    isResizing,
    pendingLocalPositionUntilConvexMatchesRef,
    preferLocalPositionNodeIdsRef,
    pendingMoveAfterCreateRef,
    resolvedRealIdByClientRequestRef,
    pendingEdgeSplitByClientRequestRef,
  } = args.refs;

  const overlappedEdgeRef = useRef<string | null>(null);
  const highlightedEdgeRef = useRef<string | null>(null);
  const activeGroupDropTargetRef = useRef<string | null>(null);
  const highlightedEdgeOriginalStyleRef = useRef<RFEdge["style"] | undefined>(
    undefined,
  );
  const resizeHistoryCapturedRef = useRef(false);

  const setHighlightedIntersectionEdge = useCallback(
    (edgeId: string | null) => {
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
    },
    [setEdges],
  );

  const clearHighlightedIntersectionEdge = useCallback(() => {
    overlappedEdgeRef.current = null;
    setHighlightedIntersectionEdge(null);
  }, [setHighlightedIntersectionEdge]);

  const setActiveGroupDropTarget = useCallback(
    (targetId: string | null) => {
      if (activeGroupDropTargetRef.current === targetId) {
        return;
      }
      activeGroupDropTargetRef.current = targetId;
      setNodes((currentNodes) => markGroupDropTarget(currentNodes, targetId));
    },
    [setNodes],
  );

  const clearActiveGroupDropTarget = useCallback(() => {
    activeGroupDropTargetRef.current = null;
    setNodes((currentNodes) => clearGroupDropTargetData(currentNodes));
  }, [setNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      updateResizeInteractionState(
        changes,
        isResizing,
        resizeHistoryCapturedRef,
        onHistoryCapture,
      );

      const removedIds = new Set<string>();
      for (const change of changes) {
        if (change.type === "remove") {
          removedIds.add(change.id);
        }
      }

      setNodes((currentNodes) => {
        for (const change of changes) {
          if (change.type === "position" && "id" in change) {
            pendingLocalPositionUntilConvexMatchesRef.current.delete(change.id);
            preferLocalPositionNodeIdsRef.current.add(change.id);
          }
        }

        const adjustedChanges = adjustNodeDimensionChanges(changes, currentNodes);
        const nextNodes = applyNodeChanges(adjustedChanges, currentNodes);

        for (const resizeChange of computeResizeChangesToPersist(adjustedChanges, removedIds)) {
          void runResizeNodeMutation({
            nodeId: resizeChange.nodeId as Id<"nodes">,
            width: resizeChange.width,
            height: resizeChange.height,
          }).catch((error: unknown) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[Canvas] resizeNode failed", error);
            }
          });
        }

        return nextNodes;
      });
    },
    [
      isResizing,
      pendingLocalPositionUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
      runResizeNodeMutation,
      setNodes,
      onHistoryCapture,
    ],
  );

  const onNodeDragStart = useCallback(
    (_event: ReactMouseEvent, _node: RFNode, draggedNodes: RFNode[]) => {
      onHistoryCapture?.();
      isDragging.current = true;
      clearHighlightedIntersectionEdge();
      clearActiveGroupDropTarget();
      for (const draggedNode of draggedNodes) {
        pendingLocalPositionUntilConvexMatchesRef.current.delete(draggedNode.id);
      }
    },
    [
      clearActiveGroupDropTarget,
      clearHighlightedIntersectionEdge,
      isDragging,
      onHistoryCapture,
      pendingLocalPositionUntilConvexMatchesRef,
    ],
  );

  const onNodeDrag = useCallback(
    (_event: ReactMouseEvent, node: RFNode) => {
      const nodesWithDraggedNode = nodes.map((candidate) =>
        candidate.id === node.id ? { ...candidate, ...node } : candidate,
      );
      const groupTarget = findOverlappingGroupTarget(node, nodesWithDraggedNode);
      const actionableGroupTarget =
        groupTarget && groupTarget.id !== node.parentId ? groupTarget : null;
      setActiveGroupDropTarget(actionableGroupTarget?.id ?? null);
      if (actionableGroupTarget) {
        clearHighlightedIntersectionEdge();
        return;
      }

      const nodeCenter = getNodeCenterClientPosition(node.id);
      if (!nodeCenter) {
        clearHighlightedIntersectionEdge();
        return;
      }

      const intersectedEdgeId = getIntersectedEdgeId(nodeCenter);
      if (!intersectedEdgeId) {
        clearHighlightedIntersectionEdge();
        return;
      }

      const intersectedEdge = getSplitCandidateEdge(intersectedEdgeId, edges);
      if (!intersectedEdge) {
        clearHighlightedIntersectionEdge();
        return;
      }

      const effectiveMiddleNode = getEffectiveSplitMiddleNode(
        node,
        resolvedRealIdByClientRequestRef.current,
      );

      if (edgeTouchesNode(intersectedEdge, effectiveMiddleNode.id)) {
        clearHighlightedIntersectionEdge();
        return;
      }

      if (!getSplitHandlesForNode(node)) {
        clearHighlightedIntersectionEdge();
        return;
      }

      overlappedEdgeRef.current = intersectedEdge.id;
      setHighlightedIntersectionEdge(intersectedEdge.id);
    },
    [
      clearHighlightedIntersectionEdge,
      edges,
      nodes,
      resolvedRealIdByClientRequestRef,
      setHighlightedIntersectionEdge,
      setActiveGroupDropTarget,
    ],
  );

  const onNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: RFNode, draggedNodes: RFNode[]) => {
      const primaryNode = (node as RFNode | undefined) ?? draggedNodes[0];
      const intersectedEdgeId = overlappedEdgeRef.current;

      void (async () => {
        if (!primaryNode) {
          clearHighlightedIntersectionEdge();
          isDragging.current = false;
          return;
        }

        try {
          const effectivePrimaryNode = getEffectiveSplitMiddleNode(
            primaryNode,
            resolvedRealIdByClientRequestRef.current,
          );
          const intersectedEdge = getSplitCandidateEdge(intersectedEdgeId, edges);

          const finalDraggedNodes =
            draggedNodes.length > 0
              ? draggedNodes
              : primaryNode
                ? [primaryNode]
                : [];
          const nodeByDraggedId = new Map(
            finalDraggedNodes.map((draggedNode) => [draggedNode.id, draggedNode]),
          );
          const nodesWithFinalDraggedPositions = nodes.map((candidate) => {
            const draggedNode = nodeByDraggedId.get(candidate.id);
            return draggedNode ? { ...candidate, ...draggedNode } : candidate;
          }).concat(
            finalDraggedNodes.filter(
              (draggedNode) =>
                !nodes.some((candidate) => candidate.id === draggedNode.id),
            ),
          );
          const parentChanges = computeParentChangesForDraggedNodes(
            finalDraggedNodes,
            nodesWithFinalDraggedPositions,
          );
          const parentChangedNodeIds = new Set(
            parentChanges.map((change) => change.nodeId),
          );

          const splitHandles = getSplitHandlesForNode(primaryNode);
          const splitEligible =
            parentChanges.length === 0 &&
            intersectedEdge !== undefined &&
            splitHandles !== null &&
            !edgeTouchesNode(intersectedEdge, effectivePrimaryNode.id);

          const splitValidationError =
            splitEligible && intersectedEdge
                ? validateCanvasEdgeSplit({
                    nodes,
                    edges,
                    splitEdge: intersectedEdge,
                    middleNode: effectivePrimaryNode,
                  })
                : null;

          if (splitValidationError) {
            onInvalidConnection(splitValidationError);
          }

          const canSplit = splitEligible && intersectedEdge && !splitValidationError;

          if (parentChanges.length > 0) {
            setNodes((currentNodes) =>
              currentNodes.map((currentNode) => {
                const parentChange = parentChanges.find(
                  (change) => change.nodeId === currentNode.id,
                );
                if (!parentChange) return currentNode;
                return {
                  ...currentNode,
                  parentId: parentChange.parentId,
                  position: parentChange.position,
                  data:
                    currentNode.type === "group"
                      ? ((currentNode.data ?? {}) as Record<string, unknown>)
                      : currentNode.data,
                };
              }),
            );

            for (const parentChange of parentChanges) {
              pendingLocalPositionUntilConvexMatchesRef.current.set(
                parentChange.nodeId,
                parentChange.position,
              );
              preferLocalPositionNodeIdsRef.current.add(parentChange.nodeId);
              await runSetNodeParentMutation({
                nodeId: parentChange.nodeId as Id<"nodes">,
                parentId: parentChange.parentId as Id<"nodes"> | undefined,
                positionX: parentChange.position.x,
                positionY: parentChange.position.y,
              });
            }
          }

          if (draggedNodes.length > 1) {
            for (const draggedNode of draggedNodes) {
              if (parentChangedNodeIds.has(draggedNode.id)) continue;
              const clientRequestId = clientRequestIdFromOptimisticNodeId(
                draggedNode.id,
              );
              if (clientRequestId) {
                pendingMoveAfterCreateRef.current.set(clientRequestId, {
                  positionX: draggedNode.position.x,
                  positionY: draggedNode.position.y,
                });
                await syncPendingMoveForClientRequest(clientRequestId);
              }
            }

            const realMoves = draggedNodes.filter(
              (draggedNode) =>
                !isOptimisticNodeId(draggedNode.id) &&
                !parentChangedNodeIds.has(draggedNode.id),
            );
            if (realMoves.length > 0) {
              await runBatchMoveNodesMutation({
                moves: realMoves.map((draggedNode) => ({
                  nodeId: draggedNode.id as Id<"nodes">,
                  positionX: draggedNode.position.x,
                  positionY: draggedNode.position.y,
                })),
              });
            }

            if (!canSplit || !intersectedEdge || !splitHandles) {
              return;
            }

            const multiClientRequestId = clientRequestIdFromOptimisticNodeId(
              primaryNode.id,
            );
            let middleId = effectivePrimaryNode.id as Id<"nodes">;
            if (multiClientRequestId) {
              const resolvedId =
                resolvedRealIdByClientRequestRef.current.get(multiClientRequestId);
              if (!resolvedId) {
                pendingEdgeSplitByClientRequestRef.current.set(
                  multiClientRequestId,
                  buildPendingEdgeSplit({
                    intersectedEdge,
                    splitHandles,
                    position: primaryNode.position,
                  }),
                );
                return;
              }
              middleId = resolvedId;
            }

            await runSplitEdgeAtExistingNodeMutation(
              buildSplitEdgeAtExistingNodeArgs({
                canvasId,
                intersectedEdge,
                middleNodeId: middleId,
                splitHandles,
              }),
            );
            return;
          }

          if (!canSplit || !intersectedEdge || !splitHandles) {
            const singleClientRequestId = clientRequestIdFromOptimisticNodeId(
              primaryNode.id,
            );
            if (parentChangedNodeIds.has(primaryNode.id)) {
              return;
            }
            if (singleClientRequestId) {
              pendingMoveAfterCreateRef.current.set(singleClientRequestId, {
                positionX: primaryNode.position.x,
                positionY: primaryNode.position.y,
              });
              await syncPendingMoveForClientRequest(singleClientRequestId);
            } else {
              await runMoveNodeMutation({
                nodeId: primaryNode.id as Id<"nodes">,
                positionX: primaryNode.position.x,
                positionY: primaryNode.position.y,
              });
            }
            return;
          }

          const singleClientRequestId = clientRequestIdFromOptimisticNodeId(
            primaryNode.id,
          );
          if (singleClientRequestId) {
            const resolvedSingle =
              resolvedRealIdByClientRequestRef.current.get(singleClientRequestId);
            if (!resolvedSingle) {
              pendingMoveAfterCreateRef.current.set(singleClientRequestId, {
                positionX: primaryNode.position.x,
                positionY: primaryNode.position.y,
              });
              pendingEdgeSplitByClientRequestRef.current.set(
                singleClientRequestId,
                buildPendingEdgeSplit({
                  intersectedEdge,
                  splitHandles,
                  position: primaryNode.position,
                }),
              );
              await syncPendingMoveForClientRequest(singleClientRequestId);
              return;
            }

            await runSplitEdgeAtExistingNodeMutation(
              buildSplitEdgeAtExistingNodeArgs({
                canvasId,
                intersectedEdge,
                middleNodeId: resolvedSingle,
                splitHandles,
                position: primaryNode.position,
              }),
            );
            pendingMoveAfterCreateRef.current.delete(singleClientRequestId);
            return;
          }

          await runSplitEdgeAtExistingNodeMutation(
            buildSplitEdgeAtExistingNodeArgs({
              canvasId,
              intersectedEdge,
              middleNodeId: primaryNode.id as Id<"nodes">,
              splitHandles,
              position: primaryNode.position,
            }),
          );
        } catch (error) {
          console.error("[Canvas edge intersection split failed]", {
            canvasId,
            nodeId: primaryNode?.id ?? null,
            nodeType: primaryNode?.type ?? null,
            intersectedEdgeId,
            error: String(error),
          });
        } finally {
          clearHighlightedIntersectionEdge();
          clearActiveGroupDropTarget();
          isDragging.current = false;
        }
      })();
    },
    [
      canvasId,
      clearHighlightedIntersectionEdge,
      clearActiveGroupDropTarget,
      nodes,
      edges,
      isDragging,
      onInvalidConnection,
      pendingEdgeSplitByClientRequestRef,
      pendingMoveAfterCreateRef,
      resolvedRealIdByClientRequestRef,
      runBatchMoveNodesMutation,
      runMoveNodeMutation,
      runSetNodeParentMutation,
      runSplitEdgeAtExistingNodeMutation,
      syncPendingMoveForClientRequest,
      pendingLocalPositionUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
      setNodes,
    ],
  );

  return {
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    setHighlightedIntersectionEdge,
    clearHighlightedIntersectionEdge,
  };
}
