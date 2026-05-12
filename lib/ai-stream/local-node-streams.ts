import {
  appendAiRunEvent,
  completeToolCallTrace,
  createToolCallTrace,
  normalizeAiRunEvents,
  normalizeToolCallTraces,
  upsertToolCallTrace,
  type AiRunEvent,
  type AiRunPhase,
  type ToolCallTrace,
} from "@/lib/ai-run-history";

export type LocalNodeStreamStatus = "streaming" | "error";

export type LocalNodeStreamSnapshot = {
  text: string;
  status: LocalNodeStreamStatus;
  phase?: AiRunPhase;
  startedAt?: number;
  events?: AiRunEvent[];
  toolCalls?: ToolCallTrace[];
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
  const events = normalizeAiRunEvents(snapshot.events);
  const toolCalls = normalizeToolCallTraces(snapshot.toolCalls);
  streams.set(nodeId, {
    ...snapshot,
    phase: snapshot.phase ?? "streaming",
    ...(events.length > 0 ? { events } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  });
  emit(nodeId);
}

export function appendLocalNodeStreamChunk(nodeId: string, chunk: string): void {
  const current = streams.get(nodeId) ?? {
    text: "",
    status: "streaming" as const,
    phase: "streaming" as const,
  };
  streams.set(nodeId, {
    ...current,
    text: `${current.text}${chunk}`,
    status: "streaming",
    phase: "streaming",
  });
  emit(nodeId);
}

export function appendLocalNodeStreamEvent(
  nodeId: string,
  event: Parameters<typeof appendAiRunEvent>[1],
): void {
  const current = streams.get(nodeId) ?? {
    text: "",
    status: "streaming" as const,
    phase: event.phase,
  };
  streams.set(nodeId, {
    ...current,
    phase: event.phase,
    events: appendAiRunEvent(current.events, event),
  });
  emit(nodeId);
}

export function createLocalNodeStreamToolCall(
  nodeId: string,
  trace: Parameters<typeof createToolCallTrace>[0],
): void {
  const current = streams.get(nodeId) ?? {
    text: "",
    status: "streaming" as const,
    phase: "calling-tools" as const,
  };
  streams.set(nodeId, {
    ...current,
    phase: "calling-tools",
    toolCalls: upsertToolCallTrace(current.toolCalls, createToolCallTrace(trace)),
  });
  emit(nodeId);
}

export function completeLocalNodeStreamToolCall(
  nodeId: string,
  toolCallId: string,
  patch: Parameters<typeof completeToolCallTrace>[1],
): void {
  const current = streams.get(nodeId);
  if (!current) {
    return;
  }
  const trace = current.toolCalls?.find((item) => item.id === toolCallId);
  if (!trace) {
    return;
  }
  streams.set(nodeId, {
    ...current,
    phase: patch.status === "error" ? "error" : "calling-tools",
    toolCalls: upsertToolCallTrace(
      current.toolCalls,
      completeToolCallTrace(trace, patch),
    ),
  });
  emit(nodeId);
}

export function markLocalNodeStreamError(nodeId: string, error: string): void {
  const current = streams.get(nodeId) ?? {
    text: "",
    status: "error" as const,
    phase: "error" as const,
  };
  streams.set(nodeId, {
    ...current,
    status: "error",
    phase: "error",
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
