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
});
