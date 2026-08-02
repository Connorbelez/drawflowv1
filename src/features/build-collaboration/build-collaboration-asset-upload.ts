import type { Id } from "../../../convex/_generated/dataModel";

type AbandonAssets = (args: {
  assetIds: Id<"buildCollaborationAssets">[];
  buildId: Id<"activeBuilds">;
  organizationId: string;
  reason: string;
}) => Promise<number>;

export async function abandonGovernedCollaborationAssets(input: {
  abandonAssets: AbandonAssets;
  assetIds: Id<"buildCollaborationAssets">[];
  buildId: Id<"activeBuilds">;
  organizationId: string;
  reason: string;
}) {
  if (input.assetIds.length === 0) {
    return;
  }
  for (let index = 0; index < input.assetIds.length; index += 25) {
    await input.abandonAssets({
      assetIds: input.assetIds.slice(index, index + 25),
      buildId: input.buildId,
      organizationId: input.organizationId,
      reason: input.reason,
    });
  }
}

export async function uploadGovernedCollaborationAssets(
  files: File[],
  context: {
    abandonAssets: AbandonAssets;
    beginUpload: (args: {
      buildId: Id<"activeBuilds">;
      contextKind: "composer" | "draft" | "post" | "actionItem";
      contextRecordId?: string;
      fileName: string;
      mimeType?: string;
      organizationId: string;
      sizeBytes: number;
      sourceCapturedAt?: number;
    }) => Promise<{
      stagingSessionId: Id<"buildCollaborationAssetStagingSessions">;
      uploadUrl: string;
    }>;
    buildId: Id<"activeBuilds">;
    contextKind: "composer" | "draft" | "post" | "actionItem";
    contextRecordId?: string;
    finalizeAndScan: (args: {
      buildId: Id<"activeBuilds">;
      contentHashSha256: string;
      fileName: string;
      mimeType?: string;
      organizationId: string;
      stagingSessionId: Id<"buildCollaborationAssetStagingSessions">;
      storageId: Id<"_storage">;
      supersedesAssetId?: Id<"buildCollaborationAssets">;
    }) => Promise<{
      _id: Id<"buildCollaborationAssets">;
      scanMessage?: string;
      scanState?: "pending" | "clean" | "rejected" | "error";
      state: "staged" | "quarantined" | "available" | "rejected" | "superseded";
    }>;
    organizationId: string;
    registerUpload: (args: {
      buildId: Id<"activeBuilds">;
      organizationId: string;
      stagingSessionId: Id<"buildCollaborationAssetStagingSessions">;
      storageId: Id<"_storage">;
    }) => Promise<null>;
    supersedesAssetId?: Id<"buildCollaborationAssets">;
  }
) {
  if (context.supersedesAssetId && files.length !== 1) {
    throw new Error("An asset replacement must contain exactly one file.");
  }
  const assetIds: Id<"buildCollaborationAssets">[] = [];
  try {
    for (const file of files) {
      const contentHashSha256 = await sha256(file);
      const staging = await context.beginUpload({
        buildId: context.buildId,
        contextKind: context.contextKind,
        contextRecordId: context.contextRecordId,
        fileName: file.name,
        mimeType: file.type || undefined,
        organizationId: context.organizationId,
        sizeBytes: file.size,
        sourceCapturedAt: file.lastModified > 0 ? file.lastModified : undefined,
      });
      const response = await fetch(staging.uploadUrl, {
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Unable to upload ${file.name}.`);
      }
      const payload = (await response.json()) as { storageId?: string };
      if (!payload.storageId) {
        throw new Error(`Upload for ${file.name} did not return a storage ID.`);
      }
      const storageId = payload.storageId as Id<"_storage">;
      await context.registerUpload({
        buildId: context.buildId,
        organizationId: context.organizationId,
        stagingSessionId: staging.stagingSessionId,
        storageId,
      });
      const asset = await context.finalizeAndScan({
        buildId: context.buildId,
        contentHashSha256,
        fileName: file.name,
        mimeType: file.type || undefined,
        organizationId: context.organizationId,
        stagingSessionId: staging.stagingSessionId,
        storageId,
        supersedesAssetId: context.supersedesAssetId,
      });
      assetIds.push(asset._id);
      if (asset.state !== "available" || asset.scanState !== "clean") {
        throw new Error(
          asset.scanMessage ||
            `${file.name} remains quarantined until security scanning completes.`
        );
      }
    }
    return assetIds;
  } catch (error) {
    if (assetIds.length > 0) {
      await abandonGovernedCollaborationAssets({
        abandonAssets: context.abandonAssets,
        assetIds,
        buildId: context.buildId,
        organizationId: context.organizationId,
        reason: "Upload bundle did not reach publication.",
      });
    }
    throw error;
  }
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer()
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
