// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const acknowledge = vi.fn();
const clarify = vi.fn();
const dispute = vi.fn();
const useQuery = vi.fn();
let mutationIndex = 0;

vi.mock("convex/react", () => ({
  useMutation: () => [acknowledge, clarify, dispute][mutationIndex++ % 3],
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ buildId: "active_build_01" }),
    useSearch: () => ({ assignmentId: "assignment_01" }),
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { ContractorBuildDetail } from "./$buildId";

const detail = {
  assignedScope: [
    {
      acknowledgement: { state: "pending_acknowledgement" },
      assignmentId: "assignment_01",
      milestoneKey: "foundation",
      milestoneName: "Foundation",
      role: "Concrete crew",
      status: "active",
      submilestoneKey: null,
    },
  ],
  build: {
    _id: "active_build_01",
    buildName: "Hamilton Build",
    location: "Hamilton, ON",
    organizationId: "org_01",
  },
  builderContact: { displayName: "Oakline Builders" },
  permitDocuments: [],
};

describe("ContractorBuildDetail", () => {
  beforeEach(() => {
    mutationIndex = 0;
    acknowledge.mockResolvedValue("ack_01");
    clarify.mockResolvedValue("issue_01");
    dispute.mockResolvedValue("issue_02");
    useQuery.mockReturnValue(detail);
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
        submilestoneKey: undefined,
        summary: "Confirm whether excavation is included.",
        workosOrganizationId: "org_01",
      }),
    );
  });

  test("renders first-party recovery for a removed or stale assignment", () => {
    useQuery.mockReturnValue({
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
    });

    render(<ContractorBuildDetail />);

    expect(screen.getByText("Assignment unavailable")).toBeTruthy();
    expect(screen.getByText(/CTR-WORK-00000001/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Return to current work" }).getAttribute("href"),
    ).toBe("/contractor/work");
  });
});
