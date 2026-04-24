import type { RenderSourceComposition } from "@/lib/image-pipeline/render-types";
import {
  isEditorJsDataEmpty,
  normalizeTextNodeRichText,
  stripInlineHtml,
  type EditorJsRichTextData,
} from "@/lib/canvas-rich-text";
import { computeVisibleMixerContentRect } from "@/lib/mixer-crop-layout";

export const SOURCE_BITMAP_CACHE_MAX_ENTRIES = 32;

type CacheEntry = {
  promise: Promise<ImageBitmap>;
  bitmap?: ImageBitmap;
  released?: boolean;
};

const imageBitmapCache = new Map<string, CacheEntry>();

type LoadSourceBitmapOptions = {
  signal?: AbortSignal;
};

type LoadRenderSourceBitmapOptions = {
  sourceUrl?: string;
  sourceComposition?: RenderSourceComposition;
  signal?: AbortSignal;
};

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function closeBitmap(bitmap: ImageBitmap | undefined): void {
  if (typeof bitmap?.close === "function") {
    bitmap.close();
  }
}

function deleteCacheEntry(sourceUrl: string): void {
  const entry = imageBitmapCache.get(sourceUrl);
  if (!entry) {
    return;
  }

  entry.released = true;
  imageBitmapCache.delete(sourceUrl);
  closeBitmap(entry.bitmap);
}

function touchCacheEntry(sourceUrl: string, entry: CacheEntry): void {
  imageBitmapCache.delete(sourceUrl);
  imageBitmapCache.set(sourceUrl, entry);
}

function evictIfNeeded(excludeSourceUrl?: string): void {
  while (imageBitmapCache.size > SOURCE_BITMAP_CACHE_MAX_ENTRIES) {
    const oldestSourceUrl = [...imageBitmapCache.entries()].find(
      ([key, entry]) => key !== excludeSourceUrl && entry.bitmap,
    )?.[0];

    if (!oldestSourceUrl) {
      return;
    }

    deleteCacheEntry(oldestSourceUrl);
  }
}

function isLikelyVideoUrl(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const pathname = url.pathname.toLowerCase();

    if (pathname.includes("/api/pexels-video")) {
      return true;
    }

    return /\.(mp4|webm|ogg|ogv|mov|m4v)$/.test(pathname);
  } catch {
    return /\.(mp4|webm|ogg|ogv|mov|m4v)(?:\?|$)/i.test(sourceUrl);
  }
}

async function decodeVideoFrameBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof document === "undefined") {
    return await createImageBitmap(blob);
  }

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  const objectUrl = URL.createObjectURL(blob);
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Render source video decode failed."));
      video.load();
    });

    return await createImageBitmap(video);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

async function decodeBitmapFromResponse(sourceUrl: string, response: Response): Promise<ImageBitmap> {
  const contentType = response.headers?.get("content-type")?.toLowerCase() ?? "";
  const blob = await response.blob();
  const isVideo = contentType.startsWith("video/") || blob.type.startsWith("video/") || isLikelyVideoUrl(sourceUrl);

  if (isVideo) {
    return await decodeVideoFrameBitmap(blob);
  }

  return await createImageBitmap(blob);
}

export function clearSourceBitmapCache(): void {
  for (const sourceUrl of [...imageBitmapCache.keys()]) {
    deleteCacheEntry(sourceUrl);
  }
}

function getOrCreateSourceBitmapPromise(sourceUrl: string): Promise<ImageBitmap> {
  const cached = imageBitmapCache.get(sourceUrl);
  if (cached) {
    touchCacheEntry(sourceUrl, cached);
    return cached.promise;
  }

  const entry: CacheEntry = {
    promise: Promise.resolve(undefined as never),
  };

  const promise = (async () => {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Render source failed: ${response.status}`);
    }

    const bitmap = await decodeBitmapFromResponse(sourceUrl, response);

    if (entry.released || imageBitmapCache.get(sourceUrl) !== entry) {
      closeBitmap(bitmap);
      return bitmap;
    }

    entry.bitmap = bitmap;
    evictIfNeeded(sourceUrl);
    return bitmap;
  })();

  entry.promise = promise;
  imageBitmapCache.set(sourceUrl, entry);

  void promise.catch(() => {
    if (imageBitmapCache.get(sourceUrl) === entry) {
      imageBitmapCache.delete(sourceUrl);
    }
  });

  return promise;
}

async function awaitWithLocalAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  throwIfAborted(signal);

  if (!signal) {
    return await promise;
  }

  return await new Promise<T>((resolve, reject) => {
    const abortError = () => new DOMException("The operation was aborted.", "AbortError");

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        cleanup();
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export async function loadSourceBitmap(
  sourceUrl: string,
  options: LoadSourceBitmapOptions = {},
): Promise<ImageBitmap> {
  if (!sourceUrl || sourceUrl.trim().length === 0) {
    throw new Error("Render sourceUrl is required.");
  }

  if (typeof createImageBitmap !== "function") {
    throw new Error("ImageBitmap is not available in this environment.");
  }

  throwIfAborted(options.signal);

  const promise = getOrCreateSourceBitmapPromise(sourceUrl);
  return await awaitWithLocalAbort(promise, options.signal);
}

function createWorkingCanvas(width: number, height: number):
  | HTMLCanvasElement
  | OffscreenCanvas {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  throw new Error("Canvas rendering is not available in this environment.");
}

type WorkingCanvas = HTMLCanvasElement | OffscreenCanvas;
type WorkingCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function getWorkingCanvasContext(canvas: WorkingCanvas): WorkingCanvasContext {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Render composition could not create a 2D context.");
  }

  return context;
}

function readRichTextHtml(data: unknown): string {
  if (typeof data === "object" && data !== null && "text" in data) {
    const text = (data as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }

  return "";
}

function collectListItemLines(item: unknown, lines: string[]): void {
  if (typeof item === "string") {
    lines.push(stripInlineHtml(item));
    return;
  }

  if (typeof item !== "object" || item === null) {
    return;
  }

  const record = item as { content?: unknown; items?: unknown };
  if (typeof record.content === "string") {
    lines.push(stripInlineHtml(record.content));
  }

  if (Array.isArray(record.items)) {
    for (const nestedItem of record.items) {
      collectListItemLines(nestedItem, lines);
    }
  }
}

function wrapCanvasText(
  context: WorkingCanvasContext,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
      continue;
    }

    current = candidate;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawTextLines(args: {
  context: WorkingCanvasContext;
  lines: readonly string[];
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
}): number {
  let y = args.y;
  for (const line of args.lines) {
    const wrapped = wrapCanvasText(args.context, line, args.maxWidth);
    for (const wrappedLine of wrapped) {
      args.context.fillText(wrappedLine, args.x, y);
      y += args.lineHeight;
    }
  }

  return y;
}

async function createTextLayerBitmap(source: {
  content: string;
  richText: EditorJsRichTextData;
  width: number;
  height: number;
}): Promise<ImageBitmap> {
  const width = Math.max(1, Math.round(source.width));
  const height = Math.max(1, Math.round(source.height));
  const canvas = createWorkingCanvas(width, height);
  const context = getWorkingCanvasContext(canvas);
  const richText = normalizeTextNodeRichText({
    content: source.content,
    richText: source.richText,
  });

  context.clearRect(0, 0, width, height);

  if (isEditorJsDataEmpty(richText)) {
    return await createImageBitmap(canvas);
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111827";
  context.textBaseline = "top";

  const padding = 12;
  const maxWidth = Math.max(1, width - padding * 2);
  let y = padding;

  for (const block of richText.blocks) {
    if (y >= height - padding) {
      break;
    }

    if (block.type === "header") {
      context.font = "600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      y = drawTextLines({
        context,
        lines: [stripInlineHtml(readRichTextHtml(block.data))],
        x: padding,
        y,
        maxWidth,
        lineHeight: 20,
      }) + 4;
      continue;
    }

    if (block.type === "list") {
      const data = block.data as { style?: unknown; items?: unknown };
      const lines: string[] = [];
      if (Array.isArray(data.items)) {
        for (const [index, item] of data.items.entries()) {
          const beforeLength = lines.length;
          collectListItemLines(item, lines);
          const marker = data.style === "ordered" ? `${index + 1}. ` : "- ";
          if (lines.length > beforeLength) {
            lines[beforeLength] = `${marker}${lines[beforeLength]}`;
          }
        }
      }

      context.font = "400 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      y = drawTextLines({
        context,
        lines,
        x: padding,
        y,
        maxWidth,
        lineHeight: 20,
      }) + 4;
      continue;
    }

    context.font = "400 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    y = drawTextLines({
      context,
      lines: [stripInlineHtml(readRichTextHtml(block.data))],
      x: padding,
      y,
      maxWidth,
      lineHeight: 20,
    }) + 4;
  }

  return await createImageBitmap(canvas);
}

function mixerBlendModeToCompositeOperation(
  blendMode: RenderSourceComposition["blendMode"],
): GlobalCompositeOperation {
  if (blendMode === "normal") {
    return "source-over";
  }

  return blendMode;
}

function normalizeCompositionOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0, Math.min(100, value)) / 100;
}

function normalizeRatio(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function normalizeMixerRect(source: RenderSourceComposition): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const overlayX = Math.max(0, Math.min(0.9, normalizeRatio(source.overlayX, 0)));
  const overlayY = Math.max(0, Math.min(0.9, normalizeRatio(source.overlayY, 0)));
  const overlayWidth = Math.max(
    0.1,
    Math.min(1, normalizeRatio(source.overlayWidth, 1), 1 - overlayX),
  );
  const overlayHeight = Math.max(
    0.1,
    Math.min(1, normalizeRatio(source.overlayHeight, 1), 1 - overlayY),
  );

  return {
    x: overlayX,
    y: overlayY,
    width: overlayWidth,
    height: overlayHeight,
  };
}

function normalizeMixerCropEdges(source: RenderSourceComposition): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const legacySource = source as RenderSourceComposition & {
    contentX?: number;
    contentY?: number;
    contentWidth?: number;
    contentHeight?: number;
  };
  const hasLegacyContentRect =
    legacySource.contentX !== undefined ||
    legacySource.contentY !== undefined ||
    legacySource.contentWidth !== undefined ||
    legacySource.contentHeight !== undefined;

  if (hasLegacyContentRect) {
    const contentX = Math.max(
      0,
      Math.min(0.9, normalizeRatio(legacySource.contentX ?? Number.NaN, 0)),
    );
    const contentY = Math.max(
      0,
      Math.min(0.9, normalizeRatio(legacySource.contentY ?? Number.NaN, 0)),
    );
    const contentWidth = Math.max(
      0.1,
      Math.min(1, normalizeRatio(legacySource.contentWidth ?? Number.NaN, 1), 1 - contentX),
    );
    const contentHeight = Math.max(
      0.1,
      Math.min(1, normalizeRatio(legacySource.contentHeight ?? Number.NaN, 1), 1 - contentY),
    );

    return {
      left: contentX,
      top: contentY,
      right: 1 - (contentX + contentWidth),
      bottom: 1 - (contentY + contentHeight),
    };
  }

  const cropLeft = Math.max(0, Math.min(0.9, normalizeRatio(source.cropLeft, 0)));
  const cropTop = Math.max(0, Math.min(0.9, normalizeRatio(source.cropTop, 0)));
  const cropRight = Math.max(0, Math.min(1 - cropLeft - 0.1, normalizeRatio(source.cropRight, 0)));
  const cropBottom = Math.max(
    0,
    Math.min(1 - cropTop - 0.1, normalizeRatio(source.cropBottom, 0)),
  );

  return {
    left: cropLeft,
    top: cropTop,
    right: cropRight,
    bottom: cropBottom,
  };
}

async function loadMixerLayerBitmap(
  source: RenderSourceComposition["baseSource"] | RenderSourceComposition["overlaySource"],
  legacyUrl: string | undefined,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  if (source?.kind === "text") {
    throwIfAborted(signal);
    return await createTextLayerBitmap(source);
  }

  const sourceUrl = source?.kind === "image" ? source.url : legacyUrl;
  if (!sourceUrl) {
    throw new Error("Mixer composition source is required.");
  }

  return await loadSourceBitmap(sourceUrl, { signal });
}

async function loadMixerCompositionBitmap(
  sourceComposition: RenderSourceComposition,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  const [baseBitmap, overlayBitmap] = await Promise.all([
    loadMixerLayerBitmap(sourceComposition.baseSource, sourceComposition.baseUrl, signal),
    loadMixerLayerBitmap(sourceComposition.overlaySource, sourceComposition.overlayUrl, signal),
  ]);

  throwIfAborted(signal);

  const canvas = createWorkingCanvas(baseBitmap.width, baseBitmap.height);
  const context = getWorkingCanvasContext(canvas);

  context.clearRect(0, 0, baseBitmap.width, baseBitmap.height);
  context.drawImage(baseBitmap, 0, 0, baseBitmap.width, baseBitmap.height);

  const rect = normalizeMixerRect(sourceComposition);
  const frameX = rect.x * baseBitmap.width;
  const frameY = rect.y * baseBitmap.height;
  const frameWidth = rect.width * baseBitmap.width;
  const frameHeight = rect.height * baseBitmap.height;
  const cropEdges = normalizeMixerCropEdges(sourceComposition);
  const sourceX = cropEdges.left * overlayBitmap.width;
  const sourceY = cropEdges.top * overlayBitmap.height;
  const sourceWidth = (1 - cropEdges.left - cropEdges.right) * overlayBitmap.width;
  const sourceHeight = (1 - cropEdges.top - cropEdges.bottom) * overlayBitmap.height;
  const visibleRect = computeVisibleMixerContentRect({
    frameAspectRatio: frameHeight > 0 ? frameWidth / frameHeight : 1,
    sourceWidth: overlayBitmap.width,
    sourceHeight: overlayBitmap.height,
    cropLeft: cropEdges.left,
    cropTop: cropEdges.top,
    cropRight: cropEdges.right,
    cropBottom: cropEdges.bottom,
    fit: "width",
  });
  const destX = frameX + (visibleRect?.x ?? 0) * frameWidth;
  const destY = frameY + (visibleRect?.y ?? 0) * frameHeight;
  const destWidth = (visibleRect?.width ?? 1) * frameWidth;
  const destHeight = (visibleRect?.height ?? 1) * frameHeight;

  context.globalCompositeOperation = mixerBlendModeToCompositeOperation(
    sourceComposition.blendMode,
  );
  context.globalAlpha = normalizeCompositionOpacity(sourceComposition.opacity);
  context.save();
  context.beginPath();
  context.rect(frameX, frameY, frameWidth, frameHeight);
  context.clip();
  context.drawImage(
    overlayBitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destX,
    destY,
    destWidth,
    destHeight,
  );
  context.restore();
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;

  return await createImageBitmap(canvas);
}

export async function loadRenderSourceBitmap(
  options: LoadRenderSourceBitmapOptions,
): Promise<ImageBitmap> {
  if (options.sourceComposition) {
    if (options.sourceComposition.kind !== "mixer") {
      throw new Error(`Unsupported source composition '${options.sourceComposition.kind}'.`);
    }

    return await loadMixerCompositionBitmap(options.sourceComposition, options.signal);
  }

  if (!options.sourceUrl) {
    throw new Error("Render source is required.");
  }

  return await loadSourceBitmap(options.sourceUrl, { signal: options.signal });
}
