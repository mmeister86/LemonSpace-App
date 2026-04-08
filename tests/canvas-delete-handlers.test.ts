// @vitest-environment jsdom

import React, { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasDeleteHandlers } from "@/components/canvas/canvas-delete-handlers";

vi.mock("@/lib/toast", () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasDeleteHandlers> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HarnessProps = {
  nodes: RFNode[];
  edges: RFEdge[];
  liveNodes?: RFNode[];
  liveEdges?: RFEdge[];
  runBatchRemoveNodesMutation: ReturnType<typeof vi.fn>;
  runCreateEdgeMutation: ReturnType<typeof vi.fn>;
};

function HookHarness(props: HarnessProps) {
  const deletingNodeIds = useRef(new Set<string>());
  const [, setAssetBrowserTargetNodeId] = useState<string | null>(null);
  const nodesRef = useRef<RFNode[]>(props.liveNodes ?? props.nodes);
  const edgesRef = useRef<RFEdge[]>(props.liveEdges ?? props.edges);

  useEffect(() => {
    nodesRef.current = props.liveNodes ?? props.nodes;
    edgesRef.current = props.liveEdges ?? props.edges;
  }, [props.liveEdges, props.liveNodes, props.edges, props.nodes]);

  const handlers = useCanvasDeleteHandlers({
    t: ((key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key) as never,
    canvasId: asCanvasId("canvas-1"),
    nodes: props.nodes,
    edges: props.edges,
    nodesRef,
    edgesRef,
    deletingNodeIds,
    setAssetBrowserTargetNodeId,
    runBatchRemoveNodesMutation: props.runBatchRemoveNodesMutation,
    runCreateEdgeMutation: props.runCreateEdgeMutation,
    runRemoveEdgeMutation: vi.fn(async () => undefined),
  });

  useEffect(() => {
    latestHandlersRef.current = handlers;
  }, [handlers]);

  return null;
}

describe("useCanvasDeleteHandlers", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  afterEach(async () => {
    latestHandlersRef.current = null;
    vi.clearAllMocks();
    consoleErrorSpy?.mockRestore();
    consoleInfoSpy?.mockRestore();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("creates bridge edges only after batch node removal resolves", async () => {
    let resolveBatchRemove: (() => void) | null = null;
    const runBatchRemoveNodesMutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBatchRemove = resolve;
        }),
    );
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    const imageNode: RFNode = { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} };
    const deletedNode: RFNode = {
      id: "node-color",
      type: "color-adjust",
      position: { x: 200, y: 0 },
      data: {},
    };
    const renderNode: RFNode = { id: "node-render", type: "render", position: { x: 400, y: 0 }, data: {} };

    const edges: RFEdge[] = [
      { id: "edge-in", source: "node-image", target: "node-color" },
      { id: "edge-out", source: "node-color", target: "node-render" },
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          nodes: [imageNode, deletedNode, renderNode],
          edges,
          runBatchRemoveNodesMutation,
          runCreateEdgeMutation,
        }),
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodesDelete([deletedNode]);
    });

    expect(runBatchRemoveNodesMutation).toHaveBeenCalledWith({
      nodeIds: ["node-color"],
    });
    expect(runCreateEdgeMutation).not.toHaveBeenCalled();

    await act(async () => {
      resolveBatchRemove?.();
      await Promise.resolve();
    });

    expect(runCreateEdgeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "node-image",
      targetNodeId: "node-render",
      sourceHandle: undefined,
      targetHandle: undefined,
    });
  });

  it("logs bridge payload details when bridge edge creation fails", async () => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    let resolveBatchRemove: (() => void) | null = null;
    const runBatchRemoveNodesMutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBatchRemove = resolve;
        }),
    );
    const bridgeError = new Error("Render accepts only image input");
    const runCreateEdgeMutation = vi.fn(async () => {
      throw bridgeError;
    });

    const imageNode: RFNode = { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} };
    const deletedNode: RFNode = {
      id: "node-color",
      type: "color-adjust",
      position: { x: 200, y: 0 },
      data: {},
    };
    const renderNode: RFNode = { id: "node-render", type: "render", position: { x: 400, y: 0 }, data: {} };

    const edges: RFEdge[] = [
      { id: "edge-in", source: "node-image", target: "node-color" },
      { id: "edge-out", source: "node-color", target: "node-render" },
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          nodes: [imageNode, deletedNode, renderNode],
          edges,
          runBatchRemoveNodesMutation,
          runCreateEdgeMutation,
        }),
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodesDelete([deletedNode]);
    });

    await act(async () => {
      resolveBatchRemove?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[Canvas] bridge edge create failed",
      expect.objectContaining({
        canvasId: "canvas-1",
        deletedNodeIds: ["node-color"],
        bridgeCreate: {
          sourceNodeId: "node-image",
          targetNodeId: "node-render",
          sourceHandle: undefined,
          targetHandle: undefined,
        },
        error: bridgeError,
      }),
    );
  });

  it("skips invalid bridge edges that violate the connection policy", async () => {
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    let resolveBatchRemove: (() => void) | null = null;
    const runBatchRemoveNodesMutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBatchRemove = resolve;
        }),
    );
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    const imageNode: RFNode = { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} };
    const sourceCurvesNode: RFNode = {
      id: "node-curves-source",
      type: "curves",
      position: { x: 120, y: 0 },
      data: {},
    };
    const deletedNode: RFNode = {
      id: "node-curves-deleted",
      type: "curves",
      position: { x: 240, y: 0 },
      data: {},
    };
    const targetCurvesNode: RFNode = {
      id: "node-curves-target",
      type: "curves",
      position: { x: 360, y: 0 },
      data: {},
    };

    const edges: RFEdge[] = [
      { id: "edge-image-target", source: "node-image", target: "node-curves-target" },
      { id: "edge-source-deleted", source: "node-curves-source", target: "node-curves-deleted" },
      { id: "edge-deleted-target", source: "node-curves-deleted", target: "node-curves-target" },
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          nodes: [imageNode, sourceCurvesNode, deletedNode, targetCurvesNode],
          edges,
          runBatchRemoveNodesMutation,
          runCreateEdgeMutation,
        }),
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodesDelete([deletedNode]);
    });

    await act(async () => {
      resolveBatchRemove?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[Canvas] skipped invalid bridge edge after delete",
      expect.objectContaining({
        canvasId: "canvas-1",
        deletedNodeIds: ["node-curves-deleted"],
        bridgeCreate: {
          sourceNodeId: "node-curves-source",
          targetNodeId: "node-curves-target",
          sourceHandle: undefined,
          targetHandle: undefined,
        },
        validationError: "adjustment-incoming-limit",
      }),
    );
  });

  it("uses live graph refs to avoid creating duplicate bridge edges", async () => {
    let resolveBatchRemove: (() => void) | null = null;
    const runBatchRemoveNodesMutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBatchRemove = resolve;
        }),
    );
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    const sourceNode: RFNode = {
      id: "node-light-adjust",
      type: "light-adjust",
      position: { x: 0, y: 0 },
      data: {},
    };
    const deletedNode: RFNode = {
      id: "node-middle",
      type: "color-adjust",
      position: { x: 200, y: 0 },
      data: {},
    };
    const renderNode: RFNode = {
      id: "node-render",
      type: "render",
      position: { x: 400, y: 0 },
      data: {},
    };

    const staleEdges: RFEdge[] = [
      { id: "edge-source-middle", source: "node-light-adjust", target: "node-middle" },
      { id: "edge-middle-render", source: "node-middle", target: "node-render" },
    ];
    const liveEdges: RFEdge[] = [
      ...staleEdges,
      { id: "edge-source-render", source: "node-light-adjust", target: "node-render" },
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          nodes: [sourceNode, deletedNode, renderNode],
          edges: staleEdges,
          liveNodes: [sourceNode, deletedNode, renderNode],
          liveEdges,
          runBatchRemoveNodesMutation,
          runCreateEdgeMutation,
        }),
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodesDelete([deletedNode]);
    });

    await act(async () => {
      resolveBatchRemove?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
  });

  it("skips bridge edges when only an optimistic incoming edge already occupies the target", async () => {
    let resolveBatchRemove: (() => void) | null = null;
    const runBatchRemoveNodesMutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBatchRemove = resolve;
        }),
    );
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    const sourceNode: RFNode = {
      id: "node-image-source",
      type: "image",
      position: { x: 0, y: 0 },
      data: {},
    };
    const otherSourceNode: RFNode = {
      id: "node-image-other",
      type: "image",
      position: { x: 0, y: 120 },
      data: {},
    };
    const deletedNode: RFNode = {
      id: "node-middle-adjust",
      type: "curves",
      position: { x: 200, y: 0 },
      data: {},
    };
    const targetNode: RFNode = {
      id: "node-target-adjust",
      type: "color-adjust",
      position: { x: 400, y: 0 },
      data: {},
    };

    const liveEdges: RFEdge[] = [
      { id: "edge-source-middle", source: "node-image-source", target: "node-middle-adjust" },
      { id: "edge-middle-target", source: "node-middle-adjust", target: "node-target-adjust" },
      {
        id: "optimistic_edge_existing",
        source: "node-image-other",
        target: "node-target-adjust",
      },
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          nodes: [sourceNode, otherSourceNode, deletedNode, targetNode],
          edges: liveEdges,
          liveNodes: [sourceNode, otherSourceNode, deletedNode, targetNode],
          liveEdges,
          runBatchRemoveNodesMutation,
          runCreateEdgeMutation,
        }),
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodesDelete([deletedNode]);
    });

    await act(async () => {
      resolveBatchRemove?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
  });
});
