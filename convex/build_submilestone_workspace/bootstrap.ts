import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { AuthorizedViewer } from "../authz";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import { resolveSubmilestoneOperateAuthority } from "../build_submilestone_operate_authority";
import type { Doc, Id } from "../types";
import { buildCapabilities } from "./capabilities";
import {
  loadCanonicalPeopleHistoryEvents,
  resolveCanonicalBuildSubmilestoneWorkspaceContext,
  viewerCanReadContractorCandidates,
  viewerCanReadMaterialCosts,
  viewerCanReadPeopleIdentity,
} from "./context";
import { MAX_BOOTSTRAP_ROWS } from "./types";
import type { WorkspaceArgs } from "./types";

export async function loadWorkspaceBootstrap(
  ctx: { viewer: AuthorizedViewer } & import("../types").QueryCtx,
  args: WorkspaceArgs
) {

    const resolved = await resolveCanonicalBuildSubmilestoneWorkspaceContext(
      ctx,
      args
    );
    if (resolved.state !== "visible") {
      return resolved;
    }
    const { authorization, collaboration, companion, milestone, submilestone } =
      resolved;
    const superseded =
      submilestone.planningState === "superseded" ||
      companion?.canonicalPlanningState === "superseded" ||
      (companion?.canonicalCompanionDisposition !== undefined &&
        companion.canonicalCompanionDisposition !== "active");
    const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
      build: authorization.build,
      includeCompleted: true,
      milestone,
      submilestone,
    });
    const milestoneCompleted =
      milestone.status === "complete" ||
      milestone.completionClaim !== undefined;
    const [startAuthority, updateAuthority, reopenAuthority] =
      await Promise.all([
        resolveSubmilestoneOperateAuthority(ctx, {
          build: authorization.build,
          intent: "start",
          milestoneCompleted,
          ownership,
          submilestone,
          viewer: {
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
        }),
        resolveSubmilestoneOperateAuthority(ctx, {
          build: authorization.build,
          intent: "update",
          milestoneCompleted,
          ownership,
          submilestone,
          viewer: {
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
        }),
        resolveSubmilestoneOperateAuthority(ctx, {
          allowCompleted: true,
          build: authorization.build,
          intent: "update",
          milestoneCompleted,
          ownership,
          submilestone,
          viewer: {
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
        }),
      ]);
    const [
      requirements,
      packageRevision,
      packageItems,
      siblings,
      siteVisitRequirement,
      proposalSubmilestone,
      assignments,
      materialRows,
      peopleHistoryResult,
      candidateContractors,
    ] = await Promise.all([
      ctx.db
        .query("buildSubmilestoneEvidenceRequirements")
        .withIndex("by_submilestone", (query) =>
          query.eq("buildSubmilestoneId", submilestone._id).eq("active", true)
        )
        .take(MAX_BOOTSTRAP_ROWS + 1),
      submilestone.evidencePackageRevisionId
        ? ctx.db.get(submilestone.evidencePackageRevisionId)
        : null,
      submilestone.evidencePackageRevisionId
        ? ctx.db
            .query("buildSubmilestoneEvidencePackageItems")
            .withIndex("by_package_revision", (query) =>
              query.eq(
                "packageRevisionId",
                submilestone.evidencePackageRevisionId!
              )
            )
            .take(MAX_BOOTSTRAP_ROWS + 1)
        : [],
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query) =>
          query.eq("buildMilestoneId", milestone._id)
        )
        .take(MAX_BOOTSTRAP_ROWS + 1),
      submilestone.siteVisitRequirementId
        ? ctx.db.get(submilestone.siteVisitRequirementId)
        : null,
      ctx.db.get(submilestone.proposalSubmilestoneId),
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_submilestone", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("milestoneKey", milestone.key)
            .eq("submilestoneKey", submilestone.key)
        )
        .take(MAX_BOOTSTRAP_ROWS + 1),
      ctx.db
        .query("buildCostItems")
        .withIndex("by_build_milestone", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("milestoneKey", milestone.key)
        )
        .take(MAX_BOOTSTRAP_ROWS * 5 + 1),
      loadCanonicalPeopleHistoryEvents(ctx, {
        authorization,
        milestone,
        submilestone,
      }),
      viewerCanReadContractorCandidates(authorization)
        ? ctx.db
            .query("contractorProfiles")
            .withIndex("by_brokerage", (query) =>
              query.eq("brokerageId", authorization.brokerage._id)
            )
            // The profile table is brokerage-scoped, but the same brokerage
            // can serve multiple WorkOS organizations. Keep this bounded and
            // apply the organization/status checks below before exposing rows.
            .take(MAX_BOOTSTRAP_ROWS * 5 + 1)
        : Promise.resolve([]),
    ]);
    const peopleHistoryEvents = peopleHistoryResult.events;
    const materialsPartial = materialRows.length > MAX_BOOTSTRAP_ROWS * 5;
    const scopedSiblings = siblings.filter(
      (candidate) =>
        candidate.buildId === authorization.build._id &&
        candidate.organizationId === authorization.organizationId &&
        candidate.brokerageId === authorization.brokerage._id &&
        candidate.planningState !== "superseded"
    );
    const boundedSiblings = scopedSiblings.slice(0, MAX_BOOTSTRAP_ROWS);
    const approvedChildCount = boundedSiblings.filter(
      (candidate) => candidate.reviewDecisionState === "approved"
    ).length;
    const partial = siblings.length > MAX_BOOTSTRAP_ROWS;
    const scopeError = validateBootstrapProjectionScope({
      authorization,
      assignments,
      materialRows,
      milestone,
      packageItems,
      packageRevision,
      proposalSubmilestone,
      requirements,
      siteVisitRequirement,
      submilestone,
    });
    if (scopeError) {
      return scopeError;
    }
    const capabilities = buildCapabilities({
      authorization,
      collaboration,
      reopenAuthority,
      startAuthority,
      status: submilestone.status,
      actualStartedAt: submilestone.actualStartedAt,
      evidencePackageStatus: packageRevision?.status,
      evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
      reviewDecisionState: submilestone.reviewDecisionState ?? "in_review",
      siteVisitRequirement: siteVisitRequirement
        ? {
            required: siteVisitRequirement.required,
            status: siteVisitRequirement.status,
          }
        : undefined,
      superseded,
      updateAuthority,
    });
    const canReadPeopleIdentity = viewerCanReadPeopleIdentity(authorization);
    const canReadMaterialCosts = viewerCanReadMaterialCosts(authorization);
    const availableContractors = candidateContractors
      .filter(
        (candidate) =>
          candidate.organizationId === authorization.organizationId &&
          candidate.brokerageId === authorization.brokerage._id &&
          candidate.status === "active"
      )
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          String(left._id).localeCompare(String(right._id))
      )
      .slice(0, MAX_BOOTSTRAP_ROWS)
      .map((candidate) => ({
        _id: candidate._id,
        ...(candidate.city ? { city: candidate.city } : {}),
        ...(candidate.defaultPayRateCents !== undefined
          ? { defaultPayRateCents: candidate.defaultPayRateCents }
          : {}),
        ...(candidate.defaultPayRateUnit
          ? { defaultPayRateUnit: candidate.defaultPayRateUnit }
          : {}),
        ...(candidate.email ? { email: candidate.email } : {}),
        name: candidate.name,
        onboardingStatus:
          candidate.onboardingStatus ??
          (candidate.accountWorkosUserId ? "account_linked" : "profile_only"),
        trades: candidate.trades,
      }));
    const participantRows = authorization.participants
      .slice(0, MAX_BOOTSTRAP_ROWS)
      .map((participant) => ({
        displayName: canReadPeopleIdentity
          ? participant.displayName
          : "Participant redacted",
        participationPeriod: participant.participationPeriod,
        redacted: !canReadPeopleIdentity,
        role: participant.role,
        source: participant.source,
        ...(canReadPeopleIdentity
          ? { workosUserId: participant.workosUserId }
          : {}),
      }));
    return {
      build: {
        buildId: authorization.build._id,
        buildName: authorization.build.buildName,
        location: authorization.build.location,
        startDate: authorization.build.startDate,
        status: authorization.build.status,
      },
      capabilities,
      collaboration,
      ...(companion
        ? {
            companion: {
              actionItemId: companion._id,
              canonicalBindingRevision: companion.canonicalBindingRevision,
              currentRevision: companion.currentRevision,
              originatingPostId: companion.originatingPostId,
              requestedActionItemId: args.companionActionItemId,
            },
          }
        : {}),
      evidence: {
        evidencePackageRevision: packageRevision?.revision,
        evidencePackageStatus: packageRevision?.status,
        evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
        itemCount: Math.min(packageItems.length, MAX_BOOTSTRAP_ROWS),
        partial:
          requirements.length > MAX_BOOTSTRAP_ROWS ||
          packageItems.length > MAX_BOOTSTRAP_ROWS,
        requirementCount: Math.min(requirements.length, MAX_BOOTSTRAP_ROWS),
        requirements: requirements
          .slice(0, MAX_BOOTSTRAP_ROWS)
          .map((record) => ({
            ...(record.description ? { description: record.description } : {}),
            kind: record.kind,
            label: record.label,
            locationRequired: record.locationRequired,
            required: record.required,
            requirementKey: record.requirementKey,
            status: record.active ? "active" : "inactive",
          })),
      },
      execution: {
        actualCostCents: submilestone.actualCostCents,
        actualCompletedAt: submilestone.completedAt,
        actualStartedAt: submilestone.actualStartedAt,
        completionForecastDate: submilestone.completionForecastDate,
        fieldNote: submilestone.fieldNote,
        progressPercent: submilestone.progressPercent ?? 0,
      },
      milestone: {
        buildMilestoneId: milestone._id,
        drawAvailabilityCents: milestone.drawAvailabilityCents,
        key: milestone.key,
        name: milestone.name,
        planningState: milestone.planningState ?? "active",
        status: milestone.status,
      },
      overview: {
        actualCostCents: submilestone.actualCostCents,
        actualCompletedAt: submilestone.completedAt,
        actualStartedAt: submilestone.actualStartedAt,
        budgetCents: submilestone.budgetCents,
        executionOwnership: {
          ...(canReadPeopleIdentity && ownership.contractor?._id
            ? { contractorId: ownership.contractor._id }
            : {}),
          ...(canReadPeopleIdentity && ownership.contractor?.name
            ? { contractorName: ownership.contractor.name }
            : {}),
          reason: ownership.reason,
          state: ownership.state,
        },
        fieldNote: submilestone.fieldNote,
        forecastDate: submilestone.completionForecastDate,
        plannedDurationDays:
          submilestone.durationDays ?? proposalSubmilestone?.durationDays,
        plannedStartDay:
          submilestone.startDay ?? proposalSubmilestone?.startDay,
        progressPercent: submilestone.progressPercent ?? 0,
        status: submilestone.status,
      },
      people: {
        assigned: assignments.filter((row) => row.status !== "removed").length,
        assignmentRequired: ownership.state === "assignment_required",
        availableContractors,
        historyCount: peopleHistoryEvents.length,
        historyPartial: peopleHistoryResult.partial,
        participants: participantRows,
        participantsPartial:
          authorization.participants.length > MAX_BOOTSTRAP_ROWS,
        participantCount: authorization.participants.length,
      },
      materials: {
        partial: materialsPartial,
        ...(!materialsPartial
          ? {
              equipmentCount: materialRows.filter(
                (row) =>
                  row.itemType === "equipment" &&
                  (row.budgetSubmilestoneKey === submilestone.key ||
                    row.relevantSubmilestoneKeys.includes(submilestone.key))
              ).length,
              materialCount: materialRows.filter(
                (row) =>
                  row.itemType === "material" &&
                  (row.budgetSubmilestoneKey === submilestone.key ||
                    row.relevantSubmilestoneKeys.includes(submilestone.key))
              ).length,
              ...(canReadMaterialCosts
                ? {
                    totalBudgetCents: materialRows
                      .filter(
                        (row) =>
                          row.budgetSubmilestoneKey === submilestone.key ||
                          row.relevantSubmilestoneKeys.includes(
                            submilestone.key
                          )
                      )
                      .reduce(
                        (sum, row) => sum + row.costCents * row.quantity,
                        0
                      ),
                  }
                : {}),
            }
          : {}),
      },
      ownership: { reason: ownership.reason, state: ownership.state },
      parentReadiness: {
        approvedChildCount,
        childCount: Math.min(scopedSiblings.length, MAX_BOOTSTRAP_ROWS),
        partial,
        readyForApproval:
          !partial &&
          scopedSiblings.length > 0 &&
          approvedChildCount === scopedSiblings.length,
      },
      persona: authorization.effectiveRole.role,
      review: {
        evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
        reviewDecisionState: submilestone.reviewDecisionState ?? "in_review",
        reviewRound: submilestone.evidenceReviewRound ?? 0,
        siteVisitRequirementStatus: siteVisitRequirement?.status,
      },
      revisions: {
        canonicalWorkflowRevision: submilestone.workflowRevision ?? 0,
        ...(companion ? { companionRevision: companion.currentRevision } : {}),
        evidencePackageRevision: packageRevision?.revision,
        parentReviewRevision: milestone.reviewRevision ?? 0,
        reviewRevision: submilestone.reviewRevision ?? 0,
      },
      schedule: {
        durationDays: submilestone.durationDays,
        parentDayEnd: milestone.dayEnd,
        parentDayStart: milestone.dayStart,
        startDay: submilestone.startDay,
      },
      state: superseded ? ("superseded" as const) : ("visible" as const),
      submilestone: {
        buildSubmilestoneId: submilestone._id,
        key: submilestone.key,
        name: submilestone.name,
        planningState: submilestone.planningState ?? "active",
        proposalSubmilestoneId: submilestone.proposalSubmilestoneId,
        status: submilestone.status,
        supersededAt: submilestone.supersededAt,
      },
    };
}

function integrityError(code: string, message: string) {
  return { code, message, state: "integrity_error" as const };
}

function validateBootstrapProjectionScope(input: {
  authorization: ActiveBuildAuthorization;
  milestone: Doc<"buildMilestones">;
  packageItems: Doc<"buildSubmilestoneEvidencePackageItems">[];
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions"> | null;
  proposalSubmilestone: Doc<"proposalSubmilestones"> | null;
  assignments: Doc<"milestoneContractorAssignments">[];
  materialRows: Doc<"buildCostItems">[];
  requirements: Doc<"buildSubmilestoneEvidenceRequirements">[];
  siteVisitRequirement: Doc<"buildSubmilestoneSiteVisitRequirements"> | null;
  submilestone: Doc<"buildSubmilestones">;
}) {
  const inScope = (record: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    buildMilestoneId: Id<"buildMilestones">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    organizationId: string;
  }) =>
    record.buildId === input.authorization.build._id &&
    record.organizationId === input.authorization.organizationId &&
    record.brokerageId === input.authorization.brokerage._id &&
    record.buildMilestoneId === input.milestone._id &&
    record.buildSubmilestoneId === input.submilestone._id;
  if (
    input.proposalSubmilestone === null ||
    (input.submilestone.evidencePackageRevisionId !== undefined &&
      input.packageRevision === null) ||
    (input.packageRevision &&
      input.packageRevision._id !==
        input.submilestone.evidencePackageRevisionId) ||
    (input.submilestone.siteVisitRequirementId !== undefined &&
      input.siteVisitRequirement === null) ||
    (input.siteVisitRequirement &&
      input.siteVisitRequirement._id !==
        input.submilestone.siteVisitRequirementId) ||
    (input.packageRevision && !inScope(input.packageRevision)) ||
    (input.siteVisitRequirement && !inScope(input.siteVisitRequirement)) ||
    input.requirements.some((record) => !inScope(record)) ||
    input.packageItems.some(
      (record) =>
        !inScope(record) ||
        record.packageRevisionId !== input.packageRevision?._id
    ) ||
    (input.proposalSubmilestone !== null &&
      (input.proposalSubmilestone.organizationId !==
        input.authorization.organizationId ||
        input.proposalSubmilestone.brokerageId !==
          input.authorization.brokerage._id ||
        input.proposalSubmilestone.proposalId !==
          input.authorization.proposal._id ||
        input.proposalSubmilestone.proposalMilestoneId !==
          input.milestone.proposalMilestoneId ||
        input.proposalSubmilestone.key !== input.submilestone.key)) ||
    input.assignments.some(
      (record) =>
        !(
          record.buildId === input.authorization.build._id &&
          record.organizationId === input.authorization.organizationId &&
          record.brokerageId === input.authorization.brokerage._id
        ) ||
        record.buildMilestoneId !== input.milestone._id ||
        record.buildSubmilestoneId !== input.submilestone._id ||
        record.milestoneKey !== input.milestone.key ||
        record.submilestoneKey !== input.submilestone.key
    ) ||
    input.materialRows
      .filter(
        (record) =>
          record.budgetSubmilestoneKey === input.submilestone.key ||
          record.relevantSubmilestoneKeys.includes(input.submilestone.key)
      )
      .some(
        (record) =>
          !(
            record.buildId === input.authorization.build._id &&
            record.organizationId === input.authorization.organizationId &&
            record.brokerageId === input.authorization.brokerage._id
          ) ||
          record.buildMilestoneId !== input.milestone._id ||
          !(
            record.budgetSubmilestoneKey === input.submilestone.key ||
            record.relevantSubmilestoneKeys.includes(input.submilestone.key)
          )
      )
  ) {
    return integrityError(
      "CANONICAL_PROJECTION_SCOPE_INVALID",
      "A canonical Sub-milestone projection is outside the authorized Build scope."
    );
  }
  return null;
}
