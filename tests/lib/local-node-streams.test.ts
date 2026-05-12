import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendLocalNodeStreamChunk,
  appendLocalNodeStreamEvent,
  completeLocalNodeStreamToolCall,
  clearLocalNodeStream,
  createLocalNodeStreamToolCall,
  getLocalNodeStreamSnapshot,
  resetLocalNodeStreamsForTests,
  setLocalNodeStream,
  subscribeToLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";

describe("local node streams", () => {
  beforeEach(() => {
    resetLocalNodeStreamsForTests();
  });

  it("appends chunks and notifies subscribers without touching persisted data", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLocalNodeStream("node-1", listener);

    setLocalNodeStream("node-1", { text: "", status: "streaming" });
    appendLocalNodeStreamChunk("node-1", "Hello");
    appendLocalNodeStreamChunk("node-1", " world");

    expect(getLocalNodeStreamSnapshot("node-1")).toEqual({
      text: "Hello world",
      status: "streaming",
      phase: "streaming",
    });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    appendLocalNodeStreamChunk("node-1", "!");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("clears local state after final persistence", () => {
    setLocalNodeStream("node-1", { text: "Draft", status: "streaming" });
    clearLocalNodeStream("node-1");
    expect(getLocalNodeStreamSnapshot("node-1")).toBeUndefined();
  });

  it("stores safe run events and tool calls alongside streamed text", () => {
    const listener = vi.fn();
    subscribeToLocalNodeStream("node-1", listener);

    setLocalNodeStream("node-1", {
      text: "",
      status: "streaming",
      phase: "preparing",
      startedAt: 10,
    });
    appendLocalNodeStreamEvent("node-1", {
      phase: "reading-context",
      message: "Reading connected context",
      createdAt: 11,
    });
    createLocalNodeStreamToolCall("node-1", {
      id: "call-1",
      toolName: "read_connected_context",
      status: "running",
      startedAt: 12,
      input: { nodeCount: 2 },
    });
    completeLocalNodeStreamToolCall("node-1", "call-1", {
      status: "success",
      finishedAt: 13,
      output: { count: 2 },
    });

    expect(getLocalNodeStreamSnapshot("node-1")).toMatchObject({
      text: "",
      status: "streaming",
      phase: "calling-tools",
      startedAt: 10,
      events: [
        expect.objectContaining({
          phase: "reading-context",
          message: "Reading connected context",
        }),
      ],
      toolCalls: [
        expect.objectContaining({
          id: "call-1",
          toolName: "read_connected_context",
          status: "success",
          category: "read",
        }),
      ],
    });
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
