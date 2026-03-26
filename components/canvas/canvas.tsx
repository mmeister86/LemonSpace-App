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
  useNodesInitialized,
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
import { convexNodeToRF, convexEdgeToRF, NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";
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

const MIN_DISTANCE = 150;

function CanvasInner({ canvasId }: CanvasInnerProps) {
  const { screenToFlowPosition, getInternalNode } = useReactFlow();
  const store = useStoreApi();
  const nodesInitialized = useNodesInitialized();
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
  const uninitializedDragNodeIds = useRef<Set<string>>(new Set());

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
        removeEdge({ edgeId: edge.id as Id<"edges"> });
      }
      edgeReconnectSuccessful.current = true;
    },
    [removeEdge],
  );

  // ─── Proximity Connect ────────────────────────────────────────
  const getClosestEdge = useCallback(
    (node: RFNode) => {
      if (!nodesInitialized) {
        if (!uninitializedDragNodeIds.current.has(node.id)) {
          uninitializedDragNodeIds.current.add(node.id);
          console.warn("[Canvas debug] proximity skipped: nodes not initialized", {
            canvasId,
            nodeId: node.id,
            nodeType: node.type,
          });
        }
        return null;
      }

      const { nodeLookup } = store.getState();
      const internalNode = getInternalNode(node.id);
      if (!internalNode) {
        if (!uninitializedDragNodeIds.current.has(node.id)) {
          uninitializedDragNodeIds.current.add(node.id);
          console.warn("[Canvas debug] proximity skipped: missing internal node", {
            canvasId,
            nodeId: node.id,
            nodeType: node.type,
            nodeLookupSize: nodeLookup.size,
          });
        }
        return null;
      }

      const getNodeSize = (n: {
        measured?: { width?: number; height?: number };
        width?: number;
        height?: number;
        internals?: { userNode?: { width?: number; height?: number } };
      }) => {
        const width =
          n.measured?.width ?? n.width ?? n.internals?.userNode?.width ?? 0;
        const height =
          n.measured?.height ?? n.height ?? n.internals?.userNode?.height ?? 0;
        return { width, height };
      };

      const rectDistance = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number },
      ) => {
        const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
        const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
        return Math.sqrt(dx * dx + dy * dy);
      };

      const thisSize = getNodeSize(internalNode);
      const thisRect = {
        x: internalNode.internals.positionAbsolute.x,
        y: internalNode.internals.positionAbsolute.y,
        width: thisSize.width,
        height: thisSize.height,
      };

      let minDist = Number.MAX_VALUE;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let closestN: any = null;

      for (const n of nodeLookup.values()) {
        if (n.id !== internalNode.id) {
          const nSize = getNodeSize(n);
          const nRect = {
            x: n.internals.positionAbsolute.x,
            y: n.internals.positionAbsolute.y,
            width: nSize.width,
            height: nSize.height,
          };
          const d = rectDistance(thisRect, nRect);
          if (d < minDist) {
            minDist = d;
            closestN = n;
          }
        }
      }

      if (!closestN || minDist >= MIN_DISTANCE) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[Canvas proximity debug] skipped: distance", {
            canvasId,
            nodeId: node.id,
            nodeType: node.type,
            closestNodeId: closestN?.id ?? null,
            closestNodeType: closestN?.type ?? null,
            minDist,
            minDistanceThreshold: MIN_DISTANCE,
          });
        }
        return null;
      }

      const closeNodeIsSource =
        closestN.internals.positionAbsolute.x <
        internalNode.internals.positionAbsolute.x;

      const sourceNode = closeNodeIsSource ? closestN : internalNode;
      const targetNode = closeNodeIsSource ? internalNode : closestN;

      const srcHandles = NODE_HANDLE_MAP[sourceNode.type ?? ""] ?? {};
      const tgtHandles = NODE_HANDLE_MAP[targetNode.type ?? ""] ?? {};

      if (!("source" in srcHandles) || !("target" in tgtHandles)) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[Canvas proximity debug] skipped: handle map", {
            canvasId,
            nodeId: node.id,
            nodeType: node.type,
            sourceNodeId: sourceNode.id,
            sourceType: sourceNode.type,
            targetNodeId: targetNode.id,
            targetType: targetNode.type,
            sourceHandles: srcHandles,
            targetHandles: tgtHandles,
            minDist,
          });
        }
        return null;
      }

      // #region agent log
      fetch('http://127.0.0.1:7733/ingest/db1ec129-24cb-483b-98e2-3e7beef6d9cd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'594b9f'},body:JSON.stringify({sessionId:'594b9f',runId:'run3',hypothesisId:'H2-fix',location:'canvas.tsx:getClosestEdge',message:'proximity match with handles',data:{sourceId:sourceNode.id,sourceType:sourceNode.type,targetId:targetNode.id,targetType:targetNode.type,sourceHandle:srcHandles.source,targetHandle:tgtHandles.target,minDist},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      return {
        id: closeNodeIsSource
          ? `${closestN.id}-${node.id}`
          : `${node.id}-${closestN.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: srcHandles.source,
        targetHandle: tgtHandles.target,
      };
    },
    [store, getInternalNode, nodesInitialized, canvasId],
  );

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      const closeEdge = getClosestEdge(node);

      setEdges((es) => {
        const nextEdges = es.filter((e) => e.className !== "temp");
        if (
          closeEdge &&
          !nextEdges.find(
            (ne) =>
              ne.source === closeEdge.source && ne.target === closeEdge.target,
          )
        ) {
          nextEdges.push({ ...closeEdge, className: "temp" });
        }
        return nextEdges;
      });
    },
    [getClosestEdge],
  );

  // ─── Drag Start → Lock ────────────────────────────────────────
  const onNodeDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  // ─── Drag Stop → Commit zu Convex ─────────────────────────────
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: RFNode, draggedNodes: RFNode[]) => {
      // Proximity Connect: closeEdge bestimmen bevor isDragging zurückgesetzt wird
      const closeEdge = getClosestEdge(node);

      if (process.env.NODE_ENV !== "production") {
        console.info("[Canvas proximity debug] drag stop decision", {
          canvasId,
          nodeId: node.id,
          nodeType: node.type,
          draggedCount: draggedNodes.length,
          closeEdge,
        });
      }

      // Proximity Connect: temporäre Edge entfernen, ggf. echte Edge anlegen
      setEdges((es) => {
        const nextEdges = es.filter((e) => e.className !== "temp");
        if (
          closeEdge &&
          !nextEdges.find(
            (ne) =>
              ne.source === closeEdge.source && ne.target === closeEdge.target,
          )
        ) {
          void createEdge({
            canvasId,
            sourceNodeId: closeEdge.source as Id<"nodes">,
            targetNodeId: closeEdge.target as Id<"nodes">,
            sourceHandle: closeEdge.sourceHandle ?? undefined,
            targetHandle: closeEdge.targetHandle ?? undefined,
          })
            .then((edgeId) => {
              if (process.env.NODE_ENV !== "production") {
                console.info("[Canvas proximity debug] edge created", {
                  canvasId,
                  edgeId,
                  sourceNodeId: closeEdge.source,
                  targetNodeId: closeEdge.target,
                  sourceHandle: closeEdge.sourceHandle ?? null,
                  targetHandle: closeEdge.targetHandle ?? null,
                });
              }
            })
            .catch((error) => {
              console.error("[Canvas proximity debug] edge create failed", {
                canvasId,
                sourceNodeId: closeEdge.source,
                targetNodeId: closeEdge.target,
                sourceHandle: closeEdge.sourceHandle ?? null,
                targetHandle: closeEdge.targetHandle ?? null,
                error: String(error),
              });
            });
        }
        return nextEdges;
      });

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
    [moveNode, batchMoveNodes, getClosestEdge, createEdge, canvasId],
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
        removeEdge({ edgeId: edge.id as Id<"edges"> });
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
        onNodeDrag={onNodeDrag}
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
