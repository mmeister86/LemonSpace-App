import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { NODE_HANDLE_MAP } from "@/lib/canvas-utils";

import {
  resolveCanvasMagnetTarget,
  type CanvasMagnetTarget,
} from "./canvas-connection-magnetism";
import { logCanvasConnectionDebug } from "./canvas-helpers";

export type DroppedConnectionTarget = {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
};

function describeConnectionDebugElement(element: Element): Record<string, unknown> {
  if (!(element instanceof HTMLElement)) {
    return { tagName: element.tagName.toLowerCase() };
  }

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    dataId: element.dataset.id || undefined,
    className: element.className || undefined,
  };
}

function getNodeElementAtClientPoint(
  point: { x: number; y: number },
  elementsAtPoint?: Element[],
): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const hit = (elementsAtPoint ?? document.elementsFromPoint(point.x, point.y)).find(
    (element) => {
      if (!(element instanceof HTMLElement)) return false;
      return (
        element.classList.contains("react-flow__node") &&
        typeof element.dataset.id === "string" &&
        element.dataset.id.length > 0
      );
    },
  );

  return hit instanceof HTMLElement ? hit : null;
}

function getCompareBodyDropTargetHandle(args: {
  point: { x: number; y: number };
  nodeElement: HTMLElement;
  targetNodeId: string;
  edges: RFEdge[];
}): string | undefined {
  const { point, nodeElement, targetNodeId, edges } = args;
  const rect = nodeElement.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const incomingEdges = edges.filter(
    (edge) => edge.target === targetNodeId && edge.className !== "temp",
  );
  const leftTaken = incomingEdges.some((edge) => edge.targetHandle === "left");
  const rightTaken = incomingEdges.some((edge) => edge.targetHandle === "right");

  if (!leftTaken && !rightTaken) {
    return point.y < midY ? "left" : "right";
  }

  if (!leftTaken) return "left";
  if (!rightTaken) return "right";
  return point.y < midY ? "left" : "right";
}

export function toDroppedConnectionFromMagnetTarget(
  fromHandleType: "source" | "target",
  fromNodeId: string,
  fromHandleId: string | undefined,
  magnetTarget: CanvasMagnetTarget,
): DroppedConnectionTarget {
  if (fromHandleType === "source") {
    return {
      sourceNodeId: fromNodeId,
      targetNodeId: magnetTarget.nodeId,
      sourceHandle: fromHandleId,
      targetHandle: magnetTarget.handleId,
    };
  }

  return {
    sourceNodeId: magnetTarget.nodeId,
    targetNodeId: fromNodeId,
    sourceHandle: magnetTarget.handleId,
    targetHandle: fromHandleId,
  };
}

export function resolveDroppedConnectionTarget(args: {
  point: { x: number; y: number };
  fromNodeId: string;
  fromHandleId?: string;
  fromHandleType: "source" | "target";
  nodes: RFNode[];
  edges: RFEdge[];
}): DroppedConnectionTarget | null {
  const elementsAtPoint =
    typeof document === "undefined"
      ? []
      : document.elementsFromPoint(args.point.x, args.point.y);
  const nodeElement = getNodeElementAtClientPoint(args.point, elementsAtPoint);
  if (nodeElement) {
    const targetNodeId = nodeElement.dataset.id;
    if (!targetNodeId) {
      logCanvasConnectionDebug("drop-target:node-missing-data-id", {
        point: args.point,
        fromNodeId: args.fromNodeId,
        fromHandleId: args.fromHandleId ?? null,
        fromHandleType: args.fromHandleType,
        nodeElement: describeConnectionDebugElement(nodeElement),
      });
      return null;
    }

    const targetNode = args.nodes.find((node) => node.id === targetNodeId);
    if (!targetNode) {
      logCanvasConnectionDebug("drop-target:node-not-in-state", {
        point: args.point,
        fromNodeId: args.fromNodeId,
        fromHandleId: args.fromHandleId ?? null,
        fromHandleType: args.fromHandleType,
        targetNodeId,
        nodeCount: args.nodes.length,
        nodeElement: describeConnectionDebugElement(nodeElement),
      });
      return null;
    }

    const handles = NODE_HANDLE_MAP[targetNode.type ?? ""];
    const droppedConnection =
      args.fromHandleType === "source"
        ? {
            sourceNodeId: args.fromNodeId,
            targetNodeId,
            sourceHandle: args.fromHandleId,
            targetHandle:
              targetNode.type === "compare"
                ? getCompareBodyDropTargetHandle({
                    point: args.point,
                    nodeElement,
                    targetNodeId,
                    edges: args.edges,
                  })
                : handles?.target,
          }
        : {
            sourceNodeId: targetNodeId,
            targetNodeId: args.fromNodeId,
            sourceHandle: handles?.source,
            targetHandle: args.fromHandleId,
          };

    logCanvasConnectionDebug("drop-target:node-detected", {
      point: args.point,
      fromNodeId: args.fromNodeId,
      fromHandleId: args.fromHandleId ?? null,
      fromHandleType: args.fromHandleType,
      targetNodeId,
      targetNodeType: targetNode.type ?? null,
      nodeElement: describeConnectionDebugElement(nodeElement),
      resolvedConnection: droppedConnection,
    });

    return droppedConnection;
  }

  const magnetTarget = resolveCanvasMagnetTarget(args);
  if (!magnetTarget) {
    logCanvasConnectionDebug("drop-target:node-missed", {
      point: args.point,
      fromNodeId: args.fromNodeId,
      fromHandleId: args.fromHandleId ?? null,
      fromHandleType: args.fromHandleType,
      elementsAtPoint: elementsAtPoint.slice(0, 6).map(describeConnectionDebugElement),
    });
    return null;
  }

  const droppedConnection = toDroppedConnectionFromMagnetTarget(
    args.fromHandleType,
    args.fromNodeId,
    args.fromHandleId,
    magnetTarget,
  );

  logCanvasConnectionDebug("drop-target:magnet-detected", {
    point: args.point,
    fromNodeId: args.fromNodeId,
    fromHandleId: args.fromHandleId ?? null,
    fromHandleType: args.fromHandleType,
    magnetTarget,
    resolvedConnection: droppedConnection,
  });

  return droppedConnection;
}

export function resolveConnectionDropTarget(args: {
  point: { x: number; y: number };
  fromNodeId: string;
  fromHandleId?: string;
  fromHandleType: "source" | "target";
  nodes: RFNode[];
  edges: RFEdge[];
  activeMagnetTarget?: CanvasMagnetTarget | null;
}): DroppedConnectionTarget | null {
  const directDrop = resolveDroppedConnectionTarget(args);
  if (directDrop) return directDrop;

  const fallbackMagnetTarget =
    args.activeMagnetTarget ??
    resolveCanvasMagnetTarget({
      point: args.point,
      fromNodeId: args.fromNodeId,
      fromHandleId: args.fromHandleId,
      fromHandleType: args.fromHandleType,
      nodes: args.nodes,
      edges: args.edges,
    });

  if (!fallbackMagnetTarget) return null;

  return toDroppedConnectionFromMagnetTarget(
    args.fromHandleType,
    args.fromNodeId,
    args.fromHandleId,
    fallbackMagnetTarget,
  );
}
