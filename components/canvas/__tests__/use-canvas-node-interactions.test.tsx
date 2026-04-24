// @vitest-environment jsdom

import React, { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasNodeInteractions } from "@/components/canvas/use-canvas-node-interactions";
import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";

vi.mock("@/components/canvas/canvas-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/canvas/canvas-helpers")
  >("@/components/canvas/canvas-helpers");

  return {
    ...actual,
    getNodeCenterClientPosition: vi.fn(() => ({ x: 240, y: 140 })),
    getIntersectedEdgeId: vi.fn(() => "edge-image-curves"),
  };
});

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

type HarnessProps = {
  nodes: RFNode[];
  edges: RFEdge[];
  runMoveNodeMutation: ReturnType<typeof vi.fn>;
  runBatchMoveNodesMutation: ReturnType<typeof vi.fn>;
  runSetNodeParentMutation?: ReturnType<typeof vi.fn>;
  runResizeNodeMutation: ReturnType<typeof vi.fn>;
  runSplitEdgeAtExistingNodeMutation: ReturnType<typeof vi.fn>;
  onInvalidConnection: ReturnType<typeof vi.fn<(reason: CanvasConnectionValidationReason) => void>>;
  syncPendingMoveForClientRequest: ReturnType<typeof vi.fn>;
  resolvedRealIdEntries?: Array<[string, Id<"nodes">]>;
};

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasNodeInteractions> | null;
} = { current: null };
const latestNodesRef: { current: RFNode[] } = { current: [] };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness(props: HarnessProps) {
  const [nodes, setNodes] = useState<RFNode[]>(props.nodes);
  const [edges, setEdges] = useState<RFEdge[]>(props.edges);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const pendingLocalPositionUntilConvexMatchesRef = useRef(new Map());
  const preferLocalPositionNodeIdsRef = useRef(new Set<string>());
  const pendingMoveAfterCreateRef = useRef(new Map());
  const resolvedRealIdByClientRequestRef = useRef(
    new Map(props.resolvedRealIdEntries ?? []),
  );
  const pendingEdgeSplitByClientRequestRef = useRef(new Map());

  const handlers = useCanvasNodeInteractions({
    canvasId: asCanvasId("canvas-1"),
    nodes,
    edges,
    setNodes,
    setEdges,
    refs: {
      isDragging,
      isResizing,
      pendingLocalPositionUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
      pendingMoveAfterCreateRef,
      resolvedRealIdByClientRequestRef,
      pendingEdgeSplitByClientRequestRef,
    },
    runResizeNodeMutation: props.runResizeNodeMutation,
    runMoveNodeMutation: props.runMoveNodeMutation,
    runBatchMoveNodesMutation: props.runBatchMoveNodesMutation,
    runSetNodeParentMutation: props.runSetNodeParentMutation ?? vi.fn(async () => undefined),
    runSplitEdgeAtExistingNodeMutation: props.runSplitEdgeAtExistingNodeMutation,
    onInvalidConnection: props.onInvalidConnection,
    syncPendingMoveForClientRequest: props.syncPendingMoveForClientRequest,
  });

  useEffect(() => {
    latestHandlersRef.current = handlers;
    latestNodesRef.current = nodes;
  }, [handlers, nodes]);

  return null;
}

describe("useCanvasNodeInteractions", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    latestHandlersRef.current = null;
    latestNodesRef.current = [];
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

  it("groups a node on partial overlap with a group node", async () => {
    const runMoveNodeMutation = vi.fn(async () => undefined);
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const runSetNodeParentMutation = vi.fn(async () => undefined);
    const runResizeNodeMutation = vi.fn(async () => undefined);
    const runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined);
    const onInvalidConnection = vi.fn<(reason: CanvasConnectionValidationReason) => void>();
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const draggedNode: RFNode = {
      id: "node-image",
      type: "image",
      position: { x: 80, y: 80 },
      style: { width: 100, height: 100 },
      data: {},
    };

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            {
              id: "node-group",
              type: "group",
              position: { x: 100, y: 100 },
              style: { width: 200, height: 200 },
              data: {},
            },
            draggedNode,
          ]}
          edges={[]}
          runMoveNodeMutation={runMoveNodeMutation}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          runSetNodeParentMutation={runSetNodeParentMutation}
          runResizeNodeMutation={runResizeNodeMutation}
          runSplitEdgeAtExistingNodeMutation={runSplitEdgeAtExistingNodeMutation}
          onInvalidConnection={onInvalidConnection}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodeDrag({} as React.MouseEvent, draggedNode);
      latestHandlersRef.current?.onNodeDragStop(
        {} as React.MouseEvent,
        draggedNode,
        [draggedNode],
      );
    });

    expect(runSetNodeParentMutation).toHaveBeenCalledWith({
      nodeId: "node-image",
      parentId: "node-group",
      positionX: -20,
      positionY: -20,
    });
    expect(runMoveNodeMutation).not.toHaveBeenCalled();
    expect(latestNodesRef.current.find((node) => node.id === "node-image")).toMatchObject({
      parentId: "node-group",
      position: { x: -20, y: -20 },
    });
  });

  it("ungroups a child node when it is dragged outside its group", async () => {
    const runMoveNodeMutation = vi.fn(async () => undefined);
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const runSetNodeParentMutation = vi.fn(async () => undefined);
    const runResizeNodeMutation = vi.fn(async () => undefined);
    const runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined);
    const onInvalidConnection = vi.fn<(reason: CanvasConnectionValidationReason) => void>();
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const draggedNode: RFNode = {
      id: "node-image",
      type: "image",
      parentId: "node-group",
      position: { x: 260, y: 260 },
      style: { width: 80, height: 80 },
      data: {},
    };

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            {
              id: "node-group",
              type: "group",
              position: { x: 100, y: 100 },
              style: { width: 200, height: 200 },
              data: {},
            },
            draggedNode,
          ]}
          edges={[]}
          runMoveNodeMutation={runMoveNodeMutation}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          runSetNodeParentMutation={runSetNodeParentMutation}
          runResizeNodeMutation={runResizeNodeMutation}
          runSplitEdgeAtExistingNodeMutation={runSplitEdgeAtExistingNodeMutation}
          onInvalidConnection={onInvalidConnection}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodeDragStop(
        {} as React.MouseEvent,
        draggedNode,
        [draggedNode],
      );
    });

    expect(runSetNodeParentMutation).toHaveBeenCalledWith({
      nodeId: "node-image",
      parentId: undefined,
      positionX: 360,
      positionY: 360,
    });
    expect(runMoveNodeMutation).not.toHaveBeenCalled();
    expect(latestNodesRef.current.find((node) => node.id === "node-image")).toMatchObject({
      parentId: undefined,
      position: { x: 360, y: 360 },
    });
  });

  it("marks a group as an active drop target while a node overlaps it", async () => {
    const runMoveNodeMutation = vi.fn(async () => undefined);
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const runSetNodeParentMutation = vi.fn(async () => undefined);
    const runResizeNodeMutation = vi.fn(async () => undefined);
    const runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined);
    const onInvalidConnection = vi.fn<(reason: CanvasConnectionValidationReason) => void>();
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const draggedNode: RFNode = {
      id: "node-image",
      type: "image",
      position: { x: 120, y: 120 },
      style: { width: 80, height: 80 },
      data: {},
    };

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            {
              id: "node-group",
              type: "group",
              position: { x: 100, y: 100 },
              style: { width: 200, height: 200 },
              data: {},
            },
            draggedNode,
          ]}
          edges={[]}
          runMoveNodeMutation={runMoveNodeMutation}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          runSetNodeParentMutation={runSetNodeParentMutation}
          runResizeNodeMutation={runResizeNodeMutation}
          runSplitEdgeAtExistingNodeMutation={runSplitEdgeAtExistingNodeMutation}
          onInvalidConnection={onInvalidConnection}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodeDrag({} as React.MouseEvent, draggedNode);
    });

    expect(latestNodesRef.current.find((node) => node.id === "node-group")?.data).toMatchObject({
      _groupDropTarget: true,
    });
  });

  it("does not call splitEdgeAtExistingNode for an invalid drag-split", async () => {
    const runMoveNodeMutation = vi.fn(async () => undefined);
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const runResizeNodeMutation = vi.fn(async () => undefined);
    const runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined);
    const onInvalidConnection = vi.fn<(reason: CanvasConnectionValidationReason) => void>();
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const draggedNode: RFNode = {
      id: "node-video",
      type: "video",
      position: { x: 320, y: 180 },
      data: {},
    };

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-curves", type: "curves", position: { x: 400, y: 120 }, data: {} },
            draggedNode,
          ]}
          edges={[
            {
              id: "edge-image-curves",
              source: "node-image",
              target: "node-curves",
            },
          ]}
          runMoveNodeMutation={runMoveNodeMutation}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          runResizeNodeMutation={runResizeNodeMutation}
          runSplitEdgeAtExistingNodeMutation={runSplitEdgeAtExistingNodeMutation}
          onInvalidConnection={onInvalidConnection}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodeDrag({} as React.MouseEvent, draggedNode);
      latestHandlersRef.current?.onNodeDragStop(
        {} as React.MouseEvent,
        draggedNode,
        [draggedNode],
      );
    });

    expect(runSplitEdgeAtExistingNodeMutation).not.toHaveBeenCalled();
    expect(onInvalidConnection).toHaveBeenCalledWith("adjustment-source-invalid");
    expect(runMoveNodeMutation).toHaveBeenCalledWith({
      nodeId: "node-video",
      positionX: 320,
      positionY: 180,
    });
  });

  it("does not split an edge that already touches a resolved optimistic node", async () => {
    const runMoveNodeMutation = vi.fn(async () => undefined);
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const runResizeNodeMutation = vi.fn(async () => undefined);
    const runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined);
    const onInvalidConnection = vi.fn<(reason: CanvasConnectionValidationReason) => void>();
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const draggedNode: RFNode = {
      id: "optimistic_req-1",
      type: "image",
      position: { x: 320, y: 180 },
      data: {},
    };

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            draggedNode,
            { id: "node-real", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-text", type: "text", position: { x: 400, y: 120 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-image-curves",
              source: "node-real",
              target: "node-text",
            },
          ]}
          runMoveNodeMutation={runMoveNodeMutation}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          runResizeNodeMutation={runResizeNodeMutation}
          runSplitEdgeAtExistingNodeMutation={runSplitEdgeAtExistingNodeMutation}
          onInvalidConnection={onInvalidConnection}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
          resolvedRealIdEntries={[["req-1", "node-real" as Id<"nodes">]]}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodeDrag({} as React.MouseEvent, draggedNode);
      latestHandlersRef.current?.onNodeDragStop(
        {} as React.MouseEvent,
        draggedNode,
        [draggedNode],
      );
    });

    expect(runSplitEdgeAtExistingNodeMutation).not.toHaveBeenCalled();
    expect(onInvalidConnection).not.toHaveBeenCalled();
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith("req-1");
    expect(runMoveNodeMutation).not.toHaveBeenCalled();
  });

  it("still splits a valid edge with the resolved optimistic node id", async () => {
    const runMoveNodeMutation = vi.fn(async () => undefined);
    const runBatchMoveNodesMutation = vi.fn(async () => undefined);
    const runResizeNodeMutation = vi.fn(async () => undefined);
    const runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined);
    const onInvalidConnection = vi.fn<(reason: CanvasConnectionValidationReason) => void>();
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const draggedNode: RFNode = {
      id: "optimistic_req-2",
      type: "video",
      position: { x: 320, y: 180 },
      data: {},
    };

    await act(async () => {
      root?.render(
        <HookHarness
          nodes={[
            draggedNode,
            { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-text", type: "text", position: { x: 400, y: 120 }, data: {} },
            { id: "node-real-middle", type: "video", position: { x: 320, y: 180 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-image-curves",
              source: "node-image",
              target: "node-text",
            },
          ]}
          runMoveNodeMutation={runMoveNodeMutation}
          runBatchMoveNodesMutation={runBatchMoveNodesMutation}
          runResizeNodeMutation={runResizeNodeMutation}
          runSplitEdgeAtExistingNodeMutation={runSplitEdgeAtExistingNodeMutation}
          onInvalidConnection={onInvalidConnection}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
          resolvedRealIdEntries={[["req-2", "node-real-middle" as Id<"nodes">]]}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodeDrag({} as React.MouseEvent, draggedNode);
      latestHandlersRef.current?.onNodeDragStop(
        {} as React.MouseEvent,
        draggedNode,
        [draggedNode],
      );
    });

    expect(runSplitEdgeAtExistingNodeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      splitEdgeId: "edge-image-curves",
      middleNodeId: "node-real-middle",
      splitSourceHandle: undefined,
      splitTargetHandle: undefined,
      newNodeSourceHandle: undefined,
      newNodeTargetHandle: undefined,
      positionX: 320,
      positionY: 180,
    });
    expect(onInvalidConnection).not.toHaveBeenCalled();
  });
});
