import { describe, expect, it } from "vitest";

import {
  buildFreepikAssetDedupeKey,
  buildPexelsVideoDedupeKey,
  buildStoredMediaDedupeKey,
  mapMediaArchiveRowToListItem,
  normalizeMediaArchiveInput,
} from "@/lib/media-archive";

describe("media archive helpers", () => {
  it("builds storage dedupe keys", () => {
    expect(buildStoredMediaDedupeKey("storage_123")).toBe("storage:storage_123");
  });

  it("builds freepik dedupe keys", () => {
    expect(buildFreepikAssetDedupeKey("photo", 42)).toBe("freepik:photo:42");
  });

  it("builds pexels dedupe keys", () => {
    expect(buildPexelsVideoDedupeKey(77)).toBe("pexels:video:77");
  });

  it("normalizes stored media input and drops external-only fields", () => {
    const normalized = normalizeMediaArchiveInput({
      kind: "image",
      source: "upload",
      dedupeKey: "storage:storage_1",
      storageId: "storage_1",
      previewStorageId: "preview_1",
      filename: "photo.png",
      mimeType: "image/png",
      title: "Photo",
      width: 1024,
      height: 768,
      durationSeconds: 12,
      providerAssetId: "asset_1",
      originalUrl: "https://cdn.example.com/original.png",
      previewUrl: "https://cdn.example.com/preview.png",
      sourceUrl: "https://example.com/origin",
      metadata: { license: "custom" },
      firstSourceCanvasId: "canvas_1",
      firstSourceNodeId: "node_1",
      unknownField: "drop-me",
    });

    expect(normalized).toEqual({
      kind: "image",
      source: "upload",
      dedupeKey: "storage:storage_1",
      storageId: "storage_1",
      previewStorageId: "preview_1",
      filename: "photo.png",
      mimeType: "image/png",
      title: "Photo",
      width: 1024,
      height: 768,
      durationSeconds: 12,
      metadata: { license: "custom" },
      firstSourceCanvasId: "canvas_1",
      firstSourceNodeId: "node_1",
    });
  });

  it("normalizes external media input and drops storage-only fields", () => {
    const normalized = normalizeMediaArchiveInput({
      kind: "asset",
      source: "freepik-asset",
      dedupeKey: "freepik:photo:42",
      providerAssetId: "42",
      title: "Palm Tree",
      previewUrl: "https://cdn.freepik.com/preview.jpg",
      originalUrl: "https://cdn.freepik.com/original.jpg",
      sourceUrl: "https://www.freepik.com/asset/42",
      storageId: "storage_1",
      previewStorageId: "preview_1",
      metadata: { license: "freepik-standard" },
      unknownField: "drop-me",
    });

    expect(normalized).toEqual({
      kind: "asset",
      source: "freepik-asset",
      dedupeKey: "freepik:photo:42",
      providerAssetId: "42",
      title: "Palm Tree",
      previewUrl: "https://cdn.freepik.com/preview.jpg",
      originalUrl: "https://cdn.freepik.com/original.jpg",
      sourceUrl: "https://www.freepik.com/asset/42",
      metadata: { license: "freepik-standard" },
    });
  });

  it("maps media archive rows to one ui-facing card shape", () => {
    const item = mapMediaArchiveRowToListItem({
      _id: "media_1",
      kind: "video",
      source: "pexels-video",
      dedupeKey: "pexels:video:77",
      title: "Ocean clip",
      filename: "ocean.mp4",
      mimeType: "video/mp4",
      durationSeconds: 8,
      previewUrl: "https://images.pexels.com/preview.jpg",
      originalUrl: "https://videos.pexels.com/video.mp4",
      sourceUrl: "https://www.pexels.com/video/77",
      providerAssetId: "77",
      width: 1920,
      height: 1080,
      updatedAt: 200,
      createdAt: 100,
      lastUsedAt: 200,
    });

    expect(item).toEqual({
      id: "media_1",
      kind: "video",
      source: "pexels-video",
      dedupeKey: "pexels:video:77",
      title: "Ocean clip",
      filename: "ocean.mp4",
      mimeType: "video/mp4",
      durationSeconds: 8,
      previewUrl: "https://images.pexels.com/preview.jpg",
      originalUrl: "https://videos.pexels.com/video.mp4",
      sourceUrl: "https://www.pexels.com/video/77",
      providerAssetId: "77",
      width: 1920,
      height: 1080,
      updatedAt: 200,
      createdAt: 100,
      lastUsedAt: 200,
    });
  });
});
