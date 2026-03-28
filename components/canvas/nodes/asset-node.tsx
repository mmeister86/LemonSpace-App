"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { ExternalLink, ImageIcon } from "lucide-react";
import BaseNodeWrapper from "./base-node-wrapper";
import {
  AssetBrowserPanel,
  useAssetBrowserTarget,
  type AssetBrowserSessionState,
} from "@/components/canvas/asset-browser-panel";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolveMediaAspectRatio } from "@/lib/canvas-utils";

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
  const { targetNodeId, openForNode, close: closeAssetBrowser } =
    useAssetBrowserTarget();
  const panelOpen = targetNodeId === id;
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

  const edges = useStore((s) => s.edges);
  const nodes = useStore((s) => s.nodes);

  const linkedSearchTerm = useMemo(() => {
    const incoming = edges.filter((e) => e.target === id);
    for (const edge of incoming) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode?.type !== "text") continue;
      const content = (sourceNode.data as { content?: string }).content;
      if (typeof content === "string" && content.trim().length > 0) {
        return content.trim();
      }
    }
    return "";
  }, [edges, id, nodes]);

  const openAssetBrowser = useCallback(() => {
    setBrowserState((s) =>
      linkedSearchTerm
        ? { ...s, term: linkedSearchTerm, results: [], page: 1, totalPages: 1 }
        : s,
    );
    openForNode(id);
  }, [id, linkedSearchTerm, openForNode]);

  const hasAsset = typeof data.assetId === "number";
  const previewUrl = data.url ?? data.previewUrl;
  const isPreviewLoading = Boolean(
    previewUrl && previewUrl !== loadedPreviewUrl && previewUrl !== failedPreviewUrl,
  );
  const previewLoadError = Boolean(previewUrl && previewUrl === failedPreviewUrl);

  const hasAutoSizedRef = useRef(false);

  useEffect(() => {
    if (!hasAsset) return;
    if (hasAutoSizedRef.current) return;
    const targetAspectRatio = resolveMediaAspectRatio(
      data.intrinsicWidth,
      data.intrinsicHeight,
      data.orientation,
    );
    const minimumNodeHeight = 208;
    const baseNodeWidth = 260;
    const targetWidth = Math.max(baseNodeWidth, Math.round(minimumNodeHeight * targetAspectRatio));
    const targetHeight = Math.round(targetWidth / targetAspectRatio);
    const targetSize = {
      width: targetWidth,
      height: targetHeight,
    };
    const currentWidth = typeof width === "number" ? width : 0;
    const currentHeight = typeof height === "number" ? height : 0;
    const hasMeasuredSize = currentWidth > 0 && currentHeight > 0;
    if (!hasMeasuredSize) {
      return;
    }

    const isAtTargetSize = currentWidth === targetSize.width && currentHeight === targetSize.height;
    const isAtDefaultSeedSize = currentWidth === 260 && currentHeight === 240;
    const shouldRunInitialAutoSize = isAtDefaultSeedSize && !isAtTargetSize;

    if (!shouldRunInitialAutoSize) {
      hasAutoSizedRef.current = true;
      return;
    }

    hasAutoSizedRef.current = true;
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

  return (
    <BaseNodeWrapper
      nodeType="asset"
      selected={selected}
      status={data._status}
      statusMessage={data._statusMessage}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="h-3! w-3! border-2! border-background! bg-primary!"
      />

      <div
        className={`grid h-full min-h-0 w-full ${
          showPreview
            ? "grid-rows-[auto_minmax(0,1fr)_auto]"
            : "grid-rows-[auto_minmax(0,1fr)]"
        }`}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            FreePik
          </span>
          <Button
            size="sm"
            variant={hasAsset ? "ghost" : "default"}
            className="nodrag h-6 px-2 text-xs"
            onClick={openAssetBrowser}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            {hasAsset ? "Change" : "Browse Assets"}
          </Button>
        </div>

        {showPreview ? (
          <>
            <div className="relative min-h-0 overflow-hidden bg-muted/30">
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
                src={previewUrl}
                alt={data.title ?? "FreePik-Vorschau"}
                className={`h-full w-full object-contain transition-opacity ${
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
          onClose={closeAssetBrowser}
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
