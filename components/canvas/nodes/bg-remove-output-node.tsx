"use client";

/**
 * Onboarding note:
 * System output node for Freepik background removal. It is image-like, but
 * intentionally not user-uploadable; reruns happen from the bg-remove control node.
 */

import { useState } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { ImageOff, Loader2, Maximize2, X } from "lucide-react";

import CanvasHandle from "@/components/canvas/canvas-handle";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaBacklight } from "./media-backlight";

type BgRemoveOutputNodeData = {
  url?: string;
  previewUrl?: string;
  filename?: string;
  originalFilename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  source?: string;
  _status?: string;
  _statusMessage?: string;
};

type BgRemoveOutputNodeType = Node<BgRemoveOutputNodeData, "bg-remove-output">;

const CHECKERBOARD_BACKGROUND = {
  backgroundImage:
    "linear-gradient(45deg, rgba(148, 163, 184, 0.24) 25%, transparent 25%), linear-gradient(-45deg, rgba(148, 163, 184, 0.24) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.24) 75%), linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.24) 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
};

export default function BgRemoveOutputNode({
  id,
  data,
  selected,
}: NodeProps<BgRemoveOutputNodeType>) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const imageUrl = data.url ?? data.previewUrl;
  const label = data.originalFilename ?? data.filename ?? "BG-Ausgabe";
  const isExecuting = data._status === "executing";
  const mediaBacklight =
    imageUrl && !isExecuting ? (
      <MediaBacklight>
        {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URL for generated output */}
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain object-center"
          draggable={false}
        />
      </MediaBacklight>
    ) : undefined;

  return (
    <>
      <BaseNodeWrapper
        nodeType="bg-remove-output"
        selected={selected}
        status={data._status}
        statusMessage={data._statusMessage}
        backlight={mediaBacklight}
        toolbarActions={[
          {
            id: "fullscreen-output",
            label: "Fullscreen",
            icon: <Maximize2 size={14} />,
            onClick: () => setIsFullscreenOpen(true),
            disabled: !imageUrl,
          },
        ]}
        className="min-w-[280px] border-teal-500/30"
      >
        <CanvasHandle
          nodeId={id}
          nodeType="bg-remove-output"
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-teal-500"
        />

        <div className="grid h-full min-h-0 w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-y-1 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-300">
              <ImageOff className="h-3.5 w-3.5" />
              BG-Ausgabe
            </div>
            <span className="text-[10px] text-muted-foreground">Alpha</span>
          </div>

          <div
            className="relative min-h-0 overflow-hidden rounded-lg border border-border/70 bg-muted/30"
            style={CHECKERBOARD_BACKGROUND}
          >
            {isExecuting ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/55 text-xs text-muted-foreground backdrop-blur-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Freistellung laeuft...
              </div>
            ) : imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL for generated output
              <img
                src={imageUrl}
                alt={label}
                className="h-full w-full object-contain object-center"
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
                Noch keine BG-Ausgabe
              </div>
            )}
          </div>

          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>

        <CanvasHandle
          nodeId={id}
          nodeType="bg-remove-output"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background !bg-teal-500"
        />
      </BaseNodeWrapper>

      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent
          className="inset-0 left-0 top-0 h-screen w-screen max-w-none -translate-x-0 -translate-y-0 place-items-center gap-0 rounded-none border-none bg-transparent p-0 ring-0 shadow-none sm:max-w-none"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <button
            type="button"
            onClick={() => setIsFullscreenOpen(false)}
            aria-label="Close BG output preview"
            className="absolute right-6 top-6 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white/90 transition-colors hover:bg-black/30"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex h-full w-full items-center justify-center">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL for generated output
              <img
                src={imageUrl}
                alt={label}
                className="h-auto max-h-[80vh] w-auto max-w-[80vw] rounded-xl object-contain shadow-2xl"
                draggable={false}
              />
            ) : (
              <div className="rounded-lg bg-popover/95 px-4 py-3 text-sm text-muted-foreground shadow-lg">
                Keine BG-Ausgabe verfügbar
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
