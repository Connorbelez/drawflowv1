/**
 * Production proposals proposal draw plan bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { assertProposalCollaborationEditAllowed, hasActiveCollaborationParticipant, pushProposalPlanningSnapshot } from "../proposal_collaboration_model";
import { type Doc } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { requireProposalAppPermission } from "./builder_staff_access.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES, PROPOSAL_TIMELINE_MIN_DAY } from "./contracts_foundation.js";
import { timelineModificationRequestType } from "./contracts_workflow.js";
import { getProductionMilestoneOrThrow, getProductionDrawOrThrow, writeProposalEvent } from "./proposal_copy_audit.js";
import { applyProductionTimelineModificationRequest } from "./proposal_cost_persistence.js";
import { ensureProposalApprovedAmountCoversDrawSchedule, requireProductionTimelineEditable } from "./proposal_lender_approval.js";
import { collectByIndex } from "./storage_helpers.js";

export const createProductionTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.number(),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.string(),
    order: v.optional(v.number()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "draw", "create");
    const existing = await ctx.db
      .query("proposalDrawScheduleRows")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", args.proposalId).eq("drawKey", args.drawKey),
      )
      .unique();
    if (existing) {
      throw new Error("Production draw already exists.");
    }
    if (!Number.isFinite(args.x) || Math.round(args.x) < 0) {
      throw new Error("Draw timing day must be on or after T0.");
    }
    const draws = await collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      args.proposalId,
    );
    const milestone =
      args.itemMilestoneKey === undefined
        ? null
        : await getProductionMilestoneOrThrow(
            ctx,
            args.proposalId,
            args.itemMilestoneKey,
          );
    const now = Date.now();
    await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      brokerageId: auth.brokerage._id,
      createdAt: now,
      customDate: args.customDate ?? true,
      drawKey: args.drawKey,
      label: args.label.trim() || "Reimbursement draw",
      ...(args.itemMilestoneKey === undefined
        ? {}
        : { milestoneKey: args.itemMilestoneKey }),
      order: args.order ?? draws.length + 1,
      organizationId: auth.proposal.organizationId,
      proposalId: args.proposalId,
      ...(milestone === null ? {} : { proposalMilestoneId: milestone._id }),
      source: "manual",
      timingDay: Math.max(0, Math.round(args.x)),
      updatedAt: now,
    });
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineDraw",
      eventType: "proposal.draw.created",
      newState: JSON.stringify(args),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.optional(v.string()),
    order: v.optional(v.number()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "draw", "update");
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    if (
      args.x !== undefined &&
      (!Number.isFinite(args.x) || Math.round(args.x) < 0)
    ) {
      throw new Error("Draw timing day must be on or after T0.");
    }
    const milestone =
      args.itemMilestoneKey === undefined
        ? undefined
        : await getProductionMilestoneOrThrow(
            ctx,
            args.proposalId,
            args.itemMilestoneKey,
          );
    const now = Date.now();
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.customDate === undefined ? {} : { customDate: args.customDate }),
      ...(milestone === undefined
        ? {}
        : {
            milestoneKey: args.itemMilestoneKey,
            proposalMilestoneId: milestone._id,
          }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || draw.label }),
      ...(args.order === undefined
        ? {}
        : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.x === undefined
        ? {}
        : { customDate: true, timingDay: Math.max(0, Math.round(args.x)) }),
      updatedAt: now,
    };
    await ctx.db.patch(draw._id, patch);
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineDraw",
      eventType: "proposal.draw.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const deleteProductionTimelineDraw = authenticatedMutation
  .input({
    drawKey: v.string(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "draw", "delete");
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    if (draw.requestStatus === "approved") {
      throw new Error("Approved reimbursement draws cannot be deleted.");
    }
    const now = Date.now();
    await ctx.db.delete(draw._id);
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineDraw",
      eventType: "proposal.draw.deleted",
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const replaceProductionTimelineDrawSchedule = authenticatedMutation
  .input({
    draws: v.array(
      v.object({
        amountCents: v.number(),
        customDate: v.optional(v.boolean()),
        drawKey: v.string(),
        itemMilestoneKey: v.optional(v.string()),
        label: v.string(),
        order: v.number(),
        x: v.number(),
      }),
    ),
    metrics: v.optional(
      v.object({
        drawCount: v.number(),
        drawFeesCents: v.number(),
        interestCostCents: v.number(),
        totalCostCents: v.number(),
        totalDrawAmountCents: v.number(),
      }),
    ),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "draw", "create");
    await requireProposalAppPermission(ctx, auth, "draw", "delete");
    const replacementDraws = args.draws as Array<{
      amountCents: number;
      customDate?: boolean;
      drawKey: string;
      itemMilestoneKey?: string;
      label: string;
      order: number;
      x: number;
    }>;
    if (replacementDraws.length > 100) {
      throw new Error("Optimized draw schedules are limited to 100 draws.");
    }
    const keys = new Set<string>();
    for (const draw of replacementDraws) {
      if (
        !draw.drawKey.trim() ||
        keys.has(draw.drawKey) ||
        !Number.isFinite(draw.amountCents) ||
        draw.amountCents <= 0 ||
        !Number.isFinite(draw.x) ||
        draw.x < 0
      ) {
        throw new Error(
          "Optimized draws require unique keys, positive amounts, and dates on or after T0.",
        );
      }
      keys.add(draw.drawKey);
    }
    const existing = (await collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      args.proposalId,
    )) as Doc<"proposalDrawScheduleRows">[];
    if (existing.some((draw) => draw.requestStatus === "approved")) {
      throw new Error("Approved reimbursement draws cannot be replaced.");
    }
    const priorState = JSON.stringify(existing);
    for (const draw of existing) {
      await ctx.db.delete(draw._id);
    }
    const now = Date.now();
    for (const [index, draw] of [...replacementDraws]
      .sort((a, b) => a.order - b.order || a.x - b.x)
      .entries()) {
      const milestone =
        draw.itemMilestoneKey === undefined
          ? null
          : await getProductionMilestoneOrThrow(
              ctx,
              args.proposalId,
              draw.itemMilestoneKey,
            );
      await ctx.db.insert("proposalDrawScheduleRows", {
        amountCents: Math.round(draw.amountCents),
        brokerageId: auth.brokerage._id,
        createdAt: now,
        customDate: draw.customDate ?? true,
        drawKey: draw.drawKey,
        label: draw.label.trim() || `Draw ${index + 1}`,
        ...(draw.itemMilestoneKey === undefined
          ? {}
          : { milestoneKey: draw.itemMilestoneKey }),
        order: index + 1,
        organizationId: auth.proposal.organizationId,
        proposalId: args.proposalId,
        ...(milestone === null ? {} : { proposalMilestoneId: milestone._id }),
        source: "manual",
        timingDay: Math.round(draw.x),
        updatedAt: now,
      });
    }
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    if (args.metrics && auth.proposal.selectedPlan) {
      await ctx.db.patch(args.proposalId, {
        selectedPlan: {
          ...auth.proposal.selectedPlan,
          metrics: {
            ...auth.proposal.selectedPlan.metrics,
            drawCount: Math.max(0, Math.round(args.metrics.drawCount)),
            drawFeesCents: Math.max(0, Math.round(args.metrics.drawFeesCents)),
            interestCostCents: Math.max(
              0,
              Math.round(args.metrics.interestCostCents),
            ),
            totalCostCents: Math.max(
              0,
              Math.round(args.metrics.totalCostCents),
            ),
            totalDrawAmountCents: Math.max(
              0,
              Math.round(args.metrics.totalDrawAmountCents),
            ),
          },
        },
      });
    }
    await writeProposalEvent(ctx, {
      auth,
      command: "replaceProductionTimelineDrawSchedule",
      eventType: "proposal.draw_schedule.replaced",
      newState: JSON.stringify(args.draws),
      priorState,
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const requestProductionTimelineModification = authenticatedMutation
  .input({
    milestoneKey: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    requestedPayload: v.any(),
    requestType: timelineModificationRequestType,
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({ requestId: v.id("proposalTimelineModificationRequests") }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status !== "approved") {
      throw new Error("Live-build modification requests require approval.");
    }
    const requestedPermission =
      args.requestType === "createMilestone"
        ? (["milestone", "create"] as const)
        : args.requestType === "deleteMilestone"
          ? (["milestone", "delete"] as const)
          : (["milestone", "update"] as const);
    await requireProposalAppPermission(
      ctx,
      auth,
      requestedPermission[0],
      requestedPermission[1],
    );
    let priorState: unknown;
    if (
      args.requestType === "deleteMilestone" ||
      args.requestType === "updateMilestoneBudget"
    ) {
      if (!args.milestoneKey) {
        throw new Error("milestoneKey is required for this request.");
      }
      priorState = await getProductionMilestoneOrThrow(
        ctx,
        args.proposalId,
        args.milestoneKey,
      );
    }
    const now = Date.now();
    const requestId = await ctx.db.insert(
      "proposalTimelineModificationRequests",
      {
        brokerageId: auth.brokerage._id,
        createdAt: now,
        milestoneKey: args.milestoneKey,
        organizationId: auth.proposal.organizationId,
        priorState,
        proposalId: args.proposalId,
        reason: args.reason,
        requestedByWorkosUserId: auth.subject,
        requestedPayload: args.requestedPayload,
        requestType: args.requestType,
        status: "requested",
        updatedAt: now,
      },
    );
    await writeProposalEvent(ctx, {
      auth,
      command: "requestProductionTimelineModification",
      eventType: "proposal.modification.requested",
      newState: JSON.stringify({ requestId, requestType: args.requestType }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return { requestId };
  })
  .public();

export const reviewProductionTimelineModificationRequest = authenticatedMutation
  .input({
    note: v.optional(v.string()),
    requestId: v.id("proposalTimelineModificationRequests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Production timeline modification request not found.");
    }
    const auth = await authorizeProposal(
      ctx,
      request.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);

    if (request.status !== "requested") {
      return null;
    }
    if (args.status === "approved") {
      await applyProductionTimelineModificationRequest(ctx, auth, request);
    }
    await ctx.db.patch(request._id, {
      reviewNote: args.note,
      reviewedAt: Date.now(),
      reviewerWorkosUserId: auth.subject,
      status: args.status,
      updatedAt: Date.now(),
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "reviewProductionTimelineModificationRequest",
      eventType: "proposal.modification.reviewed",
      newState: JSON.stringify({
        requestId: args.requestId,
        status: args.status,
      }),
      priorState: JSON.stringify(request),
      proposalId: request.proposalId,
      reason: args.note,
    });
    await pushProposalPlanningSnapshot(ctx, request.proposalId);
    return null;
  })
  .public();

export const updateProductionTimelinePlanState = authenticatedMutation
  .input({
    currentDay: v.number(),
    progressValue: v.number(),
    proposalId: v.id("buildProposals"),
    rangeMax: v.number(),
    rangeMin: v.number(),
    routeState: v.object({
      activeCapitalSpikeId: v.optional(v.string()),
      activeDrawId: v.optional(v.string()),
      activeMilestoneKey: v.optional(v.string()),
      selectedPanelOpen: v.boolean(),
      straightLine: v.boolean(),
    }),
    minimumCashReserveCents: v.optional(v.number()),
    startingCashCents: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    if (
      !(await hasActiveCollaborationParticipant(
        ctx,
        auth.proposal._id,
        auth.subject,
      ))
    ) {
      await requireProposalAppPermission(ctx, auth, "capitalEvent", "update");
    }
    const priorState = JSON.stringify({
      currentDay: auth.proposal.timelineCurrentDay,
      progressValue: auth.proposal.timelineProgressValue,
      rangeMax: auth.proposal.timelineRangeMax,
      rangeMin: auth.proposal.timelineRangeMin,
      routeState: auth.proposal.timelineRouteState,
      minimumCashReserveCents: auth.proposal.timelineMinimumCashReserveCents,
      startingCashCents: auth.proposal.timelineStartingCashCents,
    });
    const now = Date.now();
    const normalizedStartingCashCents = Math.max(
      0,
      Math.round(args.startingCashCents),
    );
    await ctx.db.patch(args.proposalId, {
      borrowerStartingCashCents: normalizedStartingCashCents,
      // Dual-write until the legacy field is narrowed out after backfill.
      borrowerWorkingCapitalLimitCents: normalizedStartingCashCents,
      timelineCurrentDay: Math.round(args.currentDay),
      timelineProgressValue: Math.round(args.progressValue),
      timelineRangeMax: Math.round(args.rangeMax),
      timelineRangeMin: PROPOSAL_TIMELINE_MIN_DAY,
      timelineRouteState: args.routeState,
      timelineMinimumCashReserveCents: Math.max(
        0,
        Math.round(args.minimumCashReserveCents ?? 0),
      ),
      timelineStartingCashCents: normalizedStartingCashCents,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelinePlanState",
      eventType: "proposal.timeline_state.updated",
      newState: JSON.stringify({
        currentDay: Math.round(args.currentDay),
        progressValue: Math.round(args.progressValue),
        rangeMax: Math.round(args.rangeMax),
        rangeMin: PROPOSAL_TIMELINE_MIN_DAY,
        routeState: args.routeState,
        minimumCashReserveCents: Math.max(
          0,
          Math.round(args.minimumCashReserveCents ?? 0),
        ),
        startingCashCents: Math.max(0, Math.round(args.startingCashCents)),
      }),
      priorState,
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();
