/**
 * Production proposals contractor relationship helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { assertProposalCollaborationEditAllowed } from "../proposal_collaboration_model";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { requireProposalAppPermission, getOwnedBuilderProfile, getOwnedBuilderProfiles } from "./builder_staff_access.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { BUILDER_ROLES } from "./contracts_foundation.js";
import { isBackoffice } from "./proposal_claim.js";

export function builderContractorUnavailable(
  category: "accessDenied" | "invalidLink" | "notFound",
) {
  const referenceByCategory = {
    accessDenied: "CTR-DETAIL-ACCESS",
    invalidLink: "CTR-DETAIL-INVALID",
    notFound: "CTR-DETAIL-NOT-FOUND",
  } as const;
  return {
    availability: {
      category,
      reference: referenceByCategory[category],
    },
    detail: null,
  };
}

export async function builderContractorRelationshipScope(
  ctx: QueryCtx | MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    contractorId: Id<"contractorProfiles">;
    subject: string;
  },
) {
  const builderProfiles = await getOwnedBuilderProfiles(
    ctx,
    input.brokerageId,
    input.subject,
  );
  const builderProfileIds = new Set(
    builderProfiles.map((profile) => String(profile._id)),
  );
  if (builderProfileIds.size === 0) {
    return null;
  }

  const proposalAttachments = await ctx.db
    .query("proposalContractorAssignments")
    .withIndex("by_contractor", (q) => q.eq("contractorId", input.contractorId))
    .collect();
  const ownedProposalAttachments: Array<{
    assignment: Doc<"proposalContractorAssignments">;
    proposal: Doc<"buildProposals">;
  }> = [];
  for (const assignment of proposalAttachments) {
    if (assignment.status !== "active") {
      continue;
    }
    const proposal = await ctx.db.get(assignment.proposalId);
    if (
      proposal?.builderProfileId &&
      builderProfileIds.has(String(proposal.builderProfileId))
    ) {
      ownedProposalAttachments.push({ assignment, proposal });
    }
  }

  const ownedBuilds = (
    await ctx.db
      .query("activeBuilds")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", input.brokerageId))
      .collect()
  ).filter((build) => builderProfileIds.has(String(build.builderProfileId)));
  const ownedBuildAttachments: Array<{
    assignment: Doc<"buildContractorAssignments">;
    build: Doc<"activeBuilds">;
  }> = [];
  for (const build of ownedBuilds) {
    const assignment = await ctx.db
      .query("buildContractorAssignments")
      .withIndex("by_build_contractor", (q) =>
        q.eq("buildId", build._id).eq("contractorId", input.contractorId),
      )
      .unique();
    if (assignment && assignment.status !== "inactive") {
      ownedBuildAttachments.push({ assignment, build });
    }
  }

  if (
    ownedProposalAttachments.length === 0 &&
    ownedBuildAttachments.length === 0
  ) {
    return null;
  }

  const proposalIds = new Set(
    ownedProposalAttachments.map(({ proposal }) => String(proposal._id)),
  );
  const buildIds = new Set(
    ownedBuildAttachments.map(({ build }) => String(build._id)),
  );
  const proposalMilestoneAssignments = (
    await ctx.db
      .query("proposalMilestoneContractorAssignments")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", input.contractorId),
      )
      .collect()
  ).filter(
    (assignment) =>
      assignment.status !== "removed" &&
      proposalIds.has(String(assignment.proposalId)),
  );
  const buildMilestoneAssignments = (
    await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", input.contractorId),
      )
      .collect()
  ).filter(
    (assignment) =>
      assignment.status !== "removed" &&
      buildIds.has(String(assignment.buildId)),
  );

  return {
    buildIds,
    buildMilestoneAssignments,
    proposalMilestoneAssignments,
    scopes: [
      ...ownedBuildAttachments.map(({ assignment, build }) => ({
        buildId: build._id,
        name: build.buildName,
        role: assignment.role,
        status: assignment.status ?? "active",
        type: "build" as const,
      })),
      ...ownedProposalAttachments.map(({ assignment, proposal }) => ({
        name: proposal.buildName,
        proposalId: proposal._id,
        role: assignment.role,
        status: assignment.status,
        type: "proposal" as const,
      })),
    ],
  };
}

export function builderVisibleContractorProfile(profile: any) {
  return {
    _id: profile._id,
    accountWorkosUserId: profile.accountWorkosUserId,
    availabilityWindows: profile.availabilityWindows,
    capabilities: profile.capabilities,
    city: profile.city,
    defaultPayRateCents: profile.defaultPayRateCents,
    defaultPayRateUnit: profile.defaultPayRateUnit,
    email: profile.email,
    equipment: profile.equipment,
    kind: profile.kind,
    name: profile.name,
    onboardingStatus: profile.onboardingStatus,
    phone: profile.phone,
    status: profile.status,
    trades: profile.trades,
  };
}

export function builderContractorLifecycle(input: {
  hasActiveContractorMembership: boolean;
  hasMilestoneAssignment: boolean;
  hasPendingAcknowledgement: boolean;
  latestClaim?: Doc<"contractorInviteClaims">;
  latestReview?: Doc<"contractorOnboardingReviews">;
  profile: any;
}) {
  const now = Date.now();
  const invitationState =
    input.latestClaim?.state === "invited" &&
    input.latestClaim.expiresAt !== undefined &&
    input.latestClaim.expiresAt <= now
      ? "expired"
      : (input.latestClaim?.state ?? "not_invited");

  if (input.latestReview?.status === "changes_requested") {
    return {
      invitationState,
      lifecycleState: "changes_requested",
      nextAction: "contact_support",
    };
  }
  if (input.latestReview?.status === "pending_backoffice_review") {
    return {
      invitationState,
      lifecycleState: "review_required",
      nextAction: "wait_for_review",
    };
  }
  if (input.latestReview?.status === "approved_pending_workos") {
    return {
      invitationState,
      lifecycleState: "sync_pending",
      nextAction: "wait_for_sync",
    };
  }
  if (
    input.profile.accountWorkosUserId &&
    input.hasActiveContractorMembership &&
    input.hasMilestoneAssignment &&
    input.hasPendingAcknowledgement
  ) {
    return {
      invitationState,
      lifecycleState: "acknowledgement_pending",
      nextAction: "wait_for_acknowledgement",
    };
  }
  if (
    input.profile.accountWorkosUserId &&
    input.hasActiveContractorMembership
  ) {
    return {
      invitationState,
      lifecycleState: "active",
      nextAction: "none",
    };
  }
  if (input.profile.accountWorkosUserId) {
    return {
      invitationState,
      lifecycleState: "sync_pending",
      nextAction: "wait_for_sync",
    };
  }
  if (invitationState === "accepted_pending_confirmation") {
    return {
      invitationState,
      lifecycleState: "accepted_pending_confirmation",
      nextAction: "wait_for_confirmation",
    };
  }
  if (invitationState === "claimed") {
    return {
      invitationState,
      lifecycleState: "claimed",
      nextAction: "wait_for_activation",
    };
  }
  if (invitationState === "invited") {
    return {
      invitationState,
      lifecycleState: "invited",
      nextAction: "wait_for_claim",
    };
  }
  if (invitationState === "expired" || invitationState === "revoked") {
    return {
      invitationState,
      lifecycleState: invitationState,
      nextAction: "contact_support",
    };
  }
  if (input.hasMilestoneAssignment) {
    return {
      invitationState,
      lifecycleState: "assigned",
      nextAction: "invite",
    };
  }
  return {
    invitationState,
    lifecycleState: "attached",
    nextAction: "invite",
  };
}

export async function assertContractorDetailReadAllowed(
  ctx: QueryCtx | MutationCtx,
  input: {
    contractor: Doc<"contractorProfiles">;
    roles: readonly RoleSlug[];
    subject: string;
  },
) {
  if (input.contractor.accountWorkosUserId === input.subject) {
    return;
  }
  requireAnyRole(input.roles, BUILDER_ROLES);
  const builderProfile = await getOwnedBuilderProfile(
    ctx,
    input.contractor.brokerageId,
    input.subject,
  );
  if (!builderProfile) {
    throw new Error("Forbidden: contractor detail");
  }
  const builds = await ctx.db
    .query("activeBuilds")
    .withIndex("by_brokerage", (q) =>
      q.eq("brokerageId", input.contractor.brokerageId),
    )
    .filter((q) => q.eq(q.field("builderProfileId"), builderProfile._id))
    .collect();
  const buildIds = new Set(builds.map((build) => String(build._id)));
  const assignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_contractor", (q) =>
      q.eq("contractorId", input.contractor._id),
    )
    .collect();
  if (
    !assignments.some((assignment) => buildIds.has(String(assignment.buildId)))
  ) {
    throw new Error("Forbidden: contractor detail");
  }
}

export async function contractorWorkHistory(
  ctx: QueryCtx | MutationCtx,
  input: {
    assignments: Doc<"milestoneContractorAssignments">[];
    brokerageId: Id<"brokerages">;
    contractorId: Id<"contractorProfiles">;
  },
) {
  const rows = [];
  for (const assignment of input.assignments) {
    const [build, milestone, submilestone] = await Promise.all([
      ctx.db.get(assignment.buildId),
      ctx.db.get(assignment.buildMilestoneId),
      assignment.buildSubmilestoneId
        ? ctx.db.get(assignment.buildSubmilestoneId)
        : Promise.resolve(null),
    ]);
    if (!build || build.brokerageId !== input.brokerageId || !milestone) {
      continue;
    }
    const evidenceAssets = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_milestone", (q) =>
        q
          .eq("buildId", assignment.buildId)
          .eq("milestoneKey", assignment.milestoneKey),
      )
      .collect();
    const evidencePhotos = await Promise.all(
      evidenceAssets
        .filter((asset) => asset.mimeType.startsWith("image/"))
        .filter((asset) =>
          assignment.submilestoneKey
            ? asset.submilestoneKey === assignment.submilestoneKey
            : asset.milestoneKey === assignment.milestoneKey,
        )
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (asset) => ({
          evidenceKey: asset.evidenceKey,
          fileName: asset.fileName,
          label: asset.label,
          milestoneKey: asset.milestoneKey,
          previewUrl: asset.storageId
            ? await ctx.storage.getUrl(asset.storageId)
            : null,
          source: asset.source,
          submilestoneKey: asset.submilestoneKey,
          tag: asset.tag,
        })),
    );
    rows.push({
      _id: assignment._id,
      buildId: build._id,
      buildName: build.buildName,
      buildStatus: build.status,
      evidencePhotos,
      actualCostCents: assignment.actualCostCents,
      actualHours: assignment.actualHours,
      agreedRateCents: assignment.agreedRateCents,
      agreedRateUnit: assignment.agreedRateUnit,
      costNotes: assignment.costNotes,
      estimatedCostCents: assignment.estimatedCostCents,
      estimatedHours: assignment.estimatedHours,
      location: build.location,
      milestoneKey: assignment.milestoneKey,
      milestoneName: milestone.name,
      postHoc: assignment.postHoc,
      role: assignment.role,
      status: assignment.status,
      submilestones: submilestone
        ? [
            {
              key: submilestone.key,
              name: submilestone.name,
              status: submilestone.status,
            },
          ]
        : [],
      updatedAt: assignment.updatedAt,
    });
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function contractorPerformanceSummary(
  ratings: Doc<"contractorQualityRatings">[],
  assignments: Doc<"milestoneContractorAssignments">[] = [],
) {
  const averageQualityRating =
    ratings.length === 0
      ? null
      : Math.round(
          (ratings.reduce((sum, rating) => sum + rating.rating, 0) /
            ratings.length) *
            10,
        ) / 10;
  const totalEstimatedCostCents = assignments.reduce(
    (sum, assignment) => sum + (assignment.estimatedCostCents ?? 0),
    0,
  );
  const totalActualCostCents = assignments.reduce(
    (sum, assignment) => sum + (assignment.actualCostCents ?? 0),
    0,
  );
  return {
    averageQualityRating,
    assignmentCount: assignments.length,
    completedAssignmentCount: assignments.filter(
      (assignment) => assignment.status === "completed",
    ).length,
    totalActualCostCents,
    totalActualHours:
      Math.round(
        assignments.reduce(
          (sum, assignment) => sum + (assignment.actualHours ?? 0),
          0,
        ) * 100,
      ) / 100,
    totalEstimatedCostCents,
    totalEstimatedHours:
      Math.round(
        assignments.reduce(
          (sum, assignment) => sum + (assignment.estimatedHours ?? 0),
          0,
        ) * 100,
      ) / 100,
    totalVarianceCents:
      totalActualCostCents || totalEstimatedCostCents
        ? totalActualCostCents - totalEstimatedCostCents
        : 0,
    ratingCount: ratings.length,
  };
}

export async function requireProposalContractorPlanningWrite(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.status === "closed") {
    throw new Error("Closed proposals no longer accept planning contractors.");
  }
  if (isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
  }
  await requireProposalAppPermission(ctx, auth, "contractor", "update");
  await assertProposalCollaborationEditAllowed(ctx, auth);
}
