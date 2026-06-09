import { describe, expect, it } from "vitest";

import { validateCanvasConnectionPolicy } from "@/lib/canvas-connection-policy";

describe("canvas connection policy", () => {
  it("allows typed sources into instagram post mockup handles", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "image",
        targetType: "instagram-post-mockup",
        targetHandle: "visual-in",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "instagram-post-mockup",
        targetHandle: "caption-in",
        targetIncomingCount: 1,
        targetIncomingHandles: ["visual-in"],
      }),
    ).toBeNull();
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "prompt",
        targetType: "instagram-post-mockup",
        targetHandle: "visual-prompt-in",
        targetIncomingCount: 2,
        targetIncomingHandles: ["visual-in", "caption-in"],
      }),
    ).toBeNull();
  });

  it("rejects invalid instagram post mockup handles and duplicate handle inputs", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "video",
        targetType: "instagram-post-mockup",
        targetHandle: "visual-in",
        targetIncomingCount: 0,
      }),
    ).toBe("instagram-post-mockup-source-invalid");
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "instagram-post-mockup",
        targetHandle: "visual-in",
        targetIncomingCount: 0,
      }),
    ).toBe("instagram-post-mockup-source-invalid");
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "instagram-post-mockup",
        targetHandle: "caption-in",
        targetIncomingCount: 1,
        targetIncomingHandles: ["caption-in"],
      }),
    ).toBe("instagram-post-mockup-handle-incoming-limit");
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "instagram-post-mockup",
        targetHandle: "unknown-in",
        targetIncomingCount: 0,
      }),
    ).toBe("instagram-post-mockup-target-handle-invalid");
  });

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
