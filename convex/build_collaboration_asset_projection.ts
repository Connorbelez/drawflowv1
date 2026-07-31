import { isCleanCollaborationAsset } from "./build_collaboration_asset_access";
import type { Id, QueryCtx } from "./types";

export async function projectCollaborationAssetAttachments(
  ctx: QueryCtx,
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
    ownerKind:
      | "postRevision"
      | "commentRevision"
      | "actionItem"
      | "actionItemComment";
    ownerRecordId: string;
  }
) {
  const attachments = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query
        .eq("ownerKind", input.ownerKind)
        .eq("ownerRecordId", input.ownerRecordId)
    )
    .take(25);
  const projected: Array<{
    assetId: Id<"buildCollaborationAssets">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    state: "available" | "superseded";
    version: number;
  }> = [];
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
