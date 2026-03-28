"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { X, Search, Loader2, AlertCircle, Play, Pause } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PexelsVideo, PexelsVideoFile } from "@/lib/pexels-types";
import { pickPreviewVideoFile, pickVideoFile } from "@/lib/pexels-types";
import { toast } from "@/lib/toast";

type Orientation = "" | "landscape" | "portrait" | "square";
type DurationFilter = "all" | "short" | "medium" | "long";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pexelsVideoProxySrc(mp4Url: string): string {
  return `/api/pexels-video?u=${encodeURIComponent(mp4Url)}`;
}

export interface VideoBrowserSessionState {
  term: string;
  orientation: Orientation;
  durationFilter: DurationFilter;
  results: PexelsVideo[];
  page: number;
  totalPages: number;
}

interface Props {
  nodeId: string;
  canvasId: string;
  onClose: () => void;
  initialState?: VideoBrowserSessionState;
  onStateChange?: (state: VideoBrowserSessionState) => void;
}

export function VideoBrowserPanel({
  nodeId,
  canvasId,
  onClose,
  initialState,
  onStateChange,
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [term, setTerm] = useState(initialState?.term ?? "");
  const [debouncedTerm, setDebouncedTerm] = useState(initialState?.term ?? "");
  const [orientation, setOrientation] = useState<Orientation>(
    initialState?.orientation ?? "",
  );
  const [durationFilter, setDurationFilter] = useState<DurationFilter>(
    initialState?.durationFilter ?? "all",
  );
  const [results, setResults] = useState<PexelsVideo[]>(
    initialState?.results ?? [],
  );
  const [page, setPage] = useState(initialState?.page ?? 1);
  const [totalPages, setTotalPages] = useState(initialState?.totalPages ?? 1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectingVideoId, setSelectingVideoId] = useState<number | null>(
    null,
  );
  const [previewingVideoId, setPreviewingVideoId] = useState<number | null>(
    null,
  );

  const searchVideos = useAction(api.pexels.searchVideos);
  const popularVideos = useAction(api.pexels.popularVideos);
  const updateData = useMutation(api.nodes.updateData);
  const resizeNode = useMutation(api.nodes.resize);
  const shouldSkipInitialSearchRef = useRef(
    Boolean(initialState?.results?.length),
  );
  const requestSequenceRef = useRef(0);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const isSelecting = selectingVideoId !== null;

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Debounce
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedTerm(term), 400);
    return () => clearTimeout(timeout);
  }, [term]);

  useEffect(() => {
    setPreviewingVideoId(null);
  }, [debouncedTerm, orientation, durationFilter, page]);

  // Escape
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Session state sync
  useEffect(() => {
    if (!onStateChange) return;
    onStateChange({ term, orientation, durationFilter, results, page, totalPages });
  }, [durationFilter, onStateChange, orientation, page, results, term, totalPages]);

  const getDurationParams = useCallback(
    (filter: DurationFilter): { minDuration?: number; maxDuration?: number } => {
      switch (filter) {
        case "short":
          return { maxDuration: 30 };
        case "medium":
          return { minDuration: 30, maxDuration: 60 };
        case "long":
          return { minDuration: 60 };
        default:
          return {};
      }
    },
    [],
  );

  const runSearch = useCallback(
    async (searchTerm: string, requestedPage: number) => {
      const seq = ++requestSequenceRef.current;
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const isSearch = searchTerm.trim().length > 0;
        const durationParams = getDurationParams(durationFilter);

        const response = isSearch
          ? await searchVideos({
              query: searchTerm,
              orientation: orientation || undefined,
              page: requestedPage,
              perPage: 20,
              ...durationParams,
            })
          : await popularVideos({
              page: requestedPage,
              perPage: 20,
            });

        if (seq !== requestSequenceRef.current) return;

        const videos = response.videos ?? [];
        setResults(videos);
        setPage(requestedPage);

        // Estimate total pages from next_page presence
        const estimatedTotal = response.total_results ?? videos.length * requestedPage;
        const perPage = response.per_page ?? 20;
        setTotalPages(Math.max(1, Math.ceil(estimatedTotal / perPage)));

        if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
      } catch (error) {
        if (seq !== requestSequenceRef.current) return;
        console.error("Pexels video search error", error);
        setErrorMessage(
          error instanceof Error ? error.message : "Search failed",
        );
      } finally {
        if (seq === requestSequenceRef.current) setIsLoading(false);
      }
    },
    [searchVideos, popularVideos, orientation, durationFilter, getDurationParams],
  );

  // Trigger search
  useEffect(() => {
    if (shouldSkipInitialSearchRef.current) {
      shouldSkipInitialSearchRef.current = false;
      return;
    }
    void runSearch(debouncedTerm, 1);
  }, [debouncedTerm, orientation, durationFilter, runSearch]);

  const handleSelect = useCallback(
    async (video: PexelsVideo) => {
      if (isSelecting) return;
      setSelectingVideoId(video.id);
      let file: PexelsVideoFile;
      try {
        file = pickVideoFile(video.video_files);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Videoformat nicht verfügbar",
        );
        setSelectingVideoId(null);
        return;
      }
      try {
        await updateData({
          nodeId: nodeId as Id<"nodes">,
          data: {
            pexelsId: video.id,
            mp4Url: file.link,
            thumbnailUrl: video.image,
            width: video.width,
            height: video.height,
            duration: video.duration,
            attribution: {
              userName: video.user.name,
              userUrl: video.user.url,
              videoUrl: video.url,
            },
            canvasId,
          },
        });

        // Auto-resize to match aspect ratio
        const aspectRatio =
          video.width > 0 && video.height > 0
            ? video.width / video.height
            : 16 / 9;
        const targetWidth = 320;
        const targetHeight = Math.round(targetWidth / aspectRatio);
        await resizeNode({
          nodeId: nodeId as Id<"nodes">,
          width: targetWidth,
          height: targetHeight,
        });
        onClose();
      } catch (error) {
        console.error("Failed to select video", error);
      } finally {
        setSelectingVideoId(null);
      }
    },
    [canvasId, isSelecting, nodeId, onClose, resizeNode, updateData],
  );

  const handlePreviousPage = useCallback(() => {
    if (isLoading || page <= 1) return;
    void runSearch(debouncedTerm, page - 1);
  }, [debouncedTerm, isLoading, page, runSearch]);

  const handleNextPage = useCallback(() => {
    if (isLoading || page >= totalPages) return;
    void runSearch(debouncedTerm, page + 1);
  }, [debouncedTerm, isLoading, page, runSearch, totalPages]);

  const modal = useMemo(
    () => (
      <div
        className="nowheel nodrag nopan fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        onWheelCapture={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <div
          className="nowheel nodrag nopan relative flex max-h-[80vh] w-[720px] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          onClick={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
          onPointerDownCapture={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Browse Pexels videos"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Browse Pexels Videos</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close video browser"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search + Filters */}
          <div className="flex shrink-0 flex-col gap-3 border-b px-5 py-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search videos..."
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Format:</span>
                {(["", "landscape", "portrait", "square"] as const).map((o) => (
                  <button
                    key={o || "all"}
                    type="button"
                    onClick={() => setOrientation(o)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      orientation === o
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {o === "" ? "Alle" : o === "landscape" ? "Quer" : o === "portrait" ? "Hoch" : "Quadrat"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Dauer:</span>
                {(
                  [
                    ["all", "Alle"],
                    ["short", "<30s"],
                    ["medium", "30–60s"],
                    ["long", ">60s"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDurationFilter(key)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      durationFilter === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          <div
            ref={scrollAreaRef}
            className="nowheel nodrag nopan flex-1 overflow-y-auto p-5"
            onWheelCapture={(event) => event.stopPropagation()}
          >
            {isLoading && results.length === 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-video animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : errorMessage ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-foreground">Search failed</p>
                <p className="max-w-md text-xs">{errorMessage}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void runSearch(debouncedTerm, page)}
                >
                  Erneut versuchen
                </Button>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                <Search className="h-8 w-8" />
                <p className="text-sm">
                  {term.trim() ? "Keine Videos gefunden" : "Videos werden geladen..."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {results.map((video) => {
                  const isSelectingThis = selectingVideoId === video.id;
                  const previewFile = pickPreviewVideoFile(video.video_files);
                  const previewSrc = previewFile
                    ? pexelsVideoProxySrc(previewFile.link)
                    : null;
                  const isPreview = previewingVideoId === video.id;
                  const stopBubbling = (e: PointerEvent | MouseEvent) => {
                    e.stopPropagation();
                  };
                  return (
                    <div
                      key={video.id}
                      className="group relative aspect-video overflow-hidden rounded-lg border-2 border-transparent bg-muted transition-all hover:border-primary focus-within:border-primary"
                      title={`${video.user.name} — ${formatDuration(video.duration)}`}
                    >
                      <button
                        type="button"
                        disabled={isSelecting}
                        onClick={() => void handleSelect(video)}
                        aria-busy={isSelectingThis}
                        aria-label={`Video von ${video.user.name} auswählen`}
                        className={`absolute inset-0 z-0 rounded-[inherit] border-0 bg-transparent p-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed ${
                          isPreview ? "pointer-events-none" : "cursor-pointer"
                        }`}
                      >
                        <span className="sr-only">Auswählen</span>
                      </button>
                      {isPreview && previewSrc ? (
                        <video
                          key={previewSrc}
                          src={previewSrc}
                          className="nodrag absolute inset-0 z-15 h-full w-full object-cover"
                          controls
                          muted
                          loop
                          playsInline
                          autoPlay
                          preload="metadata"
                          onPointerDownCapture={stopBubbling}
                        />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={video.image}
                          alt=""
                          className="pointer-events-none absolute inset-0 z-1 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                      )}
                      {previewSrc ? (
                        <button
                          type="button"
                          className="nodrag pointer-events-auto absolute bottom-1 left-1 z-20 flex h-8 w-8 items-center justify-center rounded-md bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                          aria-label={isPreview ? "Vorschau beenden" : "Vorschau abspielen"}
                          onPointerDown={stopBubbling}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPreviewingVideoId((cur) =>
                              cur === video.id ? null : video.id,
                            );
                          }}
                        >
                          {isPreview ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5 fill-current" />
                          )}
                        </button>
                      ) : null}
                      {isPreview ? (
                        <button
                          type="button"
                          className="nodrag pointer-events-auto absolute top-1 right-1 z-20 rounded-md bg-black/65 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm hover:bg-black/80"
                          onPointerDown={stopBubbling}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleSelect(video);
                          }}
                        >
                          Auswählen
                        </button>
                      ) : null}
                      <div className="pointer-events-none absolute bottom-1 right-1 z-12 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white tabular-nums">
                        {formatDuration(video.duration)}
                      </div>
                      <div className="pointer-events-none absolute inset-0 z-11 bg-black/0 transition-colors group-hover:bg-black/10" />
                      {isSelectingThis ? (
                        <div className="pointer-events-none absolute inset-0 z-25 flex flex-col items-center justify-center gap-1 bg-black/55 text-[11px] text-white">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Anwenden...
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 flex-col gap-3 border-t px-5 py-3">
            {results.length > 0 ? (
              <div className="flex items-center justify-center gap-2" aria-live="polite">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={isLoading || page <= 1}
                >
                  Zurück
                </Button>
                <span className="text-xs text-muted-foreground">
                  Seite {page} von {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={isLoading || page >= totalPages}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Laden...
                    </>
                  ) : (
                    "Weiter"
                  )}
                </Button>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Videos by{" "}
                <a
                  href="https://www.pexels.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline transition-colors hover:text-foreground"
                >
                  Pexels
                </a>
                . Free to use, attribution appreciated.
              </p>
              <span className="text-[11px] text-muted-foreground">
                {results.length > 0 ? `${results.length} Videos` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    [
      debouncedTerm,
      durationFilter,
      errorMessage,
      handleNextPage,
      handlePreviousPage,
      handleSelect,
      isLoading,
      isSelecting,
      onClose,
      orientation,
      page,
      results,
      runSearch,
      previewingVideoId,
      selectingVideoId,
      term,
      totalPages,
    ],
  );

  if (!isMounted) return null;
  return createPortal(modal, document.body);
}
