// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const {
  activateClosedProposal,
  navigate,
  recordProposalClosing,
  useMutation,
  useQuery,
} = vi.hoisted(() => ({
  activateClosedProposal: vi.fn(),
  navigate: vi.fn(),
  recordProposalClosing: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({ useMutation, useQuery }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: Record<string, unknown>) => ({
      ...options,
      useParams: () => ({ proposalId: "proposal_withdrawn" }),
      useRouteContext: () => ({
        organizationId: "org_lender",
        userId: "user_lender",
      }),
      useSearch: () => ({ assignmentId: "assignment_withdrawn" }),
    }),
  useNavigate: () => navigate,
}));
vi.mock("#/components/lender-shell.tsx", () => ({
  LenderShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock(
  "#/features/lender-portal/LenderProposalNotificationReviewSurface.tsx",
  () => ({
    LenderProposalNotificationReviewSurface: () => (
      <div>Current proposal review surface</div>
    ),
  })
);

import { api } from "../../../../convex/_generated/api";
import { Route } from "./$proposalId.tsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function currentRouteFixture(
  lifecycleActions: {
    canActivateClosedProposal: boolean;
    canRecordClosing: boolean;
  }
) {
  return {
    confirmation: { currentCycle: null },
    detail: {
      proposal: {
        _id: "proposal_withdrawn",
        buildName: "Maple Court",
        interestAnnualBps: 875,
        lenderDrawPolicyLimitCents: 55_000_000,
      },
    },
    lifecycle: {
      assignment: { status: "current" },
      lifecycleActions,
    },
  };
}

const checkpoints = {
  accessReviewPolicy: {
    drawApprovalMode: "both",
    drawLenderQuorum: 1,
    milestoneApprovalMode: "both",
    milestoneLenderQuorum: 1,
    milestoneReceiptInvoiceRequired: true,
    milestoneSiteVisitRequired: true,
  },
  budget: { totalBudgetCents: 48_000_000 },
  builder: { builderProfileId: "builder_1", displayName: "Northstar" },
  milestoneCount: { count: 8 },
  scheduleTimeline: {
    milestonesFingerprint: "sealed-schedule-fingerprint",
    proposedStartDate: "2026-09-01",
    timelineRangeMax: 420,
    timelineRangeMin: 0,
  },
};

describe("/lender/proposals/$proposalId withdrawn production route", () => {
  test("renders sealed revision checkpoints and decisions without private fields", () => {
    const detail = {
      assignmentId: "assignment_withdrawn",
      capturedAt: Date.UTC(2026, 7, 18, 14),
      decisions: {
        continueCursor: "",
        isDone: true,
        page: [
          {
            approvalId: "approval_1",
            approvedAt: Date.UTC(2026, 7, 17, 14),
            proposalRevisionId: "revision_1",
            proposalRevisionNumber: 1,
            status: "approved",
          },
        ],
      },
      documents: { continueCursor: "", isDone: true, page: [] },
      lifecycle: {
        activation: "inactive",
        backOfficeApproval: "approved",
        capitalSource: "external",
        closing: "pending_closing",
        externalAssignment: "withdrawn",
        lenderConfirmation: "approved",
        proposalState: "approved",
      },
      proposal: {
        buildName: "Frozen route Proposal",
        location: "18 Frozen History Road",
        status: "approved",
      },
      readOnly: true,
      revisions: {
        continueCursor: "",
        isDone: true,
        page: [
          {
            assignmentId: "assignment_withdrawn",
            changedCheckpoints: ["budget"],
            checkpoints,
            createdAt: Date.UTC(2026, 7, 16, 14),
            revisionId: "revision_1",
            revisionNumber: 1,
            reviewPolicyVersionId: "policy_1",
          },
        ],
      },
    };
    const confirmation = {
      canAcknowledge: false,
      canDecide: false,
      closingGateSatisfied: false,
      currentCycle: null,
      decisionAuthorized: false,
      history: {
        continueCursor: "",
        isDone: true,
        page: [
          {
            acknowledgements: [
              "milestoneCount",
              "budget",
              "scheduleTimeline",
              "builder",
              "accessReviewPolicy",
              "budget",
            ].map((checkpoint, index) => ({
              acknowledgedAt: index + 1,
              acknowledgementId: `ack_${index}`,
              checkpoint,
              sequence: index + 1,
            })),
            assignmentId: "assignment_withdrawn",
            changedCheckpoints: ["budget"],
            checkpoints,
            confirmationCycleId: "cycle_1",
            cycleNumber: 1,
            decision: {
              decidedAt: Date.UTC(2026, 7, 17, 14),
              decisionId: "approval_1",
              reason: "Private lender rationale",
              status: "approved",
            },
            openedAt: Date.UTC(2026, 7, 16, 14),
            proposalRevisionId: "revision_1",
            proposalRevisionNumber: 1,
            status: "approved",
          },
        ],
      },
      lenderNeedsAction: false,
    };

    useQuery
      .mockReturnValueOnce({ assignment: { status: "withdrawn" } })
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(detail)
      .mockReturnValueOnce(confirmation);

    const Component = (Route as any).component;
    render(<Component />);

    expect(useQuery).toHaveBeenNthCalledWith(
      1,
      api.production_proposals.getLenderProposalLifecycleProjection,
      {
        assignmentId: "assignment_withdrawn",
        proposalId: "proposal_withdrawn",
      }
    );
    expect(useQuery).toHaveBeenNthCalledWith(
      4,
      api.production_proposals.getHistoricalLenderProposalDetail,
      {
        assignmentId: "assignment_withdrawn",
        paginationOpts: { cursor: null, numItems: 20 },
        proposalId: "proposal_withdrawn",
      }
    );
    expect(useQuery).toHaveBeenNthCalledWith(
      5,
      api.production_proposals.getHistoricalLenderProposalConfirmation,
      {
        assignmentId: "assignment_withdrawn",
        paginationOpts: { cursor: null, numItems: 20 },
        proposalId: "proposal_withdrawn",
      }
    );
    expect(
      screen.getByRole("heading", { name: "Published revisions" })
    ).toBeTruthy();
    expect(screen.getByText("sealed-schedule-fingerprint")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Lender decisions" })
    ).toBeTruthy();
    expect(screen.getByText(/5 of 5 checkpoints acknowledged/)).toBeTruthy();
    expect(screen.queryByText("Private lender rationale")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Request revision" })
    ).toBeNull();
  });
});

describe("/lender/proposals/$proposalId current lifecycle actions", () => {
  test("wires an eligible lender closing through the supported route", async () => {
    const fixture = currentRouteFixture({
      canActivateClosedProposal: false,
      canRecordClosing: true,
    });
    recordProposalClosing.mockResolvedValue({ closingId: "closing_1" });
    useMutation.mockReset().mockImplementation(() =>
      useMutation.mock.calls.length % 2 === 1
        ? recordProposalClosing
        : activateClosedProposal
    );
    useQuery
      .mockReturnValueOnce(fixture.lifecycle)
      .mockReturnValueOnce(fixture.confirmation)
      .mockReturnValueOnce(fixture.detail)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);

    const Component = (Route as any).component;
    render(<Component />);

    expect(screen.getByText("Current proposal review surface")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Record closing/ }));
    expect(
      (screen.getByLabelText("Loan principal (USD)") as HTMLInputElement).value
    ).toBe("");
    expect(
      (screen.getByLabelText("Build start date") as HTMLInputElement).value
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Loan principal (USD)"), {
      target: { value: "550000" },
    });
    fireEvent.change(screen.getByLabelText("Build start date"), {
      target: { value: "2026-09-10" },
    });
    fireEvent.change(screen.getByLabelText("Build timezone (IANA)"), {
      target: { value: "America/Toronto" },
    });
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Executed lender closing package." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm closing" }));

    await waitFor(() =>
      expect(recordProposalClosing).toHaveBeenCalledWith(
        expect.objectContaining({
          loanFacility: {
            interestAnnualBps: 875,
            principalCents: 55_000_000,
          },
          proposalId: "proposal_withdrawn",
          reason: "Executed lender closing package.",
          workosOrganizationId: "org_lender",
        })
      )
    );
    expect(activateClosedProposal).not.toHaveBeenCalled();
  });

  test("wires separate activation and opens the returned authorized Build", async () => {
    const fixture = currentRouteFixture({
      canActivateClosedProposal: true,
      canRecordClosing: false,
    });
    activateClosedProposal.mockResolvedValue({ buildId: "build_activated" });
    useMutation.mockReset().mockImplementation(() =>
      useMutation.mock.calls.length % 2 === 1
        ? recordProposalClosing
        : activateClosedProposal
    );
    useQuery
      .mockReturnValueOnce(fixture.lifecycle)
      .mockReturnValueOnce(fixture.confirmation)
      .mockReturnValueOnce(fixture.detail)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);

    const Component = (Route as any).component;
    render(<Component />);

    expect(
      screen.queryByRole("button", { name: /Record closing/ })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Activate Build/ }));
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Move the closed proposal into execution." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate Build" }));

    await waitFor(() =>
      expect(activateClosedProposal).toHaveBeenCalledWith({
        proposalId: "proposal_withdrawn",
        reason: "Move the closed proposal into execution.",
        workosOrganizationId: "org_lender",
      })
    );
    expect(navigate).toHaveBeenCalledWith({
      params: { buildId: "build_activated" },
      to: "/lender/builds/$buildId",
    });
  });
});
