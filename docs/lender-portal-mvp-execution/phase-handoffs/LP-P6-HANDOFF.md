# Phase 6 handoff — Evidence and approval policy

Handoff ID: LP-HO-P6

Status: ready; no work package is authorized to start by this
document alone.

## Phase 1 baseline

This handoff uses accepted Phase 1 product SHA
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9` for organization and current
membership eligibility. `LP-P1-05` supplies exact-SHA evidence.

Before implementation, confirm deactivation, supported-role, and
resource-authority behavior on the target checkout. Phase 6 never rewrites
Phase 1 membership or the Phase 3 locked policy.

## Entry prerequisites

1. Verify `LP-P1-05`, `LP-P3-05`, and `LP-P5-05` with exact-SHA evidence.
2. Confirm the accepted Phase 1 interfaces. Completion
   criterion: current lender eligibility and deactivation behavior used by
   quorum recount are confirmed.
3. Confirm the locked policy and current request-cycle contracts on the target
   HEAD. Completion criterion: each gate consumes immutable policy plus one
   current cycle without implicit booleans.
4. Inventory canonical cost-document, Budget currency, Site Visit, geofence,
   Evidence Package, attachment access, decision, and audit owners.
5. Validate the exact checkout before any of the three parallel packets starts.

## Canonical owners and context pointers

- cost documents and access: `convex/cost_documents.ts`,
  `convex/cost_document_access.ts`, and existing cost-document tests/UI;
- Milestone evidence and review:
  `convex/build_submilestone_evidence.ts`,
  `convex/build_submilestone_review.ts`, and the canonical Milestone sheet;
- Site Visit UI/domain seams: current canonical Site Visit functions discovered
  by fresh inventory plus
  `src/features/backoffice-site-visits/SiteVisitDetailPanel.tsx`;
- policy, decisions, cycles, and membership: certified Phase 3/5 owners and
  accepted Phase 1 authorization/projection boundaries;
- source contract: evidence/approval sections, spec User Stories 52–60,
  E2E-05/E2E-07, implementation plan Phase 6, and five Phase 6 packets.

Load a concrete Site Visit backend owner only after proving it is canonical.
Demo token/guidance files are not production ownership evidence.

## Package sequence and safe parallel lanes

- Documents lane: `LP-P6-01` implements receipt/invoice eligibility and exact
  documented totals.
- Site Visit lane: `LP-P6-02` implements canonical qualifying visits, reports,
  photos, and location-unverified handling.
- Policy lane: `LP-P6-03` implements approval groups, unique-user quorum, and
  pre-terminal deactivation recount.
- Join: `LP-P6-04` exposes one shared evidence package with permission-shaped
  projections and attachment URLs.
- Certification: `LP-P6-05` runs after the three lanes and join.

The first three packets may run in parallel in separate tasks. Coordinate
shared schema references before merge; only `LP-P6-04` joins their projection
contracts.

## Participant and prototype contracts

- Back Office and lender reviewers see the same current-cycle evidence
  identities and policy progress through permission-shaped projections.
- Receipt/invoice values use Build-currency integer units; eligible current
  cycle total must exactly equal actual cost when required.
- A required Site Visit qualifies only with a completed report and at least one
  photo.
- Geofence failure or unavailability preserves evidence as
  location-unverified and routes it for review.
- Required groups may approve in either order; rejection enters correction.
- Deactivated lender decisions remain historical but stop contributing before
  terminal completion; terminal work never reopens.

## Required verification and exact-commit evidence

Every packet evidence record names the candidate SHA, cycle/policy fixture,
currency and attachment provenance, actor organization/role, commands, changed
consumers, and independent result. Required phase proof:

- exact integer arithmetic, document eligibility, submission gate, cycle
  isolation, duplicate, and attachment-access tests;
- Site Visit report/photo/geofence/offline/retry/authorization tests;
- exhaustive policy matrix, unique-user quorum, deactivation, terminal-state,
  rejection, and concurrency tests;
- cross-persona projection equivalence, privacy, signed-URL, and history tests;
- E2E-05 and E2E-07 plus codegen, typecheck, build, and execution validation.

`LP-P6-05` certifies the merged SHA read-only and rejects missing attachment,
privacy, or geofence evidence.

## Rollback and escalation

Rollback disables new evidence qualification, submission, or decision entry
points while preserving documents, visits, photos, location attempts, cycles,
decisions, and audit history. Escalate when currency provenance is ambiguous,
a Site Visit owner is noncanonical, a signed URL acts as authority, final Phase
1 deactivation semantics changed, or parallel lanes require incompatible
schema ownership.

Resolve the owning contract before merge. Do not round currency, discard
location-unverified evidence, reopen terminal work, or copy evidence per
reviewer group.

## Binary phase exit gate

Phase 6 passes only when `LP-P6-01` through `LP-P6-04` are independently
accepted, `LP-P6-05` proves every evidence and policy combination at the
authenticated command boundary, both participant groups consume one canonical
package, privacy passes, and all Phase 6 ledger records are verified on one SHA.
