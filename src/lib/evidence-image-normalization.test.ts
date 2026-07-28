// @vitest-environment jsdom

import heic2any from "heic2any";
import { describe, expect, test, vi } from "vitest";

import {
  browserSafeEvidenceImageName,
  convertHeicEvidenceBlobToJpeg,
  evidenceMimeTypeForFile,
  isBrowserPreviewableImageMime,
  isHeicLikeEvidenceImage,
  normalizeEvidenceFileForUpload,
} from "./evidence-image-normalization";

vi.mock("heic2any", () => ({
  default: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
}));

vi.mock("heic-decode", () => ({
  default: vi.fn(async () => ({
    data: new Uint8ClampedArray(16),
    height: 2,
    width: 2,
  })),
}));

describe("evidence image normalization", () => {
  test("identifies browser-previewable image formats separately from HEIC", () => {
    expect(isBrowserPreviewableImageMime("image/jpeg")).toBe(true);
    expect(isBrowserPreviewableImageMime("image/png")).toBe(true);
    expect(isBrowserPreviewableImageMime("image/webp")).toBe(true);
    expect(isBrowserPreviewableImageMime("image/heic")).toBe(false);
  });

  test("detects HEIC evidence from MIME type or filename", () => {
    expect(isHeicLikeEvidenceImage({ mimeType: "image/heic" })).toBe(true);
    expect(isHeicLikeEvidenceImage({ fileName: "IMG_4748.HEIC" })).toBe(true);
    expect(isHeicLikeEvidenceImage({ fileName: "foundation.jpg" })).toBe(false);
  });

  test("infers camera HEIC MIME type when browsers provide an empty file type", () => {
    expect(evidenceMimeTypeForFile({ name: "IMG_4748.heic", type: "" })).toBe(
      "image/heic",
    );
    expect(evidenceMimeTypeForFile({ name: "permit.pdf", type: "" })).toBe(
      "application/octet-stream",
    );
  });

  test("converts HEIC upload files to browser-safe JPEG files", async () => {
    const file = new File(["heic"], "IMG_4748.heic", { type: "image/heic" });

    const normalized = await normalizeEvidenceFileForUpload(file);

    expect(normalized.name).toBe("IMG_4748.jpg");
    expect(normalized.type).toBe("image/jpeg");
  });

  test("keeps browser-safe image files unchanged", async () => {
    const file = new File(["jpeg"], "foundation.jpg", { type: "image/jpeg" });

    await expect(normalizeEvidenceFileForUpload(file)).resolves.toBe(file);
    expect(browserSafeEvidenceImageName("IMG_4748.heif")).toBe("IMG_4748.jpg");
  });

  test("falls back to the newer WASM decoder for unsupported iPhone HEIC files", async () => {
    vi.mocked(heic2any).mockRejectedValueOnce({
      code: 2,
      message: "ERR_LIBHEIF format not supported",
    });
    const putImageData = vi.fn();
    const createElement = vi.spyOn(document, "createElement");
    createElement.mockReturnValueOnce({
      getContext: () => ({
        createImageData: () => ({ data: new Uint8ClampedArray(16) }),
        putImageData,
      }),
      height: 0,
      toBlob: (callback: BlobCallback) =>
        callback(new Blob(["fallback-jpeg"], { type: "image/jpeg" })),
      width: 0,
    } as unknown as HTMLCanvasElement);

    const converted = await convertHeicEvidenceBlobToJpeg(
      new Blob(["heic"], { type: "image/heic" }),
      "IMG_4748.heic",
    );

    expect(converted.type).toBe("image/jpeg");
    expect(putImageData).toHaveBeenCalledOnce();
    createElement.mockRestore();
  });
});
