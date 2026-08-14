# LP-P6-03 — Approval group and quorum evaluation

Status: ready

Depends on: LP-P3-05, LP-P5-05

## Objective

Evaluate Back Office, lender quorum, and both-groups approval modes
deterministically for current Milestone and Draw cycles, including active-member
recount before terminal completion.

## Ownership

Extend the canonical locked policy, governed decision, WorkOS membership
projection, request-cycle, authorization, and audit owners. Queues and UI only
consume evaluator output.

## Traceability selectors

- LP-INV-09..LP-INV-11
- LP-INV-16
- LP-PERM-12..LP-PERM-15
- LP-PERM-18
- LP-AC-EVID-05
- LP-AC-POL-05..LP-AC-POL-07
- LP-US-058..LP-US-060
- LP-E2E-05

## Context pointers

Load feature brief approval policy, membership effects, permissions, and
acceptance; spec User Stories 58–66 and E2E-05; implementation plan Phase 6;
Phase 1 membership-effect evidence; and canonical policy, decision, request,
membership, audit, and queue-effect owners.

## Steps and completion criteria

1. Define one pure current-cycle evaluator. Completion criterion: all policy
   combinations and either group order produce deterministic progress/results.
2. Count unique eligible active lender users. Completion criterion: duplicate
   user decisions do not increase quorum and cross-organization decisions fail.
3. Recount on deactivation before terminal completion. Completion criterion:
   history remains, the inactive decision stops contributing, replacement is
   required, and terminal work never reopens.
4. Test approval/rejection and concurrency races. Completion criterion: any
   rejection enters correction and old approvals cannot later complete.

## Required verification

- Exhaustive policy matrix and unique-user quorum tests
- Deactivation and terminal-state tests
- Approval/rejection concurrency and audit tests

## Completion gate

Complete only when policy evaluation is deterministic from the locked policy,
current cycle, and current eligible membership and cannot be bypassed.
