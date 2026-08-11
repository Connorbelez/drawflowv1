import { describe, expect, test } from "vitest";

import {
  isCanonicalReviewStaleConflict,
  isCanonicalStaleConflict,
} from "./SubmilestoneDetailCanonical.tsx";

describe("Sub-milestone stale conflict predicates", () => {
  test("recognizes structured child and parent review revision conflicts", () => {
    expect(
      isCanonicalReviewStaleConflict({
        data: { code: "STALE_SUBMILESTONE_REVIEW_REVISION" },
      }),
    ).toBe(true);
    expect(
      isCanonicalReviewStaleConflict({
        message: JSON.stringify({
          errorData: { code: "STALE_MILESTONE_REVIEW_REVISION" },
        }),
      }),
    ).toBe(true);
  });

  test("does not classify unrelated conflicts as review-stale", () => {
    for (const code of [
      "REVIEW_ROLE_REQUIRED",
      "REASON_REQUIRED",
      "STALE_EVIDENCE_PACKAGE_REVISION",
      "STALE_SUBMILESTONE_REVISION",
      "STALE_WORKFLOW_REVISION",
    ]) {
      expect(isCanonicalReviewStaleConflict({ cause: { code } })).toBe(false);
    }
  });

  test("keeps the broad canonical predicate unchanged", () => {
    expect(
      isCanonicalStaleConflict({
        error: { code: "STALE_EVIDENCE_PACKAGE_REVISION" },
      }),
    ).toBe(true);
    expect(
      isCanonicalStaleConflict({
        error: { code: "STALE_SUBMILESTONE_REVIEW_REVISION" },
      }),
    ).toBe(true);
  });
});
