# Build Collaboration System Posts

> **Status:** Approved product and domain contract
>
> **Decision date:** August 3, 2026
>
> **Scope:** Production active Builds and historical backfill
>
> **Extends:** `docs/specs/build-collaboration.md`,
> `docs/specs/builder-milestone-start-spec.md`, and
> `docs/specs/builder-milestone-start-interface-manifest.md`

## 1. Outcome

DrawFlow creates first-class Build Collaboration **System Posts** for core
Milestone and Draw events. A System Post is the shared operational context for
one canonical domain occurrence. It brings planning facts, execution state,
role-aware actions, rich-text coordination, discussion, evidence references,
and audit history together without creating a second Milestone, Draw, Evidence,
Site Visit, approval, notification, or task system.

Milestone System Posts contain generated System Action Items representing their
canonical Sub-milestones. Draw System Posts do not generate Action Items; they
show canonical Draw state and may host ordinary, manually created internal
coordination Action Items.

## 2. Source-of-truth boundary

1. Canonical Milestone, Sub-milestone, Evidence Package, Site Visit, Draw,
   approval, and release records remain the only workflow source of truth.
2. A System Post is a collaboration-owned orchestration and projection surface.
3. A System Action Item is an existing Build Collaboration Action Item with a
   non-editable canonical execution binding. It is not a parallel task record.
4. State-changing controls invoke the existing permission-aware domain command.
   The post and board update only after that command succeeds.
5. Comments, rich-text coordination, follows, mentions, attachments, revisions,
   receipts, notifications, and moderation remain owned by Build Collaboration.
6. The same canonical post projects into every authorized referenced-entity
   surface. DrawFlow never copies a System Post into separate feeds.

## 3. System Post identity and authorship

### 3.1 Identity

- There is exactly one Milestone System Post per canonical Milestone.
- There is exactly one Draw System Post per planned Draw occurrence.
- Schedule activation and direct user actions call the same idempotent ensure
  operation.
- Repeated scheduler delivery, concurrent activation, retries, and duplicate
  client submission cannot create duplicate posts, Action Items, audit events,
  or notifications.
- The first Draw Request attaches to its planned Draw post.
- Corrections and resubmissions of the same Draw Request remain in that post.
- A genuinely new replacement Draw after terminal withdrawal or decline gets a
  new post cross-linked to its predecessor.

### 3.2 Authorship

- System Posts are authored by **DrawFlow System**.
- `triggeredBy` separately records a schedule trigger or authenticated actor.
- System type, tenant, Build, canonical entity binding, occurrence identity,
  and activation reason are immutable.
- Human edits, comments, attachments, and commands retain the actual actor,
  exercised role, source, and timestamp.

## 4. Scheduling and activation

All date-only behavior uses the Build's configured IANA timezone.

### 4.1 Milestone

- The post activates at `00:00` on the parent Milestone's planned local start
  date.
- Scheduled activation creates operational context but does not claim that work
  started.
- An authorized early start activates the post immediately if it does not yet
  exist.
- A Milestone remains on-time throughout its planned start date.

### 4.2 Draw

- The post activates at `00:00` on the planned Draw's scheduled local date or
  immediately when an authorized Draw Request is made, whichever happens first.
- Scheduled activation never creates or submits a Draw Request and never
  requests funds.
- Post activation does not change reimbursement availability, completion,
  evidence, policy, approval, release, interest, or lender-limit state.

### 4.3 Scheduler recovery

- The scheduler is delivery-at-least-once and the ensure operation is
  idempotent.
- A bounded reconciliation job finds missed eligible activations after downtime
  or deployment without introducing a second scheduling subsystem.
- Local-date conversion is daylight-saving safe.

## 5. Milestone System Post

### 5.1 Card materialization

- Every canonical Sub-milestone receives one System Action Item when the parent
  post activates, including future work.
- Each card links to its parent Milestone, Sub-milestone, approved planning
  version, Work Allocation, dependencies, evidence requirements, and relevant
  permitted references.
- Each card uses its own planned start date for missed-start evaluation.
- Approved planning additions create new cards idempotently.
- New and revised Milestones must contain at least one canonical Sub-milestone.
  Milestone creation and its first valid Sub-milestone persist atomically.
- A draft editor may show a temporary empty row, but no server write, import,
  submission, approval, migration, or roadmap revision may persist an empty
  Milestone. Deleting the final Sub-milestone requires deleting the Milestone.
- A parent-scoped System Action Item is defensive legacy-recovery behavior only
  for already-corrupt/backfilled zero-child records. It never fabricates a
  Sub-milestone and is superseded if valid children are later added.

### 5.2 Card columns

The visible execution columns are:

1. `Backlog`
2. `Behind Schedule`
3. `In Progress`
4. `In Review`
5. `Approved`

Cards are not freely draggable. They move only after explicit domain commands
succeed. The board may support permission-safe filtering and ordering, but
manual card position is not workflow state.

### 5.3 Behind Schedule

- `Behind Schedule` means the Sub-milestone's planned start date passed and no
  actual start was recorded.
- The automatic transition occurs at `00:00` on the following Build-local day.
- A one-time auditable missed-start event records the transition.
- Users cannot manually enter or leave this column.
- Recording the eventual actual start moves the card to `In Progress`.
- Started work that passes its planned completion remains `In Progress` with an
  overdue-completion attention condition; it does not return to `Behind
  Schedule`.

### 5.4 Start authority

- An assigned Contractor may start only an assigned Sub-milestone. Work
  Allocation assignment grants Contractor operate rights; it is not the Builder
  or Admin start gate.
- An authorized Builder or Builder Staff member may start any Sub-milestone
  within builder permission scope (`builderAccountLinks` /
  `builderStaffPermissionGrants`). Assignment is not required.
- Admin may always field-operate (Start / Complete / evidence / progress) on
  Sub-milestones. Broker, broker-staff, and principle-broker remain review-only
  unless they also hold Builder or Admin authority.
- Only an authorized Builder-side actor or Admin may record the parent
  Milestone's official start.
- Contractor activity never silently starts the parent. Starting the first
  child while the parent is unstarted creates an immediate Builder confirmation
  obligation.
- Incomplete dependencies are displayed before confirmation. An authorized
  Builder or Admin may record reality with a mandatory exception reason. The
  exception is audited and escalated but never bypasses evidence, completion,
  approval, or Draw-release gates.

### 5.5 Execution ownership

- Execution ownership derives from the canonical Sub-milestone Work Allocation.
- The assigned Contractor or crew is the execution assignee.
- Builder personnel may be coordinators or followers and may still operate the
  Sub-milestone under builder permission scope without being the assignee.
- Changing execution ownership requires changing the canonical Work Allocation;
  the card cannot drift independently.
- Missing or invalid ownership produces `Assignment required` as a coordination
  badge for Contractor readiness. DrawFlow never guesses or silently reassigns,
  and that badge must not disable Builder or Admin Start/Complete.
- Reassignment preserves prior assignees, participation periods, activity, and
  audit history.

### 5.6 Progress and completion

- `In Progress` may show canonical progress percentage, actual cost, field notes,
  and revised completion forecast.
- Reaching `100%` never declares completion or submits review.
- Progress updates, evidence uploads, material activity, Site Visit activity,
  and information requests never implicitly record a start.
- Work-complete declaration and evidence upload are separate facts.
- The card enters `In Review` only when an authorized operator explicitly
  submits completed work and the planning-defined required Evidence Package.
- Missing requirements keep the card `In Progress` and show an exact
  `Ready except for...` list.
- Submission atomically freezes the submitted Evidence Package revision and
  records the actor and timestamp.

### 5.7 Evidence boundary

- `Add evidence` uses the canonical Evidence Package upload workflow.
- `Attach to discussion` creates a Build Collaboration asset only.
- A discussion attachment never satisfies an evidence requirement implicitly.
- Authorized explicit promotion creates a governed evidence record while
  retaining the original collaboration attachment and provenance.
- Location or geofence failure never discards evidence. The item enters review
  as `location_unverified` and routes to lender/admin attention.

### 5.8 Review, Site Visit, and rework

- A Site Visit becomes required through lender policy, configured risk/evidence
  rules, or an authorized Lender Staff/Admin request.
- Required Site Visits block approval until the report is completed and
  accepted.
- Lender Staff may inspect, report, and recommend.
- Only Lender Admin may waive a required Site Visit, with a mandatory reason and
  immutable audit event.
- A failed review moves the card from `In Review` to `In Progress` under a
  visible `Changes requested` condition.
- Every changes-requested outcome preserves reasons, failed requirements,
  reviewer, timestamp, submitted evidence revision, and remediation checklist.
- Resubmission creates a new evidence revision and review round.

### 5.9 Approval and parent resolution

- Sub-milestones reach `Approved` independently through authorized approval.
- When every required child is approved or formally waived, the post exposes an
  explicit `Approve Milestone` action to Lender Admin.
- Child readiness never auto-approves the parent.
- The post resolves only after the canonical parent Milestone approval succeeds.
- A formal Lender Admin approval retraction with mandatory reason reopens the
  same post. Only explicitly affected children re-enter review/execution; prior
  approvals and the original resolution remain immutable in history.

### 5.10 Parent summary

The parent post lifecycle is `Open`, `Resolved`, or `Reopened`. It does not
pretend concurrent children share one workflow state. It shows live counts for
each card column plus assignment gaps, dependency exceptions, overdue
completion, review SLA, and required Site Visit attention. `Ready for approval`
is derived only when all required children are approved or waived.

## 6. Planning revisions

- The post projects the current approved Budget and Construction Roadmap.
- It retains the exact approved plan-version snapshot used at activation.
- Every later approved revision shows a structured diff and audit event.
- Newly added Sub-milestones create cards.
- Removed Sub-milestones never disappear; their cards become `Superseded` with
  execution and discussion history preserved.
- Planned-date changes recalculate `Backlog` and `Behind Schedule` without
  rewriting actual starts or prior missed-start events.
- Submitted source facts, evidence revisions, Site Visit reports, approvals, and
  release timestamps are never overwritten by planning revisions.

## 7. Draw System Post

### 7.1 No generated Action Items

Draw System Posts generate no Action Items and contain no synthetic Draw
dependency board. The detail projects live canonical Draw information:

- planned versus requested state,
- requested amount and reimbursement scope,
- eligibility and missing requirements,
- Evidence Package and Site Visit state,
- Lender Staff review and recommendation,
- Lender Admin approval,
- funds-release status, and
- immutable audit events.

All Draw mutations use existing canonical Draw commands.

### 7.2 Manual coordination Action Items

- Authorized users may manually attach ordinary Build Collaboration Action Items
  to a Draw System Post.
- These items are coordination-only. Completing, reopening, cancelling, or
  deleting one never advances, blocks, approves, declines, or releases the Draw.
- Their maximum audience is both organization-scoped and Build-scoped.
- Readers and assignees must be active WorkOS members of the originating
  brokerage/lender organization and have a current relationship to that Build.
- External participation grants alone are insufficient.
- Membership or Build-relationship loss immediately removes access and leaves
  open assignments visibly unassigned.

### 7.3 Oversight and joining

- Admin and Principal Broker retain silent permission to open and audit Draw
  coordination across their organization.
- They are not automatically participants, followers, assignees, inbox
  recipients, or notification recipients without Build involvement.
- Any organization member already authorized for the Build may use `Join
  coordination` to enter the working audience and normal notifications.
- Joining is audited and grants no assignment, approval, or release authority.
- A participant may leave unless an open assignment or mandatory review duty
  requires continued participation.

### 7.4 Resolution

- `Released` resolves the post as completed.
- `Withdrawn`, `Cancelled`, or final `Declined` resolves it with that disposition
  and reason.
- `Changes requested` remains open for correction and resubmission.
- `Approved` remains open until funds are actually released.
- The release timestamp remains the fact that starts interest.
- A released Draw is never reopened through collaboration. Post-release
  corrections require a separate adjustment/recovery domain workflow.

## 8. Detail and collaboration capabilities

System Posts and System Action Items directly reuse the regular Action Item
detail capability stack:

- route-addressable detail,
- TipTap rich-text detail,
- immutable revision history and conflict detection,
- inline and nested discussion,
- mentions, reactions, follows, and role-safe receipts,
- governed attachments and entity references,
- assignments and permitted dependencies,
- full chronological audit history, and
- existing archived/read-only behavior.

The detail deliberately separates:

1. **System-owned domain section** — live canonical identity, approved planning
   facts, dates, dependencies, allocation, evidence requirements, state, gates,
   and domain events.
2. **Operations brief** — authorized, revision-controlled human instructions,
   coordination notes, and links.
3. **Discussion** — ordinary collaboration threads and assets.
4. **Audit history** — one chronological view that preserves each event's
   collaboration or domain source.

Editing rich text cannot change a canonical fact. A domain command changes the
fact, after which the system projection updates.

## 9. Audience and authorization

### 9.1 Milestone System Posts

- Audience is domain-derived and non-editable.
- Authorized Builder, Builder Staff, and Lender roles see the post within their
  Build access.
- Contractors see only assigned Sub-milestones, permitted planning facts, and
  related discussion.
- Financing, lender policy, risk, other contractors' information, and restricted
  metadata remain server-redacted.
- Mentions, editor changes, comments, attachments, and client state cannot
  broaden access.
- Assignment and authorization changes update the audience immediately without
  rewriting history.

### 9.2 Server authority

Every read, search result, count, notification, attachment download, mutation,
and deep link reauthorizes the current actor against organization, Build,
entity, and role scope. Restricted data is absent rather than client-hidden.

## 10. Notifications

Notifications are event- and responsibility-driven:

- activation notifies execution assignees and the Builder coordinator;
- missed start notifies the assignee and Builder coordinator, then follows the
  configured escalation policy to lender operations;
- review submission notifies the responsible Lender Staff or review queue;
- a required Site Visit notifies the assigned inspector and review owner;
- changes requested notifies the execution assignee and Builder coordinator;
- child and parent approval notify the affected Builder team and assignee; and
- mentions, replies, follows, and manual Action Items retain current Build
  Collaboration behavior.

Passive projection refreshes and routine audit events do not create notification
noise. Retries use existing delivery idempotency.

## 11. Feed, search, and resolution behavior

- System Posts are first-class records in the existing Build Collaboration feed.
- They have non-editable `System · Milestone` or `System · Draw` identity.
- Existing search, reference, filter, notification, and projection systems are
  extended to recognize the new post kind.
- `Active operations` is a filter/projection of the same feed, not a new feed or
  task system.
- Replies and material domain events may update activity ordering. Passive live
  projection refreshes do not.
- Resolution retains the post in chronological history.
- Authorized participants may continue discussion and attachments after
  resolution. Discussion never reopens domain state; only a canonical reversal
  can reactivate the System Post.
- Closed or archived Builds retain existing fully read-only behavior.

## 12. Retention and moderation

- System Posts and generated System Action Items cannot be deleted or manually
  tombstoned.
- Approved planning revisions may supersede cards.
- Canonical cancellation may resolve a post with a cancellation disposition.
- Authorized coordinators may edit the operations brief with immutable
  revisions.
- Existing moderation may hide inappropriate user-authored collaboration
  content while retaining revisions, assets, and audit records.
- Moderation cannot remove or rewrite system-generated facts, domain history, or
  canonical references.

## 13. Concurrency and failure defaults

To minimize implementation complexity, System Posts inherit existing Build
Collaboration and domain concurrency behavior:

- Rich-text edits use the existing optimistic revision/conflict flow.
- Domain commands validate the current canonical version and authorization at
  commit time.
- A stale client receives the existing recoverable conflict experience and
  refreshes the live projection; there is no second lock manager.
- System Post creation, card materialization, state-event projection,
  notification enqueue, and audit append are idempotent and transactionally
  coupled wherever the existing domain boundary permits.
- Reconciliation repairs a missing projection from canonical state. It never
  mutates canonical workflow state to match the post.

## 14. Historical backfill

Rollout includes a bounded, resumable, idempotent migration:

- Active Milestones and unresolved Draws receive open posts reflecting current
  canonical state.
- Completed Milestones and terminal Draws receive resolved historical posts.
- Historical posts use original domain-event chronology and display `Backfilled
  from existing records`.
- `materializedAt` separately records migration time.
- Unknown historical starts, actors, evidence, or approvals remain `Unknown`.
- Backfill never fabricates facts or discussion.
- Backfill creates no notifications, unread counts, follows, or fake activity.

## 15. Minimal implementation constraints

Implementation must extend existing systems:

- existing Build Collaboration post, reference, participant, audience, search,
  follow, comment, revision, receipt, notification, asset, moderation, and audit
  infrastructure;
- existing Action Item detail, assignment, dependency, and read-only support;
- existing Milestone/Sub-milestone start, progress, completion, evidence,
  Site Visit, review, approval, correction, and audit commands;
- existing Draw request, review, approval, release, and audit commands; and
- existing scheduling/reconciliation facilities.

Implementation must not create:

- a second collaboration feed,
- a second Action Item table or workflow engine,
- copied Evidence Packages or files,
- copied Milestone or Draw state,
- a second authorization graph,
- a second notification or audit pipeline, or
- a Draw-generated task board.

New UI must reuse the current post and Action Item detail components. Any new
wrapping surface uses `Frame`; content and interactive cards use `Card`. Before
production UI implementation, the detail and board compositions must pass the
repository's `design-an-interface` and disposable `prototype` workflow without
changing the existing Build Overview hierarchy.

## 16. Acceptance contract

The feature is complete only when automated tests prove:

1. schedule and direct-action races create exactly one post;
2. planned dates never fabricate actual starts or Draw Requests;
3. every valid Sub-milestone materializes exactly one bound System Action Item;
4. empty Milestones cannot be persisted through any supported write path;
5. `Behind Schedule` uses the Sub-milestone's Build-local missed-start rule;
6. direct drag cannot bypass a canonical command;
7. assignments and audiences follow current canonical authorization;
8. Contractors cannot start the parent Milestone or view unauthorized scope;
9. progress, evidence, Site Visits, and information requests never imply start;
10. review entry requires completion declaration and the required frozen
    Evidence Package revision;
11. location-unverified evidence is preserved and routed for review;
12. required Site Visits and admin-only waivers gate approval correctly;
13. changes requested preserves prior evidence and creates a new review round;
14. child readiness never auto-approves the parent;
15. Draw posts generate no Action Items;
16. manual Draw coordination Action Items cannot mutate Draw state;
17. discussion attachments never satisfy evidence without explicit promotion;
18. planning revisions preserve activation snapshots and superseded history;
19. resolved discussion cannot reopen domain state;
20. backfill is resumable, silent, fact-preserving, and idempotent;
21. restricted content is absent from reads, search, counts, notifications,
    assets, exports, and AI retrieval; and
22. archived Builds remain read-safe and all structured controls are inert.

Required verification includes focused domain/model tests, permission-matrix
tests, scheduler and migration tests, existing Build Collaboration regression
tests, full Convex typecheck/codegen, application typecheck/build, and manual
desktop/mobile browser QA.

**Approved System Post UI:** Variant A (Inline workboard) from
`/prototype/system-posts?variant=A`. Production renders the adapted experience
from `src/features/build-collaboration/SystemPostExperience.tsx`. The prototype
route remains throwaway reference evidence.

