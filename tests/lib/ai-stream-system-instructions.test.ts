import { describe, expect, it } from "vitest";

import { splitSystemInstructionsFromMessages } from "@/lib/ai-stream/system-instructions";

describe("AI stream system instructions", () => {
  it("moves system messages to top-level instructions and keeps model messages user-facing", () => {
    const prepared = splitSystemInstructionsFromMessages([
      { role: "system", content: "Server rule A." },
      { role: "user", content: "User draft" },
      { role: "system", content: "Server rule B." },
      { role: "assistant", content: "Prior assistant text" },
    ]);

    expect(prepared.instructions).toBe("Server rule A.\n\nServer rule B.");
    expect(prepared.messages).toEqual([
      { role: "user", content: "User draft" },
      { role: "assistant", content: "Prior assistant text" },
    ]);
  });

  it("omits empty instructions when no system messages are present", () => {
    const prepared = splitSystemInstructionsFromMessages([
      { role: "user", content: "Only user material" },
    ]);

    expect(prepared.instructions).toBeUndefined();
    expect(prepared.messages).toEqual([
      { role: "user", content: "Only user material" },
    ]);
  });
});
