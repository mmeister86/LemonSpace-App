import {
  getLocalStorage,
  isJsonRecord,
  safeJsonParse,
  safeStorageGet,
  safeStorageSet,
  type JsonRecord,
} from "@/lib/browser-storage-cache";
import { normalizeCanvasSyncOp } from "@/lib/canvas-sync-op-normalize";
import {
  DB_NAME,
  DB_VERSION,
  FALLBACK_STORAGE_KEY,
  STORE_NAME,
  type CanvasSyncOp,
} from "@/lib/canvas-sync-op-types";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function readFallbackOps(): CanvasSyncOp[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  const parsed = safeJsonParse(safeStorageGet(storage, FALLBACK_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is JsonRecord => isJsonRecord(entry))
    .map(normalizeCanvasSyncOp)
    .filter((entry): entry is CanvasSyncOp => entry !== null);
}

function writeFallbackOps(ops: CanvasSyncOp[]): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    safeStorageSet(storage, FALLBACK_STORAGE_KEY, JSON.stringify(ops));
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

export function sortCanvasSyncOpsByEnqueued(
  a: CanvasSyncOp,
  b: CanvasSyncOp,
): number {
  if (a.enqueuedAt === b.enqueuedAt) return a.id.localeCompare(b.id);
  return a.enqueuedAt - b.enqueuedAt;
}

export async function listStoredCanvasSyncOps(
  canvasId: string,
): Promise<CanvasSyncOp[]> {
  const db = await openDb();
  if (!db) {
    return readFallbackOps()
      .filter((entry) => entry.canvasId === canvasId)
      .sort(sortCanvasSyncOpsByEnqueued);
  }

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const byCanvas = store.index("by_canvas");
  const records = await reqToPromise(byCanvas.getAll(canvasId));
  return (records as unknown[])
    .map(normalizeCanvasSyncOp)
    .filter((entry): entry is CanvasSyncOp => entry !== null)
    .sort(sortCanvasSyncOpsByEnqueued);
}

export async function countStoredCanvasSyncOps(canvasId: string): Promise<number> {
  const db = await openDb();
  if (!db) {
    return readFallbackOps().filter((entry) => entry.canvasId === canvasId).length;
  }

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const byCanvas = store.index("by_canvas");
  return await reqToPromise(byCanvas.count(canvasId));
}

export async function putStoredCanvasSyncOps(
  ops: CanvasSyncOp[],
  opts: { deleteIds?: string[] } = {},
): Promise<void> {
  const deleteIds = opts.deleteIds ?? [];
  const db = await openDb();
  if (!db) {
    const deleteIdSet = new Set(deleteIds);
    const fallback = readFallbackOps().filter((entry) => !deleteIdSet.has(entry.id));
    fallback.push(...ops);
    writeFallbackOps(fallback);
    return;
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const id of deleteIds) {
    store.delete(id);
  }
  for (const op of ops) {
    store.put(op);
  }
  await txDone(tx);
}

export async function deleteStoredCanvasSyncOps(opIds: string[]): Promise<void> {
  if (opIds.length === 0) return;
  const idSet = new Set(opIds);
  const db = await openDb();
  if (!db) {
    writeFallbackOps(readFallbackOps().filter((entry) => !idSet.has(entry.id)));
    return;
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const id of opIds) {
    store.delete(id);
  }
  await txDone(tx);
}

export async function updateStoredCanvasSyncOp(
  opId: string,
  updater: (op: CanvasSyncOp) => CanvasSyncOp,
): Promise<void> {
  const db = await openDb();
  if (!db) {
    writeFallbackOps(
      readFallbackOps().map((entry) => (entry.id === opId ? updater(entry) : entry)),
    );
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(opId);

    getReq.onerror = () => reject(getReq.error ?? new Error("IndexedDB get failed"));
    getReq.onsuccess = () => {
      const current = normalizeCanvasSyncOp(getReq.result);
      if (!current) return;
      store.put(updater(current));
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function replaceStoredCanvasSyncOpsForCanvas(
  canvasId: string,
  nextOps: CanvasSyncOp[],
): Promise<void> {
  const db = await openDb();
  if (!db) {
    const fallback = readFallbackOps()
      .filter((entry) => entry.canvasId !== canvasId)
      .concat(nextOps);
    writeFallbackOps(fallback);
    return;
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const op of nextOps) {
    store.put(op);
  }
  await txDone(tx);
}
