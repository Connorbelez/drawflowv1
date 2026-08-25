/**
 * Production proposals legacy seed bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { requireDefaultBrokerMember } from "../brokerAssignments";
import { scheduleCurrentMilestoneSystemPostActivations } from "../build_collaboration_scheduling";
import { validateBuildTimezone } from "../build_collaboration_system_posts";
import { ensureActiveBuildPlanningActivationRevision } from "../build_collaboration_planning_reconciliation";
import { normalizeSiteVisitGuidance } from "../demo_site_visit_guidance";
import { attachSubmilestoneFieldGuidanceBuildLineage } from "../submilestone_field_guidance";
import { attachSubmilestoneScopeBuildLineage } from "../submilestone_scope_contracts";
import { type Doc, type Id, type MutationCtx } from "../types";
import { addDaysIso } from "./active_capital_evidence.js";
import { assignedBuilderProfileIdOrThrow } from "./authorization_core.js";
import { normalizeIsoDateOnly } from "./contractor_policy_helpers.js";
import { PROPOSAL_TIMELINE_MIN_DAY } from "./contracts_foundation.js";
import { resolveBorrowerStartingCashCents } from "./directory_cards.js";
import { upsertKanbanCard, writeProposalEvent, writeActiveBuildEvent, copyProposalOperationalRowsToActiveBuild, copyProposalCapitalEventsToActiveBuild, activeBuildDrawStatusFromProposal } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import { requirePhase3BackofficeRole, ensureDefaultProposalReviewPolicyVersion, createImmutableProposalRevision } from "./review_lifecycle_helpers.js";
import { getPermitDocument, getPermitWaiver, collectByIndex } from "./storage_helpers.js";

const LEGACY_ACTIVE_BUILD_LOAN_WARNING =
  "loan_facility_not_reconstructed_missing_authoritative_terms";

export async function repairLegacyClosedProposalActiveBuildAggregate(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    buildStartDate: string;
    ianaTimezone?: string;
    reason: string;
    warnings?: string[];
  },
) {
  requireReason(input.reason);
  const buildStartDate = normalizeIsoDateOnly(
    input.buildStartDate,
    "Legacy Active Build start date",
  );
  const timezone =
    input.ianaTimezone === undefined
      ? undefined
      : validateBuildTimezone(input.ianaTimezone);
  const { brokerage, proposal } = input.auth;
  if (proposal.status !== "closed") {
    throw new Error("Legacy Active Build repair requires a closed proposal.");
  }
  if (
    proposal.brokerageId !== brokerage._id ||
    proposal.organizationId !== brokerage.workosOrganizationId
  ) {
    throw new Error("Legacy Active Build repair scope does not match.");
  }

  const validateExistingBuild = (build: Doc<"activeBuilds">) => {
    if (
      build.proposalId !== proposal._id ||
      build.brokerageId !== brokerage._id ||
      build.organizationId !== proposal.organizationId
    ) {
      throw new Error("Legacy Active Build repair found a cross-scope build.");
    }
  };
  const warningsForBuild = async (buildId: Id<"activeBuilds">) => {
    const loan = await ctx.db
      .query("loanFacilities")
      .withIndex("by_build", (q) => q.eq("buildId", buildId))
      .first();
    return loan ? [] : [LEGACY_ACTIVE_BUILD_LOAN_WARNING];
  };

  if (proposal.activeBuildId) {
    const linkedBuild = await ctx.db.get(proposal.activeBuildId);
    if (!linkedBuild) {
      throw new Error("Legacy proposal references a missing Active Build.");
    }
    validateExistingBuild(linkedBuild);
    if (timezone !== undefined) {
      await ctx.db.patch(linkedBuild._id, {
        timezone,
        updatedAt: Date.now(),
      });
      const repairedBuild = await ctx.db.get(linkedBuild._id);
      if (repairedBuild) {
        await scheduleCurrentMilestoneSystemPostActivations(ctx, {
          build: repairedBuild,
        });
      }
    }
    return {
      buildId: linkedBuild._id,
      operation: "already_repaired" as const,
      warnings: await warningsForBuild(linkedBuild._id),
    };
  }

  const existingBuilds = await ctx.db
    .query("activeBuilds")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
    .take(2);
  if (existingBuilds.length > 1) {
    throw new Error("Legacy proposal has multiple Active Build records.");
  }
  const existingBuild = existingBuilds[0];
  if (existingBuild) {
    validateExistingBuild(existingBuild);
    const now = Date.now();
    let repairedBuild = existingBuild;
    if (timezone !== undefined) {
      await ctx.db.patch(existingBuild._id, {
        timezone,
        updatedAt: now,
      });
      repairedBuild = (await ctx.db.get(existingBuild._id)) ?? existingBuild;
      await scheduleCurrentMilestoneSystemPostActivations(ctx, {
        build: repairedBuild,
      });
    }
    const warnings = await warningsForBuild(existingBuild._id);
    await ctx.db.patch(proposal._id, {
      activeBuildId: existingBuild._id,
      updatedAt: now,
      updatedByWorkosUserId: input.auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth: input.auth,
      command: "repairLegacyClosedProposalActiveBuild",
      eventType: "proposal.active_build.relinked",
      newState: JSON.stringify({ activeBuildId: existingBuild._id }),
      priorState: JSON.stringify({ activeBuildId: null, status: "closed" }),
      proposalId: proposal._id,
      reason: input.reason,
      warnings,
    });
    await writeActiveBuildEvent(ctx, {
      auth: { ...input.auth, proposal },
      build: repairedBuild,
      command: "repairLegacyClosedProposalActiveBuild",
      eventType: "active_build.relinked_to_legacy_proposal",
      newState: JSON.stringify({ proposalId: proposal._id }),
      reason: input.reason,
      warnings,
    });
    return {
      buildId: existingBuild._id,
      operation: "relinked" as const,
      warnings,
    };
  }

  const warnings = [
    ...new Set([
      LEGACY_ACTIVE_BUILD_LOAN_WARNING,
      ...(input.warnings ?? [])
        .map((warning) => warning.trim())
        .filter(Boolean),
    ]),
  ];
  const buildId = await seedCloseProposal(ctx, {
    activeBuildEventType: "active_build.created_from_legacy_proposal",
    auth: input.auth,
    buildStartDate,
    ianaTimezone: timezone,
    command: "repairLegacyClosedProposalActiveBuild",
    now: Date.now(),
    organizationId: proposal.organizationId,
    proposalEventType: "proposal.active_build.repaired",
    proposalId: proposal._id,
    proposalNewState: JSON.stringify({
      activeBuildMaterialized: true,
      loanFacilityCreated: false,
      status: "closed",
    }),
    reason: input.reason,
    warnings,
  });
  return { buildId, operation: "created" as const, warnings };
}

async function copyProposalContractorsToActiveBuild(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    buildId: Id<"activeBuilds">;
    buildMilestoneIds: Map<string, Id<"buildMilestones">>;
    buildStartDate: string;
    buildSubmilestoneIds: Map<string, Id<"buildSubmilestones">>;
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  },
) {
  const proposalContractors = await collectByIndex(
    ctx,
    "proposalContractorAssignments",
    "by_proposal",
    input.proposalId,
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
      contractor.brokerageId !== input.auth.brokerage._id ||
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
          assignment.agreedRateUnit ?? contractor.defaultPayRateUnit ?? "hour",
        brokerageId: input.auth.brokerage._id,
        buildId: input.buildId,
        contractorId: assignment.contractorId,
        createdAt: input.now,
        endDate: undefined,
        notes: assignment.notes,
        organizationId: input.organizationId,
        role: assignment.role,
        startDate: input.buildStartDate,
        status: "active",
        updatedAt: input.now,
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
    input.proposalId,
  );
  for (const assignment of proposalMilestoneContractors) {
    if (assignment.status === "removed") {
      continue;
    }
    const buildMilestoneId = input.buildMilestoneIds.get(
      String(assignment.proposalMilestoneId),
    );
    const buildContractorAssignmentId =
      buildContractorAssignmentByProposalAssignment.get(
        String(assignment.proposalContractorAssignmentId),
      );
    if (!(buildMilestoneId && buildContractorAssignmentId)) {
      continue;
    }
    await ctx.db.insert("milestoneContractorAssignments", {
      actualCostCents: undefined,
      actualHours: undefined,
      agreedRateCents: assignment.agreedRateCents,
      agreedRateUnit: assignment.agreedRateUnit,
      assignedAt: input.now,
      assignedByWorkosUserId: assignment.assignedByWorkosUserId,
      brokerageId: input.auth.brokerage._id,
      buildContractorAssignmentId,
      buildId: input.buildId,
      buildMilestoneId,
      buildSubmilestoneId: assignment.proposalSubmilestoneId
        ? input.buildSubmilestoneIds.get(
            String(assignment.proposalSubmilestoneId),
          )
        : undefined,
      contractorId: assignment.contractorId,
      costNotes: assignment.note,
      createdAt: input.now,
      estimatedCostCents: assignment.estimatedCostCents,
      estimatedHours: assignment.estimatedHours,
      milestoneKey: assignment.milestoneKey,
      note: assignment.note,
      organizationId: input.organizationId,
      postHoc: false,
      role: assignment.role,
      status:
        assignment.status === "completed"
          ? "completed"
          : new Date(`${input.buildStartDate}T00:00:00Z`).getTime() > input.now
            ? "planned"
            : "active",
      submilestoneKey: assignment.submilestoneKey,
      updatedAt: input.now,
    });
  }
}

export async function seedCloseProposal(
  ctx: MutationCtx,
  input: {
    activeBuildEventType?: string;
    activeBuildNewState?: string;
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    buildStartDate: string;
    ianaTimezone?: string;
    command?: string;
    loanFacility?: { interestAnnualBps: number; principalCents: number };
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
    proposalEventType?: string;
    proposalNewState?: string;
    reason?: string;
    warnings?: string[];
  },
) {
  const proposal = await ctx.db.get(input.proposalId);
  if (!proposal?.workflowRuleSnapshotId) {
    throw new Error("Seeded proposal is missing workflow rule snapshot.");
  }
  let reviewPolicyLock = proposal.lockedReviewPolicyId
    ? await ctx.db.get(proposal.lockedReviewPolicyId)
    : null;
  if (!reviewPolicyLock && proposal.status === "approved") {
    if (!proposal.backOfficeApprovedByWorkosUserId) {
      await ctx.db.patch(proposal._id, {
        backOfficeApprovedByWorkosUserId: input.auth.subject,
      });
    }
    const approvedProposal = await ctx.db.get(proposal._id);
    if (!approvedProposal) {
      throw new Error("Seeded proposal is unavailable before policy lock.");
    }
    const policyVersion = await ensureDefaultProposalReviewPolicyVersion(ctx, {
      auth: { ...input.auth, proposal: approvedProposal },
      now: input.now,
    });
    const revisionProposal = await ctx.db.get(proposal._id);
    if (!revisionProposal) {
      throw new Error("Seeded proposal is unavailable before revision.");
    }
    const revision = await createImmutableProposalRevision(ctx, {
      assignment: null,
      auth: { ...input.auth, proposal: revisionProposal },
      idempotencyKey: "system:seed-review-policy-revision",
      policyVersion,
      reason: "Create the canonical review-policy revision for seeded closing.",
    });
    const reviewPolicyLockId = await ctx.db.insert(
      "proposalReviewPolicyLocks",
      {
        activeLenderMemberCount: 0,
        brokerageId: input.auth.brokerage._id,
        eligibleLenderApproverCount: 0,
        eligibleLenderApproverCounts: {
          draw: 0,
          milestone: 0,
          proposalReview: 0,
        },
        idempotencyKey: "system:seed-review-policy-lock",
        lockedAt: input.now,
        lockedByRole: requirePhase3BackofficeRole(input.auth),
        lockedByWorkosUserId: input.auth.subject,
        organizationId: input.organizationId,
        policy: policyVersion.policy,
        policyVersionId: policyVersion._id,
        proposalId: proposal._id,
        proposalRevisionId: revision._id,
        proposalRevisionNumber: revision.revisionNumber,
        reason: "Lock the canonical review policy for seeded closing.",
      },
    );
    await ctx.db.patch(proposal._id, {
      lockedReviewPolicyId: reviewPolicyLockId,
    });
    reviewPolicyLock = await ctx.db.get(reviewPolicyLockId);
  }
  const permit = await getPermitDocument(ctx, input.proposalId);
  const permitWaiver = await getPermitWaiver(ctx, input.proposalId);
  const assignedBuilderProfileId = assignedBuilderProfileIdOrThrow(proposal);
  const timezone =
    input.ianaTimezone === undefined
      ? undefined
      : validateBuildTimezone(input.ianaTimezone);
  const buildId = await ctx.db.insert("activeBuilds", {
    brokerageId: input.auth.brokerage._id,
    borrowerStartingCashCents: resolveBorrowerStartingCashCents(proposal),
    buildName: proposal.buildName,
    builderProfileId: assignedBuilderProfileId,
    createdAt: input.now,
    location: proposal.location,
    locationLatitude: proposal.locationLatitude,
    locationLongitude: proposal.locationLongitude,
    locationPlaceId: proposal.locationPlaceId,
    organizationId: input.organizationId,
    permitDocumentId: permit?._id,
    permitWaiverId: permitWaiver?._id,
    proposalId: input.proposalId,
    ...(reviewPolicyLock
      ? {
          reviewPolicyLockId: reviewPolicyLock._id,
          reviewPolicySnapshot: reviewPolicyLock.policy,
        }
      : {}),
    startDate: input.buildStartDate,
    status:
      new Date(`${input.buildStartDate}T00:00:00Z`).getTime() > input.now
        ? "future_start"
        : "active",
    ...(timezone ? { timezone } : {}),
    timelineMinimumCashReserveCents: proposal.timelineMinimumCashReserveCents,
    timelineRangeMax: proposal.timelineRangeMax,
    timelineRangeMin: PROPOSAL_TIMELINE_MIN_DAY,
    timelineStartingCashCents: proposal.timelineStartingCashCents,
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: input.now,
    workflowRuleSnapshotId: proposal.workflowRuleSnapshotId,
  });
  await ctx.db.insert("buildBrokerAssignments", {
    assignedBrokerWorkosUserId:
      proposal.assignedBrokerWorkosUserId ??
      (await requireDefaultBrokerMember(ctx, input.auth.brokerage))
        .workosUserId,
    brokerageId: input.auth.brokerage._id,
    buildId,
    createdAt: input.now,
    organizationId: input.organizationId,
    role: "primary",
  });
  if (input.loanFacility) {
    await ctx.db.insert("loanFacilities", {
      brokerageId: input.auth.brokerage._id,
      buildId,
      createdAt: input.now,
      facilityKind: "construction",
      interestAnnualBps: input.loanFacility.interestAnnualBps,
      interestAccrualStartDate: input.buildStartDate,
      interestStartsOn: "funds_released",
      organizationId: input.organizationId,
      paybackDate: addDaysIso(
        input.buildStartDate,
        proposal.timelineRangeMax ?? 365,
      ),
      principalCents: input.loanFacility.principalCents,
      proposalId: input.proposalId,
      status: "active",
      updatedAt: input.now,
    });
  }
  await ctx.db.insert("buildCapitalPlans", {
    borrowerCoPayBps: proposal.borrowerCoPayBps,
    borrowerStartingCashCents: resolveBorrowerStartingCashCents(proposal),
    borrowerWorkingCapitalLimitCents:
      resolveBorrowerStartingCashCents(proposal),
    brokerageId: input.auth.brokerage._id,
    buildId,
    createdAt: input.now,
    lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    source: "proposal_closing_copy",
    updatedAt: input.now,
    version: 1,
  });

  const buildMilestoneIds = new Map<string, Id<"buildMilestones">>();
  const buildSubmilestoneIds = new Map<string, Id<"buildSubmilestones">>();
  const milestones = await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    input.proposalId,
  );
  for (const milestone of milestones) {
    const buildMilestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId: input.auth.brokerage._id,
      budgetCents: milestone.budgetCents,
      buildId,
      completionClaim: milestone.completionClaim,
      completionReview: milestone.completionReview,
      createdAt: input.now,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents: milestone.drawAvailabilityCents,
      durationDays: milestone.durationDays,
      evidenceState: milestone.evidenceState,
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      organizationId: input.organizationId,
      policyState: milestone.policyState,
      proposalMilestoneId: milestone._id,
      siteVisitGuidance: milestone.siteVisitGuidance
        ? normalizeSiteVisitGuidance(milestone.siteVisitGuidance)
        : undefined,
      status:
        milestone.completionReview?.status === "approved"
          ? "complete"
          : "planned",
      workflowRevision: 0,
      updatedAt: input.now,
    });
    buildMilestoneIds.set(milestone._id, buildMilestoneId);
  }

  const submilestones = await collectByIndex(
    ctx,
    "proposalSubmilestones",
    "by_proposal",
    input.proposalId,
  );
  for (const submilestone of submilestones) {
    const buildMilestoneId = buildMilestoneIds.get(
      submilestone.proposalMilestoneId,
    );
    if (!buildMilestoneId) {
      continue;
    }
    const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId: input.auth.brokerage._id,
      budgetCents: submilestone.budgetCents,
      buildId,
      buildMilestoneId,
      createdAt: input.now,
      durationDays: submilestone.durationDays,
      key: submilestone.key,
      milestoneKey: submilestone.milestoneKey,
      name: submilestone.name,
      order: submilestone.order,
      organizationId: input.organizationId,
      proposalSubmilestoneId: submilestone._id,
      startDay: submilestone.startDay,
      status: "planned",
      updatedAt: input.now,
    });
    await attachSubmilestoneScopeBuildLineage(ctx, {
      brokerageId: input.auth.brokerage._id,
      buildId,
      buildSubmilestoneId,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: submilestone._id,
    });
    await attachSubmilestoneFieldGuidanceBuildLineage(ctx, {
      brokerageId: input.auth.brokerage._id,
      buildId,
      buildSubmilestoneId,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: submilestone._id,
    });
    buildSubmilestoneIds.set(submilestone._id, buildSubmilestoneId);
  }

  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    input.proposalId,
  );
  for (const draw of draws) {
    await ctx.db.insert("plannedDrawScheduleRows", {
      amountCents: draw.amountCents,
      brokerageId: input.auth.brokerage._id,
      buildId,
      buildMilestoneId: draw.proposalMilestoneId
        ? buildMilestoneIds.get(draw.proposalMilestoneId)
        : undefined,
      createdAt: input.now,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: draw.order,
      organizationId: input.organizationId,
      proposalDrawScheduleRowId: draw._id,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestedAt: draw.requestedAt,
      reviewedAt: draw.reviewedAt,
      status: activeBuildDrawStatusFromProposal(draw.requestStatus),
      timingDay: draw.timingDay,
      updatedAt: input.now,
    });
  }
  await copyProposalContractorsToActiveBuild(ctx, {
    auth: input.auth,
    buildId,
    buildMilestoneIds,
    buildStartDate: input.buildStartDate,
    buildSubmilestoneIds,
    now: input.now,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
  });
  await copyProposalOperationalRowsToActiveBuild(ctx, {
    auth: input.auth,
    buildId,
    now: input.now,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
  });
  await copyProposalCapitalEventsToActiveBuild(ctx, {
    brokerageId: input.auth.brokerage._id,
    buildId,
    buildStartDate: input.buildStartDate,
    now: input.now,
    organizationId: input.organizationId,
    proposal,
  });
  await ctx.db.insert("capitalEvents", {
    amountCents: 0,
    brokerageId: input.auth.brokerage._id,
    buildId,
    createdAt: input.now,
    eventDate: input.buildStartDate,
    eventType: "borrower_copay",
    label: "Capital plan opened at loan closing",
    organizationId: input.organizationId,
  });
  await ctx.db.patch(input.proposalId, {
    activeBuildId: buildId,
    closedAt: proposal.closedAt ?? input.now,
    status: "closed",
    updatedAt: input.now,
    updatedByWorkosUserId: input.auth.subject,
  });
  await upsertKanbanCard(ctx, input.proposalId, input.now);
  await writeProposalEvent(ctx, {
    auth: input.auth,
    command: input.command ?? "dev_seedProductionProposalScenarios",
    eventType: input.proposalEventType ?? "proposal.closed",
    newState: input.proposalNewState ?? "closed",
    priorState: proposal.status,
    proposalId: input.proposalId,
    reason: input.reason ?? "Seeded offline loan closing.",
    warnings: input.warnings,
  });
  const build = await ctx.db.get(buildId);
  if (build) {
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: {
        actorRoles: input.auth.roles,
        actorWorkosUserId: input.auth.subject,
      },
      build,
      now: input.now,
    });
    await scheduleCurrentMilestoneSystemPostActivations(ctx, {
      build,
      now: input.now,
    });
    await writeActiveBuildEvent(ctx, {
      auth: {
        brokerage: input.auth.brokerage,
        proposal,
        roles: input.auth.roles,
        subject: input.auth.subject,
      },
      build,
      command: input.command ?? "dev_seedProductionProposalScenarios",
      eventType: input.activeBuildEventType ?? "active_build.created",
      newState:
        input.activeBuildNewState ??
        JSON.stringify({ buildId, proposalId: input.proposalId }),
      reason: input.reason ?? "Seeded offline loan closing.",
      warnings: input.warnings,
    });
  }
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: input.now,
    eventType: "active_build.created",
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify({
      buildId,
      proposalId: input.proposalId,
      startDate: input.buildStartDate,
    }),
    relatedEntityId: buildId,
    relatedEntityType: "activeBuild",
    status: "pending",
  });
  return buildId;
}

export async function ensureSeedContractorProfile(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
  },
) {
  const existing = (
    await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", input.brokerageId))
      .collect()
  ).find((contractor) => contractor.name === "Seed Scenario Contractor LLC");
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("contractorProfiles", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    email: "seed.contractor@example.com",
    name: "Seed Scenario Contractor LLC",
    organizationId: input.organizationId,
    phone: "555-0100",
    status: "active",
    trades: ["foundation", "framing"],
    updatedAt: input.now,
  });
}

export function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export const AUDIT_FIELD_PRIORITY = [
  "status",
  "name",
  "label",
  "title",
  "amountCents",
  "requestedAmountCents",
  "approvedAmountCents",
  "principalCents",
  "interestAnnualBps",
  "progressPercent",
  "forecastStartDate",
  "forecastEndDate",
  "paybackDate",
  "locationVerified",
  "note",
];
