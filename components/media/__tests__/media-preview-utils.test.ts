import { describe, expect, it } from "vitest";

import {
  collectMediaStorageIdsForResolution,
  resolveMediaPreviewUrl,
} from "@/components/media/media-preview-utils";

describe("media-preview-utils", () => {
  it("collects preview ids first and includes original ids as fallback", () => {
    const ids = collectMediaStorageIdsForResolution([
      { storageId: "orig-1", previewStorageId: "preview-1" },
      { storageId: "orig-2" },
    ]);

    expect(ids).toEqual(["preview-1", "orig-1", "orig-2"]);
  });

  it("collects only available storage ids for mixed archive items", () => {
    const ids = collectMediaStorageIdsForResolution([
      { previewUrl: "https://cdn.example.com/preview-only.jpg" },
      { previewStorageId: "preview-2" },
      { storageId: "orig-2" },
    ]);

    expect(ids).toEqual(["preview-2", "orig-2"]);
  });

  it("resolves preview url first and falls back to original url", () => {
    const previewFirst = resolveMediaPreviewUrl(
      { storageId: "orig-1", previewStorageId: "preview-1" },
      {
        "preview-1": "https://cdn.example.com/preview.webp",
        "orig-1": "https://cdn.example.com/original.jpg",
      },
    );

    expect(previewFirst).toBe("https://cdn.example.com/preview.webp");

    const fallbackToOriginal = resolveMediaPreviewUrl(
      { storageId: "orig-1", previewStorageId: "preview-1" },
      {
        "orig-1": "https://cdn.example.com/original.jpg",
      },
    );

    expect(fallbackToOriginal).toBe("https://cdn.example.com/original.jpg");
  });

  it("resolves direct remote preview URLs before storage map", () => {
    const directPreview = resolveMediaPreviewUrl(
      {
        previewUrl: "https://cdn.example.com/direct-preview.webp",
        storageId: "orig-1",
        previewStorageId: "preview-1",
      },
      {
        "preview-1": "https://cdn.example.com/preview.webp",
        "orig-1": "https://cdn.example.com/original.jpg",
      },
    );

    expect(directPreview).toBe("https://cdn.example.com/direct-preview.webp");
  });

  it("falls back to direct remote original URLs when storage ids are missing", () => {
    const previewUrl = resolveMediaPreviewUrl(
      {
        kind: "video",
        originalUrl: "https://cdn.example.com/video.mp4",
      },
      {},
    );

    expect(previewUrl).toBe("https://cdn.example.com/video.mp4");
  });
});
