import { describe, expect, test } from "vitest";

import {
  hashSiteVisitToken,
  SITE_VISIT_COMPRESSED_PACKAGE_CAP_BYTES,
  createSiteVisitRecoveryReference,
  validateIncludedSiteVisitMilestones,
  validateSiteVisitReplacementRequest,
  validateSiteVisitReportSubmission,
  validateSiteVisitSubmissionContext,
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

  test("creates a separate recovery request for expired or consumed tokens", () => {
    expect(
      validateSiteVisitReplacementRequest({
        reason: " Another inspection is required after corrective work. ",
        tokenState: "consumed",
      }),
    ).toEqual({
      reason: "Another inspection is required after corrective work.",
      tokenState: "consumed",
    });
    expect(createSiteVisitRecoveryReference("a1b2c3d4-e5f6")).toBe(
      "SVR-A1B2C3D4"
    );
    expect(() =>
      validateSiteVisitReplacementRequest({
        reason: "Retry active token.",
        tokenState: "active",
      }),
    ).toThrow("Only expired or consumed site visits can request a new link.");
  });

  test("requires structured prerequisite acknowledgement and preserves unverified location attempts", () => {
    expect(() =>
      validateSiteVisitSubmissionContext({
        locationAttempt: {
          attempted: true,
          attemptedAt: 1_721_234_567_890,
          failureReason: "Browser location permission was denied.",
          permissionOutcome: "denied",
          verified: false,
        },
        missingPrerequisites: ["permit"],
      }),
    ).toThrow("A prerequisite exception acknowledgement is required.");

    expect(
      validateSiteVisitSubmissionContext({
        locationAttempt: {
          attempted: true,
          attemptedAt: 1_721_234_567_890,
          failureReason: "Browser location permission was denied.",
          permissionOutcome: "denied",
          verified: false,
        },
        missingPrerequisites: ["permit"],
        prerequisiteException: {
          acknowledged: true,
          reason: "Permit was unavailable; photographed posted approvals instead.",
        },
      }),
    ).toEqual({
      locationAttempt: {
        attempted: true,
        attemptedAt: 1_721_234_567_890,
        failureReason: "Browser location permission was denied.",
        permissionOutcome: "denied",
        verified: false,
      },
      missingPrerequisites: ["permit"],
      prerequisiteException: {
        acknowledged: true,
        reason: "Permit was unavailable; photographed posted approvals instead.",
      },
    });
  });
});
