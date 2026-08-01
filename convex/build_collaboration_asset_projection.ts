import { isCleanCollaborationAsset } from "./build_collaboration_asset_access";
import type { Doc, Id, QueryCtx } from "./types";

type CollaborationAssetOwnerKind =
  | "postRevision"
  | "commentRevision"
  | "actionItem"
  | "actionItemComment";

interface CollaborationAssetProjectionInput {
  buildId: Id<"activeBuilds">;
  organizationId: string;
  ownerKind: CollaborationAssetOwnerKind;
  ownerRecordId: string;
}

interface CollaborationAssetAttachmentSummary {
  assetId: Id<"buildCollaborationAssets">;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  state: "available" | "superseded";
  version: number;
}

export async function projectCollaborationAssetAttachments(
  ctx: QueryCtx,
  input: CollaborationAssetProjectionInput
) {
  const attachments = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query
        .eq("ownerKind", input.ownerKind)
        .eq("ownerRecordId", input.ownerRecordId)
    )
    .take(25);
  return await projectAttachmentRows(ctx, input, attachments);
}

export async function projectCollaborationAssetAttachmentPage(
  ctx: QueryCtx,
  input: CollaborationAssetProjectionInput & { cursor: string | null }
) {
  const page = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query
        .eq("ownerKind", input.ownerKind)
        .eq("ownerRecordId", input.ownerRecordId)
    )
    .paginate({ cursor: input.cursor, numItems: 5 });
  return {
    attachments: await projectAttachmentRows(ctx, input, page.page),
    continueCursor: page.continueCursor,
    isDone: page.isDone,
  };
}

async function projectAttachmentRows(
  ctx: QueryCtx,
  input: CollaborationAssetProjectionInput,
  attachments: Doc<"buildCollaborationAttachments">[]
) {
  const projected: CollaborationAssetAttachmentSummary[] = [];
  for (const attachment of attachments) {
    if (
      attachment.organizationId !== input.organizationId ||
      attachment.buildId !== input.buildId ||
      attachment.attachmentKind !== "collaborationAsset"
    ) {
      continue;
    }
    const assetId = ctx.db.normalizeId(
      "buildCollaborationAssets",
      attachment.attachmentId
    );
    const asset = assetId ? await ctx.db.get(assetId) : null;
    if (!(asset && isCleanCollaborationAsset(asset))) {
      continue;
    }
    projected.push({
      assetId: asset._id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      state: asset.state === "superseded" ? "superseded" : "available",
      version: asset.version,
    });
  }
  return projected;
}
