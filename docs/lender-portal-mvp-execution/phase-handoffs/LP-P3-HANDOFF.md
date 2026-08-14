# Phase 3 handoff — Revisions and policy lock

Handoff ID: LP-HO-P3

Status: ready; no work package is authorized to start by this
document alone.

## Phase 1 baseline

This handoff uses the accepted Phase 1 product SHA
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`, certified by `LP-P1-05`.

The candidate establishes active-organization scope, canonical WorkOS
membership eligibility, organization-management operations, and named later
consumer inputs. Phase 3 must confirm those interfaces on its actual target
checkout before implementation.

## Entry prerequisites

1. Verify `LP-P1-05` and `LP-P2-05` on the target checkout. Completion
   criterion: both certifications have exact-SHA evidence and no reopened
   dependency.
2. Confirm the accepted Phase 1 interfaces. Completion
   criterion: active membership, supported roles, organization scope, and
   Principal Broker protections used by policy validation remain confirmed.
3. Inventory existing proposal version, Budget, roadmap, builder identity,
   closing, and policy-like state on the actual target HEAD. Completion
   criterion: one canonical owner is named for every snapshot field and no
   mutable value is silently treated as historical.
4. Run the execution validator before `LP-P3-01` or `LP-P3-02` starts.

## Canonical owners and context pointers

- proposal and checkpoint sources: `convex/production_proposals.ts`,
  canonical Budget/roadmap owners discovered by the packet inventory, and
  `convex/schema.ts`;
- current organization and active membership:
  `convex/authz.ts`, `convex/workosProjection.ts`, and accepted Phase 1
  evidence;
- closing integration: accepted Phase 2 lifecycle commands and evidence;
- Back Office policy host:
  `src/routes/backoffice/proposals.$planId.tsx` and existing production
  proposal components;
- selected policy surface:
  `src/routes/backoffice/proposals/review-requirements-prototype.tsx` and
  `src/components/prototypes/BackOfficeReviewRequirementsSetupPrototype.tsx`;
- source contract: feature brief revision/policy sections, spec User Stories
  43–51, implementation plan Phase 3, and the five Phase 3 packets.

Load a concrete Budget, roadmap, audit, or policy implementation only when the
active packet reaches that branch. Fresh search decides the owner; this
handoff does not authorize a new parallel domain.

## Package sequence and safe parallel lanes

- Lane A: `LP-P3-01` implements immutable proposal revisions and checkpoint
  diffs after `LP-P2-05`.
- Lane B: `LP-P3-02` implements typed review-policy configuration after
  `LP-P1-05` and `LP-P2-05`.
- Join: `LP-P3-03` locks the policy to the exact revision and assignment
  after both lanes.
- Surface: `LP-P3-04` directly promotes Review Requirements Variant A after
  `LP-P3-02` and `LP-P3-03`.
- Certification: `LP-P3-05` runs after all implementation packets.

Lanes A and B may run in parallel in separate tasks because they own distinct
write seams. Coordinate schema changes before either merges, and keep the join
packet as the only policy-lock integration owner.

## Participant and prototype contracts

- One stable proposal owns monotonic immutable revisions.
- Each reviewable revision snapshots Milestone count, Budget, schedule,
  builder, and access/review policy inputs.
- Policy quorum uses current active members of the assigned organization from
  the Phase 1 boundary; it never rewrites membership or the locked snapshot.
- Closing copies one immutable policy snapshot into canonical Build control
  state and exposes no MVP override path.
- Directly promote `LP-PROT-POLICY` Variant A. Reuse the selected route and
  components; production state replaces prototype state without redesign.

## Required verification and exact-commit evidence

Packet evidence must record candidate SHA, source-version provenance, schema
diff, command tests, concurrency results, changed consumers, and reviewer
decision. The phase requires:

- immutable revision, snapshot consistency, deterministic diff, and replay
  tests;
- exhaustive policy-mode, evidence-switch, membership, and quorum tests;
- exact-revision/assignment lock, close integration, audit, and concurrency
  tests;
- Variant A production parity, keyboard, focus, responsive, validation, and
  error-state evidence;
- E2E-05 plus codegen, typecheck, build, and execution validation on one SHA.

`LP-P3-05` performs a fresh read-only review. Evidence tied to an earlier
revision, membership snapshot, route, or commit is rejected.

## Rollback and escalation

Rollback may disable revision publication, policy editing, or closing entry
points, but it preserves all written revisions, locks, audit events, and Build
control snapshots. Escalate when a checkpoint lacks a versioned canonical
source, a quorum cannot be derived from accepted Phase 1 membership, a legacy
policy is ambiguous, or Variant A conflicts with the product contract.

Resolve schema collisions between the parallel lanes before merge. Do not use
mutable snapshots, default quorums, or compatibility policy records to bypass
the conflict.

## Binary phase exit gate

Phase 3 passes only when `LP-P3-01` through `LP-P3-04` are independently
accepted, `LP-P3-05` proves immutable revisions, deterministic diffs, valid
policy combinations, exact-revision locking, one immutable Build snapshot, and
Variant A parity on one exact SHA, and the ledger marks all Phase 3 work
verified.
