// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

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

afterEach(cleanup);

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
        .every((value) => value.className.includes("text-3xl"))
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
          facilityCents: 20_000_000,
          milestones,
          plannedDraws: [
            {
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
});
