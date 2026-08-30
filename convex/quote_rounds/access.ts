import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
} from "../authz";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import {
  normalizeOperationalIdempotencyKey,
  operationalRequestFingerprint,
} from "../build_operational_idempotency";
import { assertOrganizationRetentionWritable } from "../data_retention";
import { assertQuoteAuthoringRole } from "../quote_authoring_access";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
} from "../quote_invitation_access";
import {
  quoteInvitationCommunicationProjection,
  quoteInvitationCommunicationProjectionValidator,
} from "../quote_notifications";
import {
  getPreferredState,
  preferredPointerFromState,
} from "../quote_preferred";
import { resolveEffectiveScopeRevisionForBuildSubmilestone } from "../submilestone_scope_contracts";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  MAX_DRAFT_LABOUR_LINES,
  MAX_DRAFT_MATERIAL_LINES,
  MAX_DRAFT_RECIPIENTS,
  MAX_REGISTER_INVITATIONS,
  MAX_REGISTER_ACTIVE_INVITATIONS,
  MAX_REGISTER_CREDENTIALS_PER_INVITATION,
  MAX_REGISTER_NOTICES_PER_ROUND,
  MAX_MATERIAL_ASSIGNMENTS_PER_ROW,
  MAX_TOTAL_MATERIAL_ASSIGNMENTS,
  MAX_DISTINCT_MATERIAL_SUBMILESTONES,
  MAX_INHERITED_ATTACHMENTS,
  MAX_INHERITED_LINKS_SCANNED,
  MAX_CURRENT_PERMIT_CANDIDATES,
  MAX_PACKAGE_REVISION_HISTORY,
  MAX_TIPTAP_JSON_LENGTH,
  MATERIAL_ROW_KEY_PATTERN,
  quoteRoundModeValidator,
  quoteRoundStateValidator,
  quoteRoundAttentionReasonValidator,
  quoteRoundAttentionToneValidator,
  quoteRoundDeliveryStatusValidator,
  quoteRoundMaterialSourceValidator,
  quoteRecipientCapabilityValidator,
  quoteResponseTemplateAudienceValidator,
  quoteResponseTemplateFieldKindValidator,
  quoteResponseTemplateFieldScopeValidator,
  quoteResponseTemplateFieldRendererValidator,
  quoteResponseTemplateFieldValidationValidator,
  quoteResponseTemplateTaxValidator,
  materialDraftRowInputValidator,
  quoteTemplateFieldProjectionValidator,
  quoteTemplateVersionProjectionValidator,
  labourSourceProjectionValidator,
  materialSourceProjectionValidator,
  quoteRecipientProjectionValidator,
  composerProjectionValidator,
  draftMaterialRowProjectionValidator,
  quoteRoundDraftProjectionValidator,
  packageAttachmentProjectionValidator,
  packageLabourLineProjectionValidator,
  packageMaterialAssignmentProjectionValidator,
  packageMaterialLineProjectionValidator,
  packageResponseFieldProjectionValidator,
  quotePackageRevisionProjectionValidator,
  quoteInvitationProjectionValidator,
  quoteRoundProjectionValidator,
  quoteRoundSummaryValidator,
  quoteRoundListValidator,
  quoteRoundScopePinTransitionValidator,
  quoteRoundDraftMutationResultValidator,
  quoteRoundScopeRefreshMutationResultValidator,
  quoteRoundPublicationResultValidator,
  QuoteRoundCtx,
  DraftMaterialRowInput,
  NormalizedAdHocMaterialRow,
  DraftState,
  EffectiveQuoteScope,
  QuoteRoundScopePinTransition,
  QuoteScopeCache,
} from "./contracts";

export function requiredText(
  value: string | undefined,
  label: string,
  maxLength: number
) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new ConvexError(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new ConvexError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

export function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number
) {
  if (value === undefined) {
    return;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ConvexError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized || undefined;
}

export function requiredFiniteNumber(value: number | undefined, label: string) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new ConvexError(`${label} must be a positive number.`);
  }
  return value;
}

export function requiredInteger(value: number | undefined, label: string) {
  if (value === undefined || !Number.isInteger(value)) {
    throw new ConvexError(`${label} must be an integer.`);
  }
  return value;
}

export function requiredNonNegativeInteger(value: number | undefined, label: string) {
  const normalized = requiredInteger(value, label);
  if (normalized < 0) {
    throw new ConvexError(`${label} must be on or after T0.`);
  }
  return normalized;
}

export function normalizeTiptapJson(value: string | undefined, label: string) {
  const normalized = requiredText(value, label, MAX_TIPTAP_JSON_LENGTH);
  let document: unknown;
  try {
    document = JSON.parse(normalized);
  } catch {
    throw new ConvexError(`${label} must be valid TipTap JSON.`);
  }
  if (
    !document ||
    typeof document !== "object" ||
    !("type" in document) ||
    document.type !== "doc"
  ) {
    throw new ConvexError(`${label} must contain a TipTap document root.`);
  }
  // Preserve the exact canonical string rather than flattening or serializing
  // it again. Package snapshots must retain supported TipTap structure.
  return normalized;
}

export function assertAuthoringRole(viewer: AuthorizedViewer) {
  assertQuoteAuthoringRole(viewer.roles);
}

export function assertReadRole(roles: readonly string[]) {
  if (
    !roles.some((role) =>
      [
        "admin",
        "principle-broker",
        "broker",
        "broker-staff",
        "builder",
        "builder-staff",
        "homeowner",
      ].includes(role)
    )
  ) {
    throw new ConvexError(
      "Forbidden: this Build role cannot read Quote Rounds."
    );
  }
}

export function canSearchQuoteRecipientIdentities(roles: readonly string[]) {
  return roles.some((role) =>
    [
      "admin",
      "principle-broker",
      "broker",
      "broker-staff",
      "builder",
      "builder-staff",
    ].includes(role)
  );
}

export async function authorizeQuoteRoundPath(
  ctx: QuoteRoundCtx,
  input: { buildId: Id<"activeBuilds">; workosOrganizationId: string }
) {
  assertAuthoringRole(ctx.viewer);
  return await authorizeActiveBuildAccess(ctx, {
    buildId: input.buildId,
    organizationId: input.workosOrganizationId,
  });
}

export async function authorizeQuoteRoundReadPath(
  ctx: QuoteRoundCtx,
  input: { buildId: Id<"activeBuilds">; workosOrganizationId: string }
) {
  const authorization = await authorizeActiveBuildAccess(ctx, {
    backofficePolicy: "proposal-read",
    buildId: input.buildId,
    organizationId: input.workosOrganizationId,
  });
  assertReadRole(authorization.roles);
  return authorization;
}

export function requireRoundScope(
  round: Doc<"quoteRounds"> | null,
  authorization: ActiveBuildAuthorization,
  quoteRoundId: Id<"quoteRounds">
) {
  if (
    !round ||
    round._id !== quoteRoundId ||
    round.buildId !== authorization.build._id ||
    round.proposalId !== authorization.proposal._id ||
    round.organizationId !== authorization.organizationId ||
    round.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Quote Round is unavailable for this Build.");
  }
  return round;
}

export function requireDraftState(round: Doc<"quoteRounds">) {
  if (round.state !== "draft") {
    throw new ConvexError("Published Quote Round rows are immutable.");
  }
}

export function assertExpectedRevision(
  round: Doc<"quoteRounds">,
  expectedRevision: number
) {
  if (
    !Number.isInteger(expectedRevision) ||
    expectedRevision !== round.revision
  ) {
    throw new ConvexError({
      code: "QUOTE_ROUND_REVISION_CONFLICT",
      currentRevision: round.revision,
      message: "Quote Round changed. Reload the latest draft before saving.",
    });
  }
}

export function requireModeScope(
  mode: Doc<"quoteRounds">["mode"],
  input: { labourCount: number; materialCount: number }
) {
  const hasLabour = input.labourCount > 0;
  const hasMaterial = input.materialCount > 0;
  if (mode === "labour" && (!hasLabour || hasMaterial)) {
    throw new ConvexError("Labour Quote Rounds require Labour scope only.");
  }
  if (mode === "material" && (hasLabour || !hasMaterial)) {
    throw new ConvexError("Material Quote Rounds require Material scope only.");
  }
  if (mode === "combined" && !(hasLabour && hasMaterial)) {
    throw new ConvexError(
      "Combined Quote Rounds require both Labour and Material scope."
    );
  }
}

export function capabilityRequirement(mode: Doc<"quoteRounds">["mode"]) {
  if (mode === "labour") {
    return ["contractor"] as const;
  }
  if (mode === "material") {
    return ["supplier"] as const;
  }
  return ["contractor", "supplier"] as const;
}

export function profileCapabilities(profile: Doc<"contractorProfiles">) {
  return profile.quoteRecipientCapabilities ?? ["contractor"];
}

export function mapUrlForBuild(build: Doc<"activeBuilds">) {
  const location = build.location.trim();
  if (!location) {
    throw new ConvexError(
      "Build location is required before publishing a Quote Round."
    );
  }
  const query =
    build.locationLatitude !== undefined &&
    build.locationLongitude !== undefined
      ? `${build.locationLatitude},${build.locationLongitude}`
      : location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function rowKey(value: string) {
  const normalized = requiredText(value, "Material row key", 128);
  if (!MATERIAL_ROW_KEY_PATTERN.test(normalized)) {
    throw new ConvexError("Material row key contains unsupported characters.");
  }
  return normalized;
}

export function normalizedAdHocMaterialRow(
  input: DraftMaterialRowInput
): NormalizedAdHocMaterialRow {
  const deliveryStartDay = requiredNonNegativeInteger(
    input.deliveryStartDay,
    "Delivery start day"
  );
  const deliveryEndDay = requiredNonNegativeInteger(
    input.deliveryEndDay,
    "Delivery end day"
  );
  if (deliveryEndDay < deliveryStartDay) {
    throw new ConvexError(
      "Delivery end day cannot precede delivery start day."
    );
  }
  return {
    deliveryEndDay,
    deliveryInstructions: requiredText(
      input.deliveryInstructions,
      "Delivery instructions",
      4000
    ),
    deliveryLocation: requiredText(
      input.deliveryLocation,
      "Delivery location",
      500
    ),
    deliveryStartDay,
    description: optionalText(input.description, "Material description", 4000),
    quantity: requiredFiniteNumber(input.quantity, "Material quantity"),
    rowKey: rowKey(input.rowKey),
    source: "ad_hoc",
    specificationTiptapJson: normalizeTiptapJson(
      input.specificationTiptapJson,
      "Material specification"
    ),
    title: requiredText(input.title, "Material title", 240),
    unit: requiredText(input.unit, "Material unit", 80),
  };
}

export function requireBuildCostItemSourceId(input: DraftMaterialRowInput) {
  if (!input.sourceBuildCostItemId) {
    throw new ConvexError(
      "A Build material row requires its canonical Build Cost Item."
    );
  }
  if (
    input.title !== undefined ||
    input.description !== undefined ||
    input.quantity !== undefined ||
    input.unit !== undefined ||
    input.specificationTiptapJson !== undefined ||
    input.deliveryLocation !== undefined ||
    input.deliveryStartDay !== undefined ||
    input.deliveryEndDay !== undefined ||
    input.deliveryInstructions !== undefined
  ) {
    throw new ConvexError(
      "Build Cost Item material values are server-derived and cannot be overridden in a Quote Draft."
    );
  }
  return input.sourceBuildCostItemId;
}

export function assertAdHocSourceInput(input: DraftMaterialRowInput) {
  if (input.sourceBuildCostItemId) {
    throw new ConvexError(
      "Ad-hoc material rows cannot point at a Build Cost Item."
    );
  }
}

export async function readDraftState(
  ctx: QueryCtx | MutationCtx,
  round: Doc<"quoteRounds">
): Promise<DraftState> {
  const draft = await ctx.db
    .query("quoteRoundDrafts")
    .withIndex("by_quoteRoundId", (query) =>
      query.eq("quoteRoundId", round._id)
    )
    .unique();
  if (
    !draft ||
    draft.buildId !== round.buildId ||
    draft.organizationId !== round.organizationId ||
    draft.brokerageId !== round.brokerageId
  ) {
    throw new ConvexError("Quote Round draft state is unavailable.");
  }
  const [labourScope, materialRows, recipients] = await Promise.all([
    ctx.db
      .query("quoteRoundDraftLabourScope")
      .withIndex("by_quoteRoundId_and_order", (query) =>
        query.eq("quoteRoundId", round._id)
      )
      .take(MAX_DRAFT_LABOUR_LINES + 1),
    ctx.db
      .query("quoteRoundDraftMaterialRows")
      .withIndex("by_quoteRoundId_and_order", (query) =>
        query.eq("quoteRoundId", round._id)
      )
      .take(MAX_DRAFT_MATERIAL_LINES + 1),
    ctx.db
      .query("quoteRoundDraftRecipients")
      .withIndex("by_quoteRoundId_and_order", (query) =>
        query.eq("quoteRoundId", round._id)
      )
      .take(MAX_DRAFT_RECIPIENTS + 1),
  ]);
  if (
    labourScope.length > MAX_DRAFT_LABOUR_LINES ||
    materialRows.length > MAX_DRAFT_MATERIAL_LINES ||
    recipients.length > MAX_DRAFT_RECIPIENTS
  ) {
    throw new ConvexError("Quote Round draft exceeds supported scope limits.");
  }
  const rows = materialRows as Doc<"quoteRoundDraftMaterialRows">[];
  const assignmentEntries = await Promise.all(
    rows.map(async (row) => {
      const assignments = await ctx.db
        .query("quoteRoundDraftMaterialAssignments")
        .withIndex("by_quoteRoundDraftMaterialRowId_and_order", (query) =>
          query.eq("quoteRoundDraftMaterialRowId", row._id)
        )
        .take(MAX_MATERIAL_ASSIGNMENTS_PER_ROW + 1);
      if (assignments.length > MAX_MATERIAL_ASSIGNMENTS_PER_ROW) {
        throw new ConvexError(
          "A Material row has too many Sub-milestone assignments."
        );
      }
      return [row._id, assignments] as const;
    })
  );
  assertAggregateMaterialAssignments(
    assignmentEntries.reduce(
      (total, [, assignments]) => total + assignments.length,
      0
    )
  );
  return {
    draft,
    labourScope: labourScope as Doc<"quoteRoundDraftLabourScope">[],
    materialAssignmentsByRowId: new Map(assignmentEntries),
    materialRows: rows,
    recipients: recipients as Doc<"quoteRoundDraftRecipients">[],
  };
}

export async function requireBuildSubmilestone(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  id: Id<"buildSubmilestones">
) {
  const submilestone = await ctx.db.get(id);
  if (
    !submilestone ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.organizationId !== authorization.organizationId ||
    submilestone.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Sub-milestone is unavailable for this Build.");
  }
  const milestone = await ctx.db.get(submilestone.buildMilestoneId);
  if (
    !milestone ||
    milestone.buildId !== authorization.build._id ||
    milestone.organizationId !== authorization.organizationId ||
    milestone.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError(
      "Sub-milestone has an invalid Build Milestone source."
    );
  }
  return { milestone, submilestone };
}

/** Resolve the only Scope source eligible for new Quote composition. */
export function quoteScopeLineageInput(
  authorization: ActiveBuildAuthorization,
  submilestone: Doc<"buildSubmilestones">
) {
  return {
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    buildSubmilestoneId: submilestone._id,
    organizationId: authorization.organizationId,
    proposalId: authorization.proposal._id,
    proposalSubmilestoneId: submilestone.proposalSubmilestoneId,
  };
}

export function quoteScopeFromEffectiveRevision(
  effectiveRevision: Awaited<
    ReturnType<typeof resolveEffectiveScopeRevisionForBuildSubmilestone>
  >
): EffectiveQuoteScope | null {
  if (!effectiveRevision) {
    return null;
  }
  return {
    scopeOfWorkTiptapJson: normalizeTiptapJson(
      effectiveRevision.scopeOfWorkTiptapJson,
      "Effective Sub-milestone Scope"
    ),
    sourceScopeChangeReason: effectiveRevision.changeReason,
    sourceScopeRevisionId: effectiveRevision._id,
    sourceScopeVersion: effectiveRevision.version,
  };
}

export async function quoteScopeForBuildSubmilestone(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  submilestone: Doc<"buildSubmilestones">
) {
  const effectiveRevision =
    await resolveEffectiveScopeRevisionForBuildSubmilestone(
      ctx,
      quoteScopeLineageInput(authorization, submilestone)
    );
  return quoteScopeFromEffectiveRevision(effectiveRevision);
}

export function quoteScopeForBuildSubmilestoneCached(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  buildSubmilestoneId: Id<"buildSubmilestones">,
  cache: QuoteScopeCache
) {
  const cached = cache.get(buildSubmilestoneId);
  if (cached) {
    return cached;
  }
  const pending = requireBuildSubmilestone(
    ctx,
    authorization,
    buildSubmilestoneId
  ).then(({ submilestone }) =>
    quoteScopeForBuildSubmilestone(ctx, authorization, submilestone)
  );
  cache.set(buildSubmilestoneId, pending);
  return pending;
}

export async function requireEffectiveQuoteScope(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  submilestone: Doc<"buildSubmilestones">
) {
  const scope = await quoteScopeForBuildSubmilestone(
    ctx,
    authorization,
    submilestone
  );
  if (!scope) {
    throw new ConvexError(
      "An effective Sub-milestone Scope is required for this Labour Quote Package."
    );
  }
  return scope;
}

export function draftScopePinMatches(
  row: Doc<"quoteRoundDraftLabourScope">,
  current: EffectiveQuoteScope
) {
  return (
    row.sourceScopeRevisionId === current.sourceScopeRevisionId &&
    row.sourceScopeVersion === current.sourceScopeVersion &&
    row.sourceScopeChangeReason === current.sourceScopeChangeReason &&
    row.scopeOfWorkTiptapJson === current.scopeOfWorkTiptapJson
  );
}

export function packageScopePinMatches(
  row: Doc<"quotePackageRevisionLabourLines">,
  current: EffectiveQuoteScope
) {
  return (
    row.sourceScopeRevisionId === current.sourceScopeRevisionId &&
    row.sourceScopeVersion === current.sourceScopeVersion &&
    row.sourceScopeChangeReason === current.sourceScopeChangeReason &&
    row.scopeOfWorkTiptapJson === current.scopeOfWorkTiptapJson
  );
}

export async function validateLabourSubmilestoneIds(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  ids: Id<"buildSubmilestones">[]
) {
  if (ids.length > MAX_DRAFT_LABOUR_LINES) {
    throw new ConvexError(
      "A Quote Round supports at most 100 Labour Sub-milestones."
    );
  }
  if (new Set(ids.map(String)).size !== ids.length) {
    throw new ConvexError("Labour Sub-milestones must be unique.");
  }
  await Promise.all(
    ids.map((id) => requireBuildSubmilestone(ctx, authorization, id))
  );
  return ids;
}

export function validateMaterialAssignments(ids: Id<"buildSubmilestones">[]) {
  if (ids.length === 0) {
    throw new ConvexError(
      "Every Material row must be assigned to at least one Sub-milestone."
    );
  }
  if (ids.length > MAX_MATERIAL_ASSIGNMENTS_PER_ROW) {
    throw new ConvexError(
      "A Material row supports at most 100 Sub-milestone assignments."
    );
  }
  if (new Set(ids.map(String)).size !== ids.length) {
    throw new ConvexError("Material Sub-milestone assignments must be unique.");
  }
  return ids;
}

export function assertAggregateMaterialAssignments(total: number) {
  if (total > MAX_TOTAL_MATERIAL_ASSIGNMENTS) {
    throw new ConvexError(
      "A Quote Round supports at most 3,000 Material Sub-milestone assignments."
    );
  }
}

export function assertDistinctMaterialSubmilestones(total: number) {
  if (total > MAX_DISTINCT_MATERIAL_SUBMILESTONES) {
    throw new ConvexError(
      "A Quote Round supports at most 500 distinct Material Sub-milestones."
    );
  }
}
