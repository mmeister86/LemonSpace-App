import { describe, expect, it } from "vitest";

import { runAgentHarnessLoop, type AgentHarnessTool } from "@/lib/agent-harness";

describe("agent harness loop", () => {
  const echoTool: AgentHarnessTool = {
    name: "echo",
    description: "Echo input",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["value"],
      properties: {
        value: { type: "string" },
      },
    },
  };

  it("executes model-requested tools and feeds results back before finalizing", async () => {
    const seenMessageCounts: number[] = [];

    const result = await runAgentHarnessLoop({
      initialMessages: [{ role: "user", content: "Create a post" }],
      tools: [echoTool],
      maxRounds: 4,
      callModel: async (messages) => {
        seenMessageCounts.push(messages.length);
        if (seenMessageCounts.length === 1) {
          return {
            content: "",
            toolCalls: [
              {
                id: "call-1",
                name: "echo",
                argumentsJson: JSON.stringify({ value: "hello" }),
              },
            ],
          };
        }

        return {
          content: JSON.stringify({ status: "done", toolResultSeen: true }),
          toolCalls: [],
        };
      },
      executeTool: async (call) => ({
        ok: true,
        result: { echoed: call.arguments.value },
      }),
      parseFinal: (content) => JSON.parse(content) as { status: string; toolResultSeen: boolean },
    });

    expect(result.final).toEqual({ status: "done", toolResultSeen: true });
    expect(result.toolResults).toEqual([
      expect.objectContaining({
        toolName: "echo",
        result: { echoed: "hello" },
      }),
    ]);
    expect(seenMessageCounts).toEqual([1, 3]);
  });

  it("rejects tool calls outside the registered harness tool set", async () => {
    await expect(
      runAgentHarnessLoop({
        initialMessages: [{ role: "user", content: "Create a post" }],
        tools: [echoTool],
        maxRounds: 2,
        callModel: async () => ({
          content: "",
          toolCalls: [
            {
              id: "call-1",
              name: "delete_everything",
              argumentsJson: "{}",
            },
          ],
        }),
        executeTool: async () => ({ ok: true, result: {} }),
        parseFinal: (content) => JSON.parse(content) as unknown,
      }),
    ).rejects.toThrow("Tool delete_everything is not allowed");
  });

  it("stops when the model keeps requesting tools past the harness round limit", async () => {
    await expect(
      runAgentHarnessLoop({
        initialMessages: [{ role: "user", content: "Create a post" }],
        tools: [echoTool],
        maxRounds: 1,
        callModel: async () => ({
          content: "",
          toolCalls: [
            {
              id: "call-1",
              name: "echo",
              argumentsJson: JSON.stringify({ value: "again" }),
            },
          ],
        }),
        executeTool: async () => ({ ok: true, result: {} }),
        parseFinal: (content) => JSON.parse(content) as unknown,
      }),
    ).rejects.toThrow("Agent harness exceeded max rounds");
  });
});
