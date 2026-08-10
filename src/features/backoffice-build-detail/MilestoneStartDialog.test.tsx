// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  MilestoneStartDialog,
  type MilestoneStartDialogRequest,
} from "./MilestoneStartDialog";

const request: MilestoneStartDialogRequest = {
  buildName: "Hamilton Garden Suite",
  dependencyBlockers: [],
  expectedRevision: 3,
  milestoneKey: "rough-in",
  milestoneName: "Rough-in",
  plannedStartDate: "2026-07-20T09:00:00.000Z",
  scope: "milestone",
  source: "milestone_detail",
};

afterEach(cleanup);

describe("MilestoneStartDialog", () => {
  test("requires explicit confirmation and submits the canonical start payload", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <MilestoneStartDialog
        onClose={vi.fn()}
        onConfirm={onConfirm}
        request={request}
      />,
    );

    expect(screen.getByText("Hamilton Garden Suite")).toBeTruthy();
    expect(screen.getByText("Rough-in")).toBeTruthy();
    expect(screen.queryByLabelText("Why is work starting out of sequence?")).toBeNull();

    fireEvent.change(screen.getByLabelText("Actual start"), {
      target: { value: "2026-07-19T08:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record start" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        actualStartedAt: Date.parse("2026-07-19T08:30:00"),
        expectedRevision: 3,
        milestoneKey: "rough-in",
        source: "milestone_detail",
      }),
    );
  });

  test("lists incomplete predecessors, retains values after failure, and requires the exception reason", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(undefined);
    render(
      <MilestoneStartDialog
        onClose={vi.fn()}
        onConfirm={onConfirm}
        request={{
          ...request,
          dependencyBlockers: [
            {
              milestoneKey: "foundation",
              milestoneName: "Foundation",
              status: "in_progress",
            },
          ],
          source: "gantt",
        }}
      />,
    );

    expect(screen.getByText(/Foundation is In progress/i)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Record exception start" }),
    );
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => /explain why/i.test(alert.textContent ?? ""))
    ).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByLabelText("Why is work starting out of sequence?"),
      { target: { value: "Crew mobilized while inspection closed." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByText(/Network unavailable/i)).toBeTruthy()
    );
    expect(
      (
        screen.getByLabelText(
          "Why is work starting out of sequence?",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Crew mobilized while inspection closed.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    expect(onConfirm.mock.calls[1]?.[0].idempotencyKey).toBe(
      onConfirm.mock.calls[0]?.[0].idempotencyKey,
    );
  });

  test("rejects a future actual start before dispatching the mutation", () => {
    const onConfirm = vi.fn();
    render(
      <MilestoneStartDialog
        onClose={vi.fn()}
        onConfirm={onConfirm}
        request={request}
      />,
    );

    fireEvent.change(screen.getByLabelText("Actual start"), {
      target: { value: "2099-01-01T09:00" },
    });

    expect(
      (screen.getByRole("button", {
        name: "Record start",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Future work belongs/i)).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("fails gracefully when the planned schedule date is unavailable", () => {
    render(
      <MilestoneStartDialog
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        request={{ ...request, plannedStartDate: "Not scheduled" }}
      />,
    );

    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.getByText("Schedule unavailable")).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
