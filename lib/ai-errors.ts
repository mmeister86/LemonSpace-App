export type ErrorType =
  | "timeout"
  | "insufficientCredits"
  | "networkError"
  | "rateLimited"
  | "modelUnavailable"
  | "generic"
  | "contentPolicy"
  | "invalidRequest"
  | "dailyCap"
  | "concurrency";

export interface AiError {
  type: ErrorType;
  retryable: boolean;
  creditsNotCharged: boolean;
  showTopUp: boolean;
  retryCount?: number;
  rawMessage?: string;
}

type RawErrorObject = {
  message?: unknown;
  detail?: unknown;
  category?: unknown;
  retryCount?: unknown;
};

const TYPE_ALIASES: Record<string, ErrorType> = {
  insufficient_credits: "insufficientCredits",
  insufficientcredits: "insufficientCredits",
  not_enough_credits: "insufficientCredits",
  notenoughcredits: "insufficientCredits",
  credits: "insufficientCredits",
  payment_required: "insufficientCredits",
  paymentrequired: "insufficientCredits",
  rate_limit: "rateLimited",
  ratelimit: "rateLimited",
  rate_limited: "rateLimited",
  ratelimited: "rateLimited",
  too_many_requests: "rateLimited",
  toomanyrequests: "rateLimited",
  content_policy: "contentPolicy",
  contentpolicy: "contentPolicy",
  safety: "contentPolicy",
  timeout: "timeout",
  timed_out: "timeout",
  timedout: "timeout",
  network: "networkError",
  connection: "networkError",
  networkerror: "networkError",
  server: "modelUnavailable",
  model_unavailable: "modelUnavailable",
  modelunavailable: "modelUnavailable",
  invalid_request: "invalidRequest",
  invalidrequest: "invalidRequest",
  bad_request: "invalidRequest",
  badrequest: "invalidRequest",
  unknown_model: "invalidRequest",
  daily_cap: "dailyCap",
  dailycap: "dailyCap",
  daily_limit: "dailyCap",
  dailylimit: "dailyCap",
  concurrency: "concurrency",
  concurrent: "concurrency",
  unknown: "generic",
};

function normalizeType(value: string | undefined): ErrorType | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  return TYPE_ALIASES[normalized];
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

function cleanPrefixMessage(text: string): { type?: ErrorType; message: string } {
  const trimmed = text.trim();

  const bracketPrefix = trimmed.match(/^\[([a-zA-Z_\- ]+)\]\s*[:\-]?\s*(.+)$/);
  if (bracketPrefix?.[1] && bracketPrefix[2]) {
    const type = normalizeType(bracketPrefix[1]);
    if (type) {
      return {
        type,
        message: bracketPrefix[2].trim(),
      };
    }
  }

  const plainPrefix = trimmed.match(/^([a-zA-Z_\- ]{3,40})\s*[:|\-]\s*(.+)$/);
  if (plainPrefix?.[1] && plainPrefix[2]) {
    const type = normalizeType(plainPrefix[1]);
    if (type) {
      return {
        type,
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

function inferTypeFromText(text: string): ErrorType {
  const lower = text.toLowerCase();

  const openRouterStatus = lower.match(/openrouter api error\s*(\d{3})/i);
  if (openRouterStatus?.[1]) {
    const status = Number.parseInt(openRouterStatus[1], 10);
    if (status === 402) return "insufficientCredits";
    if (status === 408 || status === 504) return "timeout";
    if (status === 429) return "rateLimited";
    if (status >= 500) return "modelUnavailable";
    if (status >= 400) return "invalidRequest";
  }

  if (
    lower.includes("insufficient credits") ||
    lower.includes("not enough credits") ||
    lower.includes("credit balance") ||
    lower.includes("guthaben") ||
    lower.includes("nicht genug credits")
  ) {
    return "insufficientCredits";
  }

  if (
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("ratelimit") ||
    lower.includes("429")
  ) {
    return "rateLimited";
  }

  if (
    lower.includes("daily_cap") ||
    lower.includes("tageslimit erreicht") ||
    lower.includes("daily generation limit")
  ) {
    return "dailyCap";
  }

  if (
    lower.includes("concurrency") ||
    lower.includes("generierung(en) aktiv") ||
    lower.includes("concurrent job limit")
  ) {
    return "concurrency";
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
    return "networkError";
  }

  if (
    lower.includes("policy") ||
    lower.includes("safety") ||
    lower.includes("refusal") ||
    lower.includes("modell lehnt ab")
  ) {
    return "contentPolicy";
  }

  if (
    lower.includes("invalid") ||
    lower.includes("bad request") ||
    lower.includes("unknown model") ||
    lower.includes("missing")
  ) {
    return "invalidRequest";
  }

  if (lower.includes("server") || lower.includes("5xx")) {
    return "modelUnavailable";
  }

  return "generic";
}

function defaultsForType(type: ErrorType): Omit<AiError, "type" | "retryCount" | "rawMessage"> {
  switch (type) {
    case "insufficientCredits":
      return {
        retryable: false,
        creditsNotCharged: true,
        showTopUp: true,
      };
    case "rateLimited":
      return {
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "contentPolicy":
      return {
        retryable: false,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "timeout":
      return {
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "networkError":
      return {
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "modelUnavailable":
      return {
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "invalidRequest":
      return {
        retryable: false,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "dailyCap":
      return {
        retryable: false,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "concurrency":
      return {
        retryable: true,
        creditsNotCharged: true,
        showTopUp: false,
      };
    case "generic":
    default:
      return {
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

  const prefixed = cleanPrefixMessage(rawMessage);
  const explicitType =
    normalizeType(typeof rawObj?.category === "string" ? rawObj.category : undefined) ??
    prefixed.type;
  const type = explicitType ?? inferTypeFromText(prefixed.message);

  const defaults = defaultsForType(type);
  const split = splitMessageAndDetail(prefixed.message);

  return {
    type,
    retryable: defaults.retryable,
    creditsNotCharged: defaults.creditsNotCharged,
    showTopUp: defaults.showTopUp,
    retryCount: extractRetryCount(rawMessage, rawObj),
    rawMessage: split.message || rawMessage || undefined,
  };
}
