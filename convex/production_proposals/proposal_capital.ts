/**
 * Production proposals proposal capital bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { pushProposalPlanningSnapshot } from "../proposal_collaboration_model";
import { authorizeProposal } from "./authorization_core.js";
import { requireProposalAppPermission } from "./builder_staff_access.js";
import { normalizeIsoDateOnly } from "./contractor_policy_helpers.js";
import { timelineCapitalEventKind } from "./contracts_workflow.js";
import { getProductionCapitalEventOrThrow, upsertKanbanCard, writeProposalEvent } from "./proposal_copy_audit.js";
import { recalculateProposalBudget, refreshProposalMilestoneDrawAvailability, insertProductionCapitalEvent } from "./proposal_cost_persistence.js";
import { normalizeCapitalEventInterestRate, normalizeProposalCapitalEventDay } from "./proposal_draft_persistence.js";
import { calculateDrawAvailability, normalizeProposalApprovedAmountCents, sumProposalDrawScheduleAmountCents, requireProductionTimelineEditable, requireProductionProposalPreLiveCapitalWrite, requireProductionTimelineDraftStructureWrite } from "./proposal_lender_approval.js";

export const updateProductionProposalCoPayAmount = authenticatedMutation
  .input({
    borrowerCoPayCents: v.number(),
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
    await requireProductionProposalPreLiveCapitalWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "capitalEvent", "update");
    const totalBudgetCents = await recalculateProposalBudget(
      ctx,
      auth,
      args.proposalId,
    );
    if (totalBudgetCents <= 0) {
      throw new Error("Add proposal budget before editing approved amount.");
    }
    const borrowerCoPayCents = Math.max(
      0,
      Math.min(totalBudgetCents, Math.round(args.borrowerCoPayCents)),
    );
    const borrowerCoPayBps = Math.max(
      0,
      Math.min(
        10_000,
        Math.round((borrowerCoPayCents * 10_000) / totalBudgetCents),
      ),
    );
    const approvedAmountCents = calculateDrawAvailability(
      totalBudgetCents,
      borrowerCoPayBps,
    );
    const priorBorrowerCoPayCents =
      auth.proposal.borrowerCoPayCents ??
      Math.round((totalBudgetCents * auth.proposal.borrowerCoPayBps) / 10_000);
    const priorState = JSON.stringify({
      borrowerCoPayBps: auth.proposal.borrowerCoPayBps,
      borrowerCoPayCents: priorBorrowerCoPayCents,
      lenderDrawPolicyLimitCents: auth.proposal.lenderDrawPolicyLimitCents,
      totalBudgetCents,
    });
    const now = Date.now();

    await ctx.db.patch(args.proposalId, {
      borrowerCoPayBps,
      borrowerCoPayCents,
      lenderDrawPolicyLimitCents: approvedAmountCents,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await refreshProposalMilestoneDrawAvailability(ctx, args.proposalId, {
      borrowerCoPayBps,
      updatedAt: now,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionProposalCoPayAmount",
      eventType: "proposal.borrower_copay.updated",
      newState: JSON.stringify({
        approvedAmountCents,
        borrowerCoPayBps,
        borrowerCoPayCents,
        totalBudgetCents,
      }),
      priorState,
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionProposalApprovedAmount = authenticatedMutation
  .input({
    approvedAmountCents: v.number(),
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
    await requireProductionProposalPreLiveCapitalWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "capitalEvent", "update");
    const totalBudgetCents = await recalculateProposalBudget(
      ctx,
      auth,
      args.proposalId,
    );
    if (totalBudgetCents <= 0) {
      throw new Error("Add proposal budget before editing approved amount.");
    }
    const totalDrawAmountCents = await sumProposalDrawScheduleAmountCents(
      ctx,
      args.proposalId,
    );
    const approvedAmountCents = normalizeProposalApprovedAmountCents({
      requestedApprovedAmountCents: args.approvedAmountCents,
      totalDrawAmountCents,
    });
    const borrowerCoPayCents = Math.max(
      0,
      totalBudgetCents - approvedAmountCents,
    );
    const borrowerCoPayBps = Math.max(
      0,
      Math.min(
        10_000,
        Math.round((borrowerCoPayCents * 10_000) / totalBudgetCents),
      ),
    );
    const priorState = JSON.stringify({
      approvedAmountCents: auth.proposal.lenderDrawPolicyLimitCents,
      borrowerCoPayBps: auth.proposal.borrowerCoPayBps,
      borrowerCoPayCents: auth.proposal.borrowerCoPayCents,
      totalBudgetCents,
      totalDrawAmountCents,
    });
    const now = Date.now();

    await ctx.db.patch(args.proposalId, {
      borrowerCoPayBps,
      borrowerCoPayCents,
      lenderDrawPolicyLimitCents: approvedAmountCents,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionProposalApprovedAmount",
      eventType: "proposal.approved_amount.updated",
      newState: JSON.stringify({
        approvedAmountCents,
        borrowerCoPayBps,
        borrowerCoPayCents,
        totalBudgetCents,
        totalDrawAmountCents,
      }),
      priorState,
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionProposalInterestRate = authenticatedMutation
  .input({
    interestAnnualBps: v.number(),
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
    await requireProductionProposalPreLiveCapitalWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "capitalEvent", "update");
    const interestAnnualBps = Math.max(
      0,
      Math.min(10_000, Math.round(args.interestAnnualBps)),
    );
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      interestAnnualBps,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionProposalInterestRate",
      eventType: "proposal.interest_rate.updated",
      newState: JSON.stringify({ interestAnnualBps }),
      priorState: JSON.stringify({
        interestAnnualBps: auth.proposal.interestAnnualBps ?? 925,
      }),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionProposalProposedStartDate = authenticatedMutation
  .input({
    proposedStartDate: v.string(),
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
    await requireProductionTimelineDraftStructureWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "milestone", "update");
    const proposedStartDate = normalizeIsoDateOnly(
      args.proposedStartDate,
      "proposedStartDate",
    );
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      proposedStartDate,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionProposalProposedStartDate",
      eventType: "proposal.proposed_start_date.updated",
      newState: JSON.stringify({ proposedStartDate }),
      priorState: JSON.stringify({
        proposedStartDate: auth.proposal.proposedStartDate,
      }),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createProductionTimelineCapitalEvent = authenticatedMutation
  .input({
    amountCents: v.number(),
    capitalEventKey: v.string(),
    eventKind: timelineCapitalEventKind,
    interestAnnualBps: v.optional(v.number()),
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
    await requireProposalAppPermission(ctx, auth, "capitalEvent", "create");
    const interestAnnualBps = normalizeCapitalEventInterestRate(
      args.eventKind,
      args.interestAnnualBps,
    );
    await insertProductionCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.capitalEventKey,
      eventKind: args.eventKind,
      interestAnnualBps,
      label: args.label,
      order: args.order,
      proposalId: args.proposalId,
      x: args.x,
    });
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.created",
      newState: JSON.stringify(args),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createProductionTimelineCashInfusion = authenticatedMutation
  .input({
    amountCents: v.number(),
    cashInfusionKey: v.string(),
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
    await requireProposalAppPermission(ctx, auth, "capitalEvent", "create");
    await insertProductionCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.cashInfusionKey,
      eventKind: "cashInfusion",
      label: args.label,
      order: args.order,
      proposalId: args.proposalId,
      x: args.x,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineCashInfusion",
      eventType: "proposal.cash_infusion.created",
      newState: JSON.stringify(args),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionTimelineCapitalEvent = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    capitalEventKey: v.string(),
    eventKind: v.optional(timelineCapitalEventKind),
    interestAnnualBps: v.optional(v.number()),
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
    await requireProposalAppPermission(ctx, auth, "capitalEvent", "update");
    const event = await getProductionCapitalEventOrThrow(
      ctx,
      args.proposalId,
      args.capitalEventKey,
    );
    const nextEventKind = args.eventKind ?? event.eventKind;
    const nextAmountCents = args.amountCents ?? event.amountCents;
    if (
      nextEventKind === "homeEquityTakeout" &&
      (!Number.isFinite(nextAmountCents) || nextAmountCents <= 0)
    ) {
      throw new Error("Home Equity Takeout amount must be greater than zero.");
    }
    const interestAnnualBps = normalizeCapitalEventInterestRate(
      nextEventKind,
      args.interestAnnualBps ?? event.interestAnnualBps,
    );
    const nextX =
      args.x === undefined
        ? undefined
        : await normalizeProposalCapitalEventDay(ctx, auth.proposal, args.x);
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.eventKind === undefined ? {} : { eventKind: args.eventKind }),
      ...(nextEventKind === "homeEquityTakeout"
        ? { interestAnnualBps }
        : { interestAnnualBps: undefined }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || event.label }),
      ...(args.order === undefined ? {} : { order: Math.max(1, args.order) }),
      ...(args.x === undefined ? {} : { x: nextX }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(event._id, patch);
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(event),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const deleteProductionTimelineCapitalEvent = authenticatedMutation
  .input({
    capitalEventKey: v.string(),
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
    await requireProposalAppPermission(ctx, auth, "capitalEvent", "delete");
    const event = await getProductionCapitalEventOrThrow(
      ctx,
      args.proposalId,
      args.capitalEventKey,
    );
    await ctx.db.delete(event._id);
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.deleted",
      priorState: JSON.stringify(event),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();
