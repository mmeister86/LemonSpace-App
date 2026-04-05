"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useCanvasGraphPreviewOverrides } from "@/components/canvas/canvas-graph-context";
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

export function useNodeLocalData<T>({
  nodeId,
  data,
  normalize,
  saveDelayMs,
  onSave,
  debugLabel,
}: {
  nodeId: string;
  data: unknown;
  normalize: (value: unknown) => T;
  saveDelayMs: number;
  onSave: (value: T) => Promise<void> | void;
  debugLabel: string;
}) {
  const { setPreviewNodeDataOverride, clearPreviewNodeDataOverride } =
    useCanvasGraphPreviewOverrides();
  const [localData, setLocalDataState] = useState<T>(() => normalize(data));
  const localDataRef = useRef(localData);
  const acceptedPersistedDataRef = useRef(localData);
  const hasPendingLocalChangesRef = useRef(false);
  const localChangeVersionRef = useRef(0);
  const acknowledgedSaveVersionRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  const queueSave = useDebouncedCallback(() => {
    const savedValue = localDataRef.current;
    const savedVersion = localChangeVersionRef.current;

    Promise.resolve(onSave(savedValue))
      .then(() => {
        if (!isMountedRef.current || savedVersion !== localChangeVersionRef.current) {
          return;
        }

        acknowledgedSaveVersionRef.current = savedVersion;
      })
      .catch(() => {
        if (!isMountedRef.current || savedVersion !== localChangeVersionRef.current) {
          return;
        }

        hasPendingLocalChangesRef.current = false;
        acknowledgedSaveVersionRef.current = 0;
        localDataRef.current = acceptedPersistedDataRef.current;
        setLocalDataState(acceptedPersistedDataRef.current);
        clearPreviewNodeDataOverride(nodeId);
      });
  }, saveDelayMs);

  useEffect(() => {
    const incomingData = normalize(data);
    const incomingHash = hashNodeData(incomingData);
    const localHash = hashNodeData(localDataRef.current);
    const acceptedPersistedHash = hashNodeData(acceptedPersistedDataRef.current);

    if (incomingHash === localHash) {
      acceptedPersistedDataRef.current = incomingData;
      hasPendingLocalChangesRef.current = false;
      acknowledgedSaveVersionRef.current = 0;
      clearPreviewNodeDataOverride(nodeId);
      return;
    }

    if (hasPendingLocalChangesRef.current) {
      const saveAcknowledgedForCurrentVersion =
        acknowledgedSaveVersionRef.current === localChangeVersionRef.current;
      const shouldKeepBlockingIncomingData =
        !saveAcknowledgedForCurrentVersion || incomingHash === acceptedPersistedHash;

      if (shouldKeepBlockingIncomingData) {
        logNodeDataDebug("skip-stale-external-data", {
          nodeId,
          nodeType: debugLabel,
          incomingHash,
          localHash,
          saveAcknowledgedForCurrentVersion,
        });
        return;
      }
    }

    const timer = window.setTimeout(() => {
      acceptedPersistedDataRef.current = incomingData;
      hasPendingLocalChangesRef.current = false;
      acknowledgedSaveVersionRef.current = 0;
      localDataRef.current = incomingData;
      setLocalDataState(incomingData);
      clearPreviewNodeDataOverride(nodeId);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearPreviewNodeDataOverride, data, debugLabel, nodeId, normalize]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      queueSave.cancel();
      clearPreviewNodeDataOverride(nodeId);
    };
  }, [clearPreviewNodeDataOverride, nodeId, queueSave]);

  const applyLocalData = useCallback(
    (next: T) => {
      localChangeVersionRef.current += 1;
      hasPendingLocalChangesRef.current = true;
      localDataRef.current = next;
      setLocalDataState(next);
      setPreviewNodeDataOverride(nodeId, next);
      queueSave();
    },
    [nodeId, queueSave, setPreviewNodeDataOverride],
  );

  const updateLocalData = useCallback(
    (updater: (current: T) => T) => {
      const next = updater(localDataRef.current);

      localChangeVersionRef.current += 1;
      hasPendingLocalChangesRef.current = true;
      localDataRef.current = next;
      setLocalDataState(next);
      setPreviewNodeDataOverride(nodeId, next);
      queueSave();
    },
    [nodeId, queueSave, setPreviewNodeDataOverride],
  );

  return {
    localData,
    applyLocalData,
    updateLocalData,
  };
}
