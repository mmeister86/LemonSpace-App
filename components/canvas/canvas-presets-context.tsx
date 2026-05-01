"use client";

/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas presets context. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConvex, useConvexAuth, useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

type AdjustmentPresetDoc = Doc<"adjustmentPresets">;
type PresetsByNodeType = Map<AdjustmentPresetDoc["nodeType"], AdjustmentPresetDoc[]>;
type SaveAdjustmentPresetArgs = {
  name: string;
  nodeType: AdjustmentPresetDoc["nodeType"];
  params: unknown;
};

type CanvasPresetsContextValue = {
  presetsByNodeType: PresetsByNodeType;
  savePreset: (args: SaveAdjustmentPresetArgs) => Promise<void>;
};

const MAX_AUTO_LOAD_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;
const CanvasPresetsContext = createContext<CanvasPresetsContextValue | null>(null);

function groupPresetsByNodeType(rawPresets: AdjustmentPresetDoc[]): PresetsByNodeType {
  const next = new Map<AdjustmentPresetDoc["nodeType"], AdjustmentPresetDoc[]>();

  for (const preset of rawPresets) {
    const existing = next.get(preset.nodeType);
    if (existing) {
      existing.push(preset);
    } else {
      next.set(preset.nodeType, [preset]);
    }
  }

  return next;
}

type CanvasPresetsProviderProps = {
  enabled?: boolean;
  children: ReactNode;
};

export function CanvasPresetsProvider({
  enabled = true,
  children,
}: CanvasPresetsProviderProps) {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const savePresetMutation = useMutation(api.presets.save);
  const latestLoadRequestIdRef = useRef(0);
  const autoLoadInFlightRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rawPresets, setRawPresets] = useState<AdjustmentPresetDoc[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const clearScheduledRetry = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      return;
    }

    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      setRetryNonce((current) => current + 1);
    }, RETRY_DELAY_MS);
  }, []);

  const loadPresets = useCallback(async () => {
    const presets = await convex.query(api.presets.list, {});
    return presets as AdjustmentPresetDoc[];
  }, [convex]);

  const refreshPresets = useCallback(async () => {
    const requestId = ++latestLoadRequestIdRef.current;

    try {
      const presets = await loadPresets();

      if (requestId === latestLoadRequestIdRef.current) {
        clearScheduledRetry();
        setRawPresets(presets);
      }

      return { requestId, presets };
    } catch (error: unknown) {
      throw { requestId, error };
    }
  }, [clearScheduledRetry, loadPresets]);

  useEffect(() => {
    return () => {
      clearScheduledRetry();
    };
  }, [clearScheduledRetry]);

  useEffect(() => {
    if (
      !enabled ||
      !isAuthenticated ||
      hasLoadedOnce ||
      autoLoadInFlightRef.current
    ) {
      return;
    }

    let cancelled = false;
    autoLoadInFlightRef.current = true;

    void (async () => {
      for (let attempt = 0; attempt < MAX_AUTO_LOAD_ATTEMPTS; attempt += 1) {
        try {
          await refreshPresets();
          if (!cancelled) {
            setHasLoadedOnce(true);
          }
          return;
        } catch (caught: unknown) {
          if (cancelled) {
            return;
          }

          const refreshError =
            typeof caught === "object" && caught !== null && "error" in caught
              ? ((caught as { error: unknown }).error ?? caught)
              : caught;

          console.warn("[CanvasPresetsProvider] failed to load presets", {
            message:
              refreshError instanceof Error
                ? refreshError.message
                : String(refreshError),
            attempt: attempt + 1,
          });
        }
      }

      if (!cancelled) {
        scheduleRetry();
      }
    })().finally(() => {
      autoLoadInFlightRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, hasLoadedOnce, isAuthenticated, refreshPresets, retryNonce, scheduleRetry]);

  const savePreset = useCallback(
    async (args: SaveAdjustmentPresetArgs) => {
      await savePresetMutation(args);

      try {
        await refreshPresets();
        setHasLoadedOnce(true);
      } catch (caught: unknown) {
        const refreshError =
          typeof caught === "object" && caught !== null && "error" in caught
            ? ((caught as { error: unknown }).error ?? caught)
            : caught;
        const requestId =
          typeof caught === "object" && caught !== null && "requestId" in caught
            ? ((caught as { requestId: unknown }).requestId as number)
            : latestLoadRequestIdRef.current;

        console.warn("[CanvasPresetsProvider] failed to refresh presets after save", {
          message:
            refreshError instanceof Error
              ? refreshError.message
              : String(refreshError),
        });

        if (requestId === latestLoadRequestIdRef.current) {
          setHasLoadedOnce(false);
          scheduleRetry();
        }
      }
    },
    [refreshPresets, savePresetMutation, scheduleRetry],
  );

  const presetsByNodeType = useMemo<PresetsByNodeType>(
    () => groupPresetsByNodeType(rawPresets),
    [rawPresets],
  );

  const contextValue = useMemo<CanvasPresetsContextValue>(
    () => ({
      presetsByNodeType,
      savePreset,
    }),
    [presetsByNodeType, savePreset],
  );

  return (
    <CanvasPresetsContext.Provider value={contextValue}>
      {children}
    </CanvasPresetsContext.Provider>
  );
}

export function useCanvasAdjustmentPresets(
  nodeType: AdjustmentPresetDoc["nodeType"],
): AdjustmentPresetDoc[] {
  const context = useContext(CanvasPresetsContext);
  if (context === null) {
    return [];
  }

  return context.presetsByNodeType.get(nodeType) ?? [];
}

export function useSaveCanvasAdjustmentPreset(): CanvasPresetsContextValue["savePreset"] {
  const context = useContext(CanvasPresetsContext);
  if (context === null) {
    throw new Error("useSaveCanvasAdjustmentPreset must be used within CanvasPresetsProvider");
  }

  return context.savePreset;
}
