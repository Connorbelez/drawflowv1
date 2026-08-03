import { ConvexError } from "convex/values";

import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export interface PreferredAuditActor {
  actorRoles: readonly string[];
  actorWorkosUserId: string;
}

export interface PreferredClearInput {
  actor: PreferredAuditActor;
  command: string;
  reason: string;
  warnings?: string[];
}

export interface PreferredPointer {
  quoteInvitationResponseSubmissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">;
  quotePackageRevisionId: Id<"quotePackageRevisions">;
  quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  selectedAt: number;
  selectedByWorkosUserId: string;
  submissionRevision: number;
}

export async function getPreferredState(
  ctx: QueryCtx | MutationCtx,
  quoteRoundId: Id<"quoteRounds">
) {
  const rows = await ctx.db
    .query("quoteRoundPreferredSubmissionStates")
    .withIndex("by_quoteRoundId", (query) =>
      query.eq("quoteRoundId", quoteRoundId)
    )
    .take(2);
  if (rows.length > 1) {
    throw new ConvexError("Quote Round Preferred Quote state is inconsistent.");
  }
  return rows[0] ?? null;
}

export function preferredPointerFromState(
  state: Doc<"quoteRoundPreferredSubmissionStates"> | null
): PreferredPointer | null {
  if (
    !(
      state?.quotePackageRevisionId &&
      state.quoteRoundInvitationId &&
      state.quoteInvitationResponseSubmissionRevisionId
    ) ||
    state.submissionRevision === undefined ||
    state.selectedAt === undefined ||
    !state.selectedByWorkosUserId
  ) {
    return null;
  }
  return {
    quotePackageRevisionId: state.quotePackageRevisionId,
    quoteRoundInvitationId: state.quoteRoundInvitationId,
    quoteInvitationResponseSubmissionRevisionId:
      state.quoteInvitationResponseSubmissionRevisionId,
    selectedAt: state.selectedAt,
    selectedByWorkosUserId: state.selectedByWorkosUserId,
    submissionRevision: state.submissionRevision,
  };
}

function statePointerSnapshot(
  state: Doc<"quoteRoundPreferredSubmissionStates"> | null
) {
  const pointer = preferredPointerFromState(state);
  return pointer
    ? {
        quoteInvitationResponseSubmissionRevisionId: String(
          pointer.quoteInvitationResponseSubmissionRevisionId
        ),
        quotePackageRevisionId: String(pointer.quotePackageRevisionId),
        quoteRoundInvitationId: String(pointer.quoteRoundInvitationId),
        selectedAt: pointer.selectedAt,
        submissionRevision: pointer.submissionRevision,
      }
    : { status: "none" };
}

function assertRoundScope(
  round: Doc<"quoteRounds">,
  state: Doc<"quoteRoundPreferredSubmissionStates">
) {
  if (
    state.brokerageId !== round.brokerageId ||
    state.organizationId !== round.organizationId ||
    state.buildId !== round.buildId ||
    state.quoteRoundId !== round._id
  ) {
    throw new ConvexError("Quote Round Preferred Quote state crosses scope.");
  }
}

async function clearPreferredState(
  ctx: MutationCtx,
  round: Doc<"quoteRounds">,
  input: PreferredClearInput
) {
  const state = await getPreferredState(ctx, round._id);
  if (!state) {
    return false;
  }
  assertRoundScope(round, state);
  if (!preferredPointerFromState(state)) {
    return false;
  }
  const now = Date.now();
  await ctx.db.patch(state._id, {
    quoteInvitationResponseSubmissionRevisionId: undefined,
    quotePackageRevisionId: undefined,
    quoteRoundInvitationId: undefined,
    selectedAt: undefined,
    selectedByWorkosUserId: undefined,
    stateVersion: state.stateVersion + 1,
    submissionRevision: undefined,
    updatedAt: now,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: [...input.actor.actorRoles],
    actorWorkosUserId: input.actor.actorWorkosUserId,
    brokerageId: round.brokerageId,
    command: input.command,
    createdAt: now,
    entityId: String(round._id),
    entityType: "quoteRound",
    eventType: "quote_round.preferred_quote_cleared",
    newState: JSON.stringify({ reason: input.reason, status: "none" }),
    organizationId: round.organizationId,
    priorState: JSON.stringify(statePointerSnapshot(state)),
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
  return true;
}

export async function clearPreferredForRound(
  ctx: MutationCtx,
  round: Doc<"quoteRounds">,
  input: PreferredClearInput
) {
  return await clearPreferredState(ctx, round, input);
}

export async function clearPreferredForInvitation(
  ctx: MutationCtx,
  invitation: Doc<"quoteRoundInvitations">,
  input: PreferredClearInput
) {
  const round = await ctx.db.get(invitation.quoteRoundId);
  if (!round) {
    throw new ConvexError(
      "Quote Round is unavailable for Preferred Quote state."
    );
  }
  const state = await getPreferredState(ctx, round._id);
  if (!state) {
    return false;
  }
  assertRoundScope(round, state);
  const pointer = preferredPointerFromState(state);
  if (!pointer || pointer.quoteRoundInvitationId !== invitation._id) {
    return false;
  }
  return await clearPreferredState(ctx, round, input);
}

export async function clearPreferredForSubmission(
  ctx: MutationCtx,
  submission: Doc<"quoteInvitationResponseSubmissionRevisions">,
  input: PreferredClearInput
) {
  const round = await ctx.db.get(submission.quoteRoundId);
  if (!round) {
    throw new ConvexError(
      "Quote Round is unavailable for Preferred Quote state."
    );
  }
  const state = await getPreferredState(ctx, round._id);
  if (!state) {
    return false;
  }
  assertRoundScope(round, state);
  const pointer = preferredPointerFromState(state);
  if (
    !pointer ||
    pointer.quoteInvitationResponseSubmissionRevisionId !== submission._id
  ) {
    return false;
  }
  return await clearPreferredState(ctx, round, input);
}
