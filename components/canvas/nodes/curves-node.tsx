"use client";

import { useCallback, useMemo, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { TrendingUp } from "lucide-react";

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
  DEFAULT_CURVES_DATA,
  normalizeCurvesData,
  type CurvesData,
} from "@/lib/image-pipeline/adjustment-types";
import { CURVE_PRESETS } from "@/lib/image-pipeline/presets";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";

type CurvesNodeData = CurvesData & {
  _status?: string;
  _statusMessage?: string;
};

export type CurvesNodeType = Node<CurvesNodeData, "curves">;

type PresetDoc = {
  _id: Id<"adjustmentPresets">;
  name: string;
  params: unknown;
};

export default function CurvesNode({ id, data, selected, width }: NodeProps<CurvesNodeType>) {
  const tCommon = useTranslations("common");
  const tNodes = useTranslations("nodes");
  const tToasts = useTranslations("toasts");
  const { queueNodeDataUpdate } = useCanvasSync();
  const savePreset = useSaveCanvasAdjustmentPreset();
  const userPresets = useCanvasAdjustmentPresets("curves") as PresetDoc[];

  const [presetSelection, setPresetSelection] = useState("custom");
  const normalizeData = useCallback(
    (value: unknown) =>
      normalizeCurvesData({
        ...cloneAdjustmentData(DEFAULT_CURVES_DATA),
        ...(value as Record<string, unknown>),
      }),
    [],
  );
  const { localData, applyLocalData, updateLocalData } = useNodeLocalData<CurvesData>({
    nodeId: id,
    data,
    normalize: normalizeData,
    saveDelayMs: 16,
    onSave: (next) =>
      queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: next,
      }),
    debugLabel: "curves",
  });

  const updateData = (updater: (draft: CurvesData) => CurvesData) => {
    setPresetSelection("custom");
    updateLocalData(updater);
  };

  const builtinOptions = useMemo(() => Object.entries(CURVE_PRESETS), []);
  const sliderConfigs = useMemo<SliderConfig[]>(
    () => [
      {
        id: "black-point",
        label: tNodes("adjustments.curves.sliders.blackPoint"),
        min: 0,
        max: 255,
        value: DEFAULT_CURVES_DATA.levels.blackPoint,
      },
      {
        id: "white-point",
        label: tNodes("adjustments.curves.sliders.whitePoint"),
        min: 0,
        max: 255,
        value: DEFAULT_CURVES_DATA.levels.whitePoint,
      },
      {
        id: "gamma",
        label: tNodes("adjustments.curves.sliders.gamma"),
        min: 0.1,
        max: 3,
        step: 0.01,
        precision: 2,
        value: DEFAULT_CURVES_DATA.levels.gamma,
      },
    ],
    [tNodes],
  );
  const sliderValues = useMemo<SliderValue[]>(
    () => [
      { id: "black-point", value: localData.levels.blackPoint },
      { id: "white-point", value: localData.levels.whitePoint },
      { id: "gamma", value: localData.levels.gamma },
    ],
    [localData.levels.blackPoint, localData.levels.gamma, localData.levels.whitePoint],
  );

  const applyPresetValue = (value: string) => {
    if (value === "custom") {
      setPresetSelection("custom");
      return;
    }

    if (value.startsWith("builtin:")) {
      const key = value.replace("builtin:", "");
      const preset = CURVE_PRESETS[key];
      if (!preset) return;
      setPresetSelection(value);
      applyLocalData(cloneAdjustmentData(preset));
      return;
    }

    if (value.startsWith("user:")) {
      const presetId = value.replace("user:", "") as Id<"adjustmentPresets">;
      const preset = userPresets.find((entry) => entry._id === presetId);
      if (!preset) return;
      const next = normalizeCurvesData(preset.params);
      setPresetSelection(value);
      applyLocalData(next);
    }
  };

  const handleSavePreset = async () => {
    const name = window.prompt(tNodes("adjustments.common.presetNamePrompt"));
    if (!name) return;
    await savePreset({
      name,
      nodeType: "curves",
      params: localData,
    });
    toast.success(tToasts("canvas.adjustmentPresetSaved"));
  };

  return (
    <BaseNodeWrapper
      nodeType="curves"
      selected={selected}
      status={data._status}
      statusMessage={data._statusMessage}
      className="min-w-[300px] border-emerald-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500"
      />

      <div className="space-y-3 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <TrendingUp className="h-3.5 w-3.5" />
          {tNodes("adjustments.curves.title")}
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
          currentType="curves"
          currentParams={localData}
        />

        <ParameterSlider
          id={`${id}-curves-params`}
          className="min-w-0 max-w-none"
          sliders={sliderConfigs}
          values={sliderValues}
          fillClassName="bg-emerald-500/35 dark:bg-emerald-400/35"
          handleClassName="bg-emerald-500 dark:bg-emerald-400"
          trackClassName="bg-emerald-500/10 dark:bg-emerald-500/15"
          actions={[{ id: "reset", label: tCommon("reset") }]}
          onChange={(values) => {
            const valueById = new Map(values.map((entry) => [entry.id, entry.value]));
            updateData((current) => ({
              ...current,
              levels: {
                ...current.levels,
                blackPoint: valueById.get("black-point") ?? current.levels.blackPoint,
                whitePoint: valueById.get("white-point") ?? current.levels.whitePoint,
                gamma: valueById.get("gamma") ?? current.levels.gamma,
              },
              preset: null,
            }));
          }}
        />
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500"
      />
    </BaseNodeWrapper>
  );
}
