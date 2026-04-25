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

  it("allows asset-video sources to crop", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "asset-video",
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

  it("allows image sources to transform nodes", () => {
    for (const targetType of ["bg-remove", "upscale", "style-transfer", "face-restore"]) {
      expect(
        validateCanvasConnectionPolicy({
          sourceType: "image",
          targetType,
          targetIncomingCount: 0,
        }),
      ).toBeNull();
    }
  });

  it("limits transform nodes to one incoming source image", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "image",
        targetType: "upscale",
        targetIncomingCount: 1,
      }),
    ).toBe("transform-incoming-limit");
  });

  it("allows transform nodes to output normal image nodes", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "bg-remove",
        targetType: "image",
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

  it("allows mixer as render source", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "mixer",
        targetType: "render",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows text as mixer source", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "mixer",
        targetIncomingCount: 0,
        targetHandle: "overlay",
      }),
    ).toBeNull();
  });

  it("does not allow splitter output to crop", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "splitter",
        targetType: "crop",
        targetIncomingCount: 0,
      }),
    ).toBe("crop-source-invalid");
  });

  it("does not allow splitter output to render", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "splitter",
        targetType: "render",
        targetIncomingCount: 0,
      }),
    ).toBe("render-source-invalid");
  });

  it("does not allow splitter output to mixer handles", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "splitter",
        targetType: "mixer",
        targetIncomingCount: 0,
        targetHandle: "base",
      }),
    ).toBe("mixer-source-invalid");
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

  it("allows render to agent", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "render",
        targetType: "agent",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows compare to agent", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "compare",
        targetType: "agent",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows agent to agent-output", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "agent",
        targetType: "agent-output",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("blocks non-agent sources to agent-output", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "agent-output",
        targetIncomingCount: 0,
      }),
    ).toBe("agent-output-source-invalid");
  });

  it("blocks prompt to agent", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "prompt",
        targetType: "agent",
        targetIncomingCount: 0,
      }),
    ).toBe("agent-source-invalid");
  });

  it("allows text to ai-text", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "ai-text",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows ai-text-output to ai-text", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "ai-text-output",
        targetType: "ai-text",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("allows ai-text to ai-text-output", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "ai-text",
        targetType: "ai-text-output",
        targetIncomingCount: 0,
      }),
    ).toBeNull();
  });

  it("limits ai-text to one incoming text source", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "text",
        targetType: "ai-text",
        targetIncomingCount: 1,
      }),
    ).toBe("ai-text-incoming-limit");
  });

  it("describes invalid agent source message", () => {
    expect(
      getCanvasConnectionValidationMessage("agent-source-invalid"),
    ).toBe(
      "Agent-Nodes akzeptieren nur Content- und Kontext-Inputs, keine Generierungs-Steuerknoten wie Prompt.",
    );
  });

  it("describes invalid agent-output source message", () => {
    expect(
      getCanvasConnectionValidationMessage("agent-output-source-invalid"),
    ).toBe("Agent-Ausgabe akzeptiert nur Eingaben von Agent-Nodes.");
  });

  it("treats legacy mixer handles 'null' and empty string as base occupancy", () => {
    expect(
      validateCanvasConnectionPolicy({
        sourceType: "asset",
        targetType: "mixer",
        targetIncomingCount: 1,
        targetHandle: "base",
        targetIncomingHandles: ["null", ""],
      }),
    ).toBe("mixer-handle-incoming-limit");
  });
});
