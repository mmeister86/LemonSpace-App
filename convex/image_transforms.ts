"use node";

import { v } from "convex/values";
import {
  action,
  type ActionCtx,
  internalAction,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { FunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  createChangeCameraTask,
  createImageTransformTask,
  createSkinEnhancerTask,
  createStyleTransferTaskOrRun,
  downloadImageAsBlob,
  FreepikApiError,
  getImageTransformTaskStatus,
  removeImageBackground,
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
import {
  getImageTransformCreditCost,
  getImageTransformLabel,
  type FaceRestoreMode,
  type ImageTransformOperation,
} from "../lib/image-transform-models";
import { assertNodeBelongsToCanvasOrThrow } from "./authz_helpers";
import {
  commitInternalReservationIfNeeded,
  decrementConcurrencyIfNeeded,
  releaseInternalReservationBestEffort,
  releasePublicReservationBestEffort,
  startPublicJobCreditFlow,
} from "./job_credit_flow";

const MAX_TRANSFORM_POLL_ATTEMPTS = 30;
const MAX_TRANSFORM_POLL_TOTAL_MS = 10 * 60 * 1000;
const TRANSFORM_SOURCE_TYPES = new Set([
  "image",
  "asset",
  "ai-image",
  "render",
  "crop",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
  "bg-remove",
  "upscale",
  "style-transfer",
  "face-restore",
  "change-camera",
]);
const LOCAL_PIPELINE_SOURCE_TYPES = new Set([
  "crop",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);
const TRANSFORM_NODE_TYPES = new Set([
  "bg-remove",
  "upscale",
  "style-transfer",
  "face-restore",
  "change-camera",
]);
const TASK_STATUS_ENDPOINTS = {
  upscale: "/v1/ai/image-upscaler-precision-v2/{task-id}",
  "style-transfer": "/v1/ai/image-style-transfer/{task-id}",
  "face-restore": "/v1/ai/skin-enhancer/{task-id}",
  "change-camera": "/v1/ai/image-change-camera/{task-id}",
} as const;

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
  v.object({
    type: v.literal("change-camera"),
    horizontalAngle: v.number(),
    verticalAngle: v.number(),
    zoom: v.number(),
    outputFormat: v.union(v.literal("png"), v.literal("jpeg")),
    seed: v.optional(v.number()),
  }),
);

type GraphNode = Doc<"nodes"> & { data: unknown };
type GraphEdge = Doc<"edges">;

function getNodeDataUrl(node: GraphNode): string | null {
  const data = getNodeDataRecord(node.data);
  return typeof data.url === "string" && data.url.trim().length > 0
    ? data.url
    : null;
}

function assertTransformOperationMatchesNode(
  transformNode: GraphNode,
  operation: ImageTransformOperation,
) {
  if (transformNode.type !== operation.type) {
    throw new Error("Transform operation must match transform node type");
  }
  if (!TRANSFORM_NODE_TYPES.has(transformNode.type)) {
    throw new Error("Node is not a Freepik transform node");
  }
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getFreepikInvalidParamsForLog(error: unknown): string | undefined {
  if (!(error instanceof FreepikApiError)) return undefined;
  const body = error.body;
  if (body === null || typeof body !== "object") return undefined;
  const invalidParams = (body as { invalid_params?: unknown }).invalid_params;
  if (!Array.isArray(invalidParams)) return undefined;
  try {
    return JSON.stringify(invalidParams);
  } catch {
    return String(invalidParams);
  }
}

function sanitizeOperation(operation: ImageTransformOperation): ImageTransformOperation {
  switch (operation.type) {
    case "upscale":
      return {
        ...operation,
        sharpen: clampPercent(operation.sharpen, 7),
        grain: clampPercent(operation.grain, 7),
        ultraDetail: clampPercent(operation.ultraDetail, 30),
      };
    case "style-transfer":
      return {
        ...operation,
        styleStrength: clampPercent(operation.styleStrength, 100),
        structureStrength: clampPercent(operation.structureStrength, 50),
      };
    case "change-camera":
      return {
        ...operation,
        horizontalAngle: Math.max(0, Math.min(360, Math.round(operation.horizontalAngle))),
        verticalAngle: Math.max(-30, Math.min(90, Math.round(operation.verticalAngle))),
        zoom: Math.max(0, Math.min(10, Math.round(operation.zoom))),
        seed:
          operation.seed !== undefined && Number.isFinite(operation.seed)
            ? Math.max(1, Math.round(operation.seed))
            : undefined,
      };
    case "face-restore":
      return operation;
    case "bg-remove":
      return operation;
  }
}

function normalizeStyleTransferHandle(handle: string | undefined): "image" | "reference" | null {
  if (handle === undefined || handle === "" || handle === "null") {
    return "image";
  }
  if (handle === "image" || handle === "reference") {
    return handle;
  }
  return null;
}

export async function resolveImageSourceNode(args: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  transformNodeId: Id<"nodes">;
  targetHandle?: "image" | "reference";
  visitedNodeIds?: Set<Id<"nodes">>;
}): Promise<GraphNode> {
  const incoming = args.edges.find((edge) => {
    if (edge.targetNodeId !== args.transformNodeId) return false;
    if (!args.targetHandle) return true;
    return normalizeStyleTransferHandle(edge.targetHandle) === args.targetHandle;
  });
  if (!incoming) {
    throw new Error(
      args.targetHandle === "reference"
        ? "Input: Style transfer needs a reference image"
        : "Input: Transform node needs an incoming image source",
    );
  }

  const directSource = args.nodes.find((node) => node._id === incoming.sourceNodeId);
  if (!directSource) {
    throw new Error("Input: Source node not found");
  }

  if (!TRANSFORM_SOURCE_TYPES.has(directSource.type)) {
    throw new Error("Input: Unsupported source node type");
  }

  if (LOCAL_PIPELINE_SOURCE_TYPES.has(directSource.type)) {
    const visitedNodeIds = args.visitedNodeIds ?? new Set<Id<"nodes">>();
    if (visitedNodeIds.has(directSource._id)) {
      throw new Error("Input: Source pipeline contains a cycle");
    }
    visitedNodeIds.add(directSource._id);
    return await resolveImageSourceNode({
      nodes: args.nodes,
      edges: args.edges,
      transformNodeId: directSource._id,
      visitedNodeIds,
    });
  }

  if (!TRANSFORM_NODE_TYPES.has(directSource.type)) {
    return directSource;
  }

  const outputEdge = args.edges.find(
    (edge) => edge.sourceNodeId === directSource._id,
  );
  const outputNode = outputEdge
    ? args.nodes.find((node) => node._id === outputEdge.targetNodeId)
    : undefined;
  if (!outputNode || outputNode.type !== "image") {
    throw new Error("Input: Previous transform has no image output");
  }
  return outputNode;
}

export async function resolveStyleTransferInputNodes(args: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  transformNodeId: Id<"nodes">;
}): Promise<{ sourceNode: GraphNode; referenceNode: GraphNode }> {
  const sourceNode = await resolveImageSourceNode({
    ...args,
    targetHandle: "image",
  });
  const referenceNode = await resolveImageSourceNode({
    ...args,
    targetHandle: "reference",
  });

  return { sourceNode, referenceNode };
}

async function getNodeWithStorageUrl(
  ctx: ActionCtx,
  nodeId: Id<"nodes">,
): Promise<GraphNode> {
  const node = await ctx.runQuery(
    api.nodes.get as FunctionReference<"query", "public">,
    { nodeId, includeStorageUrl: true },
  );
  if (!node) {
    throw new Error("Node not found");
  }
  return node as GraphNode;
}

function getMimeTypeFromBlob(blob: Blob, fallback = "image/png"): string {
  return blob.type || fallback;
}

function getFilenameForOperation(operation: ImageTransformOperation, mimeType: string): string {
  const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  return `${operation.type}-${Date.now()}.${extension}`;
}

export function buildUpscalePayload(args: {
  imageUrl: string;
  scale: number;
  outputFormat: string;
  flavor: string;
  sharpen: number;
  grain: number;
  ultraDetail: number;
}): Record<string, unknown> {
  void args.outputFormat;
  return {
    image: args.imageUrl,
    scale_factor: args.scale,
    flavor: args.flavor,
    sharpen: args.sharpen,
    smart_grain: args.grain,
    ultra_detail: args.ultraDetail,
  };
}

export function buildChangeCameraPayload(args: {
  imageUrl: string;
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  outputFormat: "png" | "jpeg";
  seed?: number;
}): Record<string, unknown> {
  return {
    image: args.imageUrl,
    horizontal_angle: args.horizontalAngle,
    vertical_angle: args.verticalAngle,
    zoom: args.zoom,
    output_format: args.outputFormat,
    ...(args.seed !== undefined ? { seed: args.seed } : {}),
  };
}

function normalizeDimension(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return undefined;
  }
  return Math.round(value);
}

export function resolveTransformOutputDimensions(args: {
  operation: ImageTransformOperation;
  sourceWidth?: number;
  sourceHeight?: number;
}): { width?: number; height?: number } {
  const sourceWidth = normalizeDimension(args.sourceWidth);
  const sourceHeight = normalizeDimension(args.sourceHeight);
  if (!sourceWidth || !sourceHeight) {
    return {};
  }

  if (args.operation.type === "upscale") {
    return {
      width: sourceWidth * args.operation.scale,
      height: sourceHeight * args.operation.scale,
    };
  }

  return {
    width: sourceWidth,
    height: sourceHeight,
  };
}

async function finalizeSuccessfulImage(args: {
  ctx: ActionCtx;
  outputNodeId: Id<"nodes">;
  transformNodeId: Id<"nodes">;
  sourceNodeId: Id<"nodes">;
  operation: ImageTransformOperation;
  resultUrl: string;
  taskId?: string;
  creditCost: number;
  sourceWidth?: number;
  sourceHeight?: number;
  reservationId?: Id<"creditTransactions">;
  shouldDecrementConcurrency: boolean;
  userId: string;
}) {
  const blob = await downloadImageAsBlob(args.resultUrl);
  const storageId = await args.ctx.storage.store(blob);
  const mimeType = getMimeTypeFromBlob(blob);
  const dimensions = resolveTransformOutputDimensions({
    operation: args.operation,
    sourceWidth: args.sourceWidth,
    sourceHeight: args.sourceHeight,
  });

  await args.ctx.runMutation(internal.image_transform_mutations.finalizeTransformSuccess, {
    outputNodeId: args.outputNodeId,
    transformNodeId: args.transformNodeId,
    sourceNodeId: args.sourceNodeId,
    operation: args.operation,
    storageId: storageId as Id<"_storage">,
    mimeType,
    filename: getFilenameForOperation(args.operation, mimeType),
    taskId: args.taskId,
    creditCost: args.creditCost,
    ...(dimensions.width !== undefined ? { width: dimensions.width } : {}),
    ...(dimensions.height !== undefined ? { height: dimensions.height } : {}),
  });

  await commitInternalReservationIfNeeded(args.ctx, args.reservationId, args.creditCost);

  await decrementConcurrencyIfNeeded(
    args.ctx,
    args.shouldDecrementConcurrency,
    args.userId,
  );
}

export const processImageTransform = internalAction({
  args: {
    transformNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    sourceNodeId: v.id("nodes"),
    sourceImageUrl: v.string(),
    sourceWidth: v.optional(v.number()),
    sourceHeight: v.optional(v.number()),
    styleReferenceImageUrl: v.optional(v.string()),
    operation: operationValidator,
    creditCost: v.number(),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      if (args.operation.type === "bg-remove") {
        const result = await removeImageBackground({
          imageUrl: args.sourceImageUrl,
        });
        await finalizeSuccessfulImage({
          ctx,
          outputNodeId: args.outputNodeId,
          transformNodeId: args.transformNodeId,
          sourceNodeId: args.sourceNodeId,
          operation: args.operation,
          resultUrl: result.url,
          creditCost: args.creditCost,
          sourceWidth: args.sourceWidth,
          sourceHeight: args.sourceHeight,
          reservationId: args.reservationId,
          shouldDecrementConcurrency: args.shouldDecrementConcurrency,
          userId: args.userId,
        });
        return;
      }

      if (args.operation.type === "style-transfer") {
        const result = await createStyleTransferTaskOrRun({
          imageUrl: args.sourceImageUrl,
          styleReferenceUrl: args.styleReferenceImageUrl,
          styleStrength: args.operation.styleStrength,
          structureStrength: args.operation.structureStrength,
          flavor: args.operation.flavor,
          engine: args.operation.engine,
          fixedGeneration: args.operation.fixedGeneration,
          isPortrait: args.operation.isPortrait,
          portraitStyle: args.operation.portraitStyle,
          portraitBeautifier: args.operation.portraitBeautifier,
        });
        if ("url" in result) {
          await finalizeSuccessfulImage({
            ctx,
            outputNodeId: args.outputNodeId,
            transformNodeId: args.transformNodeId,
            sourceNodeId: args.sourceNodeId,
            operation: args.operation,
            resultUrl: result.url,
            creditCost: args.creditCost,
            sourceWidth: args.sourceWidth,
            sourceHeight: args.sourceHeight,
            reservationId: args.reservationId,
            shouldDecrementConcurrency: args.shouldDecrementConcurrency,
            userId: args.userId,
          });
          return;
        }
        await ctx.runMutation(internal.image_transform_mutations.setTransformTaskInfo, {
          transformNodeId: args.transformNodeId,
          outputNodeId: args.outputNodeId,
          taskId: result.task_id,
        });
        await ctx.scheduler.runAfter(
          getProviderPollDelayMs(1),
          internal.image_transforms.pollImageTransformTask,
          {
            ...args,
            taskId: result.task_id,
            statusEndpointPath: TASK_STATUS_ENDPOINTS["style-transfer"],
            attempt: 1,
            startedAtMs: Date.now(),
          },
        );
        return;
      }

      const task =
        args.operation.type === "upscale"
          ? await createImageTransformTask({
              endpoint: "/v1/ai/image-upscaler-precision-v2",
              payload: buildUpscalePayload({
                imageUrl: args.sourceImageUrl,
                scale: args.operation.scale,
                outputFormat: args.operation.outputFormat,
                flavor: args.operation.flavor,
                sharpen: args.operation.sharpen,
                grain: args.operation.grain,
                ultraDetail: args.operation.ultraDetail,
              }),
            })
          : args.operation.type === "change-camera"
            ? await createChangeCameraTask({
                imageUrl: args.sourceImageUrl,
                horizontalAngle: args.operation.horizontalAngle,
                verticalAngle: args.operation.verticalAngle,
                zoom: args.operation.zoom,
                outputFormat: args.operation.outputFormat,
                seed: args.operation.seed,
              })
          : await createSkinEnhancerTask({
              mode: args.operation.mode as FaceRestoreMode,
              imageUrl: args.sourceImageUrl,
              ...(args.operation.preset ? { options: { preset: args.operation.preset } } : {}),
            });

      await ctx.runMutation(internal.image_transform_mutations.setTransformTaskInfo, {
        transformNodeId: args.transformNodeId,
        outputNodeId: args.outputNodeId,
        taskId: task.task_id,
      });

      await ctx.scheduler.runAfter(
          getProviderPollDelayMs(1),
        internal.image_transforms.pollImageTransformTask,
        {
          ...args,
          taskId: task.task_id,
          statusEndpointPath:
            args.operation.type === "upscale"
              ? TASK_STATUS_ENDPOINTS.upscale
              : args.operation.type === "change-camera"
                ? TASK_STATUS_ENDPOINTS["change-camera"]
              : TASK_STATUS_ENDPOINTS["face-restore"],
          attempt: 1,
          startedAtMs: Date.now(),
        },
      );
    } catch (error) {
      console.warn("[processImageTransform] failed", {
        transformNodeId: args.transformNodeId,
        outputNodeId: args.outputNodeId,
        operation: args.operation.type,
        errorMessage: errorMessage(error),
        errorCode: getErrorCode(error) ?? null,
        source: getErrorSource(error) ?? null,
        providerStatus: getProviderStatus(error),
        freepikBody: error instanceof FreepikApiError ? error.body : undefined,
        freepikInvalidParams: getFreepikInvalidParamsForLog(error),
      });

      await releaseInternalReservationBestEffort(ctx, args.reservationId);
      await ctx.runMutation(internal.image_transform_mutations.finalizeTransformFailure, {
        transformNodeId: args.transformNodeId,
        outputNodeId: args.outputNodeId,
        retryCount: 0,
        statusMessage: formatTerminalStatusMessage(error),
      });
      await decrementConcurrencyIfNeeded(
        ctx,
        args.shouldDecrementConcurrency,
        args.userId,
      );
    }
  },
});

export const pollImageTransformTask = internalAction({
  args: {
    transformNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    sourceNodeId: v.id("nodes"),
    sourceImageUrl: v.string(),
    sourceWidth: v.optional(v.number()),
    sourceHeight: v.optional(v.number()),
    styleReferenceImageUrl: v.optional(v.string()),
    operation: operationValidator,
    creditCost: v.number(),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
    userId: v.string(),
    taskId: v.string(),
    statusEndpointPath: v.string(),
    attempt: v.number(),
    startedAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const elapsedMs = Date.now() - args.startedAtMs;
    if (
      isProviderPollTimedOut({
        attempt: args.attempt,
        maxAttempts: MAX_TRANSFORM_POLL_ATTEMPTS,
        elapsedMs,
        maxTotalMs: MAX_TRANSFORM_POLL_TOTAL_MS,
      })
    ) {
      await releaseInternalReservationBestEffort(ctx, args.reservationId);
      await ctx.runMutation(internal.image_transform_mutations.finalizeTransformFailure, {
        transformNodeId: args.transformNodeId,
        outputNodeId: args.outputNodeId,
        retryCount: args.attempt,
          statusMessage: buildProviderPollTimeoutMessage("Image transform"),
      });
      await decrementConcurrencyIfNeeded(
        ctx,
        args.shouldDecrementConcurrency,
        args.userId,
      );
      return;
    }

    try {
      const status = await getImageTransformTaskStatus({
        taskId: args.taskId,
        statusEndpointPath: args.statusEndpointPath,
      });

      if (status.status === "FAILED") {
        await releaseInternalReservationBestEffort(ctx, args.reservationId);
        await ctx.runMutation(internal.image_transform_mutations.finalizeTransformFailure, {
          transformNodeId: args.transformNodeId,
          outputNodeId: args.outputNodeId,
          retryCount: args.attempt,
          statusMessage: getProviderTerminalFailureMessage({
            providerError: status.error,
            fallback: "Provider: Image transform failed",
          }),
        });
        await decrementConcurrencyIfNeeded(
          ctx,
          args.shouldDecrementConcurrency,
          args.userId,
        );
        return;
      }

      if (status.status === "COMPLETED") {
        const generatedUrl = status.generated?.[0]?.url;
        if (!generatedUrl) {
          throw new Error("Freepik completed without generated image URL");
        }
        await finalizeSuccessfulImage({
          ctx,
          outputNodeId: args.outputNodeId,
          transformNodeId: args.transformNodeId,
          sourceNodeId: args.sourceNodeId,
          operation: args.operation,
          resultUrl: generatedUrl,
          taskId: args.taskId,
          creditCost: args.creditCost,
          sourceWidth: args.sourceWidth,
          sourceHeight: args.sourceHeight,
          reservationId: args.reservationId,
          shouldDecrementConcurrency: args.shouldDecrementConcurrency,
          userId: args.userId,
        });
        return;
      }
    } catch (error) {
      if (
        shouldRetryProviderPollError({
          error,
          attempt: args.attempt,
          maxAttempts: MAX_TRANSFORM_POLL_ATTEMPTS,
        })
      ) {
        await ctx.runMutation(internal.image_transform_mutations.markTransformPollingRetry, {
          transformNodeId: args.transformNodeId,
          outputNodeId: args.outputNodeId,
          attempt: args.attempt,
          maxAttempts: MAX_TRANSFORM_POLL_ATTEMPTS,
          failureMessage: errorMessage(error),
        });
        const schedule = buildNextProviderPollSchedule(args);
        await ctx.scheduler.runAfter(
          schedule.delayMs,
          internal.image_transforms.pollImageTransformTask,
          schedule.args,
        );
        return;
      }

      await releaseInternalReservationBestEffort(ctx, args.reservationId);
      await ctx.runMutation(internal.image_transform_mutations.finalizeTransformFailure, {
        transformNodeId: args.transformNodeId,
        outputNodeId: args.outputNodeId,
        retryCount: args.attempt,
        statusMessage: formatTerminalStatusMessage(error),
      });
      await decrementConcurrencyIfNeeded(
        ctx,
        args.shouldDecrementConcurrency,
        args.userId,
      );
      return;
    }

    const schedule = buildNextProviderPollSchedule(args);
    await ctx.scheduler.runAfter(
      schedule.delayMs,
      internal.image_transforms.pollImageTransformTask,
      schedule.args,
    );
  },
});

export const generateTransform = action({
  args: {
    canvasId: v.id("canvases"),
    transformNodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    operation: operationValidator,
  },
  handler: async (ctx, args): Promise<{ queued: true; outputNodeId: Id<"nodes"> }> => {
    const operation = sanitizeOperation(args.operation as ImageTransformOperation);
    const canvas = await ctx.runQuery(api.canvases.get, {
      canvasId: args.canvasId,
    });
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    const transformNode = await ctx.runQuery(
      api.nodes.get as FunctionReference<"query", "public">,
      { nodeId: args.transformNodeId, includeStorageUrl: false },
    ) as GraphNode | null;
    if (!transformNode) {
      throw new Error("Transform node not found");
    }
    assertNodeBelongsToCanvasOrThrow(transformNode, args.canvasId);
    assertTransformOperationMatchesNode(transformNode, operation);

    const outputNode = await ctx.runQuery(
      api.nodes.get as FunctionReference<"query", "public">,
      { nodeId: args.outputNodeId, includeStorageUrl: false },
    ) as GraphNode | null;
    if (!outputNode) {
      throw new Error("Output node not found");
    }
    assertNodeBelongsToCanvasOrThrow(outputNode, args.canvasId);
    if (outputNode.type !== "image") {
      throw new Error("Output node must be image");
    }

    const graph = await ctx.runQuery(api.canvasGraph.get, {
      canvasId: args.canvasId,
    }) as { nodes: GraphNode[]; edges: GraphEdge[] };
    const styleTransferInputs =
      operation.type === "style-transfer"
        ? await resolveStyleTransferInputNodes({
            nodes: graph.nodes,
            edges: graph.edges,
            transformNodeId: args.transformNodeId,
          })
        : null;
    const sourceNodeRef =
      styleTransferInputs?.sourceNode ??
      (await resolveImageSourceNode({
          nodes: graph.nodes,
          edges: graph.edges,
          transformNodeId: args.transformNodeId,
        }));
    const sourceNode = await getNodeWithStorageUrl(ctx, sourceNodeRef._id);
    const sourceImageUrl = getNodeDataUrl(sourceNode);
    if (!sourceImageUrl) {
      throw new Error("Input: Source image URL is unavailable");
    }
    const sourceData = getNodeDataRecord(sourceNode.data);
    const sourceWidth =
      typeof sourceData.width === "number" ? sourceData.width : undefined;
    const sourceHeight =
      typeof sourceData.height === "number" ? sourceData.height : undefined;

    let styleReferenceImageUrl: string | undefined;
    if (operation.type === "style-transfer") {
      if (!styleTransferInputs) {
        throw new Error("Input: Style transfer needs a reference image");
      }
      const styleReferenceNode = await getNodeWithStorageUrl(
        ctx,
        styleTransferInputs.referenceNode._id,
      );
      styleReferenceImageUrl = getNodeDataUrl(styleReferenceNode) ?? undefined;
      if (!styleReferenceImageUrl) {
        throw new Error("Input: Style reference image URL is unavailable");
      }
    }

    const creditCost = getImageTransformCreditCost(operation);
    const {
      reservationId,
      shouldDecrementConcurrency: usageIncremented,
    } = await startPublicJobCreditFlow(ctx, {
      estimatedCost: creditCost,
      description: `${getImageTransformLabel(operation.type)} - Freepik`,
      model: operation.type,
      nodeId: args.outputNodeId,
      canvasId: args.canvasId,
      provider: "freepik",
    });

    let backgroundJobScheduled = false;
    try {
      await ctx.runMutation(internal.image_transform_mutations.markTransformExecuting, {
        transformNodeId: args.transformNodeId,
        outputNodeId: args.outputNodeId,
        operation,
      });

      await ctx.scheduler.runAfter(0, internal.image_transforms.processImageTransform, {
        transformNodeId: args.transformNodeId,
        outputNodeId: args.outputNodeId,
        sourceNodeId: sourceNodeRef._id,
        sourceImageUrl,
        sourceWidth,
        sourceHeight,
        styleReferenceImageUrl,
        operation,
        creditCost,
        reservationId: reservationId ?? undefined,
        shouldDecrementConcurrency: usageIncremented,
        userId: canvas.ownerId,
      });
      backgroundJobScheduled = true;
      return { queued: true, outputNodeId: args.outputNodeId };
    } catch (error) {
      await releasePublicReservationBestEffort(ctx, reservationId, "image_transforms");
      await ctx.runMutation(internal.image_transform_mutations.finalizeTransformFailure, {
        transformNodeId: args.transformNodeId,
        outputNodeId: args.outputNodeId,
        retryCount: 0,
        statusMessage: formatTerminalStatusMessage(error),
      });
      throw error;
    } finally {
      await decrementConcurrencyIfNeeded(
        ctx,
        usageIncremented && !backgroundJobScheduled,
        canvas.ownerId,
      );
    }
  },
});
