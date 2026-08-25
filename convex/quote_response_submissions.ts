import { v } from "convex/values";

import {
  authenticatedMutation,
  authenticatedQuery,
} from "./authz";
import { publicMutation, publicQuery } from "./fluent";
import {
  lifecycleResultValidator,
  startMutationDeadlineClock,
  startRevisionResultValidator,
  submissionRevisionReadResultValidator,
  submitResultValidator,
  withdrawResultValidator,
} from "./quote_response_submissions/core";
import {
  startRevisionForAccess,
  submitForAccess,
  withdrawForAccess,
} from "./quote_response_submissions/mutations";
import { hasInternalQuoteResponseRole } from "./quote_response_submissions/projection";
import {
  lifecycleForAccess,
  submissionRevisionForAccess,
} from "./quote_response_submissions/read";
import {
  resolveQuoteInvitationBrowserReadAccess,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedReadAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "./quote_invitation_access";

/** Browser-session lifecycle read; server time remains the access clock. */
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

/** Read one immutable revision without hydrating the full history. */
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

/** Accept a recipient's current Draft into an immutable Submission Revision. */
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
      { kind: "claimed_account", workosUserId: ctx.viewer.subject },
      deadlineClock
    );
  })
  .public();

/** Seed a new mutable Draft from the latest immutable Submission Revision. */
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
