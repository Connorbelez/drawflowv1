import {
  evidenceMimeTypeForFile,
  normalizeEvidenceFileForUpload,
} from "#/lib/evidence-image-normalization.ts";

export { evidenceMimeTypeForFile };

export const SITE_VISIT_PACKAGE_CAP_BYTES = 1_000_000_000;

export type SiteVisitEvidenceKind = "document" | "image" | "video";

export interface SiteVisitStagedEvidence {
  compressedBytes: number;
  id: string;
  kind: SiteVisitEvidenceKind;
  mimeType: string;
  name: string;
  originalBytes: number;
  targetMilestoneKey?: string;
  targetSubmilestoneKey?: string;
  thumbnailKind: "document" | "image" | "video-poster";
  uploadState: "ready" | "uploaded";
}

export function classifyEvidenceMimeType(
  mimeType: string,
): SiteVisitEvidenceKind {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  return "document";
}

export function estimateCompressedEvidenceBytes({
  mimeType,
  sizeBytes,
}: {
  mimeType: string;
  sizeBytes: number;
}) {
  const kind = classifyEvidenceMimeType(mimeType);
  if (kind === "image") {
    return Math.max(1, Math.round(sizeBytes * 0.62));
  }
  if (kind === "video") {
    return Math.max(1, Math.round(sizeBytes * 0.72));
  }
  return sizeBytes;
}

export function buildStagedEvidence(input: {
  id: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
  targetMilestoneKey?: string;
  targetSubmilestoneKey?: string;
}): SiteVisitStagedEvidence {
  const kind = classifyEvidenceMimeType(input.mimeType);
  return {
    compressedBytes: estimateCompressedEvidenceBytes({
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    }),
    id: input.id,
    kind,
    mimeType: input.mimeType || "application/octet-stream",
    name: input.name,
    originalBytes: input.sizeBytes,
    targetMilestoneKey: input.targetMilestoneKey,
    targetSubmilestoneKey: input.targetSubmilestoneKey,
    thumbnailKind:
      kind === "image"
        ? "image"
        : kind === "video"
          ? "video-poster"
          : "document",
    uploadState: "ready",
  };
}

export function packageTotalBytes(items: SiteVisitStagedEvidence[]) {
  return items.reduce((sum, item) => sum + item.compressedBytes, 0);
}

export function assertPackageWithinCap(items: SiteVisitStagedEvidence[]) {
  const total = packageTotalBytes(items);
  if (total > SITE_VISIT_PACKAGE_CAP_BYTES) {
    throw new Error("Compressed site visit package exceeds the 1 GB cap.");
  }
  return total;
}

export type SiteVisitEvidenceUploadItem = {
  evidence: SiteVisitStagedEvidence;
  file: Blob & { name?: string; type?: string };
};

export async function uploadSiteVisitStagedEvidence({
  buildId,
  generateUploadUrl,
  onUploadedItem,
  registerFile,
  stagedItems,
  token,
  upload,
  normalizeFile = normalizeEvidenceFileForUpload,
}: {
  buildId: string;
  generateUploadUrl: (input: {
    buildId: string;
    token: string;
  }) => Promise<string>;
  onUploadedItem?: () => void;
  registerFile: (input: {
    buildId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageId: string;
    targetMilestoneKey?: string;
    targetSubmilestoneKey?: string;
    token: string;
  }) => Promise<unknown>;
  stagedItems: SiteVisitEvidenceUploadItem[];
  token: string;
  upload: (
    url: string,
    file: Blob,
    mimeType: string,
  ) => Promise<{ json: () => Promise<{ storageId: string }>; ok: boolean }>;
  normalizeFile?: (file: File) => Promise<File>;
}) {
  if (stagedItems.length === 0) {
    return 0;
  }

  assertPackageWithinCap(stagedItems.map((item) => item.evidence));

  for (const item of stagedItems) {
    const file =
      typeof File !== "undefined" && item.file instanceof File
        ? await normalizeFile(item.file)
        : item.file;
    const mimeType = evidenceMimeTypeForFile(file);
    const fileName = file.name ?? item.evidence.name;
    const uploadUrl = await generateUploadUrl({ buildId, token });
    const response = await upload(uploadUrl, file, mimeType);
    if (!response.ok) {
      throw new Error(`Unable to upload ${fileName}.`);
    }
    const { storageId } = await response.json();
    await registerFile({
      buildId,
      fileName,
      mimeType,
      sizeBytes: file.size,
      storageId,
      targetMilestoneKey: item.evidence.targetMilestoneKey,
      targetSubmilestoneKey: item.evidence.targetSubmilestoneKey,
      token,
    });
    onUploadedItem?.();
  }

  return stagedItems.length;
}
