/**
 * Production proposals active build timeline bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { appendActiveSubmilestoneEvidenceAssetToDraft } from "../build_submilestone_evidence";
import { scheduleCurrentMilestoneSystemPostActivations } from "../build_collaboration_scheduling";
import { synchronizeMilestoneSystemPostPlanning } from "../build_collaboration_system_posts";
import { ensureActiveBuildPlanningActivationRevision, recordApprovedActiveBuildPlanningRevision } from "../build_collaboration_planning_reconciliation";
import { type Doc, type Id } from "../types";
import { addDaysIso, insertActiveBuildCapitalEvent, getActiveBuildCapitalEventOrThrow } from "./active_capital_evidence.js";
import { supersedeActiveBuildMilestoneCascade, latestBuildCapitalPlan, recalculateActiveBuildBudget } from "./active_cost.js";
import { getActiveBuildMilestoneOrThrow, assertActiveBuildPlanningTargetActive, findActiveBuildSubmilestoneByKey, insertActiveBuildMilestoneFromInput, replaceActiveBuildSubmilestones, latestActiveBuildPlanningRevision } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite } from "./authorization_core.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { evidenceAssetInput, activeTimelineCapitalEventKind, activeBuildSubmilestoneInput, activeBuildTimelineMilestoneInput } from "./contracts_workflow.js";
import { writeActiveBuildEvent, getActiveBuildDrawOrThrow } from "./proposal_copy_audit.js";
import { normalizeProductionMilestoneSchedule, assertValidProductionSubmilestones } from "./proposal_draft_model.js";
import { calculateDrawAvailability } from "./proposal_lender_approval.js";
import { collectByIndex } from "./storage_helpers.js";

export const createActiveBuildTimelineMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestone: activeBuildTimelineMilestoneInput,
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "milestone", "create");
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    if ((args.milestone.submilestones ?? []).length > 0) {
      await requireActiveBuildAppPermission(
        ctx,
        auth,
        "submilestone",
        "create",
      );
    }
    const milestoneId = await insertActiveBuildMilestoneFromInput(
      ctx,
      auth,
      args.milestone,
    );
    await recalculateActiveBuildBudget(ctx, args.buildId);
    await recordApprovedActiveBuildPlanningRevision(ctx, {
      actor: {
        actorRoles: auth.roles,
        actorWorkosUserId: auth.subject,
      },
      build: auth.build,
      reason: "Approved active-build milestone created.",
      sourceCommand: "createActiveBuildTimelineMilestone",
    });
    const createdMilestone = await ctx.db.get(milestoneId);
    if (createdMilestone) {
      await synchronizeMilestoneSystemPostPlanning(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        build: auth.build,
        milestone: createdMilestone,
      });
      await scheduleCurrentMilestoneSystemPostActivations(ctx, {
        build: auth.build,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineMilestone",
      eventType: "active_build.milestone.created",
      newState: JSON.stringify(args.milestone),
    });
    return null;
  })
  .public();

export const updateActiveBuildTimelineMilestone = authenticatedMutation
  .input({
    budgetCents: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    dayEnd: v.optional(v.number()),
    dayStart: v.optional(v.number()),
    dependencyKeys: v.optional(v.array(v.string())),
    drawAvailabilityCents: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    evidenceState: v.optional(v.string()),
    isDragLocked: v.optional(v.boolean()),
    milestoneKey: v.string(),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
    policyState: v.optional(v.string()),
    progressPercent: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("complete"),
      ),
    ),
    submilestones: v.optional(v.array(activeBuildSubmilestoneInput)),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "milestone", "update");
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    if (args.submilestones !== undefined) {
      await requireActiveBuildAppPermission(
        ctx,
        auth,
        "submilestone",
        "update",
      );
    }
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const nextDayStart = Math.round(args.dayStart ?? milestone.dayStart);
    const existingDurationDays = Math.max(
      1,
      Math.round(
        milestone.durationDays ?? milestone.dayEnd - milestone.dayStart,
      ),
    );
    const nextRequestedDurationDays =
      args.durationDays ??
      (args.dayStart !== undefined && args.dayEnd === undefined
        ? existingDurationDays
        : undefined);
    const nextDayEnd = Math.round(
      args.dayEnd ??
        (nextRequestedDurationDays === undefined
          ? milestone.dayEnd
          : nextDayStart + nextRequestedDurationDays),
    );
    if (nextDayEnd < nextDayStart && nextRequestedDurationDays === undefined) {
      throw new Error("Milestone end day must be after start day.");
    }
    const dayStartDelta = nextDayStart - Math.round(milestone.dayStart);
    const existingSubmilestones = (await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
      .collect()) as Doc<"buildSubmilestones">[];
    const schedule = normalizeProductionMilestoneSchedule({
      dayEnd: nextDayEnd,
      dayStart: nextDayStart,
      durationDays: nextRequestedDurationDays,
      submilestones:
        args.submilestones === undefined
          ? existingSubmilestones
              .filter((submilestone) => submilestone.planningState !== "superseded")
              .map((submilestone) => ({
              budgetCents: submilestone.budgetCents,
              durationDays: submilestone.durationDays,
              key: submilestone.key,
              name: submilestone.name,
              order: submilestone.order,
              startDay:
                submilestone.startDay === undefined
                  ? undefined
                  : Math.max(
                      0,
                      Math.round(submilestone.startDay + dayStartDelta),
                    ),
            }))
          : args.submilestones,
    });
    if (args.submilestones !== undefined) {
      assertValidProductionSubmilestones(
        schedule.submilestones,
        `Milestone ${milestone.key}`,
      );
    }
    const nextBudgetCents =
      args.budgetCents === undefined
        ? milestone.budgetCents
        : Math.max(0, Math.round(args.budgetCents));
    const capitalPlan = latestBuildCapitalPlan(
      await collectByIndex(ctx, "buildCapitalPlans", "by_build", args.buildId),
    );
    const borrowerCoPayBps =
      capitalPlan?.borrowerCoPayBps ?? auth.proposal.borrowerCoPayBps;
    const patch = {
      ...(args.budgetCents === undefined
        ? {}
        : { budgetCents: nextBudgetCents }),
      ...(args.dayEnd === undefined ? {} : { dayEnd: Math.round(args.dayEnd) }),
      ...(args.dayStart === undefined
        ? {}
        : { dayStart: Math.round(args.dayStart) }),
      ...(args.dependencyKeys === undefined
        ? {}
        : { dependencyKeys: args.dependencyKeys }),
      ...(args.drawAvailabilityCents === undefined &&
      args.budgetCents === undefined
        ? {}
        : {
            drawAvailabilityCents:
              args.drawAvailabilityCents === undefined
                ? calculateDrawAvailability(nextBudgetCents, borrowerCoPayBps)
                : Math.max(0, Math.round(args.drawAvailabilityCents)),
          }),
      ...(args.durationDays === undefined
        ? {}
        : { durationDays: Math.max(1, Math.round(args.durationDays)) }),
      ...(args.evidenceState === undefined
        ? {}
        : { evidenceState: args.evidenceState }),
      ...(args.isDragLocked === undefined
        ? {}
        : { isDragLocked: args.isDragLocked }),
      ...(args.name === undefined
        ? {}
        : { name: args.name.trim() || milestone.name }),
      ...(args.order === undefined
        ? {}
        : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.policyState === undefined
        ? {}
        : { policyState: args.policyState }),
      ...(args.progressPercent === undefined
        ? {}
        : {
            progressPercent: Math.max(
              0,
              Math.min(100, Math.round(args.progressPercent)),
            ),
          }),
      ...(args.status === undefined ? {} : { status: args.status }),
      planningState: "active" as const,
      supersededAt: undefined,
      supersededByPlanningRevision: undefined,
      updatedAt: Date.now(),
    };
    Object.assign(patch, {
      dayEnd: schedule.dayEnd,
      dayStart: schedule.dayStart,
      durationDays: schedule.durationDays,
    });
    await ctx.db.patch(milestone._id, patch);
    let supersededIds: Id<"buildSubmilestones">[] = [];
    if (args.submilestones !== undefined || dayStartDelta !== 0) {
      const replacement = await replaceActiveBuildSubmilestones(ctx, auth, {
        buildId: args.buildId,
        milestone,
        rejectEmpty: args.submilestones !== undefined,
        rows: schedule.submilestones,
      });
      supersededIds = replacement.supersededIds;
    }
    await recalculateActiveBuildBudget(ctx, args.buildId);
    const priorPlanningRevision = await latestActiveBuildPlanningRevision(
      ctx,
      auth.build._id,
    );
    const planningRevision = await recordApprovedActiveBuildPlanningRevision(
      ctx,
      {
        actor: {
          actorRoles: auth.roles,
          actorWorkosUserId: auth.subject,
        },
        build: auth.build,
        reason: "Approved active-build timeline update.",
        sourceCommand: "updateActiveBuildTimelineMilestone",
      },
    );
    const createdPlanningRevision =
      planningRevision != null &&
      planningRevision._id !== priorPlanningRevision?._id;
    if (
      createdPlanningRevision &&
      planningRevision &&
      supersededIds.length > 0
    ) {
      for (const submilestoneId of supersededIds) {
        await ctx.db.patch(submilestoneId, {
          supersededByPlanningRevision: planningRevision.revision,
          updatedAt: Date.now(),
        });
      }
    }
    const currentMilestone = await ctx.db.get(milestone._id);
    if (currentMilestone) {
      await synchronizeMilestoneSystemPostPlanning(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        build: auth.build,
        milestone: currentMilestone,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelineMilestone",
      eventType: "active_build.milestone.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(milestone),
    });
    return null;
  })
  .public();

export const deleteActiveBuildTimelineMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "milestone", "delete");
    await requireActiveBuildAppPermission(ctx, auth, "submilestone", "delete");
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const supersededSubmilestoneIds = await supersedeActiveBuildMilestoneCascade(
      ctx,
      args.buildId,
      milestone,
    );
    await recalculateActiveBuildBudget(ctx, args.buildId);
    const priorPlanningRevision = await latestActiveBuildPlanningRevision(
      ctx,
      auth.build._id,
    );
    const planningRevision = await recordApprovedActiveBuildPlanningRevision(
      ctx,
      {
        actor: {
          actorRoles: auth.roles,
          actorWorkosUserId: auth.subject,
        },
        build: auth.build,
        reason: "Approved active-build milestone superseded.",
        sourceCommand: "deleteActiveBuildTimelineMilestone",
      },
    );
    const createdPlanningRevision =
      planningRevision != null &&
      planningRevision._id !== priorPlanningRevision?._id;
    if (createdPlanningRevision && planningRevision) {
      await ctx.db.patch(milestone._id, {
        supersededByPlanningRevision: planningRevision.revision,
        updatedAt: Date.now(),
      });
      for (const submilestoneId of supersededSubmilestoneIds) {
        await ctx.db.patch(submilestoneId, {
          supersededByPlanningRevision: planningRevision.revision,
          updatedAt: Date.now(),
        });
      }
    }
    const currentMilestone = await ctx.db.get(milestone._id);
    if (currentMilestone) {
      await synchronizeMilestoneSystemPostPlanning(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        build: auth.build,
        milestone: currentMilestone,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildTimelineMilestone",
      eventType: "active_build.milestone.deleted",
      priorState: JSON.stringify(milestone),
    });
    return null;
  })
  .public();

export const createActiveBuildTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.number(),
    buildId: v.id("activeBuilds"),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.string(),
    order: v.optional(v.number()),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "draw", "create");
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    const existing = await ctx.db
      .query("plannedDrawScheduleRows")
      .withIndex("by_build_order", (q) => q.eq("buildId", args.buildId))
      .collect()
      .then((rows) => rows.find((row) => row.drawKey === args.drawKey));
    if (existing) {
      throw new Error("Production active-build draw already exists.");
    }
    const draws = await collectByIndex(
      ctx,
      "plannedDrawScheduleRows",
      "by_build",
      args.buildId,
    );
    const milestone =
      args.itemMilestoneKey === undefined
        ? null
        : await getActiveBuildMilestoneOrThrow(
            ctx,
            args.buildId,
            args.itemMilestoneKey,
          );
    const now = Date.now();
    const proposalDrawScheduleRowId = await ctx.db.insert(
      "proposalDrawScheduleRows",
      {
        amountCents: Math.max(0, Math.round(args.amountCents)),
        brokerageId: auth.brokerage._id,
        createdAt: now,
        customDate: args.customDate ?? true,
        drawKey: args.drawKey,
        label: args.label.trim() || "Reimbursement draw",
        milestoneKey: args.itemMilestoneKey,
        order: args.order ?? draws.length + 1,
        organizationId: args.workosOrganizationId,
        proposalId: auth.proposal._id,
        proposalMilestoneId: milestone?.proposalMilestoneId,
        source: "manual",
        timingDay: Math.max(0, Math.round(args.x)),
        updatedAt: now,
      },
    );
    await ctx.db.insert("plannedDrawScheduleRows", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      buildMilestoneId: milestone?._id,
      createdAt: now,
      drawKey: args.drawKey,
      label: args.label.trim() || "Reimbursement draw",
      milestoneKey: args.itemMilestoneKey,
      order: args.order ?? draws.length + 1,
      organizationId: args.workosOrganizationId,
      proposalDrawScheduleRowId,
      status: "planned",
      timingDay: Math.max(0, Math.round(args.x)),
      updatedAt: now,
    });
    await recordApprovedActiveBuildPlanningRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
      reason: "Approved active-build draw created.",
      sourceCommand: "createActiveBuildTimelineDraw",
      now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineDraw",
      eventType: "active_build.draw.created",
      newState: JSON.stringify(args),
    });
    return null;
  })
  .public();

export const updateActiveBuildTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.optional(v.string()),
    order: v.optional(v.number()),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "draw", "update");
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    const draw = await getActiveBuildDrawOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    const milestone =
      args.itemMilestoneKey === undefined
        ? undefined
        : await getActiveBuildMilestoneOrThrow(
            ctx,
            args.buildId,
            args.itemMilestoneKey,
          );
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.itemMilestoneKey === undefined
        ? {}
        : {
            buildMilestoneId: milestone?._id,
            milestoneKey: args.itemMilestoneKey,
          }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || draw.label }),
      ...(args.order === undefined
        ? {}
        : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.x === undefined
        ? {}
        : { timingDay: Math.max(0, Math.round(args.x)) }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await recordApprovedActiveBuildPlanningRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
      reason: "Approved active-build draw updated.",
      sourceCommand: "updateActiveBuildTimelineDraw",
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelineDraw",
      eventType: "active_build.draw.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
    });
    return null;
  })
  .public();

export const deleteActiveBuildTimelineDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "draw", "delete");
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    const draw = await getActiveBuildDrawOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (draw.status === "approved_for_release" || draw.status === "released") {
      throw new Error(
        "Approved or released reimbursement draws cannot be deleted.",
      );
    }
    await ctx.db.delete(draw._id);
    await recordApprovedActiveBuildPlanningRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
      reason: "Approved active-build draw removed.",
      sourceCommand: "deleteActiveBuildTimelineDraw",
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildTimelineDraw",
      eventType: "active_build.draw.deleted",
      priorState: JSON.stringify(draw),
    });
    return null;
  })
  .public();

export const createActiveBuildTimelineCapitalEvent = authenticatedMutation
  .input({
    amountCents: v.number(),
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.string(),
    eventKind: activeTimelineCapitalEventKind,
    label: v.string(),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "capitalEvent", "create");
    await insertActiveBuildCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.capitalEventKey,
      eventKind: args.eventKind,
      label: args.label,
      x: args.x,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineCapitalEvent",
      eventType: "active_build.capital_event.created",
      newState: JSON.stringify(args),
    });
    return null;
  })
  .public();

export const createActiveBuildTimelineCashInfusion = authenticatedMutation
  .input({
    amountCents: v.number(),
    buildId: v.id("activeBuilds"),
    cashInfusionKey: v.string(),
    label: v.string(),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "capitalEvent", "create");
    await insertActiveBuildCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.cashInfusionKey,
      eventKind: "cashInfusion",
      label: args.label,
      x: args.x,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineCashInfusion",
      eventType: "active_build.cash_infusion.created",
      resourceType: "capitalEvent",
      newState: JSON.stringify(args),
    });
    return null;
  })
  .public();

export const updateActiveBuildTimelineCapitalEvent = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.string(),
    eventKind: v.optional(activeTimelineCapitalEventKind),
    label: v.optional(v.string()),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "capitalEvent", "update");
    const event = await getActiveBuildCapitalEventOrThrow(
      ctx,
      args.buildId,
      args.capitalEventKey,
    );
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.eventKind === undefined
        ? {}
        : {
            eventType:
              args.eventKind === "cashInfusion"
                ? ("borrower_copay" as const)
                : ("cost" as const),
          }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || event.label }),
      ...(args.x === undefined
        ? {}
        : { eventDate: addDaysIso(auth.build.startDate, args.x) }),
    };
    await ctx.db.patch(event._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelineCapitalEvent",
      eventType: "active_build.capital_event.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(event),
    });
    return null;
  })
  .public();

export const deleteActiveBuildTimelineCapitalEvent = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await requireActiveBuildAppPermission(ctx, auth, "capitalEvent", "delete");
    const event = await getActiveBuildCapitalEventOrThrow(
      ctx,
      args.buildId,
      args.capitalEventKey,
    );
    await ctx.db.delete(event._id);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildTimelineCapitalEvent",
      eventType: "active_build.capital_event.deleted",
      priorState: JSON.stringify(event),
    });
    return null;
  })
  .public();

export const generateActiveBuildEvidenceUploadUrl = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "evidence", "create");
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const createActiveBuildTimelineEvidenceAsset = authenticatedMutation
  .input({
    asset: evidenceAssetInput,
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "evidence", "create");
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.asset.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const scopedSubmilestone = args.asset.submilestoneKey
      ? findActiveBuildSubmilestoneByKey(
          (await ctx.db
            .query("buildSubmilestones")
            .withIndex("by_milestone", (query) =>
              query.eq("buildMilestoneId", milestone._id),
            )
            .collect()) as Doc<"buildSubmilestones">[],
          args.asset.submilestoneKey,
        )
      : undefined;
    if (args.asset.submilestoneKey && !scopedSubmilestone) {
      throw new ConvexError({
        code: "SUBMILESTONE_NOT_FOUND",
        message: "Evidence Sub-milestone is unavailable for this Milestone.",
        submilestoneKey: args.asset.submilestoneKey,
      });
    }
    if (scopedSubmilestone) {
      assertActiveBuildPlanningTargetActive(milestone, scopedSubmilestone);
    }
    const existing = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_key", (q) =>
        q.eq("buildId", args.buildId).eq("evidenceKey", args.asset.evidenceKey),
      )
      .unique();
    if (existing) {
      throw new Error("Production active-build evidence asset already exists.");
    }
    const now = Date.now();
    const assetId = await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      collaborationEventRevision: 1,
      contractorIds: args.asset.contractorIds,
      createdAt: now,
      evidenceKey: args.asset.evidenceKey,
      fileName: args.asset.fileName,
      label: args.asset.label.trim() || args.asset.fileName,
      locationVerified: args.asset.locationVerified ?? false,
      milestoneKey: args.asset.milestoneKey,
      mimeType: args.asset.mimeType,
      organizationId: args.workosOrganizationId,
      proposalId: auth.proposal._id,
      sizeBytes: Math.max(0, Math.round(args.asset.sizeBytes)),
      source: args.asset.source ?? "active_build_timeline_upload",
      storageId: args.asset.storageId,
      submilestoneKey: args.asset.submilestoneKey,
      tag: args.asset.tag.trim() || milestone.name,
      updatedAt: now,
    });
    await ctx.db.patch(milestone._id, {
      evidenceState: args.asset.locationVerified
        ? "Submitted package"
        : "Location unverified",
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineEvidenceAsset",
      ...(scopedSubmilestone
        ? {
            entityId: String(scopedSubmilestone._id),
            entityType: "buildSubmilestone",
          }
        : {}),
      eventType: "active_build.evidence.created",
      resourceType: "evidence",
      newState: JSON.stringify(args.asset),
    });
    const persistedAsset = await ctx.db.get(assetId);
    if (!persistedAsset) {
      throw new Error("Submitted Evidence became unavailable.");
    }
    const collaborationEventRevision =
      persistedAsset.collaborationEventRevision ?? 1;
    if (scopedSubmilestone) {
      await appendActiveSubmilestoneEvidenceAssetToDraft(ctx, {
        actorRoles: auth.roles,
        actorWorkosUserId: auth.subject,
        asset: persistedAsset,
        build: auth.build,
        milestone,
        sourceKind: "canonical_upload",
        submilestone: scopedSubmilestone,
      });
    }
    return null;
  })
  .public();
