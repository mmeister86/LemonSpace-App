import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

import { optionalAuth } from "./helpers";
import { prioritizeRecentCreditTransactions } from "../lib/credits-activity";
import { MONTHLY_TIER_CREDITS, normalizeBillingTier } from "../lib/tier-credits";

const DEFAULT_TIER = "free" as const;
const DEFAULT_SUBSCRIPTION_STATUS = "active" as const;
const DASHBOARD_MEDIA_PREVIEW_LIMIT = 8;
const MEDIA_LIBRARY_DEFAULT_LIMIT = 8;
const MEDIA_LIBRARY_MIN_LIMIT = 1;
const MEDIA_LIBRARY_MAX_LIMIT = 500;
const MEDIA_ARCHIVE_FETCH_MULTIPLIER = 4;

type MediaPreviewItem = {
  kind: "image" | "video" | "asset";
  source: "upload" | "ai-image" | "ai-video" | "freepik-asset" | "pexels-video";
  storageId?: Id<"_storage">;
  previewStorageId?: Id<"_storage">;
  originalUrl?: string;
  previewUrl?: string;
  sourceUrl?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  previewWidth?: number;
  previewHeight?: number;
  durationSeconds?: number;
  sourceCanvasId?: Id<"canvases">;
  sourceNodeId?: Id<"nodes">;
  createdAt: number;
};

function readArchivedMediaPreview(item: Doc<"mediaItems">): MediaPreviewItem | null {
  if (!item.storageId && !item.previewStorageId && !item.previewUrl && !item.originalUrl && !item.sourceUrl) {
    return null;
  }

  return {
    kind: item.kind,
    source: item.source,
    storageId: item.storageId,
    previewStorageId: item.previewStorageId,
    originalUrl: item.originalUrl,
    previewUrl: item.previewUrl,
    sourceUrl: item.sourceUrl,
    filename: item.filename ?? item.title,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    durationSeconds: item.durationSeconds,
    sourceCanvasId: item.firstSourceCanvasId,
    sourceNodeId: item.firstSourceNodeId,
    createdAt: item.updatedAt,
  };
}

function buildMediaPreviewFromArchive(
  mediaItems: Array<Doc<"mediaItems">>,
  limit: number,
  kindFilter?: "image" | "video" | "asset",
): MediaPreviewItem[] {
  const sortedRows = mediaItems
    .filter((item) => (kindFilter ? item.kind === kindFilter : true))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const deduped = new Map<string, MediaPreviewItem>();
  for (const item of sortedRows) {
    const dedupeKey = item.storageId ?? item.dedupeKey;
    if (deduped.has(dedupeKey)) {
      continue;
    }

    const preview = readArchivedMediaPreview(item);
    if (!preview) {
      continue;
    }

    deduped.set(dedupeKey, preview);
    if (deduped.size >= limit) {
      break;
    }
  }

  return [...deduped.values()];
}

function readImageMediaPreview(node: Doc<"nodes">): MediaPreviewItem | null {
  if (node.type !== "image") {
    return null;
  }

  const data = (node.data as Record<string, unknown> | undefined) ?? {};
  const storageId = data.storageId;
  if (typeof storageId !== "string" || storageId.length === 0) {
    return null;
  }
  const previewStorageId =
    typeof data.previewStorageId === "string" && data.previewStorageId.length > 0
      ? (data.previewStorageId as Id<"_storage">)
      : undefined;

  const filename =
    typeof data.filename === "string"
      ? data.filename
      : typeof data.originalFilename === "string"
        ? data.originalFilename
        : undefined;
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : undefined;
  const width = typeof data.width === "number" && Number.isFinite(data.width) ? data.width : undefined;
  const height =
    typeof data.height === "number" && Number.isFinite(data.height) ? data.height : undefined;
  const previewWidth =
    typeof data.previewWidth === "number" && Number.isFinite(data.previewWidth)
      ? data.previewWidth
      : undefined;
  const previewHeight =
    typeof data.previewHeight === "number" && Number.isFinite(data.previewHeight)
      ? data.previewHeight
      : undefined;

  return {
    kind: "image",
    source: "upload",
    storageId: storageId as Id<"_storage">,
    previewStorageId,
    filename,
    mimeType,
    width,
    height,
    previewWidth,
    previewHeight,
    sourceCanvasId: node.canvasId,
    sourceNodeId: node._id,
    createdAt: node._creationTime,
  };
}

function buildMediaPreview(nodes: Array<Doc<"nodes">>, limit: number): MediaPreviewItem[] {
  const candidates = nodes
    .map(readImageMediaPreview)
    .filter((item): item is MediaPreviewItem => item !== null)
    .sort((a, b) => b.createdAt - a.createdAt);

  const deduped = new Map<string, MediaPreviewItem>();
  for (const item of candidates) {
    const dedupeKey = item.storageId ?? `${item.sourceCanvasId}:${item.sourceNodeId}`;
    if (deduped.has(dedupeKey)) {
      continue;
    }

    deduped.set(dedupeKey, item);
    if (deduped.size >= limit) {
      break;
    }
  }

  return [...deduped.values()];
}

function normalizeMediaLibraryLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return MEDIA_LIBRARY_DEFAULT_LIMIT;
  }

  return Math.min(MEDIA_LIBRARY_MAX_LIMIT, Math.max(MEDIA_LIBRARY_MIN_LIMIT, Math.floor(limit)));
}

function normalizeMediaLibraryPage(page: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.max(1, Math.floor(page));
}

async function buildMediaPreviewFromNodeFallback(
  ctx: QueryCtx,
  canvases: Array<Doc<"canvases">>,
  limit: number,
): Promise<MediaPreviewItem[]> {
  if (canvases.length === 0 || limit <= 0) {
    return [];
  }

  const deduped = new Map<string, MediaPreviewItem>();
  for (const canvas of canvases.slice(0, 12)) {
    if (deduped.size >= limit) {
      break;
    }

    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_canvas_type", (q) => q.eq("canvasId", canvas._id).eq("type", "image"))
      .order("desc")
      .take(Math.max(limit * 2, 16));
    const candidates = buildMediaPreview(nodes, limit);

    for (const candidate of candidates) {
      const dedupeKey = candidate.storageId ?? `${candidate.sourceCanvasId}:${candidate.sourceNodeId}`;
      if (deduped.has(dedupeKey)) {
        continue;
      }
      deduped.set(dedupeKey, candidate);
      if (deduped.size >= limit) {
        break;
      }
    }
  }

  return [...deduped.values()].slice(0, limit);
}

export const getSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);

    if (!user) {
      return {
        balance: { balance: 0, reserved: 0, available: 0, monthlyAllocation: 0 },
        subscription: {
          tier: DEFAULT_TIER,
          status: DEFAULT_SUBSCRIPTION_STATUS,
          currentPeriodEnd: undefined,
        },
        usageStats: {
          monthlyUsage: 0,
          totalGenerations: 0,
          monthlyCredits: MONTHLY_TIER_CREDITS[DEFAULT_TIER],
        },
        recentTransactions: [],
        canvases: [],
        mediaPreview: [],
        generatedAt: Date.now(),
      };
    }

    const [balanceRow, subscriptionRow, usageTransactions, recentTransactionsRaw, canvases, mediaArchiveRows] =
      await Promise.all([
        ctx.db
          .query("creditBalances")
          .withIndex("by_user", (q) => q.eq("userId", user.userId))
          .unique(),
        ctx.db
          .query("subscriptions")
          .withIndex("by_user", (q) => q.eq("userId", user.userId))
          .order("desc")
          .first(),
        ctx.db
          .query("creditTransactions")
          .withIndex("by_user_type", (q) => q.eq("userId", user.userId).eq("type", "usage"))
          .order("desc")
          .collect(),
        ctx.db
          .query("creditTransactions")
          .withIndex("by_user", (q) => q.eq("userId", user.userId))
          .order("desc")
          .take(80),
        ctx.db
          .query("canvases")
          .withIndex("by_owner_updated", (q) => q.eq("ownerId", user.userId))
          .order("desc")
          .collect(),
        ctx.db
          .query("mediaItems")
          .withIndex("by_owner_updated", (q) => q.eq("ownerId", user.userId))
          .order("desc")
          .take(Math.max(DASHBOARD_MEDIA_PREVIEW_LIMIT * MEDIA_ARCHIVE_FETCH_MULTIPLIER, 32)),
      ]);

    let mediaPreview = buildMediaPreviewFromArchive(mediaArchiveRows, DASHBOARD_MEDIA_PREVIEW_LIMIT);
    if (mediaPreview.length === 0 && mediaArchiveRows.length === 0) {
      mediaPreview = await buildMediaPreviewFromNodeFallback(ctx, canvases, DASHBOARD_MEDIA_PREVIEW_LIMIT);
    }

    const tier = normalizeBillingTier(subscriptionRow?.tier);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    let monthlyUsage = 0;
    let totalGenerations = 0;

    for (const transaction of usageTransactions) {
      if (transaction._creationTime < monthStart) {
        break;
      }

      if (transaction.status === "committed") {
        monthlyUsage += Math.abs(transaction.amount);
        totalGenerations += 1;
      }
    }

    const balance = {
      balance: balanceRow?.balance ?? 0,
      reserved: balanceRow?.reserved ?? 0,
      available: (balanceRow?.balance ?? 0) - (balanceRow?.reserved ?? 0),
      monthlyAllocation: balanceRow?.monthlyAllocation ?? MONTHLY_TIER_CREDITS[tier],
    };

    return {
      balance,
      subscription: {
        tier: subscriptionRow?.tier ?? DEFAULT_TIER,
        status: subscriptionRow?.status ?? DEFAULT_SUBSCRIPTION_STATUS,
        currentPeriodEnd: subscriptionRow?.currentPeriodEnd,
      },
      usageStats: {
        monthlyUsage,
        totalGenerations,
        monthlyCredits: MONTHLY_TIER_CREDITS[tier],
      },
      recentTransactions: prioritizeRecentCreditTransactions(recentTransactionsRaw, 5),
      canvases,
      mediaPreview,
      generatedAt: Date.now(),
    };
  },
});

export const listMediaLibrary = query({
  args: {
    page: v.number(),
    pageSize: v.optional(v.number()),
    kindFilter: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("asset"))),
  },
  handler: async (ctx, { page, pageSize, kindFilter }) => {
    const normalizedPage = normalizeMediaLibraryPage(page);
    const normalizedPageSize = normalizeMediaLibraryLimit(pageSize);

    const user = await optionalAuth(ctx);
    if (!user) {
      return {
        items: [],
        page: normalizedPage,
        pageSize: normalizedPageSize,
        totalPages: 0,
        totalCount: 0,
      };
    }

    const mediaArchiveRows = kindFilter
      ? await ctx.db
          .query("mediaItems")
          .withIndex("by_owner_kind_updated", (q) => q.eq("ownerId", user.userId).eq("kind", kindFilter))
          .order("desc")
          .collect()
      : await ctx.db
          .query("mediaItems")
          .withIndex("by_owner_updated", (q) => q.eq("ownerId", user.userId))
          .order("desc")
          .collect();
    const mediaFromArchive = buildMediaPreviewFromArchive(mediaArchiveRows, mediaArchiveRows.length, kindFilter);
    if (mediaFromArchive.length > 0 || mediaArchiveRows.length > 0) {
      const totalCount = mediaFromArchive.length;
      const totalPages = totalCount > 0 ? Math.ceil(totalCount / normalizedPageSize) : 0;
      const offset = (normalizedPage - 1) * normalizedPageSize;

      return {
        items: mediaFromArchive.slice(offset, offset + normalizedPageSize),
        page: normalizedPage,
        pageSize: normalizedPageSize,
        totalPages,
        totalCount,
      };
    }

    if (kindFilter && kindFilter !== "image") {
      return {
        items: [],
        page: normalizedPage,
        pageSize: normalizedPageSize,
        totalPages: 0,
        totalCount: 0,
      };
    }

    const canvases = await ctx.db
      .query("canvases")
      .withIndex("by_owner_updated", (q) => q.eq("ownerId", user.userId))
      .order("desc")
      .collect();

    const mediaFromNodeFallback = await buildMediaPreviewFromNodeFallback(
      ctx,
      canvases,
      Math.max(normalizedPage * normalizedPageSize * MEDIA_ARCHIVE_FETCH_MULTIPLIER, normalizedPageSize),
    );
    const totalCount = mediaFromNodeFallback.length;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / normalizedPageSize) : 0;
    const offset = (normalizedPage - 1) * normalizedPageSize;

    return {
      items: mediaFromNodeFallback.slice(offset, offset + normalizedPageSize),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages,
      totalCount,
    };
  },
});
