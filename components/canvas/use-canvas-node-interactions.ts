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
import { NODE_HANDLE_MAP } from "@/lib/canvas-utils";
import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";
import {
  clientRequestIdFromOptimisticNodeId,
  EDGE_INTERSECTION_HIGHLIGHT_STYLE,
  getIntersectedEdgeId,
  getNodeCenterClientPosition,
  hasHandleKey,
  isOptimisticEdgeId,
  isOptimisticNodeId,
  normalizeHandle,
} from "./canvas-helpers";
import { validateCanvasEdgeSplit } from "./canvas-connection-validation";
import { adjustNodeDimensionChanges } from "./canvas-node-change-helpers";
import {
  getAbsoluteNodePosition,
  getNodeRect,
  isDescendantOf,
  rectsOverlap,
} from "./canvas-grouping-helpers";

type PositionPin = { x: number; y: number };
type MovePin = { positionX: number; positionY: number };
type PendingEdgeSplit = {
  intersectedEdgeId: Id<"edges">;
  sourceNodeId: Id<"nodes">;
  targetNodeId: Id<"nodes">;
  intersectedSourceHandle?: string;
  intersectedTargetHandle?: string;
  middleSourceHandle?: string;
  middleTargetHandle?: string;
  positionX: number;
  positionY: number;
};

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

type ParentChange = {
  nodeId: string;
  parentId?: string;
  position: { x: number; y: number };
};

function findOverlappingGroupTarget(
  draggedNode: RFNode,
  allNodes: RFNode[],
): RFNode | null {
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const draggedRect = getNodeRect(draggedNode, nodeById);
  const candidates = allNodes.filter((node) => {
    if (node.id === draggedNode.id) return false;
    if (node.type !== "group") return false;
    if (draggedNode.type === "group" && isDescendantOf(node.id, draggedNode.id, nodeById)) {
      return false;
    }
    return rectsOverlap(draggedRect, getNodeRect(node, nodeById));
  });

  candidates.sort((a, b) => {
    const depthA = isDescendantOf(a.id, b.id, nodeById) ? 1 : 0;
    const depthB = isDescendantOf(b.id, a.id, nodeById) ? 1 : 0;
    if (depthA !== depthB) return depthB - depthA;
    return (b.zIndex ?? 0) - (a.zIndex ?? 0);
  });

  return candidates[0] ?? null;
}

function clearGroupDropTargetData(nodes: RFNode[]): RFNode[] {
  return nodes.map((node) => {
    const data = node.data as Record<string, unknown> | undefined;
    if (!data?._groupDropTarget) return node;
    const { _groupDropTarget: _removed, ...nextData } = data;
    void _removed;
    return {
      ...node,
      data: nextData,
    };
  });
}

function markGroupDropTarget(nodes: RFNode[], targetId: string | null): RFNode[] {
  return nodes.map((node) => {
    const isTarget = node.id === targetId;
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (node.type !== "group" && !data._groupDropTarget) return node;
    if (Boolean(data._groupDropTarget) === isTarget) return node;

    if (!isTarget) {
      const { _groupDropTarget: _removed, ...nextData } = data;
      void _removed;
      return { ...node, data: nextData };
    }

    return {
      ...node,
      data: {
        ...data,
        _groupDropTarget: true,
      },
    };
  });
}

function computeParentChangeForNode(
  draggedNode: RFNode,
  allNodes: RFNode[],
): ParentChange | null {
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const absolutePosition = getAbsoluteNodePosition(draggedNode, nodeById);
  const overlappingGroup = findOverlappingGroupTarget(draggedNode, allNodes);

  if (overlappingGroup && draggedNode.parentId !== overlappingGroup.id) {
    const groupPosition = getAbsoluteNodePosition(overlappingGroup, nodeById);
    return {
      nodeId: draggedNode.id,
      parentId: overlappingGroup.id,
      position: {
        x: absolutePosition.x - groupPosition.x,
        y: absolutePosition.y - groupPosition.y,
      },
    };
  }

  if (draggedNode.parentId) {
    const currentParent = nodeById.get(draggedNode.parentId);
    if (
      currentParent?.type === "group" &&
      !rectsOverlap(getNodeRect(draggedNode, nodeById), getNodeRect(currentParent, nodeById))
    ) {
      return {
        nodeId: draggedNode.id,
        parentId: undefined,
        position: absolutePosition,
      };
    }
  }

  return null;
}

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

  const getEffectiveSplitMiddleNode = useCallback(
    (node: RFNode): RFNode => {
      const clientRequestId = clientRequestIdFromOptimisticNodeId(node.id);
      if (!clientRequestId) {
        return node;
      }

      const resolvedRealId =
        resolvedRealIdByClientRequestRef.current.get(clientRequestId);
      if (!resolvedRealId) {
        return node;
      }

      return {
        ...node,
        id: resolvedRealId,
      };
    },
    [resolvedRealIdByClientRequestRef],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "dimensions") {
          if (change.resizing === true) {
            isResizing.current = true;
          } else if (change.resizing === false) {
            isResizing.current = false;
          }
        }
      }

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

        for (const change of adjustedChanges) {
          if (change.type !== "dimensions") continue;
          if (!change.dimensions) continue;
          if (removedIds.has(change.id)) continue;
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
    [
      isResizing,
      pendingLocalPositionUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
      runResizeNodeMutation,
      setNodes,
    ],
  );

  const onNodeDragStart = useCallback(
    (_event: ReactMouseEvent, _node: RFNode, draggedNodes: RFNode[]) => {
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

      const intersectedEdge = edges.find(
        (edge) =>
          edge.id === intersectedEdgeId &&
          edge.className !== "temp" &&
          !isOptimisticEdgeId(edge.id),
      );
      if (!intersectedEdge) {
        clearHighlightedIntersectionEdge();
        return;
      }

      const effectiveMiddleNode = getEffectiveSplitMiddleNode(node);

      if (
        intersectedEdge.source === effectiveMiddleNode.id ||
        intersectedEdge.target === effectiveMiddleNode.id
      ) {
        clearHighlightedIntersectionEdge();
        return;
      }

      const handles = NODE_HANDLE_MAP[node.type ?? ""];
      if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
        clearHighlightedIntersectionEdge();
        return;
      }

      overlappedEdgeRef.current = intersectedEdge.id;
      setHighlightedIntersectionEdge(intersectedEdge.id);
    },
    [
      clearHighlightedIntersectionEdge,
      edges,
      getEffectiveSplitMiddleNode,
      nodes,
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
          const effectivePrimaryNode = getEffectiveSplitMiddleNode(primaryNode);
          const intersectedEdge = intersectedEdgeId
            ? edges.find(
                (edge) =>
                  edge.id === intersectedEdgeId &&
                  edge.className !== "temp" &&
                  !isOptimisticEdgeId(edge.id),
              )
            : undefined;

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
          const parentChanges = finalDraggedNodes
            .map((draggedNode) => {
              const finalNode =
                nodesWithFinalDraggedPositions.find(
                  (candidate) => candidate.id === draggedNode.id,
                ) ?? draggedNode;
              return computeParentChangeForNode(
                finalNode,
                nodesWithFinalDraggedPositions,
              );
            })
            .filter((change): change is ParentChange => change !== null);
          const parentChangedNodeIds = new Set(
            parentChanges.map((change) => change.nodeId),
          );

          const splitHandles = NODE_HANDLE_MAP[primaryNode.type ?? ""];
          const splitEligible =
            parentChanges.length === 0 &&
            intersectedEdge !== undefined &&
            splitHandles !== undefined &&
            intersectedEdge.source !== effectivePrimaryNode.id &&
            intersectedEdge.target !== effectivePrimaryNode.id &&
            hasHandleKey(splitHandles, "source") &&
            hasHandleKey(splitHandles, "target");

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

            if (!canSplit || !intersectedEdge) {
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
                  {
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
                  },
                );
                return;
              }
              middleId = resolvedId;
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

          if (!canSplit || !intersectedEdge) {
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
              pendingEdgeSplitByClientRequestRef.current.set(singleClientRequestId, {
                intersectedEdgeId: intersectedEdge.id as Id<"edges">,
                sourceNodeId: intersectedEdge.source as Id<"nodes">,
                targetNodeId: intersectedEdge.target as Id<"nodes">,
                intersectedSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
                intersectedTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
                middleSourceHandle: normalizeHandle(splitHandles.source),
                middleTargetHandle: normalizeHandle(splitHandles.target),
                positionX: primaryNode.position.x,
                positionY: primaryNode.position.y,
              });
              await syncPendingMoveForClientRequest(singleClientRequestId);
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
            pendingMoveAfterCreateRef.current.delete(singleClientRequestId);
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
      getEffectiveSplitMiddleNode,
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
