import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

import { requireAuth } from "./helpers";
import {
  buildFreepikAssetDedupeKey,
  buildPexelsVideoDedupeKey,
  buildStoredMediaDedupeKey,
  mapMediaArchiveRowToListItem,
  normalizeMediaArchiveInput,
  type MediaArchiveInput,
  type MediaArchiveKind,
  type MediaArchiveListItem,
} from "../lib/media-archive";

const MEDIA_LIBRARY_DEFAULT_LIMIT = 200;
const MEDIA_LIBRARY_MIN_LIMIT = 1;
const MEDIA_LIBRARY_MAX_LIMIT = 500;

const mediaArchiveInputValidator = v.object({
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("asset")),
  source: v.union(
    v.literal("upload"),
    v.literal("ai-image"),
    v.literal("ai-video"),
    v.literal("freepik-asset"),
    v.literal("pexels-video"),
  ),
  dedupeKey: v.string(),
  title: v.optional(v.string()),
  filename: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  previewStorageId: v.optional(v.id("_storage")),
  originalUrl: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  providerAssetId: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  durationSeconds: v.optional(v.number()),
  metadata: v.optional(v.any()),
  firstSourceCanvasId: v.optional(v.id("canvases")),
  firstSourceNodeId: v.optional(v.id("nodes")),
});

type MediaItemStorageRef = {
  storageId?: Id<"_storage">;
  previewStorageId?: Id<"_storage">;
};

type UpsertMediaArgs = {
  ownerId: string;
  input: MediaArchiveInput;
  now?: number;
};

type MediaInsertValue = Omit<Doc<"mediaItems">, "_id" | "_creationTime">;

type LegacyMediaBackfillCanvas = Pick<Doc<"canvases">, "_id" | "ownerId">;
type LegacyMediaBackfillNode = Pick<Doc<"nodes">, "_id" | "canvasId" | "type" | "data">;

export type LegacyMediaBackfillCanvasResult = {
  scannedNodeCount: number;
  upsertedItemCount: number;
};

function normalizeMediaLibraryLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return MEDIA_LIBRARY_DEFAULT_LIMIT;
  }

  return Math.min(MEDIA_LIBRARY_MAX_LIMIT, Math.max(MEDIA_LIBRARY_MIN_LIMIT, Math.floor(limit)));
}

function compactUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function toStorageId(value: unknown): Id<"_storage"> | undefined {
  const storageId = asNonEmptyString(value);
  return storageId as Id<"_storage"> | undefined;
}

export function mapLegacyNodeToMediaArchiveInput(node: LegacyMediaBackfillNode): MediaArchiveInput | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const firstSourceCanvasId = node.canvasId;
  const firstSourceNodeId = node._id;

  if (node.type === "image") {
    const storageId = toStorageId(data.storageId);
    const legacyUrl = asNonEmptyString(data.url);
    if (!storageId && !legacyUrl) {
      return null;
    }

    return {
      kind: "image",
      source: "upload",
      dedupeKey: storageId ? buildStoredMediaDedupeKey(storageId) : `legacy:image-url:${legacyUrl}`,
      storageId,
      filename: asNonEmptyString(data.originalFilename) ?? asNonEmptyString(data.filename),
      mimeType: asNonEmptyString(data.mimeType),
      width: asPositiveNumber(data.width),
      height: asPositiveNumber(data.height),
      metadata: legacyUrl ? { legacyUrl } : undefined,
      firstSourceCanvasId,
      firstSourceNodeId,
    };
  }

  if (node.type === "ai-image") {
    const storageId = toStorageId(data.storageId);
    if (!storageId) {
      return null;
    }

    return {
      kind: "image",
      source: "ai-image",
      dedupeKey: buildStoredMediaDedupeKey(storageId),
      storageId,
      width: asPositiveNumber(data.width),
      height: asPositiveNumber(data.height),
      firstSourceCanvasId,
      firstSourceNodeId,
    };
  }

  if (node.type === "ai-video") {
    const storageId = toStorageId(data.storageId);
    if (!storageId) {
      return null;
    }

    return {
      kind: "video",
      source: "ai-video",
      dedupeKey: buildStoredMediaDedupeKey(storageId),
      storageId,
      durationSeconds: asPositiveNumber(data.durationSeconds),
      firstSourceCanvasId,
      firstSourceNodeId,
    };
  }

  if (node.type === "asset") {
    const sourceUrl = asNonEmptyString(data.sourceUrl);
    const assetType = asNonEmptyString(data.assetType) ?? "photo";
    const providerAssetId =
      typeof data.assetId === "number" || typeof data.assetId === "string"
        ? String(data.assetId)
        : undefined;

    const dedupeKey = providerAssetId
      ? buildFreepikAssetDedupeKey(assetType, providerAssetId)
      : sourceUrl
        ? `freepik:url:${sourceUrl}`
        : undefined;

    if (!dedupeKey) {
      return null;
    }

    return {
      kind: "asset",
      source: "freepik-asset",
      dedupeKey,
      title: asNonEmptyString(data.title),
      originalUrl: asNonEmptyString(data.url),
      previewUrl: asNonEmptyString(data.previewUrl) ?? asNonEmptyString(data.url),
      sourceUrl,
      providerAssetId,
      width: asPositiveNumber(data.intrinsicWidth),
      height: asPositiveNumber(data.intrinsicHeight),
      metadata: compactUndefined({
        assetType,
        authorName: asNonEmptyString(data.authorName),
        license: asNonEmptyString(data.license),
        orientation: asNonEmptyString(data.orientation),
      }),
      firstSourceCanvasId,
      firstSourceNodeId,
    };
  }

  if (node.type === "video") {
    const originalUrl = asNonEmptyString(data.mp4Url);
    const sourceUrl =
      asNonEmptyString((data.attribution as { videoUrl?: unknown } | undefined)?.videoUrl) ??
      asNonEmptyString(data.sourceUrl);
    const providerAssetId =
      typeof data.pexelsId === "number" || typeof data.pexelsId === "string"
        ? String(data.pexelsId)
        : undefined;

    const dedupeKey = providerAssetId
      ? buildPexelsVideoDedupeKey(providerAssetId)
      : sourceUrl
        ? `pexels:url:${sourceUrl}`
        : originalUrl
          ? `pexels:mp4:${originalUrl}`
          : undefined;

    if (!dedupeKey) {
      return null;
    }

    return {
      kind: "video",
      source: "pexels-video",
      dedupeKey,
      originalUrl,
      previewUrl: asNonEmptyString(data.thumbnailUrl),
      sourceUrl,
      providerAssetId,
      width: asPositiveNumber(data.width),
      height: asPositiveNumber(data.height),
      durationSeconds: asPositiveNumber(data.duration),
      firstSourceCanvasId,
      firstSourceNodeId,
    };
  }

  return null;
}

export async function backfillLegacyMediaForCanvas(
  ctx: MutationCtx,
  args: {
    canvas: LegacyMediaBackfillCanvas;
    nodes: LegacyMediaBackfillNode[];
    now?: number;
  },
): Promise<LegacyMediaBackfillCanvasResult> {
  const now = args.now ?? Date.now();
  let upsertedItemCount = 0;

  for (const node of args.nodes) {
    const input = mapLegacyNodeToMediaArchiveInput(node);
    if (!input) {
      continue;
    }

    await upsertMediaItemByOwnerAndDedupe(ctx, {
      ownerId: args.canvas.ownerId,
      input,
      now,
    });
    upsertedItemCount += 1;
  }

  return {
    scannedNodeCount: args.nodes.length,
    upsertedItemCount,
  };
}

export function collectOwnedMediaStorageIds(items: Array<MediaItemStorageRef>): Set<Id<"_storage">> {
  const ids = new Set<Id<"_storage">>();

  for (const item of items) {
    if (item.storageId) {
      ids.add(item.storageId);
    }
    if (item.previewStorageId) {
      ids.add(item.previewStorageId);
    }
  }

  return ids;
}

export function listMediaArchiveItems(
  rows: Array<Doc<"mediaItems">>,
  options?: { kind?: MediaArchiveKind; limit?: number },
): MediaArchiveListItem[] {
  const normalizedLimit = normalizeMediaLibraryLimit(options?.limit);
  const filteredRows = rows
    .filter((row) => (options?.kind ? row.kind === options.kind : true))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, normalizedLimit);

  return filteredRows.map((row) =>
    mapMediaArchiveRowToListItem({
      ...row,
      _id: row._id,
    }),
  );
}

export async function upsertMediaItemByOwnerAndDedupe(
  ctx: MutationCtx,
  { ownerId, input, now = Date.now() }: UpsertMediaArgs,
): Promise<Doc<"mediaItems">> {
  const normalizedInput = normalizeMediaArchiveInput(input);

  const existing = await ctx.db
    .query("mediaItems")
    .withIndex("by_owner_dedupe", (q) => q.eq("ownerId", ownerId).eq("dedupeKey", input.dedupeKey))
    .unique();

  if (existing) {
    const patchValue = compactUndefined({
      ...normalizedInput,
      updatedAt: now,
      lastUsedAt: now,
    }) as Partial<MediaInsertValue>;

    await ctx.db.patch(
      existing._id,
      patchValue,
    );
    const updated = await ctx.db.get(existing._id);
    if (!updated) {
      throw new Error("media item vanished after patch");
    }
    return updated;
  }

  const insertValue: MediaInsertValue = compactUndefined({
      ownerId,
      ...normalizedInput,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    }) as MediaInsertValue;
  const insertedId = await ctx.db.insert("mediaItems", insertValue);
  const inserted = await ctx.db.get(insertedId);
  if (!inserted) {
    throw new Error("failed to read inserted media item");
  }

  return inserted;
}

export const list = query({
  args: {
    kind: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("asset"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { kind, limit }) => {
    const user = await requireAuth(ctx);
    const rows = await ctx.db
      .query("mediaItems")
      .withIndex("by_owner_updated", (q) => q.eq("ownerId", user.userId))
      .order("desc")
      .take(normalizeMediaLibraryLimit(limit));

    return listMediaArchiveItems(rows, { kind, limit });
  },
});

export const listByOwnerInternal = internalQuery({
  args: {
    ownerId: v.string(),
    kind: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("asset"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { ownerId, kind, limit }) => {
    const rows = await ctx.db
      .query("mediaItems")
      .withIndex("by_owner_updated", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(normalizeMediaLibraryLimit(limit));

    return listMediaArchiveItems(rows, { kind, limit });
  },
});

export const upsert = mutation({
  args: {
    input: mediaArchiveInputValidator,
  },
  handler: async (ctx, { input }) => {
    const user = await requireAuth(ctx);
    return await upsertMediaItemByOwnerAndDedupe(ctx, {
      ownerId: user.userId,
      input,
    });
  },
});

export const upsertForOwnerInternal = internalMutation({
  args: {
    ownerId: v.string(),
    input: mediaArchiveInputValidator,
  },
  handler: async (ctx, { ownerId, input }) => {
    return await upsertMediaItemByOwnerAndDedupe(ctx, {
      ownerId,
      input,
    });
  },
});
