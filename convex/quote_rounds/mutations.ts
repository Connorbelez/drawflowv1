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
import {
  preparePublication,
  replayQuoteRoundPublication,
  publishedTemplateProjection,
} from "./publication";

export const getQuoteRound = authenticatedQuery
  .input({
    buildId: v.string(),
    quoteRoundId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.union(quoteRoundProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    const quoteRoundId = ctx.db.normalizeId("quoteRounds", args.quoteRoundId);
    if (!(buildId && quoteRoundId)) {
      return null;
    }
    const authorization = await authorizeQuoteRoundPath(ctx, {
      buildId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const round = await ctx.db.get(quoteRoundId);
    if (!round) {
      return null;
    }
    requireRoundScope(round, authorization, quoteRoundId);
    return await quoteRoundProjection(ctx, authorization, round);
  })
  .public();
export const createQuoteRoundDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    mode: quoteRoundModeValidator,
    title: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRoundDraftMutationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    const now = Date.now();
    const quoteRoundId = await ctx.db.insert("quoteRounds", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      createdByWorkosUserId: authorization.viewer.subject,
      mode: args.mode,
      organizationId: authorization.organizationId,
      proposalId: authorization.proposal._id,
      revision: 0,
      state: "draft",
      title: requiredText(args.title, "Quote Round title", 240),
      updatedAt: now,
    });
    await ctx.db.insert("quoteRoundDrafts", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      organizationId: authorization.organizationId,
      quoteRoundId,
      updatedAt: now,
    });
    await appendQuoteRoundEvent(
      ctx,
      authorization,
      {
        command: "createQuoteRoundDraft",
        eventType: "quote_round.draft_created",
        newState: {
          mode: args.mode,
          state: "draft",
          title: requiredText(args.title, "Quote Round title", 240),
        },
        quoteRoundId,
      },
      now
    );
    return { quoteRoundId, revision: 0, state: "draft" };
  })
  .public();

export const updateQuoteRoundDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    labourSubmilestoneIds: v.optional(v.array(v.id("buildSubmilestones"))),
    materialRows: v.optional(v.array(materialDraftRowInputValidator)),
    quoteRoundId: v.id("quoteRounds"),
    recipientProfileIds: v.optional(v.array(v.id("contractorProfiles"))),
    responseDeadline: v.optional(v.union(v.number(), v.null())),
    templateVersionId: v.optional(
      v.union(v.id("quoteResponseTemplateVersions"), v.null())
    ),
    title: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRoundDraftMutationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    const round = requireRoundScope(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    requireDraftState(round);
    assertExpectedRevision(round, args.expectedRevision);
    const state = await readDraftState(ctx, round);
    const hasMutation =
      args.title !== undefined ||
      args.templateVersionId !== undefined ||
      args.responseDeadline !== undefined ||
      args.labourSubmilestoneIds !== undefined ||
      args.materialRows !== undefined ||
      args.recipientProfileIds !== undefined;
    if (!hasMutation) {
      throw new ConvexError(
        "A Quote Round draft update requires at least one changed field."
      );
    }
    if (
      round.mode === "labour" &&
      args.materialRows &&
      args.materialRows.length > 0
    ) {
      throw new ConvexError(
        "Labour Quote Rounds cannot contain Material scope."
      );
    }
    if (
      round.mode === "material" &&
      args.labourSubmilestoneIds &&
      args.labourSubmilestoneIds.length > 0
    ) {
      throw new ConvexError(
        "Material Quote Rounds cannot contain Labour scope."
      );
    }
    if (args.templateVersionId) {
      await requirePublishedTemplateVersion(
        ctx,
        authorization,
        round.mode,
        args.templateVersionId
      );
    }
    if (args.responseDeadline !== undefined && args.responseDeadline !== null) {
      const deadline = requiredInteger(
        args.responseDeadline,
        "Quote Response Deadline"
      );
      if (deadline <= 0) {
        throw new ConvexError("Quote Response Deadline must be positive.");
      }
    }
    const nextTitle =
      args.title === undefined
        ? round.title
        : requiredText(args.title, "Quote Round title", 240);
    const now = Date.now();
    if (args.labourSubmilestoneIds !== undefined) {
      await replaceDraftLabourScope(
        ctx,
        authorization,
        round,
        state.labourScope,
        args.labourSubmilestoneIds,
        now
      );
    }
    if (args.materialRows !== undefined) {
      await replaceDraftMaterialRows(
        ctx,
        authorization,
        round,
        state.materialRows,
        state.materialAssignmentsByRowId,
        args.materialRows,
        now
      );
    }
    if (args.recipientProfileIds !== undefined) {
      await replaceDraftRecipients(
        ctx,
        authorization,
        round,
        state.recipients,
        args.recipientProfileIds,
        now
      );
    }
    await ctx.db.patch(state.draft._id, {
      ...(args.responseDeadline === undefined
        ? {}
        : { responseDeadline: args.responseDeadline ?? undefined }),
      ...(args.templateVersionId === undefined
        ? {}
        : { templateVersionId: args.templateVersionId ?? undefined }),
      updatedAt: now,
    });
    const revision = round.revision + 1;
    await ctx.db.patch(round._id, {
      revision,
      title: nextTitle,
      updatedAt: now,
    });
    await appendQuoteRoundEvent(
      ctx,
      authorization,
      {
        command: "updateQuoteRoundDraft",
        eventType: "quote_round.draft_updated",
        newState: {
          revision,
          templateVersionId:
            args.templateVersionId === undefined
              ? state.draft.templateVersionId
              : args.templateVersionId,
          title: nextTitle,
        },
        priorState: { revision: round.revision, title: round.title },
        quoteRoundId: round._id,
      },
      now
    );
    return { quoteRoundId: round._id, revision, state: "draft" };
  })
  .public();

export const refreshQuoteRoundDraftScope = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    quoteRoundId: v.id("quoteRounds"),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRoundScopeRefreshMutationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    const round = requireRoundScope(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    requireDraftState(round);
    assertExpectedRevision(round, args.expectedRevision);
    const state = await readDraftState(ctx, round);
    if (state.labourScope.length === 0) {
      throw new ConvexError(
        "A Quote Round Scope refresh requires selected Labour Sub-milestones."
      );
    }
    const now = Date.now();
    const scopePinTransitions = await refreshDraftLabourScopePins(
      ctx,
      authorization,
      state.labourScope,
      now
    );
    await ctx.db.patch(state.draft._id, { updatedAt: now });
    const revision = round.revision + 1;
    await ctx.db.patch(round._id, { revision, updatedAt: now });
    await appendQuoteRoundEvent(
      ctx,
      authorization,
      {
        command: "refreshQuoteRoundDraftScope",
        eventType: "quote_round.draft_scope_refreshed",
        newState: {
          labourLineCount: state.labourScope.length,
          revision,
          scopePinTransitions: scopePinTransitions.map(
            ({ buildSubmilestoneId, newSourceScopeRevisionId }) => ({
              buildSubmilestoneId,
              sourceScopeRevisionId: newSourceScopeRevisionId,
            })
          ),
        },
        priorState: {
          labourLineCount: state.labourScope.length,
          revision: round.revision,
          scopePinTransitions: scopePinTransitions.map(
            ({ buildSubmilestoneId, priorSourceScopeRevisionId }) => ({
              buildSubmilestoneId,
              sourceScopeRevisionId: priorSourceScopeRevisionId,
            })
          ),
        },
        quoteRoundId: round._id,
      },
      now
    );
    return {
      quoteRoundId: round._id,
      revision,
      scopePinTransitions,
      state: "draft" as const,
    };
  })
  .public();

export const deleteQuoteRoundDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    quoteRoundId: v.id("quoteRounds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    const round = requireRoundScope(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    if (round.state !== "draft") {
      throw new ConvexError("Only draft Quote Rounds may be deleted.");
    }
    if (round.currentPackageRevisionId) {
      throw new ConvexError("Published Quote Round rows are immutable.");
    }
    assertExpectedRevision(round, args.expectedRevision);
    const state = await readDraftState(ctx, round);
    const now = Date.now();
    await appendQuoteRoundEvent(
      ctx,
      authorization,
      {
        command: "deleteQuoteRoundDraft",
        eventType: "quote_round.draft_deleted",
        newState: { deleted: true, revision: round.revision },
        priorState: {
          mode: round.mode,
          revision: round.revision,
          state: round.state,
          title: round.title,
        },
        quoteRoundId: round._id,
      },
      now
    );
    for (const assignments of state.materialAssignmentsByRowId.values()) {
      for (const assignment of assignments) {
        await ctx.db.delete(assignment._id);
      }
    }
    for (const row of state.materialRows) {
      await ctx.db.delete(row._id);
    }
    for (const scope of state.labourScope) {
      await ctx.db.delete(scope._id);
    }
    for (const recipient of state.recipients) {
      await ctx.db.delete(recipient._id);
    }
    await ctx.db.delete(state.draft._id);
    await ctx.db.delete(round._id);
    return null;
  })
  .public();

export const publishQuoteRoundDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    quoteRoundId: v.id("quoteRounds"),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRoundPublicationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    const round = requireRoundScope(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Quote Round publication idempotency key"
    );
    if (!Number.isInteger(args.expectedRevision)) {
      throw new ConvexError(
        "Quote Round expected revision must be an integer."
      );
    }
    const requestFingerprint = await operationalRequestFingerprint({
      buildId: String(authorization.build._id),
      expectedRevision: args.expectedRevision,
      quoteRoundId: String(round._id),
    });
    const existingRequest = await ctx.db
      .query("quoteRoundPublicationRequests")
      .withIndex("by_quoteRoundId_and_idempotencyKey", (query) =>
        query.eq("quoteRoundId", round._id).eq("idempotencyKey", idempotencyKey)
      )
      .unique();
    const replay = await replayQuoteRoundPublication(
      ctx,
      authorization,
      round,
      existingRequest,
      args.expectedRevision,
      requestFingerprint
    );
    if (replay) {
      return replay;
    }

    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );

    requireDraftState(round);
    assertExpectedRevision(round, args.expectedRevision);
    if (round.currentPackageRevisionId) {
      throw new ConvexError("Published Quote Round rows are immutable.");
    }
    const state = await readDraftState(ctx, round);
    const now = Date.now();
    const prepared = await preparePublication(
      ctx,
      authorization,
      round,
      state,
      now
    );
    const accessExpiresAt = defaultQuoteInvitationAccessExpiry({
      publishedAt: now,
      responseDeadline: prepared.deadline,
    });
    const packageRevisionId = await ctx.db.insert("quotePackageRevisions", {
      accessExpiresAt,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      permitDocumentId: prepared.permit.document._id,
      permitDocumentVersion: prepared.permit.document.version ?? 1,
      publishedAt: now,
      publishedByWorkosUserId: authorization.viewer.subject,
      quoteRoundId: round._id,
      responseDeadline: prepared.deadline,
      revision: 1,
      roadmapSnapshotFingerprint: prepared.roadmapSnapshotFingerprint,
      siteAddressSnapshot: authorization.build.location,
      siteLatitudeSnapshot: authorization.build.locationLatitude,
      siteLongitudeSnapshot: authorization.build.locationLongitude,
      siteMapUrlSnapshot: mapUrlForBuild(authorization.build),
      sitePlaceIdSnapshot: authorization.build.locationPlaceId,
      sourceDraftRevision: round.revision,
      templateId: prepared.template.template._id,
      templateVersionId: prepared.template.version._id,
      timelineCurrentDaySnapshot: authorization.build.timelineCurrentDay,
      timelineRangeMaxSnapshot: authorization.build.timelineRangeMax,
      timelineRangeMinSnapshot: authorization.build.timelineRangeMin,
      timelineStartDateSnapshot: authorization.build.startDate,
      organizationId: authorization.organizationId,
    });
    const packageAttachments = [prepared.permit, ...prepared.attachments];
    for (const [order, attachment] of packageAttachments.entries()) {
      await ctx.db.insert("quotePackageRevisionAttachments", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        contentHashSha256Snapshot: governedAssetContentHash(attachment.asset),
        createdAt: now,
        fileNameSnapshot: attachment.asset.fileName,
        kind: attachment.kind,
        mimeTypeSnapshot: attachment.asset.mimeType,
        order,
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        sizeBytesSnapshot: attachment.asset.sizeBytes,
        sourceBuildDocumentId: attachment.document._id,
        sourceBuildSubmilestoneId: attachment.sourceBuildSubmilestoneId,
        sourceDocumentVersionSnapshot: attachment.document.version ?? 1,
        storageIdSnapshot: attachment.asset.storageId,
      });
    }
    for (const [order, labourLine] of prepared.labourLines.entries()) {
      await ctx.db.insert("quotePackageRevisionLabourLines", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        buildMilestoneId: labourLine.milestone._id,
        buildSubmilestoneId: labourLine.submilestone._id,
        budgetCents: labourLine.submilestone.budgetCents,
        createdAt: now,
        durationDays: labourLine.submilestone.durationDays,
        milestoneKey: labourLine.milestone.key,
        milestoneName: labourLine.milestone.name,
        order,
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        scopeOfWorkTiptapJson: labourLine.scopeOfWorkTiptapJson,
        sourceScopeChangeReason: labourLine.sourceScopeChangeReason,
        sourceScopeRevisionId: labourLine.sourceScopeRevisionId,
        sourceScopeVersion: labourLine.sourceScopeVersion,
        startDay: labourLine.submilestone.startDay,
        submilestoneKey: labourLine.submilestone.key,
        submilestoneName: labourLine.submilestone.name,
      });
    }
    for (const [order, materialLine] of prepared.materialLines.entries()) {
      const materialLineId = await ctx.db.insert(
        "quotePackageRevisionMaterialLines",
        {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          createdAt: now,
          deliveryEndDay: materialLine.deliveryEndDay,
          deliveryInstructions: materialLine.deliveryInstructions,
          deliveryLocation: materialLine.deliveryLocation,
          deliveryStartDay: materialLine.deliveryStartDay,
          description: materialLine.description,
          organizationId: authorization.organizationId,
          order,
          quantity: materialLine.quantity,
          quotePackageRevisionId: packageRevisionId,
          quoteRoundId: round._id,
          source: materialLine.row.source,
          sourceBuildCostItemId: materialLine.sourceBuildCostItemId,
          sourceDraftRowKey:
            materialLine.row.source === "ad_hoc"
              ? materialLine.row.rowKey
              : undefined,
          specificationTiptapJson: materialLine.specificationTiptapJson,
          title: materialLine.title,
          unit: materialLine.unit,
        }
      );
      for (const [
        assignmentOrder,
        assignment,
      ] of materialLine.assignments.entries()) {
        await ctx.db.insert("quotePackageRevisionMaterialAssignments", {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          buildMilestoneId: assignment.milestone._id,
          buildSubmilestoneId: assignment.submilestone._id,
          createdAt: now,
          durationDays: assignment.submilestone.durationDays,
          milestoneKey: assignment.milestone.key,
          milestoneName: assignment.milestone.name,
          order: assignmentOrder,
          organizationId: authorization.organizationId,
          quotePackageRevisionId: packageRevisionId,
          quotePackageRevisionMaterialLineId: materialLineId,
          quoteRoundId: round._id,
          startDay: assignment.submilestone.startDay,
          submilestoneKey: assignment.submilestone.key,
          submilestoneName: assignment.submilestone.name,
        });
      }
    }
    for (const field of prepared.template.fields) {
      await ctx.db.insert("quotePackageRevisionResponseFields", {
        allowAlternates: field.allowAlternates,
        allowExclusions: field.allowExclusions,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        choiceOptions: field.choiceOptions,
        createdAt: now,
        fieldKey: field.fieldKey,
        isPermanent: field.isPermanent,
        kind: field.kind,
        label: field.label,
        order: field.order,
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        renderer: field.renderer,
        repeatable: field.repeatable,
        required: field.required,
        richTextDefaultHtml: field.richTextDefaultHtml,
        scope: field.scope,
        sourceTemplateFieldId: field._id,
        supportsTax: field.supportsTax,
        tax: field.tax,
        validation: field.validation,
      });
    }
    const packageRevision = await ctx.db.get(packageRevisionId);
    if (!packageRevision) {
      throw new ConvexError("Quote Package Revision was not created.");
    }
    const invitationIds: Id<"quoteRoundInvitations">[] = [];
    for (const recipient of prepared.recipients) {
      const invitationId = await ctx.db.insert("quoteRoundInvitations", {
        accessGeneration: 1,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        currentQuotePackageRevisionId: packageRevisionId,
        organizationId: authorization.organizationId,
        participationState: "active",
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        recipientCapabilitiesSnapshot: recipient.capabilities,
        recipientEmailSnapshot: recipient.email,
        recipientNameSnapshot: recipient.profile.name,
        recipientProfileId: recipient.profile._id,
        updatedAt: now,
      });
      const invitation = await ctx.db.get(invitationId);
      if (!invitation) {
        throw new ConvexError("Quote Invitation was not created.");
      }
      await createInitialQuoteInvitationCredentialAndDispatch(ctx, {
        accessExpiresAt,
        brokerage: authorization.brokerage,
        build: authorization.build,
        invitation,
        packageRevision,
        publishedAt: now,
        quoteRound: round,
        responseDeadline: prepared.deadline,
      });
      invitationIds.push(invitationId);
    }
    const revision = round.revision + 1;
    await ctx.db.patch(round._id, {
      currentPackageRevisionId: packageRevisionId,
      revision,
      state: "open",
      updatedAt: now,
    });
    await ctx.db.insert("quoteRoundPublicationRequests", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      expectedDraftRevision: args.expectedRevision,
      idempotencyKey,
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId: round._id,
      requestFingerprint,
    });
    await appendQuoteRoundEvent(
      ctx,
      authorization,
      {
        command: "publishQuoteRoundDraft",
        eventType: "quote_round.opened",
        newState: {
          invitationCount: invitationIds.length,
          packageRevision: 1,
          responseDeadline: prepared.deadline,
          revision,
          state: "open",
        },
        priorState: { revision: round.revision, state: "draft" },
        quoteRoundId: round._id,
      },
      now
    );
    return {
      idempotentReplay: false,
      invitationCount: invitationIds.length,
      invitationIds,
      packageRevisionId,
      packageRevisionNumber: 1,
      quoteRoundId: round._id,
      responseDeadline: prepared.deadline,
      state: "open",
    };
  })
  .public();
