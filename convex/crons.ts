import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "roll forward approved timelines",
  { hourUTC: 8, minuteUTC: 0 },
  internal.demo_timeline_plans.demo_rollForwardApprovedTimelines,
  {}
);

export default crons;
