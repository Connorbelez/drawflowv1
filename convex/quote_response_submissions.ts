import { ConvexError, v } from "convex/values";
import {
  authenticatedMutation,
  authenticatedQuery,
  backofficeRoleSlugs,
} from "./authz";
import {
  normalizeOperationalIdempotencyKey,
  operationalRequestFingerprint,
} from "./build_operational_idempotency";
import { assertOrganizationRetentionWritable } from "./data_retention";
import { enqueueCommunicationIntent } from "./email_transport";
import { publicMutation, publicQuery } from "./fluent";
import {
  type InvitationScope,
  quoteInvitationAccessProjection,
  quoteInvitationAccessProjectionValidator,
  quoteInvitationPackageRevisionAcknowledgement,
  requireAcknowledgedPackageRevision,
  resolveQuoteInvitationBrowserReadAccess,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedReadAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "./quote_invitation_access";
import { clearPreferredForSubmission } from "./quote_preferred";
import { migratePriorRevisionDraftForAccess } from "./quote_response_drafts";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_DRAFT_LINE_ITEMS = 340;
const MAX_DRAFT_ANSWERS = 100;
const MAX_DRAFT_ATTACHMENTS = 25;
const MAX_SUBMISSION_REVISIONS = 100;
const MAX_SUBMISSION_EVENTS = MAX_SUBMISSION_REVISIONS * 3;
const MAX_LIFECYCLE_REVISION_SUMMARIES = 20;
const MAX_PACKAGE_REVISION_LINEAGE = 20;
const MAX_QUOTE_AMOUNT_CENTS = 100_000_000_000;
const MAX_RESPONSE_HTML_LENGTH = 40_000;
const MAX_RESPONSE_VALUE_LENGTH = 32_000;
const MAX_WITHDRAWAL_EXPLANATION_LENGTH = 4000;
const MAX_ATTACHMENT_FILE_NAME_LENGTH = 255;
const MAX_ATTACHMENT_MIME_TYPE_LENGTH = 160;
const MAX_PACKAGE_RESPONSE_FIELDS = 100;
const DATE_RESPONSE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DRAFT_LINE_KEY_PATTERN = /^[a-z]+:[A-Za-z0-9_-]{1,180}$/;
const UNSAFE_EMBEDDED_HTML_PATTERN = /<(?:script|iframe|object|embed|style)\b/i;
const UNSAFE_HTML_EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=/i;
const UNSAFE_HTML_PROTOCOL_PATTERN = /javascript\s*:/i;

type PackageRevisionLineageCache = Map<
  Id<"quotePackageRevisions">,
  Promise<void>
>;

const quoteLineSourceValidator = v.union(
  v.literal("package_labour"),
  v.literal("package_material"),
  v.literal("template_priced"),
  v.literal("expanded_scope")
);

const quoteLineScopeValidator = v.union(
  v.literal("labour"),
  v.literal("materials"),
  v.literal("whole_quote")
);

const submissionLifecycleStatusValidator = v.union(
  v.literal("active"),
  v.literal("superseded"),
  v.literal("withdrawn")
);

const draftLineProjectionValidator = v.object({
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

const answerProjectionValidator = v.object({
  sourcePackageRevisionResponseFieldId: v.id(
    "quotePackageRevisionResponseFields"
  ),
  value: v.string(),
});

const attachmentProjectionValidator = v.object({
  createdAt: v.number(),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  storageId: v.id("_storage"),
});

const draftProjectionValidator = v.object({
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

const submissionProjectionValidator = v.object({
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
const submissionSummaryValidator = v.object({
  canonicalTotalCents: v.number(),
  quotePackageRevision: v.number(),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  revision: v.number(),
  status: submissionLifecycleStatusValidator,
  submittedAt: v.number(),
  supersededByRevision: v.optional(v.number()),
  withdrawnAt: v.optional(v.number()),
});

const lifecycleEligibilityValidator = v.object({
  canRevise: v.boolean(),
  canSubmit: v.boolean(),
  canWithdraw: v.boolean(),
  reason: v.optional(v.string()),
});

const revisionAcknowledgementValidator = v.object({
  acknowledgedFieldKeys: v.array(v.string()),
  changedFieldKeys: v.array(v.string()),
  required: v.boolean(),
  status: v.union(v.literal("pending"), v.literal("acknowledged")),
});

const lifecycleResultValidator = v.object({
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

const submissionRevisionReadResultValidator = v.object({
  submission: v.union(submissionProjectionValidator, v.null()),
  status: v.union(
    v.literal("available"),
    v.literal("read_only"),
    v.literal("acknowledgement_required"),
    v.literal("superseded"),
    v.literal("unavailable")
  ),
});

const submitResultValidator = v.object({
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

const startRevisionResultValidator = v.object({
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

const withdrawResultValidator = v.object({
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

type ReadAccess =
  | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserReadAccess>>
  | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedReadAccess>>;

type WriteAccess =
  | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
  | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>;

interface SubmissionActor {
  isInternalQuoteActor?: boolean;
  kind: "browser_session" | "claimed_account";
  workosUserId?: string;
}

interface MutationDeadlineClock {
  frozenWallTime: number;
  monotonicStart: number;
}

function startMutationDeadlineClock(): MutationDeadlineClock {
  return {
    frozenWallTime: Date.now(),
    monotonicStart: performance.now(),
  };
}

/**
 * Browser-session lifecycle read. `presentationNow` only refreshes the
 * subscription at a UI boundary; server time remains the sole access clock.
 */
export const getQuoteInvitationResponseLifecycle = publicQuery
  .input({
    presentationNow: v.optional(v.number()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    sessionToken: v.string(),
  })
  .returns(lifecycleResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationBrowserReadAccess(ctx, args);
    return await lifecycleForAccess(ctx, access);
  })
  .public();

/** Claimed recipients access the same invitation-scoped lifecycle. */
export const getClaimedQuoteInvitationResponseLifecycle = authenticatedQuery
  .input({
    presentationNow: v.optional(v.number()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  })
  .returns(lifecycleResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationClaimedReadAccess(ctx, {
      ...args,
      workosUserId: ctx.viewer.subject,
    });
    return await lifecycleForAccess(ctx, access);
  })
  .public();

/**
 * Returns one recipient-owned immutable revision on demand. Lifecycle history
 * remains summary-only so a reactive read cannot hydrate unbounded ledger
 * content across every prior revision.
 */
export const getQuoteInvitationResponseSubmissionRevision = publicQuery
  .input({
    presentationNow: v.optional(v.number()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    revision: v.number(),
    sessionToken: v.string(),
  })
  .returns(submissionRevisionReadResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationBrowserReadAccess(ctx, args);
    return await submissionRevisionForAccess(ctx, access, args.revision);
  })
  .public();

export const getClaimedQuoteInvitationResponseSubmissionRevision =
  authenticatedQuery
    .input({
      presentationNow: v.optional(v.number()),
      quoteRoundInvitationId: v.id("quoteRoundInvitations"),
      revision: v.number(),
    })
    .returns(submissionRevisionReadResultValidator)
    .handler(async (ctx, args) => {
      const access = await resolveQuoteInvitationClaimedReadAccess(ctx, {
        presentationNow: args.presentationNow,
        quoteRoundInvitationId: args.quoteRoundInvitationId,
        workosUserId: ctx.viewer.subject,
      });
      return await submissionRevisionForAccess(ctx, access, args.revision);
    })
    .public();

/**
 * Atomically accepts a recipient's current Draft into an immutable Submission
 * Revision. The client deliberately supplies no total or receipt time.
 */
export const submitQuoteInvitationResponse = publicMutation
  .input({
    expectedDraftVersion: v.number(),
    idempotencyKey: v.string(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    sessionToken: v.string(),
  })
  .returns(submitResultValidator)
  .handler(async (ctx, args) => {
    const deadlineClock = startMutationDeadlineClock();
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await submitForAccess(
      ctx,
      access,
      args,
      { kind: "browser_session" },
      deadlineClock
    );
  })
  .public();

export const submitClaimedQuoteInvitationResponse = authenticatedMutation
  .input({
    expectedDraftVersion: v.number(),
    idempotencyKey: v.string(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  })
  .returns(submitResultValidator)
  .handler(async (ctx, args) => {
    const deadlineClock = startMutationDeadlineClock();
    const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
      quoteRoundInvitationId: args.quoteRoundInvitationId,
      workosUserId: ctx.viewer.subject,
    });
    return await submitForAccess(
      ctx,
      access,
      args,
      {
        kind: "claimed_account",
        workosUserId: ctx.viewer.subject,
      },
      deadlineClock
    );
  })
  .public();

/**
 * Seeds a new mutable Draft from the latest immutable Submission Revision.
 * The existing active submission remains authoritative until a later explicit
 * submit call succeeds.
 */
export const startQuoteInvitationResponseRevision = publicMutation
  .input({
    expectedSubmissionRevision: v.number(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    sessionToken: v.string(),
  })
  .returns(startRevisionResultValidator)
  .handler(async (ctx, args) => {
    const deadlineClock = startMutationDeadlineClock();
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await startRevisionForAccess(ctx, access, args, deadlineClock);
  })
  .public();

export const startClaimedQuoteInvitationResponseRevision = authenticatedMutation
  .input({
    expectedSubmissionRevision: v.number(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  })
  .returns(startRevisionResultValidator)
  .handler(async (ctx, args) => {
    const deadlineClock = startMutationDeadlineClock();
    const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
      quoteRoundInvitationId: args.quoteRoundInvitationId,
      workosUserId: ctx.viewer.subject,
    });
    return await startRevisionForAccess(ctx, access, args, deadlineClock);
  })
  .public();

/** Recipient-owned, confirmation-gated immutable withdrawal. */
export const withdrawQuoteInvitationResponse = publicMutation
  .input({
    confirmed: v.boolean(),
    expectedSubmissionRevision: v.number(),
    explanation: v.optional(v.string()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    sessionToken: v.string(),
  })
  .returns(withdrawResultValidator)
  .handler(async (ctx, args) => {
    const deadlineClock = startMutationDeadlineClock();
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await withdrawForAccess(
      ctx,
      access,
      args,
      { kind: "browser_session" },
      deadlineClock
    );
  })
  .public();

export const withdrawClaimedQuoteInvitationResponse = authenticatedMutation
  .input({
    confirmed: v.boolean(),
    expectedSubmissionRevision: v.number(),
    explanation: v.optional(v.string()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  })
  .returns(withdrawResultValidator)
  .handler(async (ctx, args) => {
    const deadlineClock = startMutationDeadlineClock();
    const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
      quoteRoundInvitationId: args.quoteRoundInvitationId,
      workosUserId: ctx.viewer.subject,
    });
    return await withdrawForAccess(
      ctx,
      access,
      args,
      {
        kind: "claimed_account",
        isInternalQuoteActor: hasInternalQuoteResponseRole(ctx.viewer.roles),
        workosUserId: ctx.viewer.subject,
      },
      deadlineClock
    );
  })
  .public();

async function lifecycleForAccess(ctx: QueryCtx, access: ReadAccess) {
  if (!hasScope(access) || access.status === "superseded") {
    return emptyLifecycle(access.status);
  }
  const scope = access.scope;
  const packageLineageCache: PackageRevisionLineageCache = new Map();
  await assertPackageRevisionDescendsFromInvitationRoot(
    ctx,
    scope,
    scope.packageRevision,
    packageLineageCache
  );
  const [draft, state, revisionHistory, acknowledgement] = await Promise.all([
    findDraft(ctx, scope),
    findSubmissionState(ctx, scope),
    listLifecycleSubmissionRevisions(ctx, scope),
    quoteInvitationPackageRevisionAcknowledgement(ctx, scope),
  ]);
  const revisions = revisionHistory.revisions;
  const byId = new Map(revisions.map((revision) => [revision._id, revision]));
  assertSubmissionStateScope(state, scope, byId);
  // A withdrawn response is no longer active for comparison, but it remains
  // the recipient's current commercial history and the seed for a permitted
  // resubmission. Keep it visible here instead of collapsing the lifecycle to
  // an indistinguishable empty state.
  const currentRevision = state
    ? byId.get(
        state.activeSubmissionRevisionId ?? state.latestSubmissionRevisionId
      )
    : undefined;
  const currentSubmission = currentRevision
    ? await submissionProjection(ctx, scope, currentRevision)
    : null;
  const summaries = await submissionSummaries(
    ctx,
    scope,
    revisions,
    packageLineageCache
  );
  const lifecycleStatus =
    access.status === "available" && !acknowledgement.acknowledged
      ? ("acknowledgement_required" as const)
      : access.status;
  const lifecycle = {
    access: await quoteInvitationAccessProjection(
      ctx,
      scope,
      "session" in access
        ? { sessionExpiresAt: access.session.sessionExpiresAt }
        : undefined
    ),
    currentSubmission,
    draft: draft ? await draftProjection(ctx, scope, draft) : null,
    eligibility: lifecycleEligibility(
      lifecycleStatus === "acknowledgement_required"
        ? "read_only"
        : lifecycleStatus,
      {
        hasDraft: Boolean(draft),
        hasLatestSubmission: Boolean(state),
        hasActiveSubmission: Boolean(state?.activeSubmissionRevisionId),
      }
    ),
    hasMoreRevisions: revisionHistory.hasMore,
    revisionAcknowledgement: {
      acknowledgedFieldKeys: acknowledgement.acknowledgedFieldKeys,
      changedFieldKeys: acknowledgement.changedFieldKeys,
      required: acknowledgement.required,
      status: acknowledgement.status,
    },
    revisionCount: revisionHistory.revisionCount,
    revisions: summaries,
    status: lifecycleStatus,
  } as const;
  return lifecycle;
}

async function submissionRevisionForAccess(
  ctx: QueryCtx,
  access: ReadAccess,
  revision: number
) {
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !hasScope(access) ||
    access.status === "superseded"
  ) {
    return { submission: null, status: access.status } as const;
  }
  const submission = await ctx.db
    .query("quoteInvitationResponseSubmissionRevisions")
    .withIndex("by_quoteRoundInvitationId_and_revision", (query) =>
      query
        .eq("quoteRoundInvitationId", access.scope.invitation._id)
        .eq("revision", revision)
    )
    .unique();
  if (!submission) {
    return { submission: null, status: access.status } as const;
  }
  const submissionScope = await historicalSubmissionScope(
    ctx,
    access.scope,
    submission
  );
  return {
    submission: await submissionProjection(ctx, submissionScope, submission),
    status: access.status,
  } as const;
}

async function submitForAccess(
  ctx: MutationCtx,
  access: WriteAccess,
  args: {
    expectedDraftVersion: number;
    idempotencyKey: string;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  },
  actor: SubmissionActor,
  deadlineClock: MutationDeadlineClock
) {
  const idempotencyKey = normalizeOperationalIdempotencyKey(
    args.idempotencyKey,
    "Quote response submission idempotency key"
  );
  assertExpectedDraftVersion(args.expectedDraftVersion);
  if (!hasScope(access)) {
    return { status: "unavailable" as const };
  }
  const scope = access.scope;
  const requestFingerprint = await operationalRequestFingerprint({
    expectedDraftVersion: args.expectedDraftVersion,
    quotePackageRevisionId: String(scope.packageRevision._id),
    quoteRoundInvitationId: String(scope.invitation._id),
  });
  const existingRequest = await ctx.db
    .query("quoteInvitationResponseSubmissionRequests")
    .withIndex("by_quoteRoundInvitationId_and_idempotencyKey", (query) =>
      query
        .eq("quoteRoundInvitationId", scope.invitation._id)
        .eq("idempotencyKey", idempotencyKey)
    )
    .unique();
  if (existingRequest) {
    const replay = await replaySubmissionRequest(
      ctx,
      scope,
      existingRequest,
      args.expectedDraftVersion,
      requestFingerprint
    );
    return { idempotentReplay: true, status: "accepted" as const, ...replay };
  }
  await assertOrganizationRetentionWritable(
    ctx,
    scope.invitation.organizationId
  );
  if (access.status !== "available") {
    return { status: access.status };
  }
  const acknowledgementRequired = await requireAcknowledgedPackageRevision(
    ctx,
    scope
  );
  if (acknowledgementRequired) {
    return acknowledgementRequired;
  }
  await migratePriorRevisionDraftForAccess(ctx, scope);
  const draft = await findDraft(ctx, scope);
  if (!draft) {
    return { status: "no_draft" as const };
  }
  if (draft.version !== args.expectedDraftVersion) {
    return {
      draft: await draftProjection(ctx, scope, draft),
      status: "conflict" as const,
    };
  }
  const rows = await draftRows(ctx, scope, draft);
  const validationErrors = await validateDraftForSubmission(
    ctx,
    scope,
    draft,
    rows
  );
  if (validationErrors.length > 0) {
    return {
      draft: await draftProjectionFromRows(draft, rows),
      status: "invalid" as const,
      validationErrors,
    };
  }
  return acceptValidatedDraftSubmission(ctx, scope, draft, rows, {
    actor,
    deadlineClock,
    expectedDraftVersion: args.expectedDraftVersion,
    idempotencyKey,
    requestFingerprint,
  });
}

interface ValidatedSubmissionRequest {
  actor: SubmissionActor;
  deadlineClock: MutationDeadlineClock;
  expectedDraftVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
}

async function loadPriorSubmissionRevisions(
  ctx: MutationCtx,
  scope: InvitationScope,
  state: Doc<"quoteInvitationResponseSubmissionStates"> | null
) {
  const priorLatest = state
    ? await ctx.db.get(state.latestSubmissionRevisionId)
    : null;
  if (state && !priorLatest) {
    throw new ConvexError("Quote response submission state is inconsistent.");
  }
  if (priorLatest) {
    assertSubmissionScope(priorLatest, scope);
  }
  const priorActive = state?.activeSubmissionRevisionId
    ? await ctx.db.get(state.activeSubmissionRevisionId)
    : null;
  if (state?.activeSubmissionRevisionId && !priorActive) {
    throw new ConvexError("Quote response current submission is inconsistent.");
  }
  if (priorActive) {
    assertSubmissionScope(priorActive, scope);
  }
  return { priorActive, priorLatest };
}

async function acceptValidatedDraftSubmission(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  rows: DraftRows,
  request: ValidatedSubmissionRequest
) {
  const canonicalTotalCents = canonicalTotal(rows.lineItems);
  const state = await findSubmissionState(ctx, scope);
  if (state) {
    assertSubmissionStateScope(state, scope);
  }
  const priorInvitationRevision = state
    ? null
    : await ctx.db
        .query("quoteInvitationResponseSubmissionRevisions")
        .withIndex("by_quoteRoundInvitationId_and_revision", (query) =>
          query.eq("quoteRoundInvitationId", scope.invitation._id)
        )
        .order("desc")
        .first();
  if (priorInvitationRevision) {
    assertSubmissionInvitationScope(priorInvitationRevision, scope);
  }
  const latestInvitationRevision =
    state?.latestRevision ?? priorInvitationRevision?.revision ?? 0;
  if (latestInvitationRevision >= MAX_SUBMISSION_REVISIONS) {
    return {
      draft: await draftProjectionFromRows(draft, rows),
      status: "invalid" as const,
      validationErrors: [
        "Quote response revision history has reached its safe limit.",
      ],
    };
  }
  const { priorActive, priorLatest } = await loadPriorSubmissionRevisions(
    ctx,
    scope,
    state
  );
  const finalWriteAccess = await finalWriteAccessStatus(
    ctx,
    scope,
    request.deadlineClock
  );
  if (finalWriteAccess.status !== "available") {
    return { status: finalWriteAccess.status };
  }
  // `checkedAt` is both the hard deadline check and the accepted receipt time.
  // It combines Convex's mutation-frozen wall clock with the mutation's
  // advancing monotonic clock, so validation cannot cross the deadline while
  // still receiving a pre-deadline receipt.
  const now = finalWriteAccess.checkedAt;
  if (priorActive) {
    await clearPreferredForSubmission(ctx, priorActive, {
      actor: {
        actorRoles: ["quote-recipient"],
        actorWorkosUserId:
          request.actor.workosUserId ?? `quote-recipient:${scope.profile._id}`,
      },
      command: "submitQuoteInvitationResponse",
      reason:
        "Quote response resubmission superseded the previously Preferred Quote.",
    });
  }
  const revision = latestInvitationRevision + 1;
  const submissionRevisionId = await ctx.db.insert(
    "quoteInvitationResponseSubmissionRevisions",
    {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      canonicalTotalCents,
      commentsHtml: draft.commentsHtml,
      createdAt: now,
      organizationId: scope.invitation.organizationId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      revision,
      sourceDraftVersion: draft.version,
      submittedAt: now,
      submittedByKind: request.actor.kind,
      submittedByWorkosUserId: request.actor.workosUserId,
    }
  );
  await copyDraftRowsToSubmission(ctx, scope, rows, submissionRevisionId, now);
  await ctx.db.insert("quoteInvitationResponseSubmissionLifecycleEvents", {
    actorKind: request.actor.kind,
    actorWorkosUserId: request.actor.workosUserId,
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    createdAt: now,
    eventType: "submitted",
    organizationId: scope.invitation.organizationId,
    quoteInvitationResponseSubmissionRevisionId: submissionRevisionId,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
  });
  if (priorActive) {
    await ctx.db.insert("quoteInvitationResponseSubmissionLifecycleEvents", {
      actorKind: request.actor.kind,
      actorWorkosUserId: request.actor.workosUserId,
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: now,
      eventType: "superseded",
      organizationId: scope.invitation.organizationId,
      quoteInvitationResponseSubmissionRevisionId: priorActive._id,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      replacementSubmissionRevisionId: submissionRevisionId,
    });
  }
  if (state) {
    await ctx.db.patch(state._id, {
      activeSubmissionRevisionId: submissionRevisionId,
      latestRevision: revision,
      latestSubmissionRevisionId: submissionRevisionId,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("quoteInvitationResponseSubmissionStates", {
      activeSubmissionRevisionId: submissionRevisionId,
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: now,
      latestRevision: revision,
      latestSubmissionRevisionId: submissionRevisionId,
      organizationId: scope.invitation.organizationId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      updatedAt: now,
    });
  }
  await ctx.db.insert("quoteInvitationResponseSubmissionRequests", {
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    createdAt: now,
    expectedDraftVersion: request.expectedDraftVersion,
    idempotencyKey: request.idempotencyKey,
    organizationId: scope.invitation.organizationId,
    quoteInvitationResponseSubmissionRevisionId: submissionRevisionId,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    requestFingerprint: request.requestFingerprint,
  });
  await clearSubmittedDraft(ctx, draft, rows);
  await appendSubmissionAuditEvent(ctx, scope, request.actor, {
    command: "submitQuoteInvitationResponse",
    eventType: "quote_response.submitted",
    newState: { canonicalTotalCents, revision, status: "active" },
    priorState: priorLatest
      ? {
          canonicalTotalCents: priorLatest.canonicalTotalCents,
          revision: priorLatest.revision,
          status: priorActive ? "active" : "withdrawn",
        }
      : { status: "none" },
    submissionRevisionId,
    now,
  });
  await enqueueCommunicationIntent(ctx, {
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    idempotencyKey: `quote-response:${scope.invitation._id}:revision:${revision}:submitted`,
    kind: priorLatest
      ? "quote_response_resubmitted"
      : "quote_response_submitted",
    organizationId: scope.invitation.organizationId,
    payloadSnapshot: JSON.stringify({
      canonicalTotalCents,
      event: priorLatest ? "resubmitted" : "submitted",
      revision,
    }),
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    recipientEmailSnapshot: scope.invitation.recipientEmailSnapshot,
    recipientNameSnapshot: scope.invitation.recipientNameSnapshot,
    relatedEntityId: String(submissionRevisionId),
    relatedEntityType: "quoteResponseSubmissionRevision",
    templateKey: "quote_response",
  });
  const submission = await ctx.db.get(submissionRevisionId);
  if (!submission) {
    throw new ConvexError(
      "Quote response submission disappeared while accepting."
    );
  }
  return {
    idempotentReplay: false,
    status: "accepted" as const,
    submission: await submissionProjection(ctx, scope, submission),
  };
}

async function startRevisionForAccess(
  ctx: MutationCtx,
  access: WriteAccess,
  args: {
    expectedSubmissionRevision: number;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  },
  deadlineClock: MutationDeadlineClock
) {
  assertExpectedSubmissionRevision(args.expectedSubmissionRevision);
  if (!hasScope(access)) {
    return { status: "unavailable" as const };
  }
  if (access.status !== "available") {
    return { status: access.status };
  }
  const scope = access.scope;
  await assertOrganizationRetentionWritable(
    ctx,
    scope.invitation.organizationId
  );
  const acknowledgementRequired = await requireAcknowledgedPackageRevision(
    ctx,
    scope
  );
  if (acknowledgementRequired) {
    return acknowledgementRequired;
  }
  await migratePriorRevisionDraftForAccess(ctx, scope);
  const state = await findSubmissionState(ctx, scope);
  if (!state) {
    return { status: "no_submission" as const };
  }
  assertSubmissionStateScope(state, scope);
  const source = await ctx.db.get(state.latestSubmissionRevisionId);
  if (!source) {
    throw new ConvexError("Quote response submission state is inconsistent.");
  }
  assertSubmissionScope(source, scope);
  if (source.revision !== args.expectedSubmissionRevision) {
    return {
      status: "conflict" as const,
      submission: await submissionProjection(ctx, scope, source),
    };
  }
  const existing = await findDraft(ctx, scope);
  const finalWriteAccess = await finalWriteAccessStatus(
    ctx,
    scope,
    deadlineClock
  );
  if (finalWriteAccess.status !== "available") {
    return { status: finalWriteAccess.status };
  }
  if (existing) {
    return {
      draft: await draftProjection(ctx, scope, existing),
      status: "draft_ready" as const,
    };
  }
  const draft = await seedDraftFromSubmission(
    ctx,
    scope,
    source,
    finalWriteAccess.checkedAt
  );
  return {
    draft: await draftProjection(ctx, scope, draft),
    status: "draft_ready" as const,
  };
}

async function withdrawForAccess(
  ctx: MutationCtx,
  access: WriteAccess,
  args: {
    confirmed: boolean;
    expectedSubmissionRevision: number;
    explanation?: string;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  },
  actor: SubmissionActor,
  deadlineClock: MutationDeadlineClock
) {
  assertExpectedSubmissionRevision(args.expectedSubmissionRevision);
  if (actor.isInternalQuoteActor) {
    return { status: "unavailable" as const };
  }
  if (!hasScope(access)) {
    return { status: "unavailable" as const };
  }
  await assertOrganizationRetentionWritable(
    ctx,
    access.scope.invitation.organizationId
  );
  if (access.status !== "available") {
    return { status: access.status };
  }
  if (!args.confirmed) {
    return { status: "confirmation_required" as const };
  }
  const explanation = normalizeWithdrawalExplanation(args.explanation);
  const scope = access.scope;
  const state = await findSubmissionState(ctx, scope);
  if (!state) {
    return { status: "no_submission" as const };
  }
  assertSubmissionStateScope(state, scope);
  const latest = await ctx.db.get(state.latestSubmissionRevisionId);
  if (!latest) {
    throw new ConvexError("Quote response submission state is inconsistent.");
  }
  assertSubmissionScope(latest, scope);
  if (latest.revision !== args.expectedSubmissionRevision) {
    return {
      status: "conflict" as const,
      submission: await submissionProjection(ctx, scope, latest),
    };
  }
  if (!state.activeSubmissionRevisionId) {
    return {
      status: "withdrawn" as const,
      submission: await submissionProjection(ctx, scope, latest),
    };
  }
  const active = await ctx.db.get(state.activeSubmissionRevisionId);
  if (!active) {
    throw new ConvexError("Quote response current submission is inconsistent.");
  }
  assertSubmissionScope(active, scope);
  const finalWriteAccess = await finalWriteAccessStatus(
    ctx,
    scope,
    deadlineClock
  );
  if (finalWriteAccess.status !== "available") {
    return { status: finalWriteAccess.status };
  }
  if (active._id !== latest._id) {
    throw new ConvexError(
      "Quote response current submission is not the latest revision."
    );
  }
  const now = finalWriteAccess.checkedAt;
  await clearPreferredForSubmission(ctx, active, {
    actor: {
      actorRoles: ["quote-recipient"],
      actorWorkosUserId:
        actor.workosUserId ?? `quote-recipient:${scope.profile._id}`,
    },
    command: "withdrawQuoteInvitationResponse",
    reason:
      explanation ?? "Quote response withdrawal cleared the Preferred Quote.",
  });
  await ctx.db.insert("quoteInvitationResponseSubmissionLifecycleEvents", {
    actorKind: actor.kind,
    actorWorkosUserId: actor.workosUserId,
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    createdAt: now,
    eventType: "withdrawn",
    organizationId: scope.invitation.organizationId,
    quoteInvitationResponseSubmissionRevisionId: active._id,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    withdrawalExplanation: explanation,
  });
  await ctx.db.patch(state._id, {
    activeSubmissionRevisionId: undefined,
    updatedAt: now,
  });
  await appendSubmissionAuditEvent(ctx, scope, actor, {
    command: "withdrawQuoteInvitationResponse",
    eventType: "quote_response.withdrawn",
    newState: { revision: active.revision, status: "withdrawn" },
    priorState: {
      canonicalTotalCents: active.canonicalTotalCents,
      revision: active.revision,
      status: "active",
    },
    reason: explanation,
    submissionRevisionId: active._id,
    now,
  });
  await enqueueCommunicationIntent(ctx, {
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    idempotencyKey: `quote-response:${scope.invitation._id}:revision:${active.revision}:withdrawn`,
    kind: "quote_response_withdrawn",
    organizationId: scope.invitation.organizationId,
    payloadSnapshot: JSON.stringify({
      event: "withdrawn",
      explanation,
      revision: active.revision,
    }),
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    recipientEmailSnapshot: scope.invitation.recipientEmailSnapshot,
    recipientNameSnapshot: scope.invitation.recipientNameSnapshot,
    relatedEntityId: String(active._id),
    relatedEntityType: "quoteResponseSubmissionRevision",
    templateKey: "quote_response",
  });
  return {
    status: "withdrawn" as const,
    submission: await submissionProjection(ctx, scope, active),
  };
}

function hasScope(
  access: ReadAccess | WriteAccess
): access is (ReadAccess | WriteAccess) & { scope: InvitationScope } {
  return "scope" in access;
}

function hasInternalQuoteResponseRole(roles: readonly string[]) {
  return roles.some(
    (role) =>
      backofficeRoleSlugs.includes(
        role as (typeof backofficeRoleSlugs)[number]
      ) ||
      role === "builder" ||
      role === "builder-staff"
  );
}

function emptyLifecycle(
  status: "superseded" | "unavailable" | "available" | "read_only"
) {
  return {
    currentSubmission: null,
    draft: null,
    eligibility: lifecycleEligibility(status, {
      hasActiveSubmission: false,
      hasDraft: false,
      hasLatestSubmission: false,
    }),
    hasMoreRevisions: false,
    revisionAcknowledgement: {
      acknowledgedFieldKeys: [],
      changedFieldKeys: [],
      required: false,
      status: "acknowledged" as const,
    },
    revisionCount: 0,
    revisions: [],
    status,
  };
}

function lifecycleEligibility(
  status: "available" | "read_only" | "superseded" | "unavailable",
  input: {
    hasActiveSubmission: boolean;
    hasDraft: boolean;
    hasLatestSubmission: boolean;
  }
) {
  if (status !== "available") {
    return {
      canRevise: false,
      canSubmit: false,
      canWithdraw: false,
      reason:
        status === "read_only"
          ? "The Quote Round is closed or its response deadline has passed."
          : status === "superseded"
            ? "This Quote Package Revision has been superseded."
            : "This Quote Invitation is unavailable.",
    };
  }
  if (input.hasDraft) {
    return {
      canRevise: false,
      canSubmit: true,
      canWithdraw: input.hasActiveSubmission,
    };
  }
  if (input.hasLatestSubmission) {
    return {
      canRevise: true,
      canSubmit: false,
      canWithdraw: input.hasActiveSubmission,
      reason: input.hasActiveSubmission
        ? "Start a revision before replacing the submitted response."
        : "Start a revision before submitting again.",
    };
  }
  return {
    canRevise: false,
    canSubmit: false,
    canWithdraw: false,
    reason: "Add a Field Ledger response before submitting.",
  };
}

async function findDraft(ctx: QueryCtx | MutationCtx, scope: InvitationScope) {
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

async function findSubmissionState(
  ctx: QueryCtx | MutationCtx,
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
  if (state) {
    assertSubmissionStateScope(state, scope);
  }
  return state;
}

// Resolve access once at command entry, then check it again immediately before
// a lifecycle write. This closes the small but real interval where a long
// validation transaction could cross the hard server deadline.
async function finalWriteAccessStatus(
  ctx: MutationCtx,
  scope: InvitationScope,
  deadlineClock: MutationDeadlineClock
) {
  const [round, packageRevision] = await Promise.all([
    ctx.db.get(scope.round._id),
    ctx.db.get(scope.packageRevision._id),
  ]);
  // Convex freezes Date.now() for a mutation, but performance.now() advances.
  // Anchor the advancing clock to the mutation-start wall time and round up so
  // a fractional millisecond at the deadline is rejected conservatively.
  const checkedAt =
    deadlineClock.frozenWallTime +
    Math.ceil(Math.max(0, performance.now() - deadlineClock.monotonicStart));
  if (
    !(round && packageRevision) ||
    round.brokerageId !== scope.invitation.brokerageId ||
    round.organizationId !== scope.invitation.organizationId ||
    round.buildId !== scope.invitation.buildId ||
    packageRevision.brokerageId !== scope.invitation.brokerageId ||
    packageRevision.organizationId !== scope.invitation.organizationId ||
    packageRevision.buildId !== scope.invitation.buildId ||
    packageRevision.quoteRoundId !== scope.invitation.quoteRoundId
  ) {
    return { checkedAt, status: "unavailable" as const };
  }
  if (round.currentPackageRevisionId !== packageRevision._id) {
    return { checkedAt, status: "superseded" as const };
  }
  if (round.state !== "open" || checkedAt >= packageRevision.responseDeadline) {
    return { checkedAt, status: "read_only" as const };
  }
  return { checkedAt, status: "available" as const };
}

async function listLifecycleSubmissionRevisions(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope
) {
  const newestFirst = await ctx.db
    .query("quoteInvitationResponseSubmissionRevisions")
    .withIndex("by_quoteRoundInvitationId_and_revision", (query) =>
      query.eq("quoteRoundInvitationId", scope.invitation._id)
    )
    .order("desc")
    .take(MAX_LIFECYCLE_REVISION_SUMMARIES + 1);
  const hasMore = newestFirst.length > MAX_LIFECYCLE_REVISION_SUMMARIES;
  const revisions = newestFirst
    .slice(0, MAX_LIFECYCLE_REVISION_SUMMARIES)
    .reverse();
  for (const revision of revisions) {
    assertSubmissionInvitationScope(revision, scope);
  }
  return {
    hasMore,
    revisionCount: revisions.length,
    revisions,
  };
}

async function submissionSummaries(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  revisions: Doc<"quoteInvitationResponseSubmissionRevisions">[],
  packageLineageCache: PackageRevisionLineageCache
) {
  if (revisions.length === 0) {
    return [];
  }
  const byId = new Map(revisions.map((revision) => [revision._id, revision]));
  const packageRevisions = await Promise.all(
    [
      ...new Set(revisions.map((revision) => revision.quotePackageRevisionId)),
    ].map((id) => ctx.db.get(id))
  );
  const packageRevisionById = new Map(
    packageRevisions.map((revision) => {
      if (!revision) {
        throw new ConvexError(
          "Historical Quote Package Revision is unavailable."
        );
      }
      return [revision._id, revision] as const;
    })
  );
  await Promise.all(
    packageRevisions.map((revision) => {
      if (!revision) {
        throw new ConvexError(
          "Historical Quote Package Revision is unavailable."
        );
      }
      return assertPackageRevisionDescendsFromInvitationRoot(
        ctx,
        scope,
        revision,
        packageLineageCache
      );
    })
  );
  const events = await ctx.db
    .query("quoteInvitationResponseSubmissionLifecycleEvents")
    .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
      query.eq("quoteRoundInvitationId", scope.invitation._id)
    )
    .order("asc")
    .take(MAX_SUBMISSION_EVENTS + 1);
  if (events.length > MAX_SUBMISSION_EVENTS) {
    throw new ConvexError(
      "Quote response lifecycle history exceeds its safe limit."
    );
  }
  const eventsBySubmissionId = new Map<
    Id<"quoteInvitationResponseSubmissionRevisions">,
    Doc<"quoteInvitationResponseSubmissionLifecycleEvents">[]
  >();
  for (const event of events) {
    const submission = byId.get(
      event.quoteInvitationResponseSubmissionRevisionId
    );
    if (!submission) {
      // Older events are intentionally not hydrated on this lifecycle page.
      continue;
    }
    assertSubmissionLifecycleEventScope(event, scope, submission);
    const grouped = eventsBySubmissionId.get(submission._id) ?? [];
    grouped.push(event);
    eventsBySubmissionId.set(submission._id, grouped);
  }
  return revisions.map((revision) => {
    const packageRevision = packageRevisionById.get(
      revision.quotePackageRevisionId
    );
    if (!packageRevision) {
      throw new ConvexError(
        "Historical Quote Package Revision is unavailable."
      );
    }
    return submissionSummary(
      revision,
      packageRevision.revision,
      eventsBySubmissionId.get(revision._id) ?? [],
      byId
    );
  });
}

async function replaySubmissionRequest(
  ctx: MutationCtx,
  scope: InvitationScope,
  request: Doc<"quoteInvitationResponseSubmissionRequests">,
  expectedDraftVersion: number,
  requestFingerprint: string
) {
  if (
    request.brokerageId !== scope.invitation.brokerageId ||
    request.organizationId !== scope.invitation.organizationId ||
    request.buildId !== scope.invitation.buildId ||
    request.quoteRoundId !== scope.invitation.quoteRoundId ||
    request.quoteRoundInvitationId !== scope.invitation._id ||
    request.quotePackageRevisionId !== scope.packageRevision._id ||
    request.expectedDraftVersion !== expectedDraftVersion ||
    request.requestFingerprint !== requestFingerprint
  ) {
    throw new ConvexError(
      "Quote response submission idempotency key was reused with a different request."
    );
  }
  const submission = await ctx.db.get(
    request.quoteInvitationResponseSubmissionRevisionId
  );
  if (!submission) {
    throw new ConvexError("Quote response submission receipt is inconsistent.");
  }
  assertSubmissionScope(submission, scope);
  return { submission: await submissionProjection(ctx, scope, submission) };
}

interface DraftRows {
  answers: Doc<"quoteInvitationResponseDraftAnswers">[];
  attachments: Doc<"quoteInvitationResponseDraftAttachments">[];
  lineItems: Doc<"quoteInvitationResponseDraftLineItems">[];
}

async function draftRows(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
): Promise<DraftRows> {
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
  for (const row of [...lineItems, ...answers, ...attachments]) {
    assertDraftRowScope(row, scope, draft);
  }
  return { answers, attachments, lineItems };
}

async function draftProjection(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  return await draftProjectionFromRows(
    draft,
    await draftRows(ctx, scope, draft)
  );
}

function draftProjectionFromRows(
  draft: Doc<"quoteInvitationResponseDrafts">,
  rows: DraftRows
) {
  return {
    answeredFieldCount: draft.answeredFieldCount,
    attachmentCount: draft.attachmentCount,
    attachments: rows.attachments.map((attachment) => ({
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
    lineItems: rows.lineItems.map((line) => lineProjection(line)),
    responses: rows.answers.map((answer) => ({
      sourcePackageRevisionResponseFieldId:
        answer.sourcePackageRevisionResponseFieldId,
      value: answer.value,
    })),
    updatedAt: draft.updatedAt,
    version: draft.version,
  };
}

function submissionSummary(
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">,
  quotePackageRevision: number,
  events: Doc<"quoteInvitationResponseSubmissionLifecycleEvents">[],
  revisionsById: Map<
    Id<"quoteInvitationResponseSubmissionRevisions">,
    Doc<"quoteInvitationResponseSubmissionRevisions">
  >
) {
  const lifecycle = submissionLifecycleMetadata(events, (replacementId) => {
    const replacement = revisionsById.get(replacementId);
    if (!replacement) {
      throw new ConvexError(
        "Quote response supersession points outside the visible revision window."
      );
    }
    return replacement.revision;
  });
  return {
    canonicalTotalCents: submission.canonicalTotalCents,
    quotePackageRevision,
    quotePackageRevisionId: submission.quotePackageRevisionId,
    revision: submission.revision,
    ...lifecycle,
    submittedAt: submission.submittedAt,
  };
}

function submissionLifecycleMetadata(
  events: Doc<"quoteInvitationResponseSubmissionLifecycleEvents">[],
  replacementRevision: (
    replacementId: Id<"quoteInvitationResponseSubmissionRevisions">
  ) => number
) {
  if (events.length === 0 || events.length > 3) {
    throw new ConvexError(
      "Quote response submission lifecycle is inconsistent."
    );
  }
  if (!events.some((event) => event.eventType === "submitted")) {
    throw new ConvexError(
      "Quote response submission lifecycle is missing its submitted event."
    );
  }
  const withdrawal = events.find((event) => event.eventType === "withdrawn");
  const supersession = events.find((event) => event.eventType === "superseded");
  if (withdrawal && supersession) {
    throw new ConvexError(
      "Quote response submission cannot be both withdrawn and superseded."
    );
  }
  const supersededByRevision = supersession?.replacementSubmissionRevisionId
    ? replacementRevision(supersession.replacementSubmissionRevisionId)
    : undefined;
  if (supersession && supersededByRevision === undefined) {
    throw new ConvexError(
      "Quote response supersession is missing its replacement."
    );
  }
  return {
    status: withdrawal
      ? ("withdrawn" as const)
      : supersession
        ? ("superseded" as const)
        : ("active" as const),
    supersededByRevision,
    withdrawnAt: withdrawal?.createdAt,
  };
}

async function submissionProjection(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">
) {
  assertSubmissionScope(submission, scope);
  const [lineItems, answers, attachments, events] = await Promise.all([
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
    ctx.db
      .query("quoteInvitationResponseSubmissionLifecycleEvents")
      .withIndex(
        "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
        (query) =>
          query.eq(
            "quoteInvitationResponseSubmissionRevisionId",
            submission._id
          )
      )
      .order("asc")
      .take(4),
  ]);
  assertDraftCollectionBounds({ attachments, answers, lineItems });
  for (const row of [...lineItems, ...answers, ...attachments]) {
    assertSubmissionRowScope(row, scope, submission);
  }
  for (const event of events) {
    assertSubmissionLifecycleEventScope(event, scope, submission);
  }
  const supersession = events.find((event) => event.eventType === "superseded");
  const replacement = supersession?.replacementSubmissionRevisionId
    ? await ctx.db.get(supersession.replacementSubmissionRevisionId)
    : null;
  if (replacement) {
    assertSubmissionScope(replacement, scope);
  }
  const lifecycle = submissionLifecycleMetadata(events, (replacementId) => {
    if (!replacement || replacement._id !== replacementId) {
      throw new ConvexError("Quote response supersession is inconsistent.");
    }
    return replacement.revision;
  });
  return {
    attachments: attachments.map((attachment) => ({
      createdAt: attachment.createdAt,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sourcePackageRevisionResponseFieldId:
        attachment.sourcePackageRevisionResponseFieldId,
      storageId: attachment.storageId,
    })),
    canonicalTotalCents: submission.canonicalTotalCents,
    commentsHtml: submission.commentsHtml,
    lineItems: lineItems.map((line) => lineProjection(line)),
    quotePackageRevision: scope.packageRevision.revision,
    quotePackageRevisionId: submission.quotePackageRevisionId,
    responses: answers.map((answer) => ({
      sourcePackageRevisionResponseFieldId:
        answer.sourcePackageRevisionResponseFieldId,
      value: answer.value,
    })),
    revision: submission.revision,
    sourceDraftVersion: submission.sourceDraftVersion,
    ...lifecycle,
    submittedAt: submission.submittedAt,
    withdrawalExplanation: events.find(
      (event) => event.eventType === "withdrawn"
    )?.withdrawalExplanation,
  };
}

function lineProjection(
  line:
    | Doc<"quoteInvitationResponseDraftLineItems">
    | Doc<"quoteInvitationResponseSubmissionLineItems">
) {
  return {
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
  };
}

async function copyDraftRowsToSubmission(
  ctx: MutationCtx,
  scope: InvitationScope,
  rows: DraftRows,
  submissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">,
  now: number
) {
  for (const line of rows.lineItems) {
    await ctx.db.insert("quoteInvitationResponseSubmissionLineItems", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: now,
      lineKey: line.lineKey,
      organizationId: scope.invitation.organizationId,
      quotedAmountCents: line.quotedAmountCents,
      quoteInvitationResponseSubmissionRevisionId: submissionRevisionId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      scope: line.scope,
      source: line.source,
      sourcePackageRevisionLabourLineId: line.sourcePackageRevisionLabourLineId,
      sourcePackageRevisionMaterialLineId:
        line.sourcePackageRevisionMaterialLineId,
      sourcePackageRevisionResponseFieldId:
        line.sourcePackageRevisionResponseFieldId,
      title: line.title,
    });
  }
  for (const answer of rows.answers) {
    await ctx.db.insert("quoteInvitationResponseSubmissionAnswers", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: now,
      fieldKey: answer.fieldKey,
      organizationId: scope.invitation.organizationId,
      quoteInvitationResponseSubmissionRevisionId: submissionRevisionId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      scope: answer.scope,
      sourcePackageRevisionResponseFieldId:
        answer.sourcePackageRevisionResponseFieldId,
      value: answer.value,
    });
  }
  for (const attachment of rows.attachments) {
    await ctx.db.insert("quoteInvitationResponseSubmissionAttachments", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: now,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      organizationId: scope.invitation.organizationId,
      quoteInvitationResponseSubmissionRevisionId: submissionRevisionId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      sizeBytes: attachment.sizeBytes,
      sourcePackageRevisionResponseFieldId:
        attachment.sourcePackageRevisionResponseFieldId,
      storageId: attachment.storageId,
    });
  }
}

async function clearSubmittedDraft(
  ctx: MutationCtx,
  draft: Doc<"quoteInvitationResponseDrafts">,
  rows: DraftRows
) {
  for (const row of [...rows.lineItems, ...rows.answers, ...rows.attachments]) {
    await ctx.db.delete(row._id);
  }
  await ctx.db.delete(draft._id);
}

async function seedDraftFromSubmission(
  ctx: MutationCtx,
  scope: InvitationScope,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">,
  now: number
) {
  const rows = await submissionRows(ctx, scope, submission);
  const draftId = await ctx.db.insert("quoteInvitationResponseDrafts", {
    answeredFieldCount: rows.answers.length,
    attachmentCount: rows.attachments.length,
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    commentsHtml: submission.commentsHtml,
    completedPricingLineCount: rows.lineItems.filter(
      (line) => line.quotedAmountCents !== undefined
    ).length,
    createdAt: now,
    organizationId: scope.invitation.organizationId,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    updatedAt: now,
    version: 1,
  });
  for (const line of rows.lineItems) {
    await ctx.db.insert("quoteInvitationResponseDraftLineItems", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: now,
      lineKey: line.lineKey,
      organizationId: scope.invitation.organizationId,
      quotedAmountCents: line.quotedAmountCents,
      quoteInvitationResponseDraftId: draftId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      scope: line.scope,
      source: line.source,
      sourcePackageRevisionLabourLineId: line.sourcePackageRevisionLabourLineId,
      sourcePackageRevisionMaterialLineId:
        line.sourcePackageRevisionMaterialLineId,
      sourcePackageRevisionResponseFieldId:
        line.sourcePackageRevisionResponseFieldId,
      title: line.title,
      updatedAt: now,
    });
  }
  for (const answer of rows.answers) {
    await ctx.db.insert("quoteInvitationResponseDraftAnswers", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: now,
      fieldKey: answer.fieldKey,
      organizationId: scope.invitation.organizationId,
      quoteInvitationResponseDraftId: draftId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      scope: answer.scope,
      sourcePackageRevisionResponseFieldId:
        answer.sourcePackageRevisionResponseFieldId,
      updatedAt: now,
      value: answer.value,
    });
  }
  for (const attachment of rows.attachments) {
    await ctx.db.insert("quoteInvitationResponseDraftAttachments", {
      brokerageId: scope.invitation.brokerageId,
      buildId: scope.invitation.buildId,
      createdAt: now,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      organizationId: scope.invitation.organizationId,
      quoteInvitationResponseDraftId: draftId,
      quotePackageRevisionId: scope.packageRevision._id,
      quoteRoundId: scope.invitation.quoteRoundId,
      quoteRoundInvitationId: scope.invitation._id,
      sizeBytes: attachment.sizeBytes,
      sourcePackageRevisionResponseFieldId:
        attachment.sourcePackageRevisionResponseFieldId,
      storageId: attachment.storageId,
    });
  }
  const draft = await ctx.db.get(draftId);
  if (!draft) {
    throw new ConvexError("Revision Field Ledger draft was not created.");
  }
  return draft;
}

interface SubmissionRows {
  answers: Doc<"quoteInvitationResponseSubmissionAnswers">[];
  attachments: Doc<"quoteInvitationResponseSubmissionAttachments">[];
  lineItems: Doc<"quoteInvitationResponseSubmissionLineItems">[];
}

async function submissionRows(
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

async function validateDraftForSubmission(
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

function requiredFieldError(
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

function validateDraftLine(
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

async function validatePackageLabourLine(
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

async function validatePackageMaterialLine(
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

function validateTemplatePricedLine(
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

function validateExpandedScopeLine(
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

function validateDraftAnswer(
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

async function validateDraftAttachment(
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

function validateCommentsHtml(value: string) {
  if (value.length > MAX_RESPONSE_HTML_LENGTH || containsUnsafeHtml(value)) {
    return "Additional Comments contain unsupported rich-text content.";
  }
  return null;
}

function validateConfiguredAnswerValue(
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

function hasMeaningfulAnswerValue(
  field: Doc<"quotePackageRevisionResponseFields">,
  value: string
) {
  if (field.renderer !== "tiptap") {
    return Boolean(value.trim());
  }
  return hasMeaningfulHtml(value);
}

function canonicalTotal(lineItems: readonly { quotedAmountCents?: number }[]) {
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

function validateQuotedAmount(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_QUOTE_AMOUNT_CENTS
  ) {
    return "Quoted amount must be a non-negative whole-cent value.";
  }
  return null;
}

function containsUnsafeHtml(value: string) {
  return (
    UNSAFE_EMBEDDED_HTML_PATTERN.test(value) ||
    UNSAFE_HTML_EVENT_HANDLER_PATTERN.test(value) ||
    UNSAFE_HTML_PROTOCOL_PATTERN.test(value)
  );
}

function hasMeaningfulHtml(value: string) {
  return (
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .trim().length > 0
  );
}

function normalizeWithdrawalExplanation(value: string | undefined) {
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

function assertExpectedDraftVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConvexError("Field Ledger draft version is invalid.");
  }
}

function assertExpectedSubmissionRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConvexError("Quote response submission revision is invalid.");
  }
}

function matchesPackageScope(
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

function assertPackageResponseFieldScope(
  field: Doc<"quotePackageRevisionResponseFields">,
  scope: InvitationScope
) {
  if (!matchesPackageScope(field, scope)) {
    throw new ConvexError(
      "Quote response field crosses its Quote Package scope."
    );
  }
}

function assertDraftScope(
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

function assertDraftRowScope(
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

function assertDraftCollectionBounds(rows: {
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

function assertSubmissionScope(
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

function assertSubmissionInvitationScope(
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

function assertPackageRevisionInvitationScope(
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

function assertPackageRevisionDescendsFromInvitationRoot(
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

async function historicalSubmissionScope(
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

function assertSubmissionStateScope(
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

function assertSubmissionRowScope(
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

function assertSubmissionLifecycleEventScope(
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

async function appendSubmissionAuditEvent(
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
