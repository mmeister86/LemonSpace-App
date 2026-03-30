"use client";

import { useMemo } from "react";
import { useStore } from "@xyflow/react";
import { collectPipeline, getSourceImage } from "@/lib/image-pipeline/pipeline";
import { usePipelinePreview } from "@/hooks/use-pipeline-preview";

type AdjustmentPreviewProps = {
  nodeId: string;
  className?: string;
};

export default function AdjustmentPreview({
  nodeId,
  className,
}: AdjustmentPreviewProps) {
  const nodes = useStore((store) => store.nodes);
  const edges = useStore((store) => store.edges);

  const sourceUrl = useMemo(
    () => getSourceImage(nodeId, edges, nodes),
    [edges, nodeId, nodes],
  );
  const pipeline = useMemo(
    () => collectPipeline(nodeId, edges, nodes),
    [edges, nodeId, nodes],
  );
  const currentNode = useMemo(
    () => nodes.find((node) => node.id === nodeId),
    [nodeId, nodes],
  );
  const nodeWidth = useMemo(() => {
    const widthFromStyle =
      typeof currentNode?.style?.width === "number" ? currentNode.style.width : undefined;
    const widthFromMeasured =
      typeof currentNode?.measured?.width === "number" ? currentNode.measured.width : undefined;
    return widthFromStyle ?? widthFromMeasured ?? 280;
  }, [currentNode]);
  const devicePixelRatioSafe =
    typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
      ? window.devicePixelRatio
      : 1;
  const previewWidth = Math.min(nodeWidth * devicePixelRatioSafe, 1024);
  const { previewUrl, isRendering, error } = usePipelinePreview(
    sourceUrl,
    pipeline,
    previewWidth,
  );

  if (!sourceUrl) {
    return (
      <div
        className={`flex h-28 w-full items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/30 text-center text-xs text-muted-foreground ${className ?? ""}`}
      >
        Input-Bild verbinden
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Adjustment preview"
          className="h-28 w-full rounded-md border border-border/70 object-cover"
          loading="lazy"
        />
      ) : (
        <img
          src={sourceUrl}
          alt="Adjustment preview source"
          className="h-28 w-full rounded-md border border-border/70 object-cover opacity-60"
          loading="lazy"
        />
      )}
      <div className="text-[10px] text-muted-foreground">
        Pipeline: {pipeline.length} Step{pipeline.length === 1 ? "" : "s"}
        {isRendering ? " · updating…" : ""}
        {error ? ` · ${error}` : ""}
      </div>
    </div>
  );
}
