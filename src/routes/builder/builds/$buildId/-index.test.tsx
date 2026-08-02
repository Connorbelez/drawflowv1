// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const attachAndInviteContractor = vi.fn();
const attachContractor = vi.fn();
const assignContractorToMilestone = vi.fn();
const removeContractorFromMilestone = vi.fn();
const createAndAttachContractor = vi.fn();
const requestDraw = vi.fn();
const withdrawDraw = vi.fn();
const requestFacilityChange = vi.fn();
const requestBudgetRevision = vi.fn();
const sendContractorInvite = vi.fn();
const submitMilestoneCompletion = vi.fn();
const submitCostDocument = vi.fn();
const uploadCostDocumentAssets = vi.fn();
const getAccessToken = vi.fn();

const activeBuildDetail = {
  appPermissions: { mode: "full", role: "owner" },
  build: {
    _id: "active-build-01",
    brokerageId: "brokerage-01",
    buildName: "Builder Active Build",
  },
  submilestones: [
    {
      _id: "submilestone-01",
      milestoneKey: "foundation",
      name: "Footings",
    },
  ],
};

const navigate = vi.fn();
const useMutation = vi.fn();
const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useAction: (ref: unknown) => useAction(ref),
  useMutation: (ref: unknown) => useMutation(ref),
  useQuery: (ref: unknown, args: unknown) => useQuery(ref, args),
}));

const useAction = vi.fn();

vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAccessToken: () => ({ getAccessToken }),
}));

vi.mock(
  "#/features/build-collaboration/build-collaboration-asset-upload.ts",
  () => ({
    abandonGovernedCollaborationAssets: vi.fn(),
    uploadGovernedCollaborationAssets: (...args: unknown[]) =>
      uploadCostDocumentAssets(...args),
  })
);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => navigate,
}));

vi.mock("#/components/ui/frame.tsx", () => ({
  Frame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FrameDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  FrameHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
  FramePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  FrameTitle: ({ children }: { children: React.ReactNode }) => (
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
      activeTab,
      actions,
      contractorDetailHrefFor,
      costs,
    }: {
      activeTab?: string;
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
        requestDraw?: (input: {
          amountCents: number;
          drawKey: string;
        }) => unknown;
      };
      contractorDetailHrefFor?: (contractorId: string) => string;
      costs?: React.ReactNode;
    }) => (
      <div data-testid="production-build-surface">
        <span data-testid="active-build-tab">{activeTab}</span>
        {activeTab === "costs" && costs ? (
          <div data-testid="costs-slot-present">{costs}</div>
        ) : null}
        {contractorDetailHrefFor ? (
          <a href={contractorDetailHrefFor("contractor-01")}>
            Open contractor relationship
          </a>
        ) : null}
        {actions?.assignContractorToMilestone ? (
          <button
            data-testid="assign-contractor"
            onClick={() =>
              actions.assignContractorToMilestone?.({
                contractorId: "contractor-01",
                milestoneKey: "foundation",
                role: "Masonry lead",
              })
            }
            type="button"
          >
            Assign
          </button>
        ) : null}
        {actions?.attachContractor ? (
          <button
            data-testid="attach-existing"
            onClick={() =>
              actions.attachContractor?.({
                contractorId: "contractor-01",
                role: "Masonry crew",
              })
            }
            type="button"
          >
            Attach
          </button>
        ) : null}
        {actions?.createAndAttachContractor ? (
          <button
            data-testid="create-and-attach"
            onClick={() =>
              actions.createAndAttachContractor?.({
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
        ) : null}
        <button
          data-testid="quick-request-draw-collision-a"
          onClick={() =>
            actions?.requestDraw?.({
              amountCents: 1_010_047,
              drawKey: "draw-0-10047",
            })
          }
          type="button"
        >
          Quick request draw A
        </button>
        <button
          data-testid="quick-request-draw-collision-b"
          onClick={() =>
            actions?.requestDraw?.({
              amountCents: 1_014_464,
              drawKey: "draw-0-14464",
            })
          }
          type="button"
        >
          Quick request draw B
        </button>
      </div>
    ),
  })
);

import {
  BuilderBuildWorkspaceRoute,
  createBuildAvailabilityReference,
} from "./index";

describe("BuilderBuildWorkspaceRoute contractor actions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

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
      .mockReturnValueOnce(requestBudgetRevision)
      .mockReturnValueOnce(assignContractorToMilestone)
      .mockReturnValueOnce(removeContractorFromMilestone)
      .mockReturnValueOnce(attachAndInviteContractor)
      .mockReturnValueOnce(attachContractor)
      .mockReturnValueOnce(createAndAttachContractor)
      .mockReturnValueOnce(sendContractorInvite)
      .mockReturnValueOnce(submitMilestoneCompletion);
  });

  test("submits, reads, and downloads a durable Cost Document through the production Costs route", async () => {
    const committed = {
      grossTotalCents: 12_345,
      pages: [
        {
          assetId: "asset-page-1",
          fileName: "invoice.pdf",
          mimeType: "application/pdf",
          order: 1,
        },
      ],
      receipt: {
        recipientEmail: "builder@example.com",
        status: "queued",
      },
      title: "Foundation invoice",
      vendorName: "Cedar Forming Ltd.",
    };
    useQuery.mockReset().mockImplementation((ref, args) => {
      const name = getFunctionName(ref);
      if (name === "production_proposals:getActiveBuildDetailByString") {
        return activeBuildDetail;
      }
      if (name === "cost_documents:getCostDocument") {
        return args === "skip" ? undefined : committed;
      }
      return {};
    });
    useMutation.mockReset().mockImplementation((ref) =>
      getFunctionName(ref) === "cost_documents:submitCostDocument"
        ? submitCostDocument
        : vi.fn()
    );
    useAction.mockReturnValue(vi.fn());
    uploadCostDocumentAssets.mockResolvedValue(["asset-page-1"]);
    submitCostDocument.mockResolvedValue("cost-document-1");
    getAccessToken.mockResolvedValue("workos-access-token");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://drawflow.convex.site");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("private page", { status: 200 }));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:private-page"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined
    );

    render(
      <BuilderBuildWorkspaceRoute
        buildId="active-build-01"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder"
        search={{ tab: "costs" }}
        workosOrganizationId="org_builder"
      />
    );

    expect(screen.getByTestId("production-build-surface")).not.toBeNull();
    expect(screen.getByTestId("active-build-tab").textContent).toBe("costs");
    expect(screen.getByTestId("costs-slot-present")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Invoice or Receipt pages"), {
      target: {
        files: [new File(["page"], "invoice.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Foundation invoice" },
    });
    fireEvent.change(screen.getByLabelText("Vendor"), {
      target: { value: "Cedar Forming Ltd." },
    });
    fireEvent.change(screen.getByLabelText("Document date"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Gross Document Total (CAD)"), {
      target: { value: "123.45" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit Cost Document" })
    );

    expect(await screen.findByText("Cost Document frozen")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Download page 1: invoice.pdf" })
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/cost-documents/page?"),
      { headers: { Authorization: "Bearer workos-access-token" } }
    );
  });

  test("renders a contextual unavailable state with retry and live-build recovery", () => {
    useQuery.mockReset();
    useQuery
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({})
      .mockReturnValueOnce({})
      .mockReturnValueOnce({
        category: "notFound",
        requestedBuildId: "missing-build-01",
      });

    render(
      <BuilderBuildWorkspaceRoute
        buildId="missing-build-01"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder"
        search={{ tab: "details" }}
        workosOrganizationId="org_production_foundation"
      />
    );

    expect(screen.getByText("Build no longer available")).toBeTruthy();
    expect(screen.getByText("Record not found")).toBeTruthy();
    expect(screen.queryByText("missing-build-01")).toBeNull();
    expect(
      screen.getByText(
        createBuildAvailabilityReference({
          buildId: "missing-build-01",
          category: "notFound",
        }),
      ),
    ).toBeTruthy();
    expect(screen.getByText("DrawFlow Support")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Back to live builds" })
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/builder/builds" });
  });

  test("contractor links preserve the invoking build return path", () => {
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

    expect(
      screen
        .getByRole("link", { name: "Open contractor relationship" })
        .getAttribute("href")
    ).toBe(
      "/builder/contractors/contractor-01?fromBuildId=active-build-01"
    );
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

  test("omits contractor write controls when active-build permissions do not allow them", () => {
    useQuery.mockReset();
    useMutation.mockReset();
    useQuery
      .mockReturnValueOnce({
        ...activeBuildDetail,
        appPermissions: {
          mode: "restricted",
          resources: {
            contractor: ["view"],
          },
          role: "staff",
        },
      })
      .mockReturnValueOnce({})
      .mockReturnValueOnce({});
    useMutation
      .mockReturnValueOnce(requestDraw)
      .mockReturnValueOnce(withdrawDraw)
      .mockReturnValueOnce(requestFacilityChange)
      .mockReturnValueOnce(assignContractorToMilestone)
      .mockReturnValueOnce(removeContractorFromMilestone)
      .mockReturnValueOnce(attachAndInviteContractor)
      .mockReturnValueOnce(attachContractor)
      .mockReturnValueOnce(createAndAttachContractor)
      .mockReturnValueOnce(sendContractorInvite)
      .mockReturnValueOnce(submitMilestoneCompletion);

    render(
      <BuilderBuildWorkspaceRoute
        buildId="active-build-01"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder-staff"
        search={{ tab: "contractors" }}
        workosOrganizationId="org_production_foundation"
      />
    );

    expect(screen.queryByTestId("assign-contractor")).toBeNull();
    expect(screen.queryByTestId("attach-existing")).toBeNull();
    expect(screen.queryByTestId("create-and-attach")).toBeNull();
  });

  test("quick draw requests include distinct client operation IDs for formerly colliding seeds", async () => {
    useQuery.mockReset();
    useMutation.mockReset();
    useQuery
      .mockReturnValueOnce({
        ...activeBuildDetail,
        build: {
          ...activeBuildDetail.build,
          _id: "build-40",
        },
      })
      .mockReturnValueOnce({})
      .mockReturnValueOnce({});
    useMutation
      .mockReturnValueOnce(requestDraw)
      .mockReturnValueOnce(withdrawDraw)
      .mockReturnValueOnce(requestFacilityChange)
      .mockReturnValueOnce(assignContractorToMilestone)
      .mockReturnValueOnce(removeContractorFromMilestone)
      .mockReturnValueOnce(attachAndInviteContractor)
      .mockReturnValueOnce(attachContractor)
      .mockReturnValueOnce(createAndAttachContractor)
      .mockReturnValueOnce(sendContractorInvite)
      .mockReturnValueOnce(submitMilestoneCompletion);

    render(
      <BuilderBuildWorkspaceRoute
        buildId="build-40"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder"
        search={{ tab: "details" }}
        workosOrganizationId="org_production_foundation"
      />
    );

    fireEvent.click(screen.getByTestId("quick-request-draw-collision-a"));
    fireEvent.click(screen.getByTestId("quick-request-draw-collision-b"));

    await waitFor(() => {
      expect(requestDraw).toHaveBeenCalledTimes(2);
    });

    const firstClientOperationId = requestDraw.mock.calls[0]?.[0]?.clientOperationId;
    const secondClientOperationId = requestDraw.mock.calls[1]?.[0]?.clientOperationId;

    expect(firstClientOperationId).toMatch(/^builder-draw:/);
    expect(secondClientOperationId).toMatch(/^builder-draw:/);
    expect(firstClientOperationId).not.toBe(secondClientOperationId);
    expect(firstClientOperationId.length).toBeLessThanOrEqual(128);
    expect(secondClientOperationId.length).toBeLessThanOrEqual(128);
  });
});
