/**
 * Onboarding note:
 * Pure Dagre layout helper for Canvas auto-layout. Keep this isolated from
 * React Flow state, Convex sync, history, and UI feedback.
 */

import dagre from "@dagrejs/dagre";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { NODE_DEFAULTS } from "@/lib/canvas-node-defaults";

export type CanvasDagreLayoutDirection = "LR" | "TB";

type CanvasDagreMove = {
  nodeId: string;
  positionX: number;
  positionY: number;
};

export type CanvasDagreLayoutResult =
  | {
      status: "ok";
      nodes: RFNode[];
      moves: CanvasDagreMove[];
      laidOutNodeIds: string[];
    }
  | {
      status: "noop";
      reason: "no-candidates" | "mixed-parent-context" | "optimistic-nodes";
      nodes: RFNode[];
      moves: [];
      laidOutNodeIds: [];
    };

const DAGRE_NODE_FALLBACK = { width: 172, height: 36 };
const DAGRE_NODE_SEPARATION = 72;
const DAGRE_HORIZONTAL_RANK_SEPARATION = 120;
const DAGRE_VERTICAL_RANK_SEPARATION = 48;
const OPTIMISTIC_NODE_PREFIX = "optimistic_";

function isOptimisticNodeId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_NODE_PREFIX);
}

function readFinitePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function readNodeSize(node: RFNode): { width: number; height: number } {
  const fallback = node.type ? NODE_DEFAULTS[node.type] : undefined;
  const style = node.style as Partial<Record<"width" | "height", unknown>> | undefined;
  return {
    width:
      readFinitePositiveNumber((node as { width?: unknown }).width) ??
      readFinitePositiveNumber(
        (node as { measured?: Partial<Record<"width", unknown>> }).measured?.width,
      ) ??
      readFinitePositiveNumber(style?.width) ??
      fallback?.width ??
      DAGRE_NODE_FALLBACK.width,
    height:
      readFinitePositiveNumber((node as { height?: unknown }).height) ??
      readFinitePositiveNumber(
        (node as { measured?: Partial<Record<"height", unknown>> }).measured?.height,
      ) ??
      readFinitePositiveNumber(style?.height) ??
      fallback?.height ??
      DAGRE_NODE_FALLBACK.height,
  };
}

function parentContextKey(node: RFNode): string {
  return node.parentId ?? "__root__";
}

function getLayoutCandidates(nodes: RFNode[]): RFNode[] {
  const selectedNodes = nodes.filter((node) => node.selected === true);
  if (selectedNodes.length > 0) {
    return selectedNodes;
  }
  return nodes.filter((node) => node.parentId === undefined);
}

function noopResult(
  nodes: RFNode[],
  reason: Extract<CanvasDagreLayoutResult, { status: "noop" }>["reason"],
): CanvasDagreLayoutResult {
  return {
    status: "noop",
    reason,
    nodes,
    moves: [],
    laidOutNodeIds: [],
  };
}

export function computeCanvasDagreLayout({
  direction,
  nodes,
  edges,
}: {
  direction: CanvasDagreLayoutDirection;
  nodes: RFNode[];
  edges: RFEdge[];
}): CanvasDagreLayoutResult {
  const candidates = getLayoutCandidates(nodes);
  if (candidates.length === 0) {
    return noopResult(nodes, "no-candidates");
  }

  const parentContexts = new Set(candidates.map(parentContextKey));
  if (parentContexts.size > 1) {
    return noopResult(nodes, "mixed-parent-context");
  }

  if (candidates.some((node) => isOptimisticNodeId(node.id))) {
    return noopResult(nodes, "optimistic-nodes");
  }

  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    nodesep: DAGRE_NODE_SEPARATION,
    ranksep:
      direction === "TB"
        ? DAGRE_VERTICAL_RANK_SEPARATION
        : DAGRE_HORIZONTAL_RANK_SEPARATION,
  });

  const candidateIds = new Set(candidates.map((node) => node.id));
  const sizeByNodeId = new Map<string, { width: number; height: number }>();

  for (const node of candidates) {
    const size = readNodeSize(node);
    sizeByNodeId.set(node.id, size);
    graph.setNode(node.id, size);
  }

  for (const edge of edges) {
    if (!candidateIds.has(edge.source) || !candidateIds.has(edge.target)) {
      continue;
    }
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const rawPositionByNodeId = new Map<string, { x: number; y: number }>();
  for (const node of candidates) {
    const dagreNode = graph.node(node.id);
    const size = sizeByNodeId.get(node.id) ?? DAGRE_NODE_FALLBACK;
    rawPositionByNodeId.set(node.id, {
      x: dagreNode.x - size.width / 2,
      y: dagreNode.y - size.height / 2,
    });
  }

  const originalMinX = Math.min(...candidates.map((node) => node.position.x));
  const originalMinY = Math.min(...candidates.map((node) => node.position.y));
  const layoutMinX = Math.min(
    ...Array.from(rawPositionByNodeId.values()).map((position) => position.x),
  );
  const layoutMinY = Math.min(
    ...Array.from(rawPositionByNodeId.values()).map((position) => position.y),
  );
  const offsetX = originalMinX - layoutMinX;
  const offsetY = originalMinY - layoutMinY;

  const positionByNodeId = new Map<string, { x: number; y: number }>();
  for (const [nodeId, position] of rawPositionByNodeId) {
    positionByNodeId.set(nodeId, {
      x: position.x + offsetX,
      y: position.y + offsetY,
    });
  }

  const moves: CanvasDagreMove[] = [];
  const nextNodes = nodes.map((node) => {
    const position = positionByNodeId.get(node.id);
    if (!position) {
      return node;
    }

    moves.push({
      nodeId: node.id,
      positionX: position.x,
      positionY: position.y,
    });

    return {
      ...node,
      position,
    };
  });

  return {
    status: "ok",
    nodes: nextNodes,
    moves,
    laidOutNodeIds: candidates.map((node) => node.id),
  };
}
