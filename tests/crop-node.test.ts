// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CropNodeData } from "@/lib/image-pipeline/crop-node-data";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  setPreviewNodeDataOverride: vi.fn(),
  clearPreviewNodeDataOverride: vi.fn(),
  collectPipelineFromGraph: vi.fn(() => []),
  getSourceImageFromGraph: vi.fn(() => "https://cdn.example.com/source.png"),
  shouldFastPathPreviewPipeline: vi.fn(() => false),
}));

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("lucide-react", () => ({
  Crop: () => null,
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
  }),
}));

vi.mock("@/components/canvas/canvas-graph-context", () => ({
  useCanvasGraph: () => ({ nodes: [], edges: [], previewNodeDataOverrides: {} }),
  useCanvasGraphPreviewOverrides: () => ({
    setPreviewNodeDataOverride: mocks.setPreviewNodeDataOverride,
    clearPreviewNodeDataOverride: mocks.clearPreviewNodeDataOverride,
  }),
}));

vi.mock("@/hooks/use-pipeline-preview", () => ({
  usePipelinePreview: () => ({
    canvasRef: { current: null },
    hasSource: true,
    isRendering: false,
    previewAspectRatio: 1,
    error: null,
  }),
}));

vi.mock("@/lib/canvas-render-preview", () => ({
  collectPipelineFromGraph: mocks.collectPipelineFromGraph,
  getSourceImageFromGraph: mocks.getSourceImageFromGraph,
  shouldFastPathPreviewPipeline: mocks.shouldFastPathPreviewPipeline,
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  SelectContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  SelectItem: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  SelectValue: () => null,
}));

import CropNode from "@/components/canvas/nodes/crop-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PointerInit = {
  pointerId?: number;
  clientX: number;
  clientY: number;
};

function dispatchPointerEvent(target: Element, type: string, init: PointerInit) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  }) as MouseEvent & { pointerId?: number };
  event.pointerId = init.pointerId ?? 1;
  target.dispatchEvent(event);
}

function getNumberInput(container: HTMLElement, labelKey: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll("label")).find((element) =>
    element.textContent?.includes(labelKey),
  );
  if (!(label instanceof HTMLLabelElement)) {
    throw new Error(`Label not found: ${labelKey}`);
  }
  const input = label.querySelector("input[type='number']");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input not found for: ${labelKey}`);
  }
  return input;
}

describe("CropNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.queueNodeDataUpdate.mockClear();
    mocks.setPreviewNodeDataOverride.mockClear();
    mocks.clearPreviewNodeDataOverride.mockClear();
    mocks.collectPipelineFromGraph.mockClear();
    mocks.collectPipelineFromGraph.mockReturnValue([]);

    if (!("setPointerCapture" in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
        configurable: true,
        value: () => undefined,
      });
    }
    if (!("releasePointerCapture" in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
        configurable: true,
        value: () => undefined,
      });
    }
    vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, "releasePointerCapture").mockImplementation(() => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function renderNode(data: CropNodeData) {
    await act(async () => {
      root?.render(
        React.createElement(CropNode, {
          id: "crop-1",
          data,
          selected: false,
          dragging: false,
          zIndex: 0,
          isConnectable: true,
          type: "crop",
          xPos: 0,
          yPos: 0,
          width: 320,
          height: 360,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        } as never),
      );
    });
  }

  function setPreviewBounds() {
    const preview = container?.querySelector("[data-testid='crop-preview-area']");
    if (!(preview instanceof HTMLElement)) {
      throw new Error("Preview area not found");
    }
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });
    return preview;
  }

  it("moves crop rect when dragging inside overlay", async () => {
    await renderNode({
      crop: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
      resize: { mode: "source", fit: "cover", keepAspect: false },
    });
    setPreviewBounds();

    const overlay = container?.querySelector("[data-testid='crop-overlay']");
    if (!(overlay instanceof HTMLElement)) {
      throw new Error("Overlay not found");
    }

    await act(async () => {
      dispatchPointerEvent(overlay, "pointerdown", { clientX: 40, clientY: 40 });
      dispatchPointerEvent(overlay, "pointermove", { clientX: 60, clientY: 60 });
      dispatchPointerEvent(overlay, "pointerup", { clientX: 60, clientY: 60 });
    });

    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.x").value).toBe("0.2");
    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.y").value).toBe("0.2");
  });

  it("resizes crop rect from corner and edge handles", async () => {
    await renderNode({
      crop: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
      resize: { mode: "source", fit: "cover", keepAspect: false },
    });
    setPreviewBounds();

    const eastHandle = container?.querySelector("[data-testid='crop-handle-e']");
    const southEastHandle = container?.querySelector("[data-testid='crop-handle-se']");
    if (!(eastHandle instanceof HTMLElement) || !(southEastHandle instanceof HTMLElement)) {
      throw new Error("Resize handles not found");
    }

    await act(async () => {
      dispatchPointerEvent(eastHandle, "pointerdown", { clientX: 100, clientY: 80 });
      dispatchPointerEvent(eastHandle, "pointermove", { clientX: 140, clientY: 80 });
      dispatchPointerEvent(eastHandle, "pointerup", { clientX: 140, clientY: 80 });
    });

    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.width").value).toBe("0.6");

    await act(async () => {
      dispatchPointerEvent(southEastHandle, "pointerdown", { clientX: 140, clientY: 140 });
      dispatchPointerEvent(southEastHandle, "pointermove", { clientX: 160, clientY: 180 });
      dispatchPointerEvent(southEastHandle, "pointerup", { clientX: 160, clientY: 180 });
    });

    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.width").value).toBe("0.7");
    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.height").value).toBe("0.6");
  });

  it("preserves aspect ratio while resizing when keepAspect is enabled", async () => {
    await renderNode({
      crop: { x: 0.1, y: 0.1, width: 0.4, height: 0.2 },
      resize: { mode: "source", fit: "cover", keepAspect: true },
    });
    setPreviewBounds();

    const southEastHandle = container?.querySelector("[data-testid='crop-handle-se']");
    if (!(southEastHandle instanceof HTMLElement)) {
      throw new Error("Corner handle not found");
    }

    await act(async () => {
      dispatchPointerEvent(southEastHandle, "pointerdown", { clientX: 100, clientY: 60 });
      dispatchPointerEvent(southEastHandle, "pointermove", { clientX: 140, clientY: 60 });
      dispatchPointerEvent(southEastHandle, "pointerup", { clientX: 140, clientY: 60 });
    });

    expect(Number(getNumberInput(container as HTMLElement, "adjustments.crop.fields.width").value)).toBeCloseTo(
      0.6,
      6,
    );
    expect(Number(getNumberInput(container as HTMLElement, "adjustments.crop.fields.height").value)).toBeCloseTo(
      0.3,
      6,
    );
  });

  it("clamps drag operations to image bounds", async () => {
    await renderNode({
      crop: { x: 0.7, y: 0.7, width: 0.3, height: 0.3 },
      resize: { mode: "source", fit: "cover", keepAspect: false },
    });
    setPreviewBounds();

    const overlay = container?.querySelector("[data-testid='crop-overlay']");
    if (!(overlay instanceof HTMLElement)) {
      throw new Error("Overlay not found");
    }

    await act(async () => {
      dispatchPointerEvent(overlay, "pointerdown", { clientX: 150, clientY: 150 });
      dispatchPointerEvent(overlay, "pointermove", { clientX: -50, clientY: -50 });
      dispatchPointerEvent(overlay, "pointerup", { clientX: -50, clientY: -50 });
    });

    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.x").value).toBe("0");
    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.y").value).toBe("0");
  });

  it("ignores drag starts outside overlay and handles", async () => {
    await renderNode({
      crop: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
      resize: { mode: "source", fit: "cover", keepAspect: false },
    });
    setPreviewBounds();

    const preview = container?.querySelector("[data-testid='crop-preview-area']");
    if (!(preview instanceof HTMLElement)) {
      throw new Error("Preview not found");
    }

    await act(async () => {
      dispatchPointerEvent(preview, "pointerdown", { clientX: 10, clientY: 10 });
      dispatchPointerEvent(preview, "pointermove", { clientX: 120, clientY: 120 });
      dispatchPointerEvent(preview, "pointerup", { clientX: 120, clientY: 120 });
    });

    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.x").value).toBe("0.2");
    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.y").value).toBe("0.2");
    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.width").value).toBe("0.4");
    expect(getNumberInput(container as HTMLElement, "adjustments.crop.fields.height").value).toBe("0.4");
    expect(mocks.setPreviewNodeDataOverride).not.toHaveBeenCalled();
  });
});
