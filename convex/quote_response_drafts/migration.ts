import { ConvexError } from "convex/values";

import {
  findDraft,
  assertDraftCollectionBounds,
  assertDraftRowsScope,
  assertDraftScope,
  assertLineKey,
  MAX_DRAFT_ANSWERS,
  MAX_DRAFT_ATTACHMENTS,
  MAX_DRAFT_LINE_ITEMS,
} from "./core";
import { updateDraftProgress } from "./mutations";
import type { InvitationScope } from "../quote_invitation_access";
import type { Doc, Id, MutationCtx } from "../types";

export function priorResponseMigrationSource(
  draft: Doc<"quoteInvitationResponseDrafts"> | null,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions"> | null
) {
  if (draft) {
    return { draft, kind: "draft" as const };
  }
  if (submission) {
    return { kind: "submission" as const, submission };
  }
  return null;
}

/**
 * Reopen keeps Invitation identity while advancing its current Package
 * Revision. A recipient's mutable Draft remains attached to the prior
 * revision, so the acknowledgement mutation migrates that Draft once before
 * unlocking writes. Stable package identities remap source ids; expanded
 * scope rows keep their client line keys. The prior Draft and its storage
 * remain immutable history, while the new Draft becomes the sole writable
 * projection for the current revision.
 */
export async function migratePriorRevisionDraftForAccess(
  ctx: MutationCtx,
  scope: InvitationScope
) {
  const currentDraft = await findDraft(ctx, scope);
  if (currentDraft) {
    return currentDraft;
  }
  const acknowledgement = await ctx.db
    .query("quoteInvitationPackageRevisionAcknowledgements")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", scope.invitation._id)
          .eq("quotePackageRevisionId", scope.packageRevision._id)
    )
    .unique();
  if (!acknowledgement?.previousPackageRevisionId) {
    return null;
  }
  if (
    acknowledgement.brokerageId !== scope.invitation.brokerageId ||
    acknowledgement.organizationId !== scope.invitation.organizationId ||
    acknowledgement.buildId !== scope.invitation.buildId ||
    acknowledgement.quoteRoundId !== scope.invitation.quoteRoundId
  ) {
    throw new ConvexError(
      "Quote Package Revision acknowledgement crosses invitation scope."
    );
  }
  const previousPackageRevision = await ctx.db.get(
    acknowledgement.previousPackageRevisionId
  );
  if (
    !(
      previousPackageRevision &&
      matchesPackageRevisionScope(previousPackageRevision, scope)
    ) ||
    previousPackageRevision._id === scope.packageRevision._id
  ) {
    throw new ConvexError(
      "Previous Quote Package Revision is unavailable for Draft migration."
    );
  }
  const previousScope: InvitationScope = {
    ...scope,
    packageRevision: previousPackageRevision,
  };
  const previousDraft = await findDraft(ctx, previousScope);
  const previousSubmission = previousDraft
    ? null
    : await activeSubmissionForDraftMigration(ctx, previousScope);
  const migrationSource = priorResponseMigrationSource(
    previousDraft,
    previousSubmission
  );
  if (!migrationSource) {
    return null;
  }

  const [
    previousLabourLines,
    previousMaterialLines,
    previousResponseFields,
    previousLineItems,
    previousAnswers,
    previousAttachments,
    currentLabourLines,
    currentMaterialLines,
    currentResponseFields,
  ] = await Promise.all([
    packageLabourLinesForMigration(ctx, previousPackageRevision._id),
    packageMaterialLinesForMigration(ctx, previousPackageRevision._id),
    packageResponseFieldsForMigration(ctx, previousPackageRevision._id),
    migrationSource.kind === "draft"
      ? draftLineItemsForMigration(ctx, migrationSource.draft._id)
      : submissionLineItemsForMigration(ctx, migrationSource.submission._id),
    migrationSource.kind === "draft"
      ? draftAnswersForMigration(ctx, migrationSource.draft._id)
      : submissionAnswersForMigration(ctx, migrationSource.submission._id),
    migrationSource.kind === "draft"
      ? draftAttachmentsForMigration(ctx, migrationSource.draft._id)
      : submissionAttachmentsForMigration(ctx, migrationSource.submission._id),
    packageLabourLinesForMigration(ctx, scope.packageRevision._id),
    packageMaterialLinesForMigration(ctx, scope.packageRevision._id),
    packageResponseFieldsForMigration(ctx, scope.packageRevision._id),
  ]);
  assertDraftCollectionBounds({
    answers: previousAnswers,
    attachments: previousAttachments,
    lineItems: previousLineItems,
  });
  if (
    previousLabourLines.length > 100 ||
    previousMaterialLines.length > 100 ||
    previousResponseFields.length > 100 ||
    currentLabourLines.length > 100 ||
    currentMaterialLines.length > 100 ||
    currentResponseFields.length > 100
  ) {
    throw new ConvexError(
      "Quote Package Revision exceeds Draft migration limits."
    );
  }
  if (migrationSource.kind === "draft") {
    assertDraftRowsScope(previousScope, migrationSource.draft, {
      answers: previousAnswers as Doc<"quoteInvitationResponseDraftAnswers">[],
      attachments:
        previousAttachments as Doc<"quoteInvitationResponseDraftAttachments">[],
      lineItems:
        previousLineItems as Doc<"quoteInvitationResponseDraftLineItems">[],
    });
  } else {
    assertSubmissionRowsForDraftMigration(
      previousScope,
      migrationSource.submission,
      {
        answers: previousAnswers,
        attachments: previousAttachments,
        lineItems: previousLineItems,
      }
    );
  }

  const previousLabourById = new Map(
    previousLabourLines.map((line) => [line._id, line])
  );
  const currentLabourByIdentity = indexMigrationRows(
    currentLabourLines,
    (line) => String(line.buildSubmilestoneId)
  );
  const previousMaterialById = new Map(
    previousMaterialLines.map((line) => [line._id, line])
  );
  const currentMaterialByIdentity = indexMigrationRows(
    currentMaterialLines,
    materialMigrationIdentity
  );
  const previousFieldById = new Map(
    previousResponseFields.map((field) => [field._id, field])
  );
  const currentFieldByIdentity = indexMigrationRows(
    currentResponseFields,
    (field) => String(field.sourceTemplateFieldId)
  );

  const currentDraftAfterRead = await findDraft(ctx, scope);
  if (currentDraftAfterRead) {
    return currentDraftAfterRead;
  }
  const now = Date.now();
  const draft = await createMigratedDraft(
    ctx,
    scope,
    migrationSource.kind === "draft"
      ? {
          commentsHtml: migrationSource.draft.commentsHtml,
          createdAt: migrationSource.draft.createdAt,
          version: migrationSource.draft.version,
        }
      : {
          commentsHtml: migrationSource.submission.commentsHtml,
          createdAt: migrationSource.submission.createdAt,
          version: migrationSource.submission.sourceDraftVersion,
        },
    previousPackageRevision._id,
    now
  );
  await copyMigratedDraftRows(
    ctx,
    scope,
    draft,
    {
      currentFieldByIdentity,
      currentLabourByIdentity,
      currentMaterialByIdentity,
      previousAnswers,
      previousAttachments,
      previousFieldById,
      previousLabourById,
      previousLineItems,
      previousMaterialById,
    },
    now
  );
  return await updateDraftProgress(ctx, scope, draft, {
    incrementVersion: false,
  });
}

interface DraftMigrationRows {
  currentFieldByIdentity: Map<
    string,
    Doc<"quotePackageRevisionResponseFields">
  >;
  currentLabourByIdentity: Map<string, Doc<"quotePackageRevisionLabourLines">>;
  currentMaterialByIdentity: Map<
    string,
    Doc<"quotePackageRevisionMaterialLines">
  >;
  previousAnswers: (
    | Doc<"quoteInvitationResponseDraftAnswers">
    | Doc<"quoteInvitationResponseSubmissionAnswers">
  )[];
  previousAttachments: (
    | Doc<"quoteInvitationResponseDraftAttachments">
    | Doc<"quoteInvitationResponseSubmissionAttachments">
  )[];
  previousFieldById: Map<
    Id<"quotePackageRevisionResponseFields">,
    Doc<"quotePackageRevisionResponseFields">
  >;
  previousLabourById: Map<
    Id<"quotePackageRevisionLabourLines">,
    Doc<"quotePackageRevisionLabourLines">
  >;
  previousLineItems: (
    | Doc<"quoteInvitationResponseDraftLineItems">
    | Doc<"quoteInvitationResponseSubmissionLineItems">
  )[];
  previousMaterialById: Map<
    Id<"quotePackageRevisionMaterialLines">,
    Doc<"quotePackageRevisionMaterialLines">
  >;
}

export async function createMigratedDraft(
  ctx: MutationCtx,
  scope: InvitationScope,
  previousResponse: {
    commentsHtml?: string;
    createdAt: number;
    version: number;
  },
  previousPackageRevisionId: Id<"quotePackageRevisions">,
  now: number
) {
  const draftId = await ctx.db.insert("quoteInvitationResponseDrafts", {
    answeredFieldCount: 0,
    attachmentCount: 0,
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    commentsHtml: previousResponse.commentsHtml,
    completedPricingLineCount: 0,
    copiedFromQuotePackageRevisionId: previousPackageRevisionId,
    copiedValuesConfirmationState: "pending",
    createdAt: previousResponse.createdAt,
    organizationId: scope.invitation.organizationId,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    retentionNextCheckAt: now,
    retentionState: "active",
    updatedAt: now,
    version: previousResponse.version,
  });
  const draft = await ctx.db.get(draftId);
  if (!draft) {
    throw new ConvexError("Unable to create the migrated Field Ledger draft.");
  }
  return draft;
}

export async function copyMigratedDraftRows(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  rows: DraftMigrationRows,
  now: number
) {
  const migratedLineKeys = new Set<string>();
  for (const line of rows.previousLineItems) {
    const mapped = migratedLineIdentity(
      line,
      rows.previousLabourById,
      rows.currentLabourByIdentity,
      rows.previousMaterialById,
      rows.currentMaterialByIdentity,
      rows.previousFieldById,
      rows.currentFieldByIdentity
    );
    if (!mapped || migratedLineKeys.has(mapped.lineKey)) {
      continue;
    }
    migratedLineKeys.add(mapped.lineKey);
    await ctx.db.insert("quoteInvitationResponseDraftLineItems", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: line.createdAt,
      lineKey: mapped.lineKey,
      organizationId: scope.invitation.organizationId,
      quotedAmountCents: line.quotedAmountCents,
      quoteInvitationResponseDraftId: draft._id,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      scope: mapped.scope,
      source: mapped.source,
      sourcePackageRevisionLabourLineId:
        mapped.sourcePackageRevisionLabourLineId,
      sourcePackageRevisionMaterialLineId:
        mapped.sourcePackageRevisionMaterialLineId,
      sourcePackageRevisionResponseFieldId:
        mapped.sourcePackageRevisionResponseFieldId,
      title: mapped.title,
      updatedAt: now,
    });
  }

  for (const answer of rows.previousAnswers) {
    const previousField = rows.previousFieldById.get(
      answer.sourcePackageRevisionResponseFieldId
    );
    const currentField = previousField
      ? rows.currentFieldByIdentity.get(
          String(previousField.sourceTemplateFieldId)
        )
      : undefined;
    if (!currentField) {
      continue;
    }
    await ctx.db.insert("quoteInvitationResponseDraftAnswers", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: answer.createdAt,
      fieldKey: currentField.fieldKey,
      organizationId: scope.invitation.organizationId,
      quoteInvitationResponseDraftId: draft._id,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      scope: currentField.scope,
      sourcePackageRevisionResponseFieldId: currentField._id,
      updatedAt: now,
      value: answer.value,
    });
  }

  for (const attachment of rows.previousAttachments) {
    const previousField = attachment.sourcePackageRevisionResponseFieldId
      ? rows.previousFieldById.get(
          attachment.sourcePackageRevisionResponseFieldId
        )
      : undefined;
    const currentField = previousField
      ? rows.currentFieldByIdentity.get(
          String(previousField.sourceTemplateFieldId)
        )
      : undefined;
    if (attachment.sourcePackageRevisionResponseFieldId && !currentField) {
      continue;
    }
    await ctx.db.insert("quoteInvitationResponseDraftAttachments", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: attachment.createdAt,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      organizationId: scope.invitation.organizationId,
      quoteInvitationResponseDraftId: draft._id,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      sizeBytes: attachment.sizeBytes,
      sourcePackageRevisionResponseFieldId: currentField?._id,
      storageId: attachment.storageId,
    });
  }
}

export async function packageLabourLinesForMigration(
  ctx: MutationCtx,
  packageRevisionId: Id<"quotePackageRevisions">
) {
  return await ctx.db
    .query("quotePackageRevisionLabourLines")
    .withIndex("by_quotePackageRevisionId_and_order", (query) =>
      query.eq("quotePackageRevisionId", packageRevisionId)
    )
    .take(101);
}

export async function packageMaterialLinesForMigration(
  ctx: MutationCtx,
  packageRevisionId: Id<"quotePackageRevisions">
) {
  return await ctx.db
    .query("quotePackageRevisionMaterialLines")
    .withIndex("by_quotePackageRevisionId_and_order", (query) =>
      query.eq("quotePackageRevisionId", packageRevisionId)
    )
    .take(101);
}

export async function packageResponseFieldsForMigration(
  ctx: MutationCtx,
  packageRevisionId: Id<"quotePackageRevisions">
) {
  return await ctx.db
    .query("quotePackageRevisionResponseFields")
    .withIndex("by_quotePackageRevisionId_and_order", (query) =>
      query.eq("quotePackageRevisionId", packageRevisionId)
    )
    .take(101);
}

export async function draftLineItemsForMigration(
  ctx: MutationCtx,
  draftId: Id<"quoteInvitationResponseDrafts">
) {
  return await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_updatedAt", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_DRAFT_LINE_ITEMS + 1);
}

export async function draftAnswersForMigration(
  ctx: MutationCtx,
  draftId: Id<"quoteInvitationResponseDrafts">
) {
  return await ctx.db
    .query("quoteInvitationResponseDraftAnswers")
    .withIndex("by_draft_and_responseFieldId", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_DRAFT_ANSWERS + 1);
}

export async function draftAttachmentsForMigration(
  ctx: MutationCtx,
  draftId: Id<"quoteInvitationResponseDrafts">
) {
  return await ctx.db
    .query("quoteInvitationResponseDraftAttachments")
    .withIndex("by_quoteInvitationResponseDraftId_and_createdAt", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_DRAFT_ATTACHMENTS + 1);
}

export async function activeSubmissionForDraftMigration(
  ctx: MutationCtx,
  scope: InvitationScope
) {
  const state = await ctx.db
    .query("quoteInvitationResponseSubmissionStates")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", scope.invitation._id)
          .eq("quotePackageRevisionId", scope.packageRevision._id)
    )
    .unique();
  if (!state?.activeSubmissionRevisionId) {
    return null;
  }
  if (
    state.brokerageId !== scope.invitation.brokerageId ||
    state.organizationId !== scope.invitation.organizationId ||
    state.buildId !== scope.invitation.buildId ||
    state.quoteRoundId !== scope.invitation.quoteRoundId
  ) {
    throw new ConvexError(
      "Prior Quote response state crosses its invitation scope."
    );
  }
  const submission = await ctx.db.get(state.activeSubmissionRevisionId);
  if (!submission) {
    throw new ConvexError("Prior Quote response is unavailable for migration.");
  }
  if (
    submission.brokerageId !== scope.invitation.brokerageId ||
    submission.organizationId !== scope.invitation.organizationId ||
    submission.buildId !== scope.invitation.buildId ||
    submission.quoteRoundId !== scope.invitation.quoteRoundId ||
    submission.quoteRoundInvitationId !== scope.invitation._id ||
    submission.quotePackageRevisionId !== scope.packageRevision._id
  ) {
    throw new ConvexError("Prior Quote response crosses its invitation scope.");
  }
  return submission;
}

export async function submissionLineItemsForMigration(
  ctx: MutationCtx,
  submissionId: Id<"quoteInvitationResponseSubmissionRevisions">
) {
  return await ctx.db
    .query("quoteInvitationResponseSubmissionLineItems")
    .withIndex(
      "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
      (query) =>
        query.eq("quoteInvitationResponseSubmissionRevisionId", submissionId)
    )
    .take(MAX_DRAFT_LINE_ITEMS + 1);
}

export async function submissionAnswersForMigration(
  ctx: MutationCtx,
  submissionId: Id<"quoteInvitationResponseSubmissionRevisions">
) {
  return await ctx.db
    .query("quoteInvitationResponseSubmissionAnswers")
    .withIndex("by_quoteInvitationResponseSubmissionRevisionId", (query) =>
      query.eq("quoteInvitationResponseSubmissionRevisionId", submissionId)
    )
    .take(MAX_DRAFT_ANSWERS + 1);
}

export async function submissionAttachmentsForMigration(
  ctx: MutationCtx,
  submissionId: Id<"quoteInvitationResponseSubmissionRevisions">
) {
  return await ctx.db
    .query("quoteInvitationResponseSubmissionAttachments")
    .withIndex(
      "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
      (query) =>
        query.eq("quoteInvitationResponseSubmissionRevisionId", submissionId)
    )
    .take(MAX_DRAFT_ATTACHMENTS + 1);
}

export function assertSubmissionRowsForDraftMigration(
  scope: InvitationScope,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">,
  rows: {
    attachments: (
      | Doc<"quoteInvitationResponseDraftAttachments">
      | Doc<"quoteInvitationResponseSubmissionAttachments">
    )[];
    answers: (
      | Doc<"quoteInvitationResponseDraftAnswers">
      | Doc<"quoteInvitationResponseSubmissionAnswers">
    )[];
    lineItems: (
      | Doc<"quoteInvitationResponseDraftLineItems">
      | Doc<"quoteInvitationResponseSubmissionLineItems">
    )[];
  }
) {
  for (const row of [...rows.lineItems, ...rows.answers, ...rows.attachments]) {
    if (
      !("quoteInvitationResponseSubmissionRevisionId" in row) ||
      row.quoteInvitationResponseSubmissionRevisionId !== submission._id ||
      row.brokerageId !== scope.invitation.brokerageId ||
      row.organizationId !== scope.invitation.organizationId ||
      row.buildId !== scope.invitation.buildId ||
      row.quoteRoundId !== scope.invitation.quoteRoundId ||
      row.quoteRoundInvitationId !== scope.invitation._id ||
      row.quotePackageRevisionId !== scope.packageRevision._id
    ) {
      throw new ConvexError(
        "Prior Quote response row crosses its invitation scope."
      );
    }
  }
}

export function matchesPackageRevisionScope(
  packageRevision: Doc<"quotePackageRevisions">,
  scope: InvitationScope
) {
  return (
    packageRevision.brokerageId === scope.invitation.brokerageId &&
    packageRevision.organizationId === scope.invitation.organizationId &&
    packageRevision.buildId === scope.invitation.buildId &&
    packageRevision.quoteRoundId === scope.invitation.quoteRoundId
  );
}

export function indexMigrationRows<T>(rows: T[], identity: (row: T) => string) {
  const indexed = new Map<string, T>();
  for (const row of rows) {
    const key = identity(row);
    if (indexed.has(key)) {
      throw new ConvexError(
        "Quote Package Revision has ambiguous Draft identities."
      );
    }
    indexed.set(key, row);
  }
  return indexed;
}

export function materialMigrationIdentity(
  line: Doc<"quotePackageRevisionMaterialLines">
) {
  if (line.sourceBuildCostItemId) {
    return `cost:${line.sourceBuildCostItemId}`;
  }
  if (line.sourceDraftRowKey) {
    return `draft:${line.sourceDraftRowKey}`;
  }
  return `fallback:${line.source}:${line.order}`;
}

export function migratedLineIdentity(
  line:
    | Doc<"quoteInvitationResponseDraftLineItems">
    | Doc<"quoteInvitationResponseSubmissionLineItems">,
  previousLabourById: Map<
    Id<"quotePackageRevisionLabourLines">,
    Doc<"quotePackageRevisionLabourLines">
  >,
  currentLabourByIdentity: Map<string, Doc<"quotePackageRevisionLabourLines">>,
  previousMaterialById: Map<
    Id<"quotePackageRevisionMaterialLines">,
    Doc<"quotePackageRevisionMaterialLines">
  >,
  currentMaterialByIdentity: Map<
    string,
    Doc<"quotePackageRevisionMaterialLines">
  >,
  previousFieldById: Map<
    Id<"quotePackageRevisionResponseFields">,
    Doc<"quotePackageRevisionResponseFields">
  >,
  currentFieldByIdentity: Map<string, Doc<"quotePackageRevisionResponseFields">>
) {
  if (line.source === "expanded_scope") {
    assertLineKey(line.lineKey);
    return {
      lineKey: line.lineKey,
      scope: line.scope,
      source: line.source,
      title: line.title,
    };
  }
  if (line.source === "package_labour") {
    const previous = line.sourcePackageRevisionLabourLineId
      ? previousLabourById.get(line.sourcePackageRevisionLabourLineId)
      : undefined;
    const current = previous
      ? currentLabourByIdentity.get(String(previous.buildSubmilestoneId))
      : undefined;
    return current
      ? {
          lineKey: `labour:${current._id}`,
          scope: "labour" as const,
          source: "package_labour" as const,
          sourcePackageRevisionLabourLineId: current._id,
          title: `${current.milestoneName} · ${current.submilestoneName}`,
        }
      : null;
  }
  if (line.source === "package_material") {
    const previous = line.sourcePackageRevisionMaterialLineId
      ? previousMaterialById.get(line.sourcePackageRevisionMaterialLineId)
      : undefined;
    const current = previous
      ? currentMaterialByIdentity.get(materialMigrationIdentity(previous))
      : undefined;
    return current
      ? {
          lineKey: `material:${current._id}`,
          scope: "materials" as const,
          source: "package_material" as const,
          sourcePackageRevisionMaterialLineId: current._id,
          title: current.title,
        }
      : null;
  }
  const previous = line.sourcePackageRevisionResponseFieldId
    ? previousFieldById.get(line.sourcePackageRevisionResponseFieldId)
    : undefined;
  const current = previous
    ? currentFieldByIdentity.get(String(previous.sourceTemplateFieldId))
    : undefined;
  return current
    ? {
        lineKey: `field:${current._id}`,
        scope: current.scope,
        source: "template_priced" as const,
        sourcePackageRevisionResponseFieldId: current._id,
        title: current.label,
      }
    : null;
}

// A submitted response clears its old mutable Draft. Do not let an autosave or
// attachment-first interaction recreate one implicitly: ENG-394 owns the only
// transition that may seed a revision Draft from an immutable submission.
export async function hasSubmittedResponseState(
  ctx: MutationCtx,
  scope: InvitationScope
) {
  const state = await ctx.db
    .query("quoteInvitationResponseSubmissionStates")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", scope.invitation._id)
          .eq("quotePackageRevisionId", scope.packageRevision._id)
    )
    .unique();
  if (!state) {
    return false;
  }
  if (
    state.brokerageId !== scope.invitation.brokerageId ||
    state.organizationId !== scope.invitation.organizationId ||
    state.buildId !== scope.invitation.buildId ||
    state.quoteRoundId !== scope.invitation.quoteRoundId ||
    state.quoteRoundInvitationId !== scope.invitation._id ||
    state.quotePackageRevisionId !== scope.packageRevision._id
  ) {
    throw new ConvexError(
      "Quote response submission state crosses its invitation scope."
    );
  }
  return true;
}
