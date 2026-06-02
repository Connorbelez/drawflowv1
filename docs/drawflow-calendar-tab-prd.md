# DrawFlow Calendar Tab PRD

**Product:** DrawFlow
**Module:** Reusable proposal and active build calendar workspace
**Surfaces:** `/backoffice/proposals/$planId`, `/builder/proposals/$proposalId`, `/backoffice/builds/$buildId`, `/builder/builds/$buildId`
**Document type:** Product Requirements Document
**Status:** Product draft for implementation scoping
**Created:** June 2, 2026
**Primary audience:** Product, engineering, design, backoffice operations, implementation agents
**Related documents:** `docs/draw_flow_prd.md`, `docs/draw_flow_production_prd.md`, `PRODUCT.md`, `DESIGN.md`, `docs/mobile-accessibility-audit.md`

---

## 1. Purpose

Stakeholders asked for a calendar view on build and proposal detail routes. In DrawFlow, that cannot be a generic date picker or project-management calendar. The calendar must become a reusable time-control workspace for construction lending: milestone timing, draw eligibility, evidence deadlines, site visits, review windows, admin decisions, working-capital pressure, and capital release.

This PRD defines one reusable calendar component system used by both Build Proposal and Active Build routes. The shared component is domain-agnostic enough to render any DrawFlow calendar event, but domain-aware enough to expose reimbursement, evidence, site visit, approval, and draw-release actions through decoupled action providers.

The implementation must adapt `src/components/ui/event-manager.tsx`. Do not roll a separate planner from scratch. The existing EventManager's event, timeframe, drag/drop, and filtering model becomes the base interaction model, expanded into a full-surface, multi-timeframe DrawFlow calendar workspace.

The calendar must support all three operating modes:

1. Visibility: see the complete schedule and operational risk.
2. Editability: adjust planned/proposed dates and workflow dates where the domain allows it.
3. Coordination: schedule site visits, export/sync calendar data, and operate from contextual command menus.

## 2. Product Thesis

The DrawFlow calendar answers four questions:

1. **What is happening when?** Milestones, submilestones, evidence, site visits, reviews, decisions, draw readiness, releases, payback dates, and working-capital pressure.
2. **What needs action now?** Overdue work, blocked dependencies, expiring review windows, missing evidence, unscheduled site visits, ready-for-admin decisions, and ready-to-release draws.
3. **What can I change?** Dates and assignments that are still planned/proposed, plus revision workflows for material schedule changes.
4. **What does this change affect?** Draw timing, borrower working-capital exposure, site visit queues, review SLAs, audit history, and reimbursement readiness.

The calendar is not a replacement for the Gantt or timeline. The Gantt explains sequence and dependencies. The timeline explains construction and capital flow. The calendar explains operational days: who needs to do what, on which date, roughly when during that day, and before what reimbursement or review consequence.

## 3. Current State

The active build detail surface already has a `calendar` tab, but it only renders the shared `Calendar` primitive with selected milestone and draw dates plus a milestone list. It does not provide a month agenda, event density, filters, workflow actions, right-click commands, date editing, site visit scheduling, or proposal-route reuse.

Proposal review/detail surfaces currently expose timeline, draw schedule, materials, packet, and review/closing tabs. They do not expose a calendar tab.

Relevant existing primitives and patterns:

- `src/components/ui/calendar.tsx` wraps `react-day-picker`.
- `src/components/ui/event-manager.tsx` is the existing calendar/event component to adapt. It currently renders reusable event data across month, week, day, and list modes with inline event management. This is the required starting point for the new calendar workspace.
- `src/components/ui/context-menu.tsx` provides Base UI context menu primitives.
- `src/components/ui/dropdown-menu.tsx`, `src/components/ui/drawer.tsx`, `src/components/ui/sheet.tsx`, `src/components/ui/frame.tsx`, and `src/components/ui/card.tsx` already provide the required interaction vocabulary.
- `src/components/roadmap/AnimatedCurvedTimeline.tsx` already supports contextual insert actions.
- Active build and proposal surfaces already have mutations for milestone starts, milestone edits, site visit assignment, milestone approval/rejection, draw request/release, material planning, and proposal schedule edits.

## 4. Non-Negotiable Domain Rules

1. DrawFlow v1 remains reimbursement-only. The calendar must never imply advance funding before work is completed, evidenced, reviewed, approved, and released.
2. Interest begins only after funds are released. Release dates may be shown as interest-relevant dates; proposed draw timing may not be labelled as released capital.
3. Proposed/planned schedule dates may be edited. Actual evidence, approval, release, and audit timestamps are immutable. Corrections create new audit/revision records.
4. Borrower Working Capital Limit remains distinct from Lender Draw Policy Limit. The calendar must show both impacts separately where relevant.
5. Geofence failure must not discard evidence. Location-unverified evidence remains on the calendar and routes to review.
6. Builder, broker, backoffice, principal broker, contractor, and site visitor authority boundaries must be explicit. Calendar actions are hidden or disabled based on capability, but server-side authorization remains authoritative.
7. Material calendar changes require audit events with actor, role, timestamp, prior state, new state, reason, warnings, and affected entities.
8. Every event and action is organization-scoped.

## 5. Goals

### 5.1 User Goals

- Builders can see upcoming milestone windows, evidence deadlines, site visits, draw eligibility, and reimbursement timing in a familiar date-based view.
- Brokers and backoffice staff can operate the day's work from the calendar without reconstructing state from tables, kanbans, and timelines.
- Principal brokers and admins can see which dates affect capital release, approval risk, and interest exposure.
- Site visit staff can understand assigned visit timing and scope.

### 5.2 Product Goals

- Introduce one reusable calendar component used across proposal and active build surfaces.
- Expand the adapted `EventManager` into a full-width, full-height planning surface that uses as much available route space as possible.
- Normalize proposal and active build schedule data into a shared event contract.
- Decouple calendar rendering from domain mutations through action providers.
- Support contextual right-click menus on days, event ranges, agenda rows, and empty time slots.
- Support multi-timeframe switching without leaving the tab.
- Support editable calendar workflows while preserving audit, RBAC, and reimbursement constraints.
- Add external calendar export/sync after the internal calendar is reliable.

### 5.3 Business Goals

- Reduce missed review, evidence, and site visit handoffs.
- Reduce draw-cycle delays caused by unclear timing.
- Improve schedule variance visibility before a draw becomes blocked.
- Give stakeholders a trusted single view of "what happens this week" for a build or proposal.

## 6. Non-Goals

- No free-form generic calendar unrelated to a Build, Build Proposal, Milestone, Draw Group, Evidence Package, Site Visit, or Loan Facility.
- No proactive advance-funding workflow.
- No mutation of immutable actual timestamps.
- No full contractor resource-level scheduling optimizer in this slice.
- No multi-build portfolio calendar in this PRD. This PRD covers detail-route calendars. Portfolio calendar can compose the same component later.
- No dependency on Google Calendar, Outlook, or ICS for core product correctness.

## 7. Personas And Jobs To Be Done

| Persona | Calendar job |
|---|---|
| Builder / Builder Staff | See what work is planned, what evidence is due, when reimbursement could become available, and what schedule edits need lender review. |
| Broker | Review proposal calendar feasibility, spot compressed or risky schedules, coordinate backoffice work, and manage builder expectations. |
| Backoffice Staff | Schedule evidence review and site visits, request missing information, prepare admin decisions, and resolve overdue operational work. |
| Principal Broker / Admin | Approve material changes, override site visit/evidence exceptions, approve milestones, release draws, and review capital timing risk. |
| Site Visit Staff / Inspector | See assigned visits, target milestone scope, scheduled window, token state, and report due date. |

## 8. Required Surfaces

### 8.1 Proposal Calendar

Routes:

- `/backoffice/proposals/$planId?tab=calendar`
- `/builder/proposals/$proposalId?tab=calendar`

Purpose:

- Convert a proposed Construction Roadmap and selected/reviewed Draw Plan into a date-based planning and review workspace.

Must show:

- Proposed milestone and submilestone spans.
- Dependency relationships and dependency violations.
- Proposed draw timing and draw availability windows.
- Borrower working-capital pressure periods.
- Lender draw policy limit warnings.
- Evidence requirements and assumed evidence submission dates.
- Estimated review/site-visit/admin lag where policy requires it.
- Missing document/permit deadlines where they block proposal approval or closing.
- Contractor assignment gaps where they affect schedule confidence.
- Proposal submission, approval, requested-change, rejection, and closing events.

Primary editable objects:

- Proposal milestone start/end dates.
- Proposal submilestone dates where present.
- Milestone dependencies.
- Draw timing days and draw labels where the proposal is editable.
- Evidence due assumptions.
- Site visit lag assumptions.
- Contractor assignment windows where contractor planning is enabled.

Proposal calendar edits update proposal planning state. They do not create active build execution records until approval and closing.

### 8.2 Active Build Calendar

Routes:

- `/backoffice/builds/$buildId?tab=calendar`
- `/builder/builds/$buildId?tab=calendar`

Purpose:

- Convert the live Build Workspace into a date-based execution and reimbursement control plane.

Must show:

- Planned vs actual milestone windows.
- Started, completed, submitted-for-review, approved, rejected, and blocked milestone events.
- Evidence package due/submitted/reviewed/missing-info events.
- Location-unverified evidence review events.
- Site visit requested/scheduled/opened/submitted/completed/needs-rework events.
- Staff review SLA dates.
- Admin decision dates.
- Draw group readiness, draw request, approval, release, and receipt events.
- Working-capital pressure and draw recovery windows.
- Loan payback date and interest-relevant release dates.
- Budget revision and schedule variance events.
- Schedule revision records that materially change dates. Audit history is accessible from related-event actions and detail surfaces, not rendered as standalone calendar rows.

Primary editable objects:

- Planned milestone start/end dates before completion.
- Active milestone schedule revisions after start, with reason.
- Evidence due dates and missing-information response dates.
- Site visit scheduled windows, assignees, token dispatch timing, and rework dates.
- Staff review due dates.
- Admin decision target dates.
- Draw request target dates where not yet requested.
- Draw release target dates where not yet released and only after eligibility is satisfied.
- Loan payback change requests through the facility-change workflow, not direct silent edits.

Actual event timestamps remain immutable. If an actual release or approval was recorded incorrectly, correction requires an explicit audit correction workflow, not drag/drop mutation of the old timestamp.

## 9. Shared Calendar Component Requirements

### 9.1 Component Contract

The reusable component should be implemented as a feature-level calendar workspace that adapts the existing UI EventManager. The primitive `Calendar` remains useful for date picking, but it must not become the planner surface. The existing `EventManager` owns the visual starting point: reusable event rendering, timeframe navigation, filtering, and drag/drop event management.

Implementation requirement:

- Use and modify `src/components/ui/event-manager.tsx` directly.
- Preserve the EventManager interaction model, but expand it from a generic event component into a responsive full-surface planning board.
- Refactor `EventManager` to accept DrawFlow calendar events, timeframe state, filters, selected events, context menu actions, and edit callbacks.
- Keep `CalendarWorkspace` as the route/domain adapter shell that feeds data and actions into the adapted EventManager.
- Do not build a parallel month/week/day calendar renderer from scratch.
- Remove or disable the current generic inline "Add event" behavior unless an adapter supplies a valid DrawFlow action for the selected date.

Proposed feature boundary:

- `src/components/ui/event-manager.tsx`
- `src/features/calendar-workspace/CalendarWorkspace.tsx`
- `src/features/calendar-workspace/calendarTypes.ts`
- `src/features/calendar-workspace/calendarEventProjection.ts`
- `src/features/calendar-workspace/CalendarContextMenu.tsx`
- `src/features/calendar-workspace/CalendarAgendaRail.tsx`
- `src/features/calendar-workspace/CalendarEventDetailDrawer.tsx`
- `src/features/calendar-workspace/adapters/proposalCalendarAdapter.ts`
- `src/features/calendar-workspace/adapters/activeBuildCalendarAdapter.ts`

The adapted EventManager and shared workspace must not import Convex APIs, proposal mutations, or active build mutations directly. They receive events, selection state, filters, timeframe state, and action descriptors from the route-specific adapter.

The current generic `Event` shape is insufficient by itself. It must be extended or wrapped with the DrawFlow event contract below. `EventManagerProps` must add controlled timeframe state (`view`, `onViewChange`), controlled selected date/event state, DrawFlow source/surface context, and action callbacks supplied by the `CalendarWorkspace` adapter shell.

Minimum TypeScript contract:

```ts
export type CalendarSurface = "proposal" | "activeBuild";

export type CalendarTimeframe =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "agenda";

export type CalendarTimeBucket =
  | "allDay"
  | "earlyMorning"
  | "morning"
  | "midday"
  | "afternoon"
  | "endOfDay"
  | "evening"
  | "unscheduled";

export type CalendarEventKind =
  | "milestone"
  | "submilestone"
  | "dependency"
  | "draw"
  | "drawGroup"
  | "evidence"
  | "siteVisit"
  | "review"
  | "adminDecision"
  | "workingCapital"
  | "loan"
  | "budgetRevision"
  | "contractor";

export type CalendarEventStatus =
  | "planned"
  | "proposed"
  | "inProgress"
  | "blocked"
  | "overdue"
  | "submitted"
  | "inReview"
  | "ready"
  | "approved"
  | "rejected"
  | "released"
  | "completed"
  | "cancelled"
  | "immutable";

export interface DrawFlowCalendarEvent {
  id: string;
  organizationId: string;
  surface: CalendarSurface;
  kind: CalendarEventKind;
  status: CalendarEventStatus;
  title: string;
  subtitle?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  timeBucket: CalendarTimeBucket;
  timezone: string;
  entity:
    | { type: "proposal"; id: string }
    | { type: "activeBuild"; id: string }
    | { type: "milestone"; key: string; id?: string }
    | { type: "draw"; key: string; id?: string }
    | { type: "siteVisit"; id: string }
    | { type: "evidencePackage"; id: string }
    | { type: "loanFacility"; id: string };
  relatedEntityIds: string[];
  ownerUserId?: string;
  assigneeUserId?: string;
  drawGroupKey?: string;
  milestoneKey?: string;
  warnings: CalendarEventWarning[];
  metrics?: {
    amountCents?: number;
    exposureCents?: number;
    budgetCents?: number;
    progressPercent?: number;
  };
  editable: CalendarEditCapability;
  auditRequired: boolean;
}
```

### 9.2 Edit Capability Contract

```ts
export interface CalendarEditCapability {
  canMove: boolean;
  canResizeStart: boolean;
  canResizeEnd: boolean;
  canChangeAssignee: boolean;
  canChangeStatus: boolean;
  immutableReason?: string;
  requiredReason?: "none" | "scheduleChange" | "materialDecision" | "override";
}
```

The component renders edit affordances from capability flags. It never guesses permissions by event kind alone.

### 9.3 Action Contract

```ts
export interface CalendarAction {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: "default" | "warning" | "destructive";
  availability:
    | { state: "enabled" }
    | { state: "disabled"; reason: string }
    | { state: "hidden"; reason: string };
  requiresReason: boolean;
  requiresConfirmation: boolean;
  appliesTo: "event" | "date" | "dateRange" | "selection";
  onSelect: (context: CalendarActionContext) => Promise<void> | void;
}
```

Proposal and active build adapters provide the available actions. The shared calendar displays them in context menus, agenda overflow menus, drawer buttons, and keyboard command surfaces.

## 10. Multi-Timeframe Planner Views

The adapted EventManager must support multi-timeframe switching inside the same tab. The user should be able to glance at the surface and know what is on each day and roughly when during that day without opening every event.

The planner should consume all available route space:

- No fixed 380px widget width.
- No small date-picker-first layout.
- Minimum desktop layout target: full tab width, `calc(100dvh - app shell/header/tabs)` height, with internal scrolling.
- The primary event surface should stay visible while filters, detail drawers, and context menus open.
- On wide desktop, the planner stream/grid should take the dominant column, with agenda/detail rails secondary.

### 10.1 Timeframe Switcher

Required timeframes:

- **Day:** one day with time bands for site visits, review windows, admin decisions, and timed actions.
- **Week:** seven-day operational planner, default for backoffice coordination and site-visit scheduling.
- **Month:** high-density day stream or grid showing every day, event count, highest-risk events, draw/release markers, and milestone ranges.
- **Quarter / Roadmap:** long-range planning view for milestone spans, draw groups, working-capital pressure, and proposal feasibility.
- **Agenda:** list-first timeframe, default for mobile and for "needs my action" triage.

The selected timeframe persists in the route search params and per-user saved view preferences.

### 10.2 Month Planner

Default for proposal feasibility review and broad active-build schedule review.

Requirements:

- Adapt the existing vertical day stream so all days are scannable and event-dense.
- Each day row must show event blocks grouped by rough time bucket: morning, midday, afternoon, end-of-day, all-day, or unscheduled.
- Multi-day milestone and draw-group ranges must be visible across day rows or as connected range markers.
- Highest-risk events appear first in each day.
- Dense days show the top events plus an overflow count that opens the full day agenda.
- Right-clicking a day opens date actions.
- Right-clicking an event opens event actions.
- Dragging an editable event moves its date range after previewing impact.
- Resizing an editable range changes start/end dates.

### 10.3 Week Planner

Default for backoffice operations and site visit scheduling.

Requirements:

- Seven-day planner with visible time bands.
- All-day milestone/draw events stay anchored above timed bands.
- Site visits, review windows, admin decision targets, contractor windows, and sync events can have times.
- Events visually encode rough time even when exact time is absent.
- Drag/drop and resize support timed scheduling where allowed.
- Collision display for overlapping site visits and review work.
- Week view must remain usable without opening the detail drawer.

### 10.4 Day Planner

Default for high-density operational days.

Requirements:

- Single-day schedule with time bands.
- "Needs my action" lane for approvals, missing information, review, release, and site visit dispatch.
- "Capital movement" lane for draw readiness, approval, release, receipt, and interest-relevant dates.
- "Field work" lane for milestones, contractor windows, evidence, and site visits.
- Inline rescheduling for timed events where allowed.
- Right-click and keyboard action parity.

### 10.5 Agenda Planner

Default for mobile.

Requirements:

- Group events by date and rough time bucket.
- Show today, upcoming seven days, overdue, and unscheduled sections.
- Every event row has a touch-accessible overflow menu equivalent to right-click actions.
- Supports quick filters and search.
- Supports inline date edit where a full grid is not ergonomic.

### 10.6 Quarter / Roadmap Planner

Long-range view for planning and capital timing.

Requirements:

- Show milestone spans, draw groups, working-capital pressure, and proposed/released draw timing over multiple months.
- Highlight dependency chain and critical reimbursement path.
- Make date density glanceable without requiring exact per-day detail.
- Links back to existing timeline/Gantt tab with selected milestone/draw context.

## 11. Contextual Menus

Context menus are first-class, not decorative. They are the fastest way for operators to act from the calendar.

Use existing `ContextMenu` primitives for desktop right-click and existing `DropdownMenu` or `DrawerMenu` primitives for mobile/touch equivalents.

### 11.1 Date Context Menu

Opened from empty day/time slots.

Proposal actions:

- Add milestone on date.
- Add submilestone under selected milestone.
- Add dependency checkpoint.
- Add evidence due date.
- Add contractor assignment window.
- Move proposal start date to this day.
- Add review/site-visit lag assumption.

Active build actions:

- Schedule site visit.
- Add evidence due date.
- Request builder status update.
- Add internal review target.
- Add admin decision target.
- Start milestone on this date where legal.
- Create schedule revision.

### 11.2 Event Context Menu

Opened from event bars, agenda rows, or detail drawer action menus.

Milestone actions:

- Open milestone detail.
- Start work.
- Move dates.
- Resize duration.
- Mark complete / submit completion package where role allows.
- Request missing information.
- Request site visit.
- Recommend approval.
- Approve/reject milestone where authority allows.
- View audit history.

Draw actions:

- Open draw group.
- Edit draw timing where still planned/proposed.
- Request draw.
- Approve draw.
- Release draw where eligible and authorized.
- View included milestones.
- View release audit trail.

Evidence actions:

- Open evidence package.
- Request missing evidence.
- Accept location-unverified evidence with override reason where authorized.
- Reject evidence.
- Link evidence to site visit or milestone.

Site visit actions:

- Schedule/reschedule.
- Assign/reassign inspector.
- Dispatch token.
- Regenerate token.
- Cancel visit.
- Open mobile site visit route.
- Review submitted report.
- Request rework.

Loan/facility actions:

- View facility.
- Request payback extension.
- Request principal increase.
- View interest-relevant released draws.

Immutable actual events:

- Open detail.
- View audit history.
- Create correction request.

### 11.3 Bulk Context Menu

When multiple events are selected:

- Move selected planned events by N days.
- Assign selected site visits.
- Add review targets.
- Export selected events.
- Request status update for selected milestones.
- Clear selected filters.

Bulk actions must validate legality per event. If some events are ineligible, the action dialog must list included and excluded events before execution.

## 12. Editing Requirements

### 12.1 Direct Manipulation

The calendar must support:

- Drag/drop move for editable events.
- Range resize for editable milestone, submilestone, contractor, review, and site visit events.
- Inline date/time fields in the event detail drawer.
- Keyboard date edits.
- Multi-select move by fixed offset.

### 12.2 Impact Preview

Before committing a material edit, show an impact preview:

- Affected milestone dates.
- Affected dependency dates.
- Draw timing changes.
- Working-capital exposure change.
- Site visit/review/admin dates shifted or left unchanged.
- Warnings for compressed schedule, policy limit, missing evidence, or impossible release.
- Whether audit reason is required.

### 12.3 Commit Behavior

All calendar edits must commit through domain-specific action handlers.

Proposal edit examples:

- `updateProposalMilestone`
- `updateProposalDrawScheduleRow`
- proposal material/equipment planning actions where dates are relevant

Active build edit examples:

- `startActiveBuildMilestoneWork`
- `requestActiveBuildMilestoneInfo`
- `assignActiveBuildSiteVisit`
- `approveActiveBuildMilestone`
- `rejectActiveBuildMilestone`
- `requestActiveBuildDraw`
- `releaseActiveBuildDraw`
- schedule revision mutations to be added where current production APIs do not expose date-change semantics

No calendar action may bypass workflow state checks.

### 12.4 Audit Reason Rules

Reason required:

- Active build milestone date change after work has started.
- Any change that shifts draw eligibility.
- Site visit cancellation or reschedule after token dispatch.
- Admin decision target change after evidence submission.
- Draw release target change.
- Approval, rejection, release, override, or correction.

Reason optional:

- Draft proposal date edits before submission.
- Builder-side planning edits before proposal submission.
- Non-material filter/view preferences.

Reason disallowed:

- Pure client-side view changes.
- Expanding/collapsing agenda sections.

## 13. Event Projection Requirements

Adapters must normalize source data into `DrawFlowCalendarEvent[]`.

### 13.1 Proposal Event Sources

- Proposal metadata: created, submitted, approved, rejected, closed.
- Proposal milestones and submilestones.
- Proposal dependencies.
- Proposal draw schedule rows.
- Capital plan values and selected draw plan assumptions.
- Proposal documents and permit/waiver state.
- Proposal contractor assignments.
- Proposal cost items where scheduled.
- Audit events for detail/history context only; they must not be projected as calendar events.

### 13.2 Active Build Event Sources

- Active build metadata and start date.
- Build milestones and submilestones.
- Draw schedule rows and draw groups.
- Loan facility and facility change requests.
- Evidence packages and files.
- Site visits and token state.
- Completion claims and reviews.
- Contractor assignments.
- Budget/cost items and revisions.
- Audit events for detail/history context only; they must not be projected as calendar events.
- Quick action events where they represent material workflow dates.

### 13.3 Derived Events

The calendar must derive:

- Overdue milestone end.
- Evidence due based on milestone completion or policy.
- Review due based on evidence submission.
- Site visit due based on required inspection and requested date.
- Admin decision due after review/site visit completion.
- Draw ready date when all included milestones are approved.
- Draw release target date after approval and readiness.
- Working-capital pressure window where unreimbursed exposure approaches/exceeds limit.
- Interest-relevant date when funds are released.

Derived events must be labelled as derived. Editing a derived event must either edit its source object or open a workflow to create an explicit target date.

## 14. Filters And Saved Views

Required filters:

- Event kind.
- Status.
- Owner/assignee.
- Milestone.
- Draw group.
- Contractor.
- Risk only.
- Overdue only.
- Needs my action.
- Immutable actuals.
- Editable planned items.

Saved views:

- My week.
- Capital release.
- Site visits.
- Evidence and review.
- Milestone schedule.
- Proposal feasibility.
- Overdue and blocked.

Saved views persist per user and surface. Organization administrators may define organization defaults later.

## 15. Detail Drawer

Clicking an event opens a detail drawer. The drawer must be shared and driven by event kind, with adapters supplying detail sections and actions.

Required drawer sections:

- Header: title, status, date range, entity link.
- Schedule: start/end, timezone, edit affordances where allowed.
- Domain context: milestone/draw/site visit/evidence summary.
- Financial context where relevant: amount, exposure, budget, draw availability, interest relevance.
- Warnings: blocked dependencies, overdue, policy, working capital, geofence, missing evidence.
- Actions: same action model as context menus.
- Audit trail: material changes for this event/entity.

The drawer should not become a modal-first flow. Inline editing and progressive sections are preferred. Confirmation dialogs appear only for destructive or material final actions.

## 16. Permissions And RBAC

The calendar uses role-aware actions but does not trust client-side checks.

Default behavior:

- Builders can edit draft proposal dates and permitted active build progress dates, upload evidence, and request review/draws where policy allows.
- Builder staff inherit narrower builder permissions based on organization policy.
- Brokers and backoffice staff can review, schedule, request, recommend, and prepare work, but cannot silently become final approvers.
- Principal brokers/admins can approve, reject, override, release, and change high-authority dates where policy allows.
- Site visitors can only see and act on assigned/token-scoped visit events.

Disabled actions must explain the authority boundary. Example: "Requires Principal Broker to release draw."

## 17. External Calendar Export And Sync

External sync is required in Phase 3, after internal event projection and editing are stable.

### 17.1 Export

Support:

- Download ICS for current timeframe/view.
- Copy subscription URL for read-only calendar feed.
- Export selected events.
- Export role-filtered feeds, such as site visits assigned to me.

### 17.2 Sync

Support:

- Google Calendar and Outlook integration where available.
- One-way outbound sync for milestone, evidence, review, site visit, admin decision, and draw target dates.
- Inbound sync only for site visit scheduled time changes in v1, and only through explicit reconciliation.

Inbound changes must not silently mutate DrawFlow domain state. They create pending calendar sync changes requiring review if they affect audited workflow dates.

### 17.3 Webhooks

Calendar-relevant mutations should write event outbox records where integrations are configured:

- `calendar.event.created`
- `calendar.event.updated`
- `calendar.event.cancelled`
- `site_visit.scheduled`
- `site_visit.rescheduled`
- `draw.release_target_updated`
- `milestone.schedule_revised`

## 18. Mobile Requirements

Mobile default is agenda-first.

Requirements:

- Agenda view must be fully usable at 320px width.
- Touch long-press opens the same contextual actions as desktop right-click.
- Event rows have explicit overflow buttons for discoverability.
- Month/week/day planner views may be available, but cannot be the only editing surface.
- Editing date/time uses mobile-friendly inputs and drawers.
- Text must not overflow event rows or buttons.
- Calendar must avoid desktop-only horizontal scroll tables.

## 19. Accessibility Requirements

- Keyboard navigation across days, events, views, filters, and menus.
- Screen reader labels for event kind, status, date, amount, and action availability.
- Live region updates for drag/drop previews, moved events, and real-time status changes.
- Color is never the sole signal; statuses require text or icon labels.
- Right-click actions must also be reachable by keyboard and visible buttons.
- Focus returns to the originating event after closing a drawer or menu.
- Reduced motion support for drag/drop and view transitions.

## 20. Design Requirements

The calendar is product UI, not a marketing page.

Use:

- `Frame` and `FramePanel` for structural shells.
- `Card` for actual content cards and event detail blocks.
- The adapted `src/components/ui/event-manager.tsx` as the core planner surface.
- Existing `Calendar`, `ContextMenu`, `DropdownMenu`, `Drawer`, `Sheet`, `Tabs`, `Button`, `Badge`, and form primitives.
- Lucide icons for standard controls and actions.
- DrawFlow vocabulary from the PRD.

Avoid:

- Custom wrapper cards made from ad hoc `rounded border bg p shadow` classes.
- Nested cards.
- Side-stripe accent borders.
- Decorative gradients, glass, bokeh, or hero-style composition.
- Generic "task" language where DrawFlow domain terms apply.

Visual priority:

1. Today and selected date.
2. Needs-my-action events.
3. Overdue/blocked events.
4. Capital-affecting events.
5. Normal planned events.
6. Immutable historical events.

Spatial priority:

1. Planner surface gets the maximum available route space.
2. Event rows must show enough content to identify the day, rough time, domain object, status, and owner without opening a drawer.
3. Detail and filter panels are secondary. They may collapse, overlay, or dock, but they must not shrink the planner into a small widget.

## 21. Backend Requirements

### 21.1 New Read APIs

Add or adapt Convex functions using `fluent-convex`:

- `getProposalCalendarWorkspace`
- `getActiveBuildCalendarWorkspace`

Each returns:

- source entity summary,
- normalized calendar events,
- filter metadata,
- available saved views,
- role/capability summary,
- warnings,
- audit snippets relevant to visible events.

### 21.2 New Mutation APIs

Where existing mutations are insufficient, add explicit calendar-safe mutations:

- `reviseProposalMilestoneSchedule`
- `reviseProposalDrawTiming`
- `reviseActiveBuildMilestoneSchedule`
- `setEvidenceDueDate`
- `setReviewTargetDate`
- `setAdminDecisionTargetDate`
- `scheduleActiveBuildSiteVisit`
- `rescheduleActiveBuildSiteVisit`
- `cancelActiveBuildSiteVisit`
- `setDrawReleaseTargetDate`
- `requestLoanFacilityDateChange`
- `createCalendarSyncSubscription`
- `recordExternalCalendarSyncChange`

All Convex functions must use `fluent-convex` chains and follow `convex/_generated/ai/guidelines.md`.

### 21.3 Data Model Additions

Add only where current tables cannot express the requirement:

- Calendar saved views per user/surface.
- Calendar explicit target dates for review/admin/evidence/draw where not represented by existing entities.
- Calendar external sync subscriptions.
- Calendar external sync change queue.
- Schedule revision records if not already covered by audit events.

Do not create a parallel generic `calendarEvents` table as the source of truth for domain events. Calendar events are a projection over domain entities, with explicit target-date records only for dates that have no existing domain home.

## 22. Testing Requirements

### 22.1 Unit Tests

- Proposal event projection from milestones, draws, dependencies, and working-capital assumptions. Audit history remains metadata and is not projected as calendar events.
- Active build event projection from milestones, evidence, site visits, draw releases, and loan facility. Audit history remains metadata and is not projected as calendar events.
- Action availability by role and event state.
- Impact preview calculations.
- Date math and timezone boundaries.
- Saved view filtering.

### 22.2 Integration Tests

- Proposal calendar edit updates proposal milestone/draw timing and audit where required.
- Active build schedule revision writes audit reason.
- Site visit schedule/reschedule/cancel flows.
- Draw release target blocked before eligibility.
- Location-unverified evidence remains visible and reviewable.
- External sync inbound change creates pending reconciliation, not silent mutation.

### 22.3 Browser And Accessibility Tests

- Desktop day/week/month/quarter planner timeframes render non-empty event bars.
- Mobile agenda view works at 320px.
- Right-click and keyboard action menu parity.
- Drag/drop with impact preview.
- Focus management after drawer/menu close.
- No text overlap in event rows, buttons, or drawers.

## 23. Phased Delivery

The program includes all three phases. Phase names describe sequencing, not optional scope.

### Phase 1: Shared Calendar Foundation And Visibility

Deliver:

- Adapted `EventManager` based on `src/components/ui/event-manager.tsx`.
- Shared `CalendarWorkspace` adapter shell.
- Proposal and active build calendar adapters.
- Day, week, month, quarter/roadmap, and agenda timeframes.
- Event projections for milestones, draws, evidence, site visits, review, admin decisions, working capital, loan, and budget revisions. Audit events are available through audit-history actions, not rendered as calendar events.
- Filters and saved views.
- Event detail drawer.
- Context menu shell with non-mutating actions: open detail, view audit, copy link, jump to timeline/Gantt/materials/draws.
- Mobile agenda view.
- Tests for projection, filters, rendering, and accessibility.

Acceptance criteria:

- Both proposal and active build routes use the same calendar component.
- The shared component adapts `src/components/ui/event-manager.tsx`; no parallel planner renderer exists.
- The existing active build placeholder calendar is replaced.
- Proposal routes expose a calendar tab.
- Calendar events are derived from domain state, not manually duplicated.
- No action requires route-specific rendering logic inside the shared component.
- The calendar takes the dominant available tab space and supports glanceable rough timing.

### Phase 2: Full Internal Editability And Workflow Actions

Deliver:

- Drag/drop and resize editing for permitted events.
- Inline drawer editing.
- Date, event, and bulk context menus with domain actions.
- Impact preview before material edits.
- Reason capture and audit writing for material changes.
- Proposal milestone/draw schedule edits.
- Active build schedule revision edits.
- Evidence/review/admin target date edits.
- Site visit schedule/reschedule/cancel/assign/dispatch actions.
- Draw request/approve/release actions where eligible and authorized.
- Role-aware disabled states with explanations.
- Tests for mutations, audit requirements, RBAC, and illegal transitions.

Acceptance criteria:

- Calendar can be used as an actual scheduling surface, not just a viewer.
- Planned/proposed dates are editable through the calendar.
- Immutable actual timestamps cannot be silently edited.
- Every material action records audit reason and prior/new state.
- Right-click menus and mobile overflow menus have action parity.

### Phase 3: Coordination, External Sync, And Operational Hardening

Deliver:

- ICS export for current timeframe/view and selected events.
- Read-only subscription feeds.
- Google Calendar and Outlook outbound sync where connector support exists.
- Inbound sync reconciliation for site visit scheduled-time changes.
- Calendar sync settings and error states.
- Event outbox records for calendar-relevant changes.
- Bulk selection and bulk operations.
- Optimistic live updates and conflict handling for multi-user edits.
- Performance hardening for large event sets.
- Full browser regression coverage across desktop and mobile.

Acceptance criteria:

- Site visit staff can receive/use external calendar events without losing DrawFlow as source of truth.
- External inbound changes never bypass DrawFlow audit and workflow rules.
- Calendar remains responsive with large build/proposal schedules.
- Multi-user edits resolve clearly with conflict warnings.

## 24. Success Metrics

- Percentage of active builds with current milestone dates.
- Reduction in overdue evidence/review/site visit/admin decision events.
- Reduction in draw-ready-to-release cycle time.
- Reduction in milestone completion-to-evidence-review cycle time.
- Reduction in site visit request-to-completion cycle time.
- Calendar action adoption: percentage of schedule and site visit changes made from calendar.
- Fewer support/backoffice questions about what is due this week.
- External calendar subscription adoption for site visit staff.

## 25. Definition Of Done

The calendar program is complete when:

1. Proposal and active build routes use the same reusable calendar workspace.
2. The workspace adapts `src/components/ui/event-manager.tsx` instead of rolling a planner from scratch.
3. The shared component has no direct Convex/domain mutation imports.
4. Proposal and active build adapters provide event projections and actions.
5. Day, week, month, quarter/roadmap, agenda, and mobile agenda timeframes are implemented.
6. The calendar uses the maximum available tab space and remains glanceable without opening drawers.
7. Context menus work on dates, events, and selections.
8. Planned/proposed schedule objects are editable where domain rules allow.
9. Material edits show impact preview and require audit reason.
10. Actual/released/approved audit timestamps are immutable.
11. Site visits can be scheduled, rescheduled, assigned, dispatched, cancelled, and reviewed from the calendar.
12. Draw request/release actions are available only when reimbursement eligibility and authority allow them.
13. External export/sync exists with inbound reconciliation.
14. Browser, unit, integration, and accessibility tests cover the flows above.

## 26. Open Product Decisions

These are implementation-scoping decisions, not blockers to the PRD direction:

1. Should proposal calendar edits be available to backoffice reviewers after submission, or should reviewer edits create requested-change proposals for the builder to accept?
2. Should active build milestone date changes by builders create immediate schedule revisions or pending lender-review revisions?
3. What are default evidence/review/admin SLA durations by brokerage policy?
4. Which external calendar providers ship first: Google, Outlook, or ICS-only export?
5. Should site visit inbound sync be limited to assigned inspectors, or can brokers edit site visit times externally?
6. Should payback-date changes be visible on the calendar as target requests before approval?
