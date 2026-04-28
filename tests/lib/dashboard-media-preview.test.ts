import { describe, expect, it } from "vitest";

import {
  getDashboardMediaItemKey,
  getDashboardMediaItemLabel,
  getDashboardMediaItemMeta,
} from "@/lib/dashboard-media-preview";

describe("dashboard media preview helpers", () => {
  it("builds stable media item keys from the strongest available identity", () => {
    expect(getDashboardMediaItemKey({ kind: "image", storageId: "storage_1", createdAt: 1 })).toBe(
      "storage_1",
    );
    expect(
      getDashboardMediaItemKey({ kind: "image", originalUrl: "https://cdn.example/original.jpg", createdAt: 1 }),
    ).toBe("url:https://cdn.example/original.jpg");
    expect(getDashboardMediaItemKey({ kind: "asset", filename: "asset.png", createdAt: 42 })).toBe(
      "asset:42:asset.png",
    );
  });

  it("formats media labels and metadata for dashboard cards", () => {
    expect(
      getDashboardMediaItemLabel(
        { kind: "video", createdAt: 1 },
        {
          untitledImage: "Untitled image",
          untitledVideo: "Untitled video",
          untitledAsset: "Untitled asset",
        },
      ),
    ).toBe("Untitled video");
    expect(
      getDashboardMediaItemMeta(
        { kind: "image", width: 1024, height: 768, createdAt: 1 },
        { unknownSize: "Unknown size", videoFile: "Video file" },
      ),
    ).toBe("1024 x 768px");
    expect(
      getDashboardMediaItemMeta(
        { kind: "video", width: 1920, height: 1080, createdAt: 1 },
        { unknownSize: "Unknown size", videoFile: "Video file" },
      ),
    ).toBe("Video file");
  });
});
