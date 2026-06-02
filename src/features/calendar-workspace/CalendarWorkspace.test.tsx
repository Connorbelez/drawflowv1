// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CalendarWorkspace } from "./CalendarWorkspace";
import type { DrawFlowCalendarWorkspaceData } from "./calendarTypes";

afterEach(() => cleanup());

const workspace: DrawFlowCalendarWorkspaceData = {
  defaultTimeframe: "month",
  events: [
    {
      allDay: true,
      auditRequired: true,
      editable: {
        canChangeAssignee: false,
        canChangeStatus: false,
        canMove: true,
        canResizeEnd: true,
        canResizeStart: true,
        requiredReason: "scheduleChange",
      },
      endsAt: "2026-06-20",
      entity: { id: "milestone-1", key: "foundation", type: "milestone" },
      id: "proposal:milestone:foundation",
      kind: "milestone",
      metrics: { amountCents: 225_000_00, budgetCents: 250_000_00 },
      milestoneKey: "foundation",
      organizationId: "org-test",
      relatedEntityIds: ["proposal-1"],
      startsAt: "2026-06-01",
      status: "planned",
      subtitle: "Day 0 to 20",
      surface: "proposal",
      timeBucket: "allDay",
      timezone: "America/Toronto",
      title: "Foundation",
      warnings: [{ label: "Depends on permit", severity: "warning" }],
    },
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
  savedViews: [
    {
      filters: { eventKinds: ["draw"] },
      id: "capital-release",
      isDefault: false,
      label: "Capital release",
      timeframe: "month",
    },
  ],
  source: {
    id: "proposal-1",
    location: "Toronto, ON",
    status: "submitted",
    title: "Calendar proposal",
  },
  surface: "proposal",
  timeframes: ["day", "week", "month", "quarter", "agenda"],
  warnings: [{ label: "Depends on permit", severity: "warning" }],
};

const workspaceWithSuppressedEvents: DrawFlowCalendarWorkspaceData = {
  ...workspace,
  events: [
    ...workspace.events,
    {
      allDay: false,
      auditRequired: false,
      editable: {
        canChangeAssignee: false,
        canChangeStatus: false,
        canMove: false,
        canResizeEnd: false,
        canResizeStart: false,
        immutableReason: "Audit events are immutable.",
        requiredReason: "none",
      },
      entity: { id: "proposal-1", type: "proposal" },
      id: "proposal:audit:site-visit",
      kind: "audit",
      organizationId: "org-test",
      relatedEntityIds: ["proposal-1"],
      startsAt: "2026-06-02",
      status: "immutable",
      subtitle: "Audit history",
      surface: "proposal",
      timeBucket: "endOfDay",
      timezone: "America/Toronto",
      title: "build.site_visit.scheduled",
      warnings: [],
    } as unknown as DrawFlowCalendarWorkspaceData["events"][number],
    {
      allDay: true,
      auditRequired: false,
      editable: {
        canChangeAssignee: false,
        canChangeStatus: false,
        canMove: false,
        canResizeEnd: false,
        canResizeStart: false,
        requiredReason: "none",
      },
      entity: { id: "proposal-1", type: "proposal" },
      id: "proposal:workingCapital:window",
      kind: "workingCapital",
      organizationId: "org-test",
      relatedEntityIds: ["proposal-1"],
      startsAt: "2026-06-01",
      status: "planned",
      subtitle: "Borrower Working Capital Limit exposure window",
      surface: "proposal",
      timeBucket: "allDay",
      timezone: "America/Toronto",
      title: "Borrower working-capital exposure",
      warnings: [],
    } as unknown as DrawFlowCalendarWorkspaceData["events"][number],
  ],
};

describe("CalendarWorkspace", () => {
  test("renders the adapted EventManager with all PRD timeframes", () => {
    const onTimeframeChange = vi.fn();

    render(
      <CalendarWorkspace
        onTimeframeChange={onTimeframeChange}
        workspace={workspace}
      />,
    );

    expect(screen.getByTestId("drawflow-event-manager")).toBeTruthy();
    for (const label of ["Day", "Week", "Month", "Quarter", "Agenda"]) {
      expect(screen.getByRole("tab", { name: new RegExp(label, "i") })).toBeTruthy();
    }
    expect(screen.getAllByText("Foundation").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: /week/i }));
    expect(onTimeframeChange).toHaveBeenCalledWith("week");
  });

  test("applies saved view and search filters to projected events", () => {
    render(<CalendarWorkspace workspace={workspace} />);

    fireEvent.click(screen.getByRole("button", { name: /capital release/i }));
    expect(screen.getAllByText("Foundation reimbursement").length).toBeGreaterThan(0);
    expect(screen.queryByText("Day 0 to 20")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search calendar"), {
      target: { value: "no matching event" },
    });
    expect(screen.queryByText("Foundation reimbursement")).toBeNull();
  });

  test("renders milestone ranges only on start and end dates", () => {
    const { container } = render(<CalendarWorkspace workspace={workspace} />);

    const startDate = container.querySelector('[data-calendar-date="2026-06-01"]');
    const activeMiddleDate = container.querySelector('[data-calendar-date="2026-06-02"]');
    const endDate = container.querySelector('[data-calendar-date="2026-06-20"]');

    expect(startDate).toBeTruthy();
    expect(activeMiddleDate).toBeTruthy();
    expect(endDate).toBeTruthy();
    expect(within(startDate as HTMLElement).getByText("Foundation")).toBeTruthy();
    expect(within(startDate as HTMLElement).getByText("Start")).toBeTruthy();
    expect(within(activeMiddleDate as HTMLElement).queryByText("Foundation")).toBeNull();
    expect(within(endDate as HTMLElement).getByText("Foundation")).toBeTruthy();
    expect(within(endDate as HTMLElement).getByText("End")).toBeTruthy();
  });

  test("opens grouped EventManager menus without Base UI group context errors", () => {
    render(<CalendarWorkspace workspace={workspace} />);

    fireEvent.click(screen.getByRole("button", { name: /colors/i }));
    expect(screen.getByText("Filter by colors")).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText("Foundation actions")[0]);
    expect(screen.getByText("Open detail")).toBeTruthy();
  });

  test("does not render audit history or borrower exposure as calendar events", () => {
    render(<CalendarWorkspace workspace={workspaceWithSuppressedEvents} />);

    expect(screen.queryByText("build.site_visit.scheduled")).toBeNull();
    expect(screen.queryByText("Borrower working-capital exposure")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search calendar"), {
      target: { value: "site_visit" },
    });
    expect(screen.queryByText("build.site_visit.scheduled")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Search calendar"), {
      target: { value: "working-capital" },
    });
    expect(screen.queryByText("Borrower working-capital exposure")).toBeNull();
  });

  test("previews and commits editable schedule changes with audit reason", async () => {
    const onCommitEdit = vi.fn();

    render(
      <CalendarWorkspace
        onCommitEdit={onCommitEdit}
        workspace={workspace}
      />,
    );

    fireEvent.click(screen.getAllByText("Foundation")[0]);
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-06-03" },
    });
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Weather delay." },
    });
    fireEvent.click(screen.getByRole("button", { name: /preview schedule edit/i }));
    expect(screen.getByText("Preview schedule impact")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Commit edit" }));

    await waitFor(() =>
      expect(onCommitEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          nextStartsAt: "2026-06-03",
          reason: "Weather delay.",
        }),
      ),
    );
  });
});
