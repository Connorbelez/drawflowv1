// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CalendarWorkspace } from "./CalendarWorkspace";
import type { DrawFlowCalendarWorkspaceData } from "./calendarTypes";

const workspace: DrawFlowCalendarWorkspaceData = {
  defaultTimeframe: "month",
  events: [
    {
      allDay: false,
      auditRequired: true,
      drawGroupKey: "draw-1",
      editable: {
        canChangeAssignee: false,
        canChangeStatus: false,
        canMove: true,
        canResizeEnd: false,
        canResizeStart: false,
        requiredReason: "scheduleChange",
      },
      entity: { id: "draw-1", key: "draw-1", type: "draw" },
      id: "proposal:draw:draw-1",
      kind: "draw",
      metrics: { amountCents: 225_000_00 },
      milestoneKey: "foundation",
      organizationId: "org-test",
      relatedEntityIds: ["proposal-1"],
      startsAt: "2026-06-21",
      status: "proposed",
      subtitle: "Draw availability",
      surface: "proposal",
      timeBucket: "endOfDay",
      timezone: "America/Toronto",
      title: "Foundation reimbursement",
      warnings: [],
    },
  ],
  savedViews: [],
  source: {
    id: "proposal-1",
    location: "Toronto, ON",
    status: "submitted",
    title: "Calendar proposal",
  },
  surface: "proposal",
  timeframes: ["day", "week", "month", "quarter", "agenda"],
  warnings: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CalendarWorkspace export", () => {
  test("deduplicates a pending export and announces the filtered result", async () => {
    let finishExport: (() => void) | undefined;
    const onExportIcs = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishExport = resolve;
        }),
    );

    render(
      <CalendarWorkspace onExportIcs={onExportIcs} workspace={workspace} />,
    );

    const exportButton = screen.getByRole("button", { name: "Export ICS" });
    fireEvent.click(exportButton);
    fireEvent.click(exportButton);

    expect(onExportIcs).toHaveBeenCalledTimes(1);
    expect(onExportIcs).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [expect.objectContaining({ id: "proposal:draw:draw-1" })],
        filename: "proposal-calendar.ics",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Exporting ICS" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Preparing proposal-calendar.ics for 1 event",
    );

    finishExport?.();

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Exported proposal-calendar.ics",
      ),
    );
    expect(screen.getByRole("status").textContent).toContain("1 event");
    expect(screen.getByRole("status").textContent).toContain("June 21, 2026");
    expect(screen.getByRole("status").textContent).toContain("America/Toronto");
  });

  test("announces a retryable export failure without rendering raw internals", async () => {
    const onExportIcs = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("ConvexError: request id 123 /server/private/path.ts"),
      )
      .mockResolvedValueOnce(undefined);

    render(
      <CalendarWorkspace onExportIcs={onExportIcs} workspace={workspace} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export ICS" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Calendar export failed. Try again or create an ICS subscription instead.",
    );
    expect(alert.textContent).not.toContain("ConvexError");
    expect(alert.textContent).not.toContain("request id");
    expect(alert.textContent).not.toContain("/server/private/path.ts");

    fireEvent.click(screen.getByRole("button", { name: "Export ICS" }));

    await waitFor(() => expect(onExportIcs).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Exported proposal-calendar.ics",
      ),
    );
  });
});
