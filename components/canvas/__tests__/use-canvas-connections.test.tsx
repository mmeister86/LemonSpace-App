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

import { useCanvasConnections } from "@/components/canvas/use-canvas-connections";
import type { DroppedConnectionTarget } from "@/components/canvas/canvas-helpers";
import { nodeTypes } from "@/components/canvas/node-types";
import { NODE_CATALOG } from "@/lib/canvas-node-catalog";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasConnections> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookHarnessProps = {
  helperResult: DroppedConnectionTarget | null;
  runCreateEdgeMutation?: ReturnType<typeof vi.fn>;
  runSplitEdgeAtExistingNodeMutation?: ReturnType<typeof vi.fn>;
  runRemoveEdgeMutation?: ReturnType<typeof vi.fn>;
  runSwapMixerInputsMutation?: ReturnType<typeof vi.fn>;
  showConnectionRejectedToast?: ReturnType<typeof vi.fn>;
  setEdgesMock?: ReturnType<typeof vi.fn>;
  nodes?: RFNode[];
  edges?: RFEdge[];
};

function HookHarness({
  helperResult,
  runCreateEdgeMutation = vi.fn(async () => undefined),
  runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined),
  runRemoveEdgeMutation = vi.fn(async () => undefined),
  runSwapMixerInputsMutation = vi.fn(async () => undefined),
  showConnectionRejectedToast = vi.fn(),
  setEdgesMock,
  nodes: providedNodes,
  edges: providedEdges,
}: HookHarnessProps) {
  const [nodes] = useState<RFNode[]>(
    providedNodes ?? [
      { id: "node-source", type: "image", position: { x: 0, y: 0 }, data: {} },
      { id: "node-target", type: "text", position: { x: 300, y: 200 }, data: {} },
    ],
  );
  const [edges] = useState<RFEdge[]>(providedEdges ?? []);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const edgeReconnectSuccessful = useRef(true);
  const isReconnectDragActiveRef = useRef(false);
  const pendingConnectionCreatesRef = useRef(new Set<string>());
  const resolvedRealIdByClientRequestRef = useRef(new Map<string, Id<"nodes">>());
  const setEdges = setEdgesMock ?? vi.fn();
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
    screenToFlowPosition: (position: { x: number; y: number }) => position,
    syncPendingMoveForClientRequest: vi.fn(async () => undefined),
    runCreateEdgeMutation,
    runSplitEdgeAtExistingNodeMutation,
    runRemoveEdgeMutation,
    runSwapMixerInputsMutation,
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

  it("exposes mixer metadata required for placement and connection defaults", () => {
    const mixerCatalogEntry = NODE_CATALOG.find((entry) => entry.type === "mixer");
    const mixerTemplate = CANVAS_NODE_TEMPLATES.find(
      (template) => (template.type as string) === "mixer",
    );

    expect(nodeTypes).toHaveProperty("mixer");
    expect(mixerCatalogEntry).toEqual(
      expect.objectContaining({
        type: "mixer",
        category: "control",
        implemented: true,
      }),
    );
    expect(mixerTemplate).toEqual(
      expect.objectContaining({
        type: "mixer",
        defaultData: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0,
          overlayY: 0,
          overlayWidth: 1,
          overlayHeight: 1,
        },
      }),
    );
    expect(NODE_HANDLE_MAP.mixer).toEqual({
      source: "mixer-out",
      target: "base",
    });
    expect(NODE_DEFAULTS.mixer).toEqual(
      expect.objectContaining({
        data: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0,
          overlayY: 0,
          overlayWidth: 1,
          overlayHeight: 1,
        },
      }),
    );
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
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: null,
          handleType: "source",
        } as never,
      );
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
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: null,
          handleType: "source",
        } as never,
      );
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
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: null,
          handleType: "source",
        } as never,
      );
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
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: "target-handle",
          handleType: "target",
        } as never,
      );
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

  it("splits the existing incoming edge when dropping onto an already-connected adjustment node", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={{
            sourceNodeId: "node-curves",
            targetNodeId: "node-light",
            sourceHandle: undefined,
            targetHandle: undefined,
          }}
          runCreateEdgeMutation={runCreateEdgeMutation}
          runSplitEdgeAtExistingNodeMutation={runSplitEdgeAtExistingNodeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
          nodes={[
            { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-curves", type: "curves", position: { x: 180, y: 120 }, data: {} },
            { id: "node-light", type: "light-adjust", position: { x: 360, y: 120 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-image-light",
              source: "node-image",
              target: "node-light",
            },
          ]}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-curves",
          handleId: null,
          handleType: "source",
        } as never,
      );
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 400, clientY: 260 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-curves", type: "curves" },
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

    expect(runSplitEdgeAtExistingNodeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      splitEdgeId: "edge-image-light",
      middleNodeId: "node-curves",
      splitSourceHandle: undefined,
      splitTargetHandle: undefined,
      newNodeSourceHandle: undefined,
      newNodeTargetHandle: undefined,
    });
    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
    expect(latestHandlersRef.current?.connectionDropMenu).toBeNull();
  });

  it("rejects text to ai-video body drops", async () => {
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
          nodes={[
            { id: "node-source", type: "text", position: { x: 0, y: 0 }, data: {} },
            { id: "node-target", type: "ai-video", position: { x: 300, y: 200 }, data: {} },
          ]}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: null,
          handleType: "source",
        } as never,
      );
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 400, clientY: 260 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "text" },
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

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("ai-video-source-invalid");
    expect(latestHandlersRef.current?.connectionDropMenu).toBeNull();
  });

  it("allows image-like sources to connect to mixer", async () => {
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
            targetHandle: "base",
          }}
          nodes={[
            { id: "node-source", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-target", type: "mixer", position: { x: 300, y: 200 }, data: {} },
          ]}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: null,
          handleType: "source",
        } as never,
      );
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
      targetHandle: "base",
    });
    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
  });

  it("rejects disallowed source types to mixer", async () => {
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
            targetHandle: "base",
          }}
          nodes={[
            { id: "node-source", type: "video", position: { x: 0, y: 0 }, data: {} },
            { id: "node-target", type: "mixer", position: { x: 300, y: 200 }, data: {} },
          ]}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: null,
          handleType: "source",
        } as never,
      );
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 400, clientY: 260 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "video" },
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

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("mixer-source-invalid");
  });

  it("rejects a second connection to the same mixer handle", async () => {
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
            targetHandle: "base",
          }}
          nodes={[
            { id: "node-source", type: "asset", position: { x: 0, y: 0 }, data: {} },
            { id: "node-target", type: "mixer", position: { x: 300, y: 200 }, data: {} },
            { id: "node-image", type: "image", position: { x: -200, y: 40 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-existing-base",
              source: "node-image",
              target: "node-target",
              targetHandle: "base",
            },
          ]}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnect({
        source: "node-source",
        target: "node-target",
        sourceHandle: null,
        targetHandle: "base",
      });
    });

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("mixer-handle-incoming-limit");
  });

  it("allows one incoming edge per mixer handle", async () => {
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
            targetHandle: "overlay",
          }}
          nodes={[
            { id: "node-source", type: "asset", position: { x: 0, y: 0 }, data: {} },
            { id: "node-target", type: "mixer", position: { x: 300, y: 200 }, data: {} },
            { id: "node-image", type: "image", position: { x: -200, y: 40 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-existing-base",
              source: "node-image",
              target: "node-target",
              targetHandle: "base",
            },
          ]}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: null,
          handleType: "source",
        } as never,
      );
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 400, clientY: 260 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "asset" },
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
      targetHandle: "overlay",
    });
    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
  });

  it("rejects a third incoming edge to mixer", async () => {
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
            targetHandle: "base",
          }}
          nodes={[
            { id: "node-source", type: "render", position: { x: 0, y: 0 }, data: {} },
            { id: "node-target", type: "mixer", position: { x: 300, y: 200 }, data: {} },
            { id: "node-image", type: "image", position: { x: -200, y: 40 }, data: {} },
            { id: "node-asset", type: "asset", position: { x: -180, y: 180 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-existing-base",
              source: "node-image",
              target: "node-target",
              targetHandle: "base",
            },
            {
              id: "edge-existing-overlay",
              source: "node-asset",
              target: "node-target",
              targetHandle: "overlay",
            },
          ]}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-source",
          handleId: null,
          handleType: "source",
        } as never,
      );
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 400, clientY: 260 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "render" },
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

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("mixer-incoming-limit");
  });

  it("ignores onConnectEnd when no connect drag is active", async () => {
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

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
    expect(latestHandlersRef.current?.connectionDropMenu).toBeNull();
  });

  it("passes edgeIdToIgnore during reconnect replacement without client-side old-edge delete", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const runRemoveEdgeMutation = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runCreateEdgeMutation={runCreateEdgeMutation}
          runRemoveEdgeMutation={runRemoveEdgeMutation}
          edges={[
            {
              id: "edge-1",
              source: "node-source",
              target: "node-target",
              targetHandle: "base",
            },
          ]}
        />,
      );
    });

    const oldEdge = {
      id: "edge-1",
      source: "node-source",
      target: "node-target",
      targetHandle: "base",
    } as RFEdge;

    await act(async () => {
      latestHandlersRef.current?.onReconnectStart();
      latestHandlersRef.current?.onReconnect(oldEdge, {
        source: "node-source",
        target: "node-target",
        sourceHandle: null,
        targetHandle: "overlay",
      });
      latestHandlersRef.current?.onReconnectEnd({} as MouseEvent, oldEdge);
      await Promise.resolve();
    });

    expect(runCreateEdgeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "node-source",
      targetNodeId: "node-target",
      sourceHandle: undefined,
      targetHandle: "overlay",
      edgeIdToIgnore: "edge-1",
    });
    expect(runRemoveEdgeMutation).not.toHaveBeenCalled();
  });

  it("does not remove old edge when reconnect create fails", async () => {
    const runCreateEdgeMutation = vi.fn(async () => {
      throw new Error("incoming limit reached");
    });
    const runRemoveEdgeMutation = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runCreateEdgeMutation={runCreateEdgeMutation}
          runRemoveEdgeMutation={runRemoveEdgeMutation}
          edges={[
            {
              id: "edge-1",
              source: "node-source",
              target: "node-target",
              targetHandle: "base",
            },
          ]}
        />,
      );
    });

    const oldEdge = {
      id: "edge-1",
      source: "node-source",
      target: "node-target",
      targetHandle: "base",
    } as RFEdge;

    await act(async () => {
      latestHandlersRef.current?.onReconnectStart();
      latestHandlersRef.current?.onReconnect(oldEdge, {
        source: "node-source",
        target: "node-target",
        sourceHandle: null,
        targetHandle: "overlay",
      });
      latestHandlersRef.current?.onReconnectEnd({} as MouseEvent, oldEdge);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runCreateEdgeMutation).toHaveBeenCalledTimes(1);
    expect(runRemoveEdgeMutation).not.toHaveBeenCalled();
  });

  it("swaps mixer inputs on reconnect when dropping onto occupied opposite handle (base->overlay)", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const runRemoveEdgeMutation = vi.fn(async () => undefined);
    const runSwapMixerInputsMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();
    const setEdgesMock = vi.fn();

    const initialEdges: RFEdge[] = [
      {
        id: "edge-base",
        source: "node-source-base",
        target: "node-mixer",
        targetHandle: "base",
      },
      {
        id: "edge-overlay",
        source: "node-source-overlay",
        target: "node-mixer",
        targetHandle: "overlay",
      },
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runCreateEdgeMutation={runCreateEdgeMutation}
          runRemoveEdgeMutation={runRemoveEdgeMutation}
          runSwapMixerInputsMutation={runSwapMixerInputsMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
          setEdgesMock={setEdgesMock}
          nodes={[
            { id: "node-source-base", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-source-overlay", type: "asset", position: { x: 0, y: 120 }, data: {} },
            { id: "node-mixer", type: "mixer", position: { x: 320, y: 120 }, data: {} },
          ]}
          edges={initialEdges}
        />,
      );
    });

    const oldEdge = initialEdges[0] as RFEdge;
    await act(async () => {
      latestHandlersRef.current?.onReconnectStart();
      latestHandlersRef.current?.onReconnect(oldEdge, {
        source: "node-source-base",
        target: "node-mixer",
        sourceHandle: null,
        targetHandle: "overlay",
      });
      latestHandlersRef.current?.onReconnectEnd({} as MouseEvent, oldEdge);
      await Promise.resolve();
    });

    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(runRemoveEdgeMutation).not.toHaveBeenCalled();
    expect(runSwapMixerInputsMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      edgeId: "edge-base",
      otherEdgeId: "edge-overlay",
    });

    expect(setEdgesMock).toHaveBeenCalledTimes(1);
    const applyEdges = setEdgesMock.mock.calls[0]?.[0] as ((edges: RFEdge[]) => RFEdge[]);
    const swappedEdges = applyEdges(initialEdges);
    const baseEdge = swappedEdges.find((edge) => edge.id === "edge-base");
    const overlayEdge = swappedEdges.find((edge) => edge.id === "edge-overlay");
    expect(baseEdge?.targetHandle).toBe("overlay");
    expect(overlayEdge?.targetHandle).toBe("base");
  });

  it("swaps mixer inputs on reconnect when dropping onto occupied opposite handle (overlay->base)", async () => {
    const runSwapMixerInputsMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runSwapMixerInputsMutation={runSwapMixerInputsMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
          nodes={[
            { id: "node-source-base", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-source-overlay", type: "asset", position: { x: 0, y: 120 }, data: {} },
            { id: "node-mixer", type: "mixer", position: { x: 320, y: 120 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-base",
              source: "node-source-base",
              target: "node-mixer",
              targetHandle: "base",
            },
            {
              id: "edge-overlay",
              source: "node-source-overlay",
              target: "node-mixer",
              targetHandle: "overlay",
            },
          ]}
        />,
      );
    });

    const oldEdge = {
      id: "edge-overlay",
      source: "node-source-overlay",
      target: "node-mixer",
      targetHandle: "overlay",
    } as RFEdge;

    await act(async () => {
      latestHandlersRef.current?.onReconnectStart();
      latestHandlersRef.current?.onReconnect(oldEdge, {
        source: "node-source-overlay",
        target: "node-mixer",
        sourceHandle: null,
        targetHandle: "base",
      });
      latestHandlersRef.current?.onReconnectEnd({} as MouseEvent, oldEdge);
      await Promise.resolve();
    });

    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
    expect(runSwapMixerInputsMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      edgeId: "edge-overlay",
      otherEdgeId: "edge-base",
    });
  });

  it("does not swap mixer reconnect when target mixer is not fully populated", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const runSwapMixerInputsMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runCreateEdgeMutation={runCreateEdgeMutation}
          runSwapMixerInputsMutation={runSwapMixerInputsMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
          nodes={[
            { id: "node-source-base", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-mixer", type: "mixer", position: { x: 320, y: 120 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-base",
              source: "node-source-base",
              target: "node-mixer",
              targetHandle: "base",
            },
          ]}
        />,
      );
    });

    const oldEdge = {
      id: "edge-base",
      source: "node-source-base",
      target: "node-mixer",
      targetHandle: "base",
    } as RFEdge;

    await act(async () => {
      latestHandlersRef.current?.onReconnectStart();
      latestHandlersRef.current?.onReconnect(oldEdge, {
        source: "node-source-base",
        target: "node-mixer",
        sourceHandle: null,
        targetHandle: "overlay",
      });
      latestHandlersRef.current?.onReconnectEnd({} as MouseEvent, oldEdge);
      await Promise.resolve();
    });

    expect(runSwapMixerInputsMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).not.toHaveBeenCalled();
    expect(runCreateEdgeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "node-source-base",
      targetNodeId: "node-mixer",
      sourceHandle: undefined,
      targetHandle: "overlay",
      edgeIdToIgnore: "edge-base",
    });
  });

  it("does not perform mixer swap for non-mixer reconnect validation failures", async () => {
    const runSwapMixerInputsMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runSwapMixerInputsMutation={runSwapMixerInputsMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
          nodes={[
            { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-render", type: "render", position: { x: 300, y: 0 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-1",
              source: "node-image",
              target: "node-render",
            },
          ]}
        />,
      );
    });

    const oldEdge = {
      id: "edge-1",
      source: "node-image",
      target: "node-render",
    } as RFEdge;

    await act(async () => {
      latestHandlersRef.current?.onReconnectStart();
      latestHandlersRef.current?.onReconnect(oldEdge, {
        source: "node-image",
        target: "node-image",
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(runSwapMixerInputsMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("self-loop");
  });
});
