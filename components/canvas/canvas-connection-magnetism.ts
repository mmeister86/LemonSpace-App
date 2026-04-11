import type { Connection, Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { validateCanvasConnectionPolicy } from "@/lib/canvas-connection-policy";

export const HANDLE_GLOW_RADIUS_PX = 56;
export const HANDLE_SNAP_RADIUS_PX = 40;

export type CanvasMagnetTarget = {
  nodeId: string;
  handleId?: string;
  handleType: "source" | "target";
  centerX: number;
  centerY: number;
  distancePx: number;
};

type HandleCandidate = CanvasMagnetTarget & {
  index: number;
};

function isOptimisticEdgeId(id: string): boolean {
  return id.startsWith("optimistic_edge_");
}

function normalizeHandleId(value: string | undefined): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
}

function isValidConnectionCandidate(args: {
  connection: Connection;
  nodes: RFNode[];
  edges: RFEdge[];
}): boolean {
  const { connection, nodes, edges } = args;
  if (!connection.source || !connection.target) {
    return false;
  }
  if (connection.source === connection.target) {
    return false;
  }

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) {
    return false;
  }

  const incomingEdges = edges.filter(
    (edge) =>
      edge.className !== "temp" &&
      !isOptimisticEdgeId(edge.id) &&
      edge.target === connection.target,
  );

  return (
    validateCanvasConnectionPolicy({
      sourceType: sourceNode.type ?? "",
      targetType: targetNode.type ?? "",
      targetHandle: connection.targetHandle,
      targetIncomingCount: incomingEdges.length,
      targetIncomingHandles: incomingEdges.map((edge) => edge.targetHandle),
    }) === null
  );
}

function collectHandleCandidates(args: {
  point: { x: number; y: number };
  expectedHandleType: "source" | "target";
  maxDistancePx: number;
  handleElements?: Element[];
}): HandleCandidate[] {
  const { point, expectedHandleType, maxDistancePx } = args;
  const handleElements =
    args.handleElements ??
    (typeof document === "undefined"
      ? []
      : Array.from(document.querySelectorAll("[data-node-id][data-handle-type]")));

  const candidates: HandleCandidate[] = [];
  let index = 0;
  for (const element of handleElements) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    if (element.dataset.handleType !== expectedHandleType) {
      continue;
    }

    const nodeId = element.dataset.nodeId;
    if (!nodeId) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distancePx = Math.hypot(point.x - centerX, point.y - centerY);

    if (distancePx > maxDistancePx) {
      continue;
    }

    candidates.push({
      index,
      nodeId,
      handleId: normalizeHandleId(element.dataset.handleId),
      handleType: expectedHandleType,
      centerX,
      centerY,
      distancePx,
    });
    index += 1;
  }

  return candidates;
}

function toConnectionFromCandidate(args: {
  fromNodeId: string;
  fromHandleId?: string;
  fromHandleType: "source" | "target";
  candidate: HandleCandidate;
}): Connection {
  if (args.fromHandleType === "source") {
    return {
      source: args.fromNodeId,
      sourceHandle: args.fromHandleId ?? null,
      target: args.candidate.nodeId,
      targetHandle: args.candidate.handleId ?? null,
    };
  }

  return {
    source: args.candidate.nodeId,
    sourceHandle: args.candidate.handleId ?? null,
    target: args.fromNodeId,
    targetHandle: args.fromHandleId ?? null,
  };
}

export function resolveCanvasMagnetTarget(args: {
  point: { x: number; y: number };
  fromNodeId: string;
  fromHandleId?: string;
  fromHandleType: "source" | "target";
  nodes: RFNode[];
  edges: RFEdge[];
  maxDistancePx?: number;
  handleElements?: Element[];
}): CanvasMagnetTarget | null {
  const expectedHandleType = args.fromHandleType === "source" ? "target" : "source";
  const maxDistancePx = args.maxDistancePx ?? HANDLE_GLOW_RADIUS_PX;

  const candidates = collectHandleCandidates({
    point: args.point,
    expectedHandleType,
    maxDistancePx,
    handleElements: args.handleElements,
  }).filter((candidate) => {
    const connection = toConnectionFromCandidate({
      fromNodeId: args.fromNodeId,
      fromHandleId: args.fromHandleId,
      fromHandleType: args.fromHandleType,
      candidate,
    });

    return isValidConnectionCandidate({
      connection,
      nodes: args.nodes,
      edges: args.edges,
    });
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const distanceDelta = a.distancePx - b.distancePx;
    if (Math.abs(distanceDelta) > Number.EPSILON) {
      return distanceDelta;
    }
    return a.index - b.index;
  });

  const winner = candidates[0];
  return {
    nodeId: winner.nodeId,
    handleId: winner.handleId,
    handleType: winner.handleType,
    centerX: winner.centerX,
    centerY: winner.centerY,
    distancePx: winner.distancePx,
  };
}
