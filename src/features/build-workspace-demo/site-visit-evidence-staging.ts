import {
  evidenceMimeTypeForFile,
  normalizeEvidenceFileForUpload,
} from "#/lib/evidence-image-normalization.ts";

export const SITE_VISIT_PACKAGE_CAP_BYTES = 1_000_000_000;

export type SiteVisitEvidenceKind = "document" | "image" | "video";

export interface SiteVisitStagedEvidence {
  compressedBytes: number;
  id: string;
  kind: SiteVisitEvidenceKind;
  mimeType: string;
  name: string;
  originalBytes: number;
  previewUrl?: string;
  targetMilestoneKey?: string;
  targetSubmilestoneKey?: string;
  thumbnailKind: "document" | "image" | "video-poster";
  uploadState: "ready" | "uploaded";
}

export function classifyEvidenceMimeType(
  mimeType: string
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

export interface SiteVisitEvidenceUploadItem {
  evidence: SiteVisitStagedEvidence;
  file: Blob & { name?: string; type?: string };
  uploadedStorageId?: string;
}

interface SiteVisitUploadResponse {
  json: () => Promise<{ storageId: string }>;
  ok: boolean;
}

export async function fetchSiteVisitEvidenceWithTimeout({
  controller,
  file,
  mimeType,
  request = (url, init) => fetch(url, init),
  timeoutMs = 60_000,
  url,
}: {
  controller: AbortController;
  file: Blob;
  mimeType: string;
  request?: (
    url: string,
    init: RequestInit
  ) => Promise<SiteVisitUploadResponse>;
  timeoutMs?: number;
  url: string;
}): Promise<SiteVisitUploadResponse> {
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await request(url, {
      body: file,
      headers: {
        "Content-Type": mimeType,
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    if (
      timedOut &&
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
      throw new Error(
        `Evidence upload timed out after ${seconds} seconds. Check your connection and retry.`
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function uploadSiteVisitStagedEvidence({
  buildId,
  generateUploadUrl,
  onStorageUploaded,
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
  onUploadedItem?: (item: SiteVisitEvidenceUploadItem) => void;
  onStorageUploaded?: (
    item: SiteVisitEvidenceUploadItem,
    storageId: string
  ) => void;
  registerFile: (input: {
    buildId: string;
    clientEvidenceId: string;
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
    mimeType: string
  ) => Promise<SiteVisitUploadResponse>;
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
    let storageId = item.uploadedStorageId;
    if (!storageId) {
      const uploadUrl = await generateUploadUrl({ buildId, token });
      const response = await upload(uploadUrl, file, mimeType);
      if (!response.ok) {
        throw new Error(`Unable to upload ${fileName}.`);
      }
      ({ storageId } = await response.json());
      onStorageUploaded?.(item, storageId);
    }
    const registration = await registerFile({
      buildId,
      clientEvidenceId: item.evidence.id,
      fileName,
      mimeType,
      sizeBytes: file.size,
      storageId,
      targetMilestoneKey: item.evidence.targetMilestoneKey,
      targetSubmilestoneKey: item.evidence.targetSubmilestoneKey,
      token,
    });
    if (
      registration &&
      typeof registration === "object" &&
      "status" in registration &&
      registration.status === "rejected"
    ) {
      throw new Error(
        `Unable to register ${fileName}: its upload ID was already used for different evidence.`
      );
    }
    onUploadedItem?.(item);
  }

  return stagedItems.length;
}
