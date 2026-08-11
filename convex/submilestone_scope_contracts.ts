import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  type AuthorizedViewer,
  backofficeMutation,
  backofficeQuery,
  backofficeRoleSlugs,
  builderMutation,
  destructiveWriteMutation,
} from "./authz";
import type { MutationCtx, QueryCtx } from "./types";

const EMPTY_TIPTAP_DOCUMENT = JSON.stringify({
  content: [{ type: "paragraph" }],
  type: "doc",
});
const MAX_TIPTAP_JSON_LENGTH = 250_000;
const MAX_SCOPE_REVISIONS = 500;

const scopeRevisionStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published")
);

const scopeRevisionProjectionValidator = v.object({
  _id: v.id("submilestoneScopeRevisions"),
  version: v.number(),
  status: scopeRevisionStatusValidator,
  basedOnRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
  authoredByWorkosUserId: v.string(),
  createdAt: v.number(),
  savedAt: v.number(),
  publishedByWorkosUserId: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  changeReason: v.optional(v.string()),
  isActiveDraft: v.boolean(),
  isEffective: v.boolean(),
});

const scopeRevisionContentValidator = v.object({
  _id: v.id("submilestoneScopeRevisions"),
  version: v.number(),
  status: scopeRevisionStatusValidator,
  scopeOfWorkTiptapJson: v.string(),
});

const scopeHistoryValidator = v.union(
  v.null(),
  v.object({
    contractId: v.id("submilestoneScopeContracts"),
    activeDraftRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    effectiveRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    latestVersion: v.number(),
    revisions: v.array(scopeRevisionProjectionValidator),
  })
);

type ScopeContext = QueryCtx | MutationCtx;

function assertOrganizationScope(
  viewer: AuthorizedViewer,
  workosOrganizationId: string
) {
  if (
    !viewer.organizationId ||
    viewer.organizationId !== workosOrganizationId
  ) {
    throw new Error("Forbidden: organization scope");
  }
}

async function authorizeProposalSubmilestone(
  ctx: ScopeContext,
  viewer: AuthorizedViewer,
  proposalSubmilestoneId: Id<"proposalSubmilestones">,
  workosOrganizationId: string
) {
  assertOrganizationScope(viewer, workosOrganizationId);
  const submilestone = await ctx.db.get(proposalSubmilestoneId);
  if (!submilestone || submilestone.organizationId !== workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  const proposal = await ctx.db.get(submilestone.proposalId);
  if (!proposal || proposal.organizationId !== workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  return { proposal, submilestone };
}

async function authorizeContract(
  ctx: ScopeContext,
  viewer: AuthorizedViewer,
  contract: Doc<"submilestoneScopeContracts">,
  workosOrganizationId: string
) {
  if (contract.organizationId !== workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  return await authorizeProposalSubmilestone(
    ctx,
    viewer,
    contract.proposalSubmilestoneId,
    workosOrganizationId
  );
}

function parseScopeTiptapJson(value: string) {
  if (!value.trim()) {
    throw new Error("Scope must contain TipTap JSON.");
  }
  if (value.length > MAX_TIPTAP_JSON_LENGTH) {
    throw new Error("Scope exceeds the supported length.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Scope must be valid TipTap JSON.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("type" in parsed) ||
    parsed.type !== "doc"
  ) {
    throw new Error("Scope must contain a TipTap document root.");
  }
  return parsed;
}

function normalizeScopeTiptapJson(value: string) {
  parseScopeTiptapJson(value);
  return value;
}

function hasSemanticTiptapContent(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(hasSemanticTiptapContent);
  }
  if (!node || typeof node !== "object") {
    return false;
  }

  const record = node as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim()) {
    return true;
  }

  const type = typeof record.type === "string" ? record.type : undefined;
  if (type === "image") {
    const attrs =
      record.attrs && typeof record.attrs === "object"
        ? (record.attrs as Record<string, unknown>)
        : undefined;
    return typeof attrs?.src === "string" && Boolean(attrs.src.trim());
  }
  if (type === "horizontalRule") {
    return true;
  }
  if (type === "hardBreak") {
    return false;
  }

  return (
    Array.isArray(record.content) &&
    record.content.some(hasSemanticTiptapContent)
  );
}

function assertScopeHasSemanticContent(value: string) {
  const document = parseScopeTiptapJson(value);
  if (!hasSemanticTiptapContent(document)) {
    throw new Error("Scope must contain non-empty content before publication.");
  }
}

function requiredChangeReason(value: string | undefined) {
  const reason = value?.trim();
  if (!reason) {
    throw new Error("Publishing Scope v2 or later requires a change reason.");
  }
  return reason;
}

async function findContract(
  ctx: ScopeContext,
  proposalSubmilestoneId: Id<"proposalSubmilestones">
) {
  return await ctx.db
    .query("submilestoneScopeContracts")
    .withIndex("by_proposalSubmilestoneId", (query) =>
      query.eq("proposalSubmilestoneId", proposalSubmilestoneId)
    )
    .unique();
}

/**
 * Persist the one pre-submission v1 draft owned by a Proposal Sub-milestone.
 *
 * Proposal package generation already runs inside a Convex mutation.  Calling
 * the public draft mutation from that flow would split the write into another
 * transaction, so this deliberately small domain helper exposes the same
 * create-or-save behavior for callers that already performed authorization.
 * It accepts empty TipTap documents (planning is optional); publication is
 * responsible for applying the semantic-content rule.
 */
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
  return revisionId;
}

async function requireRevisionContract(
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

export const getSubmilestoneScopeHistory = backofficeQuery
  .input({
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeHistoryValidator)
  .handler(async (ctx, args) => {
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
  })
  .public();

/**
 * Scope history intentionally contains metadata only. Load one immutable
 * revision body through this query after the caller selects a revision from
 * the authorized history result; this keeps large TipTap documents out of a
 * reactive history read while preserving tenant and lineage checks.
 */
export const getSubmilestoneScopeRevisionContent = backofficeQuery
  .input({
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeRevisionContentValidator)
  .handler(async (ctx, args) => {
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
  })
  .public();

export const createSubmilestoneScopeDraft = backofficeMutation
  .input({
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    basedOnRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("submilestoneScopeRevisions"))
  .handler(async (ctx, args) => {
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
    return revisionId;
  })
  .public();

export const saveSubmilestoneScopeDraft = backofficeMutation
  .input({
    revisionId: v.id("submilestoneScopeRevisions"),
    scopeOfWorkTiptapJson: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
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
  })
  .public();

export const publishSubmilestoneScopeRevision = backofficeMutation
  .input({
    revisionId: v.id("submilestoneScopeRevisions"),
    changeReason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
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
  })
  .public();

const scopeDecisionKindValidator = v.union(
  v.literal("borrower_acknowledged"),
  v.literal("borrower_rejected"),
  v.literal("lender_admin_approved"),
  v.literal("admin_override")
);

const bypassedScopeDecisionKindValidator = v.union(
  v.literal("borrower_acknowledged"),
  v.literal("borrower_rejected"),
  v.literal("lender_admin_approved")
);

const scopeDecisionResultValidator = v.object({
  decisionId: v.id("submilestoneScopeDecisions"),
  effectiveRevisionId: v.union(v.id("submilestoneScopeRevisions"), v.null()),
  kind: scopeDecisionKindValidator,
  replayed: v.boolean(),
});

const scopeOverrideResultValidator = v.object({
  bypassedDecisionKinds: v.array(bypassedScopeDecisionKindValidator),
  decisionId: v.id("submilestoneScopeDecisions"),
  effectiveRevisionId: v.union(v.id("submilestoneScopeRevisions"), v.null()),
  kind: v.literal("admin_override"),
  replayed: v.boolean(),
});

type ScopeDecisionKind = Doc<"submilestoneScopeDecisions">["kind"];
type BypassedScopeDecisionKind = Exclude<ScopeDecisionKind, "admin_override">;

const MAX_SCOPE_DECISION_ROWS = 500;
const MAX_SCOPE_DECISION_REASON_LENGTH = 5000;
const MAX_SCOPE_IDEMPOTENCY_KEY_LENGTH = 200;

function requiredScopeDecisionReason(value: string, label: string) {
  const reason = value.trim();
  if (!reason) {
    throw new Error(`${label} requires a non-empty reason.`);
  }
  if (reason.length > MAX_SCOPE_DECISION_REASON_LENGTH) {
    throw new Error(`${label} reason exceeds the supported length.`);
  }
  return reason;
}

function requiredScopeDecisionIdempotencyKey(value: string) {
  const key = value.trim();
  if (!key || key.length > MAX_SCOPE_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error(
      `Scope decision idempotency key must be 1 to ${MAX_SCOPE_IDEMPOTENCY_KEY_LENGTH} characters.`
    );
  }
  return key;
}

function isBackofficeRole(viewer: AuthorizedViewer) {
  return viewer.roles.some((role) =>
    (backofficeRoleSlugs as readonly string[]).includes(role)
  );
}

function isLenderAdmin(viewer: AuthorizedViewer) {
  return (
    viewer.roles.includes("admin") || viewer.roles.includes("principle-broker")
  );
}

function assertLenderAdmin(viewer: AuthorizedViewer) {
  if (!isLenderAdmin(viewer)) {
    throw new Error("Forbidden: lender-admin authority");
  }
}

async function authorizeScopeDecisionRevision(
  ctx: MutationCtx,
  viewer: AuthorizedViewer,
  revisionId: Id<"submilestoneScopeRevisions">,
  workosOrganizationId: string
) {
  const { contract, revision } = await requireRevisionContract(ctx, revisionId);
  const { proposal, submilestone } = await authorizeContract(
    ctx,
    viewer,
    contract,
    workosOrganizationId
  );
  if (
    contract.brokerageId !== proposal.brokerageId ||
    contract.organizationId !== proposal.organizationId ||
    contract.proposalId !== proposal._id ||
    contract.proposalSubmilestoneId !== submilestone._id ||
    revision.brokerageId !== contract.brokerageId ||
    revision.organizationId !== contract.organizationId ||
    revision.proposalId !== contract.proposalId ||
    revision.proposalSubmilestoneId !== contract.proposalSubmilestoneId ||
    revision.contractId !== contract._id
  ) {
    throw new Error("Forbidden: Scope revision lineage");
  }
  if (revision.status !== "published") {
    throw new Error("Scope decisions require a published revision.");
  }
  return { contract, proposal, revision, submilestone };
}

async function assertBorrowerDecisionAuthority(
  ctx: MutationCtx,
  viewer: AuthorizedViewer,
  proposal: Doc<"buildProposals">,
  workosOrganizationId: string
) {
  // A lender-side identity must not use a broad backoffice/admin capability to
  // impersonate the borrower. The active builder-account link is the
  // proposal-lineage authority for both the owner and delegated staff.
  if (
    !(
      viewer.roles.includes("builder") || viewer.roles.includes("builder-staff")
    ) ||
    isBackofficeRole(viewer) ||
    !proposal.builderProfileId
  ) {
    throw new Error("Forbidden: borrower Scope decision authority");
  }
  const builderProfile = await ctx.db.get(proposal.builderProfileId);
  if (
    !builderProfile ||
    builderProfile.status !== "active" ||
    builderProfile.organizationId !== workosOrganizationId ||
    builderProfile.brokerageId !== proposal.brokerageId
  ) {
    throw new Error("Forbidden: borrower Scope decision authority");
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", builderProfile._id)
        .eq("workosUserId", viewer.subject)
    )
    .take(21);
  if (
    !links.some(
      (link) =>
        link.status === "active" &&
        link.brokerageId === proposal.brokerageId &&
        (link.role === "owner" || link.role === "staff")
    )
  ) {
    throw new Error("Forbidden: borrower Scope decision authority");
  }
}

function lenderAdminGateRequired(proposal: Doc<"buildProposals">) {
  return (
    proposal.status === "approved" ||
    proposal.status === "closed" ||
    Boolean(proposal.activeBuildId)
  );
}

function normalizeScopeDecisionActorRoles(roles: readonly string[]) {
  return [...new Set(roles)].sort();
}

async function loadScopeRevisionDecisions(
  ctx: MutationCtx,
  revisionId: Id<"submilestoneScopeRevisions">
) {
  const decisions = await ctx.db
    .query("submilestoneScopeDecisions")
    .withIndex("by_revisionId_and_createdAt", (query) =>
      query.eq("revisionId", revisionId)
    )
    .order("asc")
    .take(MAX_SCOPE_DECISION_ROWS + 1);
  if (decisions.length > MAX_SCOPE_DECISION_ROWS) {
    throw new Error("Scope decision history has reached its supported limit.");
  }
  return decisions;
}

function scopeDecisionKindsForGate(
  proposal: Doc<"buildProposals">,
  decisions: Pick<Doc<"submilestoneScopeDecisions">, "kind">[]
) {
  const hasBorrowerAcknowledgement = decisions.some(
    (decision) => decision.kind === "borrower_acknowledged"
  );
  const hasBorrowerRejection = decisions.some(
    (decision) => decision.kind === "borrower_rejected"
  );
  const hasLenderAdminApproval = decisions.some(
    (decision) => decision.kind === "lender_admin_approved"
  );
  const missing: BypassedScopeDecisionKind[] = [];
  if (hasBorrowerRejection) {
    missing.push("borrower_rejected");
  } else if (!hasBorrowerAcknowledgement) {
    missing.push("borrower_acknowledged");
  }
  if (lenderAdminGateRequired(proposal) && !hasLenderAdminApproval) {
    missing.push("lender_admin_approved");
  }
  return {
    hasBorrowerAcknowledgement,
    hasBorrowerRejection,
    hasLenderAdminApproval,
    missing,
    ready:
      hasBorrowerAcknowledgement &&
      !hasBorrowerRejection &&
      (!lenderAdminGateRequired(proposal) || hasLenderAdminApproval),
  };
}

async function advanceEffectiveScopeRevision(
  ctx: MutationCtx,
  contract: Doc<"submilestoneScopeContracts">,
  revision: Doc<"submilestoneScopeRevisions">,
  ready: boolean,
  now: number
) {
  if (!ready) {
    return contract.effectiveRevisionId ?? null;
  }
  const current = contract.effectiveRevisionId
    ? await ctx.db.get(contract.effectiveRevisionId)
    : null;
  if (current && current.version >= revision.version) {
    return current._id;
  }
  await ctx.db.patch(contract._id, {
    effectiveRevisionId: revision._id,
    updatedAt: now,
  });
  return revision._id;
}

function scopeDecisionPayloadMatches(
  existing: Doc<"submilestoneScopeDecisions">,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    kind: ScopeDecisionKind;
    reason?: string;
    revisionId: Id<"submilestoneScopeRevisions">;
    version: number;
  }
) {
  return (
    existing.actorWorkosUserId === input.actorWorkosUserId &&
    normalizeScopeDecisionActorRoles(existing.actorRoles).join("\u0000") ===
      normalizeScopeDecisionActorRoles(input.actorRoles).join("\u0000") &&
    existing.kind === input.kind &&
    existing.reason === input.reason &&
    existing.revisionId === input.revisionId &&
    existing.version === input.version
  );
}

async function existingScopeDecisionForKey(
  ctx: MutationCtx,
  contractId: Id<"submilestoneScopeContracts">,
  idempotencyKey: string
) {
  return await ctx.db
    .query("submilestoneScopeDecisions")
    .withIndex("by_contractId_and_idempotencyKey", (query) =>
      query.eq("contractId", contractId).eq("idempotencyKey", idempotencyKey)
    )
    .unique();
}

function assertScopeDecisionIdempotencyPayload(
  existing: Doc<"submilestoneScopeDecisions">,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    kind: ScopeDecisionKind;
    reason?: string;
    revisionId: Id<"submilestoneScopeRevisions">;
    version: number;
  }
) {
  if (!scopeDecisionPayloadMatches(existing, input)) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message:
        "This Scope decision idempotency key was reused for a different payload.",
    });
  }
}

function assertScopeDecisionIsNotDuplicateOrConflicting(
  kind: Exclude<ScopeDecisionKind, "admin_override">,
  decisions: Pick<Doc<"submilestoneScopeDecisions">, "kind">[]
) {
  if (decisions.some((decision) => decision.kind === kind)) {
    throw new Error(
      `Scope decision ${kind} is already recorded for this revision; reuse the original idempotency key to replay it instead of creating a duplicate.`
    );
  }
  const conflictingKind =
    kind === "borrower_acknowledged"
      ? "borrower_rejected"
      : kind === "borrower_rejected"
        ? "borrower_acknowledged"
        : null;
  if (
    conflictingKind &&
    decisions.some((decision) => decision.kind === conflictingKind)
  ) {
    throw new Error(
      `Borrower Scope decision conflicts with existing ${conflictingKind} decision.`
    );
  }
}

function scopeDecisionResult(
  decision: Doc<"submilestoneScopeDecisions">,
  effectiveRevisionId: Id<"submilestoneScopeRevisions"> | null,
  replayed: boolean
) {
  return {
    decisionId: decision._id,
    effectiveRevisionId,
    kind: decision.kind,
    replayed,
  };
}

async function recordScopeDecisionAudit(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    brokerageId: Id<"brokerages">;
    command: string;
    contract: Doc<"submilestoneScopeContracts">;
    entityId: string;
    eventType: string;
    newState: string;
    priorState: string;
    reason?: string;
    warnings: string[];
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.brokerageId,
    command: input.command,
    createdAt: Date.now(),
    entityId: input.entityId,
    entityType: "submilestoneScopeRevision",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.contract.organizationId,
    overrideKind:
      input.eventType === "submilestone_scope_revision.admin_override"
        ? "submilestone_scope_revision"
        : undefined,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings,
  });
}

async function recordScopeDecision(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    contract: Doc<"submilestoneScopeContracts">;
    kind: Exclude<ScopeDecisionKind, "admin_override">;
    proposal: Doc<"buildProposals">;
    reason?: string;
    revision: Doc<"submilestoneScopeRevisions">;
    idempotencyKey: string;
  }
) {
  const actorRoles = normalizeScopeDecisionActorRoles(input.actorRoles);
  const existing = await existingScopeDecisionForKey(
    ctx,
    input.contract._id,
    input.idempotencyKey
  );
  const payload = {
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    kind: input.kind,
    reason: input.reason,
    revisionId: input.revision._id,
    version: input.revision.version,
  };
  if (existing) {
    assertScopeDecisionIdempotencyPayload(existing, payload);
    return {
      decision: existing,
      effectiveRevisionId:
        existing.newEffectiveRevisionId ??
        existing.priorEffectiveRevisionId ??
        null,
      replayed: true,
    };
  }

  const decisions = await loadScopeRevisionDecisions(ctx, input.revision._id);
  assertScopeDecisionIsNotDuplicateOrConflicting(input.kind, decisions);
  const gate = scopeDecisionKindsForGate(input.proposal, [
    ...decisions,
    { kind: input.kind },
  ]);
  const priorEffectiveRevisionId = input.contract.effectiveRevisionId;
  const now = Date.now();
  const effectiveRevisionId = await advanceEffectiveScopeRevision(
    ctx,
    input.contract,
    input.revision,
    gate.ready,
    now
  );
  const decisionId = await ctx.db.insert("submilestoneScopeDecisions", {
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.contract.brokerageId,
    contractId: input.contract._id,
    createdAt: now,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    organizationId: input.contract.organizationId,
    proposalId: input.contract.proposalId,
    proposalSubmilestoneId: input.contract.proposalSubmilestoneId,
    reason: input.reason,
    revisionId: input.revision._id,
    version: input.revision.version,
    ...(priorEffectiveRevisionId ? { priorEffectiveRevisionId } : {}),
    ...(effectiveRevisionId && effectiveRevisionId !== priorEffectiveRevisionId
      ? { newEffectiveRevisionId: effectiveRevisionId }
      : {}),
  });
  const decision = await ctx.db.get(decisionId);
  if (!decision) {
    throw new Error("Scope decision was not persisted.");
  }
  const eventType = `submilestone_scope_revision.${input.kind}`;
  await recordScopeDecisionAudit(ctx, {
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.contract.brokerageId,
    command: scopeCommandForKind(input.kind),
    contract: input.contract,
    entityId: String(input.revision._id),
    eventType,
    newState: JSON.stringify({
      decisionId: String(decisionId),
      effectiveRevisionId: effectiveRevisionId
        ? String(effectiveRevisionId)
        : null,
      kind: input.kind,
      revisionId: String(input.revision._id),
      version: input.revision.version,
    }),
    priorState: JSON.stringify({
      effectiveRevisionId: priorEffectiveRevisionId
        ? String(priorEffectiveRevisionId)
        : null,
      priorEffectiveRevisionId: priorEffectiveRevisionId
        ? String(priorEffectiveRevisionId)
        : null,
      proposalStatus: input.proposal.status,
    }),
    reason: input.reason,
    warnings: [],
  });
  return { decision, effectiveRevisionId, replayed: false };
}

function scopeCommandForKind(
  kind: Exclude<ScopeDecisionKind, "admin_override">
) {
  switch (kind) {
    case "borrower_acknowledged":
      return "acknowledgeSubmilestoneScopeRevision";
    case "borrower_rejected":
      return "rejectSubmilestoneScopeRevision";
    case "lender_admin_approved":
      return "approveSubmilestoneScopeRevision";
  }
}

export const acknowledgeSubmilestoneScopeRevision = builderMutation
  .input({
    idempotencyKey: v.string(),
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeDecisionResultValidator)
  .handler(async (ctx, args) => {
    const { contract, proposal, revision } =
      await authorizeScopeDecisionRevision(
        ctx,
        ctx.viewer,
        args.revisionId,
        args.workosOrganizationId
      );
    await assertBorrowerDecisionAuthority(
      ctx,
      ctx.viewer,
      proposal,
      args.workosOrganizationId
    );
    const result = await recordScopeDecision(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      contract,
      idempotencyKey: requiredScopeDecisionIdempotencyKey(args.idempotencyKey),
      kind: "borrower_acknowledged",
      proposal,
      revision,
    });
    return scopeDecisionResult(
      result.decision,
      result.effectiveRevisionId,
      result.replayed
    );
  })
  .public();

export const rejectSubmilestoneScopeRevision = builderMutation
  .input({
    idempotencyKey: v.string(),
    reason: v.string(),
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeDecisionResultValidator)
  .handler(async (ctx, args) => {
    const { contract, proposal, revision } =
      await authorizeScopeDecisionRevision(
        ctx,
        ctx.viewer,
        args.revisionId,
        args.workosOrganizationId
      );
    await assertBorrowerDecisionAuthority(
      ctx,
      ctx.viewer,
      proposal,
      args.workosOrganizationId
    );
    const result = await recordScopeDecision(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      contract,
      idempotencyKey: requiredScopeDecisionIdempotencyKey(args.idempotencyKey),
      kind: "borrower_rejected",
      proposal,
      reason: requiredScopeDecisionReason(args.reason, "Borrower rejection"),
      revision,
    });
    return scopeDecisionResult(
      result.decision,
      result.effectiveRevisionId,
      result.replayed
    );
  })
  .public();

export const approveSubmilestoneScopeRevision = destructiveWriteMutation
  .input({
    idempotencyKey: v.string(),
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeDecisionResultValidator)
  .handler(async (ctx, args) => {
    assertLenderAdmin(ctx.viewer);
    const { contract, proposal, revision } =
      await authorizeScopeDecisionRevision(
        ctx,
        ctx.viewer,
        args.revisionId,
        args.workosOrganizationId
      );
    const result = await recordScopeDecision(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      contract,
      idempotencyKey: requiredScopeDecisionIdempotencyKey(args.idempotencyKey),
      kind: "lender_admin_approved",
      proposal,
      revision,
    });
    return scopeDecisionResult(
      result.decision,
      result.effectiveRevisionId,
      result.replayed
    );
  })
  .public();

export const overrideSubmilestoneScopeRevision = destructiveWriteMutation
  .input({
    idempotencyKey: v.string(),
    reason: v.string(),
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeOverrideResultValidator)
  .handler(async (ctx, args) => {
    assertLenderAdmin(ctx.viewer);
    const { contract, proposal, revision } =
      await authorizeScopeDecisionRevision(
        ctx,
        ctx.viewer,
        args.revisionId,
        args.workosOrganizationId
      );
    const idempotencyKey = requiredScopeDecisionIdempotencyKey(
      args.idempotencyKey
    );
    const reason = requiredScopeDecisionReason(args.reason, "Scope override");
    const actorRoles = normalizeScopeDecisionActorRoles(ctx.viewer.roles);
    const existing = await existingScopeDecisionForKey(
      ctx,
      contract._id,
      idempotencyKey
    );
    const payload = {
      actorRoles,
      actorWorkosUserId: ctx.viewer.subject,
      kind: "admin_override" as const,
      reason,
      revisionId: revision._id,
      version: revision.version,
    };
    if (existing) {
      assertScopeDecisionIdempotencyPayload(existing, payload);
      return {
        bypassedDecisionKinds: existing.bypassedDecisionKinds ?? [],
        decisionId: existing._id,
        effectiveRevisionId:
          existing.newEffectiveRevisionId ??
          existing.priorEffectiveRevisionId ??
          null,
        kind: "admin_override" as const,
        replayed: true,
      };
    }

    const decisions = await loadScopeRevisionDecisions(ctx, revision._id);
    const gate = scopeDecisionKindsForGate(proposal, decisions);
    const priorEffectiveRevisionId = contract.effectiveRevisionId;
    const now = Date.now();
    const effectiveRevisionId = await advanceEffectiveScopeRevision(
      ctx,
      contract,
      revision,
      true,
      now
    );
    const decisionId = await ctx.db.insert("submilestoneScopeDecisions", {
      actorRoles,
      actorWorkosUserId: ctx.viewer.subject,
      brokerageId: contract.brokerageId,
      bypassedDecisionKinds: gate.missing,
      contractId: contract._id,
      createdAt: now,
      idempotencyKey,
      kind: "admin_override",
      organizationId: contract.organizationId,
      ...(priorEffectiveRevisionId ? { priorEffectiveRevisionId } : {}),
      ...(effectiveRevisionId &&
      effectiveRevisionId !== priorEffectiveRevisionId
        ? { newEffectiveRevisionId: effectiveRevisionId }
        : {}),
      proposalId: contract.proposalId,
      proposalSubmilestoneId: contract.proposalSubmilestoneId,
      reason,
      revisionId: revision._id,
      version: revision.version,
    });
    const decision = await ctx.db.get(decisionId);
    if (!decision) {
      throw new Error("Scope override decision was not persisted.");
    }
    const warnings = gate.missing.map((kind) => `bypassed:${kind}`);
    await recordScopeDecisionAudit(ctx, {
      actorRoles,
      actorWorkosUserId: ctx.viewer.subject,
      brokerageId: contract.brokerageId,
      command: "overrideSubmilestoneScopeRevision",
      contract,
      entityId: String(revision._id),
      eventType: "submilestone_scope_revision.admin_override",
      newState: JSON.stringify({
        bypassedDecisionKinds: gate.missing,
        decisionId: String(decisionId),
        effectiveRevisionId: effectiveRevisionId
          ? String(effectiveRevisionId)
          : null,
        ...(effectiveRevisionId &&
        effectiveRevisionId !== priorEffectiveRevisionId
          ? { newEffectiveRevisionId: String(effectiveRevisionId) }
          : {}),
        revisionId: String(revision._id),
        version: revision.version,
      }),
      priorState: JSON.stringify({
        effectiveRevisionId: priorEffectiveRevisionId
          ? String(priorEffectiveRevisionId)
          : null,
        priorEffectiveRevisionId: priorEffectiveRevisionId
          ? String(priorEffectiveRevisionId)
          : null,
        proposalStatus: proposal.status,
      }),
      reason,
      warnings,
    });
    return {
      bypassedDecisionKinds: gate.missing,
      decisionId,
      effectiveRevisionId,
      kind: "admin_override" as const,
      replayed: false,
    };
  })
  .public();
