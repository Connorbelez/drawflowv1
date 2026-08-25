import { ConvexError } from "convex/values";
import {
  DATE_RESPONSE_VALUE_PATTERN,
  DRAFT_LINE_KEY_PATTERN,
  MAX_ATTACHMENT_FILE_NAME_LENGTH,
  MAX_ATTACHMENT_MIME_TYPE_LENGTH,
  MAX_DRAFT_ANSWERS,
  MAX_DRAFT_ATTACHMENTS,
  MAX_DRAFT_LINE_ITEMS,
  MAX_PACKAGE_RESPONSE_FIELDS,
  MAX_PACKAGE_REVISION_LINEAGE,
  MAX_QUOTE_AMOUNT_CENTS,
  MAX_RESPONSE_HTML_LENGTH,
  MAX_RESPONSE_VALUE_LENGTH,
  MAX_WITHDRAWAL_EXPLANATION_LENGTH,
  UNSAFE_EMBEDDED_HTML_PATTERN,
  UNSAFE_HTML_EVENT_HANDLER_PATTERN,
  UNSAFE_HTML_PROTOCOL_PATTERN,
  type DraftRows,
  type PackageRevisionLineageCache,
  type SubmissionActor,
} from "./core";
import type { InvitationScope } from "../quote_invitation_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export interface SubmissionRows {
  answers: Doc<"quoteInvitationResponseSubmissionAnswers">[];
  attachments: Doc<"quoteInvitationResponseSubmissionAttachments">[];
  lineItems: Doc<"quoteInvitationResponseSubmissionLineItems">[];
}

export async function submissionRows(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">
): Promise<SubmissionRows> {
  const [lineItems, answers, attachments] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseSubmissionLineItems")
      .withIndex(
        "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
        (query) =>
          query.eq(
            "quoteInvitationResponseSubmissionRevisionId",
            submission._id
          )
      )
      .order("asc")
      .take(MAX_DRAFT_LINE_ITEMS + 1),
    ctx.db
      .query("quoteInvitationResponseSubmissionAnswers")
      .withIndex("by_quoteInvitationResponseSubmissionRevisionId", (query) =>
        query.eq("quoteInvitationResponseSubmissionRevisionId", submission._id)
      )
      .take(MAX_DRAFT_ANSWERS + 1),
    ctx.db
      .query("quoteInvitationResponseSubmissionAttachments")
      .withIndex(
        "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
        (query) =>
          query.eq(
            "quoteInvitationResponseSubmissionRevisionId",
            submission._id
          )
      )
      .take(MAX_DRAFT_ATTACHMENTS + 1),
  ]);
  assertDraftCollectionBounds({ attachments, answers, lineItems });
  for (const row of [...lineItems, ...answers, ...attachments]) {
    assertSubmissionRowScope(row, scope, submission);
  }
  return { answers, attachments, lineItems };
}

export async function validateDraftForSubmission(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  rows: DraftRows
) {
  assertDraftScope(draft, scope);
  const fields = await ctx.db
    .query("quotePackageRevisionResponseFields")
    .withIndex("by_quotePackageRevisionId_and_order", (query) =>
      query.eq("quotePackageRevisionId", scope.packageRevision._id)
    )
    .order("asc")
    .take(MAX_PACKAGE_RESPONSE_FIELDS + 1);
  if (fields.length > MAX_PACKAGE_RESPONSE_FIELDS) {
    throw new ConvexError(
      "Quote Package response contract exceeds its safe limit."
    );
  }
  for (const field of fields) {
    assertPackageResponseFieldScope(field, scope);
  }
  const fieldById = new Map(fields.map((field) => [field._id, field]));
  const lineErrors = await Promise.all(
    rows.lineItems.map((line) => validateDraftLine(ctx, scope, line, fieldById))
  );
  const answerErrors = rows.answers.map((answer) =>
    validateDraftAnswer(scope, answer, fieldById)
  );
  const attachmentErrors = await Promise.all(
    rows.attachments.map((attachment) =>
      validateDraftAttachment(ctx, scope, attachment, fieldById)
    )
  );
  const errors = [...lineErrors, ...answerErrors, ...attachmentErrors].filter(
    (error): error is string => error !== null
  );
  if (draft.copiedValuesConfirmationState === "pending") {
    errors.unshift(
      "Confirm all copied response values and pricing before submitting."
    );
  }
  if (draft.commentsHtml !== undefined) {
    const error = validateCommentsHtml(draft.commentsHtml);
    if (error) {
      errors.push(error);
    }
  }
  if (!rows.lineItems.some((line) => line.quotedAmountCents !== undefined)) {
    errors.push("Add at least one quoted amount before submitting.");
  }
  errors.push(
    ...fields
      .map((field) => requiredFieldError(field, rows))
      .filter((error): error is string => error !== null)
  );
  return [...new Set(errors)].slice(0, 50);
}

export function requiredFieldError(
  field: Doc<"quotePackageRevisionResponseFields">,
  rows: DraftRows
) {
  if (!field.required) {
    return null;
  }
  if (field.kind === "priced_line") {
    const answered = rows.lineItems.some(
      (line) =>
        line.source === "template_priced" &&
        line.sourcePackageRevisionResponseFieldId === field._id &&
        line.quotedAmountCents !== undefined
    );
    return answered ? null : `${field.label} is required.`;
  }
  if (field.kind === "attachment") {
    const answered = rows.attachments.some(
      (attachment) =>
        attachment.sourcePackageRevisionResponseFieldId === field._id
    );
    return answered ? null : `${field.label} requires an attachment.`;
  }
  const answer = rows.answers.find(
    (candidate) => candidate.sourcePackageRevisionResponseFieldId === field._id
  );
  return answer && hasMeaningfulAnswerValue(field, answer.value)
    ? null
    : `${field.label} is required.`;
}

export function validateDraftLine(
  ctx: MutationCtx,
  scope: InvitationScope,
  line: Doc<"quoteInvitationResponseDraftLineItems">,
  fieldById: Map<
    Id<"quotePackageRevisionResponseFields">,
    Doc<"quotePackageRevisionResponseFields">
  >
) {
  if (!DRAFT_LINE_KEY_PATTERN.test(line.lineKey)) {
    return "A Field Ledger pricing line has an invalid key.";
  }
  if (line.quotedAmountCents !== undefined) {
    const amountError = validateQuotedAmount(line.quotedAmountCents);
    if (amountError) {
      return amountError;
    }
  }
  switch (line.source) {
    case "package_labour":
      return validatePackageLabourLine(ctx, scope, line);
    case "package_material":
      return validatePackageMaterialLine(ctx, scope, line);
    case "template_priced":
      return validateTemplatePricedLine(line, fieldById);
    case "expanded_scope":
      return validateExpandedScopeLine(line);
  }
}

export async function validatePackageLabourLine(
  ctx: MutationCtx,
  scope: InvitationScope,
  line: Doc<"quoteInvitationResponseDraftLineItems">
) {
  const sourceId = line.sourcePackageRevisionLabourLineId;
  const packageLine = sourceId ? await ctx.db.get(sourceId) : null;
  if (!(packageLine && matchesPackageScope(packageLine, scope))) {
    return "A Field Ledger Labour line is outside this Quote Package.";
  }
  const matches =
    line.scope === "labour" &&
    line.lineKey === `labour:${packageLine._id}` &&
    line.title ===
      `${packageLine.milestoneName} · ${packageLine.submilestoneName}` &&
    line.sourcePackageRevisionMaterialLineId === undefined &&
    line.sourcePackageRevisionResponseFieldId === undefined;
  return matches
    ? null
    : "A Field Ledger Labour line does not match its Quote Package.";
}

export async function validatePackageMaterialLine(
  ctx: MutationCtx,
  scope: InvitationScope,
  line: Doc<"quoteInvitationResponseDraftLineItems">
) {
  const sourceId = line.sourcePackageRevisionMaterialLineId;
  const packageLine = sourceId ? await ctx.db.get(sourceId) : null;
  if (!(packageLine && matchesPackageScope(packageLine, scope))) {
    return "A Field Ledger Material line is outside this Quote Package.";
  }
  const matches =
    line.scope === "materials" &&
    line.lineKey === `material:${packageLine._id}` &&
    line.title === packageLine.title &&
    line.sourcePackageRevisionLabourLineId === undefined &&
    line.sourcePackageRevisionResponseFieldId === undefined;
  return matches
    ? null
    : "A Field Ledger Material line does not match its Quote Package.";
}

export function validateTemplatePricedLine(
  line: Doc<"quoteInvitationResponseDraftLineItems">,
  fieldById: Map<
    Id<"quotePackageRevisionResponseFields">,
    Doc<"quotePackageRevisionResponseFields">
  >
) {
  const fieldId = line.sourcePackageRevisionResponseFieldId;
  const field = fieldId ? fieldById.get(fieldId) : undefined;
  if (!field || field.kind !== "priced_line") {
    return "A configured pricing line is unavailable for this Quote Package.";
  }
  const matches =
    line.scope === field.scope &&
    line.lineKey === `field:${field._id}` &&
    line.title === field.label &&
    line.sourcePackageRevisionLabourLineId === undefined &&
    line.sourcePackageRevisionMaterialLineId === undefined;
  return matches
    ? null
    : "A configured pricing line does not match its Quote Package.";
}

export function validateExpandedScopeLine(
  line: Doc<"quoteInvitationResponseDraftLineItems">
) {
  const valid =
    (line.scope === "labour" || line.scope === "materials") &&
    line.lineKey.startsWith("expanded:") &&
    Boolean(line.title.trim()) &&
    line.title.length <= 180 &&
    line.sourcePackageRevisionLabourLineId === undefined &&
    line.sourcePackageRevisionMaterialLineId === undefined &&
    line.sourcePackageRevisionResponseFieldId === undefined;
  return valid ? null : "An expanded-scope pricing line is invalid.";
}

export function validateDraftAnswer(
  scope: InvitationScope,
  answer: Doc<"quoteInvitationResponseDraftAnswers">,
  fieldById: Map<
    Id<"quotePackageRevisionResponseFields">,
    Doc<"quotePackageRevisionResponseFields">
  >
) {
  const field = fieldById.get(answer.sourcePackageRevisionResponseFieldId);
  if (
    !(field && matchesPackageScope(field, scope)) ||
    field.kind === "priced_line" ||
    field.kind === "attachment" ||
    answer.fieldKey !== field.fieldKey ||
    answer.scope !== field.scope
  ) {
    return "A configured response value is outside this Quote Package.";
  }
  return validateConfiguredAnswerValue(field, answer.value);
}

export async function validateDraftAttachment(
  ctx: MutationCtx,
  scope: InvitationScope,
  attachment: Doc<"quoteInvitationResponseDraftAttachments">,
  fieldById: Map<
    Id<"quotePackageRevisionResponseFields">,
    Doc<"quotePackageRevisionResponseFields">
  >
) {
  const fileName = attachment.fileName.trim();
  const mimeType = attachment.mimeType.trim().toLowerCase();
  if (
    !fileName ||
    fileName.length > MAX_ATTACHMENT_FILE_NAME_LENGTH ||
    !mimeType ||
    mimeType.length > MAX_ATTACHMENT_MIME_TYPE_LENGTH ||
    !Number.isSafeInteger(attachment.sizeBytes) ||
    attachment.sizeBytes < 1
  ) {
    return "A Field Ledger attachment has invalid metadata.";
  }
  if (attachment.mimeType !== mimeType || attachment.fileName !== fileName) {
    return "A Field Ledger attachment metadata is not canonical.";
  }
  if (attachment.sourcePackageRevisionResponseFieldId) {
    const field = fieldById.get(
      attachment.sourcePackageRevisionResponseFieldId
    );
    if (
      !(field && matchesPackageScope(field, scope)) ||
      field.kind !== "attachment"
    ) {
      return "A configured attachment is outside this Quote Package.";
    }
    if (
      field.validation?.allowedMimeTypes &&
      !field.validation.allowedMimeTypes.includes(mimeType)
    ) {
      return `${field.label} does not accept this file type.`;
    }
  }
  const storage = await ctx.db.system.get("_storage", attachment.storageId);
  if (
    !storage ||
    storage.size !== attachment.sizeBytes ||
    (storage.contentType && storage.contentType.toLowerCase() !== mimeType)
  ) {
    return "A Field Ledger attachment is no longer available.";
  }
  return null;
}

export function validateCommentsHtml(value: string) {
  if (value.length > MAX_RESPONSE_HTML_LENGTH || containsUnsafeHtml(value)) {
    return "Additional Comments contain unsupported rich-text content.";
  }
  return null;
}

export function validateConfiguredAnswerValue(
  field: Doc<"quotePackageRevisionResponseFields">,
  value: string
) {
  const normalized = value.trim();
  if (!normalized) {
    return `${field.label} cannot be blank.`;
  }
  const maxLength = Math.min(
    MAX_RESPONSE_VALUE_LENGTH,
    field.validation?.maxLength ?? MAX_RESPONSE_VALUE_LENGTH
  );
  if (normalized.length > maxLength) {
    return `${field.label} exceeds its maximum length.`;
  }
  if (field.kind === "date" && !DATE_RESPONSE_VALUE_PATTERN.test(normalized)) {
    return `${field.label} must be a valid calendar date.`;
  }
  if (field.kind === "choice" && !field.choiceOptions?.includes(normalized)) {
    return `${field.label} must use one of the provided choices.`;
  }
  if (field.validation?.pattern) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(field.validation.pattern);
    } catch {
      return `${field.label} has an invalid configured validation pattern.`;
    }
    if (!pattern.test(normalized)) {
      return `${field.label} does not match the required format.`;
    }
  }
  if (field.renderer === "tiptap" && containsUnsafeHtml(normalized)) {
    return `${field.label} contains unsupported rich-text content.`;
  }
  return null;
}

export function hasMeaningfulAnswerValue(
  field: Doc<"quotePackageRevisionResponseFields">,
  value: string
) {
  if (field.renderer !== "tiptap") {
    return Boolean(value.trim());
  }
  return hasMeaningfulHtml(value);
}

export function canonicalTotal(lineItems: readonly { quotedAmountCents?: number }[]) {
  let total = 0;
  for (const line of lineItems) {
    if (line.quotedAmountCents === undefined) {
      continue;
    }
    const error = validateQuotedAmount(line.quotedAmountCents);
    if (error) {
      throw new ConvexError(error);
    }
    total += line.quotedAmountCents;
    if (!Number.isSafeInteger(total) || total > MAX_QUOTE_AMOUNT_CENTS) {
      throw new ConvexError("Quote total exceeds its safe integer-cent limit.");
    }
  }
  return total;
}

export function validateQuotedAmount(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_QUOTE_AMOUNT_CENTS
  ) {
    return "Quoted amount must be a non-negative whole-cent value.";
  }
  return null;
}

export function containsUnsafeHtml(value: string) {
  return (
    UNSAFE_EMBEDDED_HTML_PATTERN.test(value) ||
    UNSAFE_HTML_EVENT_HANDLER_PATTERN.test(value) ||
    UNSAFE_HTML_PROTOCOL_PATTERN.test(value)
  );
}

export function hasMeaningfulHtml(value: string) {
  return (
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .trim().length > 0
  );
}

export function normalizeWithdrawalExplanation(value: string | undefined) {
  if (value === undefined) {
    return;
  }
  const normalized = value.trim();
  if (normalized.length > MAX_WITHDRAWAL_EXPLANATION_LENGTH) {
    throw new ConvexError(
      "Quote response withdrawal explanation exceeds its safe length."
    );
  }
  return normalized || undefined;
}

export function assertExpectedDraftVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConvexError("Field Ledger draft version is invalid.");
  }
}

export function assertExpectedSubmissionRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConvexError("Quote response submission revision is invalid.");
  }
}

export function matchesPackageScope(
  row:
    | Doc<"quotePackageRevisionLabourLines">
    | Doc<"quotePackageRevisionMaterialLines">
    | Doc<"quotePackageRevisionResponseFields">,
  scope: InvitationScope
) {
  return (
    row.brokerageId === scope.invitation.brokerageId &&
    row.organizationId === scope.invitation.organizationId &&
    row.buildId === scope.invitation.buildId &&
    row.quoteRoundId === scope.invitation.quoteRoundId &&
    row.quotePackageRevisionId === scope.packageRevision._id
  );
}

export function assertPackageResponseFieldScope(
  field: Doc<"quotePackageRevisionResponseFields">,
  scope: InvitationScope
) {
  if (!matchesPackageScope(field, scope)) {
    throw new ConvexError(
      "Quote response field crosses its Quote Package scope."
    );
  }
}

export function assertDraftScope(
  draft: Doc<"quoteInvitationResponseDrafts">,
  scope: InvitationScope
) {
  if (
    draft.brokerageId !== scope.invitation.brokerageId ||
    draft.organizationId !== scope.invitation.organizationId ||
    draft.buildId !== scope.invitation.buildId ||
    draft.quoteRoundId !== scope.invitation.quoteRoundId ||
    draft.quoteRoundInvitationId !== scope.invitation._id ||
    draft.quotePackageRevisionId !== scope.packageRevision._id
  ) {
    throw new ConvexError("Field Ledger draft crosses its invitation scope.");
  }
}

export function assertDraftRowScope(
  row:
    | Doc<"quoteInvitationResponseDraftLineItems">
    | Doc<"quoteInvitationResponseDraftAnswers">
    | Doc<"quoteInvitationResponseDraftAttachments">,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  if (
    row.brokerageId !== scope.invitation.brokerageId ||
    row.organizationId !== scope.invitation.organizationId ||
    row.buildId !== scope.invitation.buildId ||
    row.quoteRoundId !== scope.invitation.quoteRoundId ||
    row.quoteRoundInvitationId !== scope.invitation._id ||
    row.quotePackageRevisionId !== scope.packageRevision._id ||
    row.quoteInvitationResponseDraftId !== draft._id
  ) {
    throw new ConvexError("Field Ledger row crosses its invitation scope.");
  }
}

export function assertDraftCollectionBounds(rows: {
  attachments: unknown[];
  answers: unknown[];
  lineItems: unknown[];
}) {
  if (
    rows.lineItems.length > MAX_DRAFT_LINE_ITEMS ||
    rows.answers.length > MAX_DRAFT_ANSWERS ||
    rows.attachments.length > MAX_DRAFT_ATTACHMENTS
  ) {
    throw new ConvexError("Field Ledger exceeds its safe response limit.");
  }
}

export function assertSubmissionScope(
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">,
  scope: InvitationScope
) {
  assertSubmissionInvitationScope(submission, scope);
  if (submission.quotePackageRevisionId !== scope.packageRevision._id) {
    throw new ConvexError(
      "Quote response submission crosses its invitation scope."
    );
  }
}

export function assertSubmissionInvitationScope(
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">,
  scope: InvitationScope
) {
  if (
    submission.brokerageId !== scope.invitation.brokerageId ||
    submission.organizationId !== scope.invitation.organizationId ||
    submission.buildId !== scope.invitation.buildId ||
    submission.quoteRoundId !== scope.invitation.quoteRoundId ||
    submission.quoteRoundInvitationId !== scope.invitation._id
  ) {
    throw new ConvexError(
      "Quote response submission crosses its invitation scope."
    );
  }
}

export function assertPackageRevisionInvitationScope(
  packageRevision: Doc<"quotePackageRevisions">,
  scope: InvitationScope
) {
  if (
    packageRevision.brokerageId !== scope.invitation.brokerageId ||
    packageRevision.organizationId !== scope.invitation.organizationId ||
    packageRevision.buildId !== scope.invitation.buildId ||
    packageRevision.quoteRoundId !== scope.invitation.quoteRoundId
  ) {
    throw new ConvexError(
      "Quote Package Revision crosses its invitation scope."
    );
  }
}

export function assertPackageRevisionDescendsFromInvitationRoot(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  packageRevision: Doc<"quotePackageRevisions">,
  cache?: PackageRevisionLineageCache
) {
  const cached = cache?.get(packageRevision._id);
  if (cached) {
    return cached;
  }
  const verification = (async () => {
    let current = packageRevision;
    for (let depth = 0; depth <= MAX_PACKAGE_REVISION_LINEAGE; depth += 1) {
      try {
        assertPackageRevisionInvitationScope(current, scope);
      } catch {
        throw new ConvexError(
          "Historical Quote Package Revision is unavailable."
        );
      }
      if (current._id === scope.invitation.quotePackageRevisionId) {
        return;
      }
      if (depth === MAX_PACKAGE_REVISION_LINEAGE) {
        throw new ConvexError(
          "Historical Quote Package Revision is unavailable."
        );
      }
      if (!current.previousPackageRevisionId) {
        throw new ConvexError(
          "Historical Quote Package Revision is unavailable."
        );
      }
      const previous = await ctx.db.get(current.previousPackageRevisionId);
      if (!previous) {
        throw new ConvexError(
          "Historical Quote Package Revision is unavailable."
        );
      }
      current = previous;
    }
  })();
  cache?.set(packageRevision._id, verification);
  return verification;
}

export async function historicalSubmissionScope(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">,
  packageLineageCache?: PackageRevisionLineageCache
) {
  assertSubmissionInvitationScope(submission, scope);
  const packageRevision =
    submission.quotePackageRevisionId === scope.packageRevision._id
      ? scope.packageRevision
      : await ctx.db.get(submission.quotePackageRevisionId);
  if (!packageRevision) {
    throw new ConvexError("Historical Quote Package Revision is unavailable.");
  }
  await assertPackageRevisionDescendsFromInvitationRoot(
    ctx,
    scope,
    packageRevision,
    packageLineageCache
  );
  return { ...scope, packageRevision };
}

export function assertSubmissionStateScope(
  state: Doc<"quoteInvitationResponseSubmissionStates"> | null,
  scope: InvitationScope,
  revisions?: Map<
    Id<"quoteInvitationResponseSubmissionRevisions">,
    Doc<"quoteInvitationResponseSubmissionRevisions">
  >
) {
  if (!state) {
    return;
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
  if (revisions) {
    const latest = revisions.get(state.latestSubmissionRevisionId);
    const active = state.activeSubmissionRevisionId
      ? revisions.get(state.activeSubmissionRevisionId)
      : undefined;
    if (!latest || (state.activeSubmissionRevisionId && !active)) {
      throw new ConvexError(
        "Quote response submission state references another revision."
      );
    }
    if (latest.revision !== state.latestRevision) {
      throw new ConvexError(
        "Quote response submission state revision is inconsistent."
      );
    }
  }
}

export function assertSubmissionRowScope(
  row:
    | Doc<"quoteInvitationResponseSubmissionLineItems">
    | Doc<"quoteInvitationResponseSubmissionAnswers">
    | Doc<"quoteInvitationResponseSubmissionAttachments">,
  scope: InvitationScope,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">
) {
  if (
    row.brokerageId !== scope.invitation.brokerageId ||
    row.organizationId !== scope.invitation.organizationId ||
    row.buildId !== scope.invitation.buildId ||
    row.quoteRoundId !== scope.invitation.quoteRoundId ||
    row.quoteRoundInvitationId !== scope.invitation._id ||
    row.quotePackageRevisionId !== scope.packageRevision._id ||
    row.quoteInvitationResponseSubmissionRevisionId !== submission._id
  ) {
    throw new ConvexError(
      "Quote response submission row crosses its invitation scope."
    );
  }
}

export function assertSubmissionLifecycleEventScope(
  event: Doc<"quoteInvitationResponseSubmissionLifecycleEvents">,
  scope: InvitationScope,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">
) {
  if (
    event.brokerageId !== scope.invitation.brokerageId ||
    event.organizationId !== scope.invitation.organizationId ||
    event.buildId !== scope.invitation.buildId ||
    event.quoteRoundId !== scope.invitation.quoteRoundId ||
    event.quoteRoundInvitationId !== scope.invitation._id ||
    event.quotePackageRevisionId !== submission.quotePackageRevisionId ||
    event.quoteInvitationResponseSubmissionRevisionId !== submission._id
  ) {
    throw new ConvexError(
      "Quote response lifecycle event crosses its invitation scope."
    );
  }
}

export async function appendSubmissionAuditEvent(
  ctx: MutationCtx,
  scope: InvitationScope,
  actor: SubmissionActor,
  input: {
    command: string;
    eventType: string;
    newState: Record<string, unknown>;
    now: number;
    priorState: Record<string, unknown>;
    reason?: string;
    submissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: ["quote-recipient"],
    actorWorkosUserId:
      actor.workosUserId ?? `quote-recipient:${scope.profile._id}`,
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    command: input.command,
    createdAt: input.now,
    entityId: String(input.submissionRevisionId),
    entityType: "quoteInvitationResponseSubmission",
    eventType: input.eventType,
    newState: JSON.stringify(input.newState),
    organizationId: scope.invitation.organizationId,
    priorState: JSON.stringify(input.priorState),
    reason: input.reason,
    targetRevisions: [
      {
        entityId: String(input.submissionRevisionId),
        entityType: "quoteInvitationResponseSubmissionRevision",
        revision:
          typeof input.newState.revision === "number"
            ? input.newState.revision
            : undefined,
      },
      {
        entityId: String(scope.packageRevision._id),
        entityType: "quotePackageRevision",
        revision: scope.packageRevision.revision,
      },
    ],
    warnings: [],
  });
}
