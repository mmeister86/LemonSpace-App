import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/helpers", () => ({
  requireAuth: vi.fn(),
  optionalAuth: vi.fn(),
}));

import type { Id } from "@/convex/_generated/dataModel";
import { finalizeImageSuccess, finalizeVideoSuccess } from "@/convex/ai";
import {
  collectOwnedMediaStorageIds,
  listMediaArchiveItems,
  upsertMediaItemByOwnerAndDedupe,
} from "@/convex/media";
import { listMediaLibrary } from "@/convex/dashboard";
import {
  registerUploadedImageMedia,
  registerUploadedVideoMedia,
  verifyOwnedStorageIds,
} from "@/convex/storage";
import { buildStoredMediaDedupeKey } from "@/lib/media-archive";
import { optionalAuth, requireAuth } from "@/convex/helpers";

type MockMediaItem = {
  _id: Id<"mediaItems">;
  ownerId: string;
  dedupeKey: string;
  kind: "image" | "video" | "asset";
  source: "upload" | "ai-image" | "ai-video" | "freepik-asset" | "pexels-video";
  storageId?: Id<"_storage">;
  previewStorageId?: Id<"_storage">;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  firstSourceCanvasId?: Id<"canvases">;
  firstSourceNodeId?: Id<"nodes">;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
};

function createMockDb(initialRows: MockMediaItem[] = []) {
  const rows = [...initialRows];

  return {
    rows,
    db: {
      query: (table: "mediaItems") => {
        expect(table).toBe("mediaItems");

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

                return (
                  rows.find((row) => row.ownerId === ownerId && row.dedupeKey === dedupeKey) ?? null
                );
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
      patch: async (id: Id<"mediaItems">, patch: Partial<MockMediaItem>) => {
        const row = rows.find((entry) => entry._id === id);
        if (!row) {
          throw new Error("row missing");
        }
        Object.assign(row, patch);
      },
      get: async (id: Id<"mediaItems">) => rows.find((entry) => entry._id === id) ?? null,
    },
  };
}

type MockDashboardMediaItem = {
  _id: Id<"mediaItems">;
  _creationTime: number;
  ownerId: string;
  dedupeKey: string;
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
  updatedAt: number;
};

function createListMediaLibraryCtx(mediaItems: MockDashboardMediaItem[]) {
  return {
    db: {
      query: vi.fn((table: string) => {
        if (table === "mediaItems") {
          return {
            withIndex: vi.fn(
              (
                index: "by_owner_updated" | "by_owner_kind_updated",
                apply: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
              ) => {
                const clauses: Array<{ field: string; value: unknown }> = [];
                const queryBuilder = {
                  eq(field: string, value: unknown) {
                    clauses.push({ field, value });
                    return this;
                  },
                };
                apply(queryBuilder);

                let filtered = [...mediaItems];
                const ownerId = clauses.find((clause) => clause.field === "ownerId")?.value;
                if (ownerId) {
                  filtered = filtered.filter((item) => item.ownerId === ownerId);
                }

                if (index === "by_owner_kind_updated") {
                  const kind = clauses.find((clause) => clause.field === "kind")?.value;
                  filtered = filtered.filter((item) => item.kind === kind);
                }

                const sorted = filtered.sort((a, b) => b.updatedAt - a.updatedAt);

                return {
                  order: vi.fn((direction: "desc") => {
                    expect(direction).toBe("desc");
                    return {
                      collect: vi.fn(async () => sorted),
                      take: vi.fn(async (count: number) => sorted.slice(0, count)),
                    };
                  }),
                };
              },
            ),
          };
        }

        if (table === "canvases") {
          return {
            withIndex: vi.fn(() => ({
              order: vi.fn(() => ({
                collect: vi.fn(async () => []),
              })),
            })),
          };
        }

        if (table === "nodes") {
          return {
            withIndex: vi.fn(() => ({
              order: vi.fn(() => ({
                take: vi.fn(async () => []),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table query: ${table}`);
      }),
    },
  };
}

describe("media archive", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists media ordered by updatedAt desc and supports kind filter", () => {
    const media = listMediaArchiveItems(
      [
        {
          _id: "media_1" as Id<"mediaItems">,
          _creationTime: 1,
          ownerId: "user_1",
          dedupeKey: "storage:s1",
          kind: "image",
          source: "upload",
          createdAt: 1,
          updatedAt: 10,
          lastUsedAt: 10,
        },
        {
          _id: "media_2" as Id<"mediaItems">,
          _creationTime: 2,
          ownerId: "user_1",
          dedupeKey: "storage:s2",
          kind: "video",
          source: "ai-video",
          createdAt: 2,
          updatedAt: 50,
          lastUsedAt: 50,
        },
        {
          _id: "media_3" as Id<"mediaItems">,
          _creationTime: 3,
          ownerId: "user_1",
          dedupeKey: "storage:s3",
          kind: "image",
          source: "ai-image",
          createdAt: 3,
          updatedAt: 30,
          lastUsedAt: 30,
        },
      ],
      { kind: "image", limit: 2 },
    );

    expect(media.map((item) => item.id)).toEqual(["media_3", "media_1"]);
    expect(media.every((item) => item.kind === "image")).toBe(true);
  });

  it("upserts idempotently by owner+dedupe", async () => {
    const now = 1700000000000;
    const { rows, db } = createMockDb();

    const first = await upsertMediaItemByOwnerAndDedupe(
      { db } as never,
      {
        ownerId: "user_1",
        now,
        input: {
          kind: "image",
          source: "upload",
          dedupeKey: "storage:abc",
          storageId: "storage_abc" as Id<"_storage">,
        },
      },
    );

    const second = await upsertMediaItemByOwnerAndDedupe(
      { db } as never,
      {
        ownerId: "user_1",
        now: now + 5,
        input: {
          kind: "image",
          source: "upload",
          dedupeKey: "storage:abc",
          storageId: "storage_abc" as Id<"_storage">,
        },
      },
    );

    expect(rows).toHaveLength(1);
    expect(second._id).toBe(first._id);
    expect(second.updatedAt).toBe(now + 5);
    expect(second.lastUsedAt).toBe(now + 5);
  });

  it("verifies user media ownership over storage and preview ids", () => {
    const ownedSet = collectOwnedMediaStorageIds([
      {
        storageId: "storage_original" as Id<"_storage">,
        previewStorageId: "storage_preview" as Id<"_storage">,
      },
    ]);

    const result = verifyOwnedStorageIds(
      [
        "storage_preview" as Id<"_storage">,
        "storage_original" as Id<"_storage">,
        "storage_unowned" as Id<"_storage">,
      ],
      ownedSet,
    );

    expect(result.verifiedStorageIds).toEqual([
      "storage_original" as Id<"_storage">,
      "storage_preview" as Id<"_storage">,
    ]);
    expect(result.rejectedStorageIds).toBe(1);
  });

  it("registerUploadedImageMedia persists upload archive entry", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: "user_1" } as never);

    const rows: MockMediaItem[] = [];
    const canvasId = "canvas_1" as Id<"canvases">;
    const nodeId = "node_1" as Id<"nodes">;
    const storageId = "storage_upload_1" as Id<"_storage">;

    const docs = new Map<string, unknown>([
      [canvasId, { _id: canvasId, ownerId: "user_1" }],
      [nodeId, { _id: nodeId, canvasId }],
    ]);

    const db = {
      get: vi.fn(async (id: string) => {
        return rows.find((row) => row._id === id) ?? docs.get(id) ?? null;
      }),
      query: vi.fn((table: "mediaItems") => {
        expect(table).toBe("mediaItems");
        return {
          withIndex: vi.fn(
            (
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
          ),
        };
      }),
      insert: vi.fn(async (_table: "mediaItems", value: Omit<MockMediaItem, "_id">) => {
        const inserted = {
          _id: `media_${rows.length + 1}` as Id<"mediaItems">,
          ...value,
        };
        rows.push(inserted);
        return inserted._id;
      }),
      patch: vi.fn(async (id: Id<"mediaItems">, patch: Partial<MockMediaItem>) => {
        const row = rows.find((entry) => entry._id === id);
        if (!row) throw new Error("row missing");
        Object.assign(row, patch);
      }),
    };

    await (registerUploadedImageMedia as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(
      { db } as never,
      {
        canvasId,
        nodeId,
        storageId,
        filename: "sunset.png",
        mimeType: "image/png",
        width: 1920,
        height: 1080,
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId: "user_1",
      kind: "image",
      source: "upload",
      dedupeKey: buildStoredMediaDedupeKey(storageId),
      storageId,
      filename: "sunset.png",
      mimeType: "image/png",
      width: 1920,
      height: 1080,
      firstSourceCanvasId: canvasId,
      firstSourceNodeId: nodeId,
    });
  });

  it("registerUploadedVideoMedia persists upload archive entry", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: "user_1" } as never);

    const rows: MockMediaItem[] = [];
    const canvasId = "canvas_1" as Id<"canvases">;
    const nodeId = "node_video_1" as Id<"nodes">;
    const storageId = "storage_video_upload_1" as Id<"_storage">;

    const docs = new Map<string, unknown>([
      [canvasId, { _id: canvasId, ownerId: "user_1" }],
      [nodeId, { _id: nodeId, canvasId }],
    ]);

    const db = {
      get: vi.fn(async (id: string) => {
        return rows.find((row) => row._id === id) ?? docs.get(id) ?? null;
      }),
      query: vi.fn((table: "mediaItems") => {
        expect(table).toBe("mediaItems");
        return {
          withIndex: vi.fn(
            (
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
          ),
        };
      }),
      insert: vi.fn(async (_table: "mediaItems", value: Omit<MockMediaItem, "_id">) => {
        const inserted = {
          _id: `media_${rows.length + 1}` as Id<"mediaItems">,
          ...value,
        };
        rows.push(inserted);
        return inserted._id;
      }),
      patch: vi.fn(async (id: Id<"mediaItems">, patch: Partial<MockMediaItem>) => {
        const row = rows.find((entry) => entry._id === id);
        if (!row) throw new Error("row missing");
        Object.assign(row, patch);
      }),
    };

    await (registerUploadedVideoMedia as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    })._handler(
      { db } as never,
      {
        canvasId,
        nodeId,
        storageId,
        filename: "clip.mp4",
        mimeType: "video/mp4",
        width: 1920,
        height: 1080,
        durationSeconds: 12.4,
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId: "user_1",
      kind: "video",
      source: "upload",
      dedupeKey: buildStoredMediaDedupeKey(storageId),
      storageId,
      filename: "clip.mp4",
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
      durationSeconds: 12.4,
      firstSourceCanvasId: canvasId,
      firstSourceNodeId: nodeId,
    });
  });

  it("finalizeImageSuccess writes ai-image archive entry", async () => {
    const rows: MockMediaItem[] = [];
    const now = 1700000000000;
    const nodeId = "node_ai_image_1" as Id<"nodes">;
    const canvasId = "canvas_1" as Id<"canvases">;
    const storageId = "storage_ai_image_1" as Id<"_storage">;

    const nodeDoc = {
      _id: nodeId,
      canvasId,
      data: {},
      status: "executing",
      retryCount: 0,
    };

    const docs = new Map<string, unknown>([
      [nodeId, nodeDoc],
      [canvasId, { _id: canvasId, ownerId: "user_1" }],
    ]);

    vi.spyOn(Date, "now").mockReturnValue(now);

    const db = {
      get: vi.fn(async (id: string) => {
        return rows.find((row) => row._id === id) ?? docs.get(id) ?? null;
      }),
      patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
        const doc = docs.get(id) as Record<string, unknown> | undefined;
        if (!doc) throw new Error("missing doc");
        Object.assign(doc, patch);
      }),
      query: vi.fn((table: "mediaItems") => {
        expect(table).toBe("mediaItems");
        return {
          withIndex: vi.fn(
            (
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
          ),
        };
      }),
      insert: vi.fn(async (_table: "mediaItems", value: Omit<MockMediaItem, "_id">) => {
        const inserted = {
          _id: `media_${rows.length + 1}` as Id<"mediaItems">,
          ...value,
        };
        rows.push(inserted);
        return inserted._id;
      }),
    };

    await (finalizeImageSuccess as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<{ creditCost: number }> })._handler(
      { db } as never,
      {
        nodeId,
        prompt: "cinematic sunset over lake",
        modelId: "google/gemini-2.5-flash-image",
        storageId,
        retryCount: 1,
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId: "user_1",
      kind: "image",
      source: "ai-image",
      dedupeKey: buildStoredMediaDedupeKey(storageId),
      storageId,
      firstSourceCanvasId: canvasId,
      firstSourceNodeId: nodeId,
    });
  });

  it("finalizeVideoSuccess writes ai-video archive entry", async () => {
    const rows: MockMediaItem[] = [];
    const now = 1700000000000;
    const nodeId = "node_ai_video_1" as Id<"nodes">;
    const canvasId = "canvas_1" as Id<"canvases">;
    const storageId = "storage_ai_video_1" as Id<"_storage">;

    const nodeDoc = {
      _id: nodeId,
      canvasId,
      data: {},
      status: "executing",
      retryCount: 0,
    };

    const docs = new Map<string, unknown>([
      [nodeId, nodeDoc],
      [canvasId, { _id: canvasId, ownerId: "user_1" }],
    ]);

    vi.spyOn(Date, "now").mockReturnValue(now);

    const db = {
      get: vi.fn(async (id: string) => {
        return rows.find((row) => row._id === id) ?? docs.get(id) ?? null;
      }),
      patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
        const doc = docs.get(id) as Record<string, unknown> | undefined;
        if (!doc) throw new Error("missing doc");
        Object.assign(doc, patch);
      }),
      query: vi.fn((table: "mediaItems") => {
        expect(table).toBe("mediaItems");
        return {
          withIndex: vi.fn(
            (
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
          ),
        };
      }),
      insert: vi.fn(async (_table: "mediaItems", value: Omit<MockMediaItem, "_id">) => {
        const inserted = {
          _id: `media_${rows.length + 1}` as Id<"mediaItems">,
          ...value,
        };
        rows.push(inserted);
        return inserted._id;
      }),
    };

    await (finalizeVideoSuccess as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler(
      { db } as never,
      {
        nodeId,
        prompt: "camera truck left",
        modelId: "wan-2-2-720p",
        durationSeconds: 5,
        storageId,
        retryCount: 3,
        creditCost: 52,
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId: "user_1",
      kind: "video",
      source: "ai-video",
      dedupeKey: buildStoredMediaDedupeKey(storageId),
      storageId,
      durationSeconds: 5,
      firstSourceCanvasId: canvasId,
      firstSourceNodeId: nodeId,
    });
  });

  it("listMediaLibrary returns paginated object with default page size 8", async () => {
    vi.mocked(optionalAuth).mockResolvedValue({ userId: "user_1" } as never);

    const mediaItems: MockDashboardMediaItem[] = Array.from({ length: 11 }, (_, index) => ({
      _id: `media_${index + 1}` as Id<"mediaItems">,
      _creationTime: index + 1,
      ownerId: "user_1",
      dedupeKey: `storage:s${index + 1}`,
      kind: index % 2 === 0 ? "image" : "video",
      source: index % 2 === 0 ? "upload" : "ai-video",
      storageId: `storage_${index + 1}` as Id<"_storage">,
      updatedAt: 1000 - index,
    }));

    const result = await (listMediaLibrary as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    })._handler(createListMediaLibraryCtx(mediaItems) as never, { page: 1 });

    expect(result).toMatchObject({
      page: 1,
      pageSize: 8,
      totalPages: 2,
      totalCount: 11,
    });
    expect((result as { items: unknown[] }).items).toHaveLength(8);
  });

  it("listMediaLibrary paginates with page and pageSize args", async () => {
    vi.mocked(optionalAuth).mockResolvedValue({ userId: "user_1" } as never);

    const mediaItems: MockDashboardMediaItem[] = Array.from({ length: 12 }, (_, index) => ({
      _id: `media_${index + 1}` as Id<"mediaItems">,
      _creationTime: index + 1,
      ownerId: "user_1",
      dedupeKey: `storage:s${index + 1}`,
      kind: index % 2 === 0 ? "image" : "video",
      source: index % 2 === 0 ? "upload" : "ai-video",
      storageId: `storage_${index + 1}` as Id<"_storage">,
      updatedAt: 2000 - index,
    }));

    const result = await (listMediaLibrary as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    })._handler(createListMediaLibraryCtx(mediaItems) as never, { page: 2, pageSize: 5 });

    expect(result).toMatchObject({
      page: 2,
      pageSize: 5,
      totalPages: 3,
      totalCount: 12,
    });
    expect((result as { items: unknown[] }).items).toHaveLength(5);
  });

  it("listMediaLibrary applies kindFilter with paginated response", async () => {
    vi.mocked(optionalAuth).mockResolvedValue({ userId: "user_1" } as never);

    const mediaItems: MockDashboardMediaItem[] = [
      {
        _id: "media_1" as Id<"mediaItems">,
        _creationTime: 1,
        ownerId: "user_1",
        dedupeKey: "storage:image_1",
        kind: "image",
        source: "upload",
        storageId: "storage_image_1" as Id<"_storage">,
        updatedAt: 100,
      },
      {
        _id: "media_2" as Id<"mediaItems">,
        _creationTime: 2,
        ownerId: "user_1",
        dedupeKey: "storage:video_1",
        kind: "video",
        source: "ai-video",
        storageId: "storage_video_1" as Id<"_storage">,
        updatedAt: 99,
      },
      {
        _id: "media_3" as Id<"mediaItems">,
        _creationTime: 3,
        ownerId: "user_1",
        dedupeKey: "storage:video_2",
        kind: "video",
        source: "ai-video",
        storageId: "storage_video_2" as Id<"_storage">,
        updatedAt: 98,
      },
    ];

    const result = await (listMediaLibrary as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    })._handler(createListMediaLibraryCtx(mediaItems) as never, {
      page: 1,
      pageSize: 1,
      kindFilter: "video",
    });

    expect(result).toMatchObject({
      page: 1,
      pageSize: 1,
      totalPages: 2,
      totalCount: 2,
    });
    expect((result as { items: Array<{ kind: string }> }).items).toEqual([
      expect.objectContaining({ kind: "video" }),
    ]);
  });

  it("listMediaLibrary returns paginated empty shape when unauthenticated", async () => {
    vi.mocked(optionalAuth).mockResolvedValue(null);

    const result = await (listMediaLibrary as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    })._handler(createListMediaLibraryCtx([]) as never, { page: 2, pageSize: 5 });

    expect(result).toEqual({
      items: [],
      page: 2,
      pageSize: 5,
      totalPages: 0,
      totalCount: 0,
    });
  });
});
