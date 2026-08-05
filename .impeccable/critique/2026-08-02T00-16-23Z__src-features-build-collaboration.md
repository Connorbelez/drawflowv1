---
target: all production Build Collaboration screens
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-08-02T00-16-23Z
slug: src-features-build-collaboration
---
# Build Collaboration Design Critique

Method: dual-agent (A: `/root/critique_design_review` · B: `/root/critique_detector_browser`)

## Design Health Score

| # | Heuristic | Score | Key issue |
| --- | --- | ---: | --- |
| 1 | Visibility of system status | 3/4 | Recovery states are strong; durable publication outcome is understated. |
| 2 | Match system / real world | 2/4 | Permission implementation language leaks into ordinary collaboration. |
| 3 | User control and freedom | 3/4 | Drafts and exits are strong; realtime ordering and feed density are not user-controlled. |
| 4 | Consistency and standards | 3/4 | Familiar feed and shared primitives are coherent; toolbar and hierarchy diverge. |
| 5 | Error prevention | 4/4 | Permission narrowing, offline gating, conflicts, and HITL are unusually strong. |
| 6 | Recognition rather than recall | 2/4 | Pinned, Prominent, Following, Seen, Acknowledge, and Agree require recall. |
| 7 | Flexibility and efficiency | 3/4 | Search, filters, deep links, and queues support experts; fast navigation is missing. |
| 8 | Aesthetic and minimalist design | 2/4 | Post content competes with persistent editors, metadata, tabs, reactions, and rail cards. |
| 9 | Error recovery | 4/4 | Conflicts, offline recovery, revisions, and tombstones preserve user work. |
| 10 | Help and documentation | 2/4 | Audience consequences and high-stakes action distinctions lack contextual help. |
| **Total** |  | **28/40** | **Good foundation; hierarchy and comprehension need convergence.** |

## Anti-patterns verdict

The surface passes the AI-slop test. It avoids gradients, glass, oversized radii,
decorative motion, giant hero metrics, and generic marketing chrome. The
detector returned zero findings. Its weakness is generic enterprise density:
repeated neutral panels, tiny metadata, always-visible tooling, and a utility
rail make the Build-local record feel assembled from component defaults rather
than tuned around construction coordination.

The CLI detector returned `[]` across the shared collaboration feature and all
four production hosts. Browser injection was not possible because the available
evaluate surface is read-only; no detector overlay was claimed. Independent DOM,
screenshots, and console evidence confirmed the live surface and no console
errors. Two route export/code-splitting warnings remain.

## Overall impression

The safety model is exceptional and the Familiar Feed is the right foundation.
The biggest opportunity is to make the update and the user’s next work dominate,
while progressively disclosing publication governance and thread tooling.

## What is working

- Offline privacy, conflict preservation, revision history, exact HITL review,
  and access-aware references fit a high-stakes construction-finance product.
- The collapsed composer, feed cards, discussion/action split, and search are
  familiar without becoming a parallel generic social system.
- Milestones, evidence, site visits, documents, draws, materials, participants,
  and Action Items remain linked to canonical Build entities.

## Priority issues

### P1 — Collaboration and personal work are structurally buried

Build Overview correctly stays first, but collaboration begins after a tall
operational surface and mobile work queues fall after the feed. Add a clear
collaboration landmark/jump action and place a compact personal-work summary
before long feed content on narrow screens.

Suggested command: `$impeccable layout`.

### P1 — The expanded composer collapses several workflows into one form

Everyday updates inherit audience hierarchy, scheduling, governed attachments,
Action Item creation, acknowledgement, and four publication actions. Keep the
message primary and progressively disclose secondary governance while retaining
one explicit effective-audience summary.

Suggested command: `$impeccable distill`.

### P1 — Rich-text toolbars expose unnamed controls

The live accessibility tree contains blank toolbar buttons. Add names, tooltips,
pressed states, toolbar semantics, predictable keyboard order, and touch-safe
hit areas.

Suggested command: `$impeccable audit`.

### P2 — Published content loses visual priority

Author metadata, badges, references, tabs, a full reply editor, reactions,
receipts, audience, and the utility rail compete with the actual update. Lazy
mount discussion tooling and preserve only current status and urgent actions at
rest.

Suggested command: `$impeccable quieter`.

### P2 — Permission copy describes the authorization implementation

Role-level, governed, and exact-bundle terminology is correct but expensive for
Homeowners and Contractors. Express concrete people/teams and show policy detail
only where it affects the decision.

Suggested command: `$impeccable clarify`.

## Persona red flags

- **Alex, power user:** must traverse the full overview, has no fast collaboration
  landmark, and scans duplicated pinned/work summaries.
- **Sam, accessibility-dependent user:** blank toolbar names, small muted
  metadata, nested modes, and similar outline controls obscure operation and
  context.
- **Casey, distracted mobile user:** secondary governance makes the composer too
  long for one-handed use and personal work falls below the feed.
- **Lender approver:** Acknowledge, Agree, resolution, and approval are adjacent
  despite materially different audit consequences.
- **Builder lead:** blocker communication does not feel like the fastest path to
  unblock field work.
- **Homeowner/Contractor:** hierarchy language is opaque and mentions can be
  mistaken for access expansion.

## Minor observations

- Pinned and Prominent are adjacent concepts without an explicit distinction.
- Actionable lacks a visible definition.
- The filtered empty state does not offer a reset action.
- Backoffice has no visible Build collaboration section heading.
- Reply tooling mounts open on every post, including posts with no comments.
- Chartreuse needs one accountable active/forward role rather than text usage.

## Questions to consider

- If collaboration is the shared operational record, what is the shortest
  intentional path from Build Overview to the newest blocker?
- Should the primary publication decision be message intent, audience, or
  operational consequence?
- Can every audience summary name people/teams rather than explain hierarchy?
- Does a post need a reply workstation before the reader chooses to discuss it?
