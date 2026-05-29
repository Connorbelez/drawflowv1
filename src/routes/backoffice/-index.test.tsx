// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );

  return {
    ...actual,
    ClientOnly: ({
      children,
      fallback,
    }: {
      children?: ReactNode;
      fallback?: ReactNode;
    }) => <>{children ?? fallback}</>,
    useNavigate: () => vi.fn(),
  };
});

import type { ProposalKanbanCard } from "#/features/backoffice-dashboard/mock-data.ts";
import {
  ApprovedProposalSidebar,
  ClosingConfirmationDialog,
  normalizeProductionBackofficeDashboard,
  SubmittedProposalsCard,
  type ClosingConfirmationInput,
} from "./index";

afterEach(() => cleanup());

const submittedProposal: ProposalKanbanCard = {
  address: "47 Submitted Street, Toronto, ON",
  builder: "Production Builder",
  column: "submitted",
  href: "/backoffice/proposals/proposal-submitted",
  id: "proposal-submitted",
  loanAmount: "$1,250,000",
  ltv: 0,
  name: "Submitted Build",
  proposalId: "proposal-submitted",
  statusLabel: "Submitted",
  submittedAt: Date.parse("2026-05-20T12:00:00.000Z"),
  tag: "production",
};

const approvedProposal: ProposalKanbanCard = {
  address: "91 Approved Avenue, Toronto, ON",
  approvedAt: Date.parse("2026-05-21T12:00:00.000Z"),
  borrowerWorkingCapitalLimitCents: 30_000_000,
  builder: "Production Builder",
  column: "approved",
  href: "/backoffice/proposals/proposal-approved",
  id: "proposal-approved",
  lenderDrawPolicyLimitCents: 55_000_000,
  loanAmount: "$1,750,000",
  ltv: 0,
  name: "Approved With Permit",
  proposalId: "proposal-approved",
  statusLabel: "Approved - pending closing",
  submittedAt: Date.parse("2026-05-20T12:00:00.000Z"),
  tag: "production",
  totalBudgetCents: 175_000_000,
};

describe("normalizeProductionBackofficeDashboard", () => {
  test("converts schedule dates and defaults production-only proposal queues", () => {
    const dashboard = normalizeProductionBackofficeDashboard({
      activeBuilds: [],
      drawRequests: [],
      metrics: [],
      milestoneColumns: [],
      milestones: [],
      proposalColumns: [
        { id: "draft", name: "Draft" },
        { id: "submitted", name: "Submitted" },
        { id: "approved", name: "Approved" },
        { id: "closed", name: "Closed" },
      ],
      proposals: [],
      quickActions: [],
      scheduleDate: "2026-05-08T12:00:00.000Z",
      scheduleEvents: [],
    });

    expect(dashboard.scheduleDate).toBeInstanceOf(Date);
    expect(dashboard.scheduleDate.toISOString()).toBe(
      "2026-05-08T12:00:00.000Z",
    );
    expect(dashboard.submittedProposals).toEqual([]);
    expect(dashboard.approvedPendingClosing).toEqual([]);
  });

  test("keeps approved-but-not-closed proposals in explicit review surfaces", () => {
    const dashboard = normalizeProductionBackofficeDashboard({
      activeBuilds: [
        {
          activeMilestone: "Foundation",
          address: "Closed Site, Toronto, ON",
          buildKey: "build-active",
          builder: "Production Builder",
          daysActive: 0,
          href: "/backoffice/builds/build-active",
          id: "B-ACTIVE",
          milestoneState: "backlog",
          status: "onTrack",
          statusLabel: "Future start",
        },
      ],
      approvedPendingClosing: [approvedProposal],
      drawRequests: [],
      metrics: [],
      milestoneColumns: [],
      milestones: [],
      proposalColumns: [
        { id: "draft", name: "Draft" },
        { id: "submitted", name: "Submitted" },
        { id: "approved", name: "Approved" },
        { id: "closed", name: "Closed" },
      ],
      proposals: [submittedProposal, approvedProposal],
      quickActions: [],
      scheduleDate: "2026-05-08T12:00:00.000Z",
      scheduleEvents: [],
      submittedProposals: [submittedProposal],
    });

    expect(dashboard.activeBuilds.map((build) => build.id)).toEqual([
      "B-ACTIVE",
    ]);
    expect(dashboard.proposals.map((proposal) => proposal.name)).toContain(
      "Approved With Permit",
    );
    expect(
      dashboard.approvedPendingClosing.map((proposal) => proposal.name),
    ).toEqual(["Approved With Permit"]);
  });
});

describe("SubmittedProposalsCard", () => {
  test("renders submitted and approved-pending-closing production queues under the submitted surface id", () => {
    const { container } = render(
      <SubmittedProposalsCard
        approvedPendingClosing={[approvedProposal]}
        onOpenProposal={vi.fn()}
        onRecordClosing={vi.fn()}
        submittedProposals={[submittedProposal]}
      />,
    );

    expect(container.querySelector("#submitted-proposals")).toBeTruthy();
    expect(screen.getByText("1 submitted · 1 closing")).toBeTruthy();
    expect(screen.getByText("Submitted for lender review")).toBeTruthy();
    expect(screen.getByText("Approved, pending closing")).toBeTruthy();
    expect(screen.getByText("Submitted Build")).toBeTruthy();
    expect(screen.getByText("Approved With Permit")).toBeTruthy();
  });

  test("opens the closing confirmation dialog from the approved row right-click menu", async () => {
    const confirmClosing =
      vi.fn<(input: ClosingConfirmationInput) => Promise<void>>()
        .mockResolvedValue();

    function ClosingHarness() {
      const [closingProposal, setClosingProposal] =
        useState<ProposalKanbanCard | null>(null);

      return (
        <>
          <SubmittedProposalsCard
            approvedPendingClosing={[approvedProposal]}
            onOpenProposal={vi.fn()}
            onRecordClosing={setClosingProposal}
            submittedProposals={[]}
          />
          <ClosingConfirmationDialog
            onConfirm={(input: ClosingConfirmationInput) =>
              confirmClosing(input)
            }
            onOpenChange={(open) => {
              if (!open) {
                setClosingProposal(null);
              }
            }}
            open={closingProposal !== null}
            pending={false}
            proposal={closingProposal}
          />
        </>
      );
    }

    render(<ClosingHarness />);

    fireEvent.contextMenu(screen.getByText("Approved With Permit"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Record closing" }),
    );

    await screen.findByRole("dialog", { name: "Record loan closing" });
    expect(screen.getByText("Principal: $550,000 · Interest starts on funds released")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Build start date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Offline closing signed by lender admin." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm closing" }));

    await waitFor(() =>
      expect(confirmClosing).toHaveBeenCalledWith({
        buildStartDate: "2026-06-01",
        reason: "Offline closing signed by lender admin.",
      }),
    );
  });
});

describe("ApprovedProposalSidebar", () => {
  test("shows approved proposal closing context and exposes the shared record closing action", () => {
    const recordClosing = vi.fn();

    render(
      <ApprovedProposalSidebar
        onOpenChange={vi.fn()}
        onRecordClosing={recordClosing}
        proposal={approvedProposal}
      />,
    );

    expect(screen.getByText("Approved Build Proposal pending loan closing")).toBeTruthy();
    expect(screen.getByText("Lender Draw Policy Limit")).toBeTruthy();
    expect(screen.getByText("$550,000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Record closing" }));
    expect(recordClosing).toHaveBeenCalledWith(approvedProposal);
  });
});
