// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { GanttProvider, GanttTimeline } from "./index.tsx";

const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

beforeEach(() => {
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(Date.now()), 0),
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: originalRequestAnimationFrame,
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: originalCancelAnimationFrame,
  });
});

describe("GanttProvider scroll seeding", () => {
  test("does not reset horizontal timeline scroll when initialScrollDate changes after mount", async () => {
    const currentYear = new Date().getFullYear();
    const initialScrollDate = new Date(currentYear, 5, 1);
    const updatedInitialScrollDate = new Date(currentYear, 8, 1);
    const { container, rerender } = render(
      <TestGantt initialScrollDate={initialScrollDate} />,
    );
    const scrollElement = container.querySelector(".gantt") as HTMLDivElement;

    await waitFor(() => expect(scrollElement.scrollLeft).toBeGreaterThan(0));
    const userScrollLeft = scrollElement.scrollLeft + 333;
    scrollElement.scrollLeft = userScrollLeft;

    rerender(<TestGantt initialScrollDate={updatedInitialScrollDate} />);
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(scrollElement.scrollLeft).toBe(userScrollLeft);
  });
});

function TestGantt({ initialScrollDate }: { initialScrollDate: Date }) {
  return (
    <GanttProvider initialScrollDate={initialScrollDate}>
      <GanttTimeline>
        <div style={{ height: 200, width: 4000 }} />
      </GanttTimeline>
    </GanttProvider>
  );
}
