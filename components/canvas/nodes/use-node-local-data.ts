"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas use node local data node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

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

function diffNodeData(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff: Record<string, { before: unknown; after: unknown }> = {};

  for (const key of keys) {
    if (before[key] !== after[key]) {
      diff[key] = {
        before: before[key],
        after: after[key],
      };
    }
  }

  return diff;
}

export function useNodeLocalData<T>({
  nodeId,
  data,
  normalize,
  saveDelayMs,
  onSave,
  debugLabel,
  previewOverrideEnabled = true,
}: {
  nodeId: string;
  data: unknown;
  normalize: (value: unknown) => T;
  saveDelayMs: number;
  onSave: (value: T) => Promise<void> | void;
  debugLabel: string;
  previewOverrideEnabled?: boolean;
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

    logNodeDataDebug("queue-save-flush", {
      nodeId,
      nodeType: debugLabel,
      savedVersion,
      changedFields: diffNodeData(
        acceptedPersistedDataRef.current as Record<string, unknown>,
        savedValue as Record<string, unknown>,
      ),
    });

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
      if (previewOverrideEnabled) {
        clearPreviewNodeDataOverride(nodeId);
      }
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
      if (previewOverrideEnabled) {
        clearPreviewNodeDataOverride(nodeId);
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearPreviewNodeDataOverride, data, debugLabel, nodeId, normalize, previewOverrideEnabled]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      queueSave.cancel();
      if (previewOverrideEnabled) {
        clearPreviewNodeDataOverride(nodeId);
      }
    };
  }, [clearPreviewNodeDataOverride, nodeId, previewOverrideEnabled, queueSave]);

  const applyLocalData = useCallback(
    (next: T) => {
      localChangeVersionRef.current += 1;
      hasPendingLocalChangesRef.current = true;
      localDataRef.current = next;
      setLocalDataState(next);
      if (previewOverrideEnabled) {
        setPreviewNodeDataOverride(nodeId, next);
      }
      queueSave();
    },
    [nodeId, previewOverrideEnabled, queueSave, setPreviewNodeDataOverride],
  );

  const updateLocalData = useCallback(
    (updater: (current: T) => T) => {
      const previous = localDataRef.current;
      const next = updater(previous);

      logNodeDataDebug("local-update", {
        nodeId,
        nodeType: debugLabel,
        changedFields: diffNodeData(
          previous as Record<string, unknown>,
          next as Record<string, unknown>,
        ),
      });

      localChangeVersionRef.current += 1;
      hasPendingLocalChangesRef.current = true;
      localDataRef.current = next;
      setLocalDataState(next);
      if (previewOverrideEnabled) {
        setPreviewNodeDataOverride(nodeId, next);
      }
      queueSave();
    },
    [debugLabel, nodeId, previewOverrideEnabled, queueSave, setPreviewNodeDataOverride],
  );

  return {
    localData,
    applyLocalData,
    updateLocalData,
  };
}
