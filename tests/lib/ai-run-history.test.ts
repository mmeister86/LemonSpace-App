import { describe, expect, it } from "vitest";

import {
  appendAiRunEvent,
  completeToolCallTrace,
  createAiRunEvent,
  createToolCallTrace,
  normalizeAiRunEvents,
  normalizeToolCallTraces,
} from "@/lib/ai-run-history";

describe("ai run history", () => {
  it("normalizes safe run events and keeps the newest bounded entries", () => {
    const events = normalizeAiRunEvents([
      { id: "old", phase: "preparing", message: "old", createdAt: 1 },
      { id: "bad", phase: "private-thought", message: "hidden", createdAt: 2 },
      ...Array.from({ length: 16 }, (_, index) => ({
        id: `event-${index}`,
        phase: "streaming",
        message: `message ${index}`,
        createdAt: index + 3,
      })),
    ]);

    expect(events).toHaveLength(12);
    expect(events[0]?.id).toBe("event-4");
    expect(events.at(-1)).toEqual({
      id: "event-15",
      phase: "streaming",
      message: "message 15",
      createdAt: 18,
      status: "running",
    });
    expect(events.some((event) => event.id === "bad")).toBe(false);
  });

  it("creates and appends events with bounded history", () => {
    const base = Array.from({ length: 12 }, (_, index) =>
      createAiRunEvent({
        phase: "reading-context",
        message: `base ${index}`,
        createdAt: index,
      }),
    );

    const next = appendAiRunEvent(base, {
      phase: "calling-tools",
      message: "Calling read_connected_context",
      createdAt: 99,
    });

    expect(next).toHaveLength(12);
    expect(next[0]?.message).toBe("base 1");
    expect(next.at(-1)).toMatchObject({
      phase: "calling-tools",
      message: "Calling read_connected_context",
      status: "running",
    });
  });

  it("bounds tool-call details and stores expandable safe summaries", () => {
    const trace = createToolCallTrace({
      id: "call-1",
      toolName: "create_text_node",
      status: "running",
      startedAt: 10,
      input: {
        text: "x".repeat(900),
      },
    });

    const completed = completeToolCallTrace(trace, {
      status: "success",
      finishedAt: 15,
      output: {
        nodeId: "node-1",
        body: "y".repeat(900),
      },
    });

    expect(completed).toMatchObject({
      id: "call-1",
      toolName: "create_text_node",
      category: "create",
      message: "Create text node",
      status: "success",
      startedAt: 10,
      finishedAt: 15,
    });
    expect(JSON.stringify(completed.input).length).toBeLessThanOrEqual(650);
    expect(JSON.stringify(completed.output).length).toBeLessThanOrEqual(650);
  });

  it("normalizes persisted tool traces and drops malformed entries", () => {
    const traces = normalizeToolCallTraces([
      { id: "bad", toolName: "", status: "success", startedAt: 1 },
      { id: "call-1", toolName: "read_connected_context", status: "success", startedAt: 2 },
      { id: "call-2", toolName: "create_prompt_node", status: "error", startedAt: 3, error: "nope" },
    ]);

    expect(traces).toEqual([
      expect.objectContaining({
        id: "call-1",
        toolName: "read_connected_context",
        category: "read",
        message: "Read connected context",
        status: "success",
      }),
      expect.objectContaining({
        id: "call-2",
        toolName: "create_prompt_node",
        category: "create",
        message: "Create prompt node",
        status: "error",
        error: "nope",
      }),
    ]);
  });
});
