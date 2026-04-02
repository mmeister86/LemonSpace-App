"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { TrendingUp } from "lucide-react";

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
  const { queueNodeDataUpdate } = useCanvasSync();
  const savePreset = useMutation(api.presets.save);
  const userPresets = (useAuthQuery(api.presets.list, { nodeType: "curves" }) ?? []) as PresetDoc[];

  const [localData, setLocalData] = useState<CurvesData>(() =>
    normalizeCurvesData({ ...cloneAdjustmentData(DEFAULT_CURVES_DATA), ...data }),
  );
  const [presetSelection, setPresetSelection] = useState("custom");
  const localDataRef = useRef(localData);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalData(
        normalizeCurvesData({ ...cloneAdjustmentData(DEFAULT_CURVES_DATA), ...data }),
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

  const updateData = (updater: (draft: CurvesData) => CurvesData) => {
    setPresetSelection("custom");
    setLocalData((current) => {
      const next = updater(current);
      localDataRef.current = next;
      queueSave();
      return next;
    });
  };

  const builtinOptions = useMemo(() => Object.entries(CURVE_PRESETS), []);
  const sliderConfigs = useMemo<SliderConfig[]>(
    () => [
      {
        id: "black-point",
        label: "Black Point",
        min: 0,
        max: 255,
        value: DEFAULT_CURVES_DATA.levels.blackPoint,
      },
      {
        id: "white-point",
        label: "White Point",
        min: 0,
        max: 255,
        value: DEFAULT_CURVES_DATA.levels.whitePoint,
      },
      {
        id: "gamma",
        label: "Gamma",
        min: 0.1,
        max: 3,
        step: 0.01,
        precision: 2,
        value: DEFAULT_CURVES_DATA.levels.gamma,
      },
    ],
    [],
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
      setLocalData(cloneAdjustmentData(preset));
      localDataRef.current = cloneAdjustmentData(preset);
      queueSave();
      return;
    }

    if (value.startsWith("user:")) {
      const presetId = value.replace("user:", "") as Id<"adjustmentPresets">;
      const preset = userPresets.find((entry) => entry._id === presetId);
      if (!preset) return;
      const next = normalizeCurvesData(preset.params);
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
      nodeType: "curves",
      params: localData,
    });
    toast.success("Preset gespeichert");
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
          Kurven
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
        className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500"
      />
    </BaseNodeWrapper>
  );
}
