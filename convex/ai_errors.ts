/**
 * Onboarding note:
 * Convex backend module for ai errors. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import { ConvexError } from "convex/values";
import { FreepikApiError } from "./freepik";

export type ErrorCategory =
  | "credits"
  | "policy"
  | "timeout"
  | "transient"
  | "provider"
  | "unknown";

interface ErrorData {
  code?: string;
  [key: string]: unknown;
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseStructuredProviderErrorMessage(raw: string): {
  message: string;
  code: string;
  type: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const errorBlock =
      record.error && typeof record.error === "object" && !Array.isArray(record.error)
        ? (record.error as Record<string, unknown>)
        : undefined;

    const message =
      trimText(errorBlock?.message) || trimText(record.message) || trimText(errorBlock?.detail);
    const code = trimText(errorBlock?.code) || trimText(record.code);
    const type = trimText(errorBlock?.type) || trimText(record.type);

    if (!message) {
      return null;
    }

    return { message, code, type };
  } catch {
    return null;
  }
}

export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof ConvexError) {
    const data = error.data as ErrorData;
    return data?.code;
  }
  if (error instanceof FreepikApiError) {
    return error.code;
  }
  return undefined;
}

export function getErrorSource(error: unknown): string | undefined {
  if (error instanceof FreepikApiError) {
    return error.source;
  }
  if (error && typeof error === "object") {
    const source = (error as { source?: unknown }).source;
    return typeof source === "string" ? source : undefined;
  }
  return undefined;
}

export function getProviderStatus(error: unknown): number | null {
  if (error instanceof FreepikApiError) {
    return typeof error.status === "number" ? error.status : null;
  }
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }
  return null;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "Generation failed");
}

function parseOpenRouterStatus(message: string): number | null {
  const match = message.match(/OpenRouter API error\s+(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function categorizeError(error: unknown): {
  category: ErrorCategory;
  retryable: boolean;
} {
  const code = getErrorCode(error);
  const source = getErrorSource(error);
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  const status = getProviderStatus(error) ?? parseOpenRouterStatus(message);

  if (source === "freepik") {
    if (code === "model_unavailable") {
      return {
        category: "provider",
        retryable: status === 503,
      };
    }
    if (code === "timeout") {
      return { category: "timeout", retryable: true };
    }
    if (code === "transient") {
      return { category: "transient", retryable: true };
    }
  }

  if (
    code === "CREDITS_TEST_DISABLED" ||
    code === "CREDITS_INVALID_AMOUNT" ||
    code === "CREDITS_BALANCE_NOT_FOUND" ||
    code === "CREDITS_DAILY_CAP_REACHED" ||
    code === "CREDITS_CONCURRENCY_LIMIT"
  ) {
    return { category: "credits", retryable: false };
  }

  if (
    code === "OPENROUTER_MODEL_REFUSAL" ||
    lower.includes("content policy") ||
    lower.includes("policy") ||
    lower.includes("moderation") ||
    lower.includes("safety") ||
    lower.includes("refusal") ||
    lower.includes("policy_violation")
  ) {
    return { category: "policy", retryable: false };
  }

  if (status !== null) {
    if (status >= 500 || status === 408 || status === 429 || status === 499) {
      return { category: "provider", retryable: true };
    }
    if (status >= 400 && status < 500) {
      return { category: "provider", retryable: false };
    }
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("deadline") ||
    lower.includes("abort") ||
    lower.includes("etimedout")
  ) {
    return { category: "timeout", retryable: true };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("connection") ||
    lower.includes("econnreset") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("service unavailable") ||
    lower.includes("rate limit") ||
    lower.includes("overloaded")
  ) {
    return { category: "transient", retryable: true };
  }

  return { category: "unknown", retryable: false };
}

export function formatTerminalStatusMessage(error: unknown): string {
  const code = getErrorCode(error);
  if (code === "OPENROUTER_STRUCTURED_OUTPUT_INVALID_JSON") {
    return "Provider: Strukturierte Antwort konnte nicht gelesen werden";
  }

  if (code === "OPENROUTER_STRUCTURED_OUTPUT_MISSING_CONTENT") {
    return "Provider: Strukturierte Antwort fehlt";
  }

  if (code && code !== "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR") {
    return code;
  }

  const convexData =
    error instanceof ConvexError ? (error.data as ErrorData | undefined) : undefined;

  const convexDataMessage =
    typeof convexData?.message === "string" ? convexData.message.trim() : "";
  const convexDataStatus =
    typeof convexData?.status === "number" && Number.isFinite(convexData.status)
      ? convexData.status
      : null;
  const structuredProviderFromMessage = parseStructuredProviderErrorMessage(convexDataMessage);

  const structuredProviderMessageFromData =
    trimText(convexData?.providerMessage) ||
    structuredProviderFromMessage?.message;
  const structuredProviderCodeFromData =
    trimText(convexData?.providerCode) || structuredProviderFromMessage?.code;
  const structuredProviderTypeFromData =
    trimText(convexData?.providerType) || structuredProviderFromMessage?.type;

  const structuredProviderDecorators = [
    structuredProviderCodeFromData ? `code=${structuredProviderCodeFromData}` : "",
    structuredProviderTypeFromData ? `type=${structuredProviderTypeFromData}` : "",
  ].filter(Boolean);

  const structuredProviderSuffix =
    structuredProviderDecorators.length > 0
      ? ` [${structuredProviderDecorators.join(", ")}]`
      : "";

  const message =
    code === "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR"
      ? structuredProviderMessageFromData
        ? `${convexDataStatus !== null ? `OpenRouter ${convexDataStatus}: ` : ""}${structuredProviderMessageFromData}${structuredProviderSuffix}`
        : convexDataMessage ||
          (convexDataStatus !== null
            ? `HTTP ${convexDataStatus}`
            : "Anfrage fehlgeschlagen")
      : errorMessage(error).trim() || "Generation failed";

  const { category } =
    code === "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR"
      ? { category: "provider" as const }
      : categorizeError(error);

  const prefixByCategory: Record<Exclude<ErrorCategory, "unknown">, string> = {
    credits: "Credits",
    policy: "Policy",
    timeout: "Timeout",
    transient: "Netzwerk",
    provider: "Provider",
  };

  if (category === "unknown") {
    return message;
  }

  const prefix = prefixByCategory[category];
  if (message.toLowerCase().startsWith(prefix.toLowerCase())) {
    return message;
  }

  return `${prefix}: ${message}`;
}

export function getVideoPollDelayMs(attempt: number): number {
  if (attempt <= 5) {
    return 5000;
  }
  if (attempt <= 15) {
    return 10000;
  }
  return 20000;
}

export function isVideoPollTimedOut(args: {
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  maxTotalMs: number;
}): boolean {
  return args.attempt > args.maxAttempts || args.elapsedMs > args.maxTotalMs;
}
