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

  async function setNaturalImageSize(image: HTMLImageElement, width: number, height: number) {
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: width });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: height });

    await act(async () => {
      image.dispatchEvent(new Event("load"));
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

  it("anchors the preview overlay frame to the visible base cover rect", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: {
            url: "https://cdn.example.com/base.png",
            intrinsicWidth: 200,
            intrinsicHeight: 100,
          },
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

    expect(overlayFrame.style.left).toBe("-50%");
    expect(overlayFrame.style.top).toBe("0%");
    expect(overlayFrame.style.width).toBe("200%");
    expect(overlayFrame.style.height).toBe("100%");
  });

  it("anchors resize handles to the displayed overlay frame rect on wide bases", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: {
            url: "https://cdn.example.com/base.png",
            intrinsicWidth: 200,
            intrinsicHeight: 100,
          },
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

    const northWestHandle = container?.querySelector('[data-testid="mixer-resize-nw"]');
    const southEastHandle = container?.querySelector('[data-testid="mixer-resize-se"]');

    if (!(northWestHandle instanceof HTMLDivElement)) {
      throw new Error("north west handle not found");
    }
    if (!(southEastHandle instanceof HTMLDivElement)) {
      throw new Error("south east handle not found");
    }

    expect(Number.parseFloat(northWestHandle.style.left)).toBeCloseTo(-30, 6);
    expect(Number.parseFloat(northWestHandle.style.top)).toBeCloseTo(20, 6);
    expect(Number.parseFloat(southEastHandle.style.left)).toBeCloseTo(20, 6);
    expect(Number.parseFloat(southEastHandle.style.top)).toBeCloseTo(60, 6);
  });

  it("anchors crop box handles to the displayed overlay frame rect on wide bases", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: {
            url: "https://cdn.example.com/base.png",
            intrinsicWidth: 200,
            intrinsicHeight: 100,
          },
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
            ...cropRectData(0.1, 0.2, 0.5, 0.5),
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
          ...cropRectData(0.1, 0.2, 0.5, 0.5),
        },
      },
    });

    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }

    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    const northWestHandle = container?.querySelector('[data-testid="mixer-resize-nw"]');
    const eastHandle = container?.querySelector('[data-testid="mixer-resize-e"]');

    if (!(northWestHandle instanceof HTMLDivElement)) {
      throw new Error("north west crop handle not found");
    }
    if (!(eastHandle instanceof HTMLDivElement)) {
      throw new Error("east crop handle not found");
    }

    expect(Number.parseFloat(northWestHandle.style.left)).toBeCloseTo(-25, 6);
    expect(Number.parseFloat(northWestHandle.style.top)).toBeCloseTo(20, 6);
    expect(Number.parseFloat(eastHandle.style.left)).toBeCloseTo(15, 6);
    expect(Number.parseFloat(eastHandle.style.top)).toBeCloseTo(40, 6);
  });

  it("uses displayed base rect scaling for frame move deltas on wide bases", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: {
            url: "https://cdn.example.com/base.png",
            intrinsicWidth: 200,
            intrinsicHeight: 100,
          },
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

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(overlayFrame instanceof HTMLDivElement)) {
      throw new Error("overlay frame not found");
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

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data.overlayX as number).toBeCloseTo(0.2, 6);
    expect(lastCall?.data.overlayY as number).toBeCloseTo(0.3, 6);
  });

  it("uses displayed base rect scaling for frame resize deltas on wide bases", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: {
            url: "https://cdn.example.com/base.png",
            intrinsicWidth: 200,
            intrinsicHeight: 100,
          },
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
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-se"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("resize handle not found");
    }

    mockPreviewRect(preview);

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 40, clientY: 120 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 80, clientY: 120 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data.overlayX as number).toBeCloseTo(0.1, 6);
    expect(lastCall?.data.overlayY as number).toBeCloseTo(0.2, 6);
    expect(lastCall?.data.overlayWidth as number).toBeCloseTo(0.35, 6);
    expect(lastCall?.data.overlayHeight as number).toBeCloseTo(0.56, 6);
  });

  it("uses displayed overlay frame scaling for crop move deltas on wide bases", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: {
            url: "https://cdn.example.com/base.png",
            intrinsicWidth: 200,
            intrinsicHeight: 100,
          },
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
            ...cropRectData(0, 0, 0.6, 0.6),
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
          ...cropRectData(0, 0, 0.6, 0.6),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }

    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 100, 80);

    await act(async () => {
      contentModeToggle.click();
    });

    const cropBox = container?.querySelector('[data-testid="mixer-crop-box"]');
    if (!(cropBox instanceof HTMLDivElement)) {
      throw new Error("crop box not found");
    }

    await act(async () => {
      cropBox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: -10, clientY: 40 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 52 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data.cropLeft as number).toBeCloseTo(0.12, 6);
    expect(lastCall?.data.cropTop as number).toBeCloseTo(0.09, 6);
    expect(lastCall?.data.cropRight as number).toBeCloseTo(0.28, 6);
    expect(lastCall?.data.cropBottom as number).toBeCloseTo(0.31, 6);
  });

  it("uses displayed overlay frame scaling for crop resize deltas on wide bases", async () => {
    await renderNode({
      nodes: [
        {
          id: "image-base",
          type: "image",
          data: {
            url: "https://cdn.example.com/base.png",
            intrinsicWidth: 200,
            intrinsicHeight: 100,
          },
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
            ...cropRectData(0, 0, 0.6, 0.6),
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
          ...cropRectData(0, 0, 0.6, 0.6),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }

    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 100, 80);

    await act(async () => {
      contentModeToggle.click();
    });

    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-e"]');
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("east resize handle not found");
    }

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 20, clientY: 40 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 40, clientY: 40 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0.28,
        cropBottom: 0.4,
      }),
    });
  });

  it("maps overlay content through crop/source-region styles instead of contain-fit", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const overlayImage = container?.querySelector('img[alt="Mixer overlay"]');
    if (!(overlayImage instanceof HTMLImageElement)) {
      throw new Error("overlay image not found");
    }

    expect(overlayImage.className).not.toContain("object-contain");
    expect(overlayImage.style.width).toBe("100%");
    expect(overlayImage.style.height).toBe("100%");
  });

  it("drag updates persisted overlay geometry", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const overlay = container?.querySelector('[data-testid="mixer-overlay"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(overlay instanceof HTMLDivElement)) {
      throw new Error("overlay frame not found");
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
        ...cropRectData(0, 0, 1, 1),
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
    if (!(overlay instanceof HTMLDivElement)) {
      throw new Error("overlay frame not found");
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
        ...cropRectData(0, 0, 1, 1),
      }),
    });
  });

  it("frame resize keeps the displayed overlay aspect ratio locked", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.2, 0.1, 0.4, 0.6),
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
          overlayHeight: 0.4,
          ...cropRectData(0.2, 0.1, 0.4, 0.6),
        },
      },
    });

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

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0.1,
        overlayY: 0.2,
        ...cropRectData(0.2, 0.1, 0.4, 0.6),
      }),
    );
    expect(
      (lastCall?.data.overlayWidth as number) / (lastCall?.data.overlayHeight as number),
    ).toBeCloseTo(1.25, 6);
  });

  it("frame resize preserves crop fields while scaling the displayed overlay proportionally", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.2, 0.1, 0.4, 0.6),
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
          overlayHeight: 0.4,
          ...cropRectData(0.2, 0.1, 0.4, 0.6),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-se"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("resize handle not found");
    }

    mockPreviewRect(preview);

    expect(resizeHandle.style.left).toBe("60%");
    expect(resizeHandle.style.top).toBe("60.00000000000001%");

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 120, clientY: 120 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 140, clientY: 140 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "mixer-1",
      data: expect.objectContaining({
        overlayX: 0.1,
        overlayY: 0.2,
        overlayWidth: 0.625,
        overlayHeight: 0.5,
        ...cropRectData(0.2, 0.1, 0.4, 0.6),
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
        ...cropRectData(0, 0, 1, 1),
      }),
    });
  });

  it("renders explicit content framing mode toggle", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    expect(container?.querySelector('[data-testid="mixer-content-mode-toggle"]')).toBeTruthy();
  });

  it("crop drag inside the crop box repositions the crop region only", async () => {
    await renderNode({
      nodes: [
        readyNodes[0],
        readyNodes[1],
        {
          ...readyNodes[2],
          data: {
            blendMode: "normal",
            opacity: 100,
            overlayX: 0,
            overlayY: 0,
            overlayWidth: 0.5,
            overlayHeight: 0.5,
            ...cropRectData(0, 0, 0.6, 0.6),
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
          overlayWidth: 0.5,
          overlayHeight: 0.5,
          ...cropRectData(0, 0, 0.6, 0.6),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
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
    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    const cropBox = container?.querySelector('[data-testid="mixer-crop-box"]');
    if (!(cropBox instanceof HTMLDivElement)) {
      throw new Error("crop box not found");
    }

    await act(async () => {
      cropBox.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 50, clientY: 50 }),
      );
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 90, clientY: 70 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;
    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0,
        overlayY: 0,
        overlayWidth: 0.5,
        overlayHeight: 0.5,
        ...cropRectData(0.24, 0.12, 0.6, 0.6),
      }),
    );
  });

  it("content framing supports zooming content before drag from defaults", async () => {
    await renderNode({ nodes: readyNodes, edges: readyEdges });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const cropRight = container?.querySelector('input[name="cropRight"]');
    const cropBottom = container?.querySelector('input[name="cropBottom"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(cropRight instanceof HTMLInputElement)) {
      throw new Error("cropRight input not found");
    }
    if (!(cropBottom instanceof HTMLInputElement)) {
      throw new Error("cropBottom input not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
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
    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    const cropBox = container?.querySelector('[data-testid="mixer-crop-box"]');
    if (!(cropBox instanceof HTMLDivElement)) {
      throw new Error("crop box not found");
    }

    await act(async () => {
      cropRight.value = "0.4";
      cropRight.dispatchEvent(new Event("input", { bubbles: true }));
      cropRight.dispatchEvent(new Event("change", { bubbles: true }));
      cropBottom.value = "0.3";
      cropBottom.dispatchEvent(new Event("input", { bubbles: true }));
      cropBottom.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    await act(async () => {
      cropBox.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 50, clientY: 50 }),
      );
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 90, clientY: 70 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;
    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0,
        overlayY: 0,
        overlayWidth: 0.5,
        overlayHeight: 0.5,
      }),
    );
    expect(lastCall?.data.cropLeft as number).toBeCloseTo(0.28, 6);
    expect(lastCall?.data.cropTop as number).toBeCloseTo(0.14, 6);
    expect(lastCall?.data.cropRight as number).toBeCloseTo(0.12, 6);
    expect(lastCall?.data.cropBottom as number).toBeCloseTo(0.16, 6);
  });

  it("crop drag uses the crop box as the movement frame instead of the full overlay", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.1, 0.1, 0.5, 0.5),
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
          overlayHeight: 0.4,
          ...cropRectData(0.1, 0.1, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
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
    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    const cropBox = container?.querySelector('[data-testid="mixer-crop-box"]');
    if (!(cropBox instanceof HTMLDivElement)) {
      throw new Error("crop box not found");
    }

    await act(async () => {
      cropBox.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 50, clientY: 50 }),
      );
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 70, clientY: 66 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;
    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0.1,
        overlayY: 0.2,
        overlayWidth: 0.5,
        overlayHeight: 0.4,
        ...cropRectData(0.225, 0.2, 0.5, 0.5),
      }),
    );
  });

  it("crop handles render on the crop box while the displayed overlay frame stays fixed", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.1, 0.2, 0.5, 0.5),
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
          overlayHeight: 0.4,
          ...cropRectData(0.1, 0.2, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }
    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 50, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    const cropBox = container?.querySelector('[data-testid="mixer-crop-box"]');
    if (!(cropBox instanceof HTMLDivElement)) {
      throw new Error("crop box not found");
    }

    expect(Number.parseFloat(cropBox.style.left)).toBeCloseTo(30, 6);
    expect(Number.parseFloat(cropBox.style.top)).toBeCloseTo(0, 6);
    expect(Number.parseFloat(cropBox.style.width)).toBeCloseTo(40, 6);
    expect(Number.parseFloat(cropBox.style.height)).toBeCloseTo(100, 6);
    const northWestHandle = container?.querySelector('[data-testid="mixer-resize-nw"]');
    const northHandle = container?.querySelector('[data-testid="mixer-resize-n"]');
    const southEastHandle = container?.querySelector('[data-testid="mixer-resize-se"]');
    if (!(northWestHandle instanceof HTMLDivElement)) {
      throw new Error("north west handle not found");
    }
    if (!(northHandle instanceof HTMLDivElement)) {
      throw new Error("north handle not found");
    }
    if (!(southEastHandle instanceof HTMLDivElement)) {
      throw new Error("south east handle not found");
    }

    expect(Number.parseFloat(northWestHandle.style.left)).toBeCloseTo(25, 6);
    expect(Number.parseFloat(northWestHandle.style.top)).toBeCloseTo(20, 6);
    expect(Number.parseFloat(northHandle.style.left)).toBeCloseTo(35, 6);
    expect(Number.parseFloat(northHandle.style.top)).toBeCloseTo(20, 6);
    expect(Number.parseFloat(southEastHandle.style.left)).toBeCloseTo(45, 6);
    expect(Number.parseFloat(southEastHandle.style.top)).toBeCloseTo(60, 6);
  });

  it("crop move uses the visible aspect-aware rect for non-square overlays", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.1, 0.2, 0.5, 0.5),
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
          overlayHeight: 0.4,
          ...cropRectData(0.1, 0.2, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }

    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 50, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    const cropBox = container?.querySelector('[data-testid="mixer-crop-box"]');
    if (!(cropBox instanceof HTMLDivElement)) {
      throw new Error("crop box not found");
    }

    await act(async () => {
      cropBox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 55, clientY: 66 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 65, clientY: 76 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0.1,
        overlayY: 0.2,
        overlayWidth: 0.5,
        overlayHeight: 0.4,
      }),
    );
    expect(lastCall?.data.cropLeft as number).toBeCloseTo(0.225, 6);
    expect(lastCall?.data.cropTop as number).toBeCloseTo(0.2625, 6);
    expect(lastCall?.data.cropRight as number).toBeCloseTo(0.275, 6);
    expect(lastCall?.data.cropBottom as number).toBeCloseTo(0.2375, 6);
  });

  it("crop resize uses the visible aspect-aware rect for non-square overlays", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.1, 0.2, 0.5, 0.5),
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
          overlayHeight: 0.4,
          ...cropRectData(0.1, 0.2, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }

    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 50, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-e"]');
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("east resize handle not found");
    }

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 70, clientY: 76 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 80, clientY: 76 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0.1,
        overlayY: 0.2,
        overlayWidth: 0.5,
        overlayHeight: 0.4,
        cropLeft: 0.1,
        cropTop: 0.2,
      }),
    );
    expect(lastCall?.data.cropBottom as number).toBeCloseTo(0.3, 6);
    expect(lastCall?.data.cropRight as number).toBeCloseTo(0.275, 6);
  });

  it("ignores crop interactions until overlay natural size is known", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.1, 0.2, 0.5, 0.5),
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
          overlayHeight: 0.4,
          ...cropRectData(0.1, 0.2, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }

    mockPreviewRect(preview);

    await act(async () => {
      contentModeToggle.click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(container?.querySelector('[data-testid="mixer-crop-box"]')).toBeNull();
    expect(container?.querySelector('[data-testid="mixer-resize-e"]')).toBeNull();
    expect(mocks.queueNodeDataUpdate).not.toHaveBeenCalled();
  });

  it("does not render crop affordances until overlay natural size is known", async () => {
    await renderNode({
      nodes: readyNodes,
      edges: readyEdges,
    });

    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }

    await act(async () => {
      contentModeToggle.click();
    });

    expect(container?.querySelector('[data-testid="mixer-crop-box"]')).toBeNull();
    expect(container?.querySelector('[data-testid="mixer-resize-e"]')).toBeNull();
  });

  it("ignores crop interactions after overlay source swap until new natural size loads", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.1, 0.2, 0.5, 0.5),
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
          overlayHeight: 0.4,
          ...cropRectData(0.1, 0.2, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    let overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }

    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    await renderNode({
      nodes: [
        readyNodes[0],
        { id: "image-overlay", type: "asset", data: { url: "https://cdn.example.com/overlay-2.png" } },
        {
          ...readyNodes[2],
          data: {
            blendMode: "normal",
            opacity: 100,
            overlayX: 0.1,
            overlayY: 0.2,
            overlayWidth: 0.5,
            overlayHeight: 0.4,
            ...cropRectData(0.1, 0.2, 0.5, 0.5),
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
          overlayHeight: 0.4,
          ...cropRectData(0.1, 0.2, 0.5, 0.5),
        },
      },
    });

    const swappedPreview = container?.querySelector('[data-testid="mixer-preview"]');
    if (!(swappedPreview instanceof HTMLDivElement)) {
      throw new Error("preview not found after source swap");
    }
    mockPreviewRect(swappedPreview);

    mocks.queueNodeDataUpdate.mockClear();

    overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found after source swap");
    }
    expect(overlayContent.getAttribute("src")).toBe("https://cdn.example.com/overlay-2.png");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(container?.querySelector('[data-testid="mixer-crop-box"]')).toBeNull();
    expect(container?.querySelector('[data-testid="mixer-resize-e"]')).toBeNull();
    expect(mocks.queueNodeDataUpdate).not.toHaveBeenCalled();
  });

  it("hides crop affordances after overlay source swap until the new image loads", async () => {
    await renderNode({
      nodes: readyNodes,
      edges: readyEdges,
    });

    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    let overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }

    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    await renderNode({
      nodes: [
        readyNodes[0],
        { id: "image-overlay", type: "asset", data: { url: "https://cdn.example.com/overlay-2.png" } },
        readyNodes[2],
      ],
      edges: readyEdges,
    });

    overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found after source swap");
    }
    expect(overlayContent.getAttribute("src")).toBe("https://cdn.example.com/overlay-2.png");
    expect(container?.querySelector('[data-testid="mixer-crop-box"]')).toBeNull();
    expect(container?.querySelector('[data-testid="mixer-resize-e"]')).toBeNull();
  });

  it("crop handle drag trims edges without changing displayed overlay frame size", async () => {
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
            overlayHeight: 0.4,
            ...cropRectData(0.1, 0.2, 0.5, 0.5),
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
          overlayHeight: 0.4,
          ...cropRectData(0.1, 0.2, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-se"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("resize handle not found");
    }

    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 80, clientY: 96 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 116 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0.1,
        overlayY: 0.2,
        overlayWidth: 0.5,
        overlayHeight: 0.4,
        cropLeft: 0.1,
        cropTop: 0.2,
      }),
    );
    expect(lastCall?.data.cropRight as number).toBeLessThan(0.4);
    expect(lastCall?.data.cropBottom as number).toBeLessThan(0.3);
  });

  it("crop edge handles trim a single side only", async () => {
    await renderNode({
      nodes: [
        readyNodes[0],
        readyNodes[1],
        {
          ...readyNodes[2],
          data: {
            blendMode: "normal",
            opacity: 100,
            overlayX: 0.15,
            overlayY: 0.1,
            overlayWidth: 0.55,
            overlayHeight: 0.45,
            ...cropRectData(0.2, 0.1, 0.5, 0.5),
          },
        },
      ],
      edges: readyEdges,
      props: {
        data: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0.15,
          overlayY: 0.1,
          overlayWidth: 0.55,
          overlayHeight: 0.45,
          ...cropRectData(0.2, 0.1, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }
    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-e"]');
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("east resize handle not found");
    }

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 92, clientY: 65 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 112, clientY: 65 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0.15,
        overlayY: 0.1,
        overlayWidth: 0.55,
        overlayHeight: 0.45,
        cropLeft: 0.2,
        cropTop: 0.1,
        cropBottom: 0.4,
      }),
    );
    expect(lastCall?.data.cropRight as number).toBeLessThan(0.3);
  });

  it("crop handle drag does not mutate overlayWidth or overlayHeight", async () => {
    await renderNode({
      nodes: [
        readyNodes[0],
        readyNodes[1],
        {
          ...readyNodes[2],
          data: {
            blendMode: "normal",
            opacity: 100,
            overlayX: 0.15,
            overlayY: 0.1,
            overlayWidth: 0.55,
            overlayHeight: 0.45,
            ...cropRectData(0.2, 0.1, 0.5, 0.5),
          },
        },
      ],
      edges: readyEdges,
      props: {
        data: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0.15,
          overlayY: 0.1,
          overlayWidth: 0.55,
          overlayHeight: 0.45,
          ...cropRectData(0.2, 0.1, 0.5, 0.5),
        },
      },
    });

    const preview = container?.querySelector('[data-testid="mixer-preview"]');
    const contentModeToggle = container?.querySelector('[data-testid="mixer-content-mode-toggle"]');
    const overlayContent = container?.querySelector('[data-testid="mixer-overlay-content"]');
    const resizeHandle = container?.querySelector('[data-testid="mixer-resize-se"]');

    if (!(preview instanceof HTMLDivElement)) {
      throw new Error("preview not found");
    }
    if (!(contentModeToggle instanceof HTMLButtonElement)) {
      throw new Error("content mode toggle not found");
    }
    if (!(overlayContent instanceof HTMLImageElement)) {
      throw new Error("overlay content image not found");
    }
    if (!(resizeHandle instanceof HTMLDivElement)) {
      throw new Error("resize handle not found");
    }

    mockPreviewRect(preview);
    await setNaturalImageSize(overlayContent, 100, 100);

    await act(async () => {
      contentModeToggle.click();
    });

    await act(async () => {
      resizeHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 110, clientY: 110 }));
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 125, clientY: 120 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });

    const rawLastCall = mocks.queueNodeDataUpdate.mock.calls.at(-1) as unknown[] | undefined;
    const lastCall = rawLastCall?.[0] as
      | { nodeId: string; data: Record<string, unknown> }
      | undefined;

    expect(lastCall?.nodeId).toBe("mixer-1");
    expect(lastCall?.data).toEqual(
      expect.objectContaining({
        overlayX: 0.15,
        overlayY: 0.1,
        overlayWidth: 0.55,
        overlayHeight: 0.45,
      }),
    );
    expect(lastCall?.data.cropRight as number).not.toBe(0.3);
    expect(lastCall?.data.cropBottom as number).not.toBe(0.4);
  });

  it("maps crop/source-region fields into a fixed displayed frame size", async () => {
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
