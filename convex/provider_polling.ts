/**
 * Onboarding note:
 * Convex backend module for provider polling. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import { categorizeError } from "./ai_errors";

export function getProviderPollDelayMs(attempt: number): number {
  if (attempt <= 5) {
    return 5000;
  }
  if (attempt <= 15) {
    return 10000;
  }
  return 20000;
}

export function isProviderPollTimedOut(args: {
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  maxTotalMs: number;
}): boolean {
  return args.attempt > args.maxAttempts || args.elapsedMs > args.maxTotalMs;
}

export function buildProviderPollTimeoutMessage(operationLabel: string): string {
  return `Timeout: ${operationLabel} exceeded maximum polling time`;
}

export function getProviderTerminalFailureMessage(args: {
  providerError: string | undefined;
  fallback: string;
}): string {
  return args.providerError?.trim() || args.fallback;
}

export function shouldRetryProviderPollError(args: {
  error: unknown;
  attempt: number;
  maxAttempts: number;
}): boolean {
  return categorizeError(args.error).retryable && args.attempt < args.maxAttempts;
}

export function buildNextProviderPollSchedule<TArgs extends { attempt: number }>(
  args: TArgs,
): { delayMs: number; args: TArgs } {
  return {
    delayMs: getProviderPollDelayMs(args.attempt),
    args: {
      ...args,
      attempt: args.attempt + 1,
    },
  };
}
