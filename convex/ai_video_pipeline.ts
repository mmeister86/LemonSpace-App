/**
 * Onboarding note:
 * Convex backend module for ai video pipeline. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { action, internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
  createVideoTask,
  downloadVideoAsBlob,
  FreepikApiError,
  getVideoTaskStatus,
} from "./freepik";
import {
  errorMessage,
  formatTerminalStatusMessage,
  getErrorCode,
  getErrorSource,
  getProviderStatus,
} from "./ai_errors";
import {
  buildNextProviderPollSchedule,
  buildProviderPollTimeoutMessage,
  getProviderPollDelayMs,
  getProviderTerminalFailureMessage,
  isProviderPollTimedOut,
  shouldRetryProviderPollError,
} from "./provider_polling";
import { getNodeDataRecord } from "./ai_node_data";
import { upsertMediaItemByOwnerAndDedupe } from "./media";
import { buildStoredMediaDedupeKey } from "../lib/media-archive";
import { getVideoModel, isVideoModelId } from "../lib/ai-video-models";
import {
  shouldLogVideoPollAttempt,
  shouldLogVideoPollResult,
  type VideoPollStatus,
} from "../lib/video-poll-logging";
import { normalizePublicTier } from "../lib/tier-credits";

const MAX_VIDEO_POLL_ATTEMPTS = 30;
const MAX_VIDEO_POLL_TOTAL_MS = 10 * 60 * 1000;

function isVideoModelAllowedForTier(modelTier: "free" | "starter" | "pro", userTier: "free" | "starter" | "pro" | "max") {
  const tierOrder = { free: 0, starter: 1, pro: 2, max: 3 } as const;
  return tierOrder[userTier] >= tierOrder[modelTier];
}

export function defineSetVideoTaskInfo(register: typeof internalMutation) {
  return register({
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
}

export function defineMarkVideoPollingRetry(register: typeof internalMutation) {
  return register({
  args: {
    nodeId: v.id("nodes"),
    attempt: v.number(),
    maxAttempts: v.number(),
    failureMessage: v.string(),
  },
  handler: async (ctx, { nodeId, attempt, maxAttempts, failureMessage }) => {
    await ctx.db.patch(nodeId, buildNodeRetryPatch({
      retryCount: attempt,
      statusMessage: `Retry ${attempt}/${maxAttempts} - ${failureMessage}`,
    }));
  },
  });
}

export function defineFinalizeVideoSuccess(register: typeof internalMutation) {
  return register({
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
    { nodeId, prompt, modelId, durationSeconds, storageId, retryCount, creditCost },
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
      ...buildNodeDonePatch({ retryCount }),
      data: mergeNodeData(prev, {
        taskId: undefined,
        storageId,
        prompt,
        model: modelId,
        modelLabel: model.label,
        durationSeconds,
        generatedAt: Date.now(),
        creditCost,
      }),
    });

    const canvas = await ctx.db.get(existing.canvasId);
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    await upsertMediaItemByOwnerAndDedupe(ctx, {
      ownerId: canvas.ownerId,
      input: {
        kind: "video",
        source: "ai-video",
        dedupeKey: buildStoredMediaDedupeKey(storageId),
        storageId,
        durationSeconds,
        firstSourceCanvasId: existing.canvasId,
        firstSourceNodeId: nodeId,
      },
    });
  },
  });
}

export function defineFinalizeVideoFailure(register: typeof internalMutation) {
  return register({
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
      ...buildNodeErrorPatch({ retryCount, statusMessage }),
      data: mergeNodeData(prev, {
        taskId: undefined,
      }),
    });
  },
  });
}

export function defineProcessVideoGeneration(register: typeof internalAction) {
  return register({
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

      await ctx.scheduler.runAfter(getProviderPollDelayMs(1), internal.ai.pollVideoTask, {
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

      await releaseInternalReservationBestEffort(ctx, args.reservationId, "ai");

      await ctx.runMutation(internal.ai.finalizeVideoFailure, {
        nodeId: args.outputNodeId,
        retryCount: 0,
        statusMessage: formatTerminalStatusMessage(error),
      });

      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    }
  },
  });
}

export function definePollVideoTask(register: typeof internalAction) {
  return register({
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
      isProviderPollTimedOut({
        attempt: args.attempt,
        maxAttempts: MAX_VIDEO_POLL_ATTEMPTS,
        elapsedMs,
        maxTotalMs: MAX_VIDEO_POLL_TOTAL_MS,
      })
    ) {
      await releaseInternalReservationBestEffort(ctx, args.reservationId, "ai");

      await ctx.runMutation(internal.ai.finalizeVideoFailure, {
        nodeId: args.outputNodeId,
        retryCount: args.attempt,
        statusMessage: buildProviderPollTimeoutMessage("Video generation"),
      });

      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
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
        await releaseInternalReservationBestEffort(ctx, args.reservationId, "ai");

        await ctx.runMutation(internal.ai.finalizeVideoFailure, {
          nodeId: args.outputNodeId,
          retryCount: args.attempt,
          statusMessage: getProviderTerminalFailureMessage({
            providerError: status.error,
            fallback: "Provider: Video generation failed",
          }),
        });

        await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
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

        await commitInternalReservationIfNeeded(ctx, args.reservationId, args.creditCost);

        await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
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
        retryable: shouldRetryProviderPollError({
          error,
          attempt: args.attempt,
          maxAttempts: MAX_VIDEO_POLL_ATTEMPTS,
        }),
        freepikBody: error instanceof FreepikApiError ? error.body : undefined,
      });

      if (
        shouldRetryProviderPollError({
          error,
          attempt: args.attempt,
          maxAttempts: MAX_VIDEO_POLL_ATTEMPTS,
        })
      ) {
        await ctx.runMutation(internal.ai.markVideoPollingRetry, {
          nodeId: args.outputNodeId,
          attempt: args.attempt,
          maxAttempts: MAX_VIDEO_POLL_ATTEMPTS,
          failureMessage: errorMessage(error),
        });

        const schedule = buildNextProviderPollSchedule(args);
        await ctx.scheduler.runAfter(
          schedule.delayMs,
          internal.ai.pollVideoTask,
          schedule.args,
        );
        return;
      }

      await releaseInternalReservationBestEffort(ctx, args.reservationId, "ai");

      await ctx.runMutation(internal.ai.finalizeVideoFailure, {
        nodeId: args.outputNodeId,
        retryCount: args.attempt,
        statusMessage: formatTerminalStatusMessage(error),
      });

      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
      return;
    }

    const schedule = buildNextProviderPollSchedule(args);
    await ctx.scheduler.runAfter(
      schedule.delayMs,
      internal.ai.pollVideoTask,
      schedule.args,
    );
  },
  });
}

export function defineGenerateVideo(register: typeof action) {
  return register({
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
      },
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
      },
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
    const {
      reservationId,
      shouldDecrementConcurrency: usageIncremented,
    } = await startPublicJobCreditFlow(ctx, {
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
    });

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
      await releasePublicReservationBestEffort(ctx, reservationId, "ai");

      await ctx.runMutation(internal.ai.finalizeVideoFailure, {
        nodeId: args.outputNodeId,
        retryCount: 0,
        statusMessage: formatTerminalStatusMessage(error),
      });

      await decrementConcurrencyIfNeeded(ctx, usageIncremented, userId);

      throw error;
    }
  },
  });
}
