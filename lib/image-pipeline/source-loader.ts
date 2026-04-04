const imageBitmapCache = new Map<string, Promise<ImageBitmap>>();

type LoadSourceBitmapOptions = {
  signal?: AbortSignal;
};

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function getOrCreateSourceBitmapPromise(sourceUrl: string): Promise<ImageBitmap> {
  const cached = imageBitmapCache.get(sourceUrl);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Render source failed: ${response.status}`);
    }

    const blob = await response.blob();
    return await createImageBitmap(blob);
  })();

  imageBitmapCache.set(sourceUrl, promise);

  void promise.catch(() => {
    if (imageBitmapCache.get(sourceUrl) === promise) {
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

  const promise = getOrCreateSourceBitmapPromise(sourceUrl);
  return await awaitWithLocalAbort(promise, options.signal);
}
