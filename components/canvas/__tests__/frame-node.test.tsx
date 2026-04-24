// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  exportFrameAsJpeg: vi.fn(async () => undefined),
  fitBounds: vi.fn(async () => true),
  getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  setViewport: vi.fn(async () => true),
  getNode: vi.fn(() => ({ data: {} })),
  getNodes: vi.fn(() => []),
  getEdges: vi.fn(() => []),
  setNodes: vi.fn(),
  deleteElements: vi.fn(async () => undefined),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  NodeToolbar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  NodeResizeControl: () => null,
  useNodeId: () => "frame-1",
  useReactFlow: () => ({
    fitBounds: mocks.fitBounds,
    getViewport: mocks.getViewport,
    setViewport: mocks.setViewport,
    getNode: mocks.getNode,
    getNodes: mocks.getNodes,
    getEdges: mocks.getEdges,
    setNodes: mocks.setNodes,
    deleteElements: mocks.deleteElements,
  }),
  getConnectedEdges: () => [],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    status: { isOffline: false },
  }),
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeWithIntersection: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: () => <div data-testid="canvas-handle" />,
}));

vi.mock("@/components/canvas/frame-jpeg-export", () => ({
  exportFrameAsJpeg: mocks.exportFrameAsJpeg,
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: vi.fn(),
  },
}));

import FrameNode from "@/components/canvas/nodes/frame-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("FrameNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if (typeof mock === "function" && "mockClear" in mock) {
        mock.mockClear();
      }
    });

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
  });

  async function renderFrame() {
    await act(async () => {
      root?.render(
        <FrameNode
          id="frame-1"
          type="frame"
          data={{ label: "Hero" }}
          selected={false}
          width={360}
          height={240}
          positionAbsoluteX={10}
          positionAbsoluteY={20}
          dragging={false}
          zIndex={0}
          selectable
          deletable
          draggable
          isConnectable
        />,
      );
    });
  }

  it("renders a JPEG export button and calls the client-side frame exporter", async () => {
    await renderFrame();

    const exportButton = container?.querySelector('button[title="Export as JPEG"]');
    if (!(exportButton instanceof HTMLButtonElement)) {
      throw new Error("Export button not found");
    }

    expect(exportButton.textContent).toContain("Export JPEG");

    await act(async () => {
      exportButton.click();
    });

    expect(mocks.exportFrameAsJpeg).toHaveBeenCalledWith(
      expect.objectContaining({
        frameId: "frame-1",
        frameLabel: "Hero",
        frameBounds: { x: 10, y: 20, width: 360, height: 240 },
      }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("export.frameExported");
  });
});
