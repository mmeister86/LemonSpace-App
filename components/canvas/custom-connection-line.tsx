"use client";

/**
 * Onboarding note:
 * Supports the Canvas editor workflow for custom connection line. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import {
  ConnectionLineType,
  getBezierPath,
  getSimpleBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type ConnectionLineComponentProps,
  useConnection,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";

import {
  HANDLE_SNAP_RADIUS_PX,
  resolveCanvasGlowStrength,
  resolveCanvasMagnetTarget,
} from "@/components/canvas/canvas-connection-magnetism";
import { useCanvasConnectionMagnetism } from "@/components/canvas/canvas-connection-magnetism-context";
import {
  connectionLineAccentRgb,
  connectionLineGlowFilter,
  type EdgeGlowColorMode,
} from "@/lib/canvas-utils";

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
  pointer,
}: ConnectionLineComponentProps) {
  const { getNodes, getEdges, screenToFlowPosition } = useReactFlow();
  const connection = useConnection();
  const { activeTarget, setActiveTarget } = useCanvasConnectionMagnetism();
  const fromHandleId = fromHandle?.id;
  const fromNodeId = fromNode?.id;

  const connectionFromHandleType =
    connection.fromHandle?.type === "source" || connection.fromHandle?.type === "target"
      ? connection.fromHandle.type
      : null;

  const fromHandleType =
    fromHandle?.type === "source" || fromHandle?.type === "target"
      ? fromHandle.type
      : connectionFromHandleType ?? "source";

  const resolvedMagnetTarget = useMemo(() => {
    if (!fromHandleType || !fromNodeId) {
      return null;
    }

     const magnetPoint =
      pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)
        ? { x: pointer.x, y: pointer.y }
        : { x: toX, y: toY };

    return resolveCanvasMagnetTarget({
      point: magnetPoint,
      fromNodeId,
      fromHandleId: fromHandleId ?? undefined,
      fromHandleType,
      nodes: getNodes(),
      edges: getEdges(),
    });
  }, [fromHandleId, fromHandleType, fromNodeId, getEdges, getNodes, pointer, toX, toY]);

  useEffect(() => {
    if (hasSameMagnetTarget(activeTarget, resolvedMagnetTarget)) {
      return;
    }
    setActiveTarget(resolvedMagnetTarget);
  }, [activeTarget, resolvedMagnetTarget, setActiveTarget]);

  const magnetTarget = activeTarget ?? resolvedMagnetTarget;
  const glowStrength = magnetTarget
    ? resolveCanvasGlowStrength({
        distancePx: magnetTarget.distancePx,
      })
    : 0;
  const snappedTarget =
    magnetTarget && magnetTarget.distancePx <= HANDLE_SNAP_RADIUS_PX
      ? magnetTarget
      : null;
  const snappedFlowPoint =
    snappedTarget === null
      ? null
      : screenToFlowPosition({ x: snappedTarget.centerX, y: snappedTarget.centerY });
  const targetX = snappedFlowPoint?.x ?? toX;
  const targetY = snappedFlowPoint?.y ?? toY;

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

  const [r, g, b] = connectionLineAccentRgb(fromNode.type, fromHandleId);
  const opacity = connectionStatus === "invalid" ? 0.45 : 1;
  const colorMode: EdgeGlowColorMode =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
  const strokeWidth = 2.5 + glowStrength * 0.75;
  const filter = connectionLineGlowFilter({
    nodeType: fromNode.type,
    handleId: fromHandleId,
    strength: glowStrength,
    colorMode,
  });

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
