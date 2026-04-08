// @vitest-environment jsdom

import { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  enqueueCanvasSyncOp: vi.fn(async () => ({ replacedIds: [] as string[] })),
  countCanvasSyncOps: vi.fn(async () => 0),
  listCanvasSyncOps: vi.fn(async () => []),
  mutationMocks: new Map<unknown, ReturnType<typeof vi.fn>>(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    nodes: {
      move: "nodes.move",
      resize: "nodes.resize",
      updateData: "nodes.updateData",
      create: "nodes.create",
      createWithEdgeFromSource: "nodes.createWithEdgeFromSource",
      createWithEdgeToTarget: "nodes.createWithEdgeToTarget",
      createWithEdgeSplit: "nodes.createWithEdgeSplit",
      batchRemove: "nodes.batchRemove",
      splitEdgeAtExistingNode: "nodes.splitEdgeAtExistingNode",
    },
    edges: {
      create: "edges.create",
      remove: "edges.remove",
    },
    canvasGraph: {
      get: "canvasGraph.get",
    },
  },
}));

vi.mock("convex/react", () => ({
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
  useMutation: (key: unknown) => {
    let mutation = mocks.mutationMocks.get(key);
    if (!mutation) {
      mutation = vi.fn(async () => undefined);
      Object.assign(mutation, {
        withOptimisticUpdate: () => mutation,
      });
      mocks.mutationMocks.set(key, mutation);
    }
    return mutation;
  },
}));

vi.mock("@/lib/canvas-op-queue", () => ({
  ackCanvasSyncOp: vi.fn(async () => undefined),
  countCanvasSyncOps: mocks.countCanvasSyncOps,
  dropCanvasSyncOpsByClientRequestIds: vi.fn(async () => []),
  dropCanvasSyncOpsByEdgeIds: vi.fn(async () => []),
  dropCanvasSyncOpsByNodeIds: vi.fn(async () => []),
  dropExpiredCanvasSyncOps: vi.fn(async () => []),
  enqueueCanvasSyncOp: mocks.enqueueCanvasSyncOp,
  listCanvasSyncOps: mocks.listCanvasSyncOps,
  markCanvasSyncOpFailed: vi.fn(async () => undefined),
  remapCanvasSyncNodeId: vi.fn(async () => 0),
}));

vi.mock("@/lib/canvas-local-persistence", () => ({
  dropCanvasOpsByClientRequestIds: vi.fn(() => []),
  dropCanvasOpsByEdgeIds: vi.fn(() => []),
  dropCanvasOpsByNodeIds: vi.fn(() => []),
  enqueueCanvasOp: vi.fn(() => "op-1"),
  remapCanvasOpNodeId: vi.fn(() => 0),
  resolveCanvasOp: vi.fn(() => undefined),
  resolveCanvasOps: vi.fn(() => undefined),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useCanvasSyncEngine } from "@/components/canvas/use-canvas-sync-engine";

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;
const asNodeId = (id: string): Id<"nodes"> => id as Id<"nodes">;

const latestHookValueRef: {
  current: ReturnType<typeof useCanvasSyncEngine> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({ canvasId }: { canvasId: Id<"canvases"> }) {
  const [, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const edgesRef = useRef<RFEdge[]>(edges);
  const deletingNodeIds = useRef(new Set<string>());
  const [, setAssetBrowserTargetNodeId] = useState<string | null>(null);
  const [, setEdgeSyncNonce] = useState(0);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const hookValue = useCanvasSyncEngine({
    canvasId,
    setNodes,
    setEdges,
    edgesRef,
    setAssetBrowserTargetNodeId,
    setEdgeSyncNonce,
    deletingNodeIds,
  });

  useEffect(() => {
    latestHookValueRef.current = hookValue;
  }, [hookValue]);

  useEffect(() => {
    latestEdgesRef.current = edges;
  }, [edges]);

  return null;
}

const latestEdgesRef: { current: RFEdge[] } = { current: [] };

function setNavigatorOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

describe("useCanvasSyncEngine hook wiring", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    latestHookValueRef.current = null;
    latestEdgesRef.current = [];
    setNavigatorOnline(true);
    mocks.mutationMocks.clear();
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

  it("uses the latest canvas id after rerendering the mounted hook", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness canvasId={asCanvasId("canvas-1")} />);
    });

    await act(async () => {
      root?.render(<HookHarness canvasId={asCanvasId("canvas-2")} />);
    });

    await act(async () => {
      await latestHookValueRef.current?.actions.resizeNode({
        nodeId: asNodeId("node-1"),
        width: 480,
        height: 320,
      });
    });

    expect(mocks.enqueueCanvasSyncOp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canvasId: "canvas-2",
        type: "resizeNode",
        payload: {
          nodeId: "node-1",
          width: 480,
          height: 320,
        },
      }),
    );
  });

  it("remaps optimistic edge ids to persisted ids after online createEdge returns", async () => {
    const createEdgeMutation = vi.fn(async () => "edge-real-1");
    Object.assign(createEdgeMutation, {
      withOptimisticUpdate: () => createEdgeMutation,
    });
    mocks.mutationMocks.set("edges.create", createEdgeMutation);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness canvasId={asCanvasId("canvas-1")} />);
    });

    await act(async () => {
      await latestHookValueRef.current?.actions.createEdge({
        canvasId: asCanvasId("canvas-1"),
        sourceNodeId: asNodeId("node-a"),
        targetNodeId: asNodeId("node-b"),
        clientRequestId: "req-1",
      });
    });

    expect(createEdgeMutation).toHaveBeenCalledTimes(1);
    expect(latestEdgesRef.current.some((edge) => edge.id === "edge-real-1")).toBe(true);
    expect(
      latestEdgesRef.current.some((edge) => edge.id === "optimistic_edge_req-1"),
    ).toBe(false);
  });

  it("remaps optimistic edge ids to persisted ids while flushing queued createEdge ops", async () => {
    setNavigatorOnline(false);
    const queuedCreateEdgeOp = {
      id: "op-1",
      canvasId: "canvas-1",
      type: "createEdge",
      payload: {
        canvasId: "canvas-1",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        clientRequestId: "req-2",
      },
      enqueuedAt: Date.now(),
      attemptCount: 0,
      nextRetryAt: 0,
      expiresAt: Date.now() + 60_000,
    };

    const typedListCanvasSyncOps = mocks.listCanvasSyncOps as unknown as {
      mockResolvedValueOnce: (value: unknown) => { mockResolvedValueOnce: (v: unknown) => void };
    };
    typedListCanvasSyncOps
      .mockResolvedValueOnce([queuedCreateEdgeOp])
      .mockResolvedValueOnce([]);

    const createEdgeMutation = vi.fn(async () => "edge-real-2");
    Object.assign(createEdgeMutation, {
      withOptimisticUpdate: () => createEdgeMutation,
    });
    mocks.mutationMocks.set("edges.create", createEdgeMutation);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness canvasId={asCanvasId("canvas-1")} />);
    });

    await act(async () => {
      await latestHookValueRef.current?.actions.createEdge({
        canvasId: asCanvasId("canvas-1"),
        sourceNodeId: asNodeId("node-a"),
        targetNodeId: asNodeId("node-b"),
        clientRequestId: "req-2",
      });
    });

    expect(
      latestEdgesRef.current.some((edge) => edge.id === "optimistic_edge_req-2"),
    ).toBe(true);

    setNavigatorOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await latestHookValueRef.current?.actions.flushCanvasSyncQueue();
    });

    expect(createEdgeMutation).toHaveBeenCalledTimes(1);
    expect(latestEdgesRef.current.some((edge) => edge.id === "edge-real-2")).toBe(true);
    expect(
      latestEdgesRef.current.some((edge) => edge.id === "optimistic_edge_req-2"),
    ).toBe(false);
  });
});
