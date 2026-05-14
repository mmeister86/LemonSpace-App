import { beforeAll, describe, expect, it, vi } from "vitest";

async function loadResolveVisualReferenceFromNode() {
  vi.stubEnv("CONVEX_SITE_URL", "https://app.example.test");
  return (await import("@/convex/ai_text_pipeline")).resolveVisualReferenceFromNode;
}

describe("ai text pipeline visual references", () => {
  beforeAll(() => {
    vi.stubEnv("CONVEX_SITE_URL", "https://app.example.test");
  });

  it("resolves image references from node data instead of trusting request URLs", async () => {
    const resolveVisualReferenceFromNode = await loadResolveVisualReferenceFromNode();

    expect(
      resolveVisualReferenceFromNode({
        node: {
          type: "image",
          data: { storageId: "storage-real" },
        },
        requested: {
          sourceNodeId: "image-1",
          sourceType: "image",
          label: "Bild 1",
          imageUrl: "https://attacker.test/not-this.png",
        },
      }),
    ).toEqual({
      sourceNodeId: "image-1",
      sourceType: "image",
      label: "Bild 1",
      storageId: "storage-real",
    });
  });

  it("allows materialized render references from the request as a sync-race fallback", async () => {
    const resolveVisualReferenceFromNode = await loadResolveVisualReferenceFromNode();

    expect(
      resolveVisualReferenceFromNode({
        node: {
          type: "render",
          data: {},
        },
        requested: {
          sourceNodeId: "render-1",
          sourceType: "render",
          label: "Bild 1",
          storageId: "storage-render",
          renderPipelineHash: "hash-1",
        },
      }),
    ).toEqual({
      sourceNodeId: "render-1",
      sourceType: "render",
      label: "Bild 1",
      storageId: "storage-render",
      renderPipelineHash: "hash-1",
    });
  });

  it("rejects source type mismatches", async () => {
    const resolveVisualReferenceFromNode = await loadResolveVisualReferenceFromNode();

    expect(
      resolveVisualReferenceFromNode({
        node: {
          type: "text",
          data: { content: "not an image" },
        },
        requested: {
          sourceNodeId: "text-1",
          sourceType: "image",
          label: "Bild 1",
          storageId: "storage-1",
        },
      }),
    ).toBeNull();
  });
});
