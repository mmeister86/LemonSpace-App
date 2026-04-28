import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Doc, Id } from "./_generated/dataModel";
import { isAdjustmentNodeType } from "../lib/canvas-node-types";
import {
  getCanvasConnectionValidationMessage,
  validateCanvasConnectionPolicy,
} from "../lib/canvas-connection-policy";
import { nodeTypeValidator } from "./node_type_validator";
import { buildNodeStatusUpdatePatch } from "./node_status_helpers";
import {
  getOwnedCanvasOrNull,
  requireOwnedCanvas,
} from "./authz_helpers";
import { deleteGroupNodeWithEdges, deleteNodeWithCleanup } from "./nodes/delete_cleanup";
import {
  assertParentAllowedForNode,
  assertSelectedNodesHaveNoSelectedAncestors,
} from "./nodes/grouping";
import {
  getIdempotentNodeCreateResult,
  rememberIdempotentNodeCreateResult,
  resolveNodeReferenceForWrite,
} from "./nodes/idempotency";
import { assertConnectionPolicyForTypes, getValidatedBatchNodesOrThrow } from "./nodes/validation";
import {
  estimateSerializedBytes,
  insertNodeForWrite,
  normalizeNodeDataForWrite,
} from "./nodes/write_helpers";

// ============================================================================
// Interne Helpers
// ============================================================================

const ADJUSTMENT_MIN_WIDTH = 240;

const PERFORMANCE_LOG_THRESHOLD_MS = 250;

// ============================================================================
// Queries
// ============================================================================

/**
 * Alle Nodes eines Canvas laden.
 */
export const list = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const startedAt = Date.now();
    const authStartedAt = Date.now();
    const user = await requireAuth(ctx);
    const authMs = Date.now() - authStartedAt;

    const canvasLookupStartedAt = Date.now();
    const canvas = await requireOwnedCanvas(ctx, canvasId, user.userId);
    const canvasLookupMs = Date.now() - canvasLookupStartedAt;

    const collectStartedAt = Date.now();
    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
    const collectMs = Date.now() - collectStartedAt;

    const durationMs = Date.now() - startedAt;
    if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
      console.warn("[nodes.list] slow list query", {
        canvasId,
        userId: user.userId,
        authMs,
        canvasLookupMs,
        collectMs,
        nodeCount: nodes.length,
        approxPayloadBytes: estimateSerializedBytes(nodes),
        canvasUpdatedAt: canvas.updatedAt,
        durationMs,
      });
    }

    return nodes;
  },
});

/**
 * Einzelnen Node laden.
 */
export const get = query({
  args: {
    nodeId: v.id("nodes"),
    includeStorageUrl: v.optional(v.boolean()),
  },
  handler: async (ctx, { nodeId, includeStorageUrl }) => {
    const user = await requireAuth(ctx);
    const startedAt = Date.now();
    const shouldIncludeStorageUrl = includeStorageUrl ?? true;
    const node = await ctx.db.get(nodeId);
    if (!node) return null;

    const canvas = await getOwnedCanvasOrNull(ctx, node.canvasId, user.userId);
    if (!canvas) {
      return null;
    }

    if (!shouldIncludeStorageUrl) {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
        console.warn("[nodes.get] fast path query", {
          nodeId,
          durationMs,
          includeStorageUrl,
          shouldIncludeStorageUrl,
        });
      }
      return node;
    }

    const data = node.data as Record<string, unknown> | undefined;
    if (!data?.storageId) {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
        console.warn("[nodes.get] no storage URL query", {
          nodeId,
          durationMs,
        });
      }
      return node;
    }

    let url: string | null;
    try {
      const getUrlStartedAt = Date.now();
      url = await ctx.storage.getUrl(data.storageId as Id<"_storage">);
      const getUrlDurationMs = Date.now() - getUrlStartedAt;
      if (getUrlDurationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
        console.warn("[nodes.get] slow storage URL resolution", {
          nodeId: node._id,
          storageId: data.storageId,
          getUrlDurationMs,
          durationMs: Date.now() - startedAt,
        });
      }
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
    const canvas = await getOwnedCanvasOrNull(ctx, canvasId, user.userId);
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
    const startedAt = Date.now();
    const approxDataBytes = estimateSerializedBytes(args.data);

    console.info("[nodes.create] start", {
      canvasId: args.canvasId,
      type: args.type,
      clientRequestId: args.clientRequestId ?? null,
      approxDataBytes,
    });

    try {
      const user = await requireAuth(ctx);
      const authDurationMs = Date.now() - startedAt;
      await requireOwnedCanvas(ctx, args.canvasId, user.userId);

      const existingNodeId = await getIdempotentNodeCreateResult(ctx, {
        userId: user.userId,
        mutation: "nodes.create",
        clientRequestId: args.clientRequestId,
        canvasId: args.canvasId,
      });
      if (existingNodeId) {
        console.info("[nodes.create] idempotent hit", {
          canvasId: args.canvasId,
          type: args.type,
          userId: user.userId,
          authDurationMs,
          totalDurationMs: Date.now() - startedAt,
          existingNodeId,
        });
        return existingNodeId;
      }

      const nodeId = await insertNodeForWrite(ctx, {
        canvasId: args.canvasId,
        type: args.type as Doc<"nodes">["type"],
        positionX: args.positionX,
        positionY: args.positionY,
        width: args.width,
        height: args.height,
        data: args.data,
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

      console.info("[nodes.create] success", {
        canvasId: args.canvasId,
        type: args.type,
        userId: user.userId,
        nodeId,
        approxDataBytes,
        authDurationMs,
        totalDurationMs: Date.now() - startedAt,
      });

      return nodeId;
    } catch (error) {
      console.error("[nodes.create] failed", {
        canvasId: args.canvasId,
        type: args.type,
        clientRequestId: args.clientRequestId ?? null,
        approxDataBytes,
        totalDurationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});

/**
 * Neue Gruppe um eine bestehende Auswahl erstellen und die ausgewählten Root-Nodes
 * atomar als Kinder einhängen.
 */
export const createGroupFromSelection = mutation({
  args: {
    canvasId: v.id("canvases"),
    nodeIds: v.array(v.id("nodes")),
    group: v.object({
      positionX: v.number(),
      positionY: v.number(),
      width: v.number(),
      height: v.number(),
      label: v.optional(v.string()),
      zIndex: v.optional(v.number()),
      clientRequestId: v.optional(v.string()),
    }),
    childPositions: v.array(
      v.object({
        nodeId: v.id("nodes"),
        positionX: v.number(),
        positionY: v.number(),
      }),
    ),
  },
  handler: async (ctx, { canvasId, nodeIds, group, childPositions }) => {
    const user = await requireAuth(ctx);
    await requireOwnedCanvas(ctx, canvasId, user.userId);

    if (nodeIds.length < 2) {
      throw new Error("At least two nodes are required to create a group");
    }

    const uniqueNodeIds = Array.from(new Set(nodeIds));
    if (uniqueNodeIds.length !== nodeIds.length) {
      throw new Error("Duplicate node ids are not allowed");
    }

    const existingNodeId = await getIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createGroupFromSelection",
      clientRequestId: group.clientRequestId,
      canvasId,
    });
    if (existingNodeId) {
      return existingNodeId;
    }

    const { nodes: selectedNodes } = await getValidatedBatchNodesOrThrow(
      ctx,
      user.userId,
      uniqueNodeIds,
    );
    if (selectedNodes.some((node) => node.canvasId !== canvasId)) {
      throw new Error("All selected nodes must belong to the target canvas");
    }
    await assertSelectedNodesHaveNoSelectedAncestors(ctx, {
      canvasId,
      selectedNodes,
      selectedNodeIds: uniqueNodeIds,
    });

    const childPositionByNodeId = new Map(
      childPositions.map((position) => [position.nodeId, position]),
    );
    if (
      childPositions.length !== uniqueNodeIds.length ||
      childPositionByNodeId.size !== uniqueNodeIds.length
    ) {
      throw new Error("Child positions must match selected nodes");
    }
    for (const nodeId of uniqueNodeIds) {
      if (!childPositionByNodeId.has(nodeId)) {
        throw new Error("Missing child position for selected node");
      }
    }

    const groupNodeId = await insertNodeForWrite(ctx, {
      canvasId,
      type: "group",
      positionX: group.positionX,
      positionY: group.positionY,
      width: group.width,
      height: group.height,
      data: normalizeNodeDataForWrite("group", {
        label: group.label ?? "Gruppe",
      }),
      zIndex: group.zIndex,
    });

    for (const node of selectedNodes) {
      const childPosition = childPositionByNodeId.get(node._id);
      if (!childPosition) continue;
      await ctx.db.patch(node._id, {
        parentId: groupNodeId,
        positionX: childPosition.positionX,
        positionY: childPosition.positionY,
      });
    }

    await ctx.db.patch(canvasId, { updatedAt: Date.now() });
    await rememberIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createGroupFromSelection",
      clientRequestId: group.clientRequestId,
      canvasId,
      nodeId: groupNodeId,
    });

    return groupNodeId;
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
    await requireOwnedCanvas(ctx, args.canvasId, user.userId);

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

    const sourceNode = await ctx.db.get(edge.sourceNodeId);
    const targetNode = await ctx.db.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      throw new Error("Source or target node not found");
    }

    const firstEdgeReason = validateCanvasConnectionPolicy({
      sourceType: sourceNode.type,
      targetType: args.type,
      targetIncomingCount: 0,
      targetHandle: args.newNodeTargetHandle,
      targetIncomingHandles: [],
    });
    if (firstEdgeReason) {
      throw new Error(getCanvasConnectionValidationMessage(firstEdgeReason));
    }

    await assertConnectionPolicyForTypes(ctx, {
      sourceType: args.type,
      targetType: targetNode.type,
      targetNodeId: edge.targetNodeId,
      targetHandle: args.splitTargetHandle,
      edgeIdToIgnore: args.splitEdgeId,
    });

    const nodeId = await insertNodeForWrite(ctx, {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      data: args.data,
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
    await requireOwnedCanvas(ctx, args.canvasId, user.userId);

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

    const sourceNode = await ctx.db.get(edge.sourceNodeId);
    const targetNode = await ctx.db.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      throw new Error("Source or target node not found");
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

    await assertConnectionPolicyForTypes(ctx, {
      sourceType: sourceNode.type,
      targetType: middle.type,
      targetNodeId: args.middleNodeId,
      targetHandle: args.newNodeTargetHandle,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: args.middleNodeId,
      sourceHandle: args.splitSourceHandle,
      targetHandle: args.newNodeTargetHandle,
    });

    await assertConnectionPolicyForTypes(ctx, {
      sourceType: middle.type,
      targetType: targetNode.type,
      targetNodeId: edge.targetNodeId,
      targetHandle: args.splitTargetHandle,
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
    sourceNodeId: v.string(),
    sourceHandle: v.optional(v.string()),
    targetHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireOwnedCanvas(ctx, args.canvasId, user.userId);

    const existingNodeId = await getIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createWithEdgeFromSource",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
    });
    if (existingNodeId) {
      return existingNodeId;
    }

    const sourceNodeId = await resolveNodeReferenceForWrite(ctx, {
      userId: user.userId,
      canvasId: args.canvasId,
      nodeId: args.sourceNodeId,
    });
    const source = await ctx.db.get(sourceNodeId);
    if (!source || source.canvasId !== args.canvasId) {
      throw new Error("Source node not found");
    }

    const fromSourceReason = validateCanvasConnectionPolicy({
      sourceType: source.type,
      targetType: args.type,
      targetIncomingCount: 0,
      targetHandle: args.targetHandle,
      targetIncomingHandles: [],
    });
    if (fromSourceReason) {
      throw new Error(getCanvasConnectionValidationMessage(fromSourceReason));
    }

    const nodeId = await insertNodeForWrite(ctx, {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId,
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
    targetNodeId: v.string(),
    sourceHandle: v.optional(v.string()),
    targetHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireOwnedCanvas(ctx, args.canvasId, user.userId);

    const existingNodeId = await getIdempotentNodeCreateResult(ctx, {
      userId: user.userId,
      mutation: "nodes.createWithEdgeToTarget",
      clientRequestId: args.clientRequestId,
      canvasId: args.canvasId,
    });
    if (existingNodeId) {
      return existingNodeId;
    }

    const targetNodeId = await resolveNodeReferenceForWrite(ctx, {
      userId: user.userId,
      canvasId: args.canvasId,
      nodeId: args.targetNodeId,
    });
    const target = await ctx.db.get(targetNodeId);
    if (!target || target.canvasId !== args.canvasId) {
      throw new Error("Target node not found");
    }

    await assertConnectionPolicyForTypes(ctx, {
      sourceType: args.type,
      targetType: target.type,
      targetNodeId,
      targetHandle: args.targetHandle,
    });

    const nodeId = await insertNodeForWrite(ctx, {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: nodeId,
      targetNodeId,
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

    await requireOwnedCanvas(ctx, node.canvasId, user.userId);
    await ctx.db.patch(nodeId, { positionX, positionY });
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

    await requireOwnedCanvas(ctx, node.canvasId, user.userId);
    const clampedWidth =
      isAdjustmentNodeType(node.type) && width < ADJUSTMENT_MIN_WIDTH
        ? ADJUSTMENT_MIN_WIDTH
        : width;
    await ctx.db.patch(nodeId, { width: clampedWidth, height });
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

    const nodeIds = moves.map((move) => move.nodeId);
    await getValidatedBatchNodesOrThrow(
      ctx,
      user.userId,
      nodeIds,
    );

    for (const { nodeId, positionX, positionY } of moves) {
      await ctx.db.patch(nodeId, { positionX, positionY });
    }
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

    await requireOwnedCanvas(ctx, node.canvasId, user.userId);
    const normalizedData = normalizeNodeDataForWrite(node.type, data);
    await ctx.db.patch(nodeId, { data: normalizedData });
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

    await requireOwnedCanvas(ctx, node.canvasId, user.userId);
    const patch = buildNodeStatusUpdatePatch({
      status,
      statusMessage,
      retryCount,
    });
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

    await requireOwnedCanvas(ctx, node.canvasId, user.userId);
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
    positionX: v.optional(v.number()),
    positionY: v.optional(v.number()),
  },
  handler: async (ctx, { nodeId, parentId, positionX, positionY }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await requireOwnedCanvas(ctx, node.canvasId, user.userId);

    await assertParentAllowedForNode(ctx, {
      nodeId,
      canvasId: node.canvasId,
      parentId,
    });

    await ctx.db.patch(nodeId, {
      parentId,
      ...(positionX !== undefined ? { positionX } : {}),
      ...(positionY !== undefined ? { positionY } : {}),
    });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Direkte Kinder ausgewählter Gruppen aus der Gruppe herausheben. Die Gruppen
 * selbst bleiben bestehen.
 */
export const ungroupNodes = mutation({
  args: {
    groupNodeIds: v.array(v.id("nodes")),
    childPositions: v.array(
      v.object({
        nodeId: v.id("nodes"),
        parentId: v.optional(v.id("nodes")),
        positionX: v.number(),
        positionY: v.number(),
      }),
    ),
  },
  handler: async (ctx, { groupNodeIds, childPositions }) => {
    const user = await requireAuth(ctx);
    if (groupNodeIds.length === 0) return;

    const uniqueGroupNodeIds = Array.from(new Set(groupNodeIds));
    if (uniqueGroupNodeIds.length !== groupNodeIds.length) {
      throw new Error("Duplicate group ids are not allowed");
    }

    const { nodes: groupNodes } = await getValidatedBatchNodesOrThrow(
      ctx,
      user.userId,
      uniqueGroupNodeIds,
    );
    for (const groupNode of groupNodes) {
      if (groupNode.type !== "group") {
        throw new Error("Only group nodes can be ungrouped");
      }
    }

    const groupNodeIdSet = new Set(uniqueGroupNodeIds);
    if (
      childPositions.length !==
      new Set(childPositions.map((position) => position.nodeId)).size
    ) {
      throw new Error("Duplicate child positions are not allowed");
    }

    const childNodes = await Promise.all(
      childPositions.map((position) => ctx.db.get(position.nodeId)),
    );
    const affectedCanvasIds = new Set<Id<"canvases">>();

    for (let index = 0; index < childPositions.length; index += 1) {
      const childPosition = childPositions[index];
      const childNode = childNodes[index];
      if (!childNode) {
        throw new Error("Child node not found");
      }
      if (!groupNodeIdSet.has(childNode.parentId as Id<"nodes">)) {
        throw new Error("Child node is not a direct child of an ungrouped group");
      }

      const groupNode = groupNodes.find((node) => node._id === childNode.parentId);
      if (!groupNode) {
        throw new Error("Group node not found");
      }
      if (childNode.canvasId !== groupNode.canvasId) {
        throw new Error("Child and group must belong to the same canvas");
      }

      await assertParentAllowedForNode(ctx, {
        nodeId: childNode._id,
        canvasId: childNode.canvasId,
        parentId: childPosition.parentId,
      });

      await ctx.db.patch(childNode._id, {
        parentId: childPosition.parentId,
        positionX: childPosition.positionX,
        positionY: childPosition.positionY,
      });
      affectedCanvasIds.add(childNode.canvasId);
    }

    for (const groupNode of groupNodes) {
      affectedCanvasIds.add(groupNode.canvasId);

      await deleteGroupNodeWithEdges(ctx, groupNode._id);
    }
    for (const canvasId of affectedCanvasIds) {
      await ctx.db.patch(canvasId, { updatedAt: Date.now() });
    }
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

    await requireOwnedCanvas(ctx, node.canvasId, user.userId);

    await deleteNodeWithCleanup(ctx, { nodeId, canvasId: node.canvasId });
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

    const { canvasId, nodes } = await getValidatedBatchNodesOrThrow(
      ctx,
      user.userId,
      nodeIds,
    );

    const uniqueNodes = new Map<Id<"nodes">, Doc<"nodes">>();
    for (const node of nodes) {
      uniqueNodes.set(node._id, node);
    }

    for (const node of uniqueNodes.values()) {
      await deleteNodeWithCleanup(ctx, {
        nodeId: node._id,
        patchCanvasUpdatedAt: false,
      });
    }

    await ctx.db.patch(canvasId, { updatedAt: Date.now() });
  },
});
