// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  queueNodeResize: vi.fn(async () => undefined),
  createNodeWithIntersection: vi.fn(async () => undefined),
  getNode: vi.fn(),
  getNodes: vi.fn(() => []),
  getEdges: vi.fn(() => [] as Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>),
  setNodes: vi.fn(),
  deleteElements: vi.fn(async () => undefined),
  updateNodeInternals: vi.fn(),
  nodeResizeControlProps: [] as Array<{
    minWidth?: number;
    minHeight?: number;
    keepAspectRatio?: boolean;
  }>,
}));

vi.mock("@xyflow/react", () => ({
  NodeToolbar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="node-toolbar">{children}</div>
  ),
  Handle: ({
    className,
    style,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    className?: string;
    style?: React.CSSProperties;
  }) => <div className={className} style={style} {...props} />,
  NodeResizeControl: (props: {
    minWidth?: number;
    minHeight?: number;
    keepAspectRatio?: boolean;
  }) => {
    mocks.nodeResizeControlProps.push(props);
    return <div data-testid="node-resize-control" />;
  },
  Position: { Top: "top", Left: "left", Right: "right" },
  useConnection: () => ({ inProgress: false }),
  useNodeId: () => "node-1",
  useStore: (selector: (store: { edges: ReturnType<typeof mocks.getEdges> }) => unknown) =>
    selector({ edges: mocks.getEdges() }),
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
  useReactFlow: () => ({
    getNode: mocks.getNode,
    getNodes: mocks.getNodes,
    getEdges: mocks.getEdges,
    setNodes: mocks.setNodes,
    deleteElements: mocks.deleteElements,
  }),
  getConnectedEdges: () => [],
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    queueNodeResize: mocks.queueNodeResize,
  }),
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeWithIntersection: mocks.createNodeWithIntersection,
  }),
}));

import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import { CollapsedNodeDrawerToolbarProvider } from "@/components/canvas/collapsed-node-drawer-toolbar-context";
import {
  preserveNodeMetadata,
  readNodeBypassed,
  readNodeCollapsed,
  setNodeBypassed,
  setNodeCollapsed,
} from "@/lib/canvas-node-favorite";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BaseNodeWrapper", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.queueNodeDataUpdate.mockClear();
    mocks.queueNodeResize.mockClear();
    mocks.createNodeWithIntersection.mockClear();
    mocks.getNode.mockReset();
    mocks.getNodes.mockClear();
    mocks.getEdges.mockClear();
    mocks.setNodes.mockClear();
    mocks.deleteElements.mockClear();
    mocks.updateNodeInternals.mockClear();
    mocks.nodeResizeControlProps.length = 0;

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

  async function renderWrapper(
    nodeData: Record<string, unknown>,
    selected = true,
    nodeType = "text",
    activeDrawerToolbarNodeId: string | null = null,
  ) {
    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: nodeType,
      data: nodeData,
      position: { x: 0, y: 0 },
      style: { width: 300, height: 200 },
    });

    await act(async () => {
      root?.render(
        <CollapsedNodeDrawerToolbarProvider
          initialActiveToolbarNodeId={activeDrawerToolbarNodeId}
        >
          <BaseNodeWrapper nodeType={nodeType} selected={selected}>
            <div>Inner node content</div>
          </BaseNodeWrapper>
        </CollapsedNodeDrawerToolbarProvider>,
      );
    });
  }

  it("shows favorite toggle with duplicate and delete controls for selected nodes", async () => {
    await renderWrapper({ label: "Frame" }, true);

    expect(container?.querySelector('button[title="Ausblenden"]')).toBeTruthy();
    expect(container?.querySelector('button[title="Collapse"]')).toBeTruthy();
    expect(container?.querySelector('button[title="Favorite"]')).toBeTruthy();
    expect(container?.querySelector('button[title="Duplicate"]')).toBeTruthy();
    expect(container?.querySelector('button[title="Delete"]')).toBeTruthy();
  });

  it("collapses a normal node from the toolbar and stores its expanded size", async () => {
    await renderWrapper({ label: "Prompt" }, true, "prompt");

    const collapseButton = container?.querySelector('button[title="Collapse"]');
    if (!(collapseButton instanceof HTMLButtonElement)) {
      throw new Error("Collapse button not found");
    }

    await act(async () => {
      collapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: {
        label: "Prompt",
        isCollapsed: true,
        expandedSize: { width: 300, height: 200 },
      },
    });
    expect(mocks.queueNodeResize).toHaveBeenCalledWith({
      nodeId: "node-1",
      width: 300,
      height: 36,
    });
  });

  it("optimistically shrinks the local node bounds when collapsing", async () => {
    await renderWrapper({ label: "Prompt" }, true, "prompt");

    const collapseButton = container?.querySelector('button[title="Collapse"]');
    if (!(collapseButton instanceof HTMLButtonElement)) {
      throw new Error("Collapse button not found");
    }

    await act(async () => {
      collapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const setNodesUpdater = mocks.setNodes.mock.calls.find(
      ([updater]) => typeof updater === "function",
    )?.[0];
    if (typeof setNodesUpdater !== "function") {
      throw new Error("Expected collapse to update local node state");
    }

    const [updatedNode] = setNodesUpdater([
      {
        id: "node-1",
        type: "prompt",
        data: { label: "Prompt" },
        position: { x: 0, y: 0 },
        width: 300,
        height: 200,
        measured: { width: 300, height: 200 },
        style: { width: 300, height: 200 },
      },
    ]);

    expect(updatedNode).toEqual(
      expect.objectContaining({
        data: {
          label: "Prompt",
          isCollapsed: true,
          expandedSize: { width: 300, height: 200 },
        },
        style: { width: 300, height: 36 },
      }),
    );
    expect(updatedNode).not.toHaveProperty("width");
    expect(updatedNode).not.toHaveProperty("height");
    expect(updatedNode).not.toHaveProperty("measured");
  });

  it("expands a collapsed node and restores its saved expanded size", async () => {
    await renderWrapper(
      {
        label: "Prompt",
        isCollapsed: true,
        expandedSize: { width: 320, height: 260 },
      },
      true,
      "prompt",
    );

    const expandButton = container?.querySelector('button[title="Expand"]');
    if (!(expandButton instanceof HTMLButtonElement)) {
      throw new Error("Expand button not found");
    }

    await act(async () => {
      expandButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: {
        label: "Prompt",
      },
    });
    expect(mocks.queueNodeResize).toHaveBeenCalledWith({
      nodeId: "node-1",
      width: 320,
      height: 260,
    });
  });

  it("renders collapsed nodes as a thin label bar without mounting child content", async () => {
    await renderWrapper(
      {
        filename: "hero-image.png",
        isCollapsed: true,
        expandedSize: { width: 300, height: 200 },
      },
      true,
      "image",
    );

    expect(container?.querySelector('[data-testid="canvas-node-collapsed-bar"]')).toBeTruthy();
    expect(container?.querySelector('[data-testid="canvas-node-content"]')?.className).toContain("h-9");
    expect(container?.querySelector('[data-testid="canvas-node-content"]')?.className).not.toContain("h-full");
    expect(container?.textContent).toContain("hero-image.png");
    expect(container?.textContent).not.toContain("Inner node content");
    expect(container?.querySelector('[data-testid="node-toolbar"]')).toBeTruthy();
    expect(container?.querySelector('[data-testid="node-resize-control"]')).toBeNull();
  });

  it("hides the floating toolbar for the active collapsed drawer node", async () => {
    await renderWrapper(
      {
        filename: "hero-image.png",
        isCollapsed: true,
        expandedSize: { width: 300, height: 200 },
      },
      true,
      "image",
      "node-1",
    );

    expect(container?.querySelector('[data-testid="canvas-node-collapsed-bar"]')).toBeTruthy();
    expect(container?.querySelector('[data-testid="node-toolbar"]')).toBeNull();
  });

  it("does not expose collapse controls for group and frame nodes", async () => {
    await renderWrapper({ label: "Gruppe" }, true, "group");
    expect(container?.querySelector('button[title="Collapse"]')).toBeNull();

    await renderWrapper({ label: "Frame" }, true, "frame");
    expect(container?.querySelector('button[title="Collapse"]')).toBeNull();
  });

  it("renders connected collapsed handles with their original ids", async () => {
    mocks.getEdges.mockReturnValue([
      {
        id: "edge-in",
        source: "image-source",
        target: "node-1",
        targetHandle: "image-in-2",
      },
      {
        id: "edge-out",
        source: "node-1",
        target: "image-output",
        sourceHandle: "prompt-out",
      },
    ]);

    await renderWrapper(
      {
        label: "Prompt",
        isCollapsed: true,
        expandedSize: { width: 300, height: 200 },
      },
      true,
      "prompt",
    );

    expect(
      container?.querySelector(
        '[data-node-id="node-1"][data-handle-type="target"][data-handle-id="image-in-2"]',
      ),
    ).toBeTruthy();
    expect(
      container?.querySelector(
        '[data-node-id="node-1"][data-handle-type="source"][data-handle-id="prompt-out"]',
      ),
    ).toBeTruthy();
  });

  it("toggles bypass and queues merged node data update", async () => {
    await renderWrapper({ label: "Frame", isFavorite: true }, true);

    const bypassButton = container?.querySelector('button[title="Ausblenden"]');
    if (!(bypassButton instanceof HTMLButtonElement)) {
      throw new Error("Bypass button not found");
    }

    expect(bypassButton.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      bypassButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: {
        label: "Frame",
        isFavorite: true,
        isBypassed: true,
      },
    });
  });

  it("applies bypass locally before the sync queue resolves", async () => {
    mocks.queueNodeDataUpdate.mockReturnValueOnce(
      new Promise<void>(() => undefined),
    );
    await renderWrapper({ label: "Frame", isFavorite: true }, true);

    const bypassButton = container?.querySelector('button[title="Ausblenden"]');
    if (!(bypassButton instanceof HTMLButtonElement)) {
      throw new Error("Bypass button not found");
    }

    await act(async () => {
      bypassButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.setNodes).toHaveBeenCalledWith(expect.any(Function));
    const updateLocalNodes = mocks.setNodes.mock.calls.at(-1)?.[0];
    if (typeof updateLocalNodes !== "function") {
      throw new Error("Local node updater not queued");
    }

    expect(
      updateLocalNodes([
        {
          id: "node-1",
          type: "text",
          data: { label: "Frame", isFavorite: true },
          position: { x: 0, y: 0 },
        },
      ]),
    ).toEqual([
      {
        id: "node-1",
        type: "text",
        data: { label: "Frame", isFavorite: true, isBypassed: true },
        position: { x: 0, y: 0 },
      },
    ]);
    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: {
        label: "Frame",
        isFavorite: true,
        isBypassed: true,
      },
    });
  });

  it("renders bypassed nodes dimmed while toolbar remains full strength", async () => {
    await renderWrapper({ label: "Frame", isBypassed: true }, true);

    const nodeBody = container?.querySelector('[data-testid="canvas-node-body"]');
    const toolbar = container?.querySelector('[data-testid="node-toolbar"]');
    const bypassButton = container?.querySelector('button[title="Einblenden"]');

    expect(nodeBody?.className).toContain("opacity-45");
    expect(nodeBody?.className).toContain("saturate-50");
    expect(toolbar?.className).not.toContain("opacity-45");
    expect(toolbar?.className).not.toContain("saturate-50");
    expect(bypassButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("unsets bypass without removing other metadata", async () => {
    await renderWrapper({ label: "Frame", isFavorite: true, isBypassed: true }, true);

    const bypassButton = container?.querySelector('button[title="Einblenden"]');
    if (!(bypassButton instanceof HTMLButtonElement)) {
      throw new Error("Bypass button not found");
    }

    await act(async () => {
      bypassButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: {
        label: "Frame",
        isFavorite: true,
      },
    });
  });

  it("toggles favorite and queues merged node data update", async () => {
    await renderWrapper({ label: "Frame" }, true);

    const favoriteButton = container?.querySelector('button[title="Favorite"]');
    if (!(favoriteButton instanceof HTMLButtonElement)) {
      throw new Error("Favorite button not found");
    }

    await act(async () => {
      favoriteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: {
        label: "Frame",
        isFavorite: true,
      },
    });
    expect(container?.querySelector('button[title="Duplicate"]')).toBeTruthy();
    expect(container?.querySelector('button[title="Delete"]')).toBeTruthy();
  });

  it("replaces the old favorite chrome marker with a backlight layer", async () => {
    await renderWrapper({ label: "Frame", isFavorite: true }, true);

    const rootElement = container?.firstElementChild;
    expect(rootElement?.className).not.toContain("node-favorite-chrome");
    expect(container?.querySelector('[data-testid="canvas-node-backlight"]')).toBeTruthy();
    expect(container?.querySelector('[data-testid="canvas-favorite-node-backlight"]')).toBeTruthy();
  });

  it("renders media backlight behind the node chrome only for favorite nodes", async () => {
    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "image",
      data: {},
      position: { x: 0, y: 0 },
      style: {},
    });

    await act(async () => {
      root?.render(
        <BaseNodeWrapper
          nodeType="image"
          selected={false}
          backlight={<div data-testid="backlight-fixture" />}
        >
          <div>Inner node content</div>
        </BaseNodeWrapper>,
      );
    });

    expect(container?.querySelector('[data-testid="canvas-node-backlight"]')).toBeNull();
    expect(container?.querySelector('[data-testid="backlight-fixture"]')).toBeNull();

    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "image",
      data: { isFavorite: true },
      position: { x: 0, y: 0 },
      style: {},
    });

    await act(async () => {
      root?.render(
        <BaseNodeWrapper
          nodeType="image"
          selected={false}
          backlight={<div data-testid="backlight-fixture" />}
        >
          <div>Inner node content</div>
        </BaseNodeWrapper>,
      );
    });

    const backlightLayer = container?.querySelector('[data-testid="canvas-node-backlight"]');
    const contentLayer = container?.querySelector('[data-testid="canvas-node-content"]');
    expect(backlightLayer).toBeTruthy();
    expect(backlightLayer?.className).toContain("z-0");
    expect(backlightLayer?.querySelector('[data-testid="backlight-fixture"]')).toBeTruthy();
    expect(contentLayer?.className).toContain("z-10");
  });

  it("does not render a backlight for non-favorite non-media nodes", async () => {
    await renderWrapper({ label: "Frame" }, true);

    expect(container?.querySelector('[data-testid="canvas-node-backlight"]')).toBeNull();
    expect(container?.querySelector('[data-testid="canvas-favorite-node-backlight"]')).toBeNull();
  });

  it("keeps node content mounted when favorite state adds a backlight", async () => {
    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "render",
      data: {},
      position: { x: 0, y: 0 },
      style: {},
    });

    await act(async () => {
      root?.render(
        <BaseNodeWrapper nodeType="render" selected={false}>
          <canvas data-testid="stable-preview-canvas" />
        </BaseNodeWrapper>,
      );
    });

    const initialCanvas = container?.querySelector('[data-testid="stable-preview-canvas"]');
    expect(initialCanvas).toBeTruthy();

    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "render",
      data: { isFavorite: true },
      position: { x: 0, y: 0 },
      style: {},
    });

    await act(async () => {
      root?.render(
        <BaseNodeWrapper nodeType="render" selected={false}>
          <canvas data-testid="stable-preview-canvas" />
        </BaseNodeWrapper>,
      );
    });

    expect(container?.querySelector('[data-testid="canvas-node-backlight"]')).toBeTruthy();
    expect(container?.querySelector('[data-testid="stable-preview-canvas"]')).toBe(initialCanvas);
  });

  it("grows undersized nodes vertically to the measured content minimum", async () => {
    const descriptors: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [
      ["clientWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")],
      ["clientHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")],
      ["scrollWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")],
      ["scrollHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")],
    ];
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      );
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle) => window.clearTimeout(handle));

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 300 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollWidth: { configurable: true, get: () => 348 },
      scrollHeight: { configurable: true, get: () => 812 },
    });

    try {
      await renderWrapper({}, true, "color-adjust");
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(mocks.queueNodeResize).toHaveBeenCalledWith({
        nodeId: "node-1",
        width: 300,
        height: 812,
        skipHistory: true,
      });
      expect(
        mocks.nodeResizeControlProps.some(
          (props) => props.minWidth === 300 && props.minHeight === 812,
        ),
      ).toBe(true);
    } finally {
      for (const [property, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, property, descriptor);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
        }
      }
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("does not auto-resize asset videos from self-scaling media overflow", async () => {
    const descriptors: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [
      ["clientWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")],
      ["clientHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")],
      ["scrollWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")],
      ["scrollHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")],
    ];
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      );
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle) => window.clearTimeout(handle));

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 320 },
      clientHeight: { configurable: true, get: () => 180 },
      scrollWidth: { configurable: true, get: () => 1888 },
      scrollHeight: { configurable: true, get: () => 180 },
    });

    try {
      await renderWrapper({}, true, "asset-video");
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(mocks.queueNodeResize).not.toHaveBeenCalled();
    } finally {
      for (const [property, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, property, descriptor);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
        }
      }
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("does not auto-resize text nodes from horizontal chrome overflow", async () => {
    const descriptors: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [
      ["clientWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")],
      ["clientHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")],
      ["scrollWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")],
      ["scrollHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")],
    ];
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      );
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle) => window.clearTimeout(handle));

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 300 },
      clientHeight: { configurable: true, get: () => 120 },
      scrollWidth: { configurable: true, get: () => 306 },
      scrollHeight: { configurable: true, get: () => 120 },
    });

    try {
      await renderWrapper({}, true, "text");
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(mocks.queueNodeResize).not.toHaveBeenCalled();
    } finally {
      for (const [property, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, property, descriptor);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
        }
      }
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("ignores selected toolbar overflow when deciding content autosize", async () => {
    const descriptors: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [
      ["clientWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")],
      ["clientHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")],
      ["scrollWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")],
      ["scrollHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")],
    ];
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      );
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle) => window.clearTimeout(handle));

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 300 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollWidth: {
        configurable: true,
        get(this: HTMLElement) {
          return this.getAttribute("data-testid") === "canvas-node-chrome" ? 420 : 300;
        },
      },
      scrollHeight: {
        configurable: true,
        get(this: HTMLElement) {
          return this.getAttribute("data-testid") === "canvas-node-chrome" ? 260 : 200;
        },
      },
    });

    try {
      await renderWrapper({}, true, "frame");
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(mocks.queueNodeResize).not.toHaveBeenCalled();
    } finally {
      for (const [property, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, property, descriptor);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
        }
      }
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("auto-resizes dynamic text-heavy nodes vertically without growing width", async () => {
    const descriptors: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [
      ["clientWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")],
      ["clientHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")],
      ["scrollWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")],
      ["scrollHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")],
    ];
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      );
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle) => window.clearTimeout(handle));

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 360 },
      clientHeight: { configurable: true, get: () => 280 },
      scrollWidth: { configurable: true, get: () => 428 },
      scrollHeight: { configurable: true, get: () => 640 },
    });
    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "ai-text-output",
      data: {},
      position: { x: 0, y: 0 },
      style: { width: 360, height: 280 },
    });

    try {
      await act(async () => {
        root?.render(
          <BaseNodeWrapper nodeType="ai-text-output" selected>
            <div>Generated content</div>
          </BaseNodeWrapper>,
        );
      });
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(mocks.queueNodeResize).toHaveBeenCalledWith({
        nodeId: "node-1",
        width: 360,
        height: 640,
        skipHistory: true,
      });
      expect(
        mocks.nodeResizeControlProps.some(
          (props) => props.minWidth === 320 && props.minHeight === 640,
        ),
      ).toBe(true);
    } finally {
      for (const [property, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, property, descriptor);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
        }
      }
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("uses autosize content probes when chrome scrollHeight misses dynamic overflow", async () => {
    const descriptors: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [
      ["clientWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")],
      ["clientHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")],
      ["scrollWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")],
      ["scrollHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")],
      ["offsetHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")],
    ];
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(this: HTMLElement) {
        const element = this as HTMLElement;
        const isProbe = element.hasAttribute("data-canvas-node-autosize-content");
        const height = isProbe ? 610 : 520;
        return {
          x: 0,
          y: 0,
          width: 460,
          height,
          top: 0,
          right: 460,
          bottom: height,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      );
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle) => window.clearTimeout(handle));

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 460 },
      clientHeight: { configurable: true, get: () => 520 },
      scrollWidth: { configurable: true, get: () => 460 },
      scrollHeight: { configurable: true, get: () => 520 },
      offsetHeight: { configurable: true, get: () => 520 },
    });
    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "ai-text",
      data: {},
      position: { x: 0, y: 0 },
      style: { width: 460, height: 520 },
    });

    try {
      await act(async () => {
        root?.render(
          <BaseNodeWrapper nodeType="ai-text" selected>
            <div data-canvas-node-autosize-content>Dynamic status content</div>
          </BaseNodeWrapper>,
        );
      });
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(mocks.queueNodeResize).toHaveBeenCalledWith({
        nodeId: "node-1",
        width: 460,
        height: 610,
        skipHistory: true,
      });
    } finally {
      for (const [property, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, property, descriptor);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
        }
      }
      getBoundingClientRectSpy.mockRestore();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("requeues autosize when a stale node height is replayed after the first resize request", async () => {
    const descriptors: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [
      ["clientWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")],
      ["clientHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")],
      ["scrollWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")],
      ["scrollHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")],
      ["offsetHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")],
    ];
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
        const isProbe = this.hasAttribute("data-canvas-node-autosize-content");
        const height = isProbe ? 610 : 520;
        return {
          x: 0,
          y: 0,
          width: 460,
          height,
          top: 0,
          right: 460,
          bottom: height,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      );
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle) => window.clearTimeout(handle));

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 460 },
      clientHeight: { configurable: true, get: () => 520 },
      scrollWidth: { configurable: true, get: () => 460 },
      scrollHeight: { configurable: true, get: () => 520 },
      offsetHeight: { configurable: true, get: () => 520 },
    });
    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "ai-text",
      data: {},
      position: { x: 0, y: 0 },
      style: { width: 460, height: 520 },
    });

    try {
      await act(async () => {
        root?.render(
          <BaseNodeWrapper nodeType="ai-text" selected>
            <div data-canvas-node-autosize-content>Dynamic status content</div>
          </BaseNodeWrapper>,
        );
      });
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(mocks.queueNodeResize).toHaveBeenCalledTimes(1);

      await act(async () => {
        root?.render(
          <BaseNodeWrapper nodeType="ai-text" selected>
            <div data-canvas-node-autosize-content>
              Dynamic status content still taller than replayed node height
            </div>
          </BaseNodeWrapper>,
        );
      });
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(mocks.queueNodeResize).toHaveBeenCalledTimes(2);
      expect(mocks.queueNodeResize).toHaveBeenLastCalledWith({
        nodeId: "node-1",
        width: 460,
        height: 610,
        skipHistory: true,
      });
    } finally {
      for (const [property, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, property, descriptor);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
        }
      }
      getBoundingClientRectSpy.mockRestore();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("does not enqueue layout state updates for already-sized nodes during canvas load", async () => {
    const descriptors: Array<[keyof HTMLElement, PropertyDescriptor | undefined]> = [
      ["clientWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")],
      ["clientHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")],
      ["scrollWidth", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth")],
      ["scrollHeight", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")],
    ];

    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 320 },
      clientHeight: { configurable: true, get: () => 240 },
      scrollWidth: { configurable: true, get: () => 320 },
      scrollHeight: { configurable: true, get: () => 240 },
    });
    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "text",
      data: {},
      position: { x: 0, y: 0 },
      style: { width: 320, height: 240 },
    });

    try {
      await expect(
        act(async () => {
          root?.render(
            <>
              {Array.from({ length: 80 }, (_, index) => (
                <BaseNodeWrapper
                  key={index}
                  nodeType="text"
                  selected={false}
                >
                  <div>Node {index}</div>
                </BaseNodeWrapper>
              ))}
            </>,
          );
        }),
      ).resolves.toBeUndefined();
      expect(mocks.queueNodeResize).not.toHaveBeenCalled();
    } finally {
      for (const [property, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(HTMLElement.prototype, property, descriptor);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
        }
      }
    }
  });
});

describe("canvas node metadata helpers", () => {
  it("reads and toggles bypass metadata without writing false values", () => {
    expect(readNodeBypassed({ isBypassed: true })).toBe(true);
    expect(readNodeBypassed({ isBypassed: false })).toBe(false);
    expect(setNodeBypassed(true, { label: "Curves" })).toEqual({
      label: "Curves",
      isBypassed: true,
    });
    expect(setNodeBypassed(false, { label: "Curves", isBypassed: true })).toEqual({
      label: "Curves",
    });
  });

  it("preserves favorite and bypass metadata across normalized data writes", () => {
    expect(
      preserveNodeMetadata(
        { exposure: 0.4 },
        { isFavorite: true, isBypassed: true, exposure: 0.1 },
      ),
    ).toEqual({
      exposure: 0.4,
      isFavorite: true,
      isBypassed: true,
    });
  });

  it("reads, toggles, and preserves collapsed metadata with expanded size", () => {
    expect(readNodeCollapsed({ isCollapsed: true })).toBe(true);
    expect(readNodeCollapsed({ isCollapsed: false })).toBe(false);
    expect(
      setNodeCollapsed(true, { label: "Curves" }, { width: 320, height: 660 }),
    ).toEqual({
      label: "Curves",
      isCollapsed: true,
      expandedSize: { width: 320, height: 660 },
    });
    expect(
      setNodeCollapsed(false, {
        label: "Curves",
        isCollapsed: true,
        expandedSize: { width: 320, height: 660 },
      }),
    ).toEqual({
      label: "Curves",
    });
    expect(
      preserveNodeMetadata(
        { exposure: 0.4 },
        {
          isFavorite: true,
          isBypassed: true,
          isCollapsed: true,
          expandedSize: { width: 320, height: 660 },
          exposure: 0.1,
        },
      ),
    ).toEqual({
      exposure: 0.4,
      isFavorite: true,
      isBypassed: true,
      isCollapsed: true,
      expandedSize: { width: 320, height: 660 },
    });
  });
});
