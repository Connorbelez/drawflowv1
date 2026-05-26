// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { TimelineMarkerStack } from "./TimelineMarkerStack.tsx";
import type { TimelineMarkerStack as TimelineMarkerStackData } from "./animated-curved-timeline-utils.ts";

afterEach(() => cleanup());

describe("TimelineMarkerStack", () => {
  test("cycles the visible active marker card", () => {
    const stack: TimelineMarkerStackData = {
      anchorX: 44,
      id: "today__draw-1",
      members: [
        {
          layoutX: 20,
          marker: { id: "today", label: "Today", x: 0 },
          valueX: 0,
        },
        {
          layoutX: 68,
          marker: { id: "draw-1", label: "Draw 1", x: 2 },
          valueX: 2,
        },
      ],
    };

    render(
      <TimelineMarkerStack
        prefersReducedMotion
        range={{ max: 10, min: 0, unit: "days" }}
        renderMarker={(marker, context) => (
          <div
            data-testid={
              context.stack.isActive
                ? "timeline-marker-stack-active-card"
                : "timeline-marker-stack-preview-card"
            }
          >
            {marker.label}
          </div>
        )}
        resolvePathPointAtX={() => ({ distance: 0, y: 90 })}
        stack={stack}
      />
    );

    expect(
      screen.getAllByTestId("timeline-marker-stack-active-card").at(-1)
        ?.textContent
    ).toContain("Today");

    fireEvent.click(
      screen.getByTestId("timeline-marker-stack-cycle-today__draw-1")
    );

    expect(
      screen.getAllByTestId("timeline-marker-stack-active-card").at(-1)
        ?.textContent
    ).toContain("Draw 1");
  });
});
