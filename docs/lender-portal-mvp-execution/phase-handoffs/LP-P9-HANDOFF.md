# Phase 9 handoff — Migration, security, and release

Handoff ID: LP-HO-P9

Status: ready; no work package is authorized to start by this
document alone.

## Phase 1 baseline

This release handoff records accepted Phase 1 product SHA
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`, certified by `LP-P1-05`.

Phase 9 must include the accepted Phase 1 interfaces in the security,
migration, external-consumer, and final traceability review.

## Entry prerequisites

1. Verify every Phase 1–8 certification with exact-SHA evidence and no reopened
   packet.
2. Reconcile every phase candidate to the release integration SHA. Completion
   criterion:
   actual changed symbols, routes, schemas, processes, events, and external
   consumers are in the final blast-radius inventory.
3. Inventory actual data in the candidate environment before defining
   migration behavior. Completion criterion: record counts, field provenance,
   and ambiguity classes are fixed before a migration writes.
4. Identify existing migration, release-control, deployment, observability,
   alerting, email health, security, and rollback owners on the release
   checkout.
5. Run preparation/execution validation before `LP-P9-01` and
   `LP-P9-02` begin.

## Canonical owners and context pointers

- schema and permitted migrations: `convex/schema.ts`,
  `convex/migrations.ts`, domain migration files, and repository Convex rules;
- identity/membership: accepted Phase 1 WorkOS projection and authorization
  owners; migration never writes webhook-owned tables;
- audit: canonical audit schema/migrations and every phase's audit evidence;
- email health: certified Phase 8 delivery owners and
  `convex/email_transport.ts`;
- release/API seams: existing deployment and route release controls, including
  `src/routes/api/release.ts`, only after fresh ownership review;
- source contract: implementation plan Phase 9/final gate, all testing
  decisions and E2E journeys, all phase handoffs/evidence, and five Phase 9
  packets.

Load a domain only when its migration, authorization, concurrency, or external
contract branch is under review. The traceability ledger is the index, not a
substitute for exact evidence.

## Package sequence and safe parallel lanes

- Data lane: `LP-P9-01` inventories, migrates, rebuilds, and reconciles
  canonical/derived data.
- Assurance lane: `LP-P9-02` independently reviews authorization, privacy,
  URLs/links, audit completeness, and required workflow races.
- Join: `LP-P9-03` defines tenant-scoped release control, observability, stop
  conditions, rollout, and history-preserving rollback after both lanes.
- Acceptance: `LP-P9-04` runs every journey and selected-prototype contract
  on the exact release commit.
- Final decision: `LP-P9-05` runs read-only release certification.

`LP-P9-01` and `LP-P9-02` may run in parallel in isolated read/test
contexts. Security findings that change code or data reopen the owning earlier
packet and invalidate affected migration and acceptance evidence.

## Participant and prototype contracts

- All Back Office, Builder, lender, worker, email-link, historical-withdrawn,
  attachment, and external consumer boundaries are included.
- Migration infers no approval, assignment, policy, activation, organization,
  membership, or quorum from ambiguous data.
- Queue/dashboard projections rebuild from canonical state and reconcile by
  tenant, organization, and lifecycle state.
- Every selected prototype contract is accepted on its production route and
  shared component, including Organization Management Variant E.
- Deferred surfaces, Builder Draw presentation, and unconfirmed notification
  classes remain absent.
- Rollback preserves revisions, decisions, assignments, evidence, notification
  intents/attempts, and audit history.

## Required verification and exact-commit evidence

Phase 9 evidence binds checkout, release SHA, deployment, environment,
migration input/output, user/organization fixtures, routes, browser/runtime,
worker/provider, dashboards, alerts, and reviewer identities. Required proof:

- migration dry-run, repeatability, partial failure, resume, ambiguity stop,
  rollback, and pre/post reconciliation;
- full authorization/field matrix, attachment/email-link re-authorization,
  private-data review, and all required workflow races;
- release-control authorization/audit, deployment ordering, health thresholds,
  stop conditions, and rollback rehearsal;
- E2E-01 through E2E-10 on the exact release deployment;
- every selected-prototype parity/accessibility result;
- source/ledger/evidence hash audit, full relevant automated tests, production
  build, and actual blast-radius reconciliation.

`LP-P9-05` runs `bun run validate:lender-portal-execution --release` only
after every group/package is verified with valid exact-commit evidence.

## Rollback and escalation

Stop the release when migration encounters ambiguity, reconciliation differs,
security/privacy has any unresolved material finding, a concurrency result is
nondeterministic, evidence references another SHA/deployment, health thresholds
fail, or an unplanned consumer appears. Reopen the earliest owning packet and
invalidate every downstream evidence record affected by its change.

Use tenant-scoped disablement and the rehearsed rollback path. Preserve all
history and durable intent/attempt records. Do not waive a failed final gate or
convert an unknown dependency into an assumed absence.

## Binary phase exit gate

Phase 9 and the MVP pass only when `LP-P9-01` through `LP-P9-04` are
independently accepted, `LP-P9-05` records an unconditional accepted decision
for the exact release SHA, all 252 requirements and ten E2E journeys have fresh
evidence, the release validator reports valid, rollback is proven
history-preserving, and every coverage group and work package is verified.
