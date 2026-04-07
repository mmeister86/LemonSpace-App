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
