import { beforeAll, describe, expect, it, vi } from "vitest";

async function loadNormalizeImageReferenceInputs() {
  vi.stubEnv("CONVEX_SITE_URL", "https://app.example.test");
  return (await import("@/convex/ai_image_pipeline")).normalizeImageReferenceInputs;
}

describe("ai image pipeline references", () => {
  beforeAll(() => {
    vi.stubEnv("CONVEX_SITE_URL", "https://app.example.test");
  });

  it("prefers explicit referenceImages over legacy single-reference args", async () => {
    const normalizeImageReferenceInputs = await loadNormalizeImageReferenceInputs();

    expect(
      normalizeImageReferenceInputs({
        referenceStorageId: "legacy-storage",
        referenceImages: [
          {
            sourceNodeId: "asset-1",
            sourceType: "asset",
            label: "Ref 1",
            imageUrl: "https://cdn.example.com/asset.png",
          },
        ],
      }),
    ).toEqual([
      {
        sourceNodeId: "asset-1",
        sourceType: "asset",
        label: "Ref 1",
        imageUrl: "https://cdn.example.com/asset.png",
      },
    ]);
  });

  it("normalizes legacy single-reference storage ids and URLs", async () => {
    const normalizeImageReferenceInputs = await loadNormalizeImageReferenceInputs();

    expect(
      normalizeImageReferenceInputs({
        referenceStorageId: "legacy-storage",
      }),
    ).toEqual([
      {
        sourceNodeId: "legacy-reference",
        sourceType: "image",
        label: "Ref 1",
        storageId: "legacy-storage",
      },
    ]);

    expect(
      normalizeImageReferenceInputs({
        referenceImageUrl: "https://cdn.example.com/legacy.png",
      }),
    ).toEqual([
      {
        sourceNodeId: "legacy-reference",
        sourceType: "image",
        label: "Ref 1",
        imageUrl: "https://cdn.example.com/legacy.png",
      },
    ]);
  });
});
