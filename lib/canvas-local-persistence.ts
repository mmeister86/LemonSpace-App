import {
  getLocalStorage,
  isJsonRecord,
  type JsonRecord,
  safeJsonParse,
  safeStorageGet,
  safeStorageSet,
} from "@/lib/browser-storage-cache";

const STORAGE_NAMESPACE = "lemonspace.canvas";
const SNAPSHOT_VERSION = 1;
const OPS_VERSION = 1;

type CanvasSnapshotPayload<TNode, TEdge> = {
  version: number;
  updatedAt: number;
  nodes: TNode[];
  edges: TEdge[];
};

type CanvasOpQueuePayload = {
  version: number;
  updatedAt: number;
  ops: CanvasPendingOp[];
};

export type CanvasPendingOp = {
  id: string;
  type: string;
  payload?: unknown;
  enqueuedAt: number;
};

function snapshotKey(canvasId: string): string {
  return `${STORAGE_NAMESPACE}:snapshot:v${SNAPSHOT_VERSION}:${canvasId}`;
}

function opsKey(canvasId: string): string {
  return `${STORAGE_NAMESPACE}:ops:v${OPS_VERSION}:${canvasId}`;
}

function readSnapshotPayload<TNode, TEdge>(
  canvasId: string,
): CanvasSnapshotPayload<TNode, TEdge> | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  const parsed = safeJsonParse(safeStorageGet(storage, snapshotKey(canvasId)));
  if (!isJsonRecord(parsed)) return null;
  const version = parsed.version;
  const nodes = parsed.nodes;
  const edges = parsed.edges;
  if (version !== SNAPSHOT_VERSION) return null;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
  return {
    version: SNAPSHOT_VERSION,
    updatedAt:
      typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    nodes: nodes as TNode[],
    edges: edges as TEdge[],
  };
}

function readOpsPayload(canvasId: string): CanvasOpQueuePayload {
  const fallback: CanvasOpQueuePayload = {
    version: OPS_VERSION,
    updatedAt: Date.now(),
    ops: [],
  };
  const storage = getLocalStorage();
  if (!storage) return fallback;
  const parsed = safeJsonParse(safeStorageGet(storage, opsKey(canvasId)));
  if (!isJsonRecord(parsed)) return fallback;
  if (parsed.version !== OPS_VERSION || !Array.isArray(parsed.ops)) return fallback;

  const ops = parsed.ops
    .filter((op): op is JsonRecord => isJsonRecord(op))
    .filter(
      (op) =>
        typeof op.id === "string" &&
        op.id.length > 0 &&
        typeof op.type === "string" &&
        op.type.length > 0,
    )
    .map((op) => ({
      id: op.id as string,
      type: op.type as string,
      payload: op.payload,
      enqueuedAt:
        typeof op.enqueuedAt === "number" ? op.enqueuedAt : Date.now(),
    }));

  return {
    version: OPS_VERSION,
    updatedAt:
      typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    ops,
  };
}

function writePayload(key: string, value: unknown): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    safeStorageSet(storage, key, JSON.stringify(value));
  } catch {
    // Ignore quota/storage write failures in UX cache layer.
  }
}

export function readCanvasSnapshot<TNode = unknown, TEdge = unknown>(
  canvasId: string,
): { nodes: TNode[]; edges: TEdge[] } | null {
  const parsed = readSnapshotPayload<TNode, TEdge>(canvasId);
  if (!parsed) return null;
  return { nodes: parsed.nodes, edges: parsed.edges };
}

export function writeCanvasSnapshot<TNode, TEdge>(
  canvasId: string,
  snapshot: { nodes: TNode[]; edges: TEdge[] },
): void {
  writePayload(snapshotKey(canvasId), {
    version: SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  });
}

export function enqueueCanvasOp(
  canvasId: string,
  op: Omit<CanvasPendingOp, "enqueuedAt"> & { enqueuedAt?: number },
): string {
  const entry: CanvasPendingOp = {
    ...op,
    enqueuedAt: op.enqueuedAt ?? Date.now(),
  };
  const payload = readOpsPayload(canvasId);
  payload.ops = payload.ops.filter((candidate) => candidate.id !== entry.id);
  payload.ops.push(entry);
  payload.updatedAt = Date.now();
  writePayload(opsKey(canvasId), payload);
  return entry.id;
}

export function resolveCanvasOp(canvasId: string, opId: string): void {
  const payload = readOpsPayload(canvasId);
  const nextOps = payload.ops.filter((op) => op.id !== opId);
  if (nextOps.length === payload.ops.length) return;
  payload.ops = nextOps;
  payload.updatedAt = Date.now();
  writePayload(opsKey(canvasId), payload);
}

export function resolveCanvasOps(canvasId: string, opIds: string[]): void {
  if (opIds.length === 0) return;
  const idSet = new Set(opIds);
  const payload = readOpsPayload(canvasId);
  const nextOps = payload.ops.filter((op) => !idSet.has(op.id));
  if (nextOps.length === payload.ops.length) return;
  payload.ops = nextOps;
  payload.updatedAt = Date.now();
  writePayload(opsKey(canvasId), payload);
}

export function readCanvasOps(canvasId: string): CanvasPendingOp[] {
  return readOpsPayload(canvasId).ops;
}

function opTouchesNodeId(op: CanvasPendingOp, nodeIdSet: ReadonlySet<string>): boolean {
  if (!isJsonRecord(op.payload)) return false;
  const payload = op.payload;

  if (
    (typeof payload.nodeId === "string" && nodeIdSet.has(payload.nodeId)) ||
    (typeof payload.sourceNodeId === "string" && nodeIdSet.has(payload.sourceNodeId)) ||
    (typeof payload.targetNodeId === "string" && nodeIdSet.has(payload.targetNodeId)) ||
    (typeof payload.parentId === "string" && nodeIdSet.has(payload.parentId)) ||
    (typeof payload.middleNodeId === "string" && nodeIdSet.has(payload.middleNodeId))
  ) {
    return true;
  }

  if (Array.isArray(payload.nodeIds)) {
    return payload.nodeIds.some(
      (entry) => typeof entry === "string" && nodeIdSet.has(entry),
    );
  }

  if (Array.isArray(payload.moves)) {
    return payload.moves.some(
      (move) =>
        isJsonRecord(move) &&
        typeof move.nodeId === "string" &&
        nodeIdSet.has(move.nodeId),
    );
  }

  return false;
}

function opHasClientRequestId(
  op: CanvasPendingOp,
  clientRequestIdSet: ReadonlySet<string>,
): boolean {
  if (!isJsonRecord(op.payload)) return false;
  return (
    typeof op.payload.clientRequestId === "string" &&
    clientRequestIdSet.has(op.payload.clientRequestId)
  );
}

function opTouchesEdgeId(op: CanvasPendingOp, edgeIdSet: ReadonlySet<string>): boolean {
  if (!isJsonRecord(op.payload)) return false;
  return (
    (typeof op.payload.edgeId === "string" &&
      edgeIdSet.has(op.payload.edgeId)) ||
    (typeof op.payload.splitEdgeId === "string" &&
      edgeIdSet.has(op.payload.splitEdgeId))
  );
}

function dropCanvasOpsByPredicate(
  canvasId: string,
  predicate: (op: CanvasPendingOp) => boolean,
): string[] {
  const payload = readOpsPayload(canvasId);
  const idsToDrop = payload.ops.filter(predicate).map((op) => op.id);
  if (idsToDrop.length === 0) return [];
  const idSet = new Set(idsToDrop);
  payload.ops = payload.ops.filter((op) => !idSet.has(op.id));
  payload.updatedAt = Date.now();
  writePayload(opsKey(canvasId), payload);
  return idsToDrop;
}

export function dropCanvasOpsByNodeIds(
  canvasId: string,
  nodeIds: string[],
): string[] {
  if (nodeIds.length === 0) return [];
  const nodeIdSet = new Set(nodeIds);
  return dropCanvasOpsByPredicate(canvasId, (op) => opTouchesNodeId(op, nodeIdSet));
}

export function dropCanvasOpsByClientRequestIds(
  canvasId: string,
  clientRequestIds: string[],
): string[] {
  if (clientRequestIds.length === 0) return [];
  const clientRequestIdSet = new Set(clientRequestIds);
  return dropCanvasOpsByPredicate(canvasId, (op) =>
    opHasClientRequestId(op, clientRequestIdSet),
  );
}

export function dropCanvasOpsByEdgeIds(
  canvasId: string,
  edgeIds: string[],
): string[] {
  if (edgeIds.length === 0) return [];
  const edgeIdSet = new Set(edgeIds);
  return dropCanvasOpsByPredicate(canvasId, (op) => opTouchesEdgeId(op, edgeIdSet));
}

function remapNodeIdInPayload(
  payload: unknown,
  fromNodeId: string,
  toNodeId: string,
): { payload: unknown; changed: boolean } {
  if (!isJsonRecord(payload)) return { payload, changed: false };

  let changed = false;
  const nextPayload: JsonRecord = { ...payload };

  for (const key of ["nodeId", "sourceNodeId", "targetNodeId", "parentId"] as const) {
    if (nextPayload[key] === fromNodeId) {
      nextPayload[key] = toNodeId;
      changed = true;
    }
  }
  if (nextPayload.middleNodeId === fromNodeId) {
    nextPayload.middleNodeId = toNodeId;
    changed = true;
  }

  const moves = nextPayload.moves;
  if (Array.isArray(moves)) {
    const remappedMoves = moves.map((move) => {
      if (!isJsonRecord(move)) return move;
      if (move.nodeId !== fromNodeId) return move;
      changed = true;
      return {
        ...move,
        nodeId: toNodeId,
      };
    });
    nextPayload.moves = remappedMoves;
  }

  return { payload: changed ? nextPayload : payload, changed };
}

export function remapCanvasOpNodeId(
  canvasId: string,
  fromNodeId: string,
  toNodeId: string,
): number {
  if (fromNodeId === toNodeId) return 0;

  const payload = readOpsPayload(canvasId);
  let changedCount = 0;

  payload.ops = payload.ops.map((op) => {
    const remapped = remapNodeIdInPayload(op.payload, fromNodeId, toNodeId);
    if (!remapped.changed) return op;
    changedCount += 1;
    return {
      ...op,
      payload: remapped.payload,
    };
  });

  if (changedCount === 0) return 0;

  payload.updatedAt = Date.now();
  writePayload(opsKey(canvasId), payload);
  return changedCount;
}
