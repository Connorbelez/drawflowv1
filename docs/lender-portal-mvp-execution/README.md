# Lender Portal MVP execution control

## Purpose

This directory is the execution control layer for the Lender Portal MVP. It
does not restate the product. It links stable requirement identifiers from the
authoritative documents to delivery phases, work packages, verification, and
exact-commit evidence.

Product implementation begins only after the preparation validator passes and
the first work package is explicitly authorized.

## Authority

Resolve questions in this order:

1. `docs/lender_portal_mvp_feature_brief.md` owns confirmed product scope,
   invariants, permissions, notifications, and acceptance criteria.
2. `docs/lender_portal_mvp_spec.md` owns the implementation synthesis, numbered
   user stories, implementation decisions, E2E journeys, and testing rules.
3. `docs/lender_portal_mvp_implementation_plan.md` owns sequencing,
   dependencies, quality gates, and phase exit criteria.
4. `docs/lender-portal-prototype-promotion.md` and
   `src/components/prototypes/README.md` own selected prototype promotion.
5. `docs/draw_flow_prd.md` owns DrawFlow rules outside this feature slice when
   they do not conflict with the feature brief.

Raise a product question when these sources conflict. A work package does not
have authority to settle a conflict.

## Execution sequence

1. Run `bun run validate:lender-portal-execution`.
   Completion criterion: the command reports `status: valid` in `prep` mode.
2. Confirm that `current-checkout-preflight.md` still names the actual branch
   and HEAD. Re-run the current-checkout inventory if either changed.
   Completion criterion: the traceability baseline matches `git rev-parse HEAD`.
3. Open only the next ready work package and the context pointers it names.
   Completion criterion: the agent has not loaded unrelated phase branches.
4. Implement the packet through its highest available external seam.
   Completion criterion: every packet completion criterion and required test
   passes on one exact commit.
5. Create an evidence record from `evidence-template.md`, update that packet to
   `verified`, and attach the evidence path in `traceability.json`.
   Completion criterion: a fresh read-only verifier accepts the source IDs,
   diff, tests, prototype contract, and exact SHA, unless the user explicitly
   exercises human acceptance authority and the evidence records the override.
6. Start the next dependency-unblocked packet in a fresh task context.
   Completion criterion: no packet consumes unverified dependency behavior.

## Context loading rule

Every implementation agent loads:

- repository `AGENTS.md`;
- its one work package;
- only the source sections under that packet's **Context pointers**;
- the named canonical implementation owners;
- `convex/_generated/ai/guidelines.md` before Convex work; and
- the named prototype route and contract before UI work.

The full three-document package remains searchable reference. It is not an
always-loaded prompt.

## Status model

- `planned`: assigned to a later phase but not decomposed into executable work.
- `ready`: bounded, dependency-declared, and permitted to start after explicit
  implementation authorization.
- `in-progress`: product implementation has started on an identified checkout.
- `verified`: independent acceptance evidence, or an explicit documented human
  acceptance override, is attached to an exact commit.

Preparation ends with all Phase 1 work packages at `ready` and with no evidence
attached. That state proves implementation has not started.

The validator selects `prep` while every packet is ready, `execution` after
an authorized packet transition, and `release` only when called with
`--release`. Execution mode permits at most one in-progress packet, requires
verified dependencies, checks packet and ledger status agreement, and rejects
evidence attached before verification.

## Traceability rules

- Every catalogued requirement is covered by at least one coverage group.
- Every Phase 1 requirement is named by at least one Phase 1 work package.
- Every work package names authoritative requirements and observable
  verification.
- Locked prototypes are promoted directly from their selected route and shared
  components.
- Verified packet attachments store the evidence path, accepted commit SHA,
  and evidence-file SHA-256. The validator checks the file bytes and confirms
  that the accepted commit remains in the current branch history.
- Completion evidence belongs to one exact commit. A later code change makes
  behavioral evidence stale until the affected checks run again.
- Product code, tests, or UI without a source requirement is unscoped work and
  blocks packet acceptance.

## Current stop point

All five Phase 1 work packages are verified. Product acceptance is bound to
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9` on branch
`codex/lp-phase-1-completion`. CodeRabbit CLI reviewed the full candidate range;
its valid findings were resolved and stale findings were disproved. The
independent Pi reviewer did not return a decision, so the user explicitly
exercised human acceptance authority and superseded that pending gate on
2026-08-14.

Phase 1 is closed. Starting Phase 2 requires a new explicit implementation
instruction, a target-checkout confirmation, a fresh preflight inventory, and
only the next dependency-unblocked Phase 2 packet may move to `in-progress`.
