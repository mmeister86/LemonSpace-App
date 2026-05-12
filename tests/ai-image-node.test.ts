// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  edges: [] as Array<{ source: string; target: string }>,
  nodes: [] as Array<{ id: string; type: string; data: Record<string, unknown> }>,
  generateImage: vi.fn(async () => ({ queued: true, nodeId: "ai-image-1" })),
  getEdges: vi.fn(() => [] as Array<{ source: string; target: string }>),
  getNode: vi.fn((id: string) => mocks.nodes.find((node) => node.id === id) ?? null),
  push: vi.fn(),
  toastPromise: vi.fn(async <T,>(promise: Promise<T>) => await promise),
  toastWarning: vi.fn(),
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

vi.mock("@/lib/ai-errors", () => ({
  classifyError: (error: unknown) => ({
    type: "generic",
    rawMessage: error instanceof Error ? error.message : String(error ?? ""),
    retryable: true,
    creditsNotCharged: true,
  }),
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useConnection: () => ({ inProgress: false }),
  useReactFlow: () => ({
    getEdges: mocks.getEdges,
    getNode: mocks.getNode,
  }),
}));

import AiImageNode from "@/components/canvas/nodes/ai-image-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("AiImageNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.edges = [];
    mocks.nodes = [];
    mocks.generateImage.mockClear();
    mocks.getEdges.mockClear();
    mocks.getEdges.mockImplementation(() => mocks.edges);
    mocks.getNode.mockClear();
    mocks.getNode.mockImplementation(
      (id: string) => mocks.nodes.find((node) => node.id === id) ?? null,
    );
    mocks.push.mockClear();
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

  it("reuses the prompt node image reference when regenerating", async () => {
    mocks.edges = [
      { source: "prompt-1", target: "ai-image-1" },
      { source: "image-1", target: "prompt-1" },
    ];
    mocks.nodes = [
      { id: "prompt-1", type: "prompt", data: {} },
      { id: "image-1", type: "image", data: { storageId: "storage-image-1" } },
    ];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AiImageNode, {
          id: "ai-image-1",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "ai-image",
          data: {
            canvasId: "canvas-1",
            prompt: "neue variante",
            model: "google/gemini-2.5-flash-image",
            aspectRatio: "1:1",
            url: "https://generated.test/image.png",
            _status: "done",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Regenerate"),
    );

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Regenerate button not found");
    }

    await act(async () => {
      button.click();
    });

    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasId: "canvas-1",
        nodeId: "ai-image-1",
        prompt: "neue variante",
        referenceStorageId: "storage-image-1",
      }),
    );
  });
});
