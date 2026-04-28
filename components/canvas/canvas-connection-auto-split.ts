import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";
import { NODE_HANDLE_MAP } from "@/lib/canvas-utils";

import type { DroppedConnectionTarget } from "./canvas-connection-drop-target";
import { validateCanvasEdgeSplit } from "./canvas-connection-validation";
import { hasHandleKey, isOptimisticEdgeId, normalizeHandle } from "./canvas-helpers";

export type AdjustmentAutoSplitResolution = {
  splitEdge: RFEdge;
  middleNode: RFNode;
  splitSourceHandle?: string;
  splitTargetHandle?: string;
  newNodeSourceHandle?: string;
  newNodeTargetHandle?: string;
  splitValidationError: CanvasConnectionValidationReason | null;
};

export function resolveAdjustmentAutoSplit(args: {
  validationError: CanvasConnectionValidationReason;
  droppedConnection: DroppedConnectionTarget;
  fromNodeId: string;
  fromHandleType: "source" | "target";
  nodes: RFNode[];
  edges: RFEdge[];
}): AdjustmentAutoSplitResolution | null {
  const fullFromNode = args.nodes.find((node) => node.id === args.fromNodeId);
  const splitHandles = NODE_HANDLE_MAP[fullFromNode?.type ?? ""];
  const incomingEdges = args.edges.filter(
    (edge) =>
      edge.target === args.droppedConnection.targetNodeId &&
      edge.className !== "temp" &&
      !isOptimisticEdgeId(edge.id),
  );
  const incomingEdge = incomingEdges.length === 1 ? incomingEdges[0] : undefined;
  const shouldAttemptAutoSplit =
    args.validationError === "adjustment-incoming-limit" &&
    args.droppedConnection.sourceNodeId === args.fromNodeId &&
    args.fromHandleType === "source" &&
    fullFromNode !== undefined &&
    splitHandles !== undefined &&
    hasHandleKey(splitHandles, "source") &&
    hasHandleKey(splitHandles, "target") &&
    incomingEdge !== undefined &&
    incomingEdge.source !== fullFromNode.id &&
    incomingEdge.target !== fullFromNode.id;

  if (!shouldAttemptAutoSplit || !incomingEdge || !fullFromNode || !splitHandles) {
    return null;
  }

  const splitValidationError = validateCanvasEdgeSplit({
    nodes: args.nodes,
    edges: args.edges,
    splitEdge: incomingEdge,
    middleNode: fullFromNode,
  });

  if (splitValidationError) {
    return {
      splitEdge: incomingEdge,
      middleNode: fullFromNode,
      splitSourceHandle: normalizeHandle(incomingEdge.sourceHandle),
      splitTargetHandle: normalizeHandle(incomingEdge.targetHandle),
      newNodeSourceHandle: normalizeHandle(splitHandles.source),
      newNodeTargetHandle: normalizeHandle(splitHandles.target),
      splitValidationError,
    };
  }

  return {
    splitEdge: incomingEdge,
    middleNode: fullFromNode,
    splitSourceHandle: normalizeHandle(incomingEdge.sourceHandle),
    splitTargetHandle: normalizeHandle(incomingEdge.targetHandle),
    newNodeSourceHandle: normalizeHandle(splitHandles.source),
    newNodeTargetHandle: normalizeHandle(splitHandles.target),
    splitValidationError: null,
  };
}
