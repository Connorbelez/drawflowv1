import { ConvexError, v } from "convex/values";

import { type ActiveBuildAuthorization } from "../activeBuildAccess";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_DRAFT_MATERIAL_LINES,
  MAX_MATERIAL_ASSIGNMENTS_PER_ROW,
  MAX_TOTAL_MATERIAL_ASSIGNMENTS,
  MAX_DISTINCT_MATERIAL_SUBMILESTONES,
  MAX_CURRENT_PERMIT_CANDIDATES,
  MAX_TIPTAP_JSON_LENGTH,
  MATERIAL_ROW_KEY_PATTERN,
  type DraftMaterialRowInput,
  type NormalizedAdHocMaterialRow,
  type EffectiveQuoteScope,
  type DraftState,
  type QuoteScopeCache,
} from "./contracts";
import {
  requiredText,
  optionalText,
  requiredFiniteNumber,
  requiredInteger,
  normalizeTiptapJson,
  rowKey,
  validateMaterialAssignments,
  assertAggregateMaterialAssignments,
  assertDistinctMaterialSubmilestones,
  requireBuildSubmilestone,
  quoteScopeForBuildSubmilestoneCached,
  draftScopePinMatches,
  packageScopePinMatches,
} from "./access";

export async function requirePublishedTemplateVersion(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  mode: Doc<"quoteRounds">["mode"],
  templateVersionId: Id<"quoteResponseTemplateVersions">
) {
  const version = await ctx.db.get(templateVersionId);
  if (
    !version ||
    version.status !== "published" ||
    version.validationState !== "valid" ||
    version.organizationId !== authorization.organizationId ||
    version.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError(
      "A published Quote Response Template version is required."
    );
  }
  const template = await ctx.db.get(version.templateId);
  if (
    !template ||
    template.status !== "active" ||
    template.organizationId !== authorization.organizationId ||
    template.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError(
      "Quote Response Template is unavailable for this organization."
    );
  }
  const audienceAllowed =
    version.audience === "either" ||
    (mode === "labour" && version.audience === "contractor") ||
    (mode === "material" && version.audience === "supplier");
  if (!audienceAllowed) {
    throw new ConvexError(
      "Quote Response Template audience is incompatible with this Quote Round mode."
    );
  }
  const fields = await ctx.db
    .query("quoteResponseTemplateFields")
    .withIndex("by_version_order", (query) =>
      query.eq("versionId", version._id)
    )
    .take(101);
  if (fields.length === 0 || fields.length > 100) {
    throw new ConvexError("Quote Response Template fields are unavailable.");
  }
  for (const field of fields) {
    if (
      field.templateId !== template._id ||
      field.versionId !== version._id ||
      field.organizationId !== authorization.organizationId ||
      field.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError(
        "Quote Response Template field crosses organization scope."
      );
    }
  }
  return { fields, template, version };
}

export async function requireGovernedBuildDocument(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"buildDocuments">,
  label: string
) {
  if (
    document.buildId !== authorization.build._id ||
    document.proposalId !== authorization.proposal._id ||
    document.organizationId !== authorization.organizationId ||
    document.brokerageId !== authorization.brokerage._id ||
    document.status === "superseded" ||
    document.supersededByDocumentId ||
    !document.storageId ||
    !document.governedAssetId
  ) {
    throw new ConvexError(`${label} is not a current governed Build Document.`);
  }
  const asset = await ctx.db.get(document.governedAssetId);
  if (
    !asset ||
    asset.organizationId !== authorization.organizationId ||
    asset.brokerageId !== authorization.brokerage._id ||
    asset.buildId !== authorization.build._id ||
    asset.storageId !== document.storageId ||
    !isCleanCollaborationAsset(asset)
  ) {
    throw new ConvexError(
      `${label} must resolve to a clean governed Build asset.`
    );
  }
  if (
    asset.fileName !== document.fileName ||
    asset.mimeType !== document.mimeType ||
    asset.sizeBytes !== document.sizeBytes
  ) {
    throw new ConvexError(
      `${label} metadata does not match its clean governed Build asset.`
    );
  }
  if (!asset.contentHashSha256) {
    throw new ConvexError(`${label} is missing a governed SHA-256 hash.`);
  }
  return { asset, document };
}

export function governedAssetContentHash(asset: Doc<"buildCollaborationAssets">) {
  if (!asset.contentHashSha256) {
    throw new ConvexError("Governed Build asset is missing a SHA-256 hash.");
  }
  return asset.contentHashSha256;
}

export async function resolveCurrentPermitDocument(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  let inspected = 0;
  const permits = ctx.db
    .query("buildDocuments")
    .withIndex("by_build_type", (query) =>
      query.eq("buildId", authorization.build._id).eq("documentType", "permit")
    )
    .order("desc");
  for await (const document of permits) {
    inspected += 1;
    if (inspected > MAX_CURRENT_PERMIT_CANDIDATES) {
      throw new ConvexError("Build Permit history exceeds supported limits.");
    }
    if (
      document.proposalId === authorization.proposal._id &&
      document.organizationId === authorization.organizationId &&
      document.brokerageId === authorization.brokerage._id &&
      document.status !== "superseded" &&
      !document.supersededByDocumentId
    ) {
      return document;
    }
  }
  return null;
}

export async function currentPermitDocument(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const active = await resolveCurrentPermitDocument(ctx, authorization);
  if (!active) {
    throw new ConvexError(
      "A current governed Build Permit is required before publishing a Quote Round."
    );
  }
  return await requireGovernedBuildDocument(
    ctx,
    authorization,
    active,
    "Build Permit"
  );
}

export async function draftScopeUpdateAvailable(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  rows: Doc<"quoteRoundDraftLabourScope">[],
  scopeCache: QuoteScopeCache
) {
  const matches = await Promise.all(
    rows.map(async (row) => {
      const current = await quoteScopeForBuildSubmilestoneCached(
        ctx,
        authorization,
        row.buildSubmilestoneId,
        scopeCache
      );
      // A missing effective Scope is not an update that can be applied. The
      // publication path still fails closed, but the read-only indicator must
      // not tell an operator that a refresh is available when there is no
      // canonical revision to refresh to.
      return current ? draftScopePinMatches(row, current) : true;
    })
  );
  return matches.some((matchesCurrent) => !matchesCurrent);
}
export async function packageScopeUpdateAvailable(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  rows: Doc<"quotePackageRevisionLabourLines">[],
  scopeCache: QuoteScopeCache
) {
  const matches = await Promise.all(
    rows.map(async (row) => {
      const current = await quoteScopeForBuildSubmilestoneCached(
        ctx,
        authorization,
        row.buildSubmilestoneId,
        scopeCache
      );
      // A missing effective Scope is not an update that can be applied. Keep
      // the package pinned and let an explicit publication/republish attempt
      // report the missing canonical Scope instead of advertising a refresh.
      return current ? packageScopePinMatches(row, current) : true;
    })
  );
  return matches.some((matchesCurrent) => !matchesCurrent);
}
