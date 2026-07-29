# Milestone and submilestone actual work starts

Implementation reference for ENG-373 through ENG-382.

## Domain contract

- `actualStartedAt` is the user-confirmed time work began.
- `startReportedAt` is the server time the event was recorded.
- `startedByWorkosUserId` and `startSource` preserve actor and entry-point
  attribution.
- Planned Construction Roadmap dates are never rewritten by a start.
- A start never changes progress, evidence, draw, cost, or completion state.
- Current and backdated starts are accepted. Future starts are rejected.
- Incomplete declared dependencies require an explicit reason. They warn and
  notify lender operations but do not block a Builder from recording reality.
- Builder submilestone starts can atomically start an unstarted parent.
  Contractor starts are restricted to the exact assigned submilestone and
  never start the parent.

## Canonical commands

`production_proposals.startActiveBuildMilestone` is the public Builder command.
`contractorWorkspace.startAssignedSubmilestone` is its assignment-scoped
Contractor adapter. Both delegate to `recordMilestoneStart` in
`convex/milestone_start.ts`.

Completion commands accept the same actual-start fields. When completion is
attempted without a recorded start, the start event and completion transition
are committed in one Convex transaction.

Corrections and retractions use
`correctActiveBuildMilestoneStart` and
`retractActiveBuildMilestoneStart`. They append immutable
`milestoneStartEvents`; no prior event is overwritten or deleted. Builder
amendments are allowed before completion. Lender Admin is required after
completion.

## Event and projection model

Every accepted command writes:

1. the current milestone or submilestone start projection;
2. an immutable `milestoneStartEvents` record;
3. an `auditEvents` record;
4. an `eventOutbox` record using `milestone.started`,
   `milestone.start_corrected`, or `milestone.start_retracted`.

Dependency exceptions also create an actionable lender recipient delivery with
the declared dependency snapshot. Idempotency is organization-scoped and
replays return the original result without duplicate events.

Legacy in-progress or completed records without `actualStartedAt` remain
read-only and are displayed as `Actual start unknown`; the system does not
invent a historical timestamp.

## Production entry points

The shared compact confirmation controller is used by milestone cards,
milestone detail, Gantt, Calendar, submilestone ledger, submilestone detail,
guided field workflow, Contractor scope, completion catch-up, and Assistant
HITL. Proposal and dashboard surfaces do not originate work starts.

The confirmation is online-only and retains the entered timestamp and reason
after a failed mutation so the same idempotent command can be retried.
