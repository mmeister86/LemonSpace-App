/**
 * Onboarding note:
 * Wraps OpenRouter model calls for image and structured-output generation. Keep model/cost assumptions in sync with the client registries.
 */

import { ConvexError } from "convex/values";
import type {
  AgentHarnessMessage,
  AgentHarnessModelResponse,
  AgentHarnessTool,
} from "../lib/agent-harness";
import {
  buildReferencePromptPreamble,
  MAX_AI_IMAGE_REFERENCES,
  type AiImageReferenceInput,
} from "../lib/ai-image-references";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function parseJsonSafely(text: string):
  | { ok: true; value: unknown }
  | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function extractTextFromStructuredContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const textParts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      textParts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") {
      continue;
    }

    const partRecord = part as Record<string, unknown>;
    if (typeof partRecord.text === "string") {
      textParts.push(partRecord.text);
    }
  }

  return textParts.length > 0 ? textParts.join("") : undefined;
}

function extractFencedJsonPayload(text: string): string | undefined {
  const fencedBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = fencedBlockRegex.exec(text)) !== null) {
    const payload = match[1];
    if (typeof payload === "string" && payload.trim() !== "") {
      return payload;
    }
  }
  return undefined;
}

function extractBalancedJsonCandidate(text: string, startIndex: number): string | undefined {
  const startChar = text[startIndex];
  if (startChar !== "{" && startChar !== "[") {
    return undefined;
  }

  const expectedClosings: string[] = [];
  let inString = false;
  let isEscaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i]!;

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === "\\") {
        isEscaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      expectedClosings.push("}");
      continue;
    }
    if (ch === "[") {
      expectedClosings.push("]");
      continue;
    }

    if (ch === "}" || ch === "]") {
      const expected = expectedClosings.pop();
      if (expected !== ch) {
        return undefined;
      }
      if (expectedClosings.length === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  return undefined;
}

function extractFirstBalancedJson(text: string): string | undefined {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch !== "{" && ch !== "[") {
      continue;
    }

    const candidate = extractBalancedJsonCandidate(text, i);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function parseStructuredJsonFromMessageContent(contentText: string):
  | { ok: true; value: unknown }
  | { ok: false } {
  const direct = parseJsonSafely(contentText);
  if (direct.ok) {
    return direct;
  }

  const fencedPayload = extractFencedJsonPayload(contentText);
  if (fencedPayload) {
    const fenced = parseJsonSafely(fencedPayload);
    if (fenced.ok) {
      return fenced;
    }
  }

  const balancedPayload = extractFirstBalancedJson(contentText);
  if (balancedPayload) {
    const balanced = parseJsonSafely(balancedPayload);
    if (balanced.ok) {
      return balanced;
    }
  }

  return { ok: false };
}

type StructuredOpenRouterErrorInfo = {
  userMessage: string;
  providerMessage: string;
  providerCode: string;
  providerType: string;
  rawBodyPreview: string;
};

type StructuredSchemaDiagnostics = {
  topLevelType: string;
  topLevelRequiredCount: number;
  topLevelPropertyCount: number;
  schemaBytes: number;
  messageCount: number;
  messageLengths: number[];
  hasAnyOf: boolean;
  hasOneOf: boolean;
  hasAllOf: boolean;
  hasPatternProperties: boolean;
  hasDynamicAdditionalProperties: boolean;
};

function walkStructuredSchema(
  value: unknown,
  visitor: (node: Record<string, unknown>) => void,
): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkStructuredSchema(item, visitor);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  visitor(record);

  for (const nested of Object.values(record)) {
    walkStructuredSchema(nested, visitor);
  }
}

function getStructuredSchemaDiagnostics(args: {
  schema: Record<string, unknown>;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}): StructuredSchemaDiagnostics {
  const topLevelType = typeof args.schema.type === "string" ? args.schema.type : "unknown";
  const topLevelRequiredCount = Array.isArray(args.schema.required) ? args.schema.required.length : 0;
  const properties =
    args.schema.properties && typeof args.schema.properties === "object" && !Array.isArray(args.schema.properties)
      ? (args.schema.properties as Record<string, unknown>)
      : null;

  const diagnostics: StructuredSchemaDiagnostics = {
    topLevelType,
    topLevelRequiredCount,
    topLevelPropertyCount: properties ? Object.keys(properties).length : 0,
    schemaBytes: JSON.stringify(args.schema).length,
    messageCount: args.messages.length,
    messageLengths: args.messages.map((message) => message.content.length),
    hasAnyOf: false,
    hasOneOf: false,
    hasAllOf: false,
    hasPatternProperties: false,
    hasDynamicAdditionalProperties: false,
  };

  walkStructuredSchema(args.schema, (node) => {
    if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
      diagnostics.hasAnyOf = true;
    }
    if (Array.isArray(node.oneOf) && node.oneOf.length > 0) {
      diagnostics.hasOneOf = true;
    }
    if (Array.isArray(node.allOf) && node.allOf.length > 0) {
      diagnostics.hasAllOf = true;
    }
    if (
      node.patternProperties &&
      typeof node.patternProperties === "object" &&
      !Array.isArray(node.patternProperties)
    ) {
      diagnostics.hasPatternProperties = true;
    }
    if (
      node.additionalProperties &&
      typeof node.additionalProperties === "object" &&
      !Array.isArray(node.additionalProperties)
    ) {
      diagnostics.hasDynamicAdditionalProperties = true;
    }
  });

  return diagnostics;
}

function summarizeStructuredOpenRouterError(errorText: string, status: number): StructuredOpenRouterErrorInfo {
  const trimmed = errorText.trim();
  const rawBodyPreview = trimmed.slice(0, 4000);

  let providerMessage = "";
  let providerCode = "";
  let providerType = "";

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const errorBlock =
          record.error && typeof record.error === "object" && !Array.isArray(record.error)
            ? (record.error as Record<string, unknown>)
            : undefined;

        providerMessage =
          (typeof errorBlock?.message === "string" ? errorBlock.message.trim() : "") ||
          (typeof record.message === "string" ? record.message.trim() : "");
        providerCode =
          (typeof errorBlock?.code === "string" ? errorBlock.code.trim() : "") ||
          (typeof record.code === "string" ? record.code.trim() : "");
        providerType =
          (typeof errorBlock?.type === "string" ? errorBlock.type.trim() : "") ||
          (typeof record.type === "string" ? record.type.trim() : "");
      }
    } catch {
      // Keep defaults and fall back to raw text below.
    }
  }

  const decorators = [
    providerCode ? `code=${providerCode}` : "",
    providerType ? `type=${providerType}` : "",
  ].filter(Boolean);

  const suffix = decorators.length > 0 ? ` [${decorators.join(", ")}]` : "";
  const fallbackMessage = rawBodyPreview || `HTTP ${status}`;
  const userMessage = providerMessage
    ? `OpenRouter ${status}: ${providerMessage}${suffix}`
    : fallbackMessage;

  return {
    userMessage,
    providerMessage,
    providerCode,
    providerType,
    rawBodyPreview,
  };
}

export async function generateStructuredObjectViaOpenRouter<T>(
  apiKey: string,
  args: {
    model: string;
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    schemaName: string;
    schema: Record<string, unknown>;
  },
): Promise<T> {
  const schemaDiagnostics = getStructuredSchemaDiagnostics({
    schema: args.schema,
    messages: args.messages,
  });

  console.info("[openrouter][structured] request", {
    model: args.model,
    schemaName: args.schemaName,
    ...schemaDiagnostics,
  });

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://app.lemonspace.io",
      "X-Title": "LemonSpace",
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: args.schemaName,
          strict: true,
          schema: args.schema,
        },
      },
      plugins: [{ id: "response-healing" }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorInfo = summarizeStructuredOpenRouterError(errorText, response.status);
    console.error("[openrouter][structured] non-ok response", {
      model: args.model,
      schemaName: args.schemaName,
      status: response.status,
      providerMessage: errorInfo.providerMessage || undefined,
      providerCode: errorInfo.providerCode || undefined,
      providerType: errorInfo.providerType || undefined,
      rawBodyPreview: errorInfo.rawBodyPreview,
    });

    throw new ConvexError({
      code: "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR",
      status: response.status,
      message: errorInfo.userMessage,
      providerMessage: errorInfo.providerMessage || undefined,
      providerCode: errorInfo.providerCode || undefined,
      providerType: errorInfo.providerType || undefined,
      rawBodyPreview: errorInfo.rawBodyPreview,
    });
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message as
    | Record<string, unknown>
    | undefined;

  const parsed = message?.parsed;
  if (parsed && typeof parsed === "object") {
    return parsed as T;
  }

  const contentText = extractTextFromStructuredContent(message?.content);

  if (typeof contentText !== "string" || contentText.trim() === "") {
    throw new ConvexError({
      code: "OPENROUTER_STRUCTURED_OUTPUT_MISSING_CONTENT",
    });
  }

  const parsedContent = parseStructuredJsonFromMessageContent(contentText);
  if (!parsedContent.ok) {
    throw new ConvexError({
      code: "OPENROUTER_STRUCTURED_OUTPUT_INVALID_JSON",
    });
  }

  return parsedContent.value as T;
}

function formatHarnessMessagesForOpenRouter(messages: AgentHarnessMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
    }

    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.argumentsJson,
          },
        })),
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

function normalizeToolCalls(raw: unknown): AgentHarnessModelResponse["toolCalls"] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const toolCalls: AgentHarnessModelResponse["toolCalls"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const functionBlock =
      record.function && typeof record.function === "object" && !Array.isArray(record.function)
        ? (record.function as Record<string, unknown>)
        : {};
    const id = typeof record.id === "string" && record.id.trim() !== "" ? record.id : "";
    const name =
      typeof functionBlock.name === "string" && functionBlock.name.trim() !== ""
        ? functionBlock.name
        : "";
    const argumentsJson =
      typeof functionBlock.arguments === "string" ? functionBlock.arguments : "{}";

    if (!id || !name) {
      continue;
    }

    toolCalls.push({
      id,
      name,
      argumentsJson,
    });
  }

  return toolCalls;
}

export async function generateToolChatCompletionViaOpenRouter(
  apiKey: string,
  args: {
    model: string;
    messages: AgentHarnessMessage[];
    tools: AgentHarnessTool[];
  },
): Promise<AgentHarnessModelResponse> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://app.lemonspace.io",
      "X-Title": "LemonSpace",
    },
    body: JSON.stringify({
      model: args.model,
      messages: formatHarnessMessagesForOpenRouter(args.messages),
      tools: args.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorInfo = summarizeStructuredOpenRouterError(errorText, response.status);
    throw new ConvexError({
      code: "OPENROUTER_TOOL_CHAT_HTTP_ERROR",
      status: response.status,
      message: errorInfo.userMessage,
      providerMessage: errorInfo.providerMessage || undefined,
      providerCode: errorInfo.providerCode || undefined,
      providerType: errorInfo.providerType || undefined,
      rawBodyPreview: errorInfo.rawBodyPreview,
    });
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message as Record<string, unknown> | undefined;

  return {
    content: extractTextFromStructuredContent(message?.content) ?? "",
    toolCalls: normalizeToolCalls(message?.tool_calls),
  };
}

export const __testables = {
  getStructuredSchemaDiagnostics,
  summarizeStructuredOpenRouterError,
};

export interface OpenRouterModel {
  id: string;
  name: string;
  tier: "budget" | "standard" | "premium";
  estimatedCostPerImage: number; // in Euro-Cent (for credit reservation)
  /** Gleiche Einheit wie UI „Cr“ / lib/ai-models creditCost */
  creditCost: number;
  minTier: "free" | "starter" | "pro" | "max";
  requestModalities?: readonly ("image" | "text")[];
  supportsImageReferences: boolean;
  maxReferenceImages: number;
}

const IMAGE_AND_TEXT_MODALITIES = ["image", "text"] as const;
const IMAGE_ONLY_MODALITIES = ["image"] as const;
const IMAGE_REFERENCE_CAPABILITY = {
  supportsImageReferences: true,
  maxReferenceImages: MAX_AI_IMAGE_REFERENCES,
} as const;
const NO_IMAGE_REFERENCE_CAPABILITY = {
  supportsImageReferences: false,
  maxReferenceImages: 0,
} as const;
export const IMAGE_MODELS: Record<string, OpenRouterModel> = {
  "google/gemini-2.5-flash-image": {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash",
    tier: "standard",
    estimatedCostPerImage: 4, // ~€0.04 in Euro-Cent
    creditCost: 4,
    minTier: "free",
    ...IMAGE_REFERENCE_CAPABILITY,
  },
  "black-forest-labs/flux.2-klein-4b": {
    id: "black-forest-labs/flux.2-klein-4b",
    name: "FLUX.2 Klein 4B",
    tier: "budget",
    estimatedCostPerImage: 2,
    creditCost: 2,
    minTier: "free",
    requestModalities: IMAGE_ONLY_MODALITIES,
    ...NO_IMAGE_REFERENCE_CAPABILITY,
  },
  "bytedance-seed/seedream-4.5": {
    id: "bytedance-seed/seedream-4.5",
    name: "Seedream 4.5",
    tier: "standard",
    estimatedCostPerImage: 5,
    creditCost: 5,
    minTier: "free",
    requestModalities: IMAGE_ONLY_MODALITIES,
    ...NO_IMAGE_REFERENCE_CAPABILITY,
  },
  "google/gemini-3.1-flash-image-preview": {
    id: "google/gemini-3.1-flash-image-preview",
    name: "Gemini 3.1 Flash Image",
    tier: "standard",
    estimatedCostPerImage: 6,
    creditCost: 6,
    minTier: "free",
    ...IMAGE_REFERENCE_CAPABILITY,
  },
  "openai/gpt-5-image-mini": {
    id: "openai/gpt-5-image-mini",
    name: "GPT-5 Image Mini",
    tier: "premium",
    estimatedCostPerImage: 8,
    creditCost: 8,
    minTier: "starter",
    ...IMAGE_REFERENCE_CAPABILITY,
  },
  "sourceful/riverflow-v2-fast": {
    id: "sourceful/riverflow-v2-fast",
    name: "Riverflow V2 Fast",
    tier: "premium",
    estimatedCostPerImage: 9,
    creditCost: 9,
    minTier: "starter",
    requestModalities: IMAGE_ONLY_MODALITIES,
    ...NO_IMAGE_REFERENCE_CAPABILITY,
  },
  "sourceful/riverflow-v2-pro": {
    id: "sourceful/riverflow-v2-pro",
    name: "Riverflow V2 Pro",
    tier: "premium",
    estimatedCostPerImage: 12,
    creditCost: 12,
    minTier: "starter",
    requestModalities: IMAGE_ONLY_MODALITIES,
    ...NO_IMAGE_REFERENCE_CAPABILITY,
  },
  "google/gemini-3-pro-image-preview": {
    id: "google/gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image",
    tier: "premium",
    estimatedCostPerImage: 13,
    creditCost: 13,
    minTier: "starter",
    ...IMAGE_REFERENCE_CAPABILITY,
  },
  "openai/gpt-5-image": {
    id: "openai/gpt-5-image",
    name: "GPT-5 Image",
    tier: "premium",
    estimatedCostPerImage: 15,
    creditCost: 15,
    minTier: "starter",
    ...IMAGE_REFERENCE_CAPABILITY,
  },
};

export const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";

export interface GenerateImageParams {
  prompt: string;
  referenceImageUrl?: string; // optional image-to-image input
  referenceImages?: AiImageReferenceInput[];
  model?: string;
  /** OpenRouter image_config.aspect_ratio e.g. "16:9", "1:1" */
  aspectRatio?: string;
}

export interface OpenRouterImageResponse {
  imageBase64: string; // base64-encoded PNG/JPEG
  mimeType: string;
}

const DATA_IMAGE_URI =
  /data:image\/[\w+.+-]+;base64,[A-Za-z0-9+/=\s]+/;

function firstDataImageUriInString(s: string): string | undefined {
  const m = s.match(DATA_IMAGE_URI);
  if (!m) return undefined;
  return m[0]!.replace(/\s+/g, "");
}

function dataUriFromContentPart(p: Record<string, unknown>): string | undefined {
  const block = (p.image_url ?? p.imageUrl) as
    | Record<string, unknown>
    | undefined;
  const url = block?.url;
  if (typeof url === "string" && url.startsWith("data:")) {
    return url;
  }
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url;
  }

  const inline =
    (p.inline_data ?? p.inlineData) as
      | Record<string, unknown>
      | undefined;
  if (inline && typeof inline.data === "string") {
    const mime =
      typeof inline.mime_type === "string"
        ? inline.mime_type
        : typeof inline.mimeType === "string"
          ? inline.mimeType
          : "image/png";
    return `data:${mime};base64,${inline.data}`;
  }

  if (p.type === "text" && typeof p.text === "string") {
    return firstDataImageUriInString(p.text);
  }

  return undefined;
}

/**
 * Calls the OpenRouter API to generate an image.
 * Uses the chat/completions endpoint with a vision-capable model that returns
 * an inline image in the response (base64).
 *
 * Must be called from a Convex Action (has access to fetch + env vars).
 */
export async function generateImageViaOpenRouter(
  apiKey: string,
  params: GenerateImageParams
): Promise<OpenRouterImageResponse> {
  const modelId = params.model ?? DEFAULT_IMAGE_MODEL;
  const model = IMAGE_MODELS[modelId];
  const requestModalities = model?.requestModalities ?? IMAGE_AND_TEXT_MODALITIES;
  const requestStartedAt = Date.now();
  const referenceImages = (params.referenceImages ?? [])
    .filter((reference) => typeof reference.imageUrl === "string" && reference.imageUrl.trim().length > 0)
    .slice(0, MAX_AI_IMAGE_REFERENCES);
  const legacyReferenceImageUrl = params.referenceImageUrl?.trim();
  if (referenceImages.length === 0 && legacyReferenceImageUrl) {
    referenceImages.push({
      sourceNodeId: "legacy-reference",
      sourceType: "image",
      label: "Ref 1",
      imageUrl: legacyReferenceImageUrl,
    });
  }

  console.info("[openrouter] request start", {
    modelId,
    hasReferenceImageUrl: referenceImages.length > 0,
    referenceImageCount: referenceImages.length,
    aspectRatio: params.aspectRatio?.trim() || null,
    promptLength: params.prompt.length,
  });

  // Ohne Referenzbild: einfacher String als content — bei Gemini/OpenRouter sonst oft nur Text (refusal/reasoning) statt Bild.
  const userMessage =
    referenceImages.length > 0
      ? {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: [
                buildReferencePromptPreamble(referenceImages),
                "",
                "User request:",
                params.prompt,
              ].join("\n"),
            },
            ...referenceImages.map((reference) => ({
              type: "image_url" as const,
              image_url: { url: reference.imageUrl!.trim() },
            })),
          ],
        }
      : {
          role: "user" as const,
          content: params.prompt,
        };

  const body: Record<string, unknown> = {
    model: modelId,
    modalities: [...requestModalities],
    messages: [userMessage],
  };

  if (params.aspectRatio?.trim()) {
    body.image_config = {
      aspect_ratio: params.aspectRatio.trim(),
    };
  }

  let response: Response;

  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://app.lemonspace.io",
        "X-Title": "LemonSpace",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("[openrouter] request failed", {
      modelId,
      durationMs: Date.now() - requestStartedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  console.info("[openrouter] response received", {
    modelId,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - requestStartedAt,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  const message = data?.choices?.[0]?.message as Record<string, unknown> | undefined;
  if (!message) {
    throw new ConvexError({ code: "OPENROUTER_MISSING_MESSAGE" });
  }

  let rawImage: string | undefined;

  const images = message.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0] as Record<string, unknown>;
    const block = (first.image_url ?? first.imageUrl) as
      | Record<string, unknown>
      | undefined;
    const url = block?.url;
    if (typeof url === "string") {
      rawImage = url;
    }
  }

  const content = message.content;
  if (!rawImage && Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      const uri = dataUriFromContentPart(p);
      if (uri) {
        rawImage = uri;
        break;
      }
    }
  }

  if (!rawImage && typeof content === "string") {
    rawImage = firstDataImageUriInString(content);
  }

  const refusal = message.refusal;
  if (
    (!rawImage || (!rawImage.startsWith("data:") && !rawImage.startsWith("http"))) &&
    refusal != null &&
    String(refusal).length > 0
  ) {
    const r =
      typeof refusal === "string" ? refusal : JSON.stringify(refusal);
    throw new ConvexError({
      code: "OPENROUTER_MODEL_REFUSAL",
      data: { reason: r.slice(0, 500) },
    });
  }

  if (
    !rawImage ||
    (!rawImage.startsWith("data:") &&
      !rawImage.startsWith("http://") &&
      !rawImage.startsWith("https://"))
  ) {
    const reasoning =
      typeof message.reasoning === "string"
        ? message.reasoning.slice(0, 400)
        : "";
    const contentPreview =
      typeof content === "string"
        ? content.slice(0, 400)
        : Array.isArray(content)
          ? JSON.stringify(content).slice(0, 400)
          : "";
    throw new ConvexError({
      code: "OPENROUTER_NO_IMAGE_IN_RESPONSE",
      data: {
        keys: Object.keys(message).join(", "),
        reasoningOrContent: reasoning || contentPreview,
      },
    });
  }

  let dataUri = rawImage;
  if (rawImage.startsWith("http://") || rawImage.startsWith("https://")) {
    const imageDownloadStartedAt = Date.now();
    const imgRes = await fetch(rawImage);
    if (!imgRes.ok) {
      throw new ConvexError({
        code: "OPENROUTER_IMAGE_URL_LOAD_FAILED",
        data: { status: imgRes.status },
      });
    }
    const mimeTypeFromRes =
      imgRes.headers.get("content-type") ?? "image/png";
    const buf = await imgRes.arrayBuffer();
    console.info("[openrouter] image downloaded", {
      modelId,
      durationMs: Date.now() - imageDownloadStartedAt,
      bytes: buf.byteLength,
      mimeType: mimeTypeFromRes,
    });
    let b64: string;
    if (typeof Buffer !== "undefined") {
      b64 = Buffer.from(buf).toString("base64");
    } else {
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      b64 = btoa(binary);
    }
    dataUri = `data:${mimeTypeFromRes};base64,${b64}`;
  }

  if (!dataUri.startsWith("data:")) {
    throw new ConvexError({ code: "OPENROUTER_DATA_URI_CREATION_FAILED" });
  }

  const comma = dataUri.indexOf(",");
  if (comma === -1) {
    throw new ConvexError({ code: "OPENROUTER_DATA_URI_MISSING_BASE64" });
  }
  const meta = dataUri.slice(0, comma);
  const base64Data = dataUri.slice(comma + 1);
  const mimeType = meta.replace("data:", "").replace(";base64", "");

  console.info("[openrouter] image parsed", {
    modelId,
    durationMs: Date.now() - requestStartedAt,
    mimeType: mimeType || "image/png",
    base64Length: base64Data.length,
    source: rawImage.startsWith("data:") ? "inline" : "remote-url",
  });

  return {
    imageBase64: base64Data,
    mimeType: mimeType || "image/png",
  };
}
