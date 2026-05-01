/**
 * Onboarding note:
 * Convex backend module for canvases. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { optionalAuth, requireAuth } from "./helpers";
import { getOwnedCanvasOrNull, requireOwnedCanvas } from "./authz_helpers";

const PERFORMANCE_LOG_THRESHOLD_MS = 100;

// ============================================================================
// Queries
// ============================================================================

/**
 * Alle Canvases des eingeloggten Users, sortiert nach letzter Bearbeitung.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) {
      return [];
    }
    return await ctx.db
      .query("canvases")
      .withIndex("by_owner_updated", (q) => q.eq("ownerId", user.userId))
      .order("desc")
      .collect();
  },
});

/**
 * Einzelnen Canvas laden — mit Owner-Check.
 */
export const get = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const startedAt = Date.now();
    const authStartedAt = Date.now();
    const user = await optionalAuth(ctx);
    const authMs = Date.now() - authStartedAt;
    if (!user) {
      return null;
    }

    const canvasLookupStartedAt = Date.now();
    const canvas = await getOwnedCanvasOrNull(ctx, canvasId, user.userId);
    const canvasLookupMs = Date.now() - canvasLookupStartedAt;
    if (!canvas) {
      return null;
    }

    const durationMs = Date.now() - startedAt;
    if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
      console.warn("[canvases.get] slow canvas query", {
        canvasId,
        userId: user.userId,
        authMs,
        canvasLookupMs,
        canvasUpdatedAt: canvas.updatedAt,
        durationMs,
      });
    }

    return canvas;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Neuen Canvas erstellen.
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { name, description }) => {
    const user = await requireAuth(ctx);
    const now = Date.now();
    const canvasId = await ctx.db.insert("canvases", {
      name,
      ownerId: user.userId,
      description,
      updatedAt: now,
    });
    return canvasId;
  },
});

/**
 * Canvas umbenennen oder Beschreibung ändern.
 */
export const update = mutation({
  args: {
    canvasId: v.id("canvases"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { canvasId, name, description }) => {
    const user = await requireAuth(ctx);
    await requireOwnedCanvas(ctx, canvasId, user.userId);

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    await ctx.db.patch(canvasId, updates);
  },
});

/**
 * Canvas löschen — entfernt auch alle zugehörigen Nodes und Edges.
 */
export const remove = mutation({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const user = await requireAuth(ctx);
    await requireOwnedCanvas(ctx, canvasId, user.userId);

    // Alle Nodes dieses Canvas löschen
    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
    for (const node of nodes) {
      await ctx.db.delete(node._id);
    }

    // Alle Edges dieses Canvas löschen
    const edges = await ctx.db
      .query("edges")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
    for (const edge of edges) {
      await ctx.db.delete(edge._id);
    }

    // Canvas selbst löschen
    await ctx.db.delete(canvasId);
  },
});

/**
 * Canvas-Thumbnail aktualisieren.
 */
export const setThumbnail = mutation({
  args: {
    canvasId: v.id("canvases"),
    thumbnail: v.id("_storage"),
  },
  handler: async (ctx, { canvasId, thumbnail }) => {
    const user = await requireAuth(ctx);
    await requireOwnedCanvas(ctx, canvasId, user.userId);
    await ctx.db.patch(canvasId, { thumbnail, updatedAt: Date.now() });
  },
});
