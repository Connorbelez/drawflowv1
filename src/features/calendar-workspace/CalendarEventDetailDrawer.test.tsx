// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CalendarEventDetailDrawer } from "./CalendarEventDetailDrawer";
import type { DrawFlowCalendarEvent } from "./calendarTypes";

const draftEvent: DrawFlowCalendarEvent = {
  allDay: true,
  auditRequired: false,
  editable: {
    canChangeAssignee: false,
    canChangeStatus: false,
    canMove: true,
    canResizeEnd: true,
    canResizeStart: true,
    requiredReason: "none",
  },
  endsAt: "2026-06-25",
  entity: { id: "milestone-1", key: "foundation", type: "milestone" },
  id: "proposal:milestone:foundation",
  kind: "milestone",
  milestoneKey: "foundation",
  organizationId: "org-test",
  relatedEntityIds: ["proposal-1"],
  startsAt: "2026-06-15",
  status: "proposed",
  surface: "proposal",
  timeBucket: "allDay",
  timezone: "America/Toronto",
  title: "Foundation",
  warnings: [],
};

const commonProps = {
  actions: [],
  onClose: vi.fn(),
  onRequestEdit: vi.fn(),
  source: { id: "proposal-1", status: "draft", title: "Proposal" },
  surface: "proposal" as const,
  timeframe: "month" as const,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CalendarEventDetailDrawer schedule controls", () => {
  test("omits schedule edit controls for immutable proposal events", () => {
    render(
      <CalendarEventDetailDrawer
        {...commonProps}
        event={{
          ...draftEvent,
          editable: {
            ...draftEvent.editable,
            canMove: false,
            canResizeEnd: false,
            canResizeStart: false,
            immutableReason:
              "Only draft proposal schedules can be changed from the calendar.",
          },
          status: "planned",
        }}
      />,
    );

    expect(screen.queryByLabelText("Start date")).toBeNull();
    expect(screen.queryByLabelText("End date")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Preview schedule edit" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "Only draft proposal schedules can be changed from the calendar.",
      ),
    ).toBeTruthy();
  });

  test("keeps schedule edit controls available for draft proposal events", () => {
    render(<CalendarEventDetailDrawer {...commonProps} event={draftEvent} />);

    expect(screen.getByLabelText("Start date")).toBeTruthy();
    expect(screen.getByLabelText("End date")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Preview schedule edit" }),
    ).toBeTruthy();
  });
});
