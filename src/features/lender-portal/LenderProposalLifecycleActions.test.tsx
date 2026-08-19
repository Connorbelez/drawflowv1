// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { activateClosedProposal, recordProposalClosing, toast, useMutation } =
  vi.hoisted(() => ({
    activateClosedProposal: vi.fn(),
    recordProposalClosing: vi.fn(),
    toast: { error: vi.fn(), success: vi.fn() },
    useMutation: vi.fn(),
  }));

vi.mock("convex/react", () => ({ useMutation }));
vi.mock("sonner", () => ({ toast }));

import { LenderProposalLifecycleActions } from "./LenderProposalLifecycleActions.tsx";

const proposal = {
  _id: "proposal_1",
  buildName: "Maple Court",
  interestAnnualBps: 875,
  lenderDrawPolicyLimitCents: 55_000_000,
};

beforeEach(() => {
  useMutation.mockReset().mockImplementation(() =>
    useMutation.mock.calls.length % 2 === 1
      ? recordProposalClosing
      : activateClosedProposal
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LenderProposalLifecycleActions", () => {
  test("records closing through the canonical command without activating", async () => {
    recordProposalClosing.mockResolvedValue({ closingId: "closing_1" });
    const onActivated = vi.fn();
    render(
      <LenderProposalLifecycleActions
        capabilities={{
          canActivateClosedProposal: false,
          canRecordClosing: true,
        }}
        onActivated={onActivated}
        proposal={proposal}
        workosOrganizationId="org_lender"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Record closing/ }));
    expect(
      screen.getByText(/Build activation remains a separate action/)
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Loan principal (USD)") as HTMLInputElement).value
    ).toBe("");
    expect(
      (screen.getByLabelText("Build start date") as HTMLInputElement).value
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Loan principal (USD)"), {
      target: { value: "550000" },
    });
    fireEvent.change(screen.getByLabelText("Build start date"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.change(screen.getByLabelText("Build timezone (IANA)"), {
      target: { value: "America/Toronto" },
    });
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Loan documents were executed offline." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm closing" }));

    await waitFor(() =>
      expect(recordProposalClosing).toHaveBeenCalledWith({
        buildStartDate: "2026-09-08",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 875,
          principalCents: 55_000_000,
        },
        proposalId: "proposal_1",
        reason: "Loan documents were executed offline.",
        workosOrganizationId: "org_lender",
      })
    );
    expect(activateClosedProposal).not.toHaveBeenCalled();
    expect(onActivated).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Closing recorded. Build activation remains separate."
    );
  });

  test("activates only after the server exposes activation capability", async () => {
    activateClosedProposal.mockResolvedValue({ buildId: "build_1" });
    const onActivated = vi.fn();
    render(
      <LenderProposalLifecycleActions
        capabilities={{
          canActivateClosedProposal: true,
          canRecordClosing: false,
        }}
        onActivated={onActivated}
        proposal={proposal}
        workosOrganizationId="org_lender"
      />
    );

    expect(
      screen.queryByRole("button", { name: /Record closing/ })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Activate Build/ }));
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "The closed proposal is ready for execution." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate Build" }));

    await waitFor(() =>
      expect(activateClosedProposal).toHaveBeenCalledWith({
        proposalId: "proposal_1",
        reason: "The closed proposal is ready for execution.",
        workosOrganizationId: "org_lender",
      })
    );
    expect(recordProposalClosing).not.toHaveBeenCalled();
    expect(onActivated).toHaveBeenCalledWith("build_1");
  });

  test("renders no lifecycle controls for a read-only or ineligible viewer", () => {
    const { container } = render(
      <LenderProposalLifecycleActions
        capabilities={{
          canActivateClosedProposal: false,
          canRecordClosing: false,
        }}
        onActivated={vi.fn()}
        proposal={proposal}
        workosOrganizationId="org_lender"
      />
    );

    expect(container.childElementCount).toBe(0);
    expect(screen.queryByText("Closing and activation")).toBeNull();
  });
});
