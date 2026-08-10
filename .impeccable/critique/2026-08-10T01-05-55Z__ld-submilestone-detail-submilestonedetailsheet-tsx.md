---
target: ENG-428 canonical Sub-milestone detail
total_score: 25
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 2
timestamp: 2026-08-10T01-05-55Z
slug: ld-submilestone-detail-submilestonedetailsheet-tsx
---
## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Strong loading, busy, success, error, stale-conflict, and superseded states. |
| 2 | Match system / real world | 2 | Domain vocabulary is strong, but some implementation language remains. |
| 3 | User control and freedom | 2 | Close, cancel, focus return, retained drafts, and linked-target navigation work; execution edits lack an explicit reset. |
| 4 | Consistency and standards | 3 | Primitive reuse is consistent; Collaboration and Review still use generic collections. |
| 5 | Error prevention | 3 | Capability, revision, reason, confirmation, and retained-retry guards are strong. |
| 6 | Recognition rather than recall | 3 | Labeled tabs and facts help, but readiness remains distributed across tabs. |
| 7 | Flexibility and efficiency | 2 | Linked-target keyboard navigation exists; blocker and review fast paths are not yet built. |
| 8 | Aesthetic and minimalist design | 2 | Calm and system-consistent, but repeated equal-weight Frames weaken priority. |
| 9 | Error recovery | 3 | Draft retention and stale-conflict recovery are strong. |
| 10 | Help and documentation | 2 | Boundary explanations help, but review consequences still need contextual guidance. |
| **Total** |  | **25/40** | **Acceptable; remaining workflow-priority issues map to ENG-429 and ENG-430.** |

## Design Specificity Verdict

The sheet has strong DrawFlow domain specificity and moderate interaction specificity. Canonical Sub-milestone scope, schedule, execution, Evidence Package, Work Allocation, and review boundaries are accurate. The composition is still a conventional operational sheet, and its main readiness and decision paths need stronger authored treatment in the Collaboration and Review tickets.

The independent deterministic assessment found zero issues across `SubmilestoneDetailSheet.tsx`, `SubmilestoneDetailCanonical.tsx`, and `MaterialPlanningTab.tsx`. Browser overlay injection was unavailable because the in-app browser exposes read-only evaluation only; no overlay was claimed.

## Overall Impression

The implementation is trustworthy and complete for canonical execution. Its strongest quality is authority clarity. Its largest opportunity is to make blockers and the next governed action visible without asking users to reconstruct readiness across six tabs.

## What Is Working

- Canonical execution, Draw release, lender review, and collaboration ownership remain separate.
- Revoked, superseded, stale, empty, upload-failure, and retained-draft states fail safely.
- The shared modal, focus return, mobile full-screen layout, local horizontal scrollers, reduced motion, semantic controls, and role-aware capabilities follow the product system.

## Priority Issues

### P1: Review is still a generic collection

The lender default destination does not yet assemble the current review round, frozen evidence revision, requirements, Site Visit gate, decision history, or role-aware next action. Resolve in ENG-430 with a purpose-built canonical Review panel.

### Resolved in ENG-428: Actual cost no longer exposes storage units

The field now accepts a decimal CAD value and converts to cents only at the mutation boundary, removing the 100x financial error risk.

### P1: Overview does not yet consolidate blockers and next action

Scope, metrics, ownership, execution edits, and lifecycle actions have similar visual weight. Add a role-aware readiness summary without duplicating canonical domain state.

### P2: Collaboration is a transcript rather than a coordination workspace

Reuse the incumbent collaboration presentation in ENG-429, include author/time/composer affordances, and state that collaboration cannot start, complete, approve, or release canonical work.

### P2: Mobile actions are deep in the scrolling body

During later tab implementations, keep the role-aware primary action in the safe-area footer and make tab attention states visible without creating document-level overflow.

## Persona Red Flags

- Power users lack a direct route to the first blocker and visible tab counts.
- Keyboard and screen-reader users need stronger section heading and review-event semantics.
- Mobile field users must scroll deeply for execution and evidence actions.
- Builders cannot yet see one consolidated `Ready except for` list.
- Lender reviewers do not yet have a purpose-built decision workspace.

## Minor Observations

- Review and collaboration timestamps should be displayed when those owned tabs land.
- Evidence cards need a visible open/download affordance.
- Relative roadmap days and calendar dates should be co-located where practical.

## Questions to Consider

- Can Overview answer what changed, what is blocked, and what this role can do next within five seconds?
- If Review is the lender default, should it be the most purpose-built tab?
- Which single action should remain reachable by a builder's thumb on site?

Questions skipped: the user requested an autonomous end-to-end pipeline, the actual-cost defect is unambiguous, and the remaining findings already map to ENG-429 and ENG-430.
