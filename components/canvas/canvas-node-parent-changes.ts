/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas node parent changes. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type { Node as RFNode } from "@xyflow/react";

import { getAbsoluteNodePosition, getNodeRect, rectsOverlap } from "./canvas-grouping-helpers";
import { findOverlappingGroupTarget } from "./canvas-node-group-drop-target";

export type ParentChange = {
  nodeId: string;
  parentId?: string;
  position: { x: number; y: number };
};

export function computeParentChangeForNode(
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

export function computeParentChangesForDraggedNodes(
  draggedNodes: RFNode[],
  allNodes: RFNode[],
): ParentChange[] {
  return draggedNodes
    .map((draggedNode) => {
      const finalNode = allNodes.find((candidate) => candidate.id === draggedNode.id) ?? draggedNode;
      return computeParentChangeForNode(finalNode, allNodes);
    })
    .filter((change): change is ParentChange => change !== null);
}
