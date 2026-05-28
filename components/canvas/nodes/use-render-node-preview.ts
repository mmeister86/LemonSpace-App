/**
 * Onboarding note:
 * Renders and manages the Canvas use render node preview node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useEffect, useMemo, useRef } from "react";

import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import {
  findSourceNodeFromGraph,
  resolveRenderPreviewInputFromGraph,
  shouldFastPathPreviewPipeline,
} from "@/lib/canvas-render-preview";
import { resolveMediaAspectRatio } from "@/lib/canvas-utils";
import { parseAspectRatioString } from "@/lib/image-formats";
import { hashPipeline } from "@/lib/image-pipeline/contracts";
import { buildHistogramPlot } from "@/lib/image-pipeline/histogram-plot";
import { usePipelinePreview } from "@/hooks/use-pipeline-preview";
import type { Id } from "@/convex/_generated/dataModel";
import type { PersistedRenderData, SourceNodeDescriptor } from "./render-node-state";
import {
  ASPECT_RATIO_TOLERANCE,
  RENDER_MIN_HEIGHT,
  RENDER_MIN_WIDTH,
  SIZE_TOLERANCE_PX,
  readPositiveNumber,
  toRatioConstrainedSize,
} from "./render-node-state";

function resolveSourceAspectRatio(sourceNode: SourceNodeDescriptor | null): number | null {
  if (!sourceNode) return null;

  const sourceData = (sourceNode.data ?? {}) as Record<string, unknown>;

  if (sourceNode.type === "image") {
    const sourceWidth = readPositiveNumber(sourceData.width);
    const sourceHeight = readPositiveNumber(sourceData.height);
    return sourceWidth && sourceHeight ? sourceWidth / sourceHeight : null;
  }

  if (sourceNode.type === "asset") {
    return resolveMediaAspectRatio(
      readPositiveNumber(sourceData.intrinsicWidth) ?? undefined,
      readPositiveNumber(sourceData.intrinsicHeight) ?? undefined,
      typeof sourceData.orientation === "string" ? sourceData.orientation : undefined,
    );
  }

  if (sourceNode.type === "ai-image") {
    const outputWidth = readPositiveNumber(sourceData.outputWidth);
    const outputHeight = readPositiveNumber(sourceData.outputHeight);
    if (outputWidth && outputHeight) return outputWidth / outputHeight;

    const aspectRatioLabel =
      typeof sourceData.aspectRatio === "string" ? sourceData.aspectRatio : null;
    if (!aspectRatioLabel) return null;

    try {
      const parsed = parseAspectRatioString(aspectRatioLabel);
      return parsed.w / parsed.h;
    } catch {
      return null;
    }
  }

  return null;
}

export function useRenderNodePreview(args: {
  id: string;
  localData: PersistedRenderData;
  width: number | undefined;
  height: number | undefined;
  isFullscreenOpen: boolean;
  queueNodeResize: (args: { nodeId: Id<"nodes">; width: number; height: number }) => void | Promise<void>;
}) {
  const { id, localData, width, height, isFullscreenOpen, queueNodeResize } = args;
  const graph = useCanvasGraph();
  const lastAppliedAspectRatioRef = useRef<number | null>(null);
  const lastRequestedResizeRef = useRef<{
    fromWidth: number;
    fromHeight: number;
    width: number;
    height: number;
    aspectRatio: number;
  } | null>(null);

  const renderPreviewInput = useMemo(
    () => resolveRenderPreviewInputFromGraph({ nodeId: id, graph }),
    [graph, id],
  );
  const { sourceUrl, sourceComposition, steps, isAlphaBearing = false } = renderPreviewInput;
  const sourceNode = useMemo<SourceNodeDescriptor | null>(
    () =>
      findSourceNodeFromGraph(graph, {
        nodeId: id,
        isSourceNode: (node) =>
          node.type === "image" || node.type === "ai-image" || node.type === "asset",
        getSourceImageFromNode: () => true,
      }),
    [graph, id],
  );
  const hasCropStep = useMemo(() => steps.some((step) => step.type === "crop"), [steps]);
  const previewDebounceMs = shouldFastPathPreviewPipeline(steps, graph.previewNodeDataOverrides)
    ? 16
    : undefined;
  const renderFingerprint = useMemo(
    () => ({
      resolution: localData.outputResolution,
      customWidth: localData.outputResolution === "custom" ? localData.customWidth : undefined,
      customHeight: localData.outputResolution === "custom" ? localData.customHeight : undefined,
      format: localData.format,
      jpegQuality: localData.format === "jpeg" ? localData.jpegQuality : undefined,
    }),
    [
      localData.customHeight,
      localData.customWidth,
      localData.format,
      localData.jpegQuality,
      localData.outputResolution,
    ],
  );
  const currentPipelineHash = useMemo(() => {
    if (!sourceUrl && !sourceComposition) return null;
    return hashPipeline({ source: sourceComposition ?? sourceUrl, render: renderFingerprint }, steps);
  }, [renderFingerprint, sourceComposition, sourceUrl, steps]);
  const hasSource =
    (typeof sourceUrl === "string" && sourceUrl.length > 0) || Boolean(sourceComposition);
  const previewNodeWidth = Math.max(260, Math.round(width ?? 320));
  const preview = usePipelinePreview({
    sourceUrl,
    sourceComposition,
    steps,
    nodeWidth: previewNodeWidth,
    debounceMs: previewDebounceMs,
    previewScale: 0.5,
    maxPreviewWidth: 720,
    maxDevicePixelRatio: 1.25,
  });
  const fullscreenPreviewWidth = Math.max(960, Math.round((width ?? 320) * 3));
  const fullscreenPreview = usePipelinePreview({
    sourceUrl: isFullscreenOpen && sourceUrl ? sourceUrl : null,
    sourceComposition: isFullscreenOpen ? sourceComposition : undefined,
    steps,
    nodeWidth: fullscreenPreviewWidth,
    includeHistogram: false,
    debounceMs: previewDebounceMs,
    previewScale: 0.85,
    maxPreviewWidth: 1920,
    maxDevicePixelRatio: 1.5,
  });
  const targetAspectRatio = useMemo(() => {
    if (
      hasCropStep &&
      typeof preview.previewAspectRatio === "number" &&
      Number.isFinite(preview.previewAspectRatio) &&
      preview.previewAspectRatio > 0
    ) {
      return preview.previewAspectRatio;
    }

    const sourceAspectRatio = resolveSourceAspectRatio(sourceNode);
    if (sourceAspectRatio && Number.isFinite(sourceAspectRatio) && sourceAspectRatio > 0) {
      return sourceAspectRatio;
    }

    if (
      typeof preview.previewAspectRatio === "number" &&
      Number.isFinite(preview.previewAspectRatio) &&
      preview.previewAspectRatio > 0
    ) {
      return preview.previewAspectRatio;
    }

    return null;
  }, [hasCropStep, preview.previewAspectRatio, sourceNode]);

  useEffect(() => {
    if (!hasSource || targetAspectRatio === null) {
      lastRequestedResizeRef.current = null;
      return;
    }

    const measuredWidth = typeof width === "number" ? width : 0;
    const measuredHeight = typeof height === "number" ? height : 0;
    if (measuredWidth <= 0 || measuredHeight <= 0) return;

    const currentAspectRatio = measuredWidth / measuredHeight;
    const aspectDelta = Math.abs(currentAspectRatio - targetAspectRatio);
    const lastAppliedAspectRatio = lastAppliedAspectRatioRef.current;
    const hasAspectRatioChanged =
      lastAppliedAspectRatio === null ||
      Math.abs(lastAppliedAspectRatio - targetAspectRatio) > ASPECT_RATIO_TOLERANCE;

    if (aspectDelta <= ASPECT_RATIO_TOLERANCE && !hasAspectRatioChanged) return;

    const targetSize = toRatioConstrainedSize({
      currentWidth: measuredWidth,
      currentHeight: measuredHeight,
      aspectRatio: targetAspectRatio,
      minWidth: RENDER_MIN_WIDTH,
      minHeight: RENDER_MIN_HEIGHT,
    });
    const widthDelta = Math.abs(targetSize.width - measuredWidth);
    const heightDelta = Math.abs(targetSize.height - measuredHeight);
    if (widthDelta <= SIZE_TOLERANCE_PX && heightDelta <= SIZE_TOLERANCE_PX) {
      lastAppliedAspectRatioRef.current = targetAspectRatio;
      lastRequestedResizeRef.current = null;
      return;
    }

    const lastRequestedResize = lastRequestedResizeRef.current;
    if (
      lastRequestedResize &&
      lastRequestedResize.fromWidth === measuredWidth &&
      lastRequestedResize.fromHeight === measuredHeight &&
      lastRequestedResize.width === targetSize.width &&
      lastRequestedResize.height === targetSize.height &&
      Math.abs(lastRequestedResize.aspectRatio - targetAspectRatio) <= ASPECT_RATIO_TOLERANCE
    ) {
      return;
    }

    lastAppliedAspectRatioRef.current = targetAspectRatio;
    lastRequestedResizeRef.current = {
      fromWidth: measuredWidth,
      fromHeight: measuredHeight,
      width: targetSize.width,
      height: targetSize.height,
      aspectRatio: targetAspectRatio,
    };
    void queueNodeResize({
      nodeId: id as Id<"nodes">,
      width: targetSize.width,
      height: targetSize.height,
    });
  }, [hasSource, height, id, queueNodeResize, targetAspectRatio, width]);

  const histogramPlot = useMemo(
    () => buildHistogramPlot(preview.histogram, { points: 64, width: 96, height: 44 }),
    [preview.histogram],
  );

  return {
    sourceUrl,
    sourceComposition,
    steps,
    currentPipelineHash,
    hasSource,
    isAlphaBearing,
    preview,
    fullscreenPreview,
    histogramPlot,
  };
}
