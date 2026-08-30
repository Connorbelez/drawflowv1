import { ConvexError } from "convex/values";
import {
  MAX_SUBMISSION_REVISIONS,
  type DraftRows,
  type MutationDeadlineClock,
  type SubmissionActor,
  type WriteAccess,
} from "./core";
import {
  appendSubmissionAuditEvent,
  assertExpectedDraftVersion,
  assertExpectedSubmissionRevision,
  assertSubmissionInvitationScope,
  assertSubmissionScope,
  assertSubmissionStateScope,
  normalizeWithdrawalExplanation,
  canonicalTotal,
  validateDraftForSubmission,
} from "./validation";
import {
  clearSubmittedDraft,
  copyDraftRowsToSubmission,
  draftProjection,
  draftProjectionFromRows,
  draftRows,
  finalWriteAccessStatus,
  findDraft,
  findSubmissionState,
  hasScope,
  replaySubmissionRequest,
  seedDraftFromSubmission,
  submissionProjection,
} from "./projection";
import { assertOrganizationRetentionWritable } from "../data_retention";
import {
  normalizeOperationalIdempotencyKey,
  operationalRequestFingerprint,
} from "../build_operational_idempotency";
import { enqueueCommunicationIntent } from "../email_transport";
import { requireAcknowledgedPackageRevision } from "../quote_invitation_access";
import { clearPreferredForSubmission } from "../quote_preferred";
import { migratePriorRevisionDraftForAccess } from "../quote_response_drafts";
import type { InvitationScope } from "../quote_invitation_access";
import type { Doc, Id, MutationCtx } from "../types";

export async function submitForAccess(
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
export interface ValidatedSubmissionRequest {
  actor: SubmissionActor;
  deadlineClock: MutationDeadlineClock;
  expectedDraftVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
}

export async function loadPriorSubmissionRevisions(
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

export async function acceptValidatedDraftSubmission(
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

export async function startRevisionForAccess(
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

export async function withdrawForAccess(
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
