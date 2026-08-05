import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  canUseCollaborationAssetForPost,
  isCleanCollaborationAsset,
} from "./build_collaboration_asset_access";
import { buildCollaborationValidationError } from "./build_collaboration_validation";
import { emitBuildCollaborationWebhookEvent } from "./build_collaboration_webhooks";
import type { Doc, Id, MutationCtx } from "./types";

type AssetOwnerKind =
  | "postRevision"
  | "commentRevision"
  | "actionItem"
  | "actionItemComment";

/**
 * Publishes governed assets and attaches them to collaboration content in the
 * same Convex transaction. Replacement activation intentionally lives here,
 * not in the asynchronous scanner, so an unpublished upload can never mutate
 * the visible version history.
 */
export async function persistGovernedCollaborationAssetAttachments(
  ctx: MutationCtx,
  input: {
    assetIds: Id<"buildCollaborationAssets">[];
    authorization: ActiveBuildAuthorization;
    command: string;
    maxAttachments: number;
    now: number;
    ownerKind: AssetOwnerKind;
    ownerRecordId: string;
    post: Doc<"buildCollaborationPosts">;
    readerWorkosUserIds: string[];
    unavailableMessage: string;
  }
) {
  const assetIds = [...new Set(input.assetIds)];
  if (assetIds.length > input.maxAttachments) {
    throw buildCollaborationValidationError(
      `This publication may contain at most ${input.maxAttachments} attachments.`
    );
  }

  const assets: Doc<"buildCollaborationAssets">[] = [];
  for (const assetId of assetIds) {
    const asset = await ctx.db.get(assetId);
    if (
      !asset ||
      asset.organizationId !== input.authorization.organizationId ||
      asset.brokerageId !== input.authorization.brokerage._id ||
      asset.buildId !== input.authorization.build._id ||
      asset.state !== "available" ||
      !isCleanCollaborationAsset(asset) ||
      !(await canUseCollaborationAssetForPost(ctx, {
        asset,
        authorization: input.authorization,
        post: input.post,
      }))
    ) {
      throw buildCollaborationValidationError(input.unavailableMessage);
    }
    assets.push(asset);
  }

  for (const asset of assets) {
    if (!asset.publishedAt) {
      await activateAssetPublication(ctx, asset, input);
    }
    await ctx.db.insert("buildCollaborationAttachments", {
      attachmentId: asset._id,
      attachmentKind: "collaborationAsset",
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      createdByWorkosUserId: input.authorization.viewer.subject,
      organizationId: input.authorization.organizationId,
      ownerKind: input.ownerKind,
      ownerRecordId: input.ownerRecordId,
    });
  }
}

async function activateAssetPublication(
  ctx: MutationCtx,
  asset: Doc<"buildCollaborationAssets">,
  input: {
    authorization: ActiveBuildAuthorization;
    command: string;
    now: number;
    ownerKind: AssetOwnerKind;
    ownerRecordId: string;
    post: Doc<"buildCollaborationPosts">;
    readerWorkosUserIds: string[];
  }
) {
  const session = asset.stagingSessionId
    ? await ctx.db.get(asset.stagingSessionId)
    : null;
  if (
    !session ||
    session.assetId !== asset._id ||
    session.state !== "finalized" ||
    session.organizationId !== input.authorization.organizationId ||
    session.brokerageId !== input.authorization.brokerage._id ||
    session.buildId !== input.authorization.build._id
  ) {
    throw buildCollaborationValidationError(
      "The collaboration asset staging session is unavailable."
    );
  }

  let supersededAssetId: Id<"buildCollaborationAssets"> | undefined;
  if (asset.supersedesAssetId) {
    const lineageRootAssetId = asset.lineageRootAssetId;
    if (!lineageRootAssetId) {
      throw buildCollaborationValidationError(
        "The replacement asset lineage is invalid."
      );
    }
    const indexedLineage = await ctx.db
      .query("buildCollaborationAssets")
      .withIndex("by_lineageRootAssetId_and_version", (query) =>
        query.eq("lineageRootAssetId", lineageRootAssetId)
      )
      .order("desc")
      .take(101);
    const rootAsset = await ctx.db.get(lineageRootAssetId);
    const lineage = [
      ...indexedLineage,
      ...(rootAsset &&
      !indexedLineage.some((candidate) => candidate._id === rootAsset._id)
        ? [rootAsset]
        : []),
    ].sort((left, right) => right.version - left.version);
    if (lineage.length > 100) {
      throw buildCollaborationValidationError(
        "This asset has reached its 100-version limit."
      );
    }
    const currentPublished = lineage.find(
      (candidate) =>
        candidate._id !== asset._id &&
        candidate.publishedAt !== undefined &&
        candidate.state === "available"
    );
    if (
      !currentPublished ||
      currentPublished.organizationId !== input.authorization.organizationId ||
      currentPublished.brokerageId !== input.authorization.brokerage._id ||
      currentPublished.buildId !== input.authorization.build._id ||
      currentPublished.version >= asset.version
    ) {
      throw buildCollaborationValidationError(
        "The current published asset version changed; refresh before publishing this replacement."
      );
    }
    const conflictingPublishedSuccessor = lineage.find(
      (candidate) =>
        candidate._id !== asset._id &&
        candidate.publishedAt !== undefined &&
        candidate.version >= asset.version
    );
    if (conflictingPublishedSuccessor) {
      throw buildCollaborationValidationError(
        "A newer asset version has already been published; refresh and try again."
      );
    }
    supersededAssetId = currentPublished._id;
    await ctx.db.patch(currentPublished._id, {
      state: "superseded",
      updatedAt: input.now,
    });
  }

  await ctx.db.patch(asset._id, {
    maximumAudienceMode: input.post.audienceMode,
    originatingPostId: input.post._id,
    publishedAt: input.now,
    publishedOwnerKind: input.ownerKind,
    publishedOwnerRecordId: input.ownerRecordId,
    readerWorkosUserIds: [...new Set(input.readerWorkosUserIds)].sort(),
    updatedAt: input.now,
  });
  await ctx.db.patch(session._id, {
    state: "consumed",
    updatedAt: input.now,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: input.command,
    createdAt: input.now,
    entityId: asset._id,
    entityType: "buildCollaborationAsset",
    eventType: "build.collaboration.asset.published",
    newState: JSON.stringify({
      ownerKind: input.ownerKind,
      ownerRecordId: input.ownerRecordId,
      postId: input.post._id,
      state: "available",
      supersededAssetId,
      version: asset.version,
    }),
    organizationId: input.authorization.organizationId,
    warnings: [],
  });
  await emitBuildCollaborationWebhookEvent(ctx, {
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    entityId: asset._id,
    entityType: "asset",
    eventType: "build.collaboration.asset.version_published",
    idempotencyKey: `asset:${asset._id}:version:${asset.version}`,
    metadata: {
      ownerKind: input.ownerKind,
      ownerRecordId: input.ownerRecordId,
      postId: input.post._id,
      supersededAssetId,
      version: asset.version,
    },
    occurredAt: input.now,
    organizationId: input.authorization.organizationId,
  });
}
