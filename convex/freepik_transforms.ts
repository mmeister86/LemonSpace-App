/**
 * Onboarding note:
 * Convex backend module for freepik transforms. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

"use node";

import { downloadFreepikBlob, FreepikApiError, freepikJsonRequest, isRecord } from "./freepik_client";
import {
  buildTaskStatusPath,
  extractTaskId,
  parseTaskStatusResponse,
  type FreepikImageTransformTaskStatusResponse,
  type FreepikTaskStatusResult,
} from "./freepik_tasks";

export type FreepikSkinEnhancerMode = "faithful" | "creative" | "flexible";

export async function removeImageBackground(params: {
  imageUrl: string;
}): Promise<{
  url: string;
  highResolutionUrl?: string;
  previewUrl?: string;
  originalUrl?: string;
}> {
  const body = new URLSearchParams({ image_url: params.imageUrl }).toString();
  const result = await freepikJsonRequest<{
    url?: string;
    high_resolution?: string;
    preview?: string;
    original?: string;
  }>({
    path: "/v1/ai/beta/remove-background",
    method: "POST",
    body,
    contentType: "application/x-www-form-urlencoded",
  });

  const url = result.url ?? result.high_resolution;
  if (!url) {
    throw new FreepikApiError({
      code: "unknown",
      message: "Freepik background removal response missing URL",
      retryable: false,
      body: result,
    });
  }

  return {
    url,
    ...(result.high_resolution ? { highResolutionUrl: result.high_resolution } : {}),
    ...(result.preview ? { previewUrl: result.preview } : {}),
    ...(result.original ? { originalUrl: result.original } : {}),
  };
}

export async function createImageTransformTask(params: {
  endpoint: string;
  payload: Record<string, unknown>;
}): Promise<{ task_id: string }> {
  const result = await freepikJsonRequest<unknown>({
    path: params.endpoint,
    method: "POST",
    body: JSON.stringify(params.payload),
  });

  return { task_id: extractTaskId(result) };
}

export async function createSkinEnhancerTask(params: {
  mode: FreepikSkinEnhancerMode;
  imageUrl: string;
  options?: Record<string, unknown>;
}): Promise<{ task_id: string }> {
  return createImageTransformTask({
    endpoint: `/v1/ai/skin-enhancer/${params.mode}`,
    payload: {
      image_url: params.imageUrl,
      ...(params.options ?? {}),
    },
  });
}

export async function createChangeCameraTask(params: {
  imageUrl: string;
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  outputFormat: "png" | "jpeg";
  seed?: number;
}): Promise<{ task_id: string }> {
  const payload: Record<string, unknown> = {
    image: params.imageUrl,
    horizontal_angle: params.horizontalAngle,
    vertical_angle: params.verticalAngle,
    zoom: params.zoom,
    output_format: params.outputFormat,
  };

  if (params.seed !== undefined) {
    payload.seed = params.seed;
  }

  return createImageTransformTask({
    endpoint: "/v1/ai/image-change-camera",
    payload,
  });
}

export async function createStyleTransferTaskOrRun(params: {
  imageUrl: string;
  styleReferenceUrl?: string;
  styleStrength?: number;
  structureStrength?: number;
  flavor?: string;
  engine?: string;
  fixedGeneration?: boolean;
  isPortrait?: boolean;
  portraitStyle?: string;
  portraitBeautifier?: string;
}): Promise<{ task_id: string } | { url: string }> {
  if (!params.styleReferenceUrl) {
    throw new Error("Style transfer requires a reference image");
  }

  const payload: Record<string, unknown> = {
    image: params.imageUrl,
    reference_image: params.styleReferenceUrl,
  };
  if (params.styleStrength !== undefined) {
    payload.style_strength = params.styleStrength;
  }
  if (params.structureStrength !== undefined) {
    payload.structure_strength = params.structureStrength;
  }
  if (params.flavor) {
    payload.flavor = params.flavor;
  }
  if (params.engine) {
    payload.engine = params.engine;
  }
  if (params.fixedGeneration !== undefined) {
    payload.fixed_generation = params.fixedGeneration;
  }
  if (params.isPortrait !== undefined) {
    payload.is_portrait = params.isPortrait;
  }
  if (params.isPortrait && params.portraitStyle) {
    payload.portrait_style = params.portraitStyle;
  }
  if (
    params.isPortrait &&
    params.portraitBeautifier &&
    params.portraitBeautifier !== "none"
  ) {
    payload.portrait_beautifier = params.portraitBeautifier;
  }

  const result = await freepikJsonRequest<unknown>({
    path: "/v1/ai/image-style-transfer",
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (isRecord(result)) {
    const directUrl =
      typeof result.transformed_image_url === "string"
        ? result.transformed_image_url
        : isRecord(result.data) && typeof result.data.transformed_image_url === "string"
          ? result.data.transformed_image_url
          : undefined;
    if (directUrl) {
      return { url: directUrl };
    }
  }

  return { task_id: extractTaskId(result) };
}

export async function getImageTransformTaskStatus(params: {
  taskId: string;
  statusEndpointPath: string;
}): Promise<FreepikImageTransformTaskStatusResponse> {
  const statusPath = buildTaskStatusPath(params.statusEndpointPath, params.taskId);
  const result = await freepikJsonRequest<FreepikTaskStatusResult>({
    path: statusPath,
    method: "GET",
  });

  return parseTaskStatusResponse(result, result);
}

export async function downloadImageAsBlob(url: string): Promise<Blob> {
  return downloadFreepikBlob(
    url,
    "Freepik image transform download timeout",
    "Netzwerkfehler beim Bild-Download",
  );
}
