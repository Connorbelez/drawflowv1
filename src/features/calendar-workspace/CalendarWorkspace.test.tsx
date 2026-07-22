// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CalendarWorkspace } from "./CalendarWorkspace";
import { buildProposalCalendarActions } from "./adapters/proposalCalendarAdapter";
import type { DrawFlowCalendarWorkspaceData } from "./calendarTypes";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

const workspaceWithReminder: DrawFlowCalendarWorkspaceData = {
  ...workspace,
  events: [
    ...workspace.events,
    {
      allDay: true,
      auditRequired: false,
      editable: {
        canChangeAssignee: true,
        canChangeStatus: true,
        canMove: true,
        canResizeEnd: true,
        canResizeStart: true,
        requiredReason: "none",
      },
      entity: { id: "reminder-1", type: "calendarReminder" },
      id: "proposal:reminder:reminder-1",
      kind: "reminder",
      organizationId: "org-test",
      participants: [
        {
          displayName: "Production Builder",
          key: "builder:builder-1",
          participantType: "builderProfile",
          role: "builder",
        },
      ],
      relatedEntityIds: ["proposal-1", "builder-1"],
      startsAt: "2026-06-15",
      status: "planned",
      subtitle: "Coordinate the next inspection.",
      surface: "proposal",
      timeBucket: "allDay",
      timezone: "America/Toronto",
      title: "Coordination reminder",
      warnings: [],
    },
  ],
};

const workspaceWithCancelledReminder: DrawFlowCalendarWorkspaceData = {
  ...workspaceWithReminder,
  events: workspaceWithReminder.events.map((event) =>
    event.kind === "reminder"
      ? {
          ...event,
          editable: {
            ...event.editable,
            canChangeAssignee: false,
            canChangeStatus: false,
            canMove: false,
            canResizeEnd: false,
            canResizeStart: false,
            immutableReason:
              "Cancelled reminder events are retained for calendar history.",
          },
          status: "cancelled" as const,
        }
      : event,
  ),
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

  test("renders only compact timeframe navigation on phone layouts", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        matches: query.includes("max-width"),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
      })),
    );

    render(<CalendarWorkspace workspace={workspace} />);

    expect(await screen.findByRole("combobox")).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "Calendar timeframe" })).toBeNull();
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

  test("exposes each logical range once and removes visual fragments from sequential focus", () => {
    const { container } = render(<CalendarWorkspace workspace={workspace} />);

    expect(
      screen.getAllByRole("button", {
        name: "Foundation, 2026-06-01 to 2026-06-20, 20 days, All day, milestone, planned, Day 0 to 20, $225K, 1 warning",
      }),
    ).toHaveLength(1);

    const startDate = container.querySelector('[data-calendar-date="2026-06-01"]');
    const endDate = container.querySelector('[data-calendar-date="2026-06-20"]');
    expect(startDate).toBeTruthy();
    expect(endDate).toBeTruthy();
    expect(within(startDate as HTMLElement).queryByRole("button", { name: /Foundation/i })).toBeNull();
    expect(within(endDate as HTMLElement).queryByRole("button", { name: /Foundation/i })).toBeNull();
  });

  test("renders one logical agenda item per event without a duplicate agenda rail", () => {
    render(<CalendarWorkspace initialTimeframe="agenda" workspace={workspace} />);

    expect(screen.queryByTestId("calendar-agenda-rail")).toBeNull();
    expect(
      screen.getAllByRole("button", {
        name: "Foundation, 2026-06-01 to 2026-06-20, 20 days, All day, milestone, planned, 1 warning",
      }),
    ).toHaveLength(1);
    expect(
      screen
        .getAllByRole("button")
        .filter((element) =>
          element.getAttribute("aria-label")?.includes("Foundation"),
        )
        .filter(
          (element) =>
            !element.getAttribute("aria-label")?.includes("reimbursement"),
        ),
    ).toHaveLength(1);
  });

  test("renders calendar cards with dark mode contrast classes and accessible labels", () => {
    const { container } = render(<CalendarWorkspace workspace={workspace} />);

    const startDate = container.querySelector('[data-calendar-date="2026-06-01"]');
    expect(startDate).toBeTruthy();
    const gridEvent = within(startDate as HTMLElement)
      .getByText("Foundation")
      .closest('[aria-hidden="true"]');
    expect(gridEvent).toBeTruthy();
    expect(gridEvent?.className).toContain("dark:bg-amber-950/55");
    expect(gridEvent?.className).toContain("dark:text-amber-100");
    expect(gridEvent?.className).toContain("dark:border-amber-700/70");

    const agendaRail = screen.getByTestId("calendar-agenda-rail");
    const agendaEvents = within(agendaRail).getAllByRole("button", {
      name: "Foundation, 2026-06-01 to 2026-06-20, 20 days, All day, milestone, planned, Day 0 to 20, $225K, 1 warning",
    });
    for (const agendaEvent of agendaEvents) {
      expect(agendaEvent.className).toContain("dark:bg-muted/35");
      expect(agendaEvent.className).toContain("text-foreground");
    }
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

  test("limits reminder menus to one set of reminder-relevant actions", () => {
    render(
      <CalendarWorkspace
        actions={buildProposalCalendarActions({
          reviseDrawTiming: vi.fn(),
          reviseMilestoneSchedule: vi.fn(),
        })}
        onCreateReminderEvent={vi.fn()}
        onDeleteReminderEvent={vi.fn()}
        onUpdateReminderEvent={vi.fn()}
        workspace={workspaceWithReminder}
      />,
    );

    fireEvent.click(screen.getAllByLabelText("Coordination reminder actions")[0]);

    expect(screen.getAllByText("Open detail")).toHaveLength(1);
    expect(screen.getByText("Edit reminder")).toBeTruthy();
    expect(screen.getByText("Export event")).toBeTruthy();
    expect(screen.getByText("Cancel reminder")).toBeTruthy();
    expect(screen.queryByText("New reminder event")).toBeNull();
    expect(screen.queryByText("Copy link")).toBeNull();
    expect(screen.queryByText("Move proposal dates")).toBeNull();
    expect(screen.queryByText("Edit draw timing")).toBeNull();
  });

  test("confirms reminder cancellation and records the optional reason", async () => {
    const onDeleteReminderEvent = vi.fn();
    render(
      <CalendarWorkspace
        onDeleteReminderEvent={onDeleteReminderEvent}
        workspace={workspaceWithReminder}
      />,
    );

    fireEvent.click(screen.getAllByLabelText("Coordination reminder actions")[0]);
    fireEvent.click(screen.getByText("Cancel reminder"));

    expect(onDeleteReminderEvent).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {
      name: "Cancel Coordination reminder?",
    });
    expect(dialog.textContent).toContain(
      "The reminder stays in calendar history",
    );
    expect(dialog.textContent).toContain(
      "Assigned participants may receive cancellation notifications",
    );
    fireEvent.change(
      within(dialog).getByLabelText("Cancellation reason (optional)"),
      { target: { value: "Inspection moved to the build schedule." } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancel reminder" }),
    );

    await waitFor(() =>
      expect(onDeleteReminderEvent).toHaveBeenCalledWith({
        eventId: "reminder-1",
        reason: "Inspection moved to the build schedule.",
      }),
    );
  });

  test("returns focus to the reminder action trigger when cancellation is dismissed", async () => {
    render(
      <CalendarWorkspace
        onDeleteReminderEvent={vi.fn()}
        workspace={workspaceWithReminder}
      />,
    );

    const actionTrigger = screen.getAllByLabelText(
      "Coordination reminder actions",
    )[0];
    fireEvent.click(actionTrigger);
    fireEvent.click(screen.getByText("Cancel reminder"));
    expect(
      screen.getByRole("dialog", { name: "Cancel Coordination reminder?" }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Cancel Coordination reminder?",
        }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(actionTrigger);
  });

  test("keeps cancelled reminders read-only and auditable", () => {
    render(
      <CalendarWorkspace
        onDeleteReminderEvent={vi.fn()}
        onUpdateReminderEvent={vi.fn()}
        workspace={workspaceWithCancelledReminder}
      />,
    );

    fireEvent.click(screen.getAllByLabelText("Coordination reminder actions")[0]);
    expect(screen.queryByText("Edit reminder")).toBeNull();
    expect(screen.queryByText("Cancel reminder")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getAllByText("Coordination reminder")[0]);
    expect(
      screen.getByText(
        "Cancelled reminder events are retained for calendar history.",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Start date")).toBeNull();
    expect(screen.queryByLabelText("End date")).toBeNull();
  });

  test("creates reminder-only calendar events from the workspace toolbar", async () => {
    const onCreateReminderEvent = vi.fn();

    render(
      <CalendarWorkspace
        assignableParticipants={[
          {
            displayName: "Production Builder",
            key: "builder:builder-1",
            participantType: "builderProfile",
            role: "builder",
          },
        ]}
        onCreateReminderEvent={onCreateReminderEvent}
        workspace={workspace}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /new event/i }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Follow up with builder" },
    });
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-06-15" },
    });
    fireEvent.click(screen.getByText("Production Builder"));
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() =>
      expect(onCreateReminderEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedParticipants: [
            expect.objectContaining({ participantType: "builderProfile" }),
          ],
          startsAt: "2026-06-15",
          title: "Follow up with builder",
        }),
      ),
    );
  });

  test("creates reminder-only calendar events from the date right-click menu", async () => {
    const onCreateReminderEvent = vi.fn();

    const { container } = render(
      <CalendarWorkspace
        onCreateReminderEvent={onCreateReminderEvent}
        workspace={workspace}
      />,
    );

    const dateCell = container.querySelector('[data-calendar-date="2026-06-15"]');
    expect(dateCell).toBeTruthy();
    fireEvent.contextMenu(dateCell as HTMLElement);
    fireEvent.click(screen.getByText("New reminder event"));
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe(
      "2026-06-15",
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Check in request" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() =>
      expect(onCreateReminderEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          startsAt: "2026-06-15",
          title: "Check in request",
        }),
      ),
    );
  });

  test("creates reminder-only calendar events from an occupied date right-click menu", async () => {
    const onCreateReminderEvent = vi.fn();

    const { container } = render(
      <CalendarWorkspace
        onCreateReminderEvent={onCreateReminderEvent}
        workspace={workspace}
      />,
    );

    const dateCell = container.querySelector('[data-calendar-date="2026-06-20"]');
    expect(dateCell).toBeTruthy();
    const eventTile = within(dateCell as HTMLElement)
      .getByText("Foundation")
      .closest('[aria-hidden="true"]');
    expect(eventTile).toBeTruthy();

    fireEvent.contextMenu(eventTile as HTMLElement);
    fireEvent.click(screen.getByText("New reminder event"));
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe(
      "2026-06-20",
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Site visit coordination" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() =>
      expect(onCreateReminderEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          startsAt: "2026-06-20",
          title: "Site visit coordination",
        }),
      ),
    );
  });

  test("hides reminder creation when no proposal reminder handler is wired", () => {
    const { container } = render(<CalendarWorkspace workspace={workspace} />);

    expect(screen.queryByRole("button", { name: /new event/i })).toBeNull();

    const dateCell = container.querySelector('[data-calendar-date="2026-06-15"]');
    expect(dateCell).toBeTruthy();
    fireEvent.contextMenu(dateCell as HTMLElement);
    expect(screen.queryByText("New reminder event")).toBeNull();
  });

  test(
    "previews and commits editable schedule changes with audit reason",
    async () => {
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
    },
    15_000,
  );
});
