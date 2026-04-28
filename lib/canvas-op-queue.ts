import {
  canvasSyncOpHasClientRequestId,
  canvasSyncOpTouchesEdgeId,
  canvasSyncOpTouchesNodeId,
  getCanvasSyncOpNodeId,
  getCoalescingCanvasSyncNodeId,
  remapNodeIdInCanvasSyncOp,
} from "@/lib/canvas-sync-op-mutations";
import {
  countStoredCanvasSyncOps,
  deleteStoredCanvasSyncOps,
  listStoredCanvasSyncOps,
  putStoredCanvasSyncOps,
  replaceStoredCanvasSyncOpsForCanvas,
  updateStoredCanvasSyncOp,
} from "@/lib/canvas-sync-op-storage";
import {
  CANVAS_SYNC_RETENTION_MS,
  type CanvasSyncOp,
  type CanvasSyncOpFor,
  type CanvasSyncOpType,
  type EnqueueCanvasSyncOpInput,
} from "@/lib/canvas-sync-op-types";

export { CANVAS_SYNC_RETENTION_MS } from "@/lib/canvas-sync-op-types";
export type {
  CanvasSyncOp,
  CanvasSyncOpPayloadByType,
  CanvasSyncOpType,
} from "@/lib/canvas-sync-op-types";

type EnqueueInput<TType extends CanvasSyncOpType> = EnqueueCanvasSyncOpInput<TType>;

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

export async function listCanvasSyncOps(canvasId: string): Promise<CanvasSyncOp[]> {
  return await listStoredCanvasSyncOps(canvasId);
}

export async function countCanvasSyncOps(canvasId: string): Promise<number> {
  return await countStoredCanvasSyncOps(canvasId);
}

export async function enqueueCanvasSyncOp<TType extends CanvasSyncOpType>(
  input: EnqueueInput<TType>,
): Promise<{ replacedIds: string[] }> {
  const op = toStoredOp(input);
  const existing = await listCanvasSyncOps(input.canvasId);
  const nodeId = getCoalescingCanvasSyncNodeId(op);
  const replacedIds: string[] = [];

  for (const candidate of existing) {
    if (candidate.type !== op.type) continue;
    if (nodeId === null) continue;
    if (getCanvasSyncOpNodeId(candidate) !== nodeId) continue;
    replacedIds.push(candidate.id);
  }

  await putStoredCanvasSyncOps([op], { deleteIds: replacedIds });
  return { replacedIds };
}

export async function ackCanvasSyncOp(opId: string): Promise<void> {
  await deleteStoredCanvasSyncOps([opId]);
}

export async function markCanvasSyncOpFailed(
  opId: string,
  opts: { nextRetryAt: number; lastError?: string },
): Promise<void> {
  await updateStoredCanvasSyncOp(opId, (entry) => ({
    ...entry,
    attemptCount: entry.attemptCount + 1,
    nextRetryAt: opts.nextRetryAt,
    lastError: opts.lastError,
  }));
}

export async function dropExpiredCanvasSyncOps(
  canvasId: string,
  now: number,
): Promise<string[]> {
  const expiredIds = (await listCanvasSyncOps(canvasId))
    .filter((entry) => entry.expiresAt <= now)
    .map((entry) => entry.id);
  await deleteStoredCanvasSyncOps(expiredIds);
  return expiredIds;
}

export async function remapCanvasSyncNodeId(
  canvasId: string,
  fromNodeId: string,
  toNodeId: string,
): Promise<number> {
  const queue = await listCanvasSyncOps(canvasId);
  let changed = 0;
  const nextOps = queue.map((entry) => {
    const next = remapNodeIdInCanvasSyncOp(entry, fromNodeId, toNodeId);
    if (next !== entry) changed += 1;
    return next;
  });
  if (changed === 0) return 0;

  await replaceStoredCanvasSyncOpsForCanvas(canvasId, nextOps);
  return changed;
}

async function dropCanvasSyncOpsByPredicate(
  canvasId: string,
  predicate: (op: CanvasSyncOp) => boolean,
): Promise<string[]> {
  const idsToDrop = (await listCanvasSyncOps(canvasId))
    .filter(predicate)
    .map((entry) => entry.id);
  await deleteStoredCanvasSyncOps(idsToDrop);
  return idsToDrop;
}

export async function dropCanvasSyncOpsByNodeIds(
  canvasId: string,
  nodeIds: string[],
): Promise<string[]> {
  if (nodeIds.length === 0) return [];
  const nodeIdSet = new Set(nodeIds);
  return await dropCanvasSyncOpsByPredicate(canvasId, (op) =>
    canvasSyncOpTouchesNodeId(op, nodeIdSet),
  );
}

export async function dropCanvasSyncOpsByClientRequestIds(
  canvasId: string,
  clientRequestIds: string[],
): Promise<string[]> {
  if (clientRequestIds.length === 0) return [];
  const idSet = new Set(clientRequestIds);
  return await dropCanvasSyncOpsByPredicate(canvasId, (op) =>
    canvasSyncOpHasClientRequestId(op, idSet),
  );
}

export async function dropCanvasSyncOpsByEdgeIds(
  canvasId: string,
  edgeIds: string[],
): Promise<string[]> {
  if (edgeIds.length === 0) return [];
  const edgeIdSet = new Set(edgeIds);
  return await dropCanvasSyncOpsByPredicate(canvasId, (op) =>
    canvasSyncOpTouchesEdgeId(op, edgeIdSet),
  );
}
