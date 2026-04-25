"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation } from "convex/react";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import {
  getCanvasGraphEdgesFromQuery,
  getCanvasGraphNodesFromQuery,
  setCanvasGraphEdgesInQuery,
  setCanvasGraphNodesInQuery,
} from "./canvas-graph-query-cache";

const CANVAS_HISTORY_LIMIT = 10;

type CanvasHistoryNodeSnapshot = {
  id: string;
  type: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  data: unknown;
  parentId?: string;
  zIndex?: number;
};

type CanvasHistoryEdgeSnapshot = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type CanvasHistorySnapshot = {
  nodes: CanvasHistoryNodeSnapshot[];
  edges: CanvasHistoryEdgeSnapshot[];
};

type CanvasHistoryRestoreIdMaps = {
  nodeIdMap: Record<string, string>;
  edgeIdMap: Record<string, string>;
};

type CanvasHistoryArgs = {
  canvasId: Id<"canvases">;
  nodes: RFNode[];
  edges: RFEdge[];
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  setEdges: Dispatch<SetStateAction<RFEdge[]>>;
  disabled: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripTransientNodeData(data: unknown): unknown {
  if (!isRecord(data)) {
    return data ?? {};
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("_") || key === "retryCount") {
      continue;
    }
    next[key] = value;
  }
  return next;
}

function nodeSize(node: RFNode): { width: number; height: number } {
  const style = node.style as { width?: unknown; height?: unknown } | undefined;
  const measured = node.measured as { width?: unknown; height?: unknown } | undefined;
  const width =
    typeof style?.width === "number"
      ? style.width
      : typeof measured?.width === "number"
        ? measured.width
        : typeof node.width === "number"
          ? node.width
          : 0;
  const height =
    typeof style?.height === "number"
      ? style.height
      : typeof measured?.height === "number"
        ? measured.height
        : typeof node.height === "number"
          ? node.height
          : 0;
  return { width, height };
}

export function normalizeCanvasHistorySnapshot(
  nodes: RFNode[],
  edges: RFEdge[],
): CanvasHistorySnapshot {
  return {
    nodes: nodes
      .filter((node) => !node.id.startsWith("optimistic_"))
      .map((node) => {
        const size = nodeSize(node);
        return {
          id: node.id,
          type: node.type ?? "text",
          positionX: node.position.x,
          positionY: node.position.y,
          width: size.width,
          height: size.height,
          data: stripTransientNodeData(node.data),
          parentId: node.parentId,
          zIndex: node.zIndex,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges
      .filter((edge) => edge.className !== "temp")
      .filter(
        (edge) =>
          !edge.id.startsWith("optimistic_") &&
          !edge.source.startsWith("optimistic_") &&
          !edge.target.startsWith("optimistic_"),
      )
      .map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function snapshotKey(snapshot: CanvasHistorySnapshot): string {
  return JSON.stringify(snapshot);
}

function remapDataReferences(
  data: unknown,
  nodeIdMap: Record<string, string>,
): unknown {
  if (!isRecord(data)) {
    return data;
  }

  const next = { ...data };
  for (const key of ["leftNodeId", "rightNodeId"] as const) {
    const value = next[key];
    if (typeof value === "string") {
      next[key] = nodeIdMap[value] ?? value;
    }
  }
  return next;
}

function remapSnapshot(
  snapshot: CanvasHistorySnapshot,
  maps: CanvasHistoryRestoreIdMaps,
): CanvasHistorySnapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      id: maps.nodeIdMap[node.id] ?? node.id,
      parentId: node.parentId ? maps.nodeIdMap[node.parentId] ?? node.parentId : undefined,
      data: remapDataReferences(node.data, maps.nodeIdMap),
    })),
    edges: snapshot.edges.map((edge) => ({
      ...edge,
      id: maps.edgeIdMap[edge.id] ?? edge.id,
      sourceNodeId: maps.nodeIdMap[edge.sourceNodeId] ?? edge.sourceNodeId,
      targetNodeId: maps.nodeIdMap[edge.targetNodeId] ?? edge.targetNodeId,
    })),
  };
}

function snapshotToNodes(snapshot: CanvasHistorySnapshot): RFNode[] {
  return snapshot.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.positionX, y: node.positionY },
    data: isRecord(node.data) ? node.data : {},
    parentId: node.parentId,
    zIndex: node.zIndex,
    style: {
      width: node.width,
      height: node.height,
    },
  }));
}

function snapshotToEdges(snapshot: CanvasHistorySnapshot): RFEdge[] {
  return snapshot.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }));
}

function snapshotToConvexNodes(
  snapshot: CanvasHistorySnapshot,
  currentNodes: Doc<"nodes">[],
  canvasId: Id<"canvases">,
): Doc<"nodes">[] {
  const currentById = new Map(currentNodes.map((node) => [node._id as string, node]));
  return snapshot.nodes.map((node) => {
    const existing = currentById.get(node.id);
    return {
      _id: node.id as Id<"nodes">,
      _creationTime: existing?._creationTime ?? 0,
      canvasId,
      type: node.type as Doc<"nodes">["type"],
      positionX: node.positionX,
      positionY: node.positionY,
      width: node.width,
      height: node.height,
      status: existing?.status ?? "idle",
      statusMessage: existing?.statusMessage,
      retryCount: existing?.retryCount ?? 0,
      data: node.data as Doc<"nodes">["data"],
      parentId: node.parentId as Id<"nodes"> | undefined,
      zIndex: node.zIndex,
    };
  });
}

function snapshotToConvexEdges(
  snapshot: CanvasHistorySnapshot,
  currentEdges: Doc<"edges">[],
  canvasId: Id<"canvases">,
): Doc<"edges">[] {
  const currentById = new Map(currentEdges.map((edge) => [edge._id as string, edge]));
  return snapshot.edges.map((edge) => ({
    _id: edge.id as Id<"edges">,
    _creationTime: currentById.get(edge.id)?._creationTime ?? 0,
    canvasId,
    sourceNodeId: edge.sourceNodeId as Id<"nodes">,
    targetNodeId: edge.targetNodeId as Id<"nodes">,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }));
}

function appendBounded(
  snapshots: CanvasHistorySnapshot[],
  snapshot: CanvasHistorySnapshot,
): CanvasHistorySnapshot[] {
  const next = [...snapshots, snapshot];
  if (next.length <= CANVAS_HISTORY_LIMIT) {
    return next;
  }
  return next.slice(next.length - CANVAS_HISTORY_LIMIT);
}

function remapStack(
  stack: CanvasHistorySnapshot[],
  maps: CanvasHistoryRestoreIdMaps,
): CanvasHistorySnapshot[] {
  return stack.map((snapshot) => remapSnapshot(snapshot, maps));
}

export function useCanvasHistory({
  canvasId,
  nodes,
  edges,
  setNodes,
  setEdges,
  disabled,
}: CanvasHistoryArgs) {
  const restoreSnapshot = useMutation(api.canvasGraph.restoreSnapshot).withOptimisticUpdate(
    (localStore, args) => {
      const currentNodes = getCanvasGraphNodesFromQuery(localStore, {
        canvasId: args.canvasId,
      });
      const currentEdges = getCanvasGraphEdgesFromQuery(localStore, {
        canvasId: args.canvasId,
      });
      if (!currentNodes || !currentEdges) return;

      const snapshot: CanvasHistorySnapshot = {
        nodes: args.nodes,
        edges: args.edges,
      };
      setCanvasGraphNodesInQuery(localStore, {
        canvasId: args.canvasId,
        nodes: snapshotToConvexNodes(snapshot, currentNodes, args.canvasId),
      });
      setCanvasGraphEdgesInQuery(localStore, {
        canvasId: args.canvasId,
        edges: snapshotToConvexEdges(snapshot, currentEdges, args.canvasId),
      });
    },
  );
  const [past, setPast] = useState<CanvasHistorySnapshot[]>([]);
  const [future, setFuture] = useState<CanvasHistorySnapshot[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const isApplyingRef = useRef(false);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  const presentSnapshot = useCallback(
    () => normalizeCanvasHistorySnapshot(nodesRef.current, edgesRef.current),
    [],
  );

  const capture = useCallback(() => {
    if (isApplyingRef.current) return;

    const snapshot = presentSnapshot();
    const key = snapshotKey(snapshot);
    setPast((currentPast) => {
      const previous = currentPast.at(-1);
      if (previous && snapshotKey(previous) === key) {
        return currentPast;
      }
      return appendBounded(currentPast, snapshot);
    });
    setFuture([]);
  }, [presentSnapshot]);

  const applySnapshot = useCallback(
    async (
      target: CanvasHistorySnapshot,
      rollbackSnapshot: CanvasHistorySnapshot,
    ): Promise<CanvasHistorySnapshot> => {
      isApplyingRef.current = true;
      setIsRestoring(true);
      setNodes(snapshotToNodes(target));
      setEdges(snapshotToEdges(target));
      try {
        const maps = await restoreSnapshot({
          canvasId,
          nodes: target.nodes.map((node) => ({
            ...node,
            type: node.type as never,
            parentId: node.parentId as Id<"nodes"> | undefined,
          })),
          edges: target.edges.map((edge) => ({
            ...edge,
            sourceNodeId: edge.sourceNodeId as Id<"nodes">,
            targetNodeId: edge.targetNodeId as Id<"nodes">,
          })),
        });
        const remappedTarget = remapSnapshot(target, maps);
        setNodes(snapshotToNodes(remappedTarget));
        setEdges(snapshotToEdges(remappedTarget));
        setPast((currentPast) => remapStack(currentPast, maps));
        setFuture((currentFuture) => remapStack(currentFuture, maps));
        return remappedTarget;
      } catch (error) {
        setNodes(snapshotToNodes(rollbackSnapshot));
        setEdges(snapshotToEdges(rollbackSnapshot));
        throw error;
      } finally {
        setIsRestoring(false);
        isApplyingRef.current = false;
      }
    },
    [canvasId, restoreSnapshot, setEdges, setNodes],
  );

  const undo = useCallback(async () => {
    if (isRestoring) {
      return;
    }

    if (disabled || past.length === 0) {
      toast.warning(
        "Rückgängig nicht möglich",
        "Undo ist verfügbar, sobald der Canvas online und vollständig synchronisiert ist.",
      );
      return;
    }

    const target = past[past.length - 1];
    const current = presentSnapshot();
    setPast((currentPast) => currentPast.slice(0, -1));
    setFuture((currentFuture) => appendBounded(currentFuture, current));
    try {
      await applySnapshot(target, current);
    } catch (error) {
      setPast((currentPast) => appendBounded(currentPast, target));
      setFuture((currentFuture) => currentFuture.slice(0, -1));
      toast.error("Rückgängig fehlgeschlagen");
      throw error;
    }
  }, [applySnapshot, disabled, isRestoring, past, presentSnapshot]);

  const redo = useCallback(async () => {
    if (isRestoring) {
      return;
    }

    if (disabled || future.length === 0) {
      toast.warning(
        "Wiederholen nicht möglich",
        "Redo ist verfügbar, sobald der Canvas online und vollständig synchronisiert ist.",
      );
      return;
    }

    const target = future[future.length - 1];
    const current = presentSnapshot();
    setFuture((currentFuture) => currentFuture.slice(0, -1));
    setPast((currentPast) => appendBounded(currentPast, current));
    try {
      await applySnapshot(target, current);
    } catch (error) {
      setFuture((currentFuture) => appendBounded(currentFuture, target));
      setPast((currentPast) => currentPast.slice(0, -1));
      toast.error("Wiederholen fehlgeschlagen");
      throw error;
    }
  }, [applySnapshot, disabled, future, isRestoring, presentSnapshot]);

  return useMemo(
    () => ({
      canUndo: !disabled && past.length > 0,
      canRedo: !disabled && future.length > 0,
      capture,
      undo,
      redo,
      isRestoring,
    }),
    [capture, disabled, future.length, isRestoring, past.length, redo, undo],
  );
}
