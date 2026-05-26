import { describe, expect, test } from "vitest";

import {
  assertPackageWithinCap,
  buildStagedEvidence,
  packageTotalBytes,
  SITE_VISIT_PACKAGE_CAP_BYTES,
  uploadSiteVisitStagedEvidence,
} from "./site-visit-evidence-staging";

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

  test("blocks staged packages over one gigabyte", () => {
    expect(() =>
      assertPackageWithinCap([
        buildStagedEvidence({
          id: "too-large",
          mimeType: "application/pdf",
          name: "large.pdf",
          sizeBytes: SITE_VISIT_PACKAGE_CAP_BYTES + 1,
        }),
      ])
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
});
