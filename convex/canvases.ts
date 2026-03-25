import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

// ============================================================================
// Queries
// ============================================================================

/**
 * Alle Canvases des eingeloggten Users, sortiert nach letzter Bearbeitung.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
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
    const user = await requireAuth(ctx);
    const canvas = await ctx.db.get(canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      return null;
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
    const canvas = await ctx.db.get(canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      throw new Error("Canvas not found");
    }

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
    const canvas = await ctx.db.get(canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      throw new Error("Canvas not found");
    }

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
    const canvas = await ctx.db.get(canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      throw new Error("Canvas not found");
    }
    await ctx.db.patch(canvasId, { thumbnail, updatedAt: Date.now() });
  },
});
