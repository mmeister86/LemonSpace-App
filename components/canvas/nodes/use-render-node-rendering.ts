import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isPipelineAbortError, renderFullWithWorkerFallback } from "@/lib/image-pipeline/worker-client";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import type { RenderSourceComposition } from "@/lib/image-pipeline/render-types";
import type { PersistedRenderData } from "./render-node-state";
import { extensionForFormat, logRenderDebug } from "./render-node-state";

async function uploadBlobToConvex(args: {
  uploadUrl: string;
  blob: Blob;
  mimeType: string;
}): Promise<{ storageId: string }> {
  const response = await fetch(args.uploadUrl, {
    method: "POST",
    headers: { "Content-Type": args.mimeType },
    body: args.blob,
  });

  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Upload failed: invalid response");
  }

  const storageId = (payload as { storageId?: unknown }).storageId;
  if (typeof storageId !== "string" || storageId.length === 0) {
    throw new Error("Upload failed: missing storageId");
  }

  return { storageId };
}

export function useRenderNodeRendering(args: {
  id: string;
  localDataRef: React.MutableRefObject<PersistedRenderData>;
  setLocalData: (next: PersistedRenderData) => void;
  queueNodeDataUpdate: (args: { nodeId: Id<"nodes">; data: PersistedRenderData }) => Promise<void>;
  sourceUrl: string | null | undefined;
  sourceComposition: RenderSourceComposition | undefined;
  steps: PipelineStep[];
  currentPipelineHash: string | null;
  isOffline: boolean;
}) {
  const {
    id,
    localDataRef,
    setLocalData,
    queueNodeDataUpdate,
    sourceUrl,
    sourceComposition,
    steps,
    currentPipelineHash,
    isOffline,
  } = args;
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const [isRendering, setIsRendering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const renderRunIdRef = useRef(0);
  const renderAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      renderAbortControllerRef.current?.abort();
      renderAbortControllerRef.current = null;
    };
  }, []);

  const persistImmediately = async (next: PersistedRenderData) => {
    localDataRef.current = next;
    setLocalData(next);
    await queueNodeDataUpdate({ nodeId: id as Id<"nodes">, data: next });
  };

  const applyLocalDataImmediately = (next: PersistedRenderData) => {
    localDataRef.current = next;
    setLocalData(next);
  };

  const handleRender = async (mode: "download" | "upload") => {
    if ((!sourceUrl && !sourceComposition) || !currentPipelineHash) {
      logRenderDebug("render-aborted-prerequisites", {
        nodeId: id,
        mode,
        hasSourceUrl: Boolean(sourceUrl),
        hasSourceComposition: Boolean(sourceComposition),
        hasPipelineHash: Boolean(currentPipelineHash),
        isOffline,
      });
      return;
    }

    if (
      localDataRef.current.outputResolution === "custom" &&
      (localDataRef.current.customWidth === undefined || localDataRef.current.customHeight === undefined)
    ) {
      const next = {
        ...localDataRef.current,
        lastRenderError: "Custom width and height are required.",
        lastRenderErrorHash: currentPipelineHash,
      };
      if (mode === "upload") await persistImmediately(next);
      else applyLocalDataImmediately(next);
      return;
    }

    renderRunIdRef.current += 1;
    const runId = renderRunIdRef.current;
    renderAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    renderAbortControllerRef.current = abortController;
    setIsRendering(true);

    try {
      const activeData = localDataRef.current;
      logRenderDebug("render-start", {
        nodeId: id,
        mode,
        pipelineHash: currentPipelineHash,
        resolution: activeData.outputResolution,
        customWidth: activeData.customWidth ?? null,
        customHeight: activeData.customHeight ?? null,
        format: activeData.format,
        jpegQuality: activeData.format === "jpeg" ? activeData.jpegQuality : null,
      });

      const renderResult = await renderFullWithWorkerFallback({
        sourceUrl: sourceUrl ?? undefined,
        sourceComposition,
        steps,
        render: {
          resolution: activeData.outputResolution,
          customSize:
            activeData.outputResolution === "custom" &&
            activeData.customWidth !== undefined &&
            activeData.customHeight !== undefined
              ? { width: activeData.customWidth, height: activeData.customHeight }
              : undefined,
          format: activeData.format,
          jpegQuality: activeData.format === "jpeg" ? activeData.jpegQuality / 100 : undefined,
        },
        signal: abortController.signal,
      });

      if (runId !== renderRunIdRef.current) return;

      const filename = `lemonspace-render-${Date.now()}.${extensionForFormat(renderResult.format)}`;

      if (mode === "download") {
        const objectUrl = window.URL.createObjectURL(renderResult.blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 30_000);
      }

      const renderNext: PersistedRenderData = {
        ...activeData,
        lastRenderedAt: Date.now(),
        lastRenderedHash: currentPipelineHash,
        lastRenderWidth: renderResult.width,
        lastRenderHeight: renderResult.height,
        lastRenderFormat: renderResult.format,
        lastRenderMimeType: renderResult.mimeType,
        lastRenderSizeBytes: renderResult.sizeBytes,
        lastRenderQuality: renderResult.quality,
        lastRenderSourceWidth: renderResult.sourceWidth,
        lastRenderSourceHeight: renderResult.sourceHeight,
        lastRenderWasSizeClamped: renderResult.wasSizeClamped,
        lastRenderError: undefined,
        lastRenderErrorHash: undefined,
      };

      if (mode !== "upload") {
        applyLocalDataImmediately(renderNext);
        return;
      }

      if (runId !== renderRunIdRef.current) return;
      setIsUploading(true);

      try {
        const uploadUrl = await generateUploadUrl();
        if (runId !== renderRunIdRef.current) return;

        const { storageId } = await uploadBlobToConvex({
          uploadUrl,
          blob: renderResult.blob,
          mimeType: renderResult.mimeType,
        });

        if (runId !== renderRunIdRef.current) return;

        await persistImmediately({
          ...renderNext,
          storageId,
          url: undefined,
          lastUploadedAt: Date.now(),
          lastUploadedHash: currentPipelineHash,
          lastUploadStorageId: storageId,
          lastUploadUrl: undefined,
          lastUploadMimeType: renderResult.mimeType,
          lastUploadSizeBytes: renderResult.sizeBytes,
          lastUploadFilename: filename,
          lastUploadError: undefined,
          lastUploadErrorHash: undefined,
        });
      } catch (uploadError: unknown) {
        if (runId !== renderRunIdRef.current) return;

        const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
        await persistImmediately({
          ...renderNext,
          lastUploadError: message,
          lastUploadErrorHash: currentPipelineHash,
        });
      } finally {
        if (runId === renderRunIdRef.current) setIsUploading(false);
      }
    } catch (error: unknown) {
      if (runId !== renderRunIdRef.current) return;
      if (isPipelineAbortError(error)) return;

      const message = error instanceof Error ? error.message : "Render failed";
      const next: PersistedRenderData = {
        ...localDataRef.current,
        lastRenderError: message,
        lastRenderErrorHash: currentPipelineHash,
      };
      if (mode === "upload") await persistImmediately(next);
      else applyLocalDataImmediately(next);
    } finally {
      if (runId === renderRunIdRef.current) {
        if (renderAbortControllerRef.current === abortController) {
          renderAbortControllerRef.current = null;
        }
        setIsRendering(false);
      }
    }
  };

  return { isRendering, isUploading, handleRender };
}
