"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { NodeResizeControl, type ShouldResize } from "@xyflow/react";
import { NodeErrorBoundary } from "./node-error-boundary";

interface ResizeConfig {
  minWidth: number;
  minHeight: number;
  keepAspectRatio?: boolean;
  contentAware?: boolean;
}

const RESIZE_CONFIGS: Record<string, ResizeConfig> = {
  frame: { minWidth: 200, minHeight: 150 },
  group: { minWidth: 150, minHeight: 100 },
  image: { minWidth: 100, minHeight: 80, keepAspectRatio: true },
  asset: { minWidth: 100, minHeight: 80, keepAspectRatio: true },
  "ai-image": { minWidth: 200, minHeight: 200 },
  compare: { minWidth: 300, minHeight: 200 },
  prompt: { minWidth: 240, minHeight: 200, contentAware: true },
  text: { minWidth: 180, minHeight: 80, contentAware: true },
  note: { minWidth: 160, minHeight: 80, contentAware: true },
};

const DEFAULT_CONFIG: ResizeConfig = { minWidth: 80, minHeight: 50, contentAware: true };

const CORNERS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

interface BaseNodeWrapperProps {
  nodeType: string;
  selected?: boolean;
  status?: string;
  statusMessage?: string;
  children: ReactNode;
  className?: string;
}

export default function BaseNodeWrapper({
  nodeType,
  selected,
  status = "idle",
  statusMessage,
  children,
  className = "",
}: BaseNodeWrapperProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const config = RESIZE_CONFIGS[nodeType] ?? DEFAULT_CONFIG;

  const statusStyles: Record<string, string> = {
    idle: "",
    analyzing: "border-yellow-400 animate-pulse",
    clarifying: "border-amber-400",
    executing: "border-yellow-400 animate-pulse",
    done: "border-green-500",
    error: "border-red-500",
  };

  const shouldResize: ShouldResize = useCallback(
    (event, params) => {
      if (!wrapperRef.current || !config.contentAware) return true;

      const contentEl = wrapperRef.current;
      const paddingX =
        parseFloat(getComputedStyle(contentEl).paddingLeft) +
        parseFloat(getComputedStyle(contentEl).paddingRight);
      const paddingY =
        parseFloat(getComputedStyle(contentEl).paddingTop) +
        parseFloat(getComputedStyle(contentEl).paddingBottom);

      const minW = Math.max(
        config.minWidth,
        contentEl.scrollWidth - paddingX + paddingX * 0.5,
      );
      const minH = Math.max(
        config.minHeight,
        contentEl.scrollHeight - paddingY + paddingY * 0.5,
      );

      return params.width >= minW && params.height >= minH;
    },
    [config],
  );

  return (
    <div
      ref={wrapperRef}
      className={`
        rounded-xl border bg-card shadow-sm transition-shadow
        ${selected ? "ring-2 ring-primary shadow-md" : ""}
        ${statusStyles[status] ?? ""}
        ${className}
      `}
    >
      {selected &&
        CORNERS.map((corner) => (
          <NodeResizeControl
            key={corner}
            position={corner}
            minWidth={config.minWidth}
            minHeight={config.minHeight}
            keepAspectRatio={config.keepAspectRatio}
            shouldResize={shouldResize}
            style={{
              background: "none",
              border: "none",
              width: 12,
              height: 12,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="text-primary/70"
            >
              <path
                d={
                  corner === "bottom-right"
                    ? "M11 5V11H5"
                    : corner === "bottom-left"
                      ? "M1 5V11H7"
                      : corner === "top-right"
                        ? "M11 7V1H5"
                        : "M1 7V1H7"
                }
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={
                  corner === "bottom-right" || corner === "top-right"
                    ? "11"
                    : "1"
                }
                cy={
                  corner === "bottom-right" || corner === "bottom-left"
                    ? "11"
                    : "1"
                }
                r="1.5"
                fill="currentColor"
              />
            </svg>
          </NodeResizeControl>
        ))}
      <NodeErrorBoundary nodeType={nodeType}>{children}</NodeErrorBoundary>
      {status === "error" && statusMessage && (
        <div className="px-3 pb-2 text-xs text-red-500 truncate">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
