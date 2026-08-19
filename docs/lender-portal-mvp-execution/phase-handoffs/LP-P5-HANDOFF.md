# Phase 5 handoff — Milestone and Draw review cycles

Handoff ID: LP-HO-P5

Status: ready; no work package is authorized to start by this
document alone.

## Phase 1 baseline

The accepted identity and membership contract comes from Phase 1 product SHA
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`, certified by `LP-P1-05`.

Use that accepted contract for active-organization and current-member
authorization, and confirm it on the actual Phase 5 target checkout.

## Entry prerequisites

1. Verify `LP-P1-05` and `LP-P3-05` with exact evidence.
2. Confirm final Phase 1 membership/deactivation semantics. Completion
   criterion: governed review commands can resolve current organization,
   current active membership, supported role, and resource authority without a
   portal-owned identity lookup.
3. Read `docs/specs/lender-milestone-review-and-decision.md`,
   `docs/lender_milestone_detail_sheet_default_decision.md`, and
   `docs/specs/lender-portal-draw-review.md`.
4. Inventory existing Milestone, Draw, pooled Build availability, evidence,
   governed decision, audit, collaboration, and shared-sheet owners. Completion
   criterion: the active package names every reused owner and call site.
5. Validate the exact target HEAD before either parallel domain lane starts.

## Canonical owners and context pointers

- Milestone/sub-milestone review:
  `convex/build_submilestone_review.ts`,
  `convex/build_submilestone_evidence.ts`, canonical completion review
  functions, and `src/features/backoffice-build-detail/MilestoneDetailSheet.tsx`;
- Draw review and pooled availability:
  certified Draw domain owners discovered from the Draw review spec and
  `src/features/draw-workflow/DrawReviewSheet.tsx`;
- authorization/membership: accepted Phase 1 `convex/authz.ts` and
  `convex/workosProjection.ts`;
- locked Builder Milestone prototype:
  `src/routes/builder.milestone-revision-detail-prototype.tsx`;
- source contract: request-cycle/privacy sections, spec User Stories 61–66,
  E2E-05/E2E-06, implementation plan Phase 5, and five Phase 5 packets.

Reach for cost documents and Site Visits only to define typed evidence
references; Phase 6 owns their qualification rules.

## Package sequence and safe parallel lanes

- Milestone lane: `LP-P5-01` creates stable Milestone request/cycle semantics.
- Draw lane: `LP-P5-02` creates the same cycle semantics over Draw-specific
  pooled availability.
- Join: `LP-P5-03` implements the shared governed decision and privacy
  boundary after both lanes.
- Sheets: `LP-P5-04` binds canonical role adapters and directly promotes the
  locked Builder Milestone surface.
- Certification: `LP-P5-05` runs read-only after all four packets.

`LP-P5-01` and `LP-P5-02` may run concurrently in separate tasks after
`LP-P3-05`. Coordinate shared schema and decision types before merge. The
join packet is the only owner of shared approval/rejection commands.

## Participant and prototype contracts

- Milestone and Draw each retain one stable request identity with monotonic
  immutable decision cycles.
- Rejection returns the same request to Builder correction; resubmission
  increments the cycle and resets every current approval.
- Builder projections expose published revision instructions but no reviewer
  identity or private rationale.
- One shared `MilestoneDetailSheet` and one shared `DrawReviewSheet` serve
  all personas through typed route/action adapters.
- Directly promote `LP-PROT-MILESTONE-SHEET`,
  `LP-PROT-DRAW-SHEET`, and `LP-PROT-BUILDER-MILESTONE`.
- Builder Draw presentation remains unimplemented until a separate user
  decision selects it.

## Required verification and exact-commit evidence

Each lane records schema ownership, candidate SHA, cycle fixtures, command and
projection results, call-site inventory, and reviewer decision. The joined
phase requires:

- stable identity, immutable snapshot, correction, resubmission, approval
  reset, stale-cycle, replay, concurrency, and audit tests for both domains;
- pooled Build availability tests for Draw;
- field-level privacy tests across loaders, errors, collaboration, history, and
  notification inputs;
- shared-sheet call-site, role-adapter, parity, keyboard, focus, and responsive
  evidence;
- E2E-05 and E2E-06 plus codegen, typecheck, build, and execution validation.

`LP-P5-05` certifies one merged SHA after both lanes and all shared-sheet
changes. Lane-local evidence alone cannot pass the phase.

## Rollback and escalation

Rollback stops new submissions, decisions, or role actions while retaining
request identity, cycles, decisions, evidence references, instructions, and
audit history. Escalate when a canonical review owner conflicts with a packet,
shared schema lanes diverge, pooled availability cannot be version-bound,
private fields leak into Builder-safe types, or a request seems to require a
new identity on resubmission.

Keep the Builder Draw boundary explicit. Do not fill the missing presentation
decision with a copied lender or Back Office surface.

## Binary phase exit gate

Phase 5 passes only when `LP-P5-01` through `LP-P5-04` are independently
accepted, `LP-P5-05` proves both domains use the stable cycle pattern and
shared governed decisions, privacy and locked-sheet parity pass, Builder Draw
remains unselected, and all Phase 5 ledger records are verified on one SHA.
