import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Doc } from "@/convex/_generated/dataModel";

export function convexNodeToRF(node: Doc<"nodes">): RFNode {
  return {
    id: node._id,
    type: node.type,
    position: {
      x: node.positionX,
      y: node.positionY,
    },
    data: {
      ...(typeof node.data === "object" && node.data !== null ? node.data : {}),
      status: node.status,
      statusMessage: node.statusMessage,
    },
    style: {
      width: node.width,
      height: node.height,
    },
    zIndex: node.zIndex,
    parentId: node.parentId,
  };
}

export function convexEdgeToRF(edge: Doc<"edges">): RFEdge {
  return {
    id: edge._id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  };
}
