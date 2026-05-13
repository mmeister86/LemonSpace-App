// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  edges: [] as Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>,
  nodes: [] as Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
  }>,
  balance: { balance: 100, reserved: 0 } as { balance: number; reserved: number } | undefined,
  subscription: { tier: "starter" as const },
  queueNodeDataUpdate: vi.fn(async () => undefined),
  createNodeConnectedFromSource: vi.fn(async () => "ai-image-node-1" as Id<"nodes">),
  generateImage: vi.fn(async () => ({ queued: true, nodeId: "ai-image-node-1" })),
  generateUploadUrl: vi.fn(async () => "https://upload.test/render"),
  renderFullWithWorkerFallback: vi.fn(async () => ({
    blob: new Blob(["rendered"], { type: "image/png" }),
    width: 640,
    height: 360,
    mimeType: "image/png",
    format: "png" as const,
    quality: null,
    sizeBytes: 8,
    sourceWidth: 640,
    sourceHeight: 360,
    wasSizeClamped: false,
  })),
  getEdges: vi.fn(() => [] as Array<{ source: string; target: string }>),
  getNode: vi.fn((id: string): unknown =>
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
  useMutation: () => mocks.generateUploadUrl,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ai: {
      generateImage: "ai.generateImage",
    },
    storage: {
      generateUploadUrl: "storage.generateUploadUrl",
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

vi.mock("@/components/canvas/canvas-graph-context", () => ({
  useCanvasGraph: () => {
    const incomingEdgesByTarget = new Map<string, typeof mocks.edges>();
    for (const edge of mocks.edges) {
      const bucket = incomingEdgesByTarget.get(edge.target);
      if (bucket) bucket.push(edge);
      else incomingEdgesByTarget.set(edge.target, [edge]);
    }

    return {
      nodesById: new Map(mocks.nodes.map((node) => [node.id, node])),
      incomingEdgesByTarget,
      previewNodeDataOverrides: new Map(),
    };
  },
}));

vi.mock("@/lib/image-pipeline/worker-client", () => ({
  renderFullWithWorkerFallback: mocks.renderFullWithWorkerFallback,
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

vi.mock("@/components/canvas/nodes/canvas-ai-model-selector", () => ({
  CanvasAiModelSelector: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
  }) =>
    React.createElement(
      "select",
      {
        "data-testid": "model-select",
        value,
        onChange: (event: Event) => {
          onValueChange((event.target as HTMLSelectElement).value);
        },
      },
      [
        React.createElement("option", { key: "gemini", value: "google/gemini-2.5-flash-image" }, "Gemini 2.5 Flash"),
        React.createElement("option", { key: "gpt", value: "openai/gpt-5-image-mini" }, "GPT-5 Image Mini"),
      ],
    ),
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
    mocks.generateUploadUrl.mockClear();
    mocks.renderFullWithWorkerFallback.mockClear();
    mocks.getEdges.mockClear();
    mocks.getNode.mockClear();
    mocks.getEdges.mockImplementation(() => mocks.edges);
    mocks.getNode.mockImplementation((id: string) =>
      id === "prompt-1"
        ? { id, position: { x: 100, y: 50 }, measured: { width: 280, height: 220 } }
        : (mocks.nodes.find((node) => node.id === id) ?? null),
    );
    mocks.push.mockClear();
    mocks.toastPromise.mockClear();
    mocks.toastWarning.mockClear();
    mocks.toastAction.mockClear();
    mocks.toastError.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ storageId: "render-storage-1" }),
      })),
    );
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
    vi.unstubAllGlobals();
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

  it("passes a connected image node storage id as generation reference", async () => {
    mocks.edges = [{ source: "image-1", target: "prompt-1" }];
    mocks.nodes = [
      { id: "image-1", type: "image", data: { storageId: "storage-image-1" } },
    ];
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
            prompt: "mach daraus eine goldene produktvariante",
            aspectRatio: "1:1",
            canvasId: "canvas-1",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
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

    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "mach daraus eine goldene produktvariante",
        referenceImages: [
          expect.objectContaining({
            sourceNodeId: "image-1",
            sourceType: "image",
            label: "Ref 1",
            storageId: "storage-image-1",
          }),
        ],
      }),
    );
  });

  it("passes a connected asset URL as generation reference", async () => {
    mocks.edges = [{ source: "asset-1", target: "prompt-1" }];
    mocks.nodes = [
      {
        id: "asset-1",
        type: "asset",
        data: { url: "https://assets.test/full.png", previewUrl: "https://assets.test/preview.png" },
      },
    ];
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
            prompt: "variiere die lichtstimmung",
            aspectRatio: "1:1",
            canvasId: "canvas-1",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
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

    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "variiere die lichtstimmung",
        referenceImages: [
          expect.objectContaining({
            sourceNodeId: "asset-1",
            sourceType: "asset",
            label: "Ref 1",
            imageUrl: "https://assets.test/full.png",
          }),
        ],
      }),
    );
  });

  it("passes multiple visual references ordered by canvas position", async () => {
    mocks.edges = [
      { source: "image-bottom", target: "prompt-1" },
      { source: "asset-right", target: "prompt-1" },
      { source: "ai-left", target: "prompt-1" },
    ];
    mocks.nodes = [
      {
        id: "image-bottom",
        type: "image",
        position: { x: 0, y: 200 },
        data: { storageId: "storage-image-bottom" },
      },
      {
        id: "asset-right",
        type: "asset",
        position: { x: 300, y: 0 },
        data: { url: "https://assets.test/right.png" },
      },
      {
        id: "ai-left",
        type: "ai-image",
        position: { x: 0, y: 0 },
        data: { storageId: "storage-ai-left" },
      },
    ];
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
            prompt: "kombiniere die referenzen",
            aspectRatio: "1:1",
            canvasId: "canvas-1",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
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

    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: [
          expect.objectContaining({ sourceNodeId: "ai-left", label: "Ref 1" }),
          expect.objectContaining({ sourceNodeId: "asset-right", label: "Ref 2" }),
          expect.objectContaining({ sourceNodeId: "image-bottom", label: "Ref 3" }),
        ],
      }),
    );
    expect(container.textContent).toContain("Ref 1");
    expect(container.textContent).toContain("Ref 3");
  });

  it("uses a connected text node as prompt while keeping the image reference", async () => {
    mocks.edges = [
      { source: "image-1", target: "prompt-1" },
      { source: "text-1", target: "prompt-1" },
    ];
    mocks.nodes = [
      { id: "image-1", type: "image", data: { storageId: "storage-image-1" } },
      { id: "text-1", type: "text", data: { content: "text prompt aus node" } },
    ];
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
            prompt: "lokaler prompt",
            aspectRatio: "1:1",
            canvasId: "canvas-1",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
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

    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "text prompt aus node",
        referenceImages: [
          expect.objectContaining({
            sourceNodeId: "image-1",
            storageId: "storage-image-1",
          }),
        ],
      }),
    );
  });

  it("auto-bakes a stale render preview before passing it as a reference", async () => {
    mocks.edges = [
      { source: "source-image", target: "render-1" },
      { source: "render-1", target: "prompt-1" },
    ];
    mocks.nodes = [
      {
        id: "source-image",
        type: "image",
        position: { x: 0, y: 0 },
        data: { url: "https://cdn.test/source.png", width: 640, height: 360 },
      },
      {
        id: "render-1",
        type: "render",
        position: { x: 200, y: 0 },
        data: { outputResolution: "original", format: "png", lastUploadedHash: "stale-hash" },
      },
    ];
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
            prompt: "nutze den aktuellen render",
            aspectRatio: "16:9",
            canvasId: "canvas-1",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
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

    expect(mocks.renderFullWithWorkerFallback).toHaveBeenCalledTimes(1);
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "render-1",
        data: expect.objectContaining({
          storageId: "render-storage-1",
          lastUploadStorageId: "render-storage-1",
          lastUploadedHash: expect.any(String),
          lastRenderedHash: expect.any(String),
        }),
      }),
    );
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: [
          expect.objectContaining({
            sourceNodeId: "render-1",
            sourceType: "render",
            storageId: "render-storage-1",
            renderPipelineHash: expect.any(String),
          }),
        ],
      }),
    );
  });

  it("shows a compact reference image hint when an image source is connected", async () => {
    mocks.edges = [{ source: "image-1", target: "prompt-1" }];
    mocks.nodes = [
      { id: "image-1", type: "image", data: { storageId: "storage-image-1" } },
    ];
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
            prompt: "variante",
            aspectRatio: "1:1",
            canvasId: "canvas-1",
          },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Referenzbilder verbunden");
    expect(container.textContent).toContain("Ref 1");
  });
});
