"use client";

import { useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import { toast } from "@/lib/toast";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";

interface FrameNodeData {
  label?: string;
  width?: number;
  height?: number;
}

export default function FrameNode({ id, data, selected, width, height }: NodeProps) {
  const t = useTranslations('toasts');
  const nodeData = data as FrameNodeData;
  const { queueNodeDataUpdate, status } = useCanvasSync();
  const exportFrame = useAction(api.export.exportFrame);

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
      const result = await exportFrame({ frameNodeId: id as Id<"nodes"> });
      const fileLabel = `${label.trim() || "frame"}.png`;
      toast.action(t('export.frameExported'), {
        description: fileLabel,
        label: t('export.download'),
        onClick: () => {
          window.open(result.url, "_blank", "noopener,noreferrer");
        },
        successLabel: t('export.downloaded'),
        type: "success",
      });
    } catch (error) {
      const m = error instanceof Error ? error.message : "";
      if (m.includes("No images found")) {
        toast.error(t('export.frameEmptyTitle'), t('export.frameEmptyDesc'));
        setExportError(t('export.frameEmptyDesc'));
      } else {
        toast.error(t('export.exportFailed'), m || undefined);
        setExportError(m || t('export.exportFailed'));
      }
    } finally {
      setIsExporting(false);
    }
  }, [exportFrame, id, isExporting, label, status.isOffline, t]);

  const frameW = Math.round(width ?? 400);
  const frameH = Math.round(height ?? 300);

  return (
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
          title="Export as PNG"
          className="nodrag flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
        >
          {isExporting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          {isExporting ? "Exporting..." : "Export PNG"}
        </button>
      </div>

      {exportError && (
        <div className="absolute -bottom-6 left-0 text-xs text-destructive">{exportError}</div>
      )}

      <div className="nodrag h-full w-full" />

      <Handle
        type="target"
        position={Position.Left}
        id="frame-in"
        className="!h-3 !w-3 !border-2 !border-background !bg-orange-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="frame-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-orange-500"
      />
    </BaseNodeWrapper>
  );
}
