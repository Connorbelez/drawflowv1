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

crons.interval(
  "expire open Build collaboration asset staging sessions",
  { minutes: 15 },
  internal.build_collaboration_asset_maintenance
    .expireBuildCollaborationAssetStagingSessions,
  { state: "open" }
);

crons.interval(
  "expire finalized Build collaboration asset staging sessions",
  { minutes: 15 },
  internal.build_collaboration_asset_maintenance
    .expireBuildCollaborationAssetStagingSessions,
  { state: "finalized" }
);

crons.daily(
  "reconcile data retention schedules",
  { hourUTC: 2, minuteUTC: 0 },
  internal.data_retention.fanOutDataRetentionWork,
  { mode: "reconcile" }
);

crons.daily(
  "run data retention maintenance",
  { hourUTC: 3, minuteUTC: 0 },
  internal.data_retention.fanOutDataRetentionWork,
  { mode: "maintenance" }
);

crons.daily(
  "clean expired data retention tombstones",
  { hourUTC: 4, minuteUTC: 0 },
  internal.data_retention.cleanupExpiredDataRetentionTombstones,
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
