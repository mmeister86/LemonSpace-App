"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import AdjustmentPreview from "./adjustment-preview";

type CurvesNodeData = {
  channelMode?: "rgb" | "red" | "green" | "blue";
  levels?: {
    blackPoint?: number;
    whitePoint?: number;
    gamma?: number;
  };
  preset?: string | null;
  _status?: string;
  _statusMessage?: string;
};

export type CurvesNode = Node<CurvesNodeData, "curves">;

function toPersistedData(data: Record<string, unknown>): Record<string, unknown> {
  const { _status, _statusMessage, retryCount, url, ...rest } = data;
  void _status;
  void _statusMessage;
  void retryCount;
  void url;
  return rest;
}

export default function CurvesNode({ id, data, selected }: NodeProps<CurvesNode>) {
  const updateData = useMutation(api.nodes.updateData);

  const [channelMode, setChannelMode] = useState<"rgb" | "red" | "green" | "blue">(
    data.channelMode ?? "rgb",
  );
  const [blackPoint, setBlackPoint] = useState(data.levels?.blackPoint ?? 0);
  const [whitePoint, setWhitePoint] = useState(data.levels?.whitePoint ?? 255);
  const [gamma, setGamma] = useState(data.levels?.gamma ?? 1);

  const dataRef = useRef(data as Record<string, unknown>);
  dataRef.current = data as Record<string, unknown>;

  useEffect(() => {
    setChannelMode(data.channelMode ?? "rgb");
  }, [data.channelMode]);

  useEffect(() => {
    setBlackPoint(data.levels?.blackPoint ?? 0);
    setWhitePoint(data.levels?.whitePoint ?? 255);
    setGamma(data.levels?.gamma ?? 1);
  }, [data.levels?.blackPoint, data.levels?.gamma, data.levels?.whitePoint]);

  const persist = useDebouncedCallback(
    (next: { channelMode: "rgb" | "red" | "green" | "blue"; blackPoint: number; whitePoint: number; gamma: number }) => {
      const base = toPersistedData(dataRef.current);
      void updateData({
        nodeId: id as Id<"nodes">,
        data: {
          ...base,
          channelMode: next.channelMode,
          levels: {
            blackPoint: next.blackPoint,
            whitePoint: next.whitePoint,
            gamma: next.gamma,
          },
          preset: null,
        },
      });
    },
    250,
  );

  const persistCurrent = useCallback(
    (overrides?: Partial<{ channelMode: "rgb" | "red" | "green" | "blue"; blackPoint: number; whitePoint: number; gamma: number }>) => {
      persist({
        channelMode: overrides?.channelMode ?? channelMode,
        blackPoint: overrides?.blackPoint ?? blackPoint,
        whitePoint: overrides?.whitePoint ?? whitePoint,
        gamma: overrides?.gamma ?? gamma,
      });
    },
    [blackPoint, channelMode, gamma, persist, whitePoint],
  );

  return (
    <BaseNodeWrapper nodeType="curves" selected={selected} status={data._status}>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />

      <div className="space-y-2 p-3">
        <div className="text-xs font-medium text-muted-foreground">Kurven</div>
        <AdjustmentPreview nodeId={id} />

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Kanal</label>
          <select
            value={channelMode}
            onChange={(event) => {
              const next = event.target.value as "rgb" | "red" | "green" | "blue";
              setChannelMode(next);
              persistCurrent({ channelMode: next });
            }}
            className="nodrag nowheel w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="rgb">RGB</option>
            <option value="red">Rot</option>
            <option value="green">Grün</option>
            <option value="blue">Blau</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Black Point ({blackPoint})</label>
          <input
            className="nodrag nowheel w-full"
            type="range"
            min={0}
            max={255}
            value={blackPoint}
            onChange={(event) => {
              const next = Number(event.target.value);
              setBlackPoint(next);
              persistCurrent({ blackPoint: next });
            }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">White Point ({whitePoint})</label>
          <input
            className="nodrag nowheel w-full"
            type="range"
            min={1}
            max={255}
            value={whitePoint}
            onChange={(event) => {
              const next = Number(event.target.value);
              setWhitePoint(next);
              persistCurrent({ whitePoint: next });
            }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Gamma ({gamma.toFixed(2)})</label>
          <input
            className="nodrag nowheel w-full"
            type="range"
            min={0.1}
            max={3}
            step={0.01}
            value={gamma}
            onChange={(event) => {
              const next = Number(event.target.value);
              setGamma(next);
              persistCurrent({ gamma: next });
            }}
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </BaseNodeWrapper>
  );
}
