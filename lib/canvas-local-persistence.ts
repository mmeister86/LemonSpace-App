const STORAGE_NAMESPACE = "lemonspace.canvas";
const SNAPSHOT_VERSION = 1;
const OPS_VERSION = 1;

type JsonRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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
  const parsed = safeParse(storage.getItem(snapshotKey(canvasId)));
  if (!isRecord(parsed)) return null;
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
  const parsed = safeParse(storage.getItem(opsKey(canvasId)));
  if (!isRecord(parsed)) return fallback;
  if (parsed.version !== OPS_VERSION || !Array.isArray(parsed.ops)) return fallback;

  const ops = parsed.ops
    .filter((op): op is JsonRecord => isRecord(op))
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
    storage.setItem(key, JSON.stringify(value));
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

export function readCanvasOps(canvasId: string): CanvasPendingOp[] {
  return readOpsPayload(canvasId).ops;
}
