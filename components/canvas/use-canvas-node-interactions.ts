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
      for (const draggedNode of draggedNodes) {
        pendingLocalPositionUntilConvexMatchesRef.current.delete(draggedNode.id);
      }
    },
    [clearHighlightedIntersectionEdge, isDragging, pendingLocalPositionUntilConvexMatchesRef],
  );

  const onNodeDrag = useCallback(
    (_event: ReactMouseEvent, node: RFNode) => {
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

      if (intersectedEdge.source === node.id || intersectedEdge.target === node.id) {
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
    [clearHighlightedIntersectionEdge, edges, setHighlightedIntersectionEdge],
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
          const intersectedEdge = intersectedEdgeId
            ? edges.find(
                (edge) =>
                  edge.id === intersectedEdgeId &&
                  edge.className !== "temp" &&
                  !isOptimisticEdgeId(edge.id),
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

          const splitValidationError =
            splitEligible && intersectedEdge
              ? validateCanvasEdgeSplit({
                  nodes,
                  edges,
                  splitEdge: intersectedEdge,
                  middleNode: primaryNode,
                })
              : null;

          if (splitValidationError) {
            onInvalidConnection(splitValidationError);
          }

          const canSplit = splitEligible && intersectedEdge && !splitValidationError;

          if (draggedNodes.length > 1) {
            for (const draggedNode of draggedNodes) {
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
              (draggedNode) => !isOptimisticNodeId(draggedNode.id),
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
            let middleId = primaryNode.id as Id<"nodes">;
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
          isDragging.current = false;
        }
      })();
    },
    [
      canvasId,
      clearHighlightedIntersectionEdge,
      nodes,
      edges,
      isDragging,
      onInvalidConnection,
      pendingEdgeSplitByClientRequestRef,
      pendingMoveAfterCreateRef,
      resolvedRealIdByClientRequestRef,
      runBatchMoveNodesMutation,
      runMoveNodeMutation,
      runSplitEdgeAtExistingNodeMutation,
      syncPendingMoveForClientRequest,
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
