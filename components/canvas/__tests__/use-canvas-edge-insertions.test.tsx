// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import { useCanvasEdgeInsertions } from "@/components/canvas/use-canvas-edge-insertions";

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasEdgeInsertions> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

function createNode(overrides: Partial<RFNode> & Pick<RFNode, "id">): RFNode {
  return {
    type: "note",
    position: { x: 0, y: 0 },
    style: { width: 100, height: 60 },
    data: {},
    ...overrides,
  } as RFNode;
}

function createEdge(
  overrides: Partial<RFEdge> & Pick<RFEdge, "id" | "source" | "target">,
): RFEdge {
  return {
    ...overrides,
  } as RFEdge;
}

type HookHarnessProps = {
  nodes: RFNode[];
  edges: RFEdge[];
  runCreateNodeWithEdgeSplitOnlineOnly?: ReturnType<typeof vi.fn>;
  runBatchMoveNodesMutation?: ReturnType<typeof vi.fn>;
  showConnectionRejectedToast?: ReturnType<typeof vi.fn>;
};

function HookHarness({
  nodes,
  edges,
  runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new"),
  runBatchMoveNodesMutation = vi.fn(async () => undefined),
  showConnectionRejectedToast = vi.fn(),
}: HookHarnessProps) {
  const handlers = useCanvasEdgeInsertions({
    canvasId: asCanvasId("canvas-1"),
    nodes,
    edges,
    runCreateNodeWithEdgeSplitOnlineOnly,
    runBatchMoveNodesMutation,
    showConnectionRejectedToast,
  });

  useEffect(() => {
    latestHandlersRef.current = handlers;
  }, [handlers]);

  return null;
}

describe("useCanvasEdgeInsertions", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    latestHandlersRef.current = null;
    vi.clearAllMocks();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("opens edge insert menu for persisted edges", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            createNode({ id: "source", type: "image" }),
            createNode({ id: "target", type: "text" }),
          ]}
          edges={[createEdge({ id: "edge-1", source: "source", target: "target" })]}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({
        edgeId: "edge-1",
        screenX: 120,
        screenY: 240,
      });
    });

    expect(latestHandlersRef.current?.edgeInsertMenu).toEqual({
      edgeId: "edge-1",
      screenX: 120,
      screenY: 240,
    });
  });

  it("ignores temp, optimistic, and missing edges when opening menu", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            createNode({ id: "source", type: "image" }),
            createNode({ id: "target", type: "text" }),
          ]}
          edges={[
            createEdge({ id: "edge-temp", source: "source", target: "target", className: "temp" }),
            createEdge({ id: "optimistic_edge_1", source: "source", target: "target" }),
          ]}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({
        edgeId: "edge-temp",
        screenX: 1,
        screenY: 2,
      });
      latestHandlersRef.current?.openEdgeInsertMenu({
        edgeId: "optimistic_edge_1",
        screenX: 3,
        screenY: 4,
      });
      latestHandlersRef.current?.openEdgeInsertMenu({
        edgeId: "edge-missing",
        screenX: 5,
        screenY: 6,
      });
    });

    expect(latestHandlersRef.current?.edgeInsertMenu).toBeNull();
  });

  it("shows toast and skips create when split validation fails", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            createNode({ id: "source", type: "image", position: { x: 0, y: 0 } }),
            createNode({ id: "target", type: "curves", position: { x: 300, y: 0 } }),
          ]}
          edges={[createEdge({ id: "edge-1", source: "source", target: "target" })]}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({ edgeId: "edge-1", screenX: 10, screenY: 10 });
    });

    await act(async () => {
      await latestHandlersRef.current?.handleEdgeInsertPick({
        type: "prompt",
        label: "Prompt",
        width: 320,
        height: 220,
        defaultData: { prompt: "", model: "", aspectRatio: "1:1" },
      } as CanvasNodeTemplate);
    });

    expect(showConnectionRejectedToast).toHaveBeenCalledWith("adjustment-source-invalid");
    expect(runCreateNodeWithEdgeSplitOnlineOnly).not.toHaveBeenCalled();
    expect(runBatchMoveNodesMutation).not.toHaveBeenCalled();
  });

  it("creates split node with computed payload when split is valid", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            createNode({ id: "source", type: "image", position: { x: 0, y: 0 } }),
            createNode({ id: "target", type: "text", position: { x: 500, y: 0 } }),
          ]}
          edges={[
            createEdge({
              id: "edge-1",
              source: "source",
              target: "target",
              sourceHandle: "source-handle",
              targetHandle: "target-handle",
            }),
          ]}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({ edgeId: "edge-1", screenX: 10, screenY: 10 });
    });

    await act(async () => {
      await latestHandlersRef.current?.handleEdgeInsertPick({
        type: "prompt",
        label: "Prompt",
        width: 320,
        height: 220,
        defaultData: { prompt: "", model: "", aspectRatio: "1:1" },
      } as CanvasNodeTemplate);
    });

    expect(runCreateNodeWithEdgeSplitOnlineOnly).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      type: "prompt",
      positionX: 140,
      positionY: -80,
      width: 320,
      height: 220,
      data: {
        prompt: "",
        model: "",
        aspectRatio: "1:1",
        canvasId: "canvas-1",
      },
      splitEdgeId: "edge-1",
      newNodeTargetHandle: "image-in",
      newNodeSourceHandle: "prompt-out",
      splitSourceHandle: "source-handle",
      splitTargetHandle: "target-handle",
    });
    expect(runBatchMoveNodesMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
    expect(latestHandlersRef.current?.edgeInsertMenu).toBeNull();
  });

  it("moves source and target nodes when spacing is too tight", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            createNode({ id: "source", type: "image", position: { x: 0, y: 0 } }),
            createNode({ id: "target", type: "text", position: { x: 120, y: 0 } }),
          ]}
          edges={[createEdge({ id: "edge-1", source: "source", target: "target" })]}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({ edgeId: "edge-1", screenX: 10, screenY: 10 });
    });

    await act(async () => {
      await latestHandlersRef.current?.handleEdgeInsertPick({
        type: "note",
        label: "Notiz",
        width: 220,
        height: 120,
        defaultData: { content: "" },
      } as CanvasNodeTemplate);
    });

    expect(runCreateNodeWithEdgeSplitOnlineOnly).toHaveBeenCalledTimes(1);
    expect(runBatchMoveNodesMutation).toHaveBeenCalledWith({
      moves: [
        { nodeId: "source", positionX: -110, positionY: 0 },
        { nodeId: "target", positionX: 230, positionY: 0 },
      ],
    });
  });
});
