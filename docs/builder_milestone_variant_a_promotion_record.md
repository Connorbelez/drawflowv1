# Prototype Promotion Record — Builder Milestone Correction

- Promotion ID: `LP-PROT-BUILDER-MILESTONE-2026-08-18`
- Surface / actor / user task: Builder Milestone correction; an authorized Builder opens a current Milestone review notification, reads the published correction requirements, updates canonical completion evidence, and resubmits the same Milestone for a new decision cycle.
- Selected variant and registry status: Variant A, approved and locked.
- Product decision authority and decision date: Lender Portal prototype registry and promotion contract; 2026-08-13.
- Source prototype path: `src/routes/builder.milestone-revision-detail-prototype.tsx`.
- Source commit and file hash: checkout `62b8eb75e9c1ebfa6ac3323a38e303d9af2b1df4`; source SHA-256 `994885a67537807ba3cca17c3373d451a49b13d15b41687ce0df48c7b7b265c2`.
- Production destination paths: `src/features/lender-portal/BuilderMilestoneRevisionReview.tsx`, `src/features/lender-portal/LenderNotificationReviewSurface.tsx`, `src/features/backoffice-build-detail/MilestoneDetailSheet.tsx`, and `src/routes/builder/proposals/$proposalId/index.tsx`.
- Production route and deep-link contract: canonical Phase 8 notification links open `/builder/proposals/$proposalId?milestoneId=...&reviewCycleId=...&reviewCycleNumber=...`; the supported route loads the exact current tuple and opens the shared `MilestoneDetailSheet`.
- Allowed departures from the selected prototype: prototype-only fixtures, local state, DOM observation, portal integration, and debug controls are removed. Completion and evidence editing remains in the canonical Build workspace; the correction sheet links to that owner and the footer invokes the typed canonical resubmission command. No parallel Milestone or evidence editor is introduced.
- Explicitly deferred/rejected behavior: Builder Draw correction presentation remains unselected and unimplemented; no Milestone layout is inferred for Draws. Reviewer identity, private reviewer rationale, internal notes, and lender-only decisions remain excluded.
- Domain/auth owner: Phase 5 current review-cycle projection and `submitBuilderReviewRequest`, with canonical Milestone, evidence, audit, approval-reset, and notification/outbox ownership.
- Design/accessibility owner: locked Builder Milestone Variant A plus the shared canonical `MilestoneDetailSheet`.
- Release owner: not assigned in this dirty checkout.

## Direct-promotion checkpoint

- Selected source remained frozen: yes; its SHA-256 remains `994885a67537807ba3cca17c3373d451a49b13d15b41687ce0df48c7b7b265c2` and its Git diff is empty.
- Transfer boundary: the registry requires Variant A inside the already-canonical shared `MilestoneDetailSheet`. The production-owned `BuilderMilestoneRevisionReview` transfers the selected instructions-first hierarchy and the shared sheet exposes a typed governed footer seam; the prototype route itself is not imported by production.
- Preserved composition: **Needs revision**, published Builder instructions, requirements and eligibility, immutable cycle evidence, Builder-safe cycle history, same-record N+1 resubmission, and Builder privacy.
- Productionization edits: typed generated API boundaries, exact-cycle routing, canonical Build edit navigation, canonical resubmission, error/live-status handling, and returned-cycle route replacement.

## Wiring ledger

| Element | Canonical loader/command | Scope and permission | State mapping | Evidence |
| --- | --- | --- | --- | --- |
| Notification entry | Phase 8 Builder Milestone notification deep link | notification recipient plus production Builder route | exact proposal, target, cycle ID, and cycle number | `-proposal.$proposalId.test.ts`, Phase 5 notification tests |
| Review projection | `api.lender_portal_phase5.getBuilderNotificationReviewRequest` | Builder organization, Brokerage, target, current-cycle, and eligibility checks | `correction_required` to `needs_revision`; pending and completed remain read-only | `LenderNotificationReviewSurface.test.tsx`, `lender_portal_phase5.test.ts` |
| Canonical edit owner | `/builder/builds/$buildId?tab=milestones&milestone=...` | authorized Build route | returns the Builder to the actual Milestone/evidence owner | `-proposal.$proposalId.test.ts` |
| Resubmission | `api.lender_portal_phase5.submitBuilderReviewRequest` | exact current cycle, target, organization, actor eligibility, and idempotency | same request identity; creates N+1, resets approvals, writes audit and notifications | `LenderNotificationReviewSurface.test.tsx`, `lender_portal_phase5.test.ts` |
| Returned-cycle continuity | route search replacement with returned cycle ID and number | same authorized proposal route | stale N tuple becomes current N+1 tuple | `-proposal.$proposalId.test.ts` |
| Shared sheet | `MilestoneDetailSheet` typed `footer` extension | route-owned Builder action cap | governed correction footer replaces default completion footer | `MilestoneDetailSheet.test.tsx` |

## Privacy, states, and reachability

- Loading and unavailable states remain owned by the production notification surface; the correction layer renders only after the exact tuple resolves.
- Forbidden and stale tuples fail closed at the Phase 5 public query and mutation boundaries.
- `correction_required` renders **Needs revision** before correction facts, with published Builder instructions, locked requirements, current eligibility, evidence labels, and Builder-safe history.
- Pending and completed cycles render read-only state; resubmission is disabled unless the current actor remains eligible and the exact current cycle is correction-required.
- Reviewer identity and `privateReviewerRationale` are absent from the Builder projection and rendered surface.
- The primary action uses the canonical same-record mutation and the route immediately replaces its stale search tuple with the returned N+1 cycle.
- The paired next-actor result is the canonical approval-required notification/outbox flow already owned by Phase 5.

## Interface review

- `better-interface` first run: reviewed the supported route, instructions-first hierarchy, correction/pending/completed states, action priority, and shared-sheet composition; no remaining actionable source finding.
- `make-interfaces-feel-better` second run: reviewed copy, control labels, numeric/date treatment, spacing, responsive wrapping, and motion restraint; no one-off surface system or decorative motion was introduced.
- `impeccable harden` third run: reviewed missing values, long instructions/evidence labels, duplicate evidence references, pending mutation, ineligible actor, stale tuple, and mutation error; values wrap, IDs are deduplicated, and actions fail closed.
- `impeccable polish` fourth run: reviewed final hierarchy, Builder-safe language, status badges, icon semantics, focusable controls, and live error text; no internal implementation notes appear in the UI.
- Detector: `node /Users/connor/.agents/skills/impeccable/scripts/detect.mjs --json src/features/lender-portal/BuilderMilestoneRevisionReview.tsx src/features/lender-portal/LenderNotificationReviewSurface.tsx src/features/backoffice-build-detail/MilestoneDetailSheet.tsx 'src/routes/builder/proposals/$proposalId/index.tsx'` returned `[]`.

## Verification

- Focused tests: `bun run test --run src/features/backoffice-build-detail/MilestoneDetailSheet.test.tsx src/features/lender-portal/LenderNotificationReviewSurface.test.tsx 'src/routes/builder/proposals/-proposal.$proposalId.test.ts' src/routes/lender/-notification-review-routes.test.ts convex/lender_portal_phase5.test.ts` — 5 files, 56 tests passed.
- Typecheck: `bun run typecheck` passed, including Convex TypeScript and Vite client/server typecheck builds.
- Production build: `bun run build` passed; the repository's Convex deployment-registration check was skipped outside Vercel.
- Source detector and diff hygiene: Impeccable detector returned no findings; `git diff --check` passed.
- Browser/visual evidence: not captured in this turn.
- Exact release commit: unavailable; work is in a shared dirty checkout and no commit was authorized.
- Rollback: revert the production route, adapter, shared-sheet seam, production review component, and their tests together. The canonical backend command predates this promotion and is not a new parallel owner.
- Known limitations: no authenticated browser, deployed-SHA, 200% zoom, screen-reader, notification-provider, or release-owner verification. Completion/evidence values are edited through the canonical Build workspace rather than duplicated inline in the correction sheet. The coordinator's GAP-06 provenance waiver for pre-existing user-owned `src/routes/lender.prototype.tsx` hunks remains in effect; GAP-12 did not edit that file.
- Final status: Wired.
- Sign-offs: product: selected/locked contract; domain-auth: implementation evidence complete, independent review pending; design-accessibility: source/test review complete, browser evidence pending; release: pending.
