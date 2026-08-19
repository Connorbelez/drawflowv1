// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn().mockResolvedValue(undefined);
const builderNotificationReviewProps = vi.hoisted(() => vi.fn());
const builderVisualProposalDetail = {
  activeBuild: null,
  appPermissions: {
    "contractor:create": true,
    "contractor:update": true,
    "contractor:view": true,
    "evidence:create": true,
    "milestone:create": true,
    "milestone:delete": true,
    "milestone:update": true,
    "submilestone:create": true,
    "submilestone:delete": true,
    "submilestone:update": true,
  },
  costItems: [],
  draws: [
    {
      amountCents: 400_000_00,
      drawKey: "draw-01",
      label: "Foundation reimbursement",
      timingDay: 30,
    },
  ],
  proposal: {
    buildName: "Elm Street proposal",
    proposedStartDate: "2026-07-01",
    status: "submitted",
  },
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () =>
    () => ({
      useParams: () => ({ proposalId: "proposal-01" }),
      useRouteContext: () => ({ organizationId: "org-01" }),
      useSearch: () => ({}),
    }),
  useNavigate: () => mockNavigate,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn().mockResolvedValue(undefined),
  useQuery: () => undefined,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("#/features/builder-staff/app-permissions.ts", () => ({
  canUseAppPermission: (
    permissions: Record<string, boolean> | undefined,
    resource: string,
    action: string,
  ) => Boolean(permissions?.[`${resource}:${action}`]),
  filterMaterialPlanningActionsForPermissions: (
    _permissions: unknown,
    actions: unknown,
  ) => actions,
  hasAnyAppPermission: (
    permissions: Record<string, boolean> | undefined,
    requirements: Array<[string, string]>,
  ) => requirements.some(([resource, action]) => permissions?.[`${resource}:${action}`]),
}));

vi.mock("#/features/calendar-workspace/adapters/proposalCalendarAdapter.ts", () => ({
  createProposalCalendarEditHandler: () => vi.fn(),
}));

vi.mock(
  "#/features/lender-portal/LenderNotificationReviewSurface.tsx",
  () => ({
    BuilderNotificationReviewSurface: (props: {
      onOpenBuild: (input: { buildId: string; milestoneKey: string }) => void;
      onResubmitted: (input: {
        cycleId: string;
        cycleNumber: number;
      }) => void;
    }) => {
      builderNotificationReviewProps(props);
      return createElement(
        "section",
        { "aria-label": "Builder Milestone correction review" },
        createElement(
          "button",
          {
            onClick: () =>
              props.onOpenBuild({
                buildId: "build-01",
                milestoneKey: "foundation",
              }),
          },
          "Open canonical Build"
        ),
        createElement(
          "button",
          {
            onClick: () =>
              props.onResubmitted({ cycleId: "cycle-4", cycleNumber: 4 }),
          },
          "Complete canonical resubmission"
        )
      );
    },
  })
);

vi.mock("#/features/production-proposals/ProductionContractorPlanningTab.tsx", () => ({
  ProductionContractorPlanningTab: ({ canMutate }: { canMutate: boolean }) =>
    createElement("output", { "data-testid": "contractor-mutation-mode" }, String(canMutate)),
}));

vi.mock("#/features/production-proposals/ProductionProposalGanttWorkspace.tsx", () => ({
  ProductionProposalTimelineGanttWorkspace: ({
    persistenceMode,
  }: {
    persistenceMode: string;
  }) => createElement("output", { "data-testid": "gantt-persistence-mode" }, persistenceMode),
}));

vi.mock(
  "#/features/production-proposals/ProductionProposalMilestoneWorksheetContainer.tsx",
  () => ({
    ProductionProposalMilestoneWorksheetContainer: ({
      persistenceMode,
    }: {
      persistenceMode: string;
    }) =>
      createElement(
        "output",
        { "data-testid": "milestone-persistence-mode" },
        persistenceMode
      ),
  })
);

vi.mock("#/features/production-proposals/ProductionTimelineWorkspace.tsx", () => ({
  ProductionTimelineWorkspace: ({ persistenceMode }: { persistenceMode: string }) =>
    createElement("output", { "data-testid": "timeline-persistence-mode" }, persistenceMode),
}));

vi.mock("#/features/production-proposals/visualParityFixtures.ts", () => ({
  createVisualParityCostItem: vi.fn(),
  getVisualParityProposalDetail: () => builderVisualProposalDetail,
  getVisualParityTimelineWorkspace: () => ({ contractorPlanning: undefined }),
  isProductionVisualParityFixtureEnabled: () => true,
}));

vi.mock("#/features/production-proposals/ProductionProposalSurfaces.tsx", () => ({
  ProductionProposalReviewSurface: (props: {
    materialPlanningActions?: unknown;
    onApprove?: unknown;
    onChangeCalendarTimeframe?: (timeframe: string) => void;
    onChangeReviewTab?: (tab: string) => void;
    onCreatePacketMilestone?: unknown;
    onReject?: unknown;
    onRequestChanges?: unknown;
    onSubmit?: unknown;
    onUpdateDraw?: unknown;
    onUpdatePacketMilestone?: unknown;
    onUpdateProposedStartDate?: unknown;
    onUploadPermitDocument?: unknown;
    contractors?: ReactNode;
    gantt?: ReactNode;
    milestones?: ReactNode;
    timeline?: ReactNode;
  }) =>
    createElement(
      "div",
      {},
      props.onApprove || props.onReject || props.onRequestChanges
        ? createElement(
            "section",
            { "aria-label": "Lender review controls" },
            createElement("button", {}, "Request Changes"),
            createElement("button", {}, "Reject"),
            createElement("button", {}, "Approve Proposal"),
            createElement(
              "label",
              {},
              "Decision reason",
              createElement("input", { "aria-label": "Decision reason" }),
            ),
            createElement(
              "label",
              {},
              "Audited permit waiver",
              createElement("textarea", {
                "aria-label": "Audited permit waiver",
              }),
            ),
          )
        : null,
      props.onUpdateDraw
        ? createElement(
            "section",
            { "aria-label": "Backoffice draw editor" },
            createElement(
              "label",
              {},
              "draw-01 label",
              createElement("input", { "aria-label": "draw-01 label" }),
            ),
            createElement(
              "label",
              {},
              "Amount dollars",
              createElement("input", { "aria-label": "Amount dollars" }),
            ),
            createElement(
              "label",
              {},
              "Change reason",
              createElement("input", { "aria-label": "Change reason" }),
            ),
            createElement("button", {}, "Save draw row"),
          )
        : null,
      props.onChangeReviewTab
        ? createElement(
            "button",
            { onClick: () => props.onChangeReviewTab?.("materials") },
            "Open materials stage",
          )
        : null,
      props.onChangeCalendarTimeframe
        ? createElement(
            "button",
            { onClick: () => props.onChangeCalendarTimeframe?.("month") },
            "Show calendar month",
          )
        : null,
      props.materialPlanningActions ||
      props.onCreatePacketMilestone ||
      props.onSubmit ||
      props.onUpdatePacketMilestone ||
      props.onUpdateProposedStartDate ||
      props.onUploadPermitDocument
        ? createElement("button", {}, "Proposal mutations wired")
        : null,
      props.contractors,
      props.gantt,
      props.milestones,
      props.timeline,
    ),
}));

import {
  BuilderProductionProposalWorkspace,
  resolveBuilderProposalRouteTab,
  validateBuilderProposalSearch,
  shouldLoadBuilderProposalCalendarWorkspace,
  shouldLoadBuilderProposalContractorPlanning,
  shouldMountBuilderProposalStaffPanel,
} from "./$proposalId/index.tsx";

afterEach(() => {
  cleanup();
  mockNavigate.mockReset();
  mockNavigate.mockResolvedValue(undefined);
  builderNotificationReviewProps.mockReset();
});

describe("builder proposal detail subscription gates", () => {
  test("uses the shared packet-first proposal tab contract", () => {
    const activeTab = resolveBuilderProposalRouteTab({});

    expect(activeTab).toBe("packet");
    expect(shouldLoadBuilderProposalCalendarWorkspace(activeTab)).toBe(false);
    expect(shouldLoadBuilderProposalContractorPlanning(activeTab)).toBe(false);
    expect(shouldMountBuilderProposalStaffPanel(activeTab)).toBe(false);
  });

  test("round-trips valid builder tab and timeframe search", () => {
    expect(
      validateBuilderProposalSearch({ tab: "calendar", timeframe: "week" }),
    ).toEqual({ tab: "calendar", timeframe: "week" });
    expect(
      validateBuilderProposalSearch({ tab: "milestones", timeframe: "agenda" }),
    ).toEqual({ tab: "milestones", timeframe: "agenda" });
  });

  test("round-trips an exact notification review target and cycle", () => {
    expect(
      validateBuilderProposalSearch({
        milestoneId: "milestone-1",
        reviewCycleId: "cycle-3",
        reviewCycleNumber: "3",
        tab: "milestones",
      }),
    ).toEqual({
      milestoneId: "milestone-1",
      reviewCycleId: "cycle-3",
      reviewCycleNumber: 3,
      tab: "milestones",
    });
    expect(
      validateBuilderProposalSearch({
        milestoneId: "milestone-1",
        reviewCycleId: "cycle-3",
        reviewCycleNumber: 3,
        tab: "milestones",
      }),
    ).toEqual({
      milestoneId: "milestone-1",
      reviewCycleId: "cycle-3",
      reviewCycleNumber: 3,
      tab: "milestones",
    });
    for (const reviewCycleNumber of [0, -1, 3.5, "0", "03", "3.5"]) {
      expect(
        validateBuilderProposalSearch({
          milestoneId: "milestone-1",
          reviewCycleId: "cycle-3",
          reviewCycleNumber,
        }),
      ).toEqual({
        milestoneId: "milestone-1",
        reviewCycleId: "cycle-3",
      });
    }
  });

  test("loads heavyweight subscriptions only for matching shared tabs", () => {
    expect(shouldLoadBuilderProposalCalendarWorkspace("calendar")).toBe(true);
    expect(shouldLoadBuilderProposalCalendarWorkspace("packet")).toBe(false);

    expect(shouldLoadBuilderProposalContractorPlanning("contractors")).toBe(
      true
    );
    expect(shouldLoadBuilderProposalContractorPlanning("gantt")).toBe(true);
    expect(shouldLoadBuilderProposalContractorPlanning("milestones")).toBe(
      true
    );
    expect(shouldLoadBuilderProposalContractorPlanning("packet")).toBe(false);

    expect(shouldMountBuilderProposalStaffPanel("staff")).toBe(true);
    expect(shouldMountBuilderProposalStaffPanel("packet")).toBe(false);
  });
});

describe("BuilderProductionProposalWorkspace route search", () => {
  test("wires a numeric notification URL cycle to Builder correction and the returned N+1 tuple", () => {
    const search = validateBuilderProposalSearch({
      milestoneId: "milestone-1",
      reviewCycleId: "cycle-3",
      reviewCycleNumber: 3,
      tab: "milestones",
    });

    render(
      createElement(BuilderProductionProposalWorkspace, {
        includeStaffTab: false,
        proposalId: "proposal-01",
        routeBase: "/builder",
        search,
        workosOrganizationId: "org-01",
      })
    );

    expect(
      screen.getByRole("region", {
        name: "Builder Milestone correction review",
      })
    ).toBeTruthy();
    expect(builderNotificationReviewProps).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewCycleId: "cycle-3",
        reviewCycleNumber: 3,
        target: { kind: "milestone", milestoneId: "milestone-1" },
        workosOrganizationId: "org-01",
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open canonical Build" })
    );
    expect(mockNavigate).toHaveBeenLastCalledWith({
      params: { buildId: "build-01" },
      search: { milestone: "foundation", tab: "milestones" },
      to: "/builder/builds/$buildId/",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Complete canonical resubmission" })
    );
    expect(mockNavigate).toHaveBeenLastCalledWith({
      params: { proposalId: "proposal-01" },
      replace: true,
      search: {
        milestoneId: "milestone-1",
        reviewCycleId: "cycle-4",
        reviewCycleNumber: 4,
        tab: "milestones",
      },
      to: "/builder/proposals/$proposalId/",
    });
  });

  test("preserves timeframe while changing stage and preserves stage while changing timeframe", () => {
    render(
      createElement(BuilderProductionProposalWorkspace, {
        includeStaffTab: false,
        proposalId: "proposal-01",
        routeBase: "/builder-staff",
        search: { tab: "calendar", timeframe: "week" },
        workosOrganizationId: "org-01",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open materials stage" }));
    expect(mockNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: { tab: "materials", timeframe: "week" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show calendar month" }));
    expect(mockNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: { tab: "calendar", timeframe: "month" },
      }),
    );
  });
});

describe("BuilderProductionProposalWorkspace authorization gates", () => {
  test("does not wire lender-only review or backoffice draw controls into the builder workspace", () => {
    render(
      createElement(BuilderProductionProposalWorkspace, {
        includeStaffTab: false,
        proposalId: "proposal-01",
        routeBase: "/builder",
        search: { tab: "review" },
        workosOrganizationId: "org-01",
      }),
    );

    expect(
      screen.queryByRole("button", { name: "Request Changes" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve Proposal" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Decision reason")).toBeNull();
    expect(screen.queryByLabelText("Audited permit waiver")).toBeNull();
    expect(screen.queryByLabelText("draw-01 label")).toBeNull();
    expect(screen.queryByLabelText("Amount dollars")).toBeNull();
    expect(screen.queryByLabelText("Change reason")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save draw row" })).toBeNull();
  });

  test("keeps submitted Builder proposals read-only despite broad app permissions", () => {
    render(
      createElement(BuilderProductionProposalWorkspace, {
        includeStaffTab: false,
        proposalId: "proposal-01",
        routeBase: "/builder",
        search: { tab: "contractors" },
        workosOrganizationId: "org-01",
      })
    );

    expect(
      screen.queryByRole("button", { name: "Proposal mutations wired" })
    ).toBeNull();
    expect(screen.getByTestId("gantt-persistence-mode").textContent).toBe(
      "noop"
    );
    expect(screen.getByTestId("milestone-persistence-mode").textContent).toBe(
      "noop"
    );
    expect(screen.getByTestId("timeline-persistence-mode").textContent).toBe(
      "noop"
    );
  });
});
