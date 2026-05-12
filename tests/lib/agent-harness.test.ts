import { describe, expect, it, vi } from "vitest";

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
    const onToolCallTrace = vi.fn();

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
      onToolCallTrace,
    });

    expect(result.final).toEqual({ status: "done", toolResultSeen: true });
    expect(result.toolResults).toEqual([
      expect.objectContaining({
        toolName: "echo",
        result: { echoed: "hello" },
      }),
    ]);
    expect(seenMessageCounts).toEqual([1, 3]);
    expect(onToolCallTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        toolName: "echo",
        status: "running",
        input: { value: "hello" },
      }),
    );
    expect(onToolCallTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        toolName: "echo",
        status: "success",
        output: { echoed: "hello" },
      }),
    );
  });

  it("traces tool result errors without stopping the loop", async () => {
    const onToolCallTrace = vi.fn();

    const result = await runAgentHarnessLoop({
      initialMessages: [{ role: "user", content: "Create a post" }],
      tools: [echoTool],
      maxRounds: 4,
      callModel: async (messages) => {
        if (messages.length === 1) {
          return {
            content: "",
            toolCalls: [
              {
                id: "call-error",
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
      executeTool: async () => ({
        ok: false,
        error: "Tool rejected the request",
      }),
      parseFinal: (content) => JSON.parse(content) as { status: string; toolResultSeen: boolean },
      onToolCallTrace,
    });

    expect(result.toolResults).toEqual([
      expect.objectContaining({
        toolName: "echo",
        ok: false,
        error: "Tool rejected the request",
      }),
    ]);
    expect(onToolCallTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-error",
        toolName: "echo",
        status: "error",
        error: "Tool rejected the request",
      }),
    );
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
    const onToolCallTrace = vi.fn();

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
        onToolCallTrace,
      }),
    ).rejects.toThrow("Agent harness exceeded max rounds");
    expect(onToolCallTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        toolName: "echo",
        status: "success",
      }),
    );
  });
});
