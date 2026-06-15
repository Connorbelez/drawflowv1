const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

const BROWSER_PREVIEW_IMAGE_MIME_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

export function isBrowserPreviewableImageMime(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  return BROWSER_PREVIEW_IMAGE_MIME_TYPES.has(normalized);
}

export function isHeicLikeEvidenceImage(input: {
  fileName?: string;
  mimeType?: string;
}) {
  const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
  const fileName = input.fileName?.trim().toLowerCase() ?? "";
  return (
    HEIC_MIME_TYPES.has(mimeType) ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif")
  );
}

export function evidenceMimeTypeForFile(file: Pick<File, "name" | "type">) {
  if (file.type) {
    return file.type;
  }
  if (isHeicLikeEvidenceImage({ fileName: file.name })) {
    return "image/heic";
  }
  return "application/octet-stream";
}

export function browserSafeEvidenceImageName(fileName: string) {
  const trimmed = fileName.trim() || "evidence-image";
  if (/\.(heic|heif)$/i.test(trimmed)) {
    return trimmed.replace(/\.(heic|heif)$/i, ".jpg");
  }
  return `${trimmed}.jpg`;
}

export async function convertHeicEvidenceBlobToJpeg(
  blob: Blob,
  fileName = "evidence-image.heic"
) {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob,
    quality: 0.9,
    toType: "image/jpeg",
  });
  const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
  return new Blob([jpegBlob], { type: "image/jpeg" });
}

export async function normalizeEvidenceFileForUpload(file: File) {
  if (!isHeicLikeEvidenceImage({ fileName: file.name, mimeType: file.type })) {
    return file;
  }

  const jpegBlob = await convertHeicEvidenceBlobToJpeg(file, file.name);
  return new File([jpegBlob], browserSafeEvidenceImageName(file.name), {
    lastModified: file.lastModified,
    type: "image/jpeg",
  });
}
