"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/use-auth-query";

type AdjustmentPresetDoc = Doc<"adjustmentPresets">;
type PresetsByNodeType = Map<AdjustmentPresetDoc["nodeType"], AdjustmentPresetDoc[]>;

const CanvasPresetsContext = createContext<PresetsByNodeType | null>(null);

type CanvasPresetsProviderProps = {
  enabled?: boolean;
  children: ReactNode;
};

export function CanvasPresetsProvider({
  enabled = true,
  children,
}: CanvasPresetsProviderProps) {
  const rawPresets = useAuthQuery(api.presets.list, enabled ? {} : "skip");

  const presetsByNodeType = useMemo<PresetsByNodeType>(() => {
    const next = new Map<AdjustmentPresetDoc["nodeType"], AdjustmentPresetDoc[]>();

    for (const preset of (rawPresets ?? []) as AdjustmentPresetDoc[]) {
      const existing = next.get(preset.nodeType);
      if (existing) {
        existing.push(preset);
      } else {
        next.set(preset.nodeType, [preset]);
      }
    }

    return next;
  }, [rawPresets]);

  return (
    <CanvasPresetsContext.Provider value={presetsByNodeType}>
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

  return context.get(nodeType) ?? [];
}
