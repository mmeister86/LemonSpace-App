"use client";

import { Handle, useConnection } from "@xyflow/react";

import { HANDLE_SNAP_RADIUS_PX } from "@/components/canvas/canvas-connection-magnetism";
import { useCanvasConnectionMagnetism } from "@/components/canvas/canvas-connection-magnetism-context";
import {
  canvasHandleAccentColor,
  canvasHandleAccentColorWithAlpha,
} from "@/lib/canvas-utils";
import { cn } from "@/lib/utils";

type ReactFlowHandleProps = React.ComponentProps<typeof Handle>;

type CanvasHandleProps = Omit<ReactFlowHandleProps, "id"> & {
  nodeId: string;
  nodeType?: string;
  id?: string;
};

function normalizeHandleId(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

export default function CanvasHandle({
  nodeId,
  nodeType,
  id,
  type,
  className,
  style,
  ...rest
}: CanvasHandleProps) {
  const connection = useConnection();
  const { activeTarget } = useCanvasConnectionMagnetism();

  const connectionState = connection as {
    inProgress?: boolean;
    fromNode?: unknown;
    toNode?: unknown;
    fromHandle?: unknown;
    toHandle?: unknown;
  };
  const hasConnectionPayload =
    connectionState.fromNode !== undefined ||
    connectionState.toNode !== undefined ||
    connectionState.fromHandle !== undefined ||
    connectionState.toHandle !== undefined;
  const isConnectionDragActive =
    connectionState.inProgress === true ||
    (connectionState.inProgress === undefined && hasConnectionPayload);

  const handleId = normalizeHandleId(id);
  const targetHandleId = normalizeHandleId(activeTarget?.handleId);
  const isActiveTarget =
    isConnectionDragActive &&
    activeTarget !== null &&
    activeTarget.nodeId === nodeId &&
    activeTarget.handleType === type &&
    targetHandleId === handleId;

  const glowState: "idle" | "near" | "snapped" = isActiveTarget
    ? activeTarget.distancePx <= HANDLE_SNAP_RADIUS_PX
      ? "snapped"
      : "near"
    : "idle";

  const accentColor = canvasHandleAccentColor({
    nodeType,
    handleId,
    handleType: type,
  });
  const glowAlpha = glowState === "snapped" ? 0.62 : glowState === "near" ? 0.4 : 0;
  const ringAlpha = glowState === "snapped" ? 0.34 : glowState === "near" ? 0.2 : 0;
  const glowSize = glowState === "snapped" ? 14 : glowState === "near" ? 10 : 0;
  const ringSize = glowState === "snapped" ? 6 : glowState === "near" ? 4 : 0;

  return (
    <Handle
      {...rest}
      id={id}
      type={type}
      className={cn(
        "!h-3 !w-3 !border-2 !border-background transition-[box-shadow,background-color] duration-150",
        className,
      )}
      style={{
        ...style,
        backgroundColor: accentColor,
        boxShadow:
          glowState === "idle"
            ? undefined
            : `0 0 0 ${ringSize}px ${canvasHandleAccentColorWithAlpha({ nodeType, handleId, handleType: type }, ringAlpha)}, 0 0 ${glowSize}px ${canvasHandleAccentColorWithAlpha({ nodeType, handleId, handleType: type }, glowAlpha)}`,
      }}
      data-node-id={nodeId}
      data-handle-id={id ?? ""}
      data-handle-type={type}
      data-glow-state={glowState}
    />
  );
}
