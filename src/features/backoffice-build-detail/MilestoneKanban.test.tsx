// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
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
});
