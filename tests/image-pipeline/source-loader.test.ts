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

  it("extracts the first decodable frame for video sources", async () => {
    const response = {
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue("video/mp4"),
      },
      blob: vi.fn().mockResolvedValue(blob),
    };

    const fakeVideo: Partial<HTMLVideoElement> & {
      onloadeddata: ((event: Event) => void) | null;
      onerror: ((event: Event) => void) | null;
      load: () => void;
    } = {
      muted: false,
      playsInline: false,
      preload: "none",
      onloadeddata: null,
      onerror: null,
      load() {
        this.onloadeddata?.(new Event("loadeddata"));
      },
      pause: vi.fn(),
      removeAttribute: vi.fn(),
    };

    const createObjectUrl = vi.fn().mockReturnValue("blob:video-source");
    const revokeObjectUrl = vi.fn();
    const nativeCreateElement = document.createElement.bind(document);

    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: createObjectUrl,
        revokeObjectURL: revokeObjectUrl,
      }),
    );
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "video") {
        return fakeVideo as HTMLVideoElement;
      }

      return nativeCreateElement(tagName);
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const { loadSourceBitmap } = await importSubject();
    await expect(loadSourceBitmap("https://cdn.example.com/video.mp4")).resolves.toBe(bitmap);

    expect(response.headers.get).toHaveBeenCalledWith("content-type");
    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(createImageBitmap).toHaveBeenCalledWith(fakeVideo);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:video-source");
  });

  it("renders non-square mixer overlays with width-priority AR preservation", async () => {
    const baseBlob = new Blob(["base"]);
    const overlayBlob = new Blob(["overlay"]);
    const baseBitmap = { width: 100, height: 100 } as ImageBitmap;
    const overlayBitmap = { width: 200, height: 100 } as ImageBitmap;
    const composedBitmap = { width: 100, height: 100 } as ImageBitmap;

    const drawImage = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      globalCompositeOperation: "source-over" as GlobalCompositeOperation,
      globalAlpha: 1,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
    } as unknown as HTMLCanvasElement;

    const nativeCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") {
        return canvas;
      }

      return nativeCreateElement(tagName);
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("base.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue("image/png") },
            blob: vi.fn().mockResolvedValue(baseBlob),
          };
        }

        return {
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue("image/png") },
          blob: vi.fn().mockResolvedValue(overlayBlob),
        };
      }),
    );

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(async (input: unknown) => {
        if (input === baseBlob) {
          return baseBitmap;
        }
        if (input === overlayBlob) {
          return overlayBitmap;
        }
        if (input === canvas) {
          return composedBitmap;
        }

        throw new Error("Unexpected createImageBitmap input in mixer contain-fit test.");
      }),
    );

    const { loadRenderSourceBitmap } = await importSubject();

    await expect(
      loadRenderSourceBitmap({
        sourceComposition: {
          kind: "mixer",
          baseUrl: "https://cdn.example.com/base.png",
          overlayUrl: "https://cdn.example.com/overlay.png",
          blendMode: "overlay",
          opacity: 80,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.25,
          overlayHeight: 0.5,
          cropLeft: 0,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
        },
      }),
    ).resolves.toBe(composedBitmap);

    expect(drawImage).toHaveBeenNthCalledWith(1, baseBitmap, 0, 0, 100, 100);
    const overlayDrawArgs = drawImage.mock.calls[1];
    expect(overlayDrawArgs?.[0]).toBe(overlayBitmap);
    expect(overlayDrawArgs?.[1]).toBe(0);
    expect(overlayDrawArgs?.[2]).toBe(0);
    expect(overlayDrawArgs?.[3]).toBe(200);
    expect(overlayDrawArgs?.[4]).toBe(100);
    expect(overlayDrawArgs?.[5]).toBe(10);
    expect(overlayDrawArgs?.[6]).toBeCloseTo(38.75, 10);
    expect(overlayDrawArgs?.[7]).toBe(25);
    expect(overlayDrawArgs?.[8]).toBeCloseTo(12.5, 10);
  });

  it("applies mixer crop framing by trimming source edges while leaving the displayed frame size untouched", async () => {
    const baseBlob = new Blob(["base"]);
    const overlayBlob = new Blob(["overlay"]);
    const baseBitmap = { width: 100, height: 100 } as ImageBitmap;
    const overlayBitmap = { width: 200, height: 100 } as ImageBitmap;
    const composedBitmap = { width: 100, height: 100 } as ImageBitmap;

    const drawImage = vi.fn();
    const save = vi.fn();
    const restore = vi.fn();
    const beginPath = vi.fn();
    const rect = vi.fn();
    const clip = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage,
      save,
      restore,
      beginPath,
      rect,
      clip,
      globalCompositeOperation: "source-over" as GlobalCompositeOperation,
      globalAlpha: 1,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
    } as unknown as HTMLCanvasElement;

    const nativeCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") {
        return canvas;
      }

      return nativeCreateElement(tagName);
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("base.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue("image/png") },
            blob: vi.fn().mockResolvedValue(baseBlob),
          };
        }

        return {
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue("image/png") },
          blob: vi.fn().mockResolvedValue(overlayBlob),
        };
      }),
    );

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(async (input: unknown) => {
        if (input === baseBlob) {
          return baseBitmap;
        }
        if (input === overlayBlob) {
          return overlayBitmap;
        }
        if (input === canvas) {
          return composedBitmap;
        }

        throw new Error("Unexpected createImageBitmap input in mixer content framing test.");
      }),
    );

    const { loadRenderSourceBitmap } = await importSubject();

    await expect(
      loadRenderSourceBitmap({
        sourceComposition: {
          kind: "mixer",
          baseUrl: "https://cdn.example.com/base.png",
          overlayUrl: "https://cdn.example.com/overlay.png",
          blendMode: "overlay",
          opacity: 80,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.4,
          overlayHeight: 0.4,
          cropLeft: 0.5,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
        },
      }),
    ).resolves.toBe(composedBitmap);

    expect(drawImage).toHaveBeenNthCalledWith(1, baseBitmap, 0, 0, 100, 100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(beginPath).toHaveBeenCalledTimes(1);
    expect(rect).toHaveBeenCalledWith(10, 20, 40, 40);
    expect(clip).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenNthCalledWith(
      2,
      overlayBitmap,
      100,
      0,
      100,
      100,
      10,
      20,
      40,
      40,
    );
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("keeps overlayWidth and overlayHeight fixed while crop framing trims the sampled source region", async () => {
    const baseBlob = new Blob(["base"]);
    const overlayBlob = new Blob(["overlay"]);
    const baseBitmap = { width: 100, height: 100 } as ImageBitmap;
    const overlayBitmap = { width: 200, height: 100 } as ImageBitmap;
    const composedBitmap = { width: 100, height: 100 } as ImageBitmap;

    const drawImage = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      globalCompositeOperation: "source-over" as GlobalCompositeOperation,
      globalAlpha: 1,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
    } as unknown as HTMLCanvasElement;

    const nativeCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") {
        return canvas;
      }

      return nativeCreateElement(tagName);
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("base.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue("image/png") },
            blob: vi.fn().mockResolvedValue(baseBlob),
          };
        }

        return {
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue("image/png") },
          blob: vi.fn().mockResolvedValue(overlayBlob),
        };
      }),
    );

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(async (input: unknown) => {
        if (input === baseBlob) {
          return baseBitmap;
        }
        if (input === overlayBlob) {
          return overlayBitmap;
        }
        if (input === canvas) {
          return composedBitmap;
        }

        throw new Error("Unexpected createImageBitmap input in overlay size preservation test.");
      }),
    );

    const { loadRenderSourceBitmap } = await importSubject();

    await expect(
      loadRenderSourceBitmap({
        sourceComposition: {
          kind: "mixer",
          baseUrl: "https://cdn.example.com/base.png",
          overlayUrl: "https://cdn.example.com/overlay.png",
          blendMode: "overlay",
          opacity: 80,
          overlayX: 0.15,
          overlayY: 0.25,
          overlayWidth: 0.5,
          overlayHeight: 0.3,
          cropLeft: 0.25,
          cropTop: 0.1,
          cropRight: 0.25,
          cropBottom: 0.3,
        },
      }),
    ).resolves.toBe(composedBitmap);

    const overlayDrawArgs = drawImage.mock.calls[1];
    expect(overlayDrawArgs?.[0]).toBe(overlayBitmap);
    expect(overlayDrawArgs?.[1]).toBe(50);
    expect(overlayDrawArgs?.[2]).toBe(10);
    expect(overlayDrawArgs?.[3]).toBe(100);
    expect(overlayDrawArgs?.[4]).toBeCloseTo(60, 10);
    expect(overlayDrawArgs?.[5]).toBeCloseTo(15, 10);
    expect(overlayDrawArgs?.[6]).toBeCloseTo(25, 10);
    expect(overlayDrawArgs?.[7]).toBeCloseTo(50, 10);
    expect(overlayDrawArgs?.[8]).toBeCloseTo(30, 10);
  });

  it("uses width-priority placement for cropped wide sources during bake", async () => {
    const baseBlob = new Blob(["base"]);
    const overlayBlob = new Blob(["overlay"]);
    const baseBitmap = { width: 100, height: 100 } as ImageBitmap;
    const overlayBitmap = { width: 200, height: 100 } as ImageBitmap;
    const composedBitmap = { width: 100, height: 100 } as ImageBitmap;

    const drawImage = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      globalCompositeOperation: "source-over" as GlobalCompositeOperation,
      globalAlpha: 1,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
    } as unknown as HTMLCanvasElement;

    const nativeCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") {
        return canvas;
      }

      return nativeCreateElement(tagName);
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("base.png")) {
          return {
            ok: true,
            status: 200,
            headers: { get: vi.fn().mockReturnValue("image/png") },
            blob: vi.fn().mockResolvedValue(baseBlob),
          };
        }

        return {
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue("image/png") },
          blob: vi.fn().mockResolvedValue(overlayBlob),
        };
      }),
    );

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(async (input: unknown) => {
        if (input === baseBlob) {
          return baseBitmap;
        }
        if (input === overlayBlob) {
          return overlayBitmap;
        }
        if (input === canvas) {
          return composedBitmap;
        }

        throw new Error("Unexpected createImageBitmap input in aspect-aware crop bake test.");
      }),
    );

    const { loadRenderSourceBitmap } = await importSubject();

    await expect(
      loadRenderSourceBitmap({
        sourceComposition: {
          kind: "mixer",
          baseUrl: "https://cdn.example.com/base.png",
          overlayUrl: "https://cdn.example.com/overlay.png",
          blendMode: "overlay",
          opacity: 80,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.4,
          overlayHeight: 0.4,
          cropLeft: 0,
          cropTop: 0.25,
          cropRight: 0,
          cropBottom: 0.25,
        },
      }),
    ).resolves.toBe(composedBitmap);

    const overlayDrawArgs = drawImage.mock.calls[1];
    expect(overlayDrawArgs?.[0]).toBe(overlayBitmap);
    expect(overlayDrawArgs?.[1]).toBe(0);
    expect(overlayDrawArgs?.[2]).toBe(25);
    expect(overlayDrawArgs?.[3]).toBe(200);
    expect(overlayDrawArgs?.[4]).toBe(50);
    expect(overlayDrawArgs?.[5]).toBe(10);
    expect(overlayDrawArgs?.[6]).toBeCloseTo(35, 10);
    expect(overlayDrawArgs?.[7]).toBe(40);
    expect(overlayDrawArgs?.[8]).toBeCloseTo(10, 10);
  });
});
