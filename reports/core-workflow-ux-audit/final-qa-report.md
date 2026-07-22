# Core Workflow Remediation Final QA

<!-- markdownlint-disable MD013 -->

**Date:** 2026-07-22  
**Working tree:** `drawflowv1-core-workflow-remediation-20260717`

## Automated verification

| Check | Result |
| --- | --- |
| Full Vitest suite | PASS — 151 files, 1,147 tests |
| Targeted authenticated-QA regressions | PASS — 11 files, 124 tests |
| Convex code generation | PASS |
| Convex TypeScript (`convex/tsconfig.json`) | PASS |
| Project typecheck (`bun run typecheck`) | PASS |
| Production build (`bun run build`) | PASS |
| Build-warning policy (`bun run verify:build-warnings`) | PASS |
| Static UI HTML interaction audit | PASS — 78 snippets |
| Workflow manifest integrity | PASS — 16 parent workflows, 63 persona segments, 52 handoffs, 409 stable steps |

The expected mocked AuthKit `HTTPError` diagnostic appears in the full test output; it is part of the covered auth-failure path and does not fail a test.

## Browser verification

Two browser layers now exist:

1. deterministic visual-parity fixture QA in Chromium at 1,440×900, 1,024×768, 512×768, and 390×844; and
2. production-backed authenticated QA with the supplied Builder and Lender Admin accounts at 1,280×900 and 390×844.

Authenticated Builder coverage included the dashboard, proposal list/new flow, every submitted-proposal tab, every active-Build tab, Notifications, and invalid-Build recovery. Authenticated Admin coverage included dashboard, proposal Kanban/detail/unassigned/new, Build list/detail, Draws, Site Visits, Builders, Builder onboarding review, Contractor onboarding/roster/profile, User Management, Settings, and Integrations.

The authenticated pass found and fixed submitted-Builder mutation leakage, proposal/Build/Draw mobile overflow, a crashing Contractor detail route, invalid nested Site Visit controls, unsupported coss `nativeButton` props, broken Draw/Site Visit view toggles, header overflow, and one exposed placeholder route. Decision/cancellation/onboarding validation states were exercised without committing destructive or externally visible mutations.

Final responsive measurements include:

- proposal review at 390 px: `clientWidth=390`, `scrollWidth=390`;
- Build Milestones at 390 px: document contained at 390 px with a 364/1,176 px internal Kanban scroller;
- Draws at 390 px: document contained at 390 px with 340 px responsive chart containers;
- Site Visits, Contractor profile, Backoffice home, and Builder onboarding review: `clientWidth=390`, `scrollWidth=390`.

Isolated post-fix Draw and Site Visit console passes contain no React errors. The only remaining console warning is TanStack route code-splitting guidance. Evidence is stored in `evidence/final-qa/` and `evidence/authenticated-qa/`; full coverage, account, route, interaction, repair, and limitation details are in `authenticated-browser-qa-report.md`.

## Functional contracts re-verified

- canonical active-milestone projection, reconciliation warnings, and material-only auditing;
- draw capacity, concurrency, idempotency, terminal states, rejection reasons, and recipient handoffs;
- immutable budget versions and approval/rejection governance;
- typed Builder and tenant activation recovery plus tenant-scoped Principal reads;
- production/demo site-visit provenance and tamper rejection;
- signed integration delivery, retry, failure, and response-body redaction;
- recipient delivery/acknowledgement for draw decisions, releases, site-visit reports, and contractor assignments;
- contractor invitation acceptance, exact-scope receiver deep links, acknowledgement/clarification/dispute returns, audited assignment update/removal, and stale-assignment recovery;
- responsive shell containment, mobile touch targets, and non-empty staff fixture coverage.

## Remaining product decision

`UX-WF-TEN-003-001` requires a validated cross-brokerage transfer policy. The code must not silently reassign Builds, Loans, Budgets, Draws, Evidence Packages, or audit ownership before product/legal authority, affected-work disposition, and WorkOS membership sequencing are explicit. This item is recorded as blocked rather than falsely closed.

## Evidence limits and supplementary debt

Authenticated browser repetition was possible only for Builder and Lender Admin. Contractor, Inspector, Builder Staff, Lender Operations, Platform Admin, and Technical Admin remain fixture/automated coverage rather than authenticated repetition. The live tenant had no requested draw, and destructive/external submits were intentionally not committed.

The configured release gates pass. A supplementary root-wide `bun x tsc --noEmit` remains outside those gates and currently reports **374 strict errors across 100 files**. The final diagnostic follow-up reduced six high-risk workflow files to zero under the same check; the remaining legacy/production debt is explicitly outstanding engineering-quality work.
