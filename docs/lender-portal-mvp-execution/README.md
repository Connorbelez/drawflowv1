# Lender Portal MVP execution control

## Purpose

This directory is the execution control layer for the Lender Portal MVP. It
does not restate the product. It links stable requirement identifiers from the
authoritative documents to delivery phases, work packages, verification, and
exact-commit evidence. Phase handoffs orchestrate one phase at a time without
loading the full feature package.

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
   Completion criterion: the command reports `status: valid` in the applicable
   preparation or execution mode.
2. Confirm that `current-checkout-preflight.md` still names the actual branch
   and HEAD. Re-run the current-checkout inventory if either changed.
   Completion criterion: the traceability baseline matches `git rev-parse HEAD`.
3. Open the active phase handoff and verify its entry prerequisites.
   Completion criterion: upstream certifications, baseline reconciliation, and
   exact-checkout validation pass before any packet changes status.
4. Open only the next dependency-unblocked work package and the context
   pointers it names. Completion criterion: the agent has not loaded unrelated
   phase branches.
5. Implement the packet through its highest available external seam.
   Completion criterion: every packet completion criterion and required test
   passes on one exact commit.
6. Create an evidence record from `evidence-template.md`, update that packet to
   `verified`, and attach the evidence path in `traceability.json`.
   Completion criterion: a fresh read-only verifier accepts the source IDs,
   diff, tests, prototype contract, and exact SHA, unless the user explicitly
   exercises human acceptance authority and the evidence records the override.
7. Start the next dependency-unblocked packet in a fresh task context.
   Completion criterion: no packet consumes unverified dependency behavior.

## Context loading rule

Every implementation agent loads:

- repository `AGENTS.md`;
- its one phase handoff;
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

Phase 2–9 handoffs are `ready` after reconciliation to the accepted Phase 1
product SHA. A ready handoff still requires explicit implementation authority
and its entry prerequisites before a package can start.

The current execution state has Phase 1 verified with exact-SHA evidence and
Phases 2–9 ready with no implementation evidence attached.

The validator selects `prep` while every packet is ready, `execution` after
an authorized packet transition, and `release` only when called with
`--release`. Execution mode permits at most one in-progress packet, requires
verified dependencies, checks packet and ledger status agreement, and rejects
evidence attached before verification.

## Traceability rules

- Every catalogued requirement is covered by at least one coverage group.
- Every catalogued requirement is named by at least one work package.
- Every Phase 2–9 work package belongs to exactly one phase handoff.
- Every phase handoff names entry prerequisites, sequence/parallel lanes,
  canonical context, participant/prototype contracts, exact-commit evidence,
  rollback/escalation, and one binary exit gate.
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

## Phase handoff and work-package map

| Phase | Handoff | Ready packages | Certification |
|---|---|---:|---|
| 1 — identity and organization operations | accepted product SHA `6ba68e82` | `LP-P1-01..LP-P1-05` verified | `LP-P1-05` |
| 2 — proposal lifecycle | [LP-HO-P2](phase-handoffs/LP-P2-HANDOFF.md) | `LP-P2-01..LP-P2-05` | `LP-P2-05` |
| 3 — revisions and policy lock | [LP-HO-P3](phase-handoffs/LP-P3-HANDOFF.md) | `LP-P3-01..LP-P3-05` | `LP-P3-05` |
| 4 — confirmation and remediation | [LP-HO-P4](phase-handoffs/LP-P4-HANDOFF.md) | `LP-P4-01..LP-P4-04` | `LP-P4-04` |
| 5 — Milestone and Draw review cycles | [LP-HO-P5](phase-handoffs/LP-P5-HANDOFF.md) | `LP-P5-01..LP-P5-05` | `LP-P5-05` |
| 6 — evidence and approval policy | [LP-HO-P6](phase-handoffs/LP-P6-HANDOFF.md) | `LP-P6-01..LP-P6-05` | `LP-P6-05` |
| 7 — participant projections and UI | [LP-HO-P7](phase-handoffs/LP-P7-HANDOFF.md) | `LP-P7-01..LP-P7-07` | `LP-P7-07` |
| 8 — transactional notifications | [LP-HO-P8](phase-handoffs/LP-P8-HANDOFF.md) | `LP-P8-01..LP-P8-04` | `LP-P8-04` |
| 9 — migration, security, and release | [LP-HO-P9](phase-handoffs/LP-P9-HANDOFF.md) | `LP-P9-01..LP-P9-05` | `LP-P9-05` |

Phases 4 and 5 may run independently after Phase 3 certification. Phase 8 may
run alongside Phase 7 after its workflow dependencies are certified. Phase 9
waits for every earlier phase certification.

## Current stop point

All five Phase 1 work packages are verified. Product acceptance is bound to
`6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9` on branch
`codex/lp-phase-1-completion`. CodeRabbit CLI reviewed the full candidate range;
its valid findings were resolved and stale findings were disproved. The
independent Pi reviewer did not return a decision, so the user explicitly
exercised human acceptance authority and superseded that pending gate on
2026-08-14.

Phase 1 is closed. The explicit Phase 2 implementation instruction, dedicated
target checkout, fresh preflight inventory, and execution validator gate have
passed. Only the next dependency-unblocked Phase 2 packet may move to
`in-progress`.

The repository is also prepared through all 45 Phase 1–9 work-package
definitions and eight Phase 2–9 handoffs. Those handoffs are reconciled to the
accepted Phase 1 product SHA above. No Phase 3–9 work package is in progress,
and no product-code change is authorized by this execution pack alone. The
dedicated Phase 2 checkout has `LP-P2-01` implementation-complete and
CodeRabbit-clean at `1b9f4f421968fa194750cf0f50e4739419c7cab1`; its immutable
package-start SHA is `d3d75341fb662242a4d18c92337975f5d637a31e`.

Phase 2 implementation is authorized only in the dedicated checkout recorded
in `current-checkout-preflight.md`. The preparation checkout remains
read-only. Its first implementation transition is `LP-P2-01`; the package
start SHA is recorded before any behavior-bearing change.
