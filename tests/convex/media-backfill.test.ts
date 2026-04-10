import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/helpers", () => ({
  requireAuth: vi.fn(),
  optionalAuth: vi.fn(),
}));

import type { Id } from "@/convex/_generated/dataModel";
import {
  backfillLegacyMediaForCanvas,
  mapLegacyNodeToMediaArchiveInput,
} from "@/convex/media";
import { backfillMediaArchiveBatch } from "@/convex/migrations";
import {
  buildFreepikAssetDedupeKey,
  buildPexelsVideoDedupeKey,
  buildStoredMediaDedupeKey,
} from "@/lib/media-archive";

type MockCanvas = {
  _id: Id<"canvases">;
  ownerId: string;
};

type MockNode = {
  _id: Id<"nodes">;
  canvasId: Id<"canvases">;
  type: string;
  data: Record<string, unknown>;
};

type MockMediaItem = {
  _id: Id<"mediaItems">;
  ownerId: string;
  dedupeKey: string;
  kind: "image" | "video" | "asset";
  source: "upload" | "ai-image" | "ai-video" | "freepik-asset" | "pexels-video";
  storageId?: Id<"_storage">;
  providerAssetId?: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
};

function createMockDb(args: {
  canvases: MockCanvas[];
  nodes: MockNode[];
  mediaItems?: MockMediaItem[];
}) {
  const rows = [...(args.mediaItems ?? [])];

  const db = {
    query: (table: "canvases" | "nodes" | "mediaItems") => {
      if (table === "canvases") {
        return {
          order: (direction: "asc" | "desc") => {
            expect(direction).toBe("asc");
            return {
              collect: async () => [...args.canvases],
            };
          },
        };
      }

      if (table === "nodes") {
        return {
          withIndex: (
            index: "by_canvas",
            apply: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
          ) => {
            expect(index).toBe("by_canvas");

            const clauses: Array<{ field: string; value: unknown }> = [];
            const queryBuilder = {
              eq(field: string, value: unknown) {
                clauses.push({ field, value });
                return this;
              },
            };

            apply(queryBuilder);

            return {
              collect: async () => {
                const canvasId = clauses.find((clause) => clause.field === "canvasId")?.value;
                return args.nodes.filter((node) => node.canvasId === canvasId);
              },
            };
          },
        };
      }

      return {
        withIndex: (
          index: "by_owner_dedupe",
          apply: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
        ) => {
          expect(index).toBe("by_owner_dedupe");

          const clauses: Array<{ field: string; value: unknown }> = [];
          const queryBuilder = {
            eq(field: string, value: unknown) {
              clauses.push({ field, value });
              return this;
            },
          };

          apply(queryBuilder);

          return {
            unique: async () => {
              const ownerId = clauses.find((clause) => clause.field === "ownerId")?.value;
              const dedupeKey = clauses.find((clause) => clause.field === "dedupeKey")?.value;
              return rows.find((row) => row.ownerId === ownerId && row.dedupeKey === dedupeKey) ?? null;
            },
          };
        },
      };
    },
    insert: async (_table: "mediaItems", value: Omit<MockMediaItem, "_id">) => {
      const inserted = {
        _id: `media_${rows.length + 1}` as Id<"mediaItems">,
        ...value,
      };
      rows.push(inserted);
      return inserted._id;
    },
    patch: async (id: Id<"mediaItems">, patchValue: Partial<MockMediaItem>) => {
      const row = rows.find((entry) => entry._id === id);
      if (!row) {
        throw new Error("missing row");
      }
      Object.assign(row, patchValue);
    },
    get: async (id: Id<"mediaItems">) => {
      return rows.find((entry) => entry._id === id) ?? null;
    },
  };

  return { db, rows };
}

describe("media backfill", () => {
  it("converts supported legacy node types into media archive inputs", () => {
    const imageStorageId = "storage_image_1" as Id<"_storage">;
    const aiImageStorageId = "storage_ai_image_1" as Id<"_storage">;
    const aiVideoStorageId = "storage_ai_video_1" as Id<"_storage">;

    expect(
      mapLegacyNodeToMediaArchiveInput({
        _id: "node_image" as Id<"nodes">,
        canvasId: "canvas_1" as Id<"canvases">,
        type: "image",
        data: {
          storageId: imageStorageId,
          mimeType: "image/png",
          width: 1920,
          height: 1080,
        },
      }),
    ).toMatchObject({
      kind: "image",
      source: "upload",
      dedupeKey: buildStoredMediaDedupeKey(imageStorageId),
      storageId: imageStorageId,
      mimeType: "image/png",
      width: 1920,
      height: 1080,
    });

    expect(
      mapLegacyNodeToMediaArchiveInput({
        _id: "node_ai_image" as Id<"nodes">,
        canvasId: "canvas_1" as Id<"canvases">,
        type: "ai-image",
        data: {
          storageId: aiImageStorageId,
        },
      }),
    ).toMatchObject({
      kind: "image",
      source: "ai-image",
      dedupeKey: buildStoredMediaDedupeKey(aiImageStorageId),
      storageId: aiImageStorageId,
    });

    expect(
      mapLegacyNodeToMediaArchiveInput({
        _id: "node_ai_video" as Id<"nodes">,
        canvasId: "canvas_1" as Id<"canvases">,
        type: "ai-video",
        data: {
          storageId: aiVideoStorageId,
          durationSeconds: 10,
        },
      }),
    ).toMatchObject({
      kind: "video",
      source: "ai-video",
      dedupeKey: buildStoredMediaDedupeKey(aiVideoStorageId),
      storageId: aiVideoStorageId,
      durationSeconds: 10,
    });

    expect(
      mapLegacyNodeToMediaArchiveInput({
        _id: "node_asset" as Id<"nodes">,
        canvasId: "canvas_1" as Id<"canvases">,
        type: "asset",
        data: {
          assetId: 123,
          assetType: "photo",
          sourceUrl: "https://www.freepik.com/asset/123",
          previewUrl: "https://cdn.freepik.com/preview/123.jpg",
        },
      }),
    ).toMatchObject({
      kind: "asset",
      source: "freepik-asset",
      dedupeKey: buildFreepikAssetDedupeKey("photo", 123),
      providerAssetId: "123",
      sourceUrl: "https://www.freepik.com/asset/123",
      previewUrl: "https://cdn.freepik.com/preview/123.jpg",
    });

    expect(
      mapLegacyNodeToMediaArchiveInput({
        _id: "node_video" as Id<"nodes">,
        canvasId: "canvas_1" as Id<"canvases">,
        type: "video",
        data: {
          pexelsId: 987,
          mp4Url: "https://videos.pexels.com/video-files/987.mp4",
          thumbnailUrl: "https://images.pexels.com/videos/987.jpg",
          duration: 42,
          attribution: {
            videoUrl: "https://www.pexels.com/video/987/",
          },
        },
      }),
    ).toMatchObject({
      kind: "video",
      source: "pexels-video",
      dedupeKey: buildPexelsVideoDedupeKey(987),
      providerAssetId: "987",
      originalUrl: "https://videos.pexels.com/video-files/987.mp4",
      previewUrl: "https://images.pexels.com/videos/987.jpg",
      sourceUrl: "https://www.pexels.com/video/987/",
      durationSeconds: 42,
    });
  });

  it("collapses duplicates through upsert and remains idempotent", async () => {
    const storageId = "storage_shared" as Id<"_storage">;
    const canvas: MockCanvas = { _id: "canvas_1" as Id<"canvases">, ownerId: "user_1" };
    const nodes: MockNode[] = [
      {
        _id: "node_1" as Id<"nodes">,
        canvasId: canvas._id,
        type: "image",
        data: { storageId },
      },
      {
        _id: "node_2" as Id<"nodes">,
        canvasId: canvas._id,
        type: "ai-image",
        data: { storageId },
      },
    ];
    const { db, rows } = createMockDb({ canvases: [canvas], nodes });

    await backfillLegacyMediaForCanvas(
      { db } as never,
      {
        canvas,
        nodes,
        now: 1700000000000,
      },
    );

    await backfillLegacyMediaForCanvas(
      { db } as never,
      {
        canvas,
        nodes,
        now: 1700000000100,
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe(buildStoredMediaDedupeKey(storageId));
    expect(rows[0].updatedAt).toBe(1700000000100);
  });

  it("supports resumable cursor progression across batches", async () => {
    const canvases: MockCanvas[] = [
      { _id: "canvas_1" as Id<"canvases">, ownerId: "user_1" },
      { _id: "canvas_2" as Id<"canvases">, ownerId: "user_1" },
      { _id: "canvas_3" as Id<"canvases">, ownerId: "user_2" },
    ];
    const nodes: MockNode[] = [
      {
        _id: "node_1" as Id<"nodes">,
        canvasId: canvases[0]._id,
        type: "image",
        data: { storageId: "storage_1" as Id<"_storage"> },
      },
      {
        _id: "node_2" as Id<"nodes">,
        canvasId: canvases[1]._id,
        type: "image",
        data: { storageId: "storage_2" as Id<"_storage"> },
      },
      {
        _id: "node_3" as Id<"nodes">,
        canvasId: canvases[2]._id,
        type: "image",
        data: { storageId: "storage_3" as Id<"_storage"> },
      },
    ];
    const { db, rows } = createMockDb({ canvases, nodes });

    const first = await backfillMediaArchiveBatch(
      { db } as never,
      { batchSize: 1, now: 1700000000000 },
    );
    expect(first).toMatchObject({
      processedCanvasCount: 1,
      done: false,
      nextCursor: canvases[0]._id,
    });
    expect(rows).toHaveLength(1);

    const second = await backfillMediaArchiveBatch(
      { db } as never,
      { batchSize: 1, cursor: first.nextCursor, now: 1700000000100 },
    );
    expect(second).toMatchObject({
      processedCanvasCount: 1,
      done: false,
      nextCursor: canvases[1]._id,
    });
    expect(rows).toHaveLength(2);

    const third = await backfillMediaArchiveBatch(
      { db } as never,
      { batchSize: 1, cursor: second.nextCursor, now: 1700000000200 },
    );
    expect(third).toMatchObject({
      processedCanvasCount: 1,
      done: true,
      nextCursor: canvases[2]._id,
    });
    expect(rows).toHaveLength(3);
  });
});
