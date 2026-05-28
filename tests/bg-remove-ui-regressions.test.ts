// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bgRemovePreview: {
    canvasRef: { current: null as HTMLCanvasElement | null },
    histogram: {},
    isRendering: false,
    hasSource: true,
    previewAspectRatio: 0.75,
    error: null as string | null,
  },
  capturedToolbarActions: [] as Array<{
    id: string;
    label: string;
    disabled?: boolean;
  }>,
  createNodeConnectedFromSource: vi.fn(),
  getNode: vi.fn(),
  queueNodeDataUpdate: vi.fn(),
  runTransform: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  useReactFlow: () => ({ getNode: mocks.getNode }),
  useStore: <T,>(selector: (store: { edges: unknown[]; nodes: unknown[] }) => T) =>
    selector({ edges: [], nodes: [] }),
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    status: { isOffline: false },
  }),
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeConnectedFromSource: mocks.createNodeConnectedFromSource,
  }),
}));

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: () => null,
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({
    children,
    toolbarActions = [],
  }: {
    children: React.ReactNode;
    toolbarActions?: typeof mocks.capturedToolbarActions;
  }) => {
    mocks.capturedToolbarActions = toolbarActions;
    return React.createElement("div", { "data-testid": "base-node-wrapper" }, children);
  },
}));

vi.mock("@/components/canvas/nodes/image-transform-operation-controls", () => ({
  ImageTransformOperationControls: () =>
    React.createElement("div", { "data-testid": "operation-controls" }),
}));

vi.mock("@/hooks/use-pipeline-preview", () => ({
  usePipelinePreview: () => mocks.bgRemovePreview,
}));

vi.mock("@/components/canvas/nodes/use-image-transform-runner", () => ({
  useImageTransformRunner: () => ({
    isExecuting: false,
    localError: null,
    runTransform: mocks.runTransform,
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

import BgRemoveOutputNode from "@/components/canvas/nodes/bg-remove-output-node";
import { ImageTransformNodeBody } from "@/components/canvas/nodes/image-transform-node";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import { NODE_DEFAULTS } from "@/lib/canvas-utils";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("bg remove UI regressions", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.capturedToolbarActions = [];
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

  it("starts bg-remove nodes tall enough to contain the compact preview and controls", () => {
    expect(NODE_DEFAULTS["bg-remove"].height).toBeGreaterThanOrEqual(340);
    expect(
      CANVAS_NODE_TEMPLATES.find((template) => template.type === "bg-remove"),
    ).toMatchObject({ height: NODE_DEFAULTS["bg-remove"].height });
  });

  it("renders bg-remove previews without stretching the input canvas", async () => {
    await act(async () => {
      root?.render(
        React.createElement(ImageTransformNodeBody, {
          id: "bg-remove-1",
          operationType: "bg-remove",
          width: 300,
          data: { operation: "bg-remove", parameters: { type: "bg-remove" } },
        }),
      );
    });

    const canvas = container?.querySelector("canvas");
    expect(canvas?.className).toContain("object-contain");
  });

  it("adds fullscreen access to bg-remove output nodes when an image is available", async () => {
    await act(async () => {
      root?.render(
        React.createElement(BgRemoveOutputNode, {
          id: "bg-output-1",
          selected: true,
          data: { url: "https://cdn.example.com/bg.png", filename: "bg.png" },
          type: "bg-remove-output",
        } as React.ComponentProps<typeof BgRemoveOutputNode>),
      );
    });

    expect(mocks.capturedToolbarActions).toContainEqual(
      expect.objectContaining({
        id: "fullscreen-output",
        label: "Fullscreen",
        disabled: false,
      }),
    );
  });
});
