import type { Connection, Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import {
  validateCanvasConnectionPolicy,
  type CanvasConnectionValidationReason,
} from "@/lib/canvas-connection-policy";

export function validateCanvasConnection(
  connection: Connection,
  nodes: RFNode[],
  edges: RFEdge[],
  edgeToReplaceId?: string,
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
    edges,
    edgeToReplaceId,
  });
}

export function validateCanvasConnectionByType(args: {
  sourceType: string;
  targetType: string;
  targetNodeId: string;
  edges: RFEdge[];
  edgeToReplaceId?: string;
}): CanvasConnectionValidationReason | null {
  const targetIncomingCount = args.edges.filter(
    (edge) => edge.target === args.targetNodeId && edge.id !== args.edgeToReplaceId,
  ).length;

  return validateCanvasConnectionPolicy({
    sourceType: args.sourceType,
    targetType: args.targetType,
    targetIncomingCount,
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

  return (
    validateCanvasConnectionByType({
      sourceType: sourceNode.type ?? "",
      targetType: args.middleNode.type ?? "",
      targetNodeId: args.middleNode.id,
      edges: args.edges,
    }) ??
    validateCanvasConnectionByType({
      sourceType: args.middleNode.type ?? "",
      targetType: targetNode.type ?? "",
      targetNodeId: targetNode.id,
      edges: args.edges,
      edgeToReplaceId: args.splitEdge.id,
    })
  );
}
