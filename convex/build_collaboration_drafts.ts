import { v } from "convex/values";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  authenticatedMutation,
  authenticatedQuery,
  normalizeRoleSlugs,
} from "./authz";
import { prepareBuildCollaborationPublication } from "./build_collaboration";
import { reconcileDraftAssetStagingSessions } from "./build_collaboration_assets";
import { collaborationDraftSummaryValidator } from "./build_collaboration_contracts";
import {
  normalizeBuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import {
  canonicalPublicationBundleJson,
  publicationBundleFields,
  publicationBundleHash,
} from "./build_collaboration_publication_bundle";
import {
  invalidateBuildCollaborationPublicationApprovals,
  publishBuildCollaborationDraft,
} from "./build_collaboration_publication_lifecycle";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { MutationCtx } from "./types";

export const saveMyBuildCollaborationDraft = authenticatedMutation
  .input({
    ...publicationBundleFields,
    approvalOwnerWorkosUserId: v.optional(v.string()),
    buildId: v.id("activeBuilds"),
    draftId: v.optional(v.id("buildCollaborationDrafts")),
    expectedRevision: v.optional(v.number()),
    offlineCapturedAt: v.optional(v.number()),
    organizationId: v.string(),
    preparedByAgent: v.optional(v.boolean()),
    scheduledFor: v.optional(v.number()),
  })
  .returns(
    v.object({
      bundleJson: v.string(),
      draftId: v.id("buildCollaborationDrafts"),
      revision: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const now = Date.now();
    validateOfflineCaptureTimestamp(args.offlineCapturedAt, now);
    const preparedByAgent = authorization.viewer.actorKind !== "human";
    const approvalOwnerWorkosUserId =
      args.approvalOwnerWorkosUserId?.trim() ||
      (authorization.viewer.actorKind === "human"
        ? authorization.viewer.subject
        : undefined);
    if (!approvalOwnerWorkosUserId) {
      throw new Error(
        "Agent, service, and automation drafts require a human approval owner."
      );
    }
    const publicationAuthorization = await requireHumanApprovalOwner(ctx, {
      approvalOwnerWorkosUserId,
      authorization,
    });
    const { bundle } = await prepareBuildCollaborationPublication(ctx, {
      authorization: publicationAuthorization,
      bundle: args,
    });
    const bundleJson = canonicalPublicationBundleJson(bundle);
    const bundleHash = await publicationBundleHash(bundleJson);

    if (args.draftId) {
      const draft = await ctx.db.get(args.draftId);
      if (
        !draft ||
        draft.buildId !== authorization.build._id ||
        draft.ownerWorkosUserId !== authorization.viewer.subject
      ) {
        throw new Error("Draft not found.");
      }
      if (draft.state === "published" || draft.state === "discarded") {
        throw new Error("Published or discarded drafts cannot be edited.");
      }
      if (args.expectedRevision === undefined) {
        throw new Error(
          "Updating a collaboration draft requires its expected revision."
        );
      }
      if (draft.revision !== args.expectedRevision) {
        throw new Error(
          `Draft revision conflict: expected revision ${args.expectedRevision} but found ${draft.revision}. Your draft was preserved; compare it with the latest saved draft before retrying.`
        );
      }
      await invalidateBuildCollaborationPublicationApprovals(
        ctx,
        draft._id,
        now
      );
      await reconcileDraftAssetStagingSessions(ctx, {
        authorization,
        draftId: draft._id,
        now,
        retainedAssetIds: bundle.attachmentAssetIds,
      });
      await ctx.db.patch(draft._id, {
        bundleHash,
        bundleJson,
        approvalOwnerWorkosUserId,
        preparedByActorKind: authorization.viewer.actorKind,
        preparedByAgent,
        preparedByWorkosUserId: authorization.viewer.subject,
        revision: draft.revision + 1,
        offlineCapturedAt: args.offlineCapturedAt ?? draft.offlineCapturedAt,
        scheduledFor: args.scheduledFor,
        scheduleConflictReason: undefined,
        schedulePausedAt: undefined,
        state: "active",
        updatedAt: now,
      });
      return {
        bundleJson,
        draftId: draft._id,
        revision: draft.revision + 1,
      };
    }

    const draftId = await ctx.db.insert("buildCollaborationDrafts", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      bundleHash,
      bundleJson,
      createdAt: now,
      organizationId: authorization.organizationId,
      ownerWorkosUserId: authorization.viewer.subject,
      approvalOwnerWorkosUserId,
      preparedByActorKind: authorization.viewer.actorKind,
      preparedByAgent,
      preparedByWorkosUserId: authorization.viewer.subject,
      revision: 1,
      offlineCapturedAt: args.offlineCapturedAt,
      scheduledFor: args.scheduledFor,
      state: "active",
      updatedAt: now,
    });
    return { bundleJson, draftId, revision: 1 };
  })
  .public();

export const listMyBuildCollaborationDrafts = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.array(collaborationDraftSummaryValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const ownedDrafts = await ctx.db
      .query("buildCollaborationDrafts")
      .withIndex("by_buildId_and_ownerWorkosUserId_and_state", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("ownerWorkosUserId", authorization.viewer.subject)
      )
      .take(100);
    const approvalDrafts = await ctx.db
      .query("buildCollaborationDrafts")
      .withIndex(
        "by_buildId_and_approvalOwnerWorkosUserId_and_state",
        (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("approvalOwnerWorkosUserId", authorization.viewer.subject)
      )
      .take(100);
    const drafts = [
      ...new Map(
        [...ownedDrafts, ...approvalDrafts].map((draft) => [draft._id, draft])
      ).values(),
    ];
    return drafts
      .filter(
        (draft) => draft.state === "active" || draft.state === "scheduled"
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((draft) => ({
        _creationTime: draft._creationTime,
        _id: draft._id,
        approvalOwnerWorkosUserId: draft.approvalOwnerWorkosUserId,
        bundleJson: draft.bundleJson,
        preparedByActorKind: draft.preparedByActorKind,
        preparedByAgent: draft.preparedByAgent ?? false,
        preparedByWorkosUserId: draft.preparedByWorkosUserId,
        revision: draft.revision,
        offlineCapturedAt: draft.offlineCapturedAt,
        scheduleConflictReason: draft.scheduleConflictReason,
        schedulePausedAt: draft.schedulePausedAt,
        scheduledFor: draft.scheduledFor,
        state: draft.state,
        updatedAt: draft.updatedAt,
      }));
  })
  .public();

export const getMyBuildCollaborationDraftIdentity = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.object({ workosUserId: v.string() }))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    return { workosUserId: authorization.viewer.subject };
  })
  .public();

export const discardMyBuildCollaborationDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    draftId: v.id("buildCollaborationDrafts"),
    organizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const draft = await ctx.db.get(args.draftId);
    if (
      !draft ||
      draft.buildId !== authorization.build._id ||
      (draft.ownerWorkosUserId !== authorization.viewer.subject &&
        draft.approvalOwnerWorkosUserId !== authorization.viewer.subject)
    ) {
      throw new Error("Draft not found.");
    }
    if (draft.state === "published") {
      throw new Error("Published drafts cannot be discarded.");
    }
    const now = Date.now();
    await invalidateBuildCollaborationPublicationApprovals(ctx, draft._id, now);
    await reconcileDraftAssetStagingSessions(ctx, {
      authorization,
      draftId: draft._id,
      now,
      retainedAssetIds: [],
    });
    await ctx.db.patch(draft._id, { state: "discarded", updatedAt: now });
    return null;
  })
  .public();

export const approveAndPublishBuildCollaborationDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    draftId: v.id("buildCollaborationDrafts"),
    organizationId: v.string(),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    return await publishBuildCollaborationDraft(ctx, {
      authorization,
      draftId: args.draftId,
      now: Date.now(),
    });
  })
  .public();

function validateOfflineCaptureTimestamp(
  value: number | undefined,
  now: number
) {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value <= 0 || value > now + 5 * 60 * 1000) {
    throw new Error("The offline draft capture timestamp is invalid.");
  }
}

async function requireHumanApprovalOwner(
  ctx: MutationCtx,
  input: {
    approvalOwnerWorkosUserId: string;
    authorization: ActiveBuildAuthorization;
  }
) {
  if (
    input.authorization.viewer.actorKind === "human" &&
    input.authorization.viewer.subject === input.approvalOwnerWorkosUserId
  ) {
    return input.authorization;
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", input.approvalOwnerWorkosUserId)
    )
    .unique();
  if (!user || user.status === "deleted") {
    throw new Error("The requested human approval owner is unavailable.");
  }
  const participant = input.authorization.participants.find(
    (candidate) => candidate.workosUserId === input.approvalOwnerWorkosUserId
  );
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (query) =>
      query.eq("workosUserId", input.approvalOwnerWorkosUserId)
    )
    .take(100);
  const membership = memberships.find(
    (candidate) =>
      candidate.workosOrganizationId === input.authorization.organizationId &&
      candidate.status === "active"
  );
  if (!(participant || membership)) {
    throw new Error(
      "The requested human approval owner cannot access this Build."
    );
  }
  const roles = [
    ...new Set(
      [
        participant?.role,
        membership?.roleSlug,
        ...(membership?.roleSlugs ?? []),
      ]
        .flatMap((role) => normalizeRoleSlugs([role]))
        .map(normalizeBuildCollaborationRole)
        .filter((role) => role !== null)
    ),
  ];
  const effectiveRole = resolveEffectiveCollaborationRole(roles);
  if (!effectiveRole) {
    throw new Error(
      "The requested human approval owner has no collaboration role."
    );
  }
  const humanParticipants = input.authorization.participants.filter(
    (candidate) => candidate.workosUserId !== input.authorization.viewer.subject
  );
  const participants = humanParticipants.some(
    (candidate) => candidate.workosUserId === input.approvalOwnerWorkosUserId
  )
    ? humanParticipants
    : [
        ...humanParticipants,
        {
          displayName: user.name || user.email,
          participationPeriod: 1,
          role: effectiveRole.role,
          source: "derived" as const,
          workosUserId: input.approvalOwnerWorkosUserId,
        },
      ];
  return {
    ...input.authorization,
    effectiveRole,
    participants,
    roles,
    viewer: {
      ...input.authorization.viewer,
      actorKind: "human" as const,
      email: user.email,
      roles: normalizeRoleSlugs([
        membership?.roleSlug,
        ...(membership?.roleSlugs ?? []),
      ]),
      subject: input.approvalOwnerWorkosUserId,
    },
  };
}
