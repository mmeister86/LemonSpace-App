"use client";

import type { ReactNode } from "react";
import { NodeResizeControl, NodeToolbar, Position, useNodeId, useReactFlow } from "@xyflow/react";
import { Trash2, Copy } from "lucide-react";
import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { NodeErrorBoundary } from "./node-error-boundary";

interface ResizeConfig {
  minWidth: number;
  minHeight: number;
  keepAspectRatio?: boolean;
}

const RESIZE_CONFIGS: Record<string, ResizeConfig> = {
  frame: { minWidth: 200, minHeight: 150 },
  group: { minWidth: 150, minHeight: 100 },
  image: { minWidth: 140, minHeight: 120, keepAspectRatio: true },
  asset: { minWidth: 140, minHeight: 208, keepAspectRatio: false },
  "ai-image": { minWidth: 200, minHeight: 200 },
  compare: { minWidth: 300, minHeight: 200 },
  prompt: { minWidth: 260, minHeight: 220 },
  text: { minWidth: 220, minHeight: 90 },
  note: { minWidth: 200, minHeight: 90 },
};

const DEFAULT_CONFIG: ResizeConfig = { minWidth: 80, minHeight: 50 };

const CORNERS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

/** Internal fields to strip when duplicating a node */
const INTERNAL_FIELDS = new Set([
  "_status",
  "_statusMessage",
  "retryCount",
  "url",
  "canvasId",
]);

function NodeToolbarActions() {
  const nodeId = useNodeId();
  const { deleteElements, getNode, getNodes, setNodes } = useReactFlow();
  const { createNodeWithIntersection } = useCanvasPlacement();

  const handleDelete = () => {
    if (!nodeId) return;
    void deleteElements({ nodes: [{ id: nodeId }] });
  };

  const handleDuplicate = async () => {
    if (!nodeId) return;
    const node = getNode(nodeId);
    if (!node) return;

    // Strip internal/runtime fields, keep only user content
    const originalData = (node.data ?? {}) as Record<string, unknown>;
    const cleanedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(originalData)) {
      if (!INTERNAL_FIELDS.has(key)) {
        cleanedData[key] = value;
      }
    }

    const originalPosition = node.position ?? { x: 0, y: 0 };
    const width = typeof node.style?.width === "number" ? node.style.width : undefined;
    const height = typeof node.style?.height === "number" ? node.style.height : undefined;

    // Find the highest zIndex across all nodes to ensure the duplicate renders on top
    const allNodes = getNodes();
    const maxZIndex = allNodes.reduce(
      (max, n) => Math.max(max, n.zIndex ?? 0),
      0,
    );

    const createdNodeId = await createNodeWithIntersection({
      type: node.type ?? "text",
      position: {
        x: originalPosition.x + 50,
        y: originalPosition.y + 50,
      },
      width,
      height,
      data: cleanedData,
      zIndex: maxZIndex + 1,
    });

    const selectCreatedNode = (attempt = 0) => {
      const createdNode = getNode(createdNodeId);
      if (!createdNode) {
        if (attempt < 10) {
          requestAnimationFrame(() => selectCreatedNode(attempt + 1));
        }
        return;
      }

      setNodes((nodes) =>
        nodes.map((n) => {
          if (n.id === nodeId) {
            return { ...n, selected: false };
          }
          if (n.id === createdNodeId) {
            return { ...n, selected: true };
          }
          return n;
        }),
      );
    };

    selectCreatedNode();
  };

  const stopPropagation = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <NodeToolbar position={Position.Top} offset={8}>
      <div className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-md">
        <button
          type="button"
          onClick={(e) => { stopPropagation(e); handleDuplicate(); }}
          onPointerDown={stopPropagation}
          title="Duplicate"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          onClick={(e) => { stopPropagation(e); handleDelete(); }}
          onPointerDown={stopPropagation}
          title="Delete"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </NodeToolbar>
  );
}

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
  const config = RESIZE_CONFIGS[nodeType] ?? DEFAULT_CONFIG;

  const statusStyles: Record<string, string> = {
    idle: "",
    analyzing: "border-yellow-400 animate-pulse",
    clarifying: "border-amber-400",
    executing: "border-yellow-400 animate-pulse",
    done: "border-green-500",
    error: "border-red-500",
  };

  return (
    <div
      className={`
        h-full w-full rounded-xl border bg-card shadow-sm transition-shadow
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
      <NodeToolbarActions />
    </div>
  );
}
