import { ConvexError } from "convex/values";
import { backofficeRoleSlugs } from "../authz";
import {
  MAX_DRAFT_ANSWERS,
  MAX_DRAFT_ATTACHMENTS,
  MAX_DRAFT_LINE_ITEMS,
  MAX_LIFECYCLE_REVISION_SUMMARIES,
  MAX_SUBMISSION_EVENTS,
  type DraftRows,
  type MutationDeadlineClock,
  type PackageRevisionLineageCache,
  type ReadAccess,
  type WriteAccess,
} from "./core";
import {
  assertDraftCollectionBounds,
  assertDraftRowScope,
  assertDraftScope,
  assertPackageRevisionDescendsFromInvitationRoot,
  assertSubmissionInvitationScope,
  assertSubmissionLifecycleEventScope,
  assertSubmissionRowScope,
  assertSubmissionScope,
  assertSubmissionStateScope,
  historicalSubmissionScope,
  matchesPackageScope,
  submissionRows,
  type SubmissionRows,
} from "./validation";
import {
  quoteInvitationAccessProjection,
  quoteInvitationPackageRevisionAcknowledgement,
} from "../quote_invitation_access";
import type { InvitationScope } from "../quote_invitation_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export function hasScope(
  access: ReadAccess | WriteAccess
): access is (ReadAccess | WriteAccess) & { scope: InvitationScope } {
  return "scope" in access;
}
export function hasInternalQuoteResponseRole(roles: readonly string[]) {
  return roles.some(
    (role) =>
      backofficeRoleSlugs.includes(
        role as (typeof backofficeRoleSlugs)[number]
      ) ||
      role === "builder" ||
      role === "builder-staff"
  );
}

export function emptyLifecycle(
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

export function lifecycleEligibility(
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

export async function findSubmissionState(
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
export async function finalWriteAccessStatus(
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

export async function listLifecycleSubmissionRevisions(
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

export async function submissionSummaries(
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

export async function replaySubmissionRequest(
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

export async function draftRows(
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

export async function draftProjection(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  return await draftProjectionFromRows(
    draft,
    await draftRows(ctx, scope, draft)
  );
}

export function draftProjectionFromRows(
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

export function submissionSummary(
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

export function submissionLifecycleMetadata(
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

export async function submissionProjection(
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

export function lineProjection(
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

export async function copyDraftRowsToSubmission(
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

export async function clearSubmittedDraft(
  ctx: MutationCtx,
  draft: Doc<"quoteInvitationResponseDrafts">,
  rows: DraftRows
) {
  for (const row of [...rows.lineItems, ...rows.answers, ...rows.attachments]) {
    await ctx.db.delete(row._id);
  }
  await ctx.db.delete(draft._id);
}

export async function seedDraftFromSubmission(
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
