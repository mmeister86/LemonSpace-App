import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { validateBatchNodesForUserOrThrow } from "@/convex/batch-validation-utils";

describe("validateBatchNodesForUserOrThrow", () => {
  it("rejects mixed canvas ids in one batch", async () => {
    const nodeA = {
      _id: "node_a" as Id<"nodes">,
      canvasId: "canvas_a" as Id<"canvases">,
    };
    const nodeB = {
      _id: "node_b" as Id<"nodes">,
      canvasId: "canvas_b" as Id<"canvases">,
    };

    await expect(
      validateBatchNodesForUserOrThrow({
        userId: "user_1",
        nodeIds: [nodeA._id, nodeB._id],
        getNodeById: async (nodeId) => {
          if (nodeId === nodeA._id) return nodeA;
          if (nodeId === nodeB._id) return nodeB;
          return null;
        },
        getCanvasById: async () => ({ _id: "canvas_a" as Id<"canvases">, ownerId: "user_1" }),
      }),
    ).rejects.toThrow("All nodes must belong to the same canvas");
  });

  it("rejects foreign canvas ownership", async () => {
    const canvasId = "canvas_a" as Id<"canvases">;
    const node = { _id: "node_a" as Id<"nodes">, canvasId };

    await expect(
      validateBatchNodesForUserOrThrow({
        userId: "user_1",
        nodeIds: [node._id],
        getNodeById: async () => node,
        getCanvasById: async () => ({ _id: canvasId, ownerId: "other_user" }),
      }),
    ).rejects.toThrow("Canvas not found");
  });
});
