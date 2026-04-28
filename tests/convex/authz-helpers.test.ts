import { describe, expect, it } from "vitest";

import {
  getOwnedCanvasOrNull,
  requireNodeOnCanvas,
  requireOwnedCanvas,
} from "@/convex/authz_helpers";

describe("convex authz helpers", () => {
  const canvas = { _id: "canvas-1", ownerId: "user-1" };
  const node = { _id: "node-1", canvasId: "canvas-1", type: "image" };

  function ctxWith(records: Record<string, unknown>) {
    return {
      db: {
        get: async (id: string) => records[id] ?? null,
      },
    } as never;
  }

  it("returns null or throws for owned canvas lookups while preserving caller choice", async () => {
    await expect(
      getOwnedCanvasOrNull(ctxWith({ "canvas-1": canvas }), "canvas-1" as never, "user-1"),
    ).resolves.toEqual(canvas);
    await expect(
      getOwnedCanvasOrNull(ctxWith({ "canvas-1": canvas }), "canvas-1" as never, "user-2"),
    ).resolves.toBeNull();
    await expect(
      requireOwnedCanvas(ctxWith({ "canvas-1": canvas }), "canvas-1" as never, "user-2"),
    ).rejects.toThrow("Canvas not found");
  });

  it("asserts node membership on a canvas", async () => {
    await expect(
      requireNodeOnCanvas(ctxWith({ "node-1": node }), "node-1" as never, "canvas-1" as never),
    ).resolves.toEqual(node);
    await expect(
      requireNodeOnCanvas(ctxWith({ "node-1": node }), "node-1" as never, "canvas-2" as never),
    ).rejects.toThrow("Node does not belong to canvas");
  });
});
