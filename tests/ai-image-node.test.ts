// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  edges: [] as Array<{ source: string; target: string }>,
  nodes: [] as Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    position?: { x: number; y: number };
  }>,
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
  default: ({
    children,
    status,
    statusMessage,
  }: {
    children: React.ReactNode;
    status?: string;
    statusMessage?: string;
  }) =>
    React.createElement(
      "div",
      {
        "data-testid": "base-node-wrapper",
        "data-status": status ?? "",
        "data-status-message": statusMessage ?? "",
      },
      children,
    ),
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
    vi.unstubAllEnvs();
  });

  async function renderAiImageNode(data: Record<string, unknown>) {
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
          data,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });
  }

  it("shows the generating overlay and forwards executing status to the wrapper", async () => {
    await renderAiImageNode({
      canvasId: "canvas-1",
      prompt: "ein leuchtender zitronenhain",
      model: "google/gemini-2.5-flash-image",
      aspectRatio: "1:1",
      _status: "executing",
      _statusMessage: "Generating image",
    });

    expect(container?.textContent).toContain("Generating…");
    const wrapper = container?.querySelector('[data-testid="base-node-wrapper"]');
    expect(wrapper?.getAttribute("data-status")).toBe("executing");
    expect(wrapper?.getAttribute("data-status-message")).toBe("Generating image");
  });

  it("renders the generated image preview when a resolved URL is present", async () => {
    await renderAiImageNode({
      canvasId: "canvas-1",
      prompt: "fertiges bild",
      model: "google/gemini-2.5-flash-image",
      aspectRatio: "1:1",
      url: "https://generated.test/image.png",
      _status: "done",
    });

    const images = Array.from(container?.querySelectorAll("img") ?? []);
    expect(
      images.some(
        (image) => image.getAttribute("src") === "https://generated.test/image.png",
      ),
    ).toBe(true);
    expect(container?.textContent).not.toContain("Bildvorschau wird geladen");
  });

  it("renders the generated image preview when only a preview URL is present", async () => {
    await renderAiImageNode({
      canvasId: "canvas-1",
      prompt: "fertiges preview-bild",
      model: "google/gemini-2.5-flash-image",
      aspectRatio: "1:1",
      previewUrl: "https://generated.test/preview.png",
      _status: "done",
    });

    const images = Array.from(container?.querySelectorAll("img") ?? []);
    expect(
      images.some(
        (image) =>
          image.getAttribute("src") === "https://generated.test/preview.png",
      ),
    ).toBe(true);
    expect(container?.textContent).not.toContain("Bildvorschau wird geladen");
  });

  it("renders a generated image preview from storage while URL enrichment catches up", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");

    await renderAiImageNode({
      canvasId: "canvas-1",
      prompt: "bild im storage",
      model: "google/gemini-2.5-flash-image",
      aspectRatio: "1:1",
      storageId: "storage-generated-1",
      _status: "done",
    });

    const images = Array.from(container?.querySelectorAll("img") ?? []);
    expect(
      images.some(
        (image) =>
          image.getAttribute("src") ===
          "https://example.convex.cloud/api/storage/storage-generated-1",
      ),
    ).toBe(true);
    expect(container?.textContent).not.toContain("Bildvorschau wird geladen");
  });

  it("falls back to the storage preview when the resolved image URL fails to load", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");

    await renderAiImageNode({
      canvasId: "canvas-1",
      prompt: "bild mit abgelaufener url",
      model: "google/gemini-2.5-flash-image",
      aspectRatio: "1:1",
      url: "https://generated.test/expired.png",
      storageId: "storage-generated-1",
      _status: "done",
    });

    const primaryPreview = Array.from(container?.querySelectorAll("img") ?? []).find(
      (image) =>
        image.getAttribute("aria-hidden") !== "true" &&
        image.getAttribute("src") === "https://generated.test/expired.png",
    );
    if (!(primaryPreview instanceof HTMLImageElement)) {
      throw new Error("Primary preview image not found");
    }

    await act(async () => {
      primaryPreview.dispatchEvent(new Event("error"));
    });

    const images = Array.from(container?.querySelectorAll("img") ?? []);
    expect(
      images.some(
        (image) =>
          image.getAttribute("src") ===
          "https://example.convex.cloud/api/storage/storage-generated-1",
      ),
    ).toBe(true);
  });

  it("shows a resolving preview placeholder when storage cannot be resolved yet", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");

    await renderAiImageNode({
      canvasId: "canvas-1",
      prompt: "bild im storage",
      model: "google/gemini-2.5-flash-image",
      aspectRatio: "1:1",
      storageId: "storage-generated-1",
      _status: "done",
    });

    expect(container?.textContent).toContain("Bildvorschau wird geladen…");
    expect(container?.textContent).not.toContain(
      "Verbinde einen Prompt-Knoten und starte die Generierung dort.",
    );
  });

  it("reuses prompt node visual references when regenerating", async () => {
    mocks.edges = [
      { source: "prompt-1", target: "ai-image-1" },
      { source: "image-1", target: "prompt-1" },
      { source: "asset-1", target: "prompt-1" },
    ];
    mocks.nodes = [
      { id: "prompt-1", type: "prompt", data: {} },
      { id: "asset-1", type: "asset", position: { x: 0, y: 0 }, data: { url: "https://asset.test/ref.png" } },
      { id: "image-1", type: "image", position: { x: 0, y: 200 }, data: { storageId: "storage-image-1" } },
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
        referenceImages: [
          expect.objectContaining({
            sourceNodeId: "asset-1",
            sourceType: "asset",
            label: "Ref 1",
            imageUrl: "https://asset.test/ref.png",
          }),
          expect.objectContaining({
            sourceNodeId: "image-1",
            sourceType: "image",
            label: "Ref 2",
            storageId: "storage-image-1",
          }),
        ],
      }),
    );
  });

  it("falls back to persisted legacy single-reference data when regenerating", async () => {
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
            prompt: "alte variante",
            model: "google/gemini-2.5-flash-image",
            aspectRatio: "1:1",
            url: "https://generated.test/image.png",
            referenceStorageId: "legacy-storage-1",
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
        referenceImages: [
          expect.objectContaining({
            sourceNodeId: "legacy-reference",
            sourceType: "image",
            label: "Ref 1",
            storageId: "legacy-storage-1",
          }),
        ],
      }),
    );
  });
});
