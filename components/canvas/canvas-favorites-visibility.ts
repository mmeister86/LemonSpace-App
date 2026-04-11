import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { readNodeFavorite } from "@/lib/canvas-node-favorite";

type CanvasNode = RFNode<Record<string, unknown>>;
type CanvasEdge = RFEdge<Record<string, unknown>>;

type ProjectCanvasFavoritesVisibilityArgs = {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  favoritesOnly: boolean;
};

type ProjectCanvasFavoritesVisibilityResult = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  favoriteNodeIds: ReadonlySet<string>;
  favoriteCount: number;
};

const DIMMED_NODE_OPACITY = 0.28;
const DIMMED_NODE_FILTER = "saturate(0.55)";
const DIMMED_EDGE_OPACITY = 0.18;
const DIMMED_NODE_TRANSITION = "opacity 160ms ease, filter 160ms ease";
const DIMMED_EDGE_TRANSITION = "opacity 160ms ease";

function mergeTransition(current: unknown, required: string): string {
  if (typeof current !== "string" || current.trim().length === 0) {
    return required;
  }
  if (current.includes(required)) {
    return current;
  }
  return `${current}, ${required}`;
}

function shallowEqualRecord(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => Object.is(left[key], right[key]));
}

function styleToRecord(
  style: CanvasNode["style"] | CanvasEdge["style"],
): Record<string, unknown> | undefined {
  return style ? (style as Record<string, unknown>) : undefined;
}

function buildDimmedNodeStyle(
  style: CanvasNode["style"],
): CanvasNode["style"] {
  const next = {
    ...(style ?? {}),
    opacity: DIMMED_NODE_OPACITY,
    filter: DIMMED_NODE_FILTER,
    transition: mergeTransition(style?.transition, DIMMED_NODE_TRANSITION),
  };
  return next;
}

function buildDimmedEdgeStyle(
  style: CanvasEdge["style"],
): CanvasEdge["style"] {
  const next = {
    ...(style ?? {}),
    opacity: DIMMED_EDGE_OPACITY,
    transition: mergeTransition(style?.transition, DIMMED_EDGE_TRANSITION),
  };
  return next;
}

export function projectCanvasFavoritesVisibility({
  nodes,
  edges,
  favoritesOnly,
}: ProjectCanvasFavoritesVisibilityArgs): ProjectCanvasFavoritesVisibilityResult {
  const favoriteNodeIds = new Set<string>();

  for (const node of nodes) {
    if (readNodeFavorite(node.data)) {
      favoriteNodeIds.add(node.id);
    }
  }

  const favoriteCount = favoriteNodeIds.size;
  const hasFavorites = favoriteCount > 0;

  const projectedNodes = nodes.map((node) => {
    const shouldDim = favoritesOnly && !favoriteNodeIds.has(node.id);
    if (!shouldDim) {
      return node;
    }

    const nextStyle = buildDimmedNodeStyle(node.style);
    return shallowEqualRecord(styleToRecord(node.style), styleToRecord(nextStyle))
      ? node
      : {
          ...node,
          style: nextStyle,
        };
  });

  const projectedEdges = edges.map((edge) => {
    const isFavoriteEdge = favoriteNodeIds.has(edge.source) && favoriteNodeIds.has(edge.target);
    const shouldDim = favoritesOnly && (!hasFavorites || !isFavoriteEdge);

    if (!shouldDim) {
      return edge;
    }

    const nextStyle = buildDimmedEdgeStyle(edge.style);
    return shallowEqualRecord(styleToRecord(edge.style), styleToRecord(nextStyle))
      ? edge
      : {
          ...edge,
          style: nextStyle,
        };
  });

  return {
    nodes: projectedNodes,
    edges: projectedEdges,
    favoriteNodeIds,
    favoriteCount,
  };
}
