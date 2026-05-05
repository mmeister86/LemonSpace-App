import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendLocalNodeStreamChunk,
  clearLocalNodeStream,
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
});
