"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { X, Search, Loader2, AlertCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { computeMediaNodeSize } from "@/lib/canvas-utils";

type AssetType = "photo" | "vector" | "icon";

interface FreepikResult {
  id: number;
  title: string;
  assetType: AssetType;
  previewUrl: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  sourceUrl: string;
  license: "freemium" | "premium";
  authorName: string;
  orientation?: string;
}

export interface AssetBrowserSessionState {
  term: string;
  assetType: AssetType;
  results: FreepikResult[];
  page: number;
  totalPages: number;
}

interface Props {
  nodeId: string;
  canvasId: string;
  onClose: () => void;
  initialState?: AssetBrowserSessionState;
  onStateChange?: (state: AssetBrowserSessionState) => void;
}

export function AssetBrowserPanel({
  nodeId,
  canvasId,
  onClose,
  initialState,
  onStateChange,
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [term, setTerm] = useState(initialState?.term ?? "");
  const [debouncedTerm, setDebouncedTerm] = useState(initialState?.term ?? "");
  const [assetType, setAssetType] = useState<AssetType>(initialState?.assetType ?? "photo");
  const [results, setResults] = useState<FreepikResult[]>(initialState?.results ?? []);
  const [page, setPage] = useState(initialState?.page ?? 1);
  const [totalPages, setTotalPages] = useState(initialState?.totalPages ?? 1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectingAssetKey, setSelectingAssetKey] = useState<string | null>(null);

  const searchFreepik = useAction(api.freepik.search);
  const updateData = useMutation(api.nodes.updateData);
  const resizeNode = useMutation(api.nodes.resize);
  const shouldSkipInitialSearchRef = useRef(Boolean(initialState?.results?.length));
  const requestSequenceRef = useRef(0);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const isSelecting = selectingAssetKey !== null;

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedTerm(term);
    }, 500);
    return () => clearTimeout(timeout);
  }, [term]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!onStateChange) return;
    onStateChange({
      term,
      assetType,
      results,
      page,
      totalPages,
    });
  }, [assetType, onStateChange, page, results, term, totalPages]);

  const runSearch = useCallback(
    async (searchTerm: string, type: AssetType, requestedPage: number) => {
      const cleanedTerm = searchTerm.trim();
      const requestSequence = ++requestSequenceRef.current;
      if (!cleanedTerm) {
        setResults([]);
        setErrorMessage(null);
        setTotalPages(1);
        setPage(1);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await searchFreepik({
          term: cleanedTerm,
          assetType: type,
          page: requestedPage,
          limit: 20,
        });

        if (requestSequence !== requestSequenceRef.current) {
          return;
        }

        setResults(response.results);
        setTotalPages(response.totalPages);
        setPage(response.currentPage);

        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = 0;
        }
      } catch (error) {
        if (requestSequence !== requestSequenceRef.current) {
          return;
        }
        console.error("Freepik search error", error);
        setErrorMessage(
          error instanceof Error ? error.message : "Freepik search failed",
        );
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setIsLoading(false);
        }
      }
    },
    [searchFreepik],
  );

  useEffect(() => {
    if (shouldSkipInitialSearchRef.current) {
      shouldSkipInitialSearchRef.current = false;
      return;
    }
    setPage(1);
    void runSearch(debouncedTerm, assetType, 1);
  }, [assetType, debouncedTerm, runSearch]);

  const handleSelect = useCallback(
    async (asset: FreepikResult) => {
      if (isSelecting) return;
      const assetKey = `${asset.assetType}-${asset.id}`;
      setSelectingAssetKey(assetKey);
      try {
        await updateData({
          nodeId: nodeId as Id<"nodes">,
          data: {
            assetId: asset.id,
            assetType: asset.assetType,
            title: asset.title,
            previewUrl: asset.previewUrl,
            intrinsicWidth: asset.intrinsicWidth,
            intrinsicHeight: asset.intrinsicHeight,
            url: asset.previewUrl,
            sourceUrl: asset.sourceUrl,
            license: asset.license,
            authorName: asset.authorName,
            orientation: asset.orientation,
            canvasId,
          },
        });

        const targetSize = computeMediaNodeSize("asset", {
          intrinsicWidth: asset.intrinsicWidth,
          intrinsicHeight: asset.intrinsicHeight,
          orientation: asset.orientation,
        });

        await resizeNode({
          nodeId: nodeId as Id<"nodes">,
          width: targetSize.width,
          height: targetSize.height,
        });
        onClose();
      } catch (error) {
        console.error("Failed to select asset", error);
      } finally {
        setSelectingAssetKey(null);
      }
    },
    [canvasId, isSelecting, nodeId, onClose, resizeNode, updateData],
  );

  const handlePreviousPage = useCallback(() => {
    if (isLoading || page <= 1) return;
    void runSearch(debouncedTerm, assetType, page - 1);
  }, [assetType, debouncedTerm, isLoading, page, runSearch]);

  const handleNextPage = useCallback(() => {
    if (isLoading || page >= totalPages) return;
    void runSearch(debouncedTerm, assetType, page + 1);
  }, [assetType, debouncedTerm, isLoading, page, runSearch, totalPages]);

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
        aria-label="Browse Freepik assets"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Browse Freepik Assets</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close asset browser"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-b px-5 py-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search photos, vectors, icons..."
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <Tabs value={assetType} onValueChange={(value) => setAssetType(value as AssetType)}>
            <TabsList className="h-8">
              <TabsTrigger value="photo" className="text-xs">
                Photos
              </TabsTrigger>
              <TabsTrigger value="vector" className="text-xs">
                Vectors
              </TabsTrigger>
              <TabsTrigger value="icon" className="text-xs">
                Icons
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div
          ref={scrollAreaRef}
          className="nowheel nodrag nopan flex-1 overflow-y-auto p-5"
          onWheelCapture={(event) => event.stopPropagation()}
        >
          {isLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 16 }).map((_, index) => (
                <div key={index} className="aspect-square animate-pulse rounded-lg bg-muted" />
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
                onClick={() => void runSearch(debouncedTerm, assetType, page)}
              >
                Try again
              </Button>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <Search className="h-8 w-8" />
              <p className="text-sm">
                {term.trim() ? "No results found" : "Type to search Freepik assets"}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3">
                {results.map((asset) => {
                  const assetKey = `${asset.assetType}-${asset.id}`;
                  const isSelectingThisAsset = selectingAssetKey === assetKey;

                  return (
                    <button
                      key={assetKey}
                      onClick={() => void handleSelect(asset)}
                      className="group relative aspect-square overflow-hidden rounded-lg border-2 border-transparent bg-muted transition-all hover:border-primary focus:border-primary focus:outline-none"
                      title={asset.title}
                      type="button"
                      disabled={isSelecting}
                      aria-busy={isSelectingThisAsset}
                      aria-label={`Select asset: ${asset.title}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.previewUrl}
                        alt={asset.title}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-x-1 top-1 flex items-start justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px]">
                          {asset.assetType}
                        </Badge>
                        <Badge
                          variant={asset.license === "freemium" ? "outline" : "destructive"}
                          className="h-4 px-1.5 py-0 text-[10px]"
                        >
                          {asset.license}
                        </Badge>
                      </div>
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                      {isSelectingThisAsset ? (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-black/55 text-[11px] text-white">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Applying...
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>

            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t px-5 py-3">
          {results.length > 0 ? (
            <div className="flex items-center justify-center gap-2" aria-live="polite">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={isLoading || page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
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
                    Loading...
                  </>
                ) : (
                  "Next"
                )}
              </Button>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Assets by{" "}
              <a
                href="https://www.freepik.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-foreground"
              >
                Freepik
              </a>
              . Freemium assets require attribution.
            </p>
            <span className="text-[11px] text-muted-foreground">
              {results.length > 0 ? `${results.length} results on this page` : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
    ),
    [
      assetType,
      errorMessage,
      handleNextPage,
      handlePreviousPage,
      handleSelect,
      debouncedTerm,
      isLoading,
      isSelecting,
      onClose,
      page,
      results,
      runSearch,
      selectingAssetKey,
      term,
      totalPages,
    ],
  );

  if (!isMounted) {
    return null;
  }

  return createPortal(modal, document.body);
}
