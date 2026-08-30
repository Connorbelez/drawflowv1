import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  appendAudit,
  findMilestone,
  getBuildOrThrow,
  getMilestones,
} from "./access";
import { recalcDrawGroupDates } from "./lifecycle";
import { recordJitPlanningRun } from "./projection";
import {
  DAY_MS,
  DEMO_TODAY,
  dateDiffDays,
  dateValue,
  type DemoMilestone,
} from "./data";

export const demo_updateMilestoneProgress = publicMutation
  .use(withMutationTiming("demo_drawflow.updateMilestoneProgress"))
  .input({
    milestoneKey: v.string(),
    mode: v.union(v.literal("mark_complete"), v.literal("set_progress")),
    persona: v.string(),
    progressPercent: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "builder_lead") {
      await appendAudit(ctx, {
        actorPersona: args.persona,
        command: "demo_updateMilestoneProgress",
        entityKey: milestone.key,
        entityLabel: milestone.name,
        entityType: "milestone",
        eventType: "MilestoneProgressRejected",
        milestoneKey: milestone.key,
        scenario: "active",
        validation: "rejected",
      });
      throw new Error("Only Builder Lead can update milestone progress.");
    }
    const patch =
      args.mode === "mark_complete"
        ? {
            actualCompletedDate: DEMO_TODAY,
            progressPercent: 100,
            status: "complete_pending_submission",
            updatedAt: Date.now(),
          }
        : {
            progressPercent: args.progressPercent ?? milestone.progressPercent,
            updatedAt: Date.now(),
          };
    await ctx.db.patch(milestone._id, patch);
    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary:
        args.mode === "mark_complete"
          ? "Progress set to 100%"
          : "Progress updated",
      beforeSummary: `${milestone.progressPercent}%`,
      buildId: milestone.buildId,
      command: "demo_updateMilestoneProgress",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType:
        args.mode === "mark_complete"
          ? "MilestoneMarkedComplete"
          : "MilestoneProgressUpdated",
      milestoneKey: milestone.key,
      scenario: "active",
    });
    await recalcDrawGroupDates(ctx, "active");
    return { ok: true };
  })
  .public();
export const demo_updateForecastDatesWithReason = publicMutation
  .use(withMutationTiming("demo_drawflow.updateForecastDatesWithReason"))
  .input({
    forecastEndDate: v.string(),
    forecastStartDate: v.string(),
    milestoneKey: v.string(),
    persona: v.string(),
    reason: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    if (!args.reason.trim()) {
      throw new Error("Forecast date changes require a reason.");
    }
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (milestone.isDragLocked) {
      throw new Error(`${milestone.name} is locked and cannot be moved.`);
    }
    if (args.forecastEndDate < args.forecastStartDate) {
      throw new Error("Forecast end date must be after start date.");
    }
    const priorEndDate = dateValue(milestone.forecastEndDate);
    const priorStartDate = dateValue(milestone.forecastStartDate);
    await ctx.db.patch(milestone._id, {
      durationDays: dateDiffDays(args.forecastStartDate, args.forecastEndDate),
      forecastEndDate: args.forecastEndDate,
      forecastStartDate: args.forecastStartDate,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("demo_forecastUpdates", {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      createdAt: Date.now(),
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      newEndDate: args.forecastEndDate,
      newStartDate: args.forecastStartDate,
      priorEndDate,
      priorStartDate,
      reason: args.reason,
      scenario: "active",
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary: `${args.forecastStartDate} → ${args.forecastEndDate}`,
      beforeSummary: `${priorStartDate} → ${priorEndDate}`,
      buildId: milestone.buildId,
      command: "demo_updateForecastDatesWithReason",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ActiveMilestoneForecastChanged",
      milestoneKey: milestone.key,
      reason: args.reason,
      scenario: "active",
    });
    await recalcDrawGroupDates(ctx, "active");
    return { ok: true };
  })
  .public();

export const demo_setMilestoneDragLocked = publicMutation
  .use(withMutationTiming("demo_drawflow.setMilestoneDragLocked"))
  .input({
    locked: v.boolean(),
    milestoneKey: v.string(),
    persona: v.string(),
    scenario: v.union(v.literal("active"), v.literal("proposal")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, args.scenario);
    if (args.scenario === "proposal" && build.status === "submitted") {
      throw new Error(
        "Submitted proposals cannot change milestone drag locks."
      );
    }
    const milestone = await findMilestone(
      ctx,
      args.scenario,
      args.milestoneKey
    );
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    const beforeLocked = Boolean(milestone.isDragLocked);
    await ctx.db.patch(milestone._id, {
      isDragLocked: args.locked,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary: args.locked
        ? "Timeline drag locked"
        : "Timeline drag unlocked",
      beforeSummary: beforeLocked
        ? "Timeline drag locked"
        : "Timeline drag unlocked",
      buildId: milestone.buildId,
      command: "demo_setMilestoneDragLocked",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: args.locked ? "MilestoneDragLocked" : "MilestoneDragUnlocked",
      milestoneKey: milestone.key,
      reason: "Timeline drag lock toggled.",
      scenario: args.scenario,
    });
    return { ok: true };
  })
  .public();

export const demo_batchMoveMilestoneDates = publicMutation
  .use(withMutationTiming("demo_drawflow.batchMoveMilestoneDates"))
  .input({
    moves: v.array(
      v.object({
        endDate: v.string(),
        milestoneKey: v.string(),
        startDate: v.string(),
      })
    ),
    persona: v.string(),
    reason: v.optional(v.string()),
    scenario: v.union(v.literal("active"), v.literal("proposal")),
    source: v.union(v.literal("selection"), v.literal("drawGroup")),
    sourceKey: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    if (args.moves.length === 0) {
      throw new Error("At least one milestone move is required.");
    }
    if (args.scenario === "active" && !args.reason?.trim()) {
      throw new Error("Forecast batch changes require a reason.");
    }
    const build = await getBuildOrThrow(ctx, args.scenario);
    if (args.scenario === "proposal" && build.status === "submitted") {
      throw new Error("Submitted proposals cannot move milestone dates.");
    }

    const milestones = await getMilestones(ctx, args.scenario);
    const milestoneByKey = new Map<string, DemoMilestone>(
      milestones.map((milestone) => [milestone.key, milestone])
    );
    const loadedMoves = args.moves.map((move) => {
      const milestone = milestoneByKey.get(move.milestoneKey);
      if (!milestone) {
        throw new Error(`Milestone not found: ${move.milestoneKey}`);
      }
      if (milestone.isDragLocked) {
        throw new Error(`${milestone.name} is locked and cannot be moved.`);
      }
      if (move.endDate < move.startDate) {
        throw new Error("Milestone end date must be after start date.");
      }
      return { milestone, move };
    });

    const first = loadedMoves[0];
    const priorFirstStart =
      args.scenario === "active"
        ? dateValue(first.milestone.forecastStartDate)
        : dateValue(first.milestone.plannedStartDate);
    const deltaDays = Math.round(
      (Date.parse(`${first.move.startDate}T00:00:00.000Z`) -
        Date.parse(`${priorFirstStart}T00:00:00.000Z`)) /
        DAY_MS
    );

    for (const { milestone, move } of loadedMoves) {
      const priorEndDate =
        args.scenario === "active"
          ? dateValue(milestone.forecastEndDate)
          : dateValue(milestone.plannedEndDate);
      const priorStartDate =
        args.scenario === "active"
          ? dateValue(milestone.forecastStartDate)
          : dateValue(milestone.plannedStartDate);
      await ctx.db.patch(
        milestone._id,
        args.scenario === "active"
          ? {
              durationDays: dateDiffDays(move.startDate, move.endDate),
              forecastEndDate: move.endDate,
              forecastStartDate: move.startDate,
              updatedAt: Date.now(),
            }
          : {
              durationDays: dateDiffDays(move.startDate, move.endDate),
              plannedEndDate: move.endDate,
              plannedStartDate: move.startDate,
              updatedAt: Date.now(),
            }
      );
      if (args.scenario === "active") {
        await ctx.db.insert("demo_forecastUpdates", {
          actorPersona: args.persona,
          buildId: milestone.buildId,
          createdAt: Date.now(),
          milestoneId: milestone._id,
          milestoneKey: milestone.key,
          newEndDate: move.endDate,
          newStartDate: move.startDate,
          priorEndDate,
          priorStartDate,
          reason: args.reason?.trim() ?? "",
          scenario: "active",
        });
      }
    }

    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary: `${loadedMoves.length} milestones shifted ${deltaDays} days`,
      buildId: build._id,
      command: "demo_batchMoveMilestoneDates",
      drawGroupKey: args.source === "drawGroup" ? args.sourceKey : undefined,
      entityKey: args.sourceKey,
      entityLabel:
        args.source === "drawGroup" ? args.sourceKey : "Selected milestones",
      entityType: "milestone_batch",
      eventType:
        args.scenario === "active"
          ? "ActiveMilestoneForecastBatchShifted"
          : "ProposalMilestoneDatesBatchShifted",
      reason: args.reason?.trim(),
      scenario: args.scenario,
      validation: JSON.stringify({
        movedMilestoneKeys: loadedMoves.map(({ milestone }) => milestone.key),
        source: args.source,
        sourceKey: args.sourceKey,
      }),
    });
    await recalcDrawGroupDates(ctx, args.scenario);
    if (args.scenario === "proposal") {
      await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    }
    return { ok: true };
  })
  .public();
