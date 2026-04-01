import type { Id } from "@/convex/_generated/dataModel";

const DB_NAME = "lemonspace.canvas.sync";
const DB_VERSION = 1;
const STORE_NAME = "ops";
const FALLBACK_STORAGE_KEY = "lemonspace.canvas:sync-fallback:v1";
export const CANVAS_SYNC_RETENTION_MS = 24 * 60 * 60 * 1000;

export type CanvasSyncOpPayloadByType = {
  createNode: {
    canvasId: Id<"canvases">;
    type: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: unknown;
    parentId?: Id<"nodes">;
    zIndex?: number;
    clientRequestId: string;
  };
  createNodeWithEdgeFromSource: {
    canvasId: Id<"canvases">;
    type: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: unknown;
    parentId?: Id<"nodes">;
    zIndex?: number;
    clientRequestId: string;
    sourceNodeId: Id<"nodes">;
    sourceHandle?: string;
    targetHandle?: string;
  };
  createNodeWithEdgeToTarget: {
    canvasId: Id<"canvases">;
    type: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: unknown;
    parentId?: Id<"nodes">;
    zIndex?: number;
    clientRequestId: string;
    targetNodeId: Id<"nodes">;
    sourceHandle?: string;
    targetHandle?: string;
  };
  createEdge: {
    canvasId: Id<"canvases">;
    sourceNodeId: Id<"nodes">;
    targetNodeId: Id<"nodes">;
    sourceHandle?: string;
    targetHandle?: string;
    clientRequestId: string;
  };
  removeEdge: {
    edgeId: Id<"edges">;
  };
  batchRemoveNodes: {
    nodeIds: Id<"nodes">[];
  };
  moveNode: { nodeId: Id<"nodes">; positionX: number; positionY: number };
  resizeNode: { nodeId: Id<"nodes">; width: number; height: number };
  updateData: { nodeId: Id<"nodes">; data: unknown };
};

export type CanvasSyncOpType = keyof CanvasSyncOpPayloadByType;

type CanvasSyncOpBase = {
  id: string;
  canvasId: string;
  enqueuedAt: number;
  attemptCount: number;
  nextRetryAt: number;
  expiresAt: number;
  lastError?: string;
};

export type CanvasSyncOp = {
  [TType in CanvasSyncOpType]: CanvasSyncOpBase & {
    type: TType;
    payload: CanvasSyncOpPayloadByType[TType];
  };
}[CanvasSyncOpType];

type CanvasSyncOpFor<TType extends CanvasSyncOpType> = Extract<
  CanvasSyncOp,
  { type: TType }
>;

type JsonRecord = Record<string, unknown>;

type EnqueueInput<TType extends CanvasSyncOpType> = {
  id: string;
  canvasId: string;
  type: TType;
  payload: CanvasSyncOpPayloadByType[TType];
  now?: number;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

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

function readFallbackOps(): CanvasSyncOp[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  const parsed = safeParse(storage.getItem(FALLBACK_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is JsonRecord => isRecord(entry))
    .map(normalizeOp)
    .filter((entry): entry is CanvasSyncOp => entry !== null);
}

function writeFallbackOps(ops: CanvasSyncOp[]): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(ops));
  } catch {
    // Ignore storage quota failures in fallback layer.
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) return;
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("by_canvas", "canvasId", { unique: false });
      store.createIndex("by_nextRetryAt", "nextRetryAt", { unique: false });
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      resolve(null);
    };
  });

  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function getNodeIdFromOp(op: CanvasSyncOp): string {
  const payload = op.payload as { nodeId?: string };
  return typeof payload.nodeId === "string" ? payload.nodeId : "";
}

function normalizeOp(raw: unknown): CanvasSyncOp | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  const canvasId = raw.canvasId;
  const type = raw.type;
  const payload = raw.payload;
  if (
    typeof id !== "string" ||
    !id ||
    typeof canvasId !== "string" ||
    !canvasId ||
    type !== "createNode" &&
    type !== "createNodeWithEdgeFromSource" &&
    type !== "createNodeWithEdgeToTarget" &&
    type !== "createEdge" &&
    type !== "removeEdge" &&
    type !== "batchRemoveNodes" &&
    type !== "moveNode" &&
    type !== "resizeNode" &&
    type !== "updateData"
  ) {
    return null;
  }

  const enqueuedAt = typeof raw.enqueuedAt === "number" ? raw.enqueuedAt : Date.now();
  const attemptCount = typeof raw.attemptCount === "number" ? raw.attemptCount : 0;
  const nextRetryAt =
    typeof raw.nextRetryAt === "number" ? raw.nextRetryAt : enqueuedAt;
  const expiresAt =
    typeof raw.expiresAt === "number"
      ? raw.expiresAt
      : enqueuedAt + CANVAS_SYNC_RETENTION_MS;
  const lastError = typeof raw.lastError === "string" ? raw.lastError : undefined;

  if (!isRecord(payload)) return null;

  if (
    type === "createNode" &&
    typeof payload.canvasId === "string" &&
    typeof payload.type === "string" &&
    typeof payload.positionX === "number" &&
    typeof payload.positionY === "number" &&
    typeof payload.width === "number" &&
    typeof payload.height === "number" &&
    typeof payload.clientRequestId === "string"
  ) {
    return {
      id,
      canvasId,
      type,
      payload: {
        canvasId: payload.canvasId as Id<"canvases">,
        type: payload.type,
        positionX: payload.positionX,
        positionY: payload.positionY,
        width: payload.width,
        height: payload.height,
        data: payload.data,
        parentId:
          typeof payload.parentId === "string"
            ? (payload.parentId as Id<"nodes">)
            : undefined,
        zIndex: typeof payload.zIndex === "number" ? payload.zIndex : undefined,
        clientRequestId: payload.clientRequestId,
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  if (
    type === "createNodeWithEdgeFromSource" &&
    typeof payload.canvasId === "string" &&
    typeof payload.type === "string" &&
    typeof payload.positionX === "number" &&
    typeof payload.positionY === "number" &&
    typeof payload.width === "number" &&
    typeof payload.height === "number" &&
    typeof payload.clientRequestId === "string" &&
    typeof payload.sourceNodeId === "string"
  ) {
    return {
      id,
      canvasId,
      type,
      payload: {
        canvasId: payload.canvasId as Id<"canvases">,
        type: payload.type,
        positionX: payload.positionX,
        positionY: payload.positionY,
        width: payload.width,
        height: payload.height,
        data: payload.data,
        parentId:
          typeof payload.parentId === "string"
            ? (payload.parentId as Id<"nodes">)
            : undefined,
        zIndex: typeof payload.zIndex === "number" ? payload.zIndex : undefined,
        clientRequestId: payload.clientRequestId,
        sourceNodeId: payload.sourceNodeId as Id<"nodes">,
        sourceHandle:
          typeof payload.sourceHandle === "string"
            ? payload.sourceHandle
            : undefined,
        targetHandle:
          typeof payload.targetHandle === "string"
            ? payload.targetHandle
            : undefined,
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  if (
    type === "createNodeWithEdgeToTarget" &&
    typeof payload.canvasId === "string" &&
    typeof payload.type === "string" &&
    typeof payload.positionX === "number" &&
    typeof payload.positionY === "number" &&
    typeof payload.width === "number" &&
    typeof payload.height === "number" &&
    typeof payload.clientRequestId === "string" &&
    typeof payload.targetNodeId === "string"
  ) {
    return {
      id,
      canvasId,
      type,
      payload: {
        canvasId: payload.canvasId as Id<"canvases">,
        type: payload.type,
        positionX: payload.positionX,
        positionY: payload.positionY,
        width: payload.width,
        height: payload.height,
        data: payload.data,
        parentId:
          typeof payload.parentId === "string"
            ? (payload.parentId as Id<"nodes">)
            : undefined,
        zIndex: typeof payload.zIndex === "number" ? payload.zIndex : undefined,
        clientRequestId: payload.clientRequestId,
        targetNodeId: payload.targetNodeId as Id<"nodes">,
        sourceHandle:
          typeof payload.sourceHandle === "string"
            ? payload.sourceHandle
            : undefined,
        targetHandle:
          typeof payload.targetHandle === "string"
            ? payload.targetHandle
            : undefined,
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  if (
    type === "createEdge" &&
    typeof payload.canvasId === "string" &&
    typeof payload.sourceNodeId === "string" &&
    typeof payload.targetNodeId === "string" &&
    typeof payload.clientRequestId === "string"
  ) {
    return {
      id,
      canvasId,
      type,
      payload: {
        canvasId: payload.canvasId as Id<"canvases">,
        sourceNodeId: payload.sourceNodeId as Id<"nodes">,
        targetNodeId: payload.targetNodeId as Id<"nodes">,
        sourceHandle:
          typeof payload.sourceHandle === "string"
            ? payload.sourceHandle
            : undefined,
        targetHandle:
          typeof payload.targetHandle === "string"
            ? payload.targetHandle
            : undefined,
        clientRequestId: payload.clientRequestId,
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  if (
    type === "removeEdge" &&
    typeof payload.edgeId === "string"
  ) {
    return {
      id,
      canvasId,
      type,
      payload: {
        edgeId: payload.edgeId as Id<"edges">,
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  if (
    type === "batchRemoveNodes" &&
    Array.isArray(payload.nodeIds) &&
    payload.nodeIds.every((entry) => typeof entry === "string")
  ) {
    return {
      id,
      canvasId,
      type,
      payload: {
        nodeIds: payload.nodeIds as Id<"nodes">[],
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  if (
    type === "moveNode" &&
    typeof payload.nodeId === "string" &&
    typeof payload.positionX === "number" &&
    typeof payload.positionY === "number"
  ) {
    return {
      id,
      canvasId,
      type,
      payload: {
        nodeId: payload.nodeId as Id<"nodes">,
        positionX: payload.positionX,
        positionY: payload.positionY,
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  if (
    type === "resizeNode" &&
    typeof payload.nodeId === "string" &&
    typeof payload.width === "number" &&
    typeof payload.height === "number"
  ) {
    return {
      id,
      canvasId,
      type,
      payload: {
        nodeId: payload.nodeId as Id<"nodes">,
        width: payload.width,
        height: payload.height,
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  if (type === "updateData" && typeof payload.nodeId === "string") {
    return {
      id,
      canvasId,
      type,
      payload: {
        nodeId: payload.nodeId as Id<"nodes">,
        data: payload.data,
      },
      enqueuedAt,
      attemptCount,
      nextRetryAt,
      expiresAt,
      lastError,
    };
  }

  return null;
}

function sortByEnqueued(a: CanvasSyncOp, b: CanvasSyncOp): number {
  if (a.enqueuedAt === b.enqueuedAt) return a.id.localeCompare(b.id);
  return a.enqueuedAt - b.enqueuedAt;
}

function toStoredOp<TType extends CanvasSyncOpType>(
  input: EnqueueInput<TType>,
): CanvasSyncOpFor<TType> {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    canvasId: input.canvasId,
    type: input.type,
    payload: input.payload,
    enqueuedAt: now,
    attemptCount: 0,
    nextRetryAt: now,
    expiresAt: now + CANVAS_SYNC_RETENTION_MS,
  } as CanvasSyncOpFor<TType>;
}

function coalescingNodeId(
  op: Pick<CanvasSyncOp, "type" | "payload">,
): string | null {
  if (op.type !== "moveNode" && op.type !== "resizeNode" && op.type !== "updateData") {
    return null;
  }
  const payload = op.payload as { nodeId?: string };
  return typeof payload.nodeId === "string" && payload.nodeId.length > 0
    ? payload.nodeId
    : null;
}

export async function listCanvasSyncOps(canvasId: string): Promise<CanvasSyncOp[]> {
  const db = await openDb();
  if (!db) {
    return readFallbackOps()
      .filter((entry) => entry.canvasId === canvasId)
      .sort(sortByEnqueued);
  }

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const byCanvas = store.index("by_canvas");
  const records = await reqToPromise(byCanvas.getAll(canvasId));
  return (records as unknown[])
    .map(normalizeOp)
    .filter((entry): entry is CanvasSyncOp => entry !== null)
    .sort(sortByEnqueued);
}

export async function countCanvasSyncOps(canvasId: string): Promise<number> {
  const db = await openDb();
  if (!db) {
    return readFallbackOps().filter((entry) => entry.canvasId === canvasId).length;
  }
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const byCanvas = store.index("by_canvas");
  const count = await reqToPromise(byCanvas.count(canvasId));
  return count;
}

export async function enqueueCanvasSyncOp<TType extends CanvasSyncOpType>(
  input: EnqueueInput<TType>,
): Promise<{ replacedIds: string[] }> {
  const op = toStoredOp(input);
  const existing = await listCanvasSyncOps(input.canvasId);
  const nodeId = coalescingNodeId(op);
  const replacedIds: string[] = [];

  for (const candidate of existing) {
    if (candidate.type !== op.type) continue;
    if (nodeId === null) continue;
    if (getNodeIdFromOp(candidate) !== nodeId) continue;
    replacedIds.push(candidate.id);
  }

  const db = await openDb();
  if (!db) {
    const fallback = readFallbackOps().filter(
      (entry) => !replacedIds.includes(entry.id),
    );
    fallback.push(op);
    writeFallbackOps(fallback);
    return { replacedIds };
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const id of replacedIds) {
    store.delete(id);
  }
  store.put(op);
  await txDone(tx);
  return { replacedIds };
}

export async function ackCanvasSyncOp(opId: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    const fallback = readFallbackOps().filter((entry) => entry.id !== opId);
    writeFallbackOps(fallback);
    return;
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(opId);
  await txDone(tx);
}

export async function markCanvasSyncOpFailed(
  opId: string,
  opts: { nextRetryAt: number; lastError?: string },
): Promise<void> {
  const db = await openDb();
  if (!db) {
    const fallback = readFallbackOps().map((entry) => {
      if (entry.id !== opId) return entry;
      return {
        ...entry,
        attemptCount: entry.attemptCount + 1,
        nextRetryAt: opts.nextRetryAt,
        lastError: opts.lastError,
      };
    });
    writeFallbackOps(fallback);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(opId);

    getReq.onerror = () => reject(getReq.error ?? new Error("IndexedDB get failed"));
    getReq.onsuccess = () => {
      const current = normalizeOp(getReq.result);
      if (!current) return;
      const next: CanvasSyncOp = {
        ...current,
        attemptCount: current.attemptCount + 1,
        nextRetryAt: opts.nextRetryAt,
        lastError: opts.lastError,
      };
      store.put(next);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function dropExpiredCanvasSyncOps(
  canvasId: string,
  now: number,
): Promise<string[]> {
  const all = await listCanvasSyncOps(canvasId);
  const expiredIds = all
    .filter((entry) => entry.expiresAt <= now)
    .map((entry) => entry.id);
  if (expiredIds.length === 0) return [];

  const db = await openDb();
  if (!db) {
    const fallback = readFallbackOps().filter((entry) => !expiredIds.includes(entry.id));
    writeFallbackOps(fallback);
    return expiredIds;
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const id of expiredIds) {
    store.delete(id);
  }
  await txDone(tx);
  return expiredIds;
}

function remapNodeIdInPayload(
  op: CanvasSyncOp,
  fromNodeId: string,
  toNodeId: string,
): CanvasSyncOp {
  if (op.type === "createNode" && op.payload.parentId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, parentId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "createNodeWithEdgeFromSource") {
    let changed = false;
    const next = { ...op.payload };
    if (next.parentId === fromNodeId) {
      next.parentId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (next.sourceNodeId === fromNodeId) {
      next.sourceNodeId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (changed) {
      return { ...op, payload: next };
    }
  }
  if (op.type === "createNodeWithEdgeToTarget") {
    let changed = false;
    const next = { ...op.payload };
    if (next.parentId === fromNodeId) {
      next.parentId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (next.targetNodeId === fromNodeId) {
      next.targetNodeId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (changed) {
      return { ...op, payload: next };
    }
  }
  if (op.type === "moveNode" && op.payload.nodeId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, nodeId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "resizeNode" && op.payload.nodeId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, nodeId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "updateData" && op.payload.nodeId === fromNodeId) {
    return {
      ...op,
      payload: { ...op.payload, nodeId: toNodeId as Id<"nodes"> },
    };
  }
  if (op.type === "createEdge") {
    let changed = false;
    const next = { ...op.payload };
    if (next.sourceNodeId === fromNodeId) {
      next.sourceNodeId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (next.targetNodeId === fromNodeId) {
      next.targetNodeId = toNodeId as Id<"nodes">;
      changed = true;
    }
    if (changed) {
      return { ...op, payload: next };
    }
  }
  if (op.type === "batchRemoveNodes") {
    if (!op.payload.nodeIds.includes(fromNodeId as Id<"nodes">)) {
      return op;
    }
    return {
      ...op,
      payload: {
        ...op.payload,
        nodeIds: op.payload.nodeIds.map((nodeId) =>
          nodeId === fromNodeId ? (toNodeId as Id<"nodes">) : nodeId,
        ),
      },
    };
  }
  return op;
}

export async function remapCanvasSyncNodeId(
  canvasId: string,
  fromNodeId: string,
  toNodeId: string,
): Promise<number> {
  const queue = await listCanvasSyncOps(canvasId);
  let changed = 0;
  const nextOps = queue.map((entry) => {
    const next = remapNodeIdInPayload(entry, fromNodeId, toNodeId);
    if (next !== entry) changed += 1;
    return next;
  });
  if (changed === 0) return 0;

  const db = await openDb();
  if (!db) {
    const fallback = readFallbackOps()
      .filter((entry) => entry.canvasId !== canvasId)
      .concat(nextOps);
    writeFallbackOps(fallback);
    return changed;
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const op of nextOps) {
    store.put(op);
  }
  await txDone(tx);
  return changed;
}

function opTouchesNodeId(op: CanvasSyncOp, nodeIdSet: ReadonlySet<string>): boolean {
  if (op.type === "moveNode" || op.type === "resizeNode" || op.type === "updateData") {
    return nodeIdSet.has(op.payload.nodeId);
  }
  if (op.type === "createEdge") {
    return (
      nodeIdSet.has(op.payload.sourceNodeId) || nodeIdSet.has(op.payload.targetNodeId)
    );
  }
  if (op.type === "createNode") {
    return op.payload.parentId !== undefined && nodeIdSet.has(op.payload.parentId);
  }
  if (op.type === "createNodeWithEdgeFromSource") {
    return (
      nodeIdSet.has(op.payload.sourceNodeId) ||
      (op.payload.parentId !== undefined && nodeIdSet.has(op.payload.parentId))
    );
  }
  if (op.type === "createNodeWithEdgeToTarget") {
    return (
      nodeIdSet.has(op.payload.targetNodeId) ||
      (op.payload.parentId !== undefined && nodeIdSet.has(op.payload.parentId))
    );
  }
  if (op.type === "batchRemoveNodes") {
    return op.payload.nodeIds.some((nodeId) => nodeIdSet.has(nodeId));
  }
  return false;
}

function opHasClientRequestId(op: CanvasSyncOp, clientRequestIdSet: ReadonlySet<string>): boolean {
  if (op.type === "createNode") {
    return clientRequestIdSet.has(op.payload.clientRequestId);
  }
  if (op.type === "createNodeWithEdgeFromSource") {
    return clientRequestIdSet.has(op.payload.clientRequestId);
  }
  if (op.type === "createNodeWithEdgeToTarget") {
    return clientRequestIdSet.has(op.payload.clientRequestId);
  }
  if (op.type === "createEdge") {
    return clientRequestIdSet.has(op.payload.clientRequestId);
  }
  return false;
}

function opTouchesEdgeId(op: CanvasSyncOp, edgeIdSet: ReadonlySet<string>): boolean {
  if (op.type === "removeEdge") {
    return edgeIdSet.has(op.payload.edgeId);
  }
  return false;
}

async function dropCanvasSyncOpsByPredicate(
  canvasId: string,
  predicate: (op: CanvasSyncOp) => boolean,
): Promise<string[]> {
  const all = await listCanvasSyncOps(canvasId);
  const idsToDrop = all.filter(predicate).map((entry) => entry.id);
  if (idsToDrop.length === 0) return [];

  const idSet = new Set(idsToDrop);
  const db = await openDb();
  if (!db) {
    const fallback = readFallbackOps().filter((entry) => !idSet.has(entry.id));
    writeFallbackOps(fallback);
    return idsToDrop;
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const id of idsToDrop) {
    store.delete(id);
  }
  await txDone(tx);
  return idsToDrop;
}

export async function dropCanvasSyncOpsByNodeIds(
  canvasId: string,
  nodeIds: string[],
): Promise<string[]> {
  if (nodeIds.length === 0) return [];
  const nodeIdSet = new Set(nodeIds);
  return await dropCanvasSyncOpsByPredicate(canvasId, (op) =>
    opTouchesNodeId(op, nodeIdSet),
  );
}

export async function dropCanvasSyncOpsByClientRequestIds(
  canvasId: string,
  clientRequestIds: string[],
): Promise<string[]> {
  if (clientRequestIds.length === 0) return [];
  const idSet = new Set(clientRequestIds);
  return await dropCanvasSyncOpsByPredicate(canvasId, (op) =>
    opHasClientRequestId(op, idSet),
  );
}

export async function dropCanvasSyncOpsByEdgeIds(
  canvasId: string,
  edgeIds: string[],
): Promise<string[]> {
  if (edgeIds.length === 0) return [];
  const edgeIdSet = new Set(edgeIds);
  return await dropCanvasSyncOpsByPredicate(canvasId, (op) =>
    opTouchesEdgeId(op, edgeIdSet),
  );
}
