// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { MilestoneCard } from "./-MilestoneCard.tsx";
import type { DemoMilestone } from "./-timeline-share-snapshot.ts";

beforeAll(() => {
  globalThis.ResizeObserver ??= class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
});

afterEach(() => {
  cleanup();
});

describe("MilestoneCard", () => {
  test("displays actual cost for a builder-completed milestone", () => {
    render(
      <MilestoneCard
        active={false}
        complete
        item={milestoneItem({
          amount: 300_000,
          completionClaim: {
            actualCost: 280_000,
            completedDay: 30,
            submittedAt: "2026-06-02T00:00:00.000Z",
          },
          status: "complete",
        })}
        onUpdate={vi.fn()}
        readOnly
        reducedMotion
      />,
    );

    expect(screen.getByText("Actual cost")).toBeTruthy();
    expect(screen.getByText("$280,000")).toBeTruthy();
    expect(screen.queryByText("$300,000")).toBeNull();
  });
});

function milestoneItem(
  overrides: Partial<DemoMilestone> = {},
): TimelineItem<DemoMilestone> {
  const milestone: DemoMilestone = {
    amount: 300_000,
    draw: "Draw 1",
    drawAvailabilityAmount: 240_000,
    durationDays: 30,
    evidence: "Submitted",
    icon: "foundation",
    name: "Foundation",
    policy: "Review",
    status: "ready",
    subMilestones: ["Forms and pour"],
    ...overrides,
  };

  return {
    data: milestone,
    eyebrow: "Milestone 1",
    id: "foundation",
    label: milestone.name,
    markerLabel: "1",
    tone: milestone.status === "complete" ? "complete" : "active",
    x: 0,
  };
}
