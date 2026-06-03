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
  ActiveBuildsCard,
  ApprovedProposalSidebar,
  ClosingConfirmationDialog,
  normalizeProductionBackofficeDashboard,
  ProposalKanban,
  ScheduleRail,
  SubmittedProposalsCard,
  type ClosingConfirmationInput,
  type ProductionBuilderOption,
} from "./index";

const proposalColumns = [
  { id: "draft", name: "Draft" },
  { id: "submitted", name: "Submitted" },
  { id: "approved", name: "Approved" },
  { id: "closed", name: "Closed" },
];

const builders: ProductionBuilderOption[] = [
  { _id: "builder-1", displayName: "Northwind Homes" },
  { _id: "builder-2", displayName: "Summit Builders" },
];

function renderKanban(
  proposals: ProposalKanbanCard[],
  overrides: {
    builders?: ProductionBuilderOption[];
    onArchiveProposal?: (
      proposal: ProposalKanbanCard,
      reason: string
    ) => Promise<unknown>;
    onAssignBuilder?: (
      proposal: ProposalKanbanCard,
      builderProfileId: string
    ) => Promise<unknown>;
    onDeleteDraft?: (proposal: ProposalKanbanCard) => Promise<unknown>;
  } = {}
) {
  return render(
    <ProposalKanban
      builders={overrides.builders ?? builders}
      columns={proposalColumns}
      onArchiveProposal={
        overrides.onArchiveProposal ?? vi.fn().mockResolvedValue(null)
      }
      onAssignBuilder={overrides.onAssignBuilder ?? vi.fn().mockResolvedValue(null)}
      onDeleteDraft={overrides.onDeleteDraft ?? vi.fn().mockResolvedValue(null)}
      onOpenApprovedProposal={vi.fn()}
      onRecordClosing={vi.fn()}
      proposals={proposals}
    />
  );
}

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
        onArchiveProposal={vi.fn()}
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

  test("opens the archive dialog from a submitted row right-click menu", async () => {
    const onArchiveProposal = vi.fn().mockResolvedValue(null);

    render(
      <SubmittedProposalsCard
        approvedPendingClosing={[]}
        onArchiveProposal={onArchiveProposal}
        onOpenProposal={vi.fn()}
        onRecordClosing={vi.fn()}
        submittedProposals={[submittedProposal]}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Submitted Build"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Archive proposal" }),
    );

    await screen.findByRole("alertdialog", {
      name: "Archive submitted proposal",
    });
    fireEvent.change(screen.getByTestId("archive-proposal-reason"), {
      target: { value: "Duplicate submission." },
    });
    fireEvent.click(screen.getByTestId("archive-proposal-confirm"));

    await waitFor(() =>
      expect(onArchiveProposal).toHaveBeenCalledWith(
        submittedProposal,
        "Duplicate submission.",
      ),
    );
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
            onArchiveProposal={vi.fn()}
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

const activeBuild = {
  activeMilestone: "Foundation",
  address: "Closed Site, Toronto, ON",
  buildKey: "build-active",
  builder: "Production Builder",
  daysActive: 12,
  href: "/backoffice/builds/build-active",
  id: "B-ACTIVE",
  milestoneState: "inProgress" as const,
  status: "onTrack" as const,
  statusLabel: "On track",
};

describe("ActiveBuildsCard", () => {
  test("confirms active build deletion from the row context menu", async () => {
    const onDeleteActiveBuild = vi.fn().mockResolvedValue(null);

    render(
      <ActiveBuildsCard
        builds={[activeBuild]}
        onDeleteActiveBuild={onDeleteActiveBuild}
        onOpenUnassignedDrafts={vi.fn()}
        onStartNewBuildWorkflow={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByText("B-ACTIVE"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Delete active build" }),
    );

    await screen.findByRole("alertdialog", { name: "Delete active build" });
    fireEvent.change(screen.getByTestId("delete-active-build-reason"), {
      target: { value: "Created in error during QA." },
    });
    fireEvent.click(screen.getByTestId("delete-active-build-confirm"));

    await waitFor(() =>
      expect(onDeleteActiveBuild).toHaveBeenCalledWith(
        activeBuild,
        "Created in error during QA.",
      ),
    );
  });

  test("starts the full New Build workflow", async () => {
    const startWorkflow = vi.fn<() => Promise<void>>().mockResolvedValue();

    render(
      <ActiveBuildsCard
        builds={[]}
        onDeleteActiveBuild={vi.fn()}
        onOpenUnassignedDrafts={vi.fn()}
        onStartNewBuildWorkflow={startWorkflow}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Build" }));

    await waitFor(() =>
      expect(startWorkflow).toHaveBeenCalledTimes(1),
    );
  });

  test("opens the unassigned broker draft queue", async () => {
    const openUnassignedDrafts = vi.fn<() => Promise<void>>().mockResolvedValue();

    render(
      <ActiveBuildsCard
        builds={[]}
        onDeleteActiveBuild={vi.fn()}
        onOpenUnassignedDrafts={openUnassignedDrafts}
        onStartNewBuildWorkflow={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Unassigned drafts" }),
    );

    await waitFor(() =>
      expect(openUnassignedDrafts).toHaveBeenCalledTimes(1),
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

const unassignedDraft: ProposalKanbanCard = {
  address: "12 Draft Lane, Toronto, ON",
  builder: "Unassigned builder",
  builderAssigned: false,
  column: "draft",
  href: "/backoffice/proposals/proposal-draft",
  id: "proposal-draft",
  loanAmount: "$0",
  ltv: 0,
  name: "Unassigned Draft",
  proposalId: "proposal-draft",
  tag: "production",
};

const assignedDraft: ProposalKanbanCard = {
  address: "44 Assigned Way, Toronto, ON",
  builder: "Northwind Homes",
  builderAssigned: true,
  column: "draft",
  href: "/backoffice/proposals/proposal-assigned-draft",
  id: "proposal-assigned-draft",
  loanAmount: "$900,000",
  ltv: 0,
  name: "Assigned Draft",
  proposalId: "proposal-assigned-draft",
  tag: "production",
};

describe("ProposalKanban context menu", () => {
  test("marks an unassigned draft and offers assign + delete actions", async () => {
    renderKanban([unassignedDraft]);

    expect(screen.getByTestId("proposal-card-unassigned")).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();

    fireEvent.contextMenu(screen.getByText("Unassigned Draft"));

    expect(
      await screen.findByRole("menuitem", { name: "Assign builder" })
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Delete draft" })
    ).toBeTruthy();
  });

  test("shows the builder name and hides assign for an already-assigned draft", async () => {
    renderKanban([assignedDraft]);

    expect(screen.queryByTestId("proposal-card-unassigned")).toBeNull();
    expect(screen.getByText("Northwind Homes")).toBeTruthy();

    fireEvent.contextMenu(screen.getByText("Assigned Draft"));

    expect(
      await screen.findByRole("menuitem", { name: "Delete draft" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", { name: "Assign builder" })
    ).toBeNull();
  });

  test("hides assign and delete for non-draft proposals", async () => {
    renderKanban([approvedProposal]);

    fireEvent.contextMenu(screen.getByText("Approved With Permit"));

    expect(
      await screen.findByRole("menuitem", { name: "Open" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", { name: "Assign builder" })
    ).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Delete draft" })
    ).toBeNull();
  });

  test("opens the assign dialog and guards the confirm button until a builder is chosen", async () => {
    renderKanban([unassignedDraft]);

    fireEvent.contextMenu(screen.getByText("Unassigned Draft"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Assign builder" })
    );

    await screen.findByRole("dialog", { name: "Assign builder" });
    expect(
      (screen.getByTestId("assign-builder-confirm") as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  test("surfaces an empty-builders state in the assign dialog", async () => {
    renderKanban([unassignedDraft], { builders: [] });

    fireEvent.contextMenu(screen.getByText("Unassigned Draft"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Assign builder" })
    );

    expect(
      await screen.findByText(
        "No active builders are available in this brokerage yet."
      )
    ).toBeTruthy();
  });

  test("confirms deletion through the alert dialog", async () => {
    const onDeleteDraft = vi.fn().mockResolvedValue(null);
    renderKanban([unassignedDraft], { onDeleteDraft });

    fireEvent.contextMenu(screen.getByText("Unassigned Draft"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Delete draft" })
    );

    await screen.findByRole("alertdialog", { name: "Delete draft proposal" });
    fireEvent.click(screen.getByTestId("delete-draft-confirm"));

    await waitFor(() =>
      expect(onDeleteDraft).toHaveBeenCalledWith(unassignedDraft)
    );
  });

  test("offers archive for submitted kanban cards", async () => {
    const onArchiveProposal = vi.fn().mockResolvedValue(null);
    renderKanban([submittedProposal], { onArchiveProposal });

    fireEvent.contextMenu(screen.getByText("Submitted Build"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Archive proposal" })
    );

    await screen.findByRole("alertdialog", {
      name: "Archive submitted proposal",
    });
    fireEvent.change(screen.getByTestId("archive-proposal-reason"), {
      target: { value: "Withdrawn by borrower." },
    });
    fireEvent.click(screen.getByTestId("archive-proposal-confirm"));

    await waitFor(() =>
      expect(onArchiveProposal).toHaveBeenCalledWith(
        submittedProposal,
        "Withdrawn by borrower.",
      ),
    );
  });
});

describe("ScheduleRail", () => {
  function renderScheduleRail(collapsed = false) {
    const onCollapsedChange = vi.fn();
    const view = render(
      <ScheduleRail
        collapsed={collapsed}
        date={new Date("2026-06-15T12:00:00.000Z")}
        events={[
          {
            date: "2026-06-18T14:00:00.000Z",
            id: "event-1",
            kind: "siteVisit",
            label: "Site visit",
          },
        ]}
        onCollapsedChange={onCollapsedChange}
        quickActions={[
          {
            actionLabel: "Review",
            address: "12 King St",
            buildId: "build-1",
            dueLabel: "Today",
            id: "action-1",
            title: "Draw review",
            type: "drawRequest",
          },
        ]}
      />
    );

    return { onCollapsedChange, ...view };
  }

  test("collapses to a calendar icon and requests collapse", () => {
    const { onCollapsedChange } = renderScheduleRail(false);

    expect(
      screen.getByTestId("backoffice-schedule-rail-expanded")
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("backoffice-schedule-calendar-collapse"));

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  test("expands from the calendar icon and shows quick-action count", () => {
    renderScheduleRail(true);

    expect(
      screen.getByTestId("backoffice-schedule-rail-collapsed")
    ).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("backoffice-schedule-calendar-expand"));
  });
});
