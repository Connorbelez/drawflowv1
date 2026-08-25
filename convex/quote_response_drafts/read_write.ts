import { ConvexError, type Infer } from "convex/values";

import { authorizeActiveBuildAccess } from "../activeBuildAccess";
import {
  requireAcknowledgedPackageRevision,
  quoteInvitationAccessProjection,
  resolveQuoteInvitationBrowserReadAccess,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedReadAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "../quote_invitation_access";
import { assertOrganizationRetentionWritable } from "../data_retention";
import { migratePriorRevisionDraftForAccess } from "./migration";
import {
  assertDraftCollectionBounds,
  assertDraftRowsScope,
  assertInternalDraftScope,
  MAX_INTERNAL_PROGRESS_ROWS,
  findDraft,
  hasSubmittedResponseState,
  patchHasMeaningfulChange,
  quoteDraftPatchValidator,
  assertExpectedVersion,
  assertPatchBounds,
  type quoteDraftProjectionValidator,
} from "./core";
import {
  applyPatch,
  createDraft,
  quoteDraftProjection,
  updateDraftProgress,
} from "./mutations";
import { type AuthorizedViewer } from "../authz";
import type { InvitationScope } from "../quote_invitation_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

type AuthenticatedMutationCtx = MutationCtx & { viewer: AuthorizedViewer };
type AuthenticatedQueryCtx = QueryCtx & { viewer: AuthorizedViewer };

export type GetQuoteRoundInvitationResponseProgressArgs = {
  buildId: Id<"activeBuilds">;
  quoteRoundId: Id<"quoteRounds">;
  workosOrganizationId: string;
};

export async function getQuoteRoundInvitationResponseProgressHandler(
  ctx: AuthenticatedQueryCtx,
  args: GetQuoteRoundInvitationResponseProgressArgs
) {
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
}
export async function readDraftResult(
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

export async function saveDraftForAccess(
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
  assertPatchBounds(args.patch);
  let draft = await findDraft(ctx, access.scope);
  let created = false;
  if (!draft) {
    if (args.expectedVersion !== 0) {
      return { draft: null, status: "conflict" } as const;
    }
    if (await hasSubmittedResponseState(ctx, access.scope)) {
      return { status: "revision_required" } as const;
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

export async function confirmCopiedValuesForAccess(
  ctx: MutationCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>,
  args: { expectedVersion: number },
  options?: { confirmedByWorkosUserId?: string }
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
  assertExpectedVersion(args.expectedVersion);
  const draft = await findDraft(ctx, access.scope);
  if (!draft || draft.copiedValuesConfirmationState !== "pending") {
    return { status: "not_required" as const };
  }
  if (draft.version !== args.expectedVersion) {
    return {
      draft: await quoteDraftProjection(ctx, access.scope, draft),
      status: "conflict" as const,
    };
  }
  const now = Date.now();
  await ctx.db.patch(draft._id, {
    copiedValuesConfirmationState: "confirmed",
    copiedValuesConfirmedAt: now,
    copiedValuesConfirmedByWorkosUserId: options?.confirmedByWorkosUserId,
    updatedAt: now,
    version: draft.version + 1,
  });
  const actorWorkosUserId =
    options?.confirmedByWorkosUserId ??
    ("session" in access
      ? `quote-session:${String(access.session._id)}`
      : `quote-recipient:${String(access.scope.profile._id)}`);
  await ctx.db.insert("auditEvents", {
    actorKind: "human",
    actorRoles: ["quote-recipient"],
    actorWorkosUserId,
    brokerageId: access.scope.invitation.brokerageId,
    buildId: access.scope.invitation.buildId,
    command: "confirmCopiedQuoteInvitationResponseDraftValues",
    createdAt: now,
    entityId: String(draft._id),
    entityType: "quoteInvitationResponseDraft",
    eventType: "quote_response.copied_values_confirmed",
    newState: JSON.stringify({
      copiedFromQuotePackageRevisionId: draft.copiedFromQuotePackageRevisionId,
      copiedValuesConfirmationState: "confirmed",
      version: draft.version + 1,
    }),
    organizationId: access.scope.invitation.organizationId,
    priorState: JSON.stringify({
      copiedFromQuotePackageRevisionId: draft.copiedFromQuotePackageRevisionId,
      copiedValuesConfirmationState: "pending",
      version: draft.version,
    }),
    reason: "Recipient confirmed copied response values and pricing.",
    targetRevisions: [
      {
        entityId: String(draft._id),
        entityType: "quoteInvitationResponseDraft",
        revision: draft.version + 1,
      },
      {
        entityId: String(access.scope.packageRevision._id),
        entityType: "quotePackageRevision",
        revision: access.scope.packageRevision.revision,
      },
    ],
    warnings: [],
  });
  const confirmed = await ctx.db.get(draft._id);
  if (!confirmed) {
    throw new ConvexError("Confirmed Quote response Draft is unavailable.");
  }
  return {
    draft: await quoteDraftProjection(ctx, access.scope, confirmed),
    status: "confirmed" as const,
  };
}
