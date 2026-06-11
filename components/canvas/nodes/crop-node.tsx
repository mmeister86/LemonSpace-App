"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas crop node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Crop } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import { useNodeLocalData } from "@/components/canvas/nodes/use-node-local-data";
import { usePipelinePreview } from "@/hooks/use-pipeline-preview";
import {
  resolveRenderPreviewInputFromGraph,
  shouldFastPathPreviewPipeline,
} from "@/lib/canvas-render-preview";
import {
  normalizeCropNodeData,
  type CropFitMode,
  type CropNodeData,
  type CropResizeMode,
} from "@/lib/image-pipeline/crop-node-data";
import { preserveNodeFavorite } from "@/lib/canvas-node-favorite";
import type { Id } from "@/convex/_generated/dataModel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CanvasHandle from "@/components/canvas/canvas-handle";

type CropNodeViewData = CropNodeData & {
  _status?: string;
  _statusMessage?: string;
};

export type CropNodeType = Node<CropNodeViewData, "crop">;

const PREVIEW_PIPELINE_TYPES = new Set([
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
  "crop",
]);

const CUSTOM_DIMENSION_FALLBACK = 1024;
const CROP_MIN_SIZE = 0.01;

type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type CropInteractionState = {
  pointerId: number;
  mode: "move" | "resize";
  handle?: CropHandle;
  startX: number;
  startY: number;
  previewWidth: number;
  previewHeight: number;
  startCrop: CropNodeData["crop"];
  keepAspect: boolean;
  aspectRatio: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseNumberInput(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function clampCropRect(rect: CropNodeData["crop"]): CropNodeData["crop"] {
  const width = clamp(rect.width, CROP_MIN_SIZE, 1);
  const height = clamp(rect.height, CROP_MIN_SIZE, 1);
  const x = clamp(rect.x, 0, Math.max(0, 1 - width));
  const y = clamp(rect.y, 0, Math.max(0, 1 - height));

  return {
    x,
    y,
    width,
    height,
  };
}

function resizeCropRect(
  start: CropNodeData["crop"],
  handle: CropHandle,
  deltaX: number,
  deltaY: number,
  keepAspect: boolean,
  aspectRatio: number,
): CropNodeData["crop"] {
  const startRight = start.x + start.width;
  const startBottom = start.y + start.height;

  if (!keepAspect) {
    let left = start.x;
    let top = start.y;
    let right = startRight;
    let bottom = startBottom;

    if (handle.includes("w")) {
      left = clamp(start.x + deltaX, 0, startRight - CROP_MIN_SIZE);
    }
    if (handle.includes("e")) {
      right = clamp(startRight + deltaX, start.x + CROP_MIN_SIZE, 1);
    }
    if (handle.includes("n")) {
      top = clamp(start.y + deltaY, 0, startBottom - CROP_MIN_SIZE);
    }
    if (handle.includes("s")) {
      bottom = clamp(startBottom + deltaY, start.y + CROP_MIN_SIZE, 1);
    }

    return clampCropRect({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  const aspect = Math.max(CROP_MIN_SIZE, aspectRatio);

  if (handle === "e" || handle === "w") {
    const centerY = start.y + start.height / 2;
    const maxWidth = handle === "e" ? 1 - start.x : startRight;
    const minWidth = Math.max(CROP_MIN_SIZE, CROP_MIN_SIZE * aspect);
    const rawWidth = handle === "e" ? start.width + deltaX : start.width - deltaX;
    const width = clamp(rawWidth, minWidth, Math.max(minWidth, maxWidth));
    const height = width / aspect;
    const y = clamp(centerY - height / 2, 0, Math.max(0, 1 - height));
    const x = handle === "e" ? start.x : startRight - width;
    return clampCropRect({ x, y, width, height });
  }

  if (handle === "n" || handle === "s") {
    const centerX = start.x + start.width / 2;
    const maxHeight = handle === "s" ? 1 - start.y : startBottom;
    const minHeight = Math.max(CROP_MIN_SIZE, CROP_MIN_SIZE / aspect);
    const rawHeight = handle === "s" ? start.height + deltaY : start.height - deltaY;
    const height = clamp(rawHeight, minHeight, Math.max(minHeight, maxHeight));
    const width = height * aspect;
    const x = clamp(centerX - width / 2, 0, Math.max(0, 1 - width));
    const y = handle === "s" ? start.y : startBottom - height;
    return clampCropRect({ x, y, width, height });
  }

  const movesRight = handle.includes("e");
  const movesDown = handle.includes("s");
  const rawWidth = start.width + (movesRight ? deltaX : -deltaX);
  const rawHeight = start.height + (movesDown ? deltaY : -deltaY);

  const widthByHeight = rawHeight * aspect;
  const heightByWidth = rawWidth / aspect;
  const useWidth = Math.abs(rawWidth - start.width) >= Math.abs(rawHeight - start.height);
  let width = useWidth ? rawWidth : widthByHeight;
  let height = useWidth ? heightByWidth : rawHeight;

  const anchorX = movesRight ? start.x : startRight;
  const anchorY = movesDown ? start.y : startBottom;
  const maxWidth = movesRight ? 1 - anchorX : anchorX;
  const maxHeight = movesDown ? 1 - anchorY : anchorY;
  const maxScaleByWidth = maxWidth / Math.max(CROP_MIN_SIZE, width);
  const maxScaleByHeight = maxHeight / Math.max(CROP_MIN_SIZE, height);
  const maxScale = Math.min(1, maxScaleByWidth, maxScaleByHeight);
  width *= maxScale;
  height *= maxScale;

  const minScaleByWidth = Math.max(1, CROP_MIN_SIZE / Math.max(CROP_MIN_SIZE, width));
  const minScaleByHeight = Math.max(1, CROP_MIN_SIZE / Math.max(CROP_MIN_SIZE, height));
  const minScale = Math.max(minScaleByWidth, minScaleByHeight);
  width *= minScale;
  height *= minScale;

  const x = movesRight ? anchorX : anchorX - width;
  const y = movesDown ? anchorY : anchorY - height;
  return clampCropRect({ x, y, width, height });
}

export function CropNodeBody({
  id,
  data,
  width,
}: {
  id: string;
  data: CropNodeViewData;
  width?: number | null;
}) {
  const tNodes = useTranslations("nodes");
  const { queueNodeDataUpdate } = useCanvasSync();
  const graph = useCanvasGraph();

  const normalizeData = useCallback(
    (value: unknown) =>
      preserveNodeFavorite(normalizeCropNodeData(value), value) as CropNodeData,
    [],
  );
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<CropInteractionState | null>(null);
  const { localData, updateLocalData } = useNodeLocalData<CropNodeData>({
    nodeId: id,
    data,
    normalize: normalizeData,
    saveDelayMs: 40,
    onSave: (next) =>
      queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: preserveNodeFavorite(next, data),
      }),
    debugLabel: "crop",
  });

  const previewInput = useMemo(
    () => resolveRenderPreviewInputFromGraph({ nodeId: id, graph }),
    [graph, id],
  );

  const inputPreviewSteps = useMemo(() => {
    const activeCropIndex = previewInput.steps.findIndex(
      (step) => step.nodeId === id && step.type === "crop",
    );

    return activeCropIndex >= 0
      ? previewInput.steps.slice(0, activeCropIndex)
      : previewInput.steps.filter((step) => PREVIEW_PIPELINE_TYPES.has(step.type));
  }, [id, previewInput.steps]);

  const previewDebounceMs = shouldFastPathPreviewPipeline(
    inputPreviewSteps,
    graph.previewNodeDataOverrides,
  )
    ? 16
    : undefined;

  const { canvasRef, hasSource, isRendering, previewAspectRatio, error } = usePipelinePreview({
    sourceUrl: previewInput.sourceUrl,
    sourceComposition: previewInput.sourceComposition,
    steps: inputPreviewSteps,
    nodeWidth: Math.max(250, Math.round(width ?? 300)),
    includeHistogram: false,
    debounceMs: previewDebounceMs,
    previewScale: 0.5,
    maxPreviewWidth: 720,
    maxDevicePixelRatio: 1.25,
  });

  const outputResolutionLabel =
    localData.resize.mode === "custom"
      ? `${localData.resize.width ?? CUSTOM_DIMENSION_FALLBACK} x ${localData.resize.height ?? CUSTOM_DIMENSION_FALLBACK}`
      : tNodes("adjustments.crop.sourceResolution");

  const updateCropField = (field: keyof CropNodeData["crop"], value: number) => {
    updateLocalData((current) =>
      normalizeCropNodeData({
        ...current,
        crop: {
          ...current.crop,
          [field]: value,
        },
      }),
    );
  };

  const updateResize = (next: Partial<CropNodeData["resize"]>) => {
    updateLocalData((current) =>
      normalizeCropNodeData({
        ...current,
        resize: {
          ...current.resize,
          ...next,
        },
      }),
    );
  };

  const beginCropInteraction = useCallback(
    (event: ReactPointerEvent<HTMLElement>, mode: "move" | "resize", handle?: CropHandle) => {
      if (!hasSource) {
        return;
      }

      const previewElement = previewAreaRef.current;
      if (!previewElement) {
        return;
      }

      const bounds = previewElement.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 1;
      event.currentTarget.setPointerCapture?.(pointerId);

      interactionRef.current = {
        pointerId,
        mode,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        previewWidth: bounds.width,
        previewHeight: bounds.height,
        startCrop: localData.crop,
        keepAspect: localData.resize.keepAspect,
        aspectRatio: localData.crop.width / Math.max(CROP_MIN_SIZE, localData.crop.height),
      };
    },
    [hasSource, localData.crop, localData.resize.keepAspect],
  );

  const updateCropInteraction = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const activeInteraction = interactionRef.current;
      if (!activeInteraction) {
        return;
      }

      const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 1;
      if (pointerId !== activeInteraction.pointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const deltaX = (event.clientX - activeInteraction.startX) / activeInteraction.previewWidth;
      const deltaY = (event.clientY - activeInteraction.startY) / activeInteraction.previewHeight;
      const nextCrop =
        activeInteraction.mode === "move"
          ? clampCropRect({
              ...activeInteraction.startCrop,
              x: activeInteraction.startCrop.x + deltaX,
              y: activeInteraction.startCrop.y + deltaY,
            })
          : resizeCropRect(
              activeInteraction.startCrop,
              activeInteraction.handle ?? "se",
              deltaX,
              deltaY,
              activeInteraction.keepAspect,
              activeInteraction.aspectRatio,
            );

      updateLocalData((current) =>
        normalizeCropNodeData({
          ...current,
          crop: nextCrop,
        }),
      );
    },
    [updateLocalData],
  );

  const endCropInteraction = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const activeInteraction = interactionRef.current;
    if (!activeInteraction) {
      return;
    }

    const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 1;
    if (pointerId !== activeInteraction.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(pointerId);
    interactionRef.current = null;
  }, []);

  return (
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-400">
          <Crop className="h-3.5 w-3.5" />
          {tNodes("adjustments.crop.title")}
        </div>

        <div className="space-y-2">
          <div
            ref={previewAreaRef}
            data-testid="crop-preview-area"
            className="relative overflow-hidden rounded-md border border-border bg-muted/30"
            style={{ aspectRatio: `${Math.max(0.25, previewAspectRatio)}` }}
          >
            {!hasSource ? (
              <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
                {tNodes("adjustments.crop.previewHint")}
              </div>
            ) : null}

            {hasSource ? <canvas ref={canvasRef} className="h-full w-full" /> : null}

            {hasSource ? (
              <div className="pointer-events-none absolute inset-0">
                <div
                  data-testid="crop-overlay"
                  className="nodrag pointer-events-auto absolute cursor-move border border-violet-300 bg-violet-500/10"
                  style={{
                    left: `${localData.crop.x * 100}%`,
                    top: `${localData.crop.y * 100}%`,
                    width: `${localData.crop.width * 100}%`,
                    height: `${localData.crop.height * 100}%`,
                  }}
                  onPointerDown={(event) => beginCropInteraction(event, "move")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                >
                  <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-violet-200/70" />
                  <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-violet-200/70" />
                  <div className="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-violet-200/70" />
                  <div className="pointer-events-none absolute left-0 top-2/3 h-px w-full bg-violet-200/70" />
                </div>

                <button
                  type="button"
                  data-testid="crop-handle-nw"
                  className="nodrag pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border border-background bg-violet-500"
                  style={{ left: `${localData.crop.x * 100}%`, top: `${localData.crop.y * 100}%` }}
                  onPointerDown={(event) => beginCropInteraction(event, "resize", "nw")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                />
                <button
                  type="button"
                  data-testid="crop-handle-n"
                  className="nodrag pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-background bg-violet-500"
                  style={{
                    left: `${(localData.crop.x + localData.crop.width / 2) * 100}%`,
                    top: `${localData.crop.y * 100}%`,
                  }}
                  onPointerDown={(event) => beginCropInteraction(event, "resize", "n")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                />
                <button
                  type="button"
                  data-testid="crop-handle-ne"
                  className="nodrag pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-full border border-background bg-violet-500"
                  style={{
                    left: `${(localData.crop.x + localData.crop.width) * 100}%`,
                    top: `${localData.crop.y * 100}%`,
                  }}
                  onPointerDown={(event) => beginCropInteraction(event, "resize", "ne")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                />
                <button
                  type="button"
                  data-testid="crop-handle-e"
                  className="nodrag pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-background bg-violet-500"
                  style={{
                    left: `${(localData.crop.x + localData.crop.width) * 100}%`,
                    top: `${(localData.crop.y + localData.crop.height / 2) * 100}%`,
                  }}
                  onPointerDown={(event) => beginCropInteraction(event, "resize", "e")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                />
                <button
                  type="button"
                  data-testid="crop-handle-se"
                  className="nodrag pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border border-background bg-violet-500"
                  style={{
                    left: `${(localData.crop.x + localData.crop.width) * 100}%`,
                    top: `${(localData.crop.y + localData.crop.height) * 100}%`,
                  }}
                  onPointerDown={(event) => beginCropInteraction(event, "resize", "se")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                />
                <button
                  type="button"
                  data-testid="crop-handle-s"
                  className="nodrag pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-background bg-violet-500"
                  style={{
                    left: `${(localData.crop.x + localData.crop.width / 2) * 100}%`,
                    top: `${(localData.crop.y + localData.crop.height) * 100}%`,
                  }}
                  onPointerDown={(event) => beginCropInteraction(event, "resize", "s")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                />
                <button
                  type="button"
                  data-testid="crop-handle-sw"
                  className="nodrag pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-full border border-background bg-violet-500"
                  style={{
                    left: `${localData.crop.x * 100}%`,
                    top: `${(localData.crop.y + localData.crop.height) * 100}%`,
                  }}
                  onPointerDown={(event) => beginCropInteraction(event, "resize", "sw")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                />
                <button
                  type="button"
                  data-testid="crop-handle-w"
                  className="nodrag pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-background bg-violet-500"
                  style={{
                    left: `${localData.crop.x * 100}%`,
                    top: `${(localData.crop.y + localData.crop.height / 2) * 100}%`,
                  }}
                  onPointerDown={(event) => beginCropInteraction(event, "resize", "w")}
                  onPointerMove={updateCropInteraction}
                  onPointerUp={endCropInteraction}
                  onPointerCancel={endCropInteraction}
                />
              </div>
            ) : null}

            {isRendering ? (
              <div className="absolute right-1 top-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tNodes("adjustments.crop.previewRendering")}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
            <span>{tNodes("adjustments.crop.outputResolutionLabel")}</span>
            <span className="font-medium text-foreground">{outputResolutionLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>{tNodes("adjustments.crop.fields.x")}</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={localData.crop.x}
              onChange={(event) => {
                const parsed = parseNumberInput(event.target.value);
                if (parsed === null) return;
                updateCropField("x", clamp(parsed, 0, 1));
              }}
              className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            />
          </label>

          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>{tNodes("adjustments.crop.fields.y")}</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={localData.crop.y}
              onChange={(event) => {
                const parsed = parseNumberInput(event.target.value);
                if (parsed === null) return;
                updateCropField("y", clamp(parsed, 0, 1));
              }}
              className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            />
          </label>

          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>{tNodes("adjustments.crop.fields.width")}</span>
            <input
              type="number"
              min={0.01}
              max={1}
              step={0.01}
              value={localData.crop.width}
              onChange={(event) => {
                const parsed = parseNumberInput(event.target.value);
                if (parsed === null) return;
                updateCropField("width", clamp(parsed, 0.01, 1));
              }}
              className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            />
          </label>

          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span>{tNodes("adjustments.crop.fields.height")}</span>
            <input
              type="number"
              min={0.01}
              max={1}
              step={0.01}
              value={localData.crop.height}
              onChange={(event) => {
                const parsed = parseNumberInput(event.target.value);
                if (parsed === null) return;
                updateCropField("height", clamp(parsed, 0.01, 1));
              }}
              className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="space-y-1">
            <div className="text-muted-foreground">{tNodes("adjustments.crop.resizeMode")}</div>
            <Select
              value={localData.resize.mode}
              onValueChange={(value: CropResizeMode) => {
                updateResize({ mode: value });
              }}
            >
              <SelectTrigger className="nodrag h-8 text-xs" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="nodrag">
                <SelectItem value="source">{tNodes("adjustments.crop.resizeModes.source")}</SelectItem>
                <SelectItem value="custom">{tNodes("adjustments.crop.resizeModes.custom")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground">{tNodes("adjustments.crop.fitMode")}</div>
            <Select
              value={localData.resize.fit}
              onValueChange={(value: CropFitMode) => {
                updateResize({ fit: value });
              }}
            >
              <SelectTrigger className="nodrag h-8 text-xs" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="nodrag">
                <SelectItem value="cover">{tNodes("adjustments.crop.fitModes.cover")}</SelectItem>
                <SelectItem value="contain">{tNodes("adjustments.crop.fitModes.contain")}</SelectItem>
                <SelectItem value="fill">{tNodes("adjustments.crop.fitModes.fill")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {localData.resize.mode === "custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11px] text-muted-foreground">
              <span>{tNodes("adjustments.crop.fields.outputWidth")}</span>
              <input
                type="number"
                min={1}
                max={16384}
                step={1}
                value={localData.resize.width ?? CUSTOM_DIMENSION_FALLBACK}
                onChange={(event) => {
                  const parsed = parseNumberInput(event.target.value);
                  if (parsed === null) return;
                  updateResize({ width: Math.round(clamp(parsed, 1, 16384)) });
                }}
                className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              />
            </label>

            <label className="space-y-1 text-[11px] text-muted-foreground">
              <span>{tNodes("adjustments.crop.fields.outputHeight")}</span>
              <input
                type="number"
                min={1}
                max={16384}
                step={1}
                value={localData.resize.height ?? CUSTOM_DIMENSION_FALLBACK}
                onChange={(event) => {
                  const parsed = parseNumberInput(event.target.value);
                  if (parsed === null) return;
                  updateResize({ height: Math.round(clamp(parsed, 1, 16384)) });
                }}
                className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              />
            </label>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={localData.resize.keepAspect}
            onChange={(event) => updateResize({ keepAspect: event.target.checked })}
            className="nodrag h-3.5 w-3.5 rounded border-input"
          />
          {tNodes("adjustments.crop.keepAspect")}
        </label>

        <div className="text-[10px] text-muted-foreground">
          {tNodes("adjustments.crop.cropSummary", {
            x: formatPercent(localData.crop.x),
            y: formatPercent(localData.crop.y),
            width: formatPercent(localData.crop.width),
            height: formatPercent(localData.crop.height),
          })}
        </div>

        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>
  );
}

export default function CropNode({ id, data, selected, width }: NodeProps<CropNodeType>) {
  return (
    <BaseNodeWrapper
      nodeType="crop"
      selected={selected}
      status={data._status}
      statusMessage={data._statusMessage}
      className="min-w-[320px] border-violet-500/30"
    >
      <CanvasHandle
        nodeId={id}
        nodeType="crop"
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-violet-500"
      />

      <CropNodeBody id={id} data={data} width={width} />

      <CanvasHandle
        nodeId={id}
        nodeType="crop"
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-violet-500"
      />
    </BaseNodeWrapper>
  );
}
