import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { operationalRequestFingerprint } from "./build_operational_idempotency";
import {
  type LenderPortalPhase9MigrationCounts,
  lenderPortalPhase9MigrationCountsValidator,
} from "./lender_portal_phase9_contracts";
import {
  requireTenantReleaseOperator,
  requireTrustedRuntimeReleaseProvenance,
} from "./lender_portal_release";
import type { MutationCtx, QueryCtx } from "./types";

const MAX_INVENTORY_PAGE_SIZE = 25;
const MAX_MANIFEST_PROPOSALS = 100;
const MAX_MANIFEST_RELATED_ROWS = 500;

const proposalInventoryValidator = v.object({
  activeBuildCount: v.number(),
  approvalCount: v.number(),
  ambiguityCodes: v.array(v.string()),
  approvedAtRecorded: v.boolean(),
  candidateSha: v.string(),
  closingCount: v.number(),
  currentAssignmentCount: v.number(),
  currentReviewCycleCount: v.number(),
  kanbanCardCount: v.number(),
  openIssueCount: v.number(),
  policyVersionCount: v.number(),
  policyLockCount: v.number(),
  projectionMatches: v.boolean(),
  proposalId: v.id("buildProposals"),
  reviewQueueCounts: v.object({
    completed: v.number(),
    correctionRequired: v.number(),
    inReview: v.number(),
    partialApproval: v.number(),
  }),
  revisionCount: v.number(),
  status: v.string(),
});

const migrationAuditReadbackValidator = v.object({
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.string(),
  candidateSha: v.optional(v.string()),
  command: v.string(),
  correlationId: v.optional(v.string()),
  createdAt: v.number(),
  entityId: v.string(),
  entityType: v.string(),
  eventType: v.string(),
  newState: v.optional(v.string()),
  priorState: v.optional(v.string()),
  reconciliationKey: v.string(),
  runToken: v.string(),
  warnings: v.array(v.string()),
});

const migrationIssueSnapshotValidator = v.object({
  code: v.string(),
  disposition: v.union(v.literal("open"), v.literal("resolved")),
  field: v.string(),
  provenance: v.string(),
  reason: v.string(),
  sourceRecordId: v.string(),
  sourceTable: v.string(),
});

const migrationRunValidator = v.object({
  candidateSha: v.string(),
  configurationHash: v.string(),
  issueCount: v.number(),
  runToken: v.string(),
  status: v.union(
    v.literal("blocked"),
    v.literal("ready"),
    v.literal("authorized"),
    v.literal("applying"),
    v.literal("verified")
  ),
  workosProjectionWriteCount: v.optional(v.number()),
});

const migrationRunReadbackValidator = v.object({
  active: v.boolean(),
  candidateSha: v.string(),
  configurationHash: v.string(),
  countsAfter: v.optional(lenderPortalPhase9MigrationCountsValidator),
  countsBefore: lenderPortalPhase9MigrationCountsValidator,
  createdAt: v.number(),
  inventoryFingerprint: v.string(),
  inventoryFingerprintAfter: v.optional(v.string()),
  issueCount: v.number(),
  reason: v.string(),
  runToken: v.string(),
  status: v.union(
    v.literal("blocked"),
    v.literal("ready"),
    v.literal("authorized"),
    v.literal("applying"),
    v.literal("verified")
  ),
  updatedAt: v.number(),
  updatedByWorkosUserId: v.string(),
  verifiedAt: v.optional(v.number()),
  workosProjectionFingerprintAfter: v.optional(v.string()),
  workosProjectionFingerprintBefore: v.string(),
  workosProjectionRowCount: v.number(),
  workosProjectionWriteCount: v.optional(v.number()),
});

/**
 * Authenticated, paginated Phase 9 dry-run inventory. Operators must drain all
 * pages and sum counts before authorizing the migration runner. Every returned
 * ambiguity is a stop condition; the query never mutates candidate data.
 */
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

/** Authenticated readback of the additive Phase 9 migration audit trail. */
export const readLenderPortalPhase9MigrationAudit = authenticatedQuery
  .input({
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
    runToken: v.string(),
  })
  .returns(paginationResultValidator(migrationAuditReadbackValidator))
  .handler(async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > MAX_INVENTORY_PAGE_SIZE
    ) {
      throw new Error(
        `Phase 9 migration audit page size must be 1 to ${MAX_INVENTORY_PAGE_SIZE}.`
      );
    }
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    const page = await ctx.db
      .query("auditEvents")
      .withIndex(
        "by_organizationId_and_phase9RunToken_and_createdAt",
        (query) =>
          query
            .eq("organizationId", scope.organizationId)
            .eq("phase9RunToken", args.runToken)
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((event) => {
        if (
          !event.reconciliationKey ||
          event.phase9RunToken !== args.runToken ||
          event.brokerageId !== scope.brokerageId
        ) {
          throw new Error("Phase 9 migration audit scope is inconsistent.");
        }
        const state = safeObject(event.newState);
        return {
          actorRoles: event.actorRoles,
          actorWorkosUserId: event.actorWorkosUserId,
          candidateSha:
            typeof state?.candidateSha === "string"
              ? state.candidateSha
              : undefined,
          command: event.command,
          correlationId: event.drawFlowCorrelationId,
          createdAt: event.createdAt,
          entityId: event.entityId,
          entityType: event.entityType,
          eventType: event.eventType,
          newState: event.newState,
          priorState: event.priorState,
          reconciliationKey: event.reconciliationKey,
          runToken: args.runToken,
          warnings: event.warnings,
        };
      }),
    };
  })
  .public();

export const prepareLenderPortalPhase9MigrationRun = authenticatedMutation
  .input({
    candidateSha: v.string(),
    configurationHash: v.string(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(migrationRunValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const candidateSha = exactHex(args.candidateSha, 40, "candidate SHA");
    const configurationHash = exactHex(
      args.configurationHash,
      64,
      "configuration hash"
    );
    const reason = boundedReason(args.reason);
    requireTrustedRuntimeReleaseProvenance(candidateSha, configurationHash);
    const release = await ctx.db
      .query("lenderPortalTenantReleaseControls")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", scope.organizationId)
      )
      .unique();
    if (
      !release ||
      release.status !== "disabled" ||
      release.brokerageId !== scope.brokerageId ||
      release.candidateSha !== candidateSha ||
      release.configurationHash !== configurationHash
    ) {
      throw new Error(
        "Phase 9 migration preparation requires the exact candidate and configuration in disabled state."
      );
    }
    const snapshot = await collectMigrationSnapshot(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    const runToken = await operationalRequestFingerprint({
      brokerageId: String(scope.brokerageId),
      candidateSha,
      configurationHash,
      counts: snapshot.counts,
      inventoryFingerprint: snapshot.inventoryFingerprint,
      organizationId: scope.organizationId,
      workosProjectionFingerprint: snapshot.workosProjectionFingerprint,
    });
    const existingRuns = await ctx.db
      .query("lenderPortalPhase9MigrationRuns")
      .withIndex("by_organizationId_and_runToken", (query) =>
        query
          .eq("organizationId", scope.organizationId)
          .eq("runToken", runToken)
      )
      .take(2);
    if (existingRuns.length > 1) {
      throw new Error(
        "Phase 9 deterministic run token has duplicate manifests."
      );
    }
    if (existingRuns[0]) {
      if (existingRuns[0].brokerageId !== scope.brokerageId) {
        throw new Error("Forbidden: Phase 9 migration run Brokerage scope.");
      }
      return publicMigrationRun(existingRuns[0]);
    }
    const active = await ctx.db
      .query("lenderPortalPhase9MigrationRuns")
      .withIndex("by_organizationId_and_active", (query) =>
        query.eq("organizationId", scope.organizationId).eq("active", true)
      )
      .unique();
    if (active && active.brokerageId !== scope.brokerageId) {
      throw new Error("Forbidden: Phase 9 migration run Brokerage scope.");
    }
    if (
      active &&
      (active.status === "ready" ||
        active.status === "authorized" ||
        active.status === "applying")
    ) {
      throw new Error(
        "An active Phase 9 migration run must be verified or blocked before another inventory is prepared."
      );
    }
    if (active) {
      await ctx.db.patch(active._id, { active: false, updatedAt: Date.now() });
    }
    const now = Date.now();
    const status = snapshot.issues.length === 0 ? "ready" : "blocked";
    const runId = await ctx.db.insert("lenderPortalPhase9MigrationRuns", {
      active: true,
      brokerageId: scope.brokerageId,
      candidateSha,
      configurationHash,
      countsBefore: snapshot.counts,
      createdAt: now,
      inventoryFingerprint: snapshot.inventoryFingerprint,
      issueCount: snapshot.issues.length,
      issueSnapshots: snapshot.issues,
      organizationId: scope.organizationId,
      reason,
      runToken,
      status,
      updatedAt: now,
      updatedByWorkosUserId: scope.workosUserId,
      workosProjectionFingerprintBefore: snapshot.workosProjectionFingerprint,
      workosProjectionRowCount: snapshot.workosProjectionRowCount,
    });
    await recordMigrationRunAudit(ctx, {
      actorRoles: scope.roles,
      actorWorkosUserId: scope.workosUserId,
      brokerageId: scope.brokerageId,
      candidateSha,
      configurationHash,
      eventType: "lender_portal.migration.inventory_recorded",
      issueCount: snapshot.issues.length,
      organizationId: scope.organizationId,
      reason,
      runId,
      runToken,
      status,
    });
    return {
      candidateSha,
      configurationHash,
      issueCount: snapshot.issues.length,
      runToken,
      status,
      workosProjectionWriteCount: undefined,
    };
  })
  .public();

export const authorizeLenderPortalPhase9MigrationRun = authenticatedMutation
  .input({
    organizationId: v.string(),
    reason: v.string(),
    runToken: v.string(),
  })
  .returns(migrationRunValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    requireTrustedRuntimeReleaseProvenance(
      run.candidateSha,
      run.configurationHash
    );
    if (run.status !== "ready") {
      throw new Error("Only a ready Phase 9 migration run can be authorized.");
    }
    const reason = boundedReason(args.reason);
    const release = await ctx.db
      .query("lenderPortalTenantReleaseControls")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", scope.organizationId)
      )
      .unique();
    if (
      !release ||
      release.status !== "disabled" ||
      release.brokerageId !== scope.brokerageId ||
      release.candidateSha !== run.candidateSha ||
      release.configurationHash !== run.configurationHash
    ) {
      throw new Error(
        "The migration run no longer matches the disabled release control."
      );
    }
    const snapshot = await collectMigrationSnapshot(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    if (!snapshotMatchesPreparedRun(run, snapshot)) {
      await ctx.db.patch(run._id, {
        countsAfter: snapshot.counts,
        inventoryFingerprintAfter: snapshot.inventoryFingerprint,
        issueCount: snapshot.issues.length,
        issueSnapshots: snapshot.issues,
        status: "blocked",
        updatedAt: Date.now(),
        updatedByWorkosUserId: scope.workosUserId,
        workosProjectionFingerprintAfter: snapshot.workosProjectionFingerprint,
      });
      await recordMigrationRunAudit(ctx, {
        actorRoles: scope.roles,
        actorWorkosUserId: scope.workosUserId,
        brokerageId: scope.brokerageId,
        candidateSha: run.candidateSha,
        configurationHash: run.configurationHash,
        eventType: "lender_portal.migration.authorization_blocked",
        inventoryFingerprint: run.inventoryFingerprint,
        issueCount: snapshot.issues.length,
        observedInventoryFingerprint: snapshot.inventoryFingerprint,
        observedWorkosProjectionFingerprint:
          snapshot.workosProjectionFingerprint,
        organizationId: scope.organizationId,
        priorStatus: run.status,
        reason,
        runId: run._id,
        runToken: run.runToken,
        status: "blocked",
        warnings: ["migration_snapshot_drift"],
        workosProjectionFingerprint: run.workosProjectionFingerprintBefore,
      });
      return publicMigrationRun({
        ...run,
        issueCount: snapshot.issues.length,
        status: "blocked",
      });
    }
    const otherAuthorizedRuns = (
      await Promise.all(
        (["authorized", "applying"] as const).map((status) =>
          ctx.db
            .query("lenderPortalPhase9MigrationRuns")
            .withIndex("by_status_and_active", (query) =>
              query.eq("status", status).eq("active", true)
            )
            .take(2)
        )
      )
    ).flat();
    if (otherAuthorizedRuns.some((candidate) => candidate._id !== run._id)) {
      throw new Error(
        "Another tenant has an active authorized Phase 9 migration run; complete or block it before authorizing this run."
      );
    }
    await ctx.db.patch(run._id, {
      reason,
      status: "authorized",
      updatedAt: Date.now(),
      updatedByWorkosUserId: scope.workosUserId,
    });
    await recordMigrationRunAudit(ctx, {
      actorRoles: scope.roles,
      actorWorkosUserId: scope.workosUserId,
      brokerageId: scope.brokerageId,
      candidateSha: run.candidateSha,
      configurationHash: run.configurationHash,
      eventType: "lender_portal.migration.authorized",
      issueCount: 0,
      organizationId: scope.organizationId,
      priorStatus: run.status,
      reason,
      runId: run._id,
      runToken: run.runToken,
      status: "authorized",
    });
    return publicMigrationRun({ ...run, status: "authorized" });
  })
  .public();

export const verifyLenderPortalPhase9MigrationRun = authenticatedMutation
  .input({
    organizationId: v.string(),
    reason: v.string(),
    runToken: v.string(),
  })
  .returns(migrationRunValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    requireTrustedRuntimeReleaseProvenance(
      run.candidateSha,
      run.configurationHash
    );
    if (run.status !== "applying") {
      throw new Error(
        "Only an applying Phase 9 migration run can be verified."
      );
    }
    const release = await ctx.db
      .query("lenderPortalTenantReleaseControls")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", scope.organizationId)
      )
      .unique();
    if (
      !release ||
      release.status !== "disabled" ||
      release.brokerageId !== scope.brokerageId ||
      release.candidateSha !== run.candidateSha ||
      release.configurationHash !== run.configurationHash
    ) {
      throw new Error(
        "Phase 9 migration verification requires the exact disabled release control."
      );
    }
    const snapshot = await collectMigrationSnapshot(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    const workosUnchanged =
      snapshot.workosProjectionFingerprint ===
        run.workosProjectionFingerprintBefore &&
      snapshot.workosProjectionRowCount === run.workosProjectionRowCount;
    const countsBefore = run.countsBefore;
    const countsAfter = snapshot.counts;
    const canonicalCountsMatch =
      countsBefore.proposalCount === countsAfter.proposalCount &&
      countsBefore.closingCount === countsAfter.closingCount &&
      countsBefore.activeBuildCount === countsAfter.activeBuildCount &&
      countsBefore.assignmentCount === countsAfter.assignmentCount &&
      countsBefore.policyVersionCount === countsAfter.policyVersionCount &&
      countsBefore.revisionCount === countsAfter.revisionCount &&
      countsBefore.reviewCycleCount === countsAfter.reviewCycleCount;
    const projectionsReconciled =
      countsAfter.kanbanCardCount === countsAfter.proposalCount &&
      countsAfter.projectionMismatchCount === 0;
    const reconciliationComplete = countsAfter.reconciliationPendingCount === 0;
    const verified =
      workosUnchanged &&
      canonicalCountsMatch &&
      projectionsReconciled &&
      reconciliationComplete &&
      snapshot.issues.length === 0;
    const now = Date.now();
    const reason = boundedReason(args.reason);
    await ctx.db.patch(run._id, {
      countsAfter: snapshot.counts,
      inventoryFingerprintAfter: snapshot.inventoryFingerprint,
      issueCount: snapshot.issues.length,
      issueSnapshots: snapshot.issues,
      status: verified ? "verified" : "blocked",
      updatedAt: now,
      verifiedAt: verified ? now : undefined,
      workosProjectionFingerprintAfter: snapshot.workosProjectionFingerprint,
      workosProjectionWriteCount: workosUnchanged ? 0 : undefined,
    });
    await recordMigrationRunAudit(ctx, {
      actorRoles: scope.roles,
      actorWorkosUserId: scope.workosUserId,
      brokerageId: scope.brokerageId,
      candidateSha: run.candidateSha,
      configurationHash: run.configurationHash,
      eventType: verified
        ? "lender_portal.migration.verified"
        : "lender_portal.migration.verification_blocked",
      issueCount: snapshot.issues.length,
      organizationId: scope.organizationId,
      priorStatus: run.status,
      reason,
      runId: run._id,
      runToken: run.runToken,
      status: verified ? "verified" : "blocked",
    });
    return {
      ...publicMigrationRun(run),
      issueCount: snapshot.issues.length,
      status: verified ? "verified" : "blocked",
      workosProjectionWriteCount: workosUnchanged ? 0 : undefined,
    };
  })
  .public();

export const getLenderPortalPhase9MigrationRun = authenticatedQuery
  .input({ organizationId: v.string(), runToken: v.string() })
  .returns(migrationRunReadbackValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    return {
      active: run.active,
      candidateSha: run.candidateSha,
      configurationHash: run.configurationHash,
      countsAfter: run.countsAfter,
      countsBefore: run.countsBefore,
      createdAt: run.createdAt,
      inventoryFingerprint: run.inventoryFingerprint,
      inventoryFingerprintAfter: run.inventoryFingerprintAfter,
      issueCount: run.issueCount,
      reason: run.reason,
      runToken: run.runToken,
      status: run.status,
      updatedAt: run.updatedAt,
      updatedByWorkosUserId: run.updatedByWorkosUserId,
      verifiedAt: run.verifiedAt,
      workosProjectionFingerprintAfter: run.workosProjectionFingerprintAfter,
      workosProjectionFingerprintBefore: run.workosProjectionFingerprintBefore,
      workosProjectionRowCount: run.workosProjectionRowCount,
      workosProjectionWriteCount: run.workosProjectionWriteCount,
    };
  })
  .public();

export const listLenderPortalPhase9MigrationIssues = authenticatedQuery
  .input({
    cursor: v.optional(v.string()),
    limit: v.number(),
    organizationId: v.string(),
    runToken: v.string(),
  })
  .returns(
    v.object({
      continueCursor: v.union(v.string(), v.null()),
      isDone: v.boolean(),
      page: v.array(migrationIssueSnapshotValidator),
      total: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    if (
      !Number.isSafeInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > 25
    ) {
      throw new Error("Phase 9 migration issue page size must be 1 to 25.");
    }
    const offset = args.cursor ? Number(args.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error("Phase 9 migration issue cursor is invalid.");
    }
    const end = Math.min(run.issueSnapshots.length, offset + args.limit);
    return {
      continueCursor: end < run.issueSnapshots.length ? String(end) : null,
      isDone: end >= run.issueSnapshots.length,
      page: run.issueSnapshots.slice(offset, end),
      total: run.issueCount,
    };
  })
  .public();

export async function requireAuthorizedLenderPortalPhase9Migration(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">
) {
  const run = await ctx.db
    .query("lenderPortalPhase9MigrationRuns")
    .withIndex("by_organizationId_and_active", (query) =>
      query.eq("organizationId", proposal.organizationId).eq("active", true)
    )
    .unique();
  const release = await ctx.db
    .query("lenderPortalTenantReleaseControls")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", proposal.organizationId)
    )
    .unique();
  if (!run) {
    // The registered migration scans the global table. Tenants without an
    // active run are outside this operator-authorized execution and are a
    // deliberate no-op, not an apply failure.
    return null;
  }
  requireTrustedRuntimeReleaseProvenance(
    run.candidateSha,
    run.configurationHash
  );
  const globallyRunning = (
    await Promise.all(
      (["authorized", "applying"] as const).map((status) =>
        ctx.db
          .query("lenderPortalPhase9MigrationRuns")
          .withIndex("by_status_and_active", (query) =>
            query.eq("status", status).eq("active", true)
          )
          .take(2)
      )
    )
  ).flat();
  if (
    (run.status !== "authorized" && run.status !== "applying") ||
    globallyRunning.length !== 1 ||
    globallyRunning[0]?._id !== run._id ||
    run.brokerageId !== proposal.brokerageId ||
    !release ||
    release.status !== "disabled" ||
    release.candidateSha !== run.candidateSha ||
    release.configurationHash !== run.configurationHash
  ) {
    throw new Error(
      "Phase 9 migration apply requires an authorized exact-candidate inventory run in disabled state."
    );
  }
  if (run.status === "authorized") {
    const snapshot = await collectMigrationSnapshot(
      ctx,
      run.organizationId,
      run.brokerageId
    );
    if (!snapshotMatchesPreparedRun(run, snapshot)) {
      throw new Error(
        "Phase 9 migration apply snapshot drifted from its persisted manifest."
      );
    }
  }
  return run;
}

export async function beginLenderPortalPhase9MigrationApply(
  ctx: MutationCtx,
  run: Doc<"lenderPortalPhase9MigrationRuns">
) {
  if (!run.active || run.status !== "authorized") return false;
  requireTrustedRuntimeReleaseProvenance(
    run.candidateSha,
    run.configurationHash
  );
  const release = await ctx.db
    .query("lenderPortalTenantReleaseControls")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", run.organizationId)
    )
    .unique();
  const globallyAuthorized = await ctx.db
    .query("lenderPortalPhase9MigrationRuns")
    .withIndex("by_status_and_active", (query) =>
      query.eq("status", "authorized").eq("active", true)
    )
    .take(2);
  const snapshot = await collectMigrationSnapshot(
    ctx,
    run.organizationId,
    run.brokerageId
  );
  const releaseMatches = Boolean(
    release &&
      release.status === "disabled" &&
      release.brokerageId === run.brokerageId &&
      release.candidateSha === run.candidateSha &&
      release.configurationHash === run.configurationHash
  );
  const exact =
    releaseMatches &&
    globallyAuthorized.length === 1 &&
    globallyAuthorized[0]?._id === run._id &&
    snapshotMatchesPreparedRun(run, snapshot);
  const now = Date.now();
  if (!exact) {
    await ctx.db.patch(run._id, {
      countsAfter: snapshot.counts,
      inventoryFingerprintAfter: snapshot.inventoryFingerprint,
      issueCount: snapshot.issues.length,
      issueSnapshots: snapshot.issues,
      status: "blocked",
      updatedAt: now,
      workosProjectionFingerprintAfter: snapshot.workosProjectionFingerprint,
    });
    await recordMigrationRunAudit(ctx, {
      actorRoles: ["system"],
      actorWorkosUserId: "system:lender-portal-phase9-migration",
      brokerageId: run.brokerageId,
      candidateSha: run.candidateSha,
      configurationHash: run.configurationHash,
      eventType: "lender_portal.migration.apply_blocked",
      inventoryFingerprint: run.inventoryFingerprint,
      issueCount: snapshot.issues.length,
      observedInventoryFingerprint: snapshot.inventoryFingerprint,
      observedWorkosProjectionFingerprint: snapshot.workosProjectionFingerprint,
      organizationId: run.organizationId,
      priorStatus: run.status,
      reason:
        "Apply preflight no longer matches the persisted exact-scope manifest.",
      runId: run._id,
      runToken: run.runToken,
      status: "blocked",
      warnings: [
        ...(releaseMatches ? [] : ["release_control_drift"]),
        ...(!snapshotMatchesPreparedRun(run, snapshot)
          ? ["migration_snapshot_drift"]
          : []),
      ],
      workosProjectionFingerprint: run.workosProjectionFingerprintBefore,
    });
    return false;
  }
  await ctx.db.patch(run._id, { status: "applying", updatedAt: now });
  await recordMigrationRunAudit(ctx, {
    actorRoles: ["system"],
    actorWorkosUserId: "system:lender-portal-phase9-migration",
    brokerageId: run.brokerageId,
    candidateSha: run.candidateSha,
    configurationHash: run.configurationHash,
    eventType: "lender_portal.migration.apply_started",
    inventoryFingerprint: run.inventoryFingerprint,
    issueCount: 0,
    organizationId: run.organizationId,
    priorStatus: run.status,
    reason: run.reason,
    runId: run._id,
    runToken: run.runToken,
    status: "applying",
    workosProjectionFingerprint: run.workosProjectionFingerprintBefore,
  });
  return true;
}

type SnapshotCtx = Pick<QueryCtx | MutationCtx, "db">;
interface Phase9DecisionDependencyRow {
  _id: unknown;
}
type IssueSnapshot = {
  code: string;
  disposition: "open" | "resolved";
  field: string;
  provenance: string;
  reason: string;
  sourceRecordId: string;
  sourceTable: string;
};

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
      ...[currentPolicy, currentRevision].filter(Boolean)
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
        ...[lenderOrganization, ...legacyCandidates].filter(Boolean)
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
        ].filter(Boolean)
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
        ...[lockPolicy, lockRevision, lockAssignment].filter(Boolean)
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
          ...[drawRequest, milestone].filter(Boolean)
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

function sortSnapshotRows<T extends { _id: unknown }>(rows: T[]) {
  return [...rows].sort((left, right) =>
    String(left._id).localeCompare(String(right._id))
  );
}

function snapshotMatchesPreparedRun(
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

async function approvalIssueForSnapshot(
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

async function policyLockIssueForSnapshot(
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

async function boundedProposalClosings(
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

async function boundedActiveBuilds(
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

async function boundedProposalLenderApprovals(
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

async function boundedProposalReviewPolicyVersions(
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

async function boundedProposalRevisions(
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

async function boundedProposalReviewPolicyLocks(
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

async function boundedProposalKanbanCards(
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

async function boundedAllAssignments(
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

async function boundedCurrentAssignments(
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

async function collectWorkosProjectionFingerprint(
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

function issueFor(
  proposal: Doc<"buildProposals">,
  code: string,
  field: string,
  sourceTable: string,
  reason: string,
  sourceRecordId = String(proposal._id)
): IssueSnapshot {
  return {
    code,
    disposition: "open",
    field,
    provenance: `${sourceTable}.${field}`,
    reason,
    sourceRecordId,
    sourceTable,
  };
}

function deduplicateIssues(issues: IssueSnapshot[]) {
  const deduplicated = [
    ...new Map(
      issues.map((issue) => [
        `${issue.code}:${issue.sourceTable}:${issue.sourceRecordId}:${issue.field}`,
        issue,
      ])
    ).values(),
  ];
  if (deduplicated.length > 200) {
    throw new Error(
      "Phase 9 actionable issue inventory exceeds its exact manifest boundary."
    );
  }
  return deduplicated;
}

async function getScopedMigrationRun(
  ctx: SnapshotCtx,
  organizationId: string,
  brokerageId: Id<"brokerages">,
  runToken: string
) {
  const run = await ctx.db
    .query("lenderPortalPhase9MigrationRuns")
    .withIndex("by_organizationId_and_runToken", (query) =>
      query.eq("organizationId", organizationId).eq("runToken", runToken)
    )
    .unique();
  if (!run) throw new Error("Phase 9 migration run is unavailable.");
  if (run.brokerageId !== brokerageId) {
    throw new Error("Forbidden: Phase 9 migration run Brokerage scope.");
  }
  return run;
}

function publicMigrationRun(run: {
  candidateSha: string;
  configurationHash: string;
  issueCount: number;
  runToken: string;
  status: "blocked" | "ready" | "authorized" | "applying" | "verified";
  workosProjectionWriteCount?: number;
}) {
  return {
    candidateSha: run.candidateSha,
    configurationHash: run.configurationHash,
    issueCount: run.issueCount,
    runToken: run.runToken,
    status: run.status,
    workosProjectionWriteCount: run.workosProjectionWriteCount,
  };
}

async function recordMigrationRunAudit(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    brokerageId: Id<"brokerages">;
    candidateSha: string;
    configurationHash: string;
    eventType: string;
    inventoryFingerprint?: string;
    issueCount: number;
    observedInventoryFingerprint?: string;
    observedWorkosProjectionFingerprint?: string;
    organizationId: string;
    priorStatus?: string;
    reason: string;
    runId: Id<"lenderPortalPhase9MigrationRuns">;
    runToken: string;
    status: string;
    warnings?: string[];
    workosProjectionFingerprint?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.brokerageId,
    command: input.eventType,
    createdAt: Date.now(),
    drawFlowCorrelationId: input.runToken,
    entityId: String(input.runId),
    entityType: "lenderPortalPhase9MigrationRuns",
    eventType: input.eventType,
    newState: JSON.stringify({
      candidateSha: input.candidateSha,
      configurationHash: input.configurationHash,
      inventoryFingerprint: input.inventoryFingerprint,
      issueCount: input.issueCount,
      observedInventoryFingerprint: input.observedInventoryFingerprint,
      observedWorkosProjectionFingerprint:
        input.observedWorkosProjectionFingerprint,
      runToken: input.runToken,
      status: input.status,
      workosProjectionFingerprint: input.workosProjectionFingerprint,
    }),
    priorState: input.priorStatus
      ? JSON.stringify({
          candidateSha: input.candidateSha,
          configurationHash: input.configurationHash,
          runToken: input.runToken,
          status: input.priorStatus,
        })
      : undefined,
    organizationId: input.organizationId,
    phase9RunToken: input.runToken,
    reason: input.reason,
    reconciliationKey: `lender-portal-phase9-run:${input.runToken}:${input.eventType}`,
    warnings:
      input.warnings ??
      (input.issueCount > 0 ? ["migration_ambiguity_present"] : []),
  });
}

function exactHex(value: string, length: number, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(normalized)) {
    throw new Error(`Phase 9 ${label} is invalid.`);
  }
  return normalized;
}

function boundedReason(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1_000) {
    throw new Error("Phase 9 migration reason must be 1 to 1000 characters.");
  }
  return normalized;
}

function safeObject(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
