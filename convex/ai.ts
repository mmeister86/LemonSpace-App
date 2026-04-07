import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { FunctionReference } from "convex/server";
import {
  generateImageViaOpenRouter,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
} from "./openrouter";
import type { Id } from "./_generated/dataModel";
import { assertNodeBelongsToCanvasOrThrow } from "./ai_utils";
import {
  createVideoTask,
  downloadVideoAsBlob,
  FreepikApiError,
  getVideoTaskStatus,
} from "./freepik";
import {
  categorizeError,
  errorMessage,
  formatTerminalStatusMessage,
  getErrorCode,
  getErrorSource,
  getProviderStatus,
  getVideoPollDelayMs,
  isVideoPollTimedOut,
} from "./ai_errors";
import { getNodeDataRecord } from "./ai_node_data";
import { generateImageWithAutoRetry } from "./ai_retry";
import { getVideoModel, isVideoModelId } from "../lib/ai-video-models";
import {
  shouldLogVideoPollAttempt,
  shouldLogVideoPollResult,
  type VideoPollStatus,
} from "../lib/video-poll-logging";
import { normalizePublicTier } from "../lib/tier-credits";

const MAX_IMAGE_RETRIES = 2;
const MAX_VIDEO_POLL_ATTEMPTS = 30;
const MAX_VIDEO_POLL_TOTAL_MS = 10 * 60 * 1000;

async function releaseInternalReservationBestEffort(
  reservationId: Id<"creditTransactions"> | null | undefined,
  releaseFn: (transactionId: Id<"creditTransactions">) => Promise<unknown>
) {
  if (!reservationId) {
    return;
  }
  try {
    await releaseFn(reservationId);
  } catch {
    // Keep node status updates best-effort even if credit release fails.
  }
}

async function releasePublicReservationBestEffort(
  reservationId: Id<"creditTransactions"> | null | undefined,
  releaseFn: (transactionId: Id<"creditTransactions">) => Promise<unknown>
) {
  if (!reservationId) {
    return;
  }
  try {
    await releaseFn(reservationId);
  } catch {
    // Prefer returning a clear node error over masking with cleanup failures.
  }
}

async function decrementConcurrencyIfNeeded(
  shouldDecrement: boolean,
  decrementFn: () => Promise<unknown>
) {
  if (!shouldDecrement) {
    return;
  }
  await decrementFn();
}

export const markNodeExecuting = internalMutation({
  args: {
    nodeId: v.id("nodes"),
  },
  handler: async (ctx, { nodeId }) => {
    await ctx.db.patch(nodeId, {
      status: "executing",
      retryCount: 0,
      statusMessage: undefined,
    });
  },
});

export const markNodeRetry = internalMutation({
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
    await ctx.db.patch(nodeId, {
      status: "executing",
      retryCount,
      statusMessage: `Retry ${retryCount}/${maxRetries} — ${reason}`,
    });
  },
});

export const finalizeImageSuccess = internalMutation({
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
    { nodeId, prompt, modelId, storageId, aspectRatio, retryCount }
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
      status: "done",
      retryCount,
      statusMessage: undefined,
      data: {
        ...prev,
        storageId,
        prompt,
        model: modelId,
        modelLabel: modelConfig.name,
        modelTier: modelConfig.tier,
        generatedAt: Date.now(),
        creditCost,
        ...(resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : {}),
      },
    });

    return { creditCost };
  },
});

export const finalizeImageFailure = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    retryCount: v.number(),
    statusMessage: v.string(),
  },
  handler: async (ctx, { nodeId, retryCount, statusMessage }) => {
    await ctx.db.patch(nodeId, {
      status: "error",
      retryCount,
      statusMessage,
    });
  },
});

export const generateAndStoreImage = internalAction({
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
        MAX_IMAGE_RETRIES
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

export const processImageGeneration = internalAction({
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

      if (args.reservationId) {
        await ctx.runMutation(internal.credits.commitInternal, {
          transactionId: args.reservationId,
          actualCost: creditCost,
        });
      }

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

      await releaseInternalReservationBestEffort(
        args.reservationId,
        (transactionId) =>
          ctx.runMutation(internal.credits.releaseInternal, {
            transactionId,
          })
      );

      await ctx.runMutation(internal.ai.finalizeImageFailure, {
        nodeId: args.nodeId,
        retryCount,
        statusMessage: formatTerminalStatusMessage(error),
      });
    } finally {
      await decrementConcurrencyIfNeeded(args.shouldDecrementConcurrency, () =>
        ctx.runMutation(internal.credits.decrementConcurrency, {
          userId: args.userId,
        })
      );

      console.info("[processImageGeneration] finished", {
        nodeId: args.nodeId,
        retryCount,
        totalDurationMs: Date.now() - startedAt,
        shouldDecrementConcurrency: args.shouldDecrementConcurrency,
      });
    }
  },
});

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
  handler: async (
    ctx,
    args
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
      }
    );
    if (!node) {
      throw new Error("Node not found");
    }
    assertNodeBelongsToCanvasOrThrow(node, args.canvasId);

    const userId = canvas.ownerId;
    const verifiedCanvasId = canvas._id;
    const verifiedNodeId = node._id;

    const internalCreditsEnabled =
      process.env.INTERNAL_CREDITS_ENABLED === "true";

    const modelId = args.model ?? DEFAULT_IMAGE_MODEL;
    const modelConfig = IMAGE_MODELS[modelId];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    await ctx.runMutation(internal.credits.checkAbuseLimits, {});

    let usageIncremented = false;
    const reservationId: Id<"creditTransactions"> | null = internalCreditsEnabled
      ? await ctx.runMutation(api.credits.reserve, {
          estimatedCost: modelConfig.creditCost,
          description: `Bildgenerierung — ${modelConfig.name}`,
          model: modelId,
          nodeId: verifiedNodeId,
          canvasId: verifiedCanvasId,
          provider: "openrouter",
        })
      : null;

    if (!internalCreditsEnabled) {
      await ctx.runMutation(internal.credits.incrementUsage, {});
      usageIncremented = true;
    }

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

      await releasePublicReservationBestEffort(reservationId, (transactionId) =>
        ctx.runMutation(api.credits.release, {
          transactionId,
        })
      );

      await ctx.runMutation(internal.ai.finalizeImageFailure, {
        nodeId: verifiedNodeId,
        retryCount,
        statusMessage: formatTerminalStatusMessage(error),
      });

      throw error;
    } finally {
      await decrementConcurrencyIfNeeded(
        usageIncremented && !backgroundJobScheduled,
        () =>
          ctx.runMutation(internal.credits.decrementConcurrency, {
            userId,
          })
      );
    }
  },
});

function isVideoModelAllowedForTier(modelTier: "free" | "starter" | "pro", userTier: "free" | "starter" | "pro" | "max") {
  const tierOrder = { free: 0, starter: 1, pro: 2, max: 3 } as const;
  return tierOrder[userTier] >= tierOrder[modelTier];
}

export const setVideoTaskInfo = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    taskId: v.string(),
  },
  handler: async (ctx, { nodeId, taskId }) => {
    const node = await ctx.db.get(nodeId);
    if (!node) {
      throw new Error("Node not found");
    }

    const prev = getNodeDataRecord(node.data);

    await ctx.db.patch(nodeId, {
      data: {
        ...prev,
        taskId,
      },
    });
  },
});

export const markVideoPollingRetry = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    attempt: v.number(),
    maxAttempts: v.number(),
    failureMessage: v.string(),
  },
  handler: async (ctx, { nodeId, attempt, maxAttempts, failureMessage }) => {
    await ctx.db.patch(nodeId, {
      status: "executing",
      retryCount: attempt,
      statusMessage: `Retry ${attempt}/${maxAttempts} - ${failureMessage}`,
    });
  },
});

export const finalizeVideoSuccess = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    prompt: v.string(),
    modelId: v.string(),
    durationSeconds: v.union(v.literal(5), v.literal(10)),
    storageId: v.id("_storage"),
    retryCount: v.number(),
    creditCost: v.number(),
  },
  handler: async (
    ctx,
    { nodeId, prompt, modelId, durationSeconds, storageId, retryCount, creditCost }
  ) => {
    const model = getVideoModel(modelId);
    if (!model) {
      throw new Error(`Unknown video model: ${modelId}`);
    }

    const existing = await ctx.db.get(nodeId);
    if (!existing) {
      throw new Error("Node not found");
    }

    const prev = getNodeDataRecord(existing.data);

    await ctx.db.patch(nodeId, {
      status: "done",
      retryCount,
      statusMessage: undefined,
      data: {
        ...prev,
        taskId: undefined,
        storageId,
        prompt,
        model: modelId,
        modelLabel: model.label,
        durationSeconds,
        generatedAt: Date.now(),
        creditCost,
      },
    });
  },
});

export const finalizeVideoFailure = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    retryCount: v.number(),
    statusMessage: v.string(),
  },
  handler: async (ctx, { nodeId, retryCount, statusMessage }) => {
    const existing = await ctx.db.get(nodeId);
    if (!existing) {
      throw new Error("Node not found");
    }
    const prev = getNodeDataRecord(existing.data);

    await ctx.db.patch(nodeId, {
      status: "error",
      retryCount,
      statusMessage,
      data: {
        ...prev,
        taskId: undefined,
      },
    });
  },
});

export const processVideoGeneration = internalAction({
  args: {
    outputNodeId: v.id("nodes"),
    prompt: v.string(),
    modelId: v.string(),
    durationSeconds: v.union(v.literal(5), v.literal(10)),
    creditCost: v.number(),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const model = getVideoModel(args.modelId);
    if (!model) {
      throw new Error(`Unknown video model: ${args.modelId}`);
    }

    console.info("[processVideoGeneration] start", {
      outputNodeId: args.outputNodeId,
      modelId: args.modelId,
      endpoint: model.freepikEndpoint,
      durationSeconds: args.durationSeconds,
      promptLength: args.prompt.length,
      hasReservation: Boolean(args.reservationId),
      shouldDecrementConcurrency: args.shouldDecrementConcurrency,
    });

    try {
      const { task_id } = await createVideoTask({
        endpoint: model.freepikEndpoint,
        prompt: args.prompt,
        durationSeconds: args.durationSeconds,
      });

      console.info("[processVideoGeneration] task created", {
        outputNodeId: args.outputNodeId,
        taskId: task_id,
        modelId: args.modelId,
      });

      await ctx.runMutation(internal.ai.setVideoTaskInfo, {
        nodeId: args.outputNodeId,
        taskId: task_id,
      });

      await ctx.scheduler.runAfter(getVideoPollDelayMs(1), internal.ai.pollVideoTask, {
        taskId: task_id,
        outputNodeId: args.outputNodeId,
        prompt: args.prompt,
        modelId: args.modelId,
        durationSeconds: args.durationSeconds,
        creditCost: args.creditCost,
        reservationId: args.reservationId,
        shouldDecrementConcurrency: args.shouldDecrementConcurrency,
        userId: args.userId,
        attempt: 1,
        startedAtMs: Date.now(),
      });
    } catch (error) {
      console.warn("[processVideoGeneration] failed before polling", {
        outputNodeId: args.outputNodeId,
        modelId: args.modelId,
        errorMessage: errorMessage(error),
        errorCode: getErrorCode(error) ?? null,
        source: getErrorSource(error) ?? null,
        providerStatus: getProviderStatus(error),
        freepikBody: error instanceof FreepikApiError ? error.body : undefined,
      });

      await releaseInternalReservationBestEffort(
        args.reservationId,
        (transactionId) =>
          ctx.runMutation(internal.credits.releaseInternal, {
            transactionId,
          })
      );

      await ctx.runMutation(internal.ai.finalizeVideoFailure, {
        nodeId: args.outputNodeId,
        retryCount: 0,
        statusMessage: formatTerminalStatusMessage(error),
      });

      await decrementConcurrencyIfNeeded(args.shouldDecrementConcurrency, () =>
        ctx.runMutation(internal.credits.decrementConcurrency, {
          userId: args.userId,
        })
      );
    }
  },
});

export const pollVideoTask = internalAction({
  args: {
    taskId: v.string(),
    outputNodeId: v.id("nodes"),
    prompt: v.string(),
    modelId: v.string(),
    durationSeconds: v.union(v.literal(5), v.literal(10)),
    creditCost: v.number(),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
    userId: v.string(),
    attempt: v.number(),
    startedAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const elapsedMs = Date.now() - args.startedAtMs;
    if (
      isVideoPollTimedOut({
        attempt: args.attempt,
        maxAttempts: MAX_VIDEO_POLL_ATTEMPTS,
        elapsedMs,
        maxTotalMs: MAX_VIDEO_POLL_TOTAL_MS,
      })
    ) {
      await releaseInternalReservationBestEffort(
        args.reservationId,
        (transactionId) =>
          ctx.runMutation(internal.credits.releaseInternal, {
            transactionId,
          })
      );

      await ctx.runMutation(internal.ai.finalizeVideoFailure, {
        nodeId: args.outputNodeId,
        retryCount: args.attempt,
        statusMessage: "Timeout: Video generation exceeded maximum polling time",
      });

      await decrementConcurrencyIfNeeded(args.shouldDecrementConcurrency, () =>
        ctx.runMutation(internal.credits.decrementConcurrency, {
          userId: args.userId,
        })
      );
      return;
    }

    try {
      if (shouldLogVideoPollAttempt(args.attempt)) {
        console.info("[pollVideoTask] poll start", {
          outputNodeId: args.outputNodeId,
          taskId: args.taskId,
          attempt: args.attempt,
          elapsedMs,
        });
      }

      const model = getVideoModel(args.modelId);
      if (!model) {
        throw new Error(`Unknown video model: ${args.modelId}`);
      }

      const status = await getVideoTaskStatus({
        taskId: args.taskId,
        statusEndpointPath: model.statusEndpointPath,
        attempt: args.attempt,
      });

      if (shouldLogVideoPollResult(args.attempt, status.status as VideoPollStatus)) {
        console.info("[pollVideoTask] poll result", {
          outputNodeId: args.outputNodeId,
          taskId: args.taskId,
          attempt: args.attempt,
          status: status.status,
          generatedCount: status.generated?.length ?? 0,
          hasError: Boolean(status.error),
          statusError: status.error ?? null,
        });
      }

      if (status.status === "FAILED") {
        await releaseInternalReservationBestEffort(
          args.reservationId,
          (transactionId) =>
            ctx.runMutation(internal.credits.releaseInternal, {
              transactionId,
            })
        );

        await ctx.runMutation(internal.ai.finalizeVideoFailure, {
          nodeId: args.outputNodeId,
          retryCount: args.attempt,
          statusMessage: status.error?.trim() || "Provider: Video generation failed",
        });

        await decrementConcurrencyIfNeeded(args.shouldDecrementConcurrency, () =>
          ctx.runMutation(internal.credits.decrementConcurrency, {
            userId: args.userId,
          })
        );
        return;
      }

      if (status.status === "COMPLETED") {
        const generatedUrl = status.generated?.[0]?.url;
        if (!generatedUrl) {
          throw new Error("Freepik completed without generated video URL");
        }

        const blob = await downloadVideoAsBlob(generatedUrl);
        const storageId = await ctx.storage.store(blob);

        await ctx.runMutation(internal.ai.finalizeVideoSuccess, {
          nodeId: args.outputNodeId,
          prompt: args.prompt,
          modelId: args.modelId,
          durationSeconds: args.durationSeconds,
          storageId: storageId as Id<"_storage">,
          retryCount: args.attempt,
          creditCost: args.creditCost,
        });

        if (args.reservationId) {
          await ctx.runMutation(internal.credits.commitInternal, {
            transactionId: args.reservationId,
            actualCost: args.creditCost,
          });
        }

        await decrementConcurrencyIfNeeded(args.shouldDecrementConcurrency, () =>
          ctx.runMutation(internal.credits.decrementConcurrency, {
            userId: args.userId,
          })
        );
        return;
      }
    } catch (error) {
      console.warn("[pollVideoTask] poll failed", {
        outputNodeId: args.outputNodeId,
        taskId: args.taskId,
        attempt: args.attempt,
        elapsedMs,
        errorMessage: errorMessage(error),
        errorCode: getErrorCode(error) ?? null,
        source: getErrorSource(error) ?? null,
        providerStatus: getProviderStatus(error),
        retryable: categorizeError(error).retryable,
        freepikBody: error instanceof FreepikApiError ? error.body : undefined,
      });

      const { retryable } = categorizeError(error);
      if (retryable && args.attempt < MAX_VIDEO_POLL_ATTEMPTS) {
        await ctx.runMutation(internal.ai.markVideoPollingRetry, {
          nodeId: args.outputNodeId,
          attempt: args.attempt,
          maxAttempts: MAX_VIDEO_POLL_ATTEMPTS,
          failureMessage: errorMessage(error),
        });

        const retryDelayMs = getVideoPollDelayMs(args.attempt);
        await ctx.scheduler.runAfter(retryDelayMs, internal.ai.pollVideoTask, {
          ...args,
          attempt: args.attempt + 1,
        });
        return;
      }

      await releaseInternalReservationBestEffort(
        args.reservationId,
        (transactionId) =>
          ctx.runMutation(internal.credits.releaseInternal, {
            transactionId,
          })
      );

      await ctx.runMutation(internal.ai.finalizeVideoFailure, {
        nodeId: args.outputNodeId,
        retryCount: args.attempt,
        statusMessage: formatTerminalStatusMessage(error),
      });

      await decrementConcurrencyIfNeeded(args.shouldDecrementConcurrency, () =>
        ctx.runMutation(internal.credits.decrementConcurrency, {
          userId: args.userId,
        })
      );
      return;
    }

    const delayMs = getVideoPollDelayMs(args.attempt);
    await ctx.scheduler.runAfter(delayMs, internal.ai.pollVideoTask, {
      ...args,
      attempt: args.attempt + 1,
    });
  },
});

export const generateVideo = action({
  args: {
    canvasId: v.id("canvases"),
    sourceNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    prompt: v.string(),
    modelId: v.string(),
    durationSeconds: v.union(v.literal(5), v.literal(10)),
  },
  handler: async (ctx, args): Promise<{ queued: true; outputNodeId: Id<"nodes"> }> => {
    const canvas = await ctx.runQuery(api.canvases.get, {
      canvasId: args.canvasId,
    });
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    const sourceNode = await ctx.runQuery(
      api.nodes.get as FunctionReference<"query", "public">,
      {
        nodeId: args.sourceNodeId,
        includeStorageUrl: false,
      }
    );
    if (!sourceNode) {
      throw new Error("Source node not found");
    }
    assertNodeBelongsToCanvasOrThrow(sourceNode, args.canvasId);

    const outputNode = await ctx.runQuery(
      api.nodes.get as FunctionReference<"query", "public">,
      {
        nodeId: args.outputNodeId,
        includeStorageUrl: false,
      }
    );
    if (!outputNode) {
      throw new Error("Output node not found");
    }
    assertNodeBelongsToCanvasOrThrow(outputNode, args.canvasId);

    if (outputNode.type !== "ai-video") {
      throw new Error("Output node must be ai-video");
    }

    if (!isVideoModelId(args.modelId)) {
      throw new Error(`Unknown video model: ${args.modelId}`);
    }

    const model = getVideoModel(args.modelId);
    if (!model) {
      throw new Error(`Unknown video model: ${args.modelId}`);
    }

    const subscription = await ctx.runQuery(api.credits.getSubscription, {});
    const userTier = normalizePublicTier(subscription?.tier);
    if (!isVideoModelAllowedForTier(model.tier, userTier)) {
      throw new Error(`Model ${args.modelId} requires ${model.tier} tier`);
    }

    const prompt = args.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }

    const userId = canvas.ownerId;
    const creditCost = model.creditCost[args.durationSeconds];
    const internalCreditsEnabled = process.env.INTERNAL_CREDITS_ENABLED === "true";

    await ctx.runMutation(internal.credits.checkAbuseLimits, {});

    let usageIncremented = false;
    const reservationId: Id<"creditTransactions"> | null = internalCreditsEnabled
      ? await ctx.runMutation(api.credits.reserve, {
          estimatedCost: creditCost,
          description: `Videogenerierung - ${model.label} (${args.durationSeconds}s)`,
          model: args.modelId,
          nodeId: args.outputNodeId,
          canvasId: args.canvasId,
          provider: "freepik",
          videoMeta: {
            model: args.modelId,
            durationSeconds: args.durationSeconds,
            hasAudio: false,
          },
        })
      : null;

    if (!internalCreditsEnabled) {
      await ctx.runMutation(internal.credits.incrementUsage, {});
      usageIncremented = true;
    }

    try {
      await ctx.runMutation(internal.ai.markNodeExecuting, {
        nodeId: args.outputNodeId,
      });

      await ctx.scheduler.runAfter(0, internal.ai.processVideoGeneration, {
        outputNodeId: args.outputNodeId,
        prompt,
        modelId: args.modelId,
        durationSeconds: args.durationSeconds,
        creditCost,
        reservationId: reservationId ?? undefined,
        shouldDecrementConcurrency: usageIncremented,
        userId,
      });

      return { queued: true, outputNodeId: args.outputNodeId };
    } catch (error) {
      await releasePublicReservationBestEffort(reservationId, (transactionId) =>
        ctx.runMutation(api.credits.release, {
          transactionId,
        })
      );

      await ctx.runMutation(internal.ai.finalizeVideoFailure, {
        nodeId: args.outputNodeId,
        retryCount: 0,
        statusMessage: formatTerminalStatusMessage(error),
      });

      await decrementConcurrencyIfNeeded(usageIncremented, () =>
        ctx.runMutation(internal.credits.decrementConcurrency, {
          userId,
        })
      );

      throw error;
    }
  },
});
