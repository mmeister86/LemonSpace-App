"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { Palette } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import AdjustmentPreview from "@/components/canvas/nodes/adjustment-preview";
import {
  ParameterSlider,
  type SliderConfig,
  type SliderValue,
} from "@/src/components/tool-ui/parameter-slider";
import {
  cloneAdjustmentData,
  DEFAULT_COLOR_ADJUST_DATA,
  normalizeColorAdjustData,
  type ColorAdjustData,
} from "@/lib/image-pipeline/adjustment-types";
import { COLOR_PRESETS } from "@/lib/image-pipeline/presets";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";

type ColorAdjustNodeData = ColorAdjustData & {
  _status?: string;
  _statusMessage?: string;
};

export type ColorAdjustNodeType = Node<ColorAdjustNodeData, "color-adjust">;

type PresetDoc = {
  _id: Id<"adjustmentPresets">;
  name: string;
  params: unknown;
};

export default function ColorAdjustNode({ id, data, selected, width }: NodeProps<ColorAdjustNodeType>) {
  const { queueNodeDataUpdate } = useCanvasSync();
  const savePreset = useMutation(api.presets.save);
  const userPresets = (useAuthQuery(api.presets.list, { nodeType: "color-adjust" }) ?? []) as PresetDoc[];

  const [localData, setLocalData] = useState<ColorAdjustData>(() =>
    normalizeColorAdjustData({ ...cloneAdjustmentData(DEFAULT_COLOR_ADJUST_DATA), ...data }),
  );
  const [presetSelection, setPresetSelection] = useState("custom");
  const localDataRef = useRef(localData);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalData(
        normalizeColorAdjustData({ ...cloneAdjustmentData(DEFAULT_COLOR_ADJUST_DATA), ...data }),
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

  const updateData = (updater: (draft: ColorAdjustData) => ColorAdjustData) => {
    setPresetSelection("custom");
    setLocalData((current) => {
      const next = updater(current);
      localDataRef.current = next;
      queueSave();
      return next;
    });
  };

  const builtinOptions = useMemo(() => Object.entries(COLOR_PRESETS), []);
  const sliderConfigs = useMemo<SliderConfig[]>(
    () => [
      {
        id: "hue",
        label: "Hue",
        min: -180,
        max: 180,
        value: DEFAULT_COLOR_ADJUST_DATA.hsl.hue,
      },
      {
        id: "saturation",
        label: "Saturation",
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.hsl.saturation,
      },
      {
        id: "luminance",
        label: "Luminance",
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.hsl.luminance,
      },
      {
        id: "temperature",
        label: "Temperature",
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.temperature,
      },
      {
        id: "tint",
        label: "Tint",
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.tint,
      },
      {
        id: "vibrance",
        label: "Vibrance",
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.vibrance,
      },
    ],
    [],
  );
  const sliderValues = useMemo<SliderValue[]>(
    () => [
      { id: "hue", value: localData.hsl.hue },
      { id: "saturation", value: localData.hsl.saturation },
      { id: "luminance", value: localData.hsl.luminance },
      { id: "temperature", value: localData.temperature },
      { id: "tint", value: localData.tint },
      { id: "vibrance", value: localData.vibrance },
    ],
    [
      localData.hsl.hue,
      localData.hsl.luminance,
      localData.hsl.saturation,
      localData.temperature,
      localData.tint,
      localData.vibrance,
    ],
  );

  const applyPresetValue = (value: string) => {
    if (value === "custom") {
      setPresetSelection("custom");
      return;
    }
    if (value.startsWith("builtin:")) {
      const key = value.replace("builtin:", "");
      const preset = COLOR_PRESETS[key];
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
      const next = normalizeColorAdjustData(preset.params);
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
      nodeType: "color-adjust",
      params: localData,
    });
    toast.success("Preset gespeichert");
  };

  return (
    <BaseNodeWrapper
      nodeType="color-adjust"
      selected={selected}
      status={data._status}
      statusMessage={data._statusMessage}
      className="min-w-[300px] border-cyan-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-cyan-500"
      />

      <div className="space-y-3 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-700 dark:text-cyan-400">
          <Palette className="h-3.5 w-3.5" />
          Farbe
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
          currentType="color-adjust"
          currentParams={localData}
        />

        <ParameterSlider
          id={`${id}-color-adjust-params`}
          className="min-w-0 max-w-none"
          sliders={sliderConfigs}
          values={sliderValues}
          fillClassName="bg-cyan-500/35 dark:bg-cyan-400/35"
          handleClassName="bg-cyan-500 dark:bg-cyan-400"
          trackClassName="bg-cyan-500/10 dark:bg-cyan-500/15"
          onChange={(values) => {
            const valueById = new Map(values.map((entry) => [entry.id, entry.value]));
            updateData((current) => ({
              ...current,
              hsl: {
                ...current.hsl,
                hue: valueById.get("hue") ?? current.hsl.hue,
                saturation: valueById.get("saturation") ?? current.hsl.saturation,
                luminance: valueById.get("luminance") ?? current.hsl.luminance,
              },
              temperature: valueById.get("temperature") ?? current.temperature,
              tint: valueById.get("tint") ?? current.tint,
              vibrance: valueById.get("vibrance") ?? current.vibrance,
              preset: null,
            }));
          }}
          onAction={async (actionId) => {
            if (actionId === "apply") {
              queueSave();
            }
          }}
        />
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-cyan-500"
      />
    </BaseNodeWrapper>
  );
}
