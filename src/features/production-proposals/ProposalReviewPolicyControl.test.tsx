// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  type ProposalReviewControlProjection,
  ProposalReviewPolicyControl,
  reviewPolicyIdempotencyKey,
} from "./ProposalReviewPolicyControl";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const backofficePolicy = {
  drawApprovalMode: "backoffice_only" as const,
  drawLenderQuorum: null,
  milestoneApprovalMode: "backoffice_only" as const,
  milestoneLenderQuorum: null,
  milestoneReceiptInvoiceRequired: false,
  milestoneSiteVisitRequired: false,
};

function reviewControl(
  patch: Partial<ProposalReviewControlProjection> = {},
): ProposalReviewControlProjection {
  return {
    currentAssignmentId: "assignment_1",
    currentEligibleLenderApproverCounts: {
      draw: 2,
      milestone: 3,
      proposalReview: 2,
    },
    currentPolicyVersionId: "policy_1",
    currentRevisionId: "revision_2",
    currentRevisionNumber: 2,
    latestLenderReviewedRevisionId: "revision_2",
    latestLenderReviewedRevisionNumber: 2,
    lock: null,
    lockedReviewPolicyId: null,
    policyVersions: [
      {
        policy: backofficePolicy,
        policyVersionId: "policy_1",
        version: 1,
      },
    ],
    revisions: [
      {
        assignmentId: "assignment_1",
        changedCheckpoints: [],
        checkpoints: {
          accessReviewPolicy: backofficePolicy,
          budget: { totalBudgetCents: 50_000_000 },
          builder: {
            builderProfileId: "builder_1",
            displayName: "Northline Builders",
          },
          milestoneCount: { count: 3 },
          scheduleTimeline: {
            milestonesFingerprint: "fingerprint",
            proposedStartDate: "2026-09-01",
            timelineRangeMax: 90,
            timelineRangeMin: 0,
          },
        },
        createdAt: 1,
        priorLenderReviewedRevisionId: null,
        proposalRevisionId: "revision_2",
        revisionNumber: 2,
        reviewPolicyVersionId: "policy_1",
      },
    ],
    ...patch,
  } as unknown as ProposalReviewControlProjection;
}

describe("ProposalReviewPolicyControl", () => {
  test("promotes Variant A groups and saves a policy against the exact live base", async () => {
    const onConfigure = vi.fn().mockResolvedValue({ revisionNumber: 3 });

    render(
      <ProposalReviewPolicyControl
        control={reviewControl()}
        onConfigure={onConfigure}
        onLock={vi.fn()}
        onPublish={vi.fn()}
        proposalId="proposal_1"
        proposalStatus="approved"
      />,
    );

    expect(screen.getAllByText("Milestone review")).toHaveLength(2);
    expect(screen.getAllByText("Draw review")).toHaveLength(2);
    expect(screen.getAllByText("Milestone evidence")).toHaveLength(2);
    expect(screen.getByText("Pre-closing policy summary")).toBeTruthy();
    expect(
      screen.getByText("2 proposal · 3 milestone · 2 draw"),
    ).toBeTruthy();
    expect(
      screen.getByRole("radiogroup", {
        name: "Milestone review requirement",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radiogroup", {
        name: "Draw review requirement",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getAllByRole("radio", { name: /^Both/ })[0]);
    expect(screen.getByLabelText("Lender quorum")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Site visit required" }),
    );
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Require lender and site verification." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));

    await waitFor(() => expect(onConfigure).toHaveBeenCalledTimes(1));
    expect(onConfigure).toHaveBeenCalledWith({
      expectedAssignmentId: "assignment_1",
      expectedProposalRevisionNumber: 2,
      idempotencyKey: expect.stringMatching(
        /^backoffice:review-policy:configure:/,
      ),
      policy: {
        drawApprovalMode: "backoffice_only",
        milestoneApprovalMode: "both",
        milestoneLenderQuorum: 1,
        milestoneReceiptInvoiceRequired: false,
        milestoneSiteVisitRequired: true,
      },
      reason: "Require lender and site verification.",
    });
  });

  test("requires an explicit acknowledgement before immutable lock", async () => {
    const onLock = vi.fn().mockResolvedValue({ policyLockId: "lock_1" });

    render(
      <ProposalReviewPolicyControl
        control={reviewControl()}
        onConfigure={vi.fn()}
        onLock={onLock}
        onPublish={vi.fn()}
        proposalId="proposal_1"
        proposalStatus="approved"
      />,
    );

    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Lock the lender-confirmed closing policy." },
    });
    const lockButton = screen.getByRole("button", { name: "Lock policy" });
    expect((lockButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I understand this policy is immutable after lock/i,
      }),
    );
    expect((lockButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(lockButton);

    await waitFor(() => expect(onLock).toHaveBeenCalledTimes(1));
    expect(onLock).toHaveBeenCalledWith({
      expectedAssignmentId: "assignment_1",
      expectedProposalRevisionNumber: 2,
      idempotencyKey: expect.stringMatching(/^backoffice:review-policy:lock:/),
      reason: "Lock the lender-confirmed closing policy.",
    });
  });

  test("turns stale publication rejection into an actionable inline state", async () => {
    const onPublish = vi.fn().mockRejectedValue(new Error("Stale proposal revision."));

    render(
      <ProposalReviewPolicyControl
        control={reviewControl()}
        onConfigure={vi.fn()}
        onLock={vi.fn()}
        onPublish={onPublish}
        proposalId="proposal_1"
        proposalStatus="approved"
      />,
    );

    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Publish current proposal changes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish revision" }));

    expect(
      await screen.findByText(
        "Stale proposal revision. The policy view has changed; review the live values and try again.",
      ),
    ).toBeTruthy();
  });

  test("renders an immutable read-only policy after lock", () => {
    render(
      <ProposalReviewPolicyControl
        control={reviewControl(
          {
            lock: {
              activeLenderMemberCount: 2,
              assignmentId: "assignment_1",
              eligibleLenderApproverCount: 2,
              eligibleLenderApproverCounts: {
                draw: 2,
                milestone: 3,
                proposalReview: 2,
              },
              lenderOrganizationId: "lender_1",
              lockId: "lock_1",
              lockedAt: 2,
              policy: backofficePolicy,
              policyVersionId: "policy_1",
              proposalRevisionId: "revision_2",
              proposalRevisionNumber: 2,
            },
            lockedReviewPolicyId: "lock_1",
          } as unknown as Partial<ProposalReviewControlProjection>,
        )}
        onConfigure={vi.fn()}
        onLock={vi.fn()}
        onPublish={vi.fn()}
        proposalId="proposal_1"
        proposalStatus="closed"
      />,
    );

    expect(screen.getByText("Locked policy summary")).toBeTruthy();
    expect(screen.queryByLabelText("Audit reason")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save policy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock policy" })).toBeNull();
    expect(
      screen.getAllByRole("radiogroup").every(
        (group) =>
          group.getAttribute("aria-disabled") === "true" ||
          group.hasAttribute("data-disabled"),
      ),
    ).toBe(true);
  });
});

describe("reviewPolicyIdempotencyKey", () => {
  test("is stable for the same command and changes with command values", () => {
    const base = {
      expectedAssignmentId: "assignment_1",
      expectedProposalRevisionNumber: 2,
    };
    const first = reviewPolicyIdempotencyKey({
      base,
      operation: "lock",
      proposalId: "proposal_1",
      reason: "Lock policy.",
    });

    expect(
      reviewPolicyIdempotencyKey({
        base,
        operation: "lock",
        proposalId: "proposal_1",
        reason: "Lock policy.",
      }),
    ).toBe(first);
    expect(
      reviewPolicyIdempotencyKey({
        base,
        operation: "lock",
        proposalId: "proposal_1",
        reason: "Lock a different policy.",
      }),
    ).not.toBe(first);
  });
});
