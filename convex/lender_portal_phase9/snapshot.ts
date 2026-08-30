import { operationalRequestFingerprint } from "../build_operational_idempotency.js";
import type { Doc, Id } from "../_generated/dataModel.js";
import {
  IssueSnapshot,
  MAX_MANIFEST_PROPOSALS,
  MAX_MANIFEST_RELATED_ROWS,
  Phase9DecisionDependencyRow,
  SnapshotCtx,
  deduplicateIssues,
  isPresent,
  issueFor,
  sortSnapshotRows,
} from "./shared.js";
import type { LenderPortalPhase9MigrationCounts } from "../lender_portal_phase9_contracts.js";
import {
  approvalIssueForSnapshot,
  boundedActiveBuilds,
  boundedAllAssignments,
  boundedCurrentAssignments,
  boundedProposalClosings,
  boundedProposalKanbanCards,
  boundedProposalLenderApprovals,
  boundedProposalRevisions,
  boundedProposalReviewPolicyLocks,
  boundedProposalReviewPolicyVersions,
  collectWorkosProjectionFingerprint,
  policyLockIssueForSnapshot,
} from "./snapshot_support.js";

export function snapshotMatchesPreparedRun(
  run: Doc<"lenderPortalPhase9MigrationRuns">,
  snapshot: Awaited<ReturnType<typeof collectMigrationSnapshot>>
) {
  return (
    snapshot.inventoryFingerprint === run.inventoryFingerprint &&
    snapshot.workosProjectionFingerprint ===
      run.workosProjectionFingerprintBefore &&
    snapshot.workosProjectionRowCount === run.workosProjectionRowCount &&
    snapshot.issues.length === 0
  );
}

export async function collectMigrationSnapshot(
  ctx: SnapshotCtx,
  organizationId: string,
  brokerageId: Id<"brokerages">
) {
  const proposals = await ctx.db
    .query("buildProposals")
    .withIndex("by_brokerage_and_organization", (query) =>
      query.eq("brokerageId", brokerageId).eq("organizationId", organizationId)
    )
    .take(MAX_MANIFEST_PROPOSALS + 1);
  if (proposals.length > MAX_MANIFEST_PROPOSALS) {
    throw new Error(
      `Phase 9 exact inventory exceeds ${MAX_MANIFEST_PROPOSALS} proposals; use a reviewed paginated rehearsal before apply.`
    );
  }
  const issues: IssueSnapshot[] = [];
  const counts: LenderPortalPhase9MigrationCounts = {
    activeBuildCount: 0,
    approvalCount: 0,
    assignmentCount: 0,
    closingCount: 0,
    kanbanCardCount: 0,
    policyVersionCount: 0,
    policyLockCount: 0,
    projectionMismatchCount: 0,
    proposalCount: proposals.length,
    proposalStatusCounts: {},
    reconciliationPendingCount: 0,
    reconciliationCandidateCount: 0,
    reviewCycleCount: 0,
    revisionCount: 0,
  };
  const fingerprintRows: unknown[] = [];
  const reviewCycleRows: Doc<"lenderPortalReviewCycles">[] = [];
  for (const proposal of proposals) {
    const decisionDependencyRows: Phase9DecisionDependencyRow[] = [];
    counts.proposalStatusCounts[proposal.status] =
      (counts.proposalStatusCounts[proposal.status] ?? 0) + 1;
    const [
      builder,
      closings,
      builds,
      assignments,
      currentAssignments,
      approvals,
      policies,
      revisions,
      locks,
      cards,
      openIssues,
    ] = await Promise.all([
      proposal.builderProfileId ? ctx.db.get(proposal.builderProfileId) : null,
      boundedProposalClosings(ctx, proposal._id),
      boundedActiveBuilds(ctx, proposal._id),
      boundedAllAssignments(ctx, proposal._id),
      boundedCurrentAssignments(ctx, proposal._id),
      boundedProposalLenderApprovals(ctx, proposal._id),
      boundedProposalReviewPolicyVersions(ctx, proposal._id),
      boundedProposalRevisions(ctx, proposal._id),
      boundedProposalReviewPolicyLocks(ctx, proposal._id),
      boundedProposalKanbanCards(ctx, proposal._id),
      ctx.db
        .query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query) =>
          query.eq("proposalId", proposal._id).eq("status", "open")
        )
        .take(MAX_MANIFEST_RELATED_ROWS + 1),
    ]);
    if (openIssues.length > MAX_MANIFEST_RELATED_ROWS) {
      throw new Error(
        "Phase 9 proposal issue inventory exceeds its exact boundary."
      );
    }
    counts.closingCount += closings.length;
    counts.activeBuildCount += builds.length;
    counts.assignmentCount += assignments.length;
    counts.approvalCount += approvals.length;
    counts.policyVersionCount += policies.length;
    counts.policyLockCount += locks.length;
    counts.revisionCount += revisions.length;
    counts.kanbanCardCount += cards.length;
    const currentPolicy = proposal.currentReviewPolicyVersionId
      ? await ctx.db.get(proposal.currentReviewPolicyVersionId)
      : null;
    const currentRevision = proposal.currentProposalRevisionId
      ? await ctx.db.get(proposal.currentProposalRevisionId)
      : null;
    decisionDependencyRows.push(
      ...[currentPolicy, currentRevision].filter(
        isPresent
      )
    );
    for (const pointedId of [
      proposal.activeBuildId,
      proposal.lockedReviewPolicyId,
      ...closings.map((closing) => closing.reviewPolicyLockId),
    ].filter(Boolean)) {
      const pointed = await ctx.db.get(pointedId!);
      if (pointed) decisionDependencyRows.push(pointed);
    }
    const currentPolicyExact = Boolean(
      currentPolicy &&
        currentPolicy.proposalId === proposal._id &&
        currentPolicy.organizationId === organizationId &&
        currentPolicy.brokerageId === brokerageId
    );
    const currentRevisionExact = Boolean(
      currentRevision &&
        currentRevision.proposalId === proposal._id &&
        currentRevision.organizationId === organizationId &&
        currentRevision.brokerageId === brokerageId &&
        currentRevision.revisionNumber ===
          proposal.currentProposalRevisionNumber &&
        currentRevision.reviewPolicyVersionId === currentPolicy?._id
    );
    const sortedPolicies = [...policies].sort(
      (left, right) => right.version - left.version
    );
    const policyCandidate = currentPolicyExact
      ? currentPolicy
      : !proposal.currentReviewPolicyVersionId &&
          sortedPolicies[0] &&
          sortedPolicies[0].version !== sortedPolicies[1]?.version &&
          sortedPolicies[0].organizationId === organizationId &&
          sortedPolicies[0].brokerageId === brokerageId
        ? sortedPolicies[0]
        : null;
    const sortedRevisions = [...revisions].sort(
      (left, right) => right.revisionNumber - left.revisionNumber
    );
    const currentAssignment =
      currentAssignments.length === 1 ? currentAssignments[0] : null;
    const revisionCandidate =
      currentRevisionExact &&
      currentRevision?.assignmentId === currentAssignment?._id
        ? currentRevision
        : !proposal.currentProposalRevisionId &&
            sortedRevisions[0] &&
            sortedRevisions[0].revisionNumber !==
              sortedRevisions[1]?.revisionNumber &&
            sortedRevisions[0].organizationId === organizationId &&
            sortedRevisions[0].brokerageId === brokerageId &&
            sortedRevisions[0].reviewPolicyVersionId === policyCandidate?._id &&
            sortedRevisions[0].assignmentId === currentAssignment?._id
          ? sortedRevisions[0]
          : null;
    if (
      (proposal.status === "approved" || proposal.status === "closed") &&
      !policyCandidate
    ) {
      issues.push(
        issueFor(
          proposal,
          "missing_exact_current_policy",
          "currentReviewPolicyVersionId",
          "buildProposals",
          "Canonical policy pointer is absent or outside proposal scope."
        )
      );
    }
    if (
      (proposal.status === "approved" || proposal.status === "closed") &&
      !revisionCandidate
    ) {
      issues.push(
        issueFor(
          proposal,
          "missing_exact_current_revision",
          "currentProposalRevisionId",
          "buildProposals",
          "Canonical revision pointer is absent or outside proposal, policy, or tenant scope."
        )
      );
    }
    if (
      (proposal.status === "approved" || proposal.status === "closed") &&
      policyCandidate &&
      revisionCandidate &&
      (proposal.currentReviewPolicyVersionId !== policyCandidate._id ||
        proposal.currentProposalRevisionId !== revisionCandidate._id ||
        proposal.currentProposalRevisionNumber !==
          revisionCandidate.revisionNumber)
    ) {
      counts.reconciliationPendingCount += 1;
    }
    if (
      builder &&
      (builder.organizationId !== organizationId ||
        builder.brokerageId !== brokerageId)
    ) {
      issues.push(
        issueFor(
          proposal,
          "builder_scope_conflict",
          "builderProfileId",
          "buildProposals",
          "The Builder projection source is outside the exact proposal tenant scope."
        )
      );
    }
    if (
      (proposal.status === "approved" || proposal.status === "closed") &&
      proposal.approvedAt === undefined
    ) {
      issues.push(
        issueFor(
          proposal,
          "explicit_approval_evidence_missing",
          "approvedAt",
          "buildProposals",
          "Approved lifecycle state has no explicit approval timestamp; revision creation time is not approval evidence."
        )
      );
    }
    if (proposal.status === "closed") {
      const closing = closings[0];
      if (
        closings.length !== 1 ||
        !closing ||
        closing.organizationId !== organizationId ||
        closing.brokerageId !== brokerageId
      ) {
        issues.push(
          issueFor(
            proposal,
            "closed_proposal_closing_conflict",
            "closedAt",
            "proposalClosings",
            "Closed proposal evidence is missing, duplicated, or outside the exact tenant scope."
          )
        );
      } else if (
        proposal.closedAt !== undefined &&
        proposal.closedAt !== closing.closedAt
      ) {
        issues.push(
          issueFor(
            proposal,
            "closing_timestamp_conflict",
            "closedAt",
            "proposalClosings",
            "Proposal and canonical closing timestamps disagree.",
            String(closing._id)
          )
        );
      }
      const pointedBuild = proposal.activeBuildId
        ? await ctx.db.get(proposal.activeBuildId)
        : null;
      if (
        proposal.activeBuildId &&
        (!pointedBuild ||
          pointedBuild.proposalId !== proposal._id ||
          pointedBuild.organizationId !== organizationId ||
          pointedBuild.brokerageId !== brokerageId ||
          (builds[0] && builds[0]._id !== pointedBuild._id))
      ) {
        issues.push(
          issueFor(
            proposal,
            "active_build_pointer_conflict",
            "activeBuildId",
            "activeBuilds",
            "The active Build pointer is outside the exact proposal tenant and Build scope.",
            String(proposal.activeBuildId)
          )
        );
      }
    } else if (
      closings.length > 0 ||
      builds.length > 0 ||
      proposal.activeBuildId !== undefined
    ) {
      issues.push(
        issueFor(
          proposal,
          "non_closed_lifecycle_evidence",
          builds.length > 0 || proposal.activeBuildId
            ? "activeBuildId"
            : "closedAt",
          builds.length > 0 || proposal.activeBuildId
            ? "activeBuilds"
            : "proposalClosings",
          "A non-closed proposal has closing or active-Build evidence and requires operator reconciliation."
        )
      );
    }
    if (builds.length > 1) {
      issues.push(
        issueFor(
          proposal,
          "multiple_active_builds",
          "activeBuildId",
          "activeBuilds",
          "More than one active Build prevents exact activation reconciliation."
        )
      );
    }
    if (currentAssignments.length > 1) {
      issues.push(
        issueFor(
          proposal,
          "multiple_current_assignments",
          "lenderOrganizationId",
          "proposalLenderAssignments",
          "More than one current lender assignment prevents exact ownership reconciliation."
        )
      );
    }
    for (const assignment of assignments) {
      const lenderOrganizationId = ctx.db.normalizeId(
        "lenderOrganizations",
        String(assignment.lenderOrganizationId)
      );
      const lenderOrganization = lenderOrganizationId
        ? await ctx.db.get(lenderOrganizationId)
        : null;
      const legacyCandidates = lenderOrganization
        ? []
        : await ctx.db
            .query("lenderOrganizations")
            .withIndex("by_brokerage_and_legacy_workos_organization", (query) =>
              query
                .eq("brokerageId", assignment.lenderBrokerageId)
                .eq(
                  "legacyWorkosOrganizationId",
                  String(assignment.lenderOrganizationId)
                )
            )
            .take(2);
      const verifiedLenderOrganization =
        lenderOrganization ??
        (legacyCandidates.length === 1 &&
        legacyCandidates[0]?.status === "active"
          ? legacyCandidates[0]
          : null);
      decisionDependencyRows.push(
        ...[lenderOrganization, ...legacyCandidates].filter(
          isPresent
        )
      );
      if (
        assignment.organizationId !== organizationId ||
        assignment.brokerageId !== brokerageId ||
        !verifiedLenderOrganization ||
        verifiedLenderOrganization.status !== "active" ||
        verifiedLenderOrganization.brokerageId !== assignment.lenderBrokerageId
      ) {
        issues.push(
          issueFor(
            proposal,
            "unverified_lender_assignment",
            "lenderOrganizationId",
            "proposalLenderAssignments",
            "Current assignment does not resolve to one active application-owned Lender Organization in the recorded lender Brokerage.",
            String(assignment._id)
          )
        );
      }
    }
    for (const approval of approvals) {
      const typedApproval = approval as Doc<"proposalLenderApprovals">;
      const approvalAssignment = await ctx.db.get(typedApproval.assignmentId);
      const approvalCycle = typedApproval.confirmationCycleId
        ? await ctx.db.get(typedApproval.confirmationCycleId)
        : null;
      const approvalRevision = typedApproval.proposalRevisionId
        ? await ctx.db.get(typedApproval.proposalRevisionId)
        : approvalCycle
          ? await ctx.db.get(approvalCycle.proposalRevisionId)
          : null;
      const approvalPolicy = approvalRevision
        ? await ctx.db.get(approvalRevision.reviewPolicyVersionId)
        : null;
      decisionDependencyRows.push(
        ...[
          approvalAssignment,
          approvalCycle,
          approvalRevision,
          approvalPolicy,
        ].filter(isPresent)
      );
      const issue = await approvalIssueForSnapshot(ctx, proposal, approval);
      if (issue) {
        issues.push(issue);
      } else {
        const assignment = await ctx.db.get(
          approval.assignmentId as Id<"proposalLenderAssignments">
        );
        if (
          !approval.proposalRevisionId ||
          !assignment ||
          String(approval.lenderOrganizationId) !==
            String(assignment.lenderOrganizationId)
        ) {
          counts.reconciliationPendingCount += 1;
        }
      }
    }
    const policyLockIssue = await policyLockIssueForSnapshot(ctx, {
      builds,
      closings,
      currentAssignments,
      locks,
      policyCandidate,
      proposal,
      revisionCandidate,
    });
    if (policyLockIssue) {
      issues.push(policyLockIssue);
    } else if (proposal.status === "closed" && closings.length === 1) {
      const lock = proposal.lockedReviewPolicyId
        ? await ctx.db.get(proposal.lockedReviewPolicyId)
        : closings[0]?.reviewPolicyLockId
          ? await ctx.db.get(closings[0].reviewPolicyLockId)
          : (locks[0] ?? null);
      const build = proposal.activeBuildId
        ? await ctx.db.get(proposal.activeBuildId)
        : (builds[0] ?? null);
      if (
        !lock ||
        proposal.lockedReviewPolicyId !== lock._id ||
        closings[0]?.reviewPolicyLockId !== lock._id ||
        (build !== null && build.reviewPolicyLockId !== lock._id)
      ) {
        counts.reconciliationPendingCount += 1;
      }
    }
    for (const lockRow of locks) {
      const [lockPolicy, lockRevision, lockAssignment] = await Promise.all([
        ctx.db.get(lockRow.policyVersionId),
        ctx.db.get(lockRow.proposalRevisionId),
        lockRow.assignmentId ? ctx.db.get(lockRow.assignmentId) : null,
      ]);
      decisionDependencyRows.push(
        ...[lockPolicy, lockRevision, lockAssignment].filter(
          isPresent
        )
      );
    }
    if (
      (proposal.status === "approved" || proposal.status === "closed") &&
      revisionCandidate &&
      proposal.approvedAt === undefined
    ) {
      counts.reconciliationPendingCount += 1;
    }
    if (
      proposal.status === "closed" &&
      closings.length === 1 &&
      closings[0]?.organizationId === proposal.organizationId &&
      closings[0].brokerageId === proposal.brokerageId &&
      proposal.closedAt === undefined
    ) {
      counts.reconciliationPendingCount += 1;
    }
    if (
      proposal.status === "closed" &&
      builds.length === 1 &&
      builds[0]?.organizationId === proposal.organizationId &&
      builds[0].brokerageId === proposal.brokerageId &&
      proposal.activeBuildId === undefined
    ) {
      counts.reconciliationPendingCount += 1;
    }
    for (const row of [...closings, ...builds, ...policies, ...revisions]) {
      if (
        row.organizationId !== organizationId ||
        row.brokerageId !== brokerageId
      ) {
        issues.push(
          issueFor(
            proposal,
            "related_tenant_mismatch",
            "organizationId",
            "canonicalRelatedRecord",
            "A related canonical record is outside the exact proposal tenant scope.",
            String(row._id)
          )
        );
      }
    }
    for (const issue of openIssues) {
      issues.push({
        code: "open_migration_issue",
        disposition: "open",
        field: "migration",
        provenance: "proposalPhase3MigrationIssues",
        reason: issue.reason,
        sourceRecordId: issue.sourceRecordId,
        sourceTable: issue.sourceTable,
      });
    }
    const expectedCard = {
      brokerageId: proposal.brokerageId,
      builderName: builder?.displayName ?? "Unassigned builder",
      column: proposal.status,
      href: `/backoffice/proposals/${String(proposal._id)}`,
      organizationId: proposal.organizationId,
      proposalId: proposal._id,
      sortAt: proposal.updatedAt,
      subtitle: proposal.location,
      title: proposal.buildName,
      totalBudgetCents: proposal.totalBudgetCents,
      updatedAt: proposal.updatedAt,
    };
    const card = cards[0];
    const projectionMatches = Boolean(
      cards.length === 1 &&
        card &&
        card.brokerageId === expectedCard.brokerageId &&
        card.builderName === expectedCard.builderName &&
        card.column === expectedCard.column &&
        card.href === expectedCard.href &&
        card.organizationId === expectedCard.organizationId &&
        card.proposalId === expectedCard.proposalId &&
        card.sortAt === expectedCard.sortAt &&
        card.subtitle === expectedCard.subtitle &&
        card.title === expectedCard.title &&
        card.totalBudgetCents === expectedCard.totalBudgetCents &&
        card.updatedAt === expectedCard.updatedAt
    );
    if (!projectionMatches) counts.projectionMismatchCount += 1;
    if (cards.length > 1 || (card && !projectionMatches)) {
      issues.push(
        issueFor(
          proposal,
          "kanban_projection_scope_conflict",
          "proposalId",
          "proposalKanbanCards",
          "The existing Kanban projection contradicts the exact proposal, tenant, or canonical field snapshot and will not be rewritten.",
          card ? String(card._id) : String(proposal._id)
        )
      );
    }
    for (const build of builds) {
      const cycles = await ctx.db
        .query("lenderPortalReviewCycles")
        .withIndex("by_build_and_submitted_at", (query) =>
          query.eq("buildId", build._id)
        )
        .take(MAX_MANIFEST_RELATED_ROWS + 1);
      if (cycles.length > MAX_MANIFEST_RELATED_ROWS) {
        throw new Error(
          "Phase 9 review-cycle inventory exceeds its exact boundary."
        );
      }
      counts.reviewCycleCount += cycles.length;
      reviewCycleRows.push(...cycles);
      for (const cycle of cycles) {
        const [drawRequest, milestone] = await Promise.all([
          cycle.drawRequestId ? ctx.db.get(cycle.drawRequestId) : null,
          cycle.milestoneId ? ctx.db.get(cycle.milestoneId) : null,
        ]);
        decisionDependencyRows.push(
          ...[drawRequest, milestone].filter(isPresent)
        );
        const targetMatches =
          cycle.kind === "draw"
            ? Boolean(
                cycle.drawRequestId &&
                  !cycle.milestoneId &&
                  drawRequest &&
                  drawRequest.buildId === build._id &&
                  drawRequest.organizationId === organizationId &&
                  drawRequest.brokerageId === brokerageId
              )
            : Boolean(
                cycle.milestoneId &&
                  !cycle.drawRequestId &&
                  milestone &&
                  milestone.buildId === build._id &&
                  milestone.organizationId === organizationId &&
                  milestone.brokerageId === brokerageId
              );
        if (
          cycle.buildId !== build._id ||
          cycle.organizationId !== organizationId ||
          cycle.brokerageId !== brokerageId ||
          !targetMatches
        ) {
          issues.push(
            issueFor(
              proposal,
              "review_cycle_scope_conflict",
              "buildId",
              "lenderPortalReviewCycles",
              "A lender review cycle contradicts its Build, target, organization, or Brokerage scope.",
              String(cycle._id)
            )
          );
        }
      }
    }
    fingerprintRows.push({
      approvals: sortSnapshotRows(approvals),
      assignments: sortSnapshotRows(assignments),
      builder,
      builds: sortSnapshotRows(builds),
      cards: sortSnapshotRows(cards),
      closings: sortSnapshotRows(closings),
      decisionDependencies: sortSnapshotRows(decisionDependencyRows),
      openIssues: sortSnapshotRows(openIssues),
      policies: sortSnapshotRows(policies),
      proposal,
      revisions: sortSnapshotRows(revisions),
      locks: sortSnapshotRows(locks),
    });
  }
  const openReconciliationCandidates = await ctx.db
    .query("lenderOrganizationReconciliationCandidates")
    .withIndex("by_status", (query) => query.eq("status", "open"))
    .take(MAX_MANIFEST_RELATED_ROWS + 1);
  if (openReconciliationCandidates.length > MAX_MANIFEST_RELATED_ROWS) {
    throw new Error(
      "Phase 9 open lender reconciliation inventory exceeds its fail-closed boundary."
    );
  }
  const reconciliationCandidates = openReconciliationCandidates.filter(
    (candidate) => {
      if (candidate.organizationId !== undefined) {
        return candidate.organizationId === organizationId;
      }
      if (candidate.brokerageId !== undefined) {
        return candidate.brokerageId === brokerageId;
      }
      // A fully unscoped legacy candidate cannot be attributed safely. It
      // blocks every tenant release without disclosing its mutable source data.
      return true;
    }
  );
  counts.reconciliationCandidateCount = reconciliationCandidates.length;
  for (const candidate of reconciliationCandidates) {
    const hasExactTenantScope =
      candidate.organizationId === organizationId &&
      candidate.brokerageId === brokerageId;
    issues.push({
      code: hasExactTenantScope
        ? "open_lender_reconciliation_candidate"
        : "unscoped_lender_reconciliation_candidate",
      disposition: "open",
      field: "lenderOrganizationId",
      provenance: "lenderOrganizationReconciliationCandidates",
      reason: hasExactTenantScope
        ? candidate.reason
        : "An open legacy lender reconciliation candidate lacks complete tenant provenance and must be resolved before release.",
      sourceRecordId: hasExactTenantScope
        ? candidate.sourceRecordId
        : String(candidate._id),
      sourceTable: hasExactTenantScope
        ? candidate.sourceTable
        : "lenderOrganizationReconciliationCandidates",
    });
  }
  const workos = await collectWorkosProjectionFingerprint(ctx, organizationId);
  return {
    counts,
    inventoryFingerprint: await operationalRequestFingerprint({
      counts,
      fingerprintRows,
      issues,
      reconciliationCandidates: sortSnapshotRows(reconciliationCandidates),
      reviewCycleRows: sortSnapshotRows(reviewCycleRows),
    }),
    issues: deduplicateIssues(issues),
    workosProjectionFingerprint: workos.fingerprint,
    workosProjectionRowCount: workos.rowCount,
  };
}
