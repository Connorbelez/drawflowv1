import { v } from "convex/values";

import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "./fluent";

const timelineStatusValidator = v.union(
  v.literal("complete"),
  v.literal("ready"),
  v.literal("review"),
  v.literal("upcoming")
);

const timelineIconValidator = v.union(
  v.literal("change"),
  v.literal("closeout"),
  v.literal("drywall"),
  v.literal("exterior"),
  v.literal("finishes"),
  v.literal("foundation"),
  v.literal("framing"),
  v.literal("roughIn")
);

const timelineToneValidator = v.optional(
  v.union(
    v.literal("active"),
    v.literal("blocked"),
    v.literal("complete"),
    v.literal("upcoming"),
    v.literal("warning")
  )
);

const timelineMilestoneDataValidator = v.object({
  amount: v.number(),
  draw: v.string(),
  drawX: v.optional(v.number()),
  evidence: v.string(),
  icon: timelineIconValidator,
  name: v.string(),
  policy: v.string(),
  status: timelineStatusValidator,
  subMilestones: v.optional(v.array(v.string())),
});

const timelineItemValidator = v.object({
  data: timelineMilestoneDataValidator,
  disabled: v.optional(v.boolean()),
  eyebrow: v.optional(v.string()),
  id: v.string(),
  label: v.optional(v.string()),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  tone: timelineToneValidator,
  x: v.number(),
});

const timelineDrawValidator = v.object({
  amount: v.number(),
  customDate: v.optional(v.boolean()),
  id: v.string(),
  itemId: v.optional(v.string()),
  label: v.string(),
  x: v.number(),
});

const timelineCapitalSpikeValidator = v.object({
  amount: v.number(),
  id: v.string(),
  label: v.string(),
  x: v.number(),
});

const timelineRangeValidator = v.object({
  max: v.number(),
  min: v.number(),
  unit: v.optional(v.string()),
});

const timelineSnapshotValidator = v.object({
  activeItemId: v.string(),
  capitalSpikes: v.array(timelineCapitalSpikeValidator),
  draws: v.array(timelineDrawValidator),
  items: v.array(timelineItemValidator),
  payloadVersion: v.number(),
  progressValue: v.number(),
  range: timelineRangeValidator,
  selectedPanelOpen: v.boolean(),
  snapshotSummary: v.string(),
  startingCash: v.number(),
  straightLine: v.boolean(),
  title: v.string(),
});

export const demo_createTimelineSnapshot = publicMutation
  .use(withMutationTiming("demo_timeline_snapshots.create"))
  .input({ snapshot: timelineSnapshotValidator })
  .handler(async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("demo_timelineSnapshots", {
      ...args.snapshot,
      createdAt: now,
      updatedAt: now,
    });
  })
  .public();

export const demo_getTimelineSnapshot = publicQuery
  .use(withQueryTiming("demo_timeline_snapshots.get"))
  .input({ snapshotId: v.string() })
  .handler(async (ctx, args) => {
    const snapshotId = ctx.db.normalizeId(
      "demo_timelineSnapshots",
      args.snapshotId
    );

    if (!snapshotId) {
      return null;
    }

    return await ctx.db.get(snapshotId);
  })
  .public();
