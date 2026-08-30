// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { LenderOrganizationDefaultReviewPolicy } from "./LenderOrganizationDefaultReviewPolicy";

const baseline = {
  configuredAt: null,
  configuredByDisplayName: null,
  configuredByRole: null,
  configuredByWorkosUserId: null,
  eligibleCounts: { draw: 1, milestone: 1, proposalReview: 1 },
  lenderOrganizationId: "lender_org_northstar",
  lenderOrganizationName: "Northstar Lending",
  policy: {
    drawApprovalMode: "backoffice_only" as const,
    drawLenderQuorum: null,
    milestoneApprovalMode: "backoffice_only" as const,
    milestoneLenderQuorum: null,
    milestoneReceiptInvoiceRequired: false,
    milestoneSiteVisitRequired: false,
  },
  policyVersionId: null,
  provenance: "system_baseline" as const,
  reason: null,
  validationIssue: null,
  version: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LenderOrganizationDefaultReviewPolicy", () => {
  test("shows immutable version provenance, actor, time, and reason", () => {
    render(
      <LenderOrganizationDefaultReviewPolicy
        defaultReviewPolicy={{
          ...baseline,
          configuredAt: Date.UTC(2026, 7, 25, 16, 0),
          configuredByDisplayName: "Avery Admin",
          configuredByRole: "admin",
          configuredByWorkosUserId: "user_avery",
          policyVersionId: "policy_default_3",
          provenance: "organization_default",
          reason: "Align future assignments with lender review.",
          version: 3,
        } as never}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Default v3").length).toBeGreaterThan(0);
    expect(screen.getByText("Organization default v3")).toBeTruthy();
    expect(screen.getByText("Avery Admin")).toBeTruthy();
    expect(
      screen.getByText(
        "Change reason: Align future assignments with lender review.",
      ),
    ).toBeTruthy();
  });

  test("shows actionable membership drift and prevents a partial save", () => {
    const onSave = vi.fn();
    render(
      <LenderOrganizationDefaultReviewPolicy
        defaultReviewPolicy={{
          ...baseline,
          policy: {
            ...baseline.policy,
            drawApprovalMode: "lender_quorum",
            drawLenderQuorum: 1,
          },
          validationIssue:
            "No approval-eligible lender currently satisfies Draw review.",
        } as never}
        onSave={onSave}
      />,
    );

    expect(
      screen.getByText("Default is not currently satisfiable"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "No approval-eligible lender currently satisfies Draw review.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Save new default version" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("announces a clean server error without the Convex transport prefix", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Uncaught Error: Stale organization review default. Reload the current version and try again.",
        ),
      );
    render(
      <LenderOrganizationDefaultReviewPolicy
        defaultReviewPolicy={baseline as never}
        onSave={onSave}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Receipt / invoice required" }),
    );
    fireEvent.change(screen.getByLabelText("Change reason"), {
      target: { value: "Require cost evidence for future assignments." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save new default version" }),
    );

    expect(
      await screen.findByText(
        "Stale organization review default. Reload the current version and try again.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});
