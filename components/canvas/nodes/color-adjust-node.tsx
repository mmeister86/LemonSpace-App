"use client";

import { useCallback, useMemo, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { Palette } from "lucide-react";

import type { Id } from "@/convex/_generated/dataModel";
import {
  useCanvasAdjustmentPresets,
  useSaveCanvasAdjustmentPreset,
} from "@/components/canvas/canvas-presets-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import AdjustmentPreview from "@/components/canvas/nodes/adjustment-preview";
import { useNodeLocalData } from "@/components/canvas/nodes/use-node-local-data";
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
  const tCommon = useTranslations("common");
  const tNodes = useTranslations("nodes");
  const tToasts = useTranslations("toasts");
  const { queueNodeDataUpdate } = useCanvasSync();
  const savePreset = useSaveCanvasAdjustmentPreset();
  const userPresets = useCanvasAdjustmentPresets("color-adjust") as PresetDoc[];

  const [presetSelection, setPresetSelection] = useState("custom");
  const normalizeData = useCallback(
    (value: unknown) =>
      normalizeColorAdjustData({
        ...cloneAdjustmentData(DEFAULT_COLOR_ADJUST_DATA),
        ...(value as Record<string, unknown>),
      }),
    [],
  );
  const { localData, applyLocalData, updateLocalData } = useNodeLocalData<ColorAdjustData>({
    nodeId: id,
    data,
    normalize: normalizeData,
    saveDelayMs: 16,
    onSave: (next) =>
      queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: next,
      }),
    debugLabel: "color-adjust",
  });

  const updateData = (updater: (draft: ColorAdjustData) => ColorAdjustData) => {
    setPresetSelection("custom");
    updateLocalData(updater);
  };

  const builtinOptions = useMemo(() => Object.entries(COLOR_PRESETS), []);
  const sliderConfigs = useMemo<SliderConfig[]>(
    () => [
      {
        id: "hue",
        label: tNodes("adjustments.colorAdjust.sliders.hue"),
        min: -180,
        max: 180,
        value: DEFAULT_COLOR_ADJUST_DATA.hsl.hue,
      },
      {
        id: "saturation",
        label: tNodes("adjustments.colorAdjust.sliders.saturation"),
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.hsl.saturation,
      },
      {
        id: "luminance",
        label: tNodes("adjustments.colorAdjust.sliders.luminance"),
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.hsl.luminance,
      },
      {
        id: "temperature",
        label: tNodes("adjustments.colorAdjust.sliders.temperature"),
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.temperature,
      },
      {
        id: "tint",
        label: tNodes("adjustments.colorAdjust.sliders.tint"),
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.tint,
      },
      {
        id: "vibrance",
        label: tNodes("adjustments.colorAdjust.sliders.vibrance"),
        min: -100,
        max: 100,
        value: DEFAULT_COLOR_ADJUST_DATA.vibrance,
      },
    ],
    [tNodes],
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
      applyLocalData(next);
      return;
    }
    if (value.startsWith("user:")) {
      const presetId = value.replace("user:", "") as Id<"adjustmentPresets">;
      const preset = userPresets.find((entry) => entry._id === presetId);
      if (!preset) return;
      const next = normalizeColorAdjustData(preset.params);
      setPresetSelection(value);
      applyLocalData(next);
    }
  };

  const handleSavePreset = async () => {
    const name = window.prompt(tNodes("adjustments.common.presetNamePrompt"));
    if (!name) return;
    await savePreset({
      name,
      nodeType: "color-adjust",
      params: localData,
    });
    toast.success(tToasts("canvas.adjustmentPresetSaved"));
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
          {tNodes("adjustments.colorAdjust.title")}
        </div>

        <div className="flex items-center gap-2">
          <Select value={presetSelection} onValueChange={applyPresetValue}>
            <SelectTrigger className="nodrag h-8 text-xs" size="sm">
              <SelectValue placeholder={tNodes("adjustments.common.presetPlaceholder")} />
            </SelectTrigger>
            <SelectContent className="nodrag">
              <SelectItem value="custom">{tNodes("custom")}</SelectItem>
              {builtinOptions.map(([name]) => (
                <SelectItem key={name} value={`builtin:${name}`}>
                  {tNodes("adjustments.common.builtinPresetLabel", { name })}
                </SelectItem>
              ))}
              {userPresets.map((preset) => (
                <SelectItem key={preset._id} value={`user:${preset._id}`}>
                  {tNodes("adjustments.common.userPresetLabel", { name: preset.name })}
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
            {tCommon("save")}
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
          actions={[{ id: "reset", label: tCommon("reset") }]}
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
