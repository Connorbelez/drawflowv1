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


import {
  requiredText,
  optionalText,
  requiredFiniteNumber,
  requiredInteger,
  requiredNonNegativeInteger,
  normalizeTiptapJson,
  assertAuthoringRole,
  assertReadRole,
  canSearchQuoteRecipientIdentities,
  authorizeQuoteRoundPath,
  authorizeQuoteRoundReadPath,
  requireRoundScope,
  requireDraftState,
  assertExpectedRevision,
  requireModeScope,
  capabilityRequirement,
  profileCapabilities,
  mapUrlForBuild,
  rowKey,
  normalizedAdHocMaterialRow,
  requireBuildCostItemSourceId,
  assertAdHocSourceInput,
  readDraftState,
  requireBuildSubmilestone,
  quoteScopeLineageInput,
  quoteScopeFromEffectiveRevision,
  quoteScopeForBuildSubmilestone,
  quoteScopeForBuildSubmilestoneCached,
  requireEffectiveQuoteScope,
  draftScopePinMatches,
  packageScopePinMatches,
  validateLabourSubmilestoneIds,
  validateMaterialAssignments,
  assertAggregateMaterialAssignments,
  assertDistinctMaterialSubmilestones,
} from "./access";
import {
  draftScopeUpdateAvailable,
  packageScopeUpdateAvailable,
} from "./publication_validation";

export function draftProjection(state: DraftState, scopeUpdateAvailable: boolean) {
  return {
    labourLines: state.labourScope.map((scope) => ({
      buildSubmilestoneId: scope.buildSubmilestoneId,
      scopeOfWorkTiptapJson: scope.scopeOfWorkTiptapJson,
      sourceScopeChangeReason: scope.sourceScopeChangeReason,
      sourceScopeRevisionId: scope.sourceScopeRevisionId,
      sourceScopeVersion: scope.sourceScopeVersion,
    })),
    labourSubmilestoneIds: state.labourScope.map(
      (scope) => scope.buildSubmilestoneId
    ),
    materialRows: state.materialRows.map((row) => ({
      assignedSubmilestoneIds: (
        state.materialAssignmentsByRowId.get(row._id) ?? []
      ).map((assignment) => assignment.buildSubmilestoneId),
      deliveryEndDay: row.deliveryEndDay,
      deliveryInstructions: row.deliveryInstructions,
      deliveryLocation: row.deliveryLocation,
      deliveryStartDay: row.deliveryStartDay,
      description: row.description,
      quantity: row.quantity,
      rowKey: row.rowKey,
      source: row.source,
      sourceBuildCostItemId: row.sourceBuildCostItemId,
      specificationTiptapJson: row.specificationTiptapJson,
      title: row.title,
      unit: row.unit,
    })),
    recipientProfileIds: state.recipients.map(
      (recipient) => recipient.recipientProfileId
    ),
    responseDeadline: state.draft.responseDeadline,
    scopeUpdateAvailable,
    templateVersionId: state.draft.templateVersionId,
  };
}
export async function packageRevisionProjection(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  packageRevision: Doc<"quotePackageRevisions">
) {
  if (
    packageRevision.buildId !== authorization.build._id ||
    packageRevision.organizationId !== authorization.organizationId ||
    packageRevision.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Quote Package Revision crosses Build scope.");
  }
  const [attachments, labourLines, materialLines, responseFields] =
    await Promise.all([
      ctx.db
        .query("quotePackageRevisionAttachments")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_INHERITED_ATTACHMENTS + 1),
      ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_DRAFT_LABOUR_LINES + 1),
      ctx.db
        .query("quotePackageRevisionMaterialLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_DRAFT_MATERIAL_LINES + 1),
      ctx.db
        .query("quotePackageRevisionResponseFields")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(101),
    ]);
  if (
    attachments.length > MAX_INHERITED_ATTACHMENTS ||
    labourLines.length > MAX_DRAFT_LABOUR_LINES ||
    materialLines.length > MAX_DRAFT_MATERIAL_LINES ||
    responseFields.length === 0 ||
    responseFields.length > 100
  ) {
    throw new ConvexError(
      "Quote Package Revision exceeds supported scope limits."
    );
  }
  const materialWithAssignments = await Promise.all(
    materialLines.map(async (line) => {
      const assignments = await ctx.db
        .query("quotePackageRevisionMaterialAssignments")
        .withIndex("by_quotePackageRevisionMaterialLineId_and_order", (query) =>
          query.eq("quotePackageRevisionMaterialLineId", line._id)
        )
        .take(MAX_MATERIAL_ASSIGNMENTS_PER_ROW + 1);
      if (assignments.length > MAX_MATERIAL_ASSIGNMENTS_PER_ROW) {
        throw new ConvexError(
          "Quote Package Material line has too many assignments."
        );
      }
      return {
        assignments: assignments.map((assignment) => ({
          buildSubmilestoneId: assignment.buildSubmilestoneId,
          milestoneKey: assignment.milestoneKey,
          milestoneName: assignment.milestoneName,
          submilestoneKey: assignment.submilestoneKey,
          submilestoneName: assignment.submilestoneName,
        })),
        deliveryEndDay: line.deliveryEndDay,
        deliveryInstructions: line.deliveryInstructions,
        deliveryLocation: line.deliveryLocation,
        deliveryStartDay: line.deliveryStartDay,
        description: line.description,
        quantity: line.quantity,
        source: line.source,
        sourceBuildCostItemId: line.sourceBuildCostItemId,
        specificationTiptapJson: line.specificationTiptapJson,
        title: line.title,
        unit: line.unit,
      };
    })
  );
  return {
    _id: packageRevision._id,
    attachments: attachments.map((attachment) => ({
      contentHashSha256Snapshot: attachment.contentHashSha256Snapshot,
      fileNameSnapshot: attachment.fileNameSnapshot,
      kind: attachment.kind,
      mimeTypeSnapshot: attachment.mimeTypeSnapshot,
      sourceBuildDocumentId: attachment.sourceBuildDocumentId,
      sourceBuildSubmilestoneId: attachment.sourceBuildSubmilestoneId,
    })),
    labourLines: labourLines.map((line) => ({
      buildSubmilestoneId: line.buildSubmilestoneId,
      milestoneKey: line.milestoneKey,
      milestoneName: line.milestoneName,
      scopeOfWorkTiptapJson: line.scopeOfWorkTiptapJson,
      sourceScopeChangeReason: line.sourceScopeChangeReason,
      sourceScopeRevisionId: line.sourceScopeRevisionId,
      sourceScopeVersion: line.sourceScopeVersion,
      startDay: line.startDay,
      submilestoneKey: line.submilestoneKey,
      submilestoneName: line.submilestoneName,
    })),
    materialLines: materialWithAssignments,
    permitDocumentId: packageRevision.permitDocumentId,
    responseDeadline: packageRevision.responseDeadline,
    responseFields: responseFields.map((field) => ({
      allowAlternates: field.allowAlternates,
      allowExclusions: field.allowExclusions,
      choiceOptions: field.choiceOptions,
      fieldKey: field.fieldKey,
      isPermanent: field.isPermanent,
      kind: field.kind,
      label: field.label,
      order: field.order,
      renderer: field.renderer,
      repeatable: field.repeatable,
      required: field.required,
      richTextDefaultHtml: field.richTextDefaultHtml,
      scope: field.scope,
      supportsTax: field.supportsTax,
      tax: field.tax,
      validation: field.validation,
    })),
    revision: packageRevision.revision,
    roadmapSnapshotFingerprint: packageRevision.roadmapSnapshotFingerprint,
    siteAddressSnapshot: packageRevision.siteAddressSnapshot,
    siteLatitudeSnapshot: packageRevision.siteLatitudeSnapshot,
    siteLongitudeSnapshot: packageRevision.siteLongitudeSnapshot,
    siteMapUrlSnapshot: packageRevision.siteMapUrlSnapshot,
    sitePlaceIdSnapshot: packageRevision.sitePlaceIdSnapshot,
    templateVersionId: packageRevision.templateVersionId,
    timelineCurrentDaySnapshot: packageRevision.timelineCurrentDaySnapshot,
    timelineRangeMaxSnapshot: packageRevision.timelineRangeMaxSnapshot,
    timelineRangeMinSnapshot: packageRevision.timelineRangeMinSnapshot,
    timelineStartDateSnapshot: packageRevision.timelineStartDateSnapshot,
  };
}

export async function quoteRoundProjection(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">
) {
  const invitations = await ctx.db
    .query("quoteRoundInvitations")
    .withIndex("by_quoteRoundId_and_participationState", (query) =>
      query.eq("quoteRoundId", round._id).eq("participationState", "active")
    )
    .take(MAX_DRAFT_RECIPIENTS + 1);
  if (invitations.length > MAX_DRAFT_RECIPIENTS) {
    throw new ConvexError("Quote Round has too many invitations.");
  }
  const draft =
    round.state === "draft" ? await readDraftState(ctx, round) : null;
  const packageRevision = round.currentPackageRevisionId
    ? await ctx.db.get(round.currentPackageRevisionId)
    : null;
  const packageRevisionHistory = await ctx.db
    .query("quotePackageRevisions")
    .withIndex("by_quoteRoundId_and_revision", (query) =>
      query.eq("quoteRoundId", round._id)
    )
    .order("asc")
    .take(MAX_PACKAGE_REVISION_HISTORY + 1);
  if (packageRevisionHistory.length > MAX_PACKAGE_REVISION_HISTORY) {
    throw new ConvexError(
      "Quote Package Revision history exceeds safe limits."
    );
  }
  for (const revision of packageRevisionHistory) {
    if (
      revision.brokerageId !== authorization.brokerage._id ||
      revision.organizationId !== authorization.organizationId ||
      revision.buildId !== authorization.build._id ||
      revision.quoteRoundId !== round._id
    ) {
      throw new ConvexError(
        "Quote Package Revision history crosses Build scope."
      );
    }
  }
  const packageLabourLines = packageRevision
    ? await ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_DRAFT_LABOUR_LINES + 1)
    : [];
  if (packageLabourLines.length > MAX_DRAFT_LABOUR_LINES) {
    throw new ConvexError(
      "Quote Package Revision exceeds supported Labour scope limits."
    );
  }
  const scopeCache: QuoteScopeCache = new Map();
  const scopeUpdateAvailable = draft
    ? await draftScopeUpdateAvailable(
        ctx,
        authorization,
        draft.labourScope,
        scopeCache
      )
    : packageRevision
      ? await packageScopeUpdateAvailable(
          ctx,
          authorization,
          packageLabourLines,
          scopeCache
        )
      : false;
  return {
    _id: round._id,
    buildId: round.buildId,
    draft: draft ? draftProjection(draft, scopeUpdateAvailable) : null,
    invitations: invitations.map((invitation) => ({
      _id: invitation._id,
      participationState: invitation.participationState,
      recipientCapabilitiesSnapshot: invitation.recipientCapabilitiesSnapshot,
      recipientEmailSnapshot: invitation.recipientEmailSnapshot,
      recipientNameSnapshot: invitation.recipientNameSnapshot,
      recipientProfileId: invitation.recipientProfileId,
    })),
    mode: round.mode,
    packageRevisionHistory: packageRevisionHistory.map((revision) => ({
      _id: revision._id,
      publishedAt: revision.publishedAt,
      responseDeadline: revision.responseDeadline,
      revision: revision.revision,
    })),
    packageRevision: packageRevision
      ? await packageRevisionProjection(ctx, authorization, packageRevision)
      : null,
    revision: round.revision,
    scopeUpdateAvailable,
    state: round.state,
    title: round.title,
    updatedAt: round.updatedAt,
  };
}
