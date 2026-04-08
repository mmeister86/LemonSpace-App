import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/helpers", () => ({
  requireAuth: vi.fn(),
}));

import type { Id } from "@/convex/_generated/dataModel";
import { loadCanvasGraph } from "@/convex/canvasGraph";

describe("loadCanvasGraph", () => {
  it("returns nodes and edges for an authorized canvas", async () => {
    const canvasId = "canvas_1" as Id<"canvases">;
    const nodes = [{ _id: "node_1", canvasId }];
    const edges = [{ _id: "edge_1", canvasId }];

    const ctx = {
      db: {
        get: vi.fn(async (id: Id<"canvases">) =>
          id === canvasId ? { _id: canvasId, ownerId: "user_1" } : null,
        ),
        query: vi.fn((table: "nodes" | "edges") => ({
          withIndex: vi.fn((_index: string, apply: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
            const queryBuilder = {
              eq: vi.fn().mockReturnThis(),
            };
            apply(queryBuilder);
            return {
              collect: vi.fn(async () => (table === "nodes" ? nodes : edges)),
            };
          }),
        })),
      },
    };

    await expect(
      loadCanvasGraph(ctx as never, {
        canvasId,
        userId: "user_1",
      }),
    ).resolves.toEqual({
      canvas: { _id: canvasId, ownerId: "user_1" },
      nodes,
      edges,
    });
  });

  it("throws when the canvas belongs to another user", async () => {
    const canvasId = "canvas_1" as Id<"canvases">;
    const ctx = {
      db: {
        get: vi.fn(async () => ({ _id: canvasId, ownerId: "other_user" })),
        query: vi.fn(),
      },
    };

    await expect(
      loadCanvasGraph(ctx as never, {
        canvasId,
        userId: "user_1",
      }),
    ).rejects.toThrow("Canvas not found");
  });
});
