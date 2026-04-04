// @vitest-environment jsdom

import React, { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  resolveDroppedConnectionTarget: vi.fn(),
}));

vi.mock("@/components/canvas/canvas-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/canvas/canvas-helpers")
  >("@/components/canvas/canvas-helpers");

  return {
    ...actual,
    resolveDroppedConnectionTarget: mocks.resolveDroppedConnectionTarget,
  };
});

vi.mock("@/components/canvas/canvas-reconnect", () => ({
  useCanvasReconnectHandlers: () => ({
    onReconnectStart: vi.fn(),
    onReconnect: vi.fn(),
    onReconnectEnd: vi.fn(),
  }),
}));

import { useCanvasConnections } from "@/components/canvas/use-canvas-connections";
import type { DroppedConnectionTarget } from "@/components/canvas/canvas-helpers";

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasConnections> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookHarnessProps = {
  helperResult: DroppedConnectionTarget | null;
  runCreateEdgeMutation?: ReturnType<typeof vi.fn>;
  showConnectionRejectedToast?: ReturnType<typeof vi.fn>;
};

function HookHarness({
  helperResult,
  runCreateEdgeMutation = vi.fn(async () => undefined),
  showConnectionRejectedToast = vi.fn(),
}: HookHarnessProps) {
  const [nodes] = useState<RFNode[]>([
    { id: "node-source", type: "image", position: { x: 0, y: 0 }, data: {} },
    { id: "node-target", type: "text", position: { x: 300, y: 200 }, data: {} },
  ]);
  const [edges] = useState<RFEdge[]>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const edgeReconnectSuccessful = useRef(true);
  const isReconnectDragActiveRef = useRef(false);
  const pendingConnectionCreatesRef = useRef(new Set<string>());
  const resolvedRealIdByClientRequestRef = useRef(new Map<string, Id<"nodes">>());
  const setEdges = vi.fn();
  const setEdgeSyncNonce = vi.fn();

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    mocks.resolveDroppedConnectionTarget.mockReturnValue(helperResult);
  }, [helperResult]);

  const handlers = useCanvasConnections({
    canvasId: asCanvasId("canvas-1"),
    nodes,
    edges,
    nodesRef,
    edgesRef,
    edgeReconnectSuccessful,
    isReconnectDragActiveRef,
    pendingConnectionCreatesRef,
    resolvedRealIdByClientRequestRef,
    setEdges,
    setEdgeSyncNonce,
    screenToFlowPosition: (position) => position,
    syncPendingMoveForClientRequest: vi.fn(async () => undefined),
    runCreateEdgeMutation,
    runRemoveEdgeMutation: vi.fn(async () => undefined),
    runCreateNodeWithEdgeFromSourceOnlineOnly: vi.fn(async () => "node-1"),
    runCreateNodeWithEdgeToTargetOnlineOnly: vi.fn(async () => "node-1"),
    showConnectionRejectedToast,
  });

  useEffect(() => {
    latestHandlersRef.current = handlers;
  }, [handlers]);

  return null;
}

describe("useCanvasConnections", () => {
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

  it("creates an edge when a body drop lands on another node", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={{
            sourceNodeId: "node-source",
            targetNodeId: "node-target",
            sourceHandle: undefined,
            targetHandle: undefined,
          }}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 400, clientY: 260 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "image" },
          fromHandle: { id: null, type: "source" },
          fromPosition: null,
          to: { x: 400, y: 260 },
          toHandle: null,
          toNode: null,
          toPosition: null,
          pointer: null,
        } as never,
      );
    });

    expect(runCreateEdgeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "node-source",
      targetNodeId: "node-target",
      sourceHandle: undefined,
      targetHandle: undefined,
    });
    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
    expect(latestHandlersRef.current?.connectionDropMenu).toBeNull();
  });

  it("opens the node picker when the drop lands on the background", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runCreateEdgeMutation={runCreateEdgeMutation}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 123, clientY: 456 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "image" },
          fromHandle: { id: null, type: "source" },
          fromPosition: null,
          to: { x: 123, y: 456 },
          toHandle: null,
          toNode: null,
          toPosition: null,
          pointer: null,
        } as never,
      );
    });

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(latestHandlersRef.current?.connectionDropMenu).toEqual(
      expect.objectContaining({
        screenX: 123,
        screenY: 456,
        flowX: 123,
        flowY: 456,
      }),
    );
  });

  it("rejects an invalid body drop without opening the menu", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={{
            sourceNodeId: "node-source",
            targetNodeId: "node-source",
            sourceHandle: undefined,
            targetHandle: undefined,
          }}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 300, clientY: 210 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "image" },
          fromHandle: { id: null, type: "source" },
          fromPosition: null,
          to: { x: 300, y: 210 },
          toHandle: null,
          toNode: null,
          toPosition: null,
          pointer: null,
        } as never,
      );
    });

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("self-loop");
    expect(latestHandlersRef.current?.connectionDropMenu).toBeNull();
  });

  it("reverses the edge direction when the drag starts from a target handle", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={{
            sourceNodeId: "node-target",
            targetNodeId: "node-source",
            sourceHandle: undefined,
            targetHandle: "target-handle",
          }}
          runCreateEdgeMutation={runCreateEdgeMutation}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 200, clientY: 200 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "image" },
          fromHandle: { id: "target-handle", type: "target" },
          fromPosition: null,
          to: { x: 200, y: 200 },
          toHandle: null,
          toNode: null,
          toPosition: null,
          pointer: null,
        } as never,
      );
    });

    expect(runCreateEdgeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "node-target",
      targetNodeId: "node-source",
      sourceHandle: undefined,
      targetHandle: "target-handle",
    });
  });
});
