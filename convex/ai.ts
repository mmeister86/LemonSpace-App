import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import {
  generateImageViaOpenRouter,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
} from "./openrouter";

export const generateImage = action({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    prompt: v.string(),
    referenceStorageId: v.optional(v.id("_storage")),
    model: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const modelId = args.model ?? DEFAULT_IMAGE_MODEL;
    const modelConfig = IMAGE_MODELS[modelId];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    if (!(await ctx.runQuery(api.auth.getCurrentUser, {}))) {
      throw new Error("User not found");
    }

    const reservationId = await ctx.runMutation(api.credits.reserve, {
      estimatedCost: modelConfig.estimatedCostPerImage,
      description: `Bildgenerierung — ${modelConfig.name}`,
      model: modelId,
      nodeId: args.nodeId,
      canvasId: args.canvasId,
    });

    await ctx.runMutation(api.nodes.updateStatus, {
      nodeId: args.nodeId,
      status: "executing",
    });

    try {
      let referenceImageUrl: string | undefined;
      if (args.referenceStorageId) {
        referenceImageUrl =
          (await ctx.storage.getUrl(args.referenceStorageId)) ?? undefined;
      }

      const result = await generateImageViaOpenRouter(apiKey, {
        prompt: args.prompt,
        referenceImageUrl,
        model: modelId,
        aspectRatio: args.aspectRatio,
      });

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
      const creditCost = modelConfig.estimatedCostPerImage;

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
          modelTier: modelConfig.tier,
          generatedAt: Date.now(),
          creditCost,
          ...(aspectRatio ? { aspectRatio } : {}),
        },
      });

      await ctx.runMutation(api.nodes.updateStatus, {
        nodeId: args.nodeId,
        status: "done",
      });

      await ctx.runMutation(api.credits.commit, {
        transactionId: reservationId,
        actualCost: creditCost,
      });
    } catch (error) {
      await ctx.runMutation(api.credits.release, {
        transactionId: reservationId,
      });

      await ctx.runMutation(api.nodes.updateStatus, {
        nodeId: args.nodeId,
        status: "error",
        statusMessage:
          error instanceof Error ? error.message : "Generation failed",
      });

      throw error;
    }
  },
});
