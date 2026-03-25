export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterModel {
  id: string;
  name: string;
  tier: "budget" | "standard" | "premium";
  estimatedCostPerImage: number; // in Euro-Cent (for credit reservation)
}

// Phase 1: Gemini 2.5 Flash Image only.
// Add more models here in Phase 2 when the model selector UI is built.
export const IMAGE_MODELS: Record<string, OpenRouterModel> = {
  "google/gemini-2.5-flash-image": {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash",
    tier: "standard",
    estimatedCostPerImage: 4, // ~€0.04 in Euro-Cent
  },
};

export const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";

export interface GenerateImageParams {
  prompt: string;
  referenceImageUrl?: string; // optional image-to-image input
  model?: string;
}

export interface OpenRouterImageResponse {
  imageBase64: string; // base64-encoded PNG/JPEG
  mimeType: string;
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

  // Build message content — text prompt, optionally with a reference image
  const userContent: object[] = [];

  if (params.referenceImageUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: params.referenceImageUrl },
    });
  }

  userContent.push({
    type: "text",
    text: params.prompt,
  });

  const body = {
    model: modelId,
    modalities: ["image", "text"],
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  };

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

  // OpenRouter returns generated images in message.images (separate from content)
  const images = data?.choices?.[0]?.message?.images;

  if (!images || images.length === 0) {
    throw new Error("No image found in OpenRouter response");
  }

  const imageUrl = images[0]?.image_url?.url;
  if (!imageUrl) {
    throw new Error("Image block missing image_url.url");
  }

  // The URL is a data URI: "data:image/png;base64,<data>"
  const dataUri: string = imageUrl;
  const [meta, base64Data] = dataUri.split(",");
  const mimeType = meta.replace("data:", "").replace(";base64", "");

  return {
    imageBase64: base64Data,
    mimeType: mimeType || "image/png",
  };
}
