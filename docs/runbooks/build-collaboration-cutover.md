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

Materialize the Build-local, authorization-compatible search partitions after
every legacy post has been imported:

```sh
bun x convex run --prod build_collaboration_search_migrations:runBuildCollaborationSearchRecordBackfill
```

This backfill is idempotent and first enqueues every active Build, including
Builds with no collaboration rows, then enqueues one post, comment, or Action
Item owner per migration transaction. The originating transaction writes only
a bounded maintenance job and marks the Build's search generation `building`. Scheduled
internal actions and mutations retire old rows, materialize role and exact-reader
partitions, and activate staged rows in bounded pages. Search serves no rows
from that Build while the generation is building, so a partial or interrupted
backfill cannot expose stale ACLs or silently incomplete results.

Each scheduled job has a durable failure counter, retry lease, and watchdog.
Application failures are recorded and retried with bounded backoff; an expired
queued/running lease is rescheduled instead of leaving the Build permanently
`building`. Re-run the command after an interrupted deployment; the migration
component resumes from its recorded cursor and duplicate owner jobs coalesce. After the
migration runner reports completion, inspect every Build until the status is
`ready`, `hasPendingJobs` is false, and `readerFingerprintCurrent` is true:

```sh
bun x convex run --prod build_collaboration_search_maintenance:inspectBuildCollaborationSearchMaintenance '{"organizationId":"<workos-organization-id>","buildId":"<active-build-id>"}'
```

Do not activate the tenant while any Build reports `missing` or `building`.
Participant activation/removal, organization-wide Admin or Principal Broker
membership drift, post/comment/Action Item edits, moderation/tombstones, asset
publication, and authoritative workflow system events invalidate the current
generation and run the same bounded maintenance path. Open clients subscribe
to that generation and discard cached results immediately when it changes.

After every Build is ready, create the durable tenant cutover verification and
wait for it to report `ready` with equal Build counts:

```sh
bun x convex run --prod build_collaboration_search_maintenance:startBuildCollaborationSearchCutoverVerification '{"organizationId":"<workos-organization-id>","buildId":"<any-active-build-id>"}'
bun x convex run --prod build_collaboration_search_maintenance:inspectBuildCollaborationSearchCutoverVerification '{"organizationId":"<workos-organization-id>","buildId":"<any-active-build-id>"}'
```

The activation mutation enforces this verification atomically. It rejects a
missing, blocked, or stale check; unequal Build counts; a Build created after
verification; changed organization-wide Admin/Principal Broker membership; any
Build in `building`; and every queued, running, or failed maintenance job. The
operator cannot bypass this gate with the status-transition API.

Before activation, verify that every active collaboration post is searchable
by each current authorized reader, tombstoned or moderated content produces no
search result, and a lower-tier canary cannot search or infer a restricted
post, reference, Action Item, asset, result count, or pagination topology.
Search must page only a ready authorized index; it must not fall back to
scanning the Build's post, comment, or Action Item corpus.

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

## Governed Asset Activation

Configure the production Convex deployment before enabling collaboration
attachments:

- `BUILD_COLLABORATION_ASSET_SCAN_URL` must be an HTTPS endpoint reachable from
  Convex actions.
- `BUILD_COLLABORATION_ASSET_SCAN_BEARER_TOKEN` is optional only when the
  scanner authenticates the caller by another production control. Never put the
  scanner credential in the browser or Vercel client environment.
- The scanner receives `fileUrl`, `fileName`, `mimeType`, `sizeBytes`, and the
  uploader-computed `contentHashSha256`. It must return JSON containing
  `clean`, `sha256`, and an optional bounded `message`.
- A clean verdict is accepted only when the scanner-computed SHA-256 exactly
  matches the hash finalized with the upload. Missing configuration, network
  failure, non-2xx responses, malformed responses, explicit rejection, and
  hash mismatch all fail closed; the asset remains quarantined or rejected.

The release supports files from 1 byte through 100 MB and at most 25 active
staging sessions per participant and Build. Upload staging is private, Build-
and tenant-bound, owned by the initiating human or trusted draft-preparation
agent, and expires after 24 hours. The browser registers the returned Convex
storage identity before finalization so failed, interrupted, and expired
uploads can delete their unowned bytes. Publication marks the session
`consumed` and creates the first shared attachment record in the same Convex
transaction as its post, comment, or Action Item. Discarding a private draft
abandons its staging session, rejects an otherwise unattached asset, and
deletes its stored bytes without deleting the audit history. A replacement is
a new immutable version; scanning it never changes the current version. Only
publishing the replacement atomically marks the prior version `superseded`, and
historical revisions retain their original attachment references and ACLs.

Before activation, perform all of these canaries against the production tenant:

1. Upload a harmless text file and image through a private draft. Confirm each
   is quarantined before the scanner response and becomes `available` only
   after a clean matching hash.
2. Publish one asset on a post, one on a reply, and one on an Action Item.
   Confirm each owning revision and `build.collaboration.asset.published` audit
   event exist and no attachment row existed while the draft was private.
3. Replace one published asset from its attachment card. Before publishing the
   replacement reply, confirm the original remains `available`. After
   publication, confirm the original row and historical attachment still exist
   with version 1 while the replacement is version 2 and the staging session is
   `consumed`.
4. Attempt a known scanner rejection, a hash mismatch, an attachment from a
   different Build, and a direct reference to an orphan asset. None may publish
   or return a download URL.
5. Authorize a download, remove that participant, and retry. The second request
   must be denied. Confirm every successful authorization produced a
   `build.collaboration.asset.download_authorized` audit event.
6. Discard a draft containing a clean staged asset. Confirm the staging session
   is `abandoned`, the unattached asset is `rejected`, and an
   `build.collaboration.asset.abandoned` audit event exists. Deliver a delayed
   clean scan result and confirm it cannot resurrect the asset.
7. Interrupt one registered upload before finalization and expire its staging
   session. Confirm the storage object is deleted. Reject or abandon a version
   2 replacement, retry from the original, and confirm the retry is the sole
   publishable successor with a linear version number. Attempt two concurrent
   replacements and confirm the second fails closed and its storage is cleaned.

Existing asset rows without a clean scan verdict and content hash are legacy
untrusted data and intentionally remain unavailable. Do not relabel them clean
or bulk-attach them. Re-ingest the original bytes through the governed upload
and scanner path when they must be retained.

Evidence Assets remain owned by the Evidence Package workflow. A failed or
missing geofence must continue to preserve the uploaded Evidence as
location-unverified and route it to lender/admin review; never convert, delete,
or reject that Evidence merely because it is also referenced from a
collaboration post.

## Operational Event Activation

Evidence and Site Visit events are published from their authoritative Convex
mutation. Do not introduce a client-side dual write or an asynchronous repair
path: if collaboration is active, the operational state change, system post,
canonical reference, notification fan-out, and deterministic remediation
Action Item commit or roll back together. When collaboration is disabled, the
authoritative Evidence or Site Visit mutation continues and emits no
collaboration records.

Before enabling the operational event integration for a production tenant, run
these Build-local canaries:

1. Submit one location-verified Evidence Asset and one location-unverified
   Evidence Asset. Confirm deterministic `operational:evidence:*` event keys,
   canonical Evidence references, and exactly one policy-created remediation
   Action Item for the unverified Asset.
2. Reject an Evidence review, repeat the identical review request, then accept
   the revised package. Confirm the retry creates no additional post,
   reference, notification, or Action Item and that acceptance creates a
   distinct completed event.
3. Schedule a Site Visit twice with the same caller idempotency key and confirm
   the original Visit and post are reused. Reschedule it, then repeat the same
   schedule. Confirm only the material schedule changes emit posts. Complete
   one Visit and flag another; both must deep-link to the existing focused Site
   Visit detail and only contractors assigned to that Visit's milestone scope
   may read or receive the event.
   Reuse the schedule key with different request fields and confirm the request
   is rejected without creating another Visit or post.
4. Submit a tokenized Site Visit report outside the configured geofence.
   Confirm the original Evidence Asset and bytes remain present, its canonical
   location attempt and failure fields are preserved, and lender/admin review
   receives both the issue post and duplicate-safe remediation work.
5. Replay one system-event idempotency key and confirm the original post ID is
   returned with no new fan-out. Attempt a reference from another Build and
   confirm the entire transaction rolls back.
6. View the Evidence events as Admin, Broker, Builder Staff, Contractor, and
   Homeowner. Authorized lender/builder readers receive the complete post;
   excluded readers receive only a stable restricted placeholder with no
   metadata. Site Visit visibility must match its canonical entity ACL.
7. Confirm organization-wide Admin and Principal Broker members receive blocker
   notifications without redundant Build participant grants. Reassert a policy
   exception while its Action Item remains open and confirm the existing
   obligation is reused with a policy due date, active deadline schedule, and
   governed completion acceptance.
8. Retry a tokenized Site Visit Evidence registration with the same client ID
   and identical payload; confirm the original asset is returned. Reuse the ID
   with different file, scope, location, or storage metadata and confirm the
   registration is rejected and the unowned upload is deleted. Submitting the
   report with an unchanged unverified location attempt must not emit a second
   Evidence blocker; a material location change must emit one.

Monitor `build.collaboration.system_event.published` and
`build.collaboration.action_item.policy_created` audit/outbox events by tenant
and event key. Alert on duplicate system-event keys, transaction failures,
missing canonical references, notification fan-out drift, or a remediation post
whose open Action Item count is zero.

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
Action Item revision conflicts, asset scan failures and hash mismatches,
abandoned staging volume, denied download attempts, and migration parity.

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
