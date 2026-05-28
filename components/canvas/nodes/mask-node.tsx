"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas mask node. Keep editable mask data local to the
 * node and persist through the shared canvas sync queue.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Position, type NodeProps } from "@xyflow/react";

import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_MASK_NODE_DATA,
  type MaskBrushPoint,
  type MaskBrushStroke,
  type MaskMode,
  type MaskNodeData,
} from "@/lib/image-pipeline/mask-node-data";

const MODE_LABELS: Record<MaskMode, string> = {
  brush: "Brush",
  "linear-gradient": "Linear",
  "radial-gradient": "Radial",
  "luminosity-range": "Luminosity",
  "color-range": "Color",
};

type MaskSourcePreview = {
  url: string;
  width?: number;
  height?: number;
};

function normalizeMaskNodeData(data: unknown): MaskNodeData {
  const record = (data ?? {}) as Partial<MaskNodeData>;
  return {
    ...DEFAULT_MASK_NODE_DATA,
    ...record,
    gradient: {
      ...DEFAULT_MASK_NODE_DATA.gradient,
      ...(record.gradient ?? {}),
    },
    range: {
      ...DEFAULT_MASK_NODE_DATA.range,
      ...(record.range ?? {}),
    },
    strokes: Array.isArray(record.strokes) ? record.strokes : [],
  };
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function readPreviewUrl(data: Record<string, unknown>): string | null {
  for (const key of ["url", "previewUrl", "imageUrl", "lastUploadUrl"]) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function resolveMaskSourcePreview(args: {
  nodeId: string;
  incomingEdgesByTarget: ReadonlyMap<
    string,
    readonly { source: string; targetHandle?: string | null }[]
  >;
  nodesById: ReadonlyMap<string, { data?: unknown }>;
}): MaskSourcePreview | null {
  const sourceEdge = (args.incomingEdgesByTarget.get(args.nodeId) ?? []).find((edge) => {
    const targetHandle = edge.targetHandle ?? "image-in";
    return targetHandle === "" || targetHandle === "image-in";
  });
  if (!sourceEdge) {
    return null;
  }

  const sourceNode = args.nodesById.get(sourceEdge.source);
  if (!sourceNode || !sourceNode.data || typeof sourceNode.data !== "object") {
    return null;
  }

  const data = sourceNode.data as Record<string, unknown>;
  const url = readPreviewUrl(data);
  if (!url) {
    return null;
  }

  const width = readPositiveNumber(data.width) ?? readPositiveNumber(data.previewWidth);
  const height = readPositiveNumber(data.height) ?? readPositiveNumber(data.previewHeight);

  return {
    url,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pointFromEvent(
  event: MouseEvent | ReactMouseEvent<HTMLElement>,
  element: HTMLElement,
): MaskBrushPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: clampUnit((event.clientX - rect.left) / Math.max(1, rect.width)),
    y: clampUnit((event.clientY - rect.top) / Math.max(1, rect.height)),
  };
}

export default function MaskNode({ id, data, selected }: NodeProps) {
  const graph = useCanvasGraph();
  const { queueNodeDataUpdate } = useCanvasSync();
  const [nodeData, setNodeData] = useState(() => normalizeMaskNodeData(data));
  const nodeDataRef = useRef(nodeData);
  const mode = MODE_LABELS[nodeData.mode] ? nodeData.mode : DEFAULT_MASK_NODE_DATA.mode;
  const sourcePreview = useMemo(
    () =>
      resolveMaskSourcePreview({
        nodeId: id,
        incomingEdgesByTarget: graph.incomingEdgesByTarget,
        nodesById: graph.nodesById,
      }),
    [graph.incomingEdgesByTarget, graph.nodesById, id],
  );
  const sourceAspectRatio =
    sourcePreview?.width && sourcePreview.height
      ? `${sourcePreview.width} / ${sourcePreview.height}`
      : undefined;

  useEffect(() => {
    const nextData = normalizeMaskNodeData(data);
    const timer = window.setTimeout(() => {
      nodeDataRef.current = nextData;
      setNodeData(nextData);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [data]);

  const persist = useCallback(
    (nextData: MaskNodeData) => {
      queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: nextData as unknown as Record<string, unknown>,
      });
    },
    [id, queueNodeDataUpdate],
  );

  const updateNodeData = useCallback(
    (updater: (current: MaskNodeData) => MaskNodeData) => {
      const next = updater(nodeDataRef.current);
      nodeDataRef.current = next;
      setNodeData(next);
      persist(next);
    },
    [persist],
  );

  const setMode = useCallback(
    (nextMode: MaskMode) => {
      updateNodeData((current) => ({ ...current, mode: nextMode }));
    },
    [updateNodeData],
  );

  const startBrushStroke = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (nodeData.mode !== "brush") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const preview = event.currentTarget;
      const strokeId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `stroke-${Date.now()}`;
      const firstPoint = pointFromEvent(event, preview);

      const appendPoint = (point: MaskBrushPoint) => {
        updateNodeData((current) => {
          const strokes = [...current.strokes];
          const last = strokes.at(-1);
          if (last?.id === strokeId) {
            strokes[strokes.length - 1] = {
              ...last,
              points: [...last.points, point],
            };
          } else {
            const stroke: MaskBrushStroke = {
              id: strokeId,
              operation: "paint",
              size: 0.08,
              hardness: 0.85,
              flow: 1,
              opacity: 1,
              points: [point],
            };
            strokes.push(stroke);
          }
          return { ...current, strokes };
        });
      };

      const handleMove = (moveEvent: MouseEvent) => {
        appendPoint(pointFromEvent(moveEvent, preview));
      };
      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      appendPoint(firstPoint);
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [nodeData.mode, updateNodeData],
  );

  return (
    <BaseNodeWrapper nodeType="mask" selected={selected} className="p-0">
      <CanvasHandle
        nodeId={id}
        nodeType="mask"
        type="target"
        position={Position.Left}
        id="image-in"
        className="!h-3 !w-3 !border-2 !border-background !bg-teal-500"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="mask"
        type="source"
        position={Position.Right}
        id="mask-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-slate-400"
      />

      <div className="grid h-full min-h-[320px] grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Maske
        </div>
        <div
          data-testid="mask-preview"
          className="relative min-h-[180px] overflow-hidden bg-muted/40 nodrag nopan"
          style={sourceAspectRatio ? { aspectRatio: sourceAspectRatio } : undefined}
          onMouseDown={startBrushStroke}
        >
          {sourcePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-testid="mask-source-preview"
              src={sourcePreview.url}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-4 rounded-md border border-dashed border-slate-400/60 bg-gradient-to-br from-black/60 via-white/30 to-white/80" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/45 via-transparent to-white/45 opacity-70 mix-blend-screen" />
          <div className="absolute bottom-3 left-3 rounded bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
            {MODE_LABELS[mode]}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border p-2 text-[11px] text-muted-foreground">
          {Object.entries(MODE_LABELS).map(([value, label]) => (
            <button
              type="button"
              key={value}
              data-testid={`mask-mode-${value}`}
              onClick={() => setMode(value as MaskMode)}
              className={
                value === mode
                  ? "rounded-md border border-slate-400 bg-slate-500/10 px-2 py-1 text-foreground"
                  : "rounded-md border border-border px-2 py-1"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </BaseNodeWrapper>
  );
}
