// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { DrawRequestPanel } from "./index.tsx";
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
});
