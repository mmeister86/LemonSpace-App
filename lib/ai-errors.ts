export type AiErrorCategory =
  | "insufficient_credits"
  | "rate_limited"
  | "content_policy"
  | "timeout"
  | "network"
  | "server"
  | "invalid_request"
  | "unknown";

export interface AiError {
  category: AiErrorCategory;
  message: string;
  detail?: string;
  retryable: boolean;
  creditsNotCharged: boolean;
  showTopUp: boolean;
  retryCount?: number;
}

type RawErrorObject = {
  message?: unknown;
  detail?: unknown;
  category?: unknown;
  retryCount?: unknown;
};

const CATEGORY_ALIASES: Record<string, AiErrorCategory> = {
  insufficient_credits: "insufficient_credits",
  insufficientcredits: "insufficient_credits",
  not_enough_credits: "insufficient_credits",
  notenoughcredits: "insufficient_credits",
  credits: "insufficient_credits",
  payment_required: "insufficient_credits",
  paymentrequired: "insufficient_credits",
  rate_limit: "rate_limited",
  ratelimit: "rate_limited",
  rate_limited: "rate_limited",
  ratelimited: "rate_limited",
  too_many_requests: "rate_limited",
  toomanyrequests: "rate_limited",
  content_policy: "content_policy",
  contentpolicy: "content_policy",
  safety: "content_policy",
  timeout: "timeout",
  timed_out: "timeout",
  timedout: "timeout",
  network: "network",
  connection: "network",
  server: "server",
  invalid_request: "invalid_request",
  invalidrequest: "invalid_request",
  bad_request: "invalid_request",
  badrequest: "invalid_request",
};

function normalizeCategory(value: string | undefined): AiErrorCategory | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  return CATEGORY_ALIASES[normalized];
}

function extractRetryCount(rawText: string, rawObj: RawErrorObject | null): number | undefined {
  if (typeof rawObj?.retryCount === "number" && Number.isFinite(rawObj.retryCount)) {
    return rawObj.retryCount;
  }

  const retryCountMatch = rawText.match(/retry(?:_?count)?\s*[:=]\s*(\d{1,3})/i);
  if (retryCountMatch?.[1]) {
    return Number.parseInt(retryCountMatch[1], 10);
  }

  const attemptMatch = rawText.match(/(?:attempt|retry)\s*#?\s*(\d{1,3})/i);
  if (attemptMatch?.[1]) {
    return Number.parseInt(attemptMatch[1], 10);
  }

  return undefined;
}

function cleanPrefixMessage(text: string): { category?: AiErrorCategory; message: string } {
  const trimmed = text.trim();

  const bracketPrefix = trimmed.match(/^\[([a-zA-Z_\- ]+)\]\s*[:\-]?\s*(.+)$/);
  if (bracketPrefix?.[1] && bracketPrefix[2]) {
    const category = normalizeCategory(bracketPrefix[1]);
    if (category) {
      return {
        category,
        message: bracketPrefix[2].trim(),
      };
    }
  }

  const plainPrefix = trimmed.match(/^([a-zA-Z_\- ]{3,40})\s*[:|\-]\s*(.+)$/);
  if (plainPrefix?.[1] && plainPrefix[2]) {
    const category = normalizeCategory(plainPrefix[1]);
    if (category) {
      return {
        category,
        message: plainPrefix[2].trim(),
      };
    }
  }

  return { message: trimmed };
}

function splitMessageAndDetail(message: string): { message: string; detail?: string } {
  const separators = [" — ", " - ", "\n"];
  for (const separator of separators) {
    const index = message.indexOf(separator);
    if (index <= 0) continue;
    const lead = message.slice(0, index).trim();
    const tail = message.slice(index + separator.length).trim();
    if (lead && tail) {
      return { message: lead, detail: tail };
    }
  }

  return { message };
}

function inferCategoryFromText(text: string): AiErrorCategory {
  const lower = text.toLowerCase();

  const openRouterStatus = lower.match(/openrouter api error\s*(\d{3})/i);
  if (openRouterStatus?.[1]) {
    const status = Number.parseInt(openRouterStatus[1], 10);
    if (status === 402) return "insufficient_credits";
    if (status === 408 || status === 504) return "timeout";
    if (status === 429) return "rate_limited";
    if (status >= 500) return "server";
    if (status >= 400) return "invalid_request";
  }

  if (
    lower.includes("insufficient credits") ||
    lower.includes("not enough credits") ||
    lower.includes("credit balance") ||
    lower.includes("guthaben") ||
    lower.includes("nicht genug credits")
  ) {
    return "insufficient_credits";
  }

  if (
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("ratelimit") ||
    lower.includes("429")
  ) {
    return "rate_limited";
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("deadline exceeded")
  ) {
    return "timeout";
  }

  if (
    lower.includes("network") ||
    lower.includes("connection") ||
    lower.includes("fetch failed") ||
    lower.includes("econn")
  ) {
    return "network";
  }

  if (
    lower.includes("policy") ||
    lower.includes("safety") ||
    lower.includes("refusal") ||
    lower.includes("modell lehnt ab")
  ) {
    return "content_policy";
  }

  if (
    lower.includes("invalid") ||
    lower.includes("bad request") ||
    lower.includes("unknown model") ||
    lower.includes("missing")
  ) {
    return "invalid_request";
  }

  if (lower.includes("server") || lower.includes("5xx")) {
    return "server";
  }

  return "unknown";
}

function defaultsForCategory(category: AiErrorCategory): Omit<AiError, "category" | "detail" | "retryCount"> {
  switch (category) {
    case "insufficient_credits":
      return {
        message: "Not enough credits for this generation",
        retryable: false,
        creditsNotCharged: true,
        showTopUp: true,
      };
    case "rate_limited":
      return {
        message: "The model is busy right now",
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "content_policy":
      return {
        message: "The request was blocked by model safety rules",
        retryable: false,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "timeout":
      return {
        message: "The generation timed out",
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "network":
      return {
        message: "Network issue while contacting the model",
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "server":
      return {
        message: "The AI service returned a server error",
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "invalid_request":
      return {
        message: "The request could not be processed",
        retryable: false,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "unknown":
    default:
      return {
        message: "Generation failed",
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
  }
}

export function classifyError(rawError: unknown): AiError {
  const rawObj: RawErrorObject | null =
    rawError != null && typeof rawError === "object"
      ? (rawError as RawErrorObject)
      : null;

  const rawMessage =
    typeof rawError === "string"
      ? rawError
      : rawError instanceof Error
        ? rawError.message
        : typeof rawObj?.message === "string"
          ? rawObj.message
          : "";

  const rawDetail = typeof rawObj?.detail === "string" ? rawObj.detail.trim() : undefined;

  const prefixed = cleanPrefixMessage(rawMessage);
  const explicitCategory =
    normalizeCategory(typeof rawObj?.category === "string" ? rawObj.category : undefined) ??
    prefixed.category;
  const category = explicitCategory ?? inferCategoryFromText(prefixed.message);

  const defaults = defaultsForCategory(category);
  const split = splitMessageAndDetail(prefixed.message);
  const message = split.message || defaults.message;

  return {
    category,
    message,
    detail: split.detail ?? rawDetail,
    retryable: defaults.retryable,
    creditsNotCharged: defaults.creditsNotCharged,
    showTopUp: defaults.showTopUp,
    retryCount: extractRetryCount(rawMessage, rawObj),
  };
}
