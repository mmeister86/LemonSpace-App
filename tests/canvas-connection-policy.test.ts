import { describe, expect, it } from "vitest";

import {
  getCanvasConnectionValidationMessage,
  validateCanvasConnectionPolicy,
} from "@/lib/canvas-connection-policy";

describe("canvas connection policy", () => {
  it("limits compare nodes to two incoming connections", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "image",
        targetType: "compare",
        targetIncomingCount: 2,
      }),
    ).toBe("compare-incoming-limit");
  });

  it("describes the compare incoming limit", () => {
    expect(
      getCanvasConnectionValidationMessage("compare-incoming-limit"),
    ).toBe("Compare-Nodes erlauben genau zwei eingehende Verbindungen.");
  });
});
