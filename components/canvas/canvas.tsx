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
  reconnectEdge,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";

import { nodeTypes } from "./node-types";
import { convexNodeToRF, convexEdgeToRF, NODE_DEFAULTS } from "@/lib/canvas-utils";
import CanvasToolbar from "@/components/canvas/canvas-toolbar";

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

function CanvasInner({ canvasId }: CanvasInnerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const shouldSkipCanvasQueries = isAuthLoading || !isAuthenticated;
  const convexAuthUserProbe = useQuery(
    api.auth.safeGetAuthUser,
    isAuthLoading ? "skip" : {},
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

  // ─── Convex → Lokaler State Sync ──────────────────────────────
  useEffect(() => {
    if (!convexNodes || isDragging.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes(withResolvedCompareData(convexNodes.map(convexNodeToRF), edges));
  }, [convexNodes, edges]);

  useEffect(() => {
    if (!convexEdges) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

          const resizedNode = nextNodes.find((node) => node.id === change.id);
          if (resizedNode?.type !== "frame") continue;

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

  // ─── Drag Start → Lock ────────────────────────────────────────
  const onNodeDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  // ─── Drag Stop → Commit zu Convex ─────────────────────────────
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: RFNode, draggedNodes: RFNode[]) => {
      // isDragging bleibt true bis die Mutation resolved ist → kein Convex-Override möglich
      if (draggedNodes.length > 1) {
        void batchMoveNodes({
          moves: draggedNodes.map((n) => ({
            nodeId: n.id as Id<"nodes">,
            positionX: n.position.x,
            positionY: n.position.y,
          })),
        }).then(() => {
          isDragging.current = false;
        });
      } else {
        void moveNode({
          nodeId: node.id as Id<"nodes">,
          positionX: node.position.x,
          positionY: node.position.y,
        }).then(() => {
          isDragging.current = false;
        });
      }
    },
    [moveNode, batchMoveNodes],
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
    <div className="relative h-full w-full">
      <CanvasToolbar canvasId={canvasId} canvasName={canvas?.name ?? "canvas"} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
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
