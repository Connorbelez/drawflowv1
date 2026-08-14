# Phase 4 handoff — Lender confirmation and remediation

Handoff ID: LP-HO-P4

Status: ready; no work package is authorized to start by this
document alone.

## Phase 1 baseline

Use accepted Phase 1 product SHA
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9` for organization, membership,
role, and management interfaces. `LP-P1-05` supplies exact-SHA evidence.

The provisional membership consumer contract names Phase 4 as owner of review
eligibility: immutable review-policy snapshot + current canonical membership
eligibility + persisted review assignment. Preserve that exact ownership split.

## Entry prerequisites

1. Verify `LP-P1-05` and `LP-P3-05` with exact-SHA evidence.
2. Confirm the accepted Phase 1 interfaces on the target checkout. Completion
   criterion: role,
   organization, membership, and deactivation semantics used by lender
   confirmation are unchanged or this handoff is revised.
3. Confirm the Phase 3 revision/checkpoint and policy-lock contracts on the
   implementation HEAD. Completion criterion: one current revision, assignment,
   and five immutable checkpoint values can be named before a cycle opens.
4. Reconcile proposal decision, Back Office editor, Builder projection, queue
   effect, audit, and notification-intent consumers before `LP-P4-01` starts.

## Canonical owners and context pointers

- proposal revisions, assignment, closing eligibility, and audit: certified
  Phase 2/3 owners and evidence;
- membership eligibility: `convex/authz.ts` and
  `convex/workosProjection.ts` from accepted Phase 1;
- proposal host/editor: `convex/production_proposals.ts`,
  `src/routes/backoffice/proposals.$planId.tsx`, and existing production
  proposal components;
- selected confirmation surface:
  `src/routes/lender.proposal-confirmation-prototype.tsx`;
- production lender route: `src/routes/lender/proposals/$proposalId.tsx`;
- source contract: guided-confirmation/remediation sections, spec User Stories
  19–32, E2E-02/E2E-03, implementation plan Phase 4, and four Phase 4 packets.

Load notification delivery only to verify the typed intent seam; Phase 8 owns
delivery. Load later participant surfaces only when a changed transition
consumer requires a targeted contract check.

## Package sequence and safe parallel lanes

1. `LP-P4-01` implements the five-checkpoint confirmation cycle after
   `LP-P3-05`.
2. `LP-P4-02` adds decline, Back Office remediation, new revision publication,
   and full reconfirmation.
3. `LP-P4-03` promotes Proposal Review Variant D and completes paired Back
   Office and Builder projections.
4. `LP-P4-04` independently certifies the complete loop.

The package chain is sequential because each packet consumes the prior
transition contract. Read-only projection/privacy tests may run in parallel,
but decision and remediation writers stay under one active package.

## Participant and prototype contracts

- A cycle belongs to one proposal, current revision, and current assignment.
- Lender checkpoint data is read-only and all five checkpoints are explicitly
  reconfirmed after every remediation revision.
- Decline requires a private reason, retains Back Office approval, and creates
  one Back Office remediation task.
- Builder-safe state never includes reviewer identity or private rationale,
  including errors and notification inputs.
- Directly promote `LP-PROT-PROP` Variant D from the selected route and
  components. Preserve its hierarchy, progress, change highlights, decline
  interaction, and authorized history.

## Required verification and exact-commit evidence

Evidence for each packet includes exact proposal/revision/assignment fixtures,
actor organization and role, candidate SHA, command results, privacy field
inventory, consumer effects, and independent review. Required phase proof:

- five-checkpoint, partial-flow, exact-revision, assignment, membership,
  withdrawal, stale, replay, and concurrent-decision tests;
- decline-reason, same-proposal remediation, diff, new-cycle, and full
  reconfirmation tests;
- Back Office, lender, and Builder projection/privacy tests;
- Variant D parity and accessibility evidence;
- E2E-02 and E2E-03 plus codegen, typecheck, build, and execution validation.

`LP-P4-04` must run read-only at one candidate SHA and reject any qualified or
cross-SHA result.

## Rollback and escalation

Rollback disables new confirmation/remediation commands or routes while
preserving revisions, cycles, decisions, reasons, and audit events. Escalate if
the final Phase 1 eligibility boundary changes, any checkpoint is mutable,
private rationale is required by an unauthorized consumer, duplicate proposal
identity appears necessary, or Variant D conflicts with the feature brief.

Return the conflict to its owning upstream phase. Do not weaken full
reconfirmation or serialize private data into Builder-safe projections.

## Binary phase exit gate

Phase 4 passes only when `LP-P4-01` through `LP-P4-03` are independently
accepted, `LP-P4-04` proves the repeatable decline/remediation/full-review
loop, privacy and participant parity pass, Variant D is directly promoted, and
the Phase 4 coverage group and packages are verified at one exact commit.
