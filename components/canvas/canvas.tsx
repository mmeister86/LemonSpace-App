"use client";

/**
 * Onboarding note:
 * Main Canvas orchestrator. It wires React Flow, Convex sync, local persistence, drag/drop, selection, and panel composition without owning every low-level helper.
 */

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
import { toast } from "@/lib/toast";
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
  getSingleCharacterHotkey,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getPendingNodeSizePinsFromLocalOps,
  getPendingRemovedNodeIdsFromLocalOps,
  getPendingRemovedEdgeIdsFromLocalOps,
  getPendingMovePinsFromLocalOps,
  deselectCanvasEdges,
  isCanvasSelectAllHotkey,
  isEditableKeyboardTarget,
  selectAllCanvasNodes,
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
import { CanvasSelectionToolbar } from "./canvas-selection-toolbar";
import { CollapsedNodeDrawerToolbarProvider } from "./collapsed-node-drawer-toolbar-context";
import { useCanvasData } from "./use-canvas-data";
import { useCanvasEdgeInsertions } from "./use-canvas-edge-insertions";
import {
  CanvasEdgeTypesProvider,
  canvasEdgeTypes,
} from "./use-canvas-edge-types";
import { useCanvasFlowReconciliation } from "./use-canvas-flow-reconciliation";
import { useCanvasLocalSnapshotPersistence } from "./use-canvas-local-snapshot-persistence";
import { useCanvasSyncEngine } from "./use-canvas-sync-engine";
import { useCanvasHistory } from "./use-canvas-history";
import { useCanvasGroupingMutations } from "./use-canvas-grouping-mutations";
import { HANDLE_GLOW_RADIUS_PX } from "./canvas-connection-magnetism";
import { CanvasConnectionMagnetismProvider } from "./canvas-connection-magnetism-context";
import { projectCanvasFavoritesVisibility } from "./canvas-favorites-visibility";
import { CollapsedNodeEditDrawer } from "./collapsed-node-edit-drawer";
import { useOnboardingActions } from "@/components/onboarding/onboarding-provider";
import {
  computeCanvasDagreLayout,
  type CanvasDagreLayoutDirection,
} from "./canvas-dagre-layout";

interface CanvasInnerProps {
  canvasId: Id<"canvases">;
}

const EDGE_INSERT_REFLOW_SETTLE_MS = 997;

function CanvasInner({ canvasId }: CanvasInnerProps) {
  const t = useTranslations('toasts');
  const { markMilestone } = useOnboardingActions();
  const firstOutputMarkedRef = useRef(false);
  const showConnectionRejectedToast = useCallback(
    (reason: CanvasConnectionValidationReason) => {
      showCanvasConnectionRejectedToast(t, reason);
    },
    [t],
  );
  const { fitView, screenToFlowPosition } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const [isCanvasDeletePending, setIsCanvasDeletePending] = useState(false);
  const { canvas, convexEdges, convexNodes, storageUrlsById } = useCanvasData({
    canvasId,
    suppressQueries: isCanvasDeletePending,
  });

  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const registerUploadedImageMedia = useMutation(api.storage.registerUploadedImageMedia);
  const registerUploadedVideoMedia = useMutation(api.storage.registerUploadedVideoMedia);
  const runSwapMixerInputsMutation = useMutation(api.edges.swapMixerInputs);
  const {
    createGroupFromSelection: runCreateGroupFromSelectionMutation,
    ungroupNodes: runUngroupNodesMutation,
  } = useCanvasGroupingMutations({ canvasId });
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
      pendingLocalNodeSizeUntilConvexMatchesRef,
      pendingLocalNodeParentUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
    },
    actions: {
      createNode: runCreateNodeOnlineOnly,
      createNodeWithEdgeFromSource: runCreateNodeWithEdgeFromSourceOnlineOnly,
      createNodeWithEdgeToTarget: runCreateNodeWithEdgeToTargetOnlineOnly,
      createNodeWithEdgeSplit: runCreateNodeWithEdgeSplitOnlineOnly,
      moveNode: runMoveNodeMutation,
      batchMoveNodes: runBatchMoveNodesMutation,
      setNodeParent: runSetNodeParentMutation,
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

  const canvasHistory = useCanvasHistory({
    canvasId,
    nodes,
    edges,
    setNodes,
    setEdges,
    disabled: !isSyncOnline,
  });

  const runCreateNodeWithHistory = useCallback(
    async (...args: Parameters<typeof runCreateNodeOnlineOnly>) => {
      canvasHistory.capture();
      return await runCreateNodeOnlineOnly(...args);
    },
    [canvasHistory, runCreateNodeOnlineOnly],
  );

  const runCreateNodeWithEdgeFromSourceWithHistory = useCallback(
    async (...args: Parameters<typeof runCreateNodeWithEdgeFromSourceOnlineOnly>) => {
      canvasHistory.capture();
      return await runCreateNodeWithEdgeFromSourceOnlineOnly(...args);
    },
    [canvasHistory, runCreateNodeWithEdgeFromSourceOnlineOnly],
  );

  const runCreateNodeWithEdgeToTargetWithHistory = useCallback(
    async (...args: Parameters<typeof runCreateNodeWithEdgeToTargetOnlineOnly>) => {
      canvasHistory.capture();
      return await runCreateNodeWithEdgeToTargetOnlineOnly(...args);
    },
    [canvasHistory, runCreateNodeWithEdgeToTargetOnlineOnly],
  );

  const runCreateNodeWithEdgeSplitWithHistory = useCallback(
    async (...args: Parameters<typeof runCreateNodeWithEdgeSplitOnlineOnly>) => {
      canvasHistory.capture();
      return await runCreateNodeWithEdgeSplitOnlineOnly(...args);
    },
    [canvasHistory, runCreateNodeWithEdgeSplitOnlineOnly],
  );

  const runCreateEdgeWithHistory = useCallback(
    async (...args: Parameters<typeof runCreateEdgeMutation>) => {
      canvasHistory.capture();
      return await runCreateEdgeMutation(...args);
    },
    [canvasHistory, runCreateEdgeMutation],
  );

  const runRemoveEdgeWithHistory = useCallback(
    async (...args: Parameters<typeof runRemoveEdgeMutation>) => {
      canvasHistory.capture();
      return await runRemoveEdgeMutation(...args);
    },
    [canvasHistory, runRemoveEdgeMutation],
  );

  const runCreateGroupFromSelectionWithHistory = useCallback(
    async (...args: Parameters<typeof runCreateGroupFromSelectionMutation>) => {
      canvasHistory.capture();
      return await runCreateGroupFromSelectionMutation(...args);
    },
    [canvasHistory, runCreateGroupFromSelectionMutation],
  );

  const runUngroupNodesWithHistory = useCallback(
    async (...args: Parameters<typeof runUngroupNodesMutation>) => {
      canvasHistory.capture();
      return await runUngroupNodesMutation(...args);
    },
    [canvasHistory, runUngroupNodesMutation],
  );

  const runUpdateNodeDataWithHistory = useCallback(
    async (...args: Parameters<typeof runUpdateNodeDataMutation>) => {
      canvasHistory.capture();
      return await runUpdateNodeDataMutation(...args);
    },
    [canvasHistory, runUpdateNodeDataMutation],
  );

  const runResizeNodeWithHistory = useCallback(
    async (
      args: Parameters<typeof runResizeNodeMutation>[0] & {
        skipHistory?: boolean;
      },
    ) => {
      const { skipHistory, ...mutationArgs } = args;
      if (!skipHistory) {
        canvasHistory.capture();
      }
      return await runResizeNodeMutation(mutationArgs);
    },
    [canvasHistory, runResizeNodeMutation],
  );

  const handleAutoLayout = useCallback(
    async (direction: CanvasDagreLayoutDirection) => {
      const result = computeCanvasDagreLayout({
        direction,
        nodes,
        edges,
      });

      if (result.status === "noop") {
        if (result.reason === "optimistic-nodes") {
          toast.warning(
            "Canvas synchronisiert noch",
            "Warte kurz, bis neue Knoten gespeichert sind, bevor du das Auto-Layout nutzt.",
          );
          return;
        }
        if (result.reason === "mixed-parent-context") {
          toast.warning(
            "Auswahl nicht layoutbar",
            "Wähle nur Knoten aus derselben Gruppe oder nur Knoten auf der freien Fläche aus.",
          );
          return;
        }
        toast.info("Keine Knoten zum Layouten gefunden");
        return;
      }

      if (result.moves.length === 0) {
        toast.info("Layout ist bereits aktuell");
        return;
      }

      canvasHistory.capture();

      for (const move of result.moves) {
        const position = { x: move.positionX, y: move.positionY };
        pendingLocalPositionUntilConvexMatchesRef.current.set(move.nodeId, position);
        preferLocalPositionNodeIdsRef.current.add(move.nodeId);
      }

      setNodes(result.nodes);

      await runBatchMoveNodesMutation({
        moves: result.moves.map((move) => ({
          nodeId: move.nodeId as Id<"nodes">,
          positionX: move.positionX,
          positionY: move.positionY,
        })),
      });

      void fitView({
        nodes: result.laidOutNodeIds.map((id) => ({ id })),
        duration: 300,
        padding: 0.2,
      });
    },
    [
      canvasHistory,
      edges,
      fitView,
      nodes,
      pendingLocalPositionUntilConvexMatchesRef,
      preferLocalPositionNodeIdsRef,
      runBatchMoveNodesMutation,
      setNodes,
    ],
  );

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
  const [focusFavorites, setFocusFavorites] = useState(false);

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

  useEffect(() => {
    if (firstOutputMarkedRef.current) return;
    const hasCompletedOutput = canvasGraphNodes.some((node) => {
      const data = node.data as Record<string, unknown> | undefined;
      const status = data?._status;
      const hasVisibleResult = Boolean(data?.url || data?.storageId || data?.body);
      return (
        (node.type === "ai-image" ||
          node.type === "ai-video" ||
          node.type === "agent-output") &&
        status === "done" &&
        hasVisibleResult
      );
    });
    if (!hasCompletedOutput) return;
    firstOutputMarkedRef.current = true;
    markMilestone("firstOutput");
  }, [canvasGraphNodes, markMilestone]);

  const favoriteProjection = useMemo(
    () =>
        projectCanvasFavoritesVisibility({
          nodes,
          edges,
          favoritesOnly: focusFavorites,
        }),
    [edges, nodes, focusFavorites],
  );

  const pendingRemovedEdgeIds = useMemo(
    () => {
      void convexEdges;
      void edgeSyncNonce;
      return getPendingRemovedEdgeIdsFromLocalOps(canvasId as string);
    },
    [canvasId, convexEdges, edgeSyncNonce],
  );

  const pendingRemovedNodeIds = useMemo(
    () => {
      void convexNodes;
      void edgeSyncNonce;
      return getPendingRemovedNodeIdsFromLocalOps(canvasId as string);
    },
    [canvasId, convexNodes, edgeSyncNonce],
  );

  const pendingMovePins = useMemo(
    () => {
      void convexNodes;
      void edgeSyncNonce;
      return getPendingMovePinsFromLocalOps(canvasId as string);
    },
    [canvasId, convexNodes, edgeSyncNonce],
  );

  const pendingNodeSizePins = useMemo(
    () => {
      void convexNodes;
      void edgeSyncNonce;
      return getPendingNodeSizePinsFromLocalOps(canvasId as string);
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
      const key = getSingleCharacterHotkey(e);
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      const isRedo =
        (e.metaKey || e.ctrlKey) &&
        ((e.shiftKey && e.key.toLowerCase() === "z") || e.key.toLowerCase() === "y");
      if (!isUndo && !isRedo) return;

      e.preventDefault();
      if (isUndo) {
        void canvasHistory.undo();
        return;
      }
      void canvasHistory.redo();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canvasHistory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCanvasSelectAllHotkey(event)) return;

      event.preventDefault();
      setNodes(selectAllCanvasNodes);
      setEdges(deselectCanvasEdges);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setEdges, setNodes]);

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
    runRemoveEdgeMutation: runRemoveEdgeWithHistory,
  });

  const { onBeforeDelete, onNodesDelete, onEdgesDelete } = useCanvasDeleteHandlers({
    t,
    canvasId,
    nodesRef,
    edgesRef,
    deletingNodeIds,
    setAssetBrowserTargetNodeId,
    runBatchRemoveNodesMutation,
    runCreateEdgeMutation,
    runRemoveEdgeMutation,
    onHistoryCapture: canvasHistory.capture,
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
    runCreateEdgeMutation: runCreateEdgeWithHistory,
    runSplitEdgeAtExistingNodeMutation,
    runRemoveEdgeMutation: runRemoveEdgeWithHistory,
    runSwapMixerInputsMutation,
    runCreateNodeWithEdgeFromSourceOnlineOnly: runCreateNodeWithEdgeFromSourceWithHistory,
    runCreateNodeWithEdgeToTargetOnlineOnly: runCreateNodeWithEdgeToTargetWithHistory,
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
    runCreateNodeWithEdgeSplitOnlineOnly: runCreateNodeWithEdgeSplitWithHistory,
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

  useCanvasFlowReconciliation({
    convexNodes,
    convexEdges,
    storageUrlsById,
    themeMode: resolvedTheme === "dark" ? "dark" : "light",
    pendingRemovedEdgeIds,
    pendingRemovedNodeIds,
    pendingMovePins,
    pendingNodeSizePins,
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
    runSetNodeParentMutation,
    runSplitEdgeAtExistingNodeMutation,
    onInvalidConnection: showConnectionRejectedToast,
    syncPendingMoveForClientRequest,
    onHistoryCapture: canvasHistory.capture,
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
    registerUploadedVideoMedia,
    runCreateNodeOnlineOnly: runCreateNodeWithHistory,
    runCreateNodeWithEdgeSplitOnlineOnly: runCreateNodeWithEdgeSplitWithHistory,
    notifyOfflineUnsupported,
    queueNodeDataUpdate: runUpdateNodeDataWithHistory,
    queueNodeResize: runResizeNodeWithHistory,
    syncPendingMoveForClientRequest,
  });

  const canvasSyncContextValue = useMemo(
    () => ({
      queueNodeDataUpdate: runUpdateNodeDataWithHistory,
      queueNodeResize: runResizeNodeWithHistory,
      ungroupNodes: runUngroupNodesWithHistory,
      notifyOfflineUnsupported,
      status: {
        pendingCount: pendingSyncCount,
        isSyncing,
        isOffline: !isSyncOnline,
      },
    }),
    [
      isSyncOnline,
      isSyncing,
      notifyOfflineUnsupported,
      pendingSyncCount,
      runResizeNodeWithHistory,
      runUngroupNodesWithHistory,
      runUpdateNodeDataWithHistory,
    ],
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
          createNode={runCreateNodeWithHistory}
          createNodeWithEdgeSplit={runCreateNodeWithEdgeSplitWithHistory}
          createNodeWithEdgeFromSource={runCreateNodeWithEdgeFromSourceWithHistory}
          createNodeWithEdgeToTarget={runCreateNodeWithEdgeToTargetWithHistory}
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
          key={canvasId}
          canvasId={canvasId}
          canvasName={canvas?.name}
          activeTool={navTool}
          onToolChange={handleNavToolChange}
          favoriteFilterActive={focusFavorites}
          onFavoriteFilterChange={setFocusFavorites}
          favoriteCount={favoriteProjection.favoriteCount}
          canUndo={canvasHistory.canUndo}
          canRedo={canvasHistory.canRedo}
          onUndo={() => void canvasHistory.undo()}
          onRedo={() => void canvasHistory.redo()}
          onAutoLayout={(direction) => void handleAutoLayout(direction)}
        />
        <CanvasAppMenu
          canvasId={canvasId}
          onDeleteStart={() => setIsCanvasDeletePending(true)}
          onDeleteError={() => setIsCanvasDeletePending(false)}
        />
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
          data-onboarding="canvas-surface"
          onPointerDownCapture={
            scissorsMode ? onScissorsFlowPointerDownCapture : undefined
          }
        >
          <CanvasEdgeTypesProvider
            edgeInsertMenuEdgeId={edgeInsertMenu?.edgeId ?? null}
            scissorsMode={scissorsMode}
            onInsertClick={handleEdgeInsertClick}
          >
            <CanvasGraphProvider nodes={canvasGraphNodes} edges={canvasGraphEdges}>
              <CollapsedNodeDrawerToolbarProvider>
                <ReactFlow
                  style={edgeInsertReflowStyle}
                  nodes={favoriteProjection.nodes}
                  edges={favoriteProjection.edges}
                  onlyRenderVisibleElements
                  defaultEdgeOptions={defaultEdgeOptions}
                  connectionLineComponent={CustomConnectionLine}
                  nodeTypes={nodeTypes}
                  edgeTypes={canvasEdgeTypes}
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
                  connectionRadius={HANDLE_GLOW_RADIUS_PX}
                  reconnectRadius={24}
                  edgesReconnectable
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
                  <CanvasSelectionToolbar
                    canvasId={canvasId}
                    disabled={scissorsMode}
                    isSyncOnline={isSyncOnline}
                    createGroupFromSelection={runCreateGroupFromSelectionWithHistory}
                    ungroupNodes={runUngroupNodesWithHistory}
                    notifyOfflineUnsupported={notifyOfflineUnsupported}
                  />
                  <CollapsedNodeEditDrawer />
                </ReactFlow>
              </CollapsedNodeDrawerToolbarProvider>
            </CanvasGraphProvider>
          </CanvasEdgeTypesProvider>
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
      <CanvasConnectionMagnetismProvider>
        <CanvasInner canvasId={canvasId} />
      </CanvasConnectionMagnetismProvider>
    </ReactFlowProvider>
  );
}
