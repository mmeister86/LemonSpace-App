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

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: ({
    id,
    type,
    nodeId,
    nodeType,
    style,
  }: {
    id?: string;
    type: "source" | "target";
    nodeId: string;
    nodeType?: string;
    style?: React.CSSProperties;
  }) => (
    <div
      data-canvas-handle="true"
      data-handle-id={id ?? ""}
      data-handle-type={type}
      data-node-id={nodeId}
      data-node-type={nodeType ?? ""}
      data-top={typeof style?.top === "string" ? style.top : ""}
    />
  ),
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
  width?: number;
  height?: number;
};

type TestEdge = {
  id: string;
  source: string;
  target: string;
  targetHandle?: string;
};

function cropRectData(x: number, y: number, width: number, height: number) {
  return {
    cropLeft: x,
    cropTop: y,
    cropRight: 1 - (x + width),
    cropBottom: 1 - (y + height),
  };
}

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
      ...cropRectData(0, 0, 1, 1),
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
  let resizeObserverCallback:
    | ((entries: Array<{ target: Element; contentRect: { width: number; height: number } }>) => void)
    | null = null;

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
        ...cropRectData(0, 0, 1, 1),
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
    resizeObserverCallback = null;
    globalThis.ResizeObserver = class ResizeObserver {
      constructor(
        callback: (
          entries: Array<{ target: Element; contentRect: { width: number; height: number } }>,
        ) => void,
      ) {
        resizeObserverCallback = callback;
      }

      observe(target: Element) {
        resizeObserverCallback?.([
          {
            target,
            contentRect: { width: 200, height: 200 },
          },
        ]);
      }

      unobserve() {}

      disconnect() {}
    } as unknown as typeof ResizeObserver;
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

  function mockPreviewRect(preview: HTMLDivElement) {
    return vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
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
  }

  function lastPersistedData() {
    const raw = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    return raw?.[0] as { nodeId: string; data: Record<string, unknown> } | undefined;
  }

  it("renders empty state copy when no inputs are connected", async () => {
    await renderNode();
    expect(container?.textContent).toContain("Connect base and overlay inputs");
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
    expect(container?.querySelector('img[alt="Mixer base"]')).toBeTruthy();
    expect(container?.querySelector('img[alt="Mixer overlay"]')).toBeTruthy();
  });

  it("renders a connected text node as rich text overlay content", async () => {
    await renderNode({
      nodes: [
        { id: "image-base", type: "image", data: { url: "https://cdn.example.com/base.png" } },
        {
          id: "text-overlay",
          type: "text",
          data: {
            content: "Plain fallback",
            richText: {
              format: "editorjs",
              version: 1,
              blocks: [{ type: "header", data: { text: "Rich <b>headline</b>", level: 2 } }],
            },
          },
          width: 240,
          height: 120,
        },
        readyNodes[2],
      ],
      edges: [
        { id: "edge-base", source: "image-base", target: "mixer-1", targetHandle: "base" },
        { id: "edge-overlay", source: "text-overlay", target: "mixer-1", targetHandle: "overlay" },
      ],
    });

    expect(container?.querySelector('[data-testid="mixer-overlay-content"]')).toBeTruthy();
    expect(container?.textContent).toContain("Rich headline");
  });

  it("anchors the preview overlay frame to the visible base contain rect", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png", intrinsicWidth: 200, intrinsicHeight: 100 },
        },
        readyNodes[1],
        {
          ...readyNodes[2],
          data: {
            blendMode: "normal",
            opacity: 100,
            overlayX: 0,
            overlayY: 0,
            overlayWidth: 1,
            overlayHeight: 1,
            ...cropRectData(0, 0, 1, 1),
          },
        },
      ],
      edges: readyEdges,
      props: {
        data: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0,
          overlayY: 0,
          overlayWidth: 1,
          overlayHeight: 1,
          ...cropRectData(0, 0, 1, 1),
        },
      },
    });

    const overlayFrame = container?.querySelector('[data-testid="mixer-overlay"]');
    if (!(overlayFrame instanceof HTMLDivElement)) {
      throw new Error("overlay frame not found");
    }

    expect(overlayFrame.style.left).toBe("0%");
    expect(overlayFrame.style.top).toBe("25%");
    expect(overlayFrame.style.width).toBe("100%");
    expect(overlayFrame.style.height).toBe("50%");
  });

  it("renders frame resize handles including edge handles", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    for (const corner of ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const) {
      expect(container?.querySelector(`[data-testid="mixer-resize-${corner}"]`)).toBeTruthy();
    }
  });

  it("uses displayed base rect scaling for frame move deltas on wide bases", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png", intrinsicWidth: 200, intrinsicHeight: 100 },
        },
        readyNodes[1],
        {
          ...readyNodes[2],
          data: {
            blendMode: "normal",
            opacity: 100,
            overlayX: 0.1,
            overlayY: 0.2,
            overlayWidth: 0.25,
            overlayHeight: 0.4,
            ...cropRectData(0, 0, 1, 1),
          },
        },
      ],
      edges: readyEdges,
      props: {
        data: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.25,
          overlayHeight: 0.4,
          ...cropRectData(0, 0, 1, 1),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const overlayFrame = container?.querySelector('[data-testid="mixer-overlay"]');
    if (!(preview instanceof HTMLDivElement) || !(overlayFrame instanceof HTMLDivElement)) {
      throw new Error("preview or overlay frame not found");
    }

    mockPreviewRect(preview);

    await act(async () => {
      overlayFrame.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 10, clientY: 40 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 50, clientY: 60 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const persisted = lastPersistedData();
    expect(persisted?.nodeId).toBe("mixer-1");
    expect(persisted?.data.overlayX as number).toBeCloseTo(0.3, 6);
    expect(persisted?.data.overlayY as number).toBeCloseTo(0.4, 6);
  });

  it("keeps aspect ratio locked by default during frame resize", async () => {
    await renderNode({
      nodes: readyNodes,
      edges: readyEdges,
      props: {
        data: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.5,
          overlayHeight: 0.4,
          ...cropRectData(0.2, 0.1, 0.4, 0.6),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-se"]');
    if (!(preview instanceof HTMLDivElement) || !(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("preview or resize handle not found");
    }

    mockPreviewRect(preview);

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 120, clientY: 120 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 140, clientY: 140 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const persisted = lastPersistedData();
    expect(persisted?.nodeId).toBe("mixer-1");
    expect(persisted?.data.overlayX as number).toBeCloseTo(0.1, 6);
    expect(persisted?.data.overlayY as number).toBeCloseTo(0.2, 6);
    expect((persisted?.data.overlayWidth as number) / (persisted?.data.overlayHeight as number)).toBeCloseTo(1.25, 6);
  });

  it("allows aspect ratio changes when lock is disabled", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const keepAspect = container?.querySelector('[data-testid="mixer-keep-aspect"]');
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-e"]');
    if (
      !(preview instanceof HTMLDivElement) ||
      !(keepAspect instanceof HTMLInputElement) ||
      !(resizeHandle instanceof HTMLDivElement)
    ) {
      throw new Error("preview or controls not found");
    }

    mockPreviewRect(preview);

    await act(async () => {
      keepAspect.click();
    });

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 120, clientY: 100 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const persisted = lastPersistedData();
    expect(persisted?.nodeId).toBe("mixer-1");
    expect(persisted?.data.overlayWidth as number).toBeCloseTo(0.6, 6);
    expect(persisted?.data.overlayHeight as number).toBeCloseTo(0.5, 6);
  });

  it("enforces minimum overlay size during resize", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-se"]');
    if (!(preview instanceof HTMLDivElement) || !(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("preview or resize handle not found");
    }

    mockPreviewRect(preview);

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: -600, clientY: -700 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const persisted = lastPersistedData();
    expect(persisted?.nodeId).toBe("mixer-1");
    expect(persisted?.data.overlayWidth as number).toBeCloseTo(0.1, 6);
    expect(persisted?.data.overlayHeight as number).toBeCloseTo(0.1, 6);
  });

  it("removes content framing affordances from the mixer UI", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    expect(container?.querySelector('[data-testid="mixer-content-mode-toggle"]')).toBeNull();
    expect(container?.querySelector('[data-testid="mixer-crop-box"]')).toBeNull();
    expect(container?.querySelector('input[name="cropLeft"]')).toBeNull();
    expect(container?.querySelector('input[name="cropTop"]')).toBeNull();
    expect(container?.querySelector('input[name="cropRight"]')).toBeNull();
    expect(container?.querySelector('input[name="cropBottom"]')).toBeNull();
  });

  it("keeps crop source-region mapping for existing mixer data", async () => {
    await renderNode({
      nodes: [
        readyNodes[0],
        readyNodes[1],
        {
          ...readyNodes[2],
          data: {
            blendMode: "normal",
            opacity: 100,
            overlayX: 0.1,
            overlayY: 0.2,
            overlayWidth: 0.5,
            overlayHeight: 0.5,
            ...cropRectData(0.1, 0.2, 0.5, 0.25),
          },
        },
      ],
      edges: readyEdges,
      props: {
        data: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.5,
          overlayHeight: 0.5,
          ...cropRectData(0.1, 0.2, 0.5, 0.25),
        },
      },
    });

    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }

    expect(overlayContent.style.left).toBe("-20%");
    expect(overlayContent.style.top).toBe("-80%");
    expect(overlayContent.style.width).toBe("200%");
    expect(overlayContent.style.height).toBe("400%");
  });

  it("numeric controls update blend, opacity and overlay rect fields", async () => {
    await renderNode();

    const blendMode = container?.querySelector('select[name="blendMode"]');
    const opacity = container?.querySelector('input[name="opacity"]');
    const overlayX = container?.querySelector('input[name="overlayX"]');
    const overlayY = container?.querySelector('input[name="overlayY"]');
    const overlayWidth = container?.querySelector('input[name="overlayWidth"]');
    const overlayHeight = container?.querySelector('input[name="overlayHeight"]');

    if (!(blendMode instanceof HTMLSelectElement)) throw new Error("blendMode select not found");
    if (!(opacity instanceof HTMLInputElement)) throw new Error("opacity input not found");
    if (!(overlayX instanceof HTMLInputElement)) throw new Error("overlayX input not found");
    if (!(overlayY instanceof HTMLInputElement)) throw new Error("overlayY input not found");
    if (!(overlayWidth instanceof HTMLInputElement)) throw new Error("overlayWidth input not found");
    if (!(overlayHeight instanceof HTMLInputElement)) throw new Error("overlayHeight input not found");

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
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ opacity: 45 }),
    });

    await act(async () => {
      overlayX.value = "0.25";
      overlayX.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ overlayX: 0.25 }),
    });

    await act(async () => {
      overlayY.value = "0.4";
      overlayY.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ overlayY: 0.4 }),
    });

    await act(async () => {
      overlayWidth.value = "0.66";
      overlayWidth.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ overlayWidth: 0.66 }),
    });

    await act(async () => {
      overlayHeight.value = "0.33";
      overlayHeight.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({ overlayHeight: 0.33 }),
    });
  });

  it("renders expected mixer connection handles", async () => {
    await renderNode();

    expect(
      container?.querySelector(
        '[data-canvas-handle="true"][data-node-id="mixer-1"][data-node-type="mixer"][data-handle-id="base"][data-handle-type="target"][data-top="35%"]',
      ),
    ).toBeTruthy();
    expect(
      container?.querySelector(
        '[data-canvas-handle="true"][data-node-id="mixer-1"][data-node-type="mixer"][data-handle-id="overlay"][data-handle-type="target"][data-top="58%"]',
      ),
    ).toBeTruthy();
    expect(
      container?.querySelector(
        '[data-canvas-handle="true"][data-node-id="mixer-1"][data-node-type="mixer"][data-handle-id="mixer-out"][data-handle-type="source"]',
      ),
    ).toBeTruthy();
  });
});
