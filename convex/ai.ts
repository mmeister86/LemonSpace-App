import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import {
  generateImageViaOpenRouter,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
} from "./openrouter";

const MAX_IMAGE_RETRIES = 2;

type ErrorCategory =
  | "credits"
  | "policy"
  | "timeout"
  | "transient"
  | "provider"
  | "unknown";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "Generation failed");
}

function parseOpenRouterStatus(message: string): number | null {
  const match = message.match(/OpenRouter API error\s+(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function categorizeError(error: unknown): {
  category: ErrorCategory;
  retryable: boolean;
} {
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  const status = parseOpenRouterStatus(message);

  if (
    lower.includes("insufficient credits") ||
    lower.includes("daily generation limit") ||
    lower.includes("concurrent job limit")
  ) {
    return { category: "credits", retryable: false };
  }

  if (
    lower.includes("modell lehnt ab") ||
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

function formatTerminalStatusMessage(error: unknown): string {
  const message = errorMessage(error).trim() || "Generation failed";
  const { category } = categorizeError(error);

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

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function generateImageWithAutoRetry(
  operation: () => Promise<Awaited<ReturnType<typeof generateImageViaOpenRouter>>>,
  onRetry: (
    retryCount: number,
    maxRetries: number,
    failure: { message: string; category: ErrorCategory }
  ) => Promise<void>
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_IMAGE_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const { retryable, category } = categorizeError(error);
      const retryCount = attempt + 1;
      const hasRemainingRetry = retryCount <= MAX_IMAGE_RETRIES;

      if (!retryable || !hasRemainingRetry) {
        throw error;
      }

      await onRetry(retryCount, MAX_IMAGE_RETRIES, {
        message: errorMessage(error),
        category,
      });
      await wait(Math.min(1500, 400 * retryCount));
    }
  }

  throw lastError ?? new Error("Generation failed");
}

export const generateImage = action({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    prompt: v.string(),
    referenceStorageId: v.optional(v.id("_storage")),
    referenceImageUrl: v.optional(v.string()),
    model: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auth: über requireAuth in runMutation — kein verschachteltes getCurrentUser (ConvexError → generische Client-Fehler).
    const internalCreditsEnabled =
      process.env.INTERNAL_CREDITS_ENABLED === "true";

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const modelId = args.model ?? DEFAULT_IMAGE_MODEL;
    const modelConfig = IMAGE_MODELS[modelId];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    const reservationId = internalCreditsEnabled
      ? await ctx.runMutation(api.credits.reserve, {
          estimatedCost: modelConfig.creditCost,
          description: `Bildgenerierung — ${modelConfig.name}`,
          model: modelId,
          nodeId: args.nodeId,
          canvasId: args.canvasId,
        })
      : null;

    await ctx.runMutation(api.nodes.updateStatus, {
      nodeId: args.nodeId,
      status: "executing",
      retryCount: 0,
    });

    let retryCount = 0;

    try {
      let referenceImageUrl = args.referenceImageUrl?.trim() || undefined;
      if (args.referenceStorageId) {
        referenceImageUrl =
          (await ctx.storage.getUrl(args.referenceStorageId)) ?? undefined;
      }

      const result = await generateImageWithAutoRetry(
        () =>
          generateImageViaOpenRouter(apiKey, {
            prompt: args.prompt,
            referenceImageUrl,
            model: modelId,
            aspectRatio: args.aspectRatio,
          }),
        async (nextRetryCount, maxRetries, failure) => {
          retryCount = nextRetryCount;
          const reason =
            typeof failure.message === "string"
              ? failure.message
              : "temporärer Fehler";
          await ctx.runMutation(api.nodes.updateStatus, {
            nodeId: args.nodeId,
            status: "executing",
            retryCount: nextRetryCount,
            statusMessage: `Retry ${nextRetryCount}/${maxRetries} — ${reason}`,
          });
        }
      );

      const binaryString = atob(result.imageBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: result.mimeType });
      const storageId = await ctx.storage.store(blob);

      const existing = await ctx.runQuery(api.nodes.get, { nodeId: args.nodeId });
      if (!existing) throw new Error("Node not found");
      const prev = (existing.data ?? {}) as Record<string, unknown>;
      const creditCost = modelConfig.creditCost;

      const aspectRatio =
        args.aspectRatio?.trim() ||
        (typeof prev.aspectRatio === "string" ? prev.aspectRatio : undefined);

      await ctx.runMutation(api.nodes.updateData, {
        nodeId: args.nodeId,
        data: {
          ...prev,
          storageId,
          prompt: args.prompt,
          model: modelId,
          modelLabel: modelConfig.name,
          modelTier: modelConfig.tier,
          generatedAt: Date.now(),
          creditCost,
          ...(aspectRatio ? { aspectRatio } : {}),
        },
      });

      await ctx.runMutation(api.nodes.updateStatus, {
        nodeId: args.nodeId,
        status: "done",
        retryCount,
      });

      if (reservationId) {
        await ctx.runMutation(api.credits.commit, {
          transactionId: reservationId,
          actualCost: creditCost,
        });
      }
    } catch (error) {
      if (reservationId) {
        await ctx.runMutation(api.credits.release, {
          transactionId: reservationId,
        });
      }

      await ctx.runMutation(api.nodes.updateStatus, {
        nodeId: args.nodeId,
        status: "error",
        retryCount,
        statusMessage: formatTerminalStatusMessage(error),
      });

      throw error;
    }
  },
});
