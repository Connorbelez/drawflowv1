// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { ProposalRemediationControl } from "./ProposalRemediationControl";

type RemediationProjection = FunctionReturnType<
  typeof api.production_proposals.getBackofficeProposalRemediation
>;

beforeEach(() => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000003"
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function declinedControl(): RemediationProjection {
  const policy = {
    drawApprovalMode: "both" as const,
    drawLenderQuorum: 1,
    milestoneApprovalMode: "both" as const,
    milestoneLenderQuorum: 1,
    milestoneReceiptInvoiceRequired: true,
    milestoneSiteVisitRequired: true,
  };
  const cycle = {
    acknowledgements: [],
    assignmentId: "assignment_1",
    changedCheckpoints: ["scheduleTimeline" as const],
    checkpoints: {
      accessReviewPolicy: policy,
      budget: { totalBudgetCents: 48_000_000 },
      builder: { builderProfileId: "builder_1", displayName: "Northstar" },
      milestoneCount: { count: 8 },
      scheduleTimeline: {
        milestonesFingerprint: "schedule-2",
        proposedStartDate: "2026-09-01",
        timelineRangeMax: 420,
        timelineRangeMin: 0,
      },
    },
    confirmationCycleId: "cycle_2",
    cycleNumber: 2,
    decision: {
      decidedAt: 3,
      decisionId: "decision_2",
      declinedCheckpoint: "scheduleTimeline" as const,
      reason: "Clarify the added month in the schedule.",
      status: "declined" as const,
    },
    openedAt: 2,
    proposalRevisionId: "revision_3",
    proposalRevisionNumber: 3,
    status: "declined" as const,
  };
  return {
    currentCycle: cycle,
    history: {
      continueCursor: "",
      isDone: true,
      page: [cycle],
    },
    lenderNeedsAction: false,
    remediation: {
      confirmationCycleId: "cycle_2",
      declinedCheckpoint: "scheduleTimeline",
      declinedProposalRevisionId: "revision_3",
      declinedProposalRevisionNumber: 3,
      editableProposalId: "proposal_1",
      privateReason: "Clarify the added month in the schedule.",
      publishBase: {
        expectedAssignmentId: "assignment_1",
        expectedProposalRevisionNumber: 3,
      },
      updateRequired: true,
    },
  } as unknown as RemediationProjection;
}

describe("ProposalRemediationControl", () => {
  test("keeps remediation on the same proposal and publishes against the exact declined base", async () => {
    const onNavigateToCheckpoint = vi.fn();
    const onLoadMoreHistory = vi.fn();
    const onPublish = vi.fn().mockResolvedValue({ revisionNumber: 4 });
    const control = declinedControl();
    control.history.isDone = false;

    render(
      <ProposalRemediationControl
        control={control}
        onLoadMoreHistory={onLoadMoreHistory}
        onNavigateToCheckpoint={onNavigateToCheckpoint}
        onPublish={onPublish}
      />
    );

    expect(
      screen.getByText("Clarify the added month in the schedule.")
    ).toBeTruthy();
    expect(screen.getByText("Revision 3 · cycle 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load older cycles" }));
    expect(onLoadMoreHistory).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Open affected proposal section" })
    );
    expect(onNavigateToCheckpoint).toHaveBeenCalledWith("scheduleTimeline");

    fireEvent.change(screen.getByLabelText("Revision publication reason"), {
      target: { value: "Updated the same proposal schedule and milestone facts." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish next revision" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish).toHaveBeenCalledWith({
      expectedAssignmentId: "assignment_1",
      expectedProposalRevisionNumber: 3,
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      reason: "Updated the same proposal schedule and milestone facts.",
    });
  });
});
