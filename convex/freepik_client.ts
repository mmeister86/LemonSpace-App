/**
 * Onboarding note:
 * Convex backend module for freepik client. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

"use node";

const FREEPIK_BASE = "https://api.freepik.com";
const FREEPIK_REQUEST_TIMEOUT_MS = 30_000;
const FREEPIK_MAX_RETRIES = 2;

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
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

export function normalizeFreepikEndpoint(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${FREEPIK_BASE}${path}`;
  }
  return `${FREEPIK_BASE}/${path}`;
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

export async function freepikJsonRequest<TResponse>(params: {
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

export async function downloadFreepikBlob(
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
