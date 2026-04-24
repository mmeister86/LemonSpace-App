"use client";

import { useCallback, useState } from "react";
import { Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import { toast } from "@/lib/toast";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { exportFrameAsJpeg } from "@/components/canvas/frame-jpeg-export";

interface FrameNodeData {
  label?: string;
  width?: number;
  height?: number;
}

export default function FrameNode({
  id,
  data,
  selected,
  width,
  height,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps) {
  const t = useTranslations('toasts');
  const nodeData = data as FrameNodeData;
  const { queueNodeDataUpdate, status } = useCanvasSync();
  const { fitBounds, getViewport, setViewport } = useReactFlow();

  const [label, setLabel] = useState(nodeData.label ?? "Frame");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const debouncedSave = useDebouncedCallback((value: string) => {
    void queueNodeDataUpdate({
      nodeId: id as Id<"nodes">,
      data: { ...nodeData, label: value },
    });
  }, 500);

  const handleLabelChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setLabel(event.target.value);
      debouncedSave(event.target.value);
    },
    [debouncedSave],
  );

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    if (status.isOffline) {
      toast.warning("Offline aktuell nicht unterstützt", "Export benötigt eine aktive Verbindung.");
      return;
    }
    setIsExporting(true);
    setExportError(null);

    try {
      await exportFrameAsJpeg({
        frameId: id,
        frameLabel: label,
        frameBounds: {
          x: positionAbsoluteX,
          y: positionAbsoluteY,
          width: Math.round(width ?? 400),
          height: Math.round(height ?? 300),
        },
        fitBounds,
        getViewport,
        setViewport,
      });
      toast.success(t('export.frameExported'));
    } catch (error) {
      const m = error instanceof Error ? error.message : "";
      toast.error(t('export.exportFailed'), m || undefined);
      setExportError(m || t('export.exportFailed'));
    } finally {
      setIsExporting(false);
    }
  }, [
    fitBounds,
    getViewport,
    height,
    id,
    isExporting,
    label,
    positionAbsoluteX,
    positionAbsoluteY,
    setViewport,
    status.isOffline,
    t,
    width,
  ]);

  const frameW = Math.round(width ?? 400);
  const frameH = Math.round(height ?? 300);

  return (
    <div className="h-full w-full" data-frame-export-ignore="true">
      <BaseNodeWrapper
        nodeType="frame"
        selected={selected}
        className="relative h-full w-full border-2 border-dashed border-muted-foreground/40 !bg-transparent p-0 shadow-none"
      >
        <div className="absolute -top-8 left-0 flex items-center gap-2">
          <input
            value={label}
            onChange={handleLabelChange}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                (event.target as HTMLInputElement).blur();
              }
            }}
            className="nodrag nowheel w-40 border-none bg-transparent text-sm font-medium text-muted-foreground outline-none focus:text-foreground"
          />

          <span className="text-xs text-muted-foreground/60">
            {frameW}x{frameH}
          </span>

          <button
            onClick={() => void handleExport()}
            disabled={isExporting}
            title="Export as JPEG"
            className="nodrag flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
          >
            {isExporting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            {isExporting ? "Exporting..." : "Export JPEG"}
          </button>
        </div>

        {exportError && (
          <div className="absolute -bottom-6 left-0 text-xs text-destructive">{exportError}</div>
        )}

        <div className="nodrag h-full w-full" />

        <CanvasHandle
          nodeId={id}
          nodeType="frame"
          type="target"
          position={Position.Left}
          id="frame-in"
          className="!h-3 !w-3 !border-2 !border-background !bg-orange-500"
        />
        <CanvasHandle
          nodeId={id}
          nodeType="frame"
          type="source"
          position={Position.Right}
          id="frame-out"
          className="!h-3 !w-3 !border-2 !border-background !bg-orange-500"
        />
      </BaseNodeWrapper>
    </div>
  );
}
