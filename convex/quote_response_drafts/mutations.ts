import { ConvexError, type Infer } from "convex/values";

import {
  MAX_DRAFT_ANSWERS,
  MAX_DRAFT_ATTACHMENTS,
  MAX_DRAFT_LINE_ITEMS,
  MAX_EXPANDED_SCOPE_TITLE_LENGTH,
  MAX_QUOTE_AMOUNT_CENTS,
  assertDraftAnswerScope,
  assertDraftCollectionBounds,
  assertDraftLineScope,
  assertDraftRowsScope,
  assertDraftScope,
  assertLineKey,
  matchesPackageScope,
  normalizeAnswerValue,
  normalizeCommentsHtml,
  normalizeQuotedAmount,
  quoteDraftAnswerPatchValidator,
  quoteDraftLinePatchValidator,
  quoteDraftPatchValidator,
} from "./core";
import type { InvitationScope } from "../quote_invitation_access";
import type { Doc, MutationCtx, QueryCtx } from "../types";

export async function createDraft(ctx: MutationCtx, scope: InvitationScope) {
  const now = Date.now();
  const draftId = await ctx.db.insert("quoteInvitationResponseDrafts", {
    answeredFieldCount: 0,
    attachmentCount: 0,
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    completedPricingLineCount: 0,
    createdAt: now,
    organizationId: scope.invitation.organizationId,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    retentionNextCheckAt: now,
    retentionState: "active",
    updatedAt: now,
    version: 1,
  });
  const draft = await ctx.db.get(draftId);
  if (!draft) {
    throw new ConvexError("Unable to create the Field Ledger draft.");
  }
  return draft;
}

export async function applyPatch(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  patch: Infer<typeof quoteDraftPatchValidator>
) {
  let changed = false;
  for (const linePatch of patch.linePatches ?? []) {
    changed = (await upsertLineItem(ctx, scope, draft, linePatch)) || changed;
  }
  for (const answerPatch of patch.answerPatches ?? []) {
    changed = (await upsertAnswer(ctx, scope, draft, answerPatch)) || changed;
  }
  for (const lineKey of patch.removeExpandedLineKeys ?? []) {
    changed = (await removeExpandedLineItem(ctx, draft, lineKey)) || changed;
  }
  if (patch.commentsHtml !== undefined) {
    const commentsHtml = normalizeCommentsHtml(patch.commentsHtml);
    if (draft.commentsHtml !== commentsHtml) {
      await ctx.db.patch(draft._id, { commentsHtml });
      changed = true;
    }
  }
  return changed;
}

export async function upsertLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  const canonical = await canonicalLineItem(ctx, scope, patch);
  const amount = normalizeQuotedAmount(patch.quotedAmountCents);
  const existing = await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_lineKey", (query) =>
      query
        .eq("quoteInvitationResponseDraftId", draft._id)
        .eq("lineKey", canonical.lineKey)
    )
    .unique();
  if (existing) {
    assertDraftLineScope(existing, scope, draft);
    if (
      existing.source !== canonical.source ||
      existing.scope !== canonical.scope ||
      existing.sourcePackageRevisionLabourLineId !==
        canonical.sourcePackageRevisionLabourLineId ||
      existing.sourcePackageRevisionMaterialLineId !==
        canonical.sourcePackageRevisionMaterialLineId ||
      existing.sourcePackageRevisionResponseFieldId !==
        canonical.sourcePackageRevisionResponseFieldId
    ) {
      throw new ConvexError("Field Ledger line identity cannot be changed.");
    }
    if (
      existing.quotedAmountCents === amount &&
      existing.title === canonical.title
    ) {
      return false;
    }
    await ctx.db.patch(existing._id, {
      quotedAmountCents: amount,
      title: canonical.title,
      updatedAt: Date.now(),
    });
    return true;
  }
  const existingRows = await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_updatedAt", (query) =>
      query.eq("quoteInvitationResponseDraftId", draft._id)
    )
    .take(MAX_DRAFT_LINE_ITEMS + 1);
  if (existingRows.length >= MAX_DRAFT_LINE_ITEMS) {
    throw new ConvexError("Field Ledger pricing exceeds its response limit.");
  }
  const now = Date.now();
  await ctx.db.insert("quoteInvitationResponseDraftLineItems", {
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    createdAt: now,
    lineKey: canonical.lineKey,
    organizationId: scope.invitation.organizationId,
    quotedAmountCents: amount,
    quoteInvitationResponseDraftId: draft._id,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    scope: canonical.scope,
    source: canonical.source,
    sourcePackageRevisionLabourLineId:
      canonical.sourcePackageRevisionLabourLineId,
    sourcePackageRevisionMaterialLineId:
      canonical.sourcePackageRevisionMaterialLineId,
    sourcePackageRevisionResponseFieldId:
      canonical.sourcePackageRevisionResponseFieldId,
    title: canonical.title,
    updatedAt: now,
  });
  return true;
}

export async function removeExpandedLineItem(
  ctx: MutationCtx,
  draft: Doc<"quoteInvitationResponseDrafts">,
  lineKey: string
) {
  assertLineKey(lineKey);
  const existing = await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_lineKey", (query) =>
      query
        .eq("quoteInvitationResponseDraftId", draft._id)
        .eq("lineKey", lineKey)
    )
    .unique();
  if (!existing) {
    return false;
  }
  if (existing.source !== "expanded_scope") {
    throw new ConvexError("Only expanded-scope lines may be removed.");
  }
  await ctx.db.delete(existing._id);
  return true;
}

export async function upsertAnswer(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  patch: Infer<typeof quoteDraftAnswerPatchValidator>
) {
  const field = await ctx.db.get(patch.sourcePackageRevisionResponseFieldId);
  if (!(field && matchesPackageScope(field, scope))) {
    throw new ConvexError(
      "Quote response field is unavailable for this package."
    );
  }
  if (field.kind === "priced_line" || field.kind === "attachment") {
    throw new ConvexError(
      "This response field uses a dedicated Field Ledger control."
    );
  }
  const value = normalizeAnswerValue(field, patch.value);
  const existing = await ctx.db
    .query("quoteInvitationResponseDraftAnswers")
    .withIndex("by_draft_and_responseFieldId", (query) =>
      query
        .eq("quoteInvitationResponseDraftId", draft._id)
        .eq("sourcePackageRevisionResponseFieldId", field._id)
    )
    .unique();
  if (!value) {
    if (!existing) {
      return false;
    }
    assertDraftAnswerScope(existing, scope, draft);
    await ctx.db.delete(existing._id);
    return true;
  }
  if (existing) {
    assertDraftAnswerScope(existing, scope, draft);
    if (existing.value === value) {
      return false;
    }
    await ctx.db.patch(existing._id, { updatedAt: Date.now(), value });
    return true;
  }
  const answers = await ctx.db
    .query("quoteInvitationResponseDraftAnswers")
    .withIndex("by_draft_and_responseFieldId", (query) =>
      query.eq("quoteInvitationResponseDraftId", draft._id)
    )
    .take(MAX_DRAFT_ANSWERS + 1);
  if (answers.length >= MAX_DRAFT_ANSWERS) {
    throw new ConvexError("Field Ledger answers exceed their response limit.");
  }
  const now = Date.now();
  await ctx.db.insert("quoteInvitationResponseDraftAnswers", {
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    createdAt: now,
    fieldKey: field.fieldKey,
    organizationId: scope.invitation.organizationId,
    quoteInvitationResponseDraftId: draft._id,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    scope: field.scope,
    sourcePackageRevisionResponseFieldId: field._id,
    updatedAt: now,
    value,
  });
  return true;
}

export async function canonicalLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  assertLineKey(patch.lineKey);
  switch (patch.source) {
    case "package_labour":
      return await canonicalLabourLineItem(ctx, scope, patch);
    case "package_material":
      return await canonicalMaterialLineItem(ctx, scope, patch);
    case "template_priced":
      return await canonicalTemplateLineItem(ctx, scope, patch);
    case "expanded_scope":
      return canonicalExpandedScopeLineItem(patch);
  }
}

export async function canonicalLabourLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  const lineId = patch.sourcePackageRevisionLabourLineId;
  const line = lineId ? await ctx.db.get(lineId) : null;
  if (!(line && matchesPackageScope(line, scope))) {
    throw new ConvexError("Labour line is unavailable for this package.");
  }
  if (patch.scope !== "labour" || patch.lineKey !== `labour:${line._id}`) {
    throw new ConvexError("Labour pricing line identity is invalid.");
  }
  return {
    lineKey: patch.lineKey,
    scope: "labour" as const,
    source: "package_labour" as const,
    sourcePackageRevisionLabourLineId: line._id,
    sourcePackageRevisionMaterialLineId: undefined,
    sourcePackageRevisionResponseFieldId: undefined,
    title: `${line.milestoneName} · ${line.submilestoneName}`,
  };
}

export async function canonicalMaterialLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  const lineId = patch.sourcePackageRevisionMaterialLineId;
  const line = lineId ? await ctx.db.get(lineId) : null;
  if (!(line && matchesPackageScope(line, scope))) {
    throw new ConvexError("Material line is unavailable for this package.");
  }
  if (patch.scope !== "materials" || patch.lineKey !== `material:${line._id}`) {
    throw new ConvexError("Material pricing line identity is invalid.");
  }
  return {
    lineKey: patch.lineKey,
    scope: "materials" as const,
    source: "package_material" as const,
    sourcePackageRevisionLabourLineId: undefined,
    sourcePackageRevisionMaterialLineId: line._id,
    sourcePackageRevisionResponseFieldId: undefined,
    title: line.title,
  };
}

export async function canonicalTemplateLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  const fieldId = patch.sourcePackageRevisionResponseFieldId;
  const field = fieldId ? await ctx.db.get(fieldId) : null;
  if (!(field && matchesPackageScope(field, scope))) {
    throw new ConvexError(
      "Priced response field is unavailable for this package."
    );
  }
  if (field.kind !== "priced_line" || patch.scope !== field.scope) {
    throw new ConvexError(
      "Priced response field is unavailable for this package."
    );
  }
  if (patch.lineKey !== `field:${field._id}`) {
    throw new ConvexError("Priced response field key is invalid.");
  }
  return {
    lineKey: patch.lineKey,
    scope: field.scope,
    source: "template_priced" as const,
    sourcePackageRevisionLabourLineId: undefined,
    sourcePackageRevisionMaterialLineId: undefined,
    sourcePackageRevisionResponseFieldId: field._id,
    title: field.label,
  };
}

export function canonicalExpandedScopeLineItem(
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  if (!(patch.scope === "labour" || patch.scope === "materials")) {
    throw new ConvexError("Expanded scope must be Labour or Materials.");
  }
  if (!patch.lineKey.startsWith("expanded:")) {
    throw new ConvexError("Expanded-scope pricing line key is invalid.");
  }
  const title = patch.title?.trim();
  if (!title || title.length > MAX_EXPANDED_SCOPE_TITLE_LENGTH) {
    throw new ConvexError(
      "Expanded-scope title is required and must be 180 characters or fewer."
    );
  }
  return {
    lineKey: patch.lineKey,
    scope: patch.scope,
    source: "expanded_scope" as const,
    sourcePackageRevisionLabourLineId: undefined,
    sourcePackageRevisionMaterialLineId: undefined,
    sourcePackageRevisionResponseFieldId: undefined,
    title,
  };
}

export async function updateDraftProgress(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  options: { incrementVersion: boolean } = { incrementVersion: true }
) {
  const [lineItems, answers, attachments] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseDraftLineItems")
      .withIndex("by_quoteInvitationResponseDraftId_and_updatedAt", (query) =>
        query.eq("quoteInvitationResponseDraftId", draft._id)
      )
      .take(MAX_DRAFT_LINE_ITEMS + 1),
    ctx.db
      .query("quoteInvitationResponseDraftAnswers")
      .withIndex("by_draft_and_responseFieldId", (query) =>
        query.eq("quoteInvitationResponseDraftId", draft._id)
      )
      .take(MAX_DRAFT_ANSWERS + 1),
    ctx.db
      .query("quoteInvitationResponseDraftAttachments")
      .withIndex("by_quoteInvitationResponseDraftId_and_createdAt", (query) =>
        query.eq("quoteInvitationResponseDraftId", draft._id)
      )
      .take(MAX_DRAFT_ATTACHMENTS + 1),
  ]);
  assertDraftCollectionBounds({ attachments, answers, lineItems });
  assertDraftRowsScope(scope, draft, { attachments, answers, lineItems });
  const now = Date.now();
  await ctx.db.patch(draft._id, {
    answeredFieldCount: answers.length,
    attachmentCount: attachments.length,
    completedPricingLineCount: lineItems.filter(
      (line) => line.quotedAmountCents !== undefined
    ).length,
    updatedAt: now,
    version: draft.version + (options.incrementVersion ? 1 : 0),
  });
  const updated = await ctx.db.get(draft._id);
  if (!updated) {
    throw new ConvexError("Field Ledger draft disappeared while saving.");
  }
  return updated;
}

export async function quoteDraftProjection(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  assertDraftScope(draft, scope);
  const [lineItems, answers, attachments] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseDraftLineItems")
      .withIndex("by_quoteInvitationResponseDraftId_and_updatedAt", (query) =>
        query.eq("quoteInvitationResponseDraftId", draft._id)
      )
      .order("asc")
      .take(MAX_DRAFT_LINE_ITEMS + 1),
    ctx.db
      .query("quoteInvitationResponseDraftAnswers")
      .withIndex("by_draft_and_responseFieldId", (query) =>
        query.eq("quoteInvitationResponseDraftId", draft._id)
      )
      .take(MAX_DRAFT_ANSWERS + 1),
    ctx.db
      .query("quoteInvitationResponseDraftAttachments")
      .withIndex("by_quoteInvitationResponseDraftId_and_createdAt", (query) =>
        query.eq("quoteInvitationResponseDraftId", draft._id)
      )
      .take(MAX_DRAFT_ATTACHMENTS + 1),
  ]);
  assertDraftCollectionBounds({ attachments, answers, lineItems });
  assertDraftRowsScope(scope, draft, { attachments, answers, lineItems });
  return {
    answeredFieldCount: draft.answeredFieldCount,
    attachmentCount: draft.attachmentCount,
    attachments: attachments.map((attachment) => ({
      createdAt: attachment.createdAt,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sourcePackageRevisionResponseFieldId:
        attachment.sourcePackageRevisionResponseFieldId,
      storageId: attachment.storageId,
    })),
    commentsHtml: draft.commentsHtml,
    completedPricingLineCount: draft.completedPricingLineCount,
    copiedFromQuotePackageRevisionId: draft.copiedFromQuotePackageRevisionId,
    copiedValuesConfirmationState: draft.copiedValuesConfirmationState,
    copiedValuesConfirmedAt: draft.copiedValuesConfirmedAt,
    copiedValuesConfirmedByWorkosUserId:
      draft.copiedValuesConfirmedByWorkosUserId,
    createdAt: draft.createdAt,
    lineItems: lineItems.map((line) => ({
      lineKey: line.lineKey,
      quotedAmountCents: line.quotedAmountCents,
      scope: line.scope,
      source: line.source,
      sourcePackageRevisionLabourLineId: line.sourcePackageRevisionLabourLineId,
      sourcePackageRevisionMaterialLineId:
        line.sourcePackageRevisionMaterialLineId,
      sourcePackageRevisionResponseFieldId:
        line.sourcePackageRevisionResponseFieldId,
      title: line.title,
    })),
    responses: answers.map((answer) => ({
      sourcePackageRevisionResponseFieldId:
        answer.sourcePackageRevisionResponseFieldId,
      value: answer.value,
    })),
    updatedAt: draft.updatedAt,
    version: draft.version,
  };
}
