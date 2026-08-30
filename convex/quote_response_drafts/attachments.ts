import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import { assertOrganizationRetentionWritable } from "../data_retention";
import {
  requireAcknowledgedPackageRevision,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedWriteAccess,
  quoteInvitationSecretVerifier,
} from "../quote_invitation_access";
import { migratePriorRevisionDraftForAccess } from "./migration";
import {
  MAX_ACTIVE_DRAFT_ATTACHMENT_STAGING_SESSIONS,
  MAX_DRAFT_ATTACHMENTS,
  DRAFT_ATTACHMENT_STAGING_TTL_MS,
  DRAFT_ATTACHMENT_UPLOAD_PATH,
  TRAILING_SLASH_PATTERN,
  assertExpectedVersion,
  findDraft,
  hasSubmittedResponseState,
  validateAttachmentDescriptor,
} from "./core";
import {
  createDraft,
  quoteDraftProjection,
  updateDraftProgress,
} from "./mutations";
import type { InvitationScope } from "../quote_invitation_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export type AuthorizeQuoteInvitationResponseDraftAttachmentHttpUploadArgs = {
  stagingSessionId: Id<"quoteInvitationResponseDraftAttachmentStagingSessions">;
  uploadSecretVerifier: string;
};
export type CompleteQuoteInvitationResponseDraftAttachmentHttpUploadArgs = {
  actualMimeType: string;
  stagingSessionId: Id<"quoteInvitationResponseDraftAttachmentStagingSessions">;
  storageId: Id<"_storage">;
  uploadSecretVerifier: string;
};

export async function beginDraftAttachmentUploadForAccess(
  ctx: MutationCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>,
  args: {
    fileName: string;
    mimeType: string;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
    sizeBytes: number;
    sourcePackageRevisionResponseFieldId?: Id<"quotePackageRevisionResponseFields">;
  },
  ownership: { ownerWorkosUserId?: string } = {}
) {
  if (access.status !== "available") {
    return { status: access.status } as const;
  }
  await assertOrganizationRetentionWritable(
    ctx,
    access.scope.invitation.organizationId
  );
  const acknowledgementRequired = await requireAcknowledgedPackageRevision(
    ctx,
    access.scope
  );
  if (acknowledgementRequired) {
    return acknowledgementRequired;
  }
  await migratePriorRevisionDraftForAccess(ctx, access.scope);
  if (
    !(await findDraft(ctx, access.scope)) &&
    (await hasSubmittedResponseState(ctx, access.scope))
  ) {
    return { status: "revision_required" } as const;
  }
  const attachment = await validateAttachmentDescriptor(
    ctx,
    access.scope,
    args
  );
  const now = Date.now();
  await assertDraftAttachmentStagingCapacity(ctx, access.scope, now);
  const expiresAt = Math.min(
    now + DRAFT_ATTACHMENT_STAGING_TTL_MS,
    "session" in access
      ? access.session.sessionExpiresAt
      : Number.MAX_SAFE_INTEGER
  );
  const uploadSecret = randomDraftAttachmentUploadSecret();
  const stagingSessionId = await ctx.db.insert(
    "quoteInvitationResponseDraftAttachmentStagingSessions",
    {
      brokerageId: access.scope.invitation.brokerageId,
      buildId: access.scope.invitation.buildId,
      createdAt: now,
      expectedFileName: attachment.fileName,
      expectedMimeType: attachment.mimeType,
      expectedSizeBytes: attachment.sizeBytes,
      expiresAt,
      organizationId: access.scope.invitation.organizationId,
      ownerWorkosUserId: ownership.ownerWorkosUserId,
      quoteInvitationBrowserSessionId:
        "session" in access ? access.session._id : undefined,
      quotePackageRevisionId: access.scope.packageRevision._id,
      quoteRoundId: access.scope.invitation.quoteRoundId,
      quoteRoundInvitationId: access.scope.invitation._id,
      sourcePackageRevisionResponseFieldId:
        attachment.sourcePackageRevisionResponseFieldId,
      state: "open",
      uploadSecretVerifier: await quoteInvitationSecretVerifier(uploadSecret),
      updatedAt: now,
    }
  );
  await ctx.scheduler.runAt(
    expiresAt,
    internal.quote_response_drafts
      .expireQuoteInvitationResponseDraftAttachmentStagingSession,
    { stagingSessionId }
  );
  return {
    expiresAt,
    stagingSessionId,
    status: "available" as const,
    uploadSecret,
    uploadUrl: quoteDraftAttachmentUploadUrl(stagingSessionId),
  };
}

export async function registerDraftAttachmentUploadForAccess(
  ctx: MutationCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>,
  args: {
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
    stagingSessionId: Id<"quoteInvitationResponseDraftAttachmentStagingSessions">;
    storageId: Id<"_storage">;
  },
  ownership: { ownerWorkosUserId?: string } = {}
) {
  if (access.status !== "available") {
    return { status: access.status } as const;
  }
  await assertOrganizationRetentionWritable(
    ctx,
    access.scope.invitation.organizationId
  );
  const now = Date.now();
  const session = await requireOwnedDraftAttachmentStagingSession(
    ctx,
    access,
    args.stagingSessionId,
    now,
    ownership
  );
  if (!session) {
    return {
      status: "unavailable" as const,
    };
  }
  if (
    session.state === "finalized" &&
    session.pendingStorageId === args.storageId
  ) {
    return { status: "registered" as const };
  }
  // Raw storage ids are never accepted into ownership here. Only the custom
  // upload endpoint can bind an object to this stage after validating its
  // one-time secret and exact request metadata.
  return attachmentRejected(
    "Response file upload did not complete through its reserved upload endpoint."
  );
}


export async function authorizeQuoteInvitationResponseDraftAttachmentHttpUploadHandler(
  ctx: QueryCtx,
  args: AuthorizeQuoteInvitationResponseDraftAttachmentHttpUploadArgs
) {
  const session = await ctx.db.get(args.stagingSessionId);
  if (
    !session ||
    session.state !== "open" ||
    session.expiresAt <= Date.now() ||
    session.uploadSecretVerifier !== args.uploadSecretVerifier
  ) {
    return { status: "unavailable" as const };
  }
  return {
    expectedMimeType: session.expectedMimeType,
    expectedSizeBytes: session.expectedSizeBytes,
    status: "available" as const,
  };
}

export async function completeQuoteInvitationResponseDraftAttachmentHttpUploadHandler(
  ctx: MutationCtx,
  args: CompleteQuoteInvitationResponseDraftAttachmentHttpUploadArgs
) {
  const session = await ctx.db.get(args.stagingSessionId);
  if (
    !session ||
    session.state !== "open" ||
    session.expiresAt <= Date.now() ||
    session.uploadSecretVerifier !== args.uploadSecretVerifier ||
    args.actualMimeType !== session.expectedMimeType
  ) {
    return false;
  }
  const storage = await ctx.db.system.get("_storage", args.storageId);
  if (!storage || storage.size !== session.expectedSizeBytes) {
    return false;
  }
  const [attachments, stagingSessions] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseDraftAttachments")
      .withIndex("by_storageId", (query) =>
        query.eq("storageId", args.storageId)
      )
      .take(1),
    ctx.db
      .query("quoteInvitationResponseDraftAttachmentStagingSessions")
      .withIndex("by_pendingStorageId", (query) =>
        query.eq("pendingStorageId", args.storageId)
      )
      .take(1),
  ]);
  if (attachments.length || stagingSessions.length) {
    return false;
  }
  await ctx.db.patch(session._id, {
    pendingStorageId: args.storageId,
    state: "finalized",
    updatedAt: Date.now(),
  });
  return true;
}

export async function attachDraftFileForAccess(
  ctx: MutationCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>,
  args: {
    expectedVersion: number;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
    stagingSessionId: Id<"quoteInvitationResponseDraftAttachmentStagingSessions">;
    storageId: Id<"_storage">;
  },
  ownership: { ownerWorkosUserId?: string } = {}
) {
  if (access.status !== "available") {
    return { status: access.status } as const;
  }
  await assertOrganizationRetentionWritable(
    ctx,
    access.scope.invitation.organizationId
  );
  const acknowledgementRequired = await requireAcknowledgedPackageRevision(
    ctx,
    access.scope
  );
  if (acknowledgementRequired) {
    return acknowledgementRequired;
  }
  await migratePriorRevisionDraftForAccess(ctx, access.scope);
  assertExpectedVersion(args.expectedVersion);
  const now = Date.now();
  const session = await requireOwnedDraftAttachmentStagingSession(
    ctx,
    access,
    args.stagingSessionId,
    now,
    ownership
  );
  if (!session) {
    return attachmentRejected(
      "This response file upload expired. Choose the file again to retry."
    );
  }
  if (session.pendingStorageId !== args.storageId) {
    throw new ConvexError(
      "The uploaded response file does not match its staging session."
    );
  }
  const existingAttachments = await ctx.db
    .query("quoteInvitationResponseDraftAttachments")
    .withIndex("by_storageId", (query) => query.eq("storageId", args.storageId))
    .take(2);
  if (existingAttachments.length > 1) {
    throw new ConvexError("Response file storage has multiple attachments.");
  }
  const existingAttachment = existingAttachments[0];
  if (session.state === "consumed" && existingAttachment) {
    return existingAttachmentResult(
      ctx,
      access.scope,
      existingAttachment,
      "Response file staging crosses its Field Ledger."
    );
  }
  if (session.state !== "finalized") {
    return attachmentRejected(
      "The response file upload was not registered. Choose the file again to retry."
    );
  }
  if (!(await verifyStagedAttachmentStorage(ctx, session, args.storageId))) {
    await abandonDraftAttachmentStagingSession(ctx, session, now);
    return attachmentRejected("Response file upload could not be verified.");
  }
  if (existingAttachment) {
    await ctx.db.patch(session._id, { state: "consumed", updatedAt: now });
    return existingAttachmentResult(
      ctx,
      access.scope,
      existingAttachment,
      "Response file storage belongs to another Field Ledger."
    );
  }

  let draft = await findDraft(ctx, access.scope);
  let created = false;
  if (!draft) {
    if (args.expectedVersion !== 0) {
      return { draft: null, status: "conflict" } as const;
    }
    if (await hasSubmittedResponseState(ctx, access.scope)) {
      return { status: "revision_required" } as const;
    }
    draft = await createDraft(ctx, access.scope);
    created = true;
  } else if (args.expectedVersion !== draft.version) {
    return {
      draft: await quoteDraftProjection(ctx, access.scope, draft),
      status: "conflict",
    } as const;
  }
  const existing = await ctx.db
    .query("quoteInvitationResponseDraftAttachments")
    .withIndex("by_quoteInvitationResponseDraftId_and_createdAt", (query) =>
      query.eq("quoteInvitationResponseDraftId", draft._id)
    )
    .take(MAX_DRAFT_ATTACHMENTS + 1);
  if (existing.length >= MAX_DRAFT_ATTACHMENTS) {
    await abandonDraftAttachmentStagingSession(ctx, session, now);
    return attachmentRejected(
      "A Field Ledger supports at most 25 response files."
    );
  }
  await ctx.db.insert("quoteInvitationResponseDraftAttachments", {
    brokerageId: access.scope.invitation.brokerageId,
    buildId: access.scope.invitation.buildId,
    createdAt: now,
    fileName: session.expectedFileName,
    mimeType: session.expectedMimeType,
    organizationId: access.scope.invitation.organizationId,
    quoteInvitationResponseDraftId: draft._id,
    quotePackageRevisionId: access.scope.packageRevision._id,
    quoteRoundId: access.scope.invitation.quoteRoundId,
    quoteRoundInvitationId: access.scope.invitation._id,
    sizeBytes: session.expectedSizeBytes,
    sourcePackageRevisionResponseFieldId:
      session.sourcePackageRevisionResponseFieldId,
    storageId: args.storageId,
  });
  await ctx.db.patch(session._id, { state: "consumed", updatedAt: now });
  const updated = await updateDraftProgress(ctx, access.scope, draft, {
    incrementVersion: !created,
  });
  return {
    draft: await quoteDraftProjection(ctx, access.scope, updated),
    status: "saved" as const,
  };
}

export async function existingAttachmentResult(
  ctx: MutationCtx,
  scope: InvitationScope,
  attachment: Doc<"quoteInvitationResponseDraftAttachments">,
  scopeError: string
) {
  const draft = await findDraft(ctx, scope);
  if (!draft || attachment.quoteInvitationResponseDraftId !== draft._id) {
    throw new ConvexError(scopeError);
  }
  return {
    draft: await quoteDraftProjection(ctx, scope, draft),
    status: "saved" as const,
  };
}

export async function assertDraftAttachmentStagingCapacity(
  ctx: MutationCtx,
  scope: InvitationScope,
  now: number
) {
  const [draft, openSessions, finalizedSessions] = await Promise.all([
    findDraft(ctx, scope),
    ctx.db
      .query("quoteInvitationResponseDraftAttachmentStagingSessions")
      .withIndex(
        "by_quoteRoundInvitationId_and_quotePackageRevisionId_and_state",
        (query) =>
          query
            .eq("quoteRoundInvitationId", scope.invitation._id)
            .eq("quotePackageRevisionId", scope.packageRevision._id)
            .eq("state", "open")
      )
      .take(MAX_ACTIVE_DRAFT_ATTACHMENT_STAGING_SESSIONS + 1),
    ctx.db
      .query("quoteInvitationResponseDraftAttachmentStagingSessions")
      .withIndex(
        "by_quoteRoundInvitationId_and_quotePackageRevisionId_and_state",
        (query) =>
          query
            .eq("quoteRoundInvitationId", scope.invitation._id)
            .eq("quotePackageRevisionId", scope.packageRevision._id)
            .eq("state", "finalized")
      )
      .take(MAX_ACTIVE_DRAFT_ATTACHMENT_STAGING_SESSIONS + 1),
  ]);
  const stagingSessions = [...openSessions, ...finalizedSessions];
  for (const session of stagingSessions) {
    assertDraftAttachmentStagingScope(session, scope);
    if (session.expiresAt <= now) {
      await abandonDraftAttachmentStagingSession(ctx, session, now);
    }
  }
  const liveStagingCount = stagingSessions.filter(
    (session) => session.expiresAt > now
  ).length;
  const attachments = draft
    ? await ctx.db
        .query("quoteInvitationResponseDraftAttachments")
        .withIndex("by_quoteInvitationResponseDraftId_and_createdAt", (query) =>
          query.eq("quoteInvitationResponseDraftId", draft._id)
        )
        .take(MAX_DRAFT_ATTACHMENTS + 1)
    : [];
  if (attachments.length > MAX_DRAFT_ATTACHMENTS) {
    throw new ConvexError("Field Ledger exceeds its safe response limit.");
  }
  if (
    attachments.length + liveStagingCount >=
    MAX_ACTIVE_DRAFT_ATTACHMENT_STAGING_SESSIONS
  ) {
    throw new ConvexError("A Field Ledger supports at most 25 response files.");
  }
}

export async function requireOwnedDraftAttachmentStagingSession(
  ctx: MutationCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>,
  stagingSessionId: Id<"quoteInvitationResponseDraftAttachmentStagingSessions">,
  now: number,
  ownership: { ownerWorkosUserId?: string }
) {
  const session = await ctx.db.get(stagingSessionId);
  if (!session || access.status === "unavailable") {
    return null;
  }
  assertDraftAttachmentStagingScope(session, access.scope);
  if (
    ("session" in access &&
      session.quoteInvitationBrowserSessionId !== access.session._id) ||
    (!("session" in access) &&
      (!ownership.ownerWorkosUserId ||
        session.ownerWorkosUserId !== ownership.ownerWorkosUserId))
  ) {
    throw new ConvexError(
      "This response file upload belongs to another recipient session."
    );
  }
  if (session.expiresAt <= now) {
    if (session.state === "open" || session.state === "finalized") {
      await abandonDraftAttachmentStagingSession(ctx, session, now);
    }
    return null;
  }
  return session.state === "abandoned" ? null : session;
}

export async function verifyStagedAttachmentStorage(
  ctx: MutationCtx,
  session: Doc<"quoteInvitationResponseDraftAttachmentStagingSessions">,
  storageId: Id<"_storage">
) {
  const storage = await ctx.db.system.get("_storage", storageId);
  return Boolean(
    storage &&
      storage.size === session.expectedSizeBytes &&
      (!storage.contentType ||
        storage.contentType.toLowerCase() === session.expectedMimeType)
  );
}

export async function abandonDraftAttachmentStagingSession(
  ctx: MutationCtx,
  session: Doc<"quoteInvitationResponseDraftAttachmentStagingSessions">,
  now: number
) {
  if (session.state !== "open" && session.state !== "finalized") {
    return;
  }
  let canDeletePendingStorage = false;
  if (session.pendingStorageId) {
    const pendingStorageId = session.pendingStorageId;
    const [attachments, stagingSessions] = await Promise.all([
      ctx.db
        .query("quoteInvitationResponseDraftAttachments")
        .withIndex("by_storageId", (query) =>
          query.eq("storageId", pendingStorageId)
        )
        .take(1),
      ctx.db
        .query("quoteInvitationResponseDraftAttachmentStagingSessions")
        .withIndex("by_pendingStorageId", (query) =>
          query.eq("pendingStorageId", pendingStorageId)
        )
        .take(2),
    ]);
    canDeletePendingStorage =
      attachments.length === 0 &&
      stagingSessions.length === 1 &&
      stagingSessions[0]?._id === session._id;
  }
  if (canDeletePendingStorage && session.pendingStorageId) {
    await ctx.storage.delete(session.pendingStorageId);
  }
  await ctx.db.patch(session._id, { state: "abandoned", updatedAt: now });
}

export function assertDraftAttachmentStagingScope(
  session: Doc<"quoteInvitationResponseDraftAttachmentStagingSessions">,
  scope: InvitationScope
) {
  if (
    session.brokerageId !== scope.invitation.brokerageId ||
    session.organizationId !== scope.invitation.organizationId ||
    session.buildId !== scope.invitation.buildId ||
    session.quoteRoundId !== scope.invitation.quoteRoundId ||
    session.quoteRoundInvitationId !== scope.invitation._id ||
    session.quotePackageRevisionId !== scope.packageRevision._id
  ) {
    throw new ConvexError(
      "Response file staging crosses its invitation scope."
    );
  }
}

export function attachmentRejected(message: string) {
  return { message, status: "attachment_rejected" as const };
}

export function randomDraftAttachmentUploadSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function quoteDraftAttachmentUploadUrl(
  stagingSessionId: Id<"quoteInvitationResponseDraftAttachmentStagingSessions">
) {
  const siteUrl = process.env.CONVEX_SITE_URL?.trim().replace(
    TRAILING_SLASH_PATTERN,
    ""
  );
  if (!siteUrl) {
    throw new ConvexError(
      "CONVEX_SITE_URL is required before uploading a quote response file."
    );
  }
  const url = new URL(DRAFT_ATTACHMENT_UPLOAD_PATH, `${siteUrl}/`);
  url.searchParams.set("stagingSessionId", stagingSessionId);
  return url.toString();
}
