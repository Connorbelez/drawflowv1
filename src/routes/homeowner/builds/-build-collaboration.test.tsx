// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const navigate = vi.fn();
const useQuery = vi.fn();
let routeSearch: Record<string, unknown> = { focus: "actionItem:action_01" };
let participationScope: Record<string, unknown> | null | undefined;
const costDocumentId = "ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r";

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ buildId: "active_build_01" }),
    useSearch: () => routeSearch,
  }),
  useNavigate: () => navigate,
}));

vi.mock(
  "#/features/backoffice-build-detail/BuildDetailTabs.tsx",
  () => ({
    BuildDetailTabBar: ({
      activeTab,
      labels,
      onChangeTab,
      tabs,
    }: {
      activeTab: string;
      labels?: Record<string, string>;
      onChangeTab: (tab: "costs" | "details") => void;
      tabs: string[];
    }) => (
      <nav data-active-tab={activeTab} data-testid="homeowner-build-tabs">
        {tabs.map((tab) => (
          <button key={tab} onClick={() => onChangeTab(tab as "costs" | "details")} type="button">
            {labels?.[tab] ?? tab}
          </button>
        ))}
      </nav>
    ),
  })
);

vi.mock(
  "#/features/build-collaboration/BuildCollaborationWorkspace.tsx",
  () => ({
    BuildCollaborationWorkspace: ({
      buildId,
      focusedReference,
      organizationId,
    }: {
      buildId: string;
      focusedReference?: string;
      organizationId?: string;
    }) => (
      <div data-testid="build-collaboration-workspace">
        {buildId}:{organizationId}:{focusedReference}
      </div>
    ),
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
      submilestones,
    }: {
      actorCapacity?: string;
      batchId?: string;
      draftId?: string;
      onBatchIdChange: (batchId?: string) => void;
      reconciliation?: {
        onCostDocumentIdChange: (id?: string) => void;
        selectedCostDocumentId?: string;
      };
      submilestones: Array<{ id: string }>;
    }) => (
      <div
        data-actor-capacity={actorCapacity}
        data-batch-id={batchId}
        data-draft-id={draftId}
        data-selected-document={reconciliation?.selectedCostDocumentId}
        data-submilestones={submilestones.map((item) => item.id).join(",")}
        data-testid="homeowner-cost-document-workspace"
      >
        <button onClick={() => onBatchIdChange("batch_02")} type="button">
          Start Cost Document batch
        </button>
        <button
          onClick={() => reconciliation?.onCostDocumentIdChange(costDocumentId)}
          type="button"
        >
          Open submitted Cost Document
        </button>
      </div>
    ),
  })
);

import { Route } from "./$buildId";

const HomeownerBuildCollaboration = (
  Route as unknown as { component: ComponentType }
).component;

describe("HomeownerBuildCollaboration", () => {
  beforeEach(() => {
    navigate.mockReset();
    routeSearch = { focus: "actionItem:action_01" };
    participationScope = {
      buildId: "active_build_01",
      buildName: "Hamilton Build",
      organizationId: "lender_org_01",
      participantId: "participant_01",
      role: "homeowner",
    };
    useQuery.mockImplementation((_reference: unknown, args: unknown) => {
      if (
        args !== "skip" &&
        typeof args === "object" &&
        args !== null &&
        "actorCapacity" in args
      ) {
        return [
          {
            id: "submilestone_foundation" as never,
            label: "Foundation · Footings",
            milestoneKey: "foundation",
          },
        ];
      }
      return participationScope;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("renders the shared production collaboration module with deep-link focus", () => {
    render(<HomeownerBuildCollaboration />);

    expect(
      screen.getByRole("heading", { name: "Hamilton Build" })
    ).toBeTruthy();
    expect(
      screen.getByTestId("build-collaboration-workspace").textContent
    ).toBe("active_build_01:lender_org_01:actionItem:action_01");
    expect(screen.getByRole("button", { name: "Collaboration" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "costs" })).toBeTruthy();
  });

  test("normalizes Cost deep links and opens Costs for a pasted canonical state", () => {
    const validateSearch = (Route as unknown as {
      validateSearch: (search: Record<string, unknown>) => Record<string, unknown>;
    }).validateSearch;

    expect(
      validateSearch({
        costBatch: " batch-private ",
        costDocument: costDocumentId,
        costDocumentDraft: " draft-private ",
      })
    ).toEqual({ costDocumentDraft: "draft-private", tab: "costs" });
    expect(
      validateSearch({ costDocument: ` ${costDocumentId} ` })
    ).toEqual({ costDocument: costDocumentId, tab: "costs" });
    expect(validateSearch({ costDocument: "forged" })).toEqual({});
  });

  test("renders capacity-pinned canonical Cost capture at desktop and compact widths", () => {
    routeSearch = { tab: "costs" };

    for (const width of [1440, 390]) {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
        writable: true,
      });
      const rendered = render(<HomeownerBuildCollaboration />);
      const workspace = screen.getByTestId("homeowner-cost-document-workspace");
      expect(workspace.getAttribute("data-actor-capacity")).toBe("homeowner");
      expect(workspace.getAttribute("data-submilestones")).toBe(
        "submilestone_foundation"
      );
      rendered.unmount();
    }
  });

  test("keeps capture and immutable-record detail addressable in the assigned Build URL", () => {
    routeSearch = {
      costBatch: "batch_01",
      focus: "build-note:note_01",
      tab: "costs",
    };
    render(<HomeownerBuildCollaboration />);

    fireEvent.click(
      screen.getByRole("button", { name: "Start Cost Document batch" })
    );
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { buildId: "active_build_01" },
        replace: true,
        search: {
          costBatch: "batch_02",
          costDocument: undefined,
          costDocumentDraft: undefined,
          focus: "build-note:note_01",
          tab: "costs",
        },
        to: "/homeowner/builds/$buildId",
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open submitted Cost Document" })
    );
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: {
          costBatch: undefined,
          costDocument: costDocumentId,
          costDocumentDraft: undefined,
          focus: "build-note:note_01",
          tab: "costs",
        },
      })
    );
  });

  test("clears private Cost route state when returning to Collaboration", () => {
    routeSearch = {
      costBatch: "batch_01",
      costDocumentDraft: "draft_01",
      tab: "costs",
    };
    render(<HomeownerBuildCollaboration />);

    fireEvent.click(screen.getByRole("button", { name: "Collaboration" }));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: {
          costBatch: undefined,
          costDocument: undefined,
          costDocumentDraft: undefined,
          tab: undefined,
        },
      })
    );
  });

  test("fails closed before mounting Cost capture when the homeowner assignment is removed", () => {
    participationScope = null;

    render(<HomeownerBuildCollaboration />);

    expect(screen.getByText("Build unavailable")).toBeTruthy();
    expect(screen.queryByTestId("homeowner-cost-document-workspace")).toBeNull();
  });
});
