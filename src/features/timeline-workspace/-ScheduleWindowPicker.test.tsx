// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  moveScheduleWindowNode,
  ScheduleWindowPicker,
  type ScheduleWindowValue,
} from "./-ScheduleWindowPicker.tsx";

afterEach(() => cleanup());

const PROPOSED_START_DATE = "2026-06-01";

describe("moveScheduleWindowNode", () => {
  const value: ScheduleWindowValue = { durationDays: 14, startDay: 0 };

  test("moving the start node earlier keeps the end pinned", () => {
    expect(
      moveScheduleWindowNode(
        value,
        "start",
        "2026-05-28",
        PROPOSED_START_DATE
      )
    ).toEqual({ durationDays: 18, startDay: -4 });
  });

  test("moving the start node later shrinks the window", () => {
    expect(
      moveScheduleWindowNode(
        value,
        "start",
        "2026-06-05",
        PROPOSED_START_DATE
      )
    ).toEqual({ durationDays: 10, startDay: 4 });
  });

  test("the start node cannot cross the end node", () => {
    expect(
      moveScheduleWindowNode(
        value,
        "start",
        "2026-06-20",
        PROPOSED_START_DATE
      )
    ).toEqual({ durationDays: 1, startDay: 13 });
  });

  test("moving the end node later keeps the start pinned", () => {
    expect(
      moveScheduleWindowNode(value, "end", "2026-06-20", PROPOSED_START_DATE)
    ).toEqual({ durationDays: 20, startDay: 0 });
  });

  test("the end node cannot cross the start node", () => {
    expect(
      moveScheduleWindowNode(value, "end", "2026-05-20", PROPOSED_START_DATE)
    ).toEqual({ durationDays: 1, startDay: 0 });
  });
});

function ControlledPicker({
  onCommit = vi.fn(),
  onWindowChange = vi.fn(),
}: {
  onCommit?: () => void;
  onWindowChange?: (next: ScheduleWindowValue) => void;
}) {
  const [value, setValue] = useState<ScheduleWindowValue>({
    durationDays: 14,
    startDay: 0,
  });

  return (
    <ScheduleWindowPicker
      durationDays={value.durationDays}
      label="Framing"
      onCommit={onCommit}
      onWindowChange={(next) => {
        setValue(next);
        onWindowChange(next);
      }}
      proposedStartDate={PROPOSED_START_DATE}
      startDay={value.startDay}
      testId="framing-window"
      trigger={
        <>
          <strong>window</strong>
          <small>14d</small>
        </>
      }
    />
  );
}

function openPicker() {
  fireEvent.click(screen.getByTestId("framing-window"));
}

function dayCell(isoDate: string) {
  const cell = document.querySelector(`[data-day="${isoDate}"]`);
  if (!cell) {
    throw new Error(`No day cell rendered for ${isoDate}`);
  }
  return cell;
}

function clickDay(isoDate: string) {
  const button = dayCell(isoDate).querySelector("button");
  if (!button) {
    throw new Error(`No day button rendered for ${isoDate}`);
  }
  fireEvent.click(button);
}

describe("ScheduleWindowPicker", () => {
  test("opens with the current window pre-selected and the start node armed", () => {
    render(<ControlledPicker />);
    openPicker();

    expect(dayCell("2026-06-01").classList.contains("range-start")).toBe(true);
    expect(dayCell("2026-06-14").classList.contains("range-end")).toBe(true);
    expect(
      screen.getByTestId("framing-window-start-node").getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
    expect(
      screen.getByTestId("framing-window-end-node").getAttribute(
        "aria-pressed"
      )
    ).toBe("false");
  });

  test("clicking a range node selects it instead of moving it", () => {
    render(<ControlledPicker />);
    openPicker();

    clickDay("2026-06-14");

    expect(
      screen.getByTestId("framing-window-end-node").getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
    expect(
      screen.getByTestId("framing-window-start-node").getAttribute(
        "aria-pressed"
      )
    ).toBe("false");
  });

  test("clicking another date moves only the armed start node", () => {
    const onWindowChange = vi.fn();
    render(<ControlledPicker onWindowChange={onWindowChange} />);
    openPicker();

    clickDay("2026-06-05");

    expect(onWindowChange).toHaveBeenLastCalledWith({
      durationDays: 10,
      startDay: 4,
    });
    expect(dayCell("2026-06-05").classList.contains("range-start")).toBe(true);
    expect(dayCell("2026-06-14").classList.contains("range-end")).toBe(true);
  });

  test("clicking another date moves only the armed end node", () => {
    const onWindowChange = vi.fn();
    render(<ControlledPicker onWindowChange={onWindowChange} />);
    openPicker();

    fireEvent.click(screen.getByTestId("framing-window-end-node"));
    clickDay("2026-06-20");

    expect(onWindowChange).toHaveBeenLastCalledWith({
      durationDays: 20,
      startDay: 0,
    });
    expect(dayCell("2026-06-01").classList.contains("range-start")).toBe(true);
    expect(dayCell("2026-06-20").classList.contains("range-end")).toBe(true);
  });

  test("dragging a node moves only that node", () => {
    const onWindowChange = vi.fn();
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => dayCell("2026-06-08");
    render(<ControlledPicker onWindowChange={onWindowChange} />);
    openPicker();

    const startButton = dayCell("2026-06-01").querySelector("button");
    if (!startButton) {
      throw new Error("No start day button rendered");
    }
    fireEvent.pointerDown(startButton);
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window);

    expect(onWindowChange).toHaveBeenLastCalledWith({
      durationDays: 7,
      startDay: 7,
    });
    expect(
      screen.getByTestId("framing-window-start-node").getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
    document.elementFromPoint = originalElementFromPoint;
  });

  test("closing the picker commits the edited window", async () => {
    const onCommit = vi.fn();
    render(<ControlledPicker onCommit={onCommit} />);
    openPicker();

    clickDay("2026-06-05");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /done/i }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
  });
});
