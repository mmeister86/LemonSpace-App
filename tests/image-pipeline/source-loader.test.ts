// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

async function importSubject() {
  vi.resetModules();
  return await import("@/lib/image-pipeline/source-loader");
}

describe("loadSourceBitmap", () => {
  const bitmap = { width: 64, height: 64 } as ImageBitmap;
  const blob = new Blob(["source"]);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reuses one fetch/decode pipeline for concurrent abortable callers", async () => {
    const response = {
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(blob),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const { loadSourceBitmap } = await importSubject();

    const first = loadSourceBitmap("https://cdn.example.com/source.png", {
      signal: new AbortController().signal,
    });
    const second = loadSourceBitmap("https://cdn.example.com/source.png", {
      signal: new AbortController().signal,
    });

    await expect(first).resolves.toBe(bitmap);
    await expect(second).resolves.toBe(bitmap);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.blob).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it("does not start fetch/decode work or cache when the signal is already aborted", async () => {
    const response = {
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(blob),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const { loadSourceBitmap } = await importSubject();
    const controller = new AbortController();
    controller.abort();

    await expect(
      loadSourceBitmap("https://cdn.example.com/source.png", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(fetch).not.toHaveBeenCalled();
    expect(response.blob).not.toHaveBeenCalled();
    expect(createImageBitmap).not.toHaveBeenCalled();

    await expect(loadSourceBitmap("https://cdn.example.com/source.png")).resolves.toBe(bitmap);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.blob).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it("lets a later consumer succeed after an earlier caller aborts", async () => {
    const responseDeferred = createDeferred<{
      ok: boolean;
      status: number;
      blob: () => Promise<Blob>;
    }>();
    const blobDeferred = createDeferred<Blob>();

    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => responseDeferred.promise));

    const { loadSourceBitmap } = await importSubject();
    const controller = new AbortController();

    const abortedPromise = loadSourceBitmap("https://cdn.example.com/source.png", {
      signal: controller.signal,
    });

    controller.abort();

    const laterPromise = loadSourceBitmap("https://cdn.example.com/source.png");

    responseDeferred.resolve({
      ok: true,
      status: 200,
      blob: vi.fn().mockImplementation(() => blobDeferred.promise),
    });
    blobDeferred.resolve(blob);

    await expect(abortedPromise).rejects.toMatchObject({ name: "AbortError" });
    await expect(laterPromise).resolves.toBe(bitmap);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it("clears a failed fetch from cache so the next attempt retries", async () => {
    const failingResponse = {
      ok: false,
      status: 503,
      blob: vi.fn(),
    };
    const succeedingResponse = {
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(blob),
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(failingResponse)
        .mockResolvedValueOnce(succeedingResponse),
    );

    const { loadSourceBitmap } = await importSubject();

    await expect(
      loadSourceBitmap("https://cdn.example.com/source.png", {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Render source failed: 503");

    await expect(
      loadSourceBitmap("https://cdn.example.com/source.png", {
        signal: new AbortController().signal,
      }),
    ).resolves.toBe(bitmap);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(succeedingResponse.blob).toHaveBeenCalledTimes(1);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it("evicts the least-recently-used bitmap once the cache limit is exceeded", async () => {
    const subject = (await importSubject()) as typeof import("@/lib/image-pipeline/source-loader") & {
      SOURCE_BITMAP_CACHE_MAX_ENTRIES?: number;
    };
    const { SOURCE_BITMAP_CACHE_MAX_ENTRIES, loadSourceBitmap } = subject;

    expect(SOURCE_BITMAP_CACHE_MAX_ENTRIES).toBeTypeOf("number");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => ({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(new Blob([String(input)])),
      })),
    );

    const urls = Array.from(
      { length: SOURCE_BITMAP_CACHE_MAX_ENTRIES! + 1 },
      (_, index) => `https://cdn.example.com/source-${index}.png`,
    );

    for (const url of urls) {
      await expect(loadSourceBitmap(url)).resolves.toBe(bitmap);
    }

    expect(fetch).toHaveBeenCalledTimes(urls.length);

    await expect(loadSourceBitmap(urls[urls.length - 1])).resolves.toBe(bitmap);
    expect(fetch).toHaveBeenCalledTimes(urls.length);

    await expect(loadSourceBitmap(urls[0])).resolves.toBe(bitmap);
    expect(fetch).toHaveBeenCalledTimes(urls.length + 1);
  });

  it("closes evicted bitmaps and disposes the remaining cache explicitly", async () => {
    const subject = (await importSubject()) as typeof import("@/lib/image-pipeline/source-loader") & {
      SOURCE_BITMAP_CACHE_MAX_ENTRIES?: number;
      clearSourceBitmapCache?: () => void;
    };
    const { SOURCE_BITMAP_CACHE_MAX_ENTRIES, clearSourceBitmapCache, loadSourceBitmap } = subject;

    expect(SOURCE_BITMAP_CACHE_MAX_ENTRIES).toBeGreaterThanOrEqual(2);
    expect(clearSourceBitmapCache).toBeTypeOf("function");

    const bitmaps = Array.from(
      { length: SOURCE_BITMAP_CACHE_MAX_ENTRIES! + 1 },
      () => ({ close: vi.fn() }) as unknown as ImageBitmap,
    );
    let bitmapIndex = 0;

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(async () => bitmaps[bitmapIndex++]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => ({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(new Blob([String(input)])),
      })),
    );

    const urls = Array.from(
      { length: SOURCE_BITMAP_CACHE_MAX_ENTRIES! + 1 },
      (_, index) => `https://cdn.example.com/source-${index}.png`,
    );

    for (const [index, url] of urls.entries()) {
      await expect(loadSourceBitmap(url)).resolves.toBe(bitmaps[index]);
    }

    expect(bitmaps[0].close).toHaveBeenCalledTimes(1);
    for (const bitmap of bitmaps.slice(1)) {
      expect(bitmap.close).not.toHaveBeenCalled();
    }

    clearSourceBitmapCache!();

    expect(bitmaps[0].close).toHaveBeenCalledTimes(1);
    for (const bitmap of bitmaps.slice(1)) {
      expect(bitmap.close).toHaveBeenCalledTimes(1);
    }
  });

  it("closes a decoded bitmap that resolves after its cache entry was cleared in flight", async () => {
    const subject = (await importSubject()) as typeof import("@/lib/image-pipeline/source-loader") & {
      clearSourceBitmapCache?: () => void;
    };
    const { clearSourceBitmapCache, loadSourceBitmap } = subject;

    expect(clearSourceBitmapCache).toBeTypeOf("function");

    const firstBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const secondBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const decodeDeferred = createDeferred<ImageBitmap>();

    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockImplementationOnce(async () => await decodeDeferred.promise)
        .mockResolvedValueOnce(secondBitmap),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => ({
        ok: true,
        status: 200,
        blob: vi.fn().mockResolvedValue(new Blob([String(input)])),
      })),
    );

    const sourceUrl = "https://cdn.example.com/source-in-flight.png";
    const pendingLoad = loadSourceBitmap(sourceUrl);

    await vi.waitFor(() => {
      expect(createImageBitmap).toHaveBeenCalledTimes(1);
    });

    clearSourceBitmapCache!();
    decodeDeferred.resolve(firstBitmap);

    await expect(pendingLoad).resolves.toBe(firstBitmap);
    expect(firstBitmap.close).toHaveBeenCalledTimes(1);

    await expect(loadSourceBitmap(sourceUrl)).resolves.toBe(secondBitmap);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
