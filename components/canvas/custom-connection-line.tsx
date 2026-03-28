"use client";

import {
  ConnectionLineType,
  getBezierPath,
  getSimpleBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type ConnectionLineComponentProps,
} from "@xyflow/react";
import { connectionLineAccentRgb } from "@/lib/canvas-utils";

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
  const pathParams = {
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
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

  return (
    <path
      d={path}
      fill="none"
      className="ls-connection-line-marching"
      style={{
        stroke: `rgb(${r}, ${g}, ${b})`,
        strokeWidth: 2.5,
        strokeLinecap: "round",
        strokeDasharray: "10 8",
        opacity,
      }}
    />
  );
}
