// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  edges: [] as Array<{ source: string; target: string }>,
  nodes: [] as Array<{ id: string; type: string; data: Record<string, unknown> }>,
  balance: { balance: 100, reserved: 0 } as { balance: number; reserved: number } | undefined,
  queueNodeDataUpdate: vi.fn(async () => undefined),
  createNodeConnectedFromSource: vi.fn(async () => "ai-video-node-1" as Id<"nodes">),
  generateVideo: vi.fn(async () => ({ queued: true, outputNodeId: "ai-video-node-1" })),
  getEdges: vi.fn(() => [] as Array<{ source: string; target: string }>),
  getNode: vi.fn((id: string) =>
    id === "video-prompt-1"
      ? { id, position: { x: 100, y: 50 }, measured: { width: 260, height: 220 } }
      : null,
  ),
  push: vi.fn(),
  toastPromise: vi.fn(async <T,>(promise: Promise<T>) => await promise),
  toastWarning: vi.fn(),
  toastAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("convex/react", () => ({
  useAction: () => mocks.generateVideo,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ai: {
      generateVideo: "ai.generateVideo",
    },
    credits: {
      getBalance: "credits.getBalance",
    },
  },
}));

vi.mock("@/hooks/use-auth-query", () => ({
  useAuthQuery: () => mocks.balance,
}));

vi.mock("@/hooks/use-debounced-callback", () => ({
  useDebouncedCallback: (callback: (...args: Array<unknown>) => void) => callback,
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    status: { isOffline: false, isSyncing: false, pendingCount: 0 },
  }),
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeConnectedFromSource: mocks.createNodeConnectedFromSource,
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    promise: mocks.toastPromise,
    warning: mocks.toastWarning,
    action: mocks.toastAction,
    error: mocks.toastError,
  },
}));

vi.mock("@/lib/ai-errors", () => ({
  classifyError: (error: unknown) => ({
    type: "generic",
    rawMessage: error instanceof Error ? error.message : String(error),
  }),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) =>
    React.createElement("label", { htmlFor }, children),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) =>
    React.createElement(
      "select",
      {
        "aria-label": "video-model",
        value,
        onChange: (event: Event) => {
          onValueChange((event.target as HTMLSelectElement).value);
        },
      },
      children,
    ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => children,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    React.createElement("option", { value }, children),
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useConnection: () => ({ inProgress: false }),
  useStore: (selector: (state: { edges: typeof mocks.edges; nodes: typeof mocks.nodes }) => unknown) =>
    selector({ edges: mocks.edges, nodes: mocks.nodes }),
  useReactFlow: () => ({
    getEdges: mocks.getEdges,
    getNode: mocks.getNode,
  }),
}));

import VideoPromptNode from "@/components/canvas/nodes/video-prompt-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("VideoPromptNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.edges = [];
    mocks.nodes = [];
    mocks.balance = { balance: 100, reserved: 0 };
    mocks.queueNodeDataUpdate.mockClear();
    mocks.createNodeConnectedFromSource.mockClear();
    mocks.generateVideo.mockClear();
    mocks.getEdges.mockClear();
    mocks.getNode.mockClear();
    mocks.push.mockClear();
    mocks.toastPromise.mockClear();
    mocks.toastWarning.mockClear();
    mocks.toastAction.mockClear();
    mocks.toastError.mockClear();
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

  it("creates an ai-video node and queues video generation when generate is clicked", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(VideoPromptNode, {
          id: "video-prompt-1",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "video-prompt",
          data: {
            prompt: "ein suesser Berner Sennenhund rennt ueber eine Wiese",
            modelId: "wan-2-2-480p",
            durationSeconds: 5,
            canvasId: "canvas-1",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("generateButton"),
    );

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Generate button not found");
    }

    await act(async () => {
      button.click();
    });

    expect(mocks.createNodeConnectedFromSource).toHaveBeenCalledTimes(1);
    expect(mocks.createNodeConnectedFromSource).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ai-video",
        sourceNodeId: "video-prompt-1",
        sourceHandle: "video-prompt-out",
        targetHandle: "video-in",
        data: expect.objectContaining({
          prompt: "ein suesser Berner Sennenhund rennt ueber eine Wiese",
          modelId: "wan-2-2-480p",
          durationSeconds: 5,
        }),
      }),
    );

    expect(mocks.generateVideo).toHaveBeenCalledTimes(1);
    expect(mocks.generateVideo).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "video-prompt-1",
      outputNodeId: "ai-video-node-1",
      prompt: "ein suesser Berner Sennenhund rennt ueber eine Wiese",
      modelId: "wan-2-2-480p",
      durationSeconds: 5,
    });
  });
});
