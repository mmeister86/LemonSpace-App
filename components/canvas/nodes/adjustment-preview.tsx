"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas adjustment preview node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useMemo } from "react";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { useZoomAwarePreviewQuality } from "@/components/canvas/use-zoom-aware-preview-quality";

import { usePipelinePreview } from "@/hooks/use-pipeline-preview";
import {
  collectPipelineFromGraph,
  getSourceImageFromGraphWithContext,
  resolvePreviewSourceImageFromGraph,
  shouldFastPathPreviewPipeline,
  type ResolvedPreviewSourceImage,
} from "@/lib/canvas-render-preview";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import { buildHistogramPlot } from "@/lib/image-pipeline/histogram-plot";
import { TRANSPARENCY_CHECKERBOARD_STYLE } from "./transparency-background";

const PREVIEW_PIPELINE_TYPES = new Set(["crop", "curves", "color-adjust", "light-adjust", "detail-adjust"]);

export default function AdjustmentPreview({
  nodeId,
  nodeWidth,
  currentType,
  currentParams,
}: {
  nodeId: string;
  nodeWidth: number;
  currentType: string;
  currentParams: unknown;
}) {
  const graph = useCanvasGraph();
  const { previewQuality, sourceQuality } = useZoomAwarePreviewQuality({
    width: nodeWidth,
    height: nodeWidth,
  });

  const sourceImage = useMemo<ResolvedPreviewSourceImage | null>(
    () =>
      getSourceImageFromGraphWithContext(graph, {
        nodeId,
        isSourceNode: (node) =>
          node.type === "image" ||
          node.type === "ai-image" ||
          node.type === "asset" ||
          node.type === "bg-remove-output",
        getSourceImageFromNode: (node, graph) =>
          resolvePreviewSourceImageFromGraph(node, graph, { sourceQuality }),
      }),
    [graph, nodeId, sourceQuality],
  );
  const sourceUrl = sourceImage?.url ?? null;
  const isAlphaBearing = sourceImage?.isAlphaBearing ?? false;

  const steps = useMemo(() => {
    const collected = collectPipelineFromGraph(graph, {
      nodeId,
      isPipelineNode: (node) => PREVIEW_PIPELINE_TYPES.has(node.type ?? ""),
    });

    return collected.map((step) => {
      if (step.nodeId === nodeId && step.type === currentType) {
        return {
          ...step,
          params: currentParams,
        } as PipelineStep;
      }
      return step as PipelineStep;
    });
  }, [currentParams, currentType, graph, nodeId]);

  const usesFastPreviewDebounce = shouldFastPathPreviewPipeline(
    steps,
    graph.previewNodeDataOverrides,
  );
  const shouldDeferHistogram = graph.previewNodeDataOverrides.has(nodeId);

  const previewDebounceMs = usesFastPreviewDebounce ? 16 : undefined;

  const { canvasRef, histogram, isRendering, hasSource, previewAspectRatio, error } =
    usePipelinePreview({
      sourceUrl,
      steps,
      nodeWidth,
      includeHistogram: !shouldDeferHistogram,
      debounceMs: previewDebounceMs,
      // Die Vorschau muss in-Node gut lesbar bleiben, aber nicht in voller
      // Display-Auflösung rechnen.
      previewScale: 0.5,
      maxPreviewWidth: 720,
      maxDevicePixelRatio: 1.25,
      previewQuality,
    });

  const histogramPlot = useMemo(() => {
    return buildHistogramPlot(histogram, {
      points: 64,
      width: 96,
      height: 44,
    });
  }, [histogram]);

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-md border border-border bg-muted/30"
        data-alpha-source={isAlphaBearing ? "true" : undefined}
        style={{
          aspectRatio: `${Math.max(0.25, previewAspectRatio)}`,
          ...(isAlphaBearing ? TRANSPARENCY_CHECKERBOARD_STYLE : null),
        }}
      >
        {!hasSource ? (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
            Verbinde eine Bild-, Asset- oder KI-Bild-Node fuer Live-Preview.
          </div>
        ) : null}
        {hasSource ? (
          <canvas
            ref={canvasRef}
            className="h-full w-full object-contain"
          />
        ) : null}
        {isRendering ? (
          <div className="absolute right-1 top-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Rendering...
          </div>
        ) : null}
        <div className="absolute bottom-2 right-2 z-10 w-28 rounded-md border border-border/80 bg-background/85 px-2 py-1.5 backdrop-blur-sm">
          <svg
            viewBox="0 0 96 44"
            className="h-11 w-full"
            role="img"
            aria-label="Histogramm als RGB-Linienkurven"
          >
            <polyline
              points={histogramPlot.polylines.rgb}
              fill="none"
              stroke="rgba(248, 250, 252, 0.9)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPlot.polylines.red}
              fill="none"
              stroke="rgba(248, 113, 113, 0.9)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPlot.polylines.green}
              fill="none"
              stroke="rgba(74, 222, 128, 0.85)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPlot.polylines.blue}
              fill="none"
              stroke="rgba(96, 165, 250, 0.88)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
