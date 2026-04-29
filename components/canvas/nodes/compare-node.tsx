"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { GripVertical, ImageIcon } from "lucide-react";
import BaseNodeWrapper from "./base-node-wrapper";
import CompareSurface from "./compare-surface";
import {
  Comparison,
  ComparisonHandle,
  ComparisonItem,
} from "@/components/kibo-ui/comparison";
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
import CanvasHandle from "@/components/canvas/canvas-handle";

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

type CompareSurfaceSize = {
  width: number;
  height: number;
};

export default function CompareNode({ id, data, selected, width, height }: NodeProps) {
  const nodeData = data as CompareNodeData;
  const graph = useCanvasGraph();
  const [sliderX, setSliderX] = useState(50);
  const [manualDisplayMode, setManualDisplayMode] = useState<CompareDisplayMode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [surfaceSize, setSurfaceSize] = useState<CompareSurfaceSize | null>(null);
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

        if (preview.sourceUrl || preview.sourceComposition) {
          previewInput = preview.sourceComposition
            ? {
                sourceUrl: null,
                sourceComposition: preview.sourceComposition,
                steps: preview.steps,
              }
            : {
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
            sourceComposition: preview.sourceComposition,
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
  const fallbackSurfaceWidth = Math.max(240, Math.min(640, Math.round(width ?? 500)));
  const fallbackSurfaceHeight = Math.max(180, Math.min(720, Math.round(height ?? 380)));
  const previewNodeWidth = Math.max(
    1,
    Math.round(surfaceSize?.width ?? fallbackSurfaceWidth),
  );
  const previewNodeHeight = Math.max(
    1,
    Math.round(surfaceSize?.height ?? fallbackSurfaceHeight),
  );

  useEffect(() => {
    const surfaceElement = containerRef.current;
    if (!surfaceElement) {
      return;
    }

    const updateSurfaceSize = (nextWidth: number, nextHeight: number) => {
      const roundedWidth = Math.max(1, Math.round(nextWidth));
      const roundedHeight = Math.max(1, Math.round(nextHeight));

      setSurfaceSize((current) =>
        current?.width === roundedWidth && current?.height === roundedHeight
          ? current
          : {
              width: roundedWidth,
              height: roundedHeight,
            },
      );
    };

    const measureSurface = () => {
      const rect = surfaceElement.getBoundingClientRect();
      updateSurfaceSize(rect.width, rect.height);
    };

    measureSurface();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updateSurfaceSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(surfaceElement);
    return () => observer.disconnect();
  }, []);

  const setSliderPercent = useCallback((value: number) => {
    setSliderX(Math.max(0, Math.min(100, value)));
  }, []);

  return (
    <BaseNodeWrapper nodeType="compare" selected={selected} className="p-0">
      <CanvasHandle
        nodeId={id}
        nodeType="compare"
        type="target"
        position={Position.Left}
        id="left"
        style={{ top: "35%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-blue-500"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="compare"
        type="target"
        position={Position.Left}
        id="right"
        style={{ top: "55%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="compare"
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
        >
          {!hasLeft && !hasRight && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <ImageIcon className="h-10 w-10 opacity-30" />
              <p className="px-8 text-center text-xs opacity-60">
                Connect two image nodes - left handle (blue) and right handle (green)
              </p>
            </div>
          )}

          {hasLeft && hasRight && (
            <Comparison
              className="h-full"
              mode="drag"
              value={sliderX}
              onKeyDown={(event) => event.stopPropagation()}
              onValueChange={setSliderPercent}
              step={2}
              shiftStep={10}
            >
              <ComparisonItem position="left">
                <CompareSurface
                  finalUrl={resolvedSides.right.finalUrl}
                  label={resolvedSides.right.label}
                  previewInput={resolvedSides.right.previewInput}
                  mixerPreviewState={resolvedSides.right.mixerPreviewState}
                  nodeWidth={previewNodeWidth}
                  nodeHeight={previewNodeHeight}
                  preferPreview={effectiveDisplayMode === "preview"}
                />
              </ComparisonItem>
              <ComparisonItem position="right">
                <CompareSurface
                  finalUrl={resolvedSides.left.finalUrl}
                  label={resolvedSides.left.label}
                  previewInput={resolvedSides.left.previewInput}
                  mixerPreviewState={resolvedSides.left.mixerPreviewState}
                  nodeWidth={previewNodeWidth}
                  nodeHeight={previewNodeHeight}
                  preferPreview={effectiveDisplayMode === "preview"}
                />
              </ComparisonItem>
              <ComparisonHandle>
                <div className="absolute left-1/2 h-full w-0.5 -translate-x-1/2 bg-white shadow-md" />
                <div className="z-50 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-muted-foreground shadow-lg">
                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                </div>
              </ComparisonHandle>
            </Comparison>
          )}

          {hasRight && !hasLeft && (
            <CompareSurface
              finalUrl={resolvedSides.right.finalUrl}
              label={resolvedSides.right.label}
              previewInput={resolvedSides.right.previewInput}
              mixerPreviewState={resolvedSides.right.mixerPreviewState}
              nodeWidth={previewNodeWidth}
              nodeHeight={previewNodeHeight}
              preferPreview={effectiveDisplayMode === "preview"}
            />
          )}

          {hasLeft && !hasRight && (
            <CompareSurface
              finalUrl={resolvedSides.left.finalUrl}
              label={resolvedSides.left.label}
              previewInput={resolvedSides.left.previewInput}
              mixerPreviewState={resolvedSides.left.mixerPreviewState}
              nodeWidth={previewNodeWidth}
              nodeHeight={previewNodeHeight}
              preferPreview={effectiveDisplayMode === "preview"}
            />
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
