// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const attachContractor = vi.fn();
const assignContractorToMilestone = vi.fn();
const createAndAttachContractor = vi.fn();
const requestDraw = vi.fn();
const withdrawDraw = vi.fn();
const requestFacilityChange = vi.fn();
const sendContractorInvite = vi.fn();
const submitMilestoneCompletion = vi.fn();

const activeBuildDetail = {
  appPermissions: { mode: "full", role: "owner" },
  build: {
    _id: "active-build-01",
    brokerageId: "brokerage-01",
    buildName: "Builder Active Build",
  },
};

const useMutation = vi.fn();
const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (ref: unknown) => useMutation(ref),
  useQuery: (ref: unknown, args: unknown) => useQuery(ref, args),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => vi.fn(),
}));

vi.mock("#/components/ui/frame.tsx", () => ({
  Frame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FramePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("#/features/builder-staff/BuilderStaffPermissionsPanel.tsx", () => ({
  BuilderStaffPermissionsPanel: () => (
    <div data-testid="builder-staff-permissions" />
  ),
}));

vi.mock("#/features/production-proposals/visualParityFixtures.ts", () => ({
  getVisualParityActiveBuildDetail: vi.fn(),
  getVisualParityActiveBuildTimelineWorkspace: vi.fn(),
  isProductionVisualParityFixtureEnabled: () => false,
}));

vi.mock(
  "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx",
  () => ({
    ProductionBuildDetailSurface: ({
      actions,
    }: {
      actions?: {
        assignContractorToMilestone?: (input: {
          contractorId: string;
          milestoneKey: string;
          role: string;
        }) => unknown;
        attachContractor?: (input: {
          contractorId: string;
          role: string;
        }) => unknown;
        createAndAttachContractor?: (input: {
          contractor: {
            kind: "company";
            name: string;
            trades: string[];
          };
          role: string;
        }) => unknown;
      };
    }) => (
      <div data-testid="production-build-surface">
        <button
          data-testid="assign-contractor"
          onClick={() =>
            actions?.assignContractorToMilestone?.({
              contractorId: "contractor-01",
              milestoneKey: "foundation",
              role: "Masonry lead",
            })
          }
          type="button"
        >
          Assign
        </button>
        <button
          data-testid="attach-existing"
          onClick={() =>
            actions?.attachContractor?.({
              contractorId: "contractor-01",
              role: "Masonry crew",
            })
          }
          type="button"
        >
          Attach
        </button>
        <button
          data-testid="create-and-attach"
          onClick={() =>
            actions?.createAndAttachContractor?.({
              contractor: {
                kind: "company",
                name: "TestContractor",
                trades: ["Masonry"],
              },
              role: "masonry lead.",
            })
          }
          type="button"
        >
          Create
        </button>
      </div>
    ),
  })
);

import { BuilderBuildWorkspaceRoute } from "./index";

describe("BuilderBuildWorkspaceRoute contractor actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery
      .mockReturnValueOnce(activeBuildDetail)
      .mockReturnValueOnce({})
      .mockReturnValueOnce({});
    useMutation
      .mockReturnValueOnce(requestDraw)
      .mockReturnValueOnce(withdrawDraw)
      .mockReturnValueOnce(requestFacilityChange)
      .mockReturnValueOnce(assignContractorToMilestone)
      .mockReturnValueOnce(attachContractor)
      .mockReturnValueOnce(createAndAttachContractor)
      .mockReturnValueOnce(sendContractorInvite)
      .mockReturnValueOnce(submitMilestoneCompletion);
  });

  test("passes production active-build contractor mutations instead of falling back to demo actions", async () => {
    render(
      <BuilderBuildWorkspaceRoute
        buildId="active-build-01"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder"
        search={{ tab: "contractors" }}
        workosOrganizationId="org_production_foundation"
      />
    );

    fireEvent.click(screen.getByTestId("assign-contractor"));
    fireEvent.click(screen.getByTestId("attach-existing"));
    fireEvent.click(screen.getByTestId("create-and-attach"));

    await waitFor(() => {
      expect(assignContractorToMilestone).toHaveBeenCalledWith({
        buildId: "active-build-01",
        contractorId: "contractor-01",
        milestoneKey: "foundation",
        role: "Masonry lead",
        workosOrganizationId: "org_production_foundation",
      });
      expect(attachContractor).toHaveBeenCalledWith({
        buildId: "active-build-01",
        contractorId: "contractor-01",
        role: "Masonry crew",
        workosOrganizationId: "org_production_foundation",
      });
      expect(createAndAttachContractor).toHaveBeenCalledWith({
        buildId: "active-build-01",
        contractor: {
          kind: "company",
          name: "TestContractor",
          trades: ["Masonry"],
        },
        role: "masonry lead.",
        workosOrganizationId: "org_production_foundation",
      });
    });
  });
});
