"use client";

import { useEffect, useRef, useState } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Maximize2 } from "lucide-react";

import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type PersistedRenderData,
  type RenderNodeData,
  type RenderState,
  logRenderDebug,
  sanitizeRenderData,
} from "./render-node-state";
import {
  RenderNodeBottomStatus,
  RenderNodeFullscreenDialog,
  RenderNodeHistogram,
  RenderNodeMenu,
  RenderNodePreviewSurface,
  RenderNodeStatusOverlay,
} from "./render-node-ui";
import { useRenderNodePreview } from "./use-render-node-preview";
import { useRenderNodeRendering } from "./use-render-node-rendering";

export type RenderNodeType = Node<RenderNodeData, "render">;

export default function RenderNode({ id, data, selected, width, height }: NodeProps<RenderNodeType>) {
  const { queueNodeDataUpdate, queueNodeResize, status } = useCanvasSync();
  const [localData, setLocalData] = useState<PersistedRenderData>(() => sanitizeRenderData(data));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const localDataRef = useRef(localData);
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

  const previewState = useRenderNodePreview({
    id,
    localData,
    width,
    height,
    isFullscreenOpen,
    queueNodeResize,
  });
  const { sourceUrl, sourceComposition, steps, currentPipelineHash, hasSource } = previewState;

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
        className="flex h-full min-w-[280px] flex-col overflow-hidden border-sky-500/30"
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

        <div className="relative min-h-[300px] flex-1 overflow-hidden bg-muted/40">
          <RenderNodePreviewSurface hasSource={hasSource} canvasRef={previewState.preview.canvasRef} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background/80" />
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
      />
    </>
  );
}
