import { describe, expect, it } from "vitest";

import { parseTextStreamRequest } from "@/lib/ai-stream/stream-protocol";

describe("AI stream protocol", () => {
  it("accepts a valid text stream request", () => {
    expect(
      parseTextStreamRequest({
        canvasId: "canvas-1",
        sourceNodeId: "source-1",
        outputNodeId: "output-1",
        modelId: "openai/gpt-5.4-mini",
        instruction: "Improve it",
        inputText: "Draft",
      }),
    ).toEqual({
      ok: true,
      value: {
        canvasId: "canvas-1",
        sourceNodeId: "source-1",
        outputNodeId: "output-1",
        modelId: "openai/gpt-5.4-mini",
        instruction: "Improve it",
        inputText: "Draft",
      },
    });
  });

  it("accepts visual references and normalizes invalid visual modes to context", () => {
    expect(
      parseTextStreamRequest({
        canvasId: "canvas-1",
        sourceNodeId: "source-1",
        outputNodeId: "output-1",
        modelId: "openai/gpt-5.4-mini",
        visualMode: "describe",
        visualReferences: [
          {
            sourceNodeId: "image-1",
            sourceType: "image",
            label: "Bild 1",
            imageUrl: "https://assets.test/source.png",
          },
          {
            sourceNodeId: "",
            sourceType: "prompt",
            label: "",
            imageUrl: "",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        canvasId: "canvas-1",
        sourceNodeId: "source-1",
        outputNodeId: "output-1",
        modelId: "openai/gpt-5.4-mini",
        instruction: undefined,
        inputText: undefined,
        visualMode: "describe",
        visualReferences: [
          {
            sourceNodeId: "image-1",
            sourceType: "image",
            label: "Bild 1",
            imageUrl: "https://assets.test/source.png",
          },
        ],
      },
    });
  });

  it("rejects missing required identifiers", () => {
    expect(parseTextStreamRequest({ modelId: "openai/gpt-5.4-mini" })).toEqual({
      ok: false,
      status: 400,
      message: "Invalid text stream request",
    });
  });
});
