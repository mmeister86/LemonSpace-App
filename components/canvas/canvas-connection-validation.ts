/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas connection validation. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type { Connection, Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import {
  validateCanvasConnectionPolicy,
  type CanvasConnectionValidationReason,
} from "@/lib/canvas-connection-policy";
import { NODE_HANDLE_MAP } from "@/lib/canvas-utils";

import { isOptimisticEdgeId } from "./canvas-helpers";

export function validateCanvasConnection(
  connection: Connection,
  nodes: RFNode[],
  edges: RFEdge[],
  edgeToReplaceId?: string,
  options?: {
    includeOptimisticEdges?: boolean;
  },
): CanvasConnectionValidationReason | null {
  if (!connection.source || !connection.target) return "incomplete";
  if (connection.source === connection.target) return "self-loop";

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) return "unknown-node";

  return validateCanvasConnectionByType({
    sourceType: sourceNode.type ?? "",
    targetType: targetNode.type ?? "",
    targetNodeId: connection.target,
    targetHandle: connection.targetHandle,
    edges,
    edgeToReplaceId,
    includeOptimisticEdges: options?.includeOptimisticEdges,
  });
}

export function validateCanvasConnectionByType(args: {
  sourceType: string;
  targetType: string;
  targetNodeId: string;
  targetHandle?: string | null;
  edges: RFEdge[];
  edgeToReplaceId?: string;
  includeOptimisticEdges?: boolean;
}): CanvasConnectionValidationReason | null {
  const targetIncomingEdges = args.edges.filter(
    (edge) =>
      edge.className !== "temp" &&
      (args.includeOptimisticEdges || !isOptimisticEdgeId(edge.id)) &&
      edge.target === args.targetNodeId &&
      edge.id !== args.edgeToReplaceId,
  );

  return validateCanvasConnectionPolicy({
    sourceType: args.sourceType,
    targetType: args.targetType,
    targetIncomingCount: targetIncomingEdges.length,
    targetHandle: args.targetHandle,
    targetIncomingHandles: targetIncomingEdges.map((edge) => edge.targetHandle),
  });
}

export function validateCanvasEdgeSplit(args: {
  nodes: RFNode[];
  edges: RFEdge[];
  splitEdge: RFEdge;
  middleNode: RFNode;
}): CanvasConnectionValidationReason | null {
  const sourceNode = args.nodes.find((node) => node.id === args.splitEdge.source);
  const targetNode = args.nodes.find((node) => node.id === args.splitEdge.target);

  if (!sourceNode || !targetNode) {
    return "unknown-node";
  }

  const middleNodeHandles = NODE_HANDLE_MAP[args.middleNode.type ?? ""];

  return (
    validateCanvasConnectionByType({
      sourceType: sourceNode.type ?? "",
      targetType: args.middleNode.type ?? "",
      targetNodeId: args.middleNode.id,
      targetHandle: middleNodeHandles?.target,
      edges: args.edges,
    }) ??
    validateCanvasConnectionByType({
      sourceType: args.middleNode.type ?? "",
      targetType: targetNode.type ?? "",
      targetNodeId: targetNode.id,
      targetHandle: args.splitEdge.targetHandle,
      edges: args.edges,
      edgeToReplaceId: args.splitEdge.id,
    })
  );
}
