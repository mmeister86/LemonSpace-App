"use client";

import {
  ConnectionLineType,
  getBezierPath,
  getSimpleBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type ConnectionLineComponentProps,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";

import {
  HANDLE_SNAP_RADIUS_PX,
  resolveCanvasMagnetTarget,
} from "@/components/canvas/canvas-connection-magnetism";
import { useCanvasConnectionMagnetism } from "@/components/canvas/canvas-connection-magnetism-context";
import { connectionLineAccentRgb } from "@/lib/canvas-utils";

function hasSameMagnetTarget(
  a: Parameters<ReturnType<typeof useCanvasConnectionMagnetism>["setActiveTarget"]>[0],
  b: Parameters<ReturnType<typeof useCanvasConnectionMagnetism>["setActiveTarget"]>[0],
): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  return (
    a.nodeId === b.nodeId &&
    a.handleId === b.handleId &&
    a.handleType === b.handleType &&
    a.centerX === b.centerX &&
    a.centerY === b.centerY &&
    a.distancePx === b.distancePx
  );
}

export default function CustomConnectionLine({
  connectionLineType,
  fromNode,
  fromHandle,
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionStatus,
}: ConnectionLineComponentProps) {
  const { getNodes, getEdges } = useReactFlow();
  const { activeTarget, setActiveTarget } = useCanvasConnectionMagnetism();

  const fromHandleType =
    fromHandle?.type === "source" || fromHandle?.type === "target"
      ? fromHandle.type
      : null;

  const resolvedMagnetTarget = useMemo(() => {
    if (!fromHandleType || !fromNode?.id) {
      return null;
    }

    return resolveCanvasMagnetTarget({
      point: { x: toX, y: toY },
      fromNodeId: fromNode.id,
      fromHandleId: fromHandle?.id ?? undefined,
      fromHandleType,
      nodes: getNodes(),
      edges: getEdges(),
    });
  }, [fromHandle?.id, fromHandleType, fromNode?.id, getEdges, getNodes, toX, toY]);

  useEffect(() => {
    if (hasSameMagnetTarget(activeTarget, resolvedMagnetTarget)) {
      return;
    }
    setActiveTarget(resolvedMagnetTarget);
  }, [activeTarget, resolvedMagnetTarget, setActiveTarget]);

  const magnetTarget = activeTarget ?? resolvedMagnetTarget;
  const snappedTarget =
    magnetTarget && magnetTarget.distancePx <= HANDLE_SNAP_RADIUS_PX
      ? magnetTarget
      : null;
  const targetX = snappedTarget?.centerX ?? toX;
  const targetY = snappedTarget?.centerY ?? toY;

  const pathParams = {
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX,
    targetY,
    targetPosition: toPosition,
  };

  let path = "";
  switch (connectionLineType) {
    case ConnectionLineType.Bezier:
      [path] = getBezierPath(pathParams);
      break;
    case ConnectionLineType.SimpleBezier:
      [path] = getSimpleBezierPath(pathParams);
      break;
    case ConnectionLineType.Step:
      [path] = getSmoothStepPath({
        ...pathParams,
        borderRadius: 0,
      });
      break;
    case ConnectionLineType.SmoothStep:
      [path] = getSmoothStepPath(pathParams);
      break;
    default:
      [path] = getStraightPath(pathParams);
  }

  const [r, g, b] = connectionLineAccentRgb(fromNode.type, fromHandle.id);
  const opacity = connectionStatus === "invalid" ? 0.45 : 1;
  const strokeWidth = snappedTarget ? 3.25 : 2.5;
  const filter = snappedTarget
    ? `drop-shadow(0 0 3px rgba(${r}, ${g}, ${b}, 0.7)) drop-shadow(0 0 8px rgba(${r}, ${g}, ${b}, 0.48))`
    : undefined;

  return (
    <path
      d={path}
      fill="none"
      className="ls-connection-line-marching"
      style={{
        stroke: `rgb(${r}, ${g}, ${b})`,
        strokeWidth,
        strokeLinecap: "round",
        strokeDasharray: "10 8",
        filter,
        opacity,
      }}
    />
  );
}
