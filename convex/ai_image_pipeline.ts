/**
 * Onboarding note:
 * Convex backend module for ai image pipeline. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { action, internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  DEFAULT_IMAGE_MODEL,
  generateImageViaOpenRouter,
  IMAGE_MODELS,
} from "./openrouter";
import { assertNodeBelongsToCanvasOrThrow } from "./authz_helpers";
import {
  buildNodeDonePatch,
  buildNodeErrorPatch,
  buildNodeRetryPatch,
  mergeNodeData,
} from "./node_status_helpers";
import {
  commitInternalReservationIfNeeded,
  decrementConcurrencyIfNeeded,
  releaseInternalReservationBestEffort,
  releasePublicReservationBestEffort,
  startPublicJobCreditFlow,
} from "./job_credit_flow";
import {
  categorizeError,
  errorMessage,
  formatTerminalStatusMessage,
} from "./ai_errors";
import { getNodeDataRecord } from "./ai_node_data";
import { generateImageWithAutoRetry } from "./ai_retry";
import { upsertMediaItemByOwnerAndDedupe } from "./media";
import { buildStoredMediaDedupeKey } from "../lib/media-archive";
import { normalizePublicTier } from "../lib/tier-credits";

const MAX_IMAGE_RETRIES = 2;

function isImageModelAllowedForTier(
  minTier: "free" | "starter" | "pro" | "max",
  userTier: "free" | "starter" | "pro" | "max",
) {
  const tierOrder = { free: 0, starter: 1, pro: 2, max: 3 } as const;
  return tierOrder[userTier] >= tierOrder[minTier];
}

export function defineMarkNodeRetry(register: typeof internalMutation) {
  return register({
  args: {
    nodeId: v.id("nodes"),
    retryCount: v.number(),
    maxRetries: v.number(),
    failureMessage: v.string(),
  },
  handler: async (ctx, { nodeId, retryCount, maxRetries, failureMessage }) => {
    const reason =
      typeof failureMessage === "string" && failureMessage.trim().length > 0
        ? failureMessage
        : "temporärer Fehler";
    await ctx.db.patch(nodeId, buildNodeRetryPatch({
      retryCount,
      statusMessage: `Retry ${retryCount}/${maxRetries} — ${reason}`,
    }));
  },
  });
}

export function defineFinalizeImageSuccess(register: typeof internalMutation) {
  return register({
  args: {
    nodeId: v.id("nodes"),
    prompt: v.string(),
    modelId: v.string(),
    storageId: v.id("_storage"),
    aspectRatio: v.optional(v.string()),
    retryCount: v.number(),
  },
  handler: async (
    ctx,
    { nodeId, prompt, modelId, storageId, aspectRatio, retryCount },
  ) => {
    const modelConfig = IMAGE_MODELS[modelId];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    const existing = await ctx.db.get(nodeId);
    if (!existing) {
      throw new Error("Node not found");
    }

    const prev = getNodeDataRecord(existing.data);
    const creditCost = modelConfig.creditCost;
    const resolvedAspectRatio =
      aspectRatio?.trim() ||
      (typeof prev.aspectRatio === "string" ? prev.aspectRatio : undefined);

    await ctx.db.patch(nodeId, {
      ...buildNodeDonePatch({ retryCount }),
      data: mergeNodeData(prev, {
        storageId,
        prompt,
        model: modelId,
        modelLabel: modelConfig.name,
        modelTier: modelConfig.tier,
        generatedAt: Date.now(),
        creditCost,
        ...(resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : {}),
      }),
    });

    const canvas = await ctx.db.get(existing.canvasId);
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    await upsertMediaItemByOwnerAndDedupe(ctx, {
      ownerId: canvas.ownerId,
      input: {
        kind: "image",
        source: "ai-image",
        dedupeKey: buildStoredMediaDedupeKey(storageId),
        storageId,
        firstSourceCanvasId: existing.canvasId,
        firstSourceNodeId: nodeId,
      },
    });

    return { creditCost };
  },
  });
}

export function defineFinalizeImageFailure(register: typeof internalMutation) {
  return register({
  args: {
    nodeId: v.id("nodes"),
    retryCount: v.number(),
    statusMessage: v.string(),
  },
  handler: async (ctx, { nodeId, retryCount, statusMessage }) => {
    await ctx.db.patch(nodeId, buildNodeErrorPatch({ retryCount, statusMessage }));
  },
  });
}

export function defineGenerateAndStoreImage(register: typeof internalAction) {
  return register({
  args: {
    nodeId: v.id("nodes"),
    prompt: v.string(),
    referenceStorageId: v.optional(v.id("_storage")),
    referenceImageUrl: v.optional(v.string()),
    model: v.string(),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    console.info("[generateAndStoreImage] start", {
      nodeId: args.nodeId,
      model: args.model,
      hasReferenceStorageId: Boolean(args.referenceStorageId),
      hasReferenceImageUrl: Boolean(args.referenceImageUrl?.trim()),
      aspectRatio: args.aspectRatio?.trim() || null,
      promptLength: args.prompt.length,
    });

    let retryCount = 0;
    let referenceImageUrl = args.referenceImageUrl?.trim() || undefined;
    if (args.referenceStorageId) {
      referenceImageUrl =
        (await ctx.storage.getUrl(args.referenceStorageId)) ?? undefined;
    }

    try {
      const result = await generateImageWithAutoRetry(
        () =>
          generateImageViaOpenRouter(apiKey, {
            prompt: args.prompt,
            referenceImageUrl,
            model: args.model,
            aspectRatio: args.aspectRatio,
          }),
        async (nextRetryCount, maxRetries, failure) => {
          retryCount = nextRetryCount;
          await ctx.runMutation(internal.ai.markNodeRetry, {
            nodeId: args.nodeId,
            retryCount: nextRetryCount,
            maxRetries,
            failureMessage: failure.message,
          });
        },
        MAX_IMAGE_RETRIES,
      );

      const decodeStartedAt = Date.now();
      const binaryString = atob(result.imageBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.info("[generateAndStoreImage] image decoded", {
        nodeId: args.nodeId,
        retryCount,
        decodeDurationMs: Date.now() - decodeStartedAt,
        bytes: bytes.length,
        totalDurationMs: Date.now() - startedAt,
      });

      const storageStartedAt = Date.now();
      const blob = new Blob([bytes], { type: result.mimeType });
      const storageId = await ctx.storage.store(blob);
      console.info("[generateAndStoreImage] image stored", {
        nodeId: args.nodeId,
        retryCount,
        storageDurationMs: Date.now() - storageStartedAt,
        totalDurationMs: Date.now() - startedAt,
      });

      return {
        storageId: storageId as Id<"_storage">,
        retryCount,
      };
    } catch (error) {
      console.error("[generateAndStoreImage] failed", {
        nodeId: args.nodeId,
        retryCount,
        totalDurationMs: Date.now() - startedAt,
        message: errorMessage(error),
        category: categorizeError(error).category,
      });
      throw error;
    }
  },
  });
}

export function defineProcessImageGeneration(register: typeof internalAction) {
  return register({
  args: {
    nodeId: v.id("nodes"),
    prompt: v.string(),
    modelId: v.string(),
    referenceStorageId: v.optional(v.id("_storage")),
    referenceImageUrl: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    console.info("[processImageGeneration] start", {
      nodeId: args.nodeId,
      reservationId: args.reservationId ?? null,
      shouldDecrementConcurrency: args.shouldDecrementConcurrency,
      userId: args.userId,
    });

    let retryCount = 0;

    try {
      const result = await ctx.runAction(internal.ai.generateAndStoreImage, {
        nodeId: args.nodeId,
        prompt: args.prompt,
        referenceStorageId: args.referenceStorageId,
        referenceImageUrl: args.referenceImageUrl,
        model: args.modelId,
        aspectRatio: args.aspectRatio,
      });
      retryCount = result.retryCount;

      const { creditCost } = await ctx.runMutation(internal.ai.finalizeImageSuccess, {
        nodeId: args.nodeId,
        prompt: args.prompt,
        modelId: args.modelId,
        storageId: result.storageId,
        aspectRatio: args.aspectRatio,
        retryCount,
      });

      await commitInternalReservationIfNeeded(ctx, args.reservationId, creditCost);

      console.info("[processImageGeneration] success", {
        nodeId: args.nodeId,
        retryCount,
        totalDurationMs: Date.now() - startedAt,
        reservationId: args.reservationId ?? null,
      });
    } catch (error) {
      console.error("[processImageGeneration] failed", {
        nodeId: args.nodeId,
        retryCount,
        totalDurationMs: Date.now() - startedAt,
        reservationId: args.reservationId ?? null,
        category: categorizeError(error).category,
        message: errorMessage(error),
      });

      await releaseInternalReservationBestEffort(ctx, args.reservationId, "ai");

      await ctx.runMutation(internal.ai.finalizeImageFailure, {
        nodeId: args.nodeId,
        retryCount,
        statusMessage: formatTerminalStatusMessage(error),
      });
    } finally {
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);

      console.info("[processImageGeneration] finished", {
        nodeId: args.nodeId,
        retryCount,
        totalDurationMs: Date.now() - startedAt,
        shouldDecrementConcurrency: args.shouldDecrementConcurrency,
      });
    }
  },
  });
}

export function defineGenerateImage(register: typeof action) {
  return register({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    prompt: v.string(),
    referenceStorageId: v.optional(v.id("_storage")),
    referenceImageUrl: v.optional(v.string()),
    model: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ queued: true; nodeId: Id<"nodes"> }> => {
    const startedAt = Date.now();
    const canvas = await ctx.runQuery(api.canvases.get, {
      canvasId: args.canvasId,
    });
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    const node = await ctx.runQuery(
      api.nodes.get as FunctionReference<"query", "public">,
      {
        nodeId: args.nodeId,
        includeStorageUrl: false,
      },
    );
    if (!node) {
      throw new Error("Node not found");
    }
    assertNodeBelongsToCanvasOrThrow(node, args.canvasId);

    const userId = canvas.ownerId;
    const verifiedCanvasId = canvas._id;
    const verifiedNodeId = node._id;

    const modelId = args.model ?? DEFAULT_IMAGE_MODEL;
    const modelConfig = IMAGE_MODELS[modelId];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    const subscription = await ctx.runQuery(api.credits.getSubscription, {});
    const userTier = normalizePublicTier(subscription?.tier);
    if (!isImageModelAllowedForTier(modelConfig.minTier, userTier)) {
      throw new Error(`Model ${modelId} requires ${modelConfig.minTier} tier`);
    }

    const {
      reservationId,
      shouldDecrementConcurrency: usageIncremented,
    } = await startPublicJobCreditFlow(ctx, {
      estimatedCost: modelConfig.creditCost,
      description: `Bildgenerierung — ${modelConfig.name}`,
      model: modelId,
      nodeId: verifiedNodeId,
      canvasId: verifiedCanvasId,
      provider: "openrouter",
    });

    const retryCount = 0;
    let backgroundJobScheduled = false;

    try {
      await ctx.runMutation(internal.ai.markNodeExecuting, {
        nodeId: verifiedNodeId,
      });

      await ctx.scheduler.runAfter(0, internal.ai.processImageGeneration, {
        nodeId: verifiedNodeId,
        prompt: args.prompt,
        modelId,
        referenceStorageId: args.referenceStorageId,
        referenceImageUrl: args.referenceImageUrl,
        aspectRatio: args.aspectRatio,
        reservationId: reservationId ?? undefined,
        shouldDecrementConcurrency: usageIncremented,
        userId,
      });
      backgroundJobScheduled = true;
      console.info("[generateImage] background job scheduled", {
        nodeId: verifiedNodeId,
        canvasId: verifiedCanvasId,
        modelId,
        reservationId: reservationId ?? null,
        usageIncremented,
        durationMs: Date.now() - startedAt,
      });
      return { queued: true as const, nodeId: verifiedNodeId };
    } catch (error) {
      console.error("[generateImage] scheduling failed", {
        nodeId: verifiedNodeId,
        canvasId: verifiedCanvasId,
        modelId,
        reservationId: reservationId ?? null,
        usageIncremented,
        durationMs: Date.now() - startedAt,
        category: categorizeError(error).category,
        message: errorMessage(error),
      });

      await releasePublicReservationBestEffort(ctx, reservationId, "ai");

      await ctx.runMutation(internal.ai.finalizeImageFailure, {
        nodeId: verifiedNodeId,
        retryCount,
        statusMessage: formatTerminalStatusMessage(error),
      });

      throw error;
    } finally {
      await decrementConcurrencyIfNeeded(ctx, usageIncremented && !backgroundJobScheduled, userId);
    }
  },
  });
}
