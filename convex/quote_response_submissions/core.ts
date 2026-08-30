import { v } from "convex/values";
import { quoteInvitationAccessProjectionValidator } from "../quote_invitation_access";
import type {
  InvitationScope,
  resolveQuoteInvitationBrowserReadAccess,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedReadAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "../quote_invitation_access";
import type { Doc, Id } from "../types";

export const MAX_DRAFT_LINE_ITEMS = 340;
export const MAX_DRAFT_ANSWERS = 100;
export const MAX_DRAFT_ATTACHMENTS = 25;
export const MAX_SUBMISSION_REVISIONS = 100;
export const MAX_SUBMISSION_EVENTS = MAX_SUBMISSION_REVISIONS * 3;
export const MAX_LIFECYCLE_REVISION_SUMMARIES = 20;
export const MAX_PACKAGE_REVISION_LINEAGE = 20;
export const MAX_QUOTE_AMOUNT_CENTS = 100_000_000_000;
export const MAX_RESPONSE_HTML_LENGTH = 40_000;
export const MAX_RESPONSE_VALUE_LENGTH = 32_000;
export const MAX_WITHDRAWAL_EXPLANATION_LENGTH = 4000;
export const MAX_ATTACHMENT_FILE_NAME_LENGTH = 255;
export const MAX_ATTACHMENT_MIME_TYPE_LENGTH = 160;
export const MAX_PACKAGE_RESPONSE_FIELDS = 100;
export const DATE_RESPONSE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DRAFT_LINE_KEY_PATTERN = /^[a-z]+:[A-Za-z0-9_-]{1,180}$/;
export const UNSAFE_EMBEDDED_HTML_PATTERN = /<(?:script|iframe|object|embed|style)\b/i;
export const UNSAFE_HTML_EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=/i;
export const UNSAFE_HTML_PROTOCOL_PATTERN = /javascript\s*:/i;

export type PackageRevisionLineageCache = Map<
  Id<"quotePackageRevisions">,
  Promise<void>
>;

export const quoteLineSourceValidator = v.union(
  v.literal("package_labour"),
  v.literal("package_material"),
  v.literal("template_priced"),
  v.literal("expanded_scope")
);

export const quoteLineScopeValidator = v.union(
  v.literal("labour"),
  v.literal("materials"),
  v.literal("whole_quote")
);

export const submissionLifecycleStatusValidator = v.union(
  v.literal("active"),
  v.literal("superseded"),
  v.literal("withdrawn")
);

export const draftLineProjectionValidator = v.object({
  lineKey: v.string(),
  quotedAmountCents: v.optional(v.number()),
  scope: quoteLineScopeValidator,
  source: quoteLineSourceValidator,
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

export const answerProjectionValidator = v.object({
  sourcePackageRevisionResponseFieldId: v.id(
    "quotePackageRevisionResponseFields"
  ),
  value: v.string(),
});

export const attachmentProjectionValidator = v.object({
  createdAt: v.number(),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  storageId: v.id("_storage"),
});

export const draftProjectionValidator = v.object({
  answeredFieldCount: v.number(),
  attachmentCount: v.number(),
  attachments: v.array(attachmentProjectionValidator),
  commentsHtml: v.optional(v.string()),
  completedPricingLineCount: v.number(),
  copiedFromQuotePackageRevisionId: v.optional(v.id("quotePackageRevisions")),
  copiedValuesConfirmationState: v.optional(
    v.union(v.literal("pending"), v.literal("confirmed"))
  ),
  copiedValuesConfirmedAt: v.optional(v.number()),
  copiedValuesConfirmedByWorkosUserId: v.optional(v.string()),
  createdAt: v.number(),
  lineItems: v.array(draftLineProjectionValidator),
  responses: v.array(answerProjectionValidator),
  updatedAt: v.number(),
  version: v.number(),
});

export const submissionProjectionValidator = v.object({
  attachments: v.array(attachmentProjectionValidator),
  canonicalTotalCents: v.number(),
  commentsHtml: v.optional(v.string()),
  lineItems: v.array(draftLineProjectionValidator),
  quotePackageRevision: v.number(),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  responses: v.array(answerProjectionValidator),
  revision: v.number(),
  sourceDraftVersion: v.number(),
  status: submissionLifecycleStatusValidator,
  submittedAt: v.number(),
  supersededByRevision: v.optional(v.number()),
  withdrawalExplanation: v.optional(v.string()),
  withdrawnAt: v.optional(v.number()),
});

// History reads deliberately carry only small lifecycle metadata. A recipient
// can request one immutable revision below when they need the full ledger;
// never hydrate every historical line, answer, and attachment into a single
// reactive query.
export const submissionSummaryValidator = v.object({
  canonicalTotalCents: v.number(),
  quotePackageRevision: v.number(),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  revision: v.number(),
  status: submissionLifecycleStatusValidator,
  submittedAt: v.number(),
  supersededByRevision: v.optional(v.number()),
  withdrawnAt: v.optional(v.number()),
});

export const lifecycleEligibilityValidator = v.object({
  canRevise: v.boolean(),
  canSubmit: v.boolean(),
  canWithdraw: v.boolean(),
  reason: v.optional(v.string()),
});

export const revisionAcknowledgementValidator = v.object({
  acknowledgedFieldKeys: v.array(v.string()),
  changedFieldKeys: v.array(v.string()),
  required: v.boolean(),
  status: v.union(v.literal("pending"), v.literal("acknowledged")),
});

export const lifecycleResultValidator = v.object({
  access: v.optional(quoteInvitationAccessProjectionValidator),
  currentSubmission: v.union(submissionProjectionValidator, v.null()),
  draft: v.union(draftProjectionValidator, v.null()),
  hasMoreRevisions: v.boolean(),
  eligibility: lifecycleEligibilityValidator,
  revisionAcknowledgement: revisionAcknowledgementValidator,
  revisionCount: v.number(),
  revisions: v.array(submissionSummaryValidator),
  status: v.union(
    v.literal("available"),
    v.literal("read_only"),
    v.literal("acknowledgement_required"),
    v.literal("superseded"),
    v.literal("unavailable")
  ),
});

export const submissionRevisionReadResultValidator = v.object({
  submission: v.union(submissionProjectionValidator, v.null()),
  status: v.union(
    v.literal("available"),
    v.literal("read_only"),
    v.literal("acknowledgement_required"),
    v.literal("superseded"),
    v.literal("unavailable")
  ),
});

export const submitResultValidator = v.object({
  draft: v.optional(draftProjectionValidator),
  idempotentReplay: v.optional(v.boolean()),
  status: v.union(
    v.literal("accepted"),
    v.literal("conflict"),
    v.literal("invalid"),
    v.literal("no_draft"),
    v.literal("read_only"),
    v.literal("acknowledgement_required"),
    v.literal("superseded"),
    v.literal("unavailable")
  ),
  submission: v.optional(submissionProjectionValidator),
  validationErrors: v.optional(v.array(v.string())),
});

export const startRevisionResultValidator = v.object({
  draft: v.optional(draftProjectionValidator),
  status: v.union(
    v.literal("draft_ready"),
    v.literal("conflict"),
    v.literal("no_submission"),
    v.literal("read_only"),
    v.literal("acknowledgement_required"),
    v.literal("superseded"),
    v.literal("unavailable")
  ),
  submission: v.optional(submissionProjectionValidator),
});

export const withdrawResultValidator = v.object({
  status: v.union(
    v.literal("withdrawn"),
    v.literal("confirmation_required"),
    v.literal("conflict"),
    v.literal("no_submission"),
    v.literal("read_only"),
    v.literal("superseded"),
    v.literal("unavailable")
  ),
  submission: v.optional(submissionProjectionValidator),
});

export type ReadAccess =
  | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserReadAccess>>
  | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedReadAccess>>;

export type WriteAccess =
  | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
  | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>;

export interface DraftRows {
  answers: Doc<"quoteInvitationResponseDraftAnswers">[];
  attachments: Doc<"quoteInvitationResponseDraftAttachments">[];
  lineItems: Doc<"quoteInvitationResponseDraftLineItems">[];
}

export interface SubmissionActor {
  isInternalQuoteActor?: boolean;
  kind: "browser_session" | "claimed_account";
  workosUserId?: string;
}

export interface MutationDeadlineClock {
  frozenWallTime: number;
  monotonicStart: number;
}

export function startMutationDeadlineClock(): MutationDeadlineClock {
  return {
    frozenWallTime: Date.now(),
    monotonicStart: performance.now(),
  };
}
