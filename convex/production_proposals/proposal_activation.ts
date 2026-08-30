/**
 * Production proposals proposal activation bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { requireDefaultBrokerMember } from "../brokerAssignments";
import { scheduleCurrentMilestoneSystemPostActivations } from "../build_collaboration_scheduling";
import { ensureApprovedBuildSubmilestoneCompanions, validateBuildTimezone } from "../build_collaboration_system_posts";
import { ensureActiveBuildPlanningActivationRevision } from "../build_collaboration_planning_reconciliation";
import { normalizeSiteVisitGuidance } from "../demo_site_visit_guidance";
import { internalMutation } from "../fluent";
import { attachSubmilestoneFieldGuidanceBuildLineage } from "../submilestone_field_guidance";
import { attachSubmilestoneScopeBuildLineage } from "../submilestone_scope_contracts";
import { assertProposalLifecycleTransition } from "../production_proposal_lifecycle";
import { LENDER_PROPOSAL_DECISION_ROLES } from "../lender_portal_phase4";
import { type Doc, type Id } from "../types";
import { addDaysIso } from "./active_capital_evidence.js";
import { authorizeProposal, assignedBuilderProfileIdOrThrow } from "./authorization_core.js";
import { requireBackofficeProposalWrite, requireAnyRole, normalizeIsoDateOnly } from "./contractor_policy_helpers.js";
import { APPROVER_ROLES, PROPOSAL_TIMELINE_MIN_DAY } from "./contracts_foundation.js";
import { repairLegacyClosedProposalActiveBuildAggregate } from "./legacy_seed.js";
import { assertNoArchivingProposalLenderAssignment, authorizeProposalLifecycleActor, evaluateProposalClosingEligibility } from "./lender_assignment_auth.js";
import { upsertKanbanCard, writeProposalEvent, writeActiveBuildEvent, copyProposalOperationalRowsToActiveBuild, copyProposalCapitalEventsToActiveBuild, activeBuildDrawStatusFromProposal } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import { requireState, requirePhase3BackofficeRole } from "./review_lifecycle_helpers.js";
import { getPermitDocument, getPermitWaiver, collectByIndex } from "./storage_helpers.js";

export const recordProposalClosing = authenticatedMutation
  .input({
    buildStartDate: v.string(),
    ianaTimezone: v.string(),
    loanFacility: v.object({
      interestAnnualBps: v.number(),
      principalCents: v.number(),
    }),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      closingId: v.id("proposalClosings"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      "proposal_review",
    );
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    if (!auth.isCurrentLenderActor) {
      requireAnyRole(auth.roles, APPROVER_ROLES);
      requireBackofficeProposalWrite(auth, auth.proposal);
    }
    requireReason(args.reason);
    const timezone = validateBuildTimezone(args.ianaTimezone);
    const buildStartDate = normalizeIsoDateOnly(
      args.buildStartDate,
      "Closing build start date",
    );
    if (
      !Number.isFinite(args.loanFacility.interestAnnualBps) ||
      !Number.isFinite(args.loanFacility.principalCents) ||
      args.loanFacility.interestAnnualBps < 0 ||
      args.loanFacility.principalCents < 0
    ) {
      throw new Error("Closing loan facility values must be non-negative numbers.");
    }
    const loanFacility = {
      interestAnnualBps: Math.round(args.loanFacility.interestAnnualBps),
      principalCents: Math.round(args.loanFacility.principalCents),
    };
    const existingClosings = await ctx.db
      .query("proposalClosings")
      .withIndex("by_proposal", (query) =>
        query.eq("proposalId", args.proposalId),
      )
      .take(2);
    if (existingClosings.length > 1) {
      throw new Error("Proposal has multiple closing records.");
    }
    if (existingClosings[0] || auth.proposal.status === "closed") {
      throw new Error("Proposal closing is already recorded.");
    }
    assertProposalLifecycleTransition({
      command: "close",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    const eligibility = await evaluateProposalClosingEligibility(
      ctx,
      auth.proposal,
      auth.currentLenderAssignment,
    );
    if (!eligibility.eligible) {
      throw new Error(eligibility.reasons.join(" "));
    }
    if (!eligibility.policyLock) {
      throw new Error("An immutable review policy lock is required before closing.");
    }
    const closingAllowedRoles: readonly string[] = auth.isCurrentLenderActor
      ? LENDER_PROPOSAL_DECISION_ROLES
      : APPROVER_ROLES;
    const closedByRole = auth.roles.find((role) =>
      closingAllowedRoles.includes(role),
    );
    if (!closedByRole) {
      throw new Error("Forbidden: closing authority");
    }
    const now = Date.now();
    const closingId = await ctx.db.insert("proposalClosings", {
      brokerageId: auth.brokerage._id,
      buildStartDate,
      closedAt: now,
      closedByRole,
      closedByWorkosUserId: auth.subject,
      createdAt: now,
      ianaTimezone: timezone,
      loanFacility,
      organizationId: auth.organizationId,
      proposalId: args.proposalId,
      reason: args.reason.trim(),
      reviewPolicyLockId: eligibility.policyLock._id,
    });
    await ctx.db.patch(args.proposalId, {
      closedAt: now,
      status: "closed",
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "recordProposalClosing",
      eventType: "proposal.closed",
      newState: JSON.stringify({
        closingId,
        reviewPolicyLockId: eligibility.policyLock._id,
        status: "closed",
      }),
      priorState: "approved",
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return { closingId };
  })
  .public();

export const resolveLegacyClosedProposalActivation = authenticatedMutation
  .input({
    evidenceReference: v.string(),
    issueId: v.id("proposalPhase3MigrationIssues"),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      issueId: v.id("proposalPhase3MigrationIssues"),
      status: v.literal("resolved"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    requireState(auth.proposal, "closed");
    requireReason(args.reason);
    const evidenceReference = args.evidenceReference.trim();
    if (!evidenceReference) {
      throw new Error("Legacy activation resolution requires an evidence reference.");
    }
    const closing = await ctx.db
      .query("proposalClosings")
      .withIndex("by_proposal", (query) =>
        query.eq("proposalId", args.proposalId),
      )
      .unique();
    if (!closing) {
      throw new Error("Closed proposal is missing a closing record.");
    }
    if (closing.reviewPolicyLockId) {
      throw new Error(
        "Legacy activation resolution is unavailable when a review policy lock exists.",
      );
    }
    const issue = await ctx.db.get(args.issueId);
    if (
      !issue ||
      issue.proposalId !== auth.proposal._id ||
      issue.brokerageId !== auth.proposal.brokerageId ||
      issue.organizationId !== auth.proposal.organizationId ||
      issue.sourceTable !== "proposalClosings" ||
      (issue.sourceRecordId !== String(closing._id) &&
        issue.sourceRecordId !== String(auth.proposal._id))
    ) {
      throw new Error("Legacy activation migration issue is outside the closing scope.");
    }
    if (
      issue.status === "resolved" &&
      issue.resolutionMode === "operator_activation_override"
    ) {
      if (closing.legacyPolicyResolutionIssueId !== issue._id) {
        await ctx.db.patch(closing._id, {
          legacyPolicyResolutionIssueId: issue._id,
        });
      }
      return { issueId: issue._id, status: "resolved" as const };
    }
    if (issue.status !== "open") {
      throw new Error("Legacy activation migration issue is not open.");
    }
    if (
      closing.legacyPolicyResolutionIssueId &&
      closing.legacyPolicyResolutionIssueId !== issue._id
    ) {
      throw new Error("Legacy activation already references another resolution.");
    }
    const now = Date.now();
    const resolvedByRole = requirePhase3BackofficeRole(auth);
    await ctx.db.patch(issue._id, {
      resolutionEvidenceReference: evidenceReference,
      resolutionMode: "operator_activation_override",
      resolutionReason: args.reason.trim(),
      resolvedAt: now,
      resolvedByRole,
      resolvedByWorkosUserId: auth.subject,
      status: "resolved",
      updatedAt: now,
    });
    await ctx.db.patch(closing._id, {
      legacyPolicyResolutionIssueId: issue._id,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "resolveLegacyClosedProposalActivation",
      eventType: "proposal.legacy_policy_activation_resolved",
      newState: JSON.stringify({
        evidenceReference,
        issueId: issue._id,
        resolutionMode: "operator_activation_override",
      }),
      priorState: JSON.stringify({
        issueId: issue._id,
        status: issue.status,
      }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return { issueId: issue._id, status: "resolved" as const };
  })
  .public();

export const activateClosedProposal = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.object({ buildId: v.id("activeBuilds") }))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      "proposal_review",
    );
    if (!auth.isCurrentLenderActor) {
      requireAnyRole(auth.roles, APPROVER_ROLES);
      requireBackofficeProposalWrite(auth, auth.proposal);
    } else if (
      !auth.roles.some((role) =>
        LENDER_PROPOSAL_DECISION_ROLES.includes(
          role as (typeof LENDER_PROPOSAL_DECISION_ROLES)[number],
        ),
      )
    ) {
      throw new Error("Forbidden: activation authority");
    }
    requireState(auth.proposal, "closed");
    requireReason(args.reason);
    const closings = await ctx.db
      .query("proposalClosings")
      .withIndex("by_proposal", (query) =>
        query.eq("proposalId", args.proposalId),
      )
      .take(2);
    if (closings.length > 1) {
      throw new Error("Proposal has multiple closing records.");
    }
    const closing = closings[0];
    if (!closing) {
      throw new Error("Closed proposal is missing a closing record.");
    }
    const reviewPolicyLock = closing.reviewPolicyLockId
      ? await ctx.db.get(closing.reviewPolicyLockId)
      : null;
    let legacyPolicyResolution: Doc<"proposalPhase3MigrationIssues"> | null =
      null;
    if (closing.reviewPolicyLockId) {
      if (
        !reviewPolicyLock ||
        reviewPolicyLock.proposalId !== args.proposalId ||
        reviewPolicyLock.organizationId !== auth.proposal.organizationId ||
        reviewPolicyLock.brokerageId !== auth.proposal.brokerageId
      ) {
        throw new Error("Closed proposal review policy lock is inconsistent.");
      }
    } else if (closing.legacyPolicyResolutionIssueId) {
      const resolution = await ctx.db.get(
        closing.legacyPolicyResolutionIssueId,
      );
      if (
        !resolution ||
        resolution.status !== "resolved" ||
        resolution.resolutionMode !== "operator_activation_override" ||
        resolution.proposalId !== args.proposalId ||
        resolution.brokerageId !== auth.proposal.brokerageId ||
        resolution.organizationId !== auth.proposal.organizationId ||
        resolution.sourceTable !== "proposalClosings" ||
        (resolution.sourceRecordId !== String(closing._id) &&
          resolution.sourceRecordId !== String(auth.proposal._id)) ||
        !resolution.resolutionEvidenceReference ||
        !resolution.resolutionReason ||
        !resolution.resolvedAt ||
        !resolution.resolvedByWorkosUserId
      ) {
        throw new Error("Closed proposal legacy activation resolution is inconsistent.");
      }
      legacyPolicyResolution = resolution;
    } else {
      throw new Error("Closed proposal is missing its review policy lock.");
    }
    if (auth.proposal.activeBuildId) {
      const existingBuild = await ctx.db.get(auth.proposal.activeBuildId);
      if (!existingBuild) {
        throw new Error("Proposal activation record is inconsistent.");
      }
      return { buildId: existingBuild._id };
    }
    const timezone = validateBuildTimezone(closing.ianaTimezone);
    const buildStartDate = closing.buildStartDate;
    const loanFacility = closing.loanFacility;
    const assignedBuilderProfileId = assignedBuilderProfileIdOrThrow(
      auth.proposal,
      "Activation requires an assigned builder.",
    );
    if (!auth.proposal.workflowRuleSnapshotId) {
      throw new Error("Closed proposal is missing workflow rule snapshot.");
    }

    const now = Date.now();
    const permit = await getPermitDocument(ctx, args.proposalId);
    const permitWaiver = await getPermitWaiver(ctx, args.proposalId);
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: auth.brokerage._id,
      borrowerStartingCashCents:
        auth.proposal.borrowerStartingCashCents ??
        auth.proposal.timelineStartingCashCents ??
        auth.proposal.borrowerWorkingCapitalLimitCents,
      buildName: auth.proposal.buildName,
      builderProfileId: assignedBuilderProfileId,
      createdAt: now,
      location: auth.proposal.location,
      locationLatitude: auth.proposal.locationLatitude,
      locationLongitude: auth.proposal.locationLongitude,
      locationPlaceId: auth.proposal.locationPlaceId,
      organizationId: auth.organizationId,
      permitDocumentId: permit?._id,
      permitWaiverId: permitWaiver?._id,
      proposalId: args.proposalId,
      ...(reviewPolicyLock
        ? {
            reviewPolicyLockEvidence: {
              activeLenderMemberCount:
                reviewPolicyLock.activeLenderMemberCount,
              eligibleLenderApproverCount:
                reviewPolicyLock.eligibleLenderApproverCount ??
                reviewPolicyLock.activeLenderMemberCount,
              eligibleLenderApproverCounts:
                reviewPolicyLock.eligibleLenderApproverCounts,
              assignmentId: reviewPolicyLock.assignmentId ?? null,
              lenderOrganizationId:
                reviewPolicyLock.lenderOrganizationId ?? null,
              lockedAt: reviewPolicyLock.lockedAt,
              lockedByWorkosUserId: reviewPolicyLock.lockedByWorkosUserId,
              policyVersionId: reviewPolicyLock.policyVersionId,
              proposalRevisionId: reviewPolicyLock.proposalRevisionId,
              proposalRevisionNumber: reviewPolicyLock.proposalRevisionNumber,
            },
            reviewPolicyLockId: reviewPolicyLock._id,
            reviewPolicySnapshot: reviewPolicyLock.policy,
          }
        : {
            legacyPolicyResolutionIssueId: legacyPolicyResolution!._id,
          }),
      startDate: buildStartDate,
      status:
        new Date(`${buildStartDate}T00:00:00Z`).getTime() > now
          ? "future_start"
          : "active",
      timezone,
      timelineMinimumCashReserveCents:
        auth.proposal.timelineMinimumCashReserveCents,
      timelineRangeMax: auth.proposal.timelineRangeMax,
      timelineRangeMin: PROPOSAL_TIMELINE_MIN_DAY,
      timelineStartingCashCents: auth.proposal.timelineStartingCashCents,
      totalBudgetCents: auth.proposal.totalBudgetCents,
      updatedAt: now,
      workflowRuleSnapshotId: auth.proposal.workflowRuleSnapshotId,
    });
    await ctx.db.insert("buildBrokerAssignments", {
      assignedBrokerWorkosUserId:
        auth.proposal.assignedBrokerWorkosUserId ??
        (await requireDefaultBrokerMember(ctx, auth.brokerage)).workosUserId,
      brokerageId: auth.brokerage._id,
      buildId,
      createdAt: now,
      organizationId: auth.organizationId,
      role: "primary",
    });
    await ctx.db.insert("loanFacilities", {
      brokerageId: auth.brokerage._id,
      buildId,
      createdAt: now,
      facilityKind: "construction",
      interestAnnualBps: loanFacility.interestAnnualBps,
      interestAccrualStartDate: buildStartDate,
      interestStartsOn: "funds_released",
      organizationId: auth.organizationId,
      paybackDate: addDaysIso(
        buildStartDate,
        auth.proposal.timelineRangeMax ?? 365,
      ),
      principalCents: loanFacility.principalCents,
      proposalId: args.proposalId,
      status: "active",
      updatedAt: now,
    });
    await ctx.db.insert("buildCapitalPlans", {
      borrowerCoPayBps: auth.proposal.borrowerCoPayBps,
      borrowerStartingCashCents:
        auth.proposal.borrowerStartingCashCents ??
        auth.proposal.timelineStartingCashCents ??
        auth.proposal.borrowerWorkingCapitalLimitCents,
      borrowerWorkingCapitalLimitCents:
        auth.proposal.borrowerStartingCashCents ??
        auth.proposal.timelineStartingCashCents ??
        auth.proposal.borrowerWorkingCapitalLimitCents,
      brokerageId: auth.brokerage._id,
      buildId,
      createdAt: now,
      lenderDrawPolicyLimitCents: auth.proposal.lenderDrawPolicyLimitCents,
      organizationId: auth.organizationId,
      proposalId: args.proposalId,
      source: "proposal_closing_copy",
      updatedAt: now,
      version: 1,
    });

    const milestoneIdByProposalMilestone = new Map<
      string,
      Id<"buildMilestones">
    >();
    const milestoneIdByKey = new Map<string, Id<"buildMilestones">>();
    const submilestoneIdByProposalSubmilestone = new Map<
      string,
      Id<"buildSubmilestones">
    >();
    const milestones = await collectByIndex(
      ctx,
      "proposalMilestones",
      "by_proposal",
      args.proposalId,
    );
    for (const milestone of milestones) {
      const buildMilestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId: auth.brokerage._id,
        budgetCents: milestone.budgetCents,
        buildId,
        completionClaim: milestone.completionClaim,
        completionReview: milestone.completionReview,
        createdAt: now,
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        dependencyKeys: milestone.dependencyKeys,
        drawAvailabilityCents: milestone.drawAvailabilityCents,
        durationDays: milestone.durationDays,
        evidenceState: milestone.evidenceState,
        key: milestone.key,
        name: milestone.name,
        order: milestone.order,
        organizationId: auth.organizationId,
        policyState: milestone.policyState,
        planningState: "active",
        proposalMilestoneId: milestone._id,
        siteVisitGuidance: milestone.siteVisitGuidance
          ? normalizeSiteVisitGuidance(milestone.siteVisitGuidance)
          : undefined,
        status:
          milestone.completionReview?.status === "approved"
            ? "complete"
            : "planned",
        workflowRevision: 0,
        updatedAt: now,
      });
      milestoneIdByProposalMilestone.set(milestone._id, buildMilestoneId);
      milestoneIdByKey.set(milestone.key, buildMilestoneId);
    }

    const submilestones = await collectByIndex(
      ctx,
      "proposalSubmilestones",
      "by_proposal",
      args.proposalId,
    );
    for (const submilestone of submilestones) {
      const buildMilestoneId = milestoneIdByProposalMilestone.get(
        submilestone.proposalMilestoneId,
      );
      if (!buildMilestoneId) {
        continue;
      }
      const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
        brokerageId: auth.brokerage._id,
        budgetCents: submilestone.budgetCents,
        buildId,
        buildMilestoneId,
        createdAt: now,
        durationDays: submilestone.durationDays,
        key: submilestone.key,
        milestoneKey: submilestone.milestoneKey,
        name: submilestone.name,
        order: submilestone.order,
        organizationId: auth.organizationId,
        proposalSubmilestoneId: submilestone._id,
        planningState: "active",
        startDay: submilestone.startDay,
        status: "planned",
        updatedAt: now,
      });
      await attachSubmilestoneScopeBuildLineage(ctx, {
        brokerageId: auth.brokerage._id,
        buildId,
        buildSubmilestoneId,
        organizationId: auth.organizationId,
        proposalId: args.proposalId,
        proposalSubmilestoneId: submilestone._id,
      });
      await attachSubmilestoneFieldGuidanceBuildLineage(ctx, {
        brokerageId: auth.brokerage._id,
        buildId,
        buildSubmilestoneId,
        organizationId: auth.organizationId,
        proposalId: args.proposalId,
        proposalSubmilestoneId: submilestone._id,
      });
      submilestoneIdByProposalSubmilestone.set(
        submilestone._id,
        buildSubmilestoneId,
      );
    }

    const draws = await collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      args.proposalId,
    );
    for (const draw of draws) {
      const buildMilestoneId = draw.proposalMilestoneId
        ? milestoneIdByProposalMilestone.get(draw.proposalMilestoneId)
        : undefined;
      await ctx.db.insert("plannedDrawScheduleRows", {
        amountCents: draw.amountCents,
        brokerageId: auth.brokerage._id,
        buildId,
        buildMilestoneId,
        createdAt: now,
        drawKey: draw.drawKey,
        label: draw.label,
        milestoneKey: draw.milestoneKey,
        order: draw.order,
        organizationId: auth.organizationId,
        proposalDrawScheduleRowId: draw._id,
        requestNote: draw.requestNote,
        requestReviewNote: draw.requestReviewNote,
        requestedAt: draw.requestedAt,
        reviewedAt: draw.reviewedAt,
        status: activeBuildDrawStatusFromProposal(draw.requestStatus),
        timingDay: draw.timingDay,
        updatedAt: now,
      });
    }
    const proposalContractors = await collectByIndex(
      ctx,
      "proposalContractorAssignments",
      "by_proposal",
      args.proposalId,
    );
    const buildContractorAssignmentByProposalAssignment = new Map<
      string,
      Id<"buildContractorAssignments">
    >();
    for (const assignment of proposalContractors) {
      if (assignment.status !== "active") {
        continue;
      }
      const contractor = (await ctx.db.get(
        assignment.contractorId,
      )) as Doc<"contractorProfiles"> | null;
      if (
        !contractor ||
        contractor.brokerageId !== auth.brokerage._id ||
        contractor.status !== "active"
      ) {
        continue;
      }
      const buildContractorAssignmentId = await ctx.db.insert(
        "buildContractorAssignments",
        {
          agreedRateCents:
            assignment.agreedRateCents ?? contractor.defaultPayRateCents,
          agreedRateUnit:
            assignment.agreedRateUnit ??
            contractor.defaultPayRateUnit ??
            "hour",
          brokerageId: auth.brokerage._id,
          buildId,
          contractorId: assignment.contractorId,
          createdAt: now,
          endDate: undefined,
          notes: assignment.notes,
          organizationId: auth.organizationId,
          role: assignment.role,
          startDate: buildStartDate,
          status: "active",
          updatedAt: now,
        },
      );
      buildContractorAssignmentByProposalAssignment.set(
        String(assignment._id),
        buildContractorAssignmentId,
      );
    }
    const proposalMilestoneContractors = await collectByIndex(
      ctx,
      "proposalMilestoneContractorAssignments",
      "by_proposal",
      args.proposalId,
    );
    for (const assignment of proposalMilestoneContractors) {
      if (assignment.status === "removed") {
        continue;
      }
      const buildMilestoneId =
        milestoneIdByProposalMilestone.get(
          String(assignment.proposalMilestoneId),
        ) ?? milestoneIdByKey.get(assignment.milestoneKey);
      if (!buildMilestoneId) {
        continue;
      }
      const buildContractorAssignmentId =
        buildContractorAssignmentByProposalAssignment.get(
          String(assignment.proposalContractorAssignmentId),
        );
      if (!buildContractorAssignmentId) {
        continue;
      }
      await ctx.db.insert("milestoneContractorAssignments", {
        actualCostCents: undefined,
        actualHours: undefined,
        agreedRateCents: assignment.agreedRateCents,
        agreedRateUnit: assignment.agreedRateUnit,
        assignedAt: now,
        assignedByWorkosUserId: assignment.assignedByWorkosUserId,
        brokerageId: auth.brokerage._id,
        buildContractorAssignmentId,
        buildId,
        buildMilestoneId,
        buildSubmilestoneId: assignment.proposalSubmilestoneId
          ? submilestoneIdByProposalSubmilestone.get(
              String(assignment.proposalSubmilestoneId),
            )
          : undefined,
        contractorId: assignment.contractorId,
        costNotes: assignment.note,
        createdAt: now,
        estimatedCostCents: assignment.estimatedCostCents,
        estimatedHours: assignment.estimatedHours,
        milestoneKey: assignment.milestoneKey,
        note: assignment.note,
        organizationId: auth.organizationId,
        postHoc: false,
        role: assignment.role,
        status:
          assignment.status === "completed"
            ? "completed"
            : new Date(`${buildStartDate}T00:00:00Z`).getTime() > now
              ? "planned"
              : "active",
        submilestoneKey: assignment.submilestoneKey,
        updatedAt: now,
      });
    }
    await copyProposalOperationalRowsToActiveBuild(ctx, {
      auth: {
        brokerage: auth.brokerage,
        roles: auth.roles,
        subject: auth.subject,
      },
      buildId,
      organizationId: auth.organizationId,
      proposalId: args.proposalId,
      now,
    });
    await copyProposalCapitalEventsToActiveBuild(ctx, {
      brokerageId: auth.brokerage._id,
      buildId,
      buildStartDate,
      now,
      organizationId: auth.organizationId,
      proposal: auth.proposal,
    });
    await ctx.db.insert("capitalEvents", {
      amountCents: 0,
      brokerageId: auth.brokerage._id,
      buildId,
      createdAt: now,
      eventDate: buildStartDate,
      eventType: "borrower_copay",
      label: "Capital plan opened at loan closing",
      organizationId: auth.organizationId,
    });

    await ctx.db.patch(args.proposalId, {
      activeBuildId: buildId,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "activateClosedProposal",
      eventType: "proposal.build_activated",
      newState: JSON.stringify({ buildId, status: "active" }),
      priorState: "closed",
      proposalId: args.proposalId,
      reason: args.reason,
    });
    const build = await ctx.db.get(buildId);
    if (build) {
      await ensureActiveBuildPlanningActivationRevision(ctx, {
        actor: {
          actorRoles: auth.roles,
          actorWorkosUserId: auth.subject,
        },
        build,
        now,
      });
      await ensureApprovedBuildSubmilestoneCompanions(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        build,
      });
      await scheduleCurrentMilestoneSystemPostActivations(ctx, { build, now });
      await writeActiveBuildEvent(ctx, {
        auth: {
          brokerage: auth.brokerage,
          proposal: auth.proposal,
          roles: auth.roles,
          subject: auth.subject,
        },
        build,
        command: "activateClosedProposal",
        eventType: "active_build.created",
        newState: JSON.stringify({ buildId, proposalId: args.proposalId }),
        reason: args.reason,
      });
    }
    return { buildId };
  })
  .public();

const legacyActiveBuildRepairResultValidator = v.object({
  buildId: v.id("activeBuilds"),
  operation: v.union(
    v.literal("created"),
    v.literal("relinked"),
    v.literal("already_repaired"),
  ),
  warnings: v.array(v.string()),
});

export const repairLegacyClosedProposalActiveBuild = authenticatedMutation
  .input({
    buildStartDate: v.string(),
    ianaTimezone: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(legacyActiveBuildRepairResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    return await repairLegacyClosedProposalActiveBuildAggregate(ctx, {
      auth,
      buildStartDate: args.buildStartDate,
      ianaTimezone: args.ianaTimezone,
      reason: args.reason,
    });
  })
  .public();

export const repairLegacyClosedProposalActiveBuildInternal = internalMutation
  .input({
    actorWorkosUserId: v.string(),
    buildStartDate: v.string(),
    ianaTimezone: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    warnings: v.optional(v.array(v.string())),
  })
  .returns(legacyActiveBuildRepairResultValidator)
  .handler(async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      throw new Error("Legacy repair proposal was not found.");
    }
    const brokerage = await ctx.db.get(proposal.brokerageId);
    if (!brokerage || brokerage.status !== "active") {
      throw new Error("Legacy repair requires an active brokerage.");
    }
    return await repairLegacyClosedProposalActiveBuildAggregate(ctx, {
      auth: {
        brokerage,
        proposal,
        roles: ["admin"],
        subject: args.actorWorkosUserId,
      },
      buildStartDate: args.buildStartDate,
      ianaTimezone: args.ianaTimezone,
      reason: args.reason,
      warnings: args.warnings,
    });
  })
  .internal();
