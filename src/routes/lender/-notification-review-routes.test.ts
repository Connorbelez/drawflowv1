import { describe, expect, test } from "vitest";

import { reviewStateToMilestoneStatus } from "#/features/lender-portal/LenderNotificationReviewSurface.tsx";
import {
  lenderDrawOrdinaryReviewSearch,
  lenderDrawReviewSearch,
  validateLenderDrawSearch,
} from "./draws.tsx";
import {
  lenderMilestoneOrdinaryReviewSearch,
  lenderMilestoneReviewSearch,
  validateLenderMilestoneSearch,
} from "./milestones.tsx";
import {
  historicalLenderProposalDetailQueryArgs,
  lenderProposalDetailQueryArgs,
  validateLenderProposalNotificationSearch,
} from "./proposals/$proposalId.tsx";

describe("lender notification review routes", () => {
  test("retains only a complete typed Milestone review correlation", () => {
    expect(
      validateLenderMilestoneSearch({
        milestoneId: "milestone-1",
        reviewCycleId: "cycle-2",
        reviewCycleNumber: "2",
      }),
    ).toEqual({
      milestoneId: "milestone-1",
      reviewCycleId: "cycle-2",
      reviewCycleNumber: 2,
    });
    expect(
      validateLenderMilestoneSearch({ reviewCycleNumber: "not-a-number" }),
    ).toEqual({});
    expect(
      lenderMilestoneReviewSearch({
        milestoneId: "milestone-1" as any,
        reviewCycleId: "cycle-2" as any,
        reviewCycleNumber: 2,
      })
    ).toEqual({
      milestoneId: "milestone-1",
      reviewCycleId: "cycle-2",
      reviewCycleNumber: 2,
    });
    expect(
      lenderMilestoneOrdinaryReviewSearch({
        milestoneId: "milestone-1" as any,
      })
    ).toEqual({ milestoneId: "milestone-1" });
  });

  test("retains only a complete typed Draw review correlation", () => {
    expect(
      validateLenderDrawSearch({
        drawRequestId: "draw-1",
        reviewCycleId: "cycle-3",
        reviewCycleNumber: 3,
      }),
    ).toEqual({
      drawRequestId: "draw-1",
      reviewCycleId: "cycle-3",
      reviewCycleNumber: 3,
    });
    expect(
      validateLenderDrawSearch({ reviewCycleNumber: "not-a-number" }),
    ).toEqual({});
    expect(
      lenderDrawReviewSearch({
        currentReviewCycleId: "cycle-3",
        currentReviewCycleNumber: 3,
        drawRequestId: "draw-1",
      }),
    ).toEqual({
      drawRequestId: "draw-1",
      reviewCycleId: "cycle-3",
      reviewCycleNumber: 3,
    });
    expect(
      lenderDrawReviewSearch({
        currentReviewCycleId: null,
        currentReviewCycleNumber: null,
        drawRequestId: "draw-stale",
      }),
    ).toBeNull();
    expect(
      lenderDrawOrdinaryReviewSearch({
        currentReviewCycleId: "cycle-3",
        currentReviewCycleNumber: 3,
        drawRequestId: "draw-1",
      })
    ).toEqual({ drawRequestId: "draw-1" });
    expect(
      lenderDrawOrdinaryReviewSearch({
        currentReviewCycleId: null,
        currentReviewCycleNumber: null,
        drawRequestId: "draw-stale",
      })
    ).toBeNull();
  });

  test("branches current and withdrawn Proposal detail at the route query boundary", () => {
    expect(
      validateLenderProposalNotificationSearch({
        assignmentId: "assignment-1",
        confirmationCycleId: "cycle-4",
        proposalRevisionId: "revision-3",
      }),
    ).toEqual({
      assignmentId: "assignment-1",
      confirmationCycleId: "cycle-4",
      proposalRevisionId: "revision-3",
    });
    expect(
      lenderProposalDetailQueryArgs("proposal-1", {
        assignmentId: "assignment-1",
      }, "current"),
    ).toEqual({
      assignmentId: "assignment-1",
      proposalId: "proposal-1",
    });
    expect(
      lenderProposalDetailQueryArgs(
        "proposal-1",
        { assignmentId: "assignment-1" },
        "withdrawn"
      )
    ).toBe("skip");
    expect(
      historicalLenderProposalDetailQueryArgs(
        "proposal-1",
        { assignmentId: "assignment-1" },
        "withdrawn",
        20
      )
    ).toEqual({
      assignmentId: "assignment-1",
      paginationOpts: { cursor: null, numItems: 20 },
      proposalId: "proposal-1",
    });
    expect(
      historicalLenderProposalDetailQueryArgs(
        "proposal-1",
        { assignmentId: "assignment-1" },
        "current",
        20
      )
    ).toBe("skip");
  });

  test("maps review cycles into the shared Milestone sheet status contract", () => {
    expect(reviewStateToMilestoneStatus("in_review")).toBe("in_progress");
    expect(reviewStateToMilestoneStatus("partial_approval")).toBe(
      "in_progress",
    );
    expect(reviewStateToMilestoneStatus("correction_required")).toBe(
      "needs_revision",
    );
    expect(reviewStateToMilestoneStatus("completed")).toBe("complete");
  });
});
