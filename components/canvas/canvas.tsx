"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyEdgeChanges,
  useReactFlow,
  type Node as RFNode,
  type Edge as RFEdge,
  type EdgeChange,
  BackgroundVariant,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import "@xyflow/react/dist/style.css";
import {
  type CanvasConnectionValidationReason,
} from "@/lib/canvas-connection-policy";
import { showCanvasConnectionRejectedToast } from "@/lib/toast-messages";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  isAdjustmentPresetNodeType,
} from "@/lib/canvas-node-types";

import { nodeTypes } from "./node-types";
import CanvasToolbar, {
  type CanvasNavTool,
} from "@/components/canvas/canvas-toolbar";
import { CanvasAppMenu } from "@/components/canvas/canvas-app-menu";
import { CanvasCommandPalette } from "@/components/canvas/canvas-command-palette";
import {
  CanvasConnectionDropMenu,
} from "@/components/canvas/canvas-connection-drop-menu";
import { CanvasPlacementProvider } from "@/components/canvas/canvas-placement-context";
import { CanvasGraphProvider } from "@/components/canvas/canvas-graph-context";
import { CanvasPresetsProvider } from "@/components/canvas/canvas-presets-context";
import {
  AssetBrowserTargetContext,
  type AssetBrowserTargetApi,
} from "@/components/canvas/asset-browser-panel";
import CustomConnectionLine from "@/components/canvas/custom-connection-line";
import {
  CANVAS_MIN_ZOOM,
  DEFAULT_EDGE_OPTIONS,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getPendingRemovedEdgeIdsFromLocalOps,
  getPendingMovePinsFromLocalOps,
  isEditableKeyboardTarget,
  withResolvedCompareData,
} from "./canvas-helpers";
import { useGenerationFailureWarnings } from "./canvas-generation-failures";
import { useCanvasDeleteHandlers } from "./canvas-delete-handlers";
import { useCanvasNodeInteractions } from "./use-canvas-node-interactions";
import { useCanvasConnections } from "./use-canvas-connections";
import { useCanvasDrop } from "./use-canvas-drop";
import { useCanvasScissors } from "./canvas-scissors";
import { type DefaultEdgeInsertAnchor } from "./edges/default-edge";
import { CanvasSyncProvider } from "./canvas-sync-context";
import { useCanvasData } from "./use-canvas-data";
import { useCanvasEdgeInsertions } from "./use-canvas-edge-insertions";
import { useCanvasEdgeTypes } from "./use-canvas-edge-types";
import { useCanvasFlowReconciliation } from "./use-canvas-flow-reconciliation";
import { useCanvasLocalSnapshotPersistence } from "./use-canvas-local-snapshot-persistence";
import { useCanvasSyncEngine } from "./use-canvas-sync-engine";

interface CanvasInnerProps {
  canvasId: Id<"canvases">;
}

const EDGE_INSERT_REFLOW_SETTLE_MS = 997;

function CanvasInner({ canvasId }: CanvasInnerProps) {
  const t = useTranslations('toasts');
  const showConnectionRejectedToast = useCallback(
    (reason: CanvasConnectionValidationReason) => {
      showCanvasConnectionRejectedToast(t, reason);
    },
    [t],
  );
  const { screenToFlowPosition } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const { canvas, convexEdges, convexNodes, storageUrlsById } = useCanvasData({
    canvasId,
  });

  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const registerUploadedImageMedia = useMutation(api.storage.registerUploadedImageMedia);
  const convexNodeIdsSnapshotForEdgeCarryRef = useRef(new Set<string>());
  const [assetBrowserTargetNodeId, setAssetBrowserTargetNodeId] = useState<
    string | null
  >(null);
  const [edgeSyncNonce, setEdgeSyncNonce] = useState(0);
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const edgesRef = useRef(edges);
  const deletingNodeIds = useRef<Set<string>>(new Set());

  const {
    status: { pendingSyncCount, isSyncing, isSyncOnline },
    refs: {
      pendingMoveAfterCreateRef,
      resolvedRealIdByClientRequestRef,
      pendingEdgeSplitByClientRequestRef,
      pendingConnectionCreatesRef,
      pendingLocalPositionUntilConvexMatchesRef,
      pendingLocalNodeDataUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
    },
    actions: {
      createNode: runCreateNodeOnlineOnly,
      createNodeWithEdgeFromSource: runCreateNodeWithEdgeFromSourceOnlineOnly,
      createNodeWithEdgeToTarget: runCreateNodeWithEdgeToTargetOnlineOnly,
      createNodeWithEdgeSplit: runCreateNodeWithEdgeSplitOnlineOnly,
      moveNode: runMoveNodeMutation,
      batchMoveNodes: runBatchMoveNodesMutation,
      resizeNode: runResizeNodeMutation,
      updateNodeData: runUpdateNodeDataMutation,
      batchRemoveNodes: runBatchRemoveNodesMutation,
      createEdge: runCreateEdgeMutation,
      removeEdge: runRemoveEdgeMutation,
      splitEdgeAtExistingNode: runSplitEdgeAtExistingNodeMutation,
      syncPendingMoveForClientRequest,
      notifyOfflineUnsupported,
    },
  } = useCanvasSyncEngine({
    canvasId,
    setNodes,
    setEdges,
    edgesRef,
    setAssetBrowserTargetNodeId,
    setEdgeSyncNonce,
    deletingNodeIds,
  });

  const hasPresetAwareNodes = useMemo(
    () =>
      nodes.some((node) => isAdjustmentPresetNodeType(node.type ?? "")) ||
      (convexNodes ?? []).some((node) => isAdjustmentPresetNodeType(node.type)),
    [convexNodes, nodes],
  );

  // ─── Future hook seam: render composition + shared local flow state ─────
  const nodesRef = useRef<RFNode[]>(nodes);

  const [scissorsMode, setScissorsMode] = useState(false);
  const [isEdgeInsertReflowing, setIsEdgeInsertReflowing] = useState(false);
  const [scissorStrokePreview, setScissorStrokePreview] = useState<
    { x: number; y: number }[] | null
  >(null);
  const [navTool, setNavTool] = useState<CanvasNavTool>("select");

  useCanvasLocalSnapshotPersistence<RFNode, RFEdge>({
    canvasId: canvasId as string,
    nodes,
    edges,
    setNodes,
    setEdges,
  });

  const assetBrowserTargetApi: AssetBrowserTargetApi = useMemo(
    () => ({
      targetNodeId: assetBrowserTargetNodeId,
      openForNode: (nodeId: string) => setAssetBrowserTargetNodeId(nodeId),
      close: () => setAssetBrowserTargetNodeId(null),
    }),
    [assetBrowserTargetNodeId],
  );

  const canvasGraphNodes = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: node.type ?? "",
        data: node.data,
      })),
    [nodes],
  );

  const canvasGraphEdges = useMemo(
    () =>
      edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
        className: edge.className ?? undefined,
      })),
    [edges],
  );

  const pendingRemovedEdgeIds = useMemo(
    () => {
      void convexEdges;
      void edgeSyncNonce;
      return getPendingRemovedEdgeIdsFromLocalOps(canvasId as string);
    },
    [canvasId, convexEdges, edgeSyncNonce],
  );

  const pendingMovePins = useMemo(
    () => {
      void convexNodes;
      void edgeSyncNonce;
      return getPendingMovePinsFromLocalOps(canvasId as string);
    },
    [canvasId, convexNodes, edgeSyncNonce],
  );

  const handleNavToolChange = useCallback((tool: CanvasNavTool) => {
    if (tool === "scissor") {
      setScissorsMode(true);
      setNavTool("scissor");
      return;
    }
    setScissorsMode(false);
    setNavTool(tool);
  }, []);

  // Auswahl (V) / Hand (H) — ergänzt die Leertaste (Standard: panActivationKeyCode Space beim Ziehen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : "";
      if (key === "v") {
        e.preventDefault();
        handleNavToolChange("select");
        return;
      }
      if (key === "h") {
        e.preventDefault();
        handleNavToolChange("hand");
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleNavToolChange]);

  const { flowPanOnDrag, flowSelectionOnDrag } = useMemo(() => {
    const panMiddleRight: number[] = [1, 2];
    if (scissorsMode) {
      return { flowPanOnDrag: panMiddleRight, flowSelectionOnDrag: false };
    }
    if (navTool === "hand") {
      return { flowPanOnDrag: true, flowSelectionOnDrag: false };
    }
    if (navTool === "comment") {
      return { flowPanOnDrag: panMiddleRight, flowSelectionOnDrag: true };
    }
    return { flowPanOnDrag: panMiddleRight, flowSelectionOnDrag: true };
  }, [scissorsMode, navTool]);

  const scissorsModeRef = useRef(scissorsMode);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    scissorsModeRef.current = scissorsMode;
  }, [scissorsMode]);

  // Drag-Lock: während des Drags kein Convex-Override
  const isDragging = useRef(false);
  // Resize-Lock: kein Convex→lokal während aktiver Größenänderung (veraltete Maße überschreiben sonst den Resize)
  const isResizing = useRef(false);

  // Delete Edge on Drop
  const edgeReconnectSuccessful = useRef(true);
  const isReconnectDragActiveRef = useRef(false);
  useGenerationFailureWarnings(t, convexNodes);

  const { onEdgeClickScissors, onScissorsFlowPointerDownCapture } = useCanvasScissors({
    scissorsMode,
    scissorsModeRef,
    edgesRef,
    setScissorsMode,
    setNavTool,
    setScissorStrokePreview,
    runRemoveEdgeMutation,
  });

  const { onBeforeDelete, onNodesDelete, onEdgesDelete } = useCanvasDeleteHandlers({
    t,
    canvasId,
    nodes,
    edges,
    nodesRef,
    edgesRef,
    deletingNodeIds,
    setAssetBrowserTargetNodeId,
    runBatchRemoveNodesMutation,
    runCreateEdgeMutation,
    runRemoveEdgeMutation,
  });

  const {
    connectionDropMenu,
    closeConnectionDropMenu,
    handleConnectionDropPick,
    onConnect,
    onConnectStart,
    onConnectEnd,
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
  } = useCanvasConnections({
    canvasId,
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
    screenToFlowPosition,
    syncPendingMoveForClientRequest,
    runCreateEdgeMutation,
    runSplitEdgeAtExistingNodeMutation,
    runRemoveEdgeMutation,
    runCreateNodeWithEdgeFromSourceOnlineOnly,
    runCreateNodeWithEdgeToTargetOnlineOnly,
    showConnectionRejectedToast,
  });

  const applyLocalEdgeInsertMoves = useCallback(
    (
      moves: {
        nodeId: Id<"nodes">;
        positionX: number;
        positionY: number;
      }[],
    ) => {
      if (moves.length === 0) {
        return;
      }

      const positionByNodeId = new Map(
        moves.map((move) => [move.nodeId, { x: move.positionX, y: move.positionY }]),
      );

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const nextPosition = positionByNodeId.get(node.id as Id<"nodes">);
          if (!nextPosition) {
            return node;
          }

          if (node.position.x === nextPosition.x && node.position.y === nextPosition.y) {
            return node;
          }

          return {
            ...node,
            position: nextPosition,
          };
        }),
      );
    },
    [],
  );

  const {
    edgeInsertMenu,
    edgeInsertTemplates,
    closeEdgeInsertMenu,
    openEdgeInsertMenu,
    handleEdgeInsertPick,
  } = useCanvasEdgeInsertions({
    canvasId,
    nodes,
    edges,
    runCreateNodeWithEdgeSplitOnlineOnly,
    runBatchMoveNodesMutation,
    applyLocalNodeMoves: applyLocalEdgeInsertMoves,
    showConnectionRejectedToast,
    onReflowStateChange: setIsEdgeInsertReflowing,
    reflowSettleMs: EDGE_INSERT_REFLOW_SETTLE_MS,
  });

  const handleEdgeInsertClick = useCallback(
    (anchor: DefaultEdgeInsertAnchor) => {
      closeConnectionDropMenu();
      openEdgeInsertMenu(anchor);
    },
    [closeConnectionDropMenu, openEdgeInsertMenu],
  );

  useEffect(() => {
    if (connectionDropMenu) {
      closeEdgeInsertMenu();
    }
  }, [closeEdgeInsertMenu, connectionDropMenu]);

  const defaultEdgeOptions = useMemo(
    () => ({
      ...DEFAULT_EDGE_OPTIONS,
      type: "canvas-default" as const,
    }),
    [],
  );

  const edgeInsertReflowStyle = useMemo<CSSProperties>(
    () => ({
      "--ls-edge-insert-reflow-duration": `${EDGE_INSERT_REFLOW_SETTLE_MS}ms`,
    }) as CSSProperties,
    [],
  );

  const edgeTypes = useCanvasEdgeTypes({
    edgeInsertMenuEdgeId: edgeInsertMenu?.edgeId ?? null,
    scissorsMode,
    onInsertClick: handleEdgeInsertClick,
  });

  useCanvasFlowReconciliation({
    convexNodes,
    convexEdges,
    storageUrlsById,
    themeMode: resolvedTheme === "dark" ? "dark" : "light",
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
      preferLocalPositionNodeIdsRef,
      isDragging,
      isResizing,
    },
  });

  useEffect(() => {
    if (isDragging.current) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setNodes((nds) => withResolvedCompareData(nds, edges));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [edges]);

  const {
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useCanvasNodeInteractions({
    canvasId,
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
    runResizeNodeMutation,
    runMoveNodeMutation,
    runBatchMoveNodesMutation,
    runSplitEdgeAtExistingNodeMutation,
    onInvalidConnection: showConnectionRejectedToast,
    syncPendingMoveForClientRequest,
  });

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onFlowError = useCallback((id: string, error: string) => {
    if (process.env.NODE_ENV === "production") return;
    console.error("[ReactFlow error]", { canvasId, id, error });
  }, [canvasId]);

  const { onDragOver, onDrop } = useCanvasDrop({
    canvasId,
    isSyncOnline,
    t,
    edges,
    screenToFlowPosition,
    generateUploadUrl,
    registerUploadedImageMedia,
    runCreateNodeOnlineOnly,
    runCreateNodeWithEdgeSplitOnlineOnly,
    notifyOfflineUnsupported,
    syncPendingMoveForClientRequest,
  });

  const canvasSyncContextValue = useMemo(
    () => ({
      queueNodeDataUpdate: runUpdateNodeDataMutation,
      queueNodeResize: runResizeNodeMutation,
      status: {
        pendingCount: pendingSyncCount,
        isSyncing,
        isOffline: !isSyncOnline,
      },
    }),
    [isSyncOnline, isSyncing, pendingSyncCount, runResizeNodeMutation, runUpdateNodeDataMutation],
  );

  // ─── Future hook seam: render assembly ────────────────────────
  if (convexNodes === undefined || convexEdges === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Canvas lädt…</span>
        </div>
      </div>
    );
  }

  return (
    <CanvasSyncProvider value={canvasSyncContextValue}>
      <CanvasPresetsProvider enabled={hasPresetAwareNodes}>
        <CanvasPlacementProvider
          canvasId={canvasId}
          createNode={runCreateNodeOnlineOnly}
          createNodeWithEdgeSplit={runCreateNodeWithEdgeSplitOnlineOnly}
          createNodeWithEdgeFromSource={runCreateNodeWithEdgeFromSourceOnlineOnly}
          createNodeWithEdgeToTarget={runCreateNodeWithEdgeToTargetOnlineOnly}
          onCreateNodeSettled={({ clientRequestId, realId }) => {
            void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
              (error: unknown) => {
                console.error(
                  "[Canvas] onCreateNodeSettled syncPendingMove failed",
                  error,
                );
              },
            );
          }}
        >
          <AssetBrowserTargetContext.Provider value={assetBrowserTargetApi}>
      <div className="relative h-full w-full">
        <CanvasToolbar
          canvasName={canvas?.name}
          activeTool={navTool}
          onToolChange={handleNavToolChange}
        />
        <CanvasAppMenu canvasId={canvasId} />
        <CanvasCommandPalette />
        <CanvasConnectionDropMenu
          anchor={
            connectionDropMenu
              ? {
                  screenX: connectionDropMenu.screenX,
                  screenY: connectionDropMenu.screenY,
                }
              : null
          }
          onClose={closeConnectionDropMenu}
          onPick={handleConnectionDropPick}
        />
        <CanvasConnectionDropMenu
          anchor={
            edgeInsertMenu
              ? {
                  screenX: edgeInsertMenu.screenX,
                  screenY: edgeInsertMenu.screenY,
                }
              : null
          }
          onClose={closeEdgeInsertMenu}
          onPick={handleEdgeInsertPick}
          templates={edgeInsertTemplates}
        />
        {scissorsMode ? (
          <div className="pointer-events-none absolute top-14 left-1/2 z-50 max-w-[min(100%-2rem,28rem)] -translate-x-1/2 rounded-lg bg-popover/95 px-3 py-1.5 text-center text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
            Scherenmodus — Kante anklicken oder ziehen zum Durchtrennen ·{" "}
            <span className="whitespace-nowrap">Esc oder K beenden</span> · Mitte/Rechtsklick zum
            Verschieben
          </div>
        ) : null}
        {scissorStrokePreview && scissorStrokePreview.length > 1 ? (
          <svg
            className="pointer-events-none fixed inset-0 z-60 overflow-visible"
            aria-hidden
          >
            <polyline
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.85}
              points={scissorStrokePreview
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
            />
          </svg>
        ) : null}
        <div
          className="relative h-full min-h-0 w-full"
          onPointerDownCapture={
            scissorsMode ? onScissorsFlowPointerDownCapture : undefined
          }
        >
        <CanvasGraphProvider nodes={canvasGraphNodes} edges={canvasGraphEdges}>
          <ReactFlow
            style={edgeInsertReflowStyle}
            nodes={nodes}
            edges={edges}
            onlyRenderVisibleElements
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineComponent={CustomConnectionLine}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onBeforeDelete={onBeforeDelete}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onEdgeClick={scissorsMode ? onEdgeClickScissors : undefined}
            onError={onFlowError}
            onDragOver={onDragOver}
            onDrop={onDrop}
            fitView
            minZoom={CANVAS_MIN_ZOOM}
            snapToGrid={false}
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode="Shift"
            nodesConnectable={!scissorsMode}
            panOnDrag={flowPanOnDrag}
            selectionOnDrag={flowSelectionOnDrag}
            panActivationKeyCode="Space"
            proOptions={{ hideAttribution: true }}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            className={cn(
              "bg-background",
              scissorsMode && "canvas-scissors-mode",
              isEdgeInsertReflowing && "canvas-edge-insert-reflowing",
            )}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls className="bg-card! border! shadow-sm! rounded-lg!" />
            <MiniMap
              className="bg-card! border! shadow-sm! rounded-lg!"
              nodeColor={getMiniMapNodeColor}
              nodeStrokeColor={getMiniMapNodeStrokeColor}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </CanvasGraphProvider>
        </div>
      </div>
          </AssetBrowserTargetContext.Provider>
        </CanvasPlacementProvider>
      </CanvasPresetsProvider>
    </CanvasSyncProvider>
  );
}

interface CanvasProps {
  canvasId: Id<"canvases">;
}

export default function Canvas({ canvasId }: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner canvasId={canvasId} />
    </ReactFlowProvider>
  );
}
