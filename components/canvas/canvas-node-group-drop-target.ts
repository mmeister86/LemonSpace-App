/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas node group drop target. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type { Node as RFNode } from "@xyflow/react";

import { getNodeRect, isDescendantOf, rectsOverlap } from "./canvas-grouping-helpers";

export function findOverlappingGroupTarget(
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

export function clearGroupDropTargetData(nodes: RFNode[]): RFNode[] {
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

export function markGroupDropTarget(nodes: RFNode[], targetId: string | null): RFNode[] {
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
