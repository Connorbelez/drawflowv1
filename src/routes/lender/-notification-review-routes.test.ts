import { describe, expect, test } from "vitest";

import { reviewStateToMilestoneStatus } from "#/features/lender-portal/LenderNotificationReviewSurface.tsx";
import { validateLenderDrawSearch } from "./draws.tsx";
import { validateLenderMilestoneSearch } from "./milestones.tsx";
import {
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
  });

  test("retains only a complete typed Draw review correlation", () => {
    expect(
      validateLenderDrawSearch({
        drawRequestId: "draw-1",
        reviewCycleId: "cycle-3",
        reviewCycleNumber: "3",
      }),
    ).toEqual({
      drawRequestId: "draw-1",
      reviewCycleId: "cycle-3",
      reviewCycleNumber: 3,
    });
    expect(validateLenderDrawSearch({ reviewCycleNumber: 3 })).toEqual({});
  });

  test("retains the exact Proposal assignment and cycle correlation", () => {
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
      }),
    ).toEqual({
      assignmentId: "assignment-1",
      proposalId: "proposal-1",
    });
    expect(lenderProposalDetailQueryArgs("proposal-1", {})).toBe("skip");
  });

  test("maps review cycles into the shared Milestone sheet status contract", () => {
    expect(reviewStateToMilestoneStatus("in_review")).toBe("in_progress");
    expect(reviewStateToMilestoneStatus("partial_approval")).toBe(
      "in_progress",
    );
    expect(reviewStateToMilestoneStatus("correction_required")).toBe(
      "in_progress",
    );
    expect(reviewStateToMilestoneStatus("completed")).toBe("complete");
  });
});
