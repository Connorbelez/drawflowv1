# DrawFlow data-retention runbook

ENG-402 makes retention a tenant-scoped, auditable control plane. The
`dataRetentionSchedules` row is a rebuildable projection of canonical Build and
Loan closure; it is not a second source of truth.

## Policy and lifecycle

- The platform baseline is seven calendar years after the later of Build
  closure and Loan Facility closure. A Brokerage Admin or Principal Broker may
  add days through `configureDataRetentionPolicy`; extension days can never
  shorten the baseline. `retainUntil` uses UTC calendar-year arithmetic and the
  schedule becomes eligible when `asOf >= retainUntil`. Loan Facilities never
  inherit Build closure: any active facility, or any closed facility missing an
  explicit `closedAt`, leaves `retainUntil` unset. Reconciliation recalculates
  revised Build and Facility closure timestamps.
- Service cancellation uses
  `transitionOrganizationToRestrictedArchive`. It marks the tenant and every
  existing Build schedule `restricted_archive` through a post-commit paginated
  fan-out. `dataRetentionFanoutRuns` persists the current cursor, page-attempt
  count, consecutive failure count, and minimized failure reason;
  `archiveRunKey` is returned to the operator for progress tracking. A failed
  page schedules the same cursor again, while an individual Build failure is
  recorded and retried independently so the page can continue. Successful page
  replay resets the failure count and advances; the tenth consecutive page
  failure is terminal. Repeating an already-restricted transition returns the
  existing run key without another audit or fan-out.
  The transition keeps canonical Cost and Quote history readable, cancels
  pending communication dispatch, and rejects new Cost/Quote writes. It does
  not move a Build or Quote Round into a purge-eligible state.
- Provider submission uses a short organization-level durable reservation.
  Archive transition is deferred while a live reservation exists; if archive
  wins first, the pre-send authorization cancels the intent and appends one
  idempotent `dispatch_suppressed` outcome. Reservations release after provider
  success/failure, and expired leases are recovered before later work.
- Quote Round cancellation remains ordinary canonical lifecycle history. A
  terminal Quote Draft enters a 90-day recovery window, then its editable
  lines, answers, comments, and attachments are deleted while the draft row
  and a minimized tombstone remain.
- Staged Cost uploads expire after seven days. Failed or quarantined isolated
  assets are physically deleted after 30 days. Terminal Quote invitation
  credential and browser-session verifiers are cleared after 30 days. Published
  or available assets are never removed by the automated sweep.

## Legal hold and disposal

`buildCollaborationLegalHolds` is the sole Build-scoped hold authority. Every
destructive worker resolves the Build and checks for an active hold immediately
before disposal. A held Build is skipped (or the operation is marked blocked),
and the source bytes remain intact. Releasing a hold allows a later idempotent
pass to resume.

Each destructive action transactionally claims one stable, unique
`dataRetentionOperations.operationKey` in the same Convex mutation that reads
the legal hold. Convex transaction serialization prevents concurrent workers
from committing the same claim. The worker rechecks
`hasActiveBuildRetentionHold` immediately before every `ctx.storage.delete`;
that final hold read, storage syscall, source marker, operation completion,
tombstone, and audit execute in one serializable Convex mutation. Provider
not-found is treated as an idempotent replay. Active holds are created through
`placeBuildCollaborationLegalHold`, the existing authenticated and audited
production mutation. A minimized `dataRetentionTombstones` row links the
operation, keyed source-proof HMAC/revision when available, physical deletion
time, and the governed audit event; the audit ID is patched onto the tombstone
and preserved on replay. Configure `DATA_RETENTION_TOMBSTONE_HMAC_KEY` before
running a destructive worker. Workers preflight that key before any storage
deletion so a missing key cannot leave source bytes deleted without a valid
proof. This linkage applies to Quote Draft, Cost/Quote staging, isolated asset,
credential, and browser-session retention actions. Tombstones contain no source
bytes, names, addresses, invoice facts, or free-form content.

## Backup, restore, and drills

The backup provider records one hash-addressed
`dataRetentionBackupManifests` row per tenant/day. Both manifest validation and
restore start use `backupManifestEligibleAt`. At `restoreRequestedAt`, a
verified manifest is eligible only when its capture is not in the future, its
age is at most 24 hours, its explicit RPO deadline has not expired, and that
deadline is no more than 24 hours after capture. Manifests carry explicit
`neverPersistedControls` evidence for rendered provider bodies, raw provider
payloads, IP addresses, and user agents; those values are not columns in
communication tables. Manifest ingestion requires an explicit Brokerage ID and
recomputes the SHA-256 of `manifestJson`; a supplied digest mismatch is rejected
before persistence. `verifiedAt` records the verification mutation time rather
than the provider capture time. The authenticated read projection exposes
allowlisted aggregates and never returns `manifestJson`.

Destructive restore requires all of the following:

1. a human Brokerage Admin (`administrativeCapacity: "admin"`),
2. explicit `breakGlassConfirmed`, confirmation, and a mandatory reason,
3. a verified backup satisfying the shared restore-time eligibility predicate,
   and
4. an incident reference plus bounded correction history.

`startDataRetentionRestore` uses the ENG-401 governed administrative recovery
path and emits a security-notified audit event with override kind
`destructive_restore`. The target start RTO is one hour and completion RTO is
eight hours. A tenant-scoped incident reference idempotently replays an existing
started restore without inserting a second incident or audit. Completion/failure
is recorded on the restore incident.

Run `runQuarterlyDataRetentionDrill` only with a `retention-drill-*`
non-production namespace, a verified manifest, fingerprints proving that the
drill tenant and storage credentials are separate from each other and from
their production counterparts, an explicitly validated isolated access
boundary, and a denied-production-access result. The mutation aborts when any
of this isolation evidence is missing. The isolated restore runner passes
restored Build, relationship, revision, document, storage, and sample-hash
evidence into the mutation; current production `ctx.db` rows are never used as
drill evidence. The resulting row compares those non-zero restored aggregates
with the manifest and records a deterministic sample SHA-256, hashed isolation
evidence, normalized namespace and quarter, and pass/failure evidence.

## Operations and verification

Scheduled jobs expire asset staging sessions every 15 minutes, reconcile
retention schedules daily at 02:00 UTC, and run the bounded retention sweep at
03:00 UTC. Both jobs page through Builds and invoke one exact-Build mutation per
unit of work. Every page has a durable run ledger; failed work retains the same
cursor and uses bounded exponential-delay retries before later pages continue.
Expired minimized tombstones are cleaned at 04:00 UTC.
Quote Draft retention uses state/due-time indexes: non-terminal drafts receive a
future check time, recovery drafts become due at `purgeEligibleAt`, and purged
rows cannot consume the bounded page.
Reconciliation emits a reminder/outbox item when an active or held schedule is
within 30 days of eligibility. It excludes both `restricted_archive` and
`purged` schedules before creating the reminder operation or
`data_retention.reminder_due` outbox item; the communication dispatch guard is
an independent final safety check. Reconciliation reports a backup-RPO breach
separately from retention-state mismatches when no fresh verified manifest
exists.

For a controlled replay, invoke the internal reconciliation or maintenance
mutation with an explicit `asOf` timestamp and tenant scope. Confirm operation
state, tombstone count, hold state, and physical storage deletion before closing
the incident. The internal mutation contract requires both `organizationId` and
the exact `buildId`; use `fanOutDataRetentionWork` for a tenant or global replay.
Never bypass the hold check or write provider payloads/raw telemetry into
canonical tables.

Focused contract coverage:

```sh
bun run test -- convex/data_retention.test.ts
bun x convex codegen
bun x tsc -p convex/tsconfig.json --noEmit
```
