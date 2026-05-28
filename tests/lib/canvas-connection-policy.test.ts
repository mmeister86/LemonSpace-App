import { describe, expect, it } from "vitest";

import { validateCanvasConnectionPolicy } from "@/lib/canvas-connection-policy";

describe("canvas connection policy", () => {
  it("allows bg-remove outputs to feed adjustment, render, and transform nodes", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "bg-remove-output",
        targetType: "curves",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "bg-remove-output",
        targetType: "render",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "bg-remove-output",
        targetType: "upscale",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("does not allow bg-remove outputs to feed generation control nodes", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "bg-remove-output",
        targetType: "prompt",
        targetIncomingCount: 0,
      }),
    ).toBe("prompt-source-invalid");
  });

  it("allows image-like sources into mask nodes", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "bg-remove-output",
        targetType: "mask",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows mask outputs only into adjustment mask handles", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "mask",
        targetType: "curves",
        targetHandle: "mask",
        targetIncomingCount: 1,
        targetIncomingHandles: [undefined],
      }),
    ).toBeNull();

    expect(
      validateCanvasConnectionPolicy({
        sourceType: "mask",
        targetType: "curves",
        targetIncomingCount: 0,
      }),
    ).toBe("mask-target-handle-required");
  });

  it("does not count mask handles against regular adjustment input limits", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "bg-remove-output",
        targetType: "curves",
        targetIncomingCount: 1,
        targetIncomingHandles: ["mask"],
      }),
    ).toBeNull();
  });
});
