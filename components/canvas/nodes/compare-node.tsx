"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ImageIcon } from "lucide-react";
import BaseNodeWrapper from "./base-node-wrapper";
import CompareSurface from "./compare-surface";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import {
  resolveRenderPipelineHash,
  resolveRenderPreviewInputFromGraph,
  type RenderPreviewInput,
} from "@/lib/canvas-render-preview";
import {
  resolveMixerPreviewFromGraph,
  type MixerPreviewState,
} from "@/lib/canvas-mixer-preview";

interface CompareNodeData {
  leftUrl?: string;
  rightUrl?: string;
  leftLabel?: string;
  rightLabel?: string;
}

type CompareSide = "left" | "right";

type CompareSideState = {
  finalUrl?: string;
  label?: string;
  previewInput?: RenderPreviewInput;
  mixerPreviewState?: MixerPreviewState;
  isStaleRenderOutput: boolean;
};

type CompareDisplayMode = "render" | "preview";

export default function CompareNode({ id, data, selected, width }: NodeProps) {
  const nodeData = data as CompareNodeData;
  const graph = useCanvasGraph();
  const [sliderX, setSliderX] = useState(50);
  const [manualDisplayMode, setManualDisplayMode] = useState<CompareDisplayMode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const incomingEdges = useMemo(
    () => graph.incomingEdgesByTarget.get(id) ?? [],
    [graph, id],
  );

  const resolvedSides = useMemo(() => {
    const resolveSide = (
      side: CompareSide,
      finalUrl: string | undefined,
      finalLabel: string | undefined,
      defaultLabel: string,
    ): CompareSideState => {
      const incomingEdge = incomingEdges.find((edge) => edge.targetHandle === side);
      const sourceNode = incomingEdge ? graph.nodesById.get(incomingEdge.source) : undefined;
      const sourceData = (sourceNode?.data ?? {}) as Record<string, unknown>;
      const sourceLabel =
        typeof sourceData.label === "string" && sourceData.label.length > 0
          ? sourceData.label
          : sourceNode?.type;

      const label = finalLabel ?? sourceLabel ?? defaultLabel;

      let previewInput: RenderPreviewInput | undefined;
      let mixerPreviewState: MixerPreviewState | undefined;
      let isStaleRenderOutput = false;

      if (sourceNode && sourceNode.type === "render") {
        const preview = resolveRenderPreviewInputFromGraph({
          nodeId: sourceNode.id,
          graph,
        });

        if (preview.sourceUrl) {
          previewInput = {
            sourceUrl: preview.sourceUrl,
            steps: preview.steps,
          };

          const sourceLastUploadedHash =
            typeof sourceData.lastUploadedHash === "string"
              ? sourceData.lastUploadedHash
              : undefined;
          const sourceLastRenderedHash =
            typeof sourceData.lastRenderedHash === "string"
              ? sourceData.lastRenderedHash
              : undefined;
          const sourcePersistedOutputHash =
            sourceLastUploadedHash ?? sourceLastRenderedHash;
          const sourceCurrentHash = resolveRenderPipelineHash({
            sourceUrl: preview.sourceUrl,
            steps: preview.steps,
            data: sourceData,
          });

          isStaleRenderOutput =
            Boolean(finalUrl) &&
            Boolean(sourceCurrentHash) &&
            Boolean(sourcePersistedOutputHash) &&
            sourceCurrentHash !== sourcePersistedOutputHash;
        }
      }

      if (sourceNode && sourceNode.type === "mixer") {
        const mixerPreview = resolveMixerPreviewFromGraph({
          nodeId: sourceNode.id,
          graph,
        });

        if (mixerPreview.status === "ready") {
          mixerPreviewState = mixerPreview;
        }
      }

      const visibleFinalUrl =
        sourceNode?.type === "mixer" && mixerPreviewState ? undefined : finalUrl;

      if (visibleFinalUrl) {
        return {
          finalUrl: visibleFinalUrl,
          label,
          previewInput,
          mixerPreviewState,
          isStaleRenderOutput,
        };
      }

      return {
        label,
        previewInput,
        mixerPreviewState,
        isStaleRenderOutput,
      };
    };

    return {
      left: resolveSide("left", nodeData.leftUrl, nodeData.leftLabel, "Before"),
      right: resolveSide("right", nodeData.rightUrl, nodeData.rightLabel, "After"),
    };
  }, [
    incomingEdges,
    nodeData.leftLabel,
    nodeData.leftUrl,
    nodeData.rightLabel,
    nodeData.rightUrl,
    graph,
  ]);

  const hasLeft = Boolean(
    resolvedSides.left.finalUrl ||
      resolvedSides.left.previewInput ||
      resolvedSides.left.mixerPreviewState,
  );
  const hasRight = Boolean(
    resolvedSides.right.finalUrl ||
      resolvedSides.right.previewInput ||
      resolvedSides.right.mixerPreviewState,
  );
  const hasConnectedRenderInput = useMemo(
    () =>
      incomingEdges.some((edge) => {
        const sourceNode = graph.nodesById.get(edge.source);
        return sourceNode?.type === "render";
      }),
    [graph, incomingEdges],
  );
  const shouldDefaultToPreview =
    hasConnectedRenderInput ||
    resolvedSides.left.isStaleRenderOutput ||
    resolvedSides.right.isStaleRenderOutput;
  const effectiveDisplayMode =
    manualDisplayMode ?? (shouldDefaultToPreview ? "preview" : "render");
  const previewNodeWidth = Math.max(240, Math.min(640, Math.round(width ?? 500)));

  const setSliderPercent = useCallback((value: number) => {
    setSliderX(Math.max(0, Math.min(100, value)));
  }, []);

  const handleSliderKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextValue: number | null = null;
    const step = event.shiftKey ? 10 : 2;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextValue = sliderX - step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextValue = sliderX + step;
    } else if (event.key === "Home") {
      nextValue = 0;
    } else if (event.key === "End") {
      nextValue = 100;
    }

    if (nextValue === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSliderPercent(nextValue);
  }, [setSliderPercent, sliderX]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();

    const move = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      setSliderPercent(x * 100);
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [setSliderPercent]);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    event.stopPropagation();

    const move = (moveEvent: TouchEvent) => {
      if (!containerRef.current || moveEvent.touches.length === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const touch = moveEvent.touches[0];
      const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      setSliderPercent(x * 100);
    };

    const end = () => {
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };

    window.addEventListener("touchmove", move);
    window.addEventListener("touchend", end);
  }, [setSliderPercent]);

  return (
    <BaseNodeWrapper nodeType="compare" selected={selected} className="p-0">
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

      <div className="grid h-full min-h-0 w-full grid-cols-1 grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="text-xs font-medium text-muted-foreground">⚖️ Compare</div>
          {hasConnectedRenderInput && (
            <div className="nodrag inline-flex rounded-md border border-border bg-background/80 p-0.5">
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-[10px] font-medium ${effectiveDisplayMode === "render" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setManualDisplayMode("render");
                }}
              >
                Render
              </button>
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-[10px] font-medium ${effectiveDisplayMode === "preview" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setManualDisplayMode("preview");
                }}
              >
                Preview
              </button>
            </div>
          )}
        </div>

        <div
          ref={containerRef}
          className="nodrag relative min-h-0 w-full select-none overflow-hidden rounded-b-xl bg-muted"
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
            <CompareSurface
              finalUrl={resolvedSides.right.finalUrl}
              label={resolvedSides.right.label}
              previewInput={resolvedSides.right.previewInput}
              mixerPreviewState={resolvedSides.right.mixerPreviewState}
              nodeWidth={previewNodeWidth}
              preferPreview={effectiveDisplayMode === "preview"}
            />
          )}

          {hasLeft && (
            <CompareSurface
              finalUrl={resolvedSides.left.finalUrl}
              label={resolvedSides.left.label}
              previewInput={resolvedSides.left.previewInput}
              mixerPreviewState={resolvedSides.left.mixerPreviewState}
              nodeWidth={previewNodeWidth}
              clipWidthPercent={sliderX}
              preferPreview={effectiveDisplayMode === "preview"}
            />
          )}

          {hasLeft && hasRight && (
            <>
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-white shadow-md"
                style={{ left: `${sliderX}%` }}
              />
              <button
                type="button"
                className="nodrag absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2"
                style={{ left: `${sliderX}%` }}
                onKeyDown={handleSliderKeyDown}
                aria-label="Compare slider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(sliderX)}
                aria-valuetext={`${Math.round(sliderX)} percent`}
                aria-orientation="horizontal"
                role="slider"
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
              </button>
            </>
          )}

          {hasLeft && (
            <div className="pointer-events-none absolute left-2 top-2 z-10">
              <span className="rounded bg-blue-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {resolvedSides.left.label ?? "Before"}
              </span>
            </div>
          )}

          {hasRight && (
            <div className="pointer-events-none absolute right-2 top-2 z-10">
              <span className="rounded bg-emerald-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {resolvedSides.right.label ?? "After"}
              </span>
            </div>
          )}
        </div>
      </div>
    </BaseNodeWrapper>
  );
}
