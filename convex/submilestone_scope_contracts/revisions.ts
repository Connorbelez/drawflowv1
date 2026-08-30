import { ConvexError } from "convex/values";

import type { AuthorizedViewer } from "../authz";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../types";
import {
  EMPTY_TIPTAP_DOCUMENT,
  MAX_SCOPE_REVISIONS,
  PUBLISHED_SCOPE_DENIAL,
  assertPublishedScopeRevisionLineage,
  assertScopeContractLineage,
  assertScopeHasSemanticContent,
  attachSubmilestoneScopeBuildLineage,
  authorizeBuilderScopeRead,
  authorizeContract,
  authorizeProposalSubmilestone,
  findContract,
  hasSemanticTiptapContent,
  normalizeScopeTiptapJson,
  parseScopeTiptapJson,
  projectPublishedScopeHistory,
  requiredChangeReason,
  type ScopeContext,
} from "./shared";

export async function upsertSubmilestoneScopeV1Draft(
  ctx: MutationCtx,
  input: {
    authoredByWorkosUserId: string;
    now: number;
    organizationId: string;
    brokerageId: Id<"brokerages">;
    proposalId: Id<"buildProposals">;
    proposalSubmilestoneId: Id<"proposalSubmilestones">;
    scopeOfWorkTiptapJson: string;
  }
) {
  const proposalSubmilestone = await ctx.db.get(input.proposalSubmilestoneId);
  if (
    !proposalSubmilestone ||
    proposalSubmilestone.proposalId !== input.proposalId ||
    proposalSubmilestone.organizationId !== input.organizationId ||
    proposalSubmilestone.brokerageId !== input.brokerageId
  ) {
    throw new Error("Scope draft lineage is unavailable.");
  }
  const parsedScope = normalizeScopeTiptapJson(input.scopeOfWorkTiptapJson);
  const existing = await findContract(ctx, input.proposalSubmilestoneId);
  if (!existing) {
    const contractId = await ctx.db.insert("submilestoneScopeContracts", {
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: input.proposalSubmilestoneId,
      latestVersion: 1,
      createdAt: input.now,
      updatedAt: input.now,
    });
    const revisionId = await ctx.db.insert("submilestoneScopeRevisions", {
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: input.proposalSubmilestoneId,
      contractId,
      version: 1,
      status: "draft",
      scopeOfWorkTiptapJson: parsedScope,
      authoredByWorkosUserId: input.authoredByWorkosUserId,
      createdAt: input.now,
      savedAt: input.now,
    });
    await ctx.db.patch(contractId, { activeDraftRevisionId: revisionId });
    await attachSubmilestoneScopeBuildLineage(ctx, {
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: input.proposalSubmilestoneId,
    });
    return revisionId;
  }

  if (
    existing.brokerageId !== input.brokerageId ||
    existing.organizationId !== input.organizationId ||
    existing.proposalId !== input.proposalId ||
    existing.proposalSubmilestoneId !== input.proposalSubmilestoneId
  ) {
    throw new Error("Scope draft lineage is unavailable.");
  }
  if (existing.activeDraftRevisionId) {
    const activeDraft = await ctx.db.get(existing.activeDraftRevisionId);
    if (
      !activeDraft ||
      activeDraft.contractId !== existing._id ||
      activeDraft.version !== 1 ||
      activeDraft.status !== "draft"
    ) {
      throw new Error("Scope contract has an invalid active v1 draft pointer.");
    }
    await ctx.db.patch(activeDraft._id, {
      scopeOfWorkTiptapJson: parsedScope,
      savedAt: input.now,
    });
    await ctx.db.patch(existing._id, { updatedAt: input.now });
    await attachSubmilestoneScopeBuildLineage(ctx, {
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: input.proposalSubmilestoneId,
    });
    return activeDraft._id;
  }

  // A published v1 cannot be overwritten.  A successor draft must be created
  // through the explicit Scope command so post-submission reason and decision
  // gates remain intact.
  if (existing.effectiveRevisionId || existing.latestVersion > 1) {
    throw new Error("Published Scope revisions cannot be changed.");
  }

  // A cleared contract pointer must not allow a second v1 row to be created.
  // Reuse a detached draft v1, but fail closed if the existing v1 is already
  // published even when effectiveRevisionId was lost or cleared.
  const existingV1 = await ctx.db
    .query("submilestoneScopeRevisions")
    .withIndex("by_contractId_and_version", (query) =>
      query.eq("contractId", existing._id).eq("version", 1)
    )
    .unique();
  if (existingV1?.status === "published") {
    throw new Error("Published Scope revisions cannot be changed.");
  }
  if (existingV1) {
    await ctx.db.patch(existingV1._id, {
      scopeOfWorkTiptapJson: parsedScope,
      savedAt: input.now,
    });
    await ctx.db.patch(existing._id, {
      activeDraftRevisionId: existingV1._id,
      updatedAt: input.now,
    });
    await attachSubmilestoneScopeBuildLineage(ctx, {
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalSubmilestoneId: input.proposalSubmilestoneId,
    });
    return existingV1._id;
  }

  const revisionId = await ctx.db.insert("submilestoneScopeRevisions", {
    brokerageId: input.brokerageId,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    proposalSubmilestoneId: input.proposalSubmilestoneId,
    contractId: existing._id,
    version: 1,
    status: "draft",
    scopeOfWorkTiptapJson: parsedScope,
    authoredByWorkosUserId: input.authoredByWorkosUserId,
    createdAt: input.now,
    savedAt: input.now,
  });
  await ctx.db.patch(existing._id, {
    activeDraftRevisionId: revisionId,
    updatedAt: input.now,
  });
  await attachSubmilestoneScopeBuildLineage(ctx, {
    brokerageId: input.brokerageId,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    proposalSubmilestoneId: input.proposalSubmilestoneId,
  });
  return revisionId;
}

export async function requireRevisionContract(
  ctx: ScopeContext,
  revisionId: Id<"submilestoneScopeRevisions">
) {
  const revision = await ctx.db.get(revisionId);
  if (!revision) {
    throw new Error("Scope revision is unavailable.");
  }
  const contract = await ctx.db.get(revision.contractId);
  if (!contract) {
    throw new Error("Scope contract is unavailable.");
  }
  return { contract, revision };
}

async function findLatestPublishedRevision(
  ctx: ScopeContext,
  contractId: Id<"submilestoneScopeContracts">
) {
  return await ctx.db
    .query("submilestoneScopeRevisions")
    .withIndex("by_contractId_and_status", (query) =>
      query.eq("contractId", contractId).eq("status", "published")
    )
    .order("desc")
    .first();
}

async function publishScopeRevisionWithActor(
  ctx: MutationCtx,
  input: {
    actorRoles: readonly string[];
    actorWorkosUserId: string;
    changeReason?: string;
    contract: Doc<"submilestoneScopeContracts">;
    makeV1Effective: boolean;
    revision: Doc<"submilestoneScopeRevisions">;
    now: number;
  }
) {
  const reason =
    input.revision.version === 1
      ? input.changeReason?.trim() || undefined
      : requiredChangeReason(input.changeReason);
  const actorRoles = [...input.actorRoles];
  const priorState = JSON.stringify({
    contract: {
      contractId: String(input.contract._id),
      latestVersion: input.contract.latestVersion,
      ...(input.contract.activeDraftRevisionId
        ? {
            activeDraftRevisionId: String(input.contract.activeDraftRevisionId),
          }
        : {}),
      ...(input.contract.effectiveRevisionId
        ? { effectiveRevisionId: String(input.contract.effectiveRevisionId) }
        : {}),
    },
    revision: {
      revisionId: String(input.revision._id),
      status: input.revision.status,
      version: input.revision.version,
      ...(input.revision.changeReason
        ? { changeReason: input.revision.changeReason }
        : {}),
    },
  });
  const newState = JSON.stringify({
    contract: {
      contractId: String(input.contract._id),
      latestVersion: input.contract.latestVersion,
      ...(input.revision.version === 1 && input.makeV1Effective
        ? { effectiveRevisionId: String(input.revision._id) }
        : input.contract.effectiveRevisionId
          ? { effectiveRevisionId: String(input.contract.effectiveRevisionId) }
          : {}),
    },
    revision: {
      revisionId: String(input.revision._id),
      status: "published",
      version: input.revision.version,
      publishedByWorkosUserId: input.actorWorkosUserId,
      publishedAt: input.now,
      ...(reason ? { changeReason: reason } : {}),
    },
  });
  await ctx.db.insert("auditEvents", {
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.contract.brokerageId,
    command: "publishSubmilestoneScopeRevision",
    createdAt: input.now,
    entityId: String(input.revision._id),
    entityType: "submilestoneScopeRevision",
    eventType: "submilestone_scope_revision.published",
    newState,
    organizationId: input.contract.organizationId,
    priorState,
    reason,
    warnings: [],
  });
  await ctx.db.patch(input.revision._id, {
    status: "published",
    publishedByWorkosUserId: input.actorWorkosUserId,
    publishedAt: input.now,
    ...(reason ? { changeReason: reason } : {}),
  });
  await ctx.db.patch(input.contract._id, {
    activeDraftRevisionId: undefined,
    ...(input.revision.version === 1 && input.makeV1Effective
      ? { effectiveRevisionId: input.revision._id }
      : {}),
    updatedAt: input.now,
  });
  return {
    changeReason: reason,
    revisionId: input.revision._id,
  };
}

/**
 * Publish every non-empty, saved v1 draft belonging to a Proposal.  This is a
 * direct database helper rather than a Convex mutation so Proposal submission
 * can publish Scope and transition the Proposal in one transaction.
 *
 * Empty v1 documents are valid planning state. They remain unpublished and do
 * not prevent submission; callers can complete that optional Scope later.
 */
export async function publishSavedV1ScopeDraftsForProposal(
  ctx: MutationCtx,
  input: {
    actorRoles: readonly string[];
    actorWorkosUserId: string;
    now: number;
    organizationId: string;
    brokerageId: Id<"brokerages">;
    proposalId: Id<"buildProposals">;
  }
) {
  const proposal = await ctx.db.get(input.proposalId);
  if (
    !proposal ||
    proposal.brokerageId !== input.brokerageId ||
    proposal.organizationId !== input.organizationId
  ) {
    throw new Error("Scope proposal lineage is unavailable.");
  }
  // A v1 is immediately effective only during the first submission. Once a
  // Proposal has a submittedAt timestamp, a later draft re-submission must
  // publish the immutable revision and wait for the SFG-05 decision gates.
  const makeV1Effective =
    proposal.status === "draft" && proposal.submittedAt === undefined;
  const contracts = await ctx.db
    .query("submilestoneScopeContracts")
    .withIndex("by_organizationId_and_proposalId", (query) =>
      query
        .eq("organizationId", input.organizationId)
        .eq("proposalId", input.proposalId)
    )
    .collect();
  const publishedRevisionIds: Id<"submilestoneScopeRevisions">[] = [];
  const skippedEmptyRevisionIds: Id<"submilestoneScopeRevisions">[] = [];
  for (const contract of contracts) {
    if (
      contract.brokerageId !== input.brokerageId ||
      contract.organizationId !== input.organizationId ||
      contract.proposalId !== input.proposalId
    ) {
      throw new Error("Scope contract lineage is unavailable.");
    }
    if (!contract.activeDraftRevisionId) {
      continue;
    }
    const revision = await ctx.db.get(contract.activeDraftRevisionId);
    if (
      !revision ||
      revision.contractId !== contract._id ||
      revision.brokerageId !== input.brokerageId ||
      revision.organizationId !== input.organizationId ||
      revision.proposalId !== input.proposalId ||
      revision.proposalSubmilestoneId !== contract.proposalSubmilestoneId
    ) {
      throw new Error("Scope contract has an invalid active draft pointer.");
    }
    // Submission only has authority to publish the initial v1 draft. A v2+
    // draft belongs to the post-submission decision workflow and is left alone.
    if (revision.status !== "draft" || revision.version !== 1) {
      continue;
    }
    const parsedScope = parseScopeTiptapJson(revision.scopeOfWorkTiptapJson);
    if (!hasSemanticTiptapContent(parsedScope)) {
      skippedEmptyRevisionIds.push(revision._id);
      continue;
    }
    await publishScopeRevisionWithActor(ctx, {
      actorRoles: input.actorRoles,
      actorWorkosUserId: input.actorWorkosUserId,
      contract,
      makeV1Effective,
      revision,
      now: input.now,
    });
    publishedRevisionIds.push(revision._id);
  }
  return { publishedRevisionIds, skippedEmptyRevisionIds };
}

/**
 * Builder-facing published history.  This is intentionally separate from the
 * backoffice history query: only immutable published revisions cross the
 * builder boundary, and the result contains no active-draft pointer, latest
 * version counter, or draft row/content.
 */

export async function loadBuilderScopeHistory(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { proposalSubmilestoneId: Id<"proposalSubmilestones">; workosOrganizationId: string }
) {
    const { proposal, submilestone } = await authorizeBuilderScopeRead(
      ctx,
      ctx.viewer,
      args.proposalSubmilestoneId,
      args.workosOrganizationId
    );
    const contract = await findContract(ctx, submilestone._id);
    if (!contract) {
      return null;
    }
    assertScopeContractLineage(contract, proposal, submilestone);
    return await projectPublishedScopeHistory(ctx, contract);
}

export async function loadBuilderScopeRevisionContent(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { revisionId: Id<"submilestoneScopeRevisions">; workosOrganizationId: string }
) {
    const revision = await ctx.db.get(args.revisionId);
    if (!revision || revision.status !== "published") {
      throw new Error(PUBLISHED_SCOPE_DENIAL);
    }
    const { proposal, submilestone } = await authorizeBuilderScopeRead(
      ctx,
      ctx.viewer,
      revision.proposalSubmilestoneId,
      args.workosOrganizationId
    );
    const contract = await ctx.db.get(revision.contractId);
    if (!contract) {
      throw new Error(PUBLISHED_SCOPE_DENIAL);
    }
    assertScopeContractLineage(contract, proposal, submilestone);
    assertPublishedScopeRevisionLineage(revision, contract);
    return {
      _id: revision._id,
      version: revision.version,
      status: "published" as const,
      scopeOfWorkTiptapJson: revision.scopeOfWorkTiptapJson,
    };
}

export async function loadBackofficeScopeHistory(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { proposalSubmilestoneId: Id<"proposalSubmilestones">; workosOrganizationId: string }
) {
    await authorizeProposalSubmilestone(
      ctx,
      ctx.viewer,
      args.proposalSubmilestoneId,
      args.workosOrganizationId
    );
    const contract = await findContract(ctx, args.proposalSubmilestoneId);
    if (!contract) {
      return null;
    }
    const revisions = await ctx.db
      .query("submilestoneScopeRevisions")
      .withIndex("by_contractId_and_version", (query) =>
        query.eq("contractId", contract._id)
      )
      .order("asc")
      .collect();
    return {
      contractId: contract._id,
      ...(contract.activeDraftRevisionId
        ? { activeDraftRevisionId: contract.activeDraftRevisionId }
        : {}),
      ...(contract.effectiveRevisionId
        ? { effectiveRevisionId: contract.effectiveRevisionId }
        : {}),
      latestVersion: contract.latestVersion,
      revisions: revisions.map((revision) => ({
        _id: revision._id,
        version: revision.version,
        status: revision.status,
        ...(revision.basedOnRevisionId
          ? { basedOnRevisionId: revision.basedOnRevisionId }
          : {}),
        authoredByWorkosUserId: revision.authoredByWorkosUserId,
        createdAt: revision.createdAt,
        savedAt: revision.savedAt,
        ...(revision.publishedByWorkosUserId
          ? { publishedByWorkosUserId: revision.publishedByWorkosUserId }
          : {}),
        ...(revision.publishedAt ? { publishedAt: revision.publishedAt } : {}),
        ...(revision.changeReason
          ? { changeReason: revision.changeReason }
          : {}),
        isActiveDraft: contract.activeDraftRevisionId === revision._id,
        isEffective: contract.effectiveRevisionId === revision._id,
      })),
    };
}

export async function loadBackofficeScopeRevisionContent(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { revisionId: Id<"submilestoneScopeRevisions">; workosOrganizationId: string }
) {
    const { contract, revision } = await requireRevisionContract(
      ctx,
      args.revisionId
    );
    await authorizeContract(
      ctx,
      ctx.viewer,
      contract,
      args.workosOrganizationId
    );
    if (revision.organizationId !== args.workosOrganizationId) {
      throw new Error("Forbidden: organization scope");
    }
    return {
      _id: revision._id,
      version: revision.version,
      status: revision.status,
      scopeOfWorkTiptapJson: revision.scopeOfWorkTiptapJson,
    };
}

export async function createScopeDraft(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { proposalSubmilestoneId: Id<"proposalSubmilestones">; basedOnRevisionId?: Id<"submilestoneScopeRevisions">; workosOrganizationId: string }
) {
    const { proposal, submilestone } = await authorizeProposalSubmilestone(
      ctx,
      ctx.viewer,
      args.proposalSubmilestoneId,
      args.workosOrganizationId
    );
    const now = Date.now();
    const existing = await findContract(ctx, args.proposalSubmilestoneId);
    if (!existing) {
      const contractId = await ctx.db.insert("submilestoneScopeContracts", {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        proposalSubmilestoneId: submilestone._id,
        latestVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
      const revisionId = await ctx.db.insert("submilestoneScopeRevisions", {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        proposalSubmilestoneId: submilestone._id,
        contractId,
        version: 1,
        status: "draft",
        scopeOfWorkTiptapJson: EMPTY_TIPTAP_DOCUMENT,
        authoredByWorkosUserId: ctx.viewer.subject,
        createdAt: now,
        savedAt: now,
      });
      await ctx.db.patch(contractId, { activeDraftRevisionId: revisionId });
      await attachSubmilestoneScopeBuildLineage(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        proposalSubmilestoneId: submilestone._id,
      });
      return revisionId;
    }
    await authorizeContract(
      ctx,
      ctx.viewer,
      existing,
      args.workosOrganizationId
    );
    if (existing.activeDraftRevisionId) {
      const activeDraft = await ctx.db.get(existing.activeDraftRevisionId);
      if (!activeDraft || activeDraft.status !== "draft") {
        throw new Error("Scope contract has an invalid active draft pointer.");
      }
      await attachSubmilestoneScopeBuildLineage(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        proposalSubmilestoneId: submilestone._id,
      });
      return activeDraft._id;
    }
    const sourceRevision = args.basedOnRevisionId
      ? await ctx.db.get(args.basedOnRevisionId)
      : await findLatestPublishedRevision(ctx, existing._id);
    if (
      !sourceRevision ||
      sourceRevision.contractId !== existing._id ||
      sourceRevision.status !== "published"
    ) {
      throw new Error("Successor Scope source must be a published revision.");
    }
    if (existing.latestVersion >= MAX_SCOPE_REVISIONS) {
      throw new Error(
        "Scope revision history has reached its supported limit."
      );
    }
    const version = existing.latestVersion + 1;
    const revisionId = await ctx.db.insert("submilestoneScopeRevisions", {
      brokerageId: existing.brokerageId,
      organizationId: existing.organizationId,
      proposalId: existing.proposalId,
      proposalSubmilestoneId: existing.proposalSubmilestoneId,
      contractId: existing._id,
      version,
      status: "draft",
      scopeOfWorkTiptapJson: sourceRevision.scopeOfWorkTiptapJson,
      basedOnRevisionId: sourceRevision._id,
      authoredByWorkosUserId: ctx.viewer.subject,
      createdAt: now,
      savedAt: now,
    });
    await ctx.db.patch(existing._id, {
      activeDraftRevisionId: revisionId,
      latestVersion: version,
      updatedAt: now,
    });
    await attachSubmilestoneScopeBuildLineage(ctx, {
      brokerageId: proposal.brokerageId,
      organizationId: proposal.organizationId,
      proposalId: proposal._id,
      proposalSubmilestoneId: submilestone._id,
    });
    return revisionId;
}

export async function saveScopeDraft(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { revisionId: Id<"submilestoneScopeRevisions">; scopeOfWorkTiptapJson: string; workosOrganizationId: string }
) {
    const { contract, revision } = await requireRevisionContract(
      ctx,
      args.revisionId
    );
    await authorizeContract(
      ctx,
      ctx.viewer,
      contract,
      args.workosOrganizationId
    );
    if (
      revision.status !== "draft" ||
      contract.activeDraftRevisionId !== revision._id
    ) {
      throw new Error("Published Scope revisions cannot be changed.");
    }
    await ctx.db.patch(revision._id, {
      scopeOfWorkTiptapJson: normalizeScopeTiptapJson(
        args.scopeOfWorkTiptapJson
      ),
      savedAt: Date.now(),
    });
    return null;
}

export async function publishScopeRevision(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { revisionId: Id<"submilestoneScopeRevisions">; changeReason?: string; workosOrganizationId: string }
) {
    const { contract, revision } = await requireRevisionContract(
      ctx,
      args.revisionId
    );
    const { proposal } = await authorizeContract(
      ctx,
      ctx.viewer,
      contract,
      args.workosOrganizationId
    );
    if (
      revision.status !== "draft" ||
      contract.activeDraftRevisionId !== revision._id
    ) {
      throw new Error("Scope revision is not the active draft.");
    }
    assertScopeHasSemanticContent(revision.scopeOfWorkTiptapJson);
    const now = Date.now();
    // Publication freezes v2+ content; only SFG-05 decision commands may advance
    // effectiveRevisionId after the required borrower/lender gates are recorded.
    await publishScopeRevisionWithActor(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      changeReason: args.changeReason,
      contract,
      // A v1 authored before the first submission may remain immediately
      // effective. Once a Proposal has entered submission (even if it later
      // returns to draft for requested changes), publication is only the
      // immutable revision step; SFG-05 decisions must advance effectiveness.
      makeV1Effective:
        proposal.status === "draft" && proposal.submittedAt === undefined,
      revision,
      now,
    });
    return null;
}
