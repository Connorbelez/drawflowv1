# Authenticated Browser QA Report

<!-- markdownlint-disable MD013 -->

**Date:** 2026-07-22  
**Environment:** local production-backed development deployment at `http://localhost:3000`  
**Browser:** headed Chromium/Chrome through `agent-browser`  
**Viewports:** 1,280×900 and 390×844  
**Evidence:** `reports/core-workflow-ux-audit/evidence/authenticated-qa/`

## Accounts used

- **Builder:** `c.beleznay@humanfeedback.com` (`Connor Beleznay`), authenticated Builder workspace.
- **Lender Admin:** `connor.belez@gmail.com` (`Connor Beleznay`), authenticated Backoffice/Admin workspace.

Credentials were entered by the human in the headed browser and were not read, requested, logged, or stored by the agent.

## Result

Authenticated QA is complete for the available Builder and Lender Admin personas. The pass found nine concrete defects or incomplete paths; each was repaired and re-verified in Chromium and with automated regression coverage. No destructive production-style decision, invitation, cancellation, release, merge, or provisioning mutation was submitted.

This is not a claim that all 63 manifest persona segments were authenticated. No authenticated Contractor, Inspector, Builder Staff, Lender Operations, Platform Admin, or Technical Admin identity was supplied. Their contracts remain covered by deterministic fixtures, component tests, Convex tests, and the original browser audit, but not by this authenticated repeat.

## Builder coverage

### Entry and lists

- `/builder`
- `/builder/proposals`
- `/builder/proposals/new`
- Notifications inbox
- invalid Build recovery at `/builder/builds/not-a-real-build`

Verified real production-backed proposal states including draft, submitted, rejected, and approved rows; authenticated identity and organization context; typed invalid-Build recovery; and contained 390 px layouts.

### Submitted proposal

Proposal: `k576cjjvp3xqptqrp8s4yq9qtn87kqw6`

Exercised:

- Packet
- Timeline
- Gantt
- Milestones
- Calendar
- Contractors
- Review
- Draw schedule
- Materials
- Staff

Verified that submitted Builder proposals are read-only for material proposal mutations while reminder-only actions remain independently governed. Packet milestone edits, start-date edits, material create/edit/delete controls, contractor mutations, and persistence callbacks are not exposed after submission.

### Active Build

Build: `ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r`

Exercised:

- Details
- Milestones
- Contractors
- Materials
- Timeline
- Evidence
- Staff
- Calendar
- Gantt

Verified production data load, internal Kanban scrolling without document overflow, delayed Timeline hydration, retained location-unverified evidence, disabled unauthorized Staff owner mutations, Calendar population, and the active-Build Gantt.

## Lender Admin coverage

### Portfolio and proposal operations

- `/backoffice`
- `/backoffice/proposals`
- `/backoffice/proposals/unassigned`
- `/backoffice/proposals/new`
- `/backoffice/proposals/k576cjjvp3xqptqrp8s4yq9qtn87kqw6`

Verified production dashboard aggregates, proposal Kanban population, unassigned-draft queue, proposal setup flow, all proposal tabs, lender-only decision controls, missing-permit state, and decision-reason gating. Clicking **Request Changes** with a blank reason produced the intended audit-reason validation and did not mutate the proposal.

### Build and financial operations

- `/backoffice/builds`
- `/backoffice/builds/ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r`
- `/backoffice/draws`
- `/backoffice/site-visits`

Verified Build search/filter/table, all Build workspace tabs, milestone contractor assignment entry points, capital/term and Budget governance states, scheduled draw charts and filters, draw grouped/table view switching, site-visit grouped/table view switching, Build deep links, visit-detail sheet, copy-link action separation, and audited cancellation reason gating. The live tenant had zero requested draws, so an actual draw approve/reject dialog could not be opened from real data; server/component coverage remains the proof for that transition.

### Identity, onboarding, and contractor operations

- `/backoffice/builders`
- `/backoffice/onboard-builder`
- `/backoffice/onboard-contractor`
- `/backoffice/contractors`
- `/backoffice/contractors/onboarding`
- `/backoffice/contractors/zh73prs0e84c07rhx65w96m8ss87ytdm`
- `/backoffice/user-management`

Verified Builder filters and broker-assignment reason controls, non-destructive Builder onboarding through the review step, contractor roster and onboarding queue, real contractor profile loading, WorkOS account-link state, identity operations, merge gating, and the user invitation dialog with organization and role selection. Provisioning, invitation, deactivation, unlink, and merge submits were intentionally not executed.

### Technical administration

- `/backoffice/settings`
- `/backoffice/integrations`

Verified tenant-scoped proposal settings and the admin-only integration endpoint lifecycle surface. No external webhook endpoint was created.

## Defects found and fixed during authenticated QA

1. **Submitted Builder proposal mutations remained exposed.** Draft-only gating now covers packet, start date, milestones, submilestones, documents, materials, contractors, calendar domain edits, Gantt/timeline persistence, and submission.
2. **Milestone Kanban widened the document.** Wide columns now remain inside an explicit horizontal scroller at desktop and mobile widths.
3. **Long route breadcrumbs widened the mobile app header.** Header navigation now shrinks and clips independently from account actions.
4. **Proposal review cards and textarea/button intrinsic sizing widened the 390 px page.** Shared Card and Textarea primitives now have `min-w-0`; proposal decision actions stack at mobile width.
5. **Draw charts widened the mobile page.** Frame/chart tracks now shrink within the viewport and retain responsive chart width.
6. **Authenticated contractor detail crashed with `ReferenceError: Button is not defined`.** The missing Button import was restored and the real profile route re-verified.
7. **Site-visit rows rendered nested buttons and leaked the unsupported `nativeButton` prop.** The interactive row and copy action are sibling controls inside Card, and coss Link composition now uses only the documented `render` API.
8. **Draw and site-visit view toggles used the wrong scalar value contract.** Both now use Base UI's controlled array contract and switch correctly in browser and tests.
9. **`/backoffice/builders/builderId` exposed a TanStack placeholder.** The stale route now redirects to the canonical Builder roster.

## Responsive and console verification

At 390×844:

- Backoffice home: `clientWidth=390`, `scrollWidth=390`.
- Proposal review after repair: `clientWidth=390`, `scrollWidth=390`; decision buttons stay within 373 px.
- Build Milestones: document width remains 390 px; Kanban uses an internal 364/1,176 px scroller.
- Draws after repair: `clientWidth=390`, `scrollWidth=390`; chart containers shrink to 340 px.
- Site visits: `clientWidth=390`, `scrollWidth=390`.
- Contractor roster/profile and Builder onboarding review: `clientWidth=390`, `scrollWidth=390`.

After the site-visit and draw repairs, isolated console passes contained no React errors. The remaining console entry is a TanStack route code-splitting optimization warning. The long-lived AuthKit sessions eventually emitted `Failed to refresh tokens`; the Builder session redirected to sign-in and the Admin Convex client later returned Unauthorized after both personas' planned passes and post-fix evidence had already completed. Those late session-expiry results are retained as environment evidence rather than relabelled as product regressions.

## Automated regression proof

- `bun run test` — **151 files, 1,147 tests passed**.
- Targeted authenticated-QA regression set — **11 files, 124 tests passed**.
- `bun x convex codegen` — passed.
- `bun x tsc -p convex/tsconfig.json --noEmit` — passed.
- `bun run typecheck` — passed.
- `bun run build` — passed.
- `bun run verify:build-warnings` — passed.
- `bun run ui:html:audit` — passed: 78 interaction snippets.
- `bun run scripts/core-workflow-manifest.ts --check` — passed: 16 parents, 63 persona segments, 52 handoffs, 409 stable steps.

A supplementary root-wide `bun x tsc --noEmit` is not the repository's configured typecheck and currently reports **374 strict errors across 100 files** in legacy marketing/demo code and several production modules. The six workflow files targeted by the final diagnostic follow-up report zero errors under that check; the remaining debt is tracked as engineering-quality work, not as one of the 39 workflow-audit dispositions.

## Remaining evidence limits

1. `UX-WF-TEN-003-001` remains blocked on validated cross-brokerage transfer governance.
2. Contractor/Inspector/Operations/Platform Admin/Technical Admin personas were not available for an authenticated repeat.
3. The live organization had no requested draw, so no real draw decision was submitted.
4. Destructive or externally visible operations were inspected through their validation/review states but intentionally not committed.
