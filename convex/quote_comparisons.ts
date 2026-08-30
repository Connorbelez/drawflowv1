import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  requiredAdministrativeReason,
} from "./administrative_override_policy";
import {
  authenticatedMutation,
  authenticatedQuery,
} from "./authz";
import { assertOrganizationRetentionWritable } from "./data_retention";
import { authorizeQuoteAdministrativeRecovery } from "./quote_authoring_access";
import {
  getPreferredState,
  preferredPointerFromState,
} from "./quote_preferred";
import type { Doc, Id, MutationCtx } from "./types";
import {
  assertScoped,
  authorizeComparisonPath,
  lifecycleForEvents,
  requireRound,
  unavailable,
} from "./quote_comparisons/access";
import { currentPreferredSummary } from "./quote_comparisons/candidates";
import { loadComparison } from "./quote_comparisons/read";
import {
  MAX_SUBMISSION_EVENTS,
  comparisonResultValidator,
  preferredCommandResultValidator,
} from "./quote_comparisons/contract";

export const getQuoteRoundComparison = authenticatedQuery
  .input({
    buildId: v.string(),
    now: v.number(),
    packageRevisionId: v.optional(v.string()),
    quoteRoundId: v.string(),
    readerKind: v.optional(
      v.union(
        v.literal("backoffice"),
        v.literal("builder"),
        v.literal("homeowner")
      )
    ),
    workosOrganizationId: v.string(),
  })
  .returns(comparisonResultValidator)
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    const quoteRoundId = ctx.db.normalizeId("quoteRounds", args.quoteRoundId);
    const packageRevisionId = args.packageRevisionId
      ? (ctx.db.normalizeId("quotePackageRevisions", args.packageRevisionId) ??
        undefined)
      : undefined;
    if (
      !(buildId && quoteRoundId) ||
      (args.packageRevisionId && !packageRevisionId)
    ) {
      return unavailable("Quote Round is unavailable.");
    }
    const authorization = await authorizeComparisonPath(ctx, {
      buildId,
      readerKind: args.readerKind,
      workosOrganizationId: args.workosOrganizationId,
    });
    const round = requireRound(
      await ctx.db.get(quoteRoundId),
      authorization,
      quoteRoundId
    );
    return await loadComparison(
      ctx,
      authorization,
      round,
      args.now,
      packageRevisionId
    );
  })
  .public();

async function submissionForPreferredCommand(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  submissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">
) {
  const submission = await ctx.db.get(submissionRevisionId);
  if (!submission) {
    throw new ConvexError("Quote response submission is unavailable.");
  }
  assertScoped(submission, authorization, round._id);
  const invitation = await ctx.db.get(submission.quoteRoundInvitationId);
  const packageRevision = await ctx.db.get(submission.quotePackageRevisionId);
  if (!(invitation && packageRevision)) {
    throw new ConvexError("Quote response submission scope is unavailable.");
  }
  assertScoped(invitation, authorization, round._id);
  assertScoped(packageRevision, authorization, round._id);
  if (round.state !== "open" && round.state !== "closed") {
    throw new ConvexError(
      "Preferred Quote can be changed only while a Quote Round is open or closed."
    );
  }
  if (round.currentPackageRevisionId !== packageRevision._id) {
    throw new ConvexError(
      "Only a submission from the current Quote Package Revision may be Preferred."
    );
  }
  if (
    invitation.participationState !== "active" ||
    (invitation.currentQuotePackageRevisionId ??
      invitation.quotePackageRevisionId) !== packageRevision._id
  ) {
    throw new ConvexError(
      "Only an active current Quote Invitation may be Preferred."
    );
  }
  const states = await ctx.db
    .query("quoteInvitationResponseSubmissionStates")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", invitation._id)
          .eq("quotePackageRevisionId", packageRevision._id)
    )
    .take(2);
  if (
    states.length !== 1 ||
    states[0]?.activeSubmissionRevisionId !== submission._id
  ) {
    throw new ConvexError(
      "Only the current active Quote response may be Preferred."
    );
  }
  const events = await ctx.db
    .query("quoteInvitationResponseSubmissionLifecycleEvents")
    .withIndex(
      "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
      (query) =>
        query.eq("quoteInvitationResponseSubmissionRevisionId", submission._id)
    )
    .order("asc")
    .take(MAX_SUBMISSION_EVENTS);
  const lifecycle = lifecycleForEvents(
    events,
    new Map([[submission._id, submission.revision]])
  );
  if (lifecycle.status !== "active") {
    throw new ConvexError("Only an active Quote response may be Preferred.");
  }
  return { invitation, packageRevision, submission };
}

interface PreferredResultBase {
  preferred: {
    selectedAt: number;
    selectedByWorkosUserId: string;
    submissionRevision: number;
    submissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">;
    quotePackageRevisionId: Id<"quotePackageRevisions">;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  } | null;
  stateVersion: number;
}

async function preferredResult(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  status: "selected",
  idempotentReplay: boolean
): Promise<
  PreferredResultBase & { idempotentReplay: boolean; status: "selected" }
>;
async function preferredResult(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  status: "cleared"
): Promise<PreferredResultBase & { status: "cleared" }>;
async function preferredResult(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  status: "selected" | "cleared",
  idempotentReplay = false
) {
  const state = await getPreferredState(ctx, round._id);
  const preferred = await currentPreferredSummary(
    ctx,
    round,
    round.currentPackageRevisionId
      ? await ctx.db.get(round.currentPackageRevisionId)
      : null,
    authorization
  );
  if (status === "selected") {
    return {
      idempotentReplay,
      preferred,
      stateVersion: state?.stateVersion ?? 0,
      status: "selected" as const,
    };
  }
  return {
    preferred,
    stateVersion: state?.stateVersion ?? 0,
    status: "cleared" as const,
  };
}

export const setPreferredQuoteSubmissionRevision = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.string(),
    expectedStateVersion: v.number(),
    quoteRoundId: v.string(),
    reason: v.string(),
    submissionRevisionId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(preferredCommandResultValidator)
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    const quoteRoundId = ctx.db.normalizeId("quoteRounds", args.quoteRoundId);
    const submissionRevisionId = ctx.db.normalizeId(
      "quoteInvitationResponseSubmissionRevisions",
      args.submissionRevisionId
    );
    if (!(buildId && quoteRoundId && submissionRevisionId)) {
      throw new ConvexError("Preferred Quote identifiers are invalid.");
    }
    const reason = requiredAdministrativeReason(
      args.reason,
      "A Preferred Quote selection reason"
    );
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, {
      buildId,
      organizationId: args.workosOrganizationId,
    });
    const { authorization, breakGlass } =
      await authorizeQuoteAdministrativeRecovery(ctx, baseAuthorization, {
        administrativeCapacity: args.administrativeCapacity,
        breakGlassConfirmed: args.breakGlassConfirmed,
        reason,
      });
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    const round = requireRound(
      await ctx.db.get(quoteRoundId),
      authorization,
      quoteRoundId
    );
    if (
      !Number.isSafeInteger(args.expectedStateVersion) ||
      args.expectedStateVersion < 0
    ) {
      throw new ConvexError("Preferred Quote state version is invalid.");
    }
    const currentState = await getPreferredState(ctx, round._id);
    if ((currentState?.stateVersion ?? 0) !== args.expectedStateVersion) {
      const preferred = await currentPreferredSummary(
        ctx,
        round,
        round.currentPackageRevisionId
          ? await ctx.db.get(round.currentPackageRevisionId)
          : null,
        authorization
      );
      return {
        idempotentReplay: false,
        preferred,
        stateVersion: currentState?.stateVersion ?? 0,
        status: "conflict" as const,
      };
    }
    const { invitation, packageRevision, submission } =
      await submissionForPreferredCommand(
        ctx,
        authorization,
        round,
        submissionRevisionId
      );
    const existingPointer = currentState
      ? preferredPointerFromState(currentState)
      : null;
    if (
      existingPointer?.quoteInvitationResponseSubmissionRevisionId ===
      submission._id
    ) {
      return await preferredResult(ctx, authorization, round, "selected", true);
    }
    const now = Date.now();
    const nextStateVersion = (currentState?.stateVersion ?? 0) + 1;
    const priorState = existingPointer ?? { status: "none" };
    const nextPointer = {
      quoteInvitationResponseSubmissionRevisionId: submission._id,
      quotePackageRevisionId: packageRevision._id,
      quoteRoundInvitationId: invitation._id,
      selectedAt: now,
      selectedByWorkosUserId: ctx.viewer.subject,
      submissionRevision: submission.revision,
    };
    if (currentState) {
      await ctx.db.patch(currentState._id, {
        ...nextPointer,
        stateVersion: nextStateVersion,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("quoteRoundPreferredSubmissionStates", {
        brokerageId: round.brokerageId,
        buildId: round.buildId,
        createdAt: now,
        organizationId: round.organizationId,
        quoteRoundId: round._id,
        stateVersion: nextStateVersion,
        updatedAt: now,
        ...nextPointer,
      });
    }
    await appendGovernedAuditEvent(ctx, authorization, {
      breakGlass,
      command: "setPreferredQuoteSubmissionRevision",
      entityId: String(round._id),
      entityType: "quoteRound",
      eventType: "quote_round.preferred_quote_set",
      newState: nextPointer,
      now,
      overrideKind: "preferred_set",
      priorState,
      reason,
      targetRevisions: [
        {
          entityId: String(round._id),
          entityType: "quoteRound",
          revision: round.revision,
        },
        {
          entityId: String(packageRevision._id),
          entityType: "quotePackageRevision",
          revision: packageRevision.revision,
        },
        {
          entityId: String(submission._id),
          entityType: "quoteResponseSubmissionRevision",
          revision: submission.revision,
        },
      ],
      warnings: [],
    });
    return await preferredResult(ctx, authorization, round, "selected", false);
  })
  .public();

export const clearPreferredQuoteSubmissionRevision = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.string(),
    confirmed: v.boolean(),
    expectedStateVersion: v.number(),
    quoteRoundId: v.string(),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(preferredCommandResultValidator)
  .handler(async (ctx, args) => {
    if (!args.confirmed) {
      throw new ConvexError("Preferred Quote clear requires confirmation.");
    }
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    const quoteRoundId = ctx.db.normalizeId("quoteRounds", args.quoteRoundId);
    if (!(buildId && quoteRoundId)) {
      throw new ConvexError("Preferred Quote identifiers are invalid.");
    }
    const reason = requiredAdministrativeReason(
      args.reason,
      "A Preferred Quote clear reason"
    );
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, {
      buildId,
      organizationId: args.workosOrganizationId,
    });
    const { authorization, breakGlass } =
      await authorizeQuoteAdministrativeRecovery(ctx, baseAuthorization, {
        administrativeCapacity: args.administrativeCapacity,
        breakGlassConfirmed: args.breakGlassConfirmed,
        reason,
      });
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    const round = requireRound(
      await ctx.db.get(quoteRoundId),
      authorization,
      quoteRoundId
    );
    if (round.state !== "open" && round.state !== "closed") {
      throw new ConvexError(
        "Preferred Quote can be changed only while a Quote Round is open or closed."
      );
    }
    if (
      !Number.isSafeInteger(args.expectedStateVersion) ||
      args.expectedStateVersion < 0
    ) {
      throw new ConvexError("Preferred Quote state version is invalid.");
    }
    const state = await getPreferredState(ctx, round._id);
    if ((state?.stateVersion ?? 0) !== args.expectedStateVersion) {
      const preferred = await currentPreferredSummary(
        ctx,
        round,
        round.currentPackageRevisionId
          ? await ctx.db.get(round.currentPackageRevisionId)
          : null,
        authorization
      );
      return {
        idempotentReplay: false,
        preferred,
        stateVersion: state?.stateVersion ?? 0,
        status: "conflict" as const,
      };
    }
    if (state) {
      const pointer = preferredPointerFromState(state);
      if (pointer) {
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
        await appendGovernedAuditEvent(ctx, authorization, {
          breakGlass,
          command: "clearPreferredQuoteSubmissionRevision",
          entityId: String(round._id),
          entityType: "quoteRound",
          eventType: "quote_round.preferred_quote_cleared",
          newState: { status: "none" },
          now,
          overrideKind: "preferred_clear",
          priorState: pointer,
          reason,
          targetRevisions: [
            {
              entityId: String(round._id),
              entityType: "quoteRound",
              revision: round.revision,
            },
            {
              entityId: String(
                pointer.quoteInvitationResponseSubmissionRevisionId
              ),
              entityType: "quoteResponseSubmissionRevision",
              revision: pointer.submissionRevision,
            },
          ],
          warnings: [],
        });
      }
    }
    return await preferredResult(ctx, authorization, round, "cleared");
  })
  .public();
