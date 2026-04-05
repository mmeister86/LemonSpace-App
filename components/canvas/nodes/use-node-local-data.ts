"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

function hashNodeData(value: unknown): string {
  return JSON.stringify(value);
}

function logNodeDataDebug(event: string, payload: Record<string, unknown>): void {
  const nodeSyncDebugEnabled =
    process.env.NODE_ENV !== "production" &&
    (globalThis as typeof globalThis & { __LEMONSPACE_DEBUG_NODE_SYNC__?: boolean })
      .__LEMONSPACE_DEBUG_NODE_SYNC__ === true;

  if (!nodeSyncDebugEnabled) {
    return;
  }

  console.info("[Canvas node debug]", event, payload);
}

type PreviewLatencyTrace = {
  sequence: number;
  changedAtMs: number;
  nodeType: string;
  origin: "applyLocalData" | "updateLocalData";
};

function writePreviewLatencyTrace(trace: Omit<PreviewLatencyTrace, "sequence">): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const debugGlobals = globalThis as typeof globalThis & {
    __LEMONSPACE_DEBUG_PREVIEW_LATENCY__?: boolean;
    __LEMONSPACE_LAST_PREVIEW_TRACE__?: PreviewLatencyTrace;
  };

  if (debugGlobals.__LEMONSPACE_DEBUG_PREVIEW_LATENCY__ !== true) {
    return;
  }

  const nextTrace: PreviewLatencyTrace = {
    ...trace,
    sequence: (debugGlobals.__LEMONSPACE_LAST_PREVIEW_TRACE__?.sequence ?? 0) + 1,
  };

  debugGlobals.__LEMONSPACE_LAST_PREVIEW_TRACE__ = nextTrace;

  console.info("[Preview latency] node-local-change", nextTrace);
}

export function useNodeLocalData<T>({
  data,
  normalize,
  saveDelayMs,
  onSave,
  debugLabel,
}: {
  data: unknown;
  normalize: (value: unknown) => T;
  saveDelayMs: number;
  onSave: (value: T) => Promise<void> | void;
  debugLabel: string;
}) {
  const [localData, setLocalDataState] = useState<T>(() => normalize(data));
  const localDataRef = useRef(localData);
  const hasPendingLocalChangesRef = useRef(false);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  const queueSave = useDebouncedCallback(() => {
    void onSave(localDataRef.current);
  }, saveDelayMs);

  useEffect(() => {
    const incomingData = normalize(data);
    const incomingHash = hashNodeData(incomingData);
    const localHash = hashNodeData(localDataRef.current);

    if (incomingHash === localHash) {
      hasPendingLocalChangesRef.current = false;
      return;
    }

    if (hasPendingLocalChangesRef.current) {
      logNodeDataDebug("skip-stale-external-data", {
        nodeType: debugLabel,
        incomingHash,
        localHash,
      });
      return;
    }

    const timer = window.setTimeout(() => {
      localDataRef.current = incomingData;
      setLocalDataState(incomingData);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [data, debugLabel, normalize]);

  const applyLocalData = useCallback(
    (next: T) => {
      hasPendingLocalChangesRef.current = true;
      writePreviewLatencyTrace({
        changedAtMs: performance.now(),
        nodeType: debugLabel,
        origin: "applyLocalData",
      });
      localDataRef.current = next;
      setLocalDataState(next);
      queueSave();
    },
    [debugLabel, queueSave],
  );

  const updateLocalData = useCallback(
    (updater: (current: T) => T) => {
      hasPendingLocalChangesRef.current = true;
      setLocalDataState((current) => {
        const next = updater(current);
        writePreviewLatencyTrace({
          changedAtMs: performance.now(),
          nodeType: debugLabel,
          origin: "updateLocalData",
        });
        localDataRef.current = next;
        queueSave();
        return next;
      });
    },
    [debugLabel, queueSave],
  );

  return {
    localData,
    applyLocalData,
    updateLocalData,
  };
}
