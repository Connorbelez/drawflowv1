// @vitest-environment jsdom

import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { ComponentProps } from "react";
import { useState } from "react";

const useQuery = vi.fn();
const useMutation = vi.fn();
const mutationByName = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => useMutation(reference),
  useQuery: (reference: unknown, args: unknown) => useQuery(reference, args),
}));

vi.mock("../submilestone-scope/ProposalSubmilestoneScopeController.tsx", () => ({
  ProposalSubmilestoneScopeController: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <button
      data-testid="active-build-scope-dirty"
      onClick={() => onDirtyChange?.(true)}
      type="button"
    />
  ),
}));

vi.mock(
  "../submilestone-guidance/ActiveBuildSubmilestoneGuidanceController.tsx",
  () => ({
    ActiveBuildSubmilestoneGuidanceController: ({
      onDirtyChange,
    }: {
      onDirtyChange?: (dirty: boolean) => void;
    }) => (
      <button
        data-testid="active-build-guidance-dirty"
        onClick={() => onDirtyChange?.(true)}
        type="button"
      />
    ),
  }),
);

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BUILD_SUBMILESTONE_DETAIL_TABS,
  type BuildSubmilestoneDetailTab,
} from "../build-detail-targets/buildDetailTab.ts";
import { SubmilestoneDetailSheet } from "./SubmilestoneDetailSheet.tsx";

const buildId = "build-01" as Id<"activeBuilds">;
const submilestoneId = "submilestone-01" as Id<"buildSubmilestones">;
const companionActionItemId = "action-item-01" as Id<"buildActionItems">;
const organizationId = "org-01";

const bootstrapRef =
  api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap;
const collectionRef =
  api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection;
const reviewRef =
  api.build_submilestone_review.getActiveBuildSubmilestoneReview;

function makeBootstrap(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    build: {
      buildId,
      buildName: "Maple House",
      location: "Toronto, ON",
      startDate: "2026-08-01",
      status: "active",
    },
    capabilities: {
      canonical: {
        approveChild: { allowed: false, reason: "Not permitted." },
        retractChildApproval: { allowed: false, reason: "Not permitted." },
        waiveSiteVisit: { allowed: false, reason: "Not permitted." },
      },
      review: {
        recommend: { allowed: false, reason: "Not permitted." },
        requestChanges: { allowed: false, reason: "Not permitted." },
      },
    },
    companion: {
      actionItemId: companionActionItemId,
      currentRevision: 4,
      originatingPostId: "post-01",
    },
    collaboration: { state: "available" },
    evidence: {
      evidenceReviewState: "not_ready",
      itemCount: 0,
      partial: false,
      requirementCount: 2,
      requirements: [],
    },
    execution: {
      actualCostCents: 12_500,
      progressPercent: 40,
    },
    milestone: {
      buildMilestoneId: "milestone-01",
      key: "foundation",
      name: "Foundation",
      planningState: "active",
      status: "in_progress",
    },
    ownership: {
      reason: "Assigned to Northstar Concrete",
      state: "assigned",
    },
    parentReadiness: {
      approvedChildCount: 0,
      childCount: 2,
      partial: false,
      readyForApproval: false,
    },
    persona: "builder",
    review: {
      evidenceReviewState: "not_ready",
      reviewDecisionState: "in_review",
      reviewRound: 1,
    },
    revisions: {
      canonicalWorkflowRevision: 3,
      companionRevision: 4,
      parentReviewRevision: 2,
      reviewRevision: 1,
    },
    schedule: {
      durationDays: 4,
      parentDayEnd: 10,
      parentDayStart: 1,
      startDay: 2,
    },
    state: "visible",
    submilestone: {
      buildSubmilestoneId: submilestoneId,
      key: "footings",
      name: "Footing forms",
      planningState: "active",
      scopeOfWorkTiptapJson: JSON.stringify({ type: "doc" }),
      status: "in_progress",
    },
    ...overrides,
  };
}

function makeCollection(
  collection: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    canonicalWorkflowRevision: 3,
    collection,
    companionActionItemId,
    companionRevision: 4,
    hasMore: false,
    page: [],
    partial: false,
    state: "visible",
    ...overrides,
  };
}

let bootstrap: unknown;
let collectionByName: Record<string, unknown>;
let review: unknown;
let approveChildMutation: ReturnType<typeof vi.fn>;
let recommendMutation: ReturnType<typeof vi.fn>;
let requestChangesMutation: ReturnType<typeof vi.fn>;
let retractChildMutation: ReturnType<typeof vi.fn>;
let scheduleSiteVisitMutation: ReturnType<typeof vi.fn>;
let waiveSiteVisitMutation: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mutationByName.clear();
  approveChildMutation = vi.fn().mockResolvedValue({ status: "approved" });
  recommendMutation = vi.fn().mockResolvedValue({ reviewRound: 2 });
  requestChangesMutation = vi.fn().mockResolvedValue({ status: "changes_requested" });
  retractChildMutation = vi.fn().mockResolvedValue({ status: "reopened" });
  scheduleSiteVisitMutation = vi.fn().mockResolvedValue({ status: "requested" });
  waiveSiteVisitMutation = vi.fn().mockResolvedValue({ status: "waived" });
  mutationByName.set(
    "build_submilestone_review:approveActiveBuildSubmilestone",
    approveChildMutation,
  );
  mutationByName.set(
    "build_submilestone_review:recommendActiveBuildSubmilestoneReview",
    recommendMutation,
  );
  mutationByName.set(
    "build_submilestone_review:requestActiveBuildSubmilestoneChanges",
    requestChangesMutation,
  );
  mutationByName.set(
    "build_submilestone_review:retractActiveBuildSubmilestoneApproval",
    retractChildMutation,
  );
  mutationByName.set(
    "build_submilestone_review:waiveActiveBuildSubmilestoneSiteVisit",
    waiveSiteVisitMutation,
  );
  mutationByName.set(
    "production_proposals:scheduleActiveBuildSiteVisit",
    scheduleSiteVisitMutation,
  );
  useMutation.mockImplementation((reference: never) =>
    mutationByName.get(getFunctionName(reference)) ?? vi.fn().mockResolvedValue({}),
  );
  bootstrap = makeBootstrap();
  review = {
    child: {
      evidenceReviewState: "in_review",
      reviewDecisionState: "in_review",
      reviewRevision: 3,
      reviewRound: 2,
      status: "complete",
    },
    decisions: [
      {
        _creationTime: 1_750_000_000_000,
        _id: "decision-01",
        actorRoles: ["broker"],
        actorWorkosUserId: "reviewer-01",
        brokerageId: "brokerage-01",
        buildId,
        buildMilestoneId: "milestone-01",
        buildSubmilestoneId: submilestoneId,
        createdAt: 1_750_000_000_000,
        idempotencyKey: "decision-01",
        kind: "recommendation",
        milestoneKey: "foundation",
        newState: JSON.stringify({ siteVisitRequired: true }),
        note: "Confirm the footing depth before approval.",
        organizationId,
        priorState: JSON.stringify({ reviewDecisionState: "in_review" }),
        remediation: ["Upload the depth measurement."],
        reviewRound: 2,
        siteVisitRequired: true,
        submilestoneKey: "footings",
        warnings: ["Location could not be verified."],
      },
    ],
    parent: {
      approvedChildCount: 2,
      childCount: 2,
      readyForApproval: true,
      reviewDecisionState: "ready_for_approval",
      reviewRevision: 4,
    },
    siteVisit: {
      currentVisit: null,
      requirement: {
        _creationTime: 1_750_000_000_000,
        _id: "requirement-01",
        brokerageId: "brokerage-01",
        buildId,
        buildMilestoneId: "milestone-01",
        buildSubmilestoneId: submilestoneId,
        createdAt: 1_750_000_000_000,
        evaluatedAt: 1_750_000_000_000,
        manualRequired: true,
        manualSignals: ["Reviewer requested an inspection."],
        milestoneKey: "foundation",
        organizationId,
        policyRequired: false,
        policySignals: [],
        required: true,
        reviewRound: 2,
        riskRequired: true,
        riskSignals: ["Location could not be verified."],
        status: "required",
        submilestoneKey: "footings",
        updatedAt: 1_750_000_000_000,
      },
    },
  };
  collectionByName = {
    collaboration_comments: makeCollection("collaboration_comments"),
    evidence_requirements: makeCollection("evidence_requirements", {
      page: [
        {
          id: "requirement-01",
          kind: "photo",
          required: true,
          requirementKey: "forms-photo",
          title: "Forms photo",
        },
        {
          id: "requirement-02",
          kind: "document",
          required: true,
          requirementKey: "forms-document",
          title: "Forms document",
        },
      ],
    }),
    evidence_assets: makeCollection("evidence_assets"),
    materials: makeCollection("materials"),
    people_assignments: makeCollection("people_assignments"),
    review_decisions: makeCollection("review_decisions"),
  };
  useQuery.mockImplementation((reference: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args === "object" && args !== null && "collection" in args) {
      return collectionByName[(args as { collection: string }).collection];
    }
    if (
      reference === reviewRef ||
      (typeof args === "object" && args !== null && "milestoneKey" in args)
    ) {
      return review;
    }
    return bootstrap;
  });
});

afterEach(cleanup);

function renderSheet(
  props: Partial<ComponentProps<typeof SubmilestoneDetailSheet>> = {},
) {
  return render(
    <SubmilestoneDetailSheet
      buildId={buildId}
      buildSubmilestoneId={submilestoneId}
      companionActionItemId={companionActionItemId}
      onOpenChange={vi.fn()}
      open
      organizationId={organizationId}
      {...props}
    />,
  );
}

describe("SubmilestoneDetailSheet", () => {
  test("keeps the exact six tabs in the shared order", () => {
    renderSheet();

    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.trim().toLowerCase()),
    ).toEqual([
      "overview",
      "evidence",
      "people",
      "materials",
      "collaboration",
      "review",
    ]);
    expect(BUILD_SUBMILESTONE_DETAIL_TABS).toHaveLength(6);
  });

  test.each([
    "admin",
    "broker",
    "broker-staff",
    "builder",
    "builder-staff",
    "contractor",
    "homeowner",
    "principle-broker",
  ] as const)("uses the same shell for the %s persona", (persona) => {
    bootstrap = makeBootstrap({ persona });
    renderSheet({ viewerCapacity: persona });

    expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Review" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Footing forms" })).toBeTruthy();
  });

  test("defaults lender/admin to Review only when review is active", () => {
    bootstrap = makeBootstrap({
      persona: "admin",
      review: {
        evidenceReviewState: "not_ready",
        reviewDecisionState: "in_review",
        reviewRound: 1,
      },
    });
    renderSheet({ viewerCapacity: "admin" });

    expect(
      screen.getByRole("tab", { name: "Review" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      useQuery.mock.calls.some(
        ([reference, args]) =>
          (reference === reviewRef ||
            (typeof args === "object" &&
              args !== null &&
              "milestoneKey" in args)) &&
          typeof args === "object" &&
          args !== null &&
          !('collection' in args),
      ),
    ).toBe(true);
  });

  test("renders canonical child review and opens the parent through typed history without inline parent approval", () => {
    const onOpenTarget = vi.fn();
    bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          approveChild: { allowed: true },
          retractChildApproval: {
            allowed: false,
            reason: "Only an approved child can be retracted.",
          },
          waiveSiteVisit: { allowed: true },
        },
        review: {
          recommend: { allowed: true },
          requestChanges: { allowed: true },
        },
      },
      evidence: {
        evidencePackageRevision: 4,
        evidencePackageStatus: "frozen",
        evidenceReviewState: "in_review",
        itemCount: 3,
        partial: false,
        requirementCount: 3,
        requirements: [],
      },
      persona: "admin",
    });

    renderSheet({ onOpenTarget, selectedTab: "review", viewerCapacity: "admin" });

    expect(screen.getByText("Child review")).toBeTruthy();
    expect(screen.getByText("3 of 3 evidence items")).toBeTruthy();
    expect(screen.getAllByText("Required").length).toBeGreaterThan(0);
    expect(screen.getByText("Location could not be verified.")).toBeTruthy();
    expect(screen.getByText("Confirm the footing depth before approval.")).toBeTruthy();
    expect(screen.getByTestId("submilestone-review-tab")).toBeTruthy();
    expect(
      screen.getByText("Round 2 · Jun 15, 2025, 3:06 p.m."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Order Site Visit" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Approve Sub-milestone" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve Milestone" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Retract Milestone approval" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Review parent Milestone" }),
    );
    expect(onOpenTarget).toHaveBeenCalledWith(
      { kind: "milestone", milestoneId: "milestone-01" },
      { selectedTab: "review" },
    );
  });

  test("executes Staff recommendation and changes-requested commands with canonical child revisions", async () => {
    bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          approveChild: { allowed: false, reason: "Admin only." },
          retractChildApproval: { allowed: false, reason: "Admin only." },
          waiveSiteVisit: { allowed: false, reason: "Admin only." },
        },
        review: {
          recommend: { allowed: true },
          requestChanges: { allowed: true },
        },
      },
      persona: "broker",
    });
    renderSheet({ selectedTab: "review", viewerCapacity: "broker" });

    fireEvent.change(screen.getByRole("textbox", { name: "Reviewer note" }), {
      target: { value: "Recommend after the depth check." },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Require a Site Visit/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Record recommendation" }));
    await waitFor(() => expect(recommendMutation).toHaveBeenCalledTimes(1));
    expect(recommendMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId,
        expectedRevision: 3,
        milestoneKey: "foundation",
        note: "Recommend after the depth check.",
        siteVisitRequired: true,
        submilestoneKey: "footings",
        workosOrganizationId: organizationId,
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("checkbox", { name: /Require a Site Visit/ })
          .getAttribute("aria-checked"),
      ).toBe("false"),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Review reason" }), {
      target: { value: "The depth is not documented." },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Remediation steps" }), {
      target: { value: "Upload the depth measurement.\nConfirm the survey datum." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await waitFor(() => expect(requestChangesMutation).toHaveBeenCalledTimes(1));
    expect(requestChangesMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 3,
        reason: "The depth is not documented.",
        remediation: [
          "Upload the depth measurement.",
          "Confirm the survey datum.",
        ],
      }),
    );
  });

  test("shows the waiver rationale input and records it with the Admin waiver", async () => {
    bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          approveChild: { allowed: false, reason: "Admin only." },
          retractChildApproval: { allowed: false, reason: "Not approved." },
          waiveSiteVisit: { allowed: true },
        },
        review: {
          recommend: { allowed: false, reason: "Admin only." },
          requestChanges: { allowed: false, reason: "Admin only." },
        },
      },
      persona: "admin",
    });
    renderSheet({ selectedTab: "review", viewerCapacity: "admin" });

    fireEvent.change(screen.getByRole("textbox", { name: "Review reason" }), {
      target: { value: "Existing inspection evidence is sufficient." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Waive Site Visit" }));
    await waitFor(() => expect(waiveSiteVisitMutation).toHaveBeenCalledTimes(1));
    expect(waiveSiteVisitMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 3,
        reason: "Existing inspection evidence is sufficient.",
      }),
    );
  });

  test("allows Admin child approval only after the canonical Site Visit gate passes", async () => {
    bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          approveChild: { allowed: true },
          retractChildApproval: { allowed: false, reason: "Not approved." },
          waiveSiteVisit: { allowed: true },
        },
        review: {
          recommend: { allowed: true },
          requestChanges: { allowed: true },
        },
      },
      persona: "admin",
    });
    review = {
      ...(review as Record<string, unknown>),
      siteVisit: {
        currentVisit: null,
        requirement: {
          ...((review as { siteVisit: { requirement: object } }).siteVisit
            .requirement),
          status: "waived",
          waivedAt: 1_750_000_001_000,
          waivedByRole: "admin",
          waivedByWorkosUserId: "admin-01",
          waiverReason: "Existing inspection evidence is sufficient.",
        },
      },
    };
    renderSheet({ selectedTab: "review", viewerCapacity: "admin" });

    expect(screen.queryByRole("button", { name: "Order Site Visit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve Sub-milestone" }));
    await waitFor(() => expect(approveChildMutation).toHaveBeenCalledTimes(1));
    expect(approveChildMutation).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 3 }),
    );
  });

  test("orders and manages the child-scoped Site Visit through the shared preflight", async () => {
    const onReferenceOpen = vi.fn();
    bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          approveChild: { allowed: true },
          retractChildApproval: { allowed: false, reason: "Not approved." },
          waiveSiteVisit: { allowed: true },
        },
        review: {
          recommend: { allowed: true },
          requestChanges: { allowed: true },
        },
      },
      persona: "admin",
    });
    const view = renderSheet({
      onReferenceOpen,
      selectedTab: "review",
      viewerCapacity: "admin",
    });

    fireEvent.click(screen.getByRole("button", { name: "Order Site Visit" }));
    expect(screen.getByRole("dialog", { name: "Configure site visit" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and order site visit" }),
    );
    await waitFor(() => expect(scheduleSiteVisitMutation).toHaveBeenCalledTimes(1));
    expect(scheduleSiteVisitMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId,
        milestoneKey: "foundation",
        requestedDay: 0,
        submilestoneKeys: ["footings"],
        workosOrganizationId: organizationId,
      }),
    );

    review = {
      ...(review as Record<string, unknown>),
      siteVisit: {
        ...((review as { siteVisit: object }).siteVisit),
        currentVisit: {
          _id: "site-visit-01",
          status: "requested",
          visitId: "VISIT-01",
        },
      },
    };
    view.rerender(
      <SubmilestoneDetailSheet
        buildId={buildId}
        buildSubmilestoneId={submilestoneId}
        companionActionItemId={companionActionItemId}
        onOpenChange={vi.fn()}
        onReferenceOpen={onReferenceOpen}
        open
        organizationId={organizationId}
        selectedTab="review"
        viewerCapacity="admin"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage Site Visit" }));
    expect(onReferenceOpen).toHaveBeenCalledWith({
      entityId: "site-visit-01",
      entityKind: "siteVisit",
      href: "siteVisit:site-visit-01",
    });
  });

  test("requires an audited reason for Admin waiver and child approval retraction", async () => {
    bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          approveChild: { allowed: false, reason: "Already approved." },
          retractChildApproval: { allowed: true },
          waiveSiteVisit: { allowed: true },
        },
        review: {
          recommend: { allowed: false, reason: "Already approved." },
          requestChanges: { allowed: false, reason: "Already approved." },
        },
      },
      persona: "admin",
    });
    review = {
      ...(review as Record<string, unknown>),
      child: {
        ...((review as { child: object }).child),
        evidenceReviewState: "approved",
        reviewDecisionState: "approved",
      },
      siteVisit: {
        ...((review as { siteVisit: object }).siteVisit),
        requirement: {
          ...((review as { siteVisit: { requirement: object } }).siteVisit
            .requirement),
          status: "waived",
        },
      },
    };
    renderSheet({ selectedTab: "review", viewerCapacity: "admin" });

    fireEvent.click(screen.getByRole("button", { name: "Retract child approval" }));
    expect(screen.getByRole("alert").textContent).toMatch(/add a reason/i);
    expect(retractChildMutation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Review reason" }), {
      target: { value: "The evidence needs a corrected survey datum." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retract child approval" }));
    await waitFor(() => expect(retractChildMutation).toHaveBeenCalledTimes(1));
    expect(retractChildMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 3,
        reason: "The evidence needs a corrected survey datum.",
      }),
    );
  });

  test("surfaces stale child review conflicts with explicit refresh guidance", async () => {
    const onRetry = vi.fn();
    approveChildMutation.mockRejectedValueOnce(
      new Error(
        JSON.stringify({
          code: "STALE_SUBMILESTONE_REVIEW_REVISION",
          message: "The child review revision is stale.",
        }),
      ),
    );
    bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          approveChild: { allowed: true },
          retractChildApproval: { allowed: false, reason: "Not approved." },
          waiveSiteVisit: { allowed: true },
        },
        review: {
          recommend: { allowed: true },
          requestChanges: { allowed: true },
        },
      },
      persona: "admin",
    });
    review = {
      ...(review as Record<string, unknown>),
      siteVisit: {
        currentVisit: null,
        requirement: {
          ...((review as { siteVisit: { requirement: object } }).siteVisit
            .requirement),
          status: "waived",
        },
      },
    };
    renderSheet({ onRetry, selectedTab: "review", viewerCapacity: "admin" });

    fireEvent.click(screen.getByRole("button", { name: "Approve Sub-milestone" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /newer child or parent review decision.*refresh.*retry/i,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh review" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test.each(["builder", "contractor", "homeowner"] as const)(
    "shows authorized canonical remediation history without lender controls for %s",
    (persona) => {
      bootstrap = makeBootstrap({ persona });
      review = {
        ...(review as Record<string, unknown>),
        child: {
          ...((review as { child: object }).child),
          evidenceReviewState: "changes_requested",
          reviewDecisionState: "changes_requested",
        },
      };
      renderSheet({ selectedTab: "review", viewerCapacity: persona });

      expect(screen.getByText("Confirm the footing depth before approval.")).toBeTruthy();
      expect(screen.getByText("Upload the depth measurement.")).toBeTruthy();
      expect(screen.queryByText("Child review commands")).toBeNull();
      expect(screen.queryByRole("button", { name: "Waive Site Visit" })).toBeNull();
    },
  );

  test("keeps Overview as the default for non-lender personas", () => {
    bootstrap = makeBootstrap({ persona: "builder" });
    renderSheet({ viewerCapacity: "builder" });

    expect(
      screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("guards close once Scope or Guidance is dirty, with keep and discard actions", () => {
    bootstrap = makeBootstrap({
      submilestone: {
        ...(makeBootstrap().submilestone as Record<string, unknown>),
        proposalSubmilestoneId: "proposal-submilestone-1",
      },
    });
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange, viewerCapacity: "builder" });

    fireEvent.click(screen.getByTestId("active-build-scope-dirty"));
    fireEvent.click(screen.getByTestId("active-build-guidance-dirty"));
    fireEvent.click(
      screen.getByRole("button", { name: "Close Sub-milestone detail" }),
    );

    expect(screen.getByTestId("submilestone-detail-unsaved-dialog")).toBeTruthy();
    expect(screen.getByText(/close this Sub-milestone detail/)).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByTestId("submilestone-detail-unsaved-dialog")).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Close Sub-milestone detail" }),
    );
    fireEvent.click(screen.getByTestId("submilestone-detail-unsaved-discard"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("guards active-Build tab navigation and discards the local canonical draft", () => {
    bootstrap = makeBootstrap({
      submilestone: {
        ...makeBootstrap().submilestone,
        proposalSubmilestoneId: "proposal-submilestone-1",
      },
    });
    renderSheet({ viewerCapacity: "builder" });

    fireEvent.click(screen.getByTestId("active-build-scope-dirty"));
    fireEvent.click(screen.getByRole("tab", { name: "Evidence" }));

    expect(screen.getByTestId("submilestone-detail-unsaved-dialog")).toBeTruthy();

    fireEvent.click(screen.getByTestId("submilestone-detail-unsaved-discard"));

    expect(
      screen.getByRole("tab", { name: "Evidence" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("does not infer an active lender review from the bootstrap fallback", () => {
    bootstrap = makeBootstrap({
      persona: "admin",
      review: {
        evidenceReviewState: "not_ready",
        reviewDecisionState: "in_review",
        reviewRound: 0,
      },
    });
    renderSheet({ viewerCapacity: "admin" });

    expect(
      screen.getByRole("tab", { name: "Overview" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
  });

  test("explicit valid selection wins over the persona default", () => {
    bootstrap = makeBootstrap({ persona: "admin" });
    renderSheet({ selectedTab: "materials" });

    expect(
      screen.getByRole("tab", { name: "Materials" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId("submilestone-materials-collection")).toBeTruthy();
  });

  test("keeps canonical tabs readable when the companion is degraded", () => {
    bootstrap = makeBootstrap({
      collaboration: {
        code: "COMPANION_MISSING",
        message: "Collaboration is unavailable.",
        state: "degraded",
      },
      companion: undefined,
    });
    renderSheet({ selectedTab: "materials" });

    expect(screen.getByTestId("submilestone-materials-collection")).toBeTruthy();
    const materialQuery = [...useQuery.mock.calls]
      .map(([, args]) => args)
      .find(
        (args) =>
          typeof args === "object" &&
          args !== null &&
          "collection" in args &&
          args.collection === "materials",
      );
    expect(materialQuery).toMatchObject({ companionActionItemId: undefined });
  });

  test("shows loading, revoked, integrity, and superseded states", () => {
    bootstrap = undefined;
    const loading = renderSheet();
    expect(screen.getByTestId("submilestone-detail-loading")).toBeTruthy();
    loading.unmount();

    bootstrap = { state: "revoked" };
    const revoked = renderSheet();
    expect(screen.getByTestId("submilestone-detail-revoked")).toBeTruthy();
    revoked.unmount();

    bootstrap = {
      code: "COMPANION_MISSING",
      message: "The collaboration companion is unavailable.",
      state: "integrity_error",
    };
    const integrity = renderSheet({ onRetry: vi.fn() });
    expect(screen.getByTestId("submilestone-detail-integrity-error")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry Sub-milestone workspace/ })).toBeTruthy();
    integrity.unmount();

    bootstrap = makeBootstrap({
      state: "superseded",
      submilestone: {
        ...makeBootstrap().submilestone,
        planningState: "superseded",
        status: "complete",
      },
    });
    renderSheet({ readOnly: false });
    expect(
      screen.getByTestId("submilestone-detail-superseded").textContent,
    ).toMatch(/Superseded.*read-only/i);
  });

  test("keeps the desktop inset and narrow full-screen responsive contract", () => {
    renderSheet();
    const popup = document.querySelector('[data-slot="sheet-popup"]');
    expect(popup?.className).toContain("max-sm:h-svh");
    expect(popup?.className).toContain("max-sm:w-full");
    expect(popup?.className).toContain("min-w-0");
    expect(popup?.className).toContain("overflow-x-hidden");
    expect(popup?.className).toContain("motion-reduce:transition-none");
    expect(popup?.className).toContain("sm:w-[min(52rem,calc(100vw-2rem))]");
    expect(popup?.className).toContain("sm:max-w-[52rem]");
  });

  test("groups overview metrics in a description list", () => {
    renderSheet();
    const progressTerm = screen.getByText("Progress");
    expect(progressTerm.tagName).toBe("DT");
    const metrics = progressTerm.closest("dl");
    expect(metrics).toBeTruthy();
    expect(metrics?.querySelector("dd")?.tagName).toBe("DD");
  });

  test("uses a modal dialog with focus return and keyboard navigation semantics", async () => {
    const onOpenChange = vi.fn();
    const onGoBack = vi.fn();
    const onGoForward = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const triggerRef = { current: trigger };
    function ControlledSheet() {
      const [open, setOpen] = useState(true);
      return (
        <SubmilestoneDetailSheet
          buildId={buildId}
          buildSubmilestoneId={submilestoneId}
          canGoBack
          canGoForward
          companionActionItemId={companionActionItemId}
          finalFocus={triggerRef}
          initialFocus={false}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen);
            setOpen(nextOpen);
          }}
          open={open}
          organizationId={organizationId}
        />
      );
    }
    render(<ControlledSheet />);

    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(screen.getByRole("dialog"), {
      altKey: true,
      key: "ArrowLeft",
    });
    fireEvent.keyDown(screen.getByRole("dialog"), {
      altKey: true,
      key: "ArrowRight",
    });
    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(onGoForward).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog"), {
      altKey: true,
      ctrlKey: true,
      key: "ArrowLeft",
    });
    expect(onGoBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close Sub-milestone detail" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    trigger.remove();
  });

  test("contains disabled history shortcuts without claiming modified chords", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog");
    const disabledHistory = createEvent.keyDown(dialog, {
      altKey: true,
      key: "ArrowLeft",
    });
    fireEvent(dialog, disabledHistory);
    expect(disabledHistory.defaultPrevented).toBe(true);

    const modifiedChord = createEvent.keyDown(dialog, {
      altKey: true,
      key: "ArrowLeft",
      metaKey: true,
    });
    fireEvent(dialog, modifiedChord);
    expect(modifiedChord.defaultPrevented).toBe(false);
  });

  test("queries only the selected collection and presents bounded page metadata", async () => {
    const onSelectedTabChange = vi.fn();
    collectionByName.evidence_assets = makeCollection("evidence_assets", {
      hasMore: true,
      nextCursor: "cursor-2",
      page: [
        {
          id: "asset-01",
          kind: "photo",
          locationVerified: false,
          title: "Footing photo",
        },
      ],
      partial: true,
    });
    const defaultQueryImplementation = useQuery.getMockImplementation();
    useQuery.mockImplementation((reference: unknown, args: unknown) => {
      if (
        typeof args === "object" &&
        args !== null &&
        "cursor" in args &&
        args.cursor === "cursor-2"
      ) {
        return makeCollection("evidence_assets", {
          page: [
            {
              id: "asset-02",
              kind: "document",
              title: "Engineer letter",
            },
          ],
        });
      }
      return defaultQueryImplementation?.(reference, args);
    });
    const view = renderSheet({ onSelectedTabChange });

    const initialCollectionCalls = useQuery.mock.calls.filter(
      ([, args]) => args === "skip",
    );
    expect(initialCollectionCalls.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "Evidence" }));
    await waitFor(() =>
      expect(screen.getByTestId("submilestone-evidence-collection")).toBeTruthy(),
    );
    expect(onSelectedTabChange).toHaveBeenCalledWith("evidence");
    expect(screen.getByText("More records are available.")).toBeTruthy();
    expect(screen.getByText("Location unverified")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Load more Evidence" }),
    );
    await waitFor(() => expect(screen.getByText("Engineer letter")).toBeTruthy());
    expect(screen.getByText("Footing photo")).toBeTruthy();
    expect(
      useQuery.mock.calls.some(
        ([, args]) =>
          typeof args === "object" &&
          args !== null &&
          "cursor" in args &&
          args.cursor === "cursor-2",
      ),
    ).toBe(true);
    expect(
      useQuery.mock.calls.some(
        ([, args]) =>
          typeof args === "object" &&
          args !== null &&
          "collection" in args &&
          args.collection === "evidence_assets",
      ),
    ).toBe(true);

    const sharedProps = {
      buildId,
      buildSubmilestoneId: submilestoneId,
      companionActionItemId,
      onOpenChange: vi.fn(),
      organizationId,
      selectedTab: "evidence" as const,
    };
    view.rerender(<SubmilestoneDetailSheet {...sharedProps} open={false} />);
    view.rerender(<SubmilestoneDetailSheet {...sharedProps} open />);
    await waitFor(() => expect(screen.getByText("Footing photo")).toBeTruthy());
    expect(screen.queryByText("Engineer letter")).toBeNull();
    expect(
      [...useQuery.mock.calls]
        .reverse()
        .find(
          ([, args]) =>
            typeof args === "object" &&
            args !== null &&
            "collection" in args &&
            args.collection === "evidence_assets",
        )?.[1],
    ).toMatchObject({ cursor: undefined });

    collectionByName.evidence_assets = makeCollection("evidence_assets", {
      page: [{ id: "asset-new", title: "Replacement scope evidence" }],
    });
    view.rerender(
      <SubmilestoneDetailSheet
        buildId={buildId}
        buildSubmilestoneId={"submilestone-02" as Id<"buildSubmilestones">}
        companionActionItemId={companionActionItemId}
        onOpenChange={vi.fn()}
        open
        organizationId={organizationId}
        selectedTab="evidence"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Replacement scope evidence")).toBeTruthy(),
    );
    expect(screen.queryByText("Footing photo")).toBeNull();
    expect(screen.queryByText("Engineer letter")).toBeNull();
  });

  test("fails closed for revoked and integrity-error tab collections", () => {
    collectionByName.evidence_assets = { state: "revoked" };
    const revoked = renderSheet({ selectedTab: "evidence" });
    expect(
      screen.getByText(
        "This collection is unavailable for the current Build access.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("submilestone-evidence-loading"),
    ).toBeNull();
    revoked.unmount();

    collectionByName.evidence_assets = {
      code: "COMPANION_REVISION_MISMATCH",
      message: "Refresh the canonical workspace before retrying.",
      state: "integrity_error",
    };
    renderSheet({ selectedTab: "evidence" });
    expect(screen.getByRole("alert").textContent).toContain(
      "Refresh the canonical workspace before retrying.",
    );
    expect(
      screen.queryByTestId("submilestone-evidence-loading"),
    ).toBeNull();
  });
});
