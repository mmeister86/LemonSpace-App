"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import AdjustmentPreview from "./adjustment-preview";

type DetailNodeData = {
  sharpen?: {
    amount?: number;
    radius?: number;
    threshold?: number;
  };
  clarity?: number;
  denoise?: {
    luminance?: number;
    color?: number;
  };
  grain?: {
    amount?: number;
    size?: number;
  };
  preset?: string | null;
  _status?: string;
  _statusMessage?: string;
};

export type DetailNode = Node<DetailNodeData, "detail-adjust">;

function toPersistedData(data: Record<string, unknown>): Record<string, unknown> {
  const { _status, _statusMessage, retryCount, url, ...rest } = data;
  void _status;
  void _statusMessage;
  void retryCount;
  void url;
  return rest;
}

export default function DetailNode({ id, data, selected }: NodeProps<DetailNode>) {
  const updateData = useMutation(api.nodes.updateData);
  const dataRef = useRef(data as Record<string, unknown>);
  dataRef.current = data as Record<string, unknown>;

  const [sharpenAmount, setSharpenAmount] = useState(data.sharpen?.amount ?? 0);
  const [sharpenRadius, setSharpenRadius] = useState(data.sharpen?.radius ?? 1);
  const [sharpenThreshold, setSharpenThreshold] = useState(data.sharpen?.threshold ?? 0);
  const [clarity, setClarity] = useState(data.clarity ?? 0);
  const [denoiseLuminance, setDenoiseLuminance] = useState(data.denoise?.luminance ?? 0);
  const [denoiseColor, setDenoiseColor] = useState(data.denoise?.color ?? 0);
  const [grainAmount, setGrainAmount] = useState(data.grain?.amount ?? 0);
  const [grainSize, setGrainSize] = useState(data.grain?.size ?? 1);

  useEffect(() => {
    setSharpenAmount(data.sharpen?.amount ?? 0);
    setSharpenRadius(data.sharpen?.radius ?? 1);
    setSharpenThreshold(data.sharpen?.threshold ?? 0);
    setClarity(data.clarity ?? 0);
    setDenoiseLuminance(data.denoise?.luminance ?? 0);
    setDenoiseColor(data.denoise?.color ?? 0);
    setGrainAmount(data.grain?.amount ?? 0);
    setGrainSize(data.grain?.size ?? 1);
  }, [
    data.clarity,
    data.denoise?.color,
    data.denoise?.luminance,
    data.grain?.amount,
    data.grain?.size,
    data.sharpen?.amount,
    data.sharpen?.radius,
    data.sharpen?.threshold,
  ]);

  const persist = useDebouncedCallback(
    (next: {
      sharpenAmount: number;
      sharpenRadius: number;
      sharpenThreshold: number;
      clarity: number;
      denoiseLuminance: number;
      denoiseColor: number;
      grainAmount: number;
      grainSize: number;
    }) => {
      const base = toPersistedData(dataRef.current);
      void updateData({
        nodeId: id as Id<"nodes">,
        data: {
          ...base,
          sharpen: {
            amount: next.sharpenAmount,
            radius: next.sharpenRadius,
            threshold: next.sharpenThreshold,
          },
          clarity: next.clarity,
          denoise: {
            luminance: next.denoiseLuminance,
            color: next.denoiseColor,
          },
          grain: {
            amount: next.grainAmount,
            size: next.grainSize,
          },
          preset: null,
        },
      });
    },
    250,
  );

  const persistCurrent = useCallback(
    (
      overrides?: Partial<{
        sharpenAmount: number;
        sharpenRadius: number;
        sharpenThreshold: number;
        clarity: number;
        denoiseLuminance: number;
        denoiseColor: number;
        grainAmount: number;
        grainSize: number;
      }>,
    ) => {
      persist({
        sharpenAmount: overrides?.sharpenAmount ?? sharpenAmount,
        sharpenRadius: overrides?.sharpenRadius ?? sharpenRadius,
        sharpenThreshold: overrides?.sharpenThreshold ?? sharpenThreshold,
        clarity: overrides?.clarity ?? clarity,
        denoiseLuminance: overrides?.denoiseLuminance ?? denoiseLuminance,
        denoiseColor: overrides?.denoiseColor ?? denoiseColor,
        grainAmount: overrides?.grainAmount ?? grainAmount,
        grainSize: overrides?.grainSize ?? grainSize,
      });
    },
    [
      clarity,
      denoiseColor,
      denoiseLuminance,
      grainAmount,
      grainSize,
      persist,
      sharpenAmount,
      sharpenRadius,
      sharpenThreshold,
    ],
  );

  return (
    <BaseNodeWrapper nodeType="detail-adjust" selected={selected} status={data._status}>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />

      <div className="space-y-2 p-3">
        <div className="text-xs font-medium text-muted-foreground">Detail</div>
        <AdjustmentPreview nodeId={id} />

        {[
          { label: "Sharpen Amount", min: 0, max: 500, value: sharpenAmount, setter: setSharpenAmount, key: "sharpenAmount" as const },
          { label: "Sharpen Radius", min: 0.5, max: 5, step: 0.1, value: sharpenRadius, setter: setSharpenRadius, key: "sharpenRadius" as const },
          { label: "Sharpen Threshold", min: 0, max: 255, value: sharpenThreshold, setter: setSharpenThreshold, key: "sharpenThreshold" as const },
          { label: "Clarity", min: -100, max: 100, value: clarity, setter: setClarity, key: "clarity" as const },
          { label: "Denoise Luminance", min: 0, max: 100, value: denoiseLuminance, setter: setDenoiseLuminance, key: "denoiseLuminance" as const },
          { label: "Denoise Color", min: 0, max: 100, value: denoiseColor, setter: setDenoiseColor, key: "denoiseColor" as const },
          { label: "Grain Amount", min: 0, max: 100, value: grainAmount, setter: setGrainAmount, key: "grainAmount" as const },
          { label: "Grain Size", min: 0.5, max: 3, step: 0.1, value: grainSize, setter: setGrainSize, key: "grainSize" as const },
        ].map((item) => (
          <div key={item.key} className="space-y-1">
            <label className="text-[11px] text-muted-foreground">
              {item.label} ({typeof item.value === "number" ? item.value : ""})
            </label>
            <input
              className="nodrag nowheel w-full"
              type="range"
              min={item.min}
              max={item.max}
              step={item.step}
              value={item.value}
              onChange={(event) => {
                const next = Number(event.target.value);
                item.setter(next);
                persistCurrent({ [item.key]: next });
              }}
            />
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </BaseNodeWrapper>
  );
}
