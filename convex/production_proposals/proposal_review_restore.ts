import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { normalizeOperationalIdempotencyKey } from "../build_operational_idempotency";
import { authorizeProposal } from "./authorization_core.js";
import {
  requireAnyRole,
  requireBackofficeProposalWrite,
} from "./contractor_policy_helpers.js";
import { APPROVER_ROLES } from "./contracts_foundation.js";
import {
  assertNoArchivingProposalLenderAssignment,
  getCurrentProposalLenderAssignment,
  resolvePolicyLenderOrganization,
} from "./lender_assignment_auth.js";
import { writeProposalEvent } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import {
  assertExpectedProposalReviewBase,
  createImmutableProposalRevision,
  snapshotLenderOrganizationReviewPolicy,
} from "./review_lifecycle_helpers.js";

export const restoreProposalReviewPolicyFromOrganizationDefault =
  authenticatedMutation
    .input({
      expectedAssignmentId: v.id("proposalLenderAssignments"),
      expectedProposalRevisionNumber: v.union(v.number(), v.null()),
      idempotencyKey: v.string(),
      proposalId: v.id("buildProposals"),
      reason: v.string(),
      workosOrganizationId: v.string(),
    })
    .returns(
      v.object({
        policyVersionId: v.id("proposalReviewPolicyVersions"),
        revisionId: v.id("proposalRevisions"),
        revisionNumber: v.number(),
      })
    )
    .handler(async (ctx, args) => {
      const auth = await authorizeProposal(
        ctx,
        args.proposalId,
        args.workosOrganizationId
      );
      requireAnyRole(auth.roles, APPROVER_ROLES);
      requireBackofficeProposalWrite(auth, auth.proposal);
      requireReason(args.reason);
      if (
        auth.proposal.status === "closed" ||
        auth.proposal.lockedReviewPolicyId
      ) {
        throw new Error(
          "Review policy cannot change after policy lock or closing."
        );
      }
      await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
      const assignment = await getCurrentProposalLenderAssignment(
        ctx,
        args.proposalId
      );
      if (!assignment) {
        throw new Error(
          "Restoring an organization default requires a current lender assignment."
        );
      }
      const idempotencyKey = normalizeOperationalIdempotencyKey(
        args.idempotencyKey,
        "Restore organization review default idempotency key"
      );
      const existing = await ctx.db
        .query("proposalReviewPolicyVersions")
        .withIndex("by_proposal_and_idempotency_key", (query) =>
          query
            .eq("proposalId", args.proposalId)
            .eq("idempotencyKey", idempotencyKey)
        )
        .unique();
      if (existing) {
        if (
          existing.configuredByWorkosUserId !== auth.subject ||
          existing.reason !== args.reason.trim() ||
          existing.sourceLenderOrganizationId !==
            assignment.lenderOrganizationId ||
          existing.provenance === "build_override"
        ) {
          throw new Error(
            "Restore organization review default idempotency key was reused with different values."
          );
        }
        const revision = await ctx.db
          .query("proposalRevisions")
          .withIndex("by_proposal_and_idempotency_key", (query) =>
            query
              .eq("proposalId", args.proposalId)
              .eq("idempotencyKey", `policy:${idempotencyKey}`)
          )
          .unique();
        if (!revision) {
          throw new Error(
            "Restored organization policy revision is unavailable."
          );
        }
        return {
          policyVersionId: existing._id,
          revisionId: revision._id,
          revisionNumber: revision.revisionNumber,
        };
      }
      assertExpectedProposalReviewBase({
        assignment,
        expectedAssignmentId: args.expectedAssignmentId,
        expectedProposalRevisionNumber: args.expectedProposalRevisionNumber,
        proposal: auth.proposal,
      });
      const lenderOrganization = await resolvePolicyLenderOrganization(
        ctx,
        assignment,
        "policy configuration"
      );
      const policyVersion = await snapshotLenderOrganizationReviewPolicy(ctx, {
        assignment,
        auth,
        idempotencyKey,
        lenderOrganization,
        now: Date.now(),
        reason: args.reason,
      });
      const proposal = await ctx.db.get(args.proposalId);
      if (!proposal) {
        throw new Error("Restored proposal is unavailable.");
      }
      const revision = await createImmutableProposalRevision(ctx, {
        assignment,
        auth: { ...auth, proposal },
        idempotencyKey: `policy:${idempotencyKey}`,
        policyVersion,
        reason: args.reason,
      });
      await writeProposalEvent(ctx, {
        auth,
        command: "restoreProposalReviewPolicyFromOrganizationDefault",
        eventType: "proposal.review_policy.organization_default_restored",
        newState: JSON.stringify({
          policy: policyVersion.policy,
          policyVersionId: policyVersion._id,
          provenance: policyVersion.provenance,
          revisionId: revision._id,
          sourceOrganizationReviewPolicyVersion:
            policyVersion.sourceOrganizationReviewPolicyVersion ?? null,
        }),
        proposalId: args.proposalId,
        reason: args.reason,
      });
      return {
        policyVersionId: policyVersion._id,
        revisionId: revision._id,
        revisionNumber: revision.revisionNumber,
      };
    })
    .public();
