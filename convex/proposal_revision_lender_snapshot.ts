import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./types";

export const MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS = 2000;

type SnapshotReadCtx = Pick<QueryCtx | MutationCtx, "db">;

interface ProposalRevisionLenderSnapshotInput {
  assignment: Doc<"proposalLenderAssignments">;
  brokerageId: Id<"brokerages">;
  organizationId: string;
  proposal: Doc<"buildProposals">;
  revision: Doc<"proposalRevisions">;
}

export interface CompleteProposalRevisionLenderSnapshot {
  costItems: Doc<"proposalRevisionLenderCostItems">[];
  documents: Doc<"proposalRevisionLenderDocuments">[];
  draws: Doc<"proposalRevisionLenderDraws">[];
  milestones: Doc<"proposalRevisionLenderMilestones">[];
  root: Doc<"proposalRevisionLenderContentSnapshots">;
  submilestones: Doc<"proposalRevisionLenderSubmilestones">[];
}

export type ProposalRevisionLenderSnapshotValidation =
  | {
      ok: true;
      snapshot: CompleteProposalRevisionLenderSnapshot;
    }
  | {
      ok: false;
      reason: string;
    };

export async function validateCompleteProposalRevisionLenderSnapshot(
  ctx: SnapshotReadCtx,
  input: ProposalRevisionLenderSnapshotInput
): Promise<ProposalRevisionLenderSnapshotValidation> {
  const { assignment, brokerageId, organizationId, proposal, revision } = input;
  if (!currentScopeMatches(input)) {
    return invalid("current assignment or revision scope is inconsistent");
  }

  const lenderOrganizationId = ctx.db.normalizeId(
    "lenderOrganizations",
    String(assignment.lenderOrganizationId)
  );
  const lenderOrganization = lenderOrganizationId
    ? await ctx.db.get(lenderOrganizationId)
    : null;
  if (!lenderOrganizationScopeMatches(lenderOrganization, assignment)) {
    return invalid("current assignment lender scope is inconsistent");
  }

  const [root, policyVersion] = await Promise.all([
    ctx.db
      .query("proposalRevisionLenderContentSnapshots")
      .withIndex("by_revision", (query) => query.eq("revisionId", revision._id))
      .unique(),
    ctx.db.get(revision.reviewPolicyVersionId),
  ]);
  if (!(root && policyVersion)) {
    return invalid("snapshot root or revision checkpoints are inconsistent");
  }
  if (!rootAndPolicyMatch(root, policyVersion, input)) {
    return invalid("snapshot root or revision checkpoints are inconsistent");
  }

  const [policyLock, activeBuild] = await Promise.all([
    root.proposal.lockedReviewPolicyId
      ? ctx.db.get(root.proposal.lockedReviewPolicyId)
      : null,
    root.activeBuild ? ctx.db.get(root.activeBuild._id) : null,
  ]);
  if (
    !policyLockMatches({
      assignment,
      brokerageId,
      lenderOrganization,
      organizationId,
      policyLock,
      policyVersion,
      proposal,
      revision,
      root,
    })
  ) {
    return invalid("snapshot review policy lock is inconsistent");
  }
  if (!activeBuildMatches(activeBuild, root, input)) {
    return invalid("snapshot active Build is inconsistent");
  }

  const [documents, milestones, submilestones, costItems, draws] =
    await Promise.all([
      ctx.db
        .query("proposalRevisionLenderDocuments")
        .withIndex("by_revision", (query) =>
          query.eq("revisionId", revision._id)
        )
        .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
      ctx.db
        .query("proposalRevisionLenderMilestones")
        .withIndex("by_revision_and_order", (query) =>
          query.eq("revisionId", revision._id)
        )
        .order("asc")
        .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
      ctx.db
        .query("proposalRevisionLenderSubmilestones")
        .withIndex("by_revision_and_order", (query) =>
          query.eq("revisionId", revision._id)
        )
        .order("asc")
        .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
      ctx.db
        .query("proposalRevisionLenderCostItems")
        .withIndex("by_revision", (query) =>
          query.eq("revisionId", revision._id)
        )
        .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
      ctx.db
        .query("proposalRevisionLenderDraws")
        .withIndex("by_revision_and_order", (query) =>
          query.eq("revisionId", revision._id)
        )
        .order("asc")
        .take(MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS + 1),
    ]);
  const totalRows =
    documents.length +
    milestones.length +
    submilestones.length +
    costItems.length +
    draws.length;
  if (
    totalRows > MAX_PROPOSAL_REVISION_LENDER_CONTENT_ROWS ||
    documents.length !== root.counts.documents ||
    milestones.length !== root.counts.milestones ||
    submilestones.length !== root.counts.submilestones ||
    costItems.length !== root.counts.costItems ||
    draws.length !== root.counts.draws ||
    milestones.length !== revision.checkpoints.milestoneCount.count
  ) {
    return invalid("snapshot child counts are inconsistent");
  }

  const scope = {
    brokerageId,
    organizationId,
    proposalId: proposal._id,
    revisionId: revision._id,
  };
  if (
    !(
      documents.every(
        (row) => snapshotScopeMatches(row, scope) && row.storageUrl === null
      ) &&
      milestones.every((row) => snapshotScopeMatches(row, scope)) &&
      submilestones.every((row) => snapshotScopeMatches(row, scope)) &&
      costItems.every((row) => snapshotScopeMatches(row, scope)) &&
      draws.every((row) => snapshotScopeMatches(row, scope))
    )
  ) {
    return invalid("snapshot child scope is inconsistent");
  }

  const [
    sourceDocuments,
    sourceMilestones,
    sourceSubmilestones,
    sourceCostItems,
    sourceDraws,
  ] = await Promise.all([
    Promise.all(documents.map((row) => ctx.db.get(row.sourceDocumentId))),
    Promise.all(milestones.map((row) => ctx.db.get(row.sourceMilestoneId))),
    Promise.all(
      submilestones.map((row) => ctx.db.get(row.sourceSubmilestoneId))
    ),
    Promise.all(costItems.map((row) => ctx.db.get(row.sourceCostItemId))),
    Promise.all(draws.map((row) => ctx.db.get(row.sourceDrawId))),
  ]);
  const sourceScope = { brokerageId, organizationId, proposalId: proposal._id };
  const sourceMilestoneIdByKey = new Map(
    milestones.map((row) => [row.key, row.sourceMilestoneId])
  );
  if (
    sourceDocuments.some(
      (row) => !(row && sourceScopeMatches(row, sourceScope))
    ) ||
    sourceMilestones.some(
      (row, index) =>
        !(row && sourceScopeMatches(row, sourceScope)) ||
        row.key !== milestones[index]?.key
    ) ||
    sourceSubmilestones.some(
      (row, index) =>
        !(row && sourceScopeMatches(row, sourceScope)) ||
        row.proposalMilestoneId !== submilestones[index]?.proposalMilestoneId ||
        row.milestoneKey !== submilestones[index]?.milestoneKey ||
        row.key !== submilestones[index]?.key
    ) ||
    sourceCostItems.some(
      (row, index) =>
        !(row && sourceScopeMatches(row, sourceScope)) ||
        row.proposalMilestoneId !== costItems[index]?.proposalMilestoneId ||
        row.milestoneKey !== costItems[index]?.milestoneKey ||
        row.itemKey !== costItems[index]?.itemKey
    ) ||
    sourceDraws.some((row, index) => {
      const snapshotDraw = draws[index];
      const expectedMilestoneId = snapshotDraw?.milestoneKey
        ? sourceMilestoneIdByKey.get(snapshotDraw.milestoneKey)
        : undefined;
      return (
        !(row && sourceScopeMatches(row, sourceScope)) ||
        row.milestoneKey !== snapshotDraw?.milestoneKey ||
        row.proposalMilestoneId !== expectedMilestoneId ||
        row.drawKey !== snapshotDraw?.drawKey
      );
    })
  ) {
    return invalid("snapshot source foreign keys are inconsistent");
  }

  const milestoneById = new Map(
    milestones.map((row) => [String(row.sourceMilestoneId), row])
  );
  const milestoneKeys = new Set(milestones.map((row) => row.key));
  if (
    !(
      hasUniqueIds(documents.map((row) => row.sourceDocumentId)) &&
      hasUniqueIds(milestones.map((row) => row.sourceMilestoneId)) &&
      hasUniqueIds(submilestones.map((row) => row.sourceSubmilestoneId)) &&
      hasUniqueIds(costItems.map((row) => row.sourceCostItemId)) &&
      hasUniqueIds(draws.map((row) => row.sourceDrawId)) &&
      hasUniqueIds(
        submilestones.map((row) => `${row.milestoneKey}\u0000${row.key}`)
      ) &&
      hasUniqueIds(costItems.map((row) => row.itemKey)) &&
      hasUniqueIds(draws.map((row) => row.drawKey))
    ) ||
    milestoneKeys.size !== milestones.length ||
    milestones.some((row) =>
      row.dependencyKeys.some(
        (dependencyKey) => !milestoneKeys.has(dependencyKey)
      )
    ) ||
    submilestones.some((row) => {
      const parent = milestoneById.get(String(row.proposalMilestoneId));
      return !parent || parent.key !== row.milestoneKey;
    }) ||
    costItems.some((row) => {
      const parent = milestoneById.get(String(row.proposalMilestoneId));
      return !parent || parent.key !== row.milestoneKey;
    }) ||
    draws.some(
      (row) =>
        row.milestoneKey !== undefined && !milestoneKeys.has(row.milestoneKey)
    )
  ) {
    return invalid(
      "snapshot source identity or parent linkage is inconsistent"
    );
  }

  return {
    ok: true,
    snapshot: { costItems, documents, draws, milestones, root, submilestones },
  };
}

function snapshotScopeMatches(
  row: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    proposalId: Id<"buildProposals">;
    revisionId: Id<"proposalRevisions">;
  },
  scope: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    proposalId: Id<"buildProposals">;
    revisionId: Id<"proposalRevisions">;
  }
) {
  return (
    row.brokerageId === scope.brokerageId &&
    row.organizationId === scope.organizationId &&
    row.proposalId === scope.proposalId &&
    row.revisionId === scope.revisionId
  );
}

function currentScopeMatches(input: ProposalRevisionLenderSnapshotInput) {
  const { assignment, brokerageId, organizationId, proposal, revision } = input;
  return (
    proposal.organizationId === organizationId &&
    proposal.brokerageId === brokerageId &&
    proposal.currentProposalRevisionId === revision._id &&
    proposal.currentProposalRevisionNumber === revision.revisionNumber &&
    assignment.status === "current" &&
    assignment.proposalId === proposal._id &&
    assignment.organizationId === organizationId &&
    assignment.brokerageId === brokerageId &&
    revision.proposalId === proposal._id &&
    revision.assignmentId === assignment._id &&
    revision.organizationId === organizationId &&
    revision.brokerageId === brokerageId
  );
}

function lenderOrganizationScopeMatches(
  lenderOrganization: Doc<"lenderOrganizations"> | null,
  assignment: Doc<"proposalLenderAssignments">
): lenderOrganization is Doc<"lenderOrganizations"> {
  return Boolean(
    lenderOrganization &&
      lenderOrganization.status === "active" &&
      lenderOrganization.brokerageId === assignment.lenderBrokerageId
  );
}

function rootAndPolicyMatch(
  root: Doc<"proposalRevisionLenderContentSnapshots">,
  policyVersion: Doc<"proposalReviewPolicyVersions">,
  input: ProposalRevisionLenderSnapshotInput
) {
  const { brokerageId, organizationId, proposal, revision } = input;
  return Boolean(
    snapshotScopeMatches(root, {
      brokerageId,
      organizationId,
      proposalId: proposal._id,
      revisionId: revision._id,
    }) &&
      root.proposal._id === proposal._id &&
      root.proposal.currentProposalRevisionId === revision._id &&
      root.proposal.currentProposalRevisionNumber === revision.revisionNumber &&
      root.proposal.currentReviewPolicyVersionId ===
        revision.reviewPolicyVersionId &&
      policyVersion._id === root.proposal.currentReviewPolicyVersionId &&
      policyVersion.brokerageId === brokerageId &&
      policyVersion.organizationId === organizationId &&
      policyVersion.proposalId === proposal._id &&
      policiesMatch(
        policyVersion.policy,
        revision.checkpoints.accessReviewPolicy
      ) &&
      root.proposal.totalBudgetCents ===
        revision.checkpoints.budget.totalBudgetCents &&
      (root.proposal.proposedStartDate ?? null) ===
        revision.checkpoints.scheduleTimeline.proposedStartDate &&
      root.assignment.builder?._id ===
        revision.checkpoints.builder.builderProfileId &&
      root.assignment.builder?.displayName ===
        revision.checkpoints.builder.displayName &&
      "activeBuild" in root &&
      (root.activeBuild?._id ?? null) === (root.proposal.activeBuildId ?? null)
  );
}

function policyLockMatches(input: {
  assignment: Doc<"proposalLenderAssignments">;
  brokerageId: Id<"brokerages">;
  lenderOrganization: Doc<"lenderOrganizations">;
  organizationId: string;
  policyLock: Doc<"proposalReviewPolicyLocks"> | null;
  policyVersion: Doc<"proposalReviewPolicyVersions">;
  proposal: Doc<"buildProposals">;
  revision: Doc<"proposalRevisions">;
  root: Doc<"proposalRevisionLenderContentSnapshots">;
}) {
  const {
    assignment,
    brokerageId,
    lenderOrganization,
    organizationId,
    policyLock,
    policyVersion,
    proposal,
    revision,
    root,
  } = input;
  if (!root.proposal.lockedReviewPolicyId) {
    return true;
  }
  return Boolean(
    policyLock &&
      policyLock.brokerageId === brokerageId &&
      policyLock.organizationId === organizationId &&
      policyLock.proposalId === proposal._id &&
      policyLock.policyVersionId === policyVersion._id &&
      policyLock.proposalRevisionId === revision._id &&
      policyLock.proposalRevisionNumber === revision.revisionNumber &&
      policyLock.assignmentId === assignment._id &&
      policyLock.lenderOrganizationId === lenderOrganization._id &&
      policiesMatch(policyLock.policy, policyVersion.policy)
  );
}

function activeBuildMatches(
  activeBuild: Doc<"activeBuilds"> | null,
  root: Doc<"proposalRevisionLenderContentSnapshots">,
  input: ProposalRevisionLenderSnapshotInput
) {
  if (!root.activeBuild) {
    return true;
  }
  return Boolean(
    activeBuild &&
      activeBuild.brokerageId === input.brokerageId &&
      activeBuild.organizationId === input.organizationId &&
      activeBuild.proposalId === input.proposal._id &&
      activeBuild.builderProfileId === root.proposal.builderProfileId &&
      activeBuild.startDate === root.activeBuild.startDate &&
      activeBuild.status === root.activeBuild.status &&
      activeBuild.timezone === root.activeBuild.timezone &&
      (activeBuild.reviewPolicyLockId ?? null) ===
        (root.proposal.lockedReviewPolicyId ?? null)
  );
}

function sourceScopeMatches(
  row: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  },
  scope: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  }
) {
  return (
    row.brokerageId === scope.brokerageId &&
    row.organizationId === scope.organizationId &&
    row.proposalId === scope.proposalId
  );
}

function hasUniqueIds(ids: readonly unknown[]) {
  return new Set(ids.map(String)).size === ids.length;
}

function policiesMatch(
  left: Doc<"proposalReviewPolicyVersions">["policy"],
  right: Doc<"proposalReviewPolicyVersions">["policy"]
) {
  return (
    left.drawApprovalMode === right.drawApprovalMode &&
    left.drawLenderQuorum === right.drawLenderQuorum &&
    left.milestoneApprovalMode === right.milestoneApprovalMode &&
    left.milestoneLenderQuorum === right.milestoneLenderQuorum &&
    left.milestoneReceiptInvoiceRequired ===
      right.milestoneReceiptInvoiceRequired &&
    left.milestoneSiteVisitRequired === right.milestoneSiteVisitRequired
  );
}

function invalid(reason: string): ProposalRevisionLenderSnapshotValidation {
  return { ok: false, reason };
}
