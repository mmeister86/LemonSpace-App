// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasGraphProvider } from "@/components/canvas/canvas-graph-context";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ id, type }: { id?: string; type: string }) => (
    <div data-testid={`handle-${id ?? "default"}`} data-handle-id={id} data-handle-type={type} />
  ),
  Position: { Left: "left", Right: "right" },
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    queueNodeResize: vi.fn(async () => undefined),
    status: { pendingCount: 0, isSyncing: false, isOffline: false },
  }),
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import MixerNode from "@/components/canvas/nodes/mixer-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestNode = {
  id: string;
  type: string;
  data?: unknown;
};

type TestEdge = {
  id: string;
  source: string;
  target: string;
  targetHandle?: string;
};

function buildMixerNodeProps(overrides?: Partial<React.ComponentProps<typeof MixerNode>>) {
  return {
    id: "mixer-1",
    data: {
      blendMode: "normal",
      opacity: 100,
      offsetX: 0,
      offsetY: 0,
    },
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    type: "mixer",
    xPos: 0,
    yPos: 0,
    width: 360,
    height: 300,
    sourcePosition: undefined,
    targetPosition: undefined,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    ...overrides,
  } as React.ComponentProps<typeof MixerNode>;
}

describe("MixerNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.queueNodeDataUpdate.mockClear();
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
    root = null;
    container = null;
  });

  async function renderNode(args?: {
    nodes?: TestNode[];
    edges?: TestEdge[];
    props?: Partial<React.ComponentProps<typeof MixerNode>>;
  }) {
    const nodes = args?.nodes ?? [{ id: "mixer-1", type: "mixer", data: {} }];
    const edges = args?.edges ?? [];

    await act(async () => {
      root?.render(
        <CanvasGraphProvider nodes={nodes} edges={edges}>
          <MixerNode {...buildMixerNodeProps(args?.props)} />
        </CanvasGraphProvider>,
      );
    });
  }

  it("renders empty state copy when no inputs are connected", async () => {
    await renderNode();

    expect(container?.textContent).toContain("Connect base and overlay images");
  });

  it("renders partial state copy when only one input is connected", async () => {
    await renderNode({
      nodes: [
        { id: "image-1", type: "image", data: { url: "https://cdn.example.com/base.png" } },
        { id: "mixer-1", type: "mixer", data: {} },
      ],
      edges: [{ id: "edge-base", source: "image-1", target: "mixer-1", targetHandle: "base" }],
    });

    expect(container?.textContent).toContain("Waiting for second input");
  });

  it("renders ready state with stacked base and overlay previews", async () => {
    await renderNode({
      nodes: [
        { id: "image-base", type: "image", data: { url: "https://cdn.example.com/base.png" } },
        { id: "image-overlay", type: "asset", data: { url: "https://cdn.example.com/overlay.png" } },
        {
          id: "mixer-1",
          type: "mixer",
          data: { blendMode: "multiply", opacity: 60, offsetX: 14, offsetY: -8 },
        },
      ],
      edges: [
        { id: "edge-base", source: "image-base", target: "mixer-1", targetHandle: "base" },
        {
          id: "edge-overlay",
          source: "image-overlay",
          target: "mixer-1",
          targetHandle: "overlay",
        },
      ],
    });

    const baseImage = container?.querySelector('img[alt="Mixer base"]');
    const overlayImage = container?.querySelector('img[alt="Mixer overlay"]');

    expect(baseImage).toBeTruthy();
    expect(overlayImage).toBeTruthy();
  });

  it("queues node data updates for blend mode, opacity, and overlay offsets", async () => {
    await renderNode();

    const blendMode = container?.querySelector('select[name="blendMode"]');
    const opacity = container?.querySelector('input[name="opacity"]');
    const offsetX = container?.querySelector('input[name="offsetX"]');
    const offsetY = container?.querySelector('input[name="offsetY"]');

    if (!(blendMode instanceof HTMLSelectElement)) {
      throw new Error("blendMode select not found");
    }
    if (!(opacity instanceof HTMLInputElement)) {
      throw new Error("opacity input not found");
    }
    if (!(offsetX instanceof HTMLInputElement)) {
      throw new Error("offsetX input not found");
    }
    if (!(offsetY instanceof HTMLInputElement)) {
      throw new Error("offsetY input not found");
    }

    await act(async () => {
      blendMode.value = "screen";
      blendMode.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ blendMode: "screen" }),
    });

    await act(async () => {
      opacity.value = "45";
      opacity.dispatchEvent(new Event("input", { bubbles: true }));
      opacity.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ opacity: 45 }),
    });

    await act(async () => {
      offsetX.value = "12";
      offsetX.dispatchEvent(new Event("input", { bubbles: true }));
      offsetX.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ offsetX: 12 }),
    });

    await act(async () => {
      offsetY.value = "-6";
      offsetY.dispatchEvent(new Event("input", { bubbles: true }));
      offsetY.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ offsetY: -6 }),
    });
  });

  it("renders expected mixer handles", async () => {
    await renderNode();

    expect(container?.querySelector('[data-handle-id="base"][data-handle-type="target"]')).toBeTruthy();
    expect(container?.querySelector('[data-handle-id="overlay"][data-handle-type="target"]')).toBeTruthy();
    expect(container?.querySelector('[data-handle-id="mixer-out"][data-handle-type="source"]')).toBeTruthy();
  });
});
