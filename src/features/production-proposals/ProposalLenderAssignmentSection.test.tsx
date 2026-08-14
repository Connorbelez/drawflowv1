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
  capitalSource: "external" as const,
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
    expect(within(dialog).getByText("Review policy")).toBeTruthy();
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

    fireEvent.click(
      within(detailsDialog).getByRole("button", { name: "Withdraw assignment" }),
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
});
