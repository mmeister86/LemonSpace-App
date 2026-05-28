"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas base node wrapper node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  NodeResizeControl,
  NodeToolbar,
  Position,
  useNodeId,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { logCanvasDebug } from "@/components/canvas/canvas-debug";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCollapsedNodeDrawerToolbar } from "@/components/canvas/collapsed-node-drawer-toolbar-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import {
  computeContentAwareNodeMinimumSize,
  getCanvasNodeResizeConfig,
  growNodeDimensionsToMinimum,
  resolveNextContentMinimumSize,
  type NodeMinimumSize,
} from "@/components/canvas/canvas-node-size-helpers";
import type { Id } from "@/convex/_generated/dataModel";
import { NODE_HANDLE_MAP } from "@/lib/canvas-utils";
import {
  readNodeBypassed,
  readNodeCollapsed,
  readNodeFavorite,
} from "@/lib/canvas-node-favorite";
import { NodeErrorBoundary } from "./node-error-boundary";
import { NodeActionRow, type NodeToolbarAction } from "./node-action-row";
export type { NodeToolbarAction } from "./node-action-row";

const CORNERS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;
const NON_COLLAPSIBLE_NODE_TYPES = new Set(["group", "frame"]);

const NODE_TYPE_LABELS: Record<string, string> = {
  image: "Bild",
  text: "Text",
  prompt: "KI-Bild",
  "video-prompt": "KI-Video",
  "ai-image": "KI-Bild-Ausgabe",
  "ai-text": "KI-Text",
  "ai-text-output": "KI-Text-Ausgabe",
  "ai-video": "KI-Video-Ausgabe",
  note: "Notiz",
  comment: "Kommentar",
  compare: "Vergleich",
  asset: "Asset",
  video: "Video",
  "asset-video": "Video-Asset",
  curves: "Kurven",
  "color-adjust": "Farbe",
  "light-adjust": "Licht",
  "detail-adjust": "Detail",
  crop: "Crop / Resize",
  "bg-remove": "BG entfernen",
  upscale: "Upscale",
  "style-transfer": "Style Transfer",
  "face-restore": "Gesicht",
  "change-camera": "Kamera ändern",
  render: "Render",
  agent: "Instagram Agent",
  mixer: "Mixer / Merge",
  "agent-output": "Agent-Ausgabe",
};

type CollapsedHandleSpec = {
  handleType: "source" | "target";
  handleId?: string;
  topPercent: number;
};

function isNodeCollapseAllowed(nodeType: string): boolean {
  return !NON_COLLAPSIBLE_NODE_TYPES.has(nodeType);
}

function normalizeHandleId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "" || value === "null") {
    return undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function resolveHandleTopPercent(index: number, count: number): number {
  if (count <= 1) return 50;
  return 25 + (50 * (index + 1)) / (count + 1);
}

function buildCollapsedHandleSpecs(args: {
  nodeId?: string;
  nodeType: string;
  edges: Array<{
    source?: string;
    target?: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
}): CollapsedHandleSpec[] {
  if (!args.nodeId) return [];

  const defaults = NODE_HANDLE_MAP[args.nodeType] ?? {};
  const targets = new Map<string, string | undefined>();
  const sources = new Map<string, string | undefined>();
  const addHandle = (
    map: Map<string, string | undefined>,
    handleId: string | undefined,
  ) => {
    map.set(handleId ?? "__default__", handleId);
  };

  if ("target" in defaults) {
    addHandle(targets, defaults.target);
  }
  if ("source" in defaults) {
    addHandle(sources, defaults.source);
  }

  for (const edge of args.edges) {
    if (edge.target === args.nodeId) {
      addHandle(targets, normalizeHandleId(edge.targetHandle));
    }
    if (edge.source === args.nodeId) {
      addHandle(sources, normalizeHandleId(edge.sourceHandle));
    }
  }

  const targetSpecs = Array.from(targets.values()).map((handleId, index, list) => ({
    handleType: "target" as const,
    handleId,
    topPercent: resolveHandleTopPercent(index, list.length),
  }));
  const sourceSpecs = Array.from(sources.values()).map((handleId, index, list) => ({
    handleType: "source" as const,
    handleId,
    topPercent: resolveHandleTopPercent(index, list.length),
  }));

  return [...targetSpecs, ...sourceSpecs];
}

function resolveCollapsedNodeLabel(nodeType: string, data: unknown): string {
  const source =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const candidates = [
    source.label,
    source.title,
    source.filename,
    source.name,
    source.templateName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  if (source.templateId === "instagram-post-agent") {
    return "Instagram Post Agent";
  }
  return NODE_TYPE_LABELS[nodeType] ?? nodeType;
}

function FavoriteNodeBacklight() {
  return (
    <div
      data-testid="canvas-favorite-node-backlight"
      className="absolute -inset-6 rounded-[inherit] bg-primary/20 opacity-80 blur-2xl dark:bg-primary/25"
    />
  );
}

function numericDimension(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function measureAutosizeContentBoundsHeight(root: HTMLElement): number | undefined {
  const probes = root.querySelectorAll<HTMLElement>("[data-canvas-node-autosize-content]");
  if (probes.length === 0) {
    return undefined;
  }

  const rootRect = root.getBoundingClientRect();
  const scaleY =
    rootRect.height > 0 && root.offsetHeight > 0
      ? rootRect.height / root.offsetHeight
      : 1;
  let maxBottom = 0;
  probes.forEach((probe) => {
    const probeRect = probe.getBoundingClientRect();
    const rawBottom = probeRect.bottom - rootRect.top;
    const bottom = scaleY > 0 ? rawBottom / scaleY : rawBottom;
    if (Number.isFinite(bottom) && bottom > maxBottom) {
      maxBottom = bottom;
    }
  });

  return maxBottom > 0 ? Math.ceil(maxBottom) : undefined;
}

function NodeToolbarActions({
  nodeType,
  actions = [],
}: {
  nodeType: string;
  actions?: NodeToolbarAction[];
}) {
  const nodeId = useNodeId();
  const { getNode } = useReactFlow();
  const { activeToolbarNodeId } = useCollapsedNodeDrawerToolbar();
  const currentData = nodeId ? getNode(nodeId)?.data : undefined;
  const isCollapsed = readNodeCollapsed(currentData);
  if (!nodeId) return null;
  if (isCollapsed && activeToolbarNodeId === nodeId) return null;

  return (
    <NodeToolbar position={Position.Top} offset={8}>
      <NodeActionRow
        nodeId={nodeId}
        nodeType={nodeType}
        actions={actions}
        className="relative z-30"
      />
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
  backlight?: ReactNode;
  dataOnboarding?: string;
}

export default function BaseNodeWrapper({
  nodeType,
  selected,
  status = "idle",
  statusMessage,
  toolbarActions,
  children,
  className = "",
  backlight,
  dataOnboarding,
}: BaseNodeWrapperProps) {
  const config = getCanvasNodeResizeConfig(nodeType);
  const [contentMinimumSize, setContentMinimumSize] = useState<NodeMinimumSize>({
    minWidth: config.minWidth,
    minHeight: config.minHeight,
  });
  const contentMinimumSizeRef = useRef<NodeMinimumSize>({
    minWidth: config.minWidth,
    minHeight: config.minHeight,
  });
  const nodeChromeRef = useRef<HTMLDivElement | null>(null);
  const nodeMeasureRef = useRef<HTMLDivElement | null>(null);
  const pendingMeasureFrameRef = useRef<number | null>(null);
  const lastQueuedAutoSizeRef = useRef<{ width: number; height: number } | null>(null);
  const nodeId = useNodeId();
  const { getNode } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useStore((store) => store.edges);
  const { queueNodeResize } = useCanvasSync();
  const currentData = nodeId ? getNode(nodeId)?.data : undefined;
  const isBypassed = readNodeBypassed(currentData);
  const isCollapsed = isNodeCollapseAllowed(nodeType) && readNodeCollapsed(currentData);
  const isFavorite = readNodeFavorite(currentData);
  const favoriteBacklight = isFavorite ? (backlight ?? <FavoriteNodeBacklight />) : undefined;
  const collapsedLabel = resolveCollapsedNodeLabel(nodeType, currentData);
  const collapsedHandleSpecs = useMemo(
    () =>
      buildCollapsedHandleSpecs({
        nodeId: nodeId ?? undefined,
        nodeType,
        edges,
      }),
    [edges, nodeId, nodeType],
  );
  const collapsedHandleSignature = collapsedHandleSpecs
    .map((handle) => `${handle.handleType}:${handle.handleId ?? ""}:${handle.topPercent}`)
    .join("|");
  const resizeMinimum = {
    minWidth: Math.max(config.minWidth, contentMinimumSize.minWidth),
    minHeight: Math.max(config.minHeight, contentMinimumSize.minHeight),
  };

  const measureAndGrowNode = useCallback(() => {
    if (isCollapsed) return;
    const chrome = nodeChromeRef.current;
    const measuredRoot = nodeMeasureRef.current;
    if (!chrome || !measuredRoot) return;

    const measuredMinimum = computeContentAwareNodeMinimumSize({
      nodeType,
      scrollWidth: measuredRoot.scrollWidth,
      scrollHeight: measuredRoot.scrollHeight,
      clientWidth: measuredRoot.clientWidth,
      clientHeight: measuredRoot.clientHeight,
      contentBoundsHeight: measureAutosizeContentBoundsHeight(measuredRoot),
    });
    const nextContentMinimum = resolveNextContentMinimumSize(
      contentMinimumSizeRef.current,
      measuredMinimum,
    );
    const minimum = nextContentMinimum ?? contentMinimumSizeRef.current;

    if (nextContentMinimum) {
      contentMinimumSizeRef.current = nextContentMinimum;
      setContentMinimumSize(nextContentMinimum);
    }

    if (!nodeId) return;

    const node = getNode(nodeId);
    const currentWidth =
      numericDimension(node?.style?.width) ??
      numericDimension(node?.measured?.width) ??
      numericDimension(chrome.clientWidth);
    const currentHeight =
      numericDimension(node?.style?.height) ??
      numericDimension(node?.measured?.height) ??
      numericDimension(chrome.clientHeight);

    if (currentWidth === undefined || currentHeight === undefined) {
      return;
    }

    const nextSize = growNodeDimensionsToMinimum({
      width: currentWidth,
      height: currentHeight,
      minimum,
    });
    if (!nextSize) {
      lastQueuedAutoSizeRef.current = null;
      return;
    }

    const lastQueued = lastQueuedAutoSizeRef.current;
    if (
      lastQueued?.width === nextSize.width &&
      lastQueued.height === nextSize.height &&
      currentWidth >= nextSize.width &&
      currentHeight >= nextSize.height
    ) {
      return;
    }

    lastQueuedAutoSizeRef.current = nextSize;
    const contentBoundsHeight = measureAutosizeContentBoundsHeight(measuredRoot);
    logCanvasDebug(
      "autosize-queue-resize",
      {
        nodeId,
        nodeType,
        currentSize: { width: currentWidth, height: currentHeight },
        nextSize,
        minimum,
        measuredMinimum,
        nextContentMinimum,
        nodeStyle: node?.style ?? null,
        nodeMeasured: node?.measured ?? null,
        chrome: {
          clientWidth: chrome.clientWidth,
          clientHeight: chrome.clientHeight,
          scrollWidth: chrome.scrollWidth,
          scrollHeight: chrome.scrollHeight,
        },
        measuredRoot: {
          clientWidth: measuredRoot.clientWidth,
          clientHeight: measuredRoot.clientHeight,
          scrollWidth: measuredRoot.scrollWidth,
          scrollHeight: measuredRoot.scrollHeight,
          contentBoundsHeight,
        },
      },
      { nodeType, trace: true },
    );
    void queueNodeResize({
      nodeId: nodeId as Id<"nodes">,
      width: nextSize.width,
      height: nextSize.height,
      skipHistory: true,
    }).catch((error: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[BaseNodeWrapper] auto resize failed", error);
      }
    });
  }, [getNode, isCollapsed, nodeId, nodeType, queueNodeResize]);

  const cancelPendingMeasureFrame = useCallback(() => {
    const pendingFrame = pendingMeasureFrameRef.current;
    if (pendingFrame === null || typeof window === "undefined") return;
    if (typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(pendingFrame);
    } else {
      window.clearTimeout(pendingFrame);
    }
    pendingMeasureFrameRef.current = null;
  }, []);

  const scheduleMeasureAndGrowNode = useCallback(() => {
    if (pendingMeasureFrameRef.current !== null) return;
    if (typeof window === "undefined") return;

    const runMeasure = () => {
      pendingMeasureFrameRef.current = null;
      measureAndGrowNode();
    };

    if (typeof window.requestAnimationFrame === "function") {
      pendingMeasureFrameRef.current = window.requestAnimationFrame(runMeasure);
      return;
    }

    pendingMeasureFrameRef.current = window.setTimeout(runMeasure, 0);
  }, [measureAndGrowNode]);

  useEffect(() => {
    if (isCollapsed) return undefined;
    scheduleMeasureAndGrowNode();
    return cancelPendingMeasureFrame;
  }, [cancelPendingMeasureFrame, isCollapsed, scheduleMeasureAndGrowNode]);

  useEffect(() => {
    if (isCollapsed) return undefined;
    const chrome = nodeChromeRef.current;
    if (!chrome) return undefined;

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleMeasureAndGrowNode);
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(scheduleMeasureAndGrowNode);

    resizeObserver?.observe(chrome);
    mutationObserver?.observe(chrome, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      cancelPendingMeasureFrame();
    };
  }, [cancelPendingMeasureFrame, isCollapsed, scheduleMeasureAndGrowNode]);

  useEffect(() => {
    if (!nodeId || !isCollapsed) return;
    updateNodeInternals(nodeId);
  }, [collapsedHandleSignature, isCollapsed, nodeId, updateNodeInternals]);

  const statusStyles: Record<string, string> = {
    idle: "",
    analyzing: "border-yellow-400 animate-pulse",
    clarifying: "border-amber-400",
    executing: "border-yellow-400 animate-pulse",
    rendering: "border-yellow-400 animate-pulse",
    done: "border-green-500",
    error: "border-red-500",
  };

  const collapsedNodeChrome = (
    <div
      ref={nodeChromeRef}
      data-testid="canvas-node-chrome"
      data-onboarding={dataOnboarding}
      className={`
        relative h-full w-full rounded-lg border bg-card shadow-lg shadow-foreground/05 transition-shadow
        ${selected ? "ring-2 ring-primary shadow-md" : ""}
        ${isBypassed ? "border-dashed border-muted-foreground/45" : ""}
        ${statusStyles[status] ?? ""}
      `}
    >
      <div
        data-testid="canvas-node-collapsed-bar"
        className="flex h-full min-h-0 items-center px-3 text-xs font-medium text-foreground"
        title={collapsedLabel}
      >
        <span className="min-w-0 truncate">{collapsedLabel}</span>
      </div>
      {collapsedHandleSpecs.map((handle) => (
        <CanvasHandle
          key={`${handle.handleType}:${handle.handleId ?? "default"}`}
          nodeId={nodeId ?? ""}
          nodeType={nodeType}
          type={handle.handleType}
          position={handle.handleType === "target" ? Position.Left : Position.Right}
          id={handle.handleId}
          style={{ top: `${handle.topPercent}%` }}
        />
      ))}
      <NodeToolbarActions nodeType={nodeType} actions={toolbarActions} />
    </div>
  );

  const expandedNodeChrome = (
    <div
      ref={nodeChromeRef}
      data-testid="canvas-node-chrome"
      data-onboarding={dataOnboarding}
      className={`
        relative h-full w-full rounded-xl border bg-card shadow-xl shadow-foreground/05 transition-shadow
        ${selected ? "ring-2 ring-primary shadow-md" : ""}
        ${isBypassed ? "border-dashed border-muted-foreground/45" : ""}
        ${statusStyles[status] ?? ""}
        ${className}
      `}
    >
      {selected &&
        CORNERS.map((corner) => (
          <NodeResizeControl
            key={corner}
            position={corner}
            minWidth={resizeMinimum.minWidth}
            minHeight={resizeMinimum.minHeight}
            keepAspectRatio={config.keepAspectRatio}
            style={{
              background: "none",
              border: "none",
              width: 12,
              height: 12,
              zIndex: 30,
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
      <div
        ref={nodeMeasureRef}
        data-testid="canvas-node-measure"
        className="relative h-full w-full"
      >
        <NodeErrorBoundary nodeType={nodeType}>{children}</NodeErrorBoundary>
        {status === "error" && statusMessage && (
          <div className="px-3 pb-2 text-xs text-red-500 truncate">
            {statusMessage}
          </div>
        )}
        {isBypassed ? (
          <div
            data-testid="canvas-node-body"
            className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-card opacity-45 saturate-50 backdrop-saturate-50"
          />
        ) : null}
      </div>
      <NodeToolbarActions nodeType={nodeType} actions={toolbarActions} />
    </div>
  );
  const nodeChrome = isCollapsed ? collapsedNodeChrome : expandedNodeChrome;
  const nodeRootClassName = isCollapsed
    ? "relative h-9 w-full overflow-visible"
    : "relative h-full w-full overflow-visible";
  const nodeContentClassName = isCollapsed
    ? "relative z-10 h-9 w-full"
    : "relative z-10 h-full w-full";

  return (
    <div className={nodeRootClassName}>
      <div data-testid="canvas-node-content" className={nodeContentClassName}>
        {nodeChrome}
      </div>
      {favoriteBacklight ? (
        <div
          data-testid="canvas-node-backlight"
          className="pointer-events-none absolute inset-0 z-0 overflow-visible rounded-xl"
        >
          {favoriteBacklight}
        </div>
      ) : null}
    </div>
  );
}
