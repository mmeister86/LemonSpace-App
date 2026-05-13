"use client";

/**
 * Materializes a render node's current preview into Convex Storage so downstream
 * AI generation can use the exact render state the user sees.
 */

import type { Id } from "@/convex/_generated/dataModel";
import type {
  CanvasGraphNodeLike,
  CanvasGraphSnapshot,
} from "@/lib/canvas-render-preview";
import {
  resolveRenderPipelineHash,
  resolveRenderPreviewInputFromGraph,
} from "@/lib/canvas-render-preview";
import { renderFullWithWorkerFallback } from "@/lib/image-pipeline/worker-client";
import type { RenderFullResult } from "@/lib/image-pipeline/render-types";
import type { AiImageReferenceInput } from "@/lib/ai-image-references";
import {
  type PersistedRenderData,
  type RenderNodeData,
  sanitizeRenderData,
} from "./render-node-state";

type QueueNodeDataUpdate = (args: {
  nodeId: Id<"nodes">;
  data: PersistedRenderData;
}) => Promise<void> | void;

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

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

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

function resolveExistingRenderReference(args: {
  node: CanvasGraphNodeLike;
  label: string;
  renderPipelineHash?: string;
}): AiImageReferenceInput | null {
  const data = (args.node.data ?? {}) as Record<string, unknown>;
  const storageId =
    typeof data.storageId === "string" && data.storageId.length > 0
      ? data.storageId
      : typeof data.lastUploadStorageId === "string" && data.lastUploadStorageId.length > 0
        ? data.lastUploadStorageId
        : undefined;
  const imageUrl =
    typeof data.url === "string" && data.url.length > 0
      ? data.url
      : typeof data.lastUploadUrl === "string" && data.lastUploadUrl.length > 0
        ? data.lastUploadUrl
        : undefined;

  if (!storageId && !imageUrl) {
    return null;
  }

  return {
    sourceNodeId: args.node.id,
    sourceType: "render",
    label: args.label,
    ...(storageId ? { storageId } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(args.renderPipelineHash ? { renderPipelineHash: args.renderPipelineHash } : {}),
  };
}

function buildUploadedRenderData(args: {
  current: PersistedRenderData;
  result: RenderFullResult;
  storageId: string;
  pipelineHash: string;
  timestamp: number;
}): PersistedRenderData {
  return {
    ...args.current,
    lastRenderedAt: args.timestamp,
    lastRenderedHash: args.pipelineHash,
    lastRenderWidth: args.result.width,
    lastRenderHeight: args.result.height,
    lastRenderFormat: args.result.format,
    lastRenderMimeType: args.result.mimeType,
    lastRenderSizeBytes: args.result.sizeBytes,
    lastRenderQuality: args.result.quality,
    lastRenderSourceWidth: args.result.sourceWidth,
    lastRenderSourceHeight: args.result.sourceHeight,
    lastRenderWasSizeClamped: args.result.wasSizeClamped,
    lastRenderError: undefined,
    lastRenderErrorHash: undefined,
    storageId: args.storageId,
    url: undefined,
    lastUploadedAt: args.timestamp,
    lastUploadedHash: args.pipelineHash,
    lastUploadStorageId: args.storageId,
    lastUploadUrl: undefined,
    lastUploadMimeType: args.result.mimeType,
    lastUploadSizeBytes: args.result.sizeBytes,
    lastUploadFilename: `lemonspace-render-${args.timestamp}.${args.result.format === "jpeg" ? "jpg" : args.result.format}`,
    lastUploadError: undefined,
    lastUploadErrorHash: undefined,
  };
}

export async function materializeRenderReference(args: {
  node: CanvasGraphNodeLike;
  graph: CanvasGraphSnapshot;
  label: string;
  generateUploadUrl: () => Promise<string>;
  queueNodeDataUpdate: QueueNodeDataUpdate;
}): Promise<AiImageReferenceInput | null> {
  const data = (args.node.data ?? {}) as RenderNodeData;
  const preview = resolveRenderPreviewInputFromGraph({
    nodeId: args.node.id,
    graph: args.graph,
  });
  const pipelineHash = resolveRenderPipelineHash({
    sourceUrl: preview.sourceUrl,
    sourceComposition: preview.sourceComposition,
    steps: preview.steps,
    data,
  });

  const existingReference = resolveExistingRenderReference({
    node: args.node,
    label: args.label,
    renderPipelineHash: pipelineHash ?? undefined,
  });
  if (
    pipelineHash &&
    data.lastUploadedHash === pipelineHash &&
    existingReference
  ) {
    return existingReference;
  }

  if (!pipelineHash || (!preview.sourceUrl && !preview.sourceComposition)) {
    return existingReference;
  }

  const current = sanitizeRenderData(data);
  const renderResult = await renderFullWithWorkerFallback({
    sourceUrl: preview.sourceUrl ?? undefined,
    sourceComposition: preview.sourceComposition,
    steps: preview.steps,
    render: {
      resolution: current.outputResolution,
      customSize:
        current.outputResolution === "custom" &&
        current.customWidth !== undefined &&
        current.customHeight !== undefined
          ? { width: current.customWidth, height: current.customHeight }
          : undefined,
      format: current.format,
      jpegQuality: current.format === "jpeg" ? current.jpegQuality / 100 : undefined,
    },
  });

  const uploadUrl = await args.generateUploadUrl();
  const { storageId } = await uploadBlobToConvex({
    uploadUrl,
    blob: renderResult.blob,
    mimeType: renderResult.mimeType,
  });
  const timestamp = Date.now();
  const nextData = buildUploadedRenderData({
    current,
    result: renderResult,
    storageId,
    pipelineHash,
    timestamp,
  });

  await args.queueNodeDataUpdate({
    nodeId: args.node.id as Id<"nodes">,
    data: nextData,
  });

  return {
    sourceNodeId: args.node.id,
    sourceType: "render",
    label: args.label,
    storageId,
    renderPipelineHash: pipelineHash,
  };
}
