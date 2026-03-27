"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

const SNAP = 16;

function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / SNAP) * SNAP,
    y: Math.round(y / SNAP) * SNAP,
  };
}

/**
 * Top-left flow position for a node centered in the visible React Flow pane
 * (viewport), with optional stagger and 16px grid snap to match the canvas.
 */
export function useCenteredFlowNodePosition() {
  const { screenToFlowPosition } = useReactFlow();

  return useCallback(
    (width: number, height: number, stagger: number) => {
      const pane = document.querySelector(".react-flow__pane");
      const rect =
        pane?.getBoundingClientRect() ??
        document.querySelector(".react-flow")?.getBoundingClientRect();

      if (!rect || rect.width === 0 || rect.height === 0) {
        return snapToGrid(100 + stagger, 100 + stagger);
      }

      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });

      const x = center.x - width / 2 + stagger;
      const y = center.y - height / 2 + stagger;
      return snapToGrid(x, y);
    },
    [screenToFlowPosition],
  );
}
