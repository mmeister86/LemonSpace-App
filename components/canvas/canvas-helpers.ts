import type { DefaultEdgeOptions, Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { readCanvasOps } from "@/lib/canvas-local-persistence";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { CanvasNodeDeleteBlockReason } from "@/lib/toast-messages";

export const OPTIMISTIC_NODE_PREFIX = "optimistic_";
export const OPTIMISTIC_EDGE_PREFIX = "optimistic_edge_";

export function createCanvasOpId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** @xyflow/react default minZoom ist 0.5 — dreimal weiter raus für große Boards. */
export const CANVAS_MIN_ZOOM = 0.5 / 3;

export function isOptimisticNodeId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_NODE_PREFIX);
}

export function isOptimisticEdgeId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_EDGE_PREFIX);
}

export function clientRequestIdFromOptimisticNodeId(id: string): string | null {
  if (!isOptimisticNodeId(id)) return null;
  const suffix = id.slice(OPTIMISTIC_NODE_PREFIX.length);
  return suffix.length > 0 ? suffix : null;
}

/** Entspricht `optimistic_edge_${clientRequestId}` im createNodeWithEdge*-Optimistic-Update. */
export function clientRequestIdFromOptimisticEdgeId(id: string): string | null {
  if (!isOptimisticEdgeId(id)) return null;
  const suffix = id.slice(OPTIMISTIC_EDGE_PREFIX.length);
  return suffix.length > 0 ? suffix : null;
}

/** Gleiche Handle-Normalisierung wie bei convexEdgeToRF — für Signatur-Vergleich/Carry-over. */
function sanitizeHandleForEdgeSignature(h: string | null | undefined): string {
  if (h === undefined || h === null || h === "null") return "";
  return h;
}

export function rfEdgeConnectionSignature(edge: RFEdge): string {
  return `${edge.source}|${edge.target}|${sanitizeHandleForEdgeSignature(edge.sourceHandle)}|${sanitizeHandleForEdgeSignature(edge.targetHandle)}`;
}

export function getNodeDeleteBlockReason(
  node: RFNode,
): CanvasNodeDeleteBlockReason | null {
  void node;
  return null;
}

export function getConnectEndClientPoint(
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
export type PendingEdgeSplit = {
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

export function withResolvedCompareData(nodes: RFNode[], edges: RFEdge[]): RFNode[] {
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

export function getMiniMapNodeColor(node: RFNode): string {
  return node.type === "frame" ? "transparent" : "#6366f1";
}

export function getMiniMapNodeStrokeColor(node: RFNode): string {
  return node.type === "frame" ? "transparent" : "#4f46e5";
}

export const DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  interactionWidth: 75,
};

export const EDGE_INTERSECTION_HIGHLIGHT_STYLE: NonNullable<RFEdge["style"]> = {
  stroke: "var(--xy-edge-stroke)",
  strokeWidth: 2,
};

export const GENERATION_FAILURE_WINDOW_MS = 5 * 60 * 1000;
export const GENERATION_FAILURE_THRESHOLD = 3;

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

export function getNodeCenterClientPosition(nodeId: string): { x: number; y: number } | null {
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

export function getIntersectedEdgeId(point: { x: number; y: number }): string | null {
  const interactionElement = document
    .elementsFromPoint(point.x, point.y)
    .find((element) => element.classList.contains("react-flow__edge-interaction"));

  if (!interactionElement) {
    return null;
  }

  return getEdgeIdFromInteractionElement(interactionElement);
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest("input, textarea, select, [contenteditable=true]") !== null;
}

export function isEdgeCuttable(edge: RFEdge): boolean {
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
export function collectCuttableEdgesAlongScreenSegment(
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

export function hasHandleKey(
  handles: { source?: string; target?: string } | undefined,
  key: "source" | "target",
): boolean {
  if (!handles) return false;
  return Object.prototype.hasOwnProperty.call(handles, key);
}

export function normalizeHandle(handle: string | null | undefined): string | undefined {
  return handle ?? undefined;
}

function shallowEqualRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

/** Solange der Server noch die Erstellposition liefert, lokale Zielposition nach Pending-Move halten. */
const POSITION_PIN_EPS = 0.5;

export function positionsMatchPin(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) <= POSITION_PIN_EPS && Math.abs(a.y - b.y) <= POSITION_PIN_EPS;
}

export function applyPinnedNodePositions(
  nodes: RFNode[],
  pinned: Map<string, { x: number; y: number }>,
): RFNode[] {
  return nodes.map((node) => {
    const pin = pinned.get(node.id);
    if (!pin) return node;
    if (positionsMatchPin(node.position, pin)) {
      pinned.delete(node.id);
      return node;
    }
    return { ...node, position: { x: pin.x, y: pin.y } };
  });
}

export function applyPinnedNodePositionsReadOnly(
  nodes: RFNode[],
  pinned: ReadonlyMap<string, { x: number; y: number }>,
): RFNode[] {
  return nodes.map((node) => {
    const pin = pinned.get(node.id);
    if (!pin) return node;
    if (positionsMatchPin(node.position, pin)) return node;
    return { ...node, position: { x: pin.x, y: pin.y } };
  });
}

export function inferPendingConnectionNodeHandoff(
  previousNodes: RFNode[],
  incomingConvexNodes: Doc<"nodes">[],
  pendingConnectionCreates: ReadonlySet<string>,
  resolvedRealIdByClientRequest: Map<string, Id<"nodes">>,
): void {
  const unresolvedClientRequestIds: string[] = [];
  for (const clientRequestId of pendingConnectionCreates) {
    if (resolvedRealIdByClientRequest.has(clientRequestId)) continue;
    const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}`;
    const optimisticNodePresent = previousNodes.some(
      (node) => node.id === optimisticNodeId,
    );
    if (optimisticNodePresent) {
      unresolvedClientRequestIds.push(clientRequestId);
    }
  }
  if (unresolvedClientRequestIds.length !== 1) return;

  const previousIds = new Set(previousNodes.map((node) => node.id));
  const newlyAppearedIncomingRealNodeIds = incomingConvexNodes
    .map((node) => node._id as string)
    .filter((id) => !isOptimisticNodeId(id))
    .filter((id) => !previousIds.has(id));

  if (newlyAppearedIncomingRealNodeIds.length !== 1) return;

  const inferredClientRequestId = unresolvedClientRequestIds[0]!;
  const inferredRealId = newlyAppearedIncomingRealNodeIds[0] as Id<"nodes">;
  resolvedRealIdByClientRequest.set(inferredClientRequestId, inferredRealId);
}

function isMoveNodeOpPayload(
  payload: unknown,
): payload is { nodeId: Id<"nodes">; positionX: number; positionY: number } {
  if (typeof payload !== "object" || payload === null) return false;
  const record = payload as Record<string, unknown>;
  return (
    typeof record.nodeId === "string" &&
    typeof record.positionX === "number" &&
    typeof record.positionY === "number"
  );
}

function isBatchMoveNodesOpPayload(
  payload: unknown,
): payload is {
  moves: { nodeId: Id<"nodes">; positionX: number; positionY: number }[];
} {
  if (typeof payload !== "object" || payload === null) return false;
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.moves)) return false;
  return record.moves.every(isMoveNodeOpPayload);
}

export function getPendingMovePinsFromLocalOps(
  canvasId: string,
): Map<string, { x: number; y: number }> {
  const pins = new Map<string, { x: number; y: number }>();
  for (const op of readCanvasOps(canvasId)) {
    if (op.type === "moveNode" && isMoveNodeOpPayload(op.payload)) {
      pins.set(op.payload.nodeId as string, {
        x: op.payload.positionX,
        y: op.payload.positionY,
      });
      continue;
    }
    if (op.type === "batchMoveNodes" && isBatchMoveNodesOpPayload(op.payload)) {
      for (const move of op.payload.moves) {
        pins.set(move.nodeId as string, {
          x: move.positionX,
          y: move.positionY,
        });
      }
    }
  }
  return pins;
}

export function mergeNodesPreservingLocalState(
  previousNodes: RFNode[],
  incomingNodes: RFNode[],
  realIdByClientRequest?: ReadonlyMap<string, Id<"nodes">>,
  /** Nach `onNodesChange` (position) bis `onNodeDragStop`: lokalen Stand gegen veralteten Convex-Snapshot bevorzugen. */
  preferLocalPositionForNodeIds?: ReadonlySet<string>,
): RFNode[] {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));

  const optimisticPredecessorByRealId = new Map<string, RFNode>();
  if (realIdByClientRequest && realIdByClientRequest.size > 0) {
    for (const [clientRequestId, realId] of realIdByClientRequest) {
      const optId = `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}`;
      const pred = previousById.get(optId);
      if (pred) {
        optimisticPredecessorByRealId.set(realId as string, pred);
      }
    }
  }

  return incomingNodes.map((incomingNode) => {
    const handoffPrev = optimisticPredecessorByRealId.get(incomingNode.id);
    if (handoffPrev) {
      return {
        ...incomingNode,
        position: handoffPrev.position,
        selected: handoffPrev.selected,
        dragging: handoffPrev.dragging,
      };
    }

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
      const prevW =
        typeof previousNode.style?.width === "number" ? previousNode.style.width : null;
      const prevH =
        typeof previousNode.style?.height === "number" ? previousNode.style.height : null;
      const inW =
        typeof incomingNode.style?.width === "number" ? incomingNode.style.width : null;
      const inH =
        typeof incomingNode.style?.height === "number" ? incomingNode.style.height : null;
      void prevW;
      void prevH;
      void inW;
      void inH;
    }

    const previousResizing =
      typeof (previousNode as { resizing?: boolean }).resizing === "boolean"
        ? (previousNode as { resizing?: boolean }).resizing
        : false;
    const preferLocalPosition =
      Boolean(previousNode.dragging) ||
      (preferLocalPositionForNodeIds?.has(incomingNode.id) ?? false);
    const isMediaNode =
      incomingNode.type === "asset" ||
      incomingNode.type === "image" ||
      incomingNode.type === "ai-image";
    const shouldPreserveInteractivePosition =
      isMediaNode &&
      (Boolean(previousNode.selected) ||
        Boolean(previousNode.dragging) ||
        previousResizing);
    const shouldPreserveInteractiveSize =
      isMediaNode && (Boolean(previousNode.dragging) || previousResizing);

    const previousStyleWidth =
      typeof previousNode.style?.width === "number" ? previousNode.style.width : null;
    const previousStyleHeight =
      typeof previousNode.style?.height === "number" ? previousNode.style.height : null;
    const incomingStyleWidth =
      typeof incomingNode.style?.width === "number" ? incomingNode.style.width : null;
    const incomingStyleHeight =
      typeof incomingNode.style?.height === "number" ? incomingNode.style.height : null;
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
      (incomingStyleWidth !== previousStyleWidth ||
        incomingStyleHeight !== previousStyleHeight);

    if (shouldPreserveInteractivePosition) {
      const nextStyle =
        shouldPreserveInteractiveSize || !canApplySeedSizeCorrection
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
      position: preferLocalPosition ? previousNode.position : incomingNode.position,
      selected: previousNode.selected,
      dragging: previousNode.dragging,
    };
  });
}
