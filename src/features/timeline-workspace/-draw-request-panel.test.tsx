// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  DrawRequestPanel,
  LenderDrawReviewPanel,
} from "./TimelineWorkspace.tsx";
import type { DemoDraw, DemoMilestone } from "./-timeline-share-snapshot.ts";

afterEach(() => cleanup());

describe("DrawRequestPanel", () => {
  test("allows saving planned draw amount even when request submission is blocked by milestone approval", () => {
    const onSubmitDrawRequest = vi.fn();
    const onUpdatePlannedDraw = vi.fn();
    const draw: DemoDraw = {
      amount: 80_000,
      id: "draw-01",
      label: "Draw 01",
      x: 16,
    };
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 120_000,
          draw: "Draw 01",
          durationDays: 12,
          evidence: "Submitted",
          icon: "foundation",
          name: "Foundation",
          policy: "Pending",
          status: "complete",
          subMilestones: ["Footings"],
        },
        id: "foundation",
        x: 0,
      },
    ];

    render(
      <DrawRequestPanel
        draw={draw}
        drawItem={items[0] ?? null}
        draws={[draw]}
        items={items}
        onSubmitDrawRequest={onSubmitDrawRequest}
        onUpdatePlannedDraw={onUpdatePlannedDraw}
        requiresApprovedMilestones
      />
    );

    const requestButton = screen.getByTestId(
      "selected-draw-submit-request-draw-01"
    );
    expect((requestButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(
      screen.getByTestId("selected-draw-request-amount-input-draw-01"),
      { target: { value: "95000" } }
    );
    fireEvent.click(screen.getByTestId("selected-draw-save-planned-draw-01"));

    expect(onUpdatePlannedDraw).toHaveBeenCalledWith("draw-01", {
      amount: 95_000,
      x: 16,
    });
    expect(onSubmitDrawRequest).not.toHaveBeenCalled();
  });

  test("presents one labelled lender summary and decision form with an explained blocked approval", () => {
    const draw: DemoDraw = {
      amount: 90_000,
      id: "draw-01",
      label: "Draw 01",
      requestStatus: "requested",
      x: 16,
    };
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 80_000,
          completionClaim: {
            actualCost: 80_000,
            completedDay: 10,
            submittedAt: "2026-06-02T00:00:00.000Z",
          },
          draw: "Draw 01",
          durationDays: 12,
          evidence: "Submitted package",
          icon: "foundation",
          name: "Foundation",
          policy: "Pending",
          status: "complete",
          subMilestones: ["Footings"],
        },
        id: "foundation",
        x: 0,
      },
    ];

    render(
      <LenderDrawReviewPanel
        draw={draw}
        drawItem={items[0] ?? null}
        draws={[draw]}
        items={items}
        onReviewDrawRequest={vi.fn()}
      />
    );

    expect(
      screen.getAllByRole("region", { name: "Draw 01 lender draw review" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("form", { name: "Draw approval decision" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("textbox", { name: "Review reason or condition" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("alert", {
        name: "Requested amount exceeds the available draw limit.",
      }),
    ).toBeTruthy();

    const approve = screen.getByRole("button", { name: "Approve" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(approve.getAttribute("aria-describedby")).toContain(
      "lender-draw-approval-guidance-draw-01",
    );
    expect(
      screen.getByText(
        "Approve is unavailable because the requested amount exceeds the available draw limit.",
      ),
    ).toBeTruthy();
  });

  test("clamps submitted draw request to actual-cost-adjusted availability", () => {
    const onSubmitDrawRequest = vi.fn();
    const onUpdatePlannedDraw = vi.fn();
    const draw: DemoDraw = {
      amount: 90_000,
      id: "draw-01",
      label: "Draw 01",
      x: 16,
    };
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 120_000,
          completionClaim: {
            actualCost: 80_000,
            completedDay: 10,
            submittedAt: "2026-06-02T00:00:00.000Z",
          },
          draw: "Draw 01",
          durationDays: 12,
          evidence: "Submitted",
          icon: "foundation",
          name: "Foundation",
          policy: "Pending",
          status: "complete",
          subMilestones: ["Footings"],
        },
        id: "foundation",
        x: 0,
      },
    ];

    render(
      <DrawRequestPanel
        draw={draw}
        drawItem={items[0] ?? null}
        draws={[draw]}
        items={items}
        onSubmitDrawRequest={onSubmitDrawRequest}
        onUpdatePlannedDraw={onUpdatePlannedDraw}
        requiresApprovedMilestones={false}
      />
    );

    fireEvent.change(
      screen.getByTestId("selected-draw-request-amount-input-draw-01"),
      { target: { value: "90000" } }
    );
    fireEvent.submit(screen.getByTestId("selected-draw-request-form-draw-01"));

    expect(onSubmitDrawRequest).toHaveBeenCalledWith("draw-01", {
      amount: 64_000,
      x: 16,
    });
  });
});
