"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { shouldLogVideoPollResult, type VideoPollStatus } from "../lib/video-poll-logging";

const FREEPIK_BASE = "https://api.freepik.com";
const FREEPIK_REQUEST_TIMEOUT_MS = 30_000;
const FREEPIK_MAX_RETRIES = 2;

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

export type FreepikSkinEnhancerMode = "faithful" | "creative" | "flexible";

export interface FreepikMappedError {
  code: "model_unavailable" | "timeout" | "transient" | "unknown";
  message: string;
  retryable: boolean;
}

export class FreepikApiError extends Error {
  readonly source = "freepik" as const;
  readonly status?: number;
  readonly code: FreepikMappedError["code"];
  readonly retryable: boolean;
  readonly body?: unknown;

  constructor(args: {
    status?: number;
    code: FreepikMappedError["code"];
    message: string;
    retryable: boolean;
    body?: unknown;
  }) {
    super(args.message);
    this.name = "FreepikApiError";
    this.status = args.status;
    this.code = args.code;
    this.retryable = args.retryable;
    this.body = args.body;
  }
}

type AssetType = "photo" | "vector" | "icon";

interface FreepikResult {
  id: number;
  title: string;
  assetType: AssetType;
  previewUrl: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  sourceUrl: string;
  license: "freemium" | "premium";
  authorName: string;
  orientation?: string;
}

interface FreepikSearchResponse {
  results: FreepikResult[];
  totalPages: number;
  currentPage: number;
  total: number;
}

function parseSize(size?: string): { width?: number; height?: number } {
  if (!size) return {};
  const match = size.match(/^(\d+)x(\d+)$/i);
  if (!match) return {};
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {};
  }
  return { width, height };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getFreepikApiKeyOrThrow(): string {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) {
    throw new FreepikApiError({
      code: "model_unavailable",
      message: "FREEPIK_API_KEY not set",
      retryable: false,
    });
  }
  return apiKey;
}

function normalizeFreepikEndpoint(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${FREEPIK_BASE}${path}`;
  }
  return `${FREEPIK_BASE}/${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function extractErrorDetail(body: unknown): string | undefined {
  if (typeof body === "string" && body.trim().length > 0) {
    return body.trim();
  }
  if (!isRecord(body)) {
    return undefined;
  }

  const direct =
    typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
        ? body.message
        : undefined;
  if (direct && direct.trim().length > 0) {
    return direct.trim();
  }

  const data = body.data;
  if (isRecord(data)) {
    const nested =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : undefined;
    if (nested && nested.trim().length > 0) {
      return nested.trim();
    }
  }

  return undefined;
}

export function mapFreepikError(status: number, body: unknown): FreepikMappedError {
  const detail = extractErrorDetail(body);

  if (status === 401) {
    return {
      code: "model_unavailable",
      message: "Freepik API-Key ungueltig",
      retryable: false,
    };
  }

  if (status === 400) {
    return {
      code: "unknown",
      message: detail ?? "Ungueltige Parameter fuer dieses Modell",
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      code: "transient",
      message: detail ?? "Freepik Task noch nicht verfuegbar",
      retryable: true,
    };
  }

  if (status === 503) {
    return {
      code: "model_unavailable",
      message: "Freepik temporaer nicht verfuegbar",
      retryable: true,
    };
  }

  if (status === 408 || status === 504) {
    return {
      code: "timeout",
      message: detail ?? "Freepik timeout",
      retryable: true,
    };
  }

  if (status === 429) {
    return {
      code: "transient",
      message: detail ?? "Freepik Rate-Limit erreicht",
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      code: "transient",
      message: detail ?? "Freepik Serverfehler",
      retryable: true,
    };
  }

  return {
    code: "unknown",
    message: detail ?? "Unbekannter Freepik-Fehler",
    retryable: false,
  };
}

function isNetworkLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const lower = error.message.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("connection") ||
    lower.includes("econn")
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function freepikJsonRequest<TResponse>(params: {
  path: string;
  method: "GET" | "POST";
  body?: string;
  contentType?: string;
  useApiKey?: boolean;
}): Promise<TResponse> {
  const apiKey = params.useApiKey === false ? null : getFreepikApiKeyOrThrow();
  const url = normalizeFreepikEndpoint(params.path);

  for (let attempt = 0; attempt <= FREEPIK_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FREEPIK_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: params.method,
        headers: {
          Accept: "application/json",
          ...(apiKey ? { "x-freepik-api-key": apiKey } : {}),
          ...(params.body
            ? { "Content-Type": params.contentType ?? "application/json" }
            : {}),
        },
        body: params.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await parseResponseBody(response);
        const mapped = mapFreepikError(response.status, responseBody);
        const mappedError = new FreepikApiError({
          status: response.status,
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable,
          body: responseBody,
        });

        if (mapped.retryable && attempt < FREEPIK_MAX_RETRIES) {
          await wait(Math.min(1200, 300 * (attempt + 1)));
          continue;
        }

        throw mappedError;
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const retryable = isTimeout || isNetworkLikeError(error);

      if (retryable && attempt < FREEPIK_MAX_RETRIES) {
        await wait(Math.min(1200, 300 * (attempt + 1)));
        continue;
      }

      if (isTimeout) {
        throw new FreepikApiError({
          code: "timeout",
          message: "Freepik timeout",
          retryable: true,
        });
      }

      if (isNetworkLikeError(error)) {
        throw new FreepikApiError({
          code: "transient",
          message: error instanceof Error ? error.message : "Netzwerkfehler bei Freepik",
          retryable: true,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new FreepikApiError({
    code: "unknown",
    message: "Freepik request failed",
    retryable: false,
  });
}

function extractTaskId(result: unknown): string {
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

function parseTaskStatusResponse(
  result: {
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
  },
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

function buildTaskStatusPath(statusEndpointPath: string, taskId: string): string {
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
}): Promise<FreepikVideoTaskStatusResponse> {
  const statusPath = buildTaskStatusPath(params.statusEndpointPath, params.taskId);
  const result = await freepikJsonRequest<{
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
  }>({
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

export async function createStyleTransferTaskOrRun(params: {
  imageUrl: string;
  styleReferenceUrl?: string;
  prompt?: string;
  styleIntensity?: number;
  preserveStructure?: boolean;
}): Promise<{ task_id: string } | { url: string }> {
  const payload: Record<string, unknown> = {
    image_url: params.imageUrl,
  };
  if (params.styleReferenceUrl) {
    payload.style_reference_url = params.styleReferenceUrl;
  }
  if (params.prompt?.trim()) {
    payload.prompt = params.prompt.trim();
  }
  if (params.styleIntensity !== undefined) {
    payload.style_intensity = params.styleIntensity;
  }
  if (params.preserveStructure !== undefined) {
    payload.preserve_structure = params.preserveStructure;
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
  const result = await freepikJsonRequest<{
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
  }>({
    path: statusPath,
    method: "GET",
  });

  return parseTaskStatusResponse(result, result);
}

export async function downloadImageAsBlob(url: string): Promise<Blob> {
  return downloadFreepikBlob(url, "Freepik image transform download timeout", "Netzwerkfehler beim Bild-Download");
}

async function downloadFreepikBlob(
  url: string,
  timeoutMessage: string,
  networkMessage: string,
): Promise<Blob> {
  for (let attempt = 0; attempt <= FREEPIK_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FREEPIK_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await parseResponseBody(response);
        const mapped = mapFreepikError(response.status, body);
        const mappedError = new FreepikApiError({
          status: response.status,
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable,
          body,
        });

        if (mapped.retryable && attempt < FREEPIK_MAX_RETRIES) {
          await wait(Math.min(1200, 300 * (attempt + 1)));
          continue;
        }

        throw mappedError;
      }

      return await response.blob();
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const retryable = isTimeout || isNetworkLikeError(error);

      if (retryable && attempt < FREEPIK_MAX_RETRIES) {
        await wait(Math.min(1200, 300 * (attempt + 1)));
        continue;
      }

      if (isTimeout) {
        throw new FreepikApiError({
          code: "timeout",
          message: timeoutMessage,
          retryable: true,
        });
      }
      if (error instanceof FreepikApiError) {
        throw error;
      }
      if (isNetworkLikeError(error)) {
        throw new FreepikApiError({
          code: "transient",
          message: error instanceof Error ? error.message : networkMessage,
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new FreepikApiError({
    code: "unknown",
    message: "Freepik download failed",
    retryable: false,
  });
}

export async function downloadVideoAsBlob(url: string): Promise<Blob> {
  return downloadFreepikBlob(url, "Freepik video download timeout", "Netzwerkfehler beim Video-Download");
}

export const search = action({
  args: {
    term: v.string(),
    assetType: v.union(v.literal("photo"), v.literal("vector"), v.literal("icon")),
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<FreepikSearchResponse> => {
    const apiKey = process.env.FREEPIK_API_KEY;
    if (!apiKey) {
      throw new Error("FREEPIK_API_KEY not set");
    }

    const page = args.page ?? 1;
    const limit = args.limit ?? 20;

    const params = new URLSearchParams({
      term: args.term,
      page: String(page),
      order: "relevance",
      "filters[license][freemium]": "1",
    });

    let endpoint = `${FREEPIK_BASE}/v1/resources`;
    if (args.assetType === "icon") {
      endpoint = `${FREEPIK_BASE}/v1/icons`;
      params.set("per_page", String(limit));
    } else {
      params.set("limit", String(limit));
      params.set(`filters[content_type][${args.assetType}]`, "1");
    }

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      headers: {
        "x-freepik-api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Freepik API error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as {
      data?: Array<{
        id?: number;
        title?: string;
        url?: string;
        image?: {
          orientation?: string;
          source?: {
            url?: string;
            size?: string;
          };
        };
        licenses?: Array<{ type?: string }>;
        author?: { name?: string };
      }>;
      meta?: {
        total?: number;
        current_page?: number;
        last_page?: number;
        total_pages?: number;
        pagination?: {
          total?: number;
          current_page?: number;
          last_page?: number;
          total_pages?: number;
        };
      };
    };

    const data = json.data ?? [];
    const pagination = json.meta?.pagination;

    const results = data
      .map((item): FreepikResult | null => {
        if (!item.id || !item.image?.source?.url || !item.url) {
          return null;
        }

        const license = item.licenses?.some((entry) => entry.type === "freemium")
          ? "freemium"
          : "premium";
        const parsedSize = parseSize(item.image?.source?.size);

        return {
          id: item.id,
          title: item.title ?? "Untitled",
          assetType: args.assetType,
          previewUrl: item.image.source.url,
          intrinsicWidth: parsedSize.width,
          intrinsicHeight: parsedSize.height,
          sourceUrl: item.url,
          license,
          authorName: item.author?.name ?? "Freepik",
          orientation: item.image.orientation,
        };
      })
      .filter((entry): entry is FreepikResult => entry !== null);

    const totalPagesRaw =
      pagination?.last_page ??
      pagination?.total_pages ??
      json.meta?.last_page ??
      json.meta?.total_pages ??
      1;
    const currentPageRaw = pagination?.current_page ?? json.meta?.current_page ?? page;
    const totalRaw = pagination?.total ?? json.meta?.total ?? results.length;

    const totalPages =
      Number.isFinite(totalPagesRaw) && totalPagesRaw > 0
        ? Math.floor(totalPagesRaw)
        : 1;
    const currentPage =
      Number.isFinite(currentPageRaw) && currentPageRaw > 0
        ? Math.min(Math.floor(currentPageRaw), totalPages)
        : page;
    const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? Math.floor(totalRaw) : results.length;

    return {
      results,
      totalPages,
      currentPage,
      total,
    };
  },
});
