import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { action, internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateStructuredObjectViaOpenRouter } from "./openrouter";
import { assertNodeBelongsToCanvasOrThrow } from "./authz_helpers";
import {
  buildNodeDonePatch,
  buildNodeErrorPatch,
  mergeNodeData,
} from "./node_status_helpers";
import {
  commitInternalReservationIfNeeded,
  decrementConcurrencyIfNeeded,
  releaseInternalReservationBestEffort,
  releasePublicReservationBestEffort,
  startPublicJobCreditFlow,
} from "./job_credit_flow";
import { formatTerminalStatusMessage } from "./ai_errors";
import { getNodeDataRecord } from "./ai_node_data";
import {
  getAiTextModel,
  isAiTextModelAvailableForTier,
} from "../lib/ai-text-models";
import { normalizePublicTier } from "../lib/tier-credits";

const AI_TEXT_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["outputText"],
  properties: {
    outputText: {
      type: "string",
    },
  },
} as const satisfies Record<string, unknown>;

function trimOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildAiTextMessages(args: {
  instruction?: string;
  inputText?: string;
}): Array<{
  role: "system" | "user" | "assistant";
  content: string;
}> {
  const instruction = trimOptionalText(args.instruction);
  const inputText = trimOptionalText(args.inputText);
  const hasSourceMaterial = Boolean(inputText);

  const requestedTask = instruction
    ? instruction
    : hasSourceMaterial
      ? "Improve the text for clarity, structure, flow, and correctness while preserving the intended meaning."
      : "Create a fresh text from the available context.";

  return [
    {
      role: "system",
      content: [
        "You are the LemonSpace AI text node.",
        "Write only the final text content.",
        "Do not add explanations, headings, bullet-point rationales, or markdown code fences unless the user explicitly asks for them.",
        "Keep the dominant language of the provided context and instructions.",
        hasSourceMaterial
          ? "If source material is provided, transform or improve it according to the instruction."
          : "If no source material is provided, create a new text from the instruction.",
        "Return JSON that matches the schema exactly.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Task:\n${requestedTask}`,
        inputText
          ? `Text or draft:\n${inputText}`
          : "No source material was provided. Generate the requested text from scratch.",
      ].join("\n\n"),
    },
  ];
}

export function defineFinalizeTextSuccess(register: typeof internalMutation) {
  return register({
  args: {
    nodeId: v.id("nodes"),
    modelId: v.string(),
    instruction: v.optional(v.string()),
    inputText: v.optional(v.string()),
    outputText: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    if (node.type !== "ai-text-output") {
      throw new Error("Node must be an AI text output node");
    }

    const model = getAiTextModel(args.modelId);
    if (!model) {
      throw new Error(`Unknown AI text model: ${args.modelId}`);
    }

    const prev = getNodeDataRecord(node.data);
    await ctx.db.patch(args.nodeId, {
      ...buildNodeDonePatch(),
      data: mergeNodeData(prev, {
        modelId: model.id,
        instruction: args.instruction,
        inputText: args.inputText,
        outputText: args.outputText,
        creditCost: model.creditCost,
        generatedAt: Date.now(),
      }),
    });

    return { creditCost: model.creditCost };
  },
  });
}

export function defineFinalizeTextFailure(register: typeof internalMutation) {
  return register({
  args: {
    nodeId: v.id("nodes"),
    statusMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(
      args.nodeId,
      buildNodeErrorPatch({ retryCount: 0, statusMessage: args.statusMessage }),
    );
  },
  });
}

export function defineProcessTextGeneration(register: typeof internalAction) {
  return register({
  args: {
    outputNodeId: v.id("nodes"),
    modelId: v.string(),
    instruction: v.optional(v.string()),
    inputText: v.optional(v.string()),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not set");
      }

      const result = await generateStructuredObjectViaOpenRouter<{ outputText: string }>(
        apiKey,
        {
          model: args.modelId,
          schemaName: "ai_text_result",
          schema: AI_TEXT_RESULT_SCHEMA,
          messages: buildAiTextMessages({
            instruction: args.instruction,
            inputText: args.inputText,
          }),
        },
      );

      const outputText = trimOptionalText(result.outputText);
      if (!outputText) {
        throw new Error("AI text generation returned an empty result");
      }

      const { creditCost } = await ctx.runMutation(internal.ai.finalizeTextSuccess, {
        nodeId: args.outputNodeId,
        modelId: args.modelId,
        instruction: args.instruction,
        inputText: args.inputText,
        outputText,
      });

      await commitInternalReservationIfNeeded(ctx, args.reservationId, creditCost);
    } catch (error) {
      await releaseInternalReservationBestEffort(ctx, args.reservationId, "ai");

      await ctx.runMutation(internal.ai.finalizeTextFailure, {
        nodeId: args.outputNodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });
    } finally {
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    }
  },
  });
}

export function defineGenerateText(register: typeof action) {
  return register({
  args: {
    canvasId: v.id("canvases"),
    sourceNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    modelId: v.string(),
    instruction: v.optional(v.string()),
    inputText: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ queued: true; outputNodeId: Id<"nodes"> }> => {
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
    if (sourceNode.type !== "ai-text") {
      throw new Error("Source node must be an AI text node");
    }

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
    if (outputNode.type !== "ai-text-output") {
      throw new Error("Output node must be an AI text output node");
    }

    const instruction = trimOptionalText(args.instruction);
    const inputText = trimOptionalText(args.inputText);
    if (!instruction && !inputText) {
      throw new Error("AI text generation needs instructions or input text");
    }

    const selectedModel = getAiTextModel(args.modelId);
    if (!selectedModel) {
      throw new Error(`Unknown AI text model: ${args.modelId}`);
    }

    const subscription = await ctx.runQuery(api.credits.getSubscription, {});
    const userTier = normalizePublicTier(subscription?.tier);
    if (!isAiTextModelAvailableForTier(userTier, selectedModel.id)) {
      throw new Error(`Model ${selectedModel.id} requires ${selectedModel.minTier} tier`);
    }

    const {
      reservationId,
      shouldDecrementConcurrency: usageIncremented,
    } = await startPublicJobCreditFlow(ctx, {
      estimatedCost: selectedModel.creditCost,
      description: `KI-Text - ${selectedModel.label}`,
      model: selectedModel.id,
      nodeId: args.outputNodeId,
      canvasId: args.canvasId,
      provider: "openrouter",
    });

    let scheduled = false;

    try {
      await ctx.runMutation(internal.ai.markNodeExecuting, {
        nodeId: args.outputNodeId,
      });

      await ctx.scheduler.runAfter(0, internal.ai.processTextGeneration, {
        outputNodeId: args.outputNodeId,
        modelId: selectedModel.id,
        instruction,
        inputText,
        reservationId: reservationId ?? undefined,
        shouldDecrementConcurrency: usageIncremented,
        userId: canvas.ownerId,
      });

      scheduled = true;
      return { queued: true, outputNodeId: args.outputNodeId };
    } catch (error) {
      await releasePublicReservationBestEffort(ctx, reservationId, "ai");

      await ctx.runMutation(internal.ai.finalizeTextFailure, {
        nodeId: args.outputNodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });

      throw error;
    } finally {
      await decrementConcurrencyIfNeeded(ctx, usageIncremented && !scheduled, canvas.ownerId);
    }
  },
  });
}
