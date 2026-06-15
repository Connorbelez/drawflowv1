"use node";

import { v } from "convex/values";

import { publicAction } from "./fluent";

const ALLOWED_CONVEX_STORAGE_HOST_SUFFIXES = [
  ".convex.cloud",
  ".convex.site",
] as const;

export const convertEvidenceImagePreview = publicAction
  .input({ sourceUrl: v.string() })
  .returns(v.bytes())
  .handler(async (_ctx, args) => {
    let parsedSourceUrl: URL;
    try {
      parsedSourceUrl = new URL(args.sourceUrl);
    } catch {
      throw new Error("Invalid evidence source URL.");
    }

    if (!isAllowedConvexStorageUrl(parsedSourceUrl)) {
      throw new Error("Unsupported evidence source URL.");
    }

    const sourceResponse = await fetch(parsedSourceUrl);
    if (!sourceResponse.ok) {
      throw new Error("Unable to read evidence image.");
    }

    const sourceBytes = Buffer.from(await sourceResponse.arrayBuffer());
    try {
      const { default: convert } = (await import("heic-convert")) as {
        default: (input: {
          buffer: Buffer;
          format: "JPEG";
          quality: number;
        }) => Promise<Buffer>;
      };
      const previewBytes = await convert({
        buffer: sourceBytes,
        format: "JPEG",
        quality: 0.88,
      });
      const arrayBuffer = new ArrayBuffer(previewBytes.byteLength);
      new Uint8Array(arrayBuffer).set(previewBytes);
      return arrayBuffer;
    } catch {
      throw new Error("Unable to convert evidence image preview.");
    }
  })
  .internal();

function isAllowedConvexStorageUrl(url: URL) {
  if (url.protocol !== "https:") {
    return false;
  }
  if (!url.pathname.includes("/api/storage/")) {
    return false;
  }
  return ALLOWED_CONVEX_STORAGE_HOST_SUFFIXES.some((suffix) =>
    url.hostname.endsWith(suffix)
  );
}
