// @vitest-environment jsdom

import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasHistory } from "@/components/canvas/use-canvas-history";

const mocks = vi.hoisted(() => ({
  restoreSnapshot: vi.fn(
    async (args: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> }) => ({
      nodeIdMap: Object.fromEntries(args.nodes.map((node) => [node.id, node.id])),
      edgeIdMap: Object.fromEntries(args.edges.map((edge) => [edge.id, edge.id])),
    }),
  ),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () =>
    Object.assign(mocks.restoreSnapshot, {
      withOptimisticUpdate: () => mocks.restoreSnapshot,
    }),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    canvasGraph: {
      restoreSnapshot: "canvasGraph.restoreSnapshot",
    },
  },
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    warning: mocks.toastWarning,
    error: mocks.toastError,
  },
}));

type HistoryHarnessValue = ReturnType<typeof useCanvasHistory> & {
  setNodes: React.Dispatch<React.SetStateAction<RFNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<RFEdge[]>>;
  nodes: RFNode[];
};

const latestRef: { current: HistoryHarnessValue | null } = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function node(id: string, x: number): RFNode {
  return {
    id,
    type: "text",
    position: { x, y: 0 },
    data: { content: `Node ${x}`, _status: "idle", retryCount: 0 },
    style: { width: 120, height: 80 },
  };
}

function HookHarness({ disabled = false }: { disabled?: boolean }) {
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const history = useCanvasHistory({
    canvasId: "canvas-1" as Id<"canvases">,
    nodes,
    edges,
    setNodes,
    setEdges,
    disabled,
  });

  useEffect(() => {
    latestRef.current = {
      ...history,
      setNodes,
      setEdges,
      nodes,
    };
  }, [history, nodes]);

  return null;
}

describe("useCanvasHistory", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(async () => {
    mocks.restoreSnapshot.mockClear();
    mocks.toastWarning.mockClear();
    mocks.toastError.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(HookHarness));
    });
  });

  afterEach(async () => {
    latestRef.current = null;
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("keeps only ten undo snapshots", async () => {
    for (let index = 0; index < 12; index += 1) {
      await act(async () => {
        latestRef.current?.setNodes([node("node-1", index)]);
      });
      await act(async () => {
        latestRef.current?.capture();
      });
    }

    for (let index = 0; index < 12; index += 1) {
      await act(async () => {
        await latestRef.current?.undo();
      });
    }

    expect(mocks.restoreSnapshot).toHaveBeenCalledTimes(10);
  });

  it("clears redo snapshots after a new edit", async () => {
    await act(async () => {
      latestRef.current?.setNodes([node("node-1", 0)]);
    });
    await act(async () => {
      latestRef.current?.capture();
      latestRef.current?.setNodes([node("node-1", 1)]);
    });

    await act(async () => {
      await latestRef.current?.undo();
    });
    expect(latestRef.current?.canRedo).toBe(true);

    await act(async () => {
      latestRef.current?.setNodes([node("node-1", 2)]);
    });
    await act(async () => {
      latestRef.current?.capture();
    });

    expect(latestRef.current?.canRedo).toBe(false);
  });

  it("applies undo locally before the restore mutation resolves", async () => {
    let resolveRestore:
      | ((value: { nodeIdMap: Record<string, string>; edgeIdMap: Record<string, string> }) => void)
      | null = null;
    mocks.restoreSnapshot.mockImplementationOnce(
      async (args: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> }) =>
        await new Promise((resolve) => {
          resolveRestore = resolve;
        }).then(() => ({
          nodeIdMap: Object.fromEntries(args.nodes.map((snapshotNode) => [snapshotNode.id, snapshotNode.id])),
          edgeIdMap: Object.fromEntries(args.edges.map((edge) => [edge.id, edge.id])),
        })),
    );

    await act(async () => {
      latestRef.current?.setNodes([node("node-1", 0)]);
    });
    await act(async () => {
      latestRef.current?.capture();
      latestRef.current?.setNodes([node("node-1", 1)]);
    });
    await act(async () => {
      latestRef.current?.capture();
      latestRef.current?.setNodes([node("node-1", 2)]);
    });

    await act(async () => {
      void latestRef.current?.undo();
    });

    expect(latestRef.current?.nodes[0]?.position.x).toBe(1);
    expect(latestRef.current?.canUndo).toBe(true);

    await act(async () => {
      resolveRestore?.({ nodeIdMap: { "node-1": "node-1" }, edgeIdMap: {} });
    });
  });

  it("remaps future snapshots after a restored node is recreated", async () => {
    mocks.restoreSnapshot.mockImplementationOnce(async (args) => ({
      nodeIdMap: Object.fromEntries(
        args.nodes.map((snapshotNode: { id: string }) => [
          snapshotNode.id,
          snapshotNode.id === "node-old" ? "node-new" : snapshotNode.id,
        ]),
      ),
      edgeIdMap: Object.fromEntries(
        args.edges.map((edge: { id: string }) => [edge.id, edge.id]),
      ),
    }));

    await act(async () => {
      latestRef.current?.setNodes([node("node-old", 0)]);
    });
    await act(async () => {
      latestRef.current?.capture();
      latestRef.current?.setNodes([]);
    });

    await act(async () => {
      await latestRef.current?.undo();
    });
    expect(latestRef.current?.nodes[0]?.id).toBe("node-new");

    await act(async () => {
      await latestRef.current?.redo();
    });
    await act(async () => {
      await latestRef.current?.undo();
    });

    const lastRestoreArgs = mocks.restoreSnapshot.mock.calls.at(-1)?.[0] as
      | { nodes: Array<{ id: string }> }
      | undefined;
    expect(lastRestoreArgs?.nodes[0]?.id).toBe("node-new");
  });
});
