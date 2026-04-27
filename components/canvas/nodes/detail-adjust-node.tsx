"use client";

import { useCallback, useMemo, useState } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { Focus } from "lucide-react";

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
  DEFAULT_DETAIL_ADJUST_DATA,
  normalizeDetailAdjustData,
  type DetailAdjustData,
} from "@/lib/image-pipeline/adjustment-types";
import { preserveNodeFavorite } from "@/lib/canvas-node-favorite";
import { DETAIL_PRESETS } from "@/lib/image-pipeline/presets";
import { toast } from "@/lib/toast";
import CanvasHandle from "@/components/canvas/canvas-handle";

type DetailAdjustNodeData = DetailAdjustData & {
  _status?: string;
  _statusMessage?: string;
};

export type DetailAdjustNodeType = Node<DetailAdjustNodeData, "detail-adjust">;

type PresetDoc = {
  _id: Id<"adjustmentPresets">;
  name: string;
  params: unknown;
};

export default function DetailAdjustNode({ id, data, selected, width }: NodeProps<DetailAdjustNodeType>) {
  const tCommon = useTranslations("common");
  const tNodes = useTranslations("nodes");
  const tToasts = useTranslations("toasts");
  const { queueNodeDataUpdate } = useCanvasSync();
  const savePreset = useSaveCanvasAdjustmentPreset();
  const userPresets = useCanvasAdjustmentPresets("detail-adjust") as PresetDoc[];

  const [presetSelection, setPresetSelection] = useState("custom");
  const normalizeData = useCallback(
    (value: unknown) =>
      preserveNodeFavorite(
        normalizeDetailAdjustData({
          ...cloneAdjustmentData(DEFAULT_DETAIL_ADJUST_DATA),
          ...(value as Record<string, unknown>),
        }),
        value,
      ) as DetailAdjustData,
    [],
  );
  const { localData, applyLocalData, updateLocalData } = useNodeLocalData<DetailAdjustData>({
    nodeId: id,
    data,
    normalize: normalizeData,
    saveDelayMs: 16,
    onSave: (next) =>
      queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: preserveNodeFavorite(next, data),
      }),
    debugLabel: "detail-adjust",
  });

  const updateData = (updater: (draft: DetailAdjustData) => DetailAdjustData) => {
    setPresetSelection("custom");
    updateLocalData(updater);
  };

  const builtinOptions = useMemo(() => Object.entries(DETAIL_PRESETS), []);
  const sliderConfigs = useMemo<SliderConfig[]>(
    () => [
      {
        id: "sharpen-amount",
        label: tNodes("adjustments.detailAdjust.sliders.sharpen"),
        min: 0,
        max: 500,
        value: DEFAULT_DETAIL_ADJUST_DATA.sharpen.amount,
      },
      {
        id: "sharpen-radius",
        label: tNodes("adjustments.detailAdjust.sliders.radius"),
        min: 0.5,
        max: 5,
        step: 0.01,
        precision: 2,
        value: DEFAULT_DETAIL_ADJUST_DATA.sharpen.radius,
      },
      {
        id: "sharpen-threshold",
        label: tNodes("adjustments.detailAdjust.sliders.threshold"),
        min: 0,
        max: 255,
        value: DEFAULT_DETAIL_ADJUST_DATA.sharpen.threshold,
      },
      {
        id: "clarity",
        label: tNodes("adjustments.detailAdjust.sliders.clarity"),
        min: -100,
        max: 100,
        value: DEFAULT_DETAIL_ADJUST_DATA.clarity,
      },
      {
        id: "denoise-luminance",
        label: tNodes("adjustments.detailAdjust.sliders.denoiseLuma"),
        min: 0,
        max: 100,
        value: DEFAULT_DETAIL_ADJUST_DATA.denoise.luminance,
      },
      {
        id: "denoise-color",
        label: tNodes("adjustments.detailAdjust.sliders.denoiseColor"),
        min: 0,
        max: 100,
        value: DEFAULT_DETAIL_ADJUST_DATA.denoise.color,
      },
      {
        id: "grain-amount",
        label: tNodes("adjustments.detailAdjust.sliders.grain"),
        min: 0,
        max: 100,
        value: DEFAULT_DETAIL_ADJUST_DATA.grain.amount,
      },
    ],
    [tNodes],
  );
  const sliderValues = useMemo<SliderValue[]>(
    () => [
      { id: "sharpen-amount", value: localData.sharpen.amount },
      { id: "sharpen-radius", value: localData.sharpen.radius },
      { id: "sharpen-threshold", value: localData.sharpen.threshold },
      { id: "clarity", value: localData.clarity },
      { id: "denoise-luminance", value: localData.denoise.luminance },
      { id: "denoise-color", value: localData.denoise.color },
      { id: "grain-amount", value: localData.grain.amount },
    ],
    [
      localData.clarity,
      localData.denoise.color,
      localData.denoise.luminance,
      localData.grain.amount,
      localData.sharpen.amount,
      localData.sharpen.radius,
      localData.sharpen.threshold,
    ],
  );

  const applyPresetValue = (value: string) => {
    if (value === "custom") {
      setPresetSelection("custom");
      return;
    }
    if (value.startsWith("builtin:")) {
      const key = value.replace("builtin:", "");
      const preset = DETAIL_PRESETS[key];
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
      const next = normalizeDetailAdjustData(preset.params);
      setPresetSelection(value);
      applyLocalData(next);
    }
  };

  const handleSavePreset = async () => {
    const name = window.prompt(tNodes("adjustments.common.presetNamePrompt"));
    if (!name) return;
    await savePreset({
      name,
      nodeType: "detail-adjust",
      params: localData,
    });
    toast.success(tToasts("canvas.adjustmentPresetSaved"));
  };

  return (
    <BaseNodeWrapper
      nodeType="detail-adjust"
      selected={selected}
      status={data._status}
      statusMessage={data._statusMessage}
      className="min-w-[300px] border-indigo-500/30"
    >
      <CanvasHandle
        nodeId={id}
        nodeType="detail-adjust"
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-indigo-500"
      />

      <div className="space-y-3 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          <Focus className="h-3.5 w-3.5" />
          {tNodes("adjustments.detailAdjust.title")}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={presetSelection}
            aria-label={tNodes("adjustments.common.presetPlaceholder")}
            className="nodrag h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            onChange={(event) => applyPresetValue(event.target.value)}
          >
            <option value="custom">{tNodes("custom")}</option>
              {builtinOptions.map(([name]) => (
                <option key={name} value={`builtin:${name}`}>
                  {tNodes("adjustments.common.builtinPresetLabel", { name })}
                </option>
              ))}
              {userPresets.map((preset) => (
                <option key={preset._id} value={`user:${preset._id}`}>
                  {tNodes("adjustments.common.userPresetLabel", { name: preset.name })}
                </option>
              ))}
          </select>
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
          currentType="detail-adjust"
          currentParams={localData}
        />

        <ParameterSlider
          id={`${id}-detail-adjust-params`}
          className="min-w-0 max-w-none"
          sliders={sliderConfigs}
          values={sliderValues}
          fillClassName="bg-indigo-500/35 dark:bg-indigo-400/35"
          handleClassName="bg-indigo-500 dark:bg-indigo-400"
          trackClassName="bg-indigo-500/10 dark:bg-indigo-500/15"
          actions={[{ id: "reset", label: tCommon("reset") }]}
          onChange={(values) => {
            const valueById = new Map(values.map((entry) => [entry.id, entry.value]));
            updateData((current) => ({
              ...current,
              sharpen: {
                ...current.sharpen,
                amount: valueById.get("sharpen-amount") ?? current.sharpen.amount,
                radius: valueById.get("sharpen-radius") ?? current.sharpen.radius,
                threshold: valueById.get("sharpen-threshold") ?? current.sharpen.threshold,
              },
              clarity: valueById.get("clarity") ?? current.clarity,
              denoise: {
                ...current.denoise,
                luminance: valueById.get("denoise-luminance") ?? current.denoise.luminance,
                color: valueById.get("denoise-color") ?? current.denoise.color,
              },
              grain: {
                ...current.grain,
                amount: valueById.get("grain-amount") ?? current.grain.amount,
              },
              preset: null,
            }));
          }}
        />
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType="detail-adjust"
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-indigo-500"
      />
    </BaseNodeWrapper>
  );
}
