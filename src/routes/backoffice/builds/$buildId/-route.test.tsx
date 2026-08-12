// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  resolveRouteBreadcrumb,
  type RouteBreadcrumb,
} from "#/components/route-breadcrumbs.tsx";

const navigate = vi.fn();
const hostRender = vi.fn();
const hostProps = vi.fn();
const surfaceProps = vi.fn();
const useMutation = vi.fn();
const useQuery = vi.fn();
const useAction = vi.fn();

const activeBuildDetail = {
  appPermissions: { mode: "full", role: "admin" },
  auditEvents: [],
  build: {
    _id: "active-build-01",
    brokerageId: "brokerage-01",
    buildName: "Backoffice Active Build",
  },
  costItems: [],
  documents: [],
  draws: [],
  milestones: [],
  quickActionEvents: [],
  siteVisits: [],
  submilestones: [],
  viewerBuildRoles: ["admin", "principle-broker"],
};

vi.mock("convex/react", () => ({
  useAction: (...args: unknown[]) => useAction(...args),
  useMutation: (...args: unknown[]) => useMutation(...args),
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ buildId: "active-build-01" }),
    useRouteContext: () => ({
      organizationId: "org_backoffice",
      role: "admin",
      roles: ["principle-broker"],
    }),
    useSearch: () => ({
      detailTab: "review",
      focus: "submilestone:submilestone-01",
      tab: "timeline",
    }),
  }),
  useNavigate: () => navigate,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("#/components/ui/frame.tsx", () => ({
  Frame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FramePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("#/features/backoffice-build-detail/lazy-build-detail-tabs.tsx", () => ({
  BuildDetailTabFallback: () => null,
  LazyBuilderStaffPermissionsPanel: () => null,
  LazyCostDocumentBatchWorkspace: () => null,
  LazyCostDocumentRoadmapReconciliation: () => null,
  LazyQuoteRoundComparisonSurface: () => null,
  LazyQuoteRoundsSurface: () => null,
}));

vi.mock("#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx", () => ({
  ProductionBuildDetailSurface: ({
    detailSheetHost,
    onChangeTab,
    ...props
  }: {
    detailSheetHost?: unknown;
    onChangeTab?: (tab: string) => void;
    [key: string]: unknown;
  }) => {
    surfaceProps(props);
    return (
      <div data-testid="production-build-surface">
        <span data-testid="detail-sheet-host-injected">
          {detailSheetHost ? "yes" : "no"}
        </span>
        {onChangeTab ? (
          <button
            data-testid="change-main-tab"
            onClick={() => onChangeTab("gantt")}
            type="button"
          >
            Change main tab
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("#/features/build-detail-targets/BuildDetailSheetHost.tsx", () => ({
  BuildDetailIntegritySheet: () => null,
  BuildDetailSheetHost: ({
    children,
    ...props
  }: {
    children: (state: {
      controller: {
        close: () => void;
        openTarget: (...args: unknown[]) => void;
      };
      readOnly: boolean;
      resolutionState: "visible";
    }) => React.ReactNode;
    [key: string]: unknown;
  }) => {
    hostRender();
    hostProps(props);
    return (
      <>
        {children({
          controller: { close: vi.fn(), openTarget: vi.fn() },
          readOnly: false,
          resolutionState: "visible",
        })}
      </>
    );
  },
}));

vi.mock("#/features/builder-staff/app-permissions.ts", () => ({
  canUseAppPermission: () => true,
  filterMaterialPlanningActionsForPermissions: () => undefined,
}));

vi.mock("#/features/cost-documents/SingleCostDocumentCapture.tsx", () => ({
  buildCostDocumentSubmilestoneOptions: () => [],
}));

vi.mock("#/features/production-proposals/visualParityConstants.ts", () => ({
  isProductionVisualParityFixtureEnabled: () => false,
}));

vi.mock("#/lib/auth/rbac.ts", () => ({
  canMakeActiveBuildFinalDecision: () => true,
}));

import { Route } from "./route";

describe("Backoffice Build route canonical detail host", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAction.mockReturnValue(vi.fn());
    useMutation.mockReturnValue(vi.fn());
    useQuery.mockReturnValue(activeBuildDetail);
  });

  test("owns one canonical detail host and preserves focus/detailTab on pure tab changes", () => {
    const RouteComponent = (Route as unknown as {
      component: React.ComponentType;
    }).component;

    render(<RouteComponent />);

    expect(hostRender).toHaveBeenCalledTimes(1);
    expect(hostProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detailTab: "review",
        focus: "submilestone:submilestone-01",
      }),
    );
    expect(screen.getByTestId("detail-sheet-host-injected").textContent).toBe(
      "yes",
    );
    expect(surfaceProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        drawCapabilities: {
          canApprove: true,
          canOpenReview: true,
          canReject: true,
          canRelease: true,
          canStartReview: true,
          canSubmitForAdmin: false,
        },
        viewerCapacity: "admin",
      }),
    );
    fireEvent.click(screen.getByTestId("change-main-tab"));
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({
          detailTab: "review",
          focus: "submilestone:submilestone-01",
          tab: "gantt",
        }),
      }),
    );
  });

  test("declares a canonical Build breadcrumb destination with route context", () => {
    const route = Route as unknown as {
      staticData: { breadcrumb: RouteBreadcrumb };
    };
    const breadcrumb = resolveRouteBreadcrumb({
      params: { buildId: "active-build-01" },
      search: { focus: "draw:draw-01", tab: "details" },
      staticData: route.staticData,
    });

    expect(breadcrumb).toMatchObject({
      label: "Loading build…",
      params: { buildId: "active-build-01" },
      search: { focus: "draw:draw-01", tab: "details" },
      to: "/backoffice/builds/$buildId",
    });
  });
});
