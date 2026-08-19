// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { MilestoneSheetData } from "#/features/backoffice-build-detail/MilestoneDetailSheet.tsx";

const useQueryMock = vi.hoisted(() => vi.fn());
const decideMock = vi.hoisted(() => vi.fn());
const drawSheetPropsMock = vi.hoisted(() => vi.fn());
const milestoneSheetPropsMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: () => decideMock,
  useQuery: useQueryMock,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("#/features/draw-workflow/DrawReviewSheet.tsx", () => ({
  DrawReviewSheet: (props: {
    actionItems?: ReactNode;
    actions: ReactNode;
    historyNavigation?: ReactNode;
  }) => {
    drawSheetPropsMock(props);
    return (
      <section aria-label="Draw review">
        {props.actions}
        {props.actionItems}
        {props.historyNavigation}
      </section>
    );
  },
}));

vi.mock(
  "#/features/backoffice-build-detail/MilestoneDetailSheet.tsx",
  () => ({
    MilestoneDetailSheet: (props: {
      footer?: ReactNode;
      reviewLayer: ReactNode;
    }) => {
      milestoneSheetPropsMock(props);
      return (
        <section aria-label="Milestone review">
          {props.reviewLayer}
          {props.footer}
        </section>
      );
    },
  })
);

import {
  BackofficeNotificationReviewSurface,
  BuilderNotificationReviewSurface,
  LenderNotificationReviewSurface,
  LenderReviewSurface,
} from "./LenderNotificationReviewSurface.tsx";

const currentDetail = {
  buildId: "build_1",
  buildName: "Harbourline Residences",
  currentCycle: {
    cycleId: "cycle_1",
    cycleNumber: 1,
    decisions: [],
    evidenceReferences: [],
    requirements: {
      approvalMode: "lender_quorum",
      lenderQuorum: 1,
      receiptInvoiceRequired: false,
      requiredGroups: ["lender"],
      siteVisitRequired: false,
    },
    state: "in_review",
    submission: {
      amountCents: 1_000_000,
      displayId: "DRAW-01",
      drawRequestId: "draw_1",
      kind: "draw",
      label: "Foundation reimbursement",
      note: null,
      requestedAt: "2026-08-15T12:00:00.000Z",
      requestKey: "draw-01",
    },
    submittedAt: Date.parse("2026-08-15T12:00:00.000Z"),
  },
  currentCycleNumber: 1,
  cycles: { continueCursor: "", isDone: true, page: [] },
  targetAvailability: "available",
  viewerActionState: "needs_action",
  viewerDecision: null,
};

const buildDetail = {
  build: {
    buildId: "build_1",
    buildName: "Harbourline Residences",
    location: "Hamilton, ON",
    startDate: "2026-08-01",
  },
  builder: { displayName: "Northstar Builder" },
  collaboration: [],
  draws: [
    {
      actionItems: [],
      drawRequestId: "draw_1",
      fundingPosition: {
        availableBeforeCents: 2_000_000,
        reconciled: true,
        remainingAfterCents: 1_000_000,
      },
    },
  ],
  funding: { approvedMilestoneCents: 3_000_000, releasedCents: 500_000 },
  milestones: [],
};

const backofficeMilestoneData: MilestoneSheetData = {
  column: "Back Office review",
  contractors: [{ initials: "CC", name: "Concrete Co", role: "Concrete" }],
  milestoneKey: "foundation",
  name: "Foundation",
  recentEvents: [],
  status: "complete",
  submilestones: [
    {
      budgetCents: 1_000_000,
      evidence: [
        {
          createdAt: Date.parse("2026-08-15T12:00:00.000Z"),
          fileName: "footings.jpg",
          label: "Footings evidence",
          locationVerified: true,
          mimeType: "image/jpeg",
          sizeBytes: 2048,
          source: "evidence_package",
          tag: "completion",
        },
      ],
      key: "footings",
      name: "Footings",
      order: 1,
      status: "complete",
      submilestoneId: "sub_1" as never,
    },
  ],
};

const backofficeSiteVisits = {
  visits: [
    {
      buildId: "build_1",
      completedAt: "2026-08-16T12:00:00.000Z",
      milestoneKey: "foundation",
      photos: [
        {
          fileName: "inspection.jpg",
          locationVerified: true,
          mimeType: "image/jpeg",
          sizeBytes: 4096,
        },
      ],
      recordNote: "Foundation placement verified.",
      requestedAt: "2026-08-15T12:00:00.000Z",
      status: "complete",
      visitId: "VISIT-01",
    },
  ],
} as never;

function mockNotificationQueries(
  detail: unknown = currentDetail,
  evidence: unknown = { files: [] },
  build: unknown = buildDetail
) {
  useQueryMock
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce(detail)
    .mockReturnValueOnce(evidence)
    .mockReturnValueOnce(build);
}

function mockOrdinaryQueries(
  detail: unknown = currentDetail,
  evidence: unknown = { files: [] },
  build: unknown = buildDetail
) {
  useQueryMock
    .mockReturnValueOnce(detail)
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce(evidence)
    .mockReturnValueOnce(build);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderLenderReview() {
  return render(
    <LenderNotificationReviewSurface
      onClose={vi.fn()}
      reviewCycleId="cycle_1"
      reviewCycleNumber={1}
      target={{ drawRequestId: "draw_1", kind: "draw" }}
      viewerWorkosUserId="user_lender"
    />
  );
}

describe("LenderNotificationReviewSurface decision capability", () => {
  test("keeps canonical final-decision actions functional for an eligible lender", async () => {
    mockNotificationQueries();
    decideMock.mockResolvedValue({});
    renderLenderReview();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(decideMock).toHaveBeenCalledTimes(1));
    expect(decideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "approved",
        expectedCycleNumber: 1,
        target: { drawRequestId: "draw_1", kind: "draw" },
      })
    );
  });

  test("renders an authorized but ineligible lender as read-only", () => {
    mockNotificationQueries({
      ...currentDetail,
      viewerActionState: "ineligible",
    });
    renderLenderReview();

    expect(screen.getByText("Waiting for an eligible lender")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Request revision" })
    ).toBeNull();
  });

  test("loads ordinary detail and exact-cycle evidence without notification correlation", () => {
    mockOrdinaryQueries(
      {
        ...currentDetail,
        currentCycle: { ...currentDetail.currentCycle, cycleId: "cycle_1" },
      },
      {
        files: [
          {
            downloadUrl: "https://files.example/evidence.pdf",
            fileName: "foundation-evidence.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
          },
        ],
      }
    );

    render(
      <LenderReviewSurface
        onClose={vi.fn()}
        target={{ drawRequestId: "draw_1", kind: "draw" }}
        viewerWorkosUserId="user_lender"
      />
    );

    expect(screen.getByText("Current-cycle evidence")).toBeTruthy();
    expect(screen.getByText("foundation-evidence.pdf")).toBeTruthy();
    expect(useQueryMock.mock.calls[0]?.[1]).toEqual({
      historyPaginationOpts: { cursor: null, numItems: 20 },
      target: { drawRequestId: "draw_1", kind: "draw" },
    });
    expect(useQueryMock.mock.calls[2]?.[1]).toEqual({
      cycleId: "cycle_1",
      target: { drawRequestId: "draw_1", kind: "draw" },
    });
    expect(useQueryMock.mock.calls[3]?.[1]).toEqual({ buildId: "build_1" });
  });

  test("adapts canonical Draw funding, evidence, collaboration, and history into the shared sheet", () => {
    const decision = {
      actorRole: "lender",
      actorWorkosUserId: "private-user-id",
      countsTowardCurrentApproval: true,
      createdAt: Date.parse("2026-08-16T12:00:00.000Z"),
      decision: "approved",
      decisionId: "decision_1",
      group: "lender",
      privateRationale: "PRIVATE_RATIONALE",
      revisionInstructions: null,
    };
    mockNotificationQueries(
      {
        ...currentDetail,
        currentCycle: {
          ...currentDetail.currentCycle,
          decisions: [decision],
          evidenceReferences: [
            {
              amountCents: 750_000,
              costDocumentId: "cost_1",
              currency: "CAD",
              documentKind: "invoice",
              kind: "cost_document",
              label: "Foundation invoice",
              milestoneKey: "foundation",
            },
          ],
        },
        cycles: { page: [{ ...currentDetail.currentCycle, decisions: [decision] }] },
      },
      {
        files: [
          {
            downloadUrl: "https://files.example/child-visit.jpg",
            fileName: "child-visit.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 3072,
          },
          {
            downloadUrl: "https://files.example/whole-milestone.jpg",
            fileName: "whole-milestone.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 4096,
          },
        ],
      },
      {
        ...buildDetail,
        draws: [
          {
            ...buildDetail.draws[0],
            actionItems: [
              {
                actionItemId: "action_1",
                status: "in_progress",
                title: "Confirm roofing invoice tax breakdown",
                updatedAt: Date.parse("2026-08-16T11:00:00.000Z"),
              },
            ],
          },
        ],
        collaboration: [
          {
            body: "Builder update",
            postId: "post_1",
            primaryReferenceId: "draw_1",
            primaryReferenceKind: "draw",
            publishedAt: Date.parse("2026-08-15T13:00:00.000Z"),
            sourceLabel: "Builder team",
          },
        ],
      }
    );

    renderLenderReview();

    const props = drawSheetPropsMock.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      builder: { displayName: "Northstar Builder" },
      funding: {
        availableAfterRequestCents: 1_000_000,
        drawAvailabilityCents: 2_000_000,
        drawnCents: 500_000,
        receiptCoverageCents: 750_000,
        totalApprovedCents: 3_000_000,
      },
      location: "Hamilton, ON",
    });
    expect(props.evidence).toEqual([
      expect.objectContaining({
        amountLabel: "$7,500.00",
        label: "Foundation invoice",
        type: "invoice",
      }),
    ]);
    expect(props.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: "Lender",
          title: "Cycle 1 approved",
        }),
      ])
    );
    const lenderVisibleProjection = JSON.stringify({
      details: props.details,
      evidence: props.evidence,
      history: props.history,
      privateDetails: props.privateDetails,
    });
    expect(lenderVisibleProjection).not.toContain("PRIVATE_RATIONALE");
    expect(lenderVisibleProjection).not.toContain("private-user-id");
    expect(props.collaborationAction).toBeTruthy();
    expect(props.actionItems).toBeTruthy();
    expect(
      screen.getByText("Confirm roofing invoice tax breakdown")
    ).toBeTruthy();
  });

  test("keeps absent cost-document coverage unavailable", () => {
    mockNotificationQueries();
    renderLenderReview();

    const props = drawSheetPropsMock.mock.calls.at(-1)?.[0];
    expect(props.funding.receiptCoverageCents).toBeUndefined();
  });

  test("adapts canonical Milestone children, receipts, Site Visit, evidence, collaboration, and history", () => {
    const milestoneSubmission = {
      actualCostCents: 750_000,
      completedDay: 12,
      kind: "milestone",
      milestoneId: "milestone_1",
      milestoneKey: "foundation",
      milestoneName: "Foundation",
      note: null,
      progressPercent: 100,
      submittedAt: "2026-08-15T12:00:00.000Z",
    };
    mockNotificationQueries(
      {
        ...currentDetail,
        currentCycle: {
          ...currentDetail.currentCycle,
          requirements: {
            approvalMode: "both",
            lenderQuorum: 1,
            receiptInvoiceRequired: true,
            requiredGroups: ["backoffice", "lender"],
            siteVisitRequired: true,
          },
          submission: milestoneSubmission,
        },
        cycles: { page: [] },
      },
      {
        files: [
          {
            downloadUrl: "https://files.example/child-visit.jpg",
            fileName: "child-visit.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 3072,
          },
          {
            downloadUrl: "https://files.example/whole-milestone.jpg",
            fileName: "whole-milestone.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 4096,
          },
        ],
      },
      {
        ...buildDetail,
        collaboration: [
          {
            body: "Footings complete",
            postId: "post_1",
            primaryReferenceId: "milestone_1",
            primaryReferenceKind: "milestone",
            publishedAt: Date.parse("2026-08-15T13:00:00.000Z"),
            sourceLabel: "Builder team",
          },
        ],
        milestones: [
          {
            actualStartedAt: null,
            budgetCents: 1_000_000,
            buildMilestoneId: "milestone_1",
            contractors: [
              {
                contractorId: "contractor_1",
                name: "Concrete Co",
                role: "Concrete",
                status: "active",
              },
            ],
            dayStart: 1,
            key: "foundation",
            name: "Foundation",
            plannedEndDate: "2026-08-12",
            plannedStartDate: "2026-08-02",
            receiptCoverage: {
              documents: [
                {
                  allocations: [
                    {
                      amountCents: 750_000,
                      buildSubmilestoneId: "sub_1",
                    },
                  ],
                  costDocumentId: "cost_1",
                  kind: "invoice",
                  label: "Concrete invoice",
                  pages: [
                    {
                      assetId: "asset_1",
                      downloadUrl: "https://files.example/invoice.pdf",
                      fileName: "invoice.pdf",
                      mimeType: "application/pdf",
                    },
                  ],
                  subtotalCents: 700_000,
                  taxCents: 50_000,
                },
              ],
            },
            reviewEvidence: [
              {
                downloadUrl: "https://files.example/photo.jpg",
                evidenceAssetId: "evidence_1",
                fileName: "photo.jpg",
                label: "Footings photo",
                locationVerified: true,
                mimeType: "image/jpeg",
                sizeBytes: 2048,
                siteVisitId: null,
                source: "evidence_package",
                submilestoneKey: "footings",
              },
              {
                downloadUrl: "https://files.example/child-visit.jpg",
                evidenceAssetId: "evidence_child_visit",
                fileName: "child-visit.jpg",
                label: "Footings Site Visit photo",
                locationVerified: true,
                mimeType: "image/jpeg",
                sizeBytes: 3072,
                siteVisitId: "visit_1",
                source: "site_visit",
                submilestoneKey: null,
              },
              {
                downloadUrl: "https://files.example/whole-milestone.jpg",
                evidenceAssetId: "evidence_whole",
                fileName: "whole-milestone.jpg",
                label: "Whole Milestone Site Visit photo",
                locationVerified: false,
                mimeType: "image/jpeg",
                sizeBytes: 4096,
                siteVisitId: "visit_2",
                source: "site_visit",
                submilestoneKey: null,
              },
            ],
            siteVisit: {
              completedAt: "2026-08-16T12:00:00.000Z",
              photoCount: 1,
              report: "Verified",
              requestedAt: "2026-08-15T12:00:00.000Z",
              siteVisitId: "visit_1",
              submilestoneId: "sub_1",
            },
            siteVisits: [
              {
                completedAt: "2026-08-16T12:00:00.000Z",
                photoCount: 1,
                report: "Verified",
                requestedAt: "2026-08-15T12:00:00.000Z",
                requestedDay: 15,
                siteVisitId: "visit_1",
                submilestoneId: "sub_1",
                tokenExpiresAt: Date.parse("2026-08-16T13:00:00.000Z"),
                tokenOpenedAt: Date.parse("2026-08-16T11:00:00.000Z"),
                updatedAt: Date.parse("2026-08-16T12:00:00.000Z"),
                visitId: "VISIT-01",
              },
              {
                completedAt: "2026-08-17T12:00:00.000Z",
                photoCount: 1,
                report: "Whole Milestone verified",
                requestedAt: "2026-08-17T10:00:00.000Z",
                requestedDay: 16,
                siteVisitId: "visit_2",
                submilestoneId: null,
                tokenExpiresAt: Date.parse("2026-08-17T13:00:00.000Z"),
                tokenOpenedAt: null,
                updatedAt: Date.parse("2026-08-17T12:00:00.000Z"),
                visitId: "VISIT-02",
              },
            ],
            status: "complete",
            submilestones: [
              {
                actualCostCents: 750_000,
                actualStartedAt: null,
                assignments: [
                  {
                    contractorId: "contractor_1",
                    name: "Concrete Co",
                    role: "Concrete",
                    status: "active",
                  },
                ],
                budgetCents: 1_000_000,
                completedAt: Date.parse("2026-08-16T12:00:00.000Z"),
                description: "",
                durationDays: 4,
                key: "footings",
                name: "Footings",
                order: 1,
                progressPercent: 100,
                startDay: 1,
                status: "complete",
                submilestoneId: "sub_1",
              },
            ],
          },
        ],
      }
    );

    render(
      <LenderNotificationReviewSurface
        onClose={vi.fn()}
        reviewCycleId="cycle_1"
        reviewCycleNumber={1}
        target={{ kind: "milestone", milestoneId: "milestone_1" }}
        viewerWorkosUserId="user_lender"
      />
    );

    const props = milestoneSheetPropsMock.mock.calls.at(-1)?.[0];
    expect(props.data).toMatchObject({
      contractors: [
        { initials: "CC", name: "Concrete Co", role: "Concrete" },
      ],
      milestoneKey: "foundation",
      submilestones: [
        {
          assignments: [expect.objectContaining({ name: "Concrete Co" })],
          costDocuments: [
            expect.objectContaining({
              allocationAmountCents: 750_000,
              title: "Concrete invoice",
            }),
          ],
          evidence: [
            expect.objectContaining({ label: "Footings photo" }),
            expect.objectContaining({ label: "Footings Site Visit photo" }),
          ],
          siteVisits: [expect.objectContaining({ visitId: "VISIT-01" })],
        },
      ],
    });
    expect(props.data.drawGroupKey).toBeUndefined();
    expect(props.data.submilestones[0].evidence).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Whole Milestone Site Visit photo" }),
      ])
    );
    expect(props.siteVisits.visits).toEqual([
      expect.objectContaining({
        recordNote: "Verified",
        visitId: "VISIT-01",
      }),
      expect.objectContaining({
        recordNote: "Whole Milestone verified",
        visitId: "VISIT-02",
      }),
    ]);
    expect(props.showSiteVisitFieldLink).toBe(false);
    expect(screen.getByText("Milestone review policy")).toBeTruthy();
    expect(screen.getByText("child-visit.jpg")).toBeTruthy();
    expect(screen.getByText("whole-milestone.jpg")).toBeTruthy();
    expect(screen.getByText("Site Visit").parentElement?.textContent).toContain(
      "Required"
    );
    expect(props.data.recentEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Cycle 1 submitted" }),
      ])
    );
    expect(props.collaboration).toBeTruthy();
  });

  test("renders canonical Back Office Milestone detail, Site Visits, review evidence, and locked requirements", () => {
    const milestoneDetail = {
      ...currentDetail,
      currentCycle: {
        ...currentDetail.currentCycle,
        requirements: {
          approvalMode: "both",
          lenderQuorum: 1,
          receiptInvoiceRequired: true,
          requiredGroups: ["backoffice", "lender"],
          siteVisitRequired: true,
        },
        submission: {
          actualCostCents: 750_000,
          completedDay: 12,
          kind: "milestone",
          milestoneId: "milestone_1",
          milestoneKey: "foundation",
          milestoneName: "Foundation",
          note: null,
          progressPercent: 100,
          submittedAt: "2026-08-15T12:00:00.000Z",
        },
      },
    };
    useQueryMock
      .mockReturnValueOnce(milestoneDetail)
      .mockReturnValueOnce({
        files: [
          {
            downloadUrl: "https://files.example/backoffice-evidence.jpg",
            fileName: "backoffice-evidence.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 2048,
          },
        ],
      });

    render(
      <BackofficeNotificationReviewSurface
        milestoneData={backofficeMilestoneData}
        milestoneSiteVisits={backofficeSiteVisits}
        onClose={vi.fn()}
        reviewCycleId="cycle_1"
        reviewCycleNumber={1}
        target={{ kind: "milestone", milestoneId: "milestone_1" }}
        viewerWorkosUserId="user_admin"
        workosOrganizationId="org_backoffice"
      />
    );

    const props = milestoneSheetPropsMock.mock.calls.at(-1)?.[0];
    expect(props.data).toMatchObject({
      contractors: [{ name: "Concrete Co" }],
      milestoneKey: "foundation",
      submilestones: [
        expect.objectContaining({
          evidence: [expect.objectContaining({ label: "Footings evidence" })],
          name: "Footings",
        }),
      ],
    });
    expect(props.siteVisits).toBe(backofficeSiteVisits);
    expect(props.showSiteVisitFieldLink).toBe(true);
    expect(screen.getByText("Milestone review policy")).toBeTruthy();
    expect(screen.getByText("backoffice-evidence.jpg")).toBeTruthy();
    expect(screen.getByText("Site Visit").parentElement?.textContent).toContain(
      "Required"
    );
    expect(useQueryMock.mock.calls[1]?.[1]).toEqual({
      cycleId: "cycle_1",
      target: { kind: "milestone", milestoneId: "milestone_1" },
      workosOrganizationId: "org_backoffice",
    });
  });

  test("renders locked Builder Milestone correction and resubmits the same request into N+1", async () => {
    const onOpenBuild = vi.fn();
    const onResubmitted = vi.fn();
    decideMock.mockResolvedValueOnce({
      cycleId: "cycle_2",
      cycleNumber: 2,
      replayed: false,
      requestIdentity: "milestone:milestone_1",
      state: "in_review",
    });
    useQueryMock.mockReturnValueOnce({
      ...currentDetail,
      buildName: undefined,
      canResubmit: true,
      currentCycle: {
        ...currentDetail.currentCycle,
        decisions: undefined,
        evidenceReferences: [
          {
            amountCents: 750_000,
            costDocumentId: "cost_document_1",
            currency: "CAD",
            documentKind: "invoice",
            kind: "cost_document",
            label: "Foundation invoice",
            milestoneKey: "foundation",
          },
          {
            completedAt: "2026-08-14T12:00:00.000Z",
            kind: "site_visit",
            label: "Foundation Site Visit report",
            milestoneKey: "foundation",
            report: "Footings verified.",
            siteVisitId: "site_visit_1",
          },
        ],
        requirements: {
          approvalMode: "both_groups",
          lenderQuorum: 1,
          receiptInvoiceRequired: true,
          requiredGroups: ["backoffice", "lender"],
          siteVisitRequired: true,
        },
        state: "correction_required",
        submission: {
          actualCostCents: 750_000,
          completedDay: 12,
          kind: "milestone",
          milestoneId: "milestone_1",
          milestoneKey: "foundation",
          milestoneName: "Foundation",
          note: null,
          progressPercent: 100,
          submittedAt: "2026-08-15T12:00:00.000Z",
        },
      },
      currentCycleNumber: 1,
      eligibility: {
        canSubmit: true,
        reason: "eligible_for_resubmission",
      },
      history: {
        continueCursor: "",
        isDone: true,
        page: [
          {
            cycleNumber: 1,
            evidenceReferences: [],
            requirements: {
              approvalMode: "both_groups",
              lenderQuorum: 1,
              receiptInvoiceRequired: true,
              requiredGroups: ["backoffice", "lender"],
              siteVisitRequired: true,
            },
            state: "correction_required",
            submission: {
              actualCostCents: 750_000,
              completedDay: 12,
              kind: "milestone",
              milestoneId: "milestone_1",
              milestoneKey: "foundation",
              milestoneName: "Foundation",
              note: null,
              progressPercent: 100,
              submittedAt: "2026-08-15T12:00:00.000Z",
            },
            submittedAt: Date.parse("2026-08-15T12:00:00.000Z"),
          },
        ],
      },
      kind: "milestone",
      notice: {
        body: "Add the missing cost evidence before resubmitting.",
        title: "Needs revision",
      },
      requestIdentity: "milestone:milestone_1",
      revisionInstructions:
        "Add the missing cost evidence before resubmitting.",
      state: "correction_required",
      cycles: undefined,
      viewerActionState: undefined,
    });

    render(
      <BuilderNotificationReviewSurface
        onClose={vi.fn()}
        onOpenBuild={onOpenBuild}
        onResubmitted={onResubmitted}
        reviewCycleId="cycle_1"
        reviewCycleNumber={1}
        target={{ kind: "milestone", milestoneId: "milestone_1" }}
        viewerWorkosUserId="user_builder"
        workosOrganizationId="org_builder"
      />
    );

    const props = milestoneSheetPropsMock.mock.calls.at(-1)?.[0];
    expect(props.data).toMatchObject({
      column: "Needs revision",
      contractors: [],
      milestoneKey: "foundation",
      status: "needs_revision",
      submilestones: [],
    });
    expect(props.siteVisits).toBeUndefined();
    expect(screen.getByText("Why this Milestone needs revision")).toBeTruthy();
    expect(
      screen.getByText("Add the missing cost evidence before resubmitting.")
    ).toBeTruthy();
    expect(screen.getByText("Locked requirements")).toBeTruthy();
    expect(screen.getByText("Completion history")).toBeTruthy();
    expect(screen.getByText("Foundation invoice")).toBeTruthy();
    expect(screen.queryByText("Private lender rationale")).toBeNull();
    expect(screen.queryByText("user_admin")).toBeNull();
    expect(useQueryMock).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Edit completion in Build" })
    );
    expect(onOpenBuild).toHaveBeenCalledWith({
      buildId: "build_1",
      milestoneKey: "foundation",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Resubmit milestone completion" })
    );
    await waitFor(() =>
      expect(decideMock).toHaveBeenCalledWith(
        expect.objectContaining({
          costDocumentIds: ["cost_document_1"],
          expectedCycleNumber: 1,
          target: { kind: "milestone", milestoneId: "milestone_1" },
          workosOrganizationId: "org_builder",
        })
      )
    );
    expect(onResubmitted).toHaveBeenCalledWith({
      cycleId: "cycle_2",
      cycleNumber: 2,
    });
  });

  test("uses the server continuation cursor instead of silently capping review history", async () => {
    const firstPage = {
      ...currentDetail,
      cycles: {
        continueCursor: "cursor-older",
        isDone: false,
        page: [],
      },
    };
    const olderPage = {
      ...currentDetail,
      cycles: {
        continueCursor: "",
        isDone: true,
        page: [],
      },
    };
    mockNotificationQueries(firstPage);
    renderLenderReview();
    mockNotificationQueries(olderPage);

    fireEvent.click(screen.getByRole("button", { name: "Older history" }));

    await waitFor(() =>
      expect(
        useQueryMock.mock.calls.some(
          (call) =>
            call[1]?.historyPaginationOpts?.cursor === "cursor-older"
        )
      ).toBe(true)
    );
    expect(screen.getByRole("button", { name: "Newer history" })).toBeTruthy();
  });
});
