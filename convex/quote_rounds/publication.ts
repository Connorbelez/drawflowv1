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
  requireBuildCostItem,
  materialFieldsFromSource,
  validateDraftMaterialRows,
  validateRecipients,
} from "./draft_validation";
import {
  requirePublishedTemplateVersion,
  requireGovernedBuildDocument,
  governedAssetContentHash,
  resolveCurrentPermitDocument,
  currentPermitDocument,
  draftScopeUpdateAvailable,
  packageScopeUpdateAvailable,
} from "./publication_validation";
import {
  draftProjection,
  packageRevisionProjection,
  quoteRoundProjection,
} from "./projections";
import {
  appendQuoteRoundEvent,
  replaceDraftLabourScope,
  refreshDraftLabourScopePins,
  replaceDraftMaterialRows,
  replaceDraftRecipients,
  preparedLabourLines,
  prepareEffectiveLabourLinesForPackageRevision,
  preparedMaterialLines,
  assertSubmilestoneDocumentLinkScope,
  inheritedAttachmentForLink,
  inheritedPackageAttachments,
  roadmapSnapshotFingerprint,
} from "./draft_mutations";
import type {
  PreparedPublication,
} from "./draft_mutations";
import type { QuoteRoundPublicationResult } from "./contracts";

export async function preparePublication(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  state: DraftState,
  now: number
): Promise<PreparedPublication> {
  if (!state.draft.templateVersionId) {
    throw new ConvexError(
      "Select a published Quote Response Template before publishing."
    );
  }
  if (state.draft.responseDeadline === undefined) {
    throw new ConvexError(
      "A Quote Response Deadline is required before publishing."
    );
  }
  const deadline = requiredInteger(
    state.draft.responseDeadline,
    "Quote Response Deadline"
  );
  if (deadline <= now) {
    throw new ConvexError("Quote Response Deadline must be in the future.");
  }
  const [template, labourLines, materialLines, permit] = await Promise.all([
    requirePublishedTemplateVersion(
      ctx,
      authorization,
      round.mode,
      state.draft.templateVersionId
    ),
    preparedLabourLines(ctx, authorization, state),
    preparedMaterialLines(ctx, authorization, state),
    currentPermitDocument(ctx, authorization),
  ]);
  requireModeScope(round.mode, {
    labourCount: labourLines.length,
    materialCount: materialLines.length,
  });
  const recipients = await validateRecipients(
    ctx,
    authorization,
    round.mode,
    state.recipients.map((recipient) => recipient.recipientProfileId)
  );
  if (recipients.length === 0) {
    throw new ConvexError(
      "At least one compatible Quote recipient is required before publishing."
    );
  }
  const scopedSubmilestoneIds = [
    ...new Set([
      ...labourLines.map((line) => line.submilestone._id),
      ...materialLines.flatMap((line) =>
        line.assignments.map((assignment) => assignment.submilestone._id)
      ),
    ]),
  ];
  const [attachments, roadmapHash] = await Promise.all([
    inheritedPackageAttachments(
      ctx,
      authorization,
      scopedSubmilestoneIds,
      permit.document._id
    ),
    roadmapSnapshotFingerprint(ctx, authorization),
  ]);
  return {
    attachments,
    deadline,
    labourLines,
    materialLines,
    permit: {
      asset: permit.asset,
      document: permit.document,
      kind: "permit",
    },
    recipients,
    roadmapSnapshotFingerprint: roadmapHash,
    template,
  };
}
export async function replayQuoteRoundPublication(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  existingRequest: Doc<"quoteRoundPublicationRequests"> | null,
  expectedRevision: number,
  requestFingerprint: string
): Promise<QuoteRoundPublicationResult | null> {
  if (!existingRequest) {
    return null;
  }
  if (
    existingRequest.buildId !== authorization.build._id ||
    existingRequest.organizationId !== authorization.organizationId ||
    existingRequest.brokerageId !== authorization.brokerage._id ||
    existingRequest.requestFingerprint !== requestFingerprint ||
    existingRequest.expectedDraftRevision !== expectedRevision
  ) {
    throw new ConvexError(
      "Quote Round publication idempotency key was reused with a different request."
    );
  }
  const packageRevision = await ctx.db.get(
    existingRequest.quotePackageRevisionId
  );
  if (
    !packageRevision ||
    packageRevision.quoteRoundId !== round._id ||
    packageRevision.buildId !== authorization.build._id ||
    packageRevision.organizationId !== authorization.organizationId ||
    packageRevision.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Quote Round publication record is inconsistent.");
  }
  const invitations = await ctx.db
    .query("quoteRoundInvitations")
    .withIndex("by_quoteRoundId_and_participationState", (query) =>
      query.eq("quoteRoundId", round._id).eq("participationState", "active")
    )
    .take(MAX_DRAFT_RECIPIENTS + 1);
  if (invitations.length === 0 || invitations.length > MAX_DRAFT_RECIPIENTS) {
    throw new ConvexError(
      "Quote Round publication invitations are inconsistent."
    );
  }
  await Promise.all(
    invitations.map(async (invitation) => {
      if (
        invitation.buildId !== authorization.build._id ||
        invitation.organizationId !== authorization.organizationId ||
        invitation.brokerageId !== authorization.brokerage._id ||
        invitation.quotePackageRevisionId !== packageRevision._id
      ) {
        throw new ConvexError("Quote Round invitation crosses Build scope.");
      }
      const credentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query
            .eq("quoteRoundInvitationId", invitation._id)
            .eq("state", "active")
        )
        .take(1);
      if (credentials.length === 0) {
        throw new ConvexError(
          "Quote Round invitation credential is inconsistent."
        );
      }
    })
  );
  return {
    idempotentReplay: true,
    invitationCount: invitations.length,
    invitationIds: invitations.map((invitation) => invitation._id),
    packageRevisionId: packageRevision._id,
    packageRevisionNumber: packageRevision.revision,
    quoteRoundId: round._id,
    responseDeadline: packageRevision.responseDeadline,
    state: "open",
  };
}

export async function publishedTemplateProjection(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  versionId: Id<"quoteResponseTemplateVersions">
) {
  const version = await ctx.db.get(versionId);
  if (
    !version ||
    version.status !== "published" ||
    version.validationState !== "valid" ||
    version.organizationId !== authorization.organizationId ||
    version.brokerageId !== authorization.brokerage._id
  ) {
    return null;
  }
  const template = await ctx.db.get(version.templateId);
  if (
    !template ||
    template.status !== "active" ||
    template.organizationId !== authorization.organizationId ||
    template.brokerageId !== authorization.brokerage._id
  ) {
    return null;
  }
  const fields = await ctx.db
    .query("quoteResponseTemplateFields")
    .withIndex("by_version_order", (query) =>
      query.eq("versionId", version._id)
    )
    .take(101);
  if (fields.length === 0 || fields.length > 100) {
    return null;
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
  return {
    _id: version._id,
    audience: version.audience,
    description: version.description,
    fields: fields.map((field) => ({
      _id: field._id,
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
    name: version.name,
    templateId: template._id,
    version: version.version,
  };
}
