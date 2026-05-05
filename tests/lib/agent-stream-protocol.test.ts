import { describe, expect, it } from "vitest";

import { parseAgentStreamRequest } from "@/lib/ai-stream/stream-protocol";

describe("agent stream protocol", () => {
  it("accepts an agent stream request", () => {
    expect(
      parseAgentStreamRequest({
        canvasId: "canvas-1",
        nodeId: "agent-1",
        modelId: "openai/gpt-5.4-mini",
        locale: "de",
      }),
    ).toEqual({
      ok: true,
      value: {
        canvasId: "canvas-1",
        nodeId: "agent-1",
        modelId: "openai/gpt-5.4-mini",
        locale: "de",
      },
    });
  });
});
