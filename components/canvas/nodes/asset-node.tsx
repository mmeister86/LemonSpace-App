"use client";

import {
  useEffect,
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
import { computeMediaNodeSize } from "@/lib/canvas-utils";

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
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState<string | null>(null);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const [browserState, setBrowserState] = useState<AssetBrowserSessionState>({
    term: "",
    assetType: "photo",
    results: [],
    page: 1,
    totalPages: 1,
  });
  const resizeNode = useMutation(api.nodes.resize);

  const hasAsset = typeof data.assetId === "number";
  const previewUrl = data.url ?? data.previewUrl;
  const isPreviewLoading = Boolean(
    previewUrl && previewUrl !== loadedPreviewUrl && previewUrl !== failedPreviewUrl,
  );
  const previewLoadError = Boolean(previewUrl && previewUrl === failedPreviewUrl);

  const hasAutoSizedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const lastMetricsRef = useRef<string>("");

  useEffect(() => {
    if (!hasAsset) return;
    if (hasAutoSizedRef.current) return;
    hasAutoSizedRef.current = true;

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

  const stopNodeClickPropagation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
  };

  const showPreview = Boolean(hasAsset && previewUrl);

  useEffect(() => {
    if (!selected) return;
    const rootEl = rootRef.current;
    const headerEl = headerRef.current;
    if (!rootEl || !headerEl) return;

    const rootHeight = rootEl.getBoundingClientRect().height;
    const headerHeight = headerEl.getBoundingClientRect().height;
    const previewHeight = previewRef.current?.getBoundingClientRect().height ?? null;
    const footerHeight = footerRef.current?.getBoundingClientRect().height ?? null;
    const imageEl = imageRef.current;
    const rootStyles = window.getComputedStyle(rootEl);
    const imageStyles = imageEl ? window.getComputedStyle(imageEl) : null;
    const rows = rootStyles.gridTemplateRows;
    const imageRect = imageEl?.getBoundingClientRect();
    const previewRect = previewRef.current?.getBoundingClientRect();
    const naturalRatio =
      imageEl && imageEl.naturalWidth > 0 && imageEl.naturalHeight > 0
        ? imageEl.naturalWidth / imageEl.naturalHeight
        : null;
    const previewRatio =
      previewRect && previewRect.width > 0 && previewRect.height > 0
        ? previewRect.width / previewRect.height
        : null;
    let expectedContainWidth: number | null = null;
    let expectedContainHeight: number | null = null;
    if (previewRect && naturalRatio) {
      const fitByWidthHeight = previewRect.width / naturalRatio;
      if (fitByWidthHeight <= previewRect.height) {
        expectedContainWidth = previewRect.width;
        expectedContainHeight = fitByWidthHeight;
      } else {
        expectedContainHeight = previewRect.height;
        expectedContainWidth = previewRect.height * naturalRatio;
      }
    }
    const signature = `${width}|${height}|${Math.round(rootHeight)}|${Math.round(headerHeight)}|${Math.round(previewHeight ?? -1)}|${Math.round(footerHeight ?? -1)}|${Math.round(imageRect?.height ?? -1)}|${rows}|${showPreview}`;

    if (lastMetricsRef.current === signature) {
      return;
    }
    lastMetricsRef.current = signature;

    // #region agent log
    fetch('http://127.0.0.1:7733/ingest/db1ec129-24cb-483b-98e2-3e7beef6d9cd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d48a18'},body:JSON.stringify({sessionId:'d48a18',runId:'run4',hypothesisId:'H13-H14',location:'asset-node.tsx:metricsEffect',message:'asset contain-fit diagnostics',data:{nodeId:id,width,height,rootHeight,previewWidth:previewRect?.width ?? null,previewHeight,previewRatio,naturalRatio,headerHeight,footerHeight,imageRenderWidth:imageRect?.width ?? null,imageRenderHeight:imageRect?.height ?? null,expectedContainWidth,expectedContainHeight,imageNaturalWidth:imageEl?.naturalWidth ?? null,imageNaturalHeight:imageEl?.naturalHeight ?? null,imageObjectFit:imageStyles?.objectFit ?? null,imageObjectPosition:imageStyles?.objectPosition ?? null,rows,showPreview},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [height, id, selected, showPreview, width]);

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
      />

      <div
        ref={rootRef}
        className={`grid h-full min-h-0 w-full ${
          showPreview
            ? "grid-rows-[auto_minmax(0,1fr)_auto]"
            : "grid-rows-[auto_minmax(0,1fr)]"
        }`}
      >
        <div ref={headerRef} className="flex items-center justify-between border-b px-3 py-2">
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

        {showPreview ? (
          <>
            <div ref={previewRef} className="relative min-h-0 overflow-hidden bg-muted/30">
              {isPreviewLoading ? (
                <div className="absolute inset-0 z-10 flex animate-pulse items-center justify-center bg-muted/60 text-[11px] text-muted-foreground">
                  Loading preview...
                </div>
              ) : null}
              {previewLoadError ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/70 text-[11px] text-muted-foreground">
                  Preview unavailable
                </div>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={previewUrl}
                alt={data.title ?? "Asset preview"}
                className={`h-full w-full object-cover object-center transition-opacity ${
                  isPreviewLoading ? "opacity-0" : "opacity-100"
                }`}
                draggable={false}
                onLoad={() => {
                  setLoadedPreviewUrl(previewUrl ?? null);
                  setFailedPreviewUrl((current) =>
                    current === (previewUrl ?? null) ? null : current,
                  );
                }}
                onError={() => {
                  setFailedPreviewUrl(previewUrl ?? null);
                }}
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

            <div ref={footerRef} className="flex flex-col gap-1 px-3 py-2">
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
          </>
        ) : (
          <div className="flex min-h-0 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
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
      />
    </BaseNodeWrapper>
  );
}
