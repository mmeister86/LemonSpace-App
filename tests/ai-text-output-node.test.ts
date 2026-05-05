// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetLocalNodeStreamsForTests,
  setLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({ status: { isOffline: false } }),
}));

vi.mock("convex/react", () => ({ useAction: () => vi.fn() }));
vi.mock("@/convex/_generated/api", () => ({
  api: { ai: { generateText: "ai.generateText" } },
}));
vi.mock("@/lib/toast", () => ({
  toast: {
    warning: vi.fn(),
    promise: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("@/lib/ai-errors", () => ({
  classifyError: () => ({ rawMessage: undefined }),
}));
vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useConnection: () => ({ inProgress: false }),
  useReactFlow: () => ({ getEdges: () => [], getNode: () => null }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import AiTextOutputNode from "@/components/canvas/nodes/ai-text-output-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("AiTextOutputNode streaming draft", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    resetLocalNodeStreamsForTests();
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it("renders local stream draft before persisted output text", async () => {
    setLocalNodeStream("output-1", { text: "Streaming draft", status: "streaming" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AiTextOutputNode, {
          id: "output-1",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "ai-text-output",
          data: { outputText: "Persisted text", _status: "executing" },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Streaming draft");
    expect(container.textContent).not.toContain("Persisted text");
  });
});
