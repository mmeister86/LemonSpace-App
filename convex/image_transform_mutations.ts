import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { getNodeDataRecord } from "./ai_node_data";

const operationValidator = v.union(
  v.object({ type: v.literal("bg-remove") }),
  v.object({
    type: v.literal("upscale"),
    scale: v.union(v.literal(2), v.literal(4), v.literal(8), v.literal(16)),
    outputFormat: v.union(v.literal("png"), v.literal("jpeg")),
    flavor: v.union(
      v.literal("sublime"),
      v.literal("photo"),
      v.literal("photo_denoiser"),
    ),
    sharpen: v.number(),
    grain: v.number(),
    ultraDetail: v.number(),
  }),
  v.object({
    type: v.literal("style-transfer"),
    styleStrength: v.number(),
    structureStrength: v.number(),
    flavor: v.union(
      v.literal("faithful"),
      v.literal("gen_z"),
      v.literal("psychedelia"),
      v.literal("detaily"),
      v.literal("clear"),
      v.literal("donotstyle"),
      v.literal("donotstyle_sharp"),
    ),
    engine: v.union(
      v.literal("balanced"),
      v.literal("definio"),
      v.literal("illusio"),
      v.literal("3d_cartoon"),
      v.literal("colorful_anime"),
      v.literal("caricature"),
      v.literal("real"),
      v.literal("super_real"),
      v.literal("softy"),
    ),
    fixedGeneration: v.boolean(),
    isPortrait: v.boolean(),
    portraitStyle: v.union(
      v.literal("standard"),
      v.literal("pop"),
      v.literal("super_pop"),
    ),
    portraitBeautifier: v.union(
      v.literal("none"),
      v.literal("beautify_face"),
      v.literal("beautify_face_max"),
    ),
  }),
  v.object({
    type: v.literal("face-restore"),
    mode: v.union(
      v.literal("faithful"),
      v.literal("creative"),
      v.literal("flexible"),
    ),
    preset: v.optional(v.string()),
  }),
);

function computeImageNodeDisplaySize(args: {
  width?: number;
  height?: number;
}): { width: number; height: number } | null {
  if (
    typeof args.width !== "number" ||
    typeof args.height !== "number" ||
    args.width <= 0 ||
    args.height <= 0
  ) {
    return null;
  }

  const aspectRatio = args.width / args.height;
  const previewHeight = Math.max(120, Math.min(320, Math.round(280 / aspectRatio)));
  return {
    width: 280,
    height: previewHeight + 52,
  };
}

export const markTransformExecuting = internalMutation({
  args: {
    transformNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    operation: operationValidator,
  },
  handler: async (ctx, args) => {
    const transformNode = await ctx.db.get(args.transformNodeId);
    const outputNode = await ctx.db.get(args.outputNodeId);
    if (!transformNode || !outputNode) {
      throw new Error("Node not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.transformNodeId, {
      status: "executing",
      statusMessage: undefined,
      data: {
        ...getNodeDataRecord(transformNode.data),
        operation: args.operation.type,
        outputNodeId: args.outputNodeId,
        taskId: undefined,
        lastRunAt: now,
        lastError: undefined,
        parameters: args.operation,
      },
    });
    await ctx.db.patch(args.outputNodeId, {
      status: "executing",
      statusMessage: undefined,
      retryCount: 0,
      data: {
        ...getNodeDataRecord(outputNode.data),
        source: "freepik-transform",
        transform: {
          operation: args.operation.type,
          transformNodeId: args.transformNodeId,
          provider: "freepik",
        },
      },
    });
  },
});

export const setTransformTaskInfo = internalMutation({
  args: {
    transformNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const transformNode = await ctx.db.get(args.transformNodeId);
    const outputNode = await ctx.db.get(args.outputNodeId);
    if (!transformNode || !outputNode) {
      throw new Error("Node not found");
    }

    await ctx.db.patch(args.transformNodeId, {
      data: {
        ...getNodeDataRecord(transformNode.data),
        taskId: args.taskId,
        outputNodeId: args.outputNodeId,
      },
    });
    await ctx.db.patch(args.outputNodeId, {
      data: {
        ...getNodeDataRecord(outputNode.data),
        transform: {
          ...getNodeDataRecord(getNodeDataRecord(outputNode.data).transform),
          taskId: args.taskId,
        },
      },
    });
  },
});

export const markTransformPollingRetry = internalMutation({
  args: {
    transformNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    attempt: v.number(),
    maxAttempts: v.number(),
    failureMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.transformNodeId, {
      retryCount: args.attempt,
      statusMessage: `Provider: retry ${args.attempt}/${args.maxAttempts} (${args.failureMessage})`,
    });
    await ctx.db.patch(args.outputNodeId, {
      retryCount: args.attempt,
      statusMessage: `Provider: retry ${args.attempt}/${args.maxAttempts}`,
    });
  },
});

export const finalizeTransformSuccess = internalMutation({
  args: {
    outputNodeId: v.id("nodes"),
    transformNodeId: v.id("nodes"),
    sourceNodeId: v.id("nodes"),
    operation: operationValidator,
    storageId: v.id("_storage"),
    mimeType: v.string(),
    filename: v.string(),
    taskId: v.optional(v.string()),
    creditCost: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const outputNode = await ctx.db.get(args.outputNodeId);
    const transformNode = await ctx.db.get(args.transformNodeId);
    if (!outputNode || !transformNode) {
      throw new Error("Node not found");
    }
    const displaySize = computeImageNodeDisplaySize({
      width: args.width,
      height: args.height,
    });

    await ctx.db.patch(args.outputNodeId, {
      status: "done",
      retryCount: 0,
      statusMessage: undefined,
      ...(displaySize ?? {}),
      data: {
        ...getNodeDataRecord(outputNode.data),
        storageId: args.storageId,
        mimeType: args.mimeType,
        originalFilename: args.filename,
        ...(args.width !== undefined ? { width: args.width } : {}),
        ...(args.height !== undefined ? { height: args.height } : {}),
        source: "freepik-transform",
        transform: {
          operation: args.operation.type,
          sourceNodeId: args.sourceNodeId,
          transformNodeId: args.transformNodeId,
          provider: "freepik",
          ...(args.taskId ? { taskId: args.taskId } : {}),
        },
        creditCost: args.creditCost,
      },
    });

    await ctx.db.patch(args.transformNodeId, {
      status: "done",
      retryCount: 0,
      statusMessage: undefined,
      data: {
        ...getNodeDataRecord(transformNode.data),
        outputNodeId: args.outputNodeId,
        operation: args.operation.type,
        parameters: args.operation,
        taskId: undefined,
        lastError: undefined,
      },
    });
  },
});

export const finalizeTransformFailure = internalMutation({
  args: {
    transformNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    retryCount: v.number(),
    statusMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const transformNode = await ctx.db.get(args.transformNodeId);
    const outputNode = await ctx.db.get(args.outputNodeId);
    if (!transformNode || !outputNode) {
      throw new Error("Node not found");
    }

    await ctx.db.patch(args.transformNodeId, {
      status: "error",
      retryCount: args.retryCount,
      statusMessage: args.statusMessage,
      data: {
        ...getNodeDataRecord(transformNode.data),
        lastError: args.statusMessage,
        taskId: undefined,
      },
    });
    await ctx.db.patch(args.outputNodeId, {
      status: "error",
      retryCount: args.retryCount,
      statusMessage: args.statusMessage,
    });
  },
});
