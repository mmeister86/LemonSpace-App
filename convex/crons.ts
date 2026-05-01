/**
 * Onboarding note:
 * Convex backend module for crons. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "release stale credit reservations",
  { hours: 1 },
  internal.credits.releaseStaleReservations,
  {},
);

export default crons;
