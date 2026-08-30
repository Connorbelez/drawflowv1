// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { FunctionReturnType } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { LenderProposalConfirmationSheet } from "./LenderProposalConfirmationSheet";

type Confirmation = FunctionReturnType<
  typeof api.production_proposals.getLenderProposalConfirmation
>;

afterEach(cleanup);

const policy = {
  drawApprovalMode: "both" as const,
  drawLenderQuorum: 1,
  milestoneApprovalMode: "both" as const,
  milestoneLenderQuorum: 1,
  milestoneReceiptInvoiceRequired: true,
  milestoneSiteVisitRequired: true,
};

const checkpoints = {
  accessReviewPolicy: policy,
  budget: { totalBudgetCents: 48_000_000 },
  builder: { builderProfileId: "builder_1", displayName: "Northstar Construction" },
  milestoneCount: { count: 8 },
  scheduleTimeline: {
    milestonesFingerprint: "schedule-current",
    proposedStartDate: "2026-09-01",
    timelineRangeMax: 420,
    timelineRangeMin: 0,
  },
};

function confirmation({
  complete = false,
  decisionAuthorized = true,
}: {
  complete?: boolean;
  decisionAuthorized?: boolean;
} = {}): Confirmation {
  const names = [
    "milestoneCount",
    "budget",
    "scheduleTimeline",
    "builder",
    ...(complete ? ["accessReviewPolicy"] : []),
  ] as const;
  const current = {
    acknowledgements: names.map((checkpoint, index) => ({
      acknowledgedAt: index + 10,
      acknowledgedByRole: "lender",
      acknowledgedByWorkosUserId: "user_1",
      acknowledgementId: `ack_${index}`,
      checkpoint,
      sequence: index + 1,
    })),
    assignmentId: "assignment_1",
    changedCheckpoints: ["milestoneCount", "scheduleTimeline"],
    checkpoints,
    confirmationCycleId: "cycle_2",
    cycleNumber: 2,
    decision: null,
    openedAt: 2,
    proposalRevisionId: "revision_3",
    proposalRevisionNumber: 3,
    status: "pending",
  };
  const prior = {
    ...current,
    acknowledgements: [],
    changedCheckpoints: [],
    checkpoints: {
      ...checkpoints,
      milestoneCount: { count: 7 },
      scheduleTimeline: {
        ...checkpoints.scheduleTimeline,
        milestonesFingerprint: "schedule-prior",
        timelineRangeMax: 390,
      },
    },
    confirmationCycleId: "cycle_1",
    cycleNumber: 1,
    proposalRevisionId: "revision_2",
    proposalRevisionNumber: 2,
    status: "declined",
  };
  return {
    canAcknowledge: true,
    canDecide: complete,
    closingGateSatisfied: false,
    currentCycle: current,
    decisionAuthorized,
    history: { continueCursor: "", isDone: true, page: [current, prior] },
    lenderNeedsAction: true,
  } as unknown as Confirmation;
}

describe("LenderProposalConfirmationSheet", () => {
  test("renders the server revision diff and records the fifth acknowledgement", async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    const onLoadMoreHistory = vi.fn();
    const paginatedConfirmation = confirmation();
    paginatedConfirmation.history.isDone = false;
    render(
      <LenderProposalConfirmationSheet
        buildName="Juniper Row Homes"
        confirmation={paginatedConfirmation}
        onAcknowledge={onAcknowledge}
        onApprove={vi.fn()}
        onDecline={vi.fn()}
        onLoadMoreHistory={onLoadMoreHistory}
        onOpenChange={vi.fn()}
        open
        pending={false}
        viewerWorkosUserId="user_1"
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        /Review each checkpoint. Acknowledgements are recorded on the current revision./
      )
    ).toBeTruthy();
    expect(within(dialog).getByText("4 of 5 acknowledged")).toBeTruthy();
    expect(
      within(dialog).getByRole("button", {
        name: "Expand Milestone count checkpoint",
      })
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /I acknowledge the current access and review policy facts/i,
      })
    );
    await waitFor(() =>
      expect(onAcknowledge).toHaveBeenCalledWith("accessReviewPolicy")
    );
    onAcknowledge.mockClear();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Expand Milestone count checkpoint",
      })
    );
    expect(
      within(dialog).getByRole("button", {
        name: "Collapse Milestone count checkpoint",
      })
    ).toBeTruthy();
    expect(within(dialog).getByText("Prior reviewed revision")).toBeTruthy();
    expect(within(dialog).getAllByText("8")).toHaveLength(1);
    expect(within(dialog).getByText("7")).toBeTruthy();
    expect(within(dialog).getByText("Cycle 1 · Revision 2")).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Load older cycles" })
    );
    expect(onLoadMoreHistory).toHaveBeenCalledTimes(1);
  });

  test("enforces the reason gate and sends the final decision through the sheet", async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <LenderProposalConfirmationSheet
        buildName="Juniper Row Homes"
        confirmation={confirmation({ complete: true })}
        onAcknowledge={vi.fn()}
        onApprove={onApprove}
        onDecline={vi.fn()}
        onOpenChange={vi.fn()}
        open
        pending={false}
        viewerWorkosUserId="user_1"
      />
    );

    const dialog = screen.getByRole("dialog");
    const approveButton = within(dialog).getByRole("button", {
      name: "Approve Revision 3",
    });
    expect((approveButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Lender approval reason"), {
      target: { value: "All current revision facts are acceptable." },
    });
    fireEvent.click(approveButton);

    await waitFor(() =>
      expect(onApprove).toHaveBeenCalledWith(
        "All current revision facts are acceptable."
      )
    );
  });

  test("requires a private reason and checkpoint for a revision request", async () => {
    const onDecline = vi.fn().mockResolvedValue(undefined);
    render(
      <LenderProposalConfirmationSheet
        buildName="Juniper Row Homes"
        confirmation={confirmation()}
        onAcknowledge={vi.fn()}
        onApprove={vi.fn()}
        onDecline={onDecline}
        onOpenChange={vi.fn()}
        open
        pending={false}
        viewerWorkosUserId="user_1"
      />
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Request revision" })
    );
    fireEvent.change(
      within(dialog).getByLabelText("Checkpoint that requires revision"),
      { target: { value: "builder" } }
    );
    fireEvent.change(
      within(dialog).getByLabelText("Private revision request reason"),
      { target: { value: "Confirm the current builder assignment." } }
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Request Revision 4" })
    );

    await waitFor(() =>
      expect(onDecline).toHaveBeenCalledWith(
        "builder",
        "Confirm the current builder assignment."
      )
    );
  });

  test("keeps lender staff acknowledgement-only and hides every decision action", () => {
    render(
      <LenderProposalConfirmationSheet
        buildName="Juniper Row Homes"
        confirmation={confirmation({ decisionAuthorized: false })}
        onAcknowledge={vi.fn()}
        onApprove={vi.fn()}
        onDecline={vi.fn()}
        onOpenChange={vi.fn()}
        open
        pending={false}
        viewerWorkosUserId="user_1"
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Acknowledgement access only")).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "Confirm" })
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Request revision" })
    ).toBeNull();
    expect(
      within(dialog).queryByLabelText("Private revision request reason")
    ).toBeNull();
  });

  test("presents Confirm as a pressed decision-type toggle, not the approval action", () => {
    const onApprove = vi.fn();
    render(
      <LenderProposalConfirmationSheet
        buildName="Juniper Row Homes"
        confirmation={confirmation()}
        onAcknowledge={vi.fn()}
        onApprove={onApprove}
        onDecline={vi.fn()}
        onOpenChange={vi.fn()}
        open
        pending={false}
        viewerWorkosUserId="user_1"
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Decision type")).toBeTruthy();
    const confirmToggle = within(dialog).getByRole("button", {
      name: "Confirm",
    });
    expect(confirmToggle.getAttribute("data-pressed")).toBe("");
    fireEvent.click(confirmToggle);
    expect(onApprove).not.toHaveBeenCalled();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Approve Revision 3",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(within(dialog).getByText("Acknowledgements incomplete")).toBeTruthy();
  });
});
