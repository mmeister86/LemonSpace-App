import { describe, expect, it } from "vitest";

import { buildAiTextStreamMessages, trimOptionalText } from "@/lib/ai-stream/text-messages";

describe("AI text stream messages", () => {
  it("trims optional text and omits empty values", () => {
    expect(trimOptionalText("  Rewrite this  ")).toBe("Rewrite this");
    expect(trimOptionalText("   ")).toBeUndefined();
    expect(trimOptionalText(undefined)).toBeUndefined();
  });

  it("builds plain text streaming messages without JSON-only instructions", () => {
    const messages = buildAiTextStreamMessages({
      instruction: "  Make this clearer  ",
      inputText: "  Raw draft  ",
    });

    expect(messages).toEqual([
      {
        role: "system",
        content: expect.stringContaining("Write only the final text content."),
      },
      {
        role: "user",
        content: expect.stringContaining("Task:\nMake this clearer"),
      },
    ]);
    expect(messages[0]!.content).not.toContain("Return JSON");
    expect(messages[1]!.content).toContain("Text or draft:\nRaw draft");
  });

  it("builds multimodal messages with image file parts for visual context", () => {
    const messages = buildAiTextStreamMessages({
      instruction: "Write a product caption",
      inputText: "Use a playful tone",
      visualMode: "context",
      visualReferences: [
        {
          sourceNodeId: "image-1",
          sourceType: "image",
          label: "Bild 1",
          imageUrl: "https://assets.test/source.png",
        },
      ],
    });

    expect(messages[1]!.content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Use the attached images as visual context."),
      },
      {
        type: "file",
        mediaType: "image",
        data: "https://assets.test/source.png",
      },
    ]);
  });

  it("builds describe-mode multimodal messages that ask for image-to-text output", () => {
    const messages = buildAiTextStreamMessages({
      visualMode: "describe",
      visualReferences: [
        {
          sourceNodeId: "ai-image-1",
          sourceType: "ai-image",
          label: "Bild 1",
          imageUrl: "https://assets.test/generated.png",
        },
      ],
    });

    expect(messages[1]!.content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Describe the attached image material"),
      },
      {
        type: "file",
        mediaType: "image",
        data: "https://assets.test/generated.png",
      },
    ]);
  });
});
