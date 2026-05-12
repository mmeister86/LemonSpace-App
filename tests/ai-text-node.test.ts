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
  subscription: { tier: "starter" as const },
  queueNodeDataUpdate: vi.fn(async () => undefined),
  createNodeConnectedFromSource: vi.fn(async () => "ai-text-output-1" as Id<"nodes">),
  generateText: vi.fn(async () => ({ queued: true, outputNodeId: "ai-text-output-1" })),
  fetch: vi.fn(async () => new Response("Streamed text")),
  getNode: vi.fn((id: string) =>
    id === "ai-text-1"
      ? { id, position: { x: 100, y: 50 }, measured: { width: 360, height: 360 } }
      : null,
  ),
  push: vi.fn(),
  toastPromise: vi.fn(async <T,>(promise: Promise<T>) => await promise),
  toastWarning: vi.fn(),
  toastAction: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "run.elapsed" && !values?.time) {
      throw new Error('FORMATTING_ERROR: The intl string context variable "time" was not provided');
    }
    return values?.time ? String(values.time) : key;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("convex/react", () => ({
  useAction: () => mocks.generateText,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ai: {
      generateText: "ai.generateText",
    },
    credits: {
      getBalance: "credits.getBalance",
      getSubscription: "credits.getSubscription",
    },
  },
}));

vi.mock("@/hooks/use-auth-query", () => ({
  useAuthQuery: (query: string) => {
    if (query === "credits.getSubscription") return mocks.subscription;
    return mocks.balance;
  },
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
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) =>
    React.createElement(
      "select",
      {
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
    getNode: mocks.getNode,
  }),
}));

import AiTextNode from "@/components/canvas/nodes/ai-text-node";
import {
  getLocalNodeStreamSnapshot,
  resetLocalNodeStreamsForTests,
  setLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function renderAiTextNode(root: Root, data: Record<string, unknown> = {}) {
  root.render(
    React.createElement(AiTextNode, {
      id: "ai-text-1",
      selected: false,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: true,
      zIndex: 1,
      isConnectable: true,
      type: "ai-text",
      data: {
        instruction: "Verbessere den Text",
        inputText: "",
        modelId: "openai/gpt-5.4-mini",
        canvasId: "canvas-1",
        ...data,
      },
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    }),
  );
}

describe("AiTextNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.edges = [];
    mocks.nodes = [];
    mocks.balance = { balance: 100, reserved: 0 };
    mocks.subscription = { tier: "starter" };
    mocks.queueNodeDataUpdate.mockClear();
    mocks.createNodeConnectedFromSource.mockClear();
    mocks.generateText.mockClear();
    mocks.fetch.mockClear();
    vi.stubGlobal("fetch", mocks.fetch);
    resetLocalNodeStreamsForTests();
    mocks.getNode.mockClear();
    mocks.push.mockClear();
    mocks.toastPromise.mockClear();
    mocks.toastWarning.mockClear();
    mocks.toastAction.mockClear();
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

  it("syncs connected text into the draft input", async () => {
    mocks.edges = [{ source: "text-1", target: "ai-text-1" }];
    mocks.nodes = [
      {
        id: "text-1",
        type: "text",
        data: { content: "Rohtext aus der Text-Node" },
      },
    ];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderAiTextNode(root!);
    });

    const draftInput = container.querySelector("#ai-text-1-input");
    expect(draftInput).toBeInstanceOf(HTMLTextAreaElement);
    expect((draftInput as HTMLTextAreaElement).value).toBe("Rohtext aus der Text-Node");
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "ai-text-1",
        data: expect.objectContaining({
          inputText: "Rohtext aus der Text-Node",
        }),
      }),
    );
  });

  it("shows connected input feedback for an empty text node", async () => {
    mocks.edges = [{ source: "text-1", target: "ai-text-1" }];
    mocks.nodes = [
      {
        id: "text-1",
        type: "text",
        data: { content: "" },
      },
    ];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderAiTextNode(root!);
    });

    expect(container.textContent).toContain("inputFromTextNode");
    expect(container.textContent).toContain("connectedInputEmpty");
  });

  it("creates an ai-text-output node before starting generation", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderAiTextNode(root!);
    });

    await act(async () => {
      renderAiTextNode(root!, { inputText: "Bitte knackiger machen." });
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

    expect(mocks.createNodeConnectedFromSource).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ai-text-output",
        sourceNodeId: "ai-text-1",
        sourceHandle: "ai-text-out",
        targetHandle: "ai-text-output-in",
        data: expect.objectContaining({
          inputText: "Bitte knackiger machen.",
          modelId: "openai/gpt-5.4-mini",
          runStartedAt: expect.any(Number),
          runEvents: [
            expect.objectContaining({
              phase: "preparing",
              message: "run.preparingMessage",
            }),
          ],
        }),
      }),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/ai-stream/text",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasId: "canvas-1",
          sourceNodeId: "ai-text-1",
          outputNodeId: "ai-text-output-1",
          modelId: "openai/gpt-5.4-mini",
          instruction: "Verbessere den Text",
          inputText: "Bitte knackiger machen.",
        }),
      }),
    );
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="ai-run-status-panel"]')).not.toBeNull();
    expect(container.textContent).toContain("run.finalizingMessage");
    expect(container.textContent).not.toContain("run.doneMessage");
    expect(getLocalNodeStreamSnapshot("ai-text-output-1")?.text).toBe("Streamed text");
  });

  it("marks the source run done only after the connected output is persisted", async () => {
    setLocalNodeStream("ai-text-1", {
      text: "",
      status: "streaming",
      phase: "finalizing",
      startedAt: 10,
      events: [
        {
          id: "event-1",
          phase: "finalizing",
          message: "run.finalizingMessage",
          createdAt: 10,
          status: "running",
        },
      ],
    });
    mocks.edges = [{ source: "ai-text-1", target: "ai-text-output-1" }];
    mocks.nodes = [
      {
        id: "ai-text-output-1",
        type: "ai-text-output",
        data: { _status: "done", runFinishedAt: 20 },
      },
    ];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderAiTextNode(root!, { inputText: "Bitte knackiger machen." });
    });

    expect(container.textContent).toContain("run.phase.done");
    expect(container.textContent).toContain("run.doneMessage");
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
