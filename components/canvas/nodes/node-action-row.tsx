"use client";

import { type CSSProperties, type ReactNode } from "react";
import { getConnectedEdges, useReactFlow } from "@xyflow/react";
import { Copy, Eye, EyeOff, Maximize2, Minimize2, Star, Trash2 } from "lucide-react";

import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import type { Id } from "@/convex/_generated/dataModel";
import {
  COLLAPSED_NODE_HEIGHT,
  readNodeBypassed,
  readNodeCollapsed,
  readNodeExpandedSize,
  readNodeFavorite,
  setNodeBypassed,
  setNodeCollapsed,
  setNodeFavorite,
} from "@/lib/canvas-node-favorite";
import { isCanvasNodeType } from "@/lib/canvas-node-types";
import { cn } from "@/lib/utils";

export interface NodeToolbarAction {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

const NON_COLLAPSIBLE_NODE_TYPES = new Set(["group", "frame"]);

/** Internal fields to strip when duplicating a node */
const INTERNAL_FIELDS = new Set([
  "_status",
  "_statusMessage",
  "_groupDropTarget",
  "_uploadState",
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

function isNodeCollapseAllowed(nodeType: string): boolean {
  return !NON_COLLAPSIBLE_NODE_TYPES.has(nodeType);
}

function numericDimension(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function withLocalNodeVisualSize<
  T extends {
    style?: CSSProperties;
    width?: unknown;
    height?: unknown;
    measured?: unknown;
  },
>(node: T, width: number, height: number): T {
  const next = {
    ...node,
    width,
    height,
    measured: {
      width,
      height,
    },
    style: {
      ...(node.style ?? {}),
      width,
      height,
    },
  };
  return next;
}

export function NodeActionRow({
  nodeId,
  nodeType,
  actions = [],
  includeCustomActions = true,
  variant = "floating",
  className,
  testId,
}: {
  nodeId: string;
  nodeType: string;
  actions?: NodeToolbarAction[];
  includeCustomActions?: boolean;
  variant?: "floating" | "drawer";
  className?: string;
  testId?: string;
}) {
  const { deleteElements, getNode, getNodes, getEdges, setNodes } = useReactFlow();
  const { createNodeWithIntersection } = useCanvasPlacement();
  const { queueNodeDataUpdate, queueNodeResize } = useCanvasSync();
  const currentData = getNode(nodeId)?.data;
  const isBypassed = readNodeBypassed(currentData);
  const isCollapsed = readNodeCollapsed(currentData);
  const isFavorite = readNodeFavorite(currentData);
  const canCollapse = isNodeCollapseAllowed(nodeType);

  const handleBypassToggle = () => {
    const currentNodeData = getNode(nodeId)?.data;
    const nextData = setNodeBypassed(!readNodeBypassed(currentNodeData), currentNodeData);
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: nextData,
            }
          : node,
      ),
    );
    void queueNodeDataUpdate({
      nodeId: nodeId as Id<"nodes">,
      data: nextData,
    });
  };

  const handleCollapseToggle = () => {
    if (!canCollapse) return;
    const node = getNode(nodeId);
    const currentNodeData = node?.data;

    if (readNodeCollapsed(currentNodeData)) {
      const expandedSize = readNodeExpandedSize(currentNodeData);
      const nextData = setNodeCollapsed(false, currentNodeData);
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === nodeId
            ? expandedSize
              ? {
                  ...withLocalNodeVisualSize(
                    node,
                    expandedSize.width,
                    expandedSize.height,
                  ),
                  data: nextData,
                }
              : {
                  ...node,
                  data: nextData,
                }
            : node,
        ),
      );
      void queueNodeDataUpdate({
        nodeId: nodeId as Id<"nodes">,
        data: nextData,
      });
      if (expandedSize) {
        void queueNodeResize({
          nodeId: nodeId as Id<"nodes">,
          width: expandedSize.width,
          height: expandedSize.height,
        });
      }
      return;
    }

    const currentWidth =
      numericDimension(node?.style?.width) ??
      numericDimension(node?.measured?.width);
    const currentHeight =
      numericDimension(node?.style?.height) ??
      numericDimension(node?.measured?.height);
    if (currentWidth === undefined || currentHeight === undefined) {
      return;
    }

    const nextData = setNodeCollapsed(true, currentNodeData, {
      width: currentWidth,
      height: currentHeight,
    });
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...withLocalNodeVisualSize(node, currentWidth, COLLAPSED_NODE_HEIGHT),
              data: nextData,
            }
          : node,
      ),
    );
    void queueNodeDataUpdate({
      nodeId: nodeId as Id<"nodes">,
      data: nextData,
    });
    void queueNodeResize({
      nodeId: nodeId as Id<"nodes">,
      width: currentWidth,
      height: COLLAPSED_NODE_HEIGHT,
    });
  };

  const handleFavoriteToggle = () => {
    const currentNodeData = getNode(nodeId)?.data;
    const nextData = setNodeFavorite(!readNodeFavorite(currentNodeData), currentNodeData);
    void queueNodeDataUpdate({
      nodeId: nodeId as Id<"nodes">,
      data: nextData,
    });
  };

  const handleDelete = () => {
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
    const node = getNode(nodeId);
    if (!node) return;

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

    const allNodes = getNodes();
    const maxZIndex = allNodes.reduce(
      (max, candidate) => Math.max(max, candidate.zIndex ?? 0),
      0,
    );

    setNodes((nodes) =>
      nodes.map((candidate) =>
        candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
      ),
    );

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

  const stopPropagation = (event: React.MouseEvent | React.PointerEvent) => {
    event.stopPropagation();
  };

  const customActions = includeCustomActions ? actions : [];
  const showLabels = variant === "drawer";
  const buttonClassName = cn(
    "flex h-7 items-center justify-center overflow-hidden rounded-md transition-colors",
    showLabels ? "min-w-0 gap-1 px-1.5 text-xs" : "w-7 shrink-0",
  );

  return (
    <div
      data-testid={testId}
      className={cn(
        variant === "drawer"
          ? "grid w-full min-w-0 grid-cols-5 items-center gap-1 rounded-none border-0 bg-transparent p-0 shadow-none"
          : "flex items-center gap-1 rounded-lg border bg-card p-1 shadow-md",
        className,
      )}
    >
      {customActions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={(event) => {
            stopPropagation(event);
            action.onClick();
          }}
          onPointerDown={stopPropagation}
          title={action.label}
          disabled={action.disabled}
          className={cn(
            buttonClassName,
            "text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
            action.className,
          )}
        >
          {action.icon}
          {showLabels ? <span className="min-w-0 truncate">{action.label}</span> : null}
        </button>
      ))}
      {canCollapse ? (
        <button
          type="button"
          onClick={(event) => {
            stopPropagation(event);
            handleCollapseToggle();
          }}
          onPointerDown={stopPropagation}
          title={isCollapsed ? "Expand" : "Collapse"}
          aria-label={isCollapsed ? "Expand" : "Collapse"}
          aria-pressed={isCollapsed}
          className={cn(
            buttonClassName,
            isCollapsed
              ? "bg-accent text-foreground hover:bg-accent"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {isCollapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          {showLabels ? (
            <span className="min-w-0 truncate">
              {isCollapsed ? "Aufklappen" : "Einklappen"}
            </span>
          ) : null}
        </button>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          stopPropagation(event);
          handleBypassToggle();
        }}
        onPointerDown={stopPropagation}
        title={isBypassed ? "Einblenden" : "Ausblenden"}
        aria-label={isBypassed ? "Einblenden" : "Ausblenden"}
        aria-pressed={isBypassed}
        className={cn(
          buttonClassName,
          isBypassed
            ? "bg-accent text-foreground hover:bg-accent"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {isBypassed ? <EyeOff size={14} /> : <Eye size={14} />}
        {showLabels ? (
          <span className="min-w-0 truncate">
            {isBypassed ? "Einblenden" : "Ausblenden"}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={(event) => {
          stopPropagation(event);
          handleFavoriteToggle();
        }}
        onPointerDown={stopPropagation}
        title="Favorite"
        className={cn(
          buttonClassName,
          isFavorite
            ? "bg-(--node-favorite-fill) text-(--node-favorite-ring) hover:bg-(--node-favorite-fill)"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Star size={14} className={isFavorite ? "fill-current" : ""} />
        {showLabels ? <span className="min-w-0 truncate">Favorit</span> : null}
      </button>
      <button
        type="button"
        onClick={(event) => {
          stopPropagation(event);
          handleDuplicate();
        }}
        onPointerDown={stopPropagation}
        title="Duplicate"
        className={cn(
          buttonClassName,
          "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Copy size={14} />
        {showLabels ? <span className="min-w-0 truncate">Duplizieren</span> : null}
      </button>
      <button
        type="button"
        onClick={(event) => {
          stopPropagation(event);
          handleDelete();
        }}
        onPointerDown={stopPropagation}
        title="Delete"
        className={cn(
          buttonClassName,
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        <Trash2 size={14} />
        {showLabels ? <span className="min-w-0 truncate">Löschen</span> : null}
      </button>
    </div>
  );
}
