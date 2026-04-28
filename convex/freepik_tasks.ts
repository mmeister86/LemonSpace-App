"use node";

import { FreepikApiError, isRecord } from "./freepik_client";

export type FreepikVideoTaskStatus =
  | "CREATED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

export interface FreepikVideoTaskStatusResponse {
  status: FreepikVideoTaskStatus;
  generated?: Array<{ url: string }>;
  error?: string;
}

export type FreepikImageTransformTaskStatus = FreepikVideoTaskStatus;

export interface FreepikImageTransformTaskStatusResponse {
  status: FreepikImageTransformTaskStatus;
  generated?: Array<{ url: string }>;
  error?: string;
}

export type FreepikTaskStatusResult = {
  data?: {
    status?: string;
    generated?: unknown;
    error?: string;
    message?: string;
  };
  status?: string;
  generated?: unknown;
  error?: string;
  message?: string;
};

export function extractTaskId(result: unknown): string {
  const taskId =
    isRecord(result) && isRecord(result.data) && typeof result.data.task_id === "string"
      ? result.data.task_id
      : isRecord(result) && typeof result.task_id === "string"
        ? result.task_id
        : undefined;

  if (typeof taskId !== "string" || taskId.trim().length === 0) {
    throw new FreepikApiError({
      code: "unknown",
      message: "Freepik response missing task_id",
      retryable: false,
      body: result,
    });
  }

  return taskId;
}

function normalizeGeneratedUrls(generatedRaw: unknown): Array<{ url: string }> | undefined {
  if (!Array.isArray(generatedRaw)) {
    return undefined;
  }

  const generated = generatedRaw
    .map((entry) => {
      const url =
        typeof entry === "string"
          ? entry
          : isRecord(entry) && typeof entry.url === "string"
            ? entry.url
            : undefined;
      if (!url) return null;
      return { url };
    })
    .filter((entry): entry is { url: string } => entry !== null);

  return generated.length > 0 ? generated : undefined;
}

export function parseTaskStatusResponse(
  result: FreepikTaskStatusResult,
  bodyForError: unknown,
): FreepikImageTransformTaskStatusResponse {
  const statusRaw =
    typeof result.data?.status === "string"
      ? result.data.status
      : typeof result.status === "string"
        ? result.status
        : undefined;
  const status =
    statusRaw === "CREATED" ||
    statusRaw === "IN_PROGRESS" ||
    statusRaw === "COMPLETED" ||
    statusRaw === "FAILED"
      ? statusRaw
      : null;

  if (!status) {
    throw new FreepikApiError({
      code: "unknown",
      message: "Freepik task status missing or invalid",
      retryable: false,
      body: bodyForError,
    });
  }

  const generated = normalizeGeneratedUrls(
    Array.isArray(result.data?.generated) ? result.data.generated : result.generated,
  );

  const error =
    typeof result.data?.error === "string"
      ? result.data.error
      : typeof result.data?.message === "string"
        ? result.data.message
        : typeof result.error === "string"
          ? result.error
          : typeof result.message === "string"
            ? result.message
            : undefined;

  return {
    status,
    ...(generated ? { generated } : {}),
    ...(error ? { error } : {}),
  };
}

export function buildTaskStatusPath(statusEndpointPath: string, taskId: string): string {
  const trimmedTaskId = taskId.trim();
  if (!trimmedTaskId) {
    throw new FreepikApiError({
      code: "unknown",
      message: "Missing Freepik task_id for status polling",
      retryable: false,
    });
  }

  if (statusEndpointPath.includes("{task-id}")) {
    return statusEndpointPath.replaceAll("{task-id}", encodeURIComponent(trimmedTaskId));
  }

  const suffix = statusEndpointPath.endsWith("/") ? "" : "/";
  return `${statusEndpointPath}${suffix}${encodeURIComponent(trimmedTaskId)}`;
}
