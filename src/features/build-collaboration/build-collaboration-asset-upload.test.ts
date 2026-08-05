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

  test("keeps an asset retained by its clean-finalization callback when a later file fails", async () => {
    const firstFile = fileWithBytes(
      "first.pdf",
      "application/pdf",
      new TextEncoder().encode("first")
    );
    const secondFile = fileWithBytes(
      "second.pdf",
      "application/pdf",
      new TextEncoder().encode("second")
    );
    const abandonAssets = vi.fn(async () => 0);
    const onFinalizedCleanAsset = vi.fn(async () => undefined);
    const beginUpload = vi.fn(async ({ fileName }: { fileName: string }) => ({
      stagingSessionId: `staging-${fileName}`,
      uploadUrl: `https://uploads.example.test/${fileName}`,
    }));
    const finalizeAndScan = vi.fn(async ({ fileName }: { fileName: string }) => ({
      _id: `asset-${fileName}`,
      scanState: "clean" as const,
      state: "available" as const,
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ storageId: "storage-first" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response("failed", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadGovernedCollaborationAssets([firstFile, secondFile], {
        abandonAssets,
        beginUpload: beginUpload as never,
        buildId: "build-1" as never,
        contextKind: "costDocumentDraft",
        contextRecordId: "draft-1",
        finalizeAndScan: finalizeAndScan as never,
        onFinalizedCleanAsset,
        organizationId: "org-1",
        registerUpload: async () => null,
      })
    ).rejects.toThrow("Unable to upload second.pdf.");

    expect(onFinalizedCleanAsset).toHaveBeenCalledWith({
      assetId: "asset-first.pdf",
      file: firstFile,
    });
    expect(abandonAssets).not.toHaveBeenCalled();
  });

  test("abandons a clean asset when its retention callback fails", async () => {
    const file = fileWithBytes(
      "bind-failure.pdf",
      "application/pdf",
      new TextEncoder().encode("bind-failure")
    );
    const abandonAssets = vi.fn(async () => 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ storageId: "storage-bind-failure" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        })
      )
    );

    await expect(
      uploadGovernedCollaborationAssets([file], {
        abandonAssets,
        beginUpload: (async () => ({
          stagingSessionId: "staging-bind-failure",
          uploadUrl: "https://uploads.example.test/bind-failure",
        })) as never,
        buildId: "build-1" as never,
        contextKind: "costDocumentDraft",
        contextRecordId: "draft-1",
        finalizeAndScan: (async () => ({
          _id: "asset-bind-failure",
          scanState: "clean",
          state: "available",
        })) as never,
        onFinalizedCleanAsset: async () => {
          throw new Error("Unable to bind this Cost Document source page.");
        },
        organizationId: "org-1",
        registerUpload: async () => null,
      })
    ).rejects.toThrow("Unable to bind this Cost Document source page.");

    expect(abandonAssets).toHaveBeenCalledWith({
      assetIds: ["asset-bind-failure"],
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
