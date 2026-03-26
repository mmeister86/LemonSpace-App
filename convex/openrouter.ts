export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterModel {
  id: string;
  name: string;
  tier: "budget" | "standard" | "premium";
  estimatedCostPerImage: number; // in Euro-Cent (for credit reservation)
  /** Gleiche Einheit wie UI „Cr“ / lib/ai-models creditCost */
  creditCost: number;
}

// Phase 1: Gemini 2.5 Flash Image only.
// Add more models here in Phase 2 when the model selector UI is built.
export const IMAGE_MODELS: Record<string, OpenRouterModel> = {
  "google/gemini-2.5-flash-image": {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash",
    tier: "standard",
    estimatedCostPerImage: 4, // ~€0.04 in Euro-Cent
    creditCost: 4,
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
    modalities: ["image", "text"],
    messages: [userMessage],
  };

  if (params.aspectRatio?.trim()) {
    body.image_config = {
      aspect_ratio: params.aspectRatio.trim(),
    };
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://app.lemonspace.io",
      "X-Title": "LemonSpace",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  const message = data?.choices?.[0]?.message as Record<string, unknown> | undefined;
  if (!message) {
    throw new Error("OpenRouter: choices[0].message fehlt");
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
    throw new Error(`OpenRouter: Modell lehnt ab — ${r.slice(0, 500)}`);
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
    throw new Error(
      `OpenRouter: kein Bild in der Antwort. Keys: ${Object.keys(message).join(", ")}. ` +
        (reasoning ? `reasoning: ${reasoning}` : `content: ${contentPreview}`),
    );
  }

  let dataUri = rawImage;
  if (rawImage.startsWith("http://") || rawImage.startsWith("https://")) {
    const imgRes = await fetch(rawImage);
    if (!imgRes.ok) {
      throw new Error(
        `OpenRouter: Bild-URL konnte nicht geladen werden (${imgRes.status})`,
      );
    }
    const mimeTypeFromRes =
      imgRes.headers.get("content-type") ?? "image/png";
    const buf = await imgRes.arrayBuffer();
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
    throw new Error("OpenRouter: Bild konnte nicht als data-URI erstellt werden");
  }

  const comma = dataUri.indexOf(",");
  if (comma === -1) {
    throw new Error("OpenRouter: data-URI ohne Base64-Teil");
  }
  const meta = dataUri.slice(0, comma);
  const base64Data = dataUri.slice(comma + 1);
  const mimeType = meta.replace("data:", "").replace(";base64", "");

  return {
    imageBase64: base64Data,
    mimeType: mimeType || "image/png",
  };
}
