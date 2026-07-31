import type { Id } from "../../../convex/_generated/dataModel";

export async function uploadGovernedCollaborationAssets(
  files: File[],
  context: {
    beginUpload: (args: {
      buildId: Id<"activeBuilds">;
      contextKind: "composer" | "draft" | "post" | "actionItem";
      contextRecordId?: string;
      organizationId: string;
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
    }) => Promise<{
      _id: Id<"buildCollaborationAssets">;
      scanMessage?: string;
      scanState?: "pending" | "clean" | "rejected" | "error";
      state: "staged" | "quarantined" | "available" | "rejected" | "superseded";
    }>;
    organizationId: string;
  }
) {
  const assetIds: Id<"buildCollaborationAssets">[] = [];
  for (const file of files) {
    const staging = await context.beginUpload({
      buildId: context.buildId,
      contextKind: context.contextKind,
      contextRecordId: context.contextRecordId,
      organizationId: context.organizationId,
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
    const asset = await context.finalizeAndScan({
      buildId: context.buildId,
      contentHashSha256: await sha256(file),
      fileName: file.name,
      mimeType: file.type || undefined,
      organizationId: context.organizationId,
      stagingSessionId: staging.stagingSessionId,
      storageId: payload.storageId as Id<"_storage">,
    });
    if (asset.state !== "available" || asset.scanState !== "clean") {
      throw new Error(
        asset.scanMessage ||
          `${file.name} remains quarantined until security scanning completes.`
      );
    }
    assetIds.push(asset._id);
  }
  return assetIds;
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
