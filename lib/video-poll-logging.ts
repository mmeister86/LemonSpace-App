/**
 * Onboarding note:
 * Shared TypeScript utility for video poll logging. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

export type VideoPollStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export function shouldLogVideoPollAttempt(attempt: number): boolean {
  return attempt === 1 || attempt % 5 === 0;
}

export function shouldLogVideoPollResult(
  attempt: number,
  status: VideoPollStatus,
): boolean {
  return status !== "IN_PROGRESS" || shouldLogVideoPollAttempt(attempt);
}
