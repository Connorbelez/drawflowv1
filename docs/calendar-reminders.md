# Proposal Calendar Reminder Events

DrawFlow proposal calendars support reminder-only events for follow-ups, check-ins, site-visit coordination, and other convenience items that should not alter the construction roadmap, draw plan, budget, evidence state, or approval workflow.

## Data Model

- Reminder events are stored in `calendarReminderEvents`.
- Every reminder is organization-scoped through `organizationId`, brokerage-scoped through `brokerageId`, and proposal-scoped through `proposalId`.
- Invitees are stored as typed participant metadata:
  - `workosUser`
  - `builderProfile`
  - `contractorProfile`
  - `externalEmail`
- Contractor invitee metadata is persisted even though contractor-facing calendar UI is not available yet.
- Cancelling a reminder marks it `cancelled` instead of deleting it, preserving calendar history and audit events.

## Calendar Behavior

Reminder events project into `getProposalCalendarWorkspace` as `kind: "reminder"`.
They are editable convenience items and do not trigger timeline, milestone, draw, evidence, capital, or budget recomputation.

## External Calendars

`createCalendarSyncSubscription` creates a durable feed key and stores the source proposal. The Convex HTTP endpoint serves:

```text
/api/calendar/:subscriptionKey.ics
```

The feed includes projected proposal calendar events plus reminder-only events, so Google Calendar, Outlook, and iCloud can subscribe to the DrawFlow proposal calendar.

Inbound external-calendar write-back is not fully automatic yet because the app does not currently own Google/Microsoft OAuth grants, refresh tokens, webhook subscriptions, or push notification handlers. `recordExternalCalendarSyncChange` can already materialize a provider event payload into a reminder-only event when a future provider integration supplies a known subscription key plus `title` and `startsAt`.
