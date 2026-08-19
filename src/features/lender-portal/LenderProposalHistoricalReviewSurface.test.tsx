// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import type { FunctionReturnType } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { LenderProposalHistoricalReviewSurface } from "./LenderProposalHistoricalReviewSurface";

type HistoricalDetail = FunctionReturnType<
  typeof api.production_proposals.getHistoricalLenderProposalDetail
>;
type HistoricalConfirmation = FunctionReturnType<
  typeof api.production_proposals.getHistoricalLenderProposalConfirmation
>;

afterEach(cleanup);

const detail = {
  assignmentId: "assignment_1",
  capturedAt: Date.UTC(2026, 7, 17, 14, 0),
  decisions: {
    continueCursor: "",
    isDone: true,
    page: [
      {
        approvalId: "approval_1",
        declinedAt: Date.UTC(2026, 7, 16, 14, 0),
        proposalRevisionId: "revision_1",
        proposalRevisionNumber: 1,
        status: "declined",
      },
    ],
  },
  documents: {
    continueCursor: "",
    isDone: false,
    page: [
      {
        createdAt: 1,
        documentId: "document_1",
        documentType: "supporting",
        fileName: "sealed-proposal.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12_000,
        status: "uploaded",
        updatedAt: 1,
      },
    ],
  },
  lifecycle: {
    activation: "inactive",
    backOfficeApproval: "approved",
    capitalSource: "external",
    closing: "pending_closing",
    externalAssignment: "withdrawn",
    lenderConfirmation: "declined",
    proposalState: "approved",
  },
  proposal: {
    buildName: "Juniper Row Homes",
    location: "Toronto, Ontario",
    status: "approved",
  },
  readOnly: true,
  revisions: {
    continueCursor: "",
    isDone: true,
    page: [
      {
        assignmentId: "assignment_1",
        changedCheckpoints: ["scheduleTimeline"],
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
          builder: {
            builderProfileId: "builder_1",
            displayName: "Northstar",
          },
          milestoneCount: { count: 8 },
          scheduleTimeline: {
            milestonesFingerprint: "schedule-1",
            proposedStartDate: "2026-09-01",
            timelineRangeMax: 420,
            timelineRangeMin: 0,
          },
        },
        createdAt: 1,
        revisionId: "revision_1",
        revisionNumber: 1,
        reviewPolicyVersionId: "policy_1",
      },
    ],
  },
} as unknown as HistoricalDetail;

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
          "milestoneCount",
        ].map((checkpoint, index) => ({
          acknowledgedAt: index + 1,
          acknowledgedByRole: index === 5 ? "lender-staff" : "lender-admin",
          acknowledgedByWorkosUserId: index === 5 ? "user_2" : "user_1",
          acknowledgementId: `ack_${index}`,
          checkpoint,
          sequence: index + 1,
        })),
        assignmentId: "assignment_1",
        changedCheckpoints: ["scheduleTimeline"],
        checkpoints: detail.revisions.page[0]?.checkpoints,
        confirmationCycleId: "cycle_1",
        cycleNumber: 1,
        decision: {
          decidedAt: Date.UTC(2026, 7, 16, 14, 0),
          decisionId: "approval_1",
          reason: "The schedule needs an updated start date.",
          status: "declined",
        },
        openedAt: Date.UTC(2026, 7, 15, 14, 0),
        proposalRevisionId: "revision_1",
        proposalRevisionNumber: 1,
        status: "declined",
      },
    ],
  },
  lenderNeedsAction: false,
} as unknown as HistoricalConfirmation;

describe("LenderProposalHistoricalReviewSurface", () => {
  test("renders the sealed assignment record without decision controls", () => {
    const onLoadMore = vi.fn();
    render(
      <LenderProposalHistoricalReviewSurface
        confirmation={confirmation}
        detail={detail}
        onLoadMore={onLoadMore}
      />
    );

    expect(screen.getByText("Historical proposal access")).toBeTruthy();
    expect(screen.getByText("sealed-proposal.pdf")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Published revisions" })
    ).toBeTruthy();
    const revision = screen.getByRole("heading", { name: "Revision 1" });
    expect(revision).toBeTruthy();
    expect(
      screen.getByText(
        (content, element) =>
          element?.tagName === "P" && content.startsWith("Published ")
      )
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Milestone count" })).getByText(
        "8"
      )
    ).toBeTruthy();
    expect(screen.getByText("schedule-1")).toBeTruthy();
    expect(screen.getByText("Northstar")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Lender decisions" })
    ).toBeTruthy();
    expect(screen.getByText(/Recorded /)).toBeTruthy();
    expect(screen.getByText("Cycle 1 · Revision 1")).toBeTruthy();
    expect(screen.getByText(/5 of 5 checkpoints acknowledged/)).toBeTruthy();
    expect(
      screen.queryByText("The schedule needs an updated start date.")
    ).toBeNull();
    expect(screen.queryByText("user_1")).toBeNull();
    expect(screen.queryByText("lender-admin")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Load older assignment history" })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Request revision" })
    ).toBeNull();
  });
});
