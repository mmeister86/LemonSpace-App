// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import { useCanvasEdgeInsertions } from "@/components/canvas/use-canvas-edge-insertions";
import { computeEdgeInsertLayout } from "@/components/canvas/canvas-helpers";

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
  applyLocalNodeMoves?: ReturnType<typeof vi.fn>;
  showConnectionRejectedToast?: ReturnType<typeof vi.fn>;
  onReflowStateChange?: (isReflowing: boolean) => void;
  reflowSettleMs?: number;
};

function HookHarness({
  nodes,
  edges,
  runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new"),
  runBatchMoveNodesMutation = vi.fn(async () => undefined),
  applyLocalNodeMoves,
  showConnectionRejectedToast = vi.fn(),
  onReflowStateChange,
  reflowSettleMs = 0,
}: HookHarnessProps) {
  const hookArgs = {
    canvasId: asCanvasId("canvas-1"),
    nodes,
    edges,
    runCreateNodeWithEdgeSplitOnlineOnly,
    runBatchMoveNodesMutation,
    applyLocalNodeMoves,
    showConnectionRejectedToast,
    onReflowStateChange,
    reflowSettleMs,
  } as Parameters<typeof useCanvasEdgeInsertions>[0];

  const handlers = useCanvasEdgeInsertions(hookArgs);

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

  it("resolves optimistic edge menu opens to a persisted twin edge id", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");

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
              id: "optimistic_edge_req-1",
              source: "source",
              target: "target",
              sourceHandle: "source-handle",
              targetHandle: "target-handle",
            }),
            createEdge({
              id: "edge-real-1",
              source: "source",
              target: "target",
              sourceHandle: "source-handle",
              targetHandle: "target-handle",
            }),
          ]}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({
        edgeId: "optimistic_edge_req-1",
        screenX: 20,
        screenY: 30,
      });
    });

    expect(latestHandlersRef.current?.edgeInsertMenu).toEqual({
      edgeId: "edge-real-1",
      screenX: 20,
      screenY: 30,
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

    expect(runCreateNodeWithEdgeSplitOnlineOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        splitEdgeId: "edge-real-1",
      }),
    );
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

  it("moves chain nodes before create when spacing is too tight", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const events: string[] = [];

    runBatchMoveNodesMutation.mockImplementation(async () => {
      events.push("move");
    });
    runCreateNodeWithEdgeSplitOnlineOnly.mockImplementation(async () => {
      events.push("create");
      return "node-new";
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            createNode({ id: "upstream", type: "image", position: { x: -120, y: 0 } }),
            createNode({ id: "source", type: "image", position: { x: 0, y: 0 } }),
            createNode({ id: "target", type: "text", position: { x: 120, y: 0 } }),
            createNode({ id: "downstream", type: "text", position: { x: 240, y: 0 } }),
          ]}
          edges={[
            createEdge({ id: "edge-upstream", source: "upstream", target: "source" }),
            createEdge({ id: "edge-1", source: "source", target: "target" }),
            createEdge({ id: "edge-downstream", source: "target", target: "downstream" }),
          ]}
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
        { nodeId: "upstream", positionX: -230, positionY: 0 },
        { nodeId: "source", positionX: -110, positionY: 0 },
        { nodeId: "target", positionX: 230, positionY: 0 },
        { nodeId: "downstream", positionX: 350, positionY: 0 },
      ],
    });
    expect(events).toEqual(["move", "create"]);
  });

  it("computes insert position from post-reflow source/target positions", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);

    const source = createNode({
      id: "source",
      type: "image",
      position: { x: 0, y: 20 },
      style: { width: 160, height: 60 },
    });
    const target = createNode({
      id: "target",
      type: "text",
      position: { x: 150, y: 20 },
      style: { width: 80, height: 120 },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[source, target]}
          edges={[createEdge({ id: "edge-1", source: "source", target: "target" })]}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({ edgeId: "edge-1", screenX: 10, screenY: 10 });
    });

    const initialLayout = computeEdgeInsertLayout({
      sourceNode: source,
      targetNode: target,
      newNodeWidth: 220,
      newNodeHeight: 120,
      gapPx: 10,
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

    const typedBatchMoveMock = runBatchMoveNodesMutation as unknown as {
      mock: { calls: unknown[][] };
    };
    const firstMoveCallUnknown = typedBatchMoveMock.mock.calls[0]?.[0];
    const firstMoveCall = firstMoveCallUnknown as
      | {
          moves: {
            nodeId: string;
            positionX: number;
            positionY: number;
          }[];
        }
      | undefined;
    expect(firstMoveCall).toBeDefined();
    const moveByNodeId = new Map(
      (firstMoveCall?.moves ?? []).map((move) => [move.nodeId, move]),
    );

    const sourceMove = moveByNodeId.get("source");
    const targetMove = moveByNodeId.get("target");
    expect(sourceMove).toBeDefined();
    expect(targetMove).toBeDefined();

    const sourceAfter = {
      ...source,
      position: {
        x: sourceMove?.positionX ?? source.position.x,
        y: sourceMove?.positionY ?? source.position.y,
      },
    };
    const targetAfter = {
      ...target,
      position: {
        x: targetMove?.positionX ?? target.position.x,
        y: targetMove?.positionY ?? target.position.y,
      },
    };

    const postMoveLayout = computeEdgeInsertLayout({
      sourceNode: sourceAfter,
      targetNode: targetAfter,
      newNodeWidth: 220,
      newNodeHeight: 120,
      gapPx: 10,
    });

    expect(initialLayout.insertPosition).not.toEqual(postMoveLayout.insertPosition);
    expect(runCreateNodeWithEdgeSplitOnlineOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        positionX: postMoveLayout.insertPosition.x,
        positionY: postMoveLayout.insertPosition.y,
      }),
    );
  });

  it("publishes reflow state while chain nodes are moving", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const onReflowStateChange = vi.fn();

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
          onReflowStateChange={onReflowStateChange}
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

    expect(onReflowStateChange.mock.calls).toEqual([[true], [false]]);
  });

  it("applies local reflow moves before creating split node", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const applyLocalNodeMoves = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            createNode({ id: "upstream", type: "image", position: { x: -120, y: 0 } }),
            createNode({ id: "source", type: "image", position: { x: 0, y: 0 } }),
            createNode({ id: "target", type: "text", position: { x: 120, y: 0 } }),
            createNode({ id: "downstream", type: "text", position: { x: 240, y: 0 } }),
          ]}
          edges={[
            createEdge({ id: "edge-upstream", source: "upstream", target: "source" }),
            createEdge({ id: "edge-1", source: "source", target: "target" }),
            createEdge({ id: "edge-downstream", source: "target", target: "downstream" }),
          ]}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          applyLocalNodeMoves={applyLocalNodeMoves}
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

    expect(applyLocalNodeMoves).toHaveBeenCalledTimes(1);
    expect(applyLocalNodeMoves).toHaveBeenCalledWith([
      { nodeId: "upstream", positionX: -230, positionY: 0 },
      { nodeId: "source", positionX: -110, positionY: 0 },
      { nodeId: "target", positionX: 230, positionY: 0 },
      { nodeId: "downstream", positionX: 350, positionY: 0 },
    ]);
    expect(applyLocalNodeMoves.mock.invocationCallOrder[0]).toBeLessThan(
      runCreateNodeWithEdgeSplitOnlineOnly.mock.invocationCallOrder[0],
    );
  });

  it("does not apply local reflow moves when no move is needed", async () => {
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-new");
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const applyLocalNodeMoves = vi.fn();

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
          edges={[createEdge({ id: "edge-1", source: "source", target: "target" })]}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          applyLocalNodeMoves={applyLocalNodeMoves}
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

    expect(runBatchMoveNodesMutation).not.toHaveBeenCalled();
    expect(applyLocalNodeMoves).not.toHaveBeenCalled();
    expect(runCreateNodeWithEdgeSplitOnlineOnly).toHaveBeenCalledTimes(1);
  });

  it("ignores temp edges when validating a split into adjustment targets", async () => {
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
            createNode({ id: "target", type: "curves", position: { x: 280, y: 0 } }),
            createNode({ id: "other", type: "image", position: { x: 0, y: 160 } }),
          ]}
          edges={[
            createEdge({ id: "edge-1", source: "source", target: "target" }),
            createEdge({ id: "edge-temp", source: "other", target: "target", className: "temp" }),
          ]}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({ edgeId: "edge-1", screenX: 20, screenY: 20 });
    });

    await act(async () => {
      await latestHandlersRef.current?.handleEdgeInsertPick({
        type: "color-adjust",
        label: "Farbe",
        width: 320,
        height: 800,
        defaultData: {},
      } as CanvasNodeTemplate);
    });

    expect(runCreateNodeWithEdgeSplitOnlineOnly).toHaveBeenCalledTimes(1);
    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
  });

  it("exposes only edge-compatible templates for selected edge", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            createNode({ id: "source", type: "color-adjust", position: { x: 0, y: 0 } }),
            createNode({ id: "target", type: "render", position: { x: 360, y: 0 } }),
          ]}
          edges={[createEdge({ id: "edge-1", source: "source", target: "target" })]}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.openEdgeInsertMenu({ edgeId: "edge-1", screenX: 20, screenY: 20 });
    });

    const templateTypes = (latestHandlersRef.current?.edgeInsertTemplates ?? []).map(
      (template) => template.type,
    );

    expect(templateTypes).toContain("curves");
    expect(templateTypes).toContain("color-adjust");
    expect(templateTypes).toContain("image");
    expect(templateTypes).toContain("asset");

    expect(templateTypes).not.toContain("render");
    expect(templateTypes).not.toContain("prompt");
    expect(templateTypes).not.toContain("text");
    expect(templateTypes).not.toContain("ai-image");
  });
});
