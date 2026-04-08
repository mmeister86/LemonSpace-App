"use client";

import type { ReactNode } from "react";
import {
  getConnectedEdges,
  NodeResizeControl,
  NodeToolbar,
  Position,
  useNodeId,
  useReactFlow,
} from "@xyflow/react";
import { Trash2, Copy } from "lucide-react";
import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { isCanvasNodeType } from "@/lib/canvas-node-types";
import { NodeErrorBoundary } from "./node-error-boundary";

interface ResizeConfig {
  minWidth: number;
  minHeight: number;
  keepAspectRatio?: boolean;
}

export interface NodeToolbarAction {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

const RESIZE_CONFIGS: Record<string, ResizeConfig> = {
  frame: { minWidth: 200, minHeight: 150 },
  group: { minWidth: 150, minHeight: 100 },
  image: { minWidth: 140, minHeight: 120, keepAspectRatio: true },
  asset: { minWidth: 200, minHeight: 240, keepAspectRatio: false },
  video: { minWidth: 200, minHeight: 120, keepAspectRatio: true },
  // Chrome 88 + min. Viewport 120 → äußere Mindesthöhe 208 (siehe canvas onNodesChange)
  "ai-image": { minWidth: 200, minHeight: 208, keepAspectRatio: false },
  compare: { minWidth: 300, minHeight: 200 },
  prompt: { minWidth: 260, minHeight: 220 },
  curves: { minWidth: 300, minHeight: 620 },
  "color-adjust": { minWidth: 300, minHeight: 760 },
  "light-adjust": { minWidth: 300, minHeight: 860 },
  "detail-adjust": { minWidth: 300, minHeight: 820 },
  crop: { minWidth: 320, minHeight: 520 },
  render: { minWidth: 260, minHeight: 300, keepAspectRatio: true },
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
  "lastRenderedAt",
  "lastRenderedHash",
  "lastRenderWidth",
  "lastRenderHeight",
  "lastRenderFormat",
  "lastRenderMimeType",
  "lastRenderSizeBytes",
  "lastRenderQuality",
  "lastRenderSourceWidth",
  "lastRenderSourceHeight",
  "lastRenderWasSizeClamped",
  "lastRenderError",
  "lastRenderErrorHash",
]);

function NodeToolbarActions({
  actions = [],
}: {
  actions?: NodeToolbarAction[];
}) {
  const nodeId = useNodeId();
  const { deleteElements, getNode, getNodes, getEdges, setNodes } = useReactFlow();
  const { createNodeWithIntersection } = useCanvasPlacement();
  const handleDelete = () => {
    if (!nodeId) return;
    const node = getNode(nodeId);
    const resolvedNode =
      node ??
      (() => {
        const selectedNodes = getNodes().filter((candidate) => candidate.selected);
        if (selectedNodes.length !== 1) return undefined;
        return selectedNodes[0];
      })();
    const targetNodeId = resolvedNode?.id ?? nodeId;

    const connectedEdges = resolvedNode
      ? getConnectedEdges([resolvedNode], getEdges())
      : [];
    void deleteElements({
      nodes: [{ id: targetNodeId }],
      edges: connectedEdges.map((edge) => ({ id: edge.id })),
    }).catch((error: unknown) => {
      console.error("[NodeToolbar] deleteElements failed", {
        nodeId: targetNodeId,
        error: String(error),
      });
    });
  };

  const handleDuplicate = () => {
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

    // Deselect source node immediately for instant visual feedback
    setNodes((nodes) =>
      nodes.map((n) =>
        n.id === nodeId ? { ...n, selected: false } : n,
      ),
    );

    // Fire-and-forget: optimistic update makes the duplicate appear instantly
    void createNodeWithIntersection({
      type:
        typeof node.type === "string" && isCanvasNodeType(node.type)
          ? node.type
          : "text",
      position: {
        x: originalPosition.x + 50,
        y: originalPosition.y + 50,
      },
      width,
      height,
      data: cleanedData,
      zIndex: maxZIndex + 1,
      clientRequestId: crypto.randomUUID(),
    });
  };

  const stopPropagation = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <NodeToolbar position={Position.Top} offset={8}>
      <div className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-md">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={(e) => {
              stopPropagation(e);
              action.onClick();
            }}
            onPointerDown={stopPropagation}
            title={action.label}
            disabled={action.disabled}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${action.className ?? ""}`}
          >
            {action.icon}
          </button>
        ))}
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
  toolbarActions?: NodeToolbarAction[];
  children: ReactNode;
  className?: string;
}

export default function BaseNodeWrapper({
  nodeType,
  selected,
  status = "idle",
  statusMessage,
  toolbarActions,
  children,
  className = "",
}: BaseNodeWrapperProps) {
  const config = RESIZE_CONFIGS[nodeType] ?? DEFAULT_CONFIG;

  const statusStyles: Record<string, string> = {
    idle: "",
    analyzing: "border-yellow-400 animate-pulse",
    clarifying: "border-amber-400",
    executing: "border-yellow-400 animate-pulse",
    rendering: "border-yellow-400 animate-pulse",
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
      <NodeToolbarActions actions={toolbarActions} />
    </div>
  );
}
