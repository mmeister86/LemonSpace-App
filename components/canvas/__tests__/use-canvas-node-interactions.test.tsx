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
  runResizeNodeMutation: ReturnType<typeof vi.fn>;
  runSplitEdgeAtExistingNodeMutation: ReturnType<typeof vi.fn>;
  onInvalidConnection: ReturnType<typeof vi.fn<(reason: CanvasConnectionValidationReason) => void>>;
  syncPendingMoveForClientRequest: ReturnType<typeof vi.fn>;
  resolvedRealIdEntries?: Array<[string, Id<"nodes">]>;
};

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasNodeInteractions> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness(props: HarnessProps) {
  const [, setNodes] = useState<RFNode[]>(props.nodes);
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
    nodes: props.nodes,
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
    runSplitEdgeAtExistingNodeMutation: props.runSplitEdgeAtExistingNodeMutation,
    onInvalidConnection: props.onInvalidConnection,
    syncPendingMoveForClientRequest: props.syncPendingMoveForClientRequest,
  });

  useEffect(() => {
    latestHandlersRef.current = handlers;
  }, [handlers]);

  return null;
}

describe("useCanvasNodeInteractions", () => {
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
