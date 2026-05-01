"use client";

/**
 * Onboarding note:
 * Renders Canvas edge UI for default edge. Keep visual treatment separate from persisted edge shape; graph writes belong in connection hooks and Convex mutations.
 */

import { useMemo, useState, type MouseEvent } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useViewport,
  type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";

const MIN_EDGE_INSERT_BUTTON_SCALE = 0.95;
const MAX_EDGE_INSERT_BUTTON_SCALE = 2.2;

function getEdgeInsertButtonScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return 1;
  }

  const inverseZoom = 1 / zoom;
  return Math.min(
    MAX_EDGE_INSERT_BUTTON_SCALE,
    Math.max(MIN_EDGE_INSERT_BUTTON_SCALE, inverseZoom),
  );
}

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
  const { zoom } = useViewport();

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
  const buttonScale = getEdgeInsertButtonScale(zoom);

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
          className="nodrag nopan absolute h-8 w-8 items-center justify-center rounded-full border-2 border-border/90 bg-background/95 text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.28)] ring-1 ring-background/90 transition-opacity transition-shadow"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(${buttonScale})`,
            transformOrigin: "center center",
            opacity: isInsertVisible ? 1 : 0,
            pointerEvents: isInsertVisible ? "all" : "none",
            display: "flex",
          }}
          onMouseEnter={() => setIsButtonHovered(true)}
          onMouseLeave={() => setIsButtonHovered(false)}
          onClick={handleInsertClick}
        >
          <Plus className="h-[18px] w-[18px] stroke-[2.5]" aria-hidden="true" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
