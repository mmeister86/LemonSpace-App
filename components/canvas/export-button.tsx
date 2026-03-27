"use client";

import { useCallback, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useAction } from "convex/react";
import JSZip from "jszip";
import { Archive, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";

interface ExportButtonProps {
  canvasName?: string;
}

export function ExportButton({ canvasName = "canvas" }: ExportButtonProps) {
  const { getNodes } = useReactFlow();
  const exportFrame = useAction(api.export.exportFrame);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleZipExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setError(null);

    const NO_FRAMES = "NO_FRAMES";

    const runExport = async () => {
      const nodes = getNodes();
      const frameNodes = nodes.filter((node) => node.type === "frame");

      if (frameNodes.length === 0) {
        throw new Error(NO_FRAMES);
      }

      const zip = new JSZip();

      for (let i = 0; i < frameNodes.length; i += 1) {
        const frame = frameNodes[i];
        const frameLabel =
          (frame.data as { label?: string }).label?.trim() || `frame-${i + 1}`;

        setProgress(`Exporting ${frameLabel} (${i + 1}/${frameNodes.length})...`);

        const result = await exportFrame({
          frameNodeId: frame.id as Id<"nodes">,
        });

        const response = await fetch(result.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch export for ${frameLabel}`);
        }

        const blob = await response.blob();
        zip.file(`${frameLabel}.png`, blob);
      }

      setProgress("Packing ZIP...");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${canvasName}-export.zip`;
      anchor.click();

      URL.revokeObjectURL(url);
    };

    try {
      await toast.promise(runExport(), {
        loading: msg.export.exportingFrames.title,
        success: msg.export.zipReady.title,
        error: (err) => {
          const m = err instanceof Error ? err.message : "";
          if (m === NO_FRAMES) return msg.export.noFramesOnCanvas.title;
          if (m.includes("No images found")) return msg.export.frameEmpty.title;
          return msg.export.exportFailed.title;
        },
        description: {
          error: (err) => {
            const m = err instanceof Error ? err.message : "";
            if (m === NO_FRAMES) return msg.export.noFramesOnCanvas.desc;
            if (m.includes("No images found")) return msg.export.frameEmpty.desc;
            return m || undefined;
          },
        },
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      if (m === NO_FRAMES) {
        setError(msg.export.noFramesOnCanvas.desc);
      } else if (m.includes("No images found")) {
        setError(msg.export.frameEmpty.desc);
      } else {
        setError(m || msg.export.exportFailed.title);
      }
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  }, [canvasName, exportFrame, getNodes, isExporting]);

  return (
    <div className="relative">
      <button
        onClick={() => void handleZipExport()}
        disabled={isExporting}
        title="Export all frames as ZIP"
        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        {progress ?? "Export ZIP"}
      </button>

      {error && (
        <p className="absolute left-0 top-full mt-1 whitespace-nowrap text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
