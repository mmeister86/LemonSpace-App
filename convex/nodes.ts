import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Doc, Id } from "./_generated/dataModel";
import { isAdjustmentNodeType } from "../lib/canvas-node-types";
import { nodeTypeValidator } from "./node_type_validator";

// ============================================================================
// Interne Helpers
// ============================================================================

/**
 * Prüft ob der User Zugriff auf den Canvas hat und gibt ihn zurück.
 */
async function getCanvasOrThrow(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
  userId: string
) {
  const canvas = await ctx.db.get(canvasId);
  if (!canvas || canvas.ownerId !== userId) {
    throw new Error("Canvas not found");
  }
  return canvas;
}

async function getCanvasIfAuthorized(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
  userId: string
) {
  const canvas = await ctx.db.get(canvasId);
  if (!canvas || canvas.ownerId !== userId) {
    return null;
  }
  return canvas;
}

type NodeCreateMutationName =
  | "nodes.create"
  | "nodes.createWithEdgeSplit"
  | "nodes.createWithEdgeFromSource"
  | "nodes.createWithEdgeToTarget";

const DISALLOWED_ADJUSTMENT_DATA_KEYS = [
  "blob",
  "blobUrl",
  "imageData",
] as const;

const DISALLOWED_NON_RENDER_ADJUSTMENT_DATA_KEYS = [
  "storageId",
  "url",
] as const;

const RENDER_OUTPUT_RESOLUTIONS = ["original", "2x", "custom"] as const;
const RENDER_FORMATS = ["png", "jpeg", "webp"] as const;
const CUSTOM_RENDER_DIMENSION_MIN = 1;
const CUSTOM_RENDER_DIMENSION_MAX = 16384;
const DEFAULT_RENDER_OUTPUT_RESOLUTION = "original" as const;
const DEFAULT_RENDER_FORMAT = "png" as const;
const DEFAULT_RENDER_JPEG_QUALITY = 90;
const ADJUSTMENT_MIN_WIDTH = 240;

type RenderOutputResolution = (typeof RENDER_OUTPUT_RESOLUTIONS)[number];
type RenderFormat = (typeof RENDER_FORMATS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoAdjustmentImagePayload(
  nodeType: Doc<"nodes">["type"],
  data: unknown,
): void {
  if (!isAdjustmentNodeType(nodeType) || !isRecord(data)) {
    return;
  }

  for (const key of DISALLOWED_ADJUSTMENT_DATA_KEYS) {
    if (key in data) {
      throw new Error(
        `Adjustment nodes accept parameter data only. '${key}' is not allowed in data.`,
      );
    }
  }

  if (nodeType === "render") {
    return;
  }

  for (const key of DISALLOWED_NON_RENDER_ADJUSTMENT_DATA_KEYS) {
    if (key in data) {
      throw new Error(
        `Adjustment nodes '${nodeType}' do not allow '${key}' in data.`,
      );
    }
  }
}

function parseRenderOutputResolution(value: unknown): RenderOutputResolution {
  if (value === undefined) {
    return DEFAULT_RENDER_OUTPUT_RESOLUTION;
  }
  if (
    typeof value !== "string" ||
    !RENDER_OUTPUT_RESOLUTIONS.includes(value as RenderOutputResolution)
  ) {
    throw new Error("Render data 'outputResolution' must be one of: original, 2x, custom.");
  }
  return value as RenderOutputResolution;
}

function parseRenderCustomDimension(fieldName: "customWidth" | "customHeight", value: unknown): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < CUSTOM_RENDER_DIMENSION_MIN ||
    (value as number) > CUSTOM_RENDER_DIMENSION_MAX
  ) {
    throw new Error(
      `Render data '${fieldName}' must be an integer between ${CUSTOM_RENDER_DIMENSION_MIN} and ${CUSTOM_RENDER_DIMENSION_MAX}.`,
    );
  }
  return value as number;
}

function parseRenderFormat(value: unknown): RenderFormat {
  if (value === undefined) {
    return DEFAULT_RENDER_FORMAT;
  }
  if (typeof value !== "string" || !RENDER_FORMATS.includes(value as RenderFormat)) {
    throw new Error("Render data 'format' must be one of: png, jpeg, webp.");
  }
  return value as RenderFormat;
}

function parseRenderJpegQuality(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_RENDER_JPEG_QUALITY;
  }
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw new Error("Render data 'jpegQuality' must be an integer between 1 and 100.");
  }
  return value as number;
}

function parseOptionalPositiveInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Render data '${fieldName}' must be a positive integer.`);
  }
  return value as number;
}

function parseOptionalNonNegativeInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Render data '${fieldName}' must be a non-negative integer.`);
  }
  return value as number;
}

function normalizeRenderData(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) {
    throw new Error("Render node data must be an object.");
  }

  assertNoAdjustmentImagePayload("render", data);

  const outputResolution = parseRenderOutputResolution(data.outputResolution);

  const normalized: Record<string, unknown> = {
    outputResolution,
    format: parseRenderFormat(data.format),
    jpegQuality: parseRenderJpegQuality(data.jpegQuality),
  };

  if (outputResolution === "custom") {
    if (data.customWidth !== undefined) {
      normalized.customWidth = parseRenderCustomDimension("customWidth", data.customWidth);
    }
    if (data.customHeight !== undefined) {
      normalized.customHeight = parseRenderCustomDimension("customHeight", data.customHeight);
    }
  }

  if (data.lastRenderedAt !== undefined) {
    if (typeof data.lastRenderedAt !== "number" || !Number.isFinite(data.lastRenderedAt)) {
      throw new Error("Render data 'lastRenderedAt' must be a finite number.");
    }
    normalized.lastRenderedAt = data.lastRenderedAt;
  }

  if (data.lastRenderedHash !== undefined) {
    if (typeof data.lastRenderedHash !== "string" || data.lastRenderedHash.length === 0) {
      throw new Error("Render data 'lastRenderedHash' must be a non-empty string when provided.");
    }
    normalized.lastRenderedHash = data.lastRenderedHash;
  }

  if (data.lastRenderWidth !== undefined) {
    normalized.lastRenderWidth = parseOptionalPositiveInteger("lastRenderWidth", data.lastRenderWidth);
  }

  if (data.lastRenderHeight !== undefined) {
    normalized.lastRenderHeight = parseOptionalPositiveInteger("lastRenderHeight", data.lastRenderHeight);
  }

  if (data.lastRenderFormat !== undefined) {
    normalized.lastRenderFormat = parseRenderFormat(data.lastRenderFormat);
  }

  if (data.lastRenderMimeType !== undefined) {
    if (typeof data.lastRenderMimeType !== "string" || data.lastRenderMimeType.length === 0) {
      throw new Error("Render data 'lastRenderMimeType' must be a non-empty string when provided.");
    }
    normalized.lastRenderMimeType = data.lastRenderMimeType;
  }

  if (data.lastRenderSizeBytes !== undefined) {
    normalized.lastRenderSizeBytes = parseOptionalNonNegativeInteger(
      "lastRenderSizeBytes",
      data.lastRenderSizeBytes,
    );
  }

  if (data.lastRenderQuality !== undefined) {
    if (data.lastRenderQuality !== null) {
      if (
        typeof data.lastRenderQuality !== "number" ||
        !Number.isFinite(data.lastRenderQuality) ||
        data.lastRenderQuality < 0 ||
        data.lastRenderQuality > 1
      ) {
        throw new Error("Render data 'lastRenderQuality' must be null or a number between 0 and 1.");
      }
    }
    normalized.lastRenderQuality = data.lastRenderQuality;
  }

  if (data.lastRenderSourceWidth !== undefined) {
    normalized.lastRenderSourceWidth = parseOptionalPositiveInteger(
      "lastRenderSourceWidth",
      data.lastRenderSourceWidth,
    );
  }

  if (data.lastRenderSourceHeight !== undefined) {
    normalized.lastRenderSourceHeight = parseOptionalPositiveInteger(
      "lastRenderSourceHeight",
      data.lastRenderSourceHeight,
    );
  }

  if (data.lastRenderWasSizeClamped !== undefined) {
    if (typeof data.lastRenderWasSizeClamped !== "boolean") {
      throw new Error("Render data 'lastRenderWasSizeClamped' must be a boolean when provided.");
    }
    normalized.lastRenderWasSizeClamped = data.lastRenderWasSizeClamped;
  }

  if (data.lastRenderError !== undefined) {
    if (typeof data.lastRenderError !== "string" || data.lastRenderError.length === 0) {
      throw new Error("Render data 'lastRenderError' must be a non-empty string when provided.");
    }
    normalized.lastRenderError = data.lastRenderError;
  }

  if (data.lastRenderErrorHash !== undefined) {
    if (typeof data.lastRenderErrorHash !== "string" || data.lastRenderErrorHash.length === 0) {
      throw new Error("Render data 'lastRenderErrorHash' must be a non-empty string when provided.");
    }
    normalized.lastRenderErrorHash = data.lastRenderErrorHash;
  }

  if (data.lastUploadedAt !== undefined) {
    if (typeof data.lastUploadedAt !== "number" || !Number.isFinite(data.lastUploadedAt)) {
      throw new Error("Render data 'lastUploadedAt' must be a finite number.");
    }
    normalized.lastUploadedAt = data.lastUploadedAt;
  }

  if (data.lastUploadedHash !== undefined) {
    if (typeof data.lastUploadedHash !== "string" || data.lastUploadedHash.length === 0) {
      throw new Error("Render data 'lastUploadedHash' must be a non-empty string when provided.");
    }
    normalized.lastUploadedHash = data.lastUploadedHash;
  }

  if (data.lastUploadStorageId !== undefined) {
    if (typeof data.lastUploadStorageId !== "string" || data.lastUploadStorageId.length === 0) {
      throw new Error("Render data 'lastUploadStorageId' must be a non-empty string when provided.");
    }
    normalized.lastUploadStorageId = data.lastUploadStorageId;
  }

  if (data.lastUploadUrl !== undefined) {
    if (typeof data.lastUploadUrl !== "string" || data.lastUploadUrl.length === 0) {
      throw new Error("Render data 'lastUploadUrl' must be a non-empty string when provided.");
    }
    normalized.lastUploadUrl = data.lastUploadUrl;
  }

  if (data.lastUploadMimeType !== undefined) {
    if (typeof data.lastUploadMimeType !== "string" || data.lastUploadMimeType.length === 0) {
      throw new Error("Render data 'lastUploadMimeType' must be a non-empty string when provided.");
    }
    normalized.lastUploadMimeType = data.lastUploadMimeType;
  }

  if (data.lastUploadSizeBytes !== undefined) {
    normalized.lastUploadSizeBytes = parseOptionalNonNegativeInteger(
      "lastUploadSizeBytes",
      data.lastUploadSizeBytes,
    );
  }

  if (data.lastUploadFilename !== undefined) {
    if (typeof data.lastUploadFilename !== "string" || data.lastUploadFilename.length === 0) {
      throw new Error("Render data 'lastUploadFilename' must be a non-empty string when provided.");
    }
    normalized.lastUploadFilename = data.lastUploadFilename;
  }

  if (data.lastUploadError !== undefined) {
    if (typeof data.lastUploadError !== "string" || data.lastUploadError.length === 0) {
      throw new Error("Render data 'lastUploadError' must be a non-empty string when provided.");
    }
    normalized.lastUploadError = data.lastUploadError;
  }

  if (data.lastUploadErrorHash !== undefined) {
    if (typeof data.lastUploadErrorHash !== "string" || data.lastUploadErrorHash.length === 0) {
      throw new Error("Render data 'lastUploadErrorHash' must be a non-empty string when provided.");
    }
    normalized.lastUploadErrorHash = data.lastUploadErrorHash;
  }

  if (data.storageId !== undefined) {
    if (typeof data.storageId !== "string" || data.storageId.length === 0) {
      throw new Error("Render data 'storageId' must be a non-empty string when provided.");
    }
    normalized.storageId = data.storageId;
  }

  if (data.url !== undefined) {
    if (typeof data.url !== "string" || data.url.length === 0) {
      throw new Error("Render data 'url' must be a non-empty string when provided.");
    }
    normalized.url = data.url;
  }

  return normalized;
}

function normalizeNodeDataForWrite(
  nodeType: Doc<"nodes">["type"],
  data: unknown,
): unknown {
  if (!isAdjustmentNodeType(nodeType)) {
    return data;
  }

  if (!isRecord(data)) {
    throw new Error(`Adjustment node '${nodeType}' data must be an object.`);
  }

  if (nodeType === "render") {
    return normalizeRenderData(data);
  }

  assertNoAdjustmentImagePayload(nodeType, data);
  return data;
}

async function assertTargetAllowsIncomingEdge(
  ctx: MutationCtx,
  args: {
    targetNodeId: Id<"nodes">;
    edgeIdToIgnore?: Id<"edges">;
  },
): Promise<void> {
  const targetNode = await ctx.db.get(args.targetNodeId);
  if (!targetNode) {
    throw new Error("Target node not found");
  }

  if (!isAdjustmentNodeType(targetNode.type)) {
    return;
  }

  const incomingEdges = await ctx.db
    .query("edges")
    .withIndex("by_target", (q) => q.eq("targetNodeId", args.targetNodeId))
    .collect();
  const existingIncoming = incomingEdges.filter((edge) => edge._id !== args.edgeIdToIgnore);
  if (existingIncoming.length >= 1) {
    throw new Error("Adjustment nodes allow only one incoming edge.");
  }
}

async function getIdempotentNodeCreateResult(
  ctx: MutationCtx,
  args: {
    userId: string;
    mutation: NodeCreateMutationName;
    clientRequestId?: string;
    canvasId: Id<"canvases">;
  },
): Promise<Id<"nodes"> | null> {
  const clientRequestId = args.clientRequestId;
  if (!clientRequestId) return null;

  const existing = await ctx.db
    .query("mutationRequests")
    .withIndex("by_user_mutation_request", (q) =>
      q
        .eq("userId", args.userId)
        .eq("mutation", args.mutation)
        .eq("clientRequestId", clientRequestId),
    )
    .first();

  if (!existing) return null;
  if (existing.canvasId && existing.canvasId !== args.canvasId) {
    throw new Error("Client request conflict");
  }
  if (!existing.nodeId) return null;
  return existing.nodeId;
}

async function rememberIdempotentNodeCreateResult(
  ctx: MutationCtx,
  args: {
    userId: string;
    mutation: NodeCreateMutationName;
    clientRequestId?: string;
    canvasId: Id<"canvases">;
    nodeId: Id<"nodes">;
  },
): Promise<void> {
  if (!args.clientRequestId) return;
  await ctx.db.insert("mutationRequests", {
    userId: args.userId,
    mutation: args.mutation,
    clientRequestId: args.clientRequestId,
    canvasId: args.canvasId,
    nodeId: args.nodeId,
    createdAt: Date.now(),
  });
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Alle Nodes eines Canvas laden.
 */
export const list = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, canvasId, user.userId);

    return await ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
  },
});

/**
 * Einzelnen Node laden.
 */
export const get = query({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) return null;

    const canvas = await getCanvasIfAuthorized(ctx, node.canvasId, user.userId);
    if (!canvas) {
      return null;
    }

  const data = node.data as Record<string, unknown> | undefined;
  if (!data?.storageId) {
    return node;
  }

  let url: string | null;
  try {
    url = await ctx.storage.getUrl(data.storageId as Id<"_storage">);
  } catch (error) {
    console.warn("[nodes.get] failed to resolve storage URL", {
      nodeId: node._id,
      storageId: data.storageId,
      error: String(error),
    });
    return node;
  }

  return {
    ...node,
    data: {
      ...data,
        url: url ?? undefined,
      },
    };
  },
});

/**
 * Nodes nach Typ filtern (z.B. alle ai-image Nodes eines Canvas).
 */
export const listByType = query({
  args: {
    canvasId: v.id("canvases"),
    type: nodeTypeValidator,
  },
  handler: async (ctx, { canvasId, type }) => {
    const user = await requireAuth(ctx);
    const canvas = await getCanvasIfAuthorized(ctx, canvasId, user.userId);
    if (!canvas) {
      return [];
    }

    return await ctx.db
      .query("nodes")
      .withIndex("by_canvas_type", (q) =>
        q.eq("canvasId", canvasId).eq("type", type as Doc<"nodes">["type"])
      )
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Neuen Node auf dem Canvas erstellen.
 */
export const create = mutation({
  args: {
    canvasId: v.id("canvases"),
    type: nodeTypeValidator,
    positionX: v.number(),
    positionY: v.number(),
    width: v.number(),
    height: v.number(),
    data: v.any(),
    parentId: v.optional(v.id("nodes")),
    zIndex: v.optional(v.number()),
    /** Client-only correlation for optimistic UI (not persisted). */
    clientRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, args.canvasId, user.userId);

    const existingNodeId = await getIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.create",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
    });
    if (existingNodeId) {
      return existingNodeId;
    }

    const normalizedData = normalizeNodeDataForWrite(args.type, args.data);

    const nodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: normalizedData,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    // Canvas updatedAt aktualisieren
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
    await rememberIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.create",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
      nodeId,
    });

    return nodeId;
  },
});

/**
 * Neuen Node erzeugen und eine bestehende Kante in zwei Kanten aufteilen (ein Roundtrip).
 */
export const createWithEdgeSplit = mutation({
  args: {
    canvasId: v.id("canvases"),
    type: nodeTypeValidator,
    positionX: v.number(),
    positionY: v.number(),
    width: v.number(),
    height: v.number(),
    data: v.any(),
    parentId: v.optional(v.id("nodes")),
    zIndex: v.optional(v.number()),
    splitEdgeId: v.id("edges"),
    newNodeTargetHandle: v.optional(v.string()),
    newNodeSourceHandle: v.optional(v.string()),
    splitSourceHandle: v.optional(v.string()),
    splitTargetHandle: v.optional(v.string()),
    clientRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, args.canvasId, user.userId);

    const existingNodeId = await getIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createWithEdgeSplit",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
    });
    if (existingNodeId) {
      return existingNodeId;
    }

    const edge = await ctx.db.get(args.splitEdgeId);
    if (!edge || edge.canvasId !== args.canvasId) {
      throw new Error("Edge not found");
    }

    const normalizedData = normalizeNodeDataForWrite(args.type, args.data);

    const nodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: normalizedData,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: nodeId,
      sourceHandle: args.splitSourceHandle,
      targetHandle: args.newNodeTargetHandle,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: nodeId,
      targetNodeId: edge.targetNodeId,
      sourceHandle: args.newNodeSourceHandle,
      targetHandle: args.splitTargetHandle,
    });

    await ctx.db.delete(args.splitEdgeId);
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
    await rememberIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createWithEdgeSplit",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
      nodeId,
    });

    return nodeId;
  },
});

/**
 * Bestehenden Knoten in eine Kante einhängen: alte Kante löschen, zwei neue anlegen.
 * Optional positionX/Y: Mitte-Knoten in derselben Transaktion verschieben (ein Roundtrip mit Drag-Ende).
 */
export const splitEdgeAtExistingNode = mutation({
  args: {
    canvasId: v.id("canvases"),
    splitEdgeId: v.id("edges"),
    middleNodeId: v.id("nodes"),
    splitSourceHandle: v.optional(v.string()),
    splitTargetHandle: v.optional(v.string()),
    newNodeSourceHandle: v.optional(v.string()),
    newNodeTargetHandle: v.optional(v.string()),
    positionX: v.optional(v.number()),
    positionY: v.optional(v.number()),
    clientRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, args.canvasId, user.userId);

    const existingMutationRecord =
      args.clientRequestId === undefined
        ? null
        : await ctx.db
            .query("mutationRequests")
            .withIndex("by_user_mutation_request", (q) =>
              q
                .eq("userId", user.userId)
                .eq("mutation", "nodes.splitEdgeAtExistingNode")
                .eq("clientRequestId", args.clientRequestId!),
            )
            .first();
    if (existingMutationRecord) {
      if (
        existingMutationRecord.canvasId &&
        existingMutationRecord.canvasId !== args.canvasId
      ) {
        throw new Error("Client request conflict");
      }
      return;
    }

    const edge = await ctx.db.get(args.splitEdgeId);
    if (!edge || edge.canvasId !== args.canvasId) {
      throw new Error("Edge not found");
    }

    if (
      edge.sourceNodeId === args.middleNodeId ||
      edge.targetNodeId === args.middleNodeId
    ) {
      throw new Error("Middle node is already an endpoint of this edge");
    }

    const middle = await ctx.db.get(args.middleNodeId);
    if (!middle || middle.canvasId !== args.canvasId) {
      throw new Error("Middle node not found");
    }

    if (
      args.positionX !== undefined &&
      args.positionY !== undefined
    ) {
      await ctx.db.patch(args.middleNodeId, {
        positionX: args.positionX,
        positionY: args.positionY,
      });
    }

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: args.middleNodeId,
      sourceHandle: args.splitSourceHandle,
      targetHandle: args.newNodeTargetHandle,
    });

    await assertTargetAllowsIncomingEdge(ctx, {
      targetNodeId: edge.targetNodeId,
      edgeIdToIgnore: args.splitEdgeId,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: args.middleNodeId,
      targetNodeId: edge.targetNodeId,
      sourceHandle: args.newNodeSourceHandle,
      targetHandle: args.splitTargetHandle,
    });

    await ctx.db.delete(args.splitEdgeId);
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });

    if (args.clientRequestId) {
      await ctx.db.insert("mutationRequests", {
        userId: user.userId,
        mutation: "nodes.splitEdgeAtExistingNode",
        clientRequestId: args.clientRequestId,
        canvasId: args.canvasId,
        nodeId: args.middleNodeId,
        edgeId: args.splitEdgeId,
        createdAt: Date.now(),
      });
    }
  },
});

/**
 * Neuen Node erstellen und sofort mit einem bestehenden Node verbinden
 * (ein Roundtrip — z. B. Prompt → neue AI-Image-Node).
 */
export const createWithEdgeFromSource = mutation({
  args: {
    canvasId: v.id("canvases"),
    type: nodeTypeValidator,
    positionX: v.number(),
    positionY: v.number(),
    width: v.number(),
    height: v.number(),
    data: v.any(),
    parentId: v.optional(v.id("nodes")),
    zIndex: v.optional(v.number()),
    clientRequestId: v.optional(v.string()),
    sourceNodeId: v.id("nodes"),
    sourceHandle: v.optional(v.string()),
    targetHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, args.canvasId, user.userId);

    const existingNodeId = await getIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createWithEdgeFromSource",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
    });
    if (existingNodeId) {
      return existingNodeId;
    }

    const source = await ctx.db.get(args.sourceNodeId);
    if (!source || source.canvasId !== args.canvasId) {
      throw new Error("Source node not found");
    }

    const normalizedData = normalizeNodeDataForWrite(args.type, args.data);

    const nodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: normalizedData,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: nodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    });

    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
    await rememberIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createWithEdgeFromSource",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
      nodeId,
    });

    return nodeId;
  },
});

/**
 * Neuen Node erstellen und als Quelle mit einem bestehenden Node verbinden
 * (Kante: neu → bestehend), z. B. Kante von Input-Handle gezogen und abgesetzt.
 */
export const createWithEdgeToTarget = mutation({
  args: {
    canvasId: v.id("canvases"),
    type: nodeTypeValidator,
    positionX: v.number(),
    positionY: v.number(),
    width: v.number(),
    height: v.number(),
    data: v.any(),
    parentId: v.optional(v.id("nodes")),
    zIndex: v.optional(v.number()),
    clientRequestId: v.optional(v.string()),
    targetNodeId: v.id("nodes"),
    sourceHandle: v.optional(v.string()),
    targetHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, args.canvasId, user.userId);

    const existingNodeId = await getIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createWithEdgeToTarget",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
    });
    if (existingNodeId) {
      return existingNodeId;
    }

    const target = await ctx.db.get(args.targetNodeId);
    if (!target || target.canvasId !== args.canvasId) {
      throw new Error("Target node not found");
    }

    const normalizedData = normalizeNodeDataForWrite(args.type, args.data);

    const nodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: normalizedData,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    await assertTargetAllowsIncomingEdge(ctx, {
      targetNodeId: args.targetNodeId,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: nodeId,
      targetNodeId: args.targetNodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    });

    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
    await rememberIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createWithEdgeToTarget",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
      nodeId,
    });

    return nodeId;
  },
});

/**
 * Node-Position auf dem Canvas verschieben.
 */
export const move = mutation({
  args: {
    nodeId: v.id("nodes"),
    positionX: v.number(),
    positionY: v.number(),
  },
  handler: async (ctx, { nodeId, positionX, positionY }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    await ctx.db.patch(nodeId, { positionX, positionY });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Node-Größe ändern.
 */
export const resize = mutation({
  args: {
    nodeId: v.id("nodes"),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, { nodeId, width, height }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) return;

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    const clampedWidth =
      isAdjustmentNodeType(node.type) && width < ADJUSTMENT_MIN_WIDTH
        ? ADJUSTMENT_MIN_WIDTH
        : width;
    await ctx.db.patch(nodeId, { width: clampedWidth, height });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Mehrere Nodes gleichzeitig verschieben (Batch Move, z.B. nach Multiselect-Drag).
 */
export const batchMove = mutation({
  args: {
    moves: v.array(
      v.object({
        nodeId: v.id("nodes"),
        positionX: v.number(),
        positionY: v.number(),
      })
    ),
  },
  handler: async (ctx, { moves }) => {
    const user = await requireAuth(ctx);
    if (moves.length === 0) return;

    // Canvas-Zugriff über den ersten Node prüfen
    const firstNode = await ctx.db.get(moves[0].nodeId);
    if (!firstNode) throw new Error("Node not found");
    await getCanvasOrThrow(ctx, firstNode.canvasId, user.userId);

    for (const { nodeId, positionX, positionY } of moves) {
      await ctx.db.patch(nodeId, { positionX, positionY });
    }

    await ctx.db.patch(firstNode.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Node-Daten aktualisieren (typ-spezifische Payload).
 */
export const updateData = mutation({
  args: {
    nodeId: v.id("nodes"),
    data: v.any(),
  },
  handler: async (ctx, { nodeId, data }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    const normalizedData = normalizeNodeDataForWrite(node.type, data);
    await ctx.db.patch(nodeId, { data: normalizedData });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Node-Status aktualisieren (UX-Strategie: Status direkt am Node).
 */
export const updateStatus = mutation({
  args: {
    nodeId: v.id("nodes"),
    status: v.union(
      v.literal("idle"),
      v.literal("analyzing"),
      v.literal("clarifying"),
      v.literal("executing"),
      v.literal("done"),
      v.literal("error")
    ),
    statusMessage: v.optional(v.string()),
    retryCount: v.optional(v.number()),
  },
  handler: async (ctx, { nodeId, status, statusMessage, retryCount }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    const patch: {
      status: typeof status;
      statusMessage?: string;
      retryCount?: number;
    } = {
      status,
    };
    if (statusMessage !== undefined) {
      patch.statusMessage = statusMessage;
    } else if (status === "done" || status === "executing" || status === "idle") {
      patch.statusMessage = undefined;
    }
    if (retryCount !== undefined) {
      patch.retryCount = retryCount;
    }
    await ctx.db.patch(nodeId, patch);
  },
});

/**
 * Node-Z-Index ändern (Layering).
 */
export const updateZIndex = mutation({
  args: {
    nodeId: v.id("nodes"),
    zIndex: v.number(),
  },
  handler: async (ctx, { nodeId, zIndex }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    await ctx.db.patch(nodeId, { zIndex });
  },
});

/**
 * Node in eine Gruppe/Frame verschieben oder aus Gruppe entfernen.
 */
export const setParent = mutation({
  args: {
    nodeId: v.id("nodes"),
    parentId: v.optional(v.id("nodes")),
  },
  handler: async (ctx, { nodeId, parentId }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);

    // Prüfen ob Parent existiert und zum gleichen Canvas gehört
    if (parentId) {
      const parent = await ctx.db.get(parentId);
      if (!parent || parent.canvasId !== node.canvasId) {
        throw new Error("Parent not found");
      }
    }

    await ctx.db.patch(nodeId, { parentId });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Node löschen — entfernt auch alle verbundenen Edges.
 */
export const remove = mutation({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);

    // Alle Edges entfernen, die diesen Node als Source oder Target haben
    const sourceEdges = await ctx.db
      .query("edges")
      .withIndex("by_source", (q) => q.eq("sourceNodeId", nodeId))
      .collect();
    for (const edge of sourceEdges) {
      await ctx.db.delete(edge._id);
    }

    const targetEdges = await ctx.db
      .query("edges")
      .withIndex("by_target", (q) => q.eq("targetNodeId", nodeId))
      .collect();
    for (const edge of targetEdges) {
      await ctx.db.delete(edge._id);
    }

    // Kind-Nodes aus Gruppe/Frame lösen (parentId auf undefined setzen)
    const children = await ctx.db
      .query("nodes")
      .withIndex("by_parent", (q) => q.eq("parentId", nodeId))
      .collect();
    for (const child of children) {
      await ctx.db.patch(child._id, { parentId: undefined });
    }

    // Node löschen
    await ctx.db.delete(nodeId);
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Mehrere Nodes gleichzeitig löschen (Batch Delete).
 * Entfernt auch alle verbundenen Edges und löst Kind-Nodes aus Gruppen/Frames.
 */
export const batchRemove = mutation({
  args: { nodeIds: v.array(v.id("nodes")) },
  handler: async (ctx, { nodeIds }) => {
    const user = await requireAuth(ctx);
    if (nodeIds.length === 0) return;

    // Idempotent: wenn alle Nodes bereits weg sind, no-op.
    const firstExistingNode = await (async () => {
      for (const nodeId of nodeIds) {
        const node = await ctx.db.get(nodeId);
        if (node) return node;
      }
      return null;
    })();
    if (!firstExistingNode) return;

    // Canvas-Zugriff über den ersten vorhandenen Node prüfen
    const firstNode = firstExistingNode;
    await getCanvasOrThrow(ctx, firstNode.canvasId, user.userId);

    for (const nodeId of nodeIds) {
      const node = await ctx.db.get(nodeId);
      if (!node) continue;

      // Alle Edges entfernen, die diesen Node als Source oder Target haben
      const sourceEdges = await ctx.db
        .query("edges")
        .withIndex("by_source", (q) => q.eq("sourceNodeId", nodeId))
        .collect();
      for (const edge of sourceEdges) {
        await ctx.db.delete(edge._id);
      }

      const targetEdges = await ctx.db
        .query("edges")
        .withIndex("by_target", (q) => q.eq("targetNodeId", nodeId))
        .collect();
      for (const edge of targetEdges) {
        await ctx.db.delete(edge._id);
      }

      // Kind-Nodes aus Gruppe/Frame lösen
      const children = await ctx.db
        .query("nodes")
        .withIndex("by_parent", (q) => q.eq("parentId", nodeId))
        .collect();
      for (const child of children) {
        await ctx.db.patch(child._id, { parentId: undefined });
      }

      // Node löschen
      await ctx.db.delete(nodeId);
    }

    await ctx.db.patch(firstNode.canvasId, { updatedAt: Date.now() });
  },
});
