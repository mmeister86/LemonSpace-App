"use client";

import { useMemo } from "react";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";

import { usePipelinePreview } from "@/hooks/use-pipeline-preview";
import {
  collectPipelineFromGraph,
  getSourceImageFromGraph,
  type PipelineStep,
} from "@/lib/canvas-render-preview";

const PREVIEW_PIPELINE_TYPES = new Set([
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

function compactHistogram(values: readonly number[], points = 64): number[] {
  if (points <= 0) {
    return [];
  }

  if (values.length === 0) {
    return Array.from({ length: points }, () => 0);
  }

  const bucket = values.length / points;
  const compacted: number[] = [];
  for (let pointIndex = 0; pointIndex < points; pointIndex += 1) {
    let sum = 0;
    const start = Math.floor(pointIndex * bucket);
    const end = Math.min(values.length, Math.floor((pointIndex + 1) * bucket) || start + 1);
    for (let index = start; index < end; index += 1) {
      sum += values[index] ?? 0;
    }
    compacted.push(sum);
  }
  return compacted;
}

function histogramPolyline(values: readonly number[], maxValue: number, width: number, height: number): string {
  if (values.length === 0) {
    return "";
  }

  const divisor = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = (index / divisor) * width;
      const normalized = maxValue > 0 ? value / maxValue : 0;
      const y = height - normalized * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

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

  const sourceUrl = useMemo(
    () =>
      getSourceImageFromGraph(graph, {
        nodeId,
        isSourceNode: (node) =>
          node.type === "image" || node.type === "ai-image" || node.type === "asset",
        getSourceImageFromNode: (node) => {
          const sourceData = (node.data ?? {}) as Record<string, unknown>;
          const directUrl = typeof sourceData.url === "string" ? sourceData.url : null;
          if (directUrl && directUrl.length > 0) {
            return directUrl;
          }
          const previewUrl =
            typeof sourceData.previewUrl === "string" ? sourceData.previewUrl : null;
          return previewUrl && previewUrl.length > 0 ? previewUrl : null;
        },
      }),
    [graph, nodeId],
  );

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

  const { canvasRef, histogram, isRendering, hasSource, previewAspectRatio, error } =
    usePipelinePreview({
      sourceUrl,
      steps,
      nodeWidth,
      includeHistogram: true,
      // Die Vorschau muss in-Node gut lesbar bleiben, aber nicht in voller
      // Display-Auflösung rechnen.
      previewScale: 0.5,
      maxPreviewWidth: 720,
      maxDevicePixelRatio: 1.25,
    });

  const histogramSeries = useMemo(() => {
    const red = compactHistogram(histogram.red, 64);
    const green = compactHistogram(histogram.green, 64);
    const blue = compactHistogram(histogram.blue, 64);
    const rgb = compactHistogram(histogram.rgb, 64);
    const max = Math.max(1, ...red, ...green, ...blue, ...rgb);
    return { red, green, blue, rgb, max };
  }, [histogram.blue, histogram.green, histogram.red, histogram.rgb]);

  const histogramPolylines = useMemo(() => {
    const width = 96;
    const height = 44;
    return {
      red: histogramPolyline(histogramSeries.red, histogramSeries.max, width, height),
      green: histogramPolyline(histogramSeries.green, histogramSeries.max, width, height),
      blue: histogramPolyline(histogramSeries.blue, histogramSeries.max, width, height),
      rgb: histogramPolyline(histogramSeries.rgb, histogramSeries.max, width, height),
    };
  }, [histogramSeries.blue, histogramSeries.green, histogramSeries.max, histogramSeries.red, histogramSeries.rgb]);

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-md border border-border bg-muted/30"
        style={{ aspectRatio: `${Math.max(0.25, previewAspectRatio)}` }}
      >
        {!hasSource ? (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
            Verbinde eine Bild-, Asset- oder KI-Bild-Node fuer Live-Preview.
          </div>
        ) : null}
        {hasSource ? (
          <canvas
            ref={canvasRef}
            className="h-full w-full"
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
              points={histogramPolylines.rgb}
              fill="none"
              stroke="rgba(248, 250, 252, 0.9)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPolylines.red}
              fill="none"
              stroke="rgba(248, 113, 113, 0.9)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPolylines.green}
              fill="none"
              stroke="rgba(74, 222, 128, 0.85)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPolylines.blue}
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
