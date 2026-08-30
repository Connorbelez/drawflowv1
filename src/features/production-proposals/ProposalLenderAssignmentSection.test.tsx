// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ProposalLenderAssignmentSection } from "./ProposalLenderAssignmentSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const proposal = {
  buildName: "Hamilton Infill Build",
  location: "123 Hamilton Street",
  status: "approved" as const,
};

const lenderOrganizations = [
  {
    lenderOrganizationId: "org_northstar",
    lenderOrganizationName: "Northstar Lending Organization",
  },
];

describe("ProposalLenderAssignmentSection", () => {
  test("allows an approved internal-capital proposal to be assigned", () => {
    render(
      <ProposalLenderAssignmentSection
        lenderOrganizations={lenderOrganizations}
        onAssign={vi.fn()}
        proposal={proposal}
      />,
    );

    expect(screen.getByText("Lender assignment")).toBeTruthy();
    expect(
      screen.queryByText("Not available · proposal uses internal capital"),
    ).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Assign lender" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  test("keeps an unauthorized approved proposal read-only with a reason", () => {
    render(
      <ProposalLenderAssignmentSection
        lenderOrganizations={lenderOrganizations}
        proposal={proposal}
      />,
    );

    const assignButton = screen.getByRole("button", { name: "Assign lender" });
    expect((assignButton as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(
        "Unassigned · only an authorized Back Office Admin can assign a lender",
      ),
    ).toBeTruthy();
  });

  test("keeps the assignment boundary visible before approval", () => {
    render(
      <ProposalLenderAssignmentSection
        lenderOrganizations={lenderOrganizations}
        onAssign={vi.fn()}
        proposal={{ ...proposal, status: "submitted" }}
      />,
    );

    const assignButton = screen.getByRole("button", { name: "Assign lender" });
    expect((assignButton as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(
        "Available after Back Office approval · internal closing remains available",
      ),
    ).toBeTruthy();
  });

  test("promotes the compact assignment row into the governed assignment dialog", async () => {
    const onAssign = vi.fn().mockResolvedValue({ assignmentId: "assignment_1" });

    render(
      <ProposalLenderAssignmentSection
        lenderOrganizations={lenderOrganizations}
        onAssign={onAssign}
        proposal={proposal}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assign lender" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Review policy boundary")).toBeTruthy();
    expect(within(dialog).getByText("Assignment effect")).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("combobox", { name: "Lender Organization" }),
    );
    fireEvent.click(
      await screen.findByRole("option", {
        name: "Northstar Lending Organization",
      }),
    );
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Assignment reason" }), {
      target: { value: "Assign the eligible lender for external review." },
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /Assign Northstar Lending Organization/i,
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign lender" }));

    await waitFor(() =>
      expect(onAssign).toHaveBeenCalledWith(
        "org_northstar",
        "Assign the eligible lender for external review.",
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("keeps the assigned details, policy link, and withdrawal confirmation separate", async () => {
    const onEditReviewPolicy = vi.fn();
    const onWithdraw = vi.fn().mockResolvedValue(undefined);

    render(
      <ProposalLenderAssignmentSection
        assignment={{
          assignedAt: 1,
          assignmentId: "assignment_1",
          lenderOrganizationId: "org_northstar",
          lenderOrganizationName: "Northstar Lending Organization",
          status: "current",
        }}
        assignmentHistory={[
          {
            assignedAt: 1,
            assignmentId: "assignment_1",
            lenderOrganizationId: "org_northstar",
            lenderOrganizationName: "Northstar Lending Organization",
            status: "current",
          },
          {
            assignedAt: 0,
            assignmentId: "assignment_0",
            lenderOrganizationId: "org_old",
            lenderOrganizationName: "Former Lender",
            status: "withdrawn",
            withdrawalReason: "Previous lender unavailable.",
          },
        ]}
        lenderOrganizations={lenderOrganizations}
        onEditReviewPolicy={onEditReviewPolicy}
        onWithdraw={onWithdraw}
        proposal={proposal}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View assignment" }));
    const detailsDialog = screen.getByRole("dialog");
    expect(within(detailsDialog).getByText("Former Lender")).toBeTruthy();
    fireEvent.click(
      within(detailsDialog).getByRole("button", { name: "Edit review policy" }),
    );
    expect(onEditReviewPolicy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "View assignment" }));
    const reopenedDetailsDialog = screen.getByRole("dialog");
    fireEvent.click(
      within(reopenedDetailsDialog).getByRole("button", {
        name: "Withdraw assignment",
      }),
    );
    const withdrawalDialog = screen.getByRole("dialog");
    fireEvent.change(
      within(withdrawalDialog).getByRole("textbox", {
        name: "Withdrawal reason",
      }),
      { target: { value: "Restore internal closing for this revision." } },
    );
    fireEvent.click(
      within(withdrawalDialog).getByRole("checkbox", {
        name: /Withdraw Northstar Lending Organization/i,
      }),
    );
    fireEvent.click(
      within(withdrawalDialog).getByRole("button", {
        name: "Withdraw assignment",
      }),
    );

    await waitFor(() =>
      expect(onWithdraw).toHaveBeenCalledWith(
        "assignment_1",
        "Restore internal closing for this revision.",
      ),
    );
  });

  test("restores a missing lender confirmation cycle from assigned details", async () => {
    const onRepairLenderConfirmation = vi.fn().mockResolvedValue({
      confirmationCycleId: "cycle_1",
    });

    render(
      <ProposalLenderAssignmentSection
        assignment={{
          assignedAt: 1,
          assignmentId: "assignment_1",
          lenderOrganizationId: "org_northstar",
          lenderOrganizationName: "Northstar Lending Organization",
          status: "current",
        }}
        lenderOrganizations={lenderOrganizations}
        needsConfirmationRepair
        onRepairLenderConfirmation={onRepairLenderConfirmation}
        proposal={proposal}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View assignment" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Restore lender confirmation" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Repair reason" }),
      { target: { value: "Restore the missing lender review state." } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Restore confirmation" }),
    );

    await waitFor(() =>
      expect(onRepairLenderConfirmation).toHaveBeenCalledWith(
        "Restore the missing lender review state.",
      ),
    );
  });

  test("keeps a withdrawn assignment available as read-only history", () => {
    const onAssign = vi.fn();

    render(
      <ProposalLenderAssignmentSection
        assignment={{
          assignedAt: 2,
          assignmentId: "assignment_withdrawn",
          lenderOrganizationId: "org_northstar",
          lenderOrganizationName: "Northstar Lending Organization",
          status: "withdrawn",
          withdrawalReason: "Lender declined the proposal.",
          withdrawnAt: 3,
        }}
        assignmentHistory={[
          {
            assignedAt: 2,
            assignmentId: "assignment_withdrawn",
            lenderOrganizationId: "org_northstar",
            lenderOrganizationName: "Northstar Lending Organization",
            status: "withdrawn",
            withdrawalReason: "Lender declined the proposal.",
            withdrawnAt: 3,
          },
          {
            assignedAt: 1,
            assignmentId: "assignment_previous",
            lenderOrganizationId: "org_previous",
            lenderOrganizationName: "Previous Lender",
            status: "withdrawn",
            withdrawalReason: "Previous assignment replaced.",
          },
        ]}
        lenderOrganizations={lenderOrganizations}
        onAssign={onAssign}
        proposal={proposal}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View assignment" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Assignment withdrawn")).toBeTruthy();
    expect(within(dialog).getByText("Previous Lender")).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "Withdraw assignment" }),
    ).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Assign another lender" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Assign lender",
      }),
    ).toBeTruthy();
  });
});
