# Build Collaboration Production Implementation Plan

> **Product contract:** `docs/specs/build-collaboration.md`
>
> **Approved interface:** Variant A — Familiar Build Feed
>
> **Prototype:** `/prototype/build-collaboration?variant=A`
>
> **Package manager/runtime:** Bun

## Goal

Replace production Public/Internal Notes with the approved Build-local,
permission-aware collaboration feed while preserving the existing default
Details workspace and unchanged Build Overview. Ship persistent posts, typed
Build references, nested discussions, Action Items, notifications, receipts,
auditable permissions, migration, and role-complete access for brokerage staff,
builders, builder staff, homeowners, and contractors.

## Architecture

Build Collaboration is a deep Build-scoped module. Its external interface is a
small set of feed, thread, draft, publication-bundle, and Action Item commands.
Audience resolution, role hierarchy, entity ACL intersection, revision
creation, audit, notifications, webhook outbox, and idempotency stay behind
that interface.

The collaboration feed is queried separately from the existing active-Build
detail view model. It must not enlarge `convex/production_proposals.ts` or make
the Build Overview query depend on feed pagination.

Human and system posts share one canonical aggregate. Comments, revisions,
Action Items, references, receipts, reactions, follows, acknowledgements, and
assets remain explicit child tables rather than a generic activity table.
Feed rows are query-time projections of canonical records.

## Current Repository Findings

- `src/features/backoffice-build-detail/BuildDetailRoute.tsx` and production
  role routes already resolve the default tab to `details`.
- `ProductionBuildDetailSurface.tsx` owns the shared production Build shell.
- `ProductionDetailsTab` currently renders Build Overview followed by Facility
  Change Requests, Budget Revision Requests, a duplicate Milestone Kanban,
  duplicate Contractors/Documents cards, and Internal/Public Notes.
- `BuildDetailTabs.tsx` has no Documents tab.
- Production `buildNotes` contain plain text, author/role snapshots,
  organization/brokerage/build scope, visibility, and timestamps.
- `getActiveBuildDetailByString` currently reads all notes into the already
  large active-Build view model.
- `convex/production_proposals.ts` is approximately 28,000 lines and contains
  active-Build authorization helpers that collaboration also needs.
- `convex/authz.ts` has WorkOS role/capability middleware but no Homeowner
  organization role. Homeowner must be a DrawFlow-owned Build participation
  role, not a write into WorkOS projection tables.
- `convex/migrations.ts` already uses `@convex-dev/migrations`.
- Existing `auditEvents`, `eventOutbox`, and `recipientDeliveries` provide
  production audit, webhook, and delivery patterns to reuse.
- The prototype contains validated typed-reference, preview, nested-discussion,
  action-list, and action-board interactions, but its state is intentionally
  in-memory.
- The production editor primitive lives under
  `src/components/kibo-ui/editor/`; the prototype's typed reference extension
  should be extracted and composed into it.
- The worktree already contains unrelated untracked `.claude/` and
  `CONTEXT.md`; implementation must preserve them.

## Module Interfaces

### Build access interface

Extract active-Build authorization from `production_proposals.ts` into a shared
deep module:

```ts
authorizeActiveBuild(ctx, {
  buildId,
  requestedOrganizationId,
  requiredCapability,
}): Promise<ActiveBuildAuthorization>
```

The returned authorization contains canonical Build, brokerage, tenant, viewer,
effective Build roles/tier, capabilities, participation period, and permission
helpers. Callers must not reproduce role or organization checks.

### Collaboration read interface

Public queries in `convex/build_collaboration.ts`:

- `getBuildCollaborationBootstrap`
- `listBuildCollaborationFeed`
- `getBuildCollaborationThread`
- `searchBuildCollaboration`
- `listBuildReferenceOptions`
- `listPostActionItems`
- `listMyBuildActionItems`
- `getMyBuildCollaborationDraft`

Every collection is bounded or cursor-paginated. Search and reference options
authorize before retrieval. Restricted placeholders are synthesized only by
the chronological feed projection.

### Collaboration command interface

Public mutations in `convex/build_collaboration.ts`:

- `saveBuildCollaborationDraft`
- `discardBuildCollaborationDraft`
- `previewBuildCollaborationPublication`
- `approveAndPublishBuildCollaborationBundle`
- `editBuildCollaborationPost`
- `tombstoneBuildCollaborationPost`
- `publishBuildCollaborationComment`
- `editBuildCollaborationComment`
- `tombstoneBuildCollaborationComment`
- `resolveBuildCollaborationThread`
- `reopenBuildCollaborationThread`
- `setBuildCollaborationReaction`
- `setBuildCollaborationFollow`
- `recordBuildCollaborationReceipt`
- `acknowledgeBuildCollaborationPost`
- `setBuildCollaborationPin`
- `createBuildActionItem`
- `updateBuildActionItem`
- `transitionBuildActionItem`
- `acceptBuildActionAssignment`
- `setBuildActionRelation`
- `moderateBuildCollaborationContent`

Commands accept expected revisions for mutable records. Each command performs
authorization, validation, canonical write, revision/event creation, audit,
outbox, and notification scheduling in one transaction where possible.

### Internal event interface

Internal mutations in `convex/build_collaboration.ts`:

- `publishBuildSystemEvent`
- `createPolicyBuildActionItem`
- `processScheduledBuildPublication`
- `escalateOverdueBuildActionItems`
- `revokeBuildParticipantAccess`

System callers supply a stable idempotency key and typed primary entity
reference. They cannot publish arbitrary human-authored content.

## Data Model

Add required validators and tables to `convex/schema.ts`. Every collaboration
table, including child/history tables, stores `organizationId`, `brokerageId`,
and `buildId`. Parent IDs do not replace explicit tenant and Build scope.

### Participation and tenant rollout

- `buildParticipants`
  - WorkOS user identity, Build role, participant type, status,
    invitation/participation period, display snapshot, removal metadata.
  - Unique active participant per Build/user.
  - Homeowner and Build-scoped Contractor grants live here.
- `buildCollaborationTenantSettings`
  - feature status, activation/migration state, retention policy reference,
    generous rate-limit policy, notification defaults.

Admin and Principal Broker authorization remains organization-wide and does not
require per-Build rows.

### Posts and discussion

- `buildCollaborationPosts`
  - human/system/imported source, post intent, author/system provenance,
    audience policy, primary reference summary, current revision, open/resolved
    state, tombstone/moderation state, meaningful activity sort key.
- `buildCollaborationPostRevisions`
  - revision number, canonical TipTap JSON, derived plain text, content hash,
    author role exercised, edit reason, publication metadata.
- `buildCollaborationComments`
  - post, parent comment, logical depth, current revision, open/tombstone state,
    meaningful activity.
- `buildCollaborationCommentRevisions`
  - canonical TipTap JSON, derived text, immutable author/time history.

### Audiences and references

- `buildCollaborationAudienceMembers`
  - fixed custom audience membership.
- `buildCollaborationAudienceSnapshots`
  - publication-time reader/exclusion resolution for audit only.
- `buildCollaborationReferences`
  - revision/comment/Action Item owner, entity kind and immutable ID, primary
    flag, publication-time label/summary.

Dynamic authorization is recalculated from current Build access and entity ACL;
audience snapshots never authorize a read.

### User interaction

- `buildCollaborationFollows`
- `buildCollaborationReactions`
- `buildCollaborationReceipts`
- `buildCollaborationPins`
- `buildCollaborationAcknowledgements`
- `buildCollaborationAcknowledgementTargets`

Use compound indexes for unique user/content operations and Build/user queues.
Receipts store first-view and latest-revision-viewed separately.

### Action Items

- `buildActionItems`
  - immutable originating post, optional parent item, title/description,
    status, priority, creator, assignee/request state, due date, acceptance
    rules, current revision, primary reference, cancellation/blocking metadata.
- `buildActionItemEvents`
  - append-only transition/assignment/due-date/checklist history.
- `buildActionItemRelations`
  - blocks, blocked-by, related, duplicate; same-Build and permission-compatible.
- `buildActionItemChecklistItems`
  - bounded child rows rather than an unbounded array.

Maintain denormalized open/overdue/status counters transactionally for bounded
Convex reads. The event log remains authoritative for history.

### Assets, drafts, and publication approval

- `buildCollaborationAssets`
  - general Build asset, storage ID, scan state, version lineage, owner/uploader,
    maximum audience policy.
- `buildCollaborationAttachments`
  - revision/comment/Action Item attachment to a collaboration asset,
    `buildDocuments`, or `buildEvidenceAssets`.
- `buildCollaborationDrafts`
  - private human-owned bundle state, staged references/assets/actions,
    autosave revision.
- `buildCollaborationPublicationApprovals`
  - approving human, bundle hash, approved audience/reference/notification
    summary, schedule, expiry, invalidation/publication state.
- `buildCollaborationNotificationPreferences`
  - per-human ordinary/digest/channel preferences; mandatory operational
    categories remain non-mutable.

### Index and search requirements

Required indexes include:

- Build + meaningful activity + post ID,
- Build + creation time + post ID,
- Build + state/type/author,
- post + comment creation,
- post + Action Item status/priority/due date,
- Build + assignee + status/due date,
- Build + referenced entity type/ID,
- Build + user for receipts/follows/pins/reactions,
- organization + user + Action Item status for the cross-Build personal queue,
- idempotency keys for system events, notification fan-out, and publication.

Search indexes contain authorized filter fields such as Build ID and content
state. The query must resolve access before searching and never post-filter a
cross-audience result set.

## File Plan

### Convex domain files

- Create `convex/activeBuildAccess.ts`
  - extract reusable active-Build authorization and relationship checks from
    `production_proposals.ts`;
  - retain fluent-convex builders from `authz.ts`;
  - update existing active-Build functions to use the extracted module.
- Create `convex/build_collaboration_model.ts`
  - pure role hierarchy, audience resolution, entity ACL intersection,
    post/action state machines, receipt visibility, dependency cycle checks,
    bundle hashing, and projection helpers.
- Create `convex/build_collaboration.ts`
  - all collaboration public/internal queries and mutations using
    fluent-convex chains.
- Create `convex/build_collaboration_notifications.ts`
  - notification classification, preference resolution, dedupe, digest,
    reminders, overdue escalation, and `recipientDeliveries`/outbox adapters.
- Create `convex/build_collaboration_migrations.ts`
  - note backfill definitions, dry-run parity report, activation preflight, and
    tenant cutover runner.
- Create `convex/build_collaboration.test.ts`
  - `convex-test` coverage at the public module interface.
- Create `convex/build_collaboration_model.test.ts`
  - pure exhaustive hierarchy/state-machine/property tests.
- Modify `convex/schema.ts`
  - table and validator declarations only.
- Modify `convex/fluent.ts` only if a truly generic reusable builder or
  middleware is required. Do not add collaboration functions.
- Modify `convex/authz.ts`
  - only shared identity normalization needed by the Build access module;
    do not write product functions here.
- Modify `convex/production_proposals.ts`
  - consume `activeBuildAccess.ts`;
  - stop returning/writing legacy notes after cutover;
  - emit internal collaboration system events from material existing
    transitions without moving those transitions into collaboration.
- Modify `convex/crons.ts`
  - schedule due-date reminders, escalation, scheduled publication, digest
    processing, and bounded maintenance jobs through internal functions.

### Production collaboration feature

- Create `src/features/build-collaboration/BuildCollaborationWorkspace.tsx`
  - deep UI module mounted with `buildId`, tenant scope, focused reference/post,
    and route callbacks.
- Create `src/features/build-collaboration/BuildCollaborationComposer.tsx`
  - post intent, audience preview, primary/related references, draft state,
    attachment staging, scheduled publication, and HITL summary.
- Create `src/features/build-collaboration/BuildCollaborationRichTextEditor.tsx`
  - compose the existing Kibo TipTap editor and extracted typed-reference
    extension; do not recreate the editor primitive.
- Create `src/features/build-collaboration/BuildEntityReference.tsx`
  - reference rendering, hover preview, and deep-link/detail-sheet dispatch.
- Create `src/features/build-collaboration/BuildCollaborationFeed.tsx`
  - cursor pagination, New activity boundary, filters, pins, saves, restricted
    placeholders, stable scroll, and focused-thread hydration.
- Create `src/features/build-collaboration/BuildCollaborationPostCard.tsx`
  - Card-based post presentation, type lifecycle, revisions, reactions,
    receipts, acknowledgements, moderation, and tabs.
- Create `src/features/build-collaboration/BuildCollaborationThread.tsx`
  - nested logical replies with three visual levels and focused ancestor path.
- Create `src/features/build-collaboration/BuildActionItems.tsx`
  - list, board, detail sheet, dependencies, children, checklists, assignment
    acceptance, and optimistic revision handling.
- Create `src/features/build-collaboration/model.ts`
  - typed frontend projections and pure display/routing helpers only.
- Create colocated tests for every module interface above.

All structural wrappers use `Frame`/`FramePanel`. Interactive post, reference,
and Action Item surfaces use `Card` and render through the correct interactive
element. Menus use the existing dropdown primitives with items nested inside
`DropdownMenuGroup`, preventing the Base UI `MenuGroupRootContext` failure.

### Prototype promotion

- Extract the typed reference node, suggestion filtering, reference extraction,
  rich preview, and sheet-dispatch behavior from
  `prototype/CollaborationRichTextEditor.tsx` and
  `prototype/InteractiveFamiliarFeedPrototype.tsx`.
- Adapt those behaviors to production query/mutation inputs; do not copy the
  3,000-line prototype into a second implementation.
- Keep the prototype route available as a fixture until production visual and
  interaction parity tests pass.
- After parity, make the prototype import the production primitives where that
  does not compromise its isolated fixture data.

### Build workspace integration

- Modify `BuildDetailTabs.tsx`
  - add `documents` to `BuildDetailSubTab` and `BUILD_DETAIL_TABS`.
- Modify all backoffice, builder, and builder-staff Build route search
  validators and visible-tab lists to accept Documents while keeping Details
  the default.
- Modify `ProductionBuildDetailSurface.tsx`
  - preserve Build Overview markup and default `current` sub-tab;
  - render capital/facility and budget/term requests inside the Draws panel;
  - remove the duplicate Milestone Kanban from Details;
  - remove the duplicate Contractors and Documents cards from Details;
  - remove Internal/Public Notes;
  - mount `BuildCollaborationWorkspace` immediately after the unchanged Build
    Overview region;
  - render `ProductionDocumentsCard` as the Documents tab, adapting it rather
    than recreating it.
- Keep Milestones, Contractors, Materials, Timeline, Evidence, Staff, Calendar,
  and Gantt canonical tabs unchanged.

### Contractor and Homeowner access

- Adapt the existing contractor Build route to mount the same
  `BuildCollaborationWorkspace` with its Build participation authorization.
- Add a Build-scoped Homeowner participation grant and authenticated homeowner
  Build route/shell. The Homeowner surface receives an allowlisted Build
  projection and the same collaboration module; it must not expose financing,
  lender policy, approval deliberation, internal risk detail, or unrelated
  participant data.
- Update `src/lib/auth/rbac.ts`, route guards, navigation, and tests to route an
  authenticated human with a valid Homeowner Build grant without treating
  `homeowner` as an organization-wide WorkOS role.
- Keep WorkOS projection tables webhook-owned. Invitations use WorkOS
  Management APIs where identity or organization membership changes are
  required; Build grants are written only to DrawFlow-owned participation
  tables.

## Implementation Tasks

### Task 1: Freeze executable policy tests

- [ ] Add exhaustive role/tier matrices for audience creation, downward-only
      restriction, moderation, assignment, pinning, receipt visibility, export,
      and invite authority.
- [ ] Add pure tests for dynamic versus fixed audiences, mandatory readers,
      entity ACL intersection, restricted placeholders, and person mentions.
- [ ] Add state-machine tests for post lifecycle, Action Items, assignment
      acceptance, acknowledgements, Build close/reopen, and participant removal.
- [ ] Add property tests for Action Item dependency cycles and permission
      compatibility.
- [ ] Confirm tests fail before the model implementation exists.

### Task 2: Extract the active-Build authorization seam

- [ ] Move canonical active-Build, brokerage, organization, viewer-role,
      builder relationship, staff grant, and contractor assignment checks into
      `activeBuildAccess.ts`.
- [ ] Update existing production active-Build queries and mutations to call the
      new interface.
- [ ] Preserve existing error semantics and audit behavior.
- [ ] Add focused tests proving no cross-tenant, unassigned Builder Staff, or
      unrelated Contractor access.
- [ ] Keep `production_proposals.ts` public function references stable during
      the refactor.

### Task 3: Add collaboration schema and indexes

- [ ] Add explicit tables and validators from the Data Model section.
- [ ] Add bounded compound indexes and search indexes; do not use `.filter()`
      or unbounded `.collect()` in production collaboration queries.
- [ ] Keep high-churn receipts/reactions/follows separate from posts.
- [ ] Generate Convex types and compile the Convex project.
- [ ] Add schema-level uniqueness/idempotency tests at the module interface.

### Task 4: Implement participants and audience resolution

- [ ] Implement Build participant invite, acceptance, removal, reinvite period,
      and role-change behavior.
- [ ] Derive organization-wide Admin/Principal Broker access without per-Build
      grants.
- [ ] Implement effective tier and role-exercised selection.
- [ ] Implement policy audiences, fixed custom audiences, current reader
      resolution, publication snapshots, and placeholder projection.
- [ ] Implement same-Build entity ACL adapters for every supported reference
      kind.
- [ ] Ensure denied content is absent from all non-feed query surfaces.

### Task 5: Implement drafts and atomic publication

- [ ] Implement private draft autosave and staged bundle records.
- [ ] Validate TipTap JSON, plain-text derivation, links, typed references,
      attachment ownership, primary reference, post intent, and audience.
- [ ] Implement publication preview with effective readers, exclusions,
      narrowed references, notifications, and mutations.
- [ ] Hash the full bundle and require a human approval record for agent-created
      or scheduled publications.
- [ ] Invalidate approval on material bundle changes.
- [ ] Atomically publish the post, initial revision, references, assets, Action
      Items, audit, outbox, and notification jobs.
- [ ] Preserve the approving human as author and store agent drafting provenance
      internally only.

### Task 6: Implement threads and post lifecycle

- [ ] Add comments, revisions, tombstones, moderation, Open/Resolved state, and
      automatic reopen-on-reply.
- [ ] Add accepted answers, Decision outcomes/owners, Issue dispositions, and
      Announcement expiry.
- [ ] Add follows, reactions, pins/saves, receipts, required acknowledgements,
      and hierarchical receipt visibility.
- [ ] Update meaningful activity transactionally only for approved bump events.
- [ ] Add Newest posts and latest-meaningful-activity cursor queries.

### Task 7: Implement Action Items

- [ ] Implement canonical fields, workflow, Blocked/Cancelled restoration,
      assignment requests, acceptance, due-date policy, and cancellation.
- [ ] Implement one-level children and separate checklist rows.
- [ ] Implement dependency/related/duplicate relations with cycle and ACL
      validation.
- [ ] Implement list, board, post, entity, Build, and cross-Build personal
      projections from the same canonical item.
- [ ] Implement optimistic concurrency for edits and board transitions.
- [ ] Implement participant-removal unassignment and coordinator notification.

### Task 8: Implement assets and typed references

- [ ] Extract typed reference extensions from the prototype and compose them
      into the existing production TipTap editor.
- [ ] Add permission-filtered `@` search for all approved entity kinds.
- [ ] Add publication-time label/summary snapshots and live-current previews.
- [ ] Route clicks into existing Milestone, Evidence, Site Visit, Document,
      Material, Draw, and Action Item surfaces; extract existing inline sheets
      where necessary instead of cloning them.
- [ ] Add general Build assets, attachment links, scan/quarantine states, and
      version lineage.
- [ ] Prevent orphan, cross-Build, inaccessible, or unscanned attachments.

### Task 9: Implement notifications, scheduling, and system events

- [ ] Classify immediate, digest, mandatory, and muted notification events.
- [ ] Reuse `recipientDeliveries` and `eventOutbox` adapters with dedupe keys.
- [ ] Implement generous per-user/Build/organization fan-out limits and
      recoverable errors.
- [ ] Implement scheduled publication revalidation and renewal of invalidated
      HITL approval.
- [ ] Implement due-date reminders and hierarchical overdue escalation.
- [ ] Wire material Evidence, Site Visit, Milestone, Draw, and Document
      transitions to idempotent immutable system posts.
- [ ] Implement deterministic policy-created Action Items with duplicate-open
      obligation protection.
- [ ] Exclude Seen receipts from default webhook delivery.

### Task 10: Promote the approved UI

- [ ] Build the production feature modules using existing Frame, Card, Sheet,
      Popover, Tabs, menu, avatar, badge, button, and editor primitives.
- [ ] Port the approved Familiar Feed interactions rather than recreating the
      prototype from screenshots.
- [ ] Add responsive feed, right rail, compact filters, stable real-time
      updates, focused-thread hydration, and unread boundary.
- [ ] Add accessible keyboard navigation, focus restoration, menu grouping,
      editor suggestion navigation, and screen-reader labels.
- [ ] Add empty, restricted, loading, error, stale-write, offline-draft,
      quarantined-file, removed-participant, and closed-Build states.

### Task 11: Restructure the production Details workspace

- [ ] Lock a regression test proving Details remains the default and Build
      Overview remains the first operational region.
- [ ] Move Facility/Capital and Budget/Term request cards into Build Overview →
      Draws without changing their existing mutation interfaces.
- [ ] Remove duplicate Milestone, Contractor, Document, and Notes sections from
      Details.
- [ ] Mount Build Collaboration below Build Overview.
- [ ] Add and route the Documents top-level tab using the existing Documents
      implementation.
- [ ] Update all shared production surface and route tests.

### Task 12: Ship role-complete access

- [ ] Integrate collaboration into backoffice, Builder, and Builder Staff Build
      routes through the shared surface.
- [ ] Integrate the same module into the Contractor Build route.
- [ ] Add Homeowner Build participation, route policy, allowlisted Build
      projection, navigation, and tests.
- [ ] Add invite/role-assignment authority and downward hierarchy enforcement.
- [ ] Add multi-role, role change, removed participant, and organization-wide
      Admin/Principal Broker tests.

### Task 13: Migrate Notes and activate tenants

- [ ] Create a dry-run report for note counts, author/time preservation,
      content, visibility mapping, and source IDs.
- [ ] Backfill Public Notes as imported Build-wide Updates.
- [ ] Backfill Internal Notes as imported brokerage/lender coordinating-team
      Updates.
- [ ] Create no notifications, receipts, or meaningful-activity bump during
      migration.
- [ ] Block activation on parity or authorization failures.
- [ ] Enable the new module per tenant with a one-way cutover and no dual writes.
- [ ] Remove legacy note reads/writes and UI only after activated-tenant parity.
- [ ] Retain a bounded, audited recovery report; never write new content back
      into legacy Notes.

### Task 14: Harden search, export, moderation, and closure

- [ ] Implement Build-local authorized search and filters.
- [ ] Implement role-limited export, ACL snapshots, expiring links, and audit.
- [ ] Implement moderation hierarchy, author notification, and appeal metadata.
- [ ] Implement Build close/reopen preflight over open Action Items.
- [ ] Implement retention and legal-hold enforcement.
- [ ] Add anomaly signals for export bursts, permission failures, mention
      storms, and automated mutation bursts.

### Task 15: Verify and document

- [ ] Run `bun x convex codegen`.
- [ ] Run `bun x tsc -p convex/tsconfig.json`.
- [ ] Run targeted Convex and frontend tests.
- [ ] Run `bun run test`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run build`.
- [ ] Run the UI HTML interaction audit.
- [ ] Run Playwright role/audience journeys for backoffice, Builder, Builder
      Staff, Homeowner, and Contractor.
- [ ] Visually compare the production Details feed with approved Variant A on
      desktop and compact viewports.
- [ ] Validate keyboard-only editor, mention, menu, thread, sheet, and board
      flows.
- [ ] Update `docs/auth-rbac-foundation.md`, production PRD/vocabulary, API
      documentation, webhook catalog, migration runbook, and operational
      dashboards.

## Required Test Matrix

At minimum, tests must cover:

- every author tier against every audience tier,
- multi-role highest-tier visibility and role-exercised capability,
- dynamic audience grant/revocation and fixed custom membership,
- mandatory higher-tier readers,
- entity ACL narrowing and conflict rejection,
- same-Build reference enforcement,
- placeholder non-disclosure,
- search/export/AI retrieval exclusion,
- post/comment revision and tombstone history,
- moderation and appeal hierarchy,
- reaction versus acknowledgement versus approval semantics,
- hierarchical Seen receipt visibility and edit-unread behavior,
- Action Item assignment, acceptance, children, checklist, dependencies,
  overdue escalation, cancellation, and participant removal,
- deterministic system event and Action Item idempotency,
- HITL bundle hash invalidation and human authorship,
- scheduled publication revalidation,
- offline draft reconnect conflict,
- stale post/action revisions,
- tenant isolation and immutable Build ownership,
- closed Build read-only behavior and audited reopening,
- migration parity and no-notification/no-bump behavior.

## Rollout

1. Deploy schema and inactive backend functions.
2. Run internal organization migrations and parity checks.
3. Exercise production UI with fixture and internal organizations.
4. Activate selected customer organizations.
5. Monitor authorization denials, notification fan-out, migration parity,
   search latency, feed pagination, overdue scheduling, and disclosure alarms.
6. Expand to general availability only after zero cross-audience incidents and
   stable operational metrics.

Activation is one-way per organization. Recovery repairs the new canonical
model; it does not re-enable legacy note writes.

## Definition of Done

The work is complete only when:

- Details remains the default live-Build tab.
- Build Overview is functionally and visually unchanged at the top.
- Capital/Term Requests live under Build Overview → Draws.
- duplicate Milestone, Contractor, Document, and Notes sections are absent from
  Details.
- Documents is a first-class tab.
- the production feed persists all approved Variant A interactions.
- all audience, hierarchy, entity ACL, receipt, HITL, and audit rules pass the
  required matrix.
- backoffice, Builder, Builder Staff, Homeowner, and Contractor participants
  can use the same authorized Build-local collaboration module.
- legacy Notes have migrated with parity and can no longer receive writes.
- Convex codegen/typecheck, the full test suite, production build, interaction
  audit, Playwright journeys, and visual review pass.
