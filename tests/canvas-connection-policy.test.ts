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

  it("allows image sources to crop", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "image",
        targetType: "crop",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows video sources to crop", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "video",
        targetType: "crop",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows ai-video sources to crop", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "ai-video",
        targetType: "crop",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows chained crop nodes", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "crop",
        targetType: "crop",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("blocks unsupported crop sources", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "prompt",
        targetType: "crop",
        targetIncomingCount: 0,
      }),
    ).toBe("crop-source-invalid");
  });

  it("limits crop nodes to one incoming connection", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "image",
        targetType: "crop",
        targetIncomingCount: 1,
      }),
    ).toBe("crop-incoming-limit");
  });

  it("allows crop output as render source", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "crop",
        targetType: "render",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("describes unsupported crop source message", () => {
    expect(getCanvasConnectionValidationMessage("crop-source-invalid")).toBe(
      "Crop akzeptiert nur Bild-, Asset-, KI-Bild-, Video-, KI-Video-, Crop- oder Adjustment-Input.",
    );
  });

  it("describes crop incoming limit", () => {
    expect(getCanvasConnectionValidationMessage("crop-incoming-limit")).toBe(
      "Crop-Nodes erlauben genau eine eingehende Verbindung.",
    );
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
