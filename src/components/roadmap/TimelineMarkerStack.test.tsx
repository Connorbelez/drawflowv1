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

  test("places the marker list beside the stack on the side with available space", () => {
    const stack: TimelineMarkerStackData = {
      anchorX: 380,
      id: "near-right",
      members: [
        {
          layoutX: 360,
          marker: { id: "draw-1", label: "Draw 1", x: 8 },
          valueX: 8,
        },
        {
          layoutX: 400,
          marker: { id: "draw-2", label: "Draw 2", x: 9 },
          valueX: 9,
        },
      ],
    };

    render(
      <TimelineMarkerStack
        contentWidth={500}
        prefersReducedMotion
        range={{ max: 10, min: 0, unit: "days" }}
        renderMarker={(marker) => <div>{marker.label}</div>}
        resolvePathPointAtX={() => ({ distance: 0, y: 90 })}
        stack={stack}
      />
    );

    fireEvent.focus(screen.getByTestId("timeline-marker-stack-cycle-near-right"));

    expect(screen.getByRole("listbox").getAttribute("data-side")).toBe("left");
    expect(screen.getByRole("listbox").className).toContain("top-0");
    expect(screen.getByRole("listbox").className).not.toContain(
      "-translate-y-1/2"
    );
  });

  test("moves the marker list to the right when the stack is near the left edge", () => {
    const stack: TimelineMarkerStackData = {
      anchorX: 42,
      id: "near-left",
      members: [
        {
          layoutX: 28,
          marker: { id: "draw-1", label: "Draw 1", x: 1 },
          valueX: 1,
        },
        {
          layoutX: 56,
          marker: {
            id: "draw-2",
            label: "Interior Finish reimbursement draw with extra policy copy",
            x: 2,
          },
          valueX: 2,
        },
      ],
    };

    render(
      <TimelineMarkerStack
        contentWidth={500}
        prefersReducedMotion
        range={{ max: 10, min: 0, unit: "days" }}
        renderMarker={(marker) => <div>{marker.label}</div>}
        resolvePathPointAtX={() => ({ distance: 0, y: 90 })}
        stack={stack}
      />
    );

    fireEvent.focus(screen.getByTestId("timeline-marker-stack-cycle-near-left"));

    expect(screen.getByRole("listbox").getAttribute("data-side")).toBe("right");
    const longLabel = Array.from(
      screen.getByRole("listbox").querySelectorAll("span")
    ).find(
      (element) =>
        element.textContent ===
        "Interior Finish reimbursement draw with extra policy copy"
    );

    expect(longLabel?.className).toContain("truncate");
  });
});
