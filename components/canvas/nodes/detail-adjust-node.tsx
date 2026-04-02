"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Focus } from "lucide-react";

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
  DEFAULT_DETAIL_ADJUST_DATA,
  normalizeDetailAdjustData,
  type DetailAdjustData,
} from "@/lib/image-pipeline/adjustment-types";
import { DETAIL_PRESETS } from "@/lib/image-pipeline/presets";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";

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
  const savePreset = useMutation(api.presets.save);
  const userPresets = (useAuthQuery(api.presets.list, { nodeType: "detail-adjust" }) ?? []) as PresetDoc[];

  const [localData, setLocalData] = useState<DetailAdjustData>(() =>
    normalizeDetailAdjustData({ ...cloneAdjustmentData(DEFAULT_DETAIL_ADJUST_DATA), ...data }),
  );
  const [presetSelection, setPresetSelection] = useState("custom");
  const localDataRef = useRef(localData);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalData(
        normalizeDetailAdjustData({ ...cloneAdjustmentData(DEFAULT_DETAIL_ADJUST_DATA), ...data }),
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

  const updateData = (updater: (draft: DetailAdjustData) => DetailAdjustData) => {
    setPresetSelection("custom");
    setLocalData((current) => {
      const next = updater(current);
      localDataRef.current = next;
      queueSave();
      return next;
    });
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
      setLocalData(next);
      localDataRef.current = next;
      queueSave();
      return;
    }
    if (value.startsWith("user:")) {
      const presetId = value.replace("user:", "") as Id<"adjustmentPresets">;
      const preset = userPresets.find((entry) => entry._id === presetId);
      if (!preset) return;
      const next = normalizeDetailAdjustData(preset.params);
      setPresetSelection(value);
      setLocalData(next);
      localDataRef.current = next;
      queueSave();
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
      <Handle
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

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-indigo-500"
      />
    </BaseNodeWrapper>
  );
}
