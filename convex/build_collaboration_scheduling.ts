import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  prepareBuildCollaborationPublication,
  publishBuildCollaborationBundle,
} from "./build_collaboration";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { requireBuildCollaborationWritable } from "./build_collaboration_lifecycle_state";
import {
  type BuildCollaborationPublicationBundle,
  canonicalPublicationBundleJson,
  publicationBundleHash,
} from "./build_collaboration_publication_bundle";
import { authorizeBuildCollaborationRecipient } from "./build_collaboration_recipient_access";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  classifyScheduledPublicationFailure,
  scheduledPublicationMaterialConflict,
  scheduledPublicationOperationalFailure,
} from "./build_collaboration_scheduling_errors";
import { internalAction, internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx } from "./types";

const MAX_CONFLICT_REASON_LENGTH = 500;
const MAX_SCHEDULE_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const MIN_SCHEDULE_DELAY_MS = 60_000;
const SCHEDULE_BATCH_SIZE = 25;

export const getBuildCollaborationSchedulingCapabilities = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      canSchedule: v.boolean(),
      role: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    return {
      canSchedule:
        authorization.viewer.actorKind === "human" &&
        authorization.effectiveRole.tier >= 3,
      role: authorization.effectiveRole.role,
    };
  })
  .public();

export const approveAndScheduleBuildCollaborationDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    draftId: v.id("buildCollaborationDrafts"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    scheduledFor: v.number(),
  })
  .returns(v.id("buildCollaborationPublicationApprovals"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    assertCoordinatingRole(authorization.effectiveRole.tier);
    const now = Date.now();
    assertScheduledFor(args.scheduledFor, now);
    const draft = await requireSchedulableDraft(ctx, {
      approvalOwnerWorkosUserId: authorization.viewer.subject,
      buildId: authorization.build._id,
      draftId: args.draftId,
      expectedRevision: args.expectedRevision,
    });
    const { bundle, bundleJson } = await revalidateExactDraftBundle(ctx, {
      authorization,
      draft,
    });
    assertSchedulablePostType(bundle.postType);
    await invalidateCurrentApprovals(ctx, draft._id, now);
    const approvalHash = await scheduledApprovalHash({
      approvingWorkosUserId: authorization.viewer.subject,
      bundleHash: draft.bundleHash,
      draftId: draft._id,
      draftRevision: draft.revision,
      scheduledFor: args.scheduledFor,
    });
    const approvalId = await ctx.db.insert(
      "buildCollaborationPublicationApprovals",
      {
        approvalHash,
        approvedAt: now,
        approvingActorKind: "human",
        approvingRole: authorization.effectiveRole.role,
        approvingRoles: authorization.roles,
        approvingWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        bundleHash: draft.bundleHash,
        bundleJsonSnapshot: bundleJson,
        draftId: draft._id,
        draftRevision: draft.revision,
        executionAttemptCount: 0,
        mutationSummaryJson: JSON.stringify({
          actionItemCount: bundle.actionItems.length,
          attachmentAssetCount: bundle.attachmentAssetIds.length,
          notificationEffectCount: bundle.effectiveNotificationEffects.length,
          referenceCount: bundle.references.length,
          sharedMutationCount: bundle.sharedMutations.length,
        }),
        organizationId: authorization.organizationId,
        readerSummaryJson: JSON.stringify({
          audienceMode: bundle.audienceMode,
          effectiveReaderIds: bundle.effectiveReaderIds,
          excludedReaderIds: bundle.excludedReaderIds,
          mandatoryReaderIds: bundle.mandatoryReaderIds,
          requestedReaderIds: bundle.requestedReaderIds,
        }),
        scheduledFor: args.scheduledFor,
        state: "approved",
      }
    );
    await ctx.db.patch(draft._id, {
      scheduleConflictReason: undefined,
      schedulePausedAt: undefined,
      scheduledFor: args.scheduledFor,
      state: "scheduled",
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "approveAndScheduleBuildCollaborationDraft",
      createdAt: now,
      entityId: approvalId,
      entityType: "buildCollaborationPublicationApproval",
      eventType: "build.collaboration.publication.scheduled",
      newState: JSON.stringify({
        bundleHash: draft.bundleHash,
        draftId: draft._id,
        draftRevision: draft.revision,
        scheduledFor: args.scheduledFor,
      }),
      organizationId: authorization.organizationId,
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "build.collaboration.publication.scheduled",
      organizationId: authorization.organizationId,
      payloadPreview: JSON.stringify({
        approvalId,
        draftId: draft._id,
        draftRevision: draft.revision,
        scheduledFor: args.scheduledFor,
      }),
      relatedEntityId: approvalId,
      relatedEntityType: "buildCollaborationPublicationApproval",
      status: "pending",
    });
    await ctx.scheduler.runAt(
      args.scheduledFor,
      internal.build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId }
    );
    return approvalId;
  })
  .public();

export const executeScheduledBuildCollaborationPublication = internalAction
  .input({
    approvalId: v.id("buildCollaborationPublicationApprovals"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    try {
      await ctx.runMutation(
        internal.build_collaboration_scheduling
          .publishScheduledBuildCollaborationDraft,
        args
      );
    } catch (error) {
      const failure = classifyScheduledPublicationFailure(error);
      if (failure.kind === "conflict") {
        await ctx.runMutation(
          internal.build_collaboration_scheduling
            .pauseScheduledBuildCollaborationDraft,
          {
            approvalId: args.approvalId,
            conflictReason: failure.message,
          }
        );
      } else {
        await ctx.runMutation(
          internal.build_collaboration_scheduling
            .recordRetryableScheduledBuildCollaborationFailure,
          {
            approvalId: args.approvalId,
            failureReason: failure.message,
          }
        );
      }
    }
    return null;
  })
  .internal();

export const recordRetryableScheduledBuildCollaborationFailure =
  internalMutation
    .input({
      approvalId: v.id("buildCollaborationPublicationApprovals"),
      failureReason: v.string(),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const approval = await ctx.db.get(args.approvalId);
      if (!approval || approval.state !== "approved") {
        return null;
      }
      const now = Date.now();
      const failureReason = normalizedConflictReason(args.failureReason);
      await ctx.db.patch(approval._id, {
        executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
        lastExecutionAt: now,
        lastExecutionError: failureReason,
      });
      await ctx.db.insert("auditEvents", {
        actorRoles: ["system"],
        actorWorkosUserId: "system:build-collaboration-scheduler",
        brokerageId: approval.brokerageId,
        command: "recordRetryableScheduledBuildCollaborationFailure",
        createdAt: now,
        entityId: approval._id,
        entityType: "buildCollaborationPublicationApproval",
        eventType: "build.collaboration.publication.schedule_retryable_failure",
        newState: JSON.stringify({
          executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
          lastExecutionAt: now,
          state: "approved",
        }),
        organizationId: approval.organizationId,
        priorState: JSON.stringify({ state: approval.state }),
        reason: failureReason,
        warnings: [failureReason],
      });
      await ctx.db.insert("eventOutbox", {
        brokerageId: approval.brokerageId,
        createdAt: now,
        eventType: "build.collaboration.publication.schedule_retryable_failure",
        organizationId: approval.organizationId,
        payloadPreview: JSON.stringify({
          approvalId: approval._id,
          executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
          failureReason,
          lastExecutionAt: now,
        }),
        relatedEntityId: approval._id,
        relatedEntityType: "buildCollaborationPublicationApproval",
        status: "pending",
      });
      return null;
    })
    .internal();

export const processDueBuildCollaborationScheduledPublications =
  internalMutation
    .input({
      asOf: v.optional(v.number()),
      cursor: v.optional(v.union(v.string(), v.null())),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const asOf = args.asOf ?? Date.now();
      const page = await ctx.db
        .query("buildCollaborationPublicationApprovals")
        .withIndex("by_state_and_scheduledFor", (query) =>
          query.eq("state", "approved").lte("scheduledFor", asOf)
        )
        .paginate({
          cursor: args.cursor ?? null,
          numItems: SCHEDULE_BATCH_SIZE,
        });
      for (const approval of page.page) {
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_scheduling
            .executeScheduledBuildCollaborationPublication,
          { approvalId: approval._id }
        );
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_scheduling
            .processDueBuildCollaborationScheduledPublications,
          { asOf, cursor: page.continueCursor }
        );
      }
      return null;
    })
    .internal();

export const publishScheduledBuildCollaborationDraft = internalMutation
  .input({
    approvalId: v.id("buildCollaborationPublicationApprovals"),
  })
  .returns(v.union(v.id("buildCollaborationPosts"), v.null()))
  .handler(async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return null;
    }
    if (approval.state === "published") {
      return approval.postId ?? null;
    }
    if (approval.state !== "approved") {
      return null;
    }
    const now = Date.now();
    if (!approval.scheduledFor || approval.scheduledFor > now) {
      throw scheduledPublicationOperationalFailure(
        "The approved publication is not due yet."
      );
    }
    const { audience, authorization, bundle, draft } =
      await revalidateScheduledPublication(ctx, approval);
    const postId = await publishBuildCollaborationBundle(ctx, {
      agentDrafted: draft.preparedByAgent ?? false,
      audience,
      authorization,
      bundle,
    });
    await ctx.db.patch(approval._id, {
      executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
      lastExecutionAt: now,
      lastExecutionError: undefined,
      postId,
      publishedAt: now,
      state: "published",
    });
    await ctx.db.patch(draft._id, {
      scheduleConflictReason: undefined,
      schedulePausedAt: undefined,
      state: "published",
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "publishScheduledBuildCollaborationDraft",
      createdAt: now,
      entityId: approval._id,
      entityType: "buildCollaborationPublicationApproval",
      eventType: "build.collaboration.publication.schedule_executed",
      newState: JSON.stringify({ postId, publishedAt: now }),
      organizationId: authorization.organizationId,
      priorState: JSON.stringify({
        scheduledFor: approval.scheduledFor,
        state: approval.state,
      }),
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "build.collaboration.publication.schedule_executed",
      organizationId: authorization.organizationId,
      payloadPreview: JSON.stringify({
        approvalId: approval._id,
        postId,
        publishedAt: now,
      }),
      relatedEntityId: approval._id,
      relatedEntityType: "buildCollaborationPublicationApproval",
      status: "pending",
    });
    return postId;
  })
  .internal();

export const pauseScheduledBuildCollaborationDraft = internalMutation
  .input({
    approvalId: v.id("buildCollaborationPublicationApprovals"),
    conflictReason: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.state !== "approved") {
      return null;
    }
    const now = Date.now();
    const conflictReason = normalizedConflictReason(args.conflictReason);
    await ctx.db.patch(approval._id, {
      conflictReason,
      executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
      lastExecutionAt: now,
      pausedAt: now,
      state: "paused",
    });
    const draft = await ctx.db.get(approval.draftId);
    if (draft && draft.state === "scheduled") {
      await ctx.db.patch(draft._id, {
        scheduleConflictReason: conflictReason,
        schedulePausedAt: now,
        state: "active",
        updatedAt: now,
      });
    }
    await ctx.db.insert("auditEvents", {
      actorRoles: approval.approvingRoles ?? [],
      actorWorkosUserId: approval.approvingWorkosUserId,
      brokerageId: approval.brokerageId,
      command: "pauseScheduledBuildCollaborationDraft",
      createdAt: now,
      entityId: approval._id,
      entityType: "buildCollaborationPublicationApproval",
      eventType: "build.collaboration.publication.schedule_paused",
      newState: JSON.stringify({ conflictReason, state: "paused" }),
      organizationId: approval.organizationId,
      priorState: JSON.stringify({ state: approval.state }),
      reason: conflictReason,
      warnings: [conflictReason],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: approval.brokerageId,
      createdAt: now,
      eventType: "build.collaboration.publication.schedule_paused",
      organizationId: approval.organizationId,
      payloadPreview: JSON.stringify({
        approvalId: approval._id,
        conflictReason,
        draftId: approval.draftId,
      }),
      relatedEntityId: approval._id,
      relatedEntityType: "buildCollaborationPublicationApproval",
      status: "pending",
    });
    return null;
  })
  .internal();

async function requireSchedulableDraft(
  ctx: MutationCtx,
  input: {
    approvalOwnerWorkosUserId: string;
    buildId: Id<"activeBuilds">;
    draftId: Id<"buildCollaborationDrafts">;
    expectedRevision: number;
  }
) {
  const draft = await ctx.db.get(input.draftId);
  if (
    !draft ||
    draft.buildId !== input.buildId ||
    (draft.approvalOwnerWorkosUserId ?? draft.ownerWorkosUserId) !==
      input.approvalOwnerWorkosUserId
  ) {
    throw new Error("Draft not found.");
  }
  if (draft.state !== "active") {
    throw new Error("Only an active private draft can be scheduled.");
  }
  if (draft.revision !== input.expectedRevision) {
    throw new Error(
      `Draft revision conflict: expected revision ${input.expectedRevision} but found ${draft.revision}. Review the latest private draft before scheduling.`
    );
  }
  return draft;
}

async function requireApprovedScheduledDraft(
  ctx: MutationCtx,
  approval: Doc<"buildCollaborationPublicationApprovals">
) {
  const draft = await ctx.db.get(approval.draftId);
  if (
    !draft ||
    draft.organizationId !== approval.organizationId ||
    draft.brokerageId !== approval.brokerageId ||
    draft.buildId !== approval.buildId ||
    draft.state !== "scheduled" ||
    draft.scheduledFor !== approval.scheduledFor ||
    draft.revision !== approval.draftRevision ||
    draft.bundleHash !== approval.bundleHash ||
    draft.bundleJson !== approval.bundleJsonSnapshot
  ) {
    throw new Error(
      "The scheduled draft changed after approval. Renew human approval before publishing."
    );
  }
  return draft;
}

async function revalidateScheduledPublication(
  ctx: MutationCtx,
  approval: Doc<"buildCollaborationPublicationApprovals">
) {
  try {
    const draft = await requireApprovedScheduledDraft(ctx, approval);
    await assertApprovalIntegrity(approval, draft);
    const { authorization } = await authorizeBuildCollaborationRecipient(ctx, {
      buildId: approval.buildId,
      organizationId: approval.organizationId,
      workosUserId: approval.approvingWorkosUserId,
    });
    await requireBuildCollaborationWritable(ctx, authorization);
    assertCoordinatingRole(authorization.effectiveRole.tier);
    assertApprovalHierarchyUnchanged(approval, authorization);
    const { audience, bundle } = await revalidateExactDraftBundle(ctx, {
      authorization,
      draft,
    });
    assertSchedulablePostType(bundle.postType);
    return { audience, authorization, bundle, draft };
  } catch (error) {
    throw scheduledPublicationMaterialConflict(error);
  }
}

async function assertApprovalIntegrity(
  approval: Doc<"buildCollaborationPublicationApprovals">,
  draft: Doc<"buildCollaborationDrafts">
) {
  if (
    !(approval.approvalHash && approval.draftRevision && approval.scheduledFor)
  ) {
    throw new Error("The scheduled human approval is incomplete.");
  }
  const expected = await scheduledApprovalHash({
    approvingWorkosUserId: approval.approvingWorkosUserId,
    bundleHash: draft.bundleHash,
    draftId: draft._id,
    draftRevision: draft.revision,
    scheduledFor: approval.scheduledFor,
  });
  if (expected !== approval.approvalHash) {
    throw new Error(
      "The scheduled human approval no longer matches its exact publication bundle."
    );
  }
}

async function revalidateExactDraftBundle(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    draft: Doc<"buildCollaborationDrafts">;
  }
) {
  if (
    (await publicationBundleHash(input.draft.bundleJson)) !==
    input.draft.bundleHash
  ) {
    throw new Error("The private draft bundle failed its integrity check.");
  }
  const storedBundle = JSON.parse(
    input.draft.bundleJson
  ) as BuildCollaborationPublicationBundle;
  const { audience, bundle } = await prepareBuildCollaborationPublication(ctx, {
    authorization: input.authorization,
    bundle: storedBundle,
  });
  const bundleJson = canonicalPublicationBundleJson(bundle);
  if (
    bundleJson !== input.draft.bundleJson ||
    (await publicationBundleHash(bundleJson)) !== input.draft.bundleHash
  ) {
    throw new Error(
      "The approved publication audience, references, assets, assignments, notifications, or revisions changed. Renew human approval."
    );
  }
  return { audience, bundle, bundleJson };
}

async function invalidateCurrentApprovals(
  ctx: MutationCtx,
  draftId: Id<"buildCollaborationDrafts">,
  now: number
) {
  const approvals = await ctx.db
    .query("buildCollaborationPublicationApprovals")
    .withIndex("by_draftId_and_state", (query) => query.eq("draftId", draftId))
    .take(100);
  for (const approval of approvals) {
    if (approval.state === "approved" || approval.state === "paused") {
      await ctx.db.patch(approval._id, {
        invalidatedAt: now,
        state: "invalidated",
      });
    }
  }
}

async function scheduledApprovalHash(input: {
  approvingWorkosUserId: string;
  bundleHash: string;
  draftId: Id<"buildCollaborationDrafts">;
  draftRevision: number;
  scheduledFor: number;
}) {
  return await publicationBundleHash(
    JSON.stringify({
      approvingWorkosUserId: input.approvingWorkosUserId,
      bundleHash: input.bundleHash,
      draftId: input.draftId,
      draftRevision: input.draftRevision,
      scheduledFor: input.scheduledFor,
    })
  );
}

function assertCoordinatingRole(tier: number) {
  if (tier < 3) {
    throw new Error(
      "Only the Builder or lender coordination team may schedule Build collaboration publications."
    );
  }
}

function assertSchedulablePostType(postType: string) {
  if (postType !== "update" && postType !== "announcement") {
    throw new Error("Only Updates and Announcements can be scheduled.");
  }
}

function assertApprovalHierarchyUnchanged(
  approval: Doc<"buildCollaborationPublicationApprovals">,
  authorization: ActiveBuildAuthorization
) {
  const approvedRoles = [...(approval.approvingRoles ?? [])].sort();
  const currentRoles = [...authorization.roles].sort();
  if (
    approval.approvingActorKind !== "human" ||
    approval.approvingRole !== authorization.effectiveRole.role ||
    JSON.stringify(approvedRoles) !== JSON.stringify(currentRoles)
  ) {
    throw new Error(
      "The approving human's Build collaboration hierarchy changed. Renew human approval."
    );
  }
}

function assertScheduledFor(scheduledFor: number, now: number) {
  if (
    !Number.isFinite(scheduledFor) ||
    scheduledFor < now + MIN_SCHEDULE_DELAY_MS ||
    scheduledFor > now + MAX_SCHEDULE_HORIZON_MS
  ) {
    throw new Error(
      "Scheduled publication time must be at least one minute in the future and within two years."
    );
  }
}

function normalizedConflictReason(value: string) {
  return (
    value.trim().slice(0, MAX_CONFLICT_REASON_LENGTH) ||
    "Scheduled publication revalidation failed."
  );
}
