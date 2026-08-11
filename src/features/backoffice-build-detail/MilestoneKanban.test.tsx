// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { MilestoneKanban } from "./MilestoneKanban.tsx";

afterEach(cleanup);

describe("MilestoneKanban responsive containment", () => {
  test("contains the wide six-column board inside its workspace frame", () => {
    render(
      <MilestoneKanban
        cards={[]}
        onCardClick={vi.fn()}
        onToggleShowCompleted={vi.fn()}
        viewerRole="builder"
      />
    );

    const frame = screen.getByTestId("build-detail-kanban");
    expect(frame.className).toContain("min-w-0");
    expect(frame.className).toContain("max-w-full");

    const scroller = frame.querySelector('[data-testid="kanban-horizontal-scroll"]');
    expect(scroller).not.toBeNull();
    expect(scroller?.className).toContain("overflow-x-auto");
  });

  test("opens a canonical child from its visible Kanban row", () => {
    const onSubmilestoneClick = vi.fn();
    const canonicalSubmilestoneId =
      "submilestone-01" as Id<"buildSubmilestones">;
    render(
      <MilestoneKanban
        cards={[
          {
            approvedValueCents: 1,
            code: "FND",
            column: "InProgress",
            contractors: [],
            drawGroupKey: "draw-1",
            milestoneId: "milestone-01",
            milestoneKey: "foundation",
            name: "Foundation",
            progressPercent: 30,
            requiresSiteVisit: false,
            status: "in_progress_on_schedule",
            submilestones: [
              {
                key: "footings",
                name: "Footings",
                order: 1,
                status: "in_progress",
                submilestoneId: canonicalSubmilestoneId,
              },
            ],
            type: "construction",
          },
        ]}
        onCardClick={vi.fn()}
        onSubmilestoneClick={onSubmilestoneClick}
        viewerRole="builder"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Sub-milestone Footings" }),
    );

    expect(onSubmilestoneClick).toHaveBeenCalledWith(
      expect.objectContaining({ milestoneKey: "foundation" }),
      expect.objectContaining({
        key: "footings",
        submilestoneId: canonicalSubmilestoneId,
      }),
    );
  });
});
