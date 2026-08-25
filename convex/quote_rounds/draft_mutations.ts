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

export async function appendQuoteRoundEvent(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    command: string;
    eventType: string;
    newState?: Record<string, unknown>;
    priorState?: Record<string, unknown>;
    quoteRoundId: Id<"quoteRounds">;
    warnings?: string[];
  },
  now: number
) {
  const newState = input.newState ? JSON.stringify(input.newState) : undefined;
  const priorState = input.priorState
    ? JSON.stringify(input.priorState)
    : undefined;
  await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: input.command,
    createdAt: now,
    entityId: String(input.quoteRoundId),
    entityType: "quoteRound",
    effectiveCapacity: authorization.effectiveRole.role,
    eventType: input.eventType,
    newState,
    organizationId: authorization.organizationId,
    priorState,
    targetRevisions: [
      {
        entityId: String(input.quoteRoundId),
        entityType: "quoteRound",
        revision:
          typeof input.newState?.revision === "number"
            ? input.newState.revision
            : undefined,
      },
    ],
    warnings: input.warnings ?? [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({
      buildId: authorization.build._id,
      quoteRoundId: input.quoteRoundId,
      ...(input.newState ?? {}),
    }),
    relatedEntityId: String(input.quoteRoundId),
    relatedEntityType: "quoteRound",
    status: "pending",
  });
}
export async function replaceDraftLabourScope(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  existing: Doc<"quoteRoundDraftLabourScope">[],
  ids: Id<"buildSubmilestones">[],
  now: number
) {
  const validIds = await validateLabourSubmilestoneIds(ctx, authorization, ids);
  const existingBySubmilestoneId = new Map(
    existing.map((row) => [row.buildSubmilestoneId, row])
  );
  const selected = new Set(validIds);
  for (const row of existing) {
    if (!selected.has(row.buildSubmilestoneId)) {
      await ctx.db.delete(row._id);
    }
  }
  for (const [order, buildSubmilestoneId] of validIds.entries()) {
    const existingRow = existingBySubmilestoneId.get(buildSubmilestoneId);
    if (existingRow) {
      if (existingRow.order !== order) {
        await ctx.db.patch(existingRow._id, { order, updatedAt: now });
      }
      continue;
    }
    const { submilestone } = await requireBuildSubmilestone(
      ctx,
      authorization,
      buildSubmilestoneId
    );
    const scope = await requireEffectiveQuoteScope(
      ctx,
      authorization,
      submilestone
    );
    await ctx.db.insert("quoteRoundDraftLabourScope", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      buildSubmilestoneId,
      createdAt: now,
      order,
      organizationId: authorization.organizationId,
      quoteRoundId: round._id,
      scopeOfWorkTiptapJson: scope.scopeOfWorkTiptapJson,
      sourceScopeChangeReason: scope.sourceScopeChangeReason,
      sourceScopeRevisionId: scope.sourceScopeRevisionId,
      sourceScopeVersion: scope.sourceScopeVersion,
      updatedAt: now,
    });
  }
}

export async function refreshDraftLabourScopePins(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  rows: Doc<"quoteRoundDraftLabourScope">[],
  now: number
) {
  const transitions: QuoteRoundScopePinTransition[] = [];
  for (const row of rows) {
    if (
      row.buildId !== authorization.build._id ||
      row.organizationId !== authorization.organizationId ||
      row.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError("Draft Labour scope crosses Build scope.");
    }
    const { submilestone } = await requireBuildSubmilestone(
      ctx,
      authorization,
      row.buildSubmilestoneId
    );
    const scope = await requireEffectiveQuoteScope(
      ctx,
      authorization,
      submilestone
    );
    const priorSourceScopeRevisionId = row.sourceScopeRevisionId ?? null;
    await ctx.db.patch(row._id, {
      scopeOfWorkTiptapJson: scope.scopeOfWorkTiptapJson,
      sourceScopeChangeReason: scope.sourceScopeChangeReason,
      sourceScopeRevisionId: scope.sourceScopeRevisionId,
      sourceScopeVersion: scope.sourceScopeVersion,
      updatedAt: now,
    });
    transitions.push({
      buildSubmilestoneId: row.buildSubmilestoneId,
      newSourceScopeRevisionId: scope.sourceScopeRevisionId,
      priorSourceScopeRevisionId,
    });
  }
  return transitions;
}

export async function replaceDraftMaterialRows(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  existingRows: Doc<"quoteRoundDraftMaterialRows">[],
  assignmentsByRowId: DraftState["materialAssignmentsByRowId"],
  inputRows: DraftMaterialRowInput[],
  now: number
) {
  const rows = await validateDraftMaterialRows(ctx, authorization, inputRows);
  for (const row of existingRows) {
    for (const assignment of assignmentsByRowId.get(row._id) ?? []) {
      await ctx.db.delete(assignment._id);
    }
    await ctx.db.delete(row._id);
  }
  for (const [order, item] of rows.entries()) {
    const sourceCostItemId = item.input.sourceBuildCostItemId;
    const adHoc = item.normalizedAdHoc;
    const rowId = await ctx.db.insert("quoteRoundDraftMaterialRows", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      deliveryEndDay: adHoc?.deliveryEndDay,
      deliveryInstructions: adHoc?.deliveryInstructions,
      deliveryLocation: adHoc?.deliveryLocation,
      deliveryStartDay: adHoc?.deliveryStartDay,
      description: adHoc?.description,
      order,
      organizationId: authorization.organizationId,
      quantity: adHoc?.quantity,
      quoteRoundId: round._id,
      rowKey: item.input.rowKey,
      source: item.input.source,
      sourceBuildCostItemId: sourceCostItemId,
      specificationTiptapJson: adHoc?.specificationTiptapJson,
      title: adHoc?.title,
      unit: adHoc?.unit,
      updatedAt: now,
    });
    for (const [
      assignmentOrder,
      buildSubmilestoneId,
    ] of item.assignments.entries()) {
      await ctx.db.insert("quoteRoundDraftMaterialAssignments", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        buildSubmilestoneId,
        createdAt: now,
        order: assignmentOrder,
        organizationId: authorization.organizationId,
        quoteRoundDraftMaterialRowId: rowId,
        quoteRoundId: round._id,
        updatedAt: now,
      });
    }
  }
}

export async function replaceDraftRecipients(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  existing: Doc<"quoteRoundDraftRecipients">[],
  recipientProfileIds: Id<"contractorProfiles">[],
  now: number
) {
  await validateRecipients(ctx, authorization, round.mode, recipientProfileIds);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  for (const [order, recipientProfileId] of recipientProfileIds.entries()) {
    await ctx.db.insert("quoteRoundDraftRecipients", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      order,
      organizationId: authorization.organizationId,
      quoteRoundId: round._id,
      recipientProfileId,
      updatedAt: now,
    });
  }
}

export interface PreparedLabourLine {
  milestone: Doc<"buildMilestones">;
  scopeOfWorkTiptapJson: string;
  sourceScopeChangeReason?: string;
  sourceScopeRevisionId: Id<"submilestoneScopeRevisions">;
  sourceScopeVersion: number;
  submilestone: Doc<"buildSubmilestones">;
}

export interface PreparedMaterialLine {
  assignments: {
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  }[];
  deliveryEndDay: number;
  deliveryInstructions: string;
  deliveryLocation: string;
  deliveryStartDay: number;
  description?: string;
  quantity: number;
  row: Doc<"quoteRoundDraftMaterialRows">;
  sourceBuildCostItemId?: Id<"buildCostItems">;
  specificationTiptapJson: string;
  title: string;
  unit: string;
}

export interface PreparedPackageAttachment {
  asset: Doc<"buildCollaborationAssets">;
  document: Doc<"buildDocuments">;
  kind: "permit" | "inherited";
  sourceBuildSubmilestoneId?: Id<"buildSubmilestones">;
}

export interface PreparedPublication {
  attachments: PreparedPackageAttachment[];
  deadline: number;
  labourLines: PreparedLabourLine[];
  materialLines: PreparedMaterialLine[];
  permit: PreparedPackageAttachment;
  recipients: Awaited<ReturnType<typeof validateRecipients>>;
  roadmapSnapshotFingerprint: string;
  template: Awaited<ReturnType<typeof requirePublishedTemplateVersion>>;
}

interface QuoteRoundPublicationResult {
  idempotentReplay: boolean;
  invitationCount: number;
  invitationIds: Id<"quoteRoundInvitations">[];
  packageRevisionId: Id<"quotePackageRevisions">;
  packageRevisionNumber: number;
  quoteRoundId: Id<"quoteRounds">;
  responseDeadline: number;
  state: "open";
}

export async function preparedLabourLines(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  state: DraftState
) {
  return await Promise.all(
    state.labourScope.map(async (scope) => {
      if (
        scope.buildId !== authorization.build._id ||
        scope.organizationId !== authorization.organizationId ||
        scope.brokerageId !== authorization.brokerage._id
      ) {
        throw new ConvexError("Draft Labour scope crosses Build scope.");
      }
      const { milestone, submilestone } = await requireBuildSubmilestone(
        ctx,
        authorization,
        scope.buildSubmilestoneId
      );
      const current = await requireEffectiveQuoteScope(
        ctx,
        authorization,
        submilestone
      );
      if (!draftScopePinMatches(scope, current)) {
        throw new ConvexError(
          "A newer effective Scope is available. Refresh the Quote Round draft before publishing."
        );
      }
      return {
        milestone,
        scopeOfWorkTiptapJson: current.scopeOfWorkTiptapJson,
        sourceScopeChangeReason: current.sourceScopeChangeReason,
        sourceScopeRevisionId: current.sourceScopeRevisionId,
        sourceScopeVersion: current.sourceScopeVersion,
        submilestone,
      };
    })
  );
}

/**
 * Rebuild the Labour portion of a successor Package Revision from the exact
 * current effective Scope for each Sub-milestone selected by the prior
 * Package. Selection and order stay pinned to the prior immutable package;
 * only canonical Scope provenance and bytes advance.
 */
export async function prepareEffectiveLabourLinesForPackageRevision(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  previousPackageRevisionId: Id<"quotePackageRevisions">
) {
  const previousPackageRevision = await ctx.db.get(previousPackageRevisionId);
  if (
    !previousPackageRevision ||
    previousPackageRevision.buildId !== authorization.build._id ||
    previousPackageRevision.organizationId !== authorization.organizationId ||
    previousPackageRevision.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError(
      "Prior Quote Package Revision is unavailable for Scope refresh."
    );
  }
  const previousLines = await ctx.db
    .query("quotePackageRevisionLabourLines")
    .withIndex("by_quotePackageRevisionId_and_order", (query) =>
      query.eq("quotePackageRevisionId", previousPackageRevision._id)
    )
    .take(MAX_DRAFT_LABOUR_LINES + 1);
  if (previousLines.length > MAX_DRAFT_LABOUR_LINES) {
    throw new ConvexError(
      "Quote Package Revision exceeds supported Labour scope limits."
    );
  }
  return await Promise.all(
    previousLines.map(async (previousLine) => {
      if (
        previousLine.buildId !== authorization.build._id ||
        previousLine.organizationId !== authorization.organizationId ||
        previousLine.brokerageId !== authorization.brokerage._id ||
        previousLine.quotePackageRevisionId !== previousPackageRevision._id ||
        previousLine.quoteRoundId !== previousPackageRevision.quoteRoundId
      ) {
        throw new ConvexError(
          "Prior Quote Package Labour line crosses Build scope."
        );
      }
      const { milestone, submilestone } = await requireBuildSubmilestone(
        ctx,
        authorization,
        previousLine.buildSubmilestoneId
      );
      const scope = await requireEffectiveQuoteScope(
        ctx,
        authorization,
        submilestone
      );
      return {
        milestone,
        previousLine,
        scopeOfWorkTiptapJson: scope.scopeOfWorkTiptapJson,
        sourceScopeChangeReason: scope.sourceScopeChangeReason,
        sourceScopeRevisionId: scope.sourceScopeRevisionId,
        sourceScopeVersion: scope.sourceScopeVersion,
        submilestone,
      };
    })
  );
}

export async function preparedMaterialLines(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  state: DraftState
) {
  const assignmentRowsByMaterialRow = new Map<
    Id<"quoteRoundDraftMaterialRows">,
    Doc<"quoteRoundDraftMaterialAssignments">[]
  >();
  const submilestoneIds = new Set<Id<"buildSubmilestones">>();
  const sourceCostItemIds = new Set<Id<"buildCostItems">>();

  for (const row of state.materialRows) {
    if (
      row.buildId !== authorization.build._id ||
      row.organizationId !== authorization.organizationId ||
      row.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError("Draft Material row crosses Build scope.");
    }
    const assignmentRows = state.materialAssignmentsByRowId.get(row._id) ?? [];
    if (assignmentRows.length === 0) {
      throw new ConvexError(
        "Every Material row must be assigned to at least one Sub-milestone."
      );
    }
    assignmentRowsByMaterialRow.set(row._id, assignmentRows);
    for (const assignment of assignmentRows) {
      if (
        assignment.quoteRoundId !== row.quoteRoundId ||
        assignment.buildId !== authorization.build._id ||
        assignment.organizationId !== authorization.organizationId ||
        assignment.brokerageId !== authorization.brokerage._id
      ) {
        throw new ConvexError("Draft Material assignment crosses Build scope.");
      }
      submilestoneIds.add(assignment.buildSubmilestoneId);
    }
    if (row.source === "build_cost_item") {
      if (!row.sourceBuildCostItemId) {
        throw new ConvexError(
          "Draft Material row is missing its Build Cost Item source."
        );
      }
      sourceCostItemIds.add(row.sourceBuildCostItemId);
    }
  }
  assertAggregateMaterialAssignments(
    [...assignmentRowsByMaterialRow.values()].reduce(
      (total, assignments) => total + assignments.length,
      0
    )
  );
  assertDistinctMaterialSubmilestones(submilestoneIds.size);
  const submilestoneSources = new Map(
    await Promise.all(
      [...submilestoneIds].map(async (id) => {
        const source = await requireBuildSubmilestone(ctx, authorization, id);
        return [id, source] as const;
      })
    )
  );
  const costItemSources = new Map(
    await Promise.all(
      [...sourceCostItemIds].map(async (id) => {
        const source = await requireBuildCostItem(ctx, authorization, id);
        return [id, source] as const;
      })
    )
  );
  return state.materialRows.map((row) => {
    const assignmentRows = assignmentRowsByMaterialRow.get(row._id) ?? [];
    const assignments = assignmentRows.map((assignment) => {
      const source = submilestoneSources.get(assignment.buildSubmilestoneId);
      if (!source) {
        throw new ConvexError(
          "Sub-milestone source is unavailable for this Build."
        );
      }
      return source;
    });
    if (row.source === "build_cost_item") {
      if (!row.sourceBuildCostItemId) {
        throw new ConvexError(
          "Draft Material row is missing its Build Cost Item source."
        );
      }
      const source = costItemSources.get(row.sourceBuildCostItemId);
      if (!source) {
        throw new ConvexError(
          "Material Cost Item is unavailable for this Build."
        );
      }
      return {
        assignments,
        ...materialFieldsFromSource(source),
        row,
        sourceBuildCostItemId: source._id,
      };
    }
    if (row.source !== "ad_hoc") {
      throw new ConvexError("Draft Material row has an unsupported source.");
    }
    return {
      assignments,
      ...materialFieldsFromSource(row),
      row,
    };
  });
}

export function assertSubmilestoneDocumentLinkScope(
  link: Doc<"buildSubmilestoneDocumentLinks">,
  authorization: ActiveBuildAuthorization,
  buildSubmilestoneId: Id<"buildSubmilestones">
) {
  if (
    link.buildId !== authorization.build._id ||
    link.organizationId !== authorization.organizationId ||
    link.brokerageId !== authorization.brokerage._id ||
    link.buildSubmilestoneId !== buildSubmilestoneId
  ) {
    throw new ConvexError("Sub-milestone document link crosses Build scope.");
  }
}

export async function inheritedAttachmentForLink(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  link: Doc<"buildSubmilestoneDocumentLinks">,
  buildSubmilestoneId: Id<"buildSubmilestones">,
  permitDocumentId: Id<"buildDocuments">
): Promise<PreparedPackageAttachment | null> {
  assertSubmilestoneDocumentLinkScope(link, authorization, buildSubmilestoneId);
  if (link.visibility === "unclassified") {
    throw new ConvexError(
      "A linked Sub-milestone document must be classified before publishing a Quote Round."
    );
  }
  if (
    link.visibility === "internal" ||
    link.buildDocumentId === permitDocumentId
  ) {
    return null;
  }
  if (link.visibility !== "recipient_shareable") {
    throw new ConvexError(
      "Sub-milestone document link has an unsupported visibility."
    );
  }
  const document = await ctx.db.get(link.buildDocumentId);
  if (!document) {
    throw new ConvexError("Linked Sub-milestone document is unavailable.");
  }
  const governed = await requireGovernedBuildDocument(
    ctx,
    authorization,
    document,
    "Linked Sub-milestone document"
  );
  return {
    asset: governed.asset,
    document: governed.document,
    kind: "inherited",
    sourceBuildSubmilestoneId: buildSubmilestoneId,
  };
}

export async function inheritedPackageAttachments(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  submilestoneIds: Id<"buildSubmilestones">[],
  permitDocumentId: Id<"buildDocuments">
) {
  const documents = new Map<Id<"buildDocuments">, PreparedPackageAttachment>();
  let inspectedLinkCount = 0;
  for (const buildSubmilestoneId of submilestoneIds) {
    const remainingLinkBudget =
      MAX_INHERITED_LINKS_SCANNED - inspectedLinkCount;
    const links = await ctx.db
      .query("buildSubmilestoneDocumentLinks")
      .withIndex("by_buildSubmilestoneId", (query) =>
        query.eq("buildSubmilestoneId", buildSubmilestoneId)
      )
      .take(Math.min(MAX_INHERITED_ATTACHMENTS + 1, remainingLinkBudget + 1));
    inspectedLinkCount += links.length;
    if (inspectedLinkCount > MAX_INHERITED_LINKS_SCANNED) {
      throw new ConvexError(
        "Quote Package linked-document discovery exceeded its safe scan limit."
      );
    }
    if (links.length > MAX_INHERITED_ATTACHMENTS) {
      throw new ConvexError(
        "Sub-milestone has too many linked documents for a Quote Package."
      );
    }
    for (const link of links) {
      const attachment = await inheritedAttachmentForLink(
        ctx,
        authorization,
        link,
        buildSubmilestoneId,
        permitDocumentId
      );
      if (!attachment) {
        continue;
      }
      documents.set(attachment.document._id, attachment);
      if (documents.size > MAX_INHERITED_ATTACHMENTS - 1) {
        throw new ConvexError(
          "Quote Package supports at most 200 inherited documents."
        );
      }
    }
  }
  return [...documents.values()].sort(
    (left, right) =>
      left.document.fileName.localeCompare(right.document.fileName) ||
      String(left.document._id).localeCompare(String(right.document._id))
  );
}

export async function roadmapSnapshotFingerprint(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const [milestones, submilestones] = await Promise.all([
    ctx.db
      .query("buildMilestones")
      .withIndex("by_build_order", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .take(501),
    ctx.db
      .query("buildSubmilestones")
      .withIndex("by_build", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .take(501),
  ]);
  if (milestones.length > 500 || submilestones.length > 500) {
    throw new ConvexError(
      "Build roadmap exceeds the Quote Package snapshot limit."
    );
  }
  return await operationalRequestFingerprint({
    buildId: String(authorization.build._id),
    startDate: authorization.build.startDate,
    timelineCurrentDay: authorization.build.timelineCurrentDay,
    timelineRangeMax: authorization.build.timelineRangeMax,
    timelineRangeMin: authorization.build.timelineRangeMin,
    milestones: milestones.map((milestone) => ({
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      id: String(milestone._id),
      key: milestone.key,
      status: milestone.status,
      updatedAt: milestone.updatedAt,
    })),
    submilestones: submilestones
      .sort(
        (left, right) =>
          String(left.buildMilestoneId).localeCompare(
            String(right.buildMilestoneId)
          ) ||
          left.order - right.order ||
          String(left._id).localeCompare(String(right._id))
      )
      .map((submilestone) => ({
        buildMilestoneId: String(submilestone.buildMilestoneId),
        durationDays: submilestone.durationDays,
        id: String(submilestone._id),
        key: submilestone.key,
        startDay: submilestone.startDay,
        status: submilestone.status,
        updatedAt: submilestone.updatedAt,
      })),
  });
}
