import { describe, expect, it } from "vitest";
import { FreepikApiError } from "@/convex/freepik";
import {
  categorizeError,
  formatTerminalStatusMessage,
  getVideoPollDelayMs,
  isVideoPollTimedOut,
} from "@/convex/ai_errors";

describe("ai error helpers", () => {
  it("marks provider 503 failures as retryable", () => {
    const result = categorizeError(new Error("OpenRouter API error 503"));
    expect(result).toEqual({ category: "provider", retryable: true });
  });

  it("maps Freepik timeout to timeout category", () => {
    const error = new FreepikApiError({
      code: "timeout",
      message: "Task polling timeout",
      retryable: true,
      status: 504,
    });

    const result = categorizeError(error);
    expect(result).toEqual({ category: "timeout", retryable: true });
  });

  it("formats terminal status with translated transient prefix", () => {
    expect(formatTerminalStatusMessage(new Error("network disconnected"))).toBe(
      "Netzwerk: network disconnected",
    );
  });

  it("uses staged poll delays", () => {
    expect(getVideoPollDelayMs(1)).toBe(5000);
    expect(getVideoPollDelayMs(9)).toBe(10000);
    expect(getVideoPollDelayMs(20)).toBe(20000);
  });

  it("detects poll timeout by attempts and elapsed time", () => {
    expect(
      isVideoPollTimedOut({
        attempt: 31,
        maxAttempts: 30,
        elapsedMs: 1000,
        maxTotalMs: 600000,
      }),
    ).toBe(true);

    expect(
      isVideoPollTimedOut({
        attempt: 10,
        maxAttempts: 30,
        elapsedMs: 700000,
        maxTotalMs: 600000,
      }),
    ).toBe(true);

    expect(
      isVideoPollTimedOut({
        attempt: 10,
        maxAttempts: 30,
        elapsedMs: 200000,
        maxTotalMs: 600000,
      }),
    ).toBe(false);
  });
});
