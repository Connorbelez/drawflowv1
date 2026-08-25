import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import {
  canReadCollaborationPost,
  canSeeCollaborationReceipt,
  resolveCurrentCollaborationPostReaderIds,
} from "../build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "../build_collaboration_actor";
import { projectCollaborationRevisionForViewer } from "../build_collaboration_content";
import { canReadDrawCoordination } from "../build_draw_coordination";
import { requireHumanCollaborationActor } from "../build_collaboration_human";
import {
  type BuildCollaborationRole,
  buildCollaborationRoles,
  collaborationRoleTier,
  resolveEffectiveCollaborationRole,
} from "../build_collaboration_model";
import {
  type BuildCollaborationReferenceKind,
  type CanonicalBuildCollaborationReference,
  resolveCurrentBuildCollaborationReference,
} from "../build_collaboration_references";
import { reopenQuestionForUnavailableAcceptedAnswer } from "../build_collaboration_resolution";
import { authorizeActiveBuildCollaborationAccess } from "../build_collaboration_rollout";
import { queueBuildCollaborationSearchOwnerRebuild } from "../build_collaboration_search_maintenance";
import {
  buildCollaborationAttachmentKindValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
} from "../build_collaboration_validators";
import { emitBuildCollaborationWebhookEvent } from "../build_collaboration_webhooks";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

const MAX_REASON_LENGTH = 2000;
const moderationEntityKindValidator = v.union(
  v.literal("post"),
  v.literal("comment")
);
const moderationStatusValidator = v.union(
  v.literal("moderated"),
  v.literal("appealed"),
  v.literal("restored"),
  v.literal("final_retained")
);
const moderationContextValidator = v.object({
  canAppeal: v.boolean(),
  canModerate: v.boolean(),
  canResolveAppeal: v.boolean(),
  caseId: v.optional(v.id("buildCollaborationModerationCases")),
  currentReason: v.optional(v.string()),
  evidence: v.optional(
    v.object({
      attachments: v.array(
        v.object({
          attachmentKind: buildCollaborationAttachmentKindValidator,
          href: v.optional(v.string()),
          label: v.string(),
          summary: v.optional(v.string()),
        })
      ),
      plainText: v.string(),
      receipts: v.array(
        v.object({
          displayNameSnapshot: v.string(),
          firstViewedAt: v.number(),
          lastViewedAt: v.number(),
          viewerRole: buildCollaborationRoleValidator,
          workosUserId: v.string(),
        })
      ),
      references: v.array(
        v.object({
          entityKind: buildCollaborationReferenceKindValidator,
          href: v.string(),
          label: v.string(),
          summary: v.string(),
        })
      ),
      tiptapJson: v.string(),
    })
  ),
  events: v.array(
    v.object({
      actorRole: buildCollaborationRoleValidator,
      createdAt: v.number(),
      eventType: v.union(
        v.literal("moderated"),
        v.literal("appealed"),
        v.literal("restored"),
        v.literal("retained")
      ),
      reason: v.string(),
    })
  ),
  status: v.optional(moderationStatusValidator),
});

type ModeratedEntity =
  | {
      comment: Doc<"buildCollaborationComments">;
      entityKind: "comment";
      post: Doc<"buildCollaborationPosts">;
    }
  | {
      entityKind: "post";
      post: Doc<"buildCollaborationPosts">;
    };

export async function requireReadableModerationEntity(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  input: { entityId: string; entityKind: "comment" | "post" }
): Promise<ModeratedEntity> {
  if (input.entityKind === "post") {
    const postId = ctx.db.normalizeId(
      "buildCollaborationPosts",
      input.entityId
    );
    const post = postId ? await ctx.db.get(postId) : null;
    if (
      !(post && (await canReadCollaborationPost(ctx, authorization, post))) ||
      (post?.systemPostKind === "draw" &&
        !(await canReadDrawCoordination(ctx, { authorization, post })))
    ) {
      throw new Error("Forbidden: collaboration moderation target");
    }
    return { entityKind: "post", post };
  }
  const commentId = ctx.db.normalizeId(
    "buildCollaborationComments",
    input.entityId
  );
  const comment = commentId ? await ctx.db.get(commentId) : null;
  const post = comment ? await ctx.db.get(comment.postId) : null;
  if (
    !(
      comment &&
      post &&
      (await canReadCollaborationPost(ctx, authorization, post)) &&
      (post.systemPostKind !== "draw" ||
        (await canReadDrawCoordination(ctx, { authorization, post })))
    )
  ) {
    throw new Error("Forbidden: collaboration moderation target");
  }
  return { comment, entityKind: "comment", post };
}

export async function requireModerationCase(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  caseId: Id<"buildCollaborationModerationCases">
) {
  const moderationCase = await ctx.db.get(caseId);
  if (
    !moderationCase ||
    moderationCase.buildId !== authorization.build._id ||
    moderationCase.organizationId !== authorization.organizationId
  ) {
    throw new Error("Forbidden: moderation case");
  }
  return moderationCase;
}

export function requireReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) {
    throw new Error("A moderation reason is required.");
  }
  if (normalized.length > MAX_REASON_LENGTH) {
    throw new Error(
      `A moderation reason may not exceed ${MAX_REASON_LENGTH} characters.`
    );
  }
  return normalized;
}

export async function moderationEvidenceSnapshot(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  entity: ModeratedEntity
) {
  const content = entity.entityKind === "post" ? entity.post : entity.comment;
  const ownerKind =
    entity.entityKind === "post" ? "postRevision" : "commentRevision";
  const revisionId = content.currentRevisionId;
  const [references, attachments, receipts] = await Promise.all([
    revisionId
      ? ctx.db
          .query("buildCollaborationReferences")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query.eq("ownerKind", ownerKind).eq("ownerRecordId", revisionId)
          )
          .take(100)
      : [],
    revisionId
      ? ctx.db
          .query("buildCollaborationAttachments")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query.eq("ownerKind", ownerKind).eq("ownerRecordId", revisionId)
          )
          .take(100)
      : [],
    ctx.db
      .query("buildCollaborationReceipts")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", entity.post._id)
      )
      .take(500),
  ]);
  return JSON.stringify({
    attachmentIds: attachments.map((attachment) => attachment._id),
    contentRevisionId: revisionId,
    receiptSnapshots: await Promise.all(
      receipts.map(async (receipt) => ({
        buildId: receipt.buildId,
        displayNameSnapshot: await receiptDisplayNameSnapshot(
          ctx,
          authorization,
          receipt.workosUserId
        ),
        firstViewedAt: receipt.firstViewedAt,
        lastViewedAt: receipt.lastViewedAt,
        organizationId: receipt.organizationId,
        postId: receipt.postId,
        viewerRole: receipt.viewerRole,
        workosUserId: receipt.workosUserId,
      }))
    ),
    referenceIds: references.map((reference) => reference._id),
  });
}

interface ModerationEvidenceReceiptSnapshot {
  buildId: string;
  displayNameSnapshot: string;
  firstViewedAt: number;
  lastViewedAt: number;
  organizationId: string;
  postId: string;
  viewerRole: BuildCollaborationRole;
  workosUserId: string;
}

interface ModerationEvidenceSnapshotIds {
  attachmentIds: string[];
  contentRevisionId?: string;
  receiptSnapshots: ModerationEvidenceReceiptSnapshot[];
  referenceIds: string[];
}

interface ModerationProjectedAttachment {
  attachmentKind: "document" | "evidenceAsset" | "collaborationAsset";
  href?: string;
  label: string;
  summary?: string;
}

interface ModerationProjectedReference {
  entityKind: BuildCollaborationReferenceKind;
  href: string;
  label: string;
  summary: string;
}

interface ModerationProjectedReceipt {
  displayNameSnapshot: string;
  firstViewedAt: number;
  lastViewedAt: number;
  viewerRole: BuildCollaborationRole;
  workosUserId: string;
}

export async function moderationEvidenceForViewer(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  entity: ModeratedEntity,
  moderationCase: Doc<"buildCollaborationModerationCases">
) {
  const snapshot = parseModerationEvidenceSnapshot(
    moderationCase.evidenceSnapshotJson
  );
  const revision = await loadModeratedRevision(ctx, entity, snapshot);
  if (!revision) {
    return;
  }
  const { canonicalReferences, references } = await loadModerationReferences(
    ctx,
    authorization,
    entity,
    revision,
    snapshot.referenceIds
  );
  const projected = projectCollaborationRevisionForViewer({
    references: canonicalReferences,
    tiptapJson: revision.tiptapJson,
  });
  const attachments = await loadModerationAttachments(
    ctx,
    authorization,
    entity,
    revision,
    snapshot.attachmentIds
  );
  const receipts = loadModerationReceipts(
    authorization,
    entity,
    snapshot.receiptSnapshots
  );
  return {
    attachments,
    plainText: projected.plainText,
    receipts,
    references,
    tiptapJson: projected.tiptapJson,
  };
}

export async function loadModerationReferences(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  entity: ModeratedEntity,
  revision:
    | Doc<"buildCollaborationPostRevisions">
    | Doc<"buildCollaborationCommentRevisions">,
  rawReferenceIds: string[]
) {
  const canonicalReferences: CanonicalBuildCollaborationReference[] = [];
  const references: ModerationProjectedReference[] = [];
  for (const rawReferenceId of rawReferenceIds) {
    const referenceId = ctx.db.normalizeId(
      "buildCollaborationReferences",
      rawReferenceId
    );
    const reference = referenceId ? await ctx.db.get(referenceId) : null;
    if (
      !reference ||
      reference.buildId !== authorization.build._id ||
      reference.organizationId !== authorization.organizationId ||
      reference.postId !== entity.post._id ||
      reference.ownerKind !==
        (entity.entityKind === "post" ? "postRevision" : "commentRevision") ||
      reference.ownerRecordId !== revision._id
    ) {
      continue;
    }
    try {
      const canonical = await resolveCurrentBuildCollaborationReference(ctx, {
        authorization,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
      });
      canonicalReferences.push({
        ...canonical,
        primary: reference.primary,
      });
      references.push({
        entityKind: reference.entityKind,
        href: canonical.href,
        label: canonical.label,
        summary: canonical.summary,
      });
    } catch {
      // Moderation evidence applies current entity ACLs. Inaccessible linked
      // records are removed and their rich-text nodes are redacted below.
    }
  }
  return { canonicalReferences, references };
}

export async function loadModerationAttachments(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  entity: ModeratedEntity,
  revision:
    | Doc<"buildCollaborationPostRevisions">
    | Doc<"buildCollaborationCommentRevisions">,
  rawAttachmentIds: string[]
) {
  const attachments: ModerationProjectedAttachment[] = [];
  for (const rawAttachmentId of rawAttachmentIds) {
    const attachmentId = ctx.db.normalizeId(
      "buildCollaborationAttachments",
      rawAttachmentId
    );
    const attachment = attachmentId ? await ctx.db.get(attachmentId) : null;
    if (
      !attachment ||
      attachment.buildId !== authorization.build._id ||
      attachment.organizationId !== authorization.organizationId ||
      attachment.ownerKind !==
        (entity.entityKind === "post" ? "postRevision" : "commentRevision") ||
      attachment.ownerRecordId !== revision._id
    ) {
      continue;
    }
    const projectedAttachment = await projectModerationAttachment(
      ctx,
      authorization,
      entity.post,
      attachment
    );
    if (projectedAttachment) {
      attachments.push(projectedAttachment);
    }
  }
  return attachments;
}

export function loadModerationReceipts(
  authorization: ActiveBuildAuthorization,
  entity: ModeratedEntity,
  receiptSnapshots: ModerationEvidenceReceiptSnapshot[]
) {
  const receipts: ModerationProjectedReceipt[] = [];
  for (const receipt of receiptSnapshots) {
    if (
      receipt.postId === entity.post._id &&
      receipt.buildId === authorization.build._id &&
      receipt.organizationId === authorization.organizationId &&
      canSeeCollaborationReceipt(authorization, receipt)
    ) {
      receipts.push({
        displayNameSnapshot: receipt.displayNameSnapshot,
        firstViewedAt: receipt.firstViewedAt,
        lastViewedAt: receipt.lastViewedAt,
        viewerRole: receipt.viewerRole,
        workosUserId: receipt.workosUserId,
      });
    }
  }
  return receipts;
}

export function parseModerationEvidenceSnapshot(
  value: string
): ModerationEvidenceSnapshotIds {
  try {
    const parsed = JSON.parse(value) as Partial<ModerationEvidenceSnapshotIds>;
    return {
      attachmentIds: Array.isArray(parsed.attachmentIds)
        ? parsed.attachmentIds.filter(
            (id): id is string => typeof id === "string"
          )
        : [],
      contentRevisionId:
        typeof parsed.contentRevisionId === "string"
          ? parsed.contentRevisionId
          : undefined,
      receiptSnapshots: Array.isArray(parsed.receiptSnapshots)
        ? parsed.receiptSnapshots.filter(isModerationReceiptSnapshot)
        : [],
      referenceIds: Array.isArray(parsed.referenceIds)
        ? parsed.referenceIds.filter(
            (id): id is string => typeof id === "string"
          )
        : [],
    };
  } catch {
    return { attachmentIds: [], receiptSnapshots: [], referenceIds: [] };
  }
}

export function isModerationReceiptSnapshot(
  value: unknown
): value is ModerationEvidenceReceiptSnapshot {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.buildId === "string" &&
    typeof snapshot.displayNameSnapshot === "string" &&
    typeof snapshot.firstViewedAt === "number" &&
    Number.isFinite(snapshot.firstViewedAt) &&
    typeof snapshot.lastViewedAt === "number" &&
    Number.isFinite(snapshot.lastViewedAt) &&
    typeof snapshot.organizationId === "string" &&
    typeof snapshot.postId === "string" &&
    typeof snapshot.viewerRole === "string" &&
    buildCollaborationRoles.includes(
      snapshot.viewerRole as BuildCollaborationRole
    ) &&
    typeof snapshot.workosUserId === "string"
  );
}

export async function receiptDisplayNameSnapshot(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  workosUserId: string
) {
  const activeParticipant = authorization.participants.find(
    (participant) => participant.workosUserId === workosUserId
  );
  if (activeParticipant) {
    return activeParticipant.displayName;
  }
  const participationPeriods = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId", (query) =>
      query
        .eq("buildId", authorization.build._id)
        .eq("workosUserId", workosUserId)
    )
    .take(100);
  const latestParticipation = participationPeriods.sort(
    (left, right) => right.participationPeriod - left.participationPeriod
  )[0];
  return latestParticipation?.displayNameSnapshot ?? "Build participant";
}

export async function loadModeratedRevision(
  ctx: QueryCtx,
  entity: ModeratedEntity,
  snapshot: ModerationEvidenceSnapshotIds
) {
  if (!snapshot.contentRevisionId) {
    return null;
  }
  if (entity.entityKind === "post") {
    const revisionId = ctx.db.normalizeId(
      "buildCollaborationPostRevisions",
      snapshot.contentRevisionId
    );
    const revision = revisionId ? await ctx.db.get(revisionId) : null;
    return revision?.postId === entity.post._id &&
      revision.buildId === entity.post.buildId &&
      revision.organizationId === entity.post.organizationId
      ? revision
      : null;
  }
  const revisionId = ctx.db.normalizeId(
    "buildCollaborationCommentRevisions",
    snapshot.contentRevisionId
  );
  const revision = revisionId ? await ctx.db.get(revisionId) : null;
  return revision?.commentId === entity.comment._id &&
    revision.postId === entity.post._id &&
    revision.buildId === entity.post.buildId &&
    revision.organizationId === entity.post.organizationId
    ? revision
    : null;
}

export function moderationCaseMatchesEntity(
  moderationCase: Doc<"buildCollaborationModerationCases">,
  authorization: ActiveBuildAuthorization,
  entity: ModeratedEntity
) {
  if (
    moderationCase.organizationId !== authorization.organizationId ||
    moderationCase.brokerageId !== authorization.brokerage._id ||
    moderationCase.buildId !== authorization.build._id ||
    moderationCase.postId !== entity.post._id ||
    moderationCase.entityKind !== entity.entityKind
  ) {
    return false;
  }
  if (entity.entityKind === "post") {
    return (
      moderationCase.entityId === entity.post._id &&
      moderationCase.commentId === undefined
    );
  }
  return (
    moderationCase.entityId === entity.comment._id &&
    moderationCase.commentId === entity.comment._id
  );
}

export async function projectModerationAttachment(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">,
  attachment: Doc<"buildCollaborationAttachments">
) {
  if (
    attachment.attachmentKind === "document" ||
    attachment.attachmentKind === "evidenceAsset"
  ) {
    try {
      const canonical = await resolveCurrentBuildCollaborationReference(ctx, {
        authorization,
        entityId: attachment.attachmentId,
        entityKind:
          attachment.attachmentKind === "document"
            ? "document"
            : "evidenceAsset",
      });
      return {
        attachmentKind: attachment.attachmentKind,
        href: canonical.href,
        label: canonical.label,
        summary: canonical.summary,
      };
    } catch {
      return null;
    }
  }
  const assetId = ctx.db.normalizeId(
    "buildCollaborationAssets",
    attachment.attachmentId
  );
  const asset = assetId ? await ctx.db.get(assetId) : null;
  if (
    !asset ||
    asset.buildId !== authorization.build._id ||
    asset.organizationId !== authorization.organizationId ||
    asset.state !== "available" ||
    !canReadModerationAsset(authorization, post, asset)
  ) {
    return null;
  }
  return {
    attachmentKind: "collaborationAsset" as const,
    href: undefined,
    label: asset.fileName,
    summary: `${asset.mimeType} · ${asset.sizeBytes} bytes`,
  };
}

export function canReadModerationAsset(
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">,
  asset: Doc<"buildCollaborationAssets">
) {
  switch (asset.maximumAudienceMode) {
    case "build_wide":
      return true;
    case "author_tier_and_higher":
      return authorization.effectiveRole.tier >= post.audienceFloorTier;
    case "custom":
      return post.audienceMode === "custom";
  }
}

export async function patchModeratedContent(
  ctx: MutationCtx,
  entity: ModeratedEntity,
  input: {
    caseId: Id<"buildCollaborationModerationCases">;
    reason: string;
    role: BuildCollaborationRole;
    timestamp: number;
    workosUserId: string;
  }
) {
  const patch = {
    activeModerationCaseId: input.caseId,
    contentState: "moderated" as const,
    moderatedAt: input.timestamp,
    moderatedByRole: input.role,
    moderatedByWorkosUserId: input.workosUserId,
    moderationReason: input.reason,
    updatedAt: input.timestamp,
  };
  if (entity.entityKind === "post") {
    await ctx.db.patch(entity.post._id, {
      ...patch,
      readRevision: (entity.post.readRevision ?? entity.post.revision) + 1,
    });
  } else {
    await ctx.db.patch(entity.comment._id, patch);
    await ctx.db.patch(entity.post._id, {
      readRevision: (entity.post.readRevision ?? entity.post.revision) + 1,
      updatedAt: input.timestamp,
    });
  }
}

export async function patchResolvedContent(
  ctx: MutationCtx,
  entity: ModeratedEntity,
  input: { restored: boolean; timestamp: number }
) {
  if (!input.restored) {
    return;
  }
  const patch = {
    activeModerationCaseId: undefined,
    contentState: "active" as const,
    moderatedAt: undefined,
    moderatedByRole: undefined,
    moderatedByWorkosUserId: undefined,
    moderationReason: undefined,
    updatedAt: input.timestamp,
  };
  if (entity.entityKind === "post") {
    await ctx.db.patch(entity.post._id, {
      ...patch,
      readRevision: (entity.post.readRevision ?? entity.post.revision) + 1,
    });
  } else {
    await ctx.db.patch(entity.comment._id, patch);
    await ctx.db.patch(entity.post._id, {
      readRevision: (entity.post.readRevision ?? entity.post.revision) + 1,
      updatedAt: input.timestamp,
    });
  }
}

export async function recordModerationTransition(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    caseId: Id<"buildCollaborationModerationCases">;
    entity: ModeratedEntity;
    eventType: "appealed" | "moderated" | "restored" | "retained";
    newState: string;
    priorState: string;
    reason: string;
    timestamp: number;
  }
) {
  const entityId =
    input.entity.entityKind === "post"
      ? input.entity.post._id
      : input.entity.comment._id;
  const moderationEventId = await ctx.db.insert(
    "buildCollaborationModerationEvents",
    {
      actorRole: input.authorization.effectiveRole.role,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      caseId: input.caseId,
      createdAt: input.timestamp,
      eventType: input.eventType,
      newState: input.newState,
      organizationId: input.authorization.organizationId,
      priorState: input.priorState,
      reason: input.reason,
    }
  );
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: `buildCollaborationModeration.${input.eventType}`,
    createdAt: input.timestamp,
    entityId,
    entityType:
      input.entity.entityKind === "post"
        ? "buildCollaborationPost"
        : "buildCollaborationComment",
    eventType: `build.collaboration.moderation.${input.eventType}`,
    newState: input.newState,
    organizationId: input.authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: [],
  });
  await emitBuildCollaborationWebhookEvent(ctx, {
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    entityId: input.caseId,
    entityType: "moderation_case",
    eventType: "build.collaboration.moderation.changed",
    idempotencyKey: `moderation:${moderationEventId}`,
    metadata: {
      caseId: input.caseId,
      moderationEventId,
      moderationState: input.newState,
      postId: input.entity.post._id,
      subjectEntityId: entityId,
      subjectEntityType: input.entity.entityKind,
      transitionType: input.eventType,
    },
    occurredAt: input.timestamp,
    organizationId: input.authorization.organizationId,
  });
}

export async function notifyModerationAuthor(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    body: string;
    caseId: Id<"buildCollaborationModerationCases">;
    eventKey: string;
    recipientWorkosUserId: string;
    title: string;
  }
) {
  const dedupeKey = `build-collaboration:moderation:${input.caseId}:${input.eventKey}`;
  const existing = await ctx.db
    .query("recipientDeliveries")
    .withIndex("by_recipient_dedupe", (query) =>
      query
        .eq("organizationId", input.authorization.organizationId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
        .eq("dedupeKey", dedupeKey)
    )
    .first();
  if (existing) {
    return;
  }
  const now = Date.now();
  await ctx.db.insert("recipientDeliveries", {
    actionLabel: "Review moderation",
    actionRequired: true,
    body: input.body,
    brokerageId: input.authorization.brokerage._id,
    createdAt: now,
    dedupeKey,
    entityId: input.caseId,
    entityLabel: input.authorization.build.buildName,
    entityType: "buildCollaborationModerationCase",
    href: `/backoffice/builds/${input.authorization.build._id}?tab=details&moderationCase=${input.caseId}`,
    organizationId: input.authorization.organizationId,
    recipientWorkosUserId: input.recipientWorkosUserId,
    resolutionMode: "recipient",
    sourceLabel: "Build collaboration",
    status: "unread",
    title: input.title,
    updatedAt: now,
  });
}

export async function notifyEligibleAppealReviewers(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    caseId: Id<"buildCollaborationModerationCases">;
    minimumTier: number;
    post: Doc<"buildCollaborationPosts">;
    reason: string;
  }
) {
  const readerIds = new Set(
    await resolveCurrentCollaborationPostReaderIds(
      ctx,
      input.authorization,
      input.post
    )
  );
  const recipients = new Set(
    input.authorization.participants
      .filter(
        (participant) =>
          readerIds.has(participant.workosUserId) &&
          collaborationRoleTier(participant.role) >= input.minimumTier
      )
      .map((participant) => participant.workosUserId)
  );
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", input.authorization.organizationId)
    )
    .take(500);
  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }
    const role = resolveEffectiveCollaborationRole([
      membership.roleSlug,
      ...membership.roleSlugs,
    ]);
    if (
      role &&
      (role.role === "admin" || role.role === "principle-broker") &&
      role.tier >= input.minimumTier
    ) {
      recipients.add(membership.workosUserId);
    }
  }
  for (const recipientWorkosUserId of recipients) {
    await notifyModerationAuthor(ctx, {
      authorization: input.authorization,
      body: `A Build collaboration moderation appeal requires review. Reason: ${input.reason}`,
      caseId: input.caseId,
      eventKey: `appeal:${input.minimumTier}`,
      recipientWorkosUserId,
      title: "Build collaboration moderation appeal",
    });
  }
}
