import { describe, expect, test } from "vitest";

import {
  assertLenderDrawQueueRecord,
  lenderDrawQueue,
  lenderDrawQueueRecords,
  projectLenderDrawQueueRecord,
} from "./lenderDrawQueueContract";

describe("locked lender Draw Queue data contract", () => {
  test("validates every representative record and its provenance", () => {
    expect(() => {
      for (const record of lenderDrawQueueRecords) {
        assertLenderDrawQueueRecord(record);
      }
    }).not.toThrow();
  });

  test("derives Evidence package complete from satisfied requirements", () => {
    const source = lenderDrawQueueRecords[0];
    if (!source) {
      throw new Error("Expected a representative Draw request.");
    }

    const complete = projectLenderDrawQueueRecord(source);
    expect(complete.evidence).toContainEqual(
      expect.objectContaining({
        kind: "evidence-package",
        label: "Evidence package complete",
        tone: "success",
      }),
    );

    const incomplete = projectLenderDrawQueueRecord({
      ...source,
      evidencePackage: {
        ...source.evidencePackage,
        satisfiedItemCount: source.evidencePackage.requiredItemCount - 1,
      },
    });
    expect(incomplete.evidence).toContainEqual(
      expect.objectContaining({
        kind: "evidence-package",
        label: "3 of 4 evidence requirements satisfied",
        tone: "warning",
      }),
    );
  });

  test("rejects completion without provenance and unreconciled funding", () => {
    const source = lenderDrawQueueRecords[0];
    if (!source) {
      throw new Error("Expected a representative Draw request.");
    }

    expect(() =>
      projectLenderDrawQueueRecord({
        ...source,
        evidencePackage: {
          ...source.evidencePackage,
          packageRevisionIds: [],
        },
      }),
    ).toThrow(/package revision provenance/);

    expect(() =>
      projectLenderDrawQueueRecord({
        ...source,
        fundingPosition: {
          ...source.fundingPosition,
          remainingAfterCents: source.fundingPosition.remainingAfterCents + 1,
        },
      }),
    ).toThrow(/pooled funding position must reconcile/);
  });

  test("projects the locked queue states from cycle and approval facts", () => {
    expect(lenderDrawQueue.map((request) => request.state)).toEqual([
      "needs-action",
      "needs-action",
      "needs-action",
      "waiting",
      "correction",
      "approved",
    ]);
    expect(lenderDrawQueue[0]?.submittedAt).toBe("Aug 12, 2026 · 3:42 PM");
  });
});
