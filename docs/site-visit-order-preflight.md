# Site Visit order preflight

Every production active-Build Site Visit must be configured before its token is
created. Milestone review, Calendar, Timeline, and Gantt order actions all open
the shared `SiteVisitOrderDialog`. They must not call a Site Visit mutation
directly.

The preflight shows every selected Sub-milestone in stable roadmap order. Each
row owns the canonical Field Guidance pair:

- **What to verify**: observable completion and exception checks for the field
  reviewer.
- **Recommended camera angles**: the wide, detail, and contextual views needed
  for Evidence review.

The two values are TipTap JSON and stay local while the user edits. No mutation
runs on a keystroke or debounce timer. Confirmation is disabled when either
field is semantically empty for any selected row.

One confirmation sends the complete ordered `submilestoneGuidanceSections`
array. The backend validates each Build and Proposal Sub-milestone identity,
saves each complete canonical Guidance pair, creates the Site Visit, and writes
one immutable snapshot section per selected row in the same transaction. A
retry uses the same idempotency key and cannot create a second Visit.

The token route renders the saved snapshot sections in order. It does not read
later canonical Guidance, Sub-milestone Scope, execution notes, or a shared
description. Historical Visits that predate section snapshots may render their
saved Visit-wide guidance; they never borrow a later live milestone value.

Tests cover incomplete-row blocking, deferred local editing, pending-state
disablement, atomic persistence, idempotent retry, Timeline/Gantt routing,
snapshot immutability, and exact token rendering.
