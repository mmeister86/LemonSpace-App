"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { ExternalLink, ImageIcon } from "lucide-react";
import BaseNodeWrapper from "./base-node-wrapper";
import {
  AssetBrowserPanel,
  type AssetBrowserSessionState,
} from "@/components/canvas/asset-browser-panel";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { computeMediaNodeSize, resolveMediaAspectRatio } from "@/lib/canvas-utils";

type AssetNodeData = {
  assetId?: number;
  assetType?: "photo" | "vector" | "icon";
  title?: string;
  previewUrl?: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  url?: string;
  sourceUrl?: string;
  license?: "freemium" | "premium";
  authorName?: string;
  orientation?: string;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

export type AssetNodeType = Node<AssetNodeData, "asset">;

export default function AssetNode({ id, data, selected, width, height }: NodeProps<AssetNodeType>) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [handleTop, setHandleTop] = useState<number | undefined>(undefined);
  const [browserState, setBrowserState] = useState<AssetBrowserSessionState>({
    term: "",
    assetType: "photo",
    results: [],
    page: 1,
    totalPages: 1,
  });
  const resizeNode = useMutation(api.nodes.resize);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);

  const hasAsset = typeof data.assetId === "number";
  const previewUrl = data.url ?? data.previewUrl;
  const aspectRatio = resolveMediaAspectRatio(
    data.intrinsicWidth,
    data.intrinsicHeight,
    data.orientation,
  );

  useEffect(() => {
    if (!hasAsset) return;

    const targetSize = computeMediaNodeSize("asset", {
      intrinsicWidth: data.intrinsicWidth,
      intrinsicHeight: data.intrinsicHeight,
      orientation: data.orientation,
    });

    if (width === targetSize.width && height === targetSize.height) {
      return;
    }

    void resizeNode({
      nodeId: id as Id<"nodes">,
      width: targetSize.width,
      height: targetSize.height,
    });
  }, [
    data.intrinsicHeight,
    data.intrinsicWidth,
    data.orientation,
    hasAsset,
    height,
    id,
    resizeNode,
    width,
  ]);

  useLayoutEffect(() => {
    if (!hasAsset || !contentRef.current || !mediaRef.current) return;

    const contentEl = contentRef.current;
    const mediaEl = mediaRef.current;
    let frameId: number | undefined;

    const updateHandleTop = () => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        const contentRect = contentEl.getBoundingClientRect();
        const mediaRect = mediaEl.getBoundingClientRect();
        const nextTop = mediaRect.top - contentRect.top + mediaRect.height / 2;
        setHandleTop(nextTop);
      });
    };

    updateHandleTop();

    const observer = new ResizeObserver(updateHandleTop);
    observer.observe(contentEl);
    observer.observe(mediaEl);

    return () => {
      observer.disconnect();
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [aspectRatio, hasAsset]);

  const stopNodeClickPropagation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
  };

  return (
    <BaseNodeWrapper
      nodeType="asset"
      selected={selected}
      status={data._status}
      statusMessage={data._statusMessage}
      className="overflow-hidden"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="h-3! w-3! border-2! border-background! bg-primary!"
        style={{ top: hasAsset && handleTop ? `${handleTop}px` : "50%" }}
      />

      <div ref={contentRef} className="w-full">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Asset
          </span>
          <Button
            size="sm"
            variant={hasAsset ? "ghost" : "default"}
            className="h-6 px-2 text-xs"
            onClick={() => setPanelOpen(true)}
            type="button"
          >
            {hasAsset ? "Change" : "Browse Assets"}
          </Button>
        </div>

        {hasAsset && previewUrl ? (
          <div className="flex flex-col gap-0">
            <div
              ref={mediaRef}
              className="relative overflow-hidden bg-muted/30"
              style={{ aspectRatio }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={data.title ?? "Asset preview"}
                className="h-full w-full object-contain"
                draggable={false}
              />
              <Badge variant="secondary" className="absolute top-2 left-2 h-4 py-0 text-[10px]">
                {data.assetType ?? "asset"}
              </Badge>
              {data.license ? (
                <Badge
                  variant={data.license === "freemium" ? "outline" : "destructive"}
                  className="absolute top-2 right-2 h-4 py-0 text-[10px]"
                >
                  {data.license}
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-col gap-1 px-3 py-2">
              <p className="truncate text-xs font-medium" title={data.title ?? "Untitled"}>
                {data.title ?? "Untitled"}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] text-muted-foreground">
                  by {data.authorName ?? "Freepik"}
                </span>
                {data.sourceUrl ? (
                  <a
                    href={data.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    onClick={stopNodeClickPropagation}
                  >
                    freepik.com
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium">No asset selected</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Browse millions of Freepik resources
              </p>
            </div>
          </div>
        )}
      </div>

      {panelOpen && data.canvasId ? (
        <AssetBrowserPanel
          nodeId={id}
          canvasId={data.canvasId}
          initialState={browserState}
          onStateChange={setBrowserState}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}

      <Handle
        type="source"
        position={Position.Right}
        className="h-3! w-3! border-2! border-background! bg-primary!"
        style={{ top: hasAsset && handleTop ? `${handleTop}px` : "50%" }}
      />
    </BaseNodeWrapper>
  );
}
