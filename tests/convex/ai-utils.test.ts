import { describe, expect, it } from "vitest";
import { assertNodeBelongsToCanvasOrThrow } from "@/convex/ai-utils";

describe("assertNodeBelongsToCanvasOrThrow", () => {
  it("accepts matching node/canvas relation", () => {
    expect(() =>
      assertNodeBelongsToCanvasOrThrow(
        { canvasId: "canvas_a" },
        "canvas_a",
      ),
    ).not.toThrow();
  });

  it("rejects mismatching node/canvas relation", () => {
    expect(() =>
      assertNodeBelongsToCanvasOrThrow(
        { canvasId: "canvas_b" },
        "canvas_a",
      ),
    ).toThrow("Node does not belong to canvas");
  });
});
