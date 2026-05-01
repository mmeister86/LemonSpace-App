/**
 * Onboarding note:
 * Convex backend module for ai node data. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

export function getNodeDataRecord(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return {};
}
