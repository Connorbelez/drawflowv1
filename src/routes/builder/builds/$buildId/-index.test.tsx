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
  viewerBuildRoles: ["builder", "builder-staff"],
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

vi.mock(
  "#/features/cost-documents/CostDocumentBatchWorkspace.tsx",
  () => ({
    CostDocumentBatchWorkspace: ({
      actorCapacity,
      batchId,
      draftId,
      onBatchIdChange,
      reconciliation,
    }: {
      batchId?: string;
      draftId?: string;
      onBatchIdChange: (batchId?: string) => void;
      actorCapacity?:
        | "admin"
        | "principle-broker"
        | "broker"
        | "broker-staff"
        | "builder"
        | "builder-staff"
        | "homeowner"
        | "contractor";
      reconciliation?: {
        onCostDocumentCorrectionStarted: (input: {
          batchId: string;
          draftId: string;
        }) => void;
        onCostDocumentIdChange: (costDocumentId?: string) => void;
        selectedCostDocumentId?: string;
      };
    }) => (
      <div
        data-actor-capacity={actorCapacity}
        data-batch-id={batchId}
        data-cost-document-id={reconciliation?.selectedCostDocumentId}
        data-draft-id={draftId}
        data-testid="cost-document-batch-workspace"
      >
        <button onClick={() => onBatchIdChange("batch-01")} type="button">
          Open Cost Document batch
        </button>
        <button onClick={() => onBatchIdChange(undefined)} type="button">
          Close Cost Document batch
        </button>
        {reconciliation ? (
          <>
            <button
              onClick={() =>
                reconciliation.onCostDocumentIdChange("cost-document-01")
              }
              type="button"
            >
              Open Cost Document reconciliation
            </button>
            <button
              onClick={() => reconciliation.onCostDocumentIdChange(undefined)}
              type="button"
            >
              Close Cost Document reconciliation
            </button>
            <button
              onClick={() =>
                reconciliation.onCostDocumentCorrectionStarted({
                  batchId: "correction-batch-01",
                  draftId: "correction-draft-01",
                })
              }
              type="button"
            >
              Correct Cost Document reconciliation
            </button>
          </>
        ) : null}
      </div>
    ),
  })
);

vi.mock(
  "#/features/cost-documents/CostDocumentRoadmapReconciliation.tsx",
  () => ({
    CostDocumentRoadmapReconciliation: ({ interactionMode }: { interactionMode?: string }) => (
      <div
        data-interaction-mode={interactionMode}
        data-testid="cost-document-roadmap-reconciliation"
      />
    ),
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
      viewerCapacity,
      viewerRole,
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
      viewerCapacity?: string;
      viewerRole?: string;
    }) => (
      <div data-testid="production-build-surface">
        <span data-testid="active-build-tab">{activeTab}</span>
        <span data-testid="viewer-capacity">{viewerCapacity}</span>
        <span data-testid="viewer-role">{viewerRole}</span>
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
  Route,
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

  test("keeps the Cost Document batch sheet route-addressable", () => {
    render(
      <BuilderBuildWorkspaceRoute
        buildId="active-build-01"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder"
        search={{ costBatch: "batch-deep-link", tab: "costs" }}
        workosOrganizationId="org_builder"
      />
    );

    expect(screen.getByTestId("production-build-surface")).not.toBeNull();
    expect(screen.getByTestId("active-build-tab").textContent).toBe("costs");
    expect(screen.getByTestId("viewer-capacity").textContent).toBe("builder");
    expect(screen.getByTestId("viewer-role").textContent).toBe("builder");
    expect(screen.getByTestId("costs-slot-present")).not.toBeNull();
    expect(
      screen
        .getByTestId("cost-document-batch-workspace")
        .getAttribute("data-actor-capacity")
    ).toBe("builder");
    expect(
      screen.getByTestId("cost-document-batch-workspace").getAttribute(
        "data-batch-id"
      )
    ).toBe("batch-deep-link");
    fireEvent.click(
      screen.getByRole("button", { name: "Open Cost Document batch" })
    );
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({
          costBatch: "batch-01",
          costDocument: undefined,
          costDocumentDraft: undefined,
          tab: "costs",
        }),
      })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Close Cost Document batch" })
    );
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({
          costBatch: undefined,
          costDocument: undefined,
          costDocumentDraft: undefined,
          tab: "costs",
        }),
      })
    );
  });

  test("pins Builder Staff Cost Document workspaces to the Builder Staff capacity", () => {
    render(
      <BuilderBuildWorkspaceRoute
        buildId="active-build-01"
        enableContractorLinks={false}
        includeStaffTab={false}
        routeBase="/builder-staff"
        search={{ tab: "costs" }}
        workosOrganizationId="org_builder"
      />
    );

    expect(
      screen
        .getByTestId("cost-document-batch-workspace")
        .getAttribute("data-actor-capacity")
    ).toBe("builder-staff");
    expect(screen.getByTestId("viewer-capacity").textContent).toBe(
      "builder-staff",
    );
    expect(screen.getByTestId("viewer-role").textContent).toBe("builder");
  });

  test("renders a brokerage Cost ledger without private Builder batch queries when the viewer lacks Build-local Builder capacity", () => {
    useQuery.mockReset();
    useQuery
      .mockReturnValueOnce({
        ...activeBuildDetail,
        viewerBuildRoles: ["admin", "principle-broker"],
      })
      .mockReturnValueOnce({})
      .mockReturnValueOnce({});

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

    expect(
      screen.queryByTestId("cost-document-batch-workspace")
    ).toBeNull();
    expect(
      screen
        .getByTestId("cost-document-roadmap-reconciliation")
        .getAttribute("data-interaction-mode")
    ).toBe("brokerage-review");
  });

  test("shows Cost Document capture to an all-role admin on the Builder route", () => {
    useQuery.mockReset();
    useQuery
      .mockReturnValueOnce({
        ...activeBuildDetail,
        viewerBuildRoles: ["admin", "principle-broker"],
      })
      .mockReturnValueOnce({})
      .mockReturnValueOnce({});

    render(
      <BuilderBuildWorkspaceRoute
        buildId="active-build-01"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder"
        search={{ tab: "costs" }}
        viewerRoles={["admin", "principle-broker", "builder"]}
        workosOrganizationId="org_builder"
      />
    );

    expect(
      screen
        .getByTestId("cost-document-batch-workspace")
        .getAttribute("data-actor-capacity")
    ).toBe("admin");
    expect(
      screen.queryByTestId("cost-document-roadmap-reconciliation")
    ).toBeNull();
  });

  test("validates Cost Document batch deep links without leaking other values", () => {
    const costDocumentId = "ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r";
    const validateSearch = (
      Route as unknown as {
        validateSearch: (
          search: Record<string, unknown>
        ) => Record<string, unknown>;
      }
    ).validateSearch;
    expect(
      validateSearch({ costBatch: " batch-01 ", tab: "costs" })
    ).toMatchObject({ costBatch: "batch-01", tab: "costs" });
    expect(validateSearch({ costBatch: 42, tab: "costs" })).toEqual({
      tab: "costs",
    });
    expect(
      validateSearch({
        costBatch: "batch-private",
        costDocument: costDocumentId,
        costDocumentDraft: " draft-shared ",
        tab: "costs",
      })
    ).toEqual({ costDocumentDraft: "draft-shared", tab: "costs" });
    expect(
      validateSearch({
        costBatch: " batch-private ",
        costDocument: ` ${costDocumentId} `,
        costDocumentDraft: 42,
        tab: "costs",
      })
    ).toEqual({ costDocument: costDocumentId, tab: "costs" });
    expect(
      validateSearch({ costBatch: "batch-private", costDocument: 42, tab: "costs" })
    ).toEqual({ costBatch: "batch-private", tab: "costs" });
    expect(
      validateSearch({ costDocument: "not-an-id", tab: "costs" })
    ).toEqual({ tab: "costs" });
  });

  test("keeps Cost Document selection route-owned and browser-history durable", () => {
    render(
      <BuilderBuildWorkspaceRoute
        buildId="active-build-01"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder"
        search={{ costDocument: "cost-document-deep-link", tab: "costs" }}
        workosOrganizationId="org_builder"
      />
    );

    const workspace = screen.getByTestId("cost-document-batch-workspace");
    expect(workspace.getAttribute("data-cost-document-id")).toBe(
      "cost-document-deep-link"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open Cost Document reconciliation" })
    );
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        replace: false,
        search: expect.objectContaining({
          costBatch: undefined,
          costDocument: "cost-document-01",
          costDocumentDraft: undefined,
          tab: "costs",
        }),
      })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Close Cost Document reconciliation" })
    );
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({
          costDocument: undefined,
          tab: "costs",
        }),
      })
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Correct Cost Document reconciliation",
      })
    );
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        replace: false,
        search: expect.objectContaining({
          costBatch: "correction-batch-01",
          costDocument: undefined,
          costDocumentDraft: "correction-draft-01",
          tab: "costs",
        }),
      })
    );
  });

  test("passes an exact shared Draft deep link without a creator batch", () => {
    render(
      <BuilderBuildWorkspaceRoute
        buildId="active-build-01"
        enableContractorLinks
        includeStaffTab={false}
        routeBase="/builder"
        search={{ costDocumentDraft: "draft-shared", tab: "costs" }}
        workosOrganizationId="org_builder"
      />
    );

    const workspace = screen.getByTestId("cost-document-batch-workspace");
    expect(workspace.getAttribute("data-draft-id")).toBe("draft-shared");
    expect(workspace.getAttribute("data-batch-id")).toBeNull();
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
