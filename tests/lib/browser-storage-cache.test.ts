/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import {
  createVersionedStorageCache,
  getLocalStorage,
  isJsonRecord,
  safeJsonParse,
  safeStorageGet,
  safeStorageSet,
} from "@/lib/browser-storage-cache";

describe("browser storage cache helpers", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          data.set(key, value);
        },
        removeItem: (key: string) => {
          data.delete(key);
        },
      },
      configurable: true,
    });
  });

  it("safely reads storage and malformed JSON", () => {
    expect(getLocalStorage()).toBe(window.localStorage);
    expect(safeJsonParse("{nope")).toBeNull();
    expect(isJsonRecord({ ok: true })).toBe(true);
    expect(isJsonRecord(null)).toBe(false);
  });

  it("ignores storage write and read failures", () => {
    const failingStorage = {
      getItem: () => {
        throw new Error("read failed");
      },
      setItem: () => {
        throw new Error("write failed");
      },
      removeItem: () => {
        throw new Error("remove failed");
      },
    } as unknown as Storage;

    expect(safeStorageGet(failingStorage, "key")).toBeNull();
    expect(() => safeStorageSet(failingStorage, "key", "value")).not.toThrow();
  });

  it("invalidates versioned entries by version and ttl", () => {
    const cache = createVersionedStorageCache<{ value: string }, "payload">({
      version: 2,
      ttlMs: 100,
      valueKey: "payload",
      getStorage: getLocalStorage,
      getKey: (userId) => `cache:${userId}`,
    });

    cache.write("user-1", { value: "fresh" }, { now: 1_000 });
    expect(cache.read("user-1", { now: 1_050 })?.payload).toEqual({
      value: "fresh",
    });
    expect(cache.read("user-1", { now: 1_101 })).toBeNull();

    window.localStorage.setItem(
      "cache:user-2",
      JSON.stringify({ version: 1, cachedAt: 1_000, payload: { value: "old" } }),
    );
    expect(cache.read("user-2", { now: 1_050 })).toBeNull();
  });
});
