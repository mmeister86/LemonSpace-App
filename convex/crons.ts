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
