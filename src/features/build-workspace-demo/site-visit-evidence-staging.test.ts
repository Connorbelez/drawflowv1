import { describe, expect, test, vi } from "vitest";
import { evidenceMimeTypeForFile } from "#/lib/evidence-image-normalization.ts";

import {
  assertPackageWithinCap,
  buildStagedEvidence,
  fetchSiteVisitEvidenceWithTimeout,
  packageTotalBytes,
  SITE_VISIT_PACKAGE_CAP_BYTES,
  uploadSiteVisitStagedEvidence,
} from "./site-visit-evidence-staging";

describe("site visit evidence request timeout", () => {
  test("turns an upload timeout abort into an actionable error", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const request = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const result = fetchSiteVisitEvidenceWithTimeout({
      controller,
      file: new Blob(["evidence"]),
      mimeType: "image/jpeg",
      request,
      timeoutMs: 1_000,
      url: "https://upload.example.test",
    });
    const rejection = expect(result).rejects.toThrow(
      "Evidence upload timed out",
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    vi.useRealTimers();
  });

  test("preserves a user cancellation as an AbortError", async () => {
    const controller = new AbortController();
    const request = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const result = fetchSiteVisitEvidenceWithTimeout({
      controller,
      file: new Blob(["evidence"]),
      mimeType: "image/jpeg",
      request,
      timeoutMs: 60_000,
      url: "https://upload.example.test",
    });
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("site visit evidence staging", () => {
  test("classifies capture sources and estimates compressed package bytes", () => {
    const image = buildStagedEvidence({
      id: "photo-1",
      mimeType: "image/jpeg",
      name: "foundation.jpg",
      sizeBytes: 1_000_000,
      targetMilestoneKey: "foundation",
    });
    const video = buildStagedEvidence({
      id: "video-1",
      mimeType: "video/quicktime",
      name: "walkthrough.mov",
      sizeBytes: 10_000_000,
    });

    expect(image).toMatchObject({
      compressedBytes: 620_000,
      kind: "image",
      thumbnailKind: "image",
      uploadState: "ready",
    });
    expect(video).toMatchObject({
      compressedBytes: 7_200_000,
      kind: "video",
      thumbnailKind: "video-poster",
    });
    expect(packageTotalBytes([image, video])).toBe(7_820_000);
  });

  test("treats empty-type HEIC camera files as image evidence", () => {
    const mimeType = evidenceMimeTypeForFile({
      name: "IMG_4748.heic",
      type: "",
    });

    const evidence = buildStagedEvidence({
      id: "photo-1",
      mimeType,
      name: "IMG_4748.heic",
      sizeBytes: 1_000_000,
    });

    expect(evidence).toMatchObject({
      kind: "image",
      mimeType: "image/heic",
      thumbnailKind: "image",
    });
  });

  test("blocks staged packages over one gigabyte", () => {
    expect(() =>
      assertPackageWithinCap([
        buildStagedEvidence({
          id: "too-large",
          mimeType: "application/pdf",
          name: "large.pdf",
          sizeBytes: SITE_VISIT_PACKAGE_CAP_BYTES + 1,
        }),
      ]),
    ).toThrow("Compressed site visit package exceeds the 1 GB cap.");
  });

  test("rejects failed uploads before registering files or allowing report submission", async () => {
    const registerCalls: unknown[] = [];
    const stagedEvidence = buildStagedEvidence({
      id: "photo-1",
      mimeType: "image/jpeg",
      name: "foundation.jpg",
      sizeBytes: 1_000_000,
      targetMilestoneKey: "foundation",
    });
    const file = new File(["image"], "foundation.jpg", { type: "image/jpeg" });

    await expect(
      uploadSiteVisitStagedEvidence({
        buildId: "demo-timeline-steady-maple-ab12",
        generateUploadUrl: async () => "https://upload.example.test",
        registerFile: async (input) => {
          registerCalls.push(input);
        },
        stagedItems: [{ evidence: stagedEvidence, file }],
        token: "token-123",
        upload: async () => ({
          json: async () => ({ storageId: "storage-1" }),
          ok: false,
        }),
      }),
    ).rejects.toThrow("Unable to upload foundation.jpg.");
    expect(registerCalls).toEqual([]);
  });

  test("registers normalized browser-safe image metadata after upload", async () => {
    const registerCalls: unknown[] = [];
    const stagedEvidence = buildStagedEvidence({
      id: "photo-1",
      mimeType: "image/heic",
      name: "IMG_4748.heic",
      sizeBytes: 1_000_000,
      targetMilestoneKey: "foundation",
    });
    const file = new File(["heic"], "IMG_4748.heic", { type: "image/heic" });
    const normalizedFile = new File(["jpeg"], "IMG_4748.jpg", {
      type: "image/jpeg",
    });

    await uploadSiteVisitStagedEvidence({
      buildId: "demo-timeline-steady-maple-ab12",
      generateUploadUrl: async () => "https://upload.example.test",
      normalizeFile: async () => normalizedFile,
      registerFile: async (input) => {
        registerCalls.push(input);
      },
      stagedItems: [{ evidence: stagedEvidence, file }],
      token: "token-123",
      upload: async (_url, uploadFile, mimeType) => {
        expect(uploadFile).toBe(normalizedFile);
        expect(mimeType).toBe("image/jpeg");
        return {
          json: async () => ({ storageId: "storage-1" }),
          ok: true,
        };
      },
    });

    expect(registerCalls).toEqual([
      expect.objectContaining({
        fileName: "IMG_4748.jpg",
        mimeType: "image/jpeg",
        sizeBytes: normalizedFile.size,
        storageId: "storage-1",
      }),
    ]);
  });

  test("keeps staged evidence when the server rejects an idempotency conflict", async () => {
    const uploaded: string[] = [];
    const stagedEvidence = buildStagedEvidence({
      id: "photo-conflict",
      mimeType: "image/jpeg",
      name: "foundation-conflict.jpg",
      sizeBytes: 1_000,
      targetMilestoneKey: "foundation",
    });
    const file = new File(["image"], "foundation-conflict.jpg", {
      type: "image/jpeg",
    });

    await expect(
      uploadSiteVisitStagedEvidence({
        buildId: "demo-timeline-steady-maple-ab12",
        generateUploadUrl: async () => "https://upload.example.test",
        onUploadedItem: (item) => uploaded.push(item.evidence.id),
        registerFile: async () => ({
          reason: "idempotency_conflict",
          status: "rejected",
          storageDisposition: "preserved_unowned_upload",
        }),
        stagedItems: [{ evidence: stagedEvidence, file }],
        token: "token-123",
        upload: async () => ({
          json: async () => ({ storageId: "storage-conflict" }),
          ok: true,
        }),
      })
    ).rejects.toThrow(/upload ID was already used/i);
    expect(uploaded).toEqual([]);
  });

  test("reuses persisted storage when registration success is ambiguous", async () => {
    const stagedEvidence = buildStagedEvidence({
      id: "photo-ambiguous",
      mimeType: "image/jpeg",
      name: "foundation-ambiguous.jpg",
      sizeBytes: 1_000,
      targetMilestoneKey: "foundation",
    });
    const file = new File(["image"], "foundation-ambiguous.jpg", {
      type: "image/jpeg",
    });
    let persistedStorageId: string | undefined;
    let uploadCalls = 0;
    let registrationCalls = 0;

    await expect(
      uploadSiteVisitStagedEvidence({
        buildId: "demo-timeline-steady-maple-ab12",
        generateUploadUrl: async () => "https://upload.example.test",
        onStorageUploaded: (_item, storageId) => {
          persistedStorageId = storageId;
        },
        registerFile: async () => {
          registrationCalls += 1;
          throw new Error("The registration response was lost.");
        },
        stagedItems: [{ evidence: stagedEvidence, file }],
        token: "token-123",
        upload: async () => {
          uploadCalls += 1;
          return {
            json: async () => ({ storageId: "storage-ambiguous" }),
            ok: true,
          };
        },
      })
    ).rejects.toThrow("registration response was lost");

    const completed: string[] = [];
    await uploadSiteVisitStagedEvidence({
      buildId: "demo-timeline-steady-maple-ab12",
      generateUploadUrl: async () => {
        throw new Error("A retry must not request another upload URL.");
      },
      onUploadedItem: (item) => completed.push(item.evidence.id),
      registerFile: async (input) => {
        registrationCalls += 1;
        expect(input.storageId).toBe("storage-ambiguous");
        return {
          assetId: "asset-1",
          status: "replayed",
          storageDisposition: "reused_existing_upload",
        };
      },
      stagedItems: [
        {
          evidence: stagedEvidence,
          file,
          uploadedStorageId: persistedStorageId,
        },
      ],
      token: "token-123",
      upload: async () => {
        throw new Error("A retry must not upload the file again.");
      },
    });

    expect(uploadCalls).toBe(1);
    expect(registrationCalls).toBe(2);
    expect(completed).toEqual(["photo-ambiguous"]);
  });
});
