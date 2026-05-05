import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export function getOpenRouterModel(modelId: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set in the Next.js server environment. AI SDK streaming runs in app/api/ai-stream/*, so Convex environment variables are not visible here.",
    );
  }

  const openrouter = createOpenRouter({
    apiKey,
    appName: "LemonSpace",
    appUrl: "https://app.lemonspace.io",
    compatibility: "compatible",
  });

  return openrouter(modelId);
}
