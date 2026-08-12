// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  BuildFundingWorkspace,
  parseCadToCents,
  projectBuildFunding,
} from "./BuildFundingWorkspace.tsx";

const milestones = [
  {
    completionReview: {
      reviewedAt: "2026-07-10T12:00:00.000Z",
      status: "approved",
    },
    dayEnd: 20,
    drawAvailabilityCents: 10_632_900,
    key: "foundation",
    name: "Underground, framing & roof",
    order: 1,
    status: "complete" as const,
  },
  {
    completionClaim: { submittedAt: "2026-07-14T12:00:00.000Z" },
    dayEnd: 30,
    drawAvailabilityCents: 8_800_800,
    key: "permits",
    name: "Permits, demo & foundation",
    order: 2,
    status: "complete" as const,
  },
  {
    dayEnd: 5,
    drawAvailabilityCents: 1_250_000,
    key: "site-prep",
    name: "Site preparation",
    order: 3,
    status: "in_progress" as const,
  },
];

const REAL_DATE = Date;
const FIXED_NOW = "2026-07-15T18:30:00.000Z";

beforeEach(() => {
  // The funding schedule intentionally compares against today's date. Keep
  // these fixed-date fixtures deterministic without replacing timer APIs used
  // by Testing Library's async helpers.
  class FixedDate extends REAL_DATE {
    constructor(value?: string | number | Date) {
      super(value === undefined ? FIXED_NOW : value);
    }

    static now() {
      return REAL_DATE.parse(FIXED_NOW);
    }
  }
  vi.stubGlobal("Date", FixedDate);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BuildFundingWorkspace", () => {
  test("projects exact availability from approved money and reserving requests", () => {
    const model = projectBuildFunding({
      canRequest: true,
      facilityCents: 20_000_000,
      milestones,
      plannedDraws: [
        {
          amountCents: 1_000_000,
          drawKey: "past-plan",
          label: "Past planning row",
          order: 1,
          timingDay: 5,
        },
        {
          amountCents: 2_000_000,
          drawKey: "future-plan",
          label: "Future planning row",
          order: 2,
          timingDay: 60,
        },
      ],
      requests: [
        {
          amountCents: 3_200_000,
          drawKey: "submitted",
          label: "Foundation trades",
          status: "requested",
        },
        {
          amountCents: 1_800_000,
          drawKey: "released",
          label: "Permit reimbursement",
          status: "released",
        },
        {
          amountCents: 9_999_999,
          drawKey: "rejected",
          label: "Rejected request",
          status: "rejected",
        },
      ],
      startDate: "2026-06-20",
    });

    expect(model.approvedMilestoneCents).toBe(10_632_900);
    expect(model.pendingMilestoneCents).toBe(8_800_800);
    expect(model.backlogMilestoneCents).toBe(1_250_000);
    expect(model.reservedCents).toBe(5_000_000);
    expect(model.availableCents).toBe(5_632_900);
    expect(model.forecastDraws.map((draw) => draw.drawKey)).toEqual([
      "future-plan",
    ]);
    expect(model.historicalPlannedDraws.map((draw) => draw.drawKey)).toEqual([
      "past-plan",
    ]);
  });

  test("parses Canadian dollar input without floating point rounding", () => {
    expect(parseCadToCents("$56,329.07")).toBe(5_632_907);
    expect(parseCadToCents("0.01")).toBe(1);
    expect(parseCadToCents("1.009")).toBe(0);
  });

  test("submits a partial draw and presents the authoritative receipt", async () => {
    const onRequestDraw = vi.fn().mockResolvedValue({
      amountCents: 1_250_025,
      availableAfterCents: 4_382_875,
      displayId: "DR-0003",
      requestKey: "dr-0003-1",
      requestedAt: "2026-07-15T18:30:00.000Z",
      sourceAllocations: [
        {
          amountCents: 1_250_025,
          drawGroupKey: "draw-01",
          milestoneKey: "foundation",
          milestoneName: "Underground, framing & roof",
          sourceOrder: 0,
        },
      ],
      status: "requested",
      workOrderKey: "DRWO-0003",
    });
    render(
      <BuildFundingWorkspace
        model={projectBuildFunding({
          canRequest: true,
          facilityCents: 20_000_000,
          milestones,
          plannedDraws: [
            {
              amountCents: 10_000_000,
              drawKey: "draw-02",
              label: "Framing reimbursement",
              order: 1,
              timingDay: 45,
            },
          ],
          requests: [
            {
              amountCents: 5_000_000,
              drawKey: "dr-0001",
              label: "Foundation trades",
              status: "released",
            },
          ],
          startDate: "2026-06-20",
        })}
        onOpenMilestone={vi.fn()}
        onRequestDraw={onRequestDraw}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /request a draw/i }));
    fireEvent.change(
      await screen.findByLabelText("Draw request amount in Canadian dollars"),
      { target: { value: "12500.25" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => expect(onRequestDraw).toHaveBeenCalledTimes(1));
    expect(onRequestDraw).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 1_250_025,
        drawKey: "draw-02",
      }),
    );
    expect(await screen.findByText("DR-0003")).toBeTruthy();
    expect(screen.getByText("Work order DRWO-0003")).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Underground, framing & roof, Draw Group draw-01, $12,500.25",
      ),
    ).toBeTruthy();
  });

  test("reuses one idempotency key when a timed-out request is retried", async () => {
    const onRequestDraw = vi
      .fn()
      .mockRejectedValueOnce(new Error("The request timed out. Try again."))
      .mockResolvedValueOnce({
        amountCents: 5_632_900,
        availableAfterCents: 0,
        displayId: "DR-0004",
        requestKey: "dr-0004-1",
        requestedAt: "2026-07-15T18:30:00.000Z",
        sourceAllocations: [
          {
            amountCents: 5_632_900,
            drawGroupKey: "draw-01",
            milestoneKey: "foundation",
            milestoneName: "Underground, framing & roof",
            sourceOrder: 0,
          },
        ],
        status: "requested",
        workOrderKey: "DRWO-0004",
      });
    render(
      <BuildFundingWorkspace
        model={projectBuildFunding({
          canRequest: true,
          facilityCents: 20_000_000,
          milestones,
          requests: [
            {
              amountCents: 5_000_000,
              drawKey: "dr-0001",
              label: "Foundation trades",
              status: "released",
            },
          ],
          startDate: "2026-06-20",
        })}
        onOpenMilestone={vi.fn()}
        onRequestDraw={onRequestDraw}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /request a draw/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Review request" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not reach Fairlend."
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => expect(onRequestDraw).toHaveBeenCalledTimes(2));
    expect(onRequestDraw.mock.calls[0]?.[0].clientOperationId).toBe(
      onRequestDraw.mock.calls[1]?.[0].clientOperationId
    );
    expect(await screen.findByText("DR-0004")).toBeTruthy();
  });

  test("exposes the funding schedule as a labelled list with accessible status contrast", () => {
    render(
      <BuildFundingWorkspace
        model={projectBuildFunding({
          canRequest: true,
          facilityCents: 20_000_000,
          milestones: [
            {
              completionReview: {
                note: "Upload the signed foundation inspection report.",
                reviewedAt: "2026-07-15T12:00:00.000Z",
                status: "revisionRequested",
              },
              dayEnd: 20,
              drawAvailabilityCents: 8_800_792,
              key: "permits",
              name: "Permits, demo & foundation",
              order: 1,
              status: "in_progress",
            },
          ],
          requests: [],
          startDate: "2026-06-20",
        })}
        onOpenMilestone={vi.fn()}
      />
    );

    expect(
      screen.getByRole("region", { name: "Milestone funding schedule" })
    ).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Milestone funding status" })
    ).toBeTruthy();
    const summary = screen.getByLabelText("Milestone funding summary");
    expect(summary).toBeTruthy();
    expect(
      within(summary)
        .getAllByText("$0.00", { selector: "dd" })
        .every((value) => value.className.includes("text-lg"))
    ).toBe(true);
    expect(
      screen
        .getByRole("list", { name: "Milestone funding status" })
        .querySelectorAll('[data-slot="card"]')
    ).toHaveLength(1);
    const revisionStatus = screen.getByLabelText("Status: Needs revision");
    expect(revisionStatus.className).toContain("text-destructive-text");
    expect(
      screen.getByText(
        "Requested change: Upload the signed foundation inspection report."
      ).className
    ).toContain("text-destructive-text");
    expect(
      screen.getByRole("button", {
        name: "Open Permits, demo & foundation milestone",
      })
    ).toBeTruthy();
  });

  test("groups unapproved milestones and highlights selected scheduled and actual intervals", () => {
    const onOpenMilestone = vi.fn();
    render(
      <BuildFundingWorkspace
        model={projectBuildFunding({
          canRequest: false,
          facilityCents: 50_000_000,
          milestones: [
            {
              completionReview: {
                reviewedAt: "2026-07-18T12:00:00.000Z",
                status: "approved",
              },
              dayEnd: 8,
              dayStart: 0,
              drawAvailabilityCents: 4_000_000,
              key: "approved",
              name: "Approved foundation",
              order: 1,
              status: "complete",
            },
            {
              dayEnd: 35,
              dayStart: 10,
              drawAvailabilityCents: 7_000_000,
              key: "active",
              name: "Active framing",
              order: 2,
              startedAt: Date.UTC(2026, 6, 4, 12),
              status: "in_progress",
            },
            {
              completionClaim: {
                completedDay: 12,
                submittedAt: "2026-07-14T12:00:00.000Z",
              },
              dayEnd: 15,
              dayStart: 8,
              drawAvailabilityCents: 3_000_000,
              key: "verification",
              name: "Pending rough-ins",
              order: 3,
              status: "complete",
            },
            {
              dayEnd: 5,
              dayStart: 1,
              drawAvailabilityCents: 2_000_000,
              key: "behind",
              name: "Behind site work",
              order: 4,
              status: "in_progress",
            },
            {
              dayEnd: 60,
              dayStart: 40,
              drawAvailabilityCents: 6_000_000,
              key: "upcoming",
              name: "Upcoming finishes",
              order: 5,
              status: "planned",
            },
          ],
          requests: [],
          startDate: "2026-07-01",
        })}
        onOpenMilestone={onOpenMilestone}
        viewerRole="lender"
      />
    );

    const schedule = screen.getByRole("region", {
      name: "Milestone funding schedule",
    });
    expect(within(schedule).queryByText("Approved foundation")).toBeNull();
    for (const groupName of [
      "Active",
      "Pending verification",
      "Behind schedule",
      "Upcoming",
    ]) {
      expect(
        within(schedule).getByRole("heading", { name: groupName })
      ).toBeTruthy();
    }

    const activeSelection = within(schedule).getByRole("button", {
      name: "Highlight Active framing dates on the timeline",
    });
    expect(activeSelection.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(activeSelection);
    expect(activeSelection.getAttribute("aria-pressed")).toBe("true");

    const activeRail = within(schedule).getByRole("group", {
      name: "Active framing date interval",
    });
    expect(activeRail.textContent).toContain("Jul 11, 2026");
    expect(activeRail.textContent).toContain("Aug 5, 2026");
    expect(activeRail.textContent).toContain("Actual Jul 4, 2026");
    expect(activeRail.className).toContain("text-primary");

    fireEvent.click(
      within(schedule).getByRole("button", {
        name: "Review Upcoming finishes milestone",
      })
    );
    expect(onOpenMilestone).toHaveBeenCalledWith("upcoming");
    expect(activeSelection.getAttribute("aria-pressed")).toBe("true");
    expect(
      within(schedule)
        .getByRole("button", {
          name: "Highlight Upcoming finishes dates on the timeline",
        })
        .getAttribute("aria-pressed")
    ).toBe("false");
  });

  test("treats a legacy revision state without a requested change as pending verification", () => {
    const model = projectBuildFunding({
      canRequest: true,
      facilityCents: 20_000_000,
      milestones: [
        {
          completionClaim: { submittedAt: "2026-07-14T12:00:00.000Z" },
          completionReview: {
            reviewedAt: "2026-07-15T12:00:00.000Z",
            status: "revisionRequested",
          },
          dayEnd: 20,
          drawAvailabilityCents: 8_800_792,
          key: "permits",
          name: "Permits, demo & foundation",
          order: 1,
          status: "in_progress",
        },
      ],
      requests: [],
      startDate: "2026-06-20",
    });

    expect(model.pendingMilestoneCents).toBe(8_800_792);
    expect(model.backlogMilestoneCents).toBe(0);

    render(
      <BuildFundingWorkspace
        model={model}
        onOpenMilestone={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Status: Pending verification")).toBeTruthy();
    expect(screen.queryByText(/^Requested change:/)).toBeNull();
    expect(screen.queryByLabelText("Status: Needs revision")).toBeNull();
  });

  test("gives lenders one review queue for milestone, draw, and release decisions", async () => {
    const onOpenMilestone = vi.fn();
    const onReleaseDraw = vi.fn().mockResolvedValue(null);
    const onStartDrawReview = vi.fn().mockResolvedValue(null);
    const submittedRequest = {
      amountCents: 3_200_000,
      displayId: "DR-1042",
      drawKey: "submitted",
      label: "Foundation trades reimbursement",
      requestedAt: "2026-07-14T12:00:00.000Z",
      requestNote: "Foundation trades reimbursement",
      status: "requested" as const,
    };
    const approvedRequest = {
      amountCents: 1_800_000,
      displayId: "DR-1021",
      drawKey: "approved",
      label: "Permit reimbursement",
      reviewedAt: "2026-07-15T12:00:00.000Z",
      status: "approved_for_release" as const,
    };

    render(
      <BuildFundingWorkspace
        model={projectBuildFunding({
          canRequest: false,
          buildLabel: "Harbour Build",
          facilityCents: 20_000_000,
          milestones,
          plannedDraws: [
            {
              _id: "past-planned-draw-1",
              amountCents: 1_500_000,
              drawKey: "past-plan",
              label: "Past planning row",
              order: 0,
              timingDay: 5,
            },
            {
              _id: "planned-draw-1",
              amountCents: 8_944_800,
              drawKey: "future-plan",
              label: "Service upgrade & envelope reimbursement",
              order: 1,
              timingDay: 60,
            },
          ],
          requests: [submittedRequest, approvedRequest],
          startDate: "2026-06-20",
        })}
        onOpenMilestone={onOpenMilestone}
        onReleaseDraw={onReleaseDraw}
        onStartDrawReview={onStartDrawReview}
        viewerRole="lender"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Review funding and release" })
    ).toBeTruthy();
    expect(screen.getByTestId("lender-funding-review").textContent).toContain(
      "3 actions"
    );
    expect(screen.queryByRole("button", { name: /request a draw/i })).toBeNull();
    expect(screen.getByText("Future planned draws")).toBeTruthy();
    expect(
      document.querySelector(
        '[data-collaboration-focus="draw:planned-draw-1"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(
        '[data-collaboration-focus="draw:past-planned-draw-1"]',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("lender-funding-review")).getByText(
        "No draws have been released for this build."
      )
    ).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId("lender-funding-review")).getByRole(
        "button",
        {
          name: "Review Permits, demo & foundation milestone",
        }
      )
    );
    expect(onOpenMilestone).toHaveBeenCalledWith("permits");

    fireEvent.click(screen.getByTestId("lender-review-start-submitted"));
    await waitFor(() =>
      expect(onStartDrawReview).toHaveBeenCalledWith(submittedRequest),
    );

    fireEvent.click(screen.getByTestId("lender-review-release-approved"));
    expect(
      await screen.findByRole("heading", { name: "Release $18,000.00?" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm release" }));
    await waitFor(() => expect(onReleaseDraw).toHaveBeenCalledWith(approvedRequest));
  });

  test("contains raw draw review failures in a safe lender banner", async () => {
    const submittedRequest = {
      amountCents: 3_200_000,
      displayId: "DR-1042",
      drawKey: "submitted",
      label: "Foundation trades reimbursement",
      requestedAt: "2026-07-14T12:00:00.000Z",
      status: "ready_for_admin" as const,
    };
    const onApproveDraw = vi.fn().mockRejectedValue(
      new Error(
        "ConvexError production_proposals.reviewDraw requestId=req-secret payload={drawKey:submitted} /srv/convex/production_proposals.ts"
      )
    );

    render(
      <BuildFundingWorkspace
        model={projectBuildFunding({
          canRequest: false,
          facilityCents: 20_000_000,
          milestones,
          requests: [submittedRequest],
          startDate: "2026-06-20",
        })}
        onApproveDraw={onApproveDraw}
        onOpenMilestone={vi.fn()}
        viewerRole="lender"
      />
    );

    fireEvent.click(screen.getByTestId("lender-review-approve-submitted"));

    expect(
      await screen.findByText(
        "We could not update this draw request. Refresh its status and try again."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(/ConvexError|requestId|payload=|\/srv\//i)
    ).toBeNull();
  });

  test("shows previously approved draws in lender release history", () => {
    render(
      <BuildFundingWorkspace
        model={projectBuildFunding({
          canRequest: false,
          facilityCents: 20_000_000,
          milestones,
          requests: [
            {
              amountCents: 1_800_025,
              displayId: "DR-1021",
              drawKey: "released-history",
              label: "Permit reimbursement",
              releasedAt: "2026-07-16T12:00:00.000Z",
              reviewedAt: "2026-07-15T12:00:00.000Z",
              status: "released",
            },
          ],
          startDate: "2026-06-20",
        })}
        onOpenMilestone={vi.fn()}
        viewerRole="lender"
      />
    );

    const history = within(
      screen.getByTestId("lender-released-draw-released-history")
    );
    expect(history.getByText("DR-1021")).toBeTruthy();
    expect(history.getByText("$18,000.25")).toBeTruthy();
    expect(history.getByText("Jul 15, 2026")).toBeTruthy();
    expect(history.getByText("Jul 16, 2026")).toBeTruthy();
    expect(
      screen.queryByText("No draws have been released for this build.")
    ).toBeNull();
  });

  test("opens every active lender Draw card through one canonical review target", () => {
    const onOpenDraw = vi.fn();
    const requests = [
      {
        _id: "draw-requested-id",
        amountCents: 3_200_000,
        displayId: "DR-1042",
        drawKey: "requested",
        label: "Requested reimbursement",
        requestedAt: "2026-07-14T12:00:00.000Z",
        status: "requested" as const,
      },
      {
        _id: "draw-in-review-id",
        amountCents: 2_100_000,
        displayId: "DR-1043",
        drawKey: "in-review",
        label: "Operations review",
        requestedAt: "2026-07-13T12:00:00.000Z",
        status: "in_review" as const,
      },
      {
        _id: "draw-ready-id",
        amountCents: 1_800_000,
        displayId: "DR-1044",
        drawKey: "ready",
        label: "Admin decision",
        requestedAt: "2026-07-12T12:00:00.000Z",
        status: "ready_for_admin" as const,
      },
    ];

    render(
      <BuildFundingWorkspace
        drawCapabilities={{
          canApprove: true,
          canOpenReview: true,
          canReject: true,
          canRelease: true,
          canStartReview: true,
          canSubmitForAdmin: true,
        }}
        model={projectBuildFunding({
          canRequest: false,
          facilityCents: 20_000_000,
          milestones,
          requests,
          startDate: "2026-06-20",
        })}
        onOpenDraw={onOpenDraw}
        onOpenMilestone={vi.fn()}
        viewerRole="lender"
      />,
    );

    for (const request of requests) {
      const button = screen.getByTestId(
        `draw-review-request-${request.drawKey}`,
      );
      expect(button.textContent).toContain(
        request.status === "requested" ? "Review request" : "Open review",
      );
      fireEvent.click(button);
    }

    expect(onOpenDraw).toHaveBeenCalledTimes(requests.length);
    expect(onOpenDraw).toHaveBeenNthCalledWith(1, requests[0]);
    expect(onOpenDraw).toHaveBeenNthCalledWith(2, requests[1]);
    expect(onOpenDraw).toHaveBeenNthCalledWith(3, requests[2]);
  });

  test("does not leak the lender review entrypoint into Builder cards", () => {
    const onOpenDraw = vi.fn();
    render(
      <BuildFundingWorkspace
        model={projectBuildFunding({
          canRequest: true,
          facilityCents: 20_000_000,
          milestones,
          requests: [
            {
              _id: "builder-draw-id",
              amountCents: 3_200_000,
              displayId: "DR-1042",
              drawKey: "builder-request",
              label: "Builder reimbursement",
              requestedAt: "2026-07-14T12:00:00.000Z",
              status: "requested",
            },
          ],
          startDate: "2026-06-20",
        })}
        onOpenDraw={onOpenDraw}
        onOpenMilestone={vi.fn()}
        viewerRole="builder"
      />,
    );

    expect(screen.queryByTestId("draw-review-request-builder-request")).toBeNull();
    expect(screen.queryByText("Review request")).toBeNull();
    expect(onOpenDraw).not.toHaveBeenCalled();
  });

  test("keeps a read-only review entrypoint when final Draw decisions are unauthorized", () => {
    render(
      <BuildFundingWorkspace
        drawCapabilities={{
          canApprove: false,
          canOpenReview: true,
          canReject: false,
          canRelease: false,
          canStartReview: false,
          canSubmitForAdmin: false,
        }}
        model={projectBuildFunding({
          canRequest: false,
          facilityCents: 20_000_000,
          milestones,
          requests: [
            {
              _id: "ready-draw-id",
              amountCents: 1_800_000,
              displayId: "DR-1044",
              drawKey: "ready-only",
              label: "Admin decision",
              requestedAt: "2026-07-12T12:00:00.000Z",
              status: "ready_for_admin",
            },
            {
              _id: "approved-draw-id",
              amountCents: 1_200_000,
              displayId: "DR-1045",
              drawKey: "approved-only",
              label: "Approved release",
              reviewedAt: "2026-07-11T12:00:00.000Z",
              status: "approved_for_release",
            },
          ],
          startDate: "2026-06-20",
        })}
        onApproveDraw={vi.fn()}
        onOpenDraw={vi.fn()}
        onOpenMilestone={vi.fn()}
        onRejectDraw={vi.fn()}
        onReleaseDraw={vi.fn()}
        viewerRole="lender"
      />,
    );

    expect(screen.getByTestId("draw-review-request-ready-only")).toBeTruthy();
    expect(screen.queryByTestId("lender-review-approve-ready-only")).toBeNull();
    expect(screen.queryByTestId("lender-review-reject-ready-only")).toBeNull();
    expect(
      (screen.getByTestId(
        "lender-review-release-approved-only",
      ) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
