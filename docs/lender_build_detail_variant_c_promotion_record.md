# Prototype Promotion Record — Lender Build Detail

- Promotion ID: `LP-PROT-BUILD-2026-08-18`
- Surface / actor / user task: Lender Build Detail; assigned lender member; inspect one authorized Build, its Milestones, pooled funding, Draws, review evidence, and public Collaboration.
- Selected variant and registry status: Variant C, approved and locked.
- Product decision authority and decision date: Lender Portal prototype registry and promotion contract; 2026-08-13.
- Source prototype paths: `src/routes/lender.build-detail-overview-prototype.tsx`
- Source commit and file hashes: checkout `62b8eb75e9c1ebfa6ac3323a38e303d9af2b1df4`; source SHA-256 `f1bbc0573cb3b048891584d469900e6695f25010dc7f3498faabc8c3a1f7f276`.
- Production destination paths: `src/features/lender-portal/LenderBuildDetailOverview.tsx`, `src/routes/lender/builds/$buildId.tsx`.
- Production route and navigation/direct-link contract: authorized direct route `/lender/builds/$buildId`; ordinary Active Builds links already target this route.
- Allowed departures from the selected prototype: local fixtures and prototype switcher removed; production queue links replace prototype review links; the established shared `MilestoneDetailSheet` supplies the focused read-only sheet; all displayed facts come from the canonical lender projection. The sheet omits its optional linked-Draw label because the lender projection has no canonical Milestone-to-Draw relationship.
- Explicitly deferred/rejected variants: Variants A and B; full Build Workspace, Gantt, Draw Groups, contractors, internal notes, private reviewer identity/rationale, broad documents, comments/composer, lender edits, policy controls, evidence upload, and overview decisions.
- Domain/auth owner: Lender Portal projection over canonical Active Build, Phase 5 review, Draw funding, and Collaboration records.
- Design/accessibility owner: locked Variant C contract plus shared UI primitives.
- Release owner: not assigned in this dirty checkout.

## Literal copy/paste checkpoint

- Copy operation: production-owned file created through `apply_patch` from the complete source bytes.
- Source file hash before copy: `f1bbc0573cb3b048891584d469900e6695f25010dc7f3498faabc8c3a1f7f276`.
- Destination file hash before productionization: `f1bbc0573cb3b048891584d469900e6695f25010dc7f3498faabc8c3a1f7f276`.
- Hashes match: yes.
- `git diff --no-index` is empty at checkpoint: yes (`exit 0`).
- Copy checkpoint commit or working-tree evidence: working-tree hash and zero-diff checkpoint recorded on 2026-08-18 before productionization.
- Productionization edits began after checkpoint: yes.
- Source remained unchanged: yes; final `git diff --exit-code -- src/routes/lender.build-detail-overview-prototype.tsx` returned `0`, and its SHA-256 remains `f1bbc0573cb3b048891584d469900e6695f25010dc7f3498faabc8c3a1f7f276`.

## Wiring ledger

| Element | Canonical loader/command | Scope and permission | State mapping | Evidence |
| --- | --- | --- | --- | --- |
| Route entry | `api.lender_portal.getLenderBuildDetail` | `lenderOrganizationQuery` and `requireAccessibleLenderBuild` | loading to ready | `-build-detail-route.test.tsx` |
| Build and child ledger | Active Build, current Milestone, and current Sub-milestone records | exact Build, organization, and Brokerage checks; malformed scope fails closed | planned, in progress, complete; actual-or-planned dates | `lender_portal.test.ts`, `LenderBuildDetailOverview.test.tsx` |
| Review evidence and costs | `projectCurrentMilestoneReviewEvidence` over the exact current Phase 5 cycle | current cycle identity, target, organization, Brokerage, and source-row validation | receipt coverage, Evidence Package asset, Site Visit report/photo | `lender_portal.test.ts` |
| Funding and Draw records | `activeBuildDrawFundingSnapshotFromRows` plus scoped Draw and capital-event rows | accessible Build scope; no overview mutations | facility, unlocked, reserved, available, released | `lender_portal.test.ts`, `LenderBuildDetailOverview.test.tsx` |
| Collaboration | canonical Build Collaboration posts and current revisions | only active, non-tombstoned, human `build_wide` posts; author identity is generalized | public update or empty | privacy assertions in `lender_portal.test.ts` |
| Focused Milestone sheet | shared `MilestoneDetailSheet` with `readOnly` | projection-only; every workflow and decision callback omitted and controls hidden; no Draw relationship is inferred from a Milestone key | focused read-only detail without a fabricated linked-Draw label | `LenderBuildDetailOverview.test.tsx`, `MilestoneDetailSheet.test.tsx` |

## Placeholder removal

- Prototype imports removed from production entry point: yes.
- Fixture/mock/demo/sample/representative values removed: yes.
- Visual-parity flag/fallback removed or explicitly default-off: yes; no production fallback exists.
- Placeholder scan command and result: `rg -n -i 'prototype|mock|fixture|demo|sample|representative|placeholder|hard-coded|TODO' src/features/lender-portal/LenderBuildDetailOverview.tsx 'src/routes/lender/builds/$buildId.tsx'` returned no matches.

## State and reachability evidence

- Loading: route renders a named lender Build loading status.
- Ready: route test proves the route queries the canonical public function and renders the production component.
- Empty: Milestone, Draw, evidence, and Collaboration sections each render explicit empty text.
- Not configured/unavailable: absent facility and review-cycle data project as no attached record, without fixture fallback.
- Forbidden: cross-tenant and cross-Brokerage assignment tests reject Build detail.
- Stale/terminal: Phase 5 helper requires the exact current review cycle and fails closed otherwise.
- Error/retry: Convex route error handling remains owned by the application route boundary; no local retry loop was added.
- Authorized route/navigation evidence: `/lender/builds/$buildId` is the registered production route and `listLenderActiveBuilds` consumers already link to it.
- Primary action and durable result: this overview is intentionally read-only; review actions remain in the canonical Milestone and Draw queues.
- Paired next-actor surface: production Milestone and Draw queue links.
- Privacy/accessibility evidence: tests exclude custom Collaboration, author identity, private field notes, private rationale, and every overview/sheet decision control; disclosure uses native buttons with names and expanded state.
- `better-interface` first-run scope, verdict, and evidence: production Build detail primary, loading, ready, empty, disclosure, and focused-sheet states; no remaining actionable source/test finding. Live browser contrast, 200% zoom, and screen-reader verification remain unverified.
- `make-interfaces-feel-better` second-run scope, verdict, and evidence: production component typography, dense-table numerics, controls, icons, focus styles, and motion restraint; approved with no new motion or one-off surface system.
- `impeccable harden` third-run target, edge-case matrix, verdict, and evidence: invalid dates, long Build/collaboration values, missing data, read-only permission state, and overflow; invalid dates now degrade to “Date unavailable,” long values wrap, and empty states remain explicit.
- `impeccable polish` fourth/final-run target, verdict, and evidence: production component and shared read-only sheet; implementation language was removed from lender-facing copy and final detector was clean.
- Impeccable context setup command, target, and output reference: `node .agents/skills/impeccable/scripts/context.mjs --target src/features/lender-portal/LenderBuildDetailOverview.tsx`; resolved DrawFlow `PRODUCT.md` and `DESIGN.md`.
- Detector command, changed UI targets, and result: `node .agents/skills/impeccable/scripts/detect.mjs --json src/features/lender-portal/LenderBuildDetailOverview.tsx src/features/backoffice-build-detail/MilestoneDetailSheet.tsx`; result `[]`.
- Findings resolved or explicitly accepted by product decision owner: no unresolved source/test finding; live browser/deployment evidence remains a release limitation.

## Verification

- Focused tests: `bun run test -- convex/lender_portal.test.ts src/features/lender-portal/LenderBuildDetailOverview.test.tsx 'src/routes/lender/builds/-build-detail-route.test.tsx' src/features/backoffice-build-detail/MilestoneDetailSheet.test.tsx src/routes/-lender.build-detail-overview-prototype.test.tsx` — 5 files, 29 tests passed. The public query also fails closed for a foreign-scoped evidence asset and a mismatched current Milestone review-cycle identity.
- Typecheck/build: `bun run typecheck` passed; `bun run build` passed (Convex deployment registration check skipped outside Vercel by the repository script).
- Browser/visual evidence: not captured in this turn.
- Exact release commit: unavailable; work is in a shared dirty checkout and no commit was authorized.
- Rollback or default-off behavior: revert the production route/component/projection changes together; no release flag was introduced because the supported route already existed.
- Known limitations: no authenticated live-browser, deployed-SHA, real signed-file download, 200% zoom, screen-reader, or release-owner verification. The coordinator explicitly waived GAP-06 prototype-provenance certification for pre-existing user-owned edits in `src/routes/lender.prototype.tsx`; those hunks were not edited by GAP-07.
- Final status: Wired.
- Sign-offs: product: selected/locked contract; domain-auth: implementation evidence complete, independent review pending; design-accessibility: source/test review complete, browser evidence pending; release: pending.
