"use client";

/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas handle. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import { Handle, useConnection } from "@xyflow/react";

import {
  resolveCanvasGlowStrength,
} from "@/components/canvas/canvas-connection-magnetism";
import { useCanvasConnectionMagnetism } from "@/components/canvas/canvas-connection-magnetism-context";
import {
  canvasHandleAccentColor,
  canvasHandleGlowShadow,
  type EdgeGlowColorMode,
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
    isValid?: boolean | null;
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

  const toNodeId =
    connectionState.toNode &&
    typeof connectionState.toNode === "object" &&
    "id" in connectionState.toNode &&
    typeof (connectionState.toNode as { id?: unknown }).id === "string"
      ? ((connectionState.toNode as { id: string }).id ?? null)
      : null;

  const toHandleMeta =
    connectionState.toHandle && typeof connectionState.toHandle === "object"
      ? (connectionState.toHandle as { id?: string | null; type?: "source" | "target" })
      : null;
  const toHandleId = normalizeHandleId(
    toHandleMeta?.id === null ? undefined : toHandleMeta?.id,
  );
  const toHandleType =
    toHandleMeta?.type === "source" || toHandleMeta?.type === "target"
      ? toHandleMeta.type
      : null;

  const colorMode: EdgeGlowColorMode =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";

  const isActiveTarget =
    isConnectionDragActive &&
    activeTarget !== null &&
    activeTarget.nodeId === nodeId &&
    activeTarget.handleType === type &&
    targetHandleId === handleId;

  const isNativeHoverTarget =
    connectionState.inProgress === true &&
    toNodeId === nodeId &&
    toHandleType === type &&
    toHandleId === handleId;

  let glowStrength = 0;

  if (isActiveTarget) {
    glowStrength = resolveCanvasGlowStrength({
      distancePx: activeTarget.distancePx,
    });
  } else if (isNativeHoverTarget) {
    glowStrength = connectionState.isValid === true ? 1 : 0.68;
  }

  const glowState: "idle" | "near" | "snapped" =
    glowStrength <= 0 ? "idle" : glowStrength >= 0.96 ? "snapped" : "near";

  const accentColor = canvasHandleAccentColor({
    nodeType,
    handleId,
    handleType: type,
  });
  const boxShadow = canvasHandleGlowShadow({
    nodeType,
    handleId,
    handleType: type,
    strength: glowStrength,
    colorMode,
  });

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
        boxShadow,
      }}
      data-node-id={nodeId}
      data-handle-id={id ?? ""}
      data-handle-type={type}
      data-glow-state={glowState}
      data-glow-strength={glowStrength.toFixed(3)}
      data-glow-mode={colorMode}
    />
  );
}
