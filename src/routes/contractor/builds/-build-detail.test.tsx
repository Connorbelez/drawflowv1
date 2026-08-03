// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const acknowledge = vi.fn();
const clarify = vi.fn();
const dispute = vi.fn();
const startAssignedSubmilestone = vi.fn();
const navigate = vi.fn();
const useQuery = vi.fn();
const usePaginatedQuery = vi.fn();
let mutationIndex = 0;
let routeRoles = ["contractor"];
let routeSearch: Record<string, unknown> = {
  assignmentId: "assignment_01",
};
const canonicalCostDocumentId = "ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r";
let submittedCostDocuments: {
  loadMore: ReturnType<typeof vi.fn>;
  results: Array<{ _id: string; title: string }>;
  status: string;
} = {
  loadMore: vi.fn(),
  results: [],
  status: "Exhausted",
};

vi.mock("convex/react", () => ({
  useMutation: () =>
    [acknowledge, clarify, dispute, startAssignedSubmilestone][
      mutationIndex++ % 4
  ],
  useQuery: (...args: unknown[]) => useQuery(...args),
  usePaginatedQuery: (...args: unknown[]) => usePaginatedQuery(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ buildId: "active_build_01" }),
    useRouteContext: () => ({
      organizationId: "session_org_01",
      role: routeRoles[0],
      roles: routeRoles,
    }),
    useSearch: () => routeSearch,
  }),
  useNavigate: () => navigate,
  Link: ({
    children,
    to,
    ...props
  }: { children: React.ReactNode; to: string } & React.ComponentProps<"a">) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

vi.mock(
  "#/features/build-collaboration/BuildCollaborationWorkspace.tsx",
  () => ({
    BuildCollaborationWorkspace: ({
      buildId,
      organizationId,
    }: {
      buildId: string;
      organizationId: string;
    }) => (
      <div data-testid="build-collaboration-workspace">
        {buildId}:{organizationId}
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
      submilestones,
    }: {
      actorCapacity?: string;
      batchId?: string;
      draftId?: string;
      onBatchIdChange: (batchId?: string) => void;
      submilestones: Array<{ id: string; label: string }>;
    }) => (
      <div
        data-actor-capacity={actorCapacity}
        data-batch-id={batchId}
        data-draft-id={draftId}
        data-submilestones={submilestones.map((scope) => scope.id).join(",")}
        data-testid="contractor-cost-document-workspace"
      >
        <button onClick={() => onBatchIdChange("cost-batch-02")} type="button">
          Open Cost Document batch
        </button>
      </div>
    ),
  })
);

vi.mock(
  "#/features/cost-documents/CostDocumentRoadmapReconciliation.tsx",
  () => ({
    CostDocumentDetailSheet: ({
      document,
      interactionMode,
      onClose,
    }: {
      document?: { _id?: string } | null;
      interactionMode?: string;
      onClose: () => void;
    }) => (
      <div
        data-interaction-mode={interactionMode}
        data-testid="contractor-submitted-cost-document"
      >
        <span>{document?._id ?? "unavailable"}</span>
        <button onClick={onClose} type="button">
          Close submitted Cost Document
        </button>
      </div>
    ),
  })
);

import { Route } from "./$buildId";

const ContractorBuildDetail = (
  Route as unknown as { component: ComponentType }
).component;

const detail = {
  assignedScope: [
    {
      acknowledgement: { state: "pending_acknowledgement" },
      actualStartedAt: null,
      assignmentId: "assignment_01",
      buildSubmilestoneId: "submilestone_forms",
      costDocumentCaptureEligible: true,
      dependencyBlockers: [],
      milestoneKey: "foundation",
      milestoneName: "Foundation",
      role: "Concrete crew",
      status: "active",
      submilestoneKey: "forms",
      submilestoneName: "Set forms",
      workStatus: "planned",
    },
  ],
  build: {
    _id: "active_build_01",
    buildName: "Hamilton Build",
    location: "Hamilton, ON",
    organizationId: "org_01",
    startDate: "2026-05-01",
  },
  builderContact: { displayName: "Oakline Builders" },
  permitDocuments: [],
};
const linkedParticipationScope = {
  buildId: "active_build_01",
  buildName: "Hamilton Build",
  legacyContractorProfileLinked: true,
  organizationId: "org_01",
  participantId: "participant_01",
  role: "contractor",
};
let participationScope = linkedParticipationScope;
let contractorDetail = detail;
let selectedCostDocument: { _id: string } | null | undefined;

describe("ContractorBuildDetail", () => {
  beforeEach(() => {
    routeRoles = ["contractor"];
    routeSearch = { assignmentId: "assignment_01" };
    submittedCostDocuments = {
      loadMore: vi.fn(),
      results: [],
      status: "Exhausted",
    };
    contractorDetail = detail;
    participationScope = linkedParticipationScope;
    selectedCostDocument = undefined;
    mutationIndex = 0;
    navigate.mockReset();
    acknowledge.mockResolvedValue("ack_01");
    clarify.mockResolvedValue("issue_01");
    dispute.mockResolvedValue("issue_02");
    startAssignedSubmilestone.mockResolvedValue("start_01");
    useQuery.mockImplementation(
      (_query: unknown, input: Record<string, unknown> | "skip") => {
        if (input !== "skip" && "costDocumentId" in input) {
          return selectedCostDocument;
        }
        return input !== "skip" && "organizationId" in input
          ? participationScope
          : contractorDetail;
      }
    );
    usePaginatedQuery.mockImplementation(() => submittedCostDocuments);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("acknowledges the exact deep-linked assignment", async () => {
    render(<ContractorBuildDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() =>
      expect(acknowledge).toHaveBeenCalledWith({
        assignmentType: "build",
        buildAssignmentId: "assignment_01",
        kind: "assignment",
        workosOrganizationId: "org_01",
      }),
    );
    expect(document.querySelector("#assignment-assignment_01")?.className).toContain(
      "ring-2",
    );
  });

  test("renders the shared production collaboration module in the authorized Build surface", () => {
    render(<ContractorBuildDetail />);

    expect(
      screen.getByRole("heading", { name: "Build collaboration" })
    ).toBeTruthy();
    expect(
      screen.getByTestId("build-collaboration-workspace").textContent
    ).toBe("active_build_01:org_01");
    expect(
      screen.getByTestId("contractor-cost-document-workspace").getAttribute(
        "data-submilestones"
      )
    ).toBe("submilestone_forms");
    expect(
      screen.getByTestId("contractor-cost-document-workspace").getAttribute(
        "data-actor-capacity"
      )
    ).toBe("contractor");
  });

  test("reuses the Cost Document batch workspace with only active assigned scope at desktop and compact widths", () => {
    for (const width of [1440, 390]) {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
        writable: true,
      });
      const rendered = render(<ContractorBuildDetail />);
      expect(screen.getByTestId("contractor-cost-documents").className).toContain(
        "min-w-0"
      );
      expect(
        screen.getByTestId("contractor-cost-document-workspace").getAttribute(
          "data-submilestones"
        )
      ).toBe("submilestone_forms");
      rendered.unmount();
    }
  });

  test("normalizes private Cost Document deep links and keeps Drafts ahead of submitted records and Batches", () => {
    const validateSearch = (Route as unknown as {
      validateSearch: (search: Record<string, unknown>) => unknown;
    }).validateSearch;
    expect(
      validateSearch({
        costBatch: " batch-private ",
        costDocument: canonicalCostDocumentId,
        costDocumentDraft: " draft-private ",
      })
    ).toEqual({ costDocumentDraft: "draft-private" });
    expect(
      validateSearch({
        costBatch: " batch-private ",
        costDocument: canonicalCostDocumentId,
      })
    ).toEqual({ costDocument: canonicalCostDocumentId });
    expect(validateSearch({ costBatch: " batch-private " })).toEqual({
      costBatch: "batch-private",
    });
  });

  test("routes Cost Document batch lifecycle within the contractor Build route", () => {
    routeSearch = {
      assignmentId: "assignment_01",
      costBatch: "cost-batch-01",
      focus: "build-note:note-01",
    };
    render(<ContractorBuildDetail />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open Cost Document batch" })
    );

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { buildId: "active_build_01" },
        replace: true,
        search: {
          assignmentId: "assignment_01",
          costBatch: "cost-batch-02",
          costDocument: undefined,
          costDocumentDraft: undefined,
          focus: "build-note:note-01",
        },
        to: "/contractor/builds/$buildId",
      })
    );
  });

  test("uses first-party recovery instead of mounting capture for a completed assignment or stale deep link", () => {
    routeSearch = {
      costBatch: "private-stale-batch",
      costDocumentDraft: "private-stale-draft",
    };
    contractorDetail = {
      ...detail,
      assignedScope: detail.assignedScope.map((scope) => ({
        ...scope,
        status: "completed",
      })),
    };

    render(<ContractorBuildDetail />);

    expect(
      screen.getByTestId("contractor-cost-documents-recovery")
    ).toBeTruthy();
    expect(screen.queryByTestId("contractor-cost-document-workspace")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Return to current work" })
        .className
    ).toContain("min-h-11");
  });

  test("does not mount capture when the server projection rejects the parent assignment boundary", () => {
    contractorDetail = {
      ...detail,
      assignedScope: detail.assignedScope.map((scope) => ({
        ...scope,
        costDocumentCaptureEligible: false,
      })),
    };

    render(<ContractorBuildDetail />);

    expect(
      screen.getByTestId("contractor-cost-documents-recovery")
    ).toBeTruthy();
    expect(screen.queryByTestId("contractor-cost-document-workspace")).toBeNull();
  });

  test("keeps the Contractor's own submitted records readable in normal-completion recovery", () => {
    routeSearch = { costDocument: canonicalCostDocumentId };
    contractorDetail = {
      ...detail,
      assignedScope: detail.assignedScope.map((scope) => ({
        ...scope,
        status: "completed",
      })),
    };
    submittedCostDocuments = {
      loadMore: vi.fn(),
      results: [
        {
          _id: canonicalCostDocumentId,
          title: "Completed footings receipt",
        },
      ],
      status: "Exhausted",
    };
    selectedCostDocument = { _id: canonicalCostDocumentId };

    render(<ContractorBuildDetail />);

    expect(
      screen.getByTestId("contractor-submitted-cost-documents")
    ).toBeTruthy();
    expect(
      screen.getByTestId("contractor-submitted-cost-document").textContent
    ).toContain(canonicalCostDocumentId);
    expect(
      screen
        .getByTestId("contractor-submitted-cost-document")
        .getAttribute("data-interaction-mode")
    ).toBe("read-only");
  });

  test("keeps scoped capture and normally completed submitted history together for mixed Contractor scope", () => {
    routeSearch = { costDocument: canonicalCostDocumentId };
    contractorDetail = {
      ...detail,
      assignedScope: [
        ...detail.assignedScope,
        {
          ...detail.assignedScope[0],
          assignmentId: "assignment_completed_01",
          buildSubmilestoneId: "submilestone_completed_01",
          status: "completed",
          submilestoneKey: "waterproofing",
          submilestoneName: "Waterproofing",
        },
      ],
    };
    submittedCostDocuments = {
      loadMore: vi.fn(),
      results: [
        {
          _id: canonicalCostDocumentId,
          title: "Completed waterproofing receipt",
        },
      ],
      status: "Exhausted",
    };
    selectedCostDocument = { _id: canonicalCostDocumentId };

    render(<ContractorBuildDetail />);

    expect(
      screen.getByTestId("contractor-cost-document-workspace").getAttribute(
        "data-submilestones"
      )
    ).toBe("submilestone_forms");
    expect(
      screen.getByTestId("contractor-submitted-cost-documents")
    ).toBeTruthy();
    expect(
      screen.getByTestId("contractor-submitted-cost-document").textContent
    ).toContain(canonicalCostDocumentId);
    expect(
      screen
        .getByTestId("contractor-submitted-cost-document")
        .getAttribute("data-interaction-mode")
    ).toBe("read-only");
    expect(
      screen.queryByTestId("contractor-cost-documents-recovery")
    ).toBeNull();
    expect(usePaginatedQuery).toHaveBeenCalledWith(
      expect.anything(),
      {
        actorCapacity: "contractor",
        buildId: "active_build_01",
        organizationId: "org_01",
      },
      { initialNumItems: 20 }
    );
  });

  test("opens and closes submitted history through Build-local route state", () => {
    submittedCostDocuments = {
      loadMore: vi.fn(),
      results: [
        { _id: canonicalCostDocumentId, title: "Footings receipt" },
      ],
      status: "Exhausted",
    };
    const view = render(<ContractorBuildDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Footings receipt" }));
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: {
          assignmentId: "assignment_01",
          costBatch: undefined,
          costDocument: canonicalCostDocumentId,
          costDocumentDraft: undefined,
          focus: undefined,
        },
        to: "/contractor/builds/$buildId",
      })
    );

    routeSearch = {
      assignmentId: "assignment_01",
      costDocument: canonicalCostDocumentId,
    };
    view.rerender(<ContractorBuildDetail />);
    fireEvent.click(
      screen.getByRole("button", { name: "Close submitted Cost Document" })
    );
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: {
          assignmentId: "assignment_01",
          costBatch: undefined,
          costDocument: undefined,
          costDocumentDraft: undefined,
          focus: undefined,
        },
        to: "/contractor/builds/$buildId",
      })
    );
  });

  test("consumes a truthful submitted-record continuation before any readable result arrives", () => {
    contractorDetail = {
      ...detail,
      assignedScope: detail.assignedScope.map((scope) => ({
        ...scope,
        status: "completed",
      })),
    };
    const loadMore = vi.fn();
    submittedCostDocuments = {
      loadMore,
      results: [],
      status: "CanLoadMore",
    };

    for (const width of [1440, 390]) {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
        writable: true,
      });
      const rendered = render(<ContractorBuildDetail />);
      const button = screen.getByRole("button", {
        name: "Load more submitted Cost Documents",
      });
      expect(
        screen.queryByText(
          "No submitted Cost Documents are available under your current Build access."
        )
      ).toBeNull();
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("w-full");
      fireEvent.click(button);
      expect(loadMore).toHaveBeenCalledWith(20);
      rendered.unmount();
      loadMore.mockClear();
    }
  });

  test("renders collaboration for a grant-only Contractor without a linked profile or assignment projection", () => {
    participationScope = {
      ...linkedParticipationScope,
      legacyContractorProfileLinked: false,
    };

    render(<ContractorBuildDetail />);

    expect(screen.getByRole("heading", { name: "Hamilton Build" })).toBeTruthy();
    expect(
      screen.getByTestId("build-collaboration-workspace").textContent
    ).toBe("active_build_01:org_01");
    expect(screen.queryByText("Your assigned scope")).toBeNull();
    expect(useQuery).toHaveBeenCalledWith(expect.anything(), "skip");
  });

  test("requires and submits a scoped clarification", async () => {
    render(<ContractorBuildDetail />);

    fireEvent.click(
      screen.getByRole("button", { name: "Request clarification" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send response" }));
    expect(
      screen.getByText(
        "Describe the clarification or scope concern before sending.",
      ),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Clarification needed"), {
      target: { value: "Confirm whether excavation is included." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send response" }));

    await waitFor(() =>
      expect(clarify).toHaveBeenCalledWith({
        assignmentType: "build",
        buildAssignmentId: "assignment_01",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        summary: "Confirm whether excavation is included.",
        workosOrganizationId: "org_01",
      }),
    );
  });

  test("confirms and records the assigned submilestone start without starting its parent", async () => {
    render(<ContractorBuildDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Start work" }));
    expect(screen.getByTestId("milestone-start-dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record start" }));

    await waitFor(() =>
      expect(startAssignedSubmilestone).toHaveBeenCalledWith(
        expect.objectContaining({
          actualStartedAt: expect.any(Number),
          buildId: "active_build_01",
          idempotencyKey: expect.any(String),
          milestoneKey: "foundation",
          source: "submilestone_detail",
          submilestoneKey: "forms",
          workosOrganizationId: "org_01",
        })
      )
    );
    expect(startAssignedSubmilestone.mock.calls[0]?.[0]).not.toHaveProperty(
      "startParent"
    );
  });

  test("renders first-party recovery for a removed or stale assignment", () => {
    contractorDetail = {
      assignedScope: [],
      availability: {
        message:
          "This assignment is no longer active. Return to your work list to review your current scope.",
        reference: "CTR-WORK-00000001",
        state: "assignment_unavailable",
      },
      build: null,
      builderContact: null,
      permitDocuments: [],
    };

    render(<ContractorBuildDetail />);

    expect(screen.getByText("Assignment unavailable")).toBeTruthy();
    expect(screen.getByText(/CTR-WORK-00000001/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Return to current work" }).getAttribute("href"),
    ).toBe("/contractor/work");
  });
});
