import { ConvexError, type Infer, v } from "convex/values";

import { authorizeActiveBuildAccess } from "../activeBuildAccess";
import {
  quoteInvitationAccessProjectionValidator,
} from "../quote_invitation_access";
import type { InvitationScope } from "../quote_invitation_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export const MAX_DRAFT_ANSWERS = 100;
export const MAX_DRAFT_ATTACHMENTS = 25;
export const MAX_ACTIVE_DRAFT_ATTACHMENT_STAGING_SESSIONS = MAX_DRAFT_ATTACHMENTS;
export const MAX_DRAFT_LINE_ITEMS = 340;
export const MAX_INTERNAL_PROGRESS_ROWS = 200;
export const MAX_PATCH_ANSWERS = 40;
export const MAX_PATCH_LINE_ITEMS = 40;
export const MAX_PATCH_REMOVALS = 40;
export const MAX_RESPONSE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_RESPONSE_HTML_LENGTH = 40_000;
export const MAX_RESPONSE_VALUE_LENGTH = 32_000;
export const MAX_ATTACHMENT_FILE_NAME_LENGTH = 255;
export const MAX_ATTACHMENT_MIME_TYPE_LENGTH = 160;
export const DRAFT_ATTACHMENT_STAGING_TTL_MS = 30 * 60 * 1000;
export const DRAFT_ATTACHMENT_UPLOAD_PATH =
  "/api/quote-response-draft-attachment-upload";
export const MAX_EXPANDED_SCOPE_TITLE_LENGTH = 180;
export const MAX_QUOTE_AMOUNT_CENTS = 100_000_000_000;
export const DATE_RESPONSE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DRAFT_LINE_KEY_PATTERN = /^[a-z]+:[A-Za-z0-9_-]{1,180}$/;
export const UNSAFE_EMBEDDED_HTML_PATTERN = /<(?:script|iframe|object|embed|style)\b/i;
export const UNSAFE_HTML_EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=/i;
export const UNSAFE_HTML_PROTOCOL_PATTERN = /javascript\s*:/i;
export const TRAILING_SLASH_PATTERN = /\/$/;

export const quoteDraftLineSourceValidator = v.union(
  v.literal("package_labour"),
  v.literal("package_material"),
  v.literal("template_priced"),
  v.literal("expanded_scope")
);

export const quoteDraftLineScopeValidator = v.union(
  v.literal("labour"),
  v.literal("materials"),
  v.literal("whole_quote")
);

export const quotedAmountPatchValidator = v.union(v.number(), v.null());

export const quoteDraftLinePatchValidator = v.object({
  lineKey: v.string(),
  quotedAmountCents: v.optional(quotedAmountPatchValidator),
  scope: quoteDraftLineScopeValidator,
  source: quoteDraftLineSourceValidator,
  sourcePackageRevisionLabourLineId: v.optional(
    v.id("quotePackageRevisionLabourLines")
  ),
  sourcePackageRevisionMaterialLineId: v.optional(
    v.id("quotePackageRevisionMaterialLines")
  ),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  title: v.optional(v.string()),
});

export const quoteDraftAnswerPatchValidator = v.object({
  sourcePackageRevisionResponseFieldId: v.id(
    "quotePackageRevisionResponseFields"
  ),
  value: v.union(v.string(), v.null()),
});

export const quoteDraftPatchValidator = v.object({
  answerPatches: v.optional(v.array(quoteDraftAnswerPatchValidator)),
  commentsHtml: v.optional(v.union(v.string(), v.null())),
  linePatches: v.optional(v.array(quoteDraftLinePatchValidator)),
  removeExpandedLineKeys: v.optional(v.array(v.string())),
});

export const quoteDraftLineProjectionValidator = v.object({
  lineKey: v.string(),
  quotedAmountCents: v.optional(v.number()),
  scope: quoteDraftLineScopeValidator,
  source: quoteDraftLineSourceValidator,
  sourcePackageRevisionLabourLineId: v.optional(
    v.id("quotePackageRevisionLabourLines")
  ),
  sourcePackageRevisionMaterialLineId: v.optional(
    v.id("quotePackageRevisionMaterialLines")
  ),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  title: v.string(),
});

export const quoteDraftAnswerProjectionValidator = v.object({
  sourcePackageRevisionResponseFieldId: v.id(
    "quotePackageRevisionResponseFields"
  ),
  value: v.string(),
});

export const quoteDraftAttachmentProjectionValidator = v.object({
  createdAt: v.number(),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  storageId: v.id("_storage"),
});

export const quoteDraftProjectionValidator = v.object({
  answeredFieldCount: v.number(),
  attachmentCount: v.number(),
  attachments: v.array(quoteDraftAttachmentProjectionValidator),
  commentsHtml: v.optional(v.string()),
  completedPricingLineCount: v.number(),
  copiedFromQuotePackageRevisionId: v.optional(v.id("quotePackageRevisions")),
  copiedValuesConfirmationState: v.optional(
    v.union(v.literal("pending"), v.literal("confirmed"))
  ),
  copiedValuesConfirmedAt: v.optional(v.number()),
  copiedValuesConfirmedByWorkosUserId: v.optional(v.string()),
  createdAt: v.number(),
  lineItems: v.array(quoteDraftLineProjectionValidator),
  responses: v.array(quoteDraftAnswerProjectionValidator),
  updatedAt: v.number(),
  version: v.number(),
});

export const quoteDraftReadResultValidator = v.union(
  v.object({
    access: quoteInvitationAccessProjectionValidator,
    draft: v.union(quoteDraftProjectionValidator, v.null()),
    status: v.union(v.literal("available"), v.literal("read_only")),
  }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

export const quoteDraftSaveResultValidator = v.union(
  v.object({
    draft: quoteDraftProjectionValidator,
    status: v.literal("saved"),
  }),
  v.object({
    draft: v.union(quoteDraftProjectionValidator, v.null()),
    status: v.literal("conflict"),
  }),
  v.object({ status: v.literal("not_started") }),
  // Once a commercial response exists, only the submission lifecycle may seed
  // a new Draft. Autosave must not silently create a revision Draft from a
  // stale Field Ledger view.
  v.object({ status: v.literal("revision_required") }),
  v.object({ status: v.literal("acknowledgement_required") }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

export const copiedValuesConfirmationResultValidator = v.union(
  v.object({
    draft: quoteDraftProjectionValidator,
    status: v.literal("confirmed"),
  }),
  v.object({
    draft: v.union(quoteDraftProjectionValidator, v.null()),
    status: v.literal("conflict"),
  }),
  v.object({ status: v.literal("not_required") }),
  v.object({ status: v.literal("acknowledgement_required") }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

export const quoteDraftAttachmentIntentInput = {
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
};

export const quoteDraftUploadUrlResultValidator = v.union(
  v.object({
    expiresAt: v.number(),
    stagingSessionId: v.id(
      "quoteInvitationResponseDraftAttachmentStagingSessions"
    ),
    status: v.literal("available"),
    uploadSecret: v.string(),
    uploadUrl: v.string(),
  }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("revision_required") }),
  v.object({ status: v.literal("acknowledgement_required") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

export const quoteDraftAttachmentRegistrationResultValidator = v.union(
  v.object({ status: v.literal("registered") }),
  v.object({ message: v.string(), status: v.literal("attachment_rejected") }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

export const quoteDraftAttachmentFinalizeResultValidator = v.union(
  v.object({
    draft: quoteDraftProjectionValidator,
    status: v.literal("saved"),
  }),
  v.object({
    draft: v.union(quoteDraftProjectionValidator, v.null()),
    status: v.literal("conflict"),
  }),
  v.object({ message: v.string(), status: v.literal("attachment_rejected") }),
  v.object({ status: v.literal("revision_required") }),
  v.object({ status: v.literal("acknowledgement_required") }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

export const quoteDraftProgressValidator = v.object({
  answeredFieldCount: v.number(),
  attachmentCount: v.number(),
  completedPricingLineCount: v.number(),
  quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  status: v.literal("drafting"),
  updatedAt: v.number(),
});

export async function findDraft(ctx: QueryCtx | MutationCtx, scope: InvitationScope) {
  const draft = await ctx.db
    .query("quoteInvitationResponseDrafts")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", scope.invitation._id)
          .eq("quotePackageRevisionId", scope.packageRevision._id)
    )
    .unique();
  if (draft) {
    assertDraftScope(draft, scope);
  }
  return draft;
}

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

export function assertExpectedVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConvexError("Field Ledger version is invalid.");
  }
}

export function assertPatchBounds(patch: Infer<typeof quoteDraftPatchValidator>) {
  if (
    (patch.linePatches?.length ?? 0) > MAX_PATCH_LINE_ITEMS ||
    (patch.answerPatches?.length ?? 0) > MAX_PATCH_ANSWERS ||
    (patch.removeExpandedLineKeys?.length ?? 0) > MAX_PATCH_REMOVALS
  ) {
    throw new ConvexError("Field Ledger save payload exceeds its safe limit.");
  }
}

export function patchHasMeaningfulChange(
  patch: Infer<typeof quoteDraftPatchValidator>
) {
  return Boolean(
    patch.linePatches?.some(
      (line) =>
        typeof line.quotedAmountCents === "number" ||
        (line.source === "expanded_scope" && Boolean(line.title?.trim()))
    ) ||
      patch.answerPatches?.some((answer) => Boolean(answer.value?.trim())) ||
      (patch.commentsHtml !== undefined &&
        Boolean(patch.commentsHtml && hasMeaningfulHtml(patch.commentsHtml)))
  );
}

export function normalizeQuotedAmount(value: number | null | undefined) {
  if (value === undefined || value === null) {
    return;
  }
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_QUOTE_AMOUNT_CENTS
  ) {
    throw new ConvexError(
      "Quoted amount must be a non-negative whole cent value."
    );
  }
  return value;
}

export function normalizeCommentsHtml(value: string | null) {
  if (value === null) {
    return;
  }
  if (value.length > MAX_RESPONSE_HTML_LENGTH || containsUnsafeHtml(value)) {
    throw new ConvexError(
      "Quote comments contain unsupported rich-text content."
    );
  }
  return hasMeaningfulHtml(value) ? value.trim() : undefined;
}

export function normalizeAnswerValue(
  field: Doc<"quotePackageRevisionResponseFields">,
  value: string | null
) {
  if (value === null || !value.trim()) {
    return;
  }
  const normalized = value.trim();
  const maxLength = Math.min(
    MAX_RESPONSE_VALUE_LENGTH,
    field.validation?.maxLength ?? MAX_RESPONSE_VALUE_LENGTH
  );
  if (normalized.length > maxLength) {
    throw new ConvexError(`${field.label} exceeds its maximum length.`);
  }
  if (field.kind === "date" && !DATE_RESPONSE_VALUE_PATTERN.test(normalized)) {
    throw new ConvexError(`${field.label} must be a valid calendar date.`);
  }
  if (field.kind === "choice" && !field.choiceOptions?.includes(normalized)) {
    throw new ConvexError(
      `${field.label} must use one of the provided choices.`
    );
  }
  if (field.validation?.pattern) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(field.validation.pattern);
    } catch {
      throw new ConvexError(
        "Quote response field has an invalid validation pattern."
      );
    }
    if (!pattern.test(normalized)) {
      throw new ConvexError(
        `${field.label} does not match the required format.`
      );
    }
  }
  if (field.renderer === "tiptap" && containsUnsafeHtml(normalized)) {
    throw new ConvexError(
      `${field.label} contains unsupported rich-text content.`
    );
  }
  return normalized;
}

export async function validateAttachmentDescriptor(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  args: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sourcePackageRevisionResponseFieldId?: Id<"quotePackageRevisionResponseFields">;
  }
) {
  const fileName = args.fileName.trim();
  const mimeType = args.mimeType.trim().toLowerCase();
  if (!fileName || fileName.length > MAX_ATTACHMENT_FILE_NAME_LENGTH) {
    throw new ConvexError("Response file name is invalid.");
  }
  if (!mimeType || mimeType.length > MAX_ATTACHMENT_MIME_TYPE_LENGTH) {
    throw new ConvexError("Response file type is invalid.");
  }
  if (
    !Number.isSafeInteger(args.sizeBytes) ||
    args.sizeBytes < 1 ||
    args.sizeBytes > MAX_RESPONSE_ATTACHMENT_BYTES
  ) {
    throw new ConvexError("Response file must be smaller than 20 MB.");
  }
  if (!args.sourcePackageRevisionResponseFieldId) {
    return { fileName, mimeType, sizeBytes: args.sizeBytes };
  }
  const field = await ctx.db.get(args.sourcePackageRevisionResponseFieldId);
  if (
    !(field && matchesPackageScope(field, scope)) ||
    field.kind !== "attachment"
  ) {
    throw new ConvexError(
      "Response attachment field is unavailable for this package."
    );
  }
  if (
    field.validation?.allowedMimeTypes &&
    !field.validation.allowedMimeTypes.includes(mimeType)
  ) {
    throw new ConvexError(`${field.label} does not accept this file type.`);
  }
  return {
    fileName,
    mimeType,
    sizeBytes: args.sizeBytes,
    sourcePackageRevisionResponseFieldId: field._id,
  };
}

export function assertLineKey(lineKey: string) {
  if (!DRAFT_LINE_KEY_PATTERN.test(lineKey)) {
    throw new ConvexError("Field Ledger line key is invalid.");
  }
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

export function assertDraftLineScope(
  line: Doc<"quoteInvitationResponseDraftLineItems">,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  assertDraftRowScope(line, scope, draft, "Field Ledger pricing line");
}

export function assertDraftAnswerScope(
  answer: Doc<"quoteInvitationResponseDraftAnswers">,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  assertDraftRowScope(answer, scope, draft, "Field Ledger answer");
}

export function assertDraftRowScope(
  row:
    | Doc<"quoteInvitationResponseDraftLineItems">
    | Doc<"quoteInvitationResponseDraftAnswers">
    | Doc<"quoteInvitationResponseDraftAttachments">,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  label: string
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
    throw new ConvexError(`${label} crosses its invitation scope.`);
  }
}

export function assertDraftRowsScope(
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  rows: {
    attachments: Doc<"quoteInvitationResponseDraftAttachments">[];
    answers: Doc<"quoteInvitationResponseDraftAnswers">[];
    lineItems: Doc<"quoteInvitationResponseDraftLineItems">[];
  }
) {
  for (const row of [...rows.lineItems, ...rows.answers, ...rows.attachments]) {
    assertDraftRowScope(row, scope, draft, "Field Ledger row");
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

export function assertInternalDraftScope(
  drafts: Doc<"quoteInvitationResponseDrafts">[],
  authorization: Awaited<ReturnType<typeof authorizeActiveBuildAccess>>,
  round: Doc<"quoteRounds">
) {
  if (
    drafts.some(
      (draft) =>
        draft.brokerageId !== authorization.brokerage._id ||
        draft.organizationId !== authorization.organizationId ||
        draft.buildId !== authorization.build._id ||
        draft.quoteRoundId !== round._id
    )
  ) {
    throw new ConvexError("Quote response progress crosses its Build scope.");
  }
}
