"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas mixer overlay resize handles node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { MouseEvent as ReactMouseEvent } from "react";

import type { FrameHandle } from "./mixer-types";

const OVERLAY_RESIZE_HANDLES: Array<{ corner: FrameHandle; cursor: string }> = [
  { corner: "nw", cursor: "nwse-resize" },
  { corner: "n", cursor: "ns-resize" },
  { corner: "ne", cursor: "nesw-resize" },
  { corner: "e", cursor: "ew-resize" },
  { corner: "se", cursor: "nwse-resize" },
  { corner: "s", cursor: "ns-resize" },
  { corner: "sw", cursor: "nesw-resize" },
  { corner: "w", cursor: "ew-resize" },
];

export function MixerOverlayResizeHandles({
  resizeHandleRect,
  onResizeHandleMouseDown,
}: {
  resizeHandleRect: { left: number; top: number; width: number; height: number };
  onResizeHandleMouseDown: (event: ReactMouseEvent<HTMLDivElement>, handle: FrameHandle) => void;
}) {
  return (
    <>
      {OVERLAY_RESIZE_HANDLES.map(({ corner, cursor }) => (
        <div
          key={corner}
          role="button"
          tabIndex={-1}
          data-testid={`mixer-resize-${corner}`}
          data-interaction-role="frame-resize-handle"
          data-anchor-source="frame"
          data-resize-corner={corner}
          className="absolute z-10 h-3 w-3 rounded-full border border-white/80 bg-foreground/80 nodrag nopan"
          onMouseDown={(event) => onResizeHandleMouseDown(event, corner)}
          style={{
            left: `${(
              corner.includes("w")
                ? resizeHandleRect.left
                : corner.includes("e")
                  ? resizeHandleRect.left + resizeHandleRect.width
                  : resizeHandleRect.left + resizeHandleRect.width / 2
            ) * 100}%`,
            top: `${(
              corner.includes("n")
                ? resizeHandleRect.top
                : corner.includes("s")
                  ? resizeHandleRect.top + resizeHandleRect.height
                  : resizeHandleRect.top + resizeHandleRect.height / 2
            ) * 100}%`,
            transform: "translate(-50%, -50%)",
            cursor,
          }}
        />
      ))}
    </>
  );
}
