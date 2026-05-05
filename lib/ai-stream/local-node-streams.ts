export type LocalNodeStreamStatus = "streaming" | "error";

export type LocalNodeStreamSnapshot = {
  text: string;
  status: LocalNodeStreamStatus;
  error?: string;
};

const streams = new Map<string, LocalNodeStreamSnapshot>();
const listeners = new Map<string, Set<() => void>>();

function emit(nodeId: string): void {
  const nodeListeners = listeners.get(nodeId);
  if (!nodeListeners) return;
  for (const listener of nodeListeners) {
    listener();
  }
}

export function subscribeToLocalNodeStream(
  nodeId: string,
  listener: () => void,
): () => void {
  const nodeListeners = listeners.get(nodeId) ?? new Set<() => void>();
  nodeListeners.add(listener);
  listeners.set(nodeId, nodeListeners);

  return () => {
    nodeListeners.delete(listener);
    if (nodeListeners.size === 0) {
      listeners.delete(nodeId);
    }
  };
}

export function getLocalNodeStreamSnapshot(
  nodeId: string,
): LocalNodeStreamSnapshot | undefined {
  return streams.get(nodeId);
}

export function setLocalNodeStream(
  nodeId: string,
  snapshot: LocalNodeStreamSnapshot,
): void {
  streams.set(nodeId, snapshot);
  emit(nodeId);
}

export function appendLocalNodeStreamChunk(nodeId: string, chunk: string): void {
  const current = streams.get(nodeId) ?? { text: "", status: "streaming" as const };
  streams.set(nodeId, {
    ...current,
    text: `${current.text}${chunk}`,
    status: "streaming",
  });
  emit(nodeId);
}

export function markLocalNodeStreamError(nodeId: string, error: string): void {
  const current = streams.get(nodeId) ?? { text: "", status: "error" as const };
  streams.set(nodeId, {
    ...current,
    status: "error",
    error,
  });
  emit(nodeId);
}

export function clearLocalNodeStream(nodeId: string): void {
  streams.delete(nodeId);
  emit(nodeId);
}

export function resetLocalNodeStreamsForTests(): void {
  streams.clear();
  listeners.clear();
}
