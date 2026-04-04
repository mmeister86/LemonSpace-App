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
});
