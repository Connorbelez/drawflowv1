# Lender Portal Phase 9 release and migration runbook

This runbook is the supported direct operator interface for the Phase 9 Lender
Portal release. It uses the generated Convex API, the canonical migration
runner, the existing communication worker, and WorkOS-owned projections. It
does not require a release-control UI.

## Authority and safety boundary

Public operator calls require all of the following at call time:

- a valid AuthKit session whose token organization is the requested
  `organizationId`;
- an active projected WorkOS user, the exact active WorkOS organization
  projection, and an active organization membership;
- a projected `admin` or `principle-broker` role that also appears in the
  current token; and
- one active Brokerage mapped to the same WorkOS organization.

Use the generated names under `api.lender_portal_release` and
`api.lender_portal_phase9` from `convex/_generated/api`. Calls must be made by
an authenticated operator client. The Convex CLI migration commands require
deployment-operator access, but each row also fails unless the same tenant has
an authorized persisted run and remains disabled. Never write `users`,
`workosOrganizations`, `workosOrganizationMemberships`, `workosRoles`,
`workosOrganizationRoles`, or `workosPermissions` directly.

Missing release state means `disabled`. Release state is tenant-scoped and
cannot be read or changed across the authenticated organization or Brokerage.

## Exact candidate and configuration binding

Record the immutable release inputs before changing a tenant:

```sh
candidate_sha="$(git rev-parse HEAD)"
configuration_file="/absolute/path/to/reviewed-lender-portal-config.json"
configuration_hash="$(shasum -a 256 "$configuration_file" | awk '{print $1}')"

bun x convex env set LENDER_PORTAL_RELEASE_CANDIDATE_SHA "$candidate_sha"
bun x convex env set LENDER_PORTAL_RELEASE_CONFIGURATION_HASH "$configuration_hash"
```

The configuration file is the reviewed deployment/tenant configuration
artifact. Keep it in the release evidence store; do not place secrets in it.
Inventory, preparation, authorization, every runner step, verification, canary,
and enabled transitions fail closed unless both runtime values exactly match
the configured control. Runtime provenance must therefore be deployed before
the rehearsal starts.

All examples below assume an authenticated Convex client named `convex`, the
generated `api`, and these values:

```ts
const organizationId = "org_...";
const candidateSha = "<40-character-git-sha>";
const configurationHash = "<64-character-sha256>";
```

Read the current fail-safe state and preserve its `accessRevision`:

```ts
const release = await convex.query(
  api.lender_portal_release.getLenderPortalReleaseState,
  { organizationId },
);
```

Bind or update the candidate while disabled. Use the exact state and revision
returned by the prior read:

```ts
const disabled = await convex.mutation(
  api.lender_portal_release.transitionLenderPortalRelease,
  {
    candidateSha,
    canaryRecipientWorkosUserIds: [],
    configurationHash,
    expectedAccessRevision: release.accessRevision,
    expectedStatus: release.status,
    idempotencyKey: `phase9:${organizationId}:${candidateSha}:configure`,
    nextStatus: "disabled",
    organizationId,
    reason: "Bind the reviewed Phase 9 candidate and configuration.",
  },
);
```

Reusing an idempotency key with different input fails. Stale expected state or
revision also fails.

## Inventory, rehearsal, apply, and readback

1. Drain every page from the authenticated inventory. The page size is 1–25.
   Any `ambiguityCodes` value is a stop condition.

```ts
const page = await convex.query(
  api.lender_portal_phase9.inventoryLenderPortalPhase9MigrationCandidates,
  {
    candidateSha,
    organizationId,
    paginationOpts: { cursor: null, numItems: 25 },
  },
);
```

2. Persist the exact inventory manifest. The returned `runToken` binds the
   candidate, configuration, canonical counts, issue snapshots, and privacy-safe
   WorkOS projection fingerprint. Deterministic replay returns the existing run;
   it never inserts a duplicate manifest for the same token.

```ts
const run = await convex.mutation(
  api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
  {
    candidateSha,
    configurationHash,
    organizationId,
    reason: "Persist the reviewed Phase 9 rehearsal manifest.",
  },
);
```

If `run.status === "blocked"`, page through the exact manifest issues. Each row
contains source table, source record ID, field, reason, provenance, and
disposition. Correct the canonical source through its owning domain workflow;
do not edit immutable history or WorkOS projections. Then prepare a new run.

```ts
const issues = await convex.query(
  api.lender_portal_phase9.listLenderPortalPhase9MigrationIssues,
  {
    cursor: undefined,
    limit: 25,
    organizationId,
    runToken: run.runToken,
  },
);
```

3. Authorize only a `ready` manifest. Authorization re-inventories the tenant
   and fails closed on data, WorkOS, candidate, configuration, release-state,
   organization, or Brokerage drift. Blocked authorization persists the
   expected and observed fingerprints and privacy-safe warnings in run audit.

```ts
await convex.mutation(
  api.lender_portal_phase9.authorizeLenderPortalPhase9MigrationRun,
  {
    organizationId,
    reason: "Authorize the unchanged disabled rehearsal manifest.",
    runToken: run.runToken,
  },
);
```

4. Rehearse each registered domain migration against the authorized manifest.
   The registered series first runs
   `validateLenderPortalPhase9ApplyManifest`, which rechecks the exact snapshot,
   runtime provenance, sole authorized run, and disabled release state before
   any domain write. Dry runs
   abort their transaction and do not schedule the next step.

```sh
bun x convex run migrations:reconcileLenderPortalPhase9PolicyAssignmentFacts '{"dryRun":true}'
bun x convex run migrations:reconcileLenderPortalPhase9ApprovalFacts '{"dryRun":true}'
bun x convex run migrations:reconcileLenderPortalPhase9PolicyLocks '{"dryRun":true}'
bun x convex run migrations:reconcileLenderPortalProposalLifecycle '{"dryRun":true}'
bun x convex run migrations:rebuildLenderPortalProposalKanbanProjection '{"dryRun":true}'
```

5. Apply the registered series. Rerun the same command after a partial failure;
   the migration component resumes from durable progress. Do not reset a live
   partial run unless the reviewed recovery plan explicitly requires a complete
   idempotence replay.

```sh
bun x convex run migrations:runLenderPortalPhase9Migration '{"reset":true}'
```

`reset:true` starts this newly authorized tenant run from the beginning because
the migration component cursor is global to the registered migration name. The
apply gate permits exactly one active authorized Phase 9 run across tenants.
After a partial failure, rerun the command without `reset`; it resumes the same
durable series and token.

The series order is exact manifest validation, policy/assignment, approval,
immutable policy lock, lifecycle pointers, then canonical Kanban projection.
The validation step moves the run from `authorized` to `applying`. It never
infers approval time from revision creation, never infers activation from
approval, and never overwrites contradictory history or a contradictory Kanban
projection.

6. Verify and read back the exact run:

```ts
const verified = await convex.mutation(
  api.lender_portal_phase9.verifyLenderPortalPhase9MigrationRun,
  {
    organizationId,
    reason: "Verify post-state, projections, issues, and WorkOS non-write proof.",
    runToken: run.runToken,
  },
);

const readback = await convex.query(
  api.lender_portal_phase9.getLenderPortalPhase9MigrationRun,
  { organizationId, runToken: run.runToken },
);

const audit = await convex.query(
  api.lender_portal_phase9.readLenderPortalPhase9MigrationAudit,
  {
    organizationId,
    paginationOpts: { cursor: null, numItems: 25 },
    runToken: run.runToken,
  },
);
```

Verification accepts only an `applying` run and rechecks the exact disabled
release target and runtime provenance. Do not continue unless status is
`verified`, issue count is zero, WorkOS write
count is zero, all audit pages are retained, canonical counts match, projection
totals reconcile, and reconciliation-pending count is zero. A no-op rehearsal
may use the same runner with `{"reset":true}` only in the reviewed rehearsal
environment; compare audit cardinality and canonical data before and after.

### Phase 3 migration and staged-index cutover gate

The production acceptance CLI owns the final Phase 3 cutover certificate. The
authenticated Phase 9 queries above remain the tenant-scoped readback owner;
the certificate does not create a second migration or authorization path.
Before a release can be certified, run both canonical Phase 3 runners as a dry
run and then as an apply against the exact disabled production candidate:

```sh
bun x convex run migrations:runProposalPhase3LifecycleBackfill '{"dryRun":true}'
bun x convex run migrations:runProposalPhase3LifecycleBackfill
bun x convex run migrations:runWorkosUserNormalizedEmailBackfill '{"dryRun":true}'
bun x convex run migrations:runWorkosUserNormalizedEmailBackfill
```

Retain the unique invocation and report digest for every dry-run, apply, and
readback. Drain every authenticated page from
`listLenderPortalPhase9MigrationIssues`; any open issue or incomplete page is a
stop condition. The exact verified run read from
`getLenderPortalPhase9MigrationRun` must bind the authenticated organization,
Brokerage, candidate, configuration, and privacy-safe run token. Confirm that
no lifecycle or normalized-email record remains unreconciled.

Withdrawal history must be sealed through the canonical bounded assignment
manifest workflow. Do not patch a manifest or infer its contents. The cutover
report must show zero archiving assignments, zero building manifests, zero
failed manifests, and one sealed manifest for every withdrawn assignment in
the reviewed boundary.

Keep `proposalLenderApprovals.by_proposal_assignment_revision_status` and
`users.by_normalized_email` staged until Convex reports each index ready after
the corresponding apply and readback. Only then may a separate reviewed source
change remove `staged: true` and deploy the exact candidate. The production
acceptance validator hashes and parses `convex/schema.ts`; a signed report that
claims an unstaged index while the candidate source remains staged is rejected.
The current checkout intentionally retains both staged declarations, so it is
not a certifiable release candidate yet.

Finally rehearse the documented disable-and-forward-recovery procedure and
retain its unique report digest. Release CI must publish one externally
GitHub-attested `phase3-migration-cutover-report/v1` operational artifact bound
to the production deployment, commit, Git tree, tenant/Brokerage hashes,
migration invocations, complete issue readback, manifest counts, both ready
unstaged indexes, and rollback rehearsal. Local JSON or a test hook cannot
satisfy the production CLI.

### Immutable lender snapshot compatibility gate

Before `canary` or `enabled`, the tenant release mutation checks every
tenant-scoped proposal with a current lender assignment. Its exact current
revision must belong to that assignment and must have the immutable
lender-content snapshot root written by the canonical revision-publication
transaction. The publication transaction writes the root and all lender-visible
documents, milestones, submilestones, cost items, and draws atomically before it
advances the current revision pointer.

The gate uses the same fail-closed integrity validator as the current lender
detail query. It validates the proposal, assignment, lender organization,
Brokerage, organization, current revision ID, revision number, and policy
pointer. It also validates every snapshot child class, the root child counts,
the revision milestone count, source-row tenant scope, source identities,
milestone dependencies, Sub-milestone and cost-item parents, and draw milestone
links. A missing, extra, unscoped, foreign, or tampered row leaves the tenant
`disabled`; a snapshot root alone is not readiness evidence.

Legacy current revisions created before this snapshot contract fail closed.
Do not copy the current mutable proposal into an old revision and do not patch
snapshot tables. Return the proposal through the canonical Back Office review
workflow and publish a reviewed Revision N+1. This creates the immutable
snapshot, opens the normal lender confirmation cycle, and preserves Revision N
as history. Create a new Phase 9 manifest and repeat authorization, apply, and
verification after publication, then retry the same release transition. A
rejected transition does not change the release status or consume its
idempotency key.

If a previously eligible tenant fails this gate after rollback or data
reconciliation, keep or return it to `disabled`. Repair mutable canonical source
data through its owning workflow, publish a new reviewed revision, regenerate
the Phase 9 manifest, and repeat authorization and verification. Never repair an
immutable snapshot in place and never enable against mutable live proposal
content.

The exact readiness check is bounded to the same 100-proposal tenant boundary as
the Phase 9 manifest. A larger tenant remains disabled and requires a reviewed
paginated release procedure; do not bypass the gate.

## Canary, enable, drain, and disable

Enable a bounded canary only after migration verification and runtime binding.
Canary or enable is rejected while that tenant still has an `authorized` or
`applying` migration run, or while any current lender revision lacks its
immutable lender-content snapshot:

```ts
await convex.mutation(
  api.lender_portal_release.transitionLenderPortalRelease,
  {
    candidateSha,
    canaryRecipientWorkosUserIds: ["<current-workos-user-id>"],
    configurationHash,
    expectedAccessRevision: disabled.accessRevision,
    expectedStatus: "disabled",
    idempotencyKey: `phase9:${organizationId}:${candidateSha}:canary`,
    nextStatus: "canary",
    organizationId,
    reason: "Start the reviewed tenant canary.",
  },
);
```

Canary IDs are never returned by release or audit readback; only count and a
privacy-safe scope hash are retained. Move `canary` to `enabled` with the same
mutation, the latest expected revision/status, an empty canary array, and a new
idempotency key.

To stop new claims, move `canary` or `enabled` to `draining`. Existing provider
reservations remain visible and may finish under their durable access-revision
fence. The worker rechecks the current recipient and resource before provider
submission. A release-gate cancellation records one privacy-safe outcome tied
to intent, attempt, release revision, and reason, then preserves the intent for
the same idempotent retry after enablement.

```ts
await convex.mutation(
  api.lender_portal_release.transitionLenderPortalRelease,
  {
    candidateSha,
    canaryRecipientWorkosUserIds: [],
    configurationHash,
    expectedAccessRevision: current.accessRevision,
    expectedStatus: current.status,
    idempotencyKey: `phase9:${organizationId}:${candidateSha}:drain`,
    nextStatus: "draining",
    organizationId,
    reason: "Stop new claims and drain provider reservations.",
  },
);
```

Poll authenticated health. The operator service must supply its current epoch
time; the query validates this value and never reads an uncontrolled browser
field. Do not disable until both `providerReservations.active` and
`providerReservations.reconciliationRequired` are zero. A disable transition
is transactionally rejected while an active or expired/unknown provider
reservation remains unresolved, so a provider call authorized under an older
revision cannot become falsely safe because its lease elapsed.

```ts
const health = await convex.query(
  api.lender_portal_release.getLenderPortalOperationalHealth,
  { now: Date.now(), organizationId },
);
```

Then transition `draining` to `disabled` with the latest revision. An immediate
`canary`/`enabled` to `disabled` transition is allowed only when there is no live
provider reservation. Disable does not delete queued intents, attempts,
outcomes, revisions, decisions, assignments, evidence, or audit history.

## Provider in-flight recovery

- `active > 0`: keep draining. Let the registered worker record the provider
  result and release the reservation.
- Provider accepted but the worker restarted before local readback: do not send
  manually. Resume the same worker path. It uses the unchanged intent
  idempotency key, and success/outcome recording is idempotent per attempt.
- Reservation lease expired while draining: keep draining. Lease expiry is not
  provider evidence. Record the explicit provider success/failure through the
  existing idempotent attempt outcome seam; only that durable outcome releases
  the reservation. Then confirm `reconciliationRequired === 0` before disable.
- Retryable intent paused by the gate: after correction, re-enable the tenant.
  The existing intent returns through its original pending/retry state and
  idempotency key after current authorization. Do not create a replacement
  intent.
- Unknown provider result with no durable local outcome: keep the tenant
  draining and escalate to the email-transport owner. Correlate the provider
  idempotency key before allowing the worker to resume. Never infer delivery
  from provider UI alone.

## Health thresholds, owners, and stop conditions

`getLenderPortalOperationalHealth` accepts a validated operator-runtime epoch
and samples only the four Lender Portal transactional kinds. It returns counts,
latency, release state, attempt state, and reservation state without recipient
IDs, email addresses, payloads, raw secrets, or private rationale.

| Signal | Alert threshold | Owner and response |
| --- | --- | --- |
| Queued pending plus retry | More than 100 | Lender Portal release operator pauses rollout and checks worker health. |
| Retry scheduled | More than 25 | Email-transport operator checks provider/configuration and authorization failures. |
| Action required | More than 5 | Email-transport operator reconciles safe errors and owning recipient/resource state. |
| Failed attempts | One or more | Email-transport operator investigates immediately. |
| Abandoned attempts | More than 5 | Lender Portal release operator checks release transitions, stale leases, and authorization churn. |
| Oldest queued age | More than 15 minutes | Lender Portal release operator stops rollout and checks cron/worker reachability. |
| Incomplete sample | Any true value | Stop rollout. Results cannot be terminal healthy until a complete bounded read is available. |
| Active provider reservation during drain | More than zero | Keep draining; do not disable until reconciled. |
| Expired/unknown provider reservation | `reconciliationRequired` more than zero | Keep draining; reconcile an explicit durable provider outcome. Lease age alone never permits disable. |
| Migration issue, count mismatch, pending reconciliation, projection mismatch, or WorkOS fingerprint drift | Any | Migration operator stops; correct canonical evidence and create a new manifest. |
| Authorization denial or WorkOS projection drift | Any unexplained increase | Identity/access owner verifies current WorkOS state; never patch projection tables. |

`terminalHealthy` must be true, `alerts` empty, `incompleteSampling` false, and
provider reservations consistent with the intended release state before rollout
continues. Retain every page from `listLenderPortalReleaseAudit`; it contains
actor, roles, correlation, access revision, reason, warnings, and complete
privacy-safe prior/new candidate, configuration, and canary identity.

## Rollback and forward recovery

The authoritative contract is history-preserving disable plus forward recovery,
not a destructive down migration. Release audit retains the known prior target
and configuration identity. To roll back exposure:

1. transition to `draining`;
2. reconcile all live reservations and provider outcomes;
3. transition to `disabled`;
4. keep all canonical and communication history;
5. deploy or configure the reviewed recovery candidate;
6. bind its exact SHA/configuration while disabled;
7. create a new inventory manifest and repeat rehearsal, apply, verification,
   and canary.

Do not reverse proposal revisions, approvals, policy locks, assignments,
closings, Builds, or audit rows. A migration verification failure leaves the
tenant disabled and the exact run blocked; recover forward from canonical
evidence. Snapshot compatibility failures follow the same rule: keep the tenant
disabled, publish a reviewed new revision, and repeat verification. Snapshot
tables are additive historical evidence and are retained if the application
candidate is rolled back; never delete them or reconstruct an old revision from
mutable live proposal state.

## Evidence limits

### Production journey acceptance gate

The machine-owned acceptance contract is
`docs/lender-portal-mvp-execution/production-acceptance-contract.json`. Run:

```bash
bun run test:lender-portal-production-journeys
bun run validate:lender-portal-production-acceptance-contract
bun run validate:lender-portal-production-acceptance -- \
  --evidence=https://github.com/Connorbelez/drawflowv1/releases/download/<release-tag>/LP-P9-04-<candidate-sha>.json
```

The first command runs every executable test named by the typed production
surface, `LP-E2E-01..10`, `LP-VSG-01..10`, and authorization mappings. The
second is explicitly a non-release contract/source check. It verifies that
every mapping names a registered test, a checked
production consumer, and its required operational gates. It also verifies that
the Dashboard, Build Detail, Milestone queue, and Draw queue are mounted by
their shipped routes and call their canonical query owners without replacing
the production component with a prototype or test mock. The third is the
release gate. It requires `--evidence`; invoking it without a remote signed
attestation fails closed.

Local source, route, and temporary evidence files are not release evidence.
Release CI must generate
`lender-portal-production-acceptance-attestation/v3` only after deploying the
candidate to `https://drawflow.fairlend.ca`. The signed payload must bind all
of the following:

- the exact deployed commit and Git source-tree SHA;
- the SHA-256 of the immutable release artifact;
- the current acceptance-contract SHA-256;
- one unique machine artifact per typed surface, journey, and vertical-slice
  mapping, including raw execution-report bytes, installed runner identity and
  version, exact invocation and assertion, pass status, timestamps, supported
  production consumer, observable result, deployment binding, and digest;
- one authenticated deployed-browser observation and durable Playwright trace
  per mapping. Local Vitest, jsdom, and mocked route tests are machine evidence,
  not production end-to-end evidence;
- gate-specific operational artifacts rather than a shared generic report;
- independently accepted review evidence signed by the reviewer key;
- durable evidence artifacts published under the repository's pinned GitHub
  Releases URL.

Each machine execution report, browser manifest and trace, provider receipt,
inbox receipt, operational raw result, and immutable release-bundle manifest
must also carry a GitHub artifact-attestation bundle issued by the exact
same-repository GitHub Actions workflow, repository, OIDC issuer, and immutable
workflow signer digest in the source-owned production trust root. The production validator runs
`gh attestation verify` with the candidate commit as the source digest and
rejects self-hosted runner attestations. The attestation must bind a unique
candidate release ID and fresh workflow invocation, including its builder,
start, and finish identity. A locally authored Vitest JSON report,
even when its digest and claimed runner metadata are internally consistent, is
self-attested and is rejected. The repository does not currently contain the
required externally protected evidence workflow or real signed artifacts, so
production certification remains intentionally unavailable until that trusted
CI boundary is provisioned and independently reviewed.

Every referenced remote artifact, raw runner report, operational result, and
browser trace carries or is enclosed by the deployed commit and Git tree,
is downloaded over HTTPS, and is checked against the digest and semantic
metadata in the signed payload. The downloader validates the initial
`github.com/Connorbelez/drawflowv1/releases/download/...` URL, every recorded
redirect hop, and the final effective URL. Redirects are accepted only on the pinned GitHub release-asset
CDN pathname. A URL string alone is not evidence. Local paths, `.test` or local
domains, dot-segment traversal, foreign repositories, unexpected redirects,
missing artifacts, foreign IDs, stale attestations, generic reports, artifact
reuse, and partial or duplicate mappings fail closed.

Browser evidence is a parsed, CI-attested manifest rather than descriptive
metadata. It binds a unique run and authenticated session, actor identity hash
and role, deployed origin/commit/tree, the pinned Playwright executable and
version, ordered authenticate/navigate/assert observations, and a unique
CI-attested ZIP trace. The validator checks its central directory, local
records, CRCs, decompression results, Playwright event stream, network stream,
navigation route, and mapping-specific acceptance marker. The trace must bind
the manifest's authenticate, navigate, and assertion steps to unique Playwright
call IDs in execution order. The asserted result must come from the recorded
DOM read, not only from a console marker. Each `after` event must retain the
same Playwright `apiName` as its matching `before` event; a reused call ID with
a different operation fails closed. The network stream must contain the
successful HTML document request for the claimed production route with the
attested run, mapping, and session correlation headers. The authenticate call
must return one active, secure, HTTP-only `wos-session` cookie scoped to the
trusted production host. That exact session must authorize the route request,
and the recorded response must bind its session digest, subject, organization,
and role hashes to the source-owned production evidence principal. An empty
storage state, a cookie-free request, or artifact-selected actor headers fail
closed. Provider and inbox
gates require mapping-specific authenticated WorkOS or Resend API readbacks
with the expected provider account and tenant, delivery/message/webhook/event
identifiers, privacy-safe recipient correlation, canonical route or link
target, successful status, timestamp bounds, deployment binding, and raw
response digest. Synthetic plain JSON receipts, generic blobs, repeated
receipts or traces, wrong providers, and incorrect statuses are rejected.
Tenant, recipient, subject, organization, role, and canonical
notification/assignment identity hashes must match the privacy-safe dedicated
production evidence principals pinned in the source-owned trust root. These
values are checked in the proof, receipt record, authorization context, and raw
provider readback. Copying artifact-selected tenant or actor hashes into both a
receipt and its readback cannot satisfy the gate.
The authenticated WorkOS readback URL must address the receipt's exact webhook
event ID, and the authenticated Resend readback URL must address the receipt's
exact message ID. A valid provider origin with a foreign resource path fails
closed.

Publish the signed manifest as
`https://github.com/Connorbelez/drawflowv1/releases/download/<release-tag>/LP-P9-04-<candidate-sha>.json`.
The signed `attestationUri` must equal that URL. Do not copy the manifest into
the checkout: doing so would either dirty the release tree or create an
impossible self-referential commit. Release and independent-review Ed25519
public keys, canonical SPKI fingerprints, reviewer identity, exact
repository/workflow policy, signer digest, trusted redirect policy, production
origin, and tool fingerprints are pinned in
`scripts/lender-portal-production-trust-root.ts`, outside the mutable
acceptance contract. Contract claims must equal that source-owned trust root;
environment variables cannot replace it. The two roles use
canonical-SPKI-fingerprinted, cryptographically disjoint keys. The
independent reviewer signs a canonical statement
covering the deployment URL, environment and time, attestation URI, and every
artifact URI and digest before the release signer signs the whole payload.

The current pinned public keys are fail-closed bootstrap anchors; matching
production private-key custody has not been attested in this repository.
Operational certification remains unavailable until signer custody is
independently established or the pinned policy is rotated through a reviewed
source change. Private keys must never be stored in the repository.

Then run from the immutable release checkout:

```bash
bun run validate:lender-portal-execution --release \
  --acceptance-evidence=https://github.com/Connorbelez/drawflowv1/releases/download/<release-tag>/LP-P9-04-<candidate-sha>.json
```

Release mode rejects any tracked, staged, or untracked checkout change before
it fetches evidence, snapshots HEAD and the Git tree, and rechecks the same
clean state immediately before success. A user-owned or waived prototype diff
therefore cannot be certified in place; build and certify the intended release
from a separate clean checkout at the immutable commit. Test-only remote-fetch
and Git-state injection are not exposed by this CLI path. Repository evidence
files are opened without following symlinks and checked for stable file
identity around each read; Git, Bun, curl, gh, Vitest, and Playwright are pinned
to reviewed executable paths and digests where used by the gate. The pre/post
Git check reduces mutation races but cannot make a normal filesystem checkout
an atomic snapshot: certification must run in a protected immutable CI
workspace/artifact, because a hostile transient mutation restored between
checks is a residual host-integrity risk.

The release bundle is structured provenance, not a builder-SHA text file. Its
CI-attested manifest binds the release/deployment ID, commit, Git tree, pinned
Bun executable/version, exact build command and timestamps, and every shipped
output path and digest. Build completion must not occur after the recorded
deployment time, and every output path must be a safe relative bundle path;
absolute paths, traversal, and ambiguous empty or dot segments fail closed. All focus/status, responsive/VoiceOver, and exact-release
operational raw results require their own fresh CI attestations; one generic
result cannot satisfy multiple mappings or releases.

The release validator also fails when the contract, HEAD, Git tree, deployed
commit, release artifact digest, production origin, release signature, remote
evidence digest, typed mapping, freshness window, or independently signed
acceptance differs.
Never mark an operational gate passed from source tests alone.

The existing traceability hash mismatch for
`docs/lender_portal_mvp_feature_brief.md` remains a separate release blocker.
Do not update that recorded hash merely to make release validation pass; the
source and traceability change require their own reviewed reconciliation.

Automated tests and authenticated readback prove code paths and bounded data
invariants only. They are not production certification. Before final release,
the orchestrator must still collect exact-deployment browser QA, real
participant-route evidence, inbox rendering, live provider/webhook validation,
deployment-environment validation, actual tenant inventory, a rollback drill,
alert-routing confirmation, and final independent certification tied to the
release commit.
