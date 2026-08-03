import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "deliver Build collaboration notifications",
  { minutes: 5 },
  internal.build_collaboration_delivery_transport
    .processBuildCollaborationExternalDeliveries,
  {}
);

crons.interval(
  "publish approved Build collaboration schedules",
  { minutes: 5 },
  internal.build_collaboration_scheduling
    .processDueBuildCollaborationScheduledPublications,
  {}
);

crons.interval(
  "reconcile scheduled Milestone System Posts",
  { minutes: 5 },
  internal.build_collaboration_scheduling.reconcileDueMilestoneSystemPosts,
  {}
);

crons.interval(
  "reconcile scheduled Draw System Posts",
  { minutes: 5 },
  internal.build_collaboration_scheduling.reconcileDueDrawSystemPosts,
  {}
);

crons.interval(
  "recover Active Build planning materialization",
  { minutes: 5 },
  internal.build_collaboration_planning_reconciliation
    .recoverActiveBuildPlanningRevisionMaterialization,
  {}
);

crons.interval(
  "recover expired Build collaboration webhook leases",
  { minutes: 1 },
  internal.build_collaboration_webhooks
    .recoverExpiredBuildCollaborationWebhookDeliveryLeases,
  {}
);

crons.interval(
  "clean expired Build collaboration archives",
  { minutes: 15 },
  internal.build_collaboration_export_archive
    .cleanupExpiredBuildCollaborationExportArchives,
  {}
);

crons.interval(
  "schedule quote invitation reminders",
  { minutes: 1 },
  internal.quote_notifications.scheduleQuoteInvitationReminders,
  {}
);

crons.interval(
  "dispatch communication intents",
  { minutes: 1 },
  internal.quote_notifications.processDueCommunicationIntents,
  {}
);

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
