import { describe, expect, test } from "vitest";

import {
  hashSiteVisitToken,
  SITE_VISIT_COMPRESSED_PACKAGE_CAP_BYTES,
  validateIncludedSiteVisitMilestones,
  validateSiteVisitReportSubmission,
} from "./demo_site_visit_tokens";

const milestoneOrder = ["foundation", "framing", "rough-in", "drywall"];

describe("site visit token helpers", () => {
  test("allows the selected milestone with previous milestones", () => {
    expect(
      validateIncludedSiteVisitMilestones({
        includedMilestoneKeys: ["foundation", "framing"],
        milestoneOrder,
        selectedMilestoneKey: "framing",
      }),
    ).toEqual(["foundation", "framing"]);
  });

  test("requires the selected milestone", () => {
    expect(() =>
      validateIncludedSiteVisitMilestones({
        includedMilestoneKeys: ["foundation"],
        milestoneOrder,
        selectedMilestoneKey: "framing",
      }),
    ).toThrow("Selected milestone must be included");
  });

  test("rejects future milestones", () => {
    expect(() =>
      validateIncludedSiteVisitMilestones({
        includedMilestoneKeys: ["foundation", "framing", "drywall"],
        milestoneOrder,
        selectedMilestoneKey: "framing",
      }),
    ).toThrow("Site visit can only include current and previous milestones");
  });

  test("hashes tokens without storing the raw token value", async () => {
    const token = "token_demo_123";

    const hash = await hashSiteVisitToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(await hashSiteVisitToken(token)).toBe(hash);
  });

  test("requires uploaded evidence and report notes before token consumption", () => {
    expect(() =>
      validateSiteVisitReportSubmission({
        compressedPackageBytes: 10,
        reportNotes: "Observed foundation forms and pour records.",
        uploadedEvidenceCount: 0,
      }),
    ).toThrow("At least one uploaded evidence file is required.");

    expect(() =>
      validateSiteVisitReportSubmission({
        compressedPackageBytes: 10,
        reportNotes: "<p><br></p>",
        uploadedEvidenceCount: 1,
      }),
    ).toThrow("Site visit report notes are required.");
  });

  test("preserves rich-text report notes and returns plain audit text", () => {
    expect(
      validateSiteVisitReportSubmission({
        compressedPackageBytes: 10,
        reportNotes:
          "<p><strong>Observed</strong> foundation forms &amp; pour records.</p>",
        uploadedEvidenceCount: 1,
      }),
    ).toMatchObject({
      reportNotes:
        "<p><strong>Observed</strong> foundation forms &amp; pour records.</p>",
      reportNotesText: "Observed foundation forms & pour records.",
    });
  });

  test("enforces the compressed package cap", () => {
    expect(() =>
      validateSiteVisitReportSubmission({
        compressedPackageBytes: SITE_VISIT_COMPRESSED_PACKAGE_CAP_BYTES + 1,
        reportNotes: "Ready.",
        uploadedEvidenceCount: 1,
      }),
    ).toThrow("Compressed site visit package exceeds the 1 GB cap.");
  });
});
