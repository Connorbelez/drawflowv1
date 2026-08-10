import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  type AuthorizedViewer,
  backofficeMutation,
  backofficeQuery,
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
      throw new Error("Scope revision is not the active draft.");
    }
    assertScopeHasSemanticContent(revision.scopeOfWorkTiptapJson);
    const changeReason =
      revision.version === 1
        ? args.changeReason?.trim() || undefined
        : requiredChangeReason(args.changeReason);
    const now = Date.now();
    const priorState = JSON.stringify({
      contract: {
        contractId: String(contract._id),
        latestVersion: contract.latestVersion,
        ...(contract.activeDraftRevisionId
          ? { activeDraftRevisionId: String(contract.activeDraftRevisionId) }
          : {}),
        ...(contract.effectiveRevisionId
          ? { effectiveRevisionId: String(contract.effectiveRevisionId) }
          : {}),
      },
      revision: {
        revisionId: String(revision._id),
        status: revision.status,
        version: revision.version,
        ...(revision.changeReason
          ? { changeReason: revision.changeReason }
          : {}),
      },
    });
    const newState = JSON.stringify({
      contract: {
        contractId: String(contract._id),
        latestVersion: contract.latestVersion,
        ...(revision.version === 1
          ? { effectiveRevisionId: String(revision._id) }
          : contract.effectiveRevisionId
            ? { effectiveRevisionId: String(contract.effectiveRevisionId) }
            : {}),
      },
      revision: {
        revisionId: String(revision._id),
        status: "published",
        version: revision.version,
        publishedByWorkosUserId: ctx.viewer.subject,
        publishedAt: now,
        ...(changeReason ? { changeReason } : {}),
      },
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      brokerageId: contract.brokerageId,
      command: "publishSubmilestoneScopeRevision",
      createdAt: now,
      entityId: String(revision._id),
      entityType: "submilestoneScopeRevision",
      eventType: "submilestone_scope_revision.published",
      newState,
      organizationId: contract.organizationId,
      priorState,
      reason: changeReason,
      warnings: [],
    });
    await ctx.db.patch(revision._id, {
      status: "published",
      publishedByWorkosUserId: ctx.viewer.subject,
      publishedAt: now,
      ...(changeReason ? { changeReason } : {}),
    });
    // Publication freezes v2+ content; only SFG-05 decision commands may advance
    // effectiveRevisionId after the required borrower/lender gates are recorded.
    await ctx.db.patch(contract._id, {
      activeDraftRevisionId: undefined,
      ...(revision.version === 1 ? { effectiveRevisionId: revision._id } : {}),
      updatedAt: now,
    });
    return null;
  })
  .public();
