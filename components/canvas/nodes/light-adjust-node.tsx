"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { Sun } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { SliderRow } from "@/components/canvas/nodes/adjustment-controls";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import AdjustmentPreview from "@/components/canvas/nodes/adjustment-preview";
import {
  cloneAdjustmentData,
  DEFAULT_LIGHT_ADJUST_DATA,
  normalizeLightAdjustData,
  type LightAdjustData,
} from "@/lib/image-pipeline/adjustment-types";
import { LIGHT_PRESETS } from "@/lib/image-pipeline/presets";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";

type LightAdjustNodeData = LightAdjustData & {
  _status?: string;
  _statusMessage?: string;
};

export type LightAdjustNodeType = Node<LightAdjustNodeData, "light-adjust">;

type PresetDoc = {
  _id: Id<"adjustmentPresets">;
  name: string;
  params: unknown;
};

export default function LightAdjustNode({ id, data, selected, width }: NodeProps<LightAdjustNodeType>) {
  const { queueNodeDataUpdate } = useCanvasSync();
  const savePreset = useMutation(api.presets.save);
  const userPresets = (useAuthQuery(api.presets.list, { nodeType: "light-adjust" }) ?? []) as PresetDoc[];

  const [localData, setLocalData] = useState<LightAdjustData>(() =>
    normalizeLightAdjustData({ ...cloneAdjustmentData(DEFAULT_LIGHT_ADJUST_DATA), ...data }),
  );
  const [presetSelection, setPresetSelection] = useState("custom");
  const localDataRef = useRef(localData);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalData(
        normalizeLightAdjustData({ ...cloneAdjustmentData(DEFAULT_LIGHT_ADJUST_DATA), ...data }),
      );
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [data]);

  const queueSave = useDebouncedCallback(() => {
    void queueNodeDataUpdate({
      nodeId: id as Id<"nodes">,
      data: localDataRef.current,
    });
  }, 16);

  const updateData = (updater: (draft: LightAdjustData) => LightAdjustData) => {
    setPresetSelection("custom");
    setLocalData((current) => {
      const next = updater(current);
      localDataRef.current = next;
      queueSave();
      return next;
    });
  };

  const builtinOptions = useMemo(() => Object.entries(LIGHT_PRESETS), []);

  const applyPresetValue = (value: string) => {
    if (value === "custom") {
      setPresetSelection("custom");
      return;
    }
    if (value.startsWith("builtin:")) {
      const key = value.replace("builtin:", "");
      const preset = LIGHT_PRESETS[key];
      if (!preset) return;
      const next = cloneAdjustmentData(preset);
      setPresetSelection(value);
      setLocalData(next);
      localDataRef.current = next;
      queueSave();
      return;
    }
    if (value.startsWith("user:")) {
      const presetId = value.replace("user:", "") as Id<"adjustmentPresets">;
      const preset = userPresets.find((entry) => entry._id === presetId);
      if (!preset) return;
      const next = normalizeLightAdjustData(preset.params);
      setPresetSelection(value);
      setLocalData(next);
      localDataRef.current = next;
      queueSave();
    }
  };

  const handleSavePreset = async () => {
    const name = window.prompt("Preset-Name");
    if (!name) return;
    await savePreset({
      name,
      nodeType: "light-adjust",
      params: localData,
    });
    toast.success("Preset gespeichert");
  };

  return (
    <BaseNodeWrapper
      nodeType="light-adjust"
      selected={selected}
      status={data._status}
      statusMessage={data._statusMessage}
      className="min-w-[240px] border-amber-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-amber-500"
      />

      <div className="space-y-3 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <Sun className="h-3.5 w-3.5" />
          Licht
        </div>

        <div className="flex items-center gap-2">
          <Select value={presetSelection} onValueChange={applyPresetValue}>
            <SelectTrigger className="nodrag h-8 text-xs" size="sm">
              <SelectValue placeholder="Preset" />
            </SelectTrigger>
            <SelectContent className="nodrag">
              <SelectItem value="custom">Custom</SelectItem>
              {builtinOptions.map(([name]) => (
                <SelectItem key={name} value={`builtin:${name}`}>
                  Built-in: {name}
                </SelectItem>
              ))}
              {userPresets.map((preset) => (
                <SelectItem key={preset._id} value={`user:${preset._id}`}>
                  User: {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            className="nodrag rounded-md border px-2 py-1 text-[11px]"
            onClick={() => {
              void handleSavePreset();
            }}
          >
            Save
          </button>
        </div>

        <AdjustmentPreview
          nodeId={id}
          nodeWidth={width ?? 240}
          currentType="light-adjust"
          currentParams={localData}
        />

        <div className="space-y-2 rounded-md border border-border/80 bg-background/70 p-2">
          <SliderRow label="Brightness" value={localData.brightness} min={-100} max={100} onChange={(value) => updateData((current) => ({ ...current, brightness: value, preset: null }))} />
          <SliderRow label="Contrast" value={localData.contrast} min={-100} max={100} onChange={(value) => updateData((current) => ({ ...current, contrast: value, preset: null }))} />
          <SliderRow label="Exposure" value={localData.exposure} min={-5} max={5} step={0.01} onChange={(value) => updateData((current) => ({ ...current, exposure: value, preset: null }))} />
          <SliderRow label="Highlights" value={localData.highlights} min={-100} max={100} onChange={(value) => updateData((current) => ({ ...current, highlights: value, preset: null }))} />
          <SliderRow label="Shadows" value={localData.shadows} min={-100} max={100} onChange={(value) => updateData((current) => ({ ...current, shadows: value, preset: null }))} />
          <SliderRow label="Whites" value={localData.whites} min={-100} max={100} onChange={(value) => updateData((current) => ({ ...current, whites: value, preset: null }))} />
          <SliderRow label="Blacks" value={localData.blacks} min={-100} max={100} onChange={(value) => updateData((current) => ({ ...current, blacks: value, preset: null }))} />
          <SliderRow label="Vignette" value={localData.vignette.amount} min={0} max={1} step={0.01} onChange={(value) => updateData((current) => ({ ...current, vignette: { ...current.vignette, amount: value }, preset: null }))} />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-amber-500"
      />
    </BaseNodeWrapper>
  );
}
