/**
 * Production proposals active build evidence storage bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authorizeActiveBuildAccess, type ActiveBuildAuthorization } from "../activeBuildAccess";
import { authenticatedMutation, normalizeRoleSlugs } from "../authz";
import { canReadCollaborationAsset } from "../build_collaboration_asset_access";
import { canReadCollaborationPost, resolveCurrentCollaborationPostReaderIds } from "../build_collaboration_access";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import { operateDenialMessage, resolveSubmilestoneOperateAuthority } from "../build_submilestone_operate_authority";
import { appendActiveSubmilestoneEvidenceAssetToDraft } from "../build_submilestone_evidence";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import { resolveSiteVisitGeofenceAttempt, type SiteVisitLocationAttempt } from "../demo_site_visit_tokens";
import { type Doc, type Id, type MutationCtx } from "../types";
import { getActiveBuildEvidenceAssetOrThrow, resolveEvidenceAssetSubmilestone } from "./active_capital_evidence.js";
import { getActiveBuildMilestoneOrThrow, assertActiveBuildPlanningTargetActive, findActiveBuildSubmilestoneByKey } from "./active_planning.js";
import { authorizeActiveBuildOrThrow } from "./authorization_core.js";
import { siteVisitLocationAttemptValidator } from "./brokerage_site_visits.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { assertExpectedSubmilestoneRevision, canonicalCommandFingerprint, findSubmilestoneIdempotentAudit, insertSubmilestoneCommandReceipt } from "./submilestone_commands.js";

type ActiveBuildEvidencePromotionArgs = {
  assetId: Id<"buildCollaborationAssets">;
  buildId: Id<"activeBuilds">;
  evidenceKey: string;
  expectedRevision?: number;
  expectedWorkflowRevision?: number;
  expectedPackageRevision?: number;
  expectedReviewRound?: number;
  idempotencyKey: string;
  label?: string;
  locationAttempt?: SiteVisitLocationAttempt;
  milestoneKey: string;
  requirementKey: string;
  submilestoneKey: string;
  tag?: string;
  workosOrganizationId: string;
};

type ActiveBuildEvidencePromotionResult = {
  assetId: Id<"buildEvidenceAssets">;
  evidencePackageRevisionId: Id<"buildSubmilestoneEvidencePackageRevisions">;
  locationVerified: boolean;
  packageRevision: number;
  reviewRound: number;
  revision: number;
  replayed: boolean;
};

async function collaborationAttachmentPostId(
  ctx: MutationCtx,
  attachment: Doc<"buildCollaborationAttachments">,
): Promise<Id<"buildCollaborationPosts"> | undefined> {
  if (attachment.ownerKind === "postRevision") {
    const revisionId = ctx.db.normalizeId(
      "buildCollaborationPostRevisions",
      attachment.ownerRecordId,
    );
    const revision = revisionId
      ? await ctx.db.get("buildCollaborationPostRevisions", revisionId)
      : null;
    return revision?.postId;
  }
  if (attachment.ownerKind === "commentRevision") {
    const revisionId = ctx.db.normalizeId(
      "buildCollaborationCommentRevisions",
      attachment.ownerRecordId,
    );
    const revision = revisionId
      ? await ctx.db.get("buildCollaborationCommentRevisions", revisionId)
      : null;
    return revision?.postId;
  }
  if (attachment.ownerKind === "actionItem") {
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      attachment.ownerRecordId,
    );
    const actionItem = actionItemId
      ? await ctx.db.get("buildActionItems", actionItemId)
      : null;
    return actionItem?.originatingPostId;
  }
  const commentId = ctx.db.normalizeId(
    "buildActionItemComments",
    attachment.ownerRecordId,
  );
  const comment = commentId
    ? await ctx.db.get("buildActionItemComments", commentId)
    : null;
  if (!comment) return undefined;
  const actionItem = await ctx.db.get("buildActionItems", comment.actionItemId);
  return actionItem?.originatingPostId;
}

async function resolveGeneratedSubmilestoneCompanionForPromotion(
  ctx: MutationCtx,
  input: {
    auth: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  },
) {
  const tenant = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", input.auth.organizationId),
    )
    .unique();
  if (tenant?.status !== "active") {
    throw new ConvexError({
      code: "COLLABORATION_DEGRADED",
      message:
        "Collaboration is unavailable; discussion attachments cannot be promoted to canonical Evidence.",
    });
  }
  const candidates = await ctx.db
    .query("buildActionItems")
    .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
      query
        .eq("canonicalBuildSubmilestoneId", input.submilestone._id)
        .eq("systemMode", "generated_milestone_submilestone"),
    )
    .take(33);
  const eligible = candidates.filter(
    (candidate) =>
      candidate.buildId === input.auth.build._id &&
      candidate.organizationId === input.auth.organizationId &&
      candidate.brokerageId === input.auth.brokerage._id &&
      candidate.canonicalBuildMilestoneId === input.milestone._id &&
      candidate.canonicalPlanningState !== "superseded" &&
      (candidate.canonicalCompanionDisposition === undefined ||
        candidate.canonicalCompanionDisposition === "active"),
  );
  if (candidates.length > 32 || eligible.length > 1) {
    throw new ConvexError({
      code: "COMPANION_AMBIGUOUS",
      message: "The generated Sub-milestone collaboration companion is ambiguous.",
    });
  }
  const companion = eligible[0];
  if (!companion) {
    throw new ConvexError({
      code: "COMPANION_REQUIRED",
      message:
        "A generated Sub-milestone collaboration companion is required for discussion evidence promotion.",
    });
  }
  const post = await ctx.db.get(companion.originatingPostId);
  if (
    !post ||
    post.buildId !== input.auth.build._id ||
    post.organizationId !== input.auth.organizationId ||
    post.brokerageId !== input.auth.brokerage._id ||
    post.canonicalBuildMilestoneId !== input.milestone._id ||
    post.systemPostKind !== "milestone" ||
    !(await canReadCollaborationPost(ctx, input.auth, post))
  ) {
    throw new ConvexError({
      code: "COMPANION_BINDING_INVALID",
      message:
        "The generated Sub-milestone collaboration companion is unavailable for evidence promotion.",
    });
  }
  return { companion, post };
}

async function collaborationAttachmentCompanionRoot(
  ctx: MutationCtx,
  attachment: Doc<"buildCollaborationAttachments">,
) {
  if (attachment.ownerKind === "actionItem") {
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      attachment.ownerRecordId,
    );
    return actionItemId ? await ctx.db.get(actionItemId) : null;
  }
  if (attachment.ownerKind !== "actionItemComment") {
    return null;
  }
  const commentId = ctx.db.normalizeId(
    "buildActionItemComments",
    attachment.ownerRecordId,
  );
  const comment = commentId ? await ctx.db.get(commentId) : null;
  return comment ? await ctx.db.get(comment.actionItemId) : null;
}

async function promoteCanonicalDiscussionAttachmentToEvidence(
  ctx: MutationCtx,
  auth: ActiveBuildAuthorization,
  args: ActiveBuildEvidencePromotionArgs,
) {
  const milestone = await getActiveBuildMilestoneOrThrow(
    ctx,
    args.buildId,
    args.milestoneKey,
  );
  const submilestones = (await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (query) =>
      query.eq("buildMilestoneId", milestone._id),
    )
    .collect()) as Doc<"buildSubmilestones">[];
  const submilestone = findActiveBuildSubmilestoneByKey(
    submilestones,
    args.submilestoneKey,
  );
  if (!submilestone) {
    throw new ConvexError({
      code: "SUBMILESTONE_NOT_FOUND",
      message: "Evidence Sub-milestone is unavailable for this Milestone.",
      submilestoneKey: args.submilestoneKey,
    });
  }
  assertActiveBuildPlanningTargetActive(milestone, submilestone);
  if (submilestone.status !== "in_progress") {
    throw new ConvexError({
      code: "SUBMILESTONE_NOT_ACTIVE",
      message: "Evidence can be promoted only while work is active.",
    });
  }
  if (
    milestone.buildId !== args.buildId ||
    milestone.organizationId !== auth.organizationId ||
    milestone.brokerageId !== auth.brokerage._id ||
    submilestone.buildId !== args.buildId ||
    submilestone.organizationId !== auth.organizationId ||
    submilestone.brokerageId !== auth.brokerage._id ||
    submilestone.buildMilestoneId !== milestone._id ||
    submilestone.milestoneKey !== milestone.key ||
    args.milestoneKey.trim() !== milestone.key ||
    args.submilestoneKey.trim() !== submilestone.key
  ) {
    throw new ConvexError({
      code: "CANONICAL_SCOPE_MISMATCH",
      message:
        "Evidence promotion must target the exact canonical Build, Milestone, and Sub-milestone.",
    });
  }
  const actorRoles = normalizeRoleSlugs(auth.viewer.roles);
  const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
    build: auth.build,
    milestone,
    submilestone,
  });
  const contractorOnly =
    actorRoles.includes("contractor") &&
    !actorRoles.includes("admin") &&
    !actorRoles.includes("builder") &&
    !actorRoles.includes("builder-staff");
  if (
    contractorOnly &&
    (ownership.state !== "assigned" ||
      ownership.contractor?.accountWorkosUserId !== auth.viewer.subject)
  ) {
    throw new ConvexError({
      code: "ASSIGNMENT_REQUIRED",
      message:
        "Assignment required: only the exact assigned Contractor may promote evidence.",
    });
  }
  const operate = await resolveSubmilestoneOperateAuthority(ctx, {
    build: auth.build,
    intent: "update",
    milestoneCompleted:
      milestone.status === "complete" ||
      milestone.completionClaim !== undefined,
    ownership,
    submilestone,
    viewer: {
      roles: actorRoles,
      workosUserId: auth.viewer.subject,
    },
  });
  if (
    !operate.allowed ||
    (operate.allowed &&
      operate.basis === "admin" &&
      !actorRoles.includes("admin"))
  ) {
    throw new ConvexError({
      code:
        !operate.allowed && operate.denial === "assignment_required"
          ? "ASSIGNMENT_REQUIRED"
          : !operate.allowed && operate.denial === "lender_review_only"
            ? "LENDER_EXECUTION_FORBIDDEN"
            : "OPERATE_FORBIDDEN",
      message:
        !operate.allowed
          ? operateDenialMessage(operate.denial)
          : "Admin authority must be present in the active Build role scope.",
    });
  }
  if (
    !actorRoles.includes("admin") &&
    !actorRoles.includes("contractor")
  ) {
    await requireActiveBuildAppPermission(
      ctx,
      {
        build: auth.build,
        proposal: auth.proposal,
        roles: actorRoles,
        subject: auth.viewer.subject,
      },
      "evidence",
      "create",
    );
  }
  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "Evidence promotion requires a non-empty idempotency key.",
    });
  }
  const expectedWorkflowRevision =
    args.expectedWorkflowRevision ?? args.expectedRevision;
  if (
    expectedWorkflowRevision === undefined ||
    !Number.isSafeInteger(expectedWorkflowRevision) ||
    expectedWorkflowRevision < 0
  ) {
    throw new ConvexError({
      code: "EXPECTED_REVISION_REQUIRED",
      message:
        "Evidence promotion requires the current canonical workflow revision.",
    });
  }
  const expectedReviewRound = args.expectedReviewRound;
  if (
    expectedReviewRound === undefined ||
    !Number.isSafeInteger(expectedReviewRound) ||
    expectedReviewRound < 0
  ) {
    throw new ConvexError({
      code: "REVIEW_ROUND_REQUIRED",
      message: "Evidence promotion requires the current review round.",
    });
  }
  const expectedPackageRevision = args.expectedPackageRevision;
  if (
    expectedPackageRevision === undefined ||
    !Number.isSafeInteger(expectedPackageRevision) ||
    expectedPackageRevision < 0
  ) {
    throw new ConvexError({
      code: "PACKAGE_REVISION_REQUIRED",
      message: "Evidence promotion requires the current Evidence Package revision.",
    });
  }
  const requirementKey = args.requirementKey.trim();
  if (!requirementKey) {
    throw new ConvexError({
      code: "EVIDENCE_REQUIREMENT_KEY_REQUIRED",
      message: "Evidence promotion requires an explicit requirement key.",
    });
  }
  const command = "promoteActiveBuildDiscussionAttachmentToEvidence";
  const fingerprint = await canonicalCommandFingerprint(command, {
    assetId: args.assetId,
    buildId: args.buildId,
    evidenceKey: args.evidenceKey.trim(),
    idempotencyKey,
    label: args.label?.trim(),
    locationAttempt: args.locationAttempt,
    milestoneKey: milestone.key,
    requirementKey,
    submilestoneKey: submilestone.key,
    tag: args.tag?.trim(),
  });
  const existingReceipt = await findSubmilestoneIdempotentAudit(ctx, {
    command,
    fingerprint,
    idempotencyKey,
    submilestoneId: submilestone._id,
  });
  if (existingReceipt) {
    const result = JSON.parse(
      existingReceipt.resultJson,
    ) as ActiveBuildEvidencePromotionResult;
    return {
      ...result,
      replayed: true,
    };
  }
  assertExpectedSubmilestoneRevision(submilestone, expectedWorkflowRevision);
  const currentReviewRound = submilestone.evidenceReviewRound ?? 0;
  if (expectedReviewRound !== currentReviewRound) {
    throw new ConvexError({
      code: "STALE_REVIEW_ROUND",
      message: "Sub-milestone review round changed; refresh before promoting evidence.",
      actualReviewRound: currentReviewRound,
      expectedReviewRound,
    });
  }
  if (
    submilestone.evidenceReviewState === "in_review" ||
    submilestone.evidenceReviewState === "approved" ||
    submilestone.reviewDecisionState === "in_review" ||
    submilestone.reviewDecisionState === "approved"
  ) {
    throw new ConvexError({
      code: "EVIDENCE_REVIEW_STATE_INVALID",
      message:
        "Discussion evidence cannot be promoted while this Sub-milestone is in review or approved.",
    });
  }
  const latestPackageRevision = await ctx.db
    .query("buildSubmilestoneEvidencePackageRevisions")
    .withIndex("by_submilestone_revision", (query) =>
      query.eq("buildSubmilestoneId", submilestone._id),
    )
    .order("desc")
    .first();
  const currentPackageRevision = submilestone.evidencePackageRevisionId
    ? await ctx.db.get(submilestone.evidencePackageRevisionId)
    : latestPackageRevision;
  if (
    currentPackageRevision &&
    latestPackageRevision &&
    currentPackageRevision._id !== latestPackageRevision._id
  ) {
    throw new ConvexError({
      code: "STALE_EVIDENCE_PACKAGE_REVISION",
      message:
        "The canonical Evidence Package pointer is not the latest package revision.",
      actualPackageRevision: latestPackageRevision.revision,
      expectedPackageRevision,
    });
  }
  if (
    currentPackageRevision &&
    (currentPackageRevision.buildId !== args.buildId ||
      currentPackageRevision.buildMilestoneId !== milestone._id ||
      currentPackageRevision.buildSubmilestoneId !== submilestone._id ||
      currentPackageRevision.organizationId !== auth.organizationId ||
      currentPackageRevision.brokerageId !== auth.brokerage._id ||
      currentPackageRevision.proposalId !== auth.proposal._id)
  ) {
    throw new ConvexError({
      code: "PACKAGE_SCOPE_MISMATCH",
      message: "The current Evidence Package revision is outside canonical scope.",
    });
  }
  if (expectedPackageRevision !== (currentPackageRevision?.revision ?? 0)) {
    throw new ConvexError({
      code: "STALE_EVIDENCE_PACKAGE_REVISION",
      message:
        "Evidence Package revision changed; refresh before promoting evidence.",
      actualPackageRevision: currentPackageRevision?.revision ?? 0,
      expectedPackageRevision,
    });
  }
  const sourceAsset = await ctx.db.get(args.assetId);
  if (!sourceAsset) {
    throw new ConvexError({
      code: "DISCUSSION_ASSET_UNAVAILABLE",
      message:
        "The discussion attachment is unavailable for explicit evidence promotion.",
      });
  }
  const { companion, post: companionPost } =
    await resolveGeneratedSubmilestoneCompanionForPromotion(ctx, {
      auth,
      milestone,
      submilestone,
    });
  if (
    sourceAsset.buildId !== args.buildId ||
    sourceAsset.organizationId !== auth.organizationId ||
    sourceAsset.brokerageId !== auth.brokerage._id ||
    sourceAsset.state !== "available" ||
    !sourceAsset.publishedAt ||
    !sourceAsset.publishedOwnerKind ||
    !sourceAsset.publishedOwnerRecordId ||
    sourceAsset.originatingPostId !== companionPost._id ||
    sourceAsset.maximumAudienceMode !== companionPost.audienceMode
  ) {
    throw new ConvexError({
      code: "DISCUSSION_ASSET_PUBLICATION_INVALID",
      message:
        "Only a currently published asset from the generated companion audience can be promoted.",
    });
  }
  const currentCompanionReaderIds =
    await resolveCurrentCollaborationPostReaderIds(
      ctx,
      auth,
      companionPost,
    );
  const publishedReaderIds = sourceAsset.readerWorkosUserIds;
  if (
    !publishedReaderIds ||
    currentCompanionReaderIds.some(
      (readerId) => !publishedReaderIds.includes(readerId),
    )
  ) {
    throw new ConvexError({
      code: "DISCUSSION_AUDIENCE_INVALID",
      message:
        "The published discussion audience no longer covers the generated companion audience.",
    });
  }
  if (!isCleanCollaborationAsset(sourceAsset)) {
    throw new ConvexError({
      code: "DISCUSSION_ASSET_SCAN_INVALID",
      message:
        "Only a clean, retained collaboration asset can be promoted to Evidence.",
    });
  }
  const attachments = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
      query
        .eq("buildId", args.buildId)
        .eq("attachmentKind", "collaborationAsset")
        .eq("attachmentId", sourceAsset._id),
    )
    .take(101);
  if (attachments.length > 100) {
    throw new ConvexError({
      code: "DISCUSSION_ATTACHMENT_AMBIGUOUS",
      message:
        "The discussion asset has too many attachment owners to promote safely.",
    });
  }
  if (attachments.length === 0) {
    throw new ConvexError({
      code: "DISCUSSION_ATTACHMENT_REQUIRED",
      message:
        "Only a published discussion attachment can be explicitly promoted to Evidence.",
      });
  }
  if (
    !(await canReadCollaborationAsset(ctx, {
      asset: sourceAsset,
      authorization: auth,
    }))
  ) {
    throw new ConvexError({
      code: "DISCUSSION_ASSET_UNAVAILABLE",
      message:
        "The discussion attachment is unavailable for explicit evidence promotion.",
    });
  }
  let sourcePostId: Id<"buildCollaborationPosts"> | undefined;
  let sourceOwnerKind: string | undefined;
  let sourceOwnerRecordId: string | undefined;
  for (const attachment of attachments) {
    if (
      attachment.organizationId !== auth.organizationId ||
      attachment.brokerageId !== auth.brokerage._id ||
      attachment.buildId !== args.buildId ||
      (attachment.ownerKind !== "actionItem" &&
        attachment.ownerKind !== "actionItemComment") ||
      sourceAsset.publishedOwnerKind !== attachment.ownerKind ||
      sourceAsset.publishedOwnerRecordId !== attachment.ownerRecordId
    ) {
      continue;
    }
    const root = await collaborationAttachmentCompanionRoot(ctx, attachment);
    if (!root || root._id !== companion._id) {
      continue;
    }
    const candidatePostId = await collaborationAttachmentPostId(ctx, attachment);
    if (
      candidatePostId === companionPost._id &&
      (await ctx.db.get(candidatePostId)) &&
      (await canReadCollaborationPost(
        ctx,
        auth,
        (await ctx.db.get(candidatePostId))!,
      ))
    ) {
      sourcePostId = candidatePostId;
      sourceOwnerKind = attachment.ownerKind;
      sourceOwnerRecordId = attachment.ownerRecordId;
      break;
    }
  }
  if (!sourcePostId) {
    throw new ConvexError({
      code: "DISCUSSION_COMPANION_ATTACHMENT_REQUIRED",
      message:
        "The source asset must be attached to this generated companion or one of its comments.",
    });
  }
  const evidenceKey = args.evidenceKey.trim();
  if (!evidenceKey) {
    throw new ConvexError({
      code: "EVIDENCE_KEY_REQUIRED",
      message: "Evidence key is required for explicit promotion.",
    });
  }
  const priorPromotions = await ctx.db
    .query("buildSubmilestoneEvidencePromotions")
    .withIndex("by_source_asset", (query) =>
      query.eq("sourceDiscussionAssetId", sourceAsset._id),
    )
    .take(101);
  if (priorPromotions.length > 100) {
    throw new ConvexError({
      code: "EVIDENCE_PROMOTION_AMBIGUOUS",
      message: "The source discussion asset has too many promotion records.",
    });
  }
  if (priorPromotions.length > 0) {
    throw new ConvexError({
      code: "EVIDENCE_ALREADY_PROMOTED",
      message:
        "This discussion asset has already been explicitly promoted to canonical Evidence.",
    });
  }
  const priorEvidenceAssets = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_milestone_submilestone", (query) =>
      query
        .eq("buildId", args.buildId)
        .eq("milestoneKey", milestone.key)
        .eq("submilestoneKey", submilestone.key),
    )
    .take(101);
  if (priorEvidenceAssets.length > 100) {
    throw new ConvexError({
      code: "EVIDENCE_ASSET_AMBIGUOUS",
      message:
        "The canonical Evidence Asset set is too large to verify promotion uniqueness safely.",
    });
  }
  if (
    priorEvidenceAssets.some(
      (asset) => asset.sourceDiscussionAssetId === sourceAsset._id,
    )
  ) {
    throw new ConvexError({
      code: "EVIDENCE_ALREADY_PROMOTED",
      message:
        "This discussion asset already has a canonical Evidence Asset.",
    });
  }
  if (currentPackageRevision) {
    const currentPackageItems = await ctx.db
      .query("buildSubmilestoneEvidencePackageItems")
      .withIndex("by_package_revision", (query) =>
        query.eq("packageRevisionId", currentPackageRevision._id),
      )
      .take(101);
    if (currentPackageItems.length > 100) {
      throw new ConvexError({
        code: "EVIDENCE_PACKAGE_AMBIGUOUS",
        message:
          "The current Evidence Package is too large to verify promotion uniqueness safely.",
      });
    }
    if (
      currentPackageItems.some(
        (item) => item.sourceDiscussionAssetId === sourceAsset._id,
      )
    ) {
      throw new ConvexError({
        code: "EVIDENCE_ALREADY_PROMOTED",
        message:
          "This discussion asset already has a current Evidence Package item.",
      });
    }
  }
  const existing = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_key", (query) =>
      query.eq("buildId", args.buildId).eq("evidenceKey", evidenceKey),
    )
    .unique();
  if (existing) {
    throw new ConvexError({
      code: "EVIDENCE_IDEMPOTENCY_CONFLICT",
      message: "This Evidence key was already used for another asset.",
    });
  }
  const now = Date.now();
  const locationAttempt = args.locationAttempt
    ? resolveSiteVisitGeofenceAttempt({
        locationAttempt: args.locationAttempt,
        siteLatitude: auth.build.locationLatitude,
        siteLongitude: auth.build.locationLongitude,
      })
    : undefined;
  const evidenceAssetId = await ctx.db.insert("buildEvidenceAssets", {
    brokerageId: auth.brokerage._id,
    buildId: args.buildId,
    collaborationEventRevision: 1,
    createdAt: now,
    evidenceKey,
    fileName: sourceAsset.fileName,
    label: args.label?.trim() || sourceAsset.fileName,
    locationVerified: locationAttempt?.verified ?? false,
    ...(locationAttempt?.accuracyMeters === undefined
      ? {}
      : { locationAccuracyMeters: locationAttempt.accuracyMeters }),
    ...(locationAttempt?.attemptedAt === undefined
      ? {}
      : { locationAttemptedAt: locationAttempt.attemptedAt }),
    ...(locationAttempt?.distanceMeters === undefined
      ? {}
      : { locationDistanceMeters: locationAttempt.distanceMeters }),
    ...(locationAttempt?.failureReason
      ? { locationFailureReason: locationAttempt.failureReason }
      : {}),
    ...(locationAttempt?.geofenceRadiusMeters === undefined
      ? {}
      : { locationGeofenceRadiusMeters: locationAttempt.geofenceRadiusMeters }),
    milestoneKey: args.milestoneKey,
    mimeType: sourceAsset.mimeType,
    organizationId: auth.build.organizationId,
    proposalId: auth.proposal._id,
    sizeBytes: sourceAsset.sizeBytes,
    source: "collaboration_asset_promotion",
    sourceDiscussionAssetId: sourceAsset._id,
    sourceDiscussionAssetVersion: sourceAsset.version,
    sourceDiscussionCapturedAt: sourceAsset.sourceCapturedAt,
    sourceDiscussionOwnerKind: sourceOwnerKind,
    sourceDiscussionOwnerRecordId: sourceOwnerRecordId,
    sourceDiscussionPostId: sourcePostId,
    sourceDiscussionPublishedAt: sourceAsset.publishedAt,
    sourceDiscussionUploadedByWorkosUserId: sourceAsset.uploadedByWorkosUserId,
    storageId: sourceAsset.storageId,
    submilestoneKey: args.submilestoneKey,
    tag: args.tag?.trim() || milestone.name,
    updatedAt: now,
  });
  const persistedAsset = await ctx.db.get(evidenceAssetId);
  if (!persistedAsset) {
    throw new Error("Promoted Evidence became unavailable.");
  }
  const packageMembership =
    await appendActiveSubmilestoneEvidenceAssetToDraft(ctx, {
      actorRoles,
      actorWorkosUserId: auth.viewer.subject,
      asset: persistedAsset,
      build: auth.build,
      milestone,
      requirementKey,
      sourceDiscussionAsset: sourceAsset,
      sourceDiscussionPostId: sourcePostId,
      sourceKind: "discussion_promotion",
      submilestone,
    });
  await ctx.db.patch(evidenceAssetId, {
    evidencePackageRevisionId: packageMembership.packageRevision._id,
    promotedAt: now,
    promotedByWorkosUserId: auth.viewer.subject,
    updatedAt: now,
  });
  const nextWorkflowRevision = (submilestone.workflowRevision ?? 0) + 1;
  await ctx.db.patch(submilestone._id, {
    evidencePackageRevisionId: packageMembership.packageRevision._id,
    evidenceReviewState: "not_ready",
    updatedAt: now,
    workflowRevision: nextWorkflowRevision,
  });
  await ctx.db.insert("buildSubmilestoneEvidencePromotions", {
    brokerageId: auth.brokerage._id,
    buildId: args.buildId,
    buildMilestoneId: milestone._id,
    buildSubmilestoneId: submilestone._id,
    evidenceAssetId,
    organizationId: auth.build.organizationId,
    packageRevisionId: packageMembership.packageRevision._id,
    promotedAt: now,
    promotedByWorkosUserId: auth.viewer.subject,
    sourceAssetVersion: sourceAsset.version,
    sourceDiscussionAssetId: sourceAsset._id,
    sourceCapturedAt: sourceAsset.sourceCapturedAt,
    sourceDiscussionPostId: sourcePostId,
    sourcePublishedAt: sourceAsset.publishedAt,
    sourceUploaderWorkosUserId: sourceAsset.uploadedByWorkosUserId,
    requirementKey,
    idempotencyKey,
    fingerprint,
    reviewRound: currentReviewRound,
    workflowRevision: nextWorkflowRevision,
  });
  await writeActiveBuildEvent(ctx, {
    auth: {
      brokerage: auth.brokerage,
      proposal: auth.proposal,
      roles: actorRoles,
      subject: auth.viewer.subject,
    },
    build: auth.build,
    command: "promoteActiveBuildDiscussionAttachmentToEvidence",
    entityId: String(submilestone._id),
    entityType: "buildSubmilestone",
    eventType: "active_build.evidence.promoted",
    resourceType: "evidence",
    newState: JSON.stringify({
      evidenceAssetId,
      evidenceKey,
      packageRevision: packageMembership.packageRevision.revision,
      reviewRound: currentReviewRound,
      sourceDiscussionAssetId: sourceAsset._id,
      sourceDiscussionPostId: sourcePostId,
      sourceDiscussionAssetVersion: sourceAsset.version,
      workflowRevision: nextWorkflowRevision,
    }),
    warnings:
      locationAttempt && !locationAttempt.verified
        ? ["evidence_location_unverified"]
        : [],
  });
  const result: ActiveBuildEvidencePromotionResult = {
    assetId: evidenceAssetId,
    evidencePackageRevisionId: packageMembership.packageRevision._id,
    locationVerified: persistedAsset.locationVerified,
    packageRevision: packageMembership.packageRevision.revision,
    reviewRound: currentReviewRound,
    revision: nextWorkflowRevision,
    replayed: false as const,
  };
  await insertSubmilestoneCommandReceipt(ctx, {
    buildId: args.buildId,
    command,
    fingerprint,
    idempotencyKey,
    organizationId: auth.build.organizationId,
    result,
    submilestoneId: submilestone._id,
  });
  return result;
}

export const promoteActiveBuildDiscussionAttachmentToEvidence =
  authenticatedMutation
    .input({
      assetId: v.id("buildCollaborationAssets"),
      buildId: v.id("activeBuilds"),
      evidenceKey: v.string(),
      expectedRevision: v.optional(v.number()),
      expectedWorkflowRevision: v.optional(v.number()),
      expectedPackageRevision: v.optional(v.number()),
      expectedReviewRound: v.optional(v.number()),
      idempotencyKey: v.string(),
      label: v.optional(v.string()),
      locationAttempt: v.optional(siteVisitLocationAttemptValidator),
      milestoneKey: v.string(),
      requirementKey: v.string(),
      submilestoneKey: v.string(),
      tag: v.optional(v.string()),
      workosOrganizationId: v.string(),
    })
    .returns(
      v.object({
        assetId: v.id("buildEvidenceAssets"),
        evidencePackageRevisionId: v.id(
          "buildSubmilestoneEvidencePackageRevisions",
        ),
        locationVerified: v.boolean(),
        packageRevision: v.number(),
        reviewRound: v.number(),
        revision: v.number(),
        replayed: v.boolean(),
      }),
    )
    .handler(async (ctx, args) => {
      const auth = await authorizeActiveBuildAccess(
        ctx,
        { buildId: args.buildId, organizationId: args.workosOrganizationId },
      );
      return await promoteCanonicalDiscussionAttachmentToEvidence(ctx, auth, args);
    })
    .public();

export const updateActiveBuildTimelineEvidenceAsset = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    evidenceKey: v.string(),
    label: v.optional(v.string()),
    tag: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "evidence", "update");
    const asset = await getActiveBuildEvidenceAssetOrThrow(
      ctx,
      args.buildId,
      args.evidenceKey,
    );
    const scopedSubmilestone = await resolveEvidenceAssetSubmilestone(
      ctx,
      args.buildId,
      asset,
    );
    const patch = {
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || asset.label }),
      ...(args.tag === undefined ? {} : { tag: args.tag.trim() || asset.tag }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(asset._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelineEvidenceAsset",
      ...(scopedSubmilestone
        ? {
            entityId: String(scopedSubmilestone._id),
            entityType: "buildSubmilestone",
          }
        : {}),
      eventType: "active_build.evidence.updated",
      resourceType: "evidence",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(asset),
    });
    return null;
  })
  .public();

export const deleteActiveBuildTimelineEvidenceAsset = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    evidenceKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "evidence", "delete");
    const asset = await getActiveBuildEvidenceAssetOrThrow(
      ctx,
      args.buildId,
      args.evidenceKey,
    );
    const scopedSubmilestone = await resolveEvidenceAssetSubmilestone(
      ctx,
      args.buildId,
      asset,
    );
    if (asset.storageId) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildTimelineEvidenceAsset",
      ...(scopedSubmilestone
        ? {
            entityId: String(scopedSubmilestone._id),
            entityType: "buildSubmilestone",
          }
        : {}),
      eventType: "active_build.evidence.deleted",
      resourceType: "evidence",
      priorState: JSON.stringify(asset),
    });
    return null;
  })
  .public();
