// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasGraphProvider } from "@/components/canvas/canvas-graph-context";
import type { Id } from "@/convex/_generated/dataModel";
import { CanvasSyncProvider } from "@/components/canvas/canvas-sync-context";

const mocks = vi.hoisted(() => ({
  selectedNodes: [] as RFNode[],
  allNodes: [] as RFNode[],
  edges: [] as RFEdge[],
  queueNodeDataUpdate: vi.fn(async () => undefined),
  queueNodeResize: vi.fn(async () => undefined),
  createNodeWithIntersection: vi.fn(async () => undefined),
  setNodes: vi.fn(),
  deleteElements: vi.fn(async () => undefined),
  selectionRevision: 0,
}));

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  useOnSelectionChange: ({ onChange }: { onChange: (selection: { nodes: RFNode[] }) => void }) => {
    const selectionRevision = mocks.selectionRevision;
    React.useEffect(() => {
      onChange({ nodes: mocks.selectedNodes });
    }, [onChange, selectionRevision]);
  },
  useReactFlow: () => ({
    getNodes: () => mocks.allNodes,
    getNode: (nodeId: string) => mocks.allNodes.find((node) => node.id === nodeId),
    getEdges: () => mocks.edges,
    setNodes: mocks.setNodes,
    deleteElements: mocks.deleteElements,
  }),
  useStore: (selector: (store: { nodes: RFNode[]; edges: RFEdge[] }) => unknown) =>
    selector({ nodes: mocks.allNodes, edges: mocks.edges }),
  getConnectedEdges: () => [],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-pipeline-preview", () => ({
  usePipelinePreview: () => ({
    canvasRef: { current: null },
    hasSource: true,
    isRendering: false,
    previewAspectRatio: 1.6,
    histogram: {
      red: new Array(256).fill(0),
      green: new Array(256).fill(0),
      blue: new Array(256).fill(0),
      rgb: new Array(256).fill(0),
    },
    error: null,
  }),
}));

vi.mock("@/components/canvas/canvas-presets-context", () => ({
  useCanvasAdjustmentPresets: () => [],
  useSaveCanvasAdjustmentPreset: () => vi.fn(async () => undefined),
}));

vi.mock("@/src/components/tool-ui/parameter-slider", () => ({
  ParameterSlider: ({
    id,
    values,
    onChange,
  }: {
    id: string;
    values: Array<{ id: string; value: number }>;
    onChange: (values: Array<{ id: string; value: number }>) => void;
  }) => (
    <button
      type="button"
      data-testid="parameter-slider"
      data-slider-id={id}
      onClick={() => {
        const first = values[0];
        if (first) {
          onChange([{ ...first, value: first.value + 1 }, ...values.slice(1)]);
        }
      }}
    >
      slider
    </button>
  ),
}));

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({
    open,
    direction,
    handleOnly,
    modal,
    shouldScaleBackground,
    children,
  }: {
    open?: boolean;
    direction?: string;
    handleOnly?: boolean;
    modal?: boolean;
    shouldScaleBackground?: boolean;
    children: React.ReactNode;
  }) => (
    open ? (
      <section
        data-testid="drawer-root"
        data-direction={direction}
        data-handle-only={String(handleOnly)}
        data-modal={String(modal)}
        data-scale-background={String(shouldScaleBackground)}
      >
        {children}
      </section>
    ) : null
  ),
  DrawerContent: ({
    children,
    showOverlay,
    ref,
  }: {
    children: React.ReactNode;
    showOverlay?: boolean;
    ref?: React.Ref<HTMLDivElement>;
  }) => (
    <div ref={ref} data-testid="drawer-content" data-show-overlay={String(showOverlay)}>
      {children}
    </div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeWithIntersection: mocks.createNodeWithIntersection,
  }),
}));

import { CollapsedNodeEditDrawer } from "@/components/canvas/collapsed-node-edit-drawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildPromptNode(overrides: Partial<RFNode> = {}): RFNode {
  return {
    id: "prompt-1",
    type: "prompt",
    position: { x: 0, y: 0 },
    data: {
      prompt: "Initial prompt",
      model: "model-a",
      isCollapsed: true,
      expandedSize: { width: 288, height: 260 },
    },
    selected: true,
    ...overrides,
  };
}

function TestApp() {
  return (
    <CanvasGraphProvider nodes={mocks.allNodes as never} edges={mocks.edges as never}>
      <CanvasSyncProvider
        value={{
          queueNodeDataUpdate: mocks.queueNodeDataUpdate,
          queueNodeResize: mocks.queueNodeResize,
          status: { pendingCount: 0, isSyncing: false, isOffline: false },
        }}
      >
        <CollapsedNodeEditDrawer />
      </CanvasSyncProvider>
    </CanvasGraphProvider>
  );
}

describe("CollapsedNodeEditDrawer", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.selectedNodes = [];
    mocks.allNodes = [];
    mocks.edges = [];
    mocks.queueNodeDataUpdate.mockClear();
    mocks.queueNodeResize.mockClear();
    mocks.createNodeWithIntersection.mockClear();
    mocks.setNodes.mockClear();
    mocks.deleteElements.mockClear();
    mocks.selectionRevision = 0;
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

  async function renderDrawer(nodes: RFNode[], edges: RFEdge[] = []) {
    mocks.allNodes = nodes;
    mocks.edges = edges;
    mocks.selectedNodes = nodes.filter((node) => node.selected);
    mocks.selectionRevision += 1;
    await act(async () => {
      root?.render(<TestApp />);
    });
  }

  it("opens from the right for exactly one selected collapsed editable node", async () => {
    await renderDrawer([buildPromptNode()]);

    const drawerRoot = container?.querySelector('[data-testid="drawer-root"]');
    expect(drawerRoot).toBeTruthy();
    expect(drawerRoot?.getAttribute("data-direction")).toBe("right");
    expect(drawerRoot?.getAttribute("data-handle-only")).toBe("true");
    expect(drawerRoot?.getAttribute("data-modal")).toBe("false");
    expect(drawerRoot?.getAttribute("data-scale-background")).toBe("false");
    expect(container?.querySelector('[data-testid="drawer-content"]')?.getAttribute("data-show-overlay")).toBe("false");
    expect(container?.textContent).toContain("KI-Bild");
    expect(container?.querySelector("textarea")).toBeInstanceOf(HTMLTextAreaElement);
  });

  it("renders the generic collapsed node toolbar as a drawer navbar", async () => {
    await renderDrawer([buildPromptNode()]);

    const toolbar = container?.querySelector('[data-testid="collapsed-node-drawer-toolbar"]');
    expect(toolbar).toBeTruthy();
    expect(toolbar?.className).toContain("rounded-none");
    expect(toolbar?.className).toContain("grid-cols-5");
    expect(toolbar?.className).not.toContain("overflow-x-auto");
    expect(toolbar?.textContent).toContain("Aufklappen");
    expect(toolbar?.querySelector('button[title="Expand"]')).toBeTruthy();
    expect(toolbar?.querySelector('button[title="Ausblenden"]')).toBeTruthy();
    expect(toolbar?.querySelector('button[title="Favorite"]')).toBeTruthy();
    expect(toolbar?.querySelector('button[title="Duplicate"]')).toBeTruthy();
    expect(toolbar?.querySelector('button[title="Delete"]')).toBeTruthy();
  });

  it("closes for multi-selection and non-collapsed selection", async () => {
    await renderDrawer([buildPromptNode()]);
    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeTruthy();

    await renderDrawer([
      buildPromptNode(),
      {
        id: "note-1",
        type: "note",
        position: { x: 100, y: 0 },
        data: { content: "Note", isCollapsed: true },
        selected: true,
      },
    ]);
    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeNull();

    await renderDrawer([
      buildPromptNode({
        data: { prompt: "Expanded", isCollapsed: false },
        selected: true,
      }),
    ]);
    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeNull();
  });

  it("closes on pointer focus loss outside the drawer while selection stays unchanged", async () => {
    await renderDrawer([buildPromptNode()]);
    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeTruthy();

    const outsideTarget = document.createElement("button");
    document.body.appendChild(outsideTarget);

    await act(async () => {
      outsideTarget.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeNull();

    outsideTarget.remove();
  });

  it("reopens when the already selected collapsed node is clicked after focus loss", async () => {
    await renderDrawer([buildPromptNode()]);
    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeTruthy();

    const outsideTarget = document.createElement("button");
    document.body.appendChild(outsideTarget);

    await act(async () => {
      outsideTarget.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeNull();

    const collapsedNode = document.createElement("div");
    collapsedNode.className = "react-flow__node";
    collapsedNode.dataset.id = "prompt-1";
    const collapsedNodeBody = document.createElement("button");
    collapsedNode.appendChild(collapsedNodeBody);
    document.body.appendChild(collapsedNode);

    await act(async () => {
      collapsedNodeBody.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }),
      );
      document.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }),
      );
    });

    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeTruthy();

    outsideTarget.remove();
    collapsedNode.remove();
  });

  it("does not reopen when the already selected collapsed node is dragged after focus loss", async () => {
    await renderDrawer([buildPromptNode()]);
    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeTruthy();

    const outsideTarget = document.createElement("button");
    document.body.appendChild(outsideTarget);

    await act(async () => {
      outsideTarget.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeNull();

    const collapsedNode = document.createElement("div");
    collapsedNode.className = "react-flow__node";
    collapsedNode.dataset.id = "prompt-1";
    const collapsedNodeBody = document.createElement("button");
    collapsedNode.appendChild(collapsedNodeBody);
    document.body.appendChild(collapsedNode);

    await act(async () => {
      collapsedNodeBody.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }),
      );
      document.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX: 34,
          clientY: 10,
        }),
      );
      document.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          clientX: 34,
          clientY: 10,
        }),
      );
    });

    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeNull();

    outsideTarget.remove();
    collapsedNode.remove();
  });

  it("keeps the drawer open for node toolbar interactions outside the drawer", async () => {
    await renderDrawer([buildPromptNode()]);
    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeTruthy();

    const toolbar = document.createElement("div");
    toolbar.className = "react-flow__node-toolbar";
    const toolbarButton = document.createElement("button");
    toolbar.appendChild(toolbarButton);
    document.body.appendChild(toolbar);

    await act(async () => {
      toolbarButton.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(container?.querySelector('[data-testid="drawer-root"]')).toBeTruthy();

    toolbar.remove();
  });

  it("persists edited drawer fields through the node data update queue", async () => {
    await renderDrawer([buildPromptNode()]);

    const textarea = container?.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Drawer prompt textarea not found");
    }

    await act(async () => {
      textarea.value = "Updated prompt";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "prompt-1" as Id<"nodes">,
      data: {
        prompt: "Updated prompt",
        model: "model-a",
        isCollapsed: true,
        expandedSize: { width: 288, height: 260 },
      },
    });
  });

  it("shows a source image preview for collapsed crop nodes", async () => {
    await renderDrawer(
      [
        {
          id: "image-1",
          type: "image",
          position: { x: 0, y: 0 },
          data: { url: "https://cdn.example.com/source.png" },
          selected: false,
        },
        {
          id: "crop-1",
          type: "crop",
          position: { x: 100, y: 0 },
          data: {
            isCollapsed: true,
            crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
            resize: { mode: "source", fit: "cover", keepAspect: true },
          },
          selected: true,
        },
      ],
      [{ id: "edge-1", source: "image-1", target: "crop-1" }],
    );

    expect(container?.querySelector('[data-testid="crop-preview-area"]')).toBeInstanceOf(HTMLDivElement);
    expect(container?.querySelector('[data-testid="crop-overlay"]')).toBeInstanceOf(HTMLDivElement);
    expect(container?.querySelector('[data-testid="collapsed-node-preview-image"]')).toBeNull();
  });

  it("persists crop drawer overlay interactions through the same node data queue", async () => {
    await renderDrawer(
      [
        {
          id: "image-1",
          type: "image",
          position: { x: 0, y: 0 },
          data: { url: "https://cdn.example.com/source.png" },
          selected: false,
        },
        {
          id: "crop-1",
          type: "crop",
          position: { x: 100, y: 0 },
          data: {
            isCollapsed: true,
            crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
            resize: { mode: "source", fit: "cover", keepAspect: false },
          },
          selected: true,
        },
      ],
      [{ id: "edge-1", source: "image-1", target: "crop-1" }],
    );

    const preview = container?.querySelector('[data-testid="crop-preview-area"]');
    const overlay = container?.querySelector('[data-testid="crop-overlay"]');
    expect(preview).toBeInstanceOf(HTMLDivElement);
    expect(overlay).toBeInstanceOf(HTMLDivElement);

    vi.spyOn(preview as HTMLDivElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });

    const dispatchPointerEvent = (type: string, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      overlay?.dispatchEvent(event);
    };

    await act(async () => {
      dispatchPointerEvent("pointerdown", 10, 10);
      dispatchPointerEvent("pointermove", 30, 20);
      dispatchPointerEvent("pointerup", 30, 20);
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "crop-1" as Id<"nodes">,
      data: expect.objectContaining({
        isCollapsed: true,
        crop: expect.objectContaining({
          x: expect.closeTo(0.2),
          y: expect.closeTo(0.3),
        }),
      }),
    });
  });

  it("renders adjustment drawers with the real preview and slider surface", async () => {
    await renderDrawer(
      [
        {
          id: "image-1",
          type: "image",
          position: { x: 0, y: 0 },
          data: { url: "https://cdn.example.com/source.png" },
          selected: false,
        },
        {
          id: "curves-1",
          type: "curves",
          position: { x: 100, y: 0 },
          data: {
            isCollapsed: true,
            channel: "rgb",
            levels: { blackPoint: 10, whitePoint: 250, gamma: 1 },
            preset: null,
          },
          selected: true,
        },
      ],
      [{ id: "edge-1", source: "image-1", target: "curves-1" }],
    );

    expect(container?.querySelector('[data-testid="parameter-slider"]')).toBeTruthy();
    expect(container?.querySelector("canvas")).toBeTruthy();
    expect(container?.textContent).not.toContain("Black Point");
  });
});
