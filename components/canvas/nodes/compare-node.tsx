"use client";

import { useCallback, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ImageIcon } from "lucide-react";
import BaseNodeWrapper from "./base-node-wrapper";

interface CompareNodeData {
  leftUrl?: string;
  rightUrl?: string;
  leftLabel?: string;
  rightLabel?: string;
}

export default function CompareNode({ data, selected }: NodeProps) {
  const nodeData = data as CompareNodeData;
  const [sliderX, setSliderX] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasLeft = !!nodeData.leftUrl;
  const hasRight = !!nodeData.rightUrl;

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();

    const move = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min(1, (moveEvent.clientX - rect.left) / rect.width),
      );
      setSliderX(x * 100);
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    event.stopPropagation();

    const move = (moveEvent: TouchEvent) => {
      if (!containerRef.current || moveEvent.touches.length === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const touch = moveEvent.touches[0];
      const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      setSliderX(x * 100);
    };

    const end = () => {
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };

    window.addEventListener("touchmove", move);
    window.addEventListener("touchend", end);
  }, []);

  return (
    <BaseNodeWrapper selected={selected} className="w-[500px] p-0">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground">⚖️ Compare</div>

      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ top: "35%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-blue-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="right"
        style={{ top: "55%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="compare-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />

      <div
        ref={containerRef}
        className="nodrag relative h-[320px] w-[500px] select-none overflow-hidden rounded-b-xl bg-muted"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {!hasLeft && !hasRight && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-30" />
            <p className="px-8 text-center text-xs opacity-60">
              Connect two image nodes - left handle (blue) and right handle (green)
            </p>
          </div>
        )}

        {hasRight && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nodeData.rightUrl}
            alt={nodeData.rightLabel ?? "Right"}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        )}

        {hasLeft && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ width: `${sliderX}%` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={nodeData.leftUrl}
              alt={nodeData.leftLabel ?? "Left"}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ width: "500px", maxWidth: "none" }}
              draggable={false}
            />
          </div>
        )}

        {hasLeft && hasRight && (
          <>
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-white shadow-md"
              style={{ left: `${sliderX}%` }}
            />
            <div
              className="pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${sliderX}%` }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white shadow-lg">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M5 8H1M11 8H15M5 5L2 8L5 11M11 5L14 8L11 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </>
        )}

        {hasLeft && (
          <div className="pointer-events-none absolute left-2 top-2 z-10">
            <span className="rounded bg-blue-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              {nodeData.leftLabel ?? "Before"}
            </span>
          </div>
        )}

        {hasRight && (
          <div className="pointer-events-none absolute right-2 top-2 z-10">
            <span className="rounded bg-emerald-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              {nodeData.rightLabel ?? "After"}
            </span>
          </div>
        )}
      </div>
    </BaseNodeWrapper>
  );
}
