"use client";

import { useMemo, useRef, useState } from "react";
import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { collectPipeline, getSourceImage, hashPipeline } from "@/lib/image-pipeline/pipeline";
import BaseNodeWrapper from "./base-node-wrapper";

type RenderNodeData = {
  outputResolution?: "original" | "2x" | "custom";
  customWidth?: number;
  customHeight?: number;
  format?: "png" | "jpeg" | "webp";
  jpegQuality?: number;
  pipelineHash?: string;
  storageId?: string;
  url?: string;
  lastRenderedAt?: number;
  _status?: string;
  _statusMessage?: string;
};

export type RenderNode = Node<RenderNodeData, "render">;

function toPersistedData(data: Record<string, unknown>): Record<string, unknown> {
  const { _status, _statusMessage, retryCount, url, ...rest } = data;
  void _status;
  void _statusMessage;
  void retryCount;
  void url;
  return rest;
}

export default function RenderNode({ id, data, selected }: NodeProps<RenderNode>) {
  const updateData = useMutation(api.nodes.updateData);
  const dataRef = useRef(data as Record<string, unknown>);
  dataRef.current = data as Record<string, unknown>;

  const nodes = useStore((store) => store.nodes);
  const edges = useStore((store) => store.edges);
  const pipeline = useMemo(() => collectPipeline(id, edges, nodes), [edges, id, nodes]);
  const sourceUrl = useMemo(() => getSourceImage(id, edges, nodes), [edges, id, nodes]);
  const pipelineDigest = useMemo(() => hashPipeline(id, edges, nodes), [edges, id, nodes]);

  const [outputResolution, setOutputResolution] = useState<"original" | "2x" | "custom">(
    data.outputResolution ?? "original",
  );
  const [format, setFormat] = useState<"png" | "jpeg" | "webp">(data.format ?? "png");
  const [jpegQuality, setJpegQuality] = useState<number>(data.jpegQuality ?? 90);
  const [customWidth, setCustomWidth] = useState<number>(data.customWidth ?? 1080);
  const [customHeight, setCustomHeight] = useState<number>(data.customHeight ?? 1080);
  const [isRendering, setIsRendering] = useState(false);

  const outOfDate = Boolean(data.pipelineHash && data.pipelineHash !== pipelineDigest);

  const persistConfig = (overrides?: Partial<RenderNodeData>) => {
    const base = toPersistedData(dataRef.current);
    void updateData({
      nodeId: id as Id<"nodes">,
      data: {
        ...base,
        outputResolution,
        customWidth,
        customHeight,
        format,
        jpegQuality,
        ...overrides,
      },
    });
  };

  const runRender = async () => {
    if (!sourceUrl) {
      toast.warning("Kein Input-Bild", "Verbinde zuerst Bild oder KI-Bild mit dem Render-Node.");
      return;
    }

    setIsRendering(true);
    try {
      // Phase 1 der ADR-Umsetzung: Konfiguration + Pipeline-Hash persistieren.
      // Upload in Convex Storage folgt im nächsten Schritt (WebGL -> Blob -> Storage).
      await updateData({
        nodeId: id as Id<"nodes">,
        data: {
          ...toPersistedData(dataRef.current),
          outputResolution,
          customWidth,
          customHeight,
          format,
          jpegQuality,
          pipelineHash: pipelineDigest,
          lastRenderedAt: Date.now(),
        },
      });

      toast.info("Render konfiguriert", "Blob-Upload wird im nächsten Umsetzungsschritt ergänzt.");
    } catch (error) {
      console.error("[render-node] render update failed", error);
      toast.error("Render fehlgeschlagen");
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <BaseNodeWrapper nodeType="render" selected={selected} status={data._status}>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />

      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">Render</div>
          {outOfDate ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
              Out of date
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
              Up to date
            </span>
          )}
        </div>

        {sourceUrl ? (
          <img
            src={sourceUrl}
            alt="Render source"
            className="h-28 w-full rounded-md border border-border/70 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/30 text-xs text-muted-foreground">
            Input-Bild verbinden
          </div>
        )}

        <div className="text-[10px] text-muted-foreground">Pipeline: {pipeline.length} Steps</div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Auflösung</label>
          <select
            value={outputResolution}
            onChange={(event) => {
              const next = event.target.value as "original" | "2x" | "custom";
              setOutputResolution(next);
              persistConfig({ outputResolution: next });
            }}
            className="nodrag nowheel w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="original">Original</option>
            <option value="2x">2x</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {outputResolution === "custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <input
              className="nodrag nowheel rounded-md border border-input bg-background px-2 py-1 text-xs"
              type="number"
              min={64}
              max={8192}
              value={customWidth}
              onChange={(event) => {
                const next = Number(event.target.value);
                setCustomWidth(next);
                persistConfig({ customWidth: next });
              }}
              placeholder="Breite"
            />
            <input
              className="nodrag nowheel rounded-md border border-input bg-background px-2 py-1 text-xs"
              type="number"
              min={64}
              max={8192}
              value={customHeight}
              onChange={(event) => {
                const next = Number(event.target.value);
                setCustomHeight(next);
                persistConfig({ customHeight: next });
              }}
              placeholder="Höhe"
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Format</label>
          <select
            value={format}
            onChange={(event) => {
              const next = event.target.value as "png" | "jpeg" | "webp";
              setFormat(next);
              persistConfig({ format: next });
            }}
            className="nodrag nowheel w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </div>

        {format === "jpeg" ? (
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">JPEG Quality ({jpegQuality})</label>
            <input
              className="nodrag nowheel w-full"
              type="range"
              min={1}
              max={100}
              value={jpegQuality}
              onChange={(event) => {
                const next = Number(event.target.value);
                setJpegQuality(next);
                persistConfig({ jpegQuality: next });
              }}
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void runRender();
          }}
          disabled={isRendering}
          className="nodrag w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {isRendering ? "Rendering…" : "Render"}
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </BaseNodeWrapper>
  );
}
