"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas asset video node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position, useStore, type NodeProps } from "@xyflow/react";
import { useAction } from "convex/react";
import { Play } from "lucide-react";
import BaseNodeWrapper from "./base-node-wrapper";
import {
  VideoBrowserPanel,
  type VideoBrowserSessionState,
} from "@/components/canvas/video-browser-panel";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useZoomAwarePreviewQuality } from "@/components/canvas/use-zoom-aware-preview-quality";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { MediaBacklight } from "./media-backlight";

type AssetVideoNodeData = {
  canvasId?: string;
  pexelsId?: number;
  mp4Url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  attribution?: {
    userName: string;
    userUrl: string;
    videoUrl: string;
  };
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AssetVideoNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps) {
  const d = data as AssetVideoNodeData;
  const [panelOpen, setPanelOpen] = useState(false);
  const [browserState, setBrowserState] = useState<VideoBrowserSessionState>({
    term: "",
    orientation: "",
    durationFilter: "all",
    results: [],
    page: 1,
    totalPages: 1,
  });
  const { queueNodeDataUpdate, queueNodeResize } = useCanvasSync();
  const refreshPexelsPlayback = useAction(api.pexels.getVideoByPexelsId);

  const edges = useStore((s) => s.edges);
  const nodes = useStore((s) => s.nodes);

  const linkedSearchTerm = useMemo(() => {
    const incoming = edges.filter((e) => e.target === id);
    for (const edge of incoming) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode?.type !== "text" && sourceNode?.type !== "ai-text-output") continue;
      const sourceData = sourceNode.data as { content?: string; outputText?: string };
      const content =
        sourceNode.type === "ai-text-output" ? sourceData.outputText : sourceData.content;
      if (typeof content === "string" && content.trim().length > 0) {
        return content.trim();
      }
    }
    return "";
  }, [edges, id, nodes]);

  const openVideoBrowser = useCallback(() => {
    setBrowserState((s) =>
      linkedSearchTerm
        ? { ...s, term: linkedSearchTerm, results: [], page: 1, totalPages: 1 }
        : s,
    );
    setPanelOpen(true);
  }, [linkedSearchTerm]);

  const hasVideo = Boolean(d.mp4Url && d.thumbnailUrl);

  const hasAutoSizedRef = useRef(false);
  const playbackRefreshAttempted = useRef(false);

  useEffect(() => {
    playbackRefreshAttempted.current = false;
  }, [d.mp4Url]);

  const handleVideoError = useCallback(() => {
    const pexelsId = d.pexelsId;
    if (pexelsId == null || playbackRefreshAttempted.current) return;
    playbackRefreshAttempted.current = true;
    void (async () => {
      try {
        const fresh = await refreshPexelsPlayback({ pexelsId });
        await queueNodeDataUpdate({
          nodeId: id as Id<"nodes">,
          data: {
            ...d,
            mp4Url: fresh.mp4Url,
            width: fresh.width,
            height: fresh.height,
            duration: fresh.duration,
          },
        });
      } catch {
        playbackRefreshAttempted.current = false;
      }
    })();
  }, [d, id, queueNodeDataUpdate, refreshPexelsPlayback]);

  useEffect(() => {
    if (!hasVideo) return;
    if (hasAutoSizedRef.current) return;

    const w = d.width;
    const h = d.height;
    if (typeof w !== "number" || typeof h !== "number" || w <= 0 || h <= 0)
      return;

    const currentWidth = typeof width === "number" ? width : 0;
    const currentHeight = typeof height === "number" ? height : 0;
    if (currentWidth <= 0 || currentHeight <= 0) return;

    if (currentWidth !== 320 || currentHeight !== 180) {
      hasAutoSizedRef.current = true;
      return;
    }

    hasAutoSizedRef.current = true;
    const aspectRatio = w / h;
    const targetWidth = 320;
    const targetHeight = Math.round(targetWidth / aspectRatio);

    void queueNodeResize({
      nodeId: id as Id<"nodes">,
      width: targetWidth,
      height: targetHeight,
    });
  }, [d.width, d.height, hasVideo, height, id, queueNodeResize, width]);

  const showPreview = hasVideo && d.thumbnailUrl;

  const playbackSrc =
    d.mp4Url != null && d.mp4Url.length > 0
      ? `/api/pexels-video?u=${encodeURIComponent(d.mp4Url)}`
      : undefined;
  const { sourceQuality } = useZoomAwarePreviewQuality({ width, height });
  const videoPreload = sourceQuality === "full" ? "metadata" : "none";
  const useThumbnailPreview = sourceQuality === "preview" && Boolean(d.thumbnailUrl);
  const mediaBacklight =
    showPreview && d.thumbnailUrl ? (
      <MediaBacklight>
        {useThumbnailPreview || !playbackSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- Stock video thumbnail is used as a low-cost canvas preview
          <img
            src={d.thumbnailUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <video
            key={d.mp4Url}
            src={playbackSrc}
            poster={d.thumbnailUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload={videoPreload}
            aria-hidden="true"
            tabIndex={-1}
          />
        )}
      </MediaBacklight>
    ) : undefined;

  return (
    <BaseNodeWrapper
      nodeType="asset-video"
      selected={selected}
      backlight={mediaBacklight}
    >
      <CanvasHandle
        nodeId={id}
        nodeType="asset-video"
        type="target"
        position={Position.Left}
        className="h-3! w-3! border-2! border-background! bg-primary!"
      />

      <div className="flex h-full min-h-0 w-full flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Asset (Video)
          </span>
          <button
            type="button"
            onClick={openVideoBrowser}
            className={`nodrag h-6 rounded px-2 text-xs transition-colors ${
              hasVideo
                ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {hasVideo ? "Change" : "Browse Assets"}
          </button>
        </div>

        {/* Content: flex-1 + min-h-0 keeps media inside the node; avoid aspect-ratio here (grid overflow). */}
        {showPreview ? (
          <>
            <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
              {useThumbnailPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- Stock video thumbnail is used as a low-cost canvas preview
                <img
                  src={d.thumbnailUrl}
                  alt="Video preview"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <video
                  key={d.mp4Url}
                  src={playbackSrc}
                  poster={d.thumbnailUrl}
                  className="nodrag h-full w-full object-cover"
                  controls
                  playsInline
                  preload={videoPreload}
                  onError={handleVideoError}
                />
              )}

              {typeof d.duration === "number" && d.duration > 0 && (
                <div className="pointer-events-none absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
                  {formatDuration(d.duration)}
                </div>
              )}
            </div>

            {/* Attribution */}
            {d.attribution ? (
              <div className="flex shrink-0 flex-col gap-1 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-muted-foreground">
                    by {d.attribution.userName}
                  </span>
                  <a
                    href={d.attribution.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[10px] text-muted-foreground underline hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Pexels
                  </a>
                </div>
              </div>
            ) : (
              <div className="shrink-0 px-3 py-2" />
            )}
          </>
        ) : (
          <div className="flex min-h-0 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Play className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium">No video selected</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Browse stock videos from Pexels
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Video browser modal */}
      {panelOpen && d.canvasId ? (
        <VideoBrowserPanel
          nodeId={id}
          canvasId={d.canvasId}
          initialState={browserState}
          onStateChange={setBrowserState}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}

      <CanvasHandle
        nodeId={id}
        nodeType="asset-video"
        type="source"
        position={Position.Right}
        className="h-3! w-3! border-2! border-background! bg-primary!"
      />
    </BaseNodeWrapper>
  );
}
