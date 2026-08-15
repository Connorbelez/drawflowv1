import { describe, expect, test } from "vitest";

import {
  canonicalDeepEqual,
  deterministicProposalRevisionDiff,
} from "./lender_portal_phase3";

describe("Lender Portal Phase 3 deterministic checkpoint comparison", () => {
  test("treats object key order as structural equality while preserving array order", () => {
    expect(canonicalDeepEqual({ a: 1, nested: { b: 2, a: 1 } }, { nested: { a: 1, b: 2 }, a: 1 })).toBe(true);
    expect(canonicalDeepEqual([1, 2], [2, 1])).toBe(false);
  });

  test("does not report a checkpoint change for reordered object keys", () => {
    const prior = {
      accessReviewPolicy: {
        drawApprovalMode: "backoffice_only" as const,
        drawLenderQuorum: null,
        milestoneApprovalMode: "backoffice_only" as const,
        milestoneLenderQuorum: null,
        milestoneReceiptInvoiceRequired: false,
        milestoneSiteVisitRequired: false,
      },
      budget: { totalBudgetCents: 100 },
      builder: { builderProfileId: "builder" as never, displayName: "Builder" },
      milestoneCount: { count: 1 },
      scheduleTimeline: {
        milestonesFingerprint: "abc",
        proposedStartDate: null,
        timelineRangeMax: 10,
        timelineRangeMin: 0,
      },
    };
    const current = JSON.parse(JSON.stringify(prior)) as typeof prior;
    expect(deterministicProposalRevisionDiff(prior, current)).toEqual([]);
  });
});
