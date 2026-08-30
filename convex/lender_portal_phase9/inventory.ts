import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import { authenticatedQuery } from "../authz.js";
import {
  requireTenantReleaseOperator,
  requireTrustedRuntimeReleaseProvenance,
} from "../lender_portal_release.js";
import {
  IssueSnapshot,
  MAX_INVENTORY_PAGE_SIZE,
  proposalInventoryValidator,
} from "./shared.js";
import {
  approvalIssueForSnapshot,
  policyLockIssueForSnapshot,
} from "./snapshot_support.js";

export const inventoryLenderPortalPhase9MigrationCandidates = authenticatedQuery
  .input({
    candidateSha: v.string(),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(paginationResultValidator(proposalInventoryValidator))
  .handler(async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > MAX_INVENTORY_PAGE_SIZE
    ) {
      throw new Error(
        `Phase 9 migration inventory page size must be 1 to ${MAX_INVENTORY_PAGE_SIZE}.`
      );
    }
    const candidateSha = args.candidateSha.trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(candidateSha)) {
      throw new Error("Phase 9 inventory requires a full candidate Git SHA.");
    }
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const release = await ctx.db
      .query("lenderPortalTenantReleaseControls")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", scope.organizationId)
      )
      .unique();
    if (
      !release ||
      release.brokerageId !== scope.brokerageId ||
      release.status !== "disabled" ||
      release.candidateSha !== candidateSha
    ) {
      throw new Error(
        "Phase 9 inventory requires the exact candidate to be configured in disabled state."
      );
    }
    requireTrustedRuntimeReleaseProvenance(
      release.candidateSha,
      release.configurationHash
    );
    const page = await ctx.db
      .query("buildProposals")
      .withIndex("by_brokerage_and_organization", (query) =>
        query
          .eq("brokerageId", scope.brokerageId)
          .eq("organizationId", scope.organizationId)
      )
      .order("asc")
      .paginate(args.paginationOpts);
    const inventory = [];
    for (const proposal of page.page) {
      if (
        proposal.brokerageId !== scope.brokerageId ||
        proposal.organizationId !== scope.organizationId
      ) {
        throw new Error(
          "Phase 9 inventory encountered a proposal outside the exact tenant scope."
        );
      }
      const [
        builder,
        closings,
        builds,
        assignments,
        approvals,
        policies,
        revisions,
        locks,
        cards,
        issues,
      ] = await Promise.all([
        proposal.builderProfileId
          ? ctx.db.get(proposal.builderProfileId)
          : null,
        ctx.db
          .query("proposalClosings")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(2),
        ctx.db
          .query("activeBuilds")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(2),
        ctx.db
          .query("proposalLenderAssignments")
          .withIndex("by_proposal_status", (query) =>
            query.eq("proposalId", proposal._id).eq("status", "current")
          )
          .take(2),
        ctx.db
          .query("proposalLenderApprovals")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(501),
        ctx.db
          .query("proposalReviewPolicyVersions")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(501),
        ctx.db
          .query("proposalRevisions")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(501),
        ctx.db
          .query("proposalReviewPolicyLocks")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(501),
        ctx.db
          .query("proposalKanbanCards")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(2),
        ctx.db
          .query("proposalPhase3MigrationIssues")
          .withIndex("by_proposal_and_status", (query) =>
            query.eq("proposalId", proposal._id).eq("status", "open")
          )
          .take(501),
      ]);
      const cycles = [];
      for (const build of builds) {
        const currentCycles = await ctx.db
          .query("lenderPortalReviewCycles")
          .withIndex("by_build_and_is_current_and_submitted_at", (query) =>
            query.eq("buildId", build._id).eq("isCurrent", true)
          )
          .take(501);
        cycles.push(...currentCycles);
      }
      const currentPolicy = proposal.currentReviewPolicyVersionId
        ? await ctx.db.get(proposal.currentReviewPolicyVersionId)
        : null;
      const currentRevision = proposal.currentProposalRevisionId
        ? await ctx.db.get(proposal.currentProposalRevisionId)
        : null;
      const pointedBuild = proposal.activeBuildId
        ? await ctx.db.get(proposal.activeBuildId)
        : null;
      let invalidAssignmentOwnership = false;
      for (const assignment of assignments) {
        const lenderOrganizationId = ctx.db.normalizeId(
          "lenderOrganizations",
          String(assignment.lenderOrganizationId)
        );
        const lenderOrganization = lenderOrganizationId
          ? await ctx.db.get(lenderOrganizationId)
          : null;
        if (
          assignment.brokerageId !== proposal.brokerageId ||
          assignment.organizationId !== proposal.organizationId ||
          !lenderOrganization ||
          lenderOrganization.status !== "active" ||
          lenderOrganization.brokerageId !== assignment.lenderBrokerageId
        ) {
          invalidAssignmentOwnership = true;
        }
      }
      const currentPolicyIsExact = Boolean(
        currentPolicy &&
          currentPolicy.proposalId === proposal._id &&
          currentPolicy.brokerageId === proposal.brokerageId &&
          currentPolicy.organizationId === proposal.organizationId
      );
      const currentRevisionIsExact = Boolean(
        currentRevision &&
          currentRevision.proposalId === proposal._id &&
          currentRevision.brokerageId === proposal.brokerageId &&
          currentRevision.organizationId === proposal.organizationId &&
          currentRevision.revisionNumber ===
            proposal.currentProposalRevisionNumber &&
          currentRevision.reviewPolicyVersionId === currentPolicy?._id
      );
      const sortedPolicies = policies
        .slice(0, 500)
        .sort((left, right) => right.version - left.version);
      const policyCandidate = currentPolicyIsExact
        ? currentPolicy
        : !proposal.currentReviewPolicyVersionId &&
            sortedPolicies[0] &&
            sortedPolicies[0].version !== sortedPolicies[1]?.version &&
            sortedPolicies[0].organizationId === proposal.organizationId &&
            sortedPolicies[0].brokerageId === proposal.brokerageId
          ? sortedPolicies[0]
          : null;
      const sortedRevisions = revisions
        .slice(0, 500)
        .sort((left, right) => right.revisionNumber - left.revisionNumber);
      const assignment = assignments.length === 1 ? assignments[0] : null;
      const revisionCandidate =
        currentRevisionIsExact &&
        currentRevision?.assignmentId === assignment?._id
          ? currentRevision
          : !proposal.currentProposalRevisionId &&
              sortedRevisions[0] &&
              sortedRevisions[0].revisionNumber !==
                sortedRevisions[1]?.revisionNumber &&
              sortedRevisions[0].organizationId === proposal.organizationId &&
              sortedRevisions[0].brokerageId === proposal.brokerageId &&
              sortedRevisions[0].reviewPolicyVersionId ===
                policyCandidate?._id &&
              sortedRevisions[0].assignmentId === assignment?._id
            ? sortedRevisions[0]
            : null;
      const approvalIssues = (
        await Promise.all(
          approvals
            .slice(0, 500)
            .map((approval) =>
              approvalIssueForSnapshot(ctx, proposal, approval)
            )
        )
      ).filter((issue): issue is IssueSnapshot => issue !== null);
      const lockIssue = await policyLockIssueForSnapshot(ctx, {
        builds,
        closings,
        currentAssignments: assignments,
        locks: locks.slice(0, 500),
        policyCandidate,
        proposal,
        revisionCandidate,
      });
      const expectedCard = {
        brokerageId: proposal.brokerageId,
        builderName: builder?.displayName ?? "Unassigned builder",
        column: proposal.status,
        href: `/backoffice/proposals/${String(proposal._id)}`,
        organizationId: proposal.organizationId,
        sortAt: proposal.updatedAt,
        subtitle: proposal.location,
        title: proposal.buildName,
        totalBudgetCents: proposal.totalBudgetCents,
        updatedAt: proposal.updatedAt,
      };
      const card = cards[0];
      const projectionMatches = Boolean(
        card &&
          cards.length === 1 &&
          card.brokerageId === expectedCard.brokerageId &&
          card.builderName === expectedCard.builderName &&
          card.column === expectedCard.column &&
          card.href === expectedCard.href &&
          card.organizationId === expectedCard.organizationId &&
          card.sortAt === expectedCard.sortAt &&
          card.subtitle === expectedCard.subtitle &&
          card.title === expectedCard.title &&
          card.totalBudgetCents === expectedCard.totalBudgetCents &&
          card.updatedAt === expectedCard.updatedAt
      );
      const ambiguityCodes = [
        ...(proposal.organizationId !== scope.organizationId
          ? ["proposal_tenant_mismatch"]
          : []),
        ...(builder &&
        (builder.brokerageId !== proposal.brokerageId ||
          builder.organizationId !== proposal.organizationId)
          ? ["builder_tenant_mismatch"]
          : []),
        ...(closings.length > 1 ? ["multiple_closings"] : []),
        ...(closings.some(
          (closing) =>
            closing.brokerageId !== proposal.brokerageId ||
            closing.organizationId !== proposal.organizationId
        )
          ? ["closing_tenant_mismatch"]
          : []),
        ...(builds.length > 1 ? ["multiple_active_builds"] : []),
        ...(builds.some(
          (build) =>
            build.brokerageId !== proposal.brokerageId ||
            build.organizationId !== proposal.organizationId
        )
          ? ["active_build_tenant_mismatch"]
          : []),
        ...(assignments.length > 1 ? ["multiple_current_assignments"] : []),
        ...(invalidAssignmentOwnership
          ? ["unverified_lender_assignment_ownership"]
          : []),
        ...(policies.length > 500 ? ["policy_history_limit_exceeded"] : []),
        ...(approvals.length > 500 ? ["approval_history_limit_exceeded"] : []),
        ...approvalIssues.map((issue) => issue.code),
        ...(policies.some(
          (policy) =>
            policy.brokerageId !== proposal.brokerageId ||
            policy.organizationId !== proposal.organizationId
        )
          ? ["policy_tenant_mismatch"]
          : []),
        ...(revisions.length > 500 ? ["revision_history_limit_exceeded"] : []),
        ...(locks.length > 500 ? ["policy_lock_history_limit_exceeded"] : []),
        ...(lockIssue ? [lockIssue.code] : []),
        ...(revisions.some(
          (revision) =>
            revision.brokerageId !== proposal.brokerageId ||
            revision.organizationId !== proposal.organizationId
        )
          ? ["revision_tenant_mismatch"]
          : []),
        ...(cycles.length > 500 ? ["review_cycle_limit_exceeded"] : []),
        ...(cycles.some(
          (cycle) =>
            cycle.brokerageId !== proposal.brokerageId ||
            cycle.organizationId !== proposal.organizationId ||
            !builds.some((build) => build._id === cycle.buildId)
        )
          ? ["review_cycle_tenant_mismatch"]
          : []),
        ...(issues.length > 0 ? ["open_migration_issue"] : []),
        ...((proposal.status === "approved" || proposal.status === "closed") &&
        !policyCandidate
          ? ["missing_exact_current_policy"]
          : []),
        ...((proposal.status === "approved" || proposal.status === "closed") &&
        !revisionCandidate
          ? ["missing_exact_current_revision"]
          : []),
        ...((proposal.status === "approved" || proposal.status === "closed") &&
        proposal.approvedAt === undefined &&
        !revisionCandidate
          ? ["approved_without_exact_revision_timestamp"]
          : []),
        ...(proposal.status === "closed" && closings.length !== 1
          ? ["closed_without_exact_closing"]
          : []),
        ...(proposal.status === "closed" &&
        proposal.closedAt !== undefined &&
        closings.length === 1 &&
        proposal.closedAt !== closings[0]?.closedAt
          ? ["closing_timestamp_conflict"]
          : []),
        ...(proposal.status === "closed" &&
        proposal.activeBuildId !== undefined &&
        (!pointedBuild ||
          pointedBuild.proposalId !== proposal._id ||
          pointedBuild.brokerageId !== proposal.brokerageId ||
          pointedBuild.organizationId !== proposal.organizationId)
          ? ["active_build_pointer_conflict"]
          : []),
        ...(proposal.status !== "closed" &&
        (closings.length > 0 || builds.length > 0)
          ? ["non_closed_with_closing_or_activation"]
          : []),
        ...(cards.length > 1 ? ["multiple_kanban_projections"] : []),
      ];
      inventory.push({
        activeBuildCount: builds.length,
        approvalCount: approvals.length,
        ambiguityCodes,
        approvedAtRecorded: proposal.approvedAt !== undefined,
        candidateSha,
        closingCount: closings.length,
        currentAssignmentCount: assignments.length,
        currentReviewCycleCount: cycles.length,
        kanbanCardCount: cards.length,
        openIssueCount: issues.length,
        policyVersionCount: policies.length,
        policyLockCount: locks.length,
        projectionMatches,
        proposalId: proposal._id,
        reviewQueueCounts: {
          completed: cycles.filter((cycle) => cycle.state === "completed")
            .length,
          correctionRequired: cycles.filter(
            (cycle) => cycle.state === "correction_required"
          ).length,
          inReview: cycles.filter((cycle) => cycle.state === "in_review")
            .length,
          partialApproval: cycles.filter(
            (cycle) => cycle.state === "partial_approval"
          ).length,
        },
        revisionCount: revisions.length,
        status: proposal.status,
      });
    }
    return { ...page, page: inventory };
  })
  .public();
