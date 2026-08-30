/**
 * Production proposals proposal review reads bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { authenticatedQuery } from "../authz";
import { proposalPhase3ReviewControlValidator } from "../lender_portal_phase3";
import { getLenderOrganizationApprovalEligibility } from "../lenderOrganizationAccess";
import {
  proposalReviewPolicyVersionPageItemValidator,
  proposalRevisionPageItemValidator,
} from "./contracts_foundation.js";
import {
  authorizeProposalLifecycleActor,
  resolvePolicyLenderOrganization,
} from "./lender_assignment_auth.js";
import { isBackoffice } from "./proposal_claim.js";

function reviewPolicyProvenance(version: {
  idempotencyKey: string;
  provenance?: "build_override" | "organization_default" | "system_baseline";
}) {
  if (version.provenance) {
    return version.provenance;
  }
  return version.idempotencyKey === "system:default-backoffice-policy"
    ? ("system_baseline" as const)
    : ("build_override" as const);
}

export const getProposalPhase3ReviewControl = authenticatedQuery
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(proposalPhase3ReviewControlValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId
    );
    const [policyVersions, revisions, locks] = await Promise.all([
      ctx.db
        .query("proposalReviewPolicyVersions")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", args.proposalId)
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposal_and_revision_number", (query) =>
          query.eq("proposalId", args.proposalId)
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("proposalReviewPolicyLocks")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", args.proposalId)
        )
        .take(2),
    ]);
    policyVersions.reverse();
    revisions.reverse();
    const visibleRevisions = auth.isCurrentLenderActor
      ? revisions.filter(
          (revision) =>
            revision.assignmentId === auth.currentLenderAssignment?._id
        )
      : revisions;
    const canSeePrivateReviewControl =
      !auth.isCurrentLenderActor && isBackoffice(auth.roles);
    const canSeeLenderLockDetails =
      canSeePrivateReviewControl || auth.isCurrentLenderActor;
    let currentEligibleLenderApproverCounts = canSeePrivateReviewControl
      ? { draw: 0, milestone: 0, proposalReview: 0 }
      : undefined;
    let currentLenderEligibilityIssue: string | undefined;
    if (canSeeLenderLockDetails && auth.currentLenderAssignment) {
      try {
        const lenderOrganization = await resolvePolicyLenderOrganization(
          ctx,
          auth.currentLenderAssignment,
          "policy configuration"
        );
        currentEligibleLenderApproverCounts = (
          await getLenderOrganizationApprovalEligibility(
            ctx,
            lenderOrganization._id
          )
        ).counts;
      } catch (error) {
        currentEligibleLenderApproverCounts = {
          draw: 0,
          milestone: 0,
          proposalReview: 0,
        };
        currentLenderEligibilityIssue = canSeePrivateReviewControl
          ? error instanceof Error
            ? error.message
            : "Assigned lender eligibility is unavailable."
          : "Assigned lender eligibility is unavailable.";
      }
    }
    const visiblePolicyVersions = policyVersions.map((version) => ({
      ...(canSeePrivateReviewControl
        ? {
            configuredAt: version.configuredAt,
            configuredByRole: version.configuredByRole,
            configuredByWorkosUserId: version.configuredByWorkosUserId,
            provenance: reviewPolicyProvenance(version),
            reason: version.reason,
            ...(version.sourceLenderOrganizationId
              ? {
                  sourceLenderOrganizationId:
                    version.sourceLenderOrganizationId,
                }
              : {}),
            ...(version.sourceLenderOrganizationName
              ? {
                  sourceLenderOrganizationName:
                    version.sourceLenderOrganizationName,
                }
              : {}),
            ...(version.sourceOrganizationReviewPolicyVersion === undefined
              ? {}
              : {
                  sourceOrganizationReviewPolicyVersion:
                    version.sourceOrganizationReviewPolicyVersion,
                }),
            ...(version.sourceOrganizationReviewPolicyVersionId
              ? {
                  sourceOrganizationReviewPolicyVersionId:
                    version.sourceOrganizationReviewPolicyVersionId,
                }
              : {}),
          }
        : {}),
      policy: version.policy,
      policyVersionId: version._id,
      version: version.version,
    }));
    const visibleRevisionSnapshots = visibleRevisions.map((revision) => ({
      assignmentId: revision.assignmentId ?? null,
      ...(canSeePrivateReviewControl
        ? {
            backOfficeApprovedByWorkosUserId:
              revision.backOfficeApprovedByWorkosUserId,
            createdByRole: revision.createdByRole,
            createdByWorkosUserId: revision.createdByWorkosUserId,
            reason: revision.reason,
          }
        : {}),
      changedCheckpoints: revision.changedCheckpoints,
      checkpoints: revision.checkpoints,
      createdAt: revision.createdAt,
      priorLenderReviewedRevisionId:
        revision.priorLenderReviewedRevisionId ?? null,
      proposalRevisionId: revision._id,
      revisionNumber: revision.revisionNumber,
      reviewPolicyVersionId: revision.reviewPolicyVersionId,
    }));
    const lock = locks[0];
    const visibleLock = lock
      ? canSeePrivateReviewControl
        ? {
            activeLenderMemberCount: lock.activeLenderMemberCount,
            assignmentId: lock.assignmentId ?? null,
            eligibleLenderApproverCount:
              lock.eligibleLenderApproverCount ?? lock.activeLenderMemberCount,
            eligibleLenderApproverCounts: lock.eligibleLenderApproverCounts,
            lenderOrganizationId: lock.lenderOrganizationId ?? null,
            lockId: lock._id,
            lockedAt: lock.lockedAt,
            lockedByRole: lock.lockedByRole,
            lockedByWorkosUserId: lock.lockedByWorkosUserId,
            policy: lock.policy,
            policyVersionId: lock.policyVersionId,
            proposalRevisionId: lock.proposalRevisionId,
            proposalRevisionNumber: lock.proposalRevisionNumber,
            reason: lock.reason,
          }
        : canSeeLenderLockDetails
          ? {
              activeLenderMemberCount: lock.activeLenderMemberCount,
              assignmentId: lock.assignmentId ?? null,
              eligibleLenderApproverCount:
                lock.eligibleLenderApproverCount ??
                lock.activeLenderMemberCount,
              eligibleLenderApproverCounts: lock.eligibleLenderApproverCounts,
              lenderOrganizationId: lock.lenderOrganizationId ?? null,
              lockId: lock._id,
              lockedAt: lock.lockedAt,
              policy: lock.policy,
              policyVersionId: lock.policyVersionId,
              proposalRevisionId: lock.proposalRevisionId,
              proposalRevisionNumber: lock.proposalRevisionNumber,
            }
          : {
              lockId: lock._id,
              lockedAt: lock.lockedAt,
              policy: lock.policy,
              policyVersionId: lock.policyVersionId,
              proposalRevisionId: lock.proposalRevisionId,
              proposalRevisionNumber: lock.proposalRevisionNumber,
            }
      : null;
    return {
      currentAssignmentId: auth.currentLenderAssignment?._id ?? null,
      ...(currentEligibleLenderApproverCounts
        ? { currentEligibleLenderApproverCounts }
        : {}),
      ...(currentLenderEligibilityIssue
        ? { currentLenderEligibilityIssue }
        : {}),
      currentPolicyVersionId:
        auth.proposal.currentReviewPolicyVersionId ?? null,
      currentRevisionId: auth.proposal.currentProposalRevisionId ?? null,
      currentRevisionNumber:
        auth.proposal.currentProposalRevisionNumber ?? null,
      latestLenderReviewedRevisionId:
        auth.proposal.latestLenderReviewedRevisionId ?? null,
      latestLenderReviewedRevisionNumber:
        auth.proposal.latestLenderReviewedRevisionNumber ?? null,
      lock: visibleLock,
      lockedReviewPolicyId: auth.proposal.lockedReviewPolicyId ?? null,
      policyVersions: visiblePolicyVersions,
      revisions: visibleRevisionSnapshots,
    };
  })
  .public();

export const listProposalReviewPolicyVersions = authenticatedQuery
  .input({
    paginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(
    paginationResultValidator(proposalReviewPolicyVersionPageItemValidator)
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId
    );
    const canSeePrivate =
      !auth.isCurrentLenderActor && isBackoffice(auth.roles);
    const page = await ctx.db
      .query("proposalReviewPolicyVersions")
      .withIndex("by_proposal", (query) =>
        query.eq("proposalId", args.proposalId)
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((version) => ({
        ...(canSeePrivate
          ? {
              configuredAt: version.configuredAt,
              configuredByRole: version.configuredByRole,
              configuredByWorkosUserId: version.configuredByWorkosUserId,
              provenance: reviewPolicyProvenance(version),
              reason: version.reason,
              ...(version.sourceLenderOrganizationId
                ? {
                    sourceLenderOrganizationId:
                      version.sourceLenderOrganizationId,
                  }
                : {}),
              ...(version.sourceLenderOrganizationName
                ? {
                    sourceLenderOrganizationName:
                      version.sourceLenderOrganizationName,
                  }
                : {}),
              ...(version.sourceOrganizationReviewPolicyVersion === undefined
                ? {}
                : {
                    sourceOrganizationReviewPolicyVersion:
                      version.sourceOrganizationReviewPolicyVersion,
                  }),
              ...(version.sourceOrganizationReviewPolicyVersionId
                ? {
                    sourceOrganizationReviewPolicyVersionId:
                      version.sourceOrganizationReviewPolicyVersionId,
                  }
                : {}),
            }
          : {}),
        policy: version.policy,
        policyVersionId: version._id,
        version: version.version,
      })),
    };
  })
  .public();

export const listProposalRevisions = authenticatedQuery
  .input({
    paginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(paginationResultValidator(proposalRevisionPageItemValidator))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId
    );
    const canSeePrivate =
      !auth.isCurrentLenderActor && isBackoffice(auth.roles);
    const page = await (async () => {
      if (auth.isCurrentLenderActor) {
        const currentLenderAssignment = auth.currentLenderAssignment;
        if (!currentLenderAssignment) {
          throw new Error("Forbidden: current lender assignment");
        }
        return await ctx.db
          .query("proposalRevisions")
          .withIndex("by_assignment_and_revision_number", (query) =>
            query.eq("assignmentId", currentLenderAssignment._id)
          )
          .order("asc")
          .paginate(args.paginationOpts);
      }
      return await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposal_and_revision_number", (query) =>
          query.eq("proposalId", args.proposalId)
        )
        .order("asc")
        .paginate(args.paginationOpts);
    })();
    return {
      ...page,
      page: page.page.map((revision) => ({
        assignmentId: revision.assignmentId ?? null,
        ...(canSeePrivate
          ? {
              backOfficeApprovedByWorkosUserId:
                revision.backOfficeApprovedByWorkosUserId,
              createdByRole: revision.createdByRole,
              createdByWorkosUserId: revision.createdByWorkosUserId,
              reason: revision.reason,
            }
          : {}),
        changedCheckpoints: revision.changedCheckpoints,
        checkpoints: revision.checkpoints,
        createdAt: revision.createdAt,
        priorLenderReviewedRevisionId:
          revision.priorLenderReviewedRevisionId ?? null,
        proposalRevisionId: revision._id,
        revisionNumber: revision.revisionNumber,
        reviewPolicyVersionId: revision.reviewPolicyVersionId,
      })),
    };
  })
  .public();
