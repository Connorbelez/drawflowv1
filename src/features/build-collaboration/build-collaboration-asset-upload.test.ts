// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "./build-collaboration-asset-upload.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadGovernedCollaborationAssets", () => {
  test("abandons large cleanup sets in mutation-safe batches", async () => {
    const abandonAssets = vi.fn(async () => 25);
    const assetIds = Array.from(
      { length: 51 },
      (_, index) => `asset-${index + 1}` as never
    );

    await abandonGovernedCollaborationAssets({
      abandonAssets,
      assetIds,
      buildId: "build-1" as never,
      organizationId: "org-1",
      reason: "Cost Document submission did not commit.",
    });

    expect(abandonAssets).toHaveBeenCalledTimes(3);
    expect(
      abandonAssets.mock.calls.map(([input]) => input.assetIds.length)
    ).toEqual([25, 25, 1]);
    expect(
      abandonAssets.mock.calls.flatMap(([input]) => input.assetIds)
    ).toEqual(assetIds);
  });

  test("uploads bytes, hashes the exact file, and returns only a clean asset", async () => {
    const bytes = new TextEncoder().encode("hello");
    const capturedAt = Date.parse("2026-07-31T12:00:00.000Z");
    const file = fileWithBytes(
      "inspection.txt",
      "text/plain",
      bytes,
      capturedAt
    );
    const beginUpload = vi.fn(async () => ({
      stagingSessionId: "staging-1",
      uploadUrl: "https://uploads.example.test/asset",
    }));
    const finalizeAndScan = vi.fn(async () => ({
      _id: "asset-1",
      scanState: "clean" as const,
      state: "available" as const,
    }));
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ storageId: "storage-1" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const abandonAssets = vi.fn(async () => 0);
    const registerUpload = vi.fn(async () => null);

    const result = await uploadGovernedCollaborationAssets([file], {
      abandonAssets,
      beginUpload: beginUpload as never,
      buildId: "build-1" as never,
      contextKind: "post",
      contextRecordId: "post-1",
      finalizeAndScan: finalizeAndScan as never,
      organizationId: "org-1",
      registerUpload,
    });

    expect(result).toEqual(["asset-1"]);
    expect(beginUpload).toHaveBeenCalledWith({
      buildId: "build-1",
      contextKind: "post",
      contextRecordId: "post-1",
      fileName: "inspection.txt",
      mimeType: "text/plain",
      organizationId: "org-1",
      sizeBytes: 5,
      sourceCapturedAt: capturedAt,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://uploads.example.test/asset",
      expect.objectContaining({
        body: file,
        headers: { "Content-Type": "text/plain" },
        method: "POST",
      }),
    );
    expect(finalizeAndScan).toHaveBeenCalledWith({
      buildId: "build-1",
      contentHashSha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      fileName: "inspection.txt",
      mimeType: "text/plain",
      organizationId: "org-1",
      stagingSessionId: "staging-1",
      storageId: "storage-1",
      supersedesAssetId: undefined,
    });
    expect(registerUpload).toHaveBeenCalledWith({
      buildId: "build-1",
      organizationId: "org-1",
      stagingSessionId: "staging-1",
      storageId: "storage-1",
    });
    expect(abandonAssets).not.toHaveBeenCalled();
  });

  test("fails closed when scanning does not release the asset", async () => {
    const bytes = new TextEncoder().encode("unsafe");
    const file = fileWithBytes("unsafe.pdf", "application/pdf", bytes);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ storageId: "storage-2" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );

    const abandonAssets = vi.fn(async () => 1);
    await expect(
      uploadGovernedCollaborationAssets([file], {
        abandonAssets,
        beginUpload: (async () => ({
          stagingSessionId: "staging-2",
          uploadUrl: "https://uploads.example.test/unsafe",
        })) as never,
        buildId: "build-1" as never,
        contextKind: "composer",
        finalizeAndScan: (async () => ({
          _id: "asset-2",
          scanMessage: "Malware signature detected.",
          scanState: "rejected",
          state: "rejected",
        })) as never,
        organizationId: "org-1",
        registerUpload: async () => null,
      }),
    ).rejects.toThrow("Malware signature detected.");
    expect(abandonAssets).toHaveBeenCalledWith({
      assetIds: ["asset-2"],
      buildId: "build-1",
      organizationId: "org-1",
      reason: "Upload bundle did not reach publication.",
    });
  });
});

function fileWithBytes(
  name: string,
  type: string,
  bytes: Uint8Array,
  lastModified?: number
) {
  const file = new File([bytes], name, { lastModified, type });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => bytes.buffer.slice(0),
  });
  return file;
}
