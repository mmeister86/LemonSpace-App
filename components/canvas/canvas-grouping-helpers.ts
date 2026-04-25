import type { Node as RFNode } from "@xyflow/react";

export type CanvasRect = { x: number; y: number; width: number; height: number };

export type GroupFrame = {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  childPositions: Array<{
    nodeId: string;
    positionX: number;
    positionY: number;
  }>;
};

const GROUP_PADDING_X = 24;
const GROUP_PADDING_TOP = 44;
const GROUP_PADDING_BOTTOM = 24;
const GROUP_MIN_WIDTH = 150;
const GROUP_MIN_HEIGHT = 100;

export function getNodeDimension(node: RFNode, axis: "width" | "height"): number {
  const styleValue = node.style?.[axis];
  if (typeof styleValue === "number") return styleValue;
  const measuredValue = (node as { measured?: Partial<Record<"width" | "height", number>> })
    .measured?.[axis];
  if (typeof measuredValue === "number") return measuredValue;
  const directValue = (node as Partial<Record<"width" | "height", number>>)[axis];
  return typeof directValue === "number" ? directValue : 0;
}

export function getAbsoluteNodePosition(
  node: RFNode,
  nodeById: ReadonlyMap<string, RFNode>,
  visiting = new Set<string>(),
): { x: number; y: number } {
  if (!node.parentId || visiting.has(node.id)) return node.position;
  const parent = nodeById.get(node.parentId);
  if (!parent) return node.position;

  visiting.add(node.id);
  const parentPosition = getAbsoluteNodePosition(parent, nodeById, visiting);
  visiting.delete(node.id);
  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  };
}

export function getNodeRect(
  node: RFNode,
  nodeById: ReadonlyMap<string, RFNode>,
): CanvasRect {
  const position = getAbsoluteNodePosition(node, nodeById);
  return {
    x: position.x,
    y: position.y,
    width: getNodeDimension(node, "width"),
    height: getNodeDimension(node, "height"),
  };
}

export function rectsOverlap(a: CanvasRect, b: CanvasRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function isDescendantOf(
  candidateId: string,
  ancestorId: string,
  nodeById: ReadonlyMap<string, RFNode>,
): boolean {
  let current = nodeById.get(candidateId);
  const visited = new Set<string>();
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (visited.has(current.parentId)) return false;
    visited.add(current.parentId);
    current = nodeById.get(current.parentId);
  }
  return false;
}

export function getSelectedRootNodes(nodes: RFNode[]): RFNode[] {
  const selectedNodes = nodes.filter((node) => node.selected);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selectedIds = new Set(selectedNodes.map((node) => node.id));

  return selectedNodes.filter((node) => {
    let currentParentId = node.parentId;
    const visited = new Set<string>();
    while (currentParentId) {
      if (selectedIds.has(currentParentId)) return false;
      if (visited.has(currentParentId)) return true;
      visited.add(currentParentId);
      currentParentId = nodeById.get(currentParentId)?.parentId;
    }
    return true;
  });
}

export function getNodesBoundingRect(
  nodes: RFNode[],
  allNodes: RFNode[],
): CanvasRect | null {
  if (nodes.length === 0) return null;
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const rects = nodes.map((node) => getNodeRect(node, nodeById));
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function computeGroupFrameForNodes(
  selectedRootNodes: RFNode[],
  allNodes: RFNode[],
): GroupFrame | null {
  const bounds = getNodesBoundingRect(selectedRootNodes, allNodes);
  if (!bounds) return null;

  const positionX = bounds.x - GROUP_PADDING_X;
  const positionY = bounds.y - GROUP_PADDING_TOP;
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));

  return {
    positionX,
    positionY,
    width: Math.max(GROUP_MIN_WIDTH, bounds.width + GROUP_PADDING_X * 2),
    height: Math.max(GROUP_MIN_HEIGHT, bounds.height + GROUP_PADDING_TOP + GROUP_PADDING_BOTTOM),
    childPositions: selectedRootNodes.map((node) => {
      const absolutePosition = getAbsoluteNodePosition(node, nodeById);
      return {
        nodeId: node.id,
        positionX: absolutePosition.x - positionX,
        positionY: absolutePosition.y - positionY,
      };
    }),
  };
}

export function getDirectUngroupChildPositions(
  groupNodes: RFNode[],
  allNodes: RFNode[],
) {
  const groupById = new Map(groupNodes.map((node) => [node.id, node]));
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));

  return allNodes
    .filter((node) => node.parentId && groupById.has(node.parentId))
    .map((node) => {
      const group = groupById.get(node.parentId!);
      const nextParentId = group?.parentId;
      const absolutePosition = getAbsoluteNodePosition(node, nodeById);
      const parentPosition = nextParentId
        ? getAbsoluteNodePosition(nodeById.get(nextParentId)!, nodeById)
        : { x: 0, y: 0 };

      return {
        nodeId: node.id,
        parentId: nextParentId,
        positionX: absolutePosition.x - parentPosition.x,
        positionY: absolutePosition.y - parentPosition.y,
      };
    });
}

export function wouldCreateParentCycle(
  nodeId: string,
  parentId: string | undefined,
  nodes: RFNode[],
): boolean {
  if (!parentId) return false;
  if (nodeId === parentId) return true;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return isDescendantOf(parentId, nodeId, nodeById);
}
