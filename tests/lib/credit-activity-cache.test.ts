/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearCreditActivityCache,
  readCreditActivityCache,
  writeCreditActivityCache,
} from "@/lib/credit-activity-cache";

const USER_ID = "user-activity-cache-test";

describe("credit activity cache", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    clearCreditActivityCache(USER_ID);
  });

  it("reads back a written activity payload", () => {
    const activity = {
      items: [{ _id: "tx_1", amount: -15 }],
      totalCount: 1,
    };

    writeCreditActivityCache(USER_ID, activity);
    const cached = readCreditActivityCache<typeof activity>(USER_ID);

    expect(cached?.activity).toEqual(activity);
    expect(typeof cached?.cachedAt).toBe("number");
  });

  it("invalidates stale activity entries via ttl", () => {
    const activity = {
      items: [{ _id: "tx_1", amount: -15 }],
      totalCount: 1,
    };

    writeCreditActivityCache(USER_ID, activity);

    const stale = readCreditActivityCache<typeof activity>(USER_ID, {
      now: Date.now() + 61_000,
      ttlMs: 60_000,
    });

    expect(stale).toBeNull();
  });

  it("clears user activity cache explicitly", () => {
    writeCreditActivityCache(USER_ID, { items: [] });
    clearCreditActivityCache(USER_ID);

    expect(readCreditActivityCache(USER_ID)).toBeNull();
  });
});
