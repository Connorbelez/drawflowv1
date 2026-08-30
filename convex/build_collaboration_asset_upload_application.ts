import type { Id } from "./types";

export interface CollaborationAssetStatus {
  _id: Id<"buildCollaborationAssets">;
  contentHashSha256?: string;
  fileName: string;
  mimeType: string;
  scanMessage?: string;
  scanState?: "pending" | "clean" | "rejected" | "error";
  sizeBytes: number;
  sourceCapturedAt?: number;
  state: "staged" | "quarantined" | "available" | "rejected" | "superseded";
  version: number;
}

/**
 * Canonical application interface for collaboration asset finalization. Route
 * adapters supply their authorized finalize/read functions; this module owns
 * failure abandonment, malware scan ordering, and final observable readback.
 */
export async function finalizeAndScanCollaborationAssetUpload(input: {
  abandon: (message: string) => Promise<unknown>;
  finalize: () => Promise<Id<"buildCollaborationAssets">>;
  readStatus: (
    assetId: Id<"buildCollaborationAssets">
  ) => Promise<CollaborationAssetStatus | null>;
  scan: (assetId: Id<"buildCollaborationAssets">) => Promise<unknown>;
}) {
  let assetId: Id<"buildCollaborationAssets">;
  try {
    assetId = await input.finalize();
  } catch (error) {
    await input.abandon(
      error instanceof Error
        ? error.message
        : "Asset upload finalization failed."
    );
    throw error;
  }
  await input.scan(assetId);
  const status = await input.readStatus(assetId);
  if (!status) {
    throw new Error("The finalized collaboration asset is unavailable.");
  }
  return status;
}
