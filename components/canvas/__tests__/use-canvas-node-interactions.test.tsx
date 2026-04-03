// @vitest-environment jsdom

import React, { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasNodeInteractions } from "@/components/canvas/use-canvas-node-interactions";

const {
  getNodeCenterClientPositionMock,
  getIntersectedEdgeIdMock,
} = vi.hoisted(() => ({
  getNodeCenterClientPositionMock: vi.fn(),
  getIntersectedEdgeIdMock: vi.fn(),
}));

vi.mock("@/components/canvas/canvas-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/components/canvas/canvas-helpers")>(
    "@/components/canvas/canvas-helpers",
  );

  return {
    ...actual,
    getNodeCenterClientPosition: getNodeCenterClientPositionMock,
    getIntersectedEdgeId: getIntersectedEdgeIdMock,
  };
});

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;
const asEdgeId = (id: string): Id<"edges"> => id as Id<"edges">;

type PendingEdgeSplitState = {
  intersectedEdgeId: Id<"edges">;
  sourceNodeId: Id<"nodes">;
  targetNodeId: Id<"nodes">;
  intersectedSourceHandle?: string;
  intersectedTargetHandle?: string;
  middleSourceHandle?: string;
  middleTargetHandle?: string;
  positionX: number;
  positionY: number;
};

type HarnessProps = {
  initialNodes: RFNode[];
  initialEdges: RFEdge[];
  isDraggingRef?: { current: boolean };
  isResizingRef?: { current: boolean };
  pendingLocalPositionUntilConvexMatchesRef?: {
    current: Map<string, { x: number; y: number }>;
  };
  preferLocalPositionNodeIdsRef?: { current: Set<string> };
  pendingMoveAfterCreateRef?: {
    current: Map<string, { positionX: number; positionY: number }>;
  };
  resolvedRealIdByClientRequestRef?: {
    current: Map<string, Id<"nodes">>;
  };
  pendingEdgeSplitByClientRequestRef?: {
    current: Map<string, PendingEdgeSplitState>;
  };
  runResizeNodeMutation?: ReturnType<typeof vi.fn>;
  runMoveNodeMutation?: ReturnType<typeof vi.fn>;
  runBatchMoveNodesMutation?: ReturnType<typeof vi.fn>;
  runSplitEdgeAtExistingNodeMutation?: ReturnType<typeof vi.fn>;
  syncPendingMoveForClientRequest?: ReturnType<typeof vi.fn>;
};

const latestHarnessRef: {
  current:
    | {
        nodes: RFNode[];
        edges: RFEdge[];
        onNodesChange: ReturnType<typeof useCanvasNodeInteractions>["onNodesChange"];
        onNodeDragStart: ReturnType<typeof useCanvasNodeInteractions>["onNodeDragStart"];
        onNodeDrag: ReturnType<typeof useCanvasNodeInteractions>["onNodeDrag"];
        onNodeDragStop: ReturnType<typeof useCanvasNodeInteractions>["onNodeDragStop"];
        clearHighlightedIntersectionEdge: () => void;
      }
    | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness(props: HarnessProps) {
  const [nodes, setNodes] = useState<RFNode[]>(props.initialNodes);
  const [edges, setEdges] = useState<RFEdge[]>(props.initialEdges);
  const pendingLocalPositionUntilConvexMatchesRef =
    props.pendingLocalPositionUntilConvexMatchesRef ?? {
      current: new Map<string, { x: number; y: number }>(),
    };
  const preferLocalPositionNodeIdsRef = props.preferLocalPositionNodeIdsRef ?? {
    current: new Set<string>(),
  };
  const pendingMoveAfterCreateRef = props.pendingMoveAfterCreateRef ?? {
    current: new Map<string, { positionX: number; positionY: number }>(),
  };
  const resolvedRealIdByClientRequestRef =
    props.resolvedRealIdByClientRequestRef ?? {
      current: new Map<string, Id<"nodes">>(),
    };
  const pendingEdgeSplitByClientRequestRef =
    props.pendingEdgeSplitByClientRequestRef ?? {
      current: new Map<string, PendingEdgeSplitState>(),
    };
  const isDraggingRef = props.isDraggingRef ?? { current: false };
  const isResizingRef = props.isResizingRef ?? { current: false };
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const runResizeNodeMutation = props.runResizeNodeMutation ?? vi.fn(() => Promise.resolve());
  const runMoveNodeMutation = props.runMoveNodeMutation ?? vi.fn(() => Promise.resolve());
  const runBatchMoveNodesMutation =
    props.runBatchMoveNodesMutation ?? vi.fn(() => Promise.resolve());
  const runSplitEdgeAtExistingNodeMutation =
    props.runSplitEdgeAtExistingNodeMutation ?? vi.fn(() => Promise.resolve());
  const syncPendingMoveForClientRequest =
    props.syncPendingMoveForClientRequest ?? vi.fn(() => Promise.resolve());

  const interactions = useCanvasNodeInteractions({
    canvasId: asCanvasId("canvas-1"),
    edges,
    setNodes,
    setEdges,
    refs: {
      isDragging: isDraggingRef,
      isResizing: isResizingRef,
      pendingLocalPositionUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
      pendingMoveAfterCreateRef,
      resolvedRealIdByClientRequestRef,
      pendingEdgeSplitByClientRequestRef,
    },
    runResizeNodeMutation,
    runMoveNodeMutation,
    runBatchMoveNodesMutation,
    runSplitEdgeAtExistingNodeMutation,
    syncPendingMoveForClientRequest,
  });

  useEffect(() => {
    latestHarnessRef.current = {
      nodes,
      edges,
      onNodesChange: interactions.onNodesChange,
      onNodeDragStart: interactions.onNodeDragStart,
      onNodeDrag: interactions.onNodeDrag,
      onNodeDragStop: interactions.onNodeDragStop,
      clearHighlightedIntersectionEdge: interactions.clearHighlightedIntersectionEdge,
    };
  }, [edges, interactions, nodes]);

  return null;
}

describe("useCanvasNodeInteractions", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    latestHarnessRef.current = null;
    getNodeCenterClientPositionMock.mockReset();
    getIntersectedEdgeIdMock.mockReset();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("queues resize persistence on completed dimension changes", async () => {
    const isResizingRef = { current: false };
    const pendingLocalPositionUntilConvexMatchesRef = {
      current: new Map([["node-1", { x: 10, y: 20 }]]),
    };
    const preferLocalPositionNodeIdsRef = { current: new Set<string>() };
    const runResizeNodeMutation = vi.fn(() => Promise.resolve());

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          initialNodes: [
            {
              id: "node-1",
              type: "text",
              position: { x: 0, y: 0 },
              style: { width: 240, height: 100 },
              data: {},
            },
          ],
          initialEdges: [],
          isResizingRef,
          pendingLocalPositionUntilConvexMatchesRef,
          preferLocalPositionNodeIdsRef,
          runResizeNodeMutation,
        }),
      );
    });

    await act(async () => {
      latestHarnessRef.current?.onNodesChange([
        {
          id: "node-1",
          type: "position",
          position: { x: 40, y: 50 },
          dragging: false,
        },
        {
          id: "node-1",
          type: "dimensions",
          dimensions: { width: 320, height: 180 },
          resizing: false,
          setAttributes: true,
        },
      ]);
      await Promise.resolve();
    });

    expect(isResizingRef.current).toBe(false);
    expect(pendingLocalPositionUntilConvexMatchesRef.current.has("node-1")).toBe(false);
    expect(preferLocalPositionNodeIdsRef.current.has("node-1")).toBe(true);
    expect(runResizeNodeMutation).toHaveBeenCalledWith({
      nodeId: "node-1",
      width: 320,
      height: 180,
    });
  });

  it("highlights intersected edges during drag and restores styles when cleared", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          initialNodes: [
            {
              id: "node-1",
              type: "image",
              position: { x: 100, y: 100 },
              data: {},
            },
          ],
          initialEdges: [
            {
              id: "edge-1",
              source: "source-1",
              target: "target-1",
              style: { stroke: "#123456" },
            },
          ],
        }),
      );
    });

    getNodeCenterClientPositionMock.mockReturnValue({ x: 200, y: 200 });
    getIntersectedEdgeIdMock.mockReturnValue("edge-1");

    await act(async () => {
      latestHarnessRef.current?.onNodeDrag(
        new MouseEvent("mousemove") as unknown as React.MouseEvent,
        latestHarnessRef.current?.nodes[0] as RFNode,
      );
    });

    expect(latestHarnessRef.current?.edges[0]?.style).toMatchObject({
      stroke: "var(--xy-edge-stroke)",
      strokeWidth: 2,
    });

    await act(async () => {
      latestHarnessRef.current?.clearHighlightedIntersectionEdge();
    });

    expect(latestHarnessRef.current?.edges[0]?.style).toEqual({ stroke: "#123456" });
  });

  it("splits the intersected edge when a draggable node is dropped onto it", async () => {
    const isDraggingRef = { current: false };
    const runSplitEdgeAtExistingNodeMutation = vi.fn(() => Promise.resolve());
    const runMoveNodeMutation = vi.fn(() => Promise.resolve());

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          initialNodes: [
            {
              id: "node-middle",
              type: "image",
              position: { x: 280, y: 160 },
              data: {},
            },
          ],
          initialEdges: [
            {
              id: "edge-1",
              source: "node-a",
              target: "node-b",
            },
          ],
          isDraggingRef,
          runSplitEdgeAtExistingNodeMutation,
          runMoveNodeMutation,
        }),
      );
    });

    getNodeCenterClientPositionMock.mockReturnValue({ x: 200, y: 200 });
    getIntersectedEdgeIdMock.mockReturnValue("edge-1");

    await act(async () => {
      latestHarnessRef.current?.onNodeDragStart(
        new MouseEvent("mousedown") as unknown as React.MouseEvent,
        latestHarnessRef.current?.nodes[0] as RFNode,
        latestHarnessRef.current?.nodes ?? [],
      );
      latestHarnessRef.current?.onNodeDrag(
        new MouseEvent("mousemove") as unknown as React.MouseEvent,
        latestHarnessRef.current?.nodes[0] as RFNode,
      );
      latestHarnessRef.current?.onNodeDragStop(
        new MouseEvent("mouseup") as unknown as React.MouseEvent,
        latestHarnessRef.current?.nodes[0] as RFNode,
        latestHarnessRef.current?.nodes ?? [],
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runSplitEdgeAtExistingNodeMutation).toHaveBeenCalledWith({
      canvasId: asCanvasId("canvas-1"),
      splitEdgeId: asEdgeId("edge-1"),
      middleNodeId: "node-middle",
      splitSourceHandle: undefined,
      splitTargetHandle: undefined,
      newNodeSourceHandle: undefined,
      newNodeTargetHandle: undefined,
      positionX: 280,
      positionY: 160,
    });
    expect(runMoveNodeMutation).not.toHaveBeenCalled();
    expect(isDraggingRef.current).toBe(false);
  });
});
