---
name: prototype-promotion
description: Prototype promotion workflow. Use whenever production implementation starts from a selected, approved, or locked prototype, component, screen, flow, reference, or variant; also when another skill needs promotion gates.
---

# Prototype Promotion

Promote by literal copy, canonical wiring, honest states, reachable consumers, and exact-commit evidence.

## 1. Load the contract

Before planning, editing, delegating, or reviewing promotion work, read [`docs/prototype-promotion-sop.md`](../../../docs/prototype-promotion-sop.md) completely. Then read the product contract, selected-variant decision, registry entry, source prototype, canonical production domain and authorization rules, implementation ticket, and tests in the SOP's authority order.

**Completion criterion:** You can name the selected source, decision authority, intended production consumer and entry point, production ownership boundary, source provenance, allowed departures, and every known deferral.

## 2. Run the promotion workflow in order

Execute SOP Steps 0 through 8 in order. Treat each step's completion criterion as a hard gate: record its evidence in the promotion record before advancing. Preserve user-owned working-tree changes.

The invariant is **copy, then productionize**:

1. Freeze and fingerprint the selected source.
2. Literally copy every selected file into production ownership.
3. Prove byte parity before the first productionization edit.
4. Build the complete field/action wiring ledger.
5. Replace fixtures and local actions only in the production copy.
6. Implement every required production state.
7. Prove the intended consumer can reach and complete the primary task.
8. Complete interface review, verification, and exact-commit certification.

**Completion criterion:** Every SOP step has current, reproducible evidence and the frozen source remains unchanged.

## 3. Enforce the gates

Apply SOP Gates P1 through P7. A missing canonical capability, unresolved authorization rule, fixture fallback, unreachable consumer path, source mutation, failed review, or missing release evidence blocks promotion. Record `Promotion blocked` or `Wired — blocked` and name the missing evidence; never substitute representative data or mark the surface `Verified`.

For web UI, run the required reviews sequentially against the reachable production copy after canonical wiring:

1. `better-interface`
2. `make-interfaces-feel-better`
3. `impeccable harden`
4. `impeccable polish`

Resolve findings and repeat the affected pass as the SOP requires. Keep internal notes and promotion evidence out of user-facing UI.

**Completion criterion:** P1-P7 pass, or the promotion record states the exact blocked status, owner, and missing evidence.

## 4. Certify completion

Use the SOP's promotion record template and Definition of Done. Report the exact source commit and hashes, copy checkpoint, production paths and entry point, wiring and state evidence, focused tests, interface-review results, typecheck/build results, deployed reachability evidence, exact release commit, and rollback/default-off behavior.

`Copied` and `Wired` are milestones. Only use `Verified` after every applicable gate passes against the exact release commit.

**Completion criterion:** The release owner can reproduce the promotion, identify the exact source and release commits, exercise the production capability through its supported interface, and explain every data and authorization state.
