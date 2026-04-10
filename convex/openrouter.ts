import { ConvexError } from "convex/values";

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
    throw new ConvexError({
      code: "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR",
      status: response.status,
      message: errorText,
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

export interface OpenRouterModel {
  id: string;
  name: string;
  tier: "budget" | "standard" | "premium";
  estimatedCostPerImage: number; // in Euro-Cent (for credit reservation)
  /** Gleiche Einheit wie UI „Cr“ / lib/ai-models creditCost */
  creditCost: number;
  minTier: "free" | "starter" | "pro" | "max";
  requestModalities?: readonly ("image" | "text")[];
}

const IMAGE_AND_TEXT_MODALITIES = ["image", "text"] as const;
const IMAGE_ONLY_MODALITIES = ["image"] as const;
export const IMAGE_MODELS: Record<string, OpenRouterModel> = {
  "google/gemini-2.5-flash-image": {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash",
    tier: "standard",
    estimatedCostPerImage: 4, // ~€0.04 in Euro-Cent
    creditCost: 4,
    minTier: "free",
  },
  "black-forest-labs/flux.2-klein-4b": {
    id: "black-forest-labs/flux.2-klein-4b",
    name: "FLUX.2 Klein 4B",
    tier: "budget",
    estimatedCostPerImage: 2,
    creditCost: 2,
    minTier: "free",
    requestModalities: IMAGE_ONLY_MODALITIES,
  },
  "bytedance-seed/seedream-4.5": {
    id: "bytedance-seed/seedream-4.5",
    name: "Seedream 4.5",
    tier: "standard",
    estimatedCostPerImage: 5,
    creditCost: 5,
    minTier: "free",
    requestModalities: IMAGE_ONLY_MODALITIES,
  },
  "google/gemini-3.1-flash-image-preview": {
    id: "google/gemini-3.1-flash-image-preview",
    name: "Gemini 3.1 Flash Image",
    tier: "standard",
    estimatedCostPerImage: 6,
    creditCost: 6,
    minTier: "free",
  },
  "openai/gpt-5-image-mini": {
    id: "openai/gpt-5-image-mini",
    name: "GPT-5 Image Mini",
    tier: "premium",
    estimatedCostPerImage: 8,
    creditCost: 8,
    minTier: "starter",
  },
  "sourceful/riverflow-v2-fast": {
    id: "sourceful/riverflow-v2-fast",
    name: "Riverflow V2 Fast",
    tier: "premium",
    estimatedCostPerImage: 9,
    creditCost: 9,
    minTier: "starter",
    requestModalities: IMAGE_ONLY_MODALITIES,
  },
  "sourceful/riverflow-v2-pro": {
    id: "sourceful/riverflow-v2-pro",
    name: "Riverflow V2 Pro",
    tier: "premium",
    estimatedCostPerImage: 12,
    creditCost: 12,
    minTier: "starter",
    requestModalities: IMAGE_ONLY_MODALITIES,
  },
  "google/gemini-3-pro-image-preview": {
    id: "google/gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image",
    tier: "premium",
    estimatedCostPerImage: 13,
    creditCost: 13,
    minTier: "starter",
  },
  "openai/gpt-5-image": {
    id: "openai/gpt-5-image",
    name: "GPT-5 Image",
    tier: "premium",
    estimatedCostPerImage: 15,
    creditCost: 15,
    minTier: "starter",
  },
};

export const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";

export interface GenerateImageParams {
  prompt: string;
  referenceImageUrl?: string; // optional image-to-image input
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

  console.info("[openrouter] request start", {
    modelId,
    hasReferenceImageUrl: Boolean(params.referenceImageUrl),
    aspectRatio: params.aspectRatio?.trim() || null,
    promptLength: params.prompt.length,
  });

  // Ohne Referenzbild: einfacher String als content — bei Gemini/OpenRouter sonst oft nur Text (refusal/reasoning) statt Bild.
  const userMessage =
    params.referenceImageUrl != null && params.referenceImageUrl !== ""
      ? {
          role: "user" as const,
          content: [
            {
              type: "image_url" as const,
              image_url: { url: params.referenceImageUrl },
            },
            {
              type: "text" as const,
              text: params.prompt,
            },
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
