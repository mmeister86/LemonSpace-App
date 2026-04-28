"use node";

import { shouldLogVideoPollResult, type VideoPollStatus } from "../lib/video-poll-logging";
import { action } from "./_generated/server";
import { downloadFreepikBlob, freepikJsonRequest, isRecord } from "./freepik_client";
import { freepikSearchArgs, searchFreepikAssets } from "./freepik_search";
import {
  buildTaskStatusPath,
  extractTaskId,
  parseTaskStatusResponse,
  type FreepikTaskStatusResult,
} from "./freepik_tasks";

export { FreepikApiError, mapFreepikError, type FreepikMappedError } from "./freepik_client";
export {
  type FreepikImageTransformTaskStatus,
  type FreepikImageTransformTaskStatusResponse,
  type FreepikVideoTaskStatus,
  type FreepikVideoTaskStatusResponse,
} from "./freepik_tasks";
export {
  createChangeCameraTask,
  createImageTransformTask,
  createSkinEnhancerTask,
  createStyleTransferTaskOrRun,
  downloadImageAsBlob,
  getImageTransformTaskStatus,
  removeImageBackground,
  type FreepikSkinEnhancerMode,
} from "./freepik_transforms";

export async function createVideoTask(params: {
  endpoint: string;
  prompt: string;
  durationSeconds: 5 | 10;
  webhookUrl?: string;
  imageUrl?: string;
}): Promise<{ task_id: string }> {
  const payload: Record<string, unknown> = {
    prompt: params.prompt,
    duration: params.durationSeconds,
  };
  if (params.webhookUrl) {
    payload.webhook_url = params.webhookUrl;
  }
  if (params.imageUrl) {
    payload.image_url = params.imageUrl;
  }

  const result = await freepikJsonRequest<{ data?: { task_id?: string } }>({
    path: params.endpoint,
    method: "POST",
    body: JSON.stringify(payload),
  });

  console.info("[freepik.createVideoTask] response", {
    endpoint: params.endpoint,
    durationSeconds: params.durationSeconds,
    hasImageUrl: Boolean(params.imageUrl),
    promptLength: params.prompt.length,
    responseKeys: isRecord(result) ? Object.keys(result) : [],
    dataKeys: isRecord(result.data) ? Object.keys(result.data) : [],
  });

  return { task_id: extractTaskId(result) };
}

export async function getVideoTaskStatus(params: {
  taskId: string;
  statusEndpointPath: string;
  attempt?: number;
}): Promise<import("./freepik_tasks").FreepikVideoTaskStatusResponse> {
  const statusPath = buildTaskStatusPath(params.statusEndpointPath, params.taskId);
  const result = await freepikJsonRequest<FreepikTaskStatusResult>({
    path: statusPath,
    method: "GET",
  });

  const parsed = parseTaskStatusResponse(result, result);
  const status = parsed.status;
  const statusRaw = result.data?.status ?? result.status;

  if (
    status &&
    shouldLogVideoPollResult(params.attempt ?? 1, status as VideoPollStatus)
  ) {
    console.info("[freepik.getVideoTaskStatus] response", {
      taskId: params.taskId,
      statusPath,
      statusRaw: typeof statusRaw === "string" ? statusRaw : null,
      acceptedStatus: status,
      dataKeys: isRecord(result.data) ? Object.keys(result.data) : [],
      generatedCount: Array.isArray(result.data?.generated)
        ? result.data.generated.length
        : Array.isArray(result.generated)
          ? result.generated.length
          : 0,
      hasError:
        typeof result.data?.error === "string" || typeof result.error === "string",
      hasMessage:
        typeof result.data?.message === "string" || typeof result.message === "string",
    });
  }

  return parsed;
}

export async function downloadVideoAsBlob(url: string): Promise<Blob> {
  return downloadFreepikBlob(
    url,
    "Freepik video download timeout",
    "Netzwerkfehler beim Video-Download",
  );
}

export const search = action({
  args: freepikSearchArgs,
  handler: async (_ctx, args) => searchFreepikAssets(args),
});
