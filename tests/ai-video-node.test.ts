// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateVideo: vi.fn(async () => ({ queued: true, outputNodeId: "ai-video-1" })),
  getEdges: vi.fn(() => [{ source: "video-prompt-1", target: "ai-video-1" }]),
  getNode: vi.fn((id: string) => {
    if (id === "video-prompt-1") {
      return { id, type: "video-prompt", data: { canvasId: "canvas-1" } };
    }
    return null;
  }),
  toastPromise: vi.fn(async <T,>(promise: Promise<T>) => await promise),
  toastWarning: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("convex/react", () => ({
  useAction: () => mocks.generateVideo,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ai: {
      generateVideo: "ai.generateVideo",
    },
  },
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    status: { isOffline: false, isSyncing: false, pendingCount: 0 },
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    promise: mocks.toastPromise,
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useReactFlow: () => ({
    getEdges: mocks.getEdges,
    getNode: mocks.getNode,
  }),
}));

import AiVideoNode from "@/components/canvas/nodes/ai-video-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AiVideoNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.generateVideo.mockClear();
    mocks.getEdges.mockClear();
    mocks.getNode.mockClear();
    mocks.toastPromise.mockClear();
    mocks.toastWarning.mockClear();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("retries generation from the connected video prompt node", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AiVideoNode, {
          id: "ai-video-1",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "ai-video",
          data: {
            prompt: "ein suesser Berner Sennenhund rennt ueber eine Wiese",
            modelId: "wan-2-2-480p",
            durationSeconds: 5,
            canvasId: "canvas-1",
            _status: "error",
            _statusMessage: "Netzwerk: task not found yet",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const retryButton = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("retryButton"),
    );

    if (!(retryButton instanceof HTMLButtonElement)) {
      throw new Error("Retry button not found");
    }

    expect(retryButton.disabled).toBe(false);

    await act(async () => {
      retryButton.click();
    });

    expect(mocks.generateVideo).toHaveBeenCalledTimes(1);
    expect(mocks.generateVideo).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "video-prompt-1",
      outputNodeId: "ai-video-1",
      prompt: "ein suesser Berner Sennenhund rennt ueber eine Wiese",
      modelId: "wan-2-2-480p",
      durationSeconds: 5,
    });
  });
});
