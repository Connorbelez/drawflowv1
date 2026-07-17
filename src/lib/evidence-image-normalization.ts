const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSION = /\.(heic|heif)$/i;

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
  if (HEIC_EXTENSION.test(trimmed)) {
    return trimmed.replace(HEIC_EXTENSION, ".jpg");
  }
  return `${trimmed}.jpg`;
}

export async function convertHeicEvidenceBlobToJpeg(
  blob: Blob,
  fileName = "evidence-image.heic"
) {
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({
      blob,
      quality: 0.9,
      toType: "image/jpeg",
    });
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
    return new Blob([jpegBlob], { type: "image/jpeg" });
  } catch {
    // heic2any's embedded libheif rejects some current iPhone encodings with
    // ERR_LIBHEIF format not supported. heic-decode ships a newer WASM decoder
    // and gives those assets a reliable browser-side compatibility path.
    return convertHeicWithCanvas(blob, fileName);
  }
}

async function convertHeicWithCanvas(blob: Blob, fileName: string) {
  const { default: decodeHeic } = await import("heic-decode");
  const decoded = await decodeHeic({
    buffer: new Uint8Array(await blob.arrayBuffer()),
  });
  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(`Unable to prepare a JPEG preview for ${fileName}.`);
  }
  const imageData = context.createImageData(decoded.width, decoded.height);
  imageData.data.set(decoded.data);
  context.putImageData(imageData, 0, 0);
  const jpegBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.9);
  });
  if (!jpegBlob) {
    throw new Error(`Unable to encode a JPEG preview for ${fileName}.`);
  }
  return jpegBlob;
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
