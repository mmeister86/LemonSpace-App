/**
 * Onboarding note:
 * Persists Canvas edges and enforces server-side connection policy parity with the React Flow client.
 */

import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Doc, Id } from "./_generated/dataModel";
import { getOwnedCanvasOrNull, requireOwnedCanvas } from "./authz_helpers";
import {
  getCanvasConnectionValidationMessage,
  validateCanvasConnectionPolicy,
} from "../lib/canvas-connection-policy";
import {
  MIXER_LAYER_HANDLE_BASE_ID,
  normalizeMixerLayerHandle,
} from "../lib/canvas-mixer-normalization";

const PERFORMANCE_LOG_THRESHOLD_MS = 250;
const INCOMING_EDGE_POLICY_INSPECTION_LIMIT = 8;

async function getIncomingEdgePolicyContext(
  ctx: MutationCtx,
  args: {
    targetNodeId: Id<"nodes">;
    edgeIdToIgnore?: Id<"edges">;
  },
): Promise<{
  count: number;
  targetHandles: Array<string | undefined>;
  sourceTypes: string[];
}> {
  const incomingEdgesQuery = ctx.db
    .query("edges")
    .withIndex("by_target", (q) => q.eq("targetNodeId", args.targetNodeId));

  const checkStartedAt = Date.now();
  const incomingEdges = await incomingEdgesQuery.take(
    INCOMING_EDGE_POLICY_INSPECTION_LIMIT,
  );
  const checkDurationMs = Date.now() - checkStartedAt;

  const filteredIncomingEdges = incomingEdges.filter(
    (edge: Doc<"edges">) => edge._id !== args.edgeIdToIgnore,
  );
  const incomingCount = filteredIncomingEdges.length;
  if (checkDurationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
    const inspected = incomingEdges.length;

    console.warn("[edges.assertTargetAllowsIncomingEdge] slow incoming edge check", {
      targetNodeId: args.targetNodeId,
      edgeIdToIgnore: args.edgeIdToIgnore,
      inspected,
      checkDurationMs,
    });
  }

  const sourceNodes = await Promise.all(
    filteredIncomingEdges.map((edge) => ctx.db.get(edge.sourceNodeId)),
  );

  return {
    count: incomingCount,
    targetHandles: filteredIncomingEdges.map((edge) => edge.targetHandle),
    sourceTypes: sourceNodes.map((node) => node?.type ?? ""),
  };
}

async function assertConnectionPolicy(
  ctx: MutationCtx,
  args: {
    sourceNodeId: Id<"nodes">;
    targetNodeId: Id<"nodes">;
    targetHandle?: string;
    edgeIdToIgnore?: Id<"edges">;
  },
): Promise<void> {
  const sourceNode = await ctx.db.get(args.sourceNodeId);
  const targetNode = await ctx.db.get(args.targetNodeId);
  if (!sourceNode || !targetNode) {
    throw new Error("Source or target node not found");
  }

  const targetIncoming = await getIncomingEdgePolicyContext(ctx, {
    targetNodeId: args.targetNodeId,
    edgeIdToIgnore: args.edgeIdToIgnore,
  });

  const reason = validateCanvasConnectionPolicy({
    sourceType: sourceNode.type,
    targetType: targetNode.type,
    targetIncomingCount: targetIncoming.count,
    targetHandle: args.targetHandle,
    targetIncomingHandles: targetIncoming.targetHandles,
    targetIncomingSourceTypes: targetIncoming.sourceTypes,
  });

  if (reason) {
    console.warn("[edges.create] connection policy rejected", {
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
      edgeIdToIgnore: args.edgeIdToIgnore,
      sourceType: sourceNode.type,
      targetType: targetNode.type,
      targetIncomingCount: targetIncoming.count,
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
    const canvas = await getOwnedCanvasOrNull(ctx, canvasId, user.userId);
    const canvasLookupMs = Date.now() - canvasLookupStartedAt;
    if (!canvas) {
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
    edgeIdToIgnore: v.optional(v.id("edges")),
    clientRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireOwnedCanvas(ctx, args.canvasId, user.userId);

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

    const edgeToIgnore = args.edgeIdToIgnore
      ? await ctx.db.get(args.edgeIdToIgnore)
      : null;
    if (args.edgeIdToIgnore) {
      if (!edgeToIgnore) {
        throw new Error("Edge to ignore not found");
      }
      if (edgeToIgnore.canvasId !== args.canvasId) {
        throw new Error("Edge to ignore must belong to the same canvas");
      }
    }

    await assertConnectionPolicy(ctx, {
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
      targetHandle: args.targetHandle,
      edgeIdToIgnore: args.edgeIdToIgnore,
    });

    const edgeId = await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    });

    if (edgeToIgnore) {
      await ctx.db.delete(edgeToIgnore._id);
    }

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

export const swapMixerInputs = mutation({
  args: {
    canvasId: v.id("canvases"),
    edgeId: v.id("edges"),
    otherEdgeId: v.id("edges"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireOwnedCanvas(ctx, args.canvasId, user.userId);

    if (args.edgeId === args.otherEdgeId) {
      throw new Error("Edge IDs must be different");
    }

    const edge = await ctx.db.get(args.edgeId);
    const otherEdge = await ctx.db.get(args.otherEdgeId);
    if (!edge || !otherEdge) {
      throw new Error("Edge not found");
    }

    if (edge.canvasId !== args.canvasId || otherEdge.canvasId !== args.canvasId) {
      throw new Error("Edges must belong to the same canvas");
    }

    if (edge.targetNodeId !== otherEdge.targetNodeId) {
      throw new Error("Edges must target the same mixer node");
    }

    const mixerNode = await ctx.db.get(edge.targetNodeId);
    if (!mixerNode || mixerNode.canvasId !== args.canvasId || mixerNode.type !== "mixer") {
      throw new Error("Mixer node not found");
    }

    const edgeHandle = normalizeMixerLayerHandle(edge.targetHandle);
    const otherEdgeHandle = normalizeMixerLayerHandle(otherEdge.targetHandle);
    if (
      !edgeHandle ||
      !otherEdgeHandle ||
      edgeHandle === otherEdgeHandle ||
      edgeHandle === MIXER_LAYER_HANDLE_BASE_ID ||
      otherEdgeHandle === MIXER_LAYER_HANDLE_BASE_ID
    ) {
      throw new Error("Mixer swap supports overlay layer handles only");
    }

    await ctx.db.patch(edge._id, { targetHandle: otherEdgeHandle });
    await ctx.db.patch(otherEdge._id, { targetHandle: edgeHandle });
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
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

    const canvas = await getOwnedCanvasOrNull(ctx, edge.canvasId, user.userId);
    if (!canvas) {
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
