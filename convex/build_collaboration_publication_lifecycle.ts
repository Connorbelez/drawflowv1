import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  prepareBuildCollaborationPublication,
  publishBuildCollaborationBundle,
} from "./build_collaboration";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { requireBuildCollaborationWritable } from "./build_collaboration_lifecycle_state";
import type { BuildCollaborationPublicationBundle } from "./build_collaboration_publication_bundle";
import {
  canonicalPublicationBundleJson,
  publicationBundleHash,
} from "./build_collaboration_publication_bundle";
import { authorizeBuildCollaborationRecipient } from "./build_collaboration_recipient_access";
import type { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  scheduledPublicationMaterialConflict,
  scheduledPublicationOperationalFailure,
} from "./build_collaboration_scheduling_errors";
import {
  buildCollaborationValidationError,
  isBuildCollaborationValidationError,
} from "./build_collaboration_validation";
import type { Doc, Id, MutationCtx } from "./types";

type DraftId = Id<"buildCollaborationDrafts">;
type ApprovalId = Id<"buildCollaborationPublicationApprovals">;
const MAX_CONFLICT_REASON_LENGTH = 500;
const MAX_SCHEDULE_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const MIN_SCHEDULE_DELAY_MS = 60_000;

/**
 * The scheduler is an inbound-adapter concern. Keeping its function reference
 * out of this module makes the lifecycle callable from both public and
 * internal adapters without importing generated Convex registration APIs.
 */
export type ScheduleBuildCollaborationPublication = (
  scheduledFor: number,
  approvalId: ApprovalId
) => Promise<unknown>;

export async function invalidateBuildCollaborationPublicationApprovals(
  ctx: MutationCtx,
  draftId: DraftId,
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

export async function publishBuildCollaborationDraft(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    draftId: DraftId;
    now: number;
  }
) {
  const { authorization } = input;
  await requireHumanCollaborationActor(ctx, authorization);
  const draft = await ctx.db.get(input.draftId);
  if (
    !draft ||
    draft.buildId !== authorization.build._id ||
    (draft.approvalOwnerWorkosUserId ?? draft.ownerWorkosUserId) !==
      authorization.viewer.subject
  ) {
    throw new Error("Draft not found.");
  }
  if (draft.state === "published" || draft.state === "discarded") {
    throw new Error("This draft is no longer publishable.");
  }
  if (draft.state === "scheduled" || draft.scheduledFor !== undefined) {
    throw new Error(
      "Scheduled drafts must execute through their approved schedule or be edited to invalidate that approval."
    );
  }
  if ((await publicationBundleHash(draft.bundleJson)) !== draft.bundleHash) {
    throw new Error(
      "The draft changed after review. Review the latest revision before publishing."
    );
  }

  const storedBundle = JSON.parse(
    draft.bundleJson
  ) as BuildCollaborationPublicationBundle;
  const { audience, bundle } = await prepareBuildCollaborationPublication(ctx, {
    authorization,
    bundle: storedBundle,
  });
  const effectiveBundleJson = canonicalPublicationBundleJson(bundle);
  if (
    effectiveBundleJson !== draft.bundleJson ||
    (await publicationBundleHash(effectiveBundleJson)) !== draft.bundleHash
  ) {
    throw new Error(
      "The draft changed after review. Review the latest revision before publishing."
    );
  }

  const approvalId = draft.preparedByAgent
    ? await ctx.db.insert("buildCollaborationPublicationApprovals", {
        approvedAt: input.now,
        approvingActorKind: authorization.viewer.actorKind,
        approvingRole: authorization.effectiveRole.role,
        approvingRoles: authorization.roles,
        approvingWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        bundleHash: draft.bundleHash,
        bundleJsonSnapshot: draft.bundleJson,
        draftId: draft._id,
        draftRevision: draft.revision,
        mutationSummaryJson: publicationMutationSummaryJson(bundle),
        organizationId: authorization.organizationId,
        readerSummaryJson: publicationReaderSummaryJson(bundle),
        scheduledFor: draft.scheduledFor,
        state: "approved",
      })
    : null;
  const postId = await publishBuildCollaborationBundle(ctx, {
    agentDrafted: draft.preparedByAgent ?? false,
    audience,
    authorization,
    bundle,
  });
  if (approvalId) {
    await ctx.db.patch(approvalId, {
      postId,
      publishedAt: input.now,
      state: "published",
    });
  }
  await ctx.db.patch(draft._id, {
    state: "published",
    updatedAt: input.now,
  });
  return postId;
}

export async function approveAndScheduleBuildCollaborationDraft(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    draftId: DraftId;
    expectedRevision: number;
    now: number;
    scheduledFor: number;
    schedulePublication: ScheduleBuildCollaborationPublication;
  }
) {
  const { authorization } = input;
  await requireHumanCollaborationActor(ctx, authorization);
  assertCoordinatingRole(authorization.effectiveRole.tier);
  assertScheduledFor(input.scheduledFor, input.now);
  const draft = await requireSchedulableDraft(ctx, {
    approvalOwnerWorkosUserId: authorization.viewer.subject,
    buildId: authorization.build._id,
    draftId: input.draftId,
    expectedRevision: input.expectedRevision,
  });
  const { bundle, bundleJson } = await revalidateExactDraftBundle(ctx, {
    authorization,
    draft,
  });
  assertSchedulablePostType(bundle.postType);
  await invalidateBuildCollaborationPublicationApprovals(
    ctx,
    draft._id,
    input.now
  );
  const approvalHash = await scheduledApprovalHash({
    approvingWorkosUserId: authorization.viewer.subject,
    bundleHash: draft.bundleHash,
    draftId: draft._id,
    draftRevision: draft.revision,
    scheduledFor: input.scheduledFor,
  });
  const approvalId = await ctx.db.insert(
    "buildCollaborationPublicationApprovals",
    {
      approvalHash,
      approvedAt: input.now,
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
      mutationSummaryJson: publicationMutationSummaryJson(bundle),
      organizationId: authorization.organizationId,
      readerSummaryJson: publicationReaderSummaryJson(bundle),
      scheduledFor: input.scheduledFor,
      state: "approved",
    }
  );
  await ctx.db.patch(draft._id, {
    scheduleConflictReason: undefined,
    schedulePausedAt: undefined,
    scheduledFor: input.scheduledFor,
    state: "scheduled",
    updatedAt: input.now,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command: "approveAndScheduleBuildCollaborationDraft",
    createdAt: input.now,
    entityId: approvalId,
    entityType: "buildCollaborationPublicationApproval",
    eventType: "build.collaboration.publication.scheduled",
    newState: JSON.stringify({
      bundleHash: draft.bundleHash,
      draftId: draft._id,
      draftRevision: draft.revision,
      scheduledFor: input.scheduledFor,
    }),
    organizationId: authorization.organizationId,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: input.now,
    eventType: "build.collaboration.publication.scheduled",
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({
      approvalId,
      draftId: draft._id,
      draftRevision: draft.revision,
      scheduledFor: input.scheduledFor,
    }),
    relatedEntityId: approvalId,
    relatedEntityType: "buildCollaborationPublicationApproval",
    status: "pending",
  });
  await input.schedulePublication(input.scheduledFor, approvalId);
  return approvalId;
}

export async function publishScheduledBuildCollaborationDraft(
  ctx: MutationCtx,
  input: { approvalId: ApprovalId; now: number }
) {
  const approval = await ctx.db.get(input.approvalId);
  if (!approval) {
    return null;
  }
  if (approval.state === "published") {
    return approval.postId ?? null;
  }
  if (approval.state !== "approved") {
    return null;
  }
  if (
    !(approval.scheduledFor && Number.isFinite(approval.scheduledFor)) ||
    approval.scheduledFor <= 0
  ) {
    throw scheduledPublicationMaterialConflict(
      new Error("The approved publication target is missing or invalid.")
    );
  }
  if (approval.scheduledFor > input.now) {
    throw scheduledPublicationOperationalFailure(
      "The approved publication is not due yet."
    );
  }
  const { audience, authorization, bundle, draft } =
    await revalidateScheduledPublication(ctx, approval);
  const postId = await revalidateMaterialBoundary(() =>
    publishBuildCollaborationBundle(ctx, {
      agentDrafted: draft.preparedByAgent ?? false,
      audience,
      authorization,
      bundle,
    })
  );
  await ctx.db.patch(approval._id, {
    executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
    lastExecutionAt: input.now,
    lastExecutionError: undefined,
    postId,
    publishedAt: input.now,
    state: "published",
  });
  await ctx.db.patch(draft._id, {
    scheduleConflictReason: undefined,
    schedulePausedAt: undefined,
    state: "published",
    updatedAt: input.now,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command: "publishScheduledBuildCollaborationDraft",
    createdAt: input.now,
    entityId: approval._id,
    entityType: "buildCollaborationPublicationApproval",
    eventType: "build.collaboration.publication.schedule_executed",
    newState: JSON.stringify({ postId, publishedAt: input.now }),
    organizationId: authorization.organizationId,
    priorState: JSON.stringify({
      scheduledFor: approval.scheduledFor,
      state: approval.state,
    }),
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: input.now,
    eventType: "build.collaboration.publication.schedule_executed",
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({
      approvalId: approval._id,
      postId,
      publishedAt: input.now,
    }),
    relatedEntityId: approval._id,
    relatedEntityType: "buildCollaborationPublicationApproval",
    status: "pending",
  });
  return postId;
}

export async function recordRetryableScheduledBuildCollaborationFailure(
  ctx: MutationCtx,
  input: { approvalId: ApprovalId; failureReason: string; now: number }
) {
  const approval = await ctx.db.get(input.approvalId);
  if (!approval || approval.state !== "approved") {
    return null;
  }
  const failureReason = normalizedConflictReason(input.failureReason);
  await ctx.db.patch(approval._id, {
    executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
    lastExecutionAt: input.now,
    lastExecutionError: failureReason,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: ["system"],
    actorWorkosUserId: "system:build-collaboration-scheduler",
    brokerageId: approval.brokerageId,
    command: "recordRetryableScheduledBuildCollaborationFailure",
    createdAt: input.now,
    entityId: approval._id,
    entityType: "buildCollaborationPublicationApproval",
    eventType: "build.collaboration.publication.schedule_retryable_failure",
    newState: JSON.stringify({
      failureReason,
      state: approval.state,
    }),
    organizationId: approval.organizationId,
    priorState: JSON.stringify({
      executionAttemptCount: approval.executionAttemptCount ?? 0,
      lastExecutionError: approval.lastExecutionError,
      state: approval.state,
    }),
    reason: failureReason,
    warnings: [failureReason],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: approval.brokerageId,
    createdAt: input.now,
    eventType: "build.collaboration.publication.schedule_retryable_failure",
    organizationId: approval.organizationId,
    payloadPreview: JSON.stringify({
      approvalId: approval._id,
      failureReason,
    }),
    relatedEntityId: approval._id,
    relatedEntityType: "buildCollaborationPublicationApproval",
    status: "pending",
  });
  return null;
}

export async function pauseScheduledBuildCollaborationDraft(
  ctx: MutationCtx,
  input: { approvalId: ApprovalId; conflictReason: string; now: number }
) {
  const approval = await ctx.db.get(input.approvalId);
  if (!approval || approval.state !== "approved") {
    return null;
  }
  const conflictReason = normalizedConflictReason(input.conflictReason);
  await ctx.db.patch(approval._id, {
    conflictReason,
    executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
    lastExecutionAt: input.now,
    pausedAt: input.now,
    state: "paused",
  });
  const draft = await ctx.db.get(approval.draftId);
  if (draft && draft.state === "scheduled") {
    await ctx.db.patch(draft._id, {
      scheduleConflictReason: conflictReason,
      schedulePausedAt: input.now,
      state: "active",
      updatedAt: input.now,
    });
  }
  await ctx.db.insert("auditEvents", {
    actorRoles: approval.approvingRoles ?? [],
    actorWorkosUserId: approval.approvingWorkosUserId,
    brokerageId: approval.brokerageId,
    command: "pauseScheduledBuildCollaborationDraft",
    createdAt: input.now,
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
    createdAt: input.now,
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
}

function publicationMutationSummaryJson(
  bundle: BuildCollaborationPublicationBundle
) {
  return JSON.stringify({
    actionItemCount: bundle.actionItems.length,
    attachmentAssetCount: bundle.attachmentAssetIds.length,
    notificationEffectCount: bundle.effectiveNotificationEffects.length,
    referenceCount: bundle.references.length,
    sharedMutationCount: bundle.sharedMutations.length,
  });
}

function publicationReaderSummaryJson(
  bundle: BuildCollaborationPublicationBundle
) {
  return JSON.stringify({
    audienceMode: bundle.audienceMode,
    effectiveReaderIds: bundle.effectiveReaderIds,
    excludedReaderIds: bundle.excludedReaderIds,
    mandatoryReaderIds: bundle.mandatoryReaderIds,
    requestedReaderIds: bundle.requestedReaderIds,
  });
}

async function requireSchedulableDraft(
  ctx: MutationCtx,
  input: {
    approvalOwnerWorkosUserId: string;
    buildId: Id<"activeBuilds">;
    draftId: DraftId;
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
    throw scheduledPublicationMaterialConflict(
      new Error(
        "The scheduled draft changed after approval. Renew human approval before publishing."
      )
    );
  }
  return draft;
}

async function revalidateScheduledPublication(
  ctx: MutationCtx,
  approval: Doc<"buildCollaborationPublicationApprovals">
) {
  const draft = await requireApprovedScheduledDraft(ctx, approval);
  await assertApprovalIntegrity(approval, draft);
  const { authorization } = await revalidateMaterialBoundary(() =>
    authorizeBuildCollaborationRecipient(ctx, {
      buildId: approval.buildId,
      organizationId: approval.organizationId,
      workosUserId: approval.approvingWorkosUserId,
    })
  );
  await revalidateMaterialBoundary(() =>
    requireBuildCollaborationWritable(ctx, authorization)
  );
  assertCoordinatingRole(authorization.effectiveRole.tier);
  assertApprovalHierarchyUnchanged(approval, authorization);
  const { audience, bundle } = await revalidateExactDraftBundle(ctx, {
    authorization,
    draft,
  });
  assertSchedulablePostType(bundle.postType);
  return { audience, authorization, bundle, draft };
}

export async function revalidateMaterialBoundary<T>(
  operation: () => Promise<T> | T
) {
  try {
    return await operation();
  } catch (error) {
    if (isBuildCollaborationValidationError(error)) {
      throw scheduledPublicationMaterialConflict(error);
    }
    throw error;
  }
}

async function assertApprovalIntegrity(
  approval: Doc<"buildCollaborationPublicationApprovals">,
  draft: Doc<"buildCollaborationDrafts">
) {
  if (
    !(approval.approvalHash && approval.draftRevision && approval.scheduledFor)
  ) {
    throw scheduledPublicationMaterialConflict(
      new Error("The scheduled human approval is incomplete.")
    );
  }
  const expected = await scheduledApprovalHash({
    approvingWorkosUserId: approval.approvingWorkosUserId,
    bundleHash: draft.bundleHash,
    draftId: draft._id,
    draftRevision: draft.revision,
    scheduledFor: approval.scheduledFor,
  });
  if (expected !== approval.approvalHash) {
    throw scheduledPublicationMaterialConflict(
      new Error(
        "The scheduled human approval no longer matches its exact publication bundle."
      )
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
    throw scheduledPublicationMaterialConflict(
      new Error("The private draft bundle failed its integrity check.")
    );
  }
  const storedBundle = (await revalidateMaterialBoundary(() => {
    try {
      return JSON.parse(input.draft.bundleJson);
    } catch {
      throw buildCollaborationValidationError(
        "The approved private draft bundle is not valid JSON."
      );
    }
  })) as BuildCollaborationPublicationBundle;
  const { audience, bundle } = await revalidateMaterialBoundary(() =>
    prepareBuildCollaborationPublication(ctx, {
      authorization: input.authorization,
      bundle: storedBundle,
    })
  );
  const bundleJson = canonicalPublicationBundleJson(bundle);
  if (
    bundleJson !== input.draft.bundleJson ||
    (await publicationBundleHash(bundleJson)) !== input.draft.bundleHash
  ) {
    throw scheduledPublicationMaterialConflict(
      new Error(
        "The approved publication audience, references, assets, assignments, notifications, or revisions changed. Renew human approval."
      )
    );
  }
  return { audience, bundle, bundleJson };
}

async function scheduledApprovalHash(input: {
  approvingWorkosUserId: string;
  bundleHash: string;
  draftId: DraftId;
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
    throw scheduledPublicationMaterialConflict(
      new Error(
        "Only the Builder or lender coordination team may schedule Build collaboration publications."
      )
    );
  }
}

function assertSchedulablePostType(postType: string) {
  if (postType !== "update" && postType !== "announcement") {
    throw scheduledPublicationMaterialConflict(
      new Error("Only Updates and Announcements can be scheduled.")
    );
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
    throw scheduledPublicationMaterialConflict(
      new Error(
        "The approving human's Build collaboration hierarchy changed. Renew human approval."
      )
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
