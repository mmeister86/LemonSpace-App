// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  createNodeWithIntersection: vi.fn(async () => undefined),
  getNode: vi.fn(),
  getNodes: vi.fn(() => []),
  getEdges: vi.fn(() => []),
  setNodes: vi.fn(),
  deleteElements: vi.fn(async () => undefined),
}));

vi.mock("@xyflow/react", () => ({
  NodeToolbar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="node-toolbar">{children}</div>
  ),
  NodeResizeControl: () => null,
  Position: { Top: "top" },
  useNodeId: () => "node-1",
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
  }),
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeWithIntersection: mocks.createNodeWithIntersection,
  }),
}));

import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BaseNodeWrapper", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.queueNodeDataUpdate.mockClear();
    mocks.createNodeWithIntersection.mockClear();
    mocks.getNode.mockReset();
    mocks.getNodes.mockClear();
    mocks.getEdges.mockClear();
    mocks.setNodes.mockClear();
    mocks.deleteElements.mockClear();

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

  async function renderWrapper(nodeData: Record<string, unknown>, selected = true) {
    mocks.getNode.mockReturnValue({
      id: "node-1",
      type: "text",
      data: nodeData,
      position: { x: 0, y: 0 },
      style: {},
    });

    await act(async () => {
      root?.render(
        <BaseNodeWrapper nodeType="text" selected={selected}>
          <div>Inner node content</div>
        </BaseNodeWrapper>,
      );
    });
  }

  it("shows favorite toggle with duplicate and delete controls for selected nodes", async () => {
    await renderWrapper({ label: "Frame" }, true);

    expect(container?.querySelector('button[title="Favorite"]')).toBeTruthy();
    expect(container?.querySelector('button[title="Duplicate"]')).toBeTruthy();
    expect(container?.querySelector('button[title="Delete"]')).toBeTruthy();
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
});
