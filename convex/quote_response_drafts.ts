import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  internalMutation,
  internalQuery,
  publicMutation,
  publicQuery,
} from "./fluent";
import {
  abandonDraftAttachmentStagingSession,
  attachDraftFileForAccess,
  authorizeQuoteInvitationResponseDraftAttachmentHttpUploadHandler,
  beginDraftAttachmentUploadForAccess,
  completeQuoteInvitationResponseDraftAttachmentHttpUploadHandler,
  registerDraftAttachmentUploadForAccess,
} from "./quote_response_drafts/attachments";
import {
  copiedValuesConfirmationResultValidator,
  quoteDraftAttachmentFinalizeResultValidator,
  quoteDraftAttachmentIntentInput,
  quoteDraftAttachmentRegistrationResultValidator,
  quoteDraftPatchValidator,
  quoteDraftProgressValidator,
  quoteDraftReadResultValidator,
  quoteDraftSaveResultValidator,
  quoteDraftUploadUrlResultValidator,
} from "./quote_response_drafts/core";
import {
  confirmCopiedValuesForAccess,
  getQuoteRoundInvitationResponseProgressHandler,
  readDraftResult,
  saveDraftForAccess,
} from "./quote_response_drafts/read_write";
import {
  resolveQuoteInvitationBrowserReadAccess,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedReadAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "./quote_invitation_access";

export { migratePriorRevisionDraftForAccess } from "./quote_response_drafts/migration";

export const getQuoteInvitationResponseDraft = publicQuery
  .input({
    presentationNow: v.optional(v.number()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    sessionToken: v.string(),
  })
  .returns(quoteDraftReadResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationBrowserReadAccess(ctx, args);
    return await readDraftResult(ctx, access);
  })
  .public();

export const getClaimedQuoteInvitationResponseDraft = authenticatedQuery
  .input({
    presentationNow: v.optional(v.number()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  })
  .returns(quoteDraftReadResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationClaimedReadAccess(ctx, {
      ...args,
      workosUserId: ctx.viewer.subject,
    });
    return await readDraftResult(ctx, access);
  })
  .public();

export const saveQuoteInvitationResponseDraft = publicMutation
  .input({
    expectedVersion: v.number(),
    patch: quoteDraftPatchValidator,
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    sessionToken: v.string(),
  })
  .returns(quoteDraftSaveResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await saveDraftForAccess(ctx, access, args);
  })
  .public();

export const saveClaimedQuoteInvitationResponseDraft = authenticatedMutation
  .input({
    expectedVersion: v.number(),
    patch: quoteDraftPatchValidator,
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  })
  .returns(quoteDraftSaveResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
      quoteRoundInvitationId: args.quoteRoundInvitationId,
      workosUserId: ctx.viewer.subject,
    });
    return await saveDraftForAccess(ctx, access, args);
  })
  .public();

export const confirmCopiedQuoteInvitationResponseDraftValues = publicMutation
  .input({
    expectedVersion: v.number(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    sessionToken: v.string(),
  })
  .returns(copiedValuesConfirmationResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await confirmCopiedValuesForAccess(ctx, access, args);
  })
  .public();

export const confirmCopiedClaimedQuoteInvitationResponseDraftValues =
  authenticatedMutation
    .input({
      expectedVersion: v.number(),
      quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    })
    .returns(copiedValuesConfirmationResultValidator)
    .handler(async (ctx, args) => {
      const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
        quoteRoundInvitationId: args.quoteRoundInvitationId,
        workosUserId: ctx.viewer.subject,
      });
      return await confirmCopiedValuesForAccess(ctx, access, args, {
        confirmedByWorkosUserId: ctx.viewer.subject,
      });
    })
    .public();

export const beginQuoteInvitationResponseDraftAttachmentUpload = publicMutation
  .input({
    ...quoteDraftAttachmentIntentInput,
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    sessionToken: v.string(),
  })
  .returns(quoteDraftUploadUrlResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await beginDraftAttachmentUploadForAccess(ctx, access, args);
  })
  .public();

export const beginClaimedQuoteInvitationResponseDraftAttachmentUpload =
  authenticatedMutation
    .input({
      ...quoteDraftAttachmentIntentInput,
      quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    })
    .returns(quoteDraftUploadUrlResultValidator)
    .handler(async (ctx, args) => {
      const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
        quoteRoundInvitationId: args.quoteRoundInvitationId,
        workosUserId: ctx.viewer.subject,
      });
      return await beginDraftAttachmentUploadForAccess(ctx, access, args, {
        ownerWorkosUserId: ctx.viewer.subject,
      });
    })
    .public();

const quoteDraftAttachmentFinalizeInput = {
  expectedVersion: v.number(),
  quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  stagingSessionId: v.id(
    "quoteInvitationResponseDraftAttachmentStagingSessions"
  ),
  storageId: v.id("_storage"),
};

const quoteDraftAttachmentRegistrationInput = {
  quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  stagingSessionId: v.id(
    "quoteInvitationResponseDraftAttachmentStagingSessions"
  ),
  storageId: v.id("_storage"),
};

export const registerQuoteInvitationResponseDraftAttachmentUpload =
  publicMutation
    .input({
      ...quoteDraftAttachmentRegistrationInput,
      sessionToken: v.string(),
    })
    .returns(quoteDraftAttachmentRegistrationResultValidator)
    .handler(async (ctx, args) => {
      const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
      return await registerDraftAttachmentUploadForAccess(ctx, access, args);
    })
    .public();

export const registerClaimedQuoteInvitationResponseDraftAttachmentUpload =
  authenticatedMutation
    .input(quoteDraftAttachmentRegistrationInput)
    .returns(quoteDraftAttachmentRegistrationResultValidator)
    .handler(async (ctx, args) => {
      const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
        quoteRoundInvitationId: args.quoteRoundInvitationId,
        workosUserId: ctx.viewer.subject,
      });
      return await registerDraftAttachmentUploadForAccess(ctx, access, args, {
        ownerWorkosUserId: ctx.viewer.subject,
      });
    })
    .public();

export const attachQuoteInvitationResponseDraftFile = publicMutation
  .input({ ...quoteDraftAttachmentFinalizeInput, sessionToken: v.string() })
  .returns(quoteDraftAttachmentFinalizeResultValidator)
  .handler(async (ctx, args) => {
    const access = await resolveQuoteInvitationBrowserWriteAccess(ctx, args);
    return await attachDraftFileForAccess(ctx, access, args);
  })
  .public();

export const attachClaimedQuoteInvitationResponseDraftFile =
  authenticatedMutation
    .input(quoteDraftAttachmentFinalizeInput)
    .returns(quoteDraftAttachmentFinalizeResultValidator)
    .handler(async (ctx, args) => {
      const access = await resolveQuoteInvitationClaimedWriteAccess(ctx, {
        quoteRoundInvitationId: args.quoteRoundInvitationId,
        workosUserId: ctx.viewer.subject,
      });
      return await attachDraftFileForAccess(ctx, access, args, {
        ownerWorkosUserId: ctx.viewer.subject,
      });
    })
    .public();

export const expireQuoteInvitationResponseDraftAttachmentStagingSession =
  internalMutation
    .input({
      stagingSessionId: v.id(
        "quoteInvitationResponseDraftAttachmentStagingSessions"
      ),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const session = await ctx.db.get(args.stagingSessionId);
      const now = Date.now();
      if (
        !session ||
        (session.state !== "open" && session.state !== "finalized") ||
        session.expiresAt > now
      ) {
        return null;
      }
      await abandonDraftAttachmentStagingSession(ctx, session, now);
      return null;
    })
    .internal();

export const getQuoteRoundInvitationResponseProgress = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.array(quoteDraftProgressValidator))
  .handler(getQuoteRoundInvitationResponseProgressHandler)
  .public();

export const authorizeQuoteInvitationResponseDraftAttachmentHttpUpload =
  internalQuery
    .input({
      stagingSessionId: v.id(
        "quoteInvitationResponseDraftAttachmentStagingSessions"
      ),
      uploadSecretVerifier: v.string(),
    })
    .returns(
      v.union(
        v.object({
          expectedMimeType: v.string(),
          expectedSizeBytes: v.number(),
          status: v.literal("available"),
        }),
        v.object({ status: v.literal("unavailable") })
      )
    )
    .handler(authorizeQuoteInvitationResponseDraftAttachmentHttpUploadHandler)
    .internal();

export const completeQuoteInvitationResponseDraftAttachmentHttpUpload =
  internalMutation
    .input({
      actualMimeType: v.string(),
      stagingSessionId: v.id(
        "quoteInvitationResponseDraftAttachmentStagingSessions"
      ),
      storageId: v.id("_storage"),
      uploadSecretVerifier: v.string(),
    })
    .returns(v.boolean())
    .handler(completeQuoteInvitationResponseDraftAttachmentHttpUploadHandler)
    .internal();
