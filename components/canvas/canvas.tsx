"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  type DefaultEdgeOptions,
  type OnConnectEnd,
  BackgroundVariant,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import "@xyflow/react/dist/style.css";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";

import { nodeTypes } from "./node-types";
import {
  computeBridgeCreatesForDeletedNodes,
  convexNodeDocWithMergedStorageUrl,
  convexNodeToRF,
  convexEdgeToRF,
  convexEdgeToRFWithSourceGlow,
  NODE_DEFAULTS,
  NODE_HANDLE_MAP,
  resolveMediaAspectRatio,
} from "@/lib/canvas-utils";
import {
  AI_IMAGE_NODE_FOOTER_PX,
  AI_IMAGE_NODE_HEADER_PX,
  DEFAULT_ASPECT_RATIO,
  parseAspectRatioString,
} from "@/lib/image-formats";
import CanvasToolbar from "@/components/canvas/canvas-toolbar";
import { CanvasCommandPalette } from "@/components/canvas/canvas-command-palette";
import {
  CanvasConnectionDropMenu,
  type ConnectionDropMenuState,
} from "@/components/canvas/canvas-connection-drop-menu";
import { CanvasPlacementProvider } from "@/components/canvas/canvas-placement-context";
import CustomConnectionLine from "@/components/canvas/custom-connection-line";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";

interface CanvasInnerProps {
  canvasId: Id<"canvases">;
}

const OPTIMISTIC_NODE_PREFIX = "optimistic_";
const OPTIMISTIC_EDGE_PREFIX = "optimistic_edge_";

/** @xyflow/react default minZoom ist 0.5 — dreimal weiter raus für große Boards. */
const CANVAS_MIN_ZOOM = 0.5 / 3;

function isOptimisticNodeId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_NODE_PREFIX);
}

function isOptimisticEdgeId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_EDGE_PREFIX);
}

function clientRequestIdFromOptimisticNodeId(id: string): string | null {
  if (!isOptimisticNodeId(id)) return null;
  const suffix = id.slice(OPTIMISTIC_NODE_PREFIX.length);
  return suffix.length > 0 ? suffix : null;
}

function getConnectEndClientPoint(
  event: MouseEvent | TouchEvent,
): { x: number; y: number } | null {
  if ("clientX" in event && typeof event.clientX === "number") {
    return { x: event.clientX, y: event.clientY };
  }
  const t = (event as TouchEvent).changedTouches?.[0];
  if (t) return { x: t.clientX, y: t.clientY };
  return null;
}

/** Kanten-Split nach Drag: wartet auf echte Node-ID, wenn der Knoten noch optimistisch ist. */
type PendingEdgeSplit = {
  intersectedEdgeId: Id<"edges">;
  sourceNodeId: Id<"nodes">;
  targetNodeId: Id<"nodes">;
  intersectedSourceHandle?: string;
  intersectedTargetHandle?: string;
  middleSourceHandle?: string;
  middleTargetHandle?: string;
  positionX: number;
  positionY: number;
};

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
  stroke: "var(--xy-edge-stroke)",
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

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest("input, textarea, select, [contenteditable=true]") !== null;
}

function isEdgeCuttable(edge: RFEdge): boolean {
  if (edge.className === "temp") return false;
  if (isOptimisticEdgeId(edge.id)) return false;
  return true;
}

/** Abstand in px zwischen Abtastpunkten beim Durchschneiden (kleiner = zuverlässiger bei schnellen Bewegungen). */
const SCISSORS_SEGMENT_SAMPLE_STEP_PX = 4;

function addCuttableEdgeIdAtClientPoint(
  clientX: number,
  clientY: number,
  edgesList: RFEdge[],
  strokeIds: Set<string>,
): void {
  const id = getIntersectedEdgeId({ x: clientX, y: clientY });
  if (!id) return;
  const found = edgesList.find((e) => e.id === id);
  if (found && isEdgeCuttable(found)) strokeIds.add(id);
}

/** Alle Kanten erfassen, deren Hit-Zone die Strecke von (x0,y0) nach (x1,y1) schneidet. */
function collectCuttableEdgesAlongScreenSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  edgesList: RFEdge[],
  strokeIds: Set<string>,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) {
    addCuttableEdgeIdAtClientPoint(x1, y1, edgesList, strokeIds);
    return;
  }
  const steps = Math.max(1, Math.ceil(dist / SCISSORS_SEGMENT_SAMPLE_STEP_PX));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    addCuttableEdgeIdAtClientPoint(
      x0 + dx * t,
      y0 + dy * t,
      edgesList,
      strokeIds,
    );
  }
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

    if (incomingNode.type === "prompt") {
      const prevW = typeof previousNode.style?.width === "number" ? previousNode.style.width : null;
      const prevH = typeof previousNode.style?.height === "number" ? previousNode.style.height : null;
      const inW = typeof incomingNode.style?.width === "number" ? incomingNode.style.width : null;
      const inH = typeof incomingNode.style?.height === "number" ? incomingNode.style.height : null;
      void prevW;
      void prevH;
      void inW;
      void inH;
    }

    const previousResizing =
      typeof (previousNode as { resizing?: boolean }).resizing === "boolean"
        ? (previousNode as { resizing?: boolean }).resizing
        : false;
    const isMediaNode =
      incomingNode.type === "asset" ||
      incomingNode.type === "image" ||
      incomingNode.type === "ai-image";
    const shouldPreserveInteractivePosition =
      isMediaNode && (Boolean(previousNode.selected) || Boolean(previousNode.dragging) || previousResizing);
    const shouldPreserveInteractiveSize =
      isMediaNode && (Boolean(previousNode.dragging) || previousResizing);

    const previousStyleWidth = typeof previousNode.style?.width === "number" ? previousNode.style.width : null;
    const previousStyleHeight = typeof previousNode.style?.height === "number" ? previousNode.style.height : null;
    const incomingStyleWidth = typeof incomingNode.style?.width === "number" ? incomingNode.style.width : null;
    const incomingStyleHeight = typeof incomingNode.style?.height === "number" ? incomingNode.style.height : null;
    const isAssetSeedSize = previousStyleWidth === 260 && previousStyleHeight === 240;
    const isImageSeedSize = previousStyleWidth === 280 && previousStyleHeight === 200;
    const canApplySeedSizeCorrection =
      isMediaNode &&
      Boolean(previousNode.selected) &&
      !previousNode.dragging &&
      !previousResizing &&
      ((incomingNode.type === "asset" && isAssetSeedSize) ||
        (incomingNode.type === "image" && isImageSeedSize)) &&
      incomingStyleWidth !== null &&
      incomingStyleHeight !== null &&
      (incomingStyleWidth !== previousStyleWidth || incomingStyleHeight !== previousStyleHeight);

    if (shouldPreserveInteractivePosition) {
      const nextStyle = shouldPreserveInteractiveSize || !canApplySeedSizeCorrection
        ? previousNode.style
        : incomingNode.style;
      return {
        ...previousNode,
        ...incomingNode,
        position: previousNode.position,
        style: nextStyle,
        selected: previousNode.selected,
        dragging: previousNode.dragging,
      };
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
  const storageUrlsById = useQuery(
    api.storage.batchGetUrlsForCanvas,
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
  const pendingMoveAfterCreateRef = useRef(
    new Map<string, { positionX: number; positionY: number }>(),
  );
  const resolvedRealIdByClientRequestRef = useRef(new Map<string, Id<"nodes">>());
  const pendingEdgeSplitByClientRequestRef = useRef(
    new Map<string, PendingEdgeSplit>(),
  );

  const createNode = useMutation(api.nodes.create).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.nodes.list, {
        canvasId: args.canvasId,
      });
      if (current === undefined) return;

      const tempId = (
        args.clientRequestId
          ? `${OPTIMISTIC_NODE_PREFIX}${args.clientRequestId}`
          : `${OPTIMISTIC_NODE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      ) as Id<"nodes">;

      const synthetic: Doc<"nodes"> = {
        _id: tempId,
        _creationTime: Date.now(),
        canvasId: args.canvasId,
        type: args.type as Doc<"nodes">["type"],
        positionX: args.positionX,
        positionY: args.positionY,
        width: args.width,
        height: args.height,
        status: "idle",
        retryCount: 0,
        data: args.data,
        parentId: args.parentId,
        zIndex: args.zIndex,
      };

      localStore.setQuery(
        api.nodes.list,
        { canvasId: args.canvasId },
        [...current, synthetic],
      );
    },
  );

  const createNodeWithEdgeFromSource = useMutation(
    api.nodes.createWithEdgeFromSource,
  ).withOptimisticUpdate((localStore, args) => {
    const nodeList = localStore.getQuery(api.nodes.list, {
      canvasId: args.canvasId,
    });
    const edgeList = localStore.getQuery(api.edges.list, {
      canvasId: args.canvasId,
    });
    if (nodeList === undefined || edgeList === undefined) return;

    const tempNodeId = (
      args.clientRequestId
        ? `${OPTIMISTIC_NODE_PREFIX}${args.clientRequestId}`
        : `${OPTIMISTIC_NODE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    ) as Id<"nodes">;

    const tempEdgeId = (
      args.clientRequestId
        ? `${OPTIMISTIC_EDGE_PREFIX}${args.clientRequestId}`
        : `${OPTIMISTIC_EDGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    ) as Id<"edges">;

    const syntheticNode: Doc<"nodes"> = {
      _id: tempNodeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    };

    const syntheticEdge: Doc<"edges"> = {
      _id: tempEdgeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: tempNodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    };

    localStore.setQuery(api.nodes.list, { canvasId: args.canvasId }, [
      ...nodeList,
      syntheticNode,
    ]);
    localStore.setQuery(api.edges.list, { canvasId: args.canvasId }, [
      ...edgeList,
      syntheticEdge,
    ]);
  });

  const createNodeWithEdgeToTarget = useMutation(
    api.nodes.createWithEdgeToTarget,
  ).withOptimisticUpdate((localStore, args) => {
    const nodeList = localStore.getQuery(api.nodes.list, {
      canvasId: args.canvasId,
    });
    const edgeList = localStore.getQuery(api.edges.list, {
      canvasId: args.canvasId,
    });
    if (nodeList === undefined || edgeList === undefined) return;

    const tempNodeId = (
      args.clientRequestId
        ? `${OPTIMISTIC_NODE_PREFIX}${args.clientRequestId}`
        : `${OPTIMISTIC_NODE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    ) as Id<"nodes">;

    const tempEdgeId = (
      args.clientRequestId
        ? `${OPTIMISTIC_EDGE_PREFIX}${args.clientRequestId}`
        : `${OPTIMISTIC_EDGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    ) as Id<"edges">;

    const syntheticNode: Doc<"nodes"> = {
      _id: tempNodeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    };

    const syntheticEdge: Doc<"edges"> = {
      _id: tempEdgeId,
      _creationTime: Date.now(),
      canvasId: args.canvasId,
      sourceNodeId: tempNodeId,
      targetNodeId: args.targetNodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    };

    localStore.setQuery(api.nodes.list, { canvasId: args.canvasId }, [
      ...nodeList,
      syntheticNode,
    ]);
    localStore.setQuery(api.edges.list, { canvasId: args.canvasId }, [
      ...edgeList,
      syntheticEdge,
    ]);
  });

  const createNodeWithEdgeSplit = useMutation(api.nodes.createWithEdgeSplit);

  const batchRemoveNodes = useMutation(api.nodes.batchRemove).withOptimisticUpdate(
    (localStore, args) => {
      const nodeList = localStore.getQuery(api.nodes.list, { canvasId });
      const edgeList = localStore.getQuery(api.edges.list, { canvasId });
      if (nodeList === undefined || edgeList === undefined) return;

      const removeSet = new Set<string>(args.nodeIds.map((id) => id as string));
      localStore.setQuery(
        api.nodes.list,
        { canvasId },
        nodeList.filter((n) => !removeSet.has(n._id)),
      );
      localStore.setQuery(
        api.edges.list,
        { canvasId },
        edgeList.filter(
          (e) =>
            !removeSet.has(e.sourceNodeId) && !removeSet.has(e.targetNodeId),
        ),
      );
    },
  );

  const createEdge = useMutation(api.edges.create).withOptimisticUpdate(
    (localStore, args) => {
      const edgeList = localStore.getQuery(api.edges.list, {
        canvasId: args.canvasId,
      });
      if (edgeList === undefined) return;

      const tempId = `${OPTIMISTIC_EDGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}` as Id<"edges">;
      const synthetic: Doc<"edges"> = {
        _id: tempId,
        _creationTime: Date.now(),
        canvasId: args.canvasId,
        sourceNodeId: args.sourceNodeId,
        targetNodeId: args.targetNodeId,
        sourceHandle: args.sourceHandle,
        targetHandle: args.targetHandle,
      };
      localStore.setQuery(
        api.edges.list,
        { canvasId: args.canvasId },
        [...edgeList, synthetic],
      );
    },
  );

  const removeEdge = useMutation(api.edges.remove).withOptimisticUpdate(
    (localStore, args) => {
      const edgeList = localStore.getQuery(api.edges.list, { canvasId });
      if (edgeList === undefined) return;
      localStore.setQuery(
        api.edges.list,
        { canvasId },
        edgeList.filter((e) => e._id !== args.edgeId),
      );
    },
  );

  const splitEdgeAtExistingNodeMut = useMutation(
    api.nodes.splitEdgeAtExistingNode,
  ).withOptimisticUpdate((localStore, args) => {
    const edgeList = localStore.getQuery(api.edges.list, {
      canvasId: args.canvasId,
    });
    const nodeList = localStore.getQuery(api.nodes.list, {
      canvasId: args.canvasId,
    });
    if (edgeList === undefined || nodeList === undefined) return;

    const removed = edgeList.find((e) => e._id === args.splitEdgeId);
    if (!removed) return;

    const t1 = `${OPTIMISTIC_EDGE_PREFIX}s1_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` as Id<"edges">;
    const t2 = `${OPTIMISTIC_EDGE_PREFIX}s2_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` as Id<"edges">;
    const now = Date.now();

    const nextEdges = edgeList.filter((e) => e._id !== args.splitEdgeId);
    nextEdges.push(
      {
        _id: t1,
        _creationTime: now,
        canvasId: args.canvasId,
        sourceNodeId: removed.sourceNodeId,
        targetNodeId: args.middleNodeId,
        sourceHandle: args.splitSourceHandle,
        targetHandle: args.newNodeTargetHandle,
      },
      {
        _id: t2,
        _creationTime: now,
        canvasId: args.canvasId,
        sourceNodeId: args.middleNodeId,
        targetNodeId: removed.targetNodeId,
        sourceHandle: args.newNodeSourceHandle,
        targetHandle: args.splitTargetHandle,
      },
    );
    localStore.setQuery(api.edges.list, { canvasId: args.canvasId }, nextEdges);

    if (args.positionX !== undefined && args.positionY !== undefined) {
      const px = args.positionX;
      const py = args.positionY;
      localStore.setQuery(
        api.nodes.list,
        { canvasId: args.canvasId },
        nodeList.map((n) =>
          n._id === args.middleNodeId
            ? {
                ...n,
                positionX: px,
                positionY: py,
              }
            : n,
        ),
      );
    }
  });

  /** Pairing: create kann vor oder nach Drag-Ende fertig sein. Kanten-Split + Position in einem Convex-Roundtrip wenn split ansteht. */
  const syncPendingMoveForClientRequest = useCallback(
    (clientRequestId: string | undefined, realId?: Id<"nodes">) => {
      if (!clientRequestId) return;

      if (realId !== undefined) {
        const pendingMove = pendingMoveAfterCreateRef.current.get(clientRequestId);
        const splitPayload =
          pendingEdgeSplitByClientRequestRef.current.get(clientRequestId);

        if (splitPayload) {
          pendingEdgeSplitByClientRequestRef.current.delete(clientRequestId);
          if (pendingMove) {
            pendingMoveAfterCreateRef.current.delete(clientRequestId);
          }
          resolvedRealIdByClientRequestRef.current.delete(clientRequestId);
          void splitEdgeAtExistingNodeMut({
            canvasId,
            splitEdgeId: splitPayload.intersectedEdgeId,
            middleNodeId: realId,
            splitSourceHandle: splitPayload.intersectedSourceHandle,
            splitTargetHandle: splitPayload.intersectedTargetHandle,
            newNodeSourceHandle: splitPayload.middleSourceHandle,
            newNodeTargetHandle: splitPayload.middleTargetHandle,
            positionX: pendingMove?.positionX ?? splitPayload.positionX,
            positionY: pendingMove?.positionY ?? splitPayload.positionY,
          }).catch((error: unknown) => {
            console.error("[Canvas pending edge split failed]", {
              clientRequestId,
              realId,
              error: String(error),
            });
          });
          return;
        }

        if (pendingMove) {
          pendingMoveAfterCreateRef.current.delete(clientRequestId);
          resolvedRealIdByClientRequestRef.current.delete(clientRequestId);
          void moveNode({
            nodeId: realId,
            positionX: pendingMove.positionX,
            positionY: pendingMove.positionY,
          });
          return;
        }

        resolvedRealIdByClientRequestRef.current.set(clientRequestId, realId);
        return;
      }

      const r = resolvedRealIdByClientRequestRef.current.get(clientRequestId);
      const p = pendingMoveAfterCreateRef.current.get(clientRequestId);
      if (!r || !p) return;
      pendingMoveAfterCreateRef.current.delete(clientRequestId);
      resolvedRealIdByClientRequestRef.current.delete(clientRequestId);

      const splitPayload =
        pendingEdgeSplitByClientRequestRef.current.get(clientRequestId);
      if (splitPayload) {
        pendingEdgeSplitByClientRequestRef.current.delete(clientRequestId);
        void splitEdgeAtExistingNodeMut({
          canvasId,
          splitEdgeId: splitPayload.intersectedEdgeId,
          middleNodeId: r,
          splitSourceHandle: splitPayload.intersectedSourceHandle,
          splitTargetHandle: splitPayload.intersectedTargetHandle,
          newNodeSourceHandle: splitPayload.middleSourceHandle,
          newNodeTargetHandle: splitPayload.middleTargetHandle,
          positionX: splitPayload.positionX ?? p.positionX,
          positionY: splitPayload.positionY ?? p.positionY,
        }).catch((error: unknown) => {
          console.error("[Canvas pending edge split failed]", {
            clientRequestId,
            realId: r,
            error: String(error),
          });
        });
      } else {
        void moveNode({
          nodeId: r,
          positionX: p.positionX,
          positionY: p.positionY,
        });
      }
    },
    [canvasId, moveNode, splitEdgeAtExistingNodeMut],
  );

  // ─── Lokaler State (für flüssiges Dragging) ───────────────────
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const [connectionDropMenu, setConnectionDropMenu] =
    useState<ConnectionDropMenuState | null>(null);
  const connectionDropMenuRef = useRef<ConnectionDropMenuState | null>(null);
  connectionDropMenuRef.current = connectionDropMenu;

  const [scissorsMode, setScissorsMode] = useState(false);
  const [scissorStrokePreview, setScissorStrokePreview] = useState<
    { x: number; y: number }[] | null
  >(null);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const scissorsModeRef = useRef(scissorsMode);
  scissorsModeRef.current = scissorsMode;

  // Drag-Lock: während des Drags kein Convex-Override
  const isDragging = useRef(false);

  // Delete-Lock: Nodes die gerade gelöscht werden, nicht aus Convex-Sync wiederherstellen
  const deletingNodeIds = useRef<Set<string>>(new Set());

  // Delete Edge on Drop
  const edgeReconnectSuccessful = useRef(true);
  const isReconnectDragActiveRef = useRef(false);
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
      const prevDataById = new Map(
        previousNodes.map((node) => [node.id, node.data as Record<string, unknown>]),
      );
      const enriched = convexNodes.map((node) =>
        convexNodeDocWithMergedStorageUrl(
          node,
          storageUrlsById,
          prevDataById,
        ),
      );
      const incomingNodes = withResolvedCompareData(
        enriched.map(convexNodeToRF),
        edges,
      );
      // Nodes, die gerade optimistisch gelöscht werden, nicht wiederherstellen
      const filteredIncoming = deletingNodeIds.current.size > 0
        ? incomingNodes.filter((node) => !deletingNodeIds.current.has(node.id))
        : incomingNodes;
      return mergeNodesPreservingLocalState(previousNodes, filteredIncoming);
    });
  }, [convexNodes, edges, storageUrlsById]);

  useEffect(() => {
    if (!convexEdges) return;
    setEdges((prev) => {
      const tempEdges = prev.filter((e) => e.className === "temp");
      const sourceTypeByNodeId =
        convexNodes !== undefined
          ? new Map(convexNodes.map((n) => [n._id, n.type]))
          : undefined;
      const glowMode = resolvedTheme === "dark" ? "dark" : "light";
      const mapped = convexEdges.map((edge) =>
        sourceTypeByNodeId
          ? convexEdgeToRFWithSourceGlow(
              edge,
              sourceTypeByNodeId.get(edge.sourceNodeId),
              glowMode,
            )
          : convexEdgeToRF(edge),
      );
      return [...mapped, ...tempEdges];
    });
  }, [convexEdges, convexNodes, resolvedTheme]);

  useEffect(() => {
    if (isDragging.current) return;
    setNodes((nds) => withResolvedCompareData(nds, edges));
  }, [edges]);

  // ─── Node Changes (Drag, Select, Remove) ─────────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removedIds = new Set<string>();
      for (const c of changes) {
        if (c.type === "remove") {
          removedIds.add(c.id);
        }
      }

      setNodes((nds) => {
        const adjustedChanges = changes
          .map((change) => {
          if (change.type !== "dimensions" || !change.dimensions) {
            return change;
          }

          const node = nds.find((candidate) => candidate.id === change.id);
          if (!node) {
            return change;
          }

          const isActiveResize =
            change.resizing === true || change.resizing === false;

          if (node.type === "asset") {
            if (!isActiveResize) {
              return change;
            }

            const nodeData = node.data as {
              intrinsicWidth?: number;
              intrinsicHeight?: number;
              orientation?: string;
            };
            const hasIntrinsicRatioInput =
              typeof nodeData.intrinsicWidth === "number" &&
              nodeData.intrinsicWidth > 0 &&
              typeof nodeData.intrinsicHeight === "number" &&
              nodeData.intrinsicHeight > 0;
            if (!hasIntrinsicRatioInput) {
              return change;
            }

            const targetRatio = resolveMediaAspectRatio(
              nodeData.intrinsicWidth,
              nodeData.intrinsicHeight,
              nodeData.orientation,
            );

            if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
              return change;
            }

            const previousWidth =
              typeof node.style?.width === "number"
                ? node.style.width
                : change.dimensions.width;
            const previousHeight =
              typeof node.style?.height === "number"
                ? node.style.height
                : change.dimensions.height;

            const widthDelta = Math.abs(change.dimensions.width - previousWidth);
            const heightDelta = Math.abs(change.dimensions.height - previousHeight);

            let constrainedWidth = change.dimensions.width;
            let constrainedHeight = change.dimensions.height;

            // Axis with larger delta drives resize; the other axis is ratio-locked.
            if (heightDelta > widthDelta) {
              constrainedWidth = constrainedHeight * targetRatio;
            } else {
              constrainedHeight = constrainedWidth / targetRatio;
            }

            const assetChromeHeight = 88;
            const assetMinPreviewHeight = 120;
            const assetMinNodeHeight = assetChromeHeight + assetMinPreviewHeight;
            const assetMinNodeWidth = 140;

            const minWidthFromHeight = assetMinNodeHeight * targetRatio;
            const minimumAllowedWidth = Math.max(assetMinNodeWidth, minWidthFromHeight);
            const minimumAllowedHeight = minimumAllowedWidth / targetRatio;

            const enforcedWidth = Math.max(constrainedWidth, minimumAllowedWidth);
            const enforcedHeight = Math.max(
              constrainedHeight,
              minimumAllowedHeight,
              assetMinNodeHeight,
            );

            return {
              ...change,
              dimensions: {
                ...change.dimensions,
                width: enforcedWidth,
                height: enforcedHeight,
              },
            };
          }

          if (node.type === "ai-image") {
            if (!isActiveResize) {
              return change;
            }

            const nodeData = node.data as { aspectRatio?: string };
            const arLabel =
              typeof nodeData.aspectRatio === "string" && nodeData.aspectRatio.trim()
                ? nodeData.aspectRatio.trim()
                : DEFAULT_ASPECT_RATIO;

            let arW: number;
            let arH: number;
            try {
              const parsed = parseAspectRatioString(arLabel);
              arW = parsed.w;
              arH = parsed.h;
            } catch {
              return change;
            }

            const chrome = AI_IMAGE_NODE_HEADER_PX + AI_IMAGE_NODE_FOOTER_PX;
            const hPerW = arH / arW;

            const previousWidth =
              typeof node.style?.width === "number"
                ? node.style.width
                : change.dimensions.width;
            const previousHeight =
              typeof node.style?.height === "number"
                ? node.style.height
                : change.dimensions.height;

            const widthDelta = Math.abs(change.dimensions.width - previousWidth);
            const heightDelta = Math.abs(change.dimensions.height - previousHeight);

            let constrainedWidth = change.dimensions.width;
            let constrainedHeight = change.dimensions.height;

            if (heightDelta > widthDelta) {
              const viewportH = Math.max(1, constrainedHeight - chrome);
              constrainedWidth = viewportH * (arW / arH);
              constrainedHeight = chrome + viewportH;
            } else {
              constrainedHeight = chrome + constrainedWidth * hPerW;
            }

            const aiMinViewport = 120;
            const aiMinOuterHeight = chrome + aiMinViewport;
            const aiMinOuterWidthBase = 200;
            const minimumAllowedWidth = Math.max(
              aiMinOuterWidthBase,
              aiMinViewport * (arW / arH),
            );
            const minimumAllowedHeight = Math.max(
              aiMinOuterHeight,
              chrome + minimumAllowedWidth * hPerW,
            );

            let enforcedWidth = Math.max(constrainedWidth, minimumAllowedWidth);
            let enforcedHeight = chrome + enforcedWidth * hPerW;
            if (enforcedHeight < minimumAllowedHeight) {
              enforcedHeight = minimumAllowedHeight;
              enforcedWidth = (enforcedHeight - chrome) * (arW / arH);
            }
            enforcedWidth = Math.max(enforcedWidth, minimumAllowedWidth);
            enforcedHeight = chrome + enforcedWidth * hPerW;

            return {
              ...change,
              dimensions: {
                ...change.dimensions,
                width: enforcedWidth,
                height: enforcedHeight,
              },
            };
          }

          return change;
          })
          .filter((change): change is NodeChange => change !== null);

        const nextNodes = applyNodeChanges(adjustedChanges, nds);

        for (const change of adjustedChanges) {
          if (change.type !== "dimensions") continue;
          if (!change.dimensions) continue;
          if (removedIds.has(change.id)) continue;
          const prevNode = nds.find((node) => node.id === change.id);
          const nextNode = nextNodes.find((node) => node.id === change.id);
          void prevNode;
          void nextNode;
          if (change.resizing !== false) continue;

          void resizeNode({
            nodeId: change.id as Id<"nodes">,
            width: change.dimensions.width,
            height: change.dimensions.height,
          }).catch((error: unknown) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[Canvas] resizeNode failed", error);
            }
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

  const onFlowError = useCallback((code: string, message: string) => {
    if (process.env.NODE_ENV === "production") return;
    console.error("[ReactFlow error]", { canvasId, code, message });
  }, [canvasId]);

  // ─── Delete Edge on Drop ──────────────────────────────────────
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
    isReconnectDragActiveRef.current = true;
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
      try {
        if (!edgeReconnectSuccessful.current) {
          setEdges((eds) => eds.filter((e) => e.id !== edge.id));
          if (edge.className === "temp") {
            edgeReconnectSuccessful.current = true;
            return;
          }

          if (isOptimisticEdgeId(edge.id)) {
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
      } finally {
        isReconnectDragActiveRef.current = false;
      }
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
          const intersectedEdge = intersectedEdgeId
            ? edges.find(
                (edge) =>
                  edge.id === intersectedEdgeId && edge.className !== "temp",
              )
            : undefined;

          const splitHandles = NODE_HANDLE_MAP[node.type ?? ""];
          const splitEligible =
            intersectedEdge !== undefined &&
            splitHandles !== undefined &&
            intersectedEdge.source !== node.id &&
            intersectedEdge.target !== node.id &&
            hasHandleKey(splitHandles, "source") &&
            hasHandleKey(splitHandles, "target");

          if (draggedNodes.length > 1) {
            for (const n of draggedNodes) {
              const cid = clientRequestIdFromOptimisticNodeId(n.id);
              if (cid) {
                pendingMoveAfterCreateRef.current.set(cid, {
                  positionX: n.position.x,
                  positionY: n.position.y,
                });
                syncPendingMoveForClientRequest(cid);
              }
            }
            const realMoves = draggedNodes.filter((n) => !isOptimisticNodeId(n.id));
            if (realMoves.length > 0) {
              await batchMoveNodes({
                moves: realMoves.map((n) => ({
                  nodeId: n.id as Id<"nodes">,
                  positionX: n.position.x,
                  positionY: n.position.y,
                })),
              });
            }

            if (!splitEligible || !intersectedEdge) {
              return;
            }

            const multiCid = clientRequestIdFromOptimisticNodeId(node.id);
            let middleId = node.id as Id<"nodes">;
            if (multiCid) {
              const r = resolvedRealIdByClientRequestRef.current.get(multiCid);
              if (!r) {
                pendingEdgeSplitByClientRequestRef.current.set(multiCid, {
                  intersectedEdgeId: intersectedEdge.id as Id<"edges">,
                  sourceNodeId: intersectedEdge.source as Id<"nodes">,
                  targetNodeId: intersectedEdge.target as Id<"nodes">,
                  intersectedSourceHandle: normalizeHandle(
                    intersectedEdge.sourceHandle,
                  ),
                  intersectedTargetHandle: normalizeHandle(
                    intersectedEdge.targetHandle,
                  ),
                  middleSourceHandle: normalizeHandle(splitHandles.source),
                  middleTargetHandle: normalizeHandle(splitHandles.target),
                  positionX: node.position.x,
                  positionY: node.position.y,
                });
                return;
              }
              middleId = r;
            }

            await splitEdgeAtExistingNodeMut({
              canvasId,
              splitEdgeId: intersectedEdge.id as Id<"edges">,
              middleNodeId: middleId,
              splitSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
              splitTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
              newNodeSourceHandle: normalizeHandle(splitHandles.source),
              newNodeTargetHandle: normalizeHandle(splitHandles.target),
            });
            return;
          }

          if (!splitEligible || !intersectedEdge) {
            const cidSingle = clientRequestIdFromOptimisticNodeId(node.id);
            if (cidSingle) {
              pendingMoveAfterCreateRef.current.set(cidSingle, {
                positionX: node.position.x,
                positionY: node.position.y,
              });
              syncPendingMoveForClientRequest(cidSingle);
            } else {
              await moveNode({
                nodeId: node.id as Id<"nodes">,
                positionX: node.position.x,
                positionY: node.position.y,
              });
            }
            return;
          }

          const singleCid = clientRequestIdFromOptimisticNodeId(node.id);
          if (singleCid) {
            const resolvedSingle =
              resolvedRealIdByClientRequestRef.current.get(singleCid);
            if (!resolvedSingle) {
              pendingMoveAfterCreateRef.current.set(singleCid, {
                positionX: node.position.x,
                positionY: node.position.y,
              });
              pendingEdgeSplitByClientRequestRef.current.set(singleCid, {
                intersectedEdgeId: intersectedEdge.id as Id<"edges">,
                sourceNodeId: intersectedEdge.source as Id<"nodes">,
                targetNodeId: intersectedEdge.target as Id<"nodes">,
                intersectedSourceHandle: normalizeHandle(
                  intersectedEdge.sourceHandle,
                ),
                intersectedTargetHandle: normalizeHandle(
                  intersectedEdge.targetHandle,
                ),
                middleSourceHandle: normalizeHandle(splitHandles.source),
                middleTargetHandle: normalizeHandle(splitHandles.target),
                positionX: node.position.x,
                positionY: node.position.y,
              });
              syncPendingMoveForClientRequest(singleCid);
              return;
            }
            await splitEdgeAtExistingNodeMut({
              canvasId,
              splitEdgeId: intersectedEdge.id as Id<"edges">,
              middleNodeId: resolvedSingle,
              splitSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
              splitTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
              newNodeSourceHandle: normalizeHandle(splitHandles.source),
              newNodeTargetHandle: normalizeHandle(splitHandles.target),
              positionX: node.position.x,
              positionY: node.position.y,
            });
            pendingMoveAfterCreateRef.current.delete(singleCid);
            return;
          }

          await splitEdgeAtExistingNodeMut({
            canvasId,
            splitEdgeId: intersectedEdge.id as Id<"edges">,
            middleNodeId: node.id as Id<"nodes">,
            splitSourceHandle: normalizeHandle(intersectedEdge.sourceHandle),
            splitTargetHandle: normalizeHandle(intersectedEdge.targetHandle),
            newNodeSourceHandle: normalizeHandle(splitHandles.source),
            newNodeTargetHandle: normalizeHandle(splitHandles.target),
            positionX: node.position.x,
            positionY: node.position.y,
          });
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
      edges,
      moveNode,
      setHighlightedIntersectionEdge,
      splitEdgeAtExistingNodeMut,
      syncPendingMoveForClientRequest,
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

      const defaults = NODE_DEFAULTS[template.type] ?? {
        width: 200,
        height: 100,
        data: {},
      };
      const clientRequestId = crypto.randomUUID();
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
        syncPendingMoveForClientRequest(clientRequestId, realId);
      };

      if (ctx.fromHandleType === "source") {
        void createNodeWithEdgeFromSource({
          ...base,
          sourceNodeId: ctx.fromNodeId,
          sourceHandle: ctx.fromHandleId,
          targetHandle: handles?.target ?? undefined,
        })
          .then(settle)
          .catch((error) => {
            console.error("[Canvas] createNodeWithEdgeFromSource failed", error);
          });
      } else {
        void createNodeWithEdgeToTarget({
          ...base,
          targetNodeId: ctx.fromNodeId,
          sourceHandle: handles?.source ?? undefined,
          targetHandle: ctx.fromHandleId,
        })
          .then(settle)
          .catch((error) => {
            console.error("[Canvas] createNodeWithEdgeToTarget failed", error);
          });
      }
    },
    [
      canvasId,
      createNodeWithEdgeFromSource,
      createNodeWithEdgeToTarget,
      syncPendingMoveForClientRequest,
    ],
  );

  // ─── Node löschen → Convex ────────────────────────────────────
  const onNodesDelete = useCallback(
    (deletedNodes: RFNode[]) => {
      const count = deletedNodes.length;
      if (count === 0) return;

      // Optimistic: Node-IDs sofort als "wird gelöscht" markieren
      const idsToDelete = deletedNodes.map((n) => n.id);
      for (const id of idsToDelete) {
        deletingNodeIds.current.add(id);
      }

      const bridgeCreates = computeBridgeCreatesForDeletedNodes(
        deletedNodes,
        nodes,
        edges,
      );
      const edgePromises = bridgeCreates.map((b) =>
        createEdge({
          canvasId,
          sourceNodeId: b.sourceNodeId,
          targetNodeId: b.targetNodeId,
          sourceHandle: b.sourceHandle,
          targetHandle: b.targetHandle,
        }),
      );

      // Batch-Delete + Auto-Reconnect parallel, dann deletingNodeIds aufräumen
      void Promise.all([
        batchRemoveNodes({
          nodeIds: idsToDelete as Id<"nodes">[],
        }),
        ...edgePromises,
      ])
        .then(() => {
          for (const id of idsToDelete) {
            deletingNodeIds.current.delete(id);
          }
        })
        .catch((error: unknown) => {
          console.error("[Canvas] batch remove failed", error);
          // Bei Fehler: deletingNodeIds aufräumen, damit Nodes wieder erscheinen
          for (const id of idsToDelete) {
            deletingNodeIds.current.delete(id);
          }
        });

      if (count > 0) {
        const { title } = msg.canvas.nodesRemoved(count);
        toast.info(title);
      }
    },
    [nodes, edges, batchRemoveNodes, createEdge, canvasId],
  );

  // ─── Edge löschen → Convex ────────────────────────────────────
  const onEdgesDelete = useCallback(
    (deletedEdges: RFEdge[]) => {
      for (const edge of deletedEdges) {
        if (edge.className === "temp") {
          continue;
        }

        if (isOptimisticEdgeId(edge.id)) {
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

      const rawData = event.dataTransfer.getData(
        "application/lemonspace-node-type",
      );
      if (!rawData) {
        return;
      }

      // Support both plain type string (sidebar) and JSON payload (browser panels)
      let nodeType: string;
      let payloadData: Record<string, unknown> | undefined;

      try {
        const parsed = JSON.parse(rawData);
        if (typeof parsed === "object" && parsed.type) {
          nodeType = parsed.type;
          payloadData = parsed.data;
        } else {
          nodeType = rawData;
        }
      } catch {
        nodeType = rawData;
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
      void createNode({
        canvasId,
        type: nodeType,
        positionX: position.x,
        positionY: position.y,
        width: defaults.width,
        height: defaults.height,
        data: { ...defaults.data, ...payloadData, canvasId },
        clientRequestId,
      }).then((realId) => {
        syncPendingMoveForClientRequest(clientRequestId, realId);
      });
    },
    [screenToFlowPosition, createNode, canvasId, syncPendingMoveForClientRequest],
  );

  // ─── Scherenmodus (K) — Kante klicken oder mit Maus durchschneiden ─
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && scissorsModeRef.current) {
        setScissorsMode(false);
        setScissorStrokePreview(null);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.length === 1 && e.key.toLowerCase() === "k";
      if (!k) return;
      if (isEditableKeyboardTarget(e.target)) return;
      e.preventDefault();
      setScissorsMode((prev) => !prev);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!scissorsMode) {
      setScissorStrokePreview(null);
    }
  }, [scissorsMode]);

  const onEdgeClickScissors = useCallback(
    (_event: ReactMouseEvent, edge: RFEdge) => {
      if (!scissorsModeRef.current) return;
      if (!isEdgeCuttable(edge)) return;
      void removeEdge({ edgeId: edge.id as Id<"edges"> }).catch((error) => {
        console.error("[Canvas] scissors edge click remove failed", {
          edgeId: edge.id,
          error: String(error),
        });
      });
    },
    [removeEdge],
  );

  const onScissorsFlowPointerDownCapture = useCallback(
    (event: ReactPointerEvent) => {
      if (!scissorsModeRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const el = event.target as HTMLElement;
      if (el.closest(".react-flow__node")) return;
      if (el.closest(".react-flow__controls")) return;
      if (el.closest(".react-flow__minimap")) return;
      if (!el.closest(".react-flow__pane")) return;
      if (getIntersectedEdgeId({ x: event.clientX, y: event.clientY })) {
        return;
      }

      const strokeIds = new Set<string>();
      const points: { x: number; y: number }[] = [
        { x: event.clientX, y: event.clientY },
      ];
      setScissorStrokePreview(points);

      const handleMove = (ev: PointerEvent) => {
        const prev = points[points.length - 1]!;
        const nx = ev.clientX;
        const ny = ev.clientY;
        collectCuttableEdgesAlongScreenSegment(
          prev.x,
          prev.y,
          nx,
          ny,
          edgesRef.current,
          strokeIds,
        );
        points.push({ x: nx, y: ny });
        setScissorStrokePreview([...points]);
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        setScissorStrokePreview(null);
        if (!scissorsModeRef.current) return;
        for (const id of strokeIds) {
          void removeEdge({ edgeId: id as Id<"edges"> }).catch((error) => {
            console.error("[Canvas] scissors stroke remove failed", {
              edgeId: id,
              error: String(error),
            });
          });
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
      event.preventDefault();
    },
    [removeEdge],
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
    <CanvasPlacementProvider
      canvasId={canvasId}
      createNode={createNode}
      createNodeWithEdgeSplit={createNodeWithEdgeSplit}
      createNodeWithEdgeFromSource={createNodeWithEdgeFromSource}
      createNodeWithEdgeToTarget={createNodeWithEdgeToTarget}
      onCreateNodeSettled={({ clientRequestId, realId }) =>
        syncPendingMoveForClientRequest(clientRequestId, realId)
      }
    >
      <div className="relative h-full w-full">
        <CanvasToolbar canvasName={canvas?.name ?? "canvas"} />
        <CanvasCommandPalette />
        <CanvasConnectionDropMenu
          state={connectionDropMenu}
          onClose={() => setConnectionDropMenu(null)}
          onPick={handleConnectionDropPick}
        />
        {scissorsMode ? (
          <div className="pointer-events-none absolute top-3 left-1/2 z-50 max-w-[min(100%-2rem,28rem)] -translate-x-1/2 rounded-lg bg-popover/95 px-3 py-1.5 text-center text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
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
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onEdgeClick={scissorsMode ? onEdgeClickScissors : undefined}
          onError={onFlowError}
          onDragOver={onDragOver}
          onDrop={onDrop}
          fitView
          minZoom={CANVAS_MIN_ZOOM}
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode="Shift"
          nodesConnectable={!scissorsMode}
          panOnDrag={scissorsMode ? [1, 2] : true}
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
