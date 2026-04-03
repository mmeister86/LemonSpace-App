"use client";

import {
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
  type Connection,
  type OnConnectEnd,
  BackgroundVariant,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import "@xyflow/react/dist/style.css";
import { toast } from "@/lib/toast";
import {
  CANVAS_NODE_DND_MIME,
  type CanvasConnectionValidationReason,
  validateCanvasConnectionPolicy,
} from "@/lib/canvas-connection-policy";
import { showCanvasConnectionRejectedToast } from "@/lib/toast-messages";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  isAdjustmentPresetNodeType,
  isCanvasNodeType,
  type CanvasNodeType,
} from "@/lib/canvas-node-types";

import { nodeTypes } from "./node-types";
import {
  NODE_DEFAULTS,
  NODE_HANDLE_MAP,
} from "@/lib/canvas-utils";
import CanvasToolbar, {
  type CanvasNavTool,
} from "@/components/canvas/canvas-toolbar";
import { CanvasAppMenu } from "@/components/canvas/canvas-app-menu";
import { CanvasCommandPalette } from "@/components/canvas/canvas-command-palette";
import {
  CanvasConnectionDropMenu,
  type ConnectionDropMenuState,
} from "@/components/canvas/canvas-connection-drop-menu";
import { CanvasPlacementProvider } from "@/components/canvas/canvas-placement-context";
import { CanvasPresetsProvider } from "@/components/canvas/canvas-presets-context";
import {
  AssetBrowserTargetContext,
  type AssetBrowserTargetApi,
} from "@/components/canvas/asset-browser-panel";
import CustomConnectionLine from "@/components/canvas/custom-connection-line";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import {
  CANVAS_MIN_ZOOM,
  DEFAULT_EDGE_OPTIONS,
  getConnectEndClientPoint,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getPendingRemovedEdgeIdsFromLocalOps,
  getPendingMovePinsFromLocalOps,
  isEditableKeyboardTarget,
  isOptimisticNodeId,
  withResolvedCompareData,
} from "./canvas-helpers";
import { useGenerationFailureWarnings } from "./canvas-generation-failures";
import { useCanvasDeleteHandlers } from "./canvas-delete-handlers";
import { getImageDimensions } from "./canvas-media-utils";
import { useCanvasNodeInteractions } from "./use-canvas-node-interactions";
import { useCanvasReconnectHandlers } from "./canvas-reconnect";
import { useCanvasScissors } from "./canvas-scissors";
import { CanvasSyncProvider } from "./canvas-sync-context";
import { useCanvasData } from "./use-canvas-data";
import { useCanvasFlowReconciliation } from "./use-canvas-flow-reconciliation";
import { useCanvasLocalSnapshotPersistence } from "./use-canvas-local-snapshot-persistence";
import { useCanvasSyncEngine } from "./use-canvas-sync-engine";

interface CanvasInnerProps {
  canvasId: Id<"canvases">;
}

function validateCanvasConnection(
  connection: Connection,
  nodes: RFNode[],
  edges: RFEdge[],
  edgeToReplaceId?: string,
): CanvasConnectionValidationReason | null {
  if (!connection.source || !connection.target) return "incomplete";
  if (connection.source === connection.target) return "self-loop";

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) return "unknown-node";

  return validateCanvasConnectionPolicy({
    sourceType: sourceNode.type ?? "",
    targetType: targetNode.type ?? "",
    targetIncomingCount: edges.filter(
      (edge) => edge.target === connection.target && edge.id !== edgeToReplaceId,
    ).length,
  });
}

function validateCanvasConnectionByType(args: {
  sourceType: string;
  targetType: string;
  targetNodeId: string;
  edges: RFEdge[];
}): CanvasConnectionValidationReason | null {
  const targetIncomingCount = args.edges.filter(
    (edge) => edge.target === args.targetNodeId,
  ).length;

  return validateCanvasConnectionPolicy({
    sourceType: args.sourceType,
    targetType: args.targetType,
    targetIncomingCount,
  });
}

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
  const convexNodeIdsSnapshotForEdgeCarryRef = useRef(new Set<string>());
  const [assetBrowserTargetNodeId, setAssetBrowserTargetNodeId] = useState<
    string | null
  >(null);
  const [edgeSyncNonce, setEdgeSyncNonce] = useState(0);
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const deletingNodeIds = useRef<Set<string>>(new Set());

  const {
    status: { pendingSyncCount, isSyncing, isSyncOnline },
    refs: {
      pendingMoveAfterCreateRef,
      resolvedRealIdByClientRequestRef,
      pendingEdgeSplitByClientRequestRef,
      pendingConnectionCreatesRef,
      pendingLocalPositionUntilConvexMatchesRef,
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
  nodesRef.current = nodes;
  const [connectionDropMenu, setConnectionDropMenu] =
    useState<ConnectionDropMenuState | null>(null);
  const connectionDropMenuRef = useRef<ConnectionDropMenuState | null>(null);
  connectionDropMenuRef.current = connectionDropMenu;

  const [scissorsMode, setScissorsMode] = useState(false);
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
  scissorsModeRef.current = scissorsMode;

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
    deletingNodeIds,
    setAssetBrowserTargetNodeId,
    runBatchRemoveNodesMutation,
    runCreateEdgeMutation,
    runRemoveEdgeMutation,
  });

  const { onReconnectStart, onReconnect, onReconnectEnd } = useCanvasReconnectHandlers({
    canvasId,
    edgeReconnectSuccessful,
    isReconnectDragActiveRef,
    setEdges,
    runCreateEdgeMutation,
    runRemoveEdgeMutation,
    validateConnection: (oldEdge, nextConnection) =>
      validateCanvasConnection(nextConnection, nodes, edges, oldEdge.id),
    onInvalidConnection: (reason) => {
      showConnectionRejectedToast(reason as CanvasConnectionValidationReason);
    },
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
      preferLocalPositionNodeIdsRef,
      isDragging,
      isResizing,
    },
  });

  useEffect(() => {
    if (isDragging.current) return;
    setNodes((nds) => withResolvedCompareData(nds, edges));
  }, [edges]);

  const {
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useCanvasNodeInteractions({
    canvasId,
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
    syncPendingMoveForClientRequest,
  });

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onFlowError = useCallback((id: string, error: string) => {
    if (process.env.NODE_ENV === "production") return;
    console.error("[ReactFlow error]", { canvasId, id, error });
  }, [canvasId]);

  // ─── Future hook seam: connections ────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      const validationError = validateCanvasConnection(connection, nodes, edges);
      if (validationError) {
        showConnectionRejectedToast(validationError);
        return;
      }

      if (!connection.source || !connection.target) return;

      void runCreateEdgeMutation({
        canvasId,
        sourceNodeId: connection.source as Id<"nodes">,
        targetNodeId: connection.target as Id<"nodes">,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      });
    },
    [canvasId, edges, nodes, runCreateEdgeMutation, showConnectionRejectedToast],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      if (isReconnectDragActiveRef.current) return;
      if (connectionState.isValid === true) return;
      const fromNode = connectionState.fromNode;
      const fromHandle = connectionState.fromHandle;
      if (!fromNode || !fromHandle) return;

      const pt = getConnectEndClientPoint(event);
      if (!pt) return;

      const flow = screenToFlowPosition({ x: pt.x, y: pt.y });
      setConnectionDropMenu({
        screenX: pt.x,
        screenY: pt.y,
        flowX: flow.x,
        flowY: flow.y,
        fromNodeId: fromNode.id as Id<"nodes">,
        fromHandleId: fromHandle.id ?? undefined,
        fromHandleType: fromHandle.type,
      });
    },
    [screenToFlowPosition],
  );

  const handleConnectionDropPick = useCallback(
    (template: CanvasNodeTemplate) => {
      const ctx = connectionDropMenuRef.current;
      if (!ctx) return;

      const fromNode = nodesRef.current.find((node) => node.id === ctx.fromNodeId);
      if (!fromNode) {
        showConnectionRejectedToast("unknown-node");
        return;
      }

      const defaults = NODE_DEFAULTS[template.type] ?? {
        width: 200,
        height: 100,
        data: {},
      };
      const clientRequestId = crypto.randomUUID();
      pendingConnectionCreatesRef.current.add(clientRequestId);
      const handles = NODE_HANDLE_MAP[template.type];
      const width = template.width ?? defaults.width;
      const height = template.height ?? defaults.height;
      const data = {
        ...defaults.data,
        ...(template.defaultData as Record<string, unknown>),
        canvasId,
      };

      const base = {
        canvasId,
        type: template.type,
        positionX: ctx.flowX,
        positionY: ctx.flowY,
        width,
        height,
        data,
        clientRequestId,
      };

      const settle = (realId: Id<"nodes">) => {
        void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
          (error: unknown) => {
            console.error("[Canvas] settle syncPendingMove failed", error);
          },
        );
      };

      if (ctx.fromHandleType === "source") {
        const validationError = validateCanvasConnectionByType({
          sourceType: fromNode.type ?? "",
          targetType: template.type,
          targetNodeId: `__pending_${template.type}_${Date.now()}`,
          edges: edgesRef.current,
        });
        if (validationError) {
          showConnectionRejectedToast(validationError);
          return;
        }

        void runCreateNodeWithEdgeFromSourceOnlineOnly({
          ...base,
          sourceNodeId: ctx.fromNodeId,
          sourceHandle: ctx.fromHandleId,
          targetHandle: handles?.target ?? undefined,
        })
          .then((realId) => {
            if (isOptimisticNodeId(realId as string)) {
              return;
            }
            resolvedRealIdByClientRequestRef.current.set(
              clientRequestId,
              realId,
            );
            settle(realId);
            setEdgeSyncNonce((n) => n + 1);
          })
          .catch((error) => {
            pendingConnectionCreatesRef.current.delete(clientRequestId);
            console.error("[Canvas] createNodeWithEdgeFromSource failed", error);
          });
      } else {
        const validationError = validateCanvasConnectionByType({
          sourceType: template.type,
          targetType: fromNode.type ?? "",
          targetNodeId: fromNode.id,
          edges: edgesRef.current,
        });
        if (validationError) {
          showConnectionRejectedToast(validationError);
          return;
        }

        void runCreateNodeWithEdgeToTargetOnlineOnly({
          ...base,
          targetNodeId: ctx.fromNodeId,
          sourceHandle: handles?.source ?? undefined,
          targetHandle: ctx.fromHandleId,
        })
          .then((realId) => {
            if (isOptimisticNodeId(realId as string)) {
              return;
            }
            resolvedRealIdByClientRequestRef.current.set(
              clientRequestId,
              realId,
            );
            settle(realId);
            setEdgeSyncNonce((n) => n + 1);
          })
          .catch((error) => {
            pendingConnectionCreatesRef.current.delete(clientRequestId);
            console.error("[Canvas] createNodeWithEdgeToTarget failed", error);
          });
      }
    },
    [
      canvasId,
      pendingConnectionCreatesRef,
      resolvedRealIdByClientRequestRef,
      runCreateNodeWithEdgeFromSourceOnlineOnly,
      runCreateNodeWithEdgeToTargetOnlineOnly,
      showConnectionRejectedToast,
      syncPendingMoveForClientRequest,
    ],
  );

  // ─── Future hook seam: drop flows ─────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const hasFiles = event.dataTransfer.types.includes("Files");
    event.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      const rawData = event.dataTransfer.getData(
        CANVAS_NODE_DND_MIME,
      );
      if (!rawData) {
        const hasFiles = event.dataTransfer.files && event.dataTransfer.files.length > 0;
        if (hasFiles) {
          if (!isSyncOnline) {
            notifyOfflineUnsupported("Upload per Drag-and-drop");
            return;
          }
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith("image/")) {
            try {
              let dimensions: { width: number; height: number } | undefined;
              try {
                dimensions = await getImageDimensions(file);
              } catch {
                dimensions = undefined;
              }

              const uploadUrl = await generateUploadUrl();
              const result = await fetch(uploadUrl, {
                method: "POST",
                headers: { "Content-Type": file.type },
                body: file,
              });

              if (!result.ok) {
                throw new Error("Upload failed");
              }

              const { storageId } = (await result.json()) as { storageId: string };

              const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              const clientRequestId = crypto.randomUUID();

              void runCreateNodeOnlineOnly({
                canvasId,
                type: "image",
                positionX: position.x,
                positionY: position.y,
                width: NODE_DEFAULTS.image.width,
                height: NODE_DEFAULTS.image.height,
                data: {
                  storageId,
                  filename: file.name,
                  mimeType: file.type,
                  ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
                  canvasId,
                },
                clientRequestId,
              }).then((realId) => {
                void syncPendingMoveForClientRequest(
                  clientRequestId,
                  realId,
                ).catch((error: unknown) => {
                  console.error(
                    "[Canvas] drop createNode syncPendingMove failed",
                    error,
                  );
                });
              });
            } catch (err) {
              console.error("Failed to upload dropped file:", err);
              toast.error(t('canvas.uploadFailed'), err instanceof Error ? err.message : undefined);
            }
            return;
          }
        }
        return;
      }

      // Support both plain type string (sidebar) and JSON payload (browser panels)
      let nodeType: CanvasNodeType | null = null;
      let payloadData: Record<string, unknown> | undefined;

      try {
        const parsed = JSON.parse(rawData);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof (parsed as { type?: unknown }).type === "string" &&
          isCanvasNodeType((parsed as { type: string }).type)
        ) {
          nodeType = (parsed as { type: CanvasNodeType }).type;
          payloadData = parsed.data;
        }
      } catch {
        if (isCanvasNodeType(rawData)) {
          nodeType = rawData;
        }
      }

      if (!nodeType) {
        toast.warning("Node-Typ nicht verfuegbar", "Unbekannter Node konnte nicht erstellt werden.");
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const defaults = NODE_DEFAULTS[nodeType] ?? {
        width: 200,
        height: 100,
        data: {},
      };

      const clientRequestId = crypto.randomUUID();
      void runCreateNodeOnlineOnly({
        canvasId,
        type: nodeType,
        positionX: position.x,
        positionY: position.y,
        width: defaults.width,
        height: defaults.height,
        data: { ...defaults.data, ...payloadData, canvasId },
        clientRequestId,
      }).then((realId) => {
        void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
          (error: unknown) => {
            console.error(
              "[Canvas] createNode syncPendingMove failed",
              error,
            );
          },
        );
      });
    },
    [
      screenToFlowPosition,
      t,
      canvasId,
      generateUploadUrl,
      isSyncOnline,
      runCreateNodeOnlineOnly,
      notifyOfflineUnsupported,
      syncPendingMoveForClientRequest,
    ],
  );

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
          state={connectionDropMenu}
          onClose={() => setConnectionDropMenu(null)}
          onPick={handleConnectionDropPick}
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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onlyRenderVisibleElements
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          connectionLineComponent={CustomConnectionLine}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
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
          className={cn("bg-background", scissorsMode && "canvas-scissors-mode")}
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
