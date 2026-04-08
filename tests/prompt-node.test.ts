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
  createNodeConnectedFromSource: vi.fn(async () => "ai-image-node-1" as Id<"nodes">),
  generateImage: vi.fn(async () => ({ queued: true, nodeId: "ai-image-node-1" })),
  getEdges: vi.fn(() => [] as Array<{ source: string; target: string }>),
  getNode: vi.fn((id: string) =>
    id === "prompt-1"
      ? { id, position: { x: 100, y: 50 }, measured: { width: 280, height: 220 } }
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
  useAction: () => mocks.generateImage,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ai: {
      generateImage: "ai.generateImage",
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
        "data-testid": value.includes("/") ? "model-select" : "format-select",
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
  SelectGroup: ({ children }: { children: React.ReactNode }) => children,
  SelectLabel: ({ children }: { children: React.ReactNode }) =>
    React.createElement("optgroup", { label: String(children) }),
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useStore: (selector: (state: { edges: typeof mocks.edges; nodes: typeof mocks.nodes }) => unknown) =>
    selector({ edges: mocks.edges, nodes: mocks.nodes }),
  useReactFlow: () => ({
    getEdges: mocks.getEdges,
    getNode: mocks.getNode,
  }),
}));

import PromptNode from "@/components/canvas/nodes/prompt-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("PromptNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.edges = [];
    mocks.nodes = [];
    mocks.balance = { balance: 100, reserved: 0 };
    mocks.subscription = { tier: "starter" };
    mocks.queueNodeDataUpdate.mockClear();
    mocks.createNodeConnectedFromSource.mockClear();
    mocks.generateImage.mockClear();
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

  it("propagates selected image model into node creation and generation action", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(PromptNode, {
          id: "prompt-1",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "prompt",
          data: {
            prompt: "ein neugieriger hund im regen",
            aspectRatio: "1:1",
            canvasId: "canvas-1",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const modelSelect = container.querySelector('select[data-testid="model-select"]');
    if (!(modelSelect instanceof HTMLSelectElement)) {
      throw new Error("Model select not found");
    }

    await act(async () => {
      modelSelect.value = "openai/gpt-5-image-mini";
      modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const button = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Bild generieren"),
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
        type: "ai-image",
        sourceNodeId: "prompt-1",
        data: expect.objectContaining({
          model: "openai/gpt-5-image-mini",
          modelTier: "premium",
        }),
      }),
    );

    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasId: "canvas-1",
        nodeId: "ai-image-node-1",
        prompt: "ein neugieriger hund im regen",
        model: "openai/gpt-5-image-mini",
      }),
    );
  });
});
