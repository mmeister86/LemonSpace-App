import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { FreepikApiError } from "@/convex/freepik";
import {
  categorizeError,
  formatTerminalStatusMessage,
  getVideoPollDelayMs,
  isVideoPollTimedOut,
} from "@/convex/ai_errors";
import {
  buildNextProviderPollSchedule,
  buildProviderPollTimeoutMessage,
  getProviderTerminalFailureMessage,
  shouldRetryProviderPollError,
} from "@/convex/provider_polling";

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

  it("formats structured-output invalid json with human-readable provider message", () => {
    expect(
      formatTerminalStatusMessage(
        new ConvexError({ code: "OPENROUTER_STRUCTURED_OUTPUT_INVALID_JSON" }),
      ),
    ).toBe("Provider: Strukturierte Antwort konnte nicht gelesen werden");
  });

  it("formats structured-output missing content with human-readable provider message", () => {
    expect(
      formatTerminalStatusMessage(
        new ConvexError({ code: "OPENROUTER_STRUCTURED_OUTPUT_MISSING_CONTENT" }),
      ),
    ).toBe("Provider: Strukturierte Antwort fehlt");
  });

  it("formats structured-output http error with provider prefix and server message", () => {
    expect(
      formatTerminalStatusMessage(
        new ConvexError({
          code: "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR",
          status: 503,
          message: "OpenRouter API error 503: Upstream timeout",
        }),
      ),
    ).toBe("Provider: OpenRouter API error 503: Upstream timeout");
  });

  it("formats structured-output http error with extracted provider details from JSON payload", () => {
    expect(
      formatTerminalStatusMessage(
        new ConvexError({
          code: "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR",
          status: 502,
          message:
            '{"error":{"message":"Provider returned error","code":"provider_error","type":"upstream_error"}}',
        }),
      ),
    ).toBe("Provider: OpenRouter 502: Provider returned error [code=provider_error, type=upstream_error]");
  });

  it("formats structured-output http error without falling back to raw code", () => {
    expect(
      formatTerminalStatusMessage(
        new ConvexError({ code: "OPENROUTER_STRUCTURED_OUTPUT_HTTP_ERROR" }),
      ),
    ).toBe("Provider: Anfrage fehlgeschlagen");
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

  it("builds provider polling timeout messages with the operation label", () => {
    expect(buildProviderPollTimeoutMessage("Image transform")).toBe(
      "Timeout: Image transform exceeded maximum polling time",
    );
  });

  it("uses provider terminal errors before generic fallback messages", () => {
    expect(
      getProviderTerminalFailureMessage({
        providerError: "  Render failed  ",
        fallback: "Provider: Video generation failed",
      }),
    ).toBe("Render failed");
    expect(
      getProviderTerminalFailureMessage({
        providerError: " ",
        fallback: "Provider: Image transform failed",
      }),
    ).toBe("Provider: Image transform failed");
  });

  it("allows retryable provider polling errors until the max attempt", () => {
    const retryableError = new FreepikApiError({
      code: "transient",
      message: "Task not visible yet",
      retryable: true,
      status: 404,
    });

    expect(
      shouldRetryProviderPollError({
        error: retryableError,
        attempt: 29,
        maxAttempts: 30,
      }),
    ).toBe(true);
    expect(
      shouldRetryProviderPollError({
        error: retryableError,
        attempt: 30,
        maxAttempts: 30,
      }),
    ).toBe(false);
  });

  it("builds the next provider polling schedule without mutating original args", () => {
    const args = { taskId: "task_123", attempt: 7, startedAtMs: 1000 };

    const schedule = buildNextProviderPollSchedule(args);

    expect(schedule).toEqual({
      delayMs: 10000,
      args: { taskId: "task_123", attempt: 8, startedAtMs: 1000 },
    });
    expect(args.attempt).toBe(7);
  });
});
