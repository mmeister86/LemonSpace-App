"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useStoreApi,
  reconnectEdge,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type DefaultEdgeOptions,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";

import { nodeTypes } from "./node-types";
import {
  convexNodeToRF,
  convexEdgeToRF,
  NODE_DEFAULTS,
  NODE_HANDLE_MAP,
} from "@/lib/canvas-utils";
import CanvasToolbar from "@/components/canvas/canvas-toolbar";
import { CanvasPlacementProvider } from "@/components/canvas/canvas-placement-context";

interface CanvasInnerProps {
  canvasId: Id<"canvases">;
}

function withResolvedCompareData(nodes: RFNode[], edges: RFEdge[]): RFNode[] {
  const persistedEdges = edges.filter((edge) => edge.className !== "temp");
  let hasNodeUpdates = false;

  const nextNodes = nodes.map((node) => {
    if (node.type !== "compare") return node;

    const incoming = persistedEdges.filter((edge) => edge.target === node.id);
    let leftUrl: string | undefined;
    let rightUrl: string | undefined;
    let leftLabel: string | undefined;
    let rightLabel: string | undefined;

    for (const edge of incoming) {
      const source = nodes.find((candidate) => candidate.id === edge.source);
      if (!source) continue;

      const srcData = source.data as { url?: string; label?: string };

      if (edge.targetHandle === "left") {
        leftUrl = srcData.url;
        leftLabel = srcData.label ?? source.type ?? "Before";
      } else if (edge.targetHandle === "right") {
        rightUrl = srcData.url;
        rightLabel = srcData.label ?? source.type ?? "After";
      }
    }

    const current = node.data as {
      leftUrl?: string;
      rightUrl?: string;
      leftLabel?: string;
      rightLabel?: string;
    };

    if (
      current.leftUrl === leftUrl &&
      current.rightUrl === rightUrl &&
      current.leftLabel === leftLabel &&
      current.rightLabel === rightLabel
    ) {
      return node;
    }

    hasNodeUpdates = true;

    return {
      ...node,
      data: { ...node.data, leftUrl, rightUrl, leftLabel, rightLabel },
    };
  });

  return hasNodeUpdates ? nextNodes : nodes;
}

function getMiniMapNodeColor(node: RFNode): string {
  return node.type === "frame" ? "transparent" : "#6366f1";
}

function getMiniMapNodeStrokeColor(node: RFNode): string {
  return node.type === "frame" ? "transparent" : "#4f46e5";
}

const DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  interactionWidth: 75,
};

const EDGE_INTERSECTION_HIGHLIGHT_STYLE: NonNullable<RFEdge["style"]> = {
  stroke: "hsl(var(--foreground))",
  strokeWidth: 2,
};

const GENERATION_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const GENERATION_FAILURE_THRESHOLD = 3;

function getEdgeIdFromInteractionElement(element: Element): string | null {
  const edgeContainer = element.closest(".react-flow__edge");
  if (!edgeContainer) return null;

  const dataId = edgeContainer.getAttribute("data-id");
  if (dataId) return dataId;

  const domId = edgeContainer.getAttribute("id");
  if (domId?.startsWith("reactflow__edge-")) {
    return domId.slice("reactflow__edge-".length);
  }

  return null;
}

function getNodeCenterClientPosition(nodeId: string): { x: number; y: number } | null {
  const nodeElement = Array.from(
    document.querySelectorAll<HTMLElement>(".react-flow__node"),
  ).find((element) => element.dataset.id === nodeId);

  if (!nodeElement) return null;

  const rect = nodeElement.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getIntersectedEdgeId(point: { x: number; y: number }): string | null {
  const interactionElement = document
    .elementsFromPoint(point.x, point.y)
    .find((element) => element.classList.contains("react-flow__edge-interaction"));

  if (!interactionElement) {
    return null;
  }

  return getEdgeIdFromInteractionElement(interactionElement);
}

function hasHandleKey(
  handles: { source?: string; target?: string } | undefined,
  key: "source" | "target",
): boolean {
  if (!handles) return false;
  return Object.prototype.hasOwnProperty.call(handles, key);
}

function normalizeHandle(handle: string | null | undefined): string | undefined {
  return handle ?? undefined;
}

function shallowEqualRecord(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

function mergeNodesPreservingLocalState(
  previousNodes: RFNode[],
  incomingNodes: RFNode[],
): RFNode[] {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));

  return incomingNodes.map((incomingNode) => {
    const previousNode = previousById.get(incomingNode.id);
    if (!previousNode) {
      return incomingNode;
    }

    const previousData = previousNode.data as Record<string, unknown>;
    const incomingData = incomingNode.data as Record<string, unknown>;
    const previousWidth = previousNode.style?.width;
    const previousHeight = previousNode.style?.height;
    const incomingWidth = incomingNode.style?.width;
    const incomingHeight = incomingNode.style?.height;

    const isStructurallyEqual =
      previousNode.type === incomingNode.type &&
      previousNode.parentId === incomingNode.parentId &&
      previousNode.zIndex === incomingNode.zIndex &&
      previousNode.position.x === incomingNode.position.x &&
      previousNode.position.y === incomingNode.position.y &&
      previousWidth === incomingWidth &&
      previousHeight === incomingHeight &&
      shallowEqualRecord(previousData, incomingData);

    if (isStructurallyEqual) {
      return previousNode;
    }

    return {
      ...previousNode,
      ...incomingNode,
      selected: previousNode.selected,
      dragging: previousNode.dragging,
    };
  });
}

function CanvasInner({ canvasId }: CanvasInnerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const storeApi = useStoreApi();
  const { resolvedTheme } = useTheme();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const shouldSkipCanvasQueries =
    isSessionPending || isAuthLoading || !isAuthenticated;
  const convexAuthUserProbe = useQuery(
    api.auth.safeGetAuthUser,
    shouldSkipCanvasQueries ? "skip" : {},
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!isAuthLoading && !isAuthenticated) {
      console.warn("[Canvas debug] mounted without Convex auth", { canvasId });
    }
  }, [canvasId, isAuthLoading, isAuthenticated]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (isAuthLoading || isSessionPending) return;

    console.info("[Canvas auth state]", {
      canvasId,
      convex: {
        isAuthenticated,
        shouldSkipCanvasQueries,
        probeUserId: convexAuthUserProbe?.userId ?? null,
        probeRecordId: convexAuthUserProbe?._id ?? null,
      },
      session: {
        hasUser: Boolean(session?.user),
        email: session?.user?.email ?? null,
      },
    });
  }, [
    canvasId,
    convexAuthUserProbe?._id,
    convexAuthUserProbe?.userId,
    isAuthLoading,
    isAuthenticated,
    isSessionPending,
    session?.user,
    shouldSkipCanvasQueries,
  ]);

  // ─── Convex Realtime Queries ───────────────────────────────────
  const convexNodes = useQuery(
    api.nodes.list,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );
  const convexEdges = useQuery(
    api.edges.list,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );
  const canvas = useQuery(
    api.canvases.get,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );

  // ─── Convex Mutations (exakte Signaturen aus nodes.ts / edges.ts) ──
  const moveNode = useMutation(api.nodes.move);
  const resizeNode = useMutation(api.nodes.resize);
  const batchMoveNodes = useMutation(api.nodes.batchMove);
  const createNode = useMutation(api.nodes.create);
  const removeNode = useMutation(api.nodes.remove);
  const createEdge = useMutation(api.edges.create);
  const removeEdge = useMutation(api.edges.remove);

  // ─── Lokaler State (für flüssiges Dragging) ───────────────────
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);

  // Drag-Lock: während des Drags kein Convex-Override
  const isDragging = useRef(false);

  // Delete Edge on Drop
  const edgeReconnectSuccessful = useRef(true);
  const overlappedEdgeRef = useRef<string | null>(null);
  const highlightedEdgeRef = useRef<string | null>(null);
  const highlightedEdgeOriginalStyleRef = useRef<RFEdge["style"] | undefined>(
    undefined,
  );
  const recentGenerationFailureTimestampsRef = useRef<number[]>([]);
  const previousNodeStatusRef = useRef<Map<string, string | undefined>>(new Map());
  const hasInitializedGenerationFailureTrackingRef = useRef(false);

  useEffect(() => {
    if (!convexNodes) return;

    const nextNodeStatusMap = new Map<string, string | undefined>();
    let detectedGenerationFailures = 0;

    for (const node of convexNodes) {
      nextNodeStatusMap.set(node._id, node.status);

      if (node.type !== "ai-image") {
        continue;
      }

      const previousStatus = previousNodeStatusRef.current.get(node._id);
      if (
        hasInitializedGenerationFailureTrackingRef.current &&
        node.status === "error" &&
        previousStatus !== "error"
      ) {
        detectedGenerationFailures += 1;
      }
    }

    previousNodeStatusRef.current = nextNodeStatusMap;

    if (!hasInitializedGenerationFailureTrackingRef.current) {
      hasInitializedGenerationFailureTrackingRef.current = true;
      return;
    }

    if (detectedGenerationFailures === 0) {
      return;
    }

    const now = Date.now();
    const recentFailures = recentGenerationFailureTimestampsRef.current.filter(
      (timestamp) => now - timestamp <= GENERATION_FAILURE_WINDOW_MS,
    );

    for (let index = 0; index < detectedGenerationFailures; index += 1) {
      recentFailures.push(now);
    }

    if (recentFailures.length >= GENERATION_FAILURE_THRESHOLD) {
      toast.warning(
        msg.ai.openrouterIssues.title,
        msg.ai.openrouterIssues.desc,
      );
      recentGenerationFailureTimestampsRef.current = [];
      return;
    }

    recentGenerationFailureTimestampsRef.current = recentFailures;
  }, [convexNodes]);

  // ─── Convex → Lokaler State Sync ──────────────────────────────
  useEffect(() => {
    if (!convexNodes || isDragging.current) return;
    setNodes((previousNodes) => {
      const incomingNodes = withResolvedCompareData(convexNodes.map(convexNodeToRF), edges);
      return mergeNodesPreservingLocalState(previousNodes, incomingNodes);
    });
  }, [convexNodes, edges]);

  useEffect(() => {
    if (!convexEdges) return;
    setEdges((prev) => {
      const tempEdges = prev.filter((e) => e.className === "temp");
      const mapped = convexEdges.map(convexEdgeToRF);
      // #region agent log
      fetch('http://127.0.0.1:7733/ingest/db1ec129-24cb-483b-98e2-3e7beef6d9cd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'594b9f'},body:JSON.stringify({sessionId:'594b9f',runId:'run1',hypothesisId:'H1-H2',location:'canvas.tsx:edgeSyncEffect',message:'edges passed to ReactFlow',data:{edgeCount:mapped.length,edges:mapped.map(e=>({id:e.id,source:e.source,target:e.target,sourceHandle:e.sourceHandle,targetHandle:e.targetHandle,typeofTH:typeof e.targetHandle,isNullTH:e.targetHandle===null}))},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return [...mapped, ...tempEdges];
    });
  }, [convexEdges]);

  useEffect(() => {
    if (isDragging.current) return;
    setNodes((nds) => withResolvedCompareData(nds, edges));
  }, [edges]);

  // ─── Node Changes (Drag, Select, Remove) ─────────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const nextNodes = applyNodeChanges(changes, nds);

        for (const change of changes) {
          if (change.type !== "dimensions") continue;
          if (change.resizing !== false || !change.dimensions) continue;

          void resizeNode({
            nodeId: change.id as Id<"nodes">,
            width: change.dimensions.width,
            height: change.dimensions.height,
          });
        }

        return nextNodes;
      });
    },
    [resizeNode],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onFlowError = useCallback(
    (code: string, message: string) => {
      if (process.env.NODE_ENV === "production") return;

      if (code !== "015") {
        console.error("[ReactFlow error]", { canvasId, code, message });
        return;
      }

      const state = storeApi.getState() as {
        nodeLookup?: Map<
          string,
          {
            id: string;
            selected?: boolean;
            type?: string;
            measured?: { width?: number; height?: number };
            internals?: { positionAbsolute?: { x: number; y: number } };
          }
        >;
      };

      const uninitializedNodes = Array.from(state.nodeLookup?.values() ?? [])
        .filter(
          (node) =>
            node.measured?.width === undefined ||
            node.measured?.height === undefined,
        )
        .map((node) => ({
          id: node.id,
          type: node.type ?? null,
          selected: Boolean(node.selected),
          measuredWidth: node.measured?.width,
          measuredHeight: node.measured?.height,
          positionAbsolute: node.internals?.positionAbsolute ?? null,
        }));

      console.error("[ReactFlow error 015 diagnostics]", {
        canvasId,
        message,
        localNodeCount: nodes.length,
        localSelectedNodeIds: nodes.filter((n) => n.selected).map((n) => n.id),
        isDragging: isDragging.current,
        uninitializedNodeCount: uninitializedNodes.length,
        uninitializedNodes,
      });
    },
    [canvasId, nodes, storeApi],
  );

  // ─── Delete Edge on Drop ──────────────────────────────────────
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: RFEdge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
    },
    [],
  );

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: RFEdge) => {
      if (!edgeReconnectSuccessful.current) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        if (edge.className === "temp") {
          edgeReconnectSuccessful.current = true;
          return;
        }

        void removeEdge({ edgeId: edge.id as Id<"edges"> }).catch((error) => {
          console.error("[Canvas edge remove failed] reconnect end", {
            edgeId: edge.id,
            edgeClassName: edge.className ?? null,
            source: edge.source,
            target: edge.target,
            error: String(error),
          });
        });
      }
      edgeReconnectSuccessful.current = true;
    },
    [removeEdge],
  );

  const setHighlightedIntersectionEdge = useCallback((edgeId: string | null) => {
    const previousHighlightedEdgeId = highlightedEdgeRef.current;
    if (previousHighlightedEdgeId === edgeId) {
      return;
    }

    setEdges((currentEdges) => {
      let nextEdges = currentEdges;

      if (previousHighlightedEdgeId) {
        nextEdges = nextEdges.map((edge) =>
          edge.id === previousHighlightedEdgeId
            ? {
                ...edge,
                style: highlightedEdgeOriginalStyleRef.current,
              }
            : edge,
        );
      }

      if (!edgeId) {
        highlightedEdgeOriginalStyleRef.current = undefined;
        return nextEdges;
      }

      const edgeToHighlight = nextEdges.find((edge) => edge.id === edgeId);
      if (!edgeToHighlight || edgeToHighlight.className === "temp") {
        highlightedEdgeOriginalStyleRef.current = undefined;
        return nextEdges;
      }

      highlightedEdgeOriginalStyleRef.current = edgeToHighlight.style;

      return nextEdges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              style: {
                ...(edge.style ?? {}),
                ...EDGE_INTERSECTION_HIGHLIGHT_STYLE,
              },
            }
          : edge,
      );
    });

    highlightedEdgeRef.current = edgeId;
  }, []);

  const onNodeDrag = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
      const nodeCenter = getNodeCenterClientPosition(node.id);
      if (!nodeCenter) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      const intersectedEdgeId = getIntersectedEdgeId(nodeCenter);
      if (!intersectedEdgeId) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      const intersectedEdge = edges.find(
        (edge) => edge.id === intersectedEdgeId && edge.className !== "temp",
      );
      if (!intersectedEdge) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      if (
        intersectedEdge.source === node.id ||
        intersectedEdge.target === node.id
      ) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      const handles = NODE_HANDLE_MAP[node.type ?? ""];
      if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
        overlappedEdgeRef.current = null;
        setHighlightedIntersectionEdge(null);
        return;
      }

      overlappedEdgeRef.current = intersectedEdge.id;
      setHighlightedIntersectionEdge(intersectedEdge.id);
    },
    [edges, setHighlightedIntersectionEdge],
  );

  // ─── Drag Start → Lock ────────────────────────────────────────
  const onNodeDragStart = useCallback(() => {
    isDragging.current = true;
    overlappedEdgeRef.current = null;
    setHighlightedIntersectionEdge(null);
  }, [setHighlightedIntersectionEdge]);

  // ─── Drag Stop → Commit zu Convex ─────────────────────────────
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: RFNode, draggedNodes: RFNode[]) => {
      const intersectedEdgeId = overlappedEdgeRef.current;

      void (async () => {
        try {
          // isDragging bleibt true bis alle Mutations resolved sind
          if (draggedNodes.length > 1) {
            await batchMoveNodes({
              moves: draggedNodes.map((n) => ({
                nodeId: n.id as Id<"nodes">,
                positionX: n.position.x,
                positionY: n.position.y,
              })),
            });
          } else {
            await moveNode({
              nodeId: node.id as Id<"nodes">,
              positionX: node.position.x,
              positionY: node.position.y,
            });
          }

          if (!intersectedEdgeId) {
            return;
          }

          const intersectedEdge = edges.find((edge) => edge.id === intersectedEdgeId);
          if (!intersectedEdge || intersectedEdge.className === "temp") {
            return;
          }

          if (
            intersectedEdge.source === node.id ||
            intersectedEdge.target === node.id
          ) {
            return;
          }

          const handles = NODE_HANDLE_MAP[node.type ?? ""];
          if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
            return;
          }

          await createEdge({
            canvasId,
            sourceNodeId: intersectedEdge.source as Id<"nodes">,
            targetNodeId: node.id as Id<"nodes">,
            sourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
            targetHandle: normalizeHandle(handles.target),
          });

          await createEdge({
            canvasId,
            sourceNodeId: node.id as Id<"nodes">,
            targetNodeId: intersectedEdge.target as Id<"nodes">,
            sourceHandle: normalizeHandle(handles.source),
            targetHandle: normalizeHandle(intersectedEdge.targetHandle),
          });

          await removeEdge({ edgeId: intersectedEdge.id as Id<"edges"> });
        } catch (error) {
          console.error("[Canvas edge intersection split failed]", {
            canvasId,
            nodeId: node.id,
            nodeType: node.type,
            intersectedEdgeId,
            error: String(error),
          });
        } finally {
          overlappedEdgeRef.current = null;
          setHighlightedIntersectionEdge(null);
          isDragging.current = false;
        }
      })();
    },
    [
      batchMoveNodes,
      canvasId,
      createEdge,
      edges,
      moveNode,
      removeEdge,
      setHighlightedIntersectionEdge,
    ],
  );

  // ─── Neue Verbindung → Convex Edge ────────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        createEdge({
          canvasId,
          sourceNodeId: connection.source as Id<"nodes">,
          targetNodeId: connection.target as Id<"nodes">,
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
        });
      }
    },
    [createEdge, canvasId],
  );

  // ─── Node löschen → Convex ────────────────────────────────────
  const onNodesDelete = useCallback(
    async (deletedNodes: RFNode[]) => {
      const count = deletedNodes.length;
      for (const node of deletedNodes) {
        const incomingEdges = edges.filter((e) => e.target === node.id);
        const outgoingEdges = edges.filter((e) => e.source === node.id);

        if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
          for (const incoming of incomingEdges) {
            for (const outgoing of outgoingEdges) {
              await createEdge({
                canvasId,
                sourceNodeId: incoming.source as Id<"nodes">,
                targetNodeId: outgoing.target as Id<"nodes">,
                sourceHandle: incoming.sourceHandle ?? undefined,
                targetHandle: outgoing.targetHandle ?? undefined,
              });
            }
          }
        }

        removeNode({ nodeId: node.id as Id<"nodes"> });
      }
      if (count > 0) {
        const { title } = msg.canvas.nodesRemoved(count);
        toast.info(title);
      }
    },
    [edges, removeNode, createEdge, canvasId],
  );

  // ─── Edge löschen → Convex ────────────────────────────────────
  const onEdgesDelete = useCallback(
    (deletedEdges: RFEdge[]) => {
      for (const edge of deletedEdges) {
        if (edge.className === "temp") {
          continue;
        }

        void removeEdge({ edgeId: edge.id as Id<"edges"> }).catch((error) => {
          console.error("[Canvas edge remove failed] edge delete", {
            edgeId: edge.id,
            edgeClassName: edge.className ?? null,
            source: edge.source,
            target: edge.target,
            error: String(error),
          });
        });
      }
    },
    [removeEdge],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData(
        "application/lemonspace-node-type",
      );
      if (!nodeType) {
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

      createNode({
        canvasId,
        type: nodeType,
        positionX: position.x,
        positionY: position.y,
        width: defaults.width,
        height: defaults.height,
        data: { ...defaults.data, canvasId },
      });
    },
    [screenToFlowPosition, createNode, canvasId],
  );

  // ─── Loading State ────────────────────────────────────────────
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
    <CanvasPlacementProvider canvasId={canvasId}>
      <div className="relative h-full w-full">
        <CanvasToolbar canvasName={canvas?.name ?? "canvas"} />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onReconnectStart={onReconnectStart}
          onReconnectEnd={onReconnectEnd}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onError={onFlowError}
          onDragOver={onDragOver}
          onDrop={onDrop}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode="Shift"
          proOptions={{ hideAttribution: true }}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          className="bg-background"
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
    </CanvasPlacementProvider>
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
