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
  type DefaultEdgeOptions,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";

import { nodeTypes } from "./node-types";
import {
  convexNodeDocWithMergedStorageUrl,
  convexNodeToRF,
  convexEdgeToRF,
  NODE_DEFAULTS,
  NODE_HANDLE_MAP,
  resolveMediaAspectRatio,
} from "@/lib/canvas-utils";
import CanvasToolbar from "@/components/canvas/canvas-toolbar";
import { CanvasCommandPalette } from "@/components/canvas/canvas-command-palette";
import { CanvasPlacementProvider } from "@/components/canvas/canvas-placement-context";

interface CanvasInnerProps {
  canvasId: Id<"canvases">;
}

const OPTIMISTIC_NODE_PREFIX = "optimistic_";

function isOptimisticNodeId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_NODE_PREFIX);
}

function clientRequestIdFromOptimisticNodeId(id: string): string | null {
  if (!isOptimisticNodeId(id)) return null;
  const suffix = id.slice(OPTIMISTIC_NODE_PREFIX.length);
  return suffix.length > 0 ? suffix : null;
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
    const isMediaNode = incomingNode.type === "asset" || incomingNode.type === "image";
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

  /** Pairing: create kann vor oder nach Drag-Ende fertig sein — was zuerst kommt, speichert; das andere triggert moveNode. */
  const syncPendingMoveForClientRequest = useCallback(
    (clientRequestId: string | undefined, realId?: Id<"nodes">) => {
      if (!clientRequestId) return;

      if (realId !== undefined) {
        const pending = pendingMoveAfterCreateRef.current.get(clientRequestId);
        if (pending) {
          pendingMoveAfterCreateRef.current.delete(clientRequestId);
          resolvedRealIdByClientRequestRef.current.delete(clientRequestId);
          void moveNode({
            nodeId: realId,
            positionX: pending.positionX,
            positionY: pending.positionY,
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
      void moveNode({
        nodeId: r,
        positionX: p.positionX,
        positionY: p.positionY,
      });
    },
    [moveNode],
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
  const createNodeWithEdgeSplit = useMutation(api.nodes.createWithEdgeSplit);
  const batchRemoveNodes = useMutation(api.nodes.batchRemove);
  const createEdge = useMutation(api.edges.create);
  const removeEdge = useMutation(api.edges.remove);

  // ─── Lokaler State (für flüssiges Dragging) ───────────────────
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);

  // Drag-Lock: während des Drags kein Convex-Override
  const isDragging = useRef(false);

  // Delete-Lock: Nodes die gerade gelöscht werden, nicht aus Convex-Sync wiederherstellen
  const deletingNodeIds = useRef<Set<string>>(new Set());

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
      const mapped = convexEdges.map(convexEdgeToRF);
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
          if (!node || node.type !== "asset") {
            return change;
          }

          const isActiveResize =
            change.resizing === true || change.resizing === false;
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
          } else {
            const cid = clientRequestIdFromOptimisticNodeId(node.id);
            if (cid) {
              pendingMoveAfterCreateRef.current.set(cid, {
                positionX: node.position.x,
                positionY: node.position.y,
              });
              syncPendingMoveForClientRequest(cid);
            } else {
              await moveNode({
                nodeId: node.id as Id<"nodes">,
                positionX: node.position.x,
                positionY: node.position.y,
              });
            }
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

      // Auto-Reconnect: Für jeden gelöschten Node eingehende und ausgehende Edges verbinden
      const edgePromises: Promise<unknown>[] = [];
      for (const node of deletedNodes) {
        const incomingEdges = edges.filter((e) => e.target === node.id);
        const outgoingEdges = edges.filter((e) => e.source === node.id);

        if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
          for (const incoming of incomingEdges) {
            for (const outgoing of outgoingEdges) {
              edgePromises.push(
                createEdge({
                  canvasId,
                  sourceNodeId: incoming.source as Id<"nodes">,
                  targetNodeId: outgoing.target as Id<"nodes">,
                  sourceHandle: incoming.sourceHandle ?? undefined,
                  targetHandle: outgoing.targetHandle ?? undefined,
                }),
              );
            }
          }
        }
      }

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
    [edges, batchRemoveNodes, createEdge, canvasId],
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

      const clientRequestId = crypto.randomUUID();
      void createNode({
        canvasId,
        type: nodeType,
        positionX: position.x,
        positionY: position.y,
        width: defaults.width,
        height: defaults.height,
        data: { ...defaults.data, canvasId },
        clientRequestId,
      }).then((realId) => {
        syncPendingMoveForClientRequest(clientRequestId, realId);
      });
    },
    [screenToFlowPosition, createNode, canvasId, syncPendingMoveForClientRequest],
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
      onCreateNodeSettled={({ clientRequestId, realId }) =>
        syncPendingMoveForClientRequest(clientRequestId, realId)
      }
    >
      <div className="relative h-full w-full">
        <CanvasToolbar canvasName={canvas?.name ?? "canvas"} />
        <CanvasCommandPalette />
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
