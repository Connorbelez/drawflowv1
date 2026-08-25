import { type ReadAccess, type PackageRevisionLineageCache } from "./core";
import {
  assertPackageRevisionDescendsFromInvitationRoot,
  assertSubmissionStateScope,
  historicalSubmissionScope,
} from "./validation";
import {
  draftProjection,
  emptyLifecycle,
  findDraft,
  findSubmissionState,
  hasScope,
  lifecycleEligibility,
  listLifecycleSubmissionRevisions,
  submissionProjection,
  submissionSummaries,
} from "./projection";
import {
  quoteInvitationAccessProjection,
  quoteInvitationPackageRevisionAcknowledgement,
} from "../quote_invitation_access";
import type { QueryCtx } from "../types";

export async function lifecycleForAccess(ctx: QueryCtx, access: ReadAccess) {
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

export async function submissionRevisionForAccess(
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
