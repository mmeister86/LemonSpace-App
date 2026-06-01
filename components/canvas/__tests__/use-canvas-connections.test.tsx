// @vitest-environment jsdom

import React, { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasMagnetTarget } from "@/components/canvas/canvas-connection-magnetism";

const mocks = vi.hoisted(() => ({
  resolveDroppedConnectionTarget: vi.fn(),
  resolveConnectionDropTarget: vi.fn(),
  resolveCanvasMagnetTarget: vi.fn(),
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

vi.mock("@/components/canvas/canvas-connection-magnetism", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/canvas/canvas-connection-magnetism")
  >("@/components/canvas/canvas-connection-magnetism");

  return {
    ...actual,
    resolveCanvasMagnetTarget: mocks.resolveCanvasMagnetTarget,
  };
});

vi.mock("@/components/canvas/canvas-connection-drop-target", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/canvas/canvas-connection-drop-target")
  >("@/components/canvas/canvas-connection-drop-target");

  return {
    ...actual,
    resolveConnectionDropTarget: mocks.resolveConnectionDropTarget,
  };
});

import { useCanvasConnections } from "@/components/canvas/use-canvas-connections";
import type { DroppedConnectionTarget } from "@/components/canvas/canvas-connection-drop-target";
import {
  CanvasConnectionMagnetismProvider,
  useCanvasConnectionMagnetism,
} from "@/components/canvas/canvas-connection-magnetism-context";
import { nodeTypes } from "@/components/canvas/node-types";
import { NODE_CATALOG } from "@/lib/canvas-node-catalog";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasConnections> | null;
} = { current: null };

const latestMagnetTargetRef: {
  current: CanvasMagnetTarget | null;
} = { current: null };

const latestSetActiveTargetRef: {
  current: ((target: CanvasMagnetTarget | null) => void) | null;
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
  initialMagnetTarget?: CanvasMagnetTarget | null;
};

type HookHarnessInnerProps = HookHarnessProps;

function HookHarnessInner({
  helperResult,
  runCreateEdgeMutation = vi.fn(async () => undefined),
  runSplitEdgeAtExistingNodeMutation = vi.fn(async () => undefined),
  runRemoveEdgeMutation = vi.fn(async () => undefined),
  runSwapMixerInputsMutation = vi.fn(async () => undefined),
  showConnectionRejectedToast = vi.fn(),
  setEdgesMock,
  nodes: providedNodes,
  edges: providedEdges,
  initialMagnetTarget,
}: HookHarnessInnerProps) {
  const { activeTarget, setActiveTarget } = useCanvasConnectionMagnetism();
  const didInitializeMagnetTargetRef = useRef(false);
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
    mocks.resolveConnectionDropTarget.mockImplementation(
      (args: {
        fromHandleType: "source" | "target";
        fromNodeId: string;
        fromHandleId?: string;
        activeMagnetTarget?: CanvasMagnetTarget | null;
      }) => {
        if (helperResult) {
          return helperResult;
        }

        if (!args.activeMagnetTarget) {
          return null;
        }

        if (args.fromHandleType === "source") {
          return {
            sourceNodeId: args.fromNodeId,
            targetNodeId: args.activeMagnetTarget.nodeId,
            sourceHandle: args.fromHandleId,
            targetHandle: args.activeMagnetTarget.handleId,
          };
        }

        return {
          sourceNodeId: args.activeMagnetTarget.nodeId,
          targetNodeId: args.fromNodeId,
          sourceHandle: args.activeMagnetTarget.handleId,
          targetHandle: args.fromHandleId,
        };
      },
    );
  }, [helperResult]);

  useEffect(() => {
    mocks.resolveCanvasMagnetTarget.mockReturnValue(null);
  }, []);

  useEffect(() => {
    if (!didInitializeMagnetTargetRef.current && initialMagnetTarget !== undefined) {
      didInitializeMagnetTargetRef.current = true;
      setActiveTarget(initialMagnetTarget);
    }
  }, [initialMagnetTarget, setActiveTarget]);

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

  useEffect(() => {
    latestMagnetTargetRef.current = activeTarget;
  }, [activeTarget]);

  useEffect(() => {
    latestSetActiveTargetRef.current = setActiveTarget;
    return () => {
      latestSetActiveTargetRef.current = null;
    };
  }, [setActiveTarget]);

  return null;
}

function HookHarness(props: HookHarnessProps) {
  return (
    <CanvasConnectionMagnetismProvider>
      <HookHarnessInner {...props} />
    </CanvasConnectionMagnetismProvider>
  );
}

describe("useCanvasConnections", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    latestHandlersRef.current = null;
    latestMagnetTargetRef.current = null;
    latestSetActiveTargetRef.current = null;
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
        defaultData: expect.objectContaining({
          mixerVersion: 2,
          stage: null,
          layers: [],
        }),
      }),
    );
    expect(NODE_HANDLE_MAP.mixer).toEqual({
      source: "mixer-out",
      target: "layer-in",
    });
    expect(NODE_DEFAULTS.mixer).toEqual(
      expect.objectContaining({
        height: 460,
        data: expect.objectContaining({
          mixerVersion: 2,
          stage: null,
          layers: [],
        }),
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

  it("rejects self-drops on a note instead of auto-splitting its incoming edge", async () => {
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
            sourceNodeId: "node-note",
            targetNodeId: "node-note",
            sourceHandle: undefined,
            targetHandle: undefined,
          }}
          runCreateEdgeMutation={runCreateEdgeMutation}
          runSplitEdgeAtExistingNodeMutation={runSplitEdgeAtExistingNodeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
          nodes={[
            { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-note", type: "note", position: { x: 240, y: 120 }, data: {} },
          ]}
          edges={[
            {
              id: "edge-image-note",
              source: "node-image",
              target: "node-note",
            },
          ]}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectStart?.(
        {} as MouseEvent,
        {
          nodeId: "node-note",
          handleId: null,
          handleType: "source",
        } as never,
      );
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 260, clientY: 160 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-note", type: "note" },
          fromHandle: { id: null, type: "source" },
          fromPosition: null,
          to: { x: 260, y: 160 },
          toHandle: null,
          toNode: null,
          toPosition: null,
          pointer: null,
        } as never,
      );
    });

    expect(runSplitEdgeAtExistingNodeMutation).not.toHaveBeenCalled();
    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("self-loop");
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

  it("rejects a ninth incoming edge to mixer", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();
    const existingLayerEdges = Array.from({ length: 8 }, (_, index) => ({
      id: `edge-existing-${index + 1}`,
      source: `node-existing-${index + 1}`,
      target: "node-target",
      targetHandle: index === 0 ? "layer-in" : `layer-in-${index + 1}`,
    }));

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
          ]}
          edges={existingLayerEdges}
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
        targetHandle: "layer-in-9",
      });
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
    expect(baseEdge?.targetHandle).toBe("layer-in-2");
    expect(overlayEdge?.targetHandle).toBe("layer-in");
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

  it("falls back to active magnet target when direct drop resolution misses", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runCreateEdgeMutation={runCreateEdgeMutation}
          initialMagnetTarget={{
            nodeId: "node-target",
            handleId: "base",
            handleType: "target",
            centerX: 320,
            centerY: 180,
            distancePx: 12,
          }}
          nodes={[
            { id: "node-source", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-target", type: "mixer", position: { x: 300, y: 200 }, data: {} },
          ]}
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
    expect(latestMagnetTargetRef.current).toBeNull();
  });

  it("rejects invalid active magnet target and clears transient state", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runCreateEdgeMutation={runCreateEdgeMutation}
          showConnectionRejectedToast={showConnectionRejectedToast}
          initialMagnetTarget={{
            nodeId: "node-source",
            handleType: "target",
            centerX: 100,
            centerY: 100,
            distancePx: 10,
          }}
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
        { clientX: 120, clientY: 120 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "image" },
          fromHandle: { id: null, type: "source" },
          fromPosition: null,
          to: { x: 120, y: 120 },
          toHandle: null,
          toNode: null,
          toPosition: null,
          pointer: null,
        } as never,
      );
    });

    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("self-loop");
    expect(latestMagnetTargetRef.current).toBeNull();
  });

  it("clears transient magnet state when dropping on background opens menu", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          initialMagnetTarget={{
            nodeId: "node-target",
            handleType: "target",
            centerX: 200,
            centerY: 220,
            distancePx: 14,
          }}
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
    });

    await act(async () => {
      latestHandlersRef.current?.onConnectEnd(
        { clientX: 500, clientY: 460 } as MouseEvent,
        {
          isValid: false,
          from: { x: 0, y: 0 },
          fromNode: { id: "node-source", type: "image" },
          fromHandle: { id: null, type: "source" },
          fromPosition: null,
          to: { x: 500, y: 460 },
          toHandle: null,
          toNode: null,
          toPosition: null,
          pointer: null,
        } as never,
      );
    });

    expect(latestHandlersRef.current?.connectionDropMenu).toEqual(
      expect.objectContaining({
        screenX: 500,
        screenY: 460,
      }),
    );
    expect(latestMagnetTargetRef.current).toBeNull();
  });

  it("clears transient magnet state when reconnect drag ends", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          helperResult={null}
          runCreateEdgeMutation={runCreateEdgeMutation}
          edges={[
            {
              id: "edge-1",
              source: "node-source",
              target: "node-target",
              targetHandle: "base",
            },
          ]}
          nodes={[
            { id: "node-source", type: "image", position: { x: 0, y: 0 }, data: {} },
            { id: "node-target", type: "mixer", position: { x: 300, y: 200 }, data: {} },
          ]}
          initialMagnetTarget={{
            nodeId: "node-target",
            handleType: "target",
            handleId: "overlay",
            centerX: 300,
            centerY: 180,
            distancePx: 11,
          }}
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

    expect(runCreateEdgeMutation).toHaveBeenCalled();
    expect(latestMagnetTargetRef.current).toBeNull();
  });
});
