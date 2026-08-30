// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import type { ProductionProposalDetail } from "../production-proposals/ProductionProposalSurfaces";
import { LenderProposalNotificationReviewSurface } from "./LenderProposalNotificationReviewSurface";

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../production-proposals/ProductionProposalSurfaces", () => ({
  ProductionProposalReviewSurface: ({ approvalStatusSurface }: {
    approvalStatusSurface?: ReactNode;
  }) => <main>{approvalStatusSurface}</main>,
}));

type Confirmation = FunctionReturnType<
  typeof api.production_proposals.getLenderProposalConfirmation
>;

afterEach(cleanup);

const detail = {
  proposal: { _id: "proposal_1", buildName: "Juniper Row Homes" },
} as unknown as ProductionProposalDetail;

const confirmation = {
  canAcknowledge: true,
  canDecide: false,
  closingGateSatisfied: false,
  currentCycle: {
    acknowledgements: [],
    assignmentId: "assignment_1",
    changedCheckpoints: [],
    checkpoints: {
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
        milestonesFingerprint: "schedule-1",
        proposedStartDate: "2026-09-01",
        timelineRangeMax: 420,
        timelineRangeMin: 0,
      },
    },
    confirmationCycleId: "cycle_1",
    cycleNumber: 1,
    decision: null,
    openedAt: 1,
    proposalRevisionId: "revision_1",
    proposalRevisionNumber: 1,
    status: "pending",
  },
  decisionAuthorized: true,
  history: { continueCursor: "", isDone: true, page: [] },
  lenderNeedsAction: true,
} as unknown as Confirmation;

describe("LenderProposalNotificationReviewSurface", () => {
  test("forwards current lender controls to the shared Approval status card", () => {
    render(
      <LenderProposalNotificationReviewSurface
        assignmentStatus="current"
        confirmation={confirmation}
        detail={detail}
        viewerWorkosUserId="user_1"
        workosOrganizationId="workos_lender"
      />
    );

    expect(screen.getByText("Lender confirmation")).toBeTruthy();
    expect(screen.getByText("Revision 1 · cycle 1")).toBeTruthy();
    expect(screen.getByText("Action required")).toBeTruthy();
    expect(screen.getByText("Open lender confirmation")).toBeTruthy();
  });

  test("opens the canonical confirmation sheet from a current notification route", () => {
    render(
      <LenderProposalNotificationReviewSurface
        assignmentStatus="current"
        confirmation={confirmation}
        detail={detail}
        viewerWorkosUserId="user_1"
        workosOrganizationId="workos_lender"
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Lender proposal confirmation" })
    ).toBeTruthy();
    expect(screen.getByText("Revision 1 · cycle 1")).toBeTruthy();
  });

  test("renders a withdrawn assignment as explicit read-only history", () => {
    render(
      <LenderProposalNotificationReviewSurface
        assignmentStatus="withdrawn"
        confirmation={undefined}
        detail={detail}
        viewerWorkosUserId="user_1"
        workosOrganizationId="workos_lender"
      />
    );

    expect(screen.getByText("Historical proposal access")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open lender confirmation" })
    ).toBeNull();
  });
});
