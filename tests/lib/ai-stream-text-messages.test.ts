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
});
