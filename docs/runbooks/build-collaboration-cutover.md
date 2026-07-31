# Build Collaboration Cutover Runbook

## Purpose

Promote the Build-local Collaboration workspace, migrate legacy Public/Internal
Notes, and activate the production feed without leaking restricted metadata or
duplicating operational records.

## Preconditions

- Deploy the collaboration schema and fluent-Convex functions.
- Run `bun x convex codegen` and `bun x tsc -p convex/tsconfig.json --noEmit`.
- Confirm the originating brokerage/lender WorkOS organization on every active
  Build in scope. Builds do not move organizations.
- Keep collaboration disabled or migration-ready until parity checks pass.
- Configure `BUILD_COLLABORATION_EMAIL_DELIVERY_URL`,
  `BUILD_COLLABORATION_PUSH_DELIVERY_URL`, and
  `BUILD_COLLABORATION_DELIVERY_BEARER_TOKEN` on the Convex deployment.
- Configure `VITE_BUILD_COLLABORATION_PUSH_PUBLIC_KEY` with the matching
  URL-safe VAPID public key in the web deployment. Push opt-in must remain
  unavailable when this key is absent.

## Migration

Run the legacy Note migration first:

```sh
bun x convex run --prod build_collaboration_migrations:runBuildCollaborationNoteBackfill
```

The migration is idempotent. Each legacy note uses
`buildNote:<legacy note id>` as `importedSourceId`:

- Public Notes become Build-wide imported Updates.
- Internal Notes become author-tier-and-higher imported Updates.
- Original author, role snapshot, body, and timestamps are preserved.
- Migration creates no notifications, Seen receipts, Action Items, or artificial
  meaningful-activity bump.

Re-running the migration must produce zero duplicate posts.

Before enabling external delivery, cancel any pre-remediation unsent delivery
that cannot prove the exact post/comment revision that created it. Run each
status in bounded pages and pass the returned `continueCursor` back until
`isDone` is true:

```sh
bun x convex run --prod build_collaboration_delivery_maintenance:cancelLegacyDeliveriesMissingSourceRevision '{"status":"queued"}'
bun x convex run --prod build_collaboration_delivery_maintenance:cancelLegacyDeliveriesMissingSourceRevision '{"status":"failed"}'
bun x convex run --prod build_collaboration_delivery_maintenance:cancelLegacyDeliveriesMissingSourceRevision '{"status":"dispatched"}'
```

Do not reconstruct a missing revision from the post's current revision. A
legacy row without original revision provenance must remain cancelled and can
only be replaced by a new canonical notification event.

Then initialize the indexed Action Item deadline scheduler and canonical
due-first queue order for every legacy row:

```sh
bun x convex run --prod build_action_item_deadline_migrations:runBuildActionItemDeadlineScheduleBackfill
bun x convex run --prod build_action_item_deadline_migrations:runBuildActionItemReferenceQueueSortBackfill
```

The backfill is idempotent: it initializes missing `deadlineProcessingState`
and `queueSortAt` fields without replacing existing values, then projects each
Action Item's canonical queue order onto its entity-reference rows. Before
activation, verify that no legacy Action Item still has either field absent,
that every Action Item reference has `actionItemQueueSortAt`, that open dated
items are `pending` with the expected `deadlineNextAt`, that undated or closed
items are `complete`, and that the first Build, post, personal, and entity queue
pages contain overdue work before upcoming, undated, and closed work. An entity
queue page must be composed from matching reference rows rather than unrelated
Build work. Duplicate Action Item references to the same entity are collapsed
to the earliest row; if any duplicate was primary, the retained row is primary.
The reference migration intentionally processes one reference row per Convex
transaction. Each row may validate the Action Item's full supported
100-reference set, so increasing this batch size without a new read-budget proof
is prohibited.
Re-run the command after a failed or interrupted deployment; the migration
component resumes safely from its recorded cursor.

## Parity Checks

For each Build:

1. Legacy note count equals imported collaboration post count.
2. Every imported post has exactly one current revision.
3. Public and Internal visibility maps to the expected audience mode and floor.
4. A Contractor cannot read an imported Internal Note or infer its author,
   timestamp, references, or Action Items.
5. Admin, Principal Broker, Broker/Builder/Broker Staff, Builder Staff,
   Homeowner, and Contractor feed results match the approved role matrix.

## Activation

After parity:

1. Mark the tenant collaboration setting active.
2. Deploy the Details composition with Build Overview unchanged and the
   Collaboration feed beneath it.
3. Confirm Documents, Milestones, Contractors, and Draws own their canonical
   content.
4. Remove Public/Internal Notes from navigation and shared write paths.

## Rollback

Rollback is UI/configuration-only:

- disable the collaboration surface for the tenant;
- retain imported posts and audit data;
- do not delete migrated posts or restore dual writes;
- diagnose and correct the migration, then re-run the idempotent parity checks.

## Verification

```sh
bun x convex codegen
bun x tsc -p convex/tsconfig.json --noEmit
bun run test
bun run typecheck
bun run build
bun run ui:html:audit
```

Monitor authorization denials, restricted-placeholder disclosure alarms,
notification fan-out, duplicate idempotency keys, stale draft approvals,
Action Item revision conflicts, and migration parity.

Verify one daily and one weekly digest, one immediate direct mention, an email
retry using the same provider idempotency key, and a browser push opt-in through
`/build-collaboration-push-sw.js`. Before provider handoff, revoke a participant
and quarantine an attached collaboration asset; both queued payloads must be
redacted and cancelled without a provider request.

External delivery retries must retain one immutable batch record: exact member
delivery IDs, original source-revision IDs, payload snapshot, and a
collision-resistant provider idempotency key. The batch also snapshots the
email destination or complete Build/device push destination set. If a
destination changes, cancel the old batch and create a new batch/key before
sending. If any member loses access, the
whole batch is cancelled and its outbox is redacted; survivors must not be
rebatched under a new key. Verify this by editing a post after a failed provider
attempt, revoking access to an attachment on the original revision, and
confirming the retry performs no provider request.

Push subscriptions are Build- and browser-endpoint-scoped. Register two browser
endpoints for one participant and verify the provider payload contains both.
Then register one endpoint as a second WorkOS user and verify ownership transfers
atomically, the prior user's subscription is revoked, and the prior user's push
preference is removed when no device remains. Disabling push on one browser must
leave the browser subscription and every other Build/device opt-in intact.
Endpoint ownership revisions and Build bindings are authoritative. A transfer
cleanup job must match the ownership revision that scheduled it; a stale job must
not revoke an endpoint that has since returned to the prior user. Build device
limits are counted from the current binding projection after stale bindings are
pruned, never from unfiltered historical subscription rows.
