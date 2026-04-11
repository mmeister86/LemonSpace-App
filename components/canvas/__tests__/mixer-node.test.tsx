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
      overlayX: 0,
      overlayY: 0,
      overlayWidth: 0.5,
      overlayHeight: 0.5,
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

  const readyNodes: TestNode[] = [
    { id: "image-base", type: "image", data: { url: "https://cdn.example.com/base.png" } },
    { id: "image-overlay", type: "asset", data: { url: "https://cdn.example.com/overlay.png" } },
    {
      id: "mixer-1",
      type: "mixer",
      data: {
        blendMode: "normal",
        opacity: 100,
        overlayX: 0,
        overlayY: 0,
        overlayWidth: 0.5,
        overlayHeight: 0.5,
      },
    },
  ];

  const readyEdges: TestEdge[] = [
    { id: "edge-base", source: "image-base", target: "mixer-1", targetHandle: "base" },
    { id: "edge-overlay", source: "image-overlay", target: "mixer-1", targetHandle: "overlay" },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
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
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const baseImage = container?.querySelector('img[alt="Mixer base"]');
    const overlayImage = container?.querySelector('img[alt="Mixer overlay"]');

    expect(baseImage).toBeTruthy();
    expect(overlayImage).toBeTruthy();
  });

  it("drag updates persisted overlay geometry", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const overlay = container?.querySelector('[data-testid="mixer-overlay"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(overlay instanceof HTMLImageElement)) {
      throw new Error("overlay image not found");
    }

    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 50, clientY: 50 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 90, clientY: 70 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({
        overlayX: 0.2,
        overlayY: 0.1,
        overlayWidth: 0.5,
        overlayHeight: 0.5,
      }),
    });
  });

  it("drag clamps overlay bounds inside preview", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const overlay = container?.querySelector('[data-testid="mixer-overlay"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(overlay instanceof HTMLImageElement)) {
      throw new Error("overlay image not found");
    }

    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 20, clientY: 20 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 400, clientY: 380 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({
        overlayX: 0.5,
        overlayY: 0.5,
        overlayWidth: 0.5,
        overlayHeight: 0.5,
      }),
    });
  });

  it("resize updates persisted overlay width and height", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-se"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("resize handle not found");
    }

    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    await act(async () => {
      resizeHandle.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }),
      );
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 140, clientY: 120 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({
        overlayWidth: 0.7,
        overlayHeight: 0.6,
      }),
    });
  });

  it("enforces minimum overlay size during resize", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-se"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("resize handle not found");
    }

    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    await act(async () => {
      resizeHandle.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }),
      );
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: -600, clientY: -700 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({
        overlayWidth: 0.1,
        overlayHeight: 0.1,
      }),
    });
  });

  it("numeric controls still update overlay rect fields", async () => {
    await renderNode();

    const blendMode = container?.querySelector('select[name="blendMode"]');
    const opacity = container?.querySelector('input[name="opacity"]');
    const overlayX = container?.querySelector('input[name="overlayX"]');
    const overlayY = container?.querySelector('input[name="overlayY"]');
    const overlayWidth = container?.querySelector('input[name="overlayWidth"]');
    const overlayHeight = container?.querySelector('input[name="overlayHeight"]');

    if (!(blendMode instanceof HTMLSelectElement)) {
      throw new Error("blendMode select not found");
    }
    if (!(opacity instanceof HTMLInputElement)) {
      throw new Error("opacity input not found");
    }
    if (!(overlayX instanceof HTMLInputElement)) {
      throw new Error("overlayX input not found");
    }
    if (!(overlayY instanceof HTMLInputElement)) {
      throw new Error("overlayY input not found");
    }
    if (!(overlayWidth instanceof HTMLInputElement)) {
      throw new Error("overlayWidth input not found");
    }
    if (!(overlayHeight instanceof HTMLInputElement)) {
      throw new Error("overlayHeight input not found");
    }

    await act(async () => {
      blendMode.value = "screen";
      blendMode.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ blendMode: "screen" }),
    });

    await act(async () => {
      opacity.value = "45";
      opacity.dispatchEvent(new Event("input", { bubbles: true }));
      opacity.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ opacity: 45 }),
    });

    await act(async () => {
      overlayX.value = "0.25";
      overlayX.dispatchEvent(new Event("input", { bubbles: true }));
      overlayX.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ overlayX: 0.25 }),
    });

    await act(async () => {
      overlayY.value = "0.4";
      overlayY.dispatchEvent(new Event("input", { bubbles: true }));
      overlayY.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ overlayY: 0.4 }),
    });

    await act(async () => {
      overlayWidth.value = "0.66";
      overlayWidth.dispatchEvent(new Event("input", { bubbles: true }));
      overlayWidth.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ overlayWidth: 0.66 }),
    });

    await act(async () => {
      overlayHeight.value = "0.33";
      overlayHeight.dispatchEvent(new Event("input", { bubbles: true }));
      overlayHeight.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ overlayHeight: 0.33 }),
    });
  });

  it("renders expected mixer handles", async () => {
    await renderNode();

    expect(container?.querySelector('[data-handle-id="base"][data-handle-type="target"]')).toBeTruthy();
    expect(container?.querySelector('[data-handle-id="overlay"][data-handle-type="target"]')).toBeTruthy();
    expect(container?.querySelector('[data-handle-id="mixer-out"][data-handle-type="source"]')).toBeTruthy();
  });
});
