"use client";

/**
 * Materializes a transform node input pipeline so remote providers receive the
 * exact image state shown in the canvas preview.
 */

import type { Id } from "@/convex/_generated/dataModel";
import {
  resolveImageTransformPreviewInputFromGraph,
  resolveRenderPipelineHash,
  type CanvasGraphSnapshot,
} from "@/lib/canvas-render-preview";
import { renderFullWithWorkerFallback } from "@/lib/image-pipeline/worker-client";

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

  const payload = (await response.json()) as { storageId?: unknown };
  if (typeof payload.storageId !== "string" || payload.storageId.length === 0) {
    throw new Error("Upload failed: missing storageId");
  }

  return { storageId: payload.storageId };
}

export async function materializeImageTransformInput(args: {
  nodeId: string;
  graph: CanvasGraphSnapshot;
  generateUploadUrl: () => Promise<string>;
}): Promise<{
  storageId: Id<"_storage">;
  width: number;
  height: number;
  mimeType: string;
  pipelineHash: string;
} | null> {
  const preview = resolveImageTransformPreviewInputFromGraph({
    nodeId: args.nodeId,
    graph: args.graph,
  });
  if (!preview.sourceUrl || preview.steps.length === 0) {
    return null;
  }

  const pipelineHash = resolveRenderPipelineHash({
    sourceUrl: preview.sourceUrl,
    steps: preview.steps,
    data: { materializeFor: "image-transform" },
  });
  if (!pipelineHash) {
    return null;
  }

  const result = await renderFullWithWorkerFallback({
    sourceUrl: preview.sourceUrl,
    steps: preview.steps,
    render: {
      resolution: "original",
      format: "png",
    },
  });
  const uploadUrl = await args.generateUploadUrl();
  const upload = await uploadBlobToConvex({
    uploadUrl,
    blob: result.blob,
    mimeType: result.mimeType,
  });

  return {
    storageId: upload.storageId as Id<"_storage">,
    width: result.width,
    height: result.height,
    mimeType: result.mimeType,
    pipelineHash,
  };
}
