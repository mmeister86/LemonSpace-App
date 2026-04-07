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

  it("allows text to video-prompt", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "video-prompt",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows video-prompt to ai-video", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "video-prompt",
        targetType: "ai-video",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("blocks direct video-prompt to image prompt flow", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "video-prompt",
        targetType: "prompt",
        targetIncomingCount: 0,
      }),
    ).toBe("video-prompt-target-invalid");
  });

  it("blocks ai-video as adjustment source", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "ai-video",
        targetType: "curves",
        targetIncomingCount: 0,
      }),
    ).toBe("adjustment-source-invalid");
  });

  it("blocks ai-video as render source", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "ai-video",
        targetType: "render",
        targetIncomingCount: 0,
      }),
    ).toBe("render-source-invalid");
  });

  it("describes video-only ai-video input", () => {
    expect(
      getCanvasConnectionValidationMessage("ai-video-source-invalid"),
    ).toBe("KI-Video-Ausgabe akzeptiert nur Eingaben von KI-Video.");
  });
});
