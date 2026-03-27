"use client";

import { useCallback, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useAction, useMutation } from "convex/react";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";

interface FrameNodeData {
  label?: string;
  width?: number;
  height?: number;
}

export default function FrameNode({ id, data, selected, width, height }: NodeProps) {
  const nodeData = data as FrameNodeData;
  const updateData = useMutation(api.nodes.updateData);
  const exportFrame = useAction(api.export.exportFrame);

  const [label, setLabel] = useState(nodeData.label ?? "Frame");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const debouncedSave = useDebouncedCallback((value: string) => {
    void updateData({ nodeId: id as Id<"nodes">, data: { ...nodeData, label: value } });
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
    setIsExporting(true);
    setExportError(null);

    try {
      const result = await exportFrame({ frameNodeId: id as Id<"nodes"> });
      const fileLabel = `${label.trim() || "frame"}.png`;
      toast.action(msg.export.frameExported.title, {
        description: fileLabel,
        label: msg.export.download,
        onClick: () => {
          window.open(result.url, "_blank", "noopener,noreferrer");
        },
        successLabel: msg.export.downloaded,
        type: "success",
      });
    } catch (error) {
      const m = error instanceof Error ? error.message : "";
      if (m.includes("No images found")) {
        toast.error(msg.export.frameEmpty.title, msg.export.frameEmpty.desc);
        setExportError(msg.export.frameEmpty.desc);
      } else {
        toast.error(msg.export.exportFailed.title, m || undefined);
        setExportError(m || msg.export.exportFailed.title);
      }
    } finally {
      setIsExporting(false);
    }
  }, [exportFrame, id, isExporting, label]);

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
