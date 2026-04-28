"use client";

import { useCallback, useMemo, useState, type ComponentType } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Focus, Palette, Sun, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";

import CanvasHandle from "@/components/canvas/canvas-handle";
import {
  useCanvasAdjustmentPresets,
  useSaveCanvasAdjustmentPreset,
} from "@/components/canvas/canvas-presets-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import AdjustmentPreview from "@/components/canvas/nodes/adjustment-preview";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import { useNodeLocalData } from "@/components/canvas/nodes/use-node-local-data";
import type { Id } from "@/convex/_generated/dataModel";
import { preserveNodeFavorite } from "@/lib/canvas-node-favorite";
import {
  cloneAdjustmentData,
  DEFAULT_COLOR_ADJUST_DATA,
  DEFAULT_CURVES_DATA,
  DEFAULT_DETAIL_ADJUST_DATA,
  DEFAULT_LIGHT_ADJUST_DATA,
  normalizeColorAdjustData,
  normalizeCurvesData,
  normalizeDetailAdjustData,
  normalizeLightAdjustData,
  type AdjustmentNodeKind,
  type ColorAdjustData,
  type CurvesData,
  type DetailAdjustData,
  type LightAdjustData,
} from "@/lib/image-pipeline/adjustment-types";
import { COLOR_PRESETS, CURVE_PRESETS, DETAIL_PRESETS, LIGHT_PRESETS } from "@/lib/image-pipeline/presets";
import { toast } from "@/lib/toast";
import {
  ParameterSlider,
  type SliderConfig,
  type SliderValue,
} from "@/src/components/tool-ui/parameter-slider";

type AdjustmentData = CurvesData | ColorAdjustData | LightAdjustData | DetailAdjustData;

type AdjustmentNodeData<TData extends AdjustmentData> = TData & Record<string, unknown> & {
  _status?: string;
  _statusMessage?: string;
};

type PresetDoc = {
  _id: Id<"adjustmentPresets">;
  name: string;
  params: unknown;
};

type TranslationFn = ReturnType<typeof useTranslations>;

export type AdjustmentNodeShellConfig<TData extends AdjustmentData = AdjustmentData> = {
  nodeType: AdjustmentNodeKind;
  titleKey: string;
  Icon: ComponentType<{ className?: string }>;
  wrapperClassName: string;
  titleClassName: string;
  handleClassName: string;
  fillClassName: string;
  sliderHandleClassName: string;
  trackClassName: string;
  defaultData: TData;
  presets: Record<string, TData>;
  normalize: (value: unknown) => TData;
  buildSliderConfigs: (tNodes: TranslationFn) => SliderConfig[];
  getSliderValues: (data: TData) => SliderValue[];
  applySliderValues: (current: TData, values: SliderValue[]) => TData;
};

function valueById(values: SliderValue[]): Map<string, number> {
  return new Map(values.map((entry) => [entry.id, entry.value]));
}

export const ADJUSTMENT_NODE_CONFIGS = {
  curves: {
    nodeType: "curves",
    titleKey: "adjustments.curves.title",
    Icon: TrendingUp,
    wrapperClassName: "min-w-[300px] border-emerald-500/30",
    titleClassName: "text-emerald-700 dark:text-emerald-400",
    handleClassName: "!h-3 !w-3 !border-2 !border-background !bg-emerald-500",
    fillClassName: "bg-emerald-500/35 dark:bg-emerald-400/35",
    sliderHandleClassName: "bg-emerald-500 dark:bg-emerald-400",
    trackClassName: "bg-emerald-500/10 dark:bg-emerald-500/15",
    defaultData: DEFAULT_CURVES_DATA,
    presets: CURVE_PRESETS,
    normalize: normalizeCurvesData,
    buildSliderConfigs: (tNodes) => [
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
    getSliderValues: (data) => [
      { id: "black-point", value: data.levels.blackPoint },
      { id: "white-point", value: data.levels.whitePoint },
      { id: "gamma", value: data.levels.gamma },
    ],
    applySliderValues: (current, values) => {
      const valuesById = valueById(values);
      return {
        ...current,
        levels: {
          ...current.levels,
          blackPoint: valuesById.get("black-point") ?? current.levels.blackPoint,
          whitePoint: valuesById.get("white-point") ?? current.levels.whitePoint,
          gamma: valuesById.get("gamma") ?? current.levels.gamma,
        },
        preset: null,
      };
    },
  } satisfies AdjustmentNodeShellConfig<CurvesData>,
  "color-adjust": {
    nodeType: "color-adjust",
    titleKey: "adjustments.colorAdjust.title",
    Icon: Palette,
    wrapperClassName: "min-w-[300px] border-cyan-500/30",
    titleClassName: "text-cyan-700 dark:text-cyan-400",
    handleClassName: "!h-3 !w-3 !border-2 !border-background !bg-cyan-500",
    fillClassName: "bg-cyan-500/35 dark:bg-cyan-400/35",
    sliderHandleClassName: "bg-cyan-500 dark:bg-cyan-400",
    trackClassName: "bg-cyan-500/10 dark:bg-cyan-500/15",
    defaultData: DEFAULT_COLOR_ADJUST_DATA,
    presets: COLOR_PRESETS,
    normalize: normalizeColorAdjustData,
    buildSliderConfigs: (tNodes) => [
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
    getSliderValues: (data) => [
      { id: "hue", value: data.hsl.hue },
      { id: "saturation", value: data.hsl.saturation },
      { id: "luminance", value: data.hsl.luminance },
      { id: "temperature", value: data.temperature },
      { id: "tint", value: data.tint },
      { id: "vibrance", value: data.vibrance },
    ],
    applySliderValues: (current, values) => {
      const valuesById = valueById(values);
      return {
        ...current,
        hsl: {
          ...current.hsl,
          hue: valuesById.get("hue") ?? current.hsl.hue,
          saturation: valuesById.get("saturation") ?? current.hsl.saturation,
          luminance: valuesById.get("luminance") ?? current.hsl.luminance,
        },
        temperature: valuesById.get("temperature") ?? current.temperature,
        tint: valuesById.get("tint") ?? current.tint,
        vibrance: valuesById.get("vibrance") ?? current.vibrance,
        preset: null,
      };
    },
  } satisfies AdjustmentNodeShellConfig<ColorAdjustData>,
  "light-adjust": {
    nodeType: "light-adjust",
    titleKey: "adjustments.lightAdjust.title",
    Icon: Sun,
    wrapperClassName: "min-w-[300px] border-amber-500/30",
    titleClassName: "text-amber-700 dark:text-amber-300",
    handleClassName: "!h-3 !w-3 !border-2 !border-background !bg-amber-500",
    fillClassName: "bg-amber-500/35 dark:bg-amber-400/35",
    sliderHandleClassName: "bg-amber-500 dark:bg-amber-400",
    trackClassName: "bg-amber-500/10 dark:bg-amber-500/15",
    defaultData: DEFAULT_LIGHT_ADJUST_DATA,
    presets: LIGHT_PRESETS,
    normalize: normalizeLightAdjustData,
    buildSliderConfigs: (tNodes) => [
      {
        id: "brightness",
        label: tNodes("adjustments.lightAdjust.sliders.brightness"),
        min: -100,
        max: 100,
        value: DEFAULT_LIGHT_ADJUST_DATA.brightness,
      },
      {
        id: "contrast",
        label: tNodes("adjustments.lightAdjust.sliders.contrast"),
        min: -100,
        max: 100,
        value: DEFAULT_LIGHT_ADJUST_DATA.contrast,
      },
      {
        id: "exposure",
        label: tNodes("adjustments.lightAdjust.sliders.exposure"),
        min: -5,
        max: 5,
        step: 0.01,
        precision: 2,
        value: DEFAULT_LIGHT_ADJUST_DATA.exposure,
      },
      {
        id: "highlights",
        label: tNodes("adjustments.lightAdjust.sliders.highlights"),
        min: -100,
        max: 100,
        value: DEFAULT_LIGHT_ADJUST_DATA.highlights,
      },
      {
        id: "shadows",
        label: tNodes("adjustments.lightAdjust.sliders.shadows"),
        min: -100,
        max: 100,
        value: DEFAULT_LIGHT_ADJUST_DATA.shadows,
      },
      {
        id: "whites",
        label: tNodes("adjustments.lightAdjust.sliders.whites"),
        min: -100,
        max: 100,
        value: DEFAULT_LIGHT_ADJUST_DATA.whites,
      },
      {
        id: "blacks",
        label: tNodes("adjustments.lightAdjust.sliders.blacks"),
        min: -100,
        max: 100,
        value: DEFAULT_LIGHT_ADJUST_DATA.blacks,
      },
      {
        id: "vignette-amount",
        label: tNodes("adjustments.lightAdjust.sliders.vignette"),
        min: 0,
        max: 1,
        step: 0.01,
        precision: 2,
        value: DEFAULT_LIGHT_ADJUST_DATA.vignette.amount,
      },
    ],
    getSliderValues: (data) => [
      { id: "brightness", value: data.brightness },
      { id: "contrast", value: data.contrast },
      { id: "exposure", value: data.exposure },
      { id: "highlights", value: data.highlights },
      { id: "shadows", value: data.shadows },
      { id: "whites", value: data.whites },
      { id: "blacks", value: data.blacks },
      { id: "vignette-amount", value: data.vignette.amount },
    ],
    applySliderValues: (current, values) => {
      const valuesById = valueById(values);
      return {
        ...current,
        brightness: valuesById.get("brightness") ?? current.brightness,
        contrast: valuesById.get("contrast") ?? current.contrast,
        exposure: valuesById.get("exposure") ?? current.exposure,
        highlights: valuesById.get("highlights") ?? current.highlights,
        shadows: valuesById.get("shadows") ?? current.shadows,
        whites: valuesById.get("whites") ?? current.whites,
        blacks: valuesById.get("blacks") ?? current.blacks,
        vignette: {
          ...current.vignette,
          amount: valuesById.get("vignette-amount") ?? current.vignette.amount,
        },
        preset: null,
      };
    },
  } satisfies AdjustmentNodeShellConfig<LightAdjustData>,
  "detail-adjust": {
    nodeType: "detail-adjust",
    titleKey: "adjustments.detailAdjust.title",
    Icon: Focus,
    wrapperClassName: "min-w-[300px] border-indigo-500/30",
    titleClassName: "text-indigo-700 dark:text-indigo-300",
    handleClassName: "!h-3 !w-3 !border-2 !border-background !bg-indigo-500",
    fillClassName: "bg-indigo-500/35 dark:bg-indigo-400/35",
    sliderHandleClassName: "bg-indigo-500 dark:bg-indigo-400",
    trackClassName: "bg-indigo-500/10 dark:bg-indigo-500/15",
    defaultData: DEFAULT_DETAIL_ADJUST_DATA,
    presets: DETAIL_PRESETS,
    normalize: normalizeDetailAdjustData,
    buildSliderConfigs: (tNodes) => [
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
    getSliderValues: (data) => [
      { id: "sharpen-amount", value: data.sharpen.amount },
      { id: "sharpen-radius", value: data.sharpen.radius },
      { id: "sharpen-threshold", value: data.sharpen.threshold },
      { id: "clarity", value: data.clarity },
      { id: "denoise-luminance", value: data.denoise.luminance },
      { id: "denoise-color", value: data.denoise.color },
      { id: "grain-amount", value: data.grain.amount },
    ],
    applySliderValues: (current, values) => {
      const valuesById = valueById(values);
      return {
        ...current,
        sharpen: {
          ...current.sharpen,
          amount: valuesById.get("sharpen-amount") ?? current.sharpen.amount,
          radius: valuesById.get("sharpen-radius") ?? current.sharpen.radius,
          threshold: valuesById.get("sharpen-threshold") ?? current.sharpen.threshold,
        },
        clarity: valuesById.get("clarity") ?? current.clarity,
        denoise: {
          ...current.denoise,
          luminance: valuesById.get("denoise-luminance") ?? current.denoise.luminance,
          color: valuesById.get("denoise-color") ?? current.denoise.color,
        },
        grain: {
          ...current.grain,
          amount: valuesById.get("grain-amount") ?? current.grain.amount,
        },
        preset: null,
      };
    },
  } satisfies AdjustmentNodeShellConfig<DetailAdjustData>,
} as const;

export function AdjustmentNodeShell<TData extends AdjustmentData>({
  id,
  data,
  selected,
  width,
  config,
}: NodeProps<Node<AdjustmentNodeData<TData>, AdjustmentNodeKind>> & {
  config: AdjustmentNodeShellConfig<TData>;
}) {
  const tCommon = useTranslations("common");
  const tNodes = useTranslations("nodes");
  const tToasts = useTranslations("toasts");
  const { queueNodeDataUpdate } = useCanvasSync();
  const savePreset = useSaveCanvasAdjustmentPreset();
  const userPresets = useCanvasAdjustmentPresets(config.nodeType) as PresetDoc[];
  const [presetSelection, setPresetSelection] = useState("custom");
  const Icon = config.Icon;

  const normalizeData = useCallback(
    (value: unknown) =>
      preserveNodeFavorite(
        config.normalize({
          ...cloneAdjustmentData(config.defaultData),
          ...(value as Record<string, unknown>),
        }),
        value,
      ) as TData,
    [config],
  );
  const { localData, applyLocalData, updateLocalData } = useNodeLocalData<TData>({
    nodeId: id,
    data,
    normalize: normalizeData,
    saveDelayMs: 16,
    onSave: (next) =>
      queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: preserveNodeFavorite(next, data),
      }),
    debugLabel: config.nodeType,
  });

  const builtinOptions = useMemo(() => Object.keys(config.presets), [config]);
  const sliderConfigs = useMemo(() => config.buildSliderConfigs(tNodes), [config, tNodes]);
  const sliderValues = useMemo(() => config.getSliderValues(localData), [config, localData]);

  const updateData = (updater: (draft: TData) => TData) => {
    setPresetSelection("custom");
    updateLocalData(updater);
  };

  const applyPresetValue = (value: string) => {
    if (value === "custom") {
      setPresetSelection("custom");
      return;
    }

    if (value.startsWith("builtin:")) {
      const key = value.replace("builtin:", "");
      const preset = config.presets[key];
      if (!preset) return;
      setPresetSelection(value);
      applyLocalData(cloneAdjustmentData(preset));
      return;
    }

    if (value.startsWith("user:")) {
      const presetId = value.replace("user:", "") as Id<"adjustmentPresets">;
      const preset = userPresets.find((entry) => entry._id === presetId);
      if (!preset) return;
      setPresetSelection(value);
      applyLocalData(config.normalize(preset.params));
    }
  };

  const handleSavePreset = async () => {
    const name = window.prompt(tNodes("adjustments.common.presetNamePrompt"));
    if (!name) return;
    await savePreset({
      name,
      nodeType: config.nodeType,
      params: localData,
    });
    toast.success(tToasts("canvas.adjustmentPresetSaved"));
  };

  return (
    <BaseNodeWrapper
      nodeType={config.nodeType}
      selected={selected}
      status={data._status}
      statusMessage={data._statusMessage}
      className={config.wrapperClassName}
    >
      <CanvasHandle
        nodeId={id}
        nodeType={config.nodeType}
        type="target"
        position={Position.Left}
        className={config.handleClassName}
      />

      <div className="space-y-3 p-3">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${config.titleClassName}`}>
          <Icon className="h-3.5 w-3.5" />
          {tNodes(config.titleKey)}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={presetSelection}
            aria-label={tNodes("adjustments.common.presetPlaceholder")}
            className="nodrag h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            onChange={(event) => applyPresetValue(event.target.value)}
          >
            <option value="custom">{tNodes("custom")}</option>
            {builtinOptions.map((name) => (
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
          currentType={config.nodeType}
          currentParams={localData}
        />

        <ParameterSlider
          id={`${id}-${config.nodeType}-params`}
          className="min-w-0 max-w-none"
          sliders={sliderConfigs}
          values={sliderValues}
          fillClassName={config.fillClassName}
          handleClassName={config.sliderHandleClassName}
          trackClassName={config.trackClassName}
          actions={[{ id: "reset", label: tCommon("reset") }]}
          onChange={(values) => {
            updateData((current) => config.applySliderValues(current, values));
          }}
        />
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType={config.nodeType}
        type="source"
        position={Position.Right}
        className={config.handleClassName}
      />
    </BaseNodeWrapper>
  );
}
