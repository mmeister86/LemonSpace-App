// @vitest-environment jsdom

import React, { act, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useCanvasFlowReconciliation } from "@/components/canvas/use-canvas-flow-reconciliation";

vi.mock("@/components/canvas/canvas-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/components/canvas/canvas-helpers")>(
    "@/components/canvas/canvas-helpers",
  );

  return {
    ...actual,
    getPendingMovePinsFromLocalOps: vi.fn(() => new Map()),
    getPendingRemovedEdgeIdsFromLocalOps: vi.fn(() => new Set()),
  };
});

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;
const asNodeId = (id: string): Id<"nodes"> => id as Id<"nodes">;

type HarnessProps = {
  initialNodes: RFNode[];
  initialEdges: RFEdge[];
  convexNodes?: Doc<"nodes">[];
  convexEdges?: Doc<"edges">[];
  storageUrlsById?: Record<string, string | undefined>;
  themeMode: "light" | "dark";
  pendingRemovedEdgeIds?: Set<string>;
  pendingMovePins?: Map<string, { x: number; y: number }>;
  isDragging: boolean;
  isResizing: boolean;
  resolvedRealIdByClientRequest: Map<string, Id<"nodes">>;
  pendingConnectionCreateIds: Set<string>;
  previousConvexNodeIdsSnapshot: Set<string>;
  pendingLocalPositionPins?: Map<string, { x: number; y: number }>;
  pendingLocalNodeDataPins?: Map<string, unknown>;
  pendingLocalNodeSizePins?: Map<string, { width: number; height: number }>;
  pendingLocalNodeParentPins?: Map<string, { parentId?: string; x: number; y: number }>;
  preferLocalPositionNodeIds?: Set<string>;
  isResizingRefOverride?: { current: boolean };
};

const latestStateRef: {
  current: {
    nodes: RFNode[];
    edges: RFEdge[];
    resolvedRealIdByClientRequest: Map<string, Id<"nodes">>;
    pendingConnectionCreateIds: Set<string>;
    previousConvexNodeIdsSnapshot: Set<string>;
  } | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness(props: HarnessProps) {
  const [nodes, setNodes] = useState<RFNode[]>(props.initialNodes);
  const [edges, setEdges] = useState<RFEdge[]>(props.initialEdges);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const deletingNodeIds = useRef(new Set<string>());
  const convexNodeIdsSnapshotForEdgeCarryRef = useRef(
    props.previousConvexNodeIdsSnapshot,
  );
  const resolvedRealIdByClientRequestRef = useRef(
    props.resolvedRealIdByClientRequest,
  );
  const pendingConnectionCreatesRef = useRef(props.pendingConnectionCreateIds);
  const pendingRemovedEdgeIds = useMemo(
    () => props.pendingRemovedEdgeIds ?? new Set<string>(),
    [props.pendingRemovedEdgeIds],
  );
  const pendingMovePins = useMemo(
    () => props.pendingMovePins ?? new Map<string, { x: number; y: number }>(),
    [props.pendingMovePins],
  );
  const pendingLocalPositionUntilConvexMatchesRef = useRef(
    props.pendingLocalPositionPins ?? new Map<string, { x: number; y: number }>(),
  );
  const pendingLocalNodeDataUntilConvexMatchesRef = useRef(
    props.pendingLocalNodeDataPins ?? new Map<string, unknown>(),
  );
  const pendingLocalNodeSizeUntilConvexMatchesRef = useRef(
    props.pendingLocalNodeSizePins ?? new Map<string, { width: number; height: number }>(),
  );
  const pendingLocalNodeParentUntilConvexMatchesRef = useRef(
    props.pendingLocalNodeParentPins ??
      new Map<string, { parentId?: string; x: number; y: number }>(),
  );
  const preferLocalPositionNodeIdsRef = useRef(
    props.preferLocalPositionNodeIds ?? new Set<string>(),
  );
  const isDraggingRef = useRef(props.isDragging);
  const internalIsResizingRef = useRef(props.isResizing);
  const isResizingRef = props.isResizingRefOverride ?? internalIsResizingRef;

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    isDraggingRef.current = props.isDragging;
    internalIsResizingRef.current = props.isResizing;
  }, [props.isDragging, props.isResizing, internalIsResizingRef]);

  useCanvasFlowReconciliation({
    convexNodes: props.convexNodes,
    convexEdges: props.convexEdges,
    storageUrlsById: props.storageUrlsById,
    themeMode: props.themeMode,
    pendingRemovedEdgeIds,
    pendingMovePins,
    setNodes,
    setEdges,
    refs: {
      nodesRef,
      edgesRef,
      deletingNodeIds,
      convexNodeIdsSnapshotForEdgeCarryRef,
      resolvedRealIdByClientRequestRef,
      pendingConnectionCreatesRef,
      pendingLocalPositionUntilConvexMatchesRef,
      pendingLocalNodeDataUntilConvexMatchesRef,
      pendingLocalNodeSizeUntilConvexMatchesRef,
      pendingLocalNodeParentUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
      isDragging: isDraggingRef,
      isResizing: isResizingRef,
    },
  });

  useEffect(() => {
    latestStateRef.current = {
      nodes,
      edges,
      resolvedRealIdByClientRequest: resolvedRealIdByClientRequestRef.current,
      pendingConnectionCreateIds: pendingConnectionCreatesRef.current,
      previousConvexNodeIdsSnapshot: convexNodeIdsSnapshotForEdgeCarryRef.current,
    };
  }, [edges, nodes]);

  return null;
}

describe("useCanvasFlowReconciliation", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    latestStateRef.current = null;
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("carries an optimistic connection edge until convex publishes the real edge", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          initialNodes: [
            {
              id: "node-source",
              type: "image",
              position: { x: 0, y: 0 },
              data: {},
            },
            {
              id: "optimistic_req-1",
              type: "prompt",
              position: { x: 120, y: 80 },
              data: {},
            },
          ],
          initialEdges: [
            {
              id: "optimistic_edge_req-1",
              source: "node-source",
              target: "optimistic_req-1",
            },
          ],
          convexNodes: [
            {
              _id: asNodeId("node-source"),
              _creationTime: 0,
              canvasId: asCanvasId("canvas-1"),
              type: "image",
              positionX: 0,
              positionY: 0,
              width: 280,
              height: 200,
              data: {},
            } as Doc<"nodes">,
            {
              _id: asNodeId("node-real"),
              _creationTime: 1,
              canvasId: asCanvasId("canvas-1"),
              type: "prompt",
              positionX: 120,
              positionY: 80,
              width: 288,
              height: 220,
              data: {},
            } as Doc<"nodes">,
          ],
          convexEdges: [],
          storageUrlsById: {},
          themeMode: "light",
          isDragging: false,
          isResizing: false,
          resolvedRealIdByClientRequest: new Map<string, Id<"nodes">>(),
          pendingConnectionCreateIds: new Set(["req-1"]),
          previousConvexNodeIdsSnapshot: new Set(["node-source"]),
        }),
      );
    });

    expect(latestStateRef.current?.edges).toEqual([
      {
        id: "optimistic_edge_req-1",
        source: "node-source",
        target: "node-real",
        targetHandle: "image-in",
      },
    ]);
    expect(latestStateRef.current?.resolvedRealIdByClientRequest).toEqual(
      new Map([["req-1", asNodeId("node-real")]]),
    );
    expect(latestStateRef.current?.pendingConnectionCreateIds).toEqual(
      new Set(["req-1"]),
    );
    expect(latestStateRef.current?.previousConvexNodeIdsSnapshot).toEqual(
      new Set(["node-source", "node-real"]),
    );
  });

  it("preserves local dragging nodes instead of swapping in convex nodes mid-drag", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          initialNodes: [
            {
              id: "optimistic_req-drag",
              type: "image",
              position: { x: 320, y: 180 },
              data: { label: "local" },
              dragging: true,
            },
          ],
          initialEdges: [],
          convexNodes: [
            {
              _id: asNodeId("node-real"),
              _creationTime: 1,
              canvasId: asCanvasId("canvas-1"),
              type: "image",
              positionX: 20,
              positionY: 40,
              width: 280,
              height: 200,
              data: { label: "server" },
            } as Doc<"nodes">,
          ],
          convexEdges: [] as Doc<"edges">[],
          storageUrlsById: {},
          themeMode: "light",
          isDragging: false,
          isResizing: false,
          resolvedRealIdByClientRequest: new Map([
            ["req-drag", asNodeId("node-real")],
          ]),
          pendingConnectionCreateIds: new Set<string>(),
          previousConvexNodeIdsSnapshot: new Set(["node-real"]),
        }),
      );
    });

    expect(latestStateRef.current?.nodes).toEqual([
      {
        id: "optimistic_req-drag",
        type: "image",
        position: { x: 320, y: 180 },
        data: { label: "local" },
        dragging: true,
      },
    ]);
  });

  it("keeps local nodes unchanged while resize-lock is active", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const sharedIsResizingRef = { current: false };

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          initialNodes: [
            {
              id: "node-1",
              type: "image",
              position: { x: 320, y: 180 },
              width: 640,
              height: 360,
              data: { label: "local" },
            },
          ],
          initialEdges: [],
          convexNodes: [
            {
              _id: asNodeId("node-1"),
              _creationTime: 1,
              canvasId: asCanvasId("canvas-1"),
              type: "image",
              positionX: 320,
              positionY: 180,
              width: 640,
              height: 360,
              data: { label: "local" },
            } as Doc<"nodes">,
          ],
          convexEdges: [] as Doc<"edges">[],
          storageUrlsById: {},
          themeMode: "light",
          isDragging: false,
          isResizing: false,
          isResizingRefOverride: sharedIsResizingRef,
          resolvedRealIdByClientRequest: new Map<string, Id<"nodes">>(),
          pendingConnectionCreateIds: new Set<string>(),
          previousConvexNodeIdsSnapshot: new Set(["node-1"]),
        }),
      );
    });

    const nodesBeforeResize = latestStateRef.current?.nodes;

    sharedIsResizingRef.current = true;

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          initialNodes: [
            {
              id: "node-1",
              type: "image",
              position: { x: 320, y: 180 },
              width: 640,
              height: 360,
              data: { label: "local" },
            },
          ],
          initialEdges: [],
          convexNodes: [
            {
              _id: asNodeId("node-1"),
              _creationTime: 1,
              canvasId: asCanvasId("canvas-1"),
              type: "image",
              positionX: 20,
              positionY: 40,
              width: 280,
              height: 200,
              data: { label: "server" },
            } as Doc<"nodes">,
          ],
          convexEdges: [] as Doc<"edges">[],
          storageUrlsById: {},
          themeMode: "light",
          isDragging: false,
          isResizing: true,
          isResizingRefOverride: sharedIsResizingRef,
          resolvedRealIdByClientRequest: new Map<string, Id<"nodes">>(),
          pendingConnectionCreateIds: new Set<string>(),
          previousConvexNodeIdsSnapshot: new Set(["node-1"]),
        }),
      );
    });

    expect(latestStateRef.current?.nodes).toBe(nodesBeforeResize);
    expect(latestStateRef.current?.nodes[0]).toMatchObject({
      id: "node-1",
      type: "image",
      position: { x: 320, y: 180 },
      width: 640,
      height: 360,
      data: { label: "local" },
    });
  });
});
