import { ConvexError, type Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  internalMutation,
  internalQuery,
  publicMutation,
  publicQuery,
} from "./fluent";
import {
  type InvitationScope,
  quoteInvitationAccessProjection,
  quoteInvitationAccessProjectionValidator,
  quoteInvitationSecretVerifier,
  resolveQuoteInvitationBrowserReadAccess,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedReadAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "./quote_invitation_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_DRAFT_ANSWERS = 100;
const MAX_DRAFT_ATTACHMENTS = 25;
const MAX_ACTIVE_DRAFT_ATTACHMENT_STAGING_SESSIONS = MAX_DRAFT_ATTACHMENTS;
const MAX_DRAFT_LINE_ITEMS = 340;
const MAX_INTERNAL_PROGRESS_ROWS = 200;
const MAX_PATCH_ANSWERS = 40;
const MAX_PATCH_LINE_ITEMS = 40;
const MAX_PATCH_REMOVALS = 40;
const MAX_RESPONSE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_HTML_LENGTH = 40_000;
const MAX_RESPONSE_VALUE_LENGTH = 32_000;
const MAX_ATTACHMENT_FILE_NAME_LENGTH = 255;
const MAX_ATTACHMENT_MIME_TYPE_LENGTH = 160;
const DRAFT_ATTACHMENT_STAGING_TTL_MS = 30 * 60 * 1000;
const DRAFT_ATTACHMENT_UPLOAD_PATH =
  "/api/quote-response-draft-attachment-upload";
const MAX_EXPANDED_SCOPE_TITLE_LENGTH = 180;
const MAX_QUOTE_AMOUNT_CENTS = 100_000_000_000;
const DATE_RESPONSE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DRAFT_LINE_KEY_PATTERN = /^[a-z]+:[A-Za-z0-9_-]{1,180}$/;
const UNSAFE_EMBEDDED_HTML_PATTERN = /<(?:script|iframe|object|embed|style)\b/i;
const UNSAFE_HTML_EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=/i;
const UNSAFE_HTML_PROTOCOL_PATTERN = /javascript\s*:/i;
const TRAILING_SLASH_PATTERN = /\/$/;

const quoteDraftLineSourceValidator = v.union(
  v.literal("package_labour"),
  v.literal("package_material"),
  v.literal("template_priced"),
  v.literal("expanded_scope")
);

const quoteDraftLineScopeValidator = v.union(
  v.literal("labour"),
  v.literal("materials"),
  v.literal("whole_quote")
);

const quotedAmountPatchValidator = v.union(v.number(), v.null());

const quoteDraftLinePatchValidator = v.object({
  lineKey: v.string(),
  quotedAmountCents: v.optional(quotedAmountPatchValidator),
  scope: quoteDraftLineScopeValidator,
  source: quoteDraftLineSourceValidator,
  sourcePackageRevisionLabourLineId: v.optional(
    v.id("quotePackageRevisionLabourLines")
  ),
  sourcePackageRevisionMaterialLineId: v.optional(
    v.id("quotePackageRevisionMaterialLines")
  ),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  title: v.optional(v.string()),
});

const quoteDraftAnswerPatchValidator = v.object({
  sourcePackageRevisionResponseFieldId: v.id(
    "quotePackageRevisionResponseFields"
  ),
  value: v.union(v.string(), v.null()),
});

const quoteDraftPatchValidator = v.object({
  answerPatches: v.optional(v.array(quoteDraftAnswerPatchValidator)),
  commentsHtml: v.optional(v.union(v.string(), v.null())),
  linePatches: v.optional(v.array(quoteDraftLinePatchValidator)),
  removeExpandedLineKeys: v.optional(v.array(v.string())),
});

const quoteDraftLineProjectionValidator = v.object({
  lineKey: v.string(),
  quotedAmountCents: v.optional(v.number()),
  scope: quoteDraftLineScopeValidator,
  source: quoteDraftLineSourceValidator,
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

const quoteDraftAnswerProjectionValidator = v.object({
  sourcePackageRevisionResponseFieldId: v.id(
    "quotePackageRevisionResponseFields"
  ),
  value: v.string(),
});

const quoteDraftAttachmentProjectionValidator = v.object({
  createdAt: v.number(),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  storageId: v.id("_storage"),
});

const quoteDraftProjectionValidator = v.object({
  answeredFieldCount: v.number(),
  attachmentCount: v.number(),
  attachments: v.array(quoteDraftAttachmentProjectionValidator),
  commentsHtml: v.optional(v.string()),
  completedPricingLineCount: v.number(),
  createdAt: v.number(),
  lineItems: v.array(quoteDraftLineProjectionValidator),
  responses: v.array(quoteDraftAnswerProjectionValidator),
  updatedAt: v.number(),
  version: v.number(),
});

const quoteDraftReadResultValidator = v.union(
  v.object({
    access: quoteInvitationAccessProjectionValidator,
    draft: v.union(quoteDraftProjectionValidator, v.null()),
    status: v.union(v.literal("available"), v.literal("read_only")),
  }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

const quoteDraftSaveResultValidator = v.union(
  v.object({
    draft: quoteDraftProjectionValidator,
    status: v.literal("saved"),
  }),
  v.object({
    draft: v.union(quoteDraftProjectionValidator, v.null()),
    status: v.literal("conflict"),
  }),
  v.object({ status: v.literal("not_started") }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

const quoteDraftAttachmentIntentInput = {
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
};

const quoteDraftUploadUrlResultValidator = v.union(
  v.object({
    expiresAt: v.number(),
    stagingSessionId: v.id(
      "quoteInvitationResponseDraftAttachmentStagingSessions"
    ),
    status: v.literal("available"),
    uploadSecret: v.string(),
    uploadUrl: v.string(),
  }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

const quoteDraftAttachmentRegistrationResultValidator = v.union(
  v.object({ status: v.literal("registered") }),
  v.object({ message: v.string(), status: v.literal("attachment_rejected") }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

const quoteDraftAttachmentFinalizeResultValidator = v.union(
  v.object({
    draft: quoteDraftProjectionValidator,
    status: v.literal("saved"),
  }),
  v.object({
    draft: v.union(quoteDraftProjectionValidator, v.null()),
    status: v.literal("conflict"),
  }),
  v.object({ message: v.string(), status: v.literal("attachment_rejected") }),
  v.object({ status: v.literal("read_only") }),
  v.object({ status: v.literal("superseded") }),
  v.object({ status: v.literal("unavailable") })
);

const quoteDraftProgressValidator = v.object({
  answeredFieldCount: v.number(),
  attachmentCount: v.number(),
  completedPricingLineCount: v.number(),
  quoteRoundInvitationId: v.id("quoteRoundInvitations"),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  status: v.literal("drafting"),
  updatedAt: v.number(),
});

/**
 * Anonymous recipient reads are secured by the verifier-backed browser lease.
 * `presentationNow` is caller-refreshed so the subscription transitions to
 * read-only at the deadline without a database write; every mutation below
 * separately enforces the server clock.
 */
export const getQuoteInvitationResponseDraft = publicQuery
  .input({
    // A changing presentation timestamp is a harmless subscription refresh
    // token. Server time, never this caller-controlled value, decides access.
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

/**
 * A claimed WorkOS account reads the same Invitation + Package Revision draft
 * as the browser session. No separate user-owned copy exists to merge later.
 */
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

// Reserve one invitation-scoped slot before issuing a short-lived upload
// secret. The custom HTTP endpoint stores and binds the object in one request,
// so there is never a generated-URL interval where bytes exist without a stage
// that scheduled cleanup can identify.
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

/**
 * This intentionally exposes only aggregate recipient progress to authorized
 * internal Build participants. Draft values, comments, and storage ids stay
 * private to the invitation recipient until a later immutable submission flow.
 */
export const getQuoteRoundInvitationResponseProgress = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.array(quoteDraftProgressValidator))
  .handler(async (ctx, args) => {
    if (
      !ctx.viewer.roles.some((role) =>
        [
          "admin",
          "principle-broker",
          "broker",
          "broker-staff",
          "builder",
          "builder-staff",
        ].includes(role)
      )
    ) {
      throw new ConvexError("Forbidden: internal Quote progress only.");
    }
    const authorization = await authorizeActiveBuildAccess(ctx, {
      buildId: args.buildId,
      organizationId: args.workosOrganizationId,
    });
    const round = await ctx.db.get(args.quoteRoundId);
    if (
      !round ||
      round.brokerageId !== authorization.brokerage._id ||
      round.buildId !== authorization.build._id ||
      round.organizationId !== authorization.organizationId
    ) {
      throw new ConvexError("Quote Round is unavailable for this Build.");
    }
    const drafts = await ctx.db
      .query("quoteInvitationResponseDrafts")
      .withIndex("by_quoteRoundId_and_updatedAt", (query) =>
        query.eq("quoteRoundId", round._id)
      )
      .order("desc")
      .take(MAX_INTERNAL_PROGRESS_ROWS + 1);
    if (drafts.length > MAX_INTERNAL_PROGRESS_ROWS) {
      throw new ConvexError(
        "Quote response progress exceeds its access limit."
      );
    }
    assertInternalDraftScope(drafts, authorization, round);
    return drafts.map((draft) => ({
      answeredFieldCount: draft.answeredFieldCount,
      attachmentCount: draft.attachmentCount,
      completedPricingLineCount: draft.completedPricingLineCount,
      quotePackageRevisionId: draft.quotePackageRevisionId,
      quoteRoundInvitationId: draft.quoteRoundInvitationId,
      status: "drafting" as const,
      updatedAt: draft.updatedAt,
    }));
  })
  .public();

async function readDraftResult(
  ctx: QueryCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserReadAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedReadAccess>>
) {
  if (access.status === "unavailable" || access.status === "superseded") {
    return { status: access.status } as const;
  }
  const draft = await findDraft(ctx, access.scope);
  return {
    access: await quoteInvitationAccessProjection(
      ctx,
      access.scope,
      "session" in access
        ? { sessionExpiresAt: access.session.sessionExpiresAt }
        : undefined
    ),
    draft: draft ? await quoteDraftProjection(ctx, access.scope, draft) : null,
    status: access.status,
  } as const;
}

async function saveDraftForAccess(
  ctx: MutationCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>,
  args: {
    expectedVersion: number;
    patch: Infer<typeof quoteDraftPatchValidator>;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  }
) {
  if (access.status !== "available") {
    return { status: access.status } as const;
  }
  assertExpectedVersion(args.expectedVersion);
  assertPatchBounds(args.patch);
  let draft = await findDraft(ctx, access.scope);
  let created = false;
  if (!draft) {
    if (args.expectedVersion !== 0) {
      return { draft: null, status: "conflict" } as const;
    }
    if (!patchHasMeaningfulChange(args.patch)) {
      return { status: "not_started" } as const;
    }
    draft = await createDraft(ctx, access.scope);
    created = true;
  } else if (args.expectedVersion !== draft.version) {
    return {
      draft: await quoteDraftProjection(ctx, access.scope, draft),
      status: "conflict",
    } as const;
  }

  const changed = await applyPatch(ctx, access.scope, draft, args.patch);
  if (!changed) {
    return {
      draft: await quoteDraftProjection(ctx, access.scope, draft),
      status: "saved",
    } as const;
  }
  const updated = await updateDraftProgress(ctx, access.scope, draft, {
    incrementVersion: !created,
  });
  return {
    draft: await quoteDraftProjection(ctx, access.scope, updated),
    status: "saved",
  } as const;
}

async function beginDraftAttachmentUploadForAccess(
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

async function registerDraftAttachmentUploadForAccess(
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
    .handler(async (ctx, args) => {
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
    })
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
    .handler(async (ctx, args) => {
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
    })
    .internal();

async function attachDraftFileForAccess(
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
    const draft = await findDraft(ctx, access.scope);
    if (
      !draft ||
      existingAttachment.quoteInvitationResponseDraftId !== draft._id
    ) {
      throw new ConvexError("Response file staging crosses its Field Ledger.");
    }
    return {
      draft: await quoteDraftProjection(ctx, access.scope, draft),
      status: "saved" as const,
    };
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
    const draft = await findDraft(ctx, access.scope);
    if (
      !draft ||
      existingAttachment.quoteInvitationResponseDraftId !== draft._id
    ) {
      throw new ConvexError(
        "Response file storage belongs to another Field Ledger."
      );
    }
    return {
      draft: await quoteDraftProjection(ctx, access.scope, draft),
      status: "saved" as const,
    };
  }

  let draft = await findDraft(ctx, access.scope);
  let created = false;
  if (!draft) {
    if (args.expectedVersion !== 0) {
      return { draft: null, status: "conflict" } as const;
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

async function assertDraftAttachmentStagingCapacity(
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

async function requireOwnedDraftAttachmentStagingSession(
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

async function verifyStagedAttachmentStorage(
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

async function abandonDraftAttachmentStagingSession(
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

function assertDraftAttachmentStagingScope(
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

function attachmentRejected(message: string) {
  return { message, status: "attachment_rejected" as const };
}

function randomDraftAttachmentUploadSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quoteDraftAttachmentUploadUrl(
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

async function createDraft(ctx: MutationCtx, scope: InvitationScope) {
  const now = Date.now();
  const draftId = await ctx.db.insert("quoteInvitationResponseDrafts", {
    answeredFieldCount: 0,
    attachmentCount: 0,
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    completedPricingLineCount: 0,
    createdAt: now,
    organizationId: scope.invitation.organizationId,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    updatedAt: now,
    version: 1,
  });
  const draft = await ctx.db.get(draftId);
  if (!draft) {
    throw new ConvexError("Unable to create the Field Ledger draft.");
  }
  return draft;
}

async function applyPatch(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  patch: Infer<typeof quoteDraftPatchValidator>
) {
  let changed = false;
  for (const linePatch of patch.linePatches ?? []) {
    changed = (await upsertLineItem(ctx, scope, draft, linePatch)) || changed;
  }
  for (const answerPatch of patch.answerPatches ?? []) {
    changed = (await upsertAnswer(ctx, scope, draft, answerPatch)) || changed;
  }
  for (const lineKey of patch.removeExpandedLineKeys ?? []) {
    changed = (await removeExpandedLineItem(ctx, draft, lineKey)) || changed;
  }
  if (patch.commentsHtml !== undefined) {
    const commentsHtml = normalizeCommentsHtml(patch.commentsHtml);
    if (draft.commentsHtml !== commentsHtml) {
      await ctx.db.patch(draft._id, { commentsHtml });
      changed = true;
    }
  }
  return changed;
}

async function upsertLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  const canonical = await canonicalLineItem(ctx, scope, patch);
  const amount = normalizeQuotedAmount(patch.quotedAmountCents);
  const existing = await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_lineKey", (query) =>
      query
        .eq("quoteInvitationResponseDraftId", draft._id)
        .eq("lineKey", canonical.lineKey)
    )
    .unique();
  if (existing) {
    assertDraftLineScope(existing, scope, draft);
    if (
      existing.source !== canonical.source ||
      existing.scope !== canonical.scope ||
      existing.sourcePackageRevisionLabourLineId !==
        canonical.sourcePackageRevisionLabourLineId ||
      existing.sourcePackageRevisionMaterialLineId !==
        canonical.sourcePackageRevisionMaterialLineId ||
      existing.sourcePackageRevisionResponseFieldId !==
        canonical.sourcePackageRevisionResponseFieldId
    ) {
      throw new ConvexError("Field Ledger line identity cannot be changed.");
    }
    if (
      existing.quotedAmountCents === amount &&
      existing.title === canonical.title
    ) {
      return false;
    }
    await ctx.db.patch(existing._id, {
      quotedAmountCents: amount,
      title: canonical.title,
      updatedAt: Date.now(),
    });
    return true;
  }
  const existingRows = await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_updatedAt", (query) =>
      query.eq("quoteInvitationResponseDraftId", draft._id)
    )
    .take(MAX_DRAFT_LINE_ITEMS + 1);
  if (existingRows.length >= MAX_DRAFT_LINE_ITEMS) {
    throw new ConvexError("Field Ledger pricing exceeds its response limit.");
  }
  const now = Date.now();
  await ctx.db.insert("quoteInvitationResponseDraftLineItems", {
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    createdAt: now,
    lineKey: canonical.lineKey,
    organizationId: scope.invitation.organizationId,
    quotedAmountCents: amount,
    quoteInvitationResponseDraftId: draft._id,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    scope: canonical.scope,
    source: canonical.source,
    sourcePackageRevisionLabourLineId:
      canonical.sourcePackageRevisionLabourLineId,
    sourcePackageRevisionMaterialLineId:
      canonical.sourcePackageRevisionMaterialLineId,
    sourcePackageRevisionResponseFieldId:
      canonical.sourcePackageRevisionResponseFieldId,
    title: canonical.title,
    updatedAt: now,
  });
  return true;
}

async function removeExpandedLineItem(
  ctx: MutationCtx,
  draft: Doc<"quoteInvitationResponseDrafts">,
  lineKey: string
) {
  assertLineKey(lineKey);
  const existing = await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_lineKey", (query) =>
      query
        .eq("quoteInvitationResponseDraftId", draft._id)
        .eq("lineKey", lineKey)
    )
    .unique();
  if (!existing) {
    return false;
  }
  if (existing.source !== "expanded_scope") {
    throw new ConvexError("Only expanded-scope lines may be removed.");
  }
  await ctx.db.delete(existing._id);
  return true;
}

async function upsertAnswer(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  patch: Infer<typeof quoteDraftAnswerPatchValidator>
) {
  const field = await ctx.db.get(patch.sourcePackageRevisionResponseFieldId);
  if (!(field && matchesPackageScope(field, scope))) {
    throw new ConvexError(
      "Quote response field is unavailable for this package."
    );
  }
  if (field.kind === "priced_line" || field.kind === "attachment") {
    throw new ConvexError(
      "This response field uses a dedicated Field Ledger control."
    );
  }
  const value = normalizeAnswerValue(field, patch.value);
  const existing = await ctx.db
    .query("quoteInvitationResponseDraftAnswers")
    .withIndex("by_draft_and_responseFieldId", (query) =>
      query
        .eq("quoteInvitationResponseDraftId", draft._id)
        .eq("sourcePackageRevisionResponseFieldId", field._id)
    )
    .unique();
  if (!value) {
    if (!existing) {
      return false;
    }
    assertDraftAnswerScope(existing, scope, draft);
    await ctx.db.delete(existing._id);
    return true;
  }
  if (existing) {
    assertDraftAnswerScope(existing, scope, draft);
    if (existing.value === value) {
      return false;
    }
    await ctx.db.patch(existing._id, { updatedAt: Date.now(), value });
    return true;
  }
  const answers = await ctx.db
    .query("quoteInvitationResponseDraftAnswers")
    .withIndex("by_draft_and_responseFieldId", (query) =>
      query.eq("quoteInvitationResponseDraftId", draft._id)
    )
    .take(MAX_DRAFT_ANSWERS + 1);
  if (answers.length >= MAX_DRAFT_ANSWERS) {
    throw new ConvexError("Field Ledger answers exceed their response limit.");
  }
  const now = Date.now();
  await ctx.db.insert("quoteInvitationResponseDraftAnswers", {
    brokerageId: scope.invitation.brokerageId,
    buildId: scope.invitation.buildId,
    createdAt: now,
    fieldKey: field.fieldKey,
    organizationId: scope.invitation.organizationId,
    quoteInvitationResponseDraftId: draft._id,
    quotePackageRevisionId: scope.packageRevision._id,
    quoteRoundId: scope.invitation.quoteRoundId,
    quoteRoundInvitationId: scope.invitation._id,
    scope: field.scope,
    sourcePackageRevisionResponseFieldId: field._id,
    updatedAt: now,
    value,
  });
  return true;
}

async function canonicalLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  assertLineKey(patch.lineKey);
  switch (patch.source) {
    case "package_labour":
      return await canonicalLabourLineItem(ctx, scope, patch);
    case "package_material":
      return await canonicalMaterialLineItem(ctx, scope, patch);
    case "template_priced":
      return await canonicalTemplateLineItem(ctx, scope, patch);
    case "expanded_scope":
      return canonicalExpandedScopeLineItem(patch);
  }
}

async function canonicalLabourLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  const lineId = patch.sourcePackageRevisionLabourLineId;
  const line = lineId ? await ctx.db.get(lineId) : null;
  if (!(line && matchesPackageScope(line, scope))) {
    throw new ConvexError("Labour line is unavailable for this package.");
  }
  if (patch.scope !== "labour" || patch.lineKey !== `labour:${line._id}`) {
    throw new ConvexError("Labour pricing line identity is invalid.");
  }
  return {
    lineKey: patch.lineKey,
    scope: "labour" as const,
    source: "package_labour" as const,
    sourcePackageRevisionLabourLineId: line._id,
    sourcePackageRevisionMaterialLineId: undefined,
    sourcePackageRevisionResponseFieldId: undefined,
    title: `${line.milestoneName} · ${line.submilestoneName}`,
  };
}

async function canonicalMaterialLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  const lineId = patch.sourcePackageRevisionMaterialLineId;
  const line = lineId ? await ctx.db.get(lineId) : null;
  if (!(line && matchesPackageScope(line, scope))) {
    throw new ConvexError("Material line is unavailable for this package.");
  }
  if (patch.scope !== "materials" || patch.lineKey !== `material:${line._id}`) {
    throw new ConvexError("Material pricing line identity is invalid.");
  }
  return {
    lineKey: patch.lineKey,
    scope: "materials" as const,
    source: "package_material" as const,
    sourcePackageRevisionLabourLineId: undefined,
    sourcePackageRevisionMaterialLineId: line._id,
    sourcePackageRevisionResponseFieldId: undefined,
    title: line.title,
  };
}

async function canonicalTemplateLineItem(
  ctx: MutationCtx,
  scope: InvitationScope,
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  const fieldId = patch.sourcePackageRevisionResponseFieldId;
  const field = fieldId ? await ctx.db.get(fieldId) : null;
  if (!(field && matchesPackageScope(field, scope))) {
    throw new ConvexError(
      "Priced response field is unavailable for this package."
    );
  }
  if (field.kind !== "priced_line" || patch.scope !== field.scope) {
    throw new ConvexError(
      "Priced response field is unavailable for this package."
    );
  }
  if (patch.lineKey !== `field:${field._id}`) {
    throw new ConvexError("Priced response field key is invalid.");
  }
  return {
    lineKey: patch.lineKey,
    scope: field.scope,
    source: "template_priced" as const,
    sourcePackageRevisionLabourLineId: undefined,
    sourcePackageRevisionMaterialLineId: undefined,
    sourcePackageRevisionResponseFieldId: field._id,
    title: field.label,
  };
}

function canonicalExpandedScopeLineItem(
  patch: Infer<typeof quoteDraftLinePatchValidator>
) {
  if (!(patch.scope === "labour" || patch.scope === "materials")) {
    throw new ConvexError("Expanded scope must be Labour or Materials.");
  }
  if (!patch.lineKey.startsWith("expanded:")) {
    throw new ConvexError("Expanded-scope pricing line key is invalid.");
  }
  const title = patch.title?.trim();
  if (!title || title.length > MAX_EXPANDED_SCOPE_TITLE_LENGTH) {
    throw new ConvexError(
      "Expanded-scope title is required and must be 180 characters or fewer."
    );
  }
  return {
    lineKey: patch.lineKey,
    scope: patch.scope,
    source: "expanded_scope" as const,
    sourcePackageRevisionLabourLineId: undefined,
    sourcePackageRevisionMaterialLineId: undefined,
    sourcePackageRevisionResponseFieldId: undefined,
    title,
  };
}

async function updateDraftProgress(
  ctx: MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  options: { incrementVersion: boolean } = { incrementVersion: true }
) {
  const [lineItems, answers, attachments] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseDraftLineItems")
      .withIndex("by_quoteInvitationResponseDraftId_and_updatedAt", (query) =>
        query.eq("quoteInvitationResponseDraftId", draft._id)
      )
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
  assertDraftRowsScope(scope, draft, { attachments, answers, lineItems });
  const now = Date.now();
  await ctx.db.patch(draft._id, {
    answeredFieldCount: answers.length,
    attachmentCount: attachments.length,
    completedPricingLineCount: lineItems.filter(
      (line) => line.quotedAmountCents !== undefined
    ).length,
    updatedAt: now,
    version: draft.version + (options.incrementVersion ? 1 : 0),
  });
  const updated = await ctx.db.get(draft._id);
  if (!updated) {
    throw new ConvexError("Field Ledger draft disappeared while saving.");
  }
  return updated;
}

async function quoteDraftProjection(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  assertDraftScope(draft, scope);
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
  assertDraftRowsScope(scope, draft, { attachments, answers, lineItems });
  return {
    answeredFieldCount: draft.answeredFieldCount,
    attachmentCount: draft.attachmentCount,
    attachments: attachments.map((attachment) => ({
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
    createdAt: draft.createdAt,
    lineItems: lineItems.map((line) => ({
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
    })),
    responses: answers.map((answer) => ({
      sourcePackageRevisionResponseFieldId:
        answer.sourcePackageRevisionResponseFieldId,
      value: answer.value,
    })),
    updatedAt: draft.updatedAt,
    version: draft.version,
  };
}

function assertExpectedVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConvexError("Field Ledger version is invalid.");
  }
}

function assertPatchBounds(patch: Infer<typeof quoteDraftPatchValidator>) {
  if (
    (patch.linePatches?.length ?? 0) > MAX_PATCH_LINE_ITEMS ||
    (patch.answerPatches?.length ?? 0) > MAX_PATCH_ANSWERS ||
    (patch.removeExpandedLineKeys?.length ?? 0) > MAX_PATCH_REMOVALS
  ) {
    throw new ConvexError("Field Ledger save payload exceeds its safe limit.");
  }
}

function patchHasMeaningfulChange(
  patch: Infer<typeof quoteDraftPatchValidator>
) {
  return Boolean(
    patch.linePatches?.some(
      (line) =>
        typeof line.quotedAmountCents === "number" ||
        (line.source === "expanded_scope" && Boolean(line.title?.trim()))
    ) ||
      patch.answerPatches?.some((answer) => Boolean(answer.value?.trim())) ||
      (patch.commentsHtml !== undefined &&
        Boolean(patch.commentsHtml && hasMeaningfulHtml(patch.commentsHtml)))
  );
}

function normalizeQuotedAmount(value: number | null | undefined) {
  if (value === undefined || value === null) {
    return;
  }
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_QUOTE_AMOUNT_CENTS
  ) {
    throw new ConvexError(
      "Quoted amount must be a non-negative whole cent value."
    );
  }
  return value;
}

function normalizeCommentsHtml(value: string | null) {
  if (value === null) {
    return;
  }
  if (value.length > MAX_RESPONSE_HTML_LENGTH || containsUnsafeHtml(value)) {
    throw new ConvexError(
      "Quote comments contain unsupported rich-text content."
    );
  }
  return hasMeaningfulHtml(value) ? value.trim() : undefined;
}

function normalizeAnswerValue(
  field: Doc<"quotePackageRevisionResponseFields">,
  value: string | null
) {
  if (value === null || !value.trim()) {
    return;
  }
  const normalized = value.trim();
  const maxLength = Math.min(
    MAX_RESPONSE_VALUE_LENGTH,
    field.validation?.maxLength ?? MAX_RESPONSE_VALUE_LENGTH
  );
  if (normalized.length > maxLength) {
    throw new ConvexError(`${field.label} exceeds its maximum length.`);
  }
  if (field.kind === "date" && !DATE_RESPONSE_VALUE_PATTERN.test(normalized)) {
    throw new ConvexError(`${field.label} must be a valid calendar date.`);
  }
  if (field.kind === "choice" && !field.choiceOptions?.includes(normalized)) {
    throw new ConvexError(
      `${field.label} must use one of the provided choices.`
    );
  }
  if (field.validation?.pattern) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(field.validation.pattern);
    } catch {
      throw new ConvexError(
        "Quote response field has an invalid validation pattern."
      );
    }
    if (!pattern.test(normalized)) {
      throw new ConvexError(
        `${field.label} does not match the required format.`
      );
    }
  }
  if (field.renderer === "tiptap" && containsUnsafeHtml(normalized)) {
    throw new ConvexError(
      `${field.label} contains unsupported rich-text content.`
    );
  }
  return normalized;
}

async function validateAttachmentDescriptor(
  ctx: QueryCtx | MutationCtx,
  scope: InvitationScope,
  args: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sourcePackageRevisionResponseFieldId?: Id<"quotePackageRevisionResponseFields">;
  }
) {
  const fileName = args.fileName.trim();
  const mimeType = args.mimeType.trim().toLowerCase();
  if (!fileName || fileName.length > MAX_ATTACHMENT_FILE_NAME_LENGTH) {
    throw new ConvexError("Response file name is invalid.");
  }
  if (!mimeType || mimeType.length > MAX_ATTACHMENT_MIME_TYPE_LENGTH) {
    throw new ConvexError("Response file type is invalid.");
  }
  if (
    !Number.isSafeInteger(args.sizeBytes) ||
    args.sizeBytes < 1 ||
    args.sizeBytes > MAX_RESPONSE_ATTACHMENT_BYTES
  ) {
    throw new ConvexError("Response file must be smaller than 20 MB.");
  }
  if (!args.sourcePackageRevisionResponseFieldId) {
    return { fileName, mimeType, sizeBytes: args.sizeBytes };
  }
  const field = await ctx.db.get(args.sourcePackageRevisionResponseFieldId);
  if (
    !(field && matchesPackageScope(field, scope)) ||
    field.kind !== "attachment"
  ) {
    throw new ConvexError(
      "Response attachment field is unavailable for this package."
    );
  }
  if (
    field.validation?.allowedMimeTypes &&
    !field.validation.allowedMimeTypes.includes(mimeType)
  ) {
    throw new ConvexError(`${field.label} does not accept this file type.`);
  }
  return {
    fileName,
    mimeType,
    sizeBytes: args.sizeBytes,
    sourcePackageRevisionResponseFieldId: field._id,
  };
}

function assertLineKey(lineKey: string) {
  if (!DRAFT_LINE_KEY_PATTERN.test(lineKey)) {
    throw new ConvexError("Field Ledger line key is invalid.");
  }
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

function assertDraftLineScope(
  line: Doc<"quoteInvitationResponseDraftLineItems">,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  assertDraftRowScope(line, scope, draft, "Field Ledger pricing line");
}

function assertDraftAnswerScope(
  answer: Doc<"quoteInvitationResponseDraftAnswers">,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">
) {
  assertDraftRowScope(answer, scope, draft, "Field Ledger answer");
}

function assertDraftRowScope(
  row:
    | Doc<"quoteInvitationResponseDraftLineItems">
    | Doc<"quoteInvitationResponseDraftAnswers">
    | Doc<"quoteInvitationResponseDraftAttachments">,
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  label: string
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
    throw new ConvexError(`${label} crosses its invitation scope.`);
  }
}

function assertDraftRowsScope(
  scope: InvitationScope,
  draft: Doc<"quoteInvitationResponseDrafts">,
  rows: {
    attachments: Doc<"quoteInvitationResponseDraftAttachments">[];
    answers: Doc<"quoteInvitationResponseDraftAnswers">[];
    lineItems: Doc<"quoteInvitationResponseDraftLineItems">[];
  }
) {
  for (const row of [...rows.lineItems, ...rows.answers, ...rows.attachments]) {
    assertDraftRowScope(row, scope, draft, "Field Ledger row");
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

function assertInternalDraftScope(
  drafts: Doc<"quoteInvitationResponseDrafts">[],
  authorization: Awaited<ReturnType<typeof authorizeActiveBuildAccess>>,
  round: Doc<"quoteRounds">
) {
  if (
    drafts.some(
      (draft) =>
        draft.brokerageId !== authorization.brokerage._id ||
        draft.organizationId !== authorization.organizationId ||
        draft.buildId !== authorization.build._id ||
        draft.quoteRoundId !== round._id
    )
  ) {
    throw new ConvexError("Quote response progress crosses its Build scope.");
  }
}
