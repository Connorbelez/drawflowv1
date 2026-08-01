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
- Bind the exact release on the production Convex deployment with
  `BUILD_COLLABORATION_RELEASE_APPLICATION_URL`,
  `BUILD_COLLABORATION_RELEASE_APPLICATION_VERSION`,
  `BUILD_COLLABORATION_RELEASE_CONVEX_DEPLOYMENT`, and
  `BUILD_COLLABORATION_RELEASE_GIT_SHA`. `CONVEX_CLOUD_URL` must identify the
  same deployment. The web deployment must expose the same Git SHA and version
  at `GET /api/release`; certification fails closed when either side differs.
- Set the deployment selector to canonical `prod` or
  `<team>:<project>:prod`. Raw deployment names, development selectors, and
  staging/preview references are not accepted as production evidence.

## Migration

Run the no-write legacy Note preview first with an authenticated human Admin or
Principal Broker identity. The representative Build must belong to the tenant.
The preview is a cursor-paged state machine: page all Builds, carrying the
returned accumulator between pages, then page all Notes from the final Build
accumulator. Archive every page. The last Note page returns the confirmed token:

```sh
bun x convex run --prod --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_legacy_note_plan:previewBuildCollaborationLegacyNoteMigrationPage '{"organizationId":"<workos-organization-id>","buildId":"<any-active-build-id>","phase":"builds","paginationOpts":{"cursor":null,"numItems":50}}'
# Repeat with continueCursor and the prior accumulator until isDone=true.
# Then repeat with phase=notes, cursor=null, and the final Build accumulator.
# Carry the returned accumulator and continueCursor on every subsequent page.
PLAN_TOKEN='<planToken from the final Note page>'
```

Archive the full preview output with the release evidence. Confirm its tenant,
exact Build and note lists, audience mappings, expected revision `1`, and that
`warnings` is empty. Any source ownership or author-role warning is blocking.
The SHA-256 plan token covers every source field and Build ownership fact; never
copy a token from a different preview or tenant. It also covers the tenant's
current cutover epoch. Any transition back to `disabled` increments that epoch,
so a post-rollback preview and parity run are mandatory even when the source
Notes have not changed.

Start a durable manifest for the exact token, then advance it until `status` is
`importing` (or `complete` when there are zero source Notes). `maxItems` cannot
exceed 25 and each transaction writes at most that many manifest rows:

```sh
RUN=$(bun x convex run --prod --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_legacy_note_plan:startBuildCollaborationLegacyNoteMigration "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<any-active-build-id>' --arg planToken "$PLAN_TOKEN" '{organizationId:$organizationId,buildId:$buildId,planToken:$planToken}')")
RUN_ID=$(printf '%s' "$RUN" | jq -r '.value.runId // .runId')
bun x convex run --prod --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_legacy_note_plan:advanceBuildCollaborationLegacyNotePlan "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<any-active-build-id>' --arg runId "$RUN_ID" '{organizationId:$organizationId,buildId:$buildId,runId:$runId,maxItems:25}')"
# Repeat advance until validationPhase=complete.
```

Apply the frozen manifest in bounded batches. Repeat until `complete=true`;
`nextImportOrdinal` advances durably and a failed transaction does not advance
it:

```sh
bun x convex run --prod --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_legacy_note_import:applyBuildCollaborationLegacyNoteMigrationBatch "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<any-active-build-id>' --arg planToken "$PLAN_TOKEN" --arg runId "$RUN_ID" '{organizationId:$organizationId,buildId:$buildId,planToken:$planToken,runId:$runId,maxNotes:25}')"
```

If a source note or Build ownership fact changes after preview, application
fails before writing and requires a new preview/token. A new plan safely
revalidates already-imported rows and resumes without duplicates. The former
`build_collaboration_migrations:runBuildCollaborationNoteBackfill` entry point
is deliberately disabled and must not be used.

Each imported legacy note uses `buildNote:<legacy note id>` as
`importedSourceId`:

- Public Notes become Build-wide imported Updates.
- Internal Notes become author-tier-and-higher imported Updates.
- Original author, role snapshot, body, and timestamps are preserved.
- Migration creates no notifications, Seen receipts, Action Items, or artificial
  meaningful-activity bump.

Re-running a completed plan produces zero writes and zero duplicate posts or
revisions.

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
`building`. Search traffic does not bypass a failed job's future retry lease.
Re-run the command after an interrupted deployment; the migration
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

The verifier first pages every WorkOS membership into the bounded collaboration
authority projection, including `admin` or `principle-broker` roles present as
secondary roles. It then rebuilds every Build search generation against that
completed projection and waits for all bounded maintenance jobs to finish
before it verifies reader fingerprints and Build counts. A failed rebuild
blocks verification with its recorded failure; it is never accepted as ready.
The activation mutation enforces this verification atomically.
It rejects a
missing, blocked, or stale check; unequal Build counts; a Build created after
verification; changed organization-wide Admin/Principal Broker membership;
changes to builder-account, Build-broker, Build-contractor, or assigned
contractor-profile account identity reader sources;
any Build in `building`; and every queued, running, or failed maintenance job.
All activation checks use organization-scoped indexes. The operator cannot
bypass this gate with the status-transition API.

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

Start durable server-derived parity from the completed migration run, then
advance it in bounded pages until `status=complete`:

```sh
PARITY=$(bun x convex run --prod --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_legacy_note_parity:startBuildCollaborationLegacyNoteParity "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<any-active-build-id>' --arg planToken "$PLAN_TOKEN" --arg migrationRunId "$RUN_ID" '{organizationId:$organizationId,buildId:$buildId,planToken:$planToken,migrationRunId:$migrationRunId}')")
PARITY_RUN_ID=$(printf '%s' "$PARITY" | jq -r '.value.parityRunId // .parityRunId')
bun x convex run --prod --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_legacy_note_parity:advanceBuildCollaborationLegacyNoteParity "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<any-active-build-id>' --arg parityRunId "$PARITY_RUN_ID" '{organizationId:$organizationId,buildId:$buildId,parityRunId:$parityRunId,maxItems:10,reason:"Production legacy-note cutover parity"}')"
# Repeat advance until status=complete, then capture evidenceId.
bun x convex run --prod --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_legacy_note_parity:getBuildCollaborationLegacyNoteMigrationParityReport "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<any-active-build-id>' --arg evidenceId '<evidence-id>' '{organizationId:$organizationId,buildId:$buildId,evidenceId:$evidenceId,paginationOpts:{cursor:null,numItems:50}}')"
# Repeat report pages until reports.isDone=true.
```

Do not use operator-attested counts from
`recordBuildCollaborationMigrationParityEvidence` as cutover evidence. Tenant
status transitions accept only the current `legacy_note_migration_v1` report
produced by the verifier. Its top-level evidence and one durable row per Build
must prove:

1. Legacy note count equals imported collaboration post count.
2. Every imported post has exactly one current revision.
3. Public and Internal visibility maps to the expected audience mode and floor.
4. A Contractor cannot read an imported Internal Note or infer its author,
   timestamp, references, or Action Items.
5. Admin, Principal Broker, Broker/Builder/Broker Staff, Builder Staff,
   Homeowner, and Contractor feed results match the approved role matrix.

The report must have `reportVersion` `build-collaboration-legacy-note-parity/v2`,
`parityPassed: true`, `mismatchCount: 0`, the expected Build count, and the
exact current plan token. The activation gate also requires the evidence to be
linked to the completed migration and parity runs. Source drift, a missing or
duplicate import, or an imported `buildNote:*` row absent from the frozen
manifest fails parity—including the zero-source-note case. The evidence epoch
must equal the tenant's current cutover epoch, and the frozen manifest's latest
Build creation boundary must still equal the tenant's latest Build. A rollback,
destination edit followed by rollback, or Build created after parity therefore
requires a new preview, manifest, import validation, and parity report.

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
- diagnose and correct the migration, then generate a new epoch-bound preview
  and re-run the idempotent import and parity checks. Prior passing evidence is
  deliberately invalid after rollback.

Rehearse this against the complete tenant, not only the representative Build.
Freeze collaboration publishing for the maintenance window, then create and
advance a durable server-side `before` snapshot. Each call processes at most
100 indexed tenant rows and persists the cursor plus chained SHA-256 digest;
repeat until `isComplete=true`. Beginning the snapshot enforces the freeze in
every collaboration read/write path, and rollout transitions are rejected
until the corresponding snapshot phase is complete. Each page also rechecks
the tenant status and cutover epoch, so a partial snapshot cannot cross a
disable or reactivation boundary:

```sh
REHEARSAL=$(bun x convex run --deployment '<production-convex-deployment>' --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_cutover_rehearsals:beginBuildCollaborationRollbackRehearsal '{"organizationId":"<workos-organization-id>","buildId":"<active-build-id>","gitCommit":"<40-character-git-sha>","applicationVersion":"<application-version>","applicationUrl":"https://<production-host>","convexDeployment":"<production-convex-deployment>","convexUrl":"https://<production-convex-url>"}')
REHEARSAL_ID=$(printf '%s' "$REHEARSAL" | jq -r '.value.rehearsalId // .rehearsalId')
SNAPSHOT_ID=$(printf '%s' "$REHEARSAL" | jq -r '.value.snapshotId // .snapshotId')
bun x convex run --deployment '<production-convex-deployment>' --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_cutover_rehearsals:advanceBuildCollaborationRollbackSnapshot "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<active-build-id>' --arg snapshotId "$SNAPSHOT_ID" '{organizationId:$organizationId,buildId:$buildId,snapshotId:$snapshotId,limit:100}')"
# Repeat until isComplete=true.
```

Transition the tenant from `active` to `disabled`; this must increment the
cutover epoch exactly once. Execute the real legacy mutation canary and require
the retired-write contract, then capture the server-side `after` snapshot with
the original audit cutoff:

```sh
bun x convex run --deployment '<production-convex-deployment>' --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_cutover_rehearsals:executeBuildCollaborationLegacyWriteDenialCanary "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<active-build-id>' --arg rehearsalId "$REHEARSAL_ID" '{organizationId:$organizationId,buildId:$buildId,rehearsalId:$rehearsalId}')"
AFTER_ID=$(bun x convex run --deployment '<production-convex-deployment>' --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_cutover_rehearsals:beginBuildCollaborationRollbackAfterSnapshot "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<active-build-id>' --arg rehearsalId "$REHEARSAL_ID" '{organizationId:$organizationId,buildId:$buildId,rehearsalId:$rehearsalId}')" | jq -r '.value // .')
bun x convex run --deployment '<production-convex-deployment>' --identity "$OPERATOR_IDENTITY_JSON" build_collaboration_cutover_rehearsals:advanceBuildCollaborationRollbackSnapshot "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<active-build-id>' --arg snapshotId "$AFTER_ID" '{organizationId:$organizationId,buildId:$buildId,snapshotId:$snapshotId,limit:100}')"
# Repeat until isComplete=true and retentionMatched=true.
```

The rehearsal compares tenant-wide post, revision, asset, receipt, and
pre-disable audit-event counts and stable-ID/content digests. A missing or
rewritten row marks the durable rehearsal failed. Re-run the epoch-bound
migration preview/parity gates, reactivate, and only then certify. The live
certification query reads this retained rehearsal; an operator-authored
before/after snapshot is never accepted.

## Deployment Record Certification

Copy
`docs/runbooks/build-collaboration-deployment-record.template.json` into the
release evidence directory and replace every placeholder with the retained
production artifact and monitoring link. Artifact paths may be absolute or
relative to the manifest. Every referenced file is typed JSON and must carry
the same organization, representative Build, forbidden-tenant probe scope, Git
SHA, application URL/version, Convex URL, and exact Convex deployment as the
manifest; record its SHA-256 after finalizing
the file. The manifest no longer duplicates command, parity, role-journey,
activation, interface, or rollback results.

The record is intentionally fail-closed. It requires all eight approved role
journeys, every automated and manual release gate, v2 migration parity, an
audited human activation, monitoring coverage, and a rollback rehearsal with
stable-ID/content hashes. Existing post, revision, asset, and receipt records
must be byte-stable; prior audit events must remain an unchanged subset because
rollback and reactivation correctly append new audit events.

Generate every command artifact through the governed runner. It refuses a Git
HEAD mismatch, owns the exact argv for each automated gate, captures real exit
status, retains stdout/stderr sidecars with verified hashes, and writes a pass
artifact only after exit code zero.
For `visualReview` and `keyboardReview`, pass a human WorkOS user ID plus at
least one screenshot, video, or report path; the runner hashes that evidence.
Do not hand-author command evidence JSON.

```sh
BUILD_COLLABORATION_OPERATOR_IDENTITY_JSON='<human-admin-or-principal-identity>' \
  bun run run:build-collaboration-cutover-gate -- \
  --gate authenticatedProductionProbes \
  --manifest '<release-evidence-dir>/cutover-evidence.json' \
  --output '<release-evidence-dir>/authenticated-production-probes.json'

bun run run:build-collaboration-cutover-gate -- \
  --gate visualReview \
  --manifest '<release-evidence-dir>/cutover-evidence.json' \
  --output '<release-evidence-dir>/visual-review.json' \
  --reviewer-workos-user-id '<human-workos-user-id>' \
  --evidence '<release-evidence-dir>/visual-review.png'

BUILD_COLLABORATION_E2E_FIXTURE='<authenticated-fixture-path>' \
  bun run run:build-collaboration-cutover-evidence -- \
  --kind smoke \
  --role contractor \
  --manifest '<release-evidence-dir>/cutover-evidence.json' \
  --output '<release-evidence-dir>/smoke-contractor.json'
# Repeat the governed smoke runner for every approved role.

bun run run:build-collaboration-cutover-evidence -- \
  --kind interface \
  --manifest '<release-evidence-dir>/cutover-evidence.json' \
  --output '<release-evidence-dir>/interface.json' \
  --visual-evidence '<release-evidence-dir>/visual-review.json' \
  --keyboard-evidence '<release-evidence-dir>/keyboard-review.json'
```

After the rehearsal is complete, parity has been regenerated, and the tenant
has been reactivated, finalize the four migration artifacts and both manual
review artifacts. An authenticated human Admin or Principal Broker must attest
the exact SHA-256 of each finalized JSON artifact on the production server.
Certification rejects a missing, superseded, cross-rehearsal, or agent-authored
attestation, and it independently rehashes all manual-review sidecars:

```sh
PROD_CONVEX_DEPLOYMENT='<team>:<project>:prod'
MANIFEST='<release-evidence-dir>/cutover-evidence.json'

for KIND_AND_HASH in \
  "migration_preview:$(jq -r '.migration.previewArtifact.sha256' "$MANIFEST")" \
  "migration_application:$(jq -r '.migration.applicationArtifact.sha256' "$MANIFEST")" \
  "migration_replay:$(jq -r '.migration.replayArtifact.sha256' "$MANIFEST")" \
  "migration_parity:$(jq -r '.migration.parityArtifact.sha256' "$MANIFEST")" \
  "manual_visual_review:$(jq -r '.commands.visualReview.sha256' "$MANIFEST")" \
  "manual_keyboard_review:$(jq -r '.commands.keyboardReview.sha256' "$MANIFEST")"
do
  KIND=${KIND_AND_HASH%%:*}
  ARTIFACT_SHA256=${KIND_AND_HASH#*:}
  bun x convex run --deployment "$PROD_CONVEX_DEPLOYMENT" \
    --identity "$OPERATOR_IDENTITY_JSON" \
    build_collaboration_cutover_rehearsals:attestBuildCollaborationCutoverArtifact \
    "$(jq -nc --arg organizationId '<workos-organization-id>' --arg buildId '<active-build-id>' --arg rehearsalId "$REHEARSAL_ID" --arg kind "$KIND" --arg artifactSha256 "$ARTIFACT_SHA256" '{organizationId:$organizationId,buildId:$buildId,rehearsalId:$rehearsalId,kind:$kind,artifactSha256:$artifactSha256}')"
done
```

Then certify the evidence:

```sh
BUILD_COLLABORATION_OPERATOR_IDENTITY_JSON='<human-admin-or-principal-identity>' \
  bun run certify:build-collaboration-cutover -- \
  --manifest '<release-evidence-dir>/cutover-evidence.json' \
  --output '<release-evidence-dir>/deployment-record.certified.json'
```

The command queries the exact `release.convexDeployment` certification-state
handler with the human
operator identity; operator-authored live-state files are never accepted. It
cross-checks typed artifacts against the Convex-side release environment and
the web deployment's `/api/release` contract, current tenant status/epoch, activation
actor/time, linked migration/parity run IDs, verified timestamp, frozen latest-
Build boundary, and current stable-record hashes before atomically writing the
certified record. A template, partial or fabricated artifact, failed command,
missing role, placeholder, mismatched hash/scope/release, stale parity result,
non-human activation, non-incrementing rollback epoch, restored legacy write,
or deleted/rewritten retained record fails certification. Do not treat a local
or development preflight as production activation evidence.

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

## Scheduled Publication and Offline Reconciliation

Before activating scheduled collaboration publication, verify these canaries on
one enabled Build:

1. As an authorized coordinating human, save an Update with a future publish
   time, inspect the exact reader/reference/asset/Action Item/notification/shared
   effect bundle, and approve it. Confirm the private draft becomes
   `scheduled`, the approval records the human, role set, exact draft revision,
   bundle hash, and target time, and exactly one scheduled executor exists.
2. Execute the approval twice after its due time. Confirm one human-authored post
   and one notification fan-out exist, the second execution returns the original
   post, and no receipt is fabricated by execution.
3. For separate approvals, revoke the approving human's membership, remove a
   custom-audience reader, revoke a referenced participant or attachment,
   orphan a clean governed asset by invalidating its staging ownership, and
   advance a record protected by an `assert_revision` guard before execution.
   Also close the Build after approval but before execution. Each approval must
   move to `paused`; its draft must return to active with a disclosure-safe
   conflict reason and require a fresh exact human approval. Lifecycle and
   deterministic validation failures must never enter the recovery loop.
   Corrupt a fixture approval by removing its target time and confirm that it
   follows this same material-conflict path instead of retrying indefinitely.
4. Force the direct scheduler invocation to fail, then run the five-minute
   recovery sweep. Confirm a due approval is retried without duplicate effects
   and that `executionAttemptCount` and `lastExecutionAt` remain observable.
   Repeat with an untyped `runMutation`/backend failure after the approval is
   due; it must remain `approved`, publish exactly once on recovery, and never
   be converted into a material conflict.
5. Edit one private draft from two sessions. The stale writer must retain its
   local editor state, receive a revision conflict, and see the latest server
   revision beside it. It must not overwrite the newer draft.
6. Put a field browser offline, save text and a camera/file capture, and confirm
   no Convex mutation, notification, receipt, or shared record is created. The
   IndexedDB key must include WorkOS user, organization, and Build. Reconnect,
   load the private device draft, and save it to the server; confirm the original
   file `lastModified` value is stored as `sourceCapturedAt`. Publishing remains
   a separate human action and revalidates the complete bundle.
7. Keep browser networking online while disconnecting the Convex WebSocket.
   Confirm the feed enters private offline mode and rejects every nested
   collaboration mutation and action without invoking the underlying Convex
   client. On a cold never-connected session, confirm an existing private draft
   loads and saves under the hydrated WorkOS user/organization/Build key even
   while all Convex queries remain unresolved. Restore the socket and confirm
   the server draft identity matches that WorkOS session before save,
   upload/publication, scheduling, or deletion reconciles any local draft and
   normal mutation authority resumes.

Monitor `build.collaboration.publication.scheduled`,
`build.collaboration.publication.schedule_executed`, and
`build.collaboration.publication.schedule_paused` audit/outbox events. Also
monitor `build.collaboration.publication.schedule_retryable_failure`; these
approvals intentionally remain `approved` for the five-minute recovery sweep,
for explicitly typed operational conditions and untyped action/runtime failures.
Typed collaboration validation failures at the publication source—including
approval, authorization, lifecycle, tenancy, audience, reference, and governed
asset revalidation conflicts—move to `paused`. Alert on
overdue approved schedules, repeated execution attempts, approval-hash failures,
paused-volume spikes, or any scheduled post whose author differs from the
approving human. Private offline drafts are browser-local and must never be
counted as shared collaboration state. For revision-controlled shared effects,
verify `build_collaboration.shared_revision_precondition.applied` records both
the approved `expectedRevision` and transactionally observed revision.

## Export, retention, legal hold, and Build closure

1. Configure the tenant's versioned collaboration retention policy before any
   Build is closed. Record the policy key, retention days, approving Admin or
   Principal Broker, and reason. Never infer a policy from an application
   default.
2. Run the close preflight. Every open Action Item must be Done, Cancelled, or
   explicitly waived by the closing Admin/Principal Broker with an individual
   reason. Use the current lifecycle revision; a stale close or reopen must fail
   rather than overwrite a concurrent decision.
3. Confirm the closed Build rejects posts, comments, edits, reactions,
   moderation, Action Item changes, uploads, scheduled publications, and system
   events. Confirm authorized search, individual asset download, and exports
   remain available. A scheduled approval that predates closure must pause and
   require fresh human approval after reopening.
4. Exercise the export role matrix: Admin/Principal Broker full authorized
   archive; Broker/Builder/Broker Staff authorized bulk archive; Builder Staff
   and Homeowner one visible thread or asset; Contractor one contractor-visible
   asset only. Inspect the manifest and ACL snapshot for zero restricted
   placeholders, then prove both token expiry and current authorization are
   enforced at download time.
5. Before retention purge, query the Build legal-hold state again. An active
   hold is an absolute stop. Purge only the current explicitly closed lifecycle
   revision after the active tenant policy's retention interval. Repeat bounded
   purge calls until `complete: true`; do not mark the Build purged while posts
   remain.
6. After purge, verify post/revision/search content and stored collaboration
   assets are gone, content-bearing export manifests are revoked, and lifecycle,
   legal-hold, purge, and `auditEvents` history remains readable.

Monitor `build.collaboration.export.created`,
`build.collaboration.export.burst_detected`,
`build.collaboration.retention_policy.changed`,
`build.collaboration.legal_hold.placed`,
`build.collaboration.legal_hold.released`, `build.collaboration.closed`,
`build.collaboration.reopened`, and `build.collaboration.purged`. Any export of
a restricted placeholder, purge under legal hold, write after closure, or
closure without terminal/waived Action Items is a disclosure or integrity
incident and blocks cutover.

## Collaboration webhook activation and recovery

1. An Admin creates each organization endpoint against an authorized active
   Build, selects the required event families, and records the one-time
   `dfwhsec_` signing secret in the consumer's secret manager. DrawFlow retains
   only server-side signing material plus the displayed fingerprint; the secret
   is never returned again. Use secret rotation, not endpoint recreation, for a
   planned credential change.
2. Consumers verify `X-DrawFlow-Signature` as an HMAC-SHA256 over
   `<X-DrawFlow-Timestamp>.<raw request body>`, reject stale timestamps, and
   deduplicate on `eventId`. `X-DrawFlow-Delivery` identifies an individual
   attemptable delivery and `X-DrawFlow-Sequence` is the endpoint-local ordered
   sequence. The payload version is present in both the body and
   `X-DrawFlow-Version`.
3. Confirm payloads contain only organization/Build scope, event/entity IDs,
   sequence, occurrence time, and permission-safe scalar metadata. Bodies,
   TipTap JSON, asset/download URLs, reference snapshots, restricted
   placeholders, and seen receipts must never appear. Consumers fetch governed
   content separately through the application API under their own current
   authorization.
4. Exercise one event in every supported family: post/comment publication,
   thread resolution/reopening, Action Item transition, asset version
   publication, moderation change, and Build closure/reopening. Inspect the
   delivery detail to prove attempt status, response code, signing-secret
   version, and safe failure text are observable without persisting response
   bodies.
5. Failed deliveries retry with the same immutable event and stop later events
   on that endpoint until the earlier sequence is acknowledged. After terminal
   exhaustion, replay the failed delivery with a stable operator idempotency key;
   DrawFlow reopens that same sequence before releasing later events. Replaying
   an already delivered event creates a new ordered delivery while retaining the
   original event ID and history.
6. The one-minute lease-recovery job returns interrupted dispatches to the retry
   queue. Alert on terminal `failed` deliveries, repeated lease expiry, signature
   rejection, or a growing pending sequence. Never bypass ordering by editing
   delivery rows.
7. Disabling an endpoint, removing an event subscription, revoking the endpoint,
   or disabling the tenant cancels pending work at its next authorization check
   and prevents future fan-out. Endpoint and tenant access generations are
   snapshotted on each delivery, so remove/re-add or rollback/reactivation cannot
   revive stale queued work. Revocation also invalidates stored signing material.
   Historical events, deliveries, attempts, replay requests, and audit records
   remain intact. Hostname delivery must resolve exclusively to public addresses
   and pins one validated address into the no-redirect HTTPS request; any private,
   mapped-private, reserved, multicast, or mixed DNS result is a delivery failure.

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
