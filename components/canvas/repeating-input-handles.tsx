"use client";

/**
 * Onboarding note:
 * Renders dynamic React Flow handles for finite repeating Canvas inputs.
 * Keep slot assignment display-only and call useUpdateNodeInternals whenever
 * handle count or position changes.
 */

import { useEffect, useMemo } from "react";
import { Position, useUpdateNodeInternals } from "@xyflow/react";

import CanvasHandle from "@/components/canvas/canvas-handle";
import type { RepeatingInputHandleSlot } from "@/lib/canvas-repeating-input-handles";

type RepeatingInputHandlesProps = {
  nodeId: string;
  nodeType: string;
  handles: readonly RepeatingInputHandleSlot[];
  className?: string;
};

export function RepeatingInputHandles({
  nodeId,
  nodeType,
  handles,
  className,
}: RepeatingInputHandlesProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const handleGeometrySignature = useMemo(
    () =>
      handles
        .map((handle) => `${handle.handleId}:${handle.topPercent}`)
        .join("|"),
    [handles],
  );

  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [handleGeometrySignature, nodeId, updateNodeInternals]);

  return (
    <>
      {handles.map((handle) => (
        <CanvasHandle
          key={handle.handleId}
          nodeId={nodeId}
          nodeType={nodeType}
          type="target"
          position={Position.Left}
          id={handle.handleId}
          isConnectable={!handle.isOccupied}
          style={{ top: `${handle.topPercent}%` }}
          className={className}
        />
      ))}
    </>
  );
}
