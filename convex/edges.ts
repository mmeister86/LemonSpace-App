import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getCanvasConnectionValidationMessage,
  validateCanvasConnectionPolicy,
} from "../lib/canvas-connection-policy";

const PERFORMANCE_LOG_THRESHOLD_MS = 250;

async function countIncomingEdges(
  ctx: MutationCtx,
  args: {
    targetNodeId: Id<"nodes">;
    edgeIdToIgnore?: Id<"edges">;
  },
): Promise<number> {
  const incomingEdgesQuery = ctx.db
    .query("edges")
    .withIndex("by_target", (q) => q.eq("targetNodeId", args.targetNodeId));

  const checkStartedAt = Date.now();
  const incomingEdges = await (
    args.edgeIdToIgnore
      ? incomingEdgesQuery.take(2)
      : incomingEdgesQuery.first()
  );
  const checkDurationMs = Date.now() - checkStartedAt;

  const incomingCount = Array.isArray(incomingEdges)
    ? incomingEdges.filter((edge: Doc<"edges">) => edge._id !== args.edgeIdToIgnore).length
    : incomingEdges !== null && incomingEdges._id !== args.edgeIdToIgnore
      ? 1
      : 0;
  if (checkDurationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
    const inspected = Array.isArray(incomingEdges)
      ? incomingEdges.length
      : incomingEdges === null
        ? 0
        : 1;

    console.warn("[edges.assertTargetAllowsIncomingEdge] slow incoming edge check", {
      targetNodeId: args.targetNodeId,
      edgeIdToIgnore: args.edgeIdToIgnore,
      inspected,
      checkDurationMs,
    });
  }

  return incomingCount;
}

async function assertConnectionPolicy(
  ctx: MutationCtx,
  args: {
    sourceNodeId: Id<"nodes">;
    targetNodeId: Id<"nodes">;
    edgeIdToIgnore?: Id<"edges">;
  },
): Promise<void> {
  const sourceNode = await ctx.db.get(args.sourceNodeId);
  const targetNode = await ctx.db.get(args.targetNodeId);
  if (!sourceNode || !targetNode) {
    throw new Error("Source or target node not found");
  }

  const targetIncomingCount = await countIncomingEdges(ctx, {
    targetNodeId: args.targetNodeId,
    edgeIdToIgnore: args.edgeIdToIgnore,
  });

  const reason = validateCanvasConnectionPolicy({
    sourceType: sourceNode.type,
    targetType: targetNode.type,
    targetIncomingCount,
  });

  if (reason) {
    console.warn("[edges.create] connection policy rejected", {
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
      edgeIdToIgnore: args.edgeIdToIgnore,
      sourceType: sourceNode.type,
      targetType: targetNode.type,
      targetIncomingCount,
      reason,
    });
    throw new Error(getCanvasConnectionValidationMessage(reason));
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Alle Edges eines Canvas laden.
 */
export const list = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const startedAt = Date.now();
    const authStartedAt = Date.now();
    const user = await requireAuth(ctx);
    const authMs = Date.now() - authStartedAt;

    const canvasLookupStartedAt = Date.now();
    const canvas = await ctx.db.get(canvasId);
    const canvasLookupMs = Date.now() - canvasLookupStartedAt;
    if (!canvas || canvas.ownerId !== user.userId) {
      return [];
    }

    const collectStartedAt = Date.now();
    const edges = await ctx.db
      .query("edges")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
    const collectMs = Date.now() - collectStartedAt;

    const durationMs = Date.now() - startedAt;
    if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
      console.warn("[edges.list] slow list query", {
        canvasId,
        userId: user.userId,
        authMs,
        canvasLookupMs,
        collectMs,
        edgeCount: edges.length,
        canvasUpdatedAt: canvas.updatedAt,
        durationMs,
      });
    }

    return edges;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Neue Edge (Verbindung) zwischen zwei Nodes erstellen.
 */
export const create = mutation({
  args: {
    canvasId: v.id("canvases"),
    sourceNodeId: v.id("nodes"),
    targetNodeId: v.id("nodes"),
    sourceHandle: v.optional(v.string()),
    targetHandle: v.optional(v.string()),
    clientRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const canvas = await ctx.db.get(args.canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      throw new Error("Canvas not found");
    }

    const getExistingEdge = async (): Promise<Id<"edges"> | null> => {
      const clientRequestId = args.clientRequestId;
      if (!clientRequestId) return null;
      const existing = await ctx.db
        .query("mutationRequests")
        .withIndex("by_user_mutation_request", (q) =>
          q
            .eq("userId", user.userId)
            .eq("mutation", "edges.create")
            .eq("clientRequestId", clientRequestId),
        )
        .first();
      if (!existing) return null;
      if (existing.canvasId && existing.canvasId !== args.canvasId) {
        throw new Error("Client request conflict");
      }
      if (!existing.edgeId) return null;
      return existing.edgeId;
    };

    const existingEdgeId = await getExistingEdge();
    if (existingEdgeId) {
      return existingEdgeId;
    }

    // Prüfen ob beide Nodes existieren und zum gleichen Canvas gehören
    const source = await ctx.db.get(args.sourceNodeId);
    const target = await ctx.db.get(args.targetNodeId);
    if (!source || !target) {
      console.warn("[edges.create] missing source or target node", {
        canvasId: args.canvasId,
        sourceNodeId: args.sourceNodeId,
        targetNodeId: args.targetNodeId,
        hasSource: Boolean(source),
        hasTarget: Boolean(target),
      });
      throw new Error("Source or target node not found");
    }
    if (source.canvasId !== args.canvasId || target.canvasId !== args.canvasId) {
      throw new Error("Nodes must belong to the same canvas");
    }

    // Keine Self-Loops
    if (args.sourceNodeId === args.targetNodeId) {
      throw new Error("Cannot connect a node to itself");
    }

    await assertConnectionPolicy(ctx, {
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
    });

    const edgeId = await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    });

    console.info("[canvas.updatedAt] touch", {
      canvasId: args.canvasId,
      source: "edges.create",
      edgeId,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
    });
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
    if (args.clientRequestId) {
      await ctx.db.insert("mutationRequests", {
        userId: user.userId,
        mutation: "edges.create",
        clientRequestId: args.clientRequestId,
        canvasId: args.canvasId,
        edgeId,
        createdAt: Date.now(),
      });
    }
    return edgeId;
  },
});

/**
 * Edge löschen.
 */
export const remove = mutation({
  args: { edgeId: v.id("edges") },
  handler: async (ctx, { edgeId }) => {
    const user = await requireAuth(ctx);
    console.info("[edges.remove] request", {
      edgeId,
      userId: user.userId,
    });

    const edge = await ctx.db.get(edgeId);
    if (!edge) {
      console.info("[edges.remove] edge already removed (idempotent no-op)", {
        edgeId,
        userId: user.userId,
      });
      return;
    }

    const canvas = await ctx.db.get(edge.canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      console.warn("[edges.remove] unauthorized canvas access", {
        edgeId,
        canvasId: edge.canvasId,
        userId: user.userId,
        hasCanvas: Boolean(canvas),
      });
      throw new Error("Canvas not found");
    }

    await ctx.db.delete(edgeId);
    console.info("[canvas.updatedAt] touch", {
      canvasId: edge.canvasId,
      source: "edges.remove",
      edgeId,
    });
    await ctx.db.patch(edge.canvasId, { updatedAt: Date.now() });

    console.info("[edges.remove] success", {
      edgeId,
      canvasId: edge.canvasId,
      userId: user.userId,
    });
  },
});
