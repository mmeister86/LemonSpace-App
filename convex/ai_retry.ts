/**
 * Onboarding note:
 * Convex backend module for ai retry. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import { categorizeError, errorMessage, type ErrorCategory } from "./ai_errors";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function generateImageWithAutoRetry<T>(
  operation: () => Promise<T>,
  onRetry: (
    retryCount: number,
    maxRetries: number,
    failure: { message: string; category: ErrorCategory }
  ) => Promise<void>,
  maxRetries: number
): Promise<T> {
  let lastError: unknown = null;
  const startedAt = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStartedAt = Date.now();
    try {
      const result = await operation();
      console.info("[generateImageWithAutoRetry] success", {
        attempts: attempt + 1,
        totalDurationMs: Date.now() - startedAt,
        lastAttemptDurationMs: Date.now() - attemptStartedAt,
      });
      return result;
    } catch (error) {
      lastError = error;
      const { retryable, category } = categorizeError(error);
      const retryCount = attempt + 1;
      const hasRemainingRetry = retryCount <= maxRetries;

      console.warn("[generateImageWithAutoRetry] attempt failed", {
        attempt: retryCount,
        maxAttempts: maxRetries + 1,
        retryable,
        hasRemainingRetry,
        category,
        attemptDurationMs: Date.now() - attemptStartedAt,
        totalDurationMs: Date.now() - startedAt,
        message: errorMessage(error),
      });

      if (!retryable || !hasRemainingRetry) {
        throw error;
      }

      await onRetry(retryCount, maxRetries, {
        message: errorMessage(error),
        category,
      });
      await wait(Math.min(1500, 400 * retryCount));
    }
  }

  throw lastError ?? new Error("Generation failed");
}
