import { ConvexError } from "convex/values";

import type { AuthorizedViewer } from "../authz";
import { attachExactBuildLineage, type ExactBuildLineageAttachmentInput } from "../fluent";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../types";

export const EMPTY_TIPTAP_DOCUMENT = JSON.stringify({
  content: [{ type: "paragraph" }],
  type: "doc",
});
export const MAX_TIPTAP_JSON_LENGTH = 250_000;
export const MAX_SCOPE_REVISIONS = 500;
export const PUBLISHED_SCOPE_DENIAL = "Forbidden: published Scope unavailable.";

interface PublishedScopeRevisionProjection {
  _id: Id<"submilestoneScopeRevisions">;
  authoredByDisplayName: string;
  authoredByWorkosUserId: string;
  changeReason?: string;
  createdAt: number;
  isEffective: boolean;
  publishedAt?: number;
  publishedByWorkosUserId?: string;
  savedAt: number;
  status: "published";
  version: number;
}

export type ScopeContext = QueryCtx | MutationCtx;

export function assertOrganizationScope(
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

export async function authorizeProposalSubmilestone(
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

export async function authorizeContract(
  ctx: ScopeContext,
  viewer: AuthorizedViewer,
  contract: Doc<"submilestoneScopeContracts">,
  workosOrganizationId: string
) {
  if (contract.organizationId !== workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  const authorized = await authorizeProposalSubmilestone(
    ctx,
    viewer,
    contract.proposalSubmilestoneId,
    workosOrganizationId
  );
  // The Sub-milestone lookup is the source of truth for Proposal lineage.
  // Never trust a contract's denormalized proposalId when it disagrees with
  // that validated parent; otherwise a corrupt contract could authorize a
  // revision under the wrong Proposal while preserving the tenant ID.
  if (authorized.proposal._id !== contract.proposalId) {
    throw new Error("Forbidden: organization scope");
  }
  return authorized;
}

export function isBuilderScopeViewer(viewer: AuthorizedViewer) {
  return (
    viewer.roles.includes("builder") || viewer.roles.includes("builder-staff")
  );
}

/**
 * Authorize a builder-facing Scope read from the Proposal-to-Builder
 * ownership lineage.  `builderQuery` intentionally admits `admin` for the
 * shared capability middleware, so this helper must still require a concrete
 * builder role and an active account link.  This prevents an unlinked admin
 * or a builder from another organization from reading a Proposal's Scope.
 */
export async function authorizeBuilderScopeRead(
  ctx: QueryCtx,
  viewer: AuthorizedViewer,
  proposalSubmilestoneId: Id<"proposalSubmilestones">,
  workosOrganizationId: string
) {
  if (!isBuilderScopeViewer(viewer)) {
    throw new Error(PUBLISHED_SCOPE_DENIAL);
  }

  const { proposal, submilestone } = await authorizeProposalSubmilestone(
    ctx,
    viewer,
    proposalSubmilestoneId,
    workosOrganizationId
  );
  if (!proposal.builderProfileId) {
    throw new Error(PUBLISHED_SCOPE_DENIAL);
  }

  const builderProfile = await ctx.db.get(proposal.builderProfileId);
  if (
    !builderProfile ||
    builderProfile.status !== "active" ||
    builderProfile.organizationId !== workosOrganizationId ||
    builderProfile.brokerageId !== proposal.brokerageId
  ) {
    throw new Error(PUBLISHED_SCOPE_DENIAL);
  }

  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", builderProfile._id)
        .eq("workosUserId", viewer.subject)
    )
    .take(21);
  // A bounded read is fail-closed.  More than 20 links for one account is not
  // an authoritative active-link result.
  if (links.length > 20) {
    throw new Error(PUBLISHED_SCOPE_DENIAL);
  }
  const hasActiveLink = links.some(
    (link) =>
      link.status === "active" &&
      link.brokerageId === proposal.brokerageId &&
      (link.role === "owner" || link.role === "staff")
  );
  if (!hasActiveLink) {
    throw new Error(PUBLISHED_SCOPE_DENIAL);
  }

  return { proposal, submilestone };
}

export function assertScopeContractLineage(
  contract: Doc<"submilestoneScopeContracts">,
  proposal: Doc<"buildProposals">,
  submilestone: Doc<"proposalSubmilestones">
) {
  if (
    contract.brokerageId !== proposal.brokerageId ||
    contract.organizationId !== proposal.organizationId ||
    contract.proposalId !== proposal._id ||
    contract.proposalSubmilestoneId !== submilestone._id
  ) {
    throw new Error(PUBLISHED_SCOPE_DENIAL);
  }
}

export function assertPublishedScopeRevisionLineage(
  revision: Doc<"submilestoneScopeRevisions">,
  contract: Doc<"submilestoneScopeContracts">
) {
  if (
    revision.brokerageId !== contract.brokerageId ||
    revision.organizationId !== contract.organizationId ||
    revision.proposalId !== contract.proposalId ||
    revision.proposalSubmilestoneId !== contract.proposalSubmilestoneId ||
    revision.contractId !== contract._id
  ) {
    throw new Error(PUBLISHED_SCOPE_DENIAL);
  }
}

export async function scopeAuthorDisplayName(ctx: QueryCtx, workosUserId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", workosUserId)
    )
    .first();
  return user?.name?.trim() || workosUserId;
}

export async function projectPublishedScopeHistory(
  ctx: QueryCtx,
  contract: Doc<"submilestoneScopeContracts">
) {
  const rows = await ctx.db
    .query("submilestoneScopeRevisions")
    .withIndex("by_contractId_and_version", (query) =>
      query.eq("contractId", contract._id)
    )
    .order("asc")
    .collect();

  const revisions: PublishedScopeRevisionProjection[] = [];
  for (const revision of rows) {
    // Draft rows, including a successor draft, are intentionally omitted from
    // this projection.  Do not expose `latestVersion`, active-draft pointers,
    // or any other metadata that would let the recipient infer their presence.
    if (revision.status !== "published") {
      continue;
    }
    assertPublishedScopeRevisionLineage(revision, contract);
    revisions.push({
      _id: revision._id,
      version: revision.version,
      status: "published" as const,
      authoredByWorkosUserId: revision.authoredByWorkosUserId,
      authoredByDisplayName: await scopeAuthorDisplayName(
        ctx,
        revision.authoredByWorkosUserId
      ),
      createdAt: revision.createdAt,
      savedAt: revision.savedAt,
      ...(revision.publishedByWorkosUserId
        ? { publishedByWorkosUserId: revision.publishedByWorkosUserId }
        : {}),
      ...(revision.publishedAt ? { publishedAt: revision.publishedAt } : {}),
      ...(revision.changeReason ? { changeReason: revision.changeReason } : {}),
      isEffective: contract.effectiveRevisionId === revision._id,
    });
  }

  if (revisions.length === 0) {
    return null;
  }

  const effectiveRevisionId = revisions.some((revision) => revision.isEffective)
    ? contract.effectiveRevisionId
    : undefined;
  return {
    ...(effectiveRevisionId ? { effectiveRevisionId } : {}),
    revisions,
  };
}

export function parseScopeTiptapJson(value: string) {
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

export function normalizeScopeTiptapJson(value: string) {
  parseScopeTiptapJson(value);
  return value;
}

export function hasSemanticTiptapContent(node: unknown): boolean {
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

export function assertScopeHasSemanticContent(value: string) {
  const document = parseScopeTiptapJson(value);
  if (!hasSemanticTiptapContent(document)) {
    throw new Error("Scope must contain non-empty content before publication.");
  }
}

export function requiredChangeReason(value: string | undefined) {
  const reason = value?.trim();
  if (!reason) {
    throw new Error("Publishing Scope v2 or later requires a change reason.");
  }
  return reason;
}

export async function findContract(
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
 * Resolve the immutable Scope revision that is effective for one active-Build
 * Sub-milestone.  This is intentionally a read-only bridge for downstream
 * consumers that have not yet migrated their snapshots to revision identity
 * fields (for example the Quote Package cutover in SFG-10).  It never creates,
 * patches, or clones canonical Scope records.
 *
 * A missing contract or effective pointer is represented by `null`; a present
 * but corrupt lineage fails closed so a caller cannot accidentally use a
 * revision belonging to another Proposal, tenant, or Build.
 */
export async function resolveEffectiveScopeRevisionForBuildSubmilestone(
  ctx: ScopeContext,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    organizationId: string;
    proposalId: Id<"buildProposals">;
    proposalSubmilestoneId: Id<"proposalSubmilestones">;
  }
) {
  const contract = await findContract(ctx, input.proposalSubmilestoneId);
  if (!contract) {
    return null;
  }
  if (
    contract.brokerageId !== input.brokerageId ||
    contract.organizationId !== input.organizationId ||
    contract.proposalId !== input.proposalId ||
    contract.proposalSubmilestoneId !== input.proposalSubmilestoneId ||
    (contract.buildId !== undefined && contract.buildId !== input.buildId) ||
    (contract.buildSubmilestoneId !== undefined &&
      contract.buildSubmilestoneId !== input.buildSubmilestoneId)
  ) {
    throw new ConvexError("Scope contract Build lineage is unavailable.");
  }
  if (!contract.effectiveRevisionId) {
    return null;
  }

  const revision = await ctx.db.get(contract.effectiveRevisionId);
  if (
    !revision ||
    revision.status !== "published" ||
    revision.brokerageId !== contract.brokerageId ||
    revision.organizationId !== contract.organizationId ||
    revision.proposalId !== contract.proposalId ||
    revision.proposalSubmilestoneId !== contract.proposalSubmilestoneId ||
    revision.contractId !== contract._id
  ) {
    throw new ConvexError("Effective Scope revision is unavailable.");
  }
  return revision;
}

export type AttachScopeBuildLineageInput = ExactBuildLineageAttachmentInput;

const SCOPE_BUILD_LINEAGE_CONFLICT =
  "Scope Build lineage is unavailable or conflicting.";

/**
 * Attach an existing canonical Scope contract to the exact active-Build
 * owner.  The helper never creates Scope rows and never changes revision
 * pointers, version counters, or content bytes.  If no contract exists (or
 * the Build has not closed yet), it is a no-op so closing can remain tolerant
 * of optional Scope authoring.
 *
 * Callers that already inserted a Build row may pass its IDs.  Late canonical
 * Scope creation omits them and lets the helper resolve the exact owner by
 * Proposal lineage.
 */
export async function attachSubmilestoneScopeBuildLineage(
  ctx: MutationCtx,
  input: AttachScopeBuildLineageInput
) {
  return await attachExactBuildLineage(ctx, input, {
    conflictMessage: SCOPE_BUILD_LINEAGE_CONFLICT,
    findOwner: findContract,
  });
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
