import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "process Build Action Item deadlines",
  { minuteUTC: 5 },
  internal.build_action_item_queues.processBuildActionItemDeadlines,
  {}
);

crons.daily(
  "roll forward approved timelines",
  { hourUTC: 8, minuteUTC: 0 },
  internal.demo_timeline_plans.demo_rollForwardApprovedTimelines,
  {}
);

export default crons;
