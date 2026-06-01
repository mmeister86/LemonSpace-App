"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas render node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Maximize2 } from "lucide-react";

import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import type { Id } from "@/convex/_generated/dataModel";
import { readNodeCollapsed } from "@/lib/canvas-node-favorite";
import {
  ASPECT_RATIO_TOLERANCE,
  RENDER_NODE_HEADER_HEIGHT,
  SIZE_TOLERANCE_PX,
  type PersistedRenderData,
  type RenderNodeData,
  type RenderState,
  logRenderDebug,
  resolveRenderPreviewDisplaySize,
  sanitizeRenderData,
  toRenderNodeAspectSize,
} from "./render-node-state";
import {
  RenderNodeBottomStatus,
  RenderNodeFullscreenDialog,
  RenderNodeHistogram,
  RenderNodeMenu,
  RenderNodePreviewSurface,
  RenderNodeStatusOverlay,
} from "./render-node-ui";
import { MediaBacklight } from "./media-backlight";
import { useRenderNodePreview } from "./use-render-node-preview";
import { useRenderNodeRendering } from "./use-render-node-rendering";

export type RenderNodeType = Node<RenderNodeData, "render">;

export default function RenderNode({ id, data, selected, width, height }: NodeProps<RenderNodeType>) {
  const { queueNodeDataUpdate, queueNodeResize, status } = useCanvasSync();
  const [localData, setLocalData] = useState<PersistedRenderData>(() => sanitizeRenderData(data));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [previewViewportSize, setPreviewViewportSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const localDataRef = useRef(localData);
  const lastAspectResizeRequestRef = useRef<{
    fromWidth: number;
    fromHeight: number;
    width: number;
    height: number;
    aspectRatio: number;
  } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalData(sanitizeRenderData(data));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data]);

  const queueSave = useDebouncedCallback(() => {
    void queueNodeDataUpdate({ nodeId: id as Id<"nodes">, data: localDataRef.current });
  }, 120);

  const updateLocalData = (updater: (current: PersistedRenderData) => PersistedRenderData) => {
    setLocalData((current) => {
      const next = updater(current);
      localDataRef.current = next;
      queueSave();
      return next;
    });
  };

  useEffect(() => {
    const previewViewport = previewViewportRef.current;
    if (!previewViewport) {
      return undefined;
    }

    const updatePreviewViewportSize = (nextWidth: number, nextHeight: number) => {
      const roundedWidth = Math.max(1, Math.round(nextWidth));
      const roundedHeight = Math.max(1, Math.round(nextHeight));

      setPreviewViewportSize((current) =>
        current?.width === roundedWidth && current?.height === roundedHeight
          ? current
          : { width: roundedWidth, height: roundedHeight },
      );
    };

    const measurePreviewViewport = () => {
      const rect = previewViewport.getBoundingClientRect();
      updatePreviewViewportSize(rect.width, rect.height);
    };

    measurePreviewViewport();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updatePreviewViewportSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(previewViewport);
    return () => observer.disconnect();
  }, []);

  const fallbackPreviewViewportWidth =
    typeof width === "number" && Number.isFinite(width) && width > 0 ? width : undefined;
  const fallbackPreviewViewportHeight =
    typeof height === "number" && Number.isFinite(height) && height > RENDER_NODE_HEADER_HEIGHT
      ? height - RENDER_NODE_HEADER_HEIGHT
      : undefined;
  const previewViewportWidth = previewViewportSize?.width ?? fallbackPreviewViewportWidth;
  const previewViewportHeight = previewViewportSize?.height ?? fallbackPreviewViewportHeight;

  const previewState = useRenderNodePreview({
    id,
    localData,
    width: previewViewportWidth,
    height: previewViewportHeight,
    isFullscreenOpen,
  });
  const { sourceUrl, sourceComposition, steps, currentPipelineHash, hasSource } = previewState;

  useEffect(() => {
    const targetAspectRatio = previewState.targetAspectRatio;
    if (
      !hasSource ||
      readNodeCollapsed(data) ||
      typeof targetAspectRatio !== "number" ||
      !Number.isFinite(targetAspectRatio) ||
      targetAspectRatio <= 0
    ) {
      lastAspectResizeRequestRef.current = null;
      return;
    }

    const currentWidth = typeof width === "number" ? width : 0;
    const currentHeight = typeof height === "number" ? height : 0;
    if (currentWidth <= 0 || currentHeight <= 0) return;

    const nextSize = toRenderNodeAspectSize({
      currentWidth,
      currentHeight,
      aspectRatio: targetAspectRatio,
    });
    const currentPreviewHeight = currentHeight - RENDER_NODE_HEADER_HEIGHT;
    const currentAspectRatio = currentWidth / Math.max(1, currentPreviewHeight);
    if (
      Math.abs(currentAspectRatio - targetAspectRatio) <= ASPECT_RATIO_TOLERANCE &&
      Math.abs(nextSize.width - currentWidth) <= SIZE_TOLERANCE_PX &&
      Math.abs(nextSize.height - currentHeight) <= SIZE_TOLERANCE_PX
    ) {
      lastAspectResizeRequestRef.current = null;
      return;
    }

    const lastRequest = lastAspectResizeRequestRef.current;
    if (
      lastRequest &&
      lastRequest.fromWidth === currentWidth &&
      lastRequest.fromHeight === currentHeight &&
      lastRequest.width === nextSize.width &&
      lastRequest.height === nextSize.height &&
      Math.abs(lastRequest.aspectRatio - targetAspectRatio) <= ASPECT_RATIO_TOLERANCE
    ) {
      return;
    }

    lastAspectResizeRequestRef.current = {
      fromWidth: currentWidth,
      fromHeight: currentHeight,
      width: nextSize.width,
      height: nextSize.height,
      aspectRatio: targetAspectRatio,
    };
    void queueNodeResize({
      nodeId: id as Id<"nodes">,
      width: nextSize.width,
      height: nextSize.height,
      skipHistory: true,
    });
  }, [data, hasSource, height, id, previewState.targetAspectRatio, queueNodeResize, width]);

  useEffect(() => {
    logRenderDebug("node-data-updated", {
      nodeId: id,
      hasSourceUrl: typeof sourceUrl === "string" && sourceUrl.length > 0,
      hasSourceComposition: Boolean(sourceComposition),
      storageId: data.storageId ?? null,
      lastUploadStorageId: data.lastUploadStorageId ?? null,
      hasResolvedUrl: typeof data.url === "string" && data.url.length > 0,
      lastUploadedAt: data.lastUploadedAt ?? null,
      lastUploadedHash: data.lastUploadedHash ?? null,
      lastRenderedHash: data.lastRenderedHash ?? null,
    });
  }, [data.lastRenderedHash, data.lastUploadStorageId, data.lastUploadedAt, data.lastUploadedHash, data.storageId, data.url, id, sourceComposition, sourceUrl]);

  const { isRendering, isUploading, handleRender } = useRenderNodeRendering({
    id,
    localDataRef,
    setLocalData,
    queueNodeDataUpdate,
    sourceUrl,
    sourceComposition,
    steps,
    currentPipelineHash,
    isOffline: status.isOffline,
  });

  const isRenderCurrent = Boolean(currentPipelineHash) && localData.lastRenderedHash === currentPipelineHash;
  const currentError =
    currentPipelineHash && localData.lastRenderErrorHash === currentPipelineHash
      ? localData.lastRenderError
      : undefined;
  const currentUploadError =
    currentPipelineHash && localData.lastUploadErrorHash === currentPipelineHash
      ? localData.lastUploadError
      : undefined;
  const isUploadCurrent = Boolean(currentPipelineHash) && localData.lastUploadedHash === currentPipelineHash;
  const renderState: RenderState = isRendering
    ? "rendering"
    : currentError
      ? "error"
      : isRenderCurrent && typeof localData.lastRenderedAt === "number"
        ? "done"
        : "idle";
  const canRender =
    hasSource &&
    !isRendering &&
    !isUploading &&
    (localData.outputResolution !== "custom" ||
      (typeof localData.customWidth === "number" && typeof localData.customHeight === "number"));
  const canUpload = canRender && !status.isOffline;
  const canOpenFullscreen = hasSource || Boolean(localData.url);

  useEffect(() => {
    if (!isMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (target && (menuButtonRef.current?.contains(target) || menuPanelRef.current?.contains(target))) {
        return;
      }
      setIsMenuOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isMenuOpen]);

  const wrapperStatus = renderState === "rendering" ? "executing" : renderState;
  const renderBacklight = hasSource ? (
    <MediaBacklight>
      <div className="h-full w-full bg-sky-500/25 dark:bg-sky-400/20" />
    </MediaBacklight>
  ) : undefined;
  const previewDisplaySize = useMemo(
    () =>
      resolveRenderPreviewDisplaySize({
        containerWidth: previewViewportWidth,
        containerHeight: previewViewportHeight,
        aspectRatio: previewState.targetAspectRatio ?? previewState.preview.previewAspectRatio,
      }),
    [
      previewState.preview.previewAspectRatio,
      previewState.targetAspectRatio,
      previewViewportHeight,
      previewViewportWidth,
    ],
  );

  return (
    <>
      <BaseNodeWrapper
        nodeType="render"
        selected={selected}
        status={wrapperStatus}
        statusMessage={currentError ?? data._statusMessage}
        toolbarActions={[
          {
            id: "fullscreen-output",
            label: "Fullscreen",
            icon: <Maximize2 size={14} />,
            onClick: () => setIsFullscreenOpen(true),
            disabled: !canOpenFullscreen,
          },
        ]}
        className="flex h-full flex-col border-sky-500/30"
        contentClassName="flex min-h-0 flex-col"
        backlight={renderBacklight}
      >
        <CanvasHandle
          nodeId={id}
          nodeType="render"
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-sky-500"
        />

        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="text-xs font-medium text-sky-600 dark:text-sky-400">Bildausgabe</div>
        </div>

        <div
          ref={previewViewportRef}
          data-testid="render-preview-viewport"
          className="relative min-h-0 flex-1 overflow-hidden bg-muted/40"
        >
          <RenderNodePreviewSurface
            hasSource={hasSource}
            canvasRef={previewState.preview.canvasRef}
            isAlphaBearing={previewState.isAlphaBearing}
            displaySize={previewDisplaySize}
          />
          <RenderNodeStatusOverlay
            renderState={renderState}
            isPreviewRendering={previewState.preview.isRendering}
            previewError={previewState.preview.error}
            hasSource={hasSource}
          />
          <RenderNodeMenu
            localData={localData}
            updateLocalData={updateLocalData}
            isOpen={isMenuOpen}
            setIsOpen={setIsMenuOpen}
            buttonRef={menuButtonRef}
            panelRef={menuPanelRef}
            isRendering={isRendering}
            isUploading={isUploading}
            canRender={canRender}
            canUpload={canUpload}
            isOffline={status.isOffline}
            renderState={renderState}
            onRender={(mode) => void handleRender(mode)}
          />
          <RenderNodeBottomStatus
            renderState={renderState}
            isRenderCurrent={isRenderCurrent}
            localData={localData}
            currentError={currentError}
            isUploadCurrent={isUploadCurrent}
            currentUploadError={currentUploadError}
            previewError={previewState.preview.error}
          />
          <RenderNodeHistogram histogramPlot={previewState.histogramPlot} />
        </div>

        <CanvasHandle
          nodeId={id}
          nodeType="render"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background !bg-sky-500"
        />
      </BaseNodeWrapper>

      <RenderNodeFullscreenDialog
        open={isFullscreenOpen}
        onOpenChange={setIsFullscreenOpen}
        hasSource={hasSource}
        localData={localData}
        canvasRef={previewState.fullscreenPreview.canvasRef}
        isRendering={previewState.fullscreenPreview.isRendering}
        error={previewState.fullscreenPreview.error}
        isAlphaBearing={previewState.isAlphaBearing}
      />
    </>
  );
}
