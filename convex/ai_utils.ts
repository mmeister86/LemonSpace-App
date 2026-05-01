/**
 * Onboarding note:
 * Convex backend module for ai utils. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

export { assertNodeBelongsToCanvasOrThrow } from "./authz_helpers";
