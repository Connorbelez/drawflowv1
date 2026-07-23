// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
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

import type {
  MilestoneKanbanCard,
  ProposalKanbanCard,
} from "#/features/backoffice-dashboard/mock-data.ts";
import {
  ActiveBuildsCard,
  ApprovedProposalSidebar,
  ClosingConfirmationDialog,
  MilestoneKanban,
  normalizeProductionBackofficeDashboard,
  ProposalKanban,
  Route,
  ScheduleRail,
  SubmittedProposalsCard,
  type ClosingConfirmationInput,
  type ProductionBuilderOption,
} from "./index";

const WORKOS_ORGANIZATION_ID = "org_backoffice_loader_test";

test("the backoffice route loader seeds and reuses the dashboard query cache", async () => {
  vi.useFakeTimers();
  vi.setSystemTime("2026-07-15T23:59:59.000Z");
  const dashboard = { metrics: [{ id: "draw-requests", value: 2 }] };
  const builders = [{ _id: "builder-1", displayName: "Northwind Homes" }];
  const loadDashboard = vi.fn().mockResolvedValue(dashboard);
  const loadBuilders = vi.fn().mockResolvedValue(builders);
  const queryClient = new QueryClient();
  const convexQueryClient = {
    queryOptions: (functionReference: unknown, args: unknown) => {
      const functionName = getFunctionName(functionReference as never);
      return {
        queryFn:
          functionName === "production_proposals:getBackofficeDashboard"
            ? loadDashboard
            : loadBuilders,
        queryKey: ["convexQuery", functionName, args],
        staleTime: Number.POSITIVE_INFINITY,
      };
    },
  };
  const loader = Route.options.loader as (input: {
    context: {
      convexQueryClient: typeof convexQueryClient;
      organizationId: string;
      queryClient: QueryClient;
    };
  }) => Promise<unknown>;

  try {
    await expect(
      loader({
        context: {
          convexQueryClient,
          organizationId: WORKOS_ORGANIZATION_ID,
          queryClient,
        },
      })
    ).resolves.toEqual({ asOfDate: "2026-07-15" });
    await loader({
      context: {
        convexQueryClient,
        organizationId: WORKOS_ORGANIZATION_ID,
        queryClient,
      },
    });
  } finally {
    vi.useRealTimers();
  }

  expect(
    queryClient.getQueryData([
      "convexQuery",
      "production_proposals:getBackofficeDashboard",
      {
        asOfDate: "2026-07-15",
        workosOrganizationId: WORKOS_ORGANIZATION_ID,
      },
    ])
  ).toEqual(dashboard);
  expect(
    queryClient.getQueryData([
      "convexQuery",
      "production_proposals:listActiveBrokerageBuilderOptions",
      { workosOrganizationId: WORKOS_ORGANIZATION_ID },
    ])
  ).toEqual(builders);
  expect(loadDashboard).toHaveBeenCalledTimes(1);
  expect(loadBuilders).toHaveBeenCalledTimes(1);
});

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
  borrowerStartingCashCents: 30_000_000,
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

  test("restores the behind-schedule column when the backend projection is stale", () => {
    const dashboard = normalizeProductionBackofficeDashboard({
      activeBuilds: [],
      drawRequests: [],
      metrics: [],
      milestoneColumns: [
        { id: "backlog", name: "Backlog" },
        { id: "needsSiteVisit", name: "Needs site visit" },
        { id: "inProgress", name: "In progress" },
        { id: "inReview", name: "In review" },
      ],
      milestones: [],
      proposalColumns: [],
      proposals: [],
      quickActions: [],
      scheduleDate: "2026-05-08T12:00:00.000Z",
      scheduleEvents: [],
    });

    expect(dashboard.milestoneColumns.map((column) => column.id)).toEqual([
      "backlog",
      "needsSiteVisit",
      "inProgress",
      "behindSchedule",
      "inReview",
    ]);
  });

  test("renders the restored behind-schedule column", () => {
    const columns = normalizeProductionBackofficeDashboard({
      activeBuilds: [],
      drawRequests: [],
      metrics: [],
      milestoneColumns: [
        { id: "backlog", name: "Backlog" },
        { id: "needsSiteVisit", name: "Needs site visit" },
        { id: "inProgress", name: "In progress" },
        { id: "inReview", name: "In review" },
      ],
      milestones: [],
      proposalColumns: [],
      proposals: [],
      quickActions: [],
      scheduleDate: "2026-05-08T12:00:00.000Z",
      scheduleEvents: [],
    }).milestoneColumns;

    render(
      <MilestoneKanban
        columns={columns}
        milestones={[] satisfies MilestoneKanbanCard[]}
      />,
    );

    expect(screen.getByText("Behind schedule")).toBeTruthy();
    expect(screen.getByText("Planned finish date has passed")).toBeTruthy();
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
            actionLabel: "Review draw",
            address: "12 King St",
            ageLabel: "2 days old",
            authorityLabel: "Lender Admin release authority",
            blocker: "Funds remain held until review",
            buildId: "build-1",
            dueLabel: "Today",
            entityLabel: "King Street Build · Draw 2",
            href: "/backoffice/draws?buildId=build-1&drawId=draw-2",
            id: "action-1",
            ownerLabel: "Unassigned",
            recommendationLabel: "Review eligibility, evidence, and amount",
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

  test("shows accountable queue context and links to the canonical workflow", () => {
    renderScheduleRail(false);

    expect(screen.getByText("King Street Build · Draw 2")).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.getByText("2 days old")).toBeTruthy();
    expect(screen.getByText("Funds remain held until review")).toBeTruthy();
    expect(
      screen.getByText("Review eligibility, evidence, and amount")
    ).toBeTruthy();
    expect(
      screen.getByText("Lender Admin release authority")
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Review draw" }).getAttribute("href")
    ).toBe("/backoffice/draws?buildId=build-1&drawId=draw-2");
    expect(screen.queryByRole("button", { name: /approve|release/i })).toBeNull();
  });

  test("packages an operations escalation before authority handoff", async () => {
    const onEscalate = vi.fn().mockResolvedValue(null);
    render(
      <ScheduleRail
        canMakeFinalDecision={false}
        collapsed={false}
        date={new Date("2026-06-15T12:00:00.000Z")}
        events={[]}
        onAcknowledgeHandoff={vi.fn()}
        onCollapsedChange={vi.fn()}
        onEscalate={onEscalate}
        onReturnDecision={vi.fn()}
        quickActions={[
          {
            actionLabel: "Review draw",
            address: "12 King St",
            ageLabel: "2 days old",
            authorityLabel: "Lender Admin release authority",
            blocker: "Funds remain held until review",
            buildId: "build-1",
            dueLabel: "Today",
            entityLabel: "King Street Build · Draw 2",
            href: "/backoffice/draws?buildId=build-1&drawId=draw-2",
            id: "draw-review:draw-2",
            ownerLabel: "Operations",
            recommendationLabel: "Review eligibility, evidence, and amount",
            title: "Draw review",
            type: "drawRequest",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Prepare escalation" }));
    expect(
      await screen.findByRole("dialog", { name: "Escalate draw review" })
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Evidence summary"), {
      target: { value: "Invoice, inspection, and draw schedule are ready." },
    });
    fireEvent.change(screen.getByLabelText("Recommendation"), {
      target: { value: "Release the eligible amount after final review." },
    });
    fireEvent.change(screen.getByLabelText("Warnings"), {
      target: { value: "Requested amount exceeds the planned draw by $500." },
    });
    fireEvent.change(screen.getByLabelText("Required action"), {
      target: { value: "Record the final draw decision." },
    });
    fireEvent.change(screen.getByLabelText("Decision preview"), {
      target: { value: "Approve, reroute, or return the draw request." },
    });
    fireEvent.change(screen.getByLabelText("Escalation reason"), {
      target: { value: "Lender Admin release authority is required." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to Lender Admin" }));

    await waitFor(() =>
      expect(onEscalate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "draw-review:draw-2" }),
        {
          decisionPreview: "Approve, reroute, or return the draw request.",
          evidenceSummary: "Invoice, inspection, and draw schedule are ready.",
          reason: "Lender Admin release authority is required.",
          recommendation: "Release the eligible amount after final review.",
          requiredAction: "Record the final draw decision.",
          warnings: ["Requested amount exceeds the planned draw by $500."],
        }
      )
    );
  });

  test("omits authority controls for staff and exposes the returned acknowledgement", () => {
    const onAcknowledgeHandoff = vi.fn().mockResolvedValue(null);
    render(
      <ScheduleRail
        canMakeFinalDecision={false}
        collapsed={false}
        date={new Date("2026-06-15T12:00:00.000Z")}
        events={[]}
        onAcknowledgeHandoff={onAcknowledgeHandoff}
        onCollapsedChange={vi.fn()}
        onEscalate={vi.fn()}
        onReturnDecision={vi.fn()}
        quickActions={[
          {
            actionLabel: "Review proposal",
            address: "12 King St",
            ageLabel: "2 days old",
            authorityLabel: "Lender Admin decision",
            blocker: "Awaiting underwriting decision",
            buildId: "build-1",
            canAcknowledgeHandoff: true,
            dueLabel: "Decision pending",
            entityLabel: "King Street Build",
            handoff: {
              _id: "handoff-1",
              acknowledgementState: "returned",
              createdAt: Date.now(),
              decisionPreview: "Approve or return the proposal.",
              escalatedByWorkosUserId: "user_broker",
              escalationReason: "Final authority required.",
              evidenceSummary: "Underwriting package is complete.",
              followUpAssignment: "Broker must confirm closing conditions.",
              queueItemId: "proposal-review:proposal-1",
              recommendation: "Approve with closing conditions.",
              requiredAction: "Record the final proposal decision.",
              returnDecision: "continue",
              returnReason: "Proceed after confirming closing conditions.",
              targetHref: "/backoffice/proposals/proposal-1",
              targetLabel: "King Street Build",
              targetRecordId: "proposal-1",
              targetType: "proposal",
              updatedAt: Date.now(),
              warnings: [],
            },
            href: "/backoffice/proposals/proposal-1",
            id: "proposal-review:proposal-1",
            ownerLabel: "Assigned broker",
            recommendationLabel: "Review submission and record a decision",
            title: "Proposal awaiting decision",
            type: "proposal",
          } as any,
        ]}
      />
    );

    expect(screen.queryByRole("button", { name: "Record return decision" })).toBeNull();
    expect(screen.getByText("Proceed after confirming closing conditions.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge return" }));
    expect(onAcknowledgeHandoff).toHaveBeenCalledWith("handoff-1");
  });
});
