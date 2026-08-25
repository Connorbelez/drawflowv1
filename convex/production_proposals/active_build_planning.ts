/**
 * Production proposals active build planning bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { authenticatedMutation } from "../authz";
import { synchronizeMilestoneSystemPostPlanning } from "../build_collaboration_system_posts";
import { ensureActiveBuildPlanningActivationRevision, recordApprovedActiveBuildPlanningRevision } from "../build_collaboration_planning_reconciliation";
import { internalMutation } from "../fluent";
import { type Id } from "../types";
import { addDaysIso } from "./active_capital_evidence.js";
import { latestBuildCapitalPlan } from "./active_cost.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite, getPrimaryLoanFacility } from "./authorization_core.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { APPROVER_ROLES, BUILDER_ROLES } from "./contracts_foundation.js";
import { activeBuildFacilityChangeRequestType } from "./contracts_workflow.js";
import { resolveBorrowerStartingCashCents } from "./directory_cards.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import { daysBetweenIso, normalizeIsoDate, normalizePositiveCents } from "./roster_projection_helpers.js";
import { collectByIndex } from "./storage_helpers.js";

export const updateActiveBuildTimelinePlanState = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    currentDay: v.number(),
    progressValue: v.number(),
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
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "capitalEvent", "update");
    const nextDomainState = {
      currentDay: Math.round(args.currentDay),
      minimumCashReserveCents: Math.max(
        0,
        Math.round(args.minimumCashReserveCents ?? 0),
      ),
      progressValue: Math.round(args.progressValue),
      rangeMax: Math.round(args.rangeMax),
      rangeMin: Math.round(args.rangeMin),
      startingCashCents: Math.max(0, Math.round(args.startingCashCents)),
    };
    const currentDomainState = {
      currentDay: auth.build.timelineCurrentDay ?? nextDomainState.currentDay,
      minimumCashReserveCents:
        auth.build.timelineMinimumCashReserveCents ??
        nextDomainState.minimumCashReserveCents,
      progressValue:
        auth.build.timelineProgressValue ?? nextDomainState.progressValue,
      rangeMax: auth.build.timelineRangeMax ?? nextDomainState.rangeMax,
      rangeMin: auth.build.timelineRangeMin ?? nextDomainState.rangeMin,
      startingCashCents:
        auth.build.timelineStartingCashCents ??
        nextDomainState.startingCashCents,
    };
    const nextRouteState = {
      activeCapitalSpikeId: args.routeState.activeCapitalSpikeId,
      activeDrawId: args.routeState.activeDrawId,
      activeMilestoneKey: args.routeState.activeMilestoneKey,
      selectedPanelOpen: args.routeState.selectedPanelOpen,
      straightLine: args.routeState.straightLine,
    };
    const changedFields = (
      Object.keys(nextDomainState) as Array<keyof typeof nextDomainState>
    ).filter((field) => nextDomainState[field] !== currentDomainState[field]);
    const domainChanged = changedFields.length > 0;
    const routeChanged =
      JSON.stringify(nextRouteState) !==
      JSON.stringify(auth.build.timelineRouteState);

    if (!(domainChanged || routeChanged)) {
      return null;
    }
    if (domainChanged) {
      await ctx.db.patch(args.buildId, {
        timelineCurrentDay: nextDomainState.currentDay,
        timelineMinimumCashReserveCents:
          nextDomainState.minimumCashReserveCents,
        timelineProgressValue: nextDomainState.progressValue,
        timelineRangeMax: nextDomainState.rangeMax,
        timelineRangeMin: nextDomainState.rangeMin,
        ...(routeChanged ? { timelineRouteState: nextRouteState } : {}),
        timelineStartingCashCents: nextDomainState.startingCashCents,
        updatedAt: Date.now(),
      });
      const fieldLabel: Record<keyof typeof nextDomainState, string> = {
        currentDay: "Current day",
        minimumCashReserveCents: "Minimum cash reserve",
        progressValue: "Progress day",
        rangeMax: "Timeline range end",
        rangeMin: "Timeline range start",
        startingCashCents: "Starting cash",
      };
      const summarize = (state: typeof nextDomainState) =>
        changedFields
          .map((field) => `${fieldLabel[field]}: ${state[field]}`)
          .join("; ");
      await writeActiveBuildEvent(ctx, {
        auth,
        build: auth.build,
        command: "updateActiveBuildTimelinePlanState",
        eventType: "active_build.timeline_plan.updated",
        newState: summarize(nextDomainState),
        priorState: summarize(currentDomainState),
        reason: `Updated ${changedFields.map((field) => fieldLabel[field].toLowerCase()).join(", ")}.`,
      });
      return null;
    }

    await ctx.db.patch(args.buildId, {
      timelineCurrentDay: nextDomainState.currentDay,
      timelineMinimumCashReserveCents: nextDomainState.minimumCashReserveCents,
      timelineProgressValue: nextDomainState.progressValue,
      timelineRangeMax: nextDomainState.rangeMax,
      timelineRangeMin: nextDomainState.rangeMin,
      timelineRouteState: nextRouteState,
      timelineStartingCashCents: nextDomainState.startingCashCents,
    });
    return null;
  })
  .public();

export const requestActiveBuildFacilityChange = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    reason: v.optional(v.string()),
    requestedPaybackDate: v.optional(v.string()),
    requestedPrincipalCents: v.optional(v.number()),
    requestType: activeBuildFacilityChangeRequestType,
    workosOrganizationId: v.string(),
  })
  .returns(v.id("activeBuildFacilityChangeRequests"))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BUILDER_ROLES);
    const loanFacility = await getPrimaryLoanFacility(ctx, args.buildId);
    if (!loanFacility) {
      throw new Error("Active build loan facility is missing.");
    }
    const priorState = {
      paybackDate: loanFacility.paybackDate,
      principalCents: loanFacility.principalCents,
    };
    let requestedPayload:
      | { requestedPrincipalCents: number }
      | { requestedPaybackDate: string };
    if (args.requestType === "principalIncrease") {
      const requestedPrincipalCents = normalizePositiveCents(
        args.requestedPrincipalCents,
        "Requested principal is required.",
      );
      if (requestedPrincipalCents <= loanFacility.principalCents) {
        throw new Error("Requested principal must exceed current principal.");
      }
      requestedPayload = { requestedPrincipalCents };
    } else {
      requestedPayload = {
        requestedPaybackDate: normalizeIsoDate(
          args.requestedPaybackDate,
          "Requested payback date is required.",
        ),
      };
    }
    if (args.requestType === "paybackExtension") {
      if (!("requestedPaybackDate" in requestedPayload)) {
        throw new Error("Requested payback date is required.");
      }
      const currentPaybackDate =
        loanFacility.paybackDate ??
        addDaysIso(
          auth.build.startDate,
          auth.build.timelineRangeMax ?? auth.proposal.timelineRangeMax ?? 365,
        );
      if (
        daysBetweenIso(
          currentPaybackDate,
          requestedPayload.requestedPaybackDate,
        ) <= 0
      ) {
        throw new Error("Requested payback date must extend the current date.");
      }
    }
    const now = Date.now();
    const requestId = await ctx.db.insert("activeBuildFacilityChangeRequests", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      priorState,
      proposalId: auth.proposal._id,
      reason: args.reason,
      requestedByWorkosUserId: auth.subject,
      requestedPayload,
      requestType: args.requestType,
      status: "requested",
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestActiveBuildFacilityChange",
      eventType: "active_build.facility_change.requested",
      resourceType: "capitalEvent",
      newState: JSON.stringify({
        requestId,
        requestType: args.requestType,
        requestedPayload,
      }),
      priorState: JSON.stringify(priorState),
      reason: args.reason,
    });
    return requestId;
  })
  .public();

export const reviewActiveBuildFacilityChangeRequest = authenticatedMutation
  .input({
    note: v.optional(v.string()),
    requestId: v.id("activeBuildFacilityChangeRequests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.organizationId !== args.workosOrganizationId) {
      throw new Error("Facility change request not found.");
    }
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      request.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    if (request.status !== "requested") {
      throw new Error("Facility change request has already been reviewed.");
    }
    const loanFacility = await getPrimaryLoanFacility(ctx, request.buildId);
    if (!loanFacility) {
      throw new Error("Active build loan facility is missing.");
    }
    const priorState = {
      paybackDate: loanFacility.paybackDate,
      principalCents: loanFacility.principalCents,
    };
    let newState: Record<string, unknown> = {
      status: args.status,
      requestId: args.requestId,
      requestType: request.requestType,
    };
    if (args.status === "approved") {
      if (request.requestType === "principalIncrease") {
        const requestedPrincipalCents = normalizePositiveCents(
          request.requestedPayload?.requestedPrincipalCents,
          "Requested principal is required.",
        );
        if (requestedPrincipalCents <= loanFacility.principalCents) {
          throw new Error("Requested principal must exceed current principal.");
        }
        await ctx.db.patch(loanFacility._id, {
          principalCents: requestedPrincipalCents,
          updatedAt: Date.now(),
        });
        newState = {
          ...newState,
          principalCents: requestedPrincipalCents,
        };
      } else {
        const requestedPaybackDate = normalizeIsoDate(
          request.requestedPayload?.requestedPaybackDate,
          "Requested payback date is required.",
        );
        await ctx.db.patch(loanFacility._id, {
          paybackDate: requestedPaybackDate,
          updatedAt: Date.now(),
        });
        const newEndDay = daysBetweenIso(
          auth.build.startDate,
          requestedPaybackDate,
        );
        if (newEndDay > (auth.build.timelineRangeMax ?? 0)) {
          await ctx.db.patch(auth.build._id, {
            timelineRangeMax: newEndDay,
            updatedAt: Date.now(),
          });
        }
        newState = {
          ...newState,
          paybackDate: requestedPaybackDate,
          timelineRangeMax: Math.max(
            auth.build.timelineRangeMax ?? 0,
            newEndDay,
          ),
        };
      }
    }
    await ctx.db.patch(args.requestId, {
      reviewedAt: Date.now(),
      reviewerWorkosUserId: auth.subject,
      reviewNote: args.note,
      status: args.status,
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "reviewActiveBuildFacilityChangeRequest",
      eventType: "active_build.facility_change.reviewed",
      resourceType: "capitalEvent",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      reason: args.note,
    });
    return null;
  })
  .public();

export const requestActiveBuildBudgetRevision = authenticatedMutation
  .input({
    borrowerCoPayBps: v.number(),
    borrowerStartingCashCents: v.optional(v.number()),
    // Deprecated compatibility input for clients deployed before the cutover.
    borrowerWorkingCapitalLimitCents: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    lenderDrawPolicyLimitCents: v.number(),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("activeBuildBudgetRevisionRequests"))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BUILDER_ROLES);
    requireReason(args.reason);
    const plans = await collectByIndex(
      ctx,
      "buildCapitalPlans",
      "by_build",
      args.buildId,
    );
    const currentPlan = latestBuildCapitalPlan(plans);
    if (!currentPlan) {
      throw new Error("Active Build capital plan is missing.");
    }
    const borrowerStartingCashCents = normalizePositiveCents(
      args.borrowerStartingCashCents ?? args.borrowerWorkingCapitalLimitCents,
      "Borrower Starting Cash is required.",
    );
    const lenderDrawPolicyLimitCents = normalizePositiveCents(
      args.lenderDrawPolicyLimitCents,
      "Lender Draw Policy Limit is required.",
    );
    const borrowerCoPayBps = Math.round(args.borrowerCoPayBps);
    if (borrowerCoPayBps < 0 || borrowerCoPayBps > 10_000) {
      throw new Error("Loan Percentage must be between 0 and 100 percent.");
    }
    if (
      resolveBorrowerStartingCashCents(currentPlan) ===
        borrowerStartingCashCents &&
      currentPlan.lenderDrawPolicyLimitCents === lenderDrawPolicyLimitCents &&
      currentPlan.borrowerCoPayBps === borrowerCoPayBps
    ) {
      throw new Error(
        "Budget revision must change at least one capital-plan value.",
      );
    }
    const pending = await ctx.db
      .query("activeBuildBudgetRevisionRequests")
      .withIndex("by_build_status", (q) =>
        q.eq("buildId", args.buildId).eq("status", "requested"),
      )
      .first();
    if (pending) {
      throw new Error("A budget revision is already awaiting review.");
    }
    const now = Date.now();
    const priorState = {
      borrowerCoPayBps: currentPlan.borrowerCoPayBps,
      borrowerStartingCashCents: resolveBorrowerStartingCashCents(currentPlan),
      lenderDrawPolicyLimitCents: currentPlan.lenderDrawPolicyLimitCents,
      version: currentPlan.version,
    };
    const requestedPayload = {
      borrowerCoPayBps,
      borrowerStartingCashCents,
      lenderDrawPolicyLimitCents,
    };
    const requestId = await ctx.db.insert("activeBuildBudgetRevisionRequests", {
      baseVersion: currentPlan.version,
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      capitalPlanId: currentPlan._id,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      priorState,
      proposalId: auth.proposal._id,
      reason: args.reason.trim(),
      requestedByWorkosUserId: auth.subject,
      requestedPayload,
      status: "requested",
      updatedAt: now,
      varianceCents:
        lenderDrawPolicyLimitCents - currentPlan.lenderDrawPolicyLimitCents,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestActiveBuildBudgetRevision",
      eventType: "active_build.budget_revision.requested",
      resourceType: "capitalEvent",
      newState: JSON.stringify({ requestId, requestedPayload }),
      priorState: JSON.stringify(priorState),
      reason: args.reason.trim(),
    });
    return requestId;
  })
  .public();

export const reviewActiveBuildBudgetRevision = authenticatedMutation
  .input({
    note: v.string(),
    requestId: v.id("activeBuildBudgetRevisionRequests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    requireReason(args.note);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.organizationId !== args.workosOrganizationId) {
      throw new Error("Budget revision request not found.");
    }
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      request.buildId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    if (request.status !== "requested") {
      throw new Error("Budget revision request has already been reviewed.");
    }
    const currentPlan = latestBuildCapitalPlan(
      await collectByIndex(
        ctx,
        "buildCapitalPlans",
        "by_build",
        request.buildId,
      ),
    );
    if (!currentPlan || currentPlan.version !== request.baseVersion) {
      throw new Error(
        "Budget revision is based on a stale capital-plan version. Submit a new revision.",
      );
    }
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    const now = Date.now();
    let approvedCapitalPlanId: Id<"buildCapitalPlans"> | undefined;
    if (args.status === "approved") {
      approvedCapitalPlanId = await ctx.db.insert("buildCapitalPlans", {
        borrowerCoPayBps: request.requestedPayload.borrowerCoPayBps,
        borrowerStartingCashCents:
          request.requestedPayload.borrowerStartingCashCents,
        borrowerWorkingCapitalLimitCents:
          request.requestedPayload.borrowerStartingCashCents,
        brokerageId: request.brokerageId,
        buildId: request.buildId,
        createdAt: now,
        lenderDrawPolicyLimitCents:
          request.requestedPayload.lenderDrawPolicyLimitCents,
        organizationId: request.organizationId,
        proposalId: request.proposalId,
        revisionRequestId: request._id,
        source: "approved_budget_revision",
        supersedesCapitalPlanId: currentPlan._id,
        updatedAt: now,
        version: currentPlan.version + 1,
      });
    }
    await ctx.db.patch(request._id, {
      ...(approvedCapitalPlanId ? { approvedCapitalPlanId } : {}),
      reviewedAt: now,
      reviewerWorkosUserId: auth.subject,
      reviewNote: args.note.trim(),
      status: args.status,
      updatedAt: now,
    });
    if (args.status === "approved") {
      await recordApprovedActiveBuildPlanningRevision(ctx, {
        actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
        build: auth.build,
        reason: args.note.trim(),
        sourceCommand: "reviewActiveBuildBudgetRevision",
        now,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.production_proposals
          .scheduleActiveBuildMilestonePlanningReconciliation,
        {
          actorRoles: auth.roles,
          actorWorkosUserId: auth.subject,
          buildId: auth.build._id,
        },
      );
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "reviewActiveBuildBudgetRevision",
      eventType: "active_build.budget_revision.reviewed",
      resourceType: "capitalEvent",
      newState: JSON.stringify({
        approvedCapitalPlanId,
        requestId: request._id,
        status: args.status,
        version:
          args.status === "approved"
            ? currentPlan.version + 1
            : currentPlan.version,
      }),
      priorState: JSON.stringify(request.priorState),
      reason: args.note.trim(),
    });
    return null;
  })
  .public();

export const synchronizeActiveBuildMilestonePlanningInternal = internalMutation
  .input({
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
    buildId: v.id("activeBuilds"),
    milestoneId: v.id("buildMilestones"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const [build, milestone] = await Promise.all([
      ctx.db.get(args.buildId),
      ctx.db.get(args.milestoneId),
    ]);
    if (
      !build ||
      !milestone ||
      milestone.buildId !== build._id ||
      milestone.organizationId !== build.organizationId ||
      milestone.brokerageId !== build.brokerageId ||
      milestone.planningState === "superseded"
    ) {
      return null;
    }
    await synchronizeMilestoneSystemPostPlanning(ctx, {
      actor: {
        roles: args.actorRoles,
        workosUserId: args.actorWorkosUserId,
      },
      build,
      milestone,
    });
    return null;
  })
  .internal();

export const scheduleActiveBuildMilestonePlanningReconciliation =
  internalMutation
    .input({
      actorRoles: v.array(v.string()),
      actorWorkosUserId: v.string(),
      buildId: v.id("activeBuilds"),
      cursor: v.optional(v.union(v.string(), v.null())),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const build = await ctx.db.get(args.buildId);
      if (!build) return null;
      const page = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .paginate({ cursor: args.cursor ?? null, numItems: 25 });
      for (const milestone of page.page) {
        if (
          milestone.planningState === "superseded" ||
          milestone.organizationId !== build.organizationId ||
          milestone.brokerageId !== build.brokerageId
        ) {
          continue;
        }
        await ctx.scheduler.runAfter(
          0,
          internal.production_proposals
            .synchronizeActiveBuildMilestonePlanningInternal,
          {
            actorRoles: args.actorRoles,
            actorWorkosUserId: args.actorWorkosUserId,
            buildId: build._id,
            milestoneId: milestone._id,
          },
        );
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal.production_proposals
            .scheduleActiveBuildMilestonePlanningReconciliation,
          {
            actorRoles: args.actorRoles,
            actorWorkosUserId: args.actorWorkosUserId,
            buildId: build._id,
            cursor: page.continueCursor,
          },
        );
      }
      return null;
    })
    .internal();
