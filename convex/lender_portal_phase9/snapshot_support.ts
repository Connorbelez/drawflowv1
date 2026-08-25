import { operationalRequestFingerprint } from "../build_operational_idempotency.js";
import type { Doc, Id } from "../_generated/dataModel.js";
import {
  IssueSnapshot,
  MAX_MANIFEST_RELATED_ROWS,
  SnapshotCtx,
  boundedReason,
  deduplicateIssues,
  exactHex,
  getScopedMigrationRun,
  isPresent,
  issueFor,
  safeObject,
  sortSnapshotRows,
} from "./shared.js";

export async function approvalIssueForSnapshot(
  ctx: SnapshotCtx,
  proposal: Doc<"buildProposals">,
  approval: Doc<"proposalLenderApprovals">
): Promise<IssueSnapshot | null> {
  const assignment = await ctx.db.get(approval.assignmentId);
  const cycle = approval.confirmationCycleId
    ? await ctx.db.get(approval.confirmationCycleId)
    : null;
  const ownershipMatches = Boolean(
    assignment &&
      (String(approval.lenderOrganizationId) ===
        String(assignment.lenderOrganizationId) ||
        String(approval.lenderOrganizationId) ===
          assignment.legacyLenderOrganizationId ||
        approval.legacyLenderOrganizationId ===
          assignment.legacyLenderOrganizationId)
  );
  if (
    approval.organizationId !== proposal.organizationId ||
    approval.brokerageId !== proposal.brokerageId ||
    !assignment ||
    assignment.proposalId !== proposal._id ||
    assignment.organizationId !== proposal.organizationId ||
    assignment.brokerageId !== proposal.brokerageId ||
    !ownershipMatches ||
    (approval.confirmationCycleId !== undefined &&
      (!cycle ||
        cycle.proposalId !== proposal._id ||
        cycle.organizationId !== proposal.organizationId ||
        cycle.brokerageId !== proposal.brokerageId ||
        cycle.assignmentId !== assignment._id ||
        (cycle.decisionId !== undefined && cycle.decisionId !== approval._id)))
  ) {
    return issueFor(
      proposal,
      "approval_scope_conflict",
      "assignmentId",
      "proposalLenderApprovals",
      "Approval ownership conflicts with proposal, tenant, assignment, lender organization, or confirmation-cycle scope.",
      String(approval._id)
    );
  }
  if (
    (approval.proposalRevisionId === undefined) !==
    (approval.proposalRevisionNumber === undefined)
  ) {
    return issueFor(
      proposal,
      "approval_partial_revision_pointer",
      "proposalRevisionId",
      "proposalLenderApprovals",
      "Approval contains a contradictory partial revision pointer.",
      String(approval._id)
    );
  }
  let revision: Doc<"proposalRevisions"> | null = null;
  if (
    approval.proposalRevisionId &&
    approval.proposalRevisionNumber !== undefined
  ) {
    revision = await ctx.db.get(approval.proposalRevisionId);
  } else if (cycle) {
    revision = await ctx.db.get(cycle.proposalRevisionId);
  } else {
    const decisionAt =
      approval.status === "approved"
        ? approval.approvedAt
        : approval.declinedAt;
    if (decisionAt === undefined) {
      return issueFor(
        proposal,
        "approval_explicit_evidence_missing",
        "approvedAt",
        "proposalLenderApprovals",
        "Approval has no explicit decision timestamp or confirmation-cycle revision.",
        String(approval._id)
      );
    }
    const candidates = await ctx.db
      .query("proposalRevisions")
      .withIndex("by_assignment_and_created_at", (query) =>
        query.eq("assignmentId", assignment._id).lte("createdAt", decisionAt)
      )
      .order("desc")
      .take(2);
    if (
      candidates.length > 1 &&
      candidates[0]?.createdAt === candidates[1]?.createdAt
    ) {
      return issueFor(
        proposal,
        "approval_revision_time_ambiguous",
        "proposalRevisionId",
        "proposalLenderApprovals",
        "Multiple assignment revisions share the approval decision boundary.",
        String(approval._id)
      );
    }
    revision = candidates[0] ?? null;
  }
  const policy = revision
    ? await ctx.db.get(revision.reviewPolicyVersionId)
    : null;
  const revisionNumber =
    approval.proposalRevisionNumber ?? cycle?.proposalRevisionNumber;
  if (
    !revision ||
    revision.proposalId !== proposal._id ||
    revision.organizationId !== proposal.organizationId ||
    revision.brokerageId !== proposal.brokerageId ||
    revision.assignmentId !== assignment._id ||
    (revisionNumber !== undefined &&
      revision.revisionNumber !== revisionNumber) ||
    (cycle !== null && cycle.proposalRevisionId !== revision._id) ||
    !policy ||
    policy.proposalId !== proposal._id ||
    policy.organizationId !== proposal.organizationId ||
    policy.brokerageId !== proposal.brokerageId
  ) {
    return issueFor(
      proposal,
      "approval_revision_policy_scope_conflict",
      "proposalRevisionId",
      "proposalLenderApprovals",
      "Approval revision or policy is outside the exact proposal, tenant, assignment, or confirmation-cycle scope.",
      String(approval._id)
    );
  }
  return null;
}

export async function policyLockIssueForSnapshot(
  ctx: SnapshotCtx,
  input: {
    builds: Doc<"activeBuilds">[];
    closings: Doc<"proposalClosings">[];
    currentAssignments: Doc<"proposalLenderAssignments">[];
    locks: Doc<"proposalReviewPolicyLocks">[];
    policyCandidate: Doc<"proposalReviewPolicyVersions"> | null;
    proposal: Doc<"buildProposals">;
    revisionCandidate: Doc<"proposalRevisions"> | null;
  }
): Promise<IssueSnapshot | null> {
  const { proposal } = input;
  if (proposal.status !== "closed") {
    return input.locks.length > 0
      ? issueFor(
          proposal,
          "non_closed_policy_lock",
          "lockedReviewPolicyId",
          "proposalClosings",
          "A non-closed proposal has immutable policy-lock history.",
          String(proposal._id)
        )
      : null;
  }
  const closing = input.closings[0];
  if (!closing || input.closings.length !== 1) return null;
  if (
    input.locks.length > 1 ||
    (proposal.lockedReviewPolicyId !== undefined &&
      closing.reviewPolicyLockId !== undefined &&
      proposal.lockedReviewPolicyId !== closing.reviewPolicyLockId)
  ) {
    return issueFor(
      proposal,
      "policy_lock_pointer_conflict",
      "lockedReviewPolicyId",
      "proposalClosings",
      "Policy-lock rows or stored closing/proposal pointers are contradictory.",
      String(proposal._id)
    );
  }
  const lock = proposal.lockedReviewPolicyId
    ? await ctx.db.get(proposal.lockedReviewPolicyId)
    : closing.reviewPolicyLockId
      ? await ctx.db.get(closing.reviewPolicyLockId)
      : (input.locks[0] ?? null);
  if (!lock) {
    return input.currentAssignments.length === 0 &&
      input.policyCandidate &&
      input.revisionCandidate &&
      input.revisionCandidate.assignmentId === undefined
      ? null
      : issueFor(
          proposal,
          "policy_lock_history_unprovable",
          "lockedReviewPolicyId",
          "proposalClosings",
          "Historical lender eligibility or exact policy/revision scope cannot prove an immutable closing lock.",
          String(proposal._id)
        );
  }
  const [policy, revision, assignment] = await Promise.all([
    ctx.db.get(lock.policyVersionId),
    ctx.db.get(lock.proposalRevisionId),
    lock.assignmentId ? ctx.db.get(lock.assignmentId) : null,
  ]);
  const build = proposal.activeBuildId
    ? await ctx.db.get(proposal.activeBuildId)
    : (input.builds[0] ?? null);
  const policySnapshotMatches = policy
    ? (await operationalRequestFingerprint(lock.policy)) ===
      (await operationalRequestFingerprint(policy.policy))
    : false;
  if (
    lock.proposalId !== proposal._id ||
    lock.organizationId !== proposal.organizationId ||
    lock.brokerageId !== proposal.brokerageId ||
    proposal.currentReviewPolicyVersionId !== lock.policyVersionId ||
    proposal.currentProposalRevisionId !== lock.proposalRevisionId ||
    proposal.currentProposalRevisionNumber !== lock.proposalRevisionNumber ||
    !policy ||
    policy.proposalId !== proposal._id ||
    policy.organizationId !== proposal.organizationId ||
    policy.brokerageId !== proposal.brokerageId ||
    !revision ||
    revision.proposalId !== proposal._id ||
    revision.organizationId !== proposal.organizationId ||
    revision.brokerageId !== proposal.brokerageId ||
    revision.reviewPolicyVersionId !== policy._id ||
    revision.revisionNumber !== lock.proposalRevisionNumber ||
    !policySnapshotMatches ||
    (lock.assignmentId !== undefined &&
      (!assignment ||
        assignment.proposalId !== proposal._id ||
        assignment.organizationId !== proposal.organizationId ||
        assignment.brokerageId !== proposal.brokerageId ||
        revision.assignmentId !== assignment._id ||
        String(lock.lenderOrganizationId) !==
          String(assignment.lenderOrganizationId))) ||
    (lock.assignmentId === undefined && revision.assignmentId !== undefined) ||
    (build !== null &&
      (build.proposalId !== proposal._id ||
        build.organizationId !== proposal.organizationId ||
        build.brokerageId !== proposal.brokerageId ||
        (build.reviewPolicyLockId !== undefined &&
          build.reviewPolicyLockId !== lock._id)))
  ) {
    return issueFor(
      proposal,
      "policy_lock_scope_conflict",
      "lockedReviewPolicyId",
      "proposalClosings",
      "Policy lock conflicts with closing, policy, revision, assignment, lender organization, Build, or tenant scope.",
      String(lock._id)
    );
  }
  return null;
}

function enforceRelatedRowBound<T>(table: string, rows: T[]): T[] {
  if (rows.length > MAX_MANIFEST_RELATED_ROWS) {
    throw new Error(`Phase 9 ${table} inventory exceeds its exact boundary.`);
  }
  return rows;
}

export async function boundedProposalClosings(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
): Promise<Doc<"proposalClosings">[]> {
  return enforceRelatedRowBound(
    "proposalClosings",
    await ctx.db
      .query("proposalClosings")
      .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
      .take(MAX_MANIFEST_RELATED_ROWS + 1)
  );
}

export async function boundedActiveBuilds(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
): Promise<Doc<"activeBuilds">[]> {
  return enforceRelatedRowBound(
    "activeBuilds",
    await ctx.db
      .query("activeBuilds")
      .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
      .take(MAX_MANIFEST_RELATED_ROWS + 1)
  );
}

export async function boundedProposalLenderApprovals(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
): Promise<Doc<"proposalLenderApprovals">[]> {
  return enforceRelatedRowBound(
    "proposalLenderApprovals",
    await ctx.db
      .query("proposalLenderApprovals")
      .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
      .take(MAX_MANIFEST_RELATED_ROWS + 1)
  );
}

export async function boundedProposalReviewPolicyVersions(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
): Promise<Doc<"proposalReviewPolicyVersions">[]> {
  return enforceRelatedRowBound(
    "proposalReviewPolicyVersions",
    await ctx.db
      .query("proposalReviewPolicyVersions")
      .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
      .take(MAX_MANIFEST_RELATED_ROWS + 1)
  );
}

export async function boundedProposalRevisions(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
): Promise<Doc<"proposalRevisions">[]> {
  return enforceRelatedRowBound(
    "proposalRevisions",
    await ctx.db
      .query("proposalRevisions")
      .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
      .take(MAX_MANIFEST_RELATED_ROWS + 1)
  );
}

export async function boundedProposalReviewPolicyLocks(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
): Promise<Doc<"proposalReviewPolicyLocks">[]> {
  return enforceRelatedRowBound(
    "proposalReviewPolicyLocks",
    await ctx.db
      .query("proposalReviewPolicyLocks")
      .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
      .take(MAX_MANIFEST_RELATED_ROWS + 1)
  );
}

export async function boundedProposalKanbanCards(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
): Promise<Doc<"proposalKanbanCards">[]> {
  return enforceRelatedRowBound(
    "proposalKanbanCards",
    await ctx.db
      .query("proposalKanbanCards")
      .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
      .take(MAX_MANIFEST_RELATED_ROWS + 1)
  );
}

export async function boundedAllAssignments(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
) {
  const rows = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
    .take(MAX_MANIFEST_RELATED_ROWS + 1);
  if (rows.length > MAX_MANIFEST_RELATED_ROWS) {
    throw new Error("Phase 9 assignment history exceeds its exact boundary.");
  }
  return rows;
}

export async function boundedCurrentAssignments(
  ctx: SnapshotCtx,
  proposalId: Id<"buildProposals">
) {
  const rows = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal_status", (query) =>
      query.eq("proposalId", proposalId).eq("status", "current")
    )
    .take(MAX_MANIFEST_RELATED_ROWS + 1);
  if (rows.length > MAX_MANIFEST_RELATED_ROWS) {
    throw new Error("Phase 9 assignment inventory exceeds its exact boundary.");
  }
  return rows;
}

export async function collectWorkosProjectionFingerprint(
  ctx: SnapshotCtx,
  organizationId: string
) {
  const [organization, memberships, organizationRoles] = await Promise.all([
    ctx.db
      .query("workosOrganizations")
      .withIndex("by_workos_organization_id", (query) =>
        query.eq("workosOrganizationId", organizationId)
      )
      .unique(),
    ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_organization", (query) =>
        query.eq("workosOrganizationId", organizationId)
      )
      .take(MAX_MANIFEST_RELATED_ROWS + 1),
    ctx.db
      .query("workosOrganizationRoles")
      .withIndex("by_organization_slug", (query) =>
        query.eq("workosOrganizationId", organizationId)
      )
      .take(MAX_MANIFEST_RELATED_ROWS + 1),
  ]);
  if (
    memberships.length > MAX_MANIFEST_RELATED_ROWS ||
    organizationRoles.length > MAX_MANIFEST_RELATED_ROWS
  ) {
    throw new Error(
      "Phase 9 WorkOS projection inventory exceeds its exact boundary."
    );
  }
  const userIds = [
    ...new Set(memberships.map((row) => row.workosUserId)),
  ].sort();
  const roleSlugs = [
    ...new Set([
      ...memberships.flatMap((row) => [
        ...(row.roleSlug ? [row.roleSlug] : []),
        ...row.roleSlugs,
      ]),
      ...organizationRoles.map((row) => row.slug),
    ]),
  ].sort();
  const users = await Promise.all(
    userIds.map((workosUserId) =>
      ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (query) =>
          query.eq("workosUserId", workosUserId)
        )
        .unique()
    )
  );
  const roleRows = await Promise.all(
    roleSlugs.map(async (slug) => {
      const rows = await ctx.db
        .query("workosRoles")
        .withIndex("by_slug", (query) => query.eq("slug", slug))
        .take(2);
      if (rows.length > 1) {
        throw new Error("Phase 9 WorkOS role projection is ambiguous.");
      }
      return rows[0] ?? null;
    })
  );
  const permissionSlugs = [
    ...new Set([
      ...organizationRoles.flatMap((row) => row.permissionSlugs),
      ...roleRows.filter(Boolean).flatMap((row) => row!.permissionSlugs),
    ]),
  ].sort();
  const permissionRows = await Promise.all(
    permissionSlugs.map(async (slug) => {
      const rows = await ctx.db
        .query("workosPermissions")
        .withIndex("by_slug", (query) => query.eq("slug", slug))
        .take(2);
      if (rows.length > 1) {
        throw new Error("Phase 9 WorkOS permission projection is ambiguous.");
      }
      return rows[0] ?? null;
    })
  );
  const rows = {
    memberships: memberships.map((row) => ({
      id: row.workosMembershipId,
      roleSlugs: row.roleSlugs,
      sourceEventId: row.sourceEventId,
      status: row.status,
      userId: row.workosUserId,
    })),
    organization: organization
      ? {
          id: organization.workosOrganizationId,
          sourceEventId: organization.sourceEventId,
          status: organization.status,
        }
      : null,
    organizationRoles: organizationRoles.map((row) => ({
      permissionSlugs: row.permissionSlugs,
      slug: row.slug,
      sourceEventId: row.sourceEventId,
      status: row.status,
    })),
    permissions: permissionRows.filter(Boolean).map((row) => ({
      id: row!.workosPermissionId ?? null,
      slug: row!.slug,
      sourceEventId: row!.sourceEventId,
      status: row!.status,
    })),
    roles: roleRows.filter(Boolean).map((row) => ({
      permissionSlugs: row!.permissionSlugs,
      slug: row!.slug,
      sourceEventId: row!.sourceEventId,
      status: row!.status,
    })),
    users: users.filter(Boolean).map((row) => ({
      id: row!.workosUserId,
      sourceEventId: row!.sourceEventId,
      status: row!.status,
      updatedAt: row!.updatedAt,
    })),
  };
  return {
    fingerprint: await operationalRequestFingerprint(rows),
    rowCount:
      (organization ? 1 : 0) +
      memberships.length +
      organizationRoles.length +
      roleRows.filter(Boolean).length +
      permissionRows.filter(Boolean).length +
      users.filter(Boolean).length,
  };
}
