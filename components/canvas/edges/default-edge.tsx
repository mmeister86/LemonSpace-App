"use client";

import { useMemo, useState, type MouseEvent } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";

export type DefaultEdgeInsertAnchor = {
  edgeId: string;
  screenX: number;
  screenY: number;
};

export type DefaultEdgeProps = EdgeProps & {
  edgeId?: string;
  isMenuOpen?: boolean;
  disabled?: boolean;
  onInsertClick?: (anchor: DefaultEdgeInsertAnchor) => void;
};

export default function DefaultEdge({
  id,
  edgeId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  interactionWidth,
  isMenuOpen = false,
  disabled = false,
  onInsertClick,
}: DefaultEdgeProps) {
  const [isEdgeHovered, setIsEdgeHovered] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);

  const [edgePath, labelX, labelY] = useMemo(
    () =>
      getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      }),
    [sourcePosition, sourceX, sourceY, targetPosition, targetX, targetY],
  );

  const resolvedEdgeId = edgeId ?? id;
  const canInsert = Boolean(onInsertClick) && !disabled;
  const isInsertVisible = canInsert && (isMenuOpen || isEdgeHovered || isButtonHovered);

  const handleInsertClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onInsertClick || disabled) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    onInsertClick({
      edgeId: resolvedEdgeId,
      screenX: rect.left + rect.width / 2,
      screenY: rect.top + rect.height / 2,
    });
  };

  return (
    <>
      <g
        data-testid="default-edge"
        onMouseEnter={() => setIsEdgeHovered(true)}
        onMouseLeave={() => setIsEdgeHovered(false)}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          style={style}
          markerStart={markerStart}
          markerEnd={markerEnd}
          interactionWidth={interactionWidth}
        />
      </g>

      <EdgeLabelRenderer>
        <button
          type="button"
          data-testid="default-edge-insert-button"
          data-visible={isInsertVisible ? "true" : "false"}
          aria-label="Insert node"
          aria-hidden={!isInsertVisible}
          disabled={!canInsert}
          className="nodrag nopan absolute h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-opacity"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            opacity: isInsertVisible ? 1 : 0,
            pointerEvents: isInsertVisible ? "all" : "none",
            display: "flex",
          }}
          onMouseEnter={() => setIsButtonHovered(true)}
          onMouseLeave={() => setIsButtonHovered(false)}
          onClick={handleInsertClick}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
