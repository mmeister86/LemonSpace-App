"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas render node ui node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { RefObject } from "react";
import { AlertCircle, ArrowDown, CheckCircle2, CloudUpload, Loader2, X } from "lucide-react";

import { SliderRow } from "@/components/canvas/nodes/adjustment-controls";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PersistedRenderData, RenderFormatOption, RenderResolutionOption, RenderState } from "./render-node-state";
import { MAX_CUSTOM_DIMENSION, MIN_CUSTOM_DIMENSION, formatBytes, sanitizeDimension } from "./render-node-state";
import { TRANSPARENCY_CHECKERBOARD_STYLE } from "./transparency-background";

type RenderNodeMenuProps = {
  localData: PersistedRenderData;
  updateLocalData: (updater: (current: PersistedRenderData) => PersistedRenderData) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  isRendering: boolean;
  isUploading: boolean;
  canRender: boolean;
  canUpload: boolean;
  isOffline: boolean;
  renderState: RenderState;
  onRender: (mode: "download" | "upload") => void;
};

export function RenderNodeMenu({
  localData,
  updateLocalData,
  isOpen,
  setIsOpen,
  buttonRef,
  panelRef,
  isRendering,
  isUploading,
  canRender,
  canUpload,
  isOffline,
  renderState,
  onRender,
}: RenderNodeMenuProps) {
  return (
    <div className="absolute right-3 top-3 z-30">
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
        className="nodrag flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/75 text-foreground shadow-sm backdrop-blur-sm transition hover:bg-background"
        aria-label="Render Actions"
      >
        {isRendering || isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          onPointerDown={(event) => event.stopPropagation()}
          className="nodrag absolute right-0 top-11 w-64 space-y-2 rounded-xl border border-border/80 bg-popover/95 p-3 shadow-lg backdrop-blur"
        >
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Resolution</div>
            <Select
              value={localData.outputResolution}
              onValueChange={(value: RenderResolutionOption) => {
                updateLocalData((current) => ({ ...current, outputResolution: value }));
              }}
            >
              <SelectTrigger className="nodrag h-8 text-xs" size="sm">
                <SelectValue placeholder="Resolution" />
              </SelectTrigger>
              <SelectContent className="nodrag">
                <SelectItem value="original">Original</SelectItem>
                <SelectItem value="2x">2x</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {localData.outputResolution === "custom" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Width</span>
                <input
                  type="number"
                  step={1}
                  min={MIN_CUSTOM_DIMENSION}
                  max={MAX_CUSTOM_DIMENSION}
                  value={localData.customWidth ?? ""}
                  onChange={(event) => {
                    const parsed = sanitizeDimension(Number(event.target.value));
                    updateLocalData((current) => ({ ...current, customWidth: parsed }));
                  }}
                  className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Height</span>
                <input
                  type="number"
                  step={1}
                  min={MIN_CUSTOM_DIMENSION}
                  max={MAX_CUSTOM_DIMENSION}
                  value={localData.customHeight ?? ""}
                  onChange={(event) => {
                    const parsed = sanitizeDimension(Number(event.target.value));
                    updateLocalData((current) => ({ ...current, customHeight: parsed }));
                  }}
                  className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                />
              </label>
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Format</div>
            <Select
              value={localData.format}
              onValueChange={(value: RenderFormatOption) => {
                updateLocalData((current) => ({ ...current, format: value }));
              }}
            >
              <SelectTrigger className="nodrag h-8 text-xs" size="sm">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent className="nodrag">
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {localData.format === "jpeg" ? (
            <SliderRow
              label="JPEG Quality"
              value={localData.jpegQuality}
              min={1}
              max={100}
              onChange={(value) => {
                updateLocalData((current) => ({
                  ...current,
                  jpegQuality: Math.max(1, Math.min(100, Math.round(value))),
                }));
              }}
            />
          ) : null}

          <div className="space-y-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onRender("download");
              }}
              disabled={!canRender}
              className="nodrag inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {renderState === "rendering" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Render & Download
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onRender("upload");
              }}
              disabled={!canUpload}
              className="nodrag inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudUpload className="h-3 w-3" />}
              Render & Upload
            </button>

            {isOffline ? <p className="text-[10px] text-muted-foreground">Upload ist nur online verfuegbar.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RenderNodePreviewSurface({
  hasSource,
  canvasRef,
  isAlphaBearing = false,
}: {
  hasSource: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isAlphaBearing?: boolean;
}) {
  return hasSource ? (
    <div
      className="absolute inset-0"
      data-alpha-source={isAlphaBearing ? "true" : undefined}
      style={isAlphaBearing ? TRANSPARENCY_CHECKERBOARD_STYLE : undefined}
    >
      <canvas
        ref={canvasRef}
        className={`h-full w-full ${isAlphaBearing ? "object-contain" : "object-cover"}`}
      />
    </div>
  ) : (
    <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
      Verbinde eine Bild-, Asset- oder KI-Bild-Node als Quelle.
    </div>
  );
}

export function RenderNodeStatusOverlay({
  renderState,
  isPreviewRendering,
  previewError,
  hasSource,
}: {
  renderState: RenderState;
  isPreviewRendering: boolean;
  previewError: string | null | undefined;
  hasSource: boolean;
}) {
  const renderStateLabel: Record<RenderState, string> = {
    idle: "Idle",
    rendering: "Rendering",
    done: "Done",
    error: "Error",
  };
  const statusToneClass =
    renderState === "done"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : renderState === "rendering"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : renderState === "error"
          ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-border bg-muted/40 text-muted-foreground";

  return (
    <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
      <div className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide backdrop-blur-sm ${statusToneClass}`}>
        {renderStateLabel[renderState]}
      </div>
      {(isPreviewRendering || previewError) && hasSource ? (
        <div className="rounded-full border border-border/80 bg-background/75 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
          {isPreviewRendering ? "Preview..." : "Preview error"}
        </div>
      ) : null}
    </div>
  );
}

export function RenderNodeBottomStatus({
  renderState,
  isRenderCurrent,
  localData,
  currentError,
  isUploadCurrent,
  currentUploadError,
  previewError,
}: {
  renderState: RenderState;
  isRenderCurrent: boolean;
  localData: PersistedRenderData;
  currentError: string | undefined;
  isUploadCurrent: boolean;
  currentUploadError: string | undefined;
  previewError: string | null | undefined;
}) {
  return (
    <div className="absolute bottom-3 left-3 z-20 max-w-[70%] space-y-1.5 text-[11px]">
      {renderState === "idle" && !isRenderCurrent && localData.lastRenderedAt ? (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-background/85 px-2 py-1 text-amber-700 backdrop-blur-sm dark:text-amber-300">
          <AlertCircle className="h-3 w-3" />
          Pipeline geaendert. Bitte erneut rendern.
        </div>
      ) : null}

      {renderState === "done" ? (
        <div className="rounded-md border border-emerald-500/40 bg-background/85 px-2 py-1 text-emerald-700 backdrop-blur-sm dark:text-emerald-300">
          <div className="flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Export abgeschlossen
          </div>
          <div>
            {localData.lastRenderWidth}x{localData.lastRenderHeight} px - {String(localData.lastRenderFormat ?? localData.format).toUpperCase()} - {formatBytes(localData.lastRenderSizeBytes)}
          </div>
          {localData.lastRenderWasSizeClamped ? <div>Ausgabe wurde an Groessenlimits angepasst.</div> : null}
        </div>
      ) : null}

      {renderState === "error" && currentError ? (
        <div className="rounded-md border border-red-500/40 bg-background/90 px-2 py-1 text-red-600 backdrop-blur-sm">{currentError}</div>
      ) : null}

      {isUploadCurrent && localData.lastUploadStorageId ? (
        <div className="rounded-md border border-sky-500/40 bg-background/85 px-2 py-1 text-sky-700 backdrop-blur-sm dark:text-sky-300">
          <div className="font-medium">Upload gespeichert</div>
          <div>Storage: {localData.lastUploadStorageId}</div>
          <div>{localData.lastUploadUrl ? "URL aufgeloest" : "URL-Aufloesung ausstehend"}</div>
        </div>
      ) : null}

      {currentUploadError ? (
        <div className="rounded-md border border-red-500/40 bg-background/90 px-2 py-1 text-red-600 backdrop-blur-sm">Upload fehlgeschlagen: {currentUploadError}</div>
      ) : null}

      {previewError ? (
        <div className="rounded-md border border-red-500/40 bg-background/90 px-2 py-1 text-red-600 backdrop-blur-sm">Preview: {previewError}</div>
      ) : null}
    </div>
  );
}

export function RenderNodeHistogram({ histogramPlot }: { histogramPlot: { polylines: Record<"rgb" | "red" | "green" | "blue", string> } }) {
  return (
    <div className="absolute bottom-3 right-3 z-20 w-28 rounded-md border border-border/80 bg-background/85 px-2 py-1.5 backdrop-blur-sm">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Gesamt-Histogramm</div>
      <svg viewBox="0 0 96 44" className="h-11 w-full" role="img" aria-label="Histogramm als RGB-Linienkurven">
        <polyline points={histogramPlot.polylines.rgb} fill="none" stroke="rgba(248, 250, 252, 0.9)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={histogramPlot.polylines.red} fill="none" stroke="rgba(248, 113, 113, 0.9)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={histogramPlot.polylines.green} fill="none" stroke="rgba(74, 222, 128, 0.85)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={histogramPlot.polylines.blue} fill="none" stroke="rgba(96, 165, 250, 0.88)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function RenderNodeFullscreenDialog({
  open,
  onOpenChange,
  hasSource,
  localData,
  canvasRef,
  isRendering,
  error,
  isAlphaBearing = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasSource: boolean;
  localData: PersistedRenderData;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isRendering: boolean;
  error: string | null | undefined;
  isAlphaBearing?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 left-0 top-0 h-screen w-screen max-w-none -translate-x-0 -translate-y-0 place-items-center gap-0 rounded-none border-none bg-transparent p-0 ring-0 shadow-none sm:max-w-none" showCloseButton={false}>
        <DialogTitle className="sr-only">Render-Ausgabe</DialogTitle>
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Close render preview" className="absolute right-6 top-6 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white/90 transition-colors hover:bg-black/30">
          <X className="h-5 w-5" />
        </button>
        <div className="flex h-full w-full items-center justify-center">
          {hasSource ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <canvas
                ref={canvasRef}
                className="h-auto max-h-[80vh] w-auto max-w-[80vw] rounded-xl object-contain shadow-2xl"
                data-alpha-source={isAlphaBearing ? "true" : undefined}
                style={isAlphaBearing ? TRANSPARENCY_CHECKERBOARD_STYLE : undefined}
              />
              {isRendering ? <div className="pointer-events-none absolute bottom-6 rounded-md border border-border/80 bg-background/85 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">Rendering preview...</div> : null}
              {error ? <div className="pointer-events-none absolute bottom-6 rounded-md border border-red-500/40 bg-background/90 px-3 py-1 text-xs text-red-600 backdrop-blur-sm">Preview: {error}</div> : null}
            </div>
          ) : localData.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={localData.url} alt="Render output" className="h-auto max-h-[80vh] w-auto max-w-[80vw] rounded-xl object-contain shadow-2xl" draggable={false} />
          ) : (
            <div className="rounded-lg bg-popover/95 px-4 py-3 text-sm text-muted-foreground shadow-lg">Keine Render-Ausgabe verfuegbar</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
