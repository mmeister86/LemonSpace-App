export const SOURCE_BITMAP_CACHE_MAX_ENTRIES = 32;

type CacheEntry = {
  promise: Promise<ImageBitmap>;
  bitmap?: ImageBitmap;
};

const imageBitmapCache = new Map<string, CacheEntry>();

type LoadSourceBitmapOptions = {
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

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
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
