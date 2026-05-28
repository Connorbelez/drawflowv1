# Mobile Responsiveness and Accessibility Audit

Date: 2026-05-31
Branch audited: `add-live-collaboration-to-timeline-prod`
Route inventory: 58 TanStack routes parsed from `src/routes`

## Scope

This audit covers every current routed screen in the application and the shared production/demo surfaces those routes render. It focuses on:

- Mobile-first layout behavior at phone and tablet widths.
- Accessibility semantics, focusability, keyboard access, labels, and chart alternatives.
- Product fit against DrawFlow's operator-grade interface rules in `PRODUCT.md` and `DESIGN.md`.

This is a source and generated-HTML artifact audit. It does not replace an authenticated browser screenshot matrix across every route, because many production routes depend on WorkOS organization state and Convex data. The remediation plan below includes that matrix as a required follow-up verification pass after fixes land.

## Method

- Parsed route declarations with `createFileRoute(...)`; current count is 58 routes.
- Ran `bun run ui:html:audit`; result: 78 HTML snippets audited, screenshots written to `tmp/ui-html-visual-audit/screenshots`, report written to `tmp/ui-html-visual-audit/report.md`.
- Scanned for mobile risk patterns: `overflow-x-auto`, fixed `min-w-*`, table-only layouts, custom `role="button"`, custom tabs, chart-heavy surfaces, and placeholder route scaffolds.
- Reviewed high-risk screens directly: backoffice home, active build detail, proposal review, builder dashboard/list, builder roster, user management, settings, timeline workspace, setup flow, and site visit capture.

## Severity Key

| Priority | Meaning |
| --- | --- |
| P0 | Route is scaffolded or not production-usable. It needs implementation or removal from production nav. |
| P1 | Core workflow is not mobile-first. Phone users can hit horizontal-scroll desktop UI or inaccessible dense controls. |
| P2 | Screen is usable but needs accessibility, touch ergonomics, or visual-system hardening. |
| P3 | Low-risk route. Verify in screenshot matrix and keep monitored. |
| N/A | Server redirect or non-visual route. |

## Executive Summary

The application has strong mobile foundations in the app shell, the new mobile timeline workspace, and the site visit capture route. The biggest remaining issues are not styling polish. They are structural: production tables and kanban boards still render as desktop surfaces inside horizontal scroll containers, and several backoffice routes are still placeholders.

Immediate blockers:

- P0 placeholders: `/backoffice/draws`, `/backoffice/site-visits`, `/backoffice/contractors`, `/backoffice/builders/builderId`, `/backoffice/contractors/contractorId`.
- P1 production surfaces: `/backoffice/`, `/backoffice/builders/`, `/backoffice/builds/$buildId/`, `/backoffice/proposals/$planId`, `/backoffice/settings/`, `/backoffice/user-management`, `/builder/`, `/builder/proposals/`, and timeline/setup routes.
- P2 accessibility hardening: chart alternatives, keyboard behavior for custom tabs, clickable table-row semantics, and native file/camera capture controls.

Positive findings:

- `Header` includes a proper mobile sheet navigation with named trigger and mobile nav landmark (`src/components/Header.tsx:123-191`).
- The active build detail header wraps and collapses cleanly, and it includes a mobile event digest (`src/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx:435-521`).
- `MobileTimelineWorkspace` has a dedicated phone day dial, selected-day browsing, insert menu, sticky card rail, and tested mobile sheets (`src/features/timeline-workspace/MobileTimelineWorkspace.tsx:762-1360`).
- The tokenized site visit route is genuinely mobile-first in layout, with a bottom nav and responsive evidence grid (`src/features/build-workspace-demo/SiteVisitTokenRoute.tsx:957-1045`).
- Existing generated HTML audit passes on 78 snippets.

## Systemic Findings

### 1. Horizontal-scroll tables and kanbans are the main mobile risk

Several production workflows render full desktop tables or multi-column boards on phone screens. Horizontal scroll is acceptable for secondary data inspection, but it should not be the only way to complete core work.

Evidence:

- Backoffice active builds renders a table directly under `CardContent` with no phone card/list alternative (`src/routes/backoffice/index.tsx:713-740`).
- Backoffice milestone and proposal kanbans use `overflow-x-auto` plus `min-w-4xl` (`src/routes/backoffice/index.tsx:977-980`, `src/routes/backoffice/index.tsx:1141-1145`).
- Active build draws use a `min-w-[760px]` table (`src/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx:759-760`).
- Active build milestone kanban uses `min-w-[62rem]` (`src/features/backoffice-build-detail/MilestoneKanban.tsx:145-146`).
- Builder dashboard proposal/live build lists use table-only rendering (`src/features/builder-dashboard/BuilderTimelineDashboard.tsx:363-423`).
- Builder roster and user management are table-first with horizontal scroll (`src/routes/backoffice/builders/-builder-roster-surface.tsx:326-407`, `src/routes/backoffice/-user-management-surface.tsx:709-745`).
- Settings scenario rows use a `min-w-[840px]` table (`src/routes/backoffice/settings/index.tsx:1282-1284`).

Required pattern:

- Keep desktop tables at `md` or `lg`.
- Add mobile `Card` or `FramePanel` list views below that breakpoint.
- Preserve bulk actions through an explicit mobile selection mode.
- Use native buttons/links for primary row actions, not click-only table rows.

### 2. Placeholder routes are visible production debt

Routes that render `Draws`, `Site Visits`, `Contractors`, or scaffold text are not accessibility failures in isolation, but they are production screen failures. A screen reader and a phone user both receive a dead end.

Evidence:

- `src/routes/backoffice/draws/route.tsx:13-14`
- `src/routes/backoffice/site-visits/route.tsx:13-14`
- `src/routes/backoffice/contractors/route.tsx:13-14`
- `src/routes/backoffice/builders/builderId.tsx:7-8`
- `src/routes/backoffice/contractors/contractorId.tsx:7-8`

Required pattern:

- Implement real queue/list/detail screens, or remove the nav entry until the route exists.
- Use production empty states with the correct domain object and next action.

### 3. Chart surfaces need accessible non-visual equivalents

The timeline charts and construction roadmap are central to DrawFlow. They are visually strong, and the mobile timeline now has a touch-native alternate interaction model. Still, chart-heavy routes need explicit textual summaries, keyboard hotspot access, and data-table fallbacks for screen reader users.

Evidence:

- Backoffice proposal review renders cashflow, curved timeline, and draw availability charts in the timeline tab (`src/routes/backoffice/proposals.$planId.tsx:571-657`).
- Production/shared timeline workspace renders chart sections plus mobile day dial (`src/features/timeline-workspace/TimelineWorkspace.tsx:3672-3746`).
- Settings uses a cashflow chart preview without a non-visual summary table (`src/routes/backoffice/settings/index.tsx:1522-1553`).

Required pattern:

- Add a compact "Key days" summary for cash shortfalls, draw releases, milestone starts/ends, and minimum cash warnings.
- Make chart hotspots reachable by keyboard or mirrored in a list.
- Keep `accessibilityLayer` enabled where Recharts supports it, but do not treat it as the full alternative.

### 4. Custom tabs and clickable rows need keyboard semantics

Some tablists use `role="tablist"` and `aria-selected`, but do not implement full keyboard arrow/home/end navigation. Some tables use click handlers on `TableRow`, which is fast on desktop but weak for keyboard and touch.

Evidence:

- Proposal review tabs have roles but need keyboard behavior verification (`src/routes/backoffice/proposals.$planId.tsx:547-570`).
- Settings workspace tabs are custom buttons without `role="tablist"` semantics (`src/routes/backoffice/settings/index.tsx:678-694`).
- Builder roster rows open detail on row click (`src/routes/backoffice/builders/-builder-roster-surface.tsx:369-402`).
- User management rows open detail on row click, with a nested manage button (`src/routes/backoffice/-user-management-surface.tsx:767-790`).

Required pattern:

- Prefer existing tab primitives where possible.
- If custom tabs remain, add correct tab roles, `aria-controls`, `tabIndex`, and arrow/home/end handling.
- Convert row-level actions to explicit primary buttons/links on mobile and keyboard-visible row triggers on desktop.

### 5. The timeline setup flow still has a desktop table at its core

The setup flow has mobile CSS and several responsive fixes, but the blueprint table remains `min-width: 1040px`. This is not mobile-first for milestone budget setup.

Evidence:

- `.timeline-blueprint-table { min-width: 1040px; }` (`src/features/timeline-workspace/-timeline-setup-flow.css:936-938`).
- The small-screen media query adjusts panels and forms, but does not replace the table with a card/list editor (`src/features/timeline-workspace/-timeline-setup-flow.css:2020-2095`).

Required pattern:

- Below tablet width, use a milestone card editor with expandable submilestones and inline totals.
- Keep the table for desktop planning where density is useful.

### 6. One design-system violation should be cleaned up during mobile work

The active build kanban milestone card uses a 4px colored left border. `DESIGN.md` bans side-stripe accent borders greater than 1px.

Evidence:

- `border-l-4` on milestone kanban cards (`src/features/backoffice-build-detail/MilestoneKanban.tsx:201-205`).

Required pattern:

- Replace with full border tone, icon badge, status chip, or background tint.

## Full Route Audit

| Route | Primary screen | Priority | Status and required work |
| --- | --- | --- | --- |
| `/` | Marketing home | P2 | Responsive tables/sections exist through `lbp-table-scroll`; verify 320/390 widths, skip link/focus order, and table alternatives for marketing comparison content. |
| `/about` | About page | P3 | Low-risk content route. Verify text measure, headings, and mobile nav in screenshot matrix. |
| `/api/auth/sign-in` | WorkOS sign-in redirect | N/A | Server redirect only. Confirm failed redirect fallback is reachable from visual routes. |
| `/api/auth/sign-up` | WorkOS sign-up redirect | N/A | Server redirect only. Confirm failed redirect fallback is reachable from visual routes. |
| `/backoffice` | Backoffice shell route | P2 | Shell needs mobile nav, skip-to-content, focus order, and sidebar collapse verification across authenticated states. |
| `/backoffice/` | Backoffice dashboard | P1 | Active builds table and milestone/proposal kanbans need mobile card/list and lane-filter alternatives. Current kanbans rely on `min-w-4xl`. |
| `/backoffice/builders` | Builder roster shell | P2 | Shell is acceptable if child route is fixed. Verify breadcrumbs/sidebar behavior on small screens. |
| `/backoffice/builders/` | Builder roster | P1 | Table-only roster, row-click detail, fixed-width filters, and horizontal stage filter need mobile card rows and explicit action buttons. |
| `/backoffice/builders/builderId` | Builder detail scaffold | P0 | Scaffold route renders placeholder text and uses literal `builderId`, not a dynamic segment. Implement or remove. |
| `/backoffice/builds` | Build detail shell | P2 | Shell route only. Add index/empty state if users can navigate here from breadcrumbs. |
| `/backoffice/builds/$buildId` | Active build detail shell | P2 | Shell is usable if child route is fixed. Verify auth/loading/error states on mobile. |
| `/backoffice/builds/$buildId/` | Active build detail | P1 | Header is responsive and mobile digest exists, but draws table and milestone kanban still require mobile-first card/list flows. |
| `/backoffice/contractors` | Contractors route | P0 | Placeholder route renders only `Contractors`. Needs real contractor queue/list or removal from production nav. |
| `/backoffice/contractors/contractorId` | Contractor detail scaffold | P0 | Scaffold route renders placeholder text and uses literal `contractorId`, not a dynamic segment. Implement or remove. |
| `/backoffice/draws` | Draws route | P0 | Placeholder route renders only `Draws`. Needs draw queue/review/release screen or removal from production nav. |
| `/backoffice/onboard-builder` | Broker builder onboarding | P2 | Needs viewport verification for the invite/provisioning workflow, form labels, validation copy, and mobile keyboard behavior. |
| `/backoffice/proposals` | Proposal shell | P2 | Shell route only. Child list/detail routes carry the main risk. Verify empty/loading states. |
| `/backoffice/proposals/` | Backoffice proposal list | P1 | Pipeline/kanban/list behaviors need mobile lane filter and card rows. Ensure "Draft new" and filters stay reachable at 320px. |
| `/backoffice/proposals/$planId` | Proposal review workspace | P1 | Uses charts, curved timeline, and tables. Needs mobile chart summaries, keyboard hotspot alternatives, and mobile adjustment cards. |
| `/backoffice/proposals/new` | Broker initiated proposal setup | P1 | Uses timeline setup flow. Blueprint table remains desktop-width; mobile milestone budget setup needs card editor. |
| `/backoffice/proposals/unassigned` | Unassigned broker drafts | P2 | Likely card/list-friendly. Verify empty state, long addresses, builder assignment action, and touch targets. |
| `/backoffice/settings` | Settings shell | P2 | Shell route only. Verify sidebar/breadcrumb behavior with settings child route. |
| `/backoffice/settings/` | Timeline demo settings migrated to prod | P1 | Complex tabbed settings workspace uses custom tabs, desktop grid, scenario table, and chart. Needs mobile rail/tab behavior and accessible chart summary. |
| `/backoffice/site-visits` | Site visits route | P0 | Placeholder route renders only `Site Visits`. Needs real site visit queue or removal from production nav. |
| `/backoffice/user-management` | WorkOS user management | P1 | Table-only directory and row-click detail need mobile card list, explicit row actions, and keyboard semantics. |
| `/builder` | Builder shell | P2 | Shell needs mobile nav/focus verification. Child dashboard carries table risk. |
| `/builder/` | Builder dashboard | P1 | Builder live/proposal tables use table-only rendering. Add mobile cards and route production "Start new proposal" away from demo route. |
| `/builder/builds/$buildId/` | Builder active build workspace | P1 | Renders live timeline workspace. Mobile day dial is strong, but charts and detail drawers still need accessible summaries and screenshot verification. |
| `/builder/demo` | Builder demo shell | P3 | Demo-only shell. Verify mobile nav and no production data coupling. |
| `/builder/demo/dashboard` | Builder demo dashboard shell | P3 | Demo-only shell. Low production risk, but still should pass mobile smoke. |
| `/builder/demo/dashboard/` | Builder demo dashboard | P2 | Uses builder dashboard tables and demo links. Needs same mobile table/card fallback if kept as a public demo. |
| `/builder/demo/dashboard/builds` | Demo builds shell | P3 | Shell route. Verify child route behavior. |
| `/builder/demo/dashboard/builds/` | Demo build list | P2 | Likely shares table/list patterns. Add card fallback or verify component reuse after builder dashboard fixes. |
| `/builder/demo/dashboard/builds/$buildId` | Demo active build detail | P2 | Demo build detail should inherit active build/timeline mobile fixes. Verify no horizontal-only core actions. |
| `/builder/demo/dashboard/proposals` | Demo proposals shell | P3 | Shell route. Verify child route behavior. |
| `/builder/demo/dashboard/proposals/` | Demo proposal list | P2 | Uses builder proposal list patterns. Needs mobile card fallback if public demo remains. |
| `/builder/proposals` | Builder proposals shell | P2 | Shell route. Child list/detail routes carry the main risk. |
| `/builder/proposals/` | Builder proposal list | P1 | Shares builder timeline dashboard table. Needs mobile proposal cards, status filters, and explicit open actions. |
| `/builder/proposals/$proposalId` | Builder proposal shell | P2 | Shell route. Verify loading/not-found/access denied states on mobile. |
| `/builder/proposals/$proposalId/` | Builder proposal detail | P1 | Timeline/proposal workspace surface. Needs same chart summaries, mobile detail flows, and viewport verification as proposal review. |
| `/builder/proposals/$proposalId/roadmap` | Builder proposal roadmap | P1 | Timeline workspace route. Mobile day dial exists, but setup/detail/charts need full screenshot and accessibility pass. |
| `/builder/proposals/new` | Builder new proposal setup | P1 | Uses setup flow. Needs mobile milestone-budget card editor instead of desktop blueprint table. |
| `/callback` | WorkOS callback | N/A | Server callback only. Confirm visible error redirect route is accessible. |
| `/demo` | Demo shell | P3 | Demo index/shell. Verify mobile nav and no broken links. |
| `/demo/convex` | Convex todo demo | P3 | Demo-only. Verify simple form labels, button labels, and narrow viewport wrapping. |
| `/demo/drawflow/` | DrawFlow demo index | P2 | Demo landing/workspace entry. Verify mobile layout and links after production migration. |
| `/demo/drawflow/active` | DrawFlow active demo | P2 | Demo active workspace. Should inherit active build workspace mobile fixes; verify chart summaries and touch actions. |
| `/demo/drawflow/admin-build-dashboard` | Demo admin dashboard | P2 | Dashboard/kanban demo. Needs mobile smoke for cards, columns, and detail sheets. |
| `/demo/drawflow/builder-dashboard` | Demo builder dashboard | P2 | Uses builder dashboard patterns. Needs card fallback if kept as a polished demo. |
| `/demo/drawflow/new-proposal` | Demo new proposal | P1 | Uses setup flow. Same desktop blueprint table mobile issue as production setup. |
| `/demo/drawflow/proposal` | Demo proposal review | P1 | Chart/timeline-heavy proposal review. Needs chart summaries and mobile adjustment alternatives. |
| `/demo/evil-charts/` | Evil charts demo | P2 | Chart demo. Needs keyboard/summary alternatives and mobile viewport verification. |
| `/demo/tanstack-query` | TanStack query demo | P3 | Simple demo route. Verify forms/buttons and loading state. |
| `/demo/timeline/` | Timeline demo setup | P1 | Uses setup flow and timeline workspace. Mobile setup table remains the biggest issue. |
| `/demo/timeline/$timelineId` | Timeline demo detail | P1 | Timeline workspace detail. Mobile day dial exists; still needs chart summaries, drawer focus checks, and screenshot verification. |
| `/demo/workos` | WorkOS demo | P3 | Simple auth demo. Verify button labels, focus order, and narrow viewport wrapping. |
| `/newsitevisit/$buildId/$siteVisitToken` | Tokenized site visit capture | P2 | Strong mobile-first layout. Fix capture buttons to use native button/label semantics instead of `div role="button"` and `label role="button"`. |
| `/protected-access` | Access denied / onboarding gate | P2 | Compact and readable. Add `flex-wrap` to action row for 320px, verify heading order and focus return after auth redirects. |

## Shared Surface Audit

| Surface | Priority | Finding | Required work |
| --- | --- | --- | --- |
| App/header navigation | P2 | Mobile sheet is present and named. Desktop demo hover menu should be keyboard-verified. | Add screenshot/focus matrix for 320, 390, 768, and desktop widths. |
| Backoffice dashboard | P1 | Active build table and kanbans are desktop-first. | Add mobile list/cards and lane segmented controls. |
| Active build detail | P1 | Header and event digest are good. Draw table and kanban are horizontal-scroll desktop controls. | Add mobile draw cards and milestone review queue view. |
| Timeline workspace | P1 | Phone day dial, insert menu, and mobile sheets are strong. Charts still need non-visual summaries. | Add chart summary lists and keyboard hotspot mirrors. |
| Timeline setup flow | P1 | Responsive shell improved, but milestone budget table is still `1040px` wide. | Add mobile milestone/submilestone card editor. |
| Proposal review | P1 | Charts and tables are dense and desktop-first in adjustment tabs. | Add mobile review summary, card editors, and keyboard chart access. |
| Settings workspace | P1 | Complex tabs/scenario editor are production-useful but not mobile-first. | Use tab primitive or full tab semantics; add mobile scenario row cards. |
| Builder dashboard/list | P1 | Proposal/live build lists are table-only. | Add mobile plan cards with explicit open actions. |
| Builder roster and user management | P1 | Tables and row-click semantics dominate. | Add mobile person/builder cards, explicit actions, bulk selection mode. |
| Site visit capture | P2 | Layout is mobile-first and evidence grid is responsive. | Replace custom role buttons with native controls and verify focus on upload/removal. |

## Remediation Plan

1. Replace P0 placeholder routes or remove them from production navigation until implemented.
2. Create a reusable responsive data-list pattern: desktop `Table` at `md+`, mobile `Card` or `FramePanel` list below `md`, with explicit row actions and bulk selection support.
3. Replace mobile kanban horizontal boards with lane segmented controls and current-lane card lists.
4. Add mobile card editors for timeline setup and settings scenario rows.
5. Add chart accessibility summaries and keyboard hotspot mirrors for timeline, draw availability, cashflow, and chart demo routes.
6. Normalize tab semantics using existing primitives or a shared tab helper with keyboard navigation.
7. Remove the active build kanban `border-l-4` side stripe while doing the mobile kanban refactor.
8. Run an authenticated Playwright screenshot matrix for core production routes at 320, 390, 768, 1024, and 1440 widths after the structural fixes.

## Verification Commands Run

```sh
node - <<'NODE'
// Parsed createFileRoute(...) declarations under src/routes.
NODE
```

Result: 58 routes.

```sh
bun run ui:html:audit
```

Result: `Audited 78 HTML snippets.`

## Completion Criteria for Follow-up Fix Work

This report completes the audit deliverable. The application itself should not be considered mobile-first complete until:

- All P0 routes are implemented or removed from production nav.
- Every P1 route has a non-horizontal-scroll mobile workflow for primary tasks.
- Chart-heavy surfaces expose textual summaries and keyboard alternatives.
- Custom tabs and row actions pass keyboard and screen reader checks.
- The authenticated screenshot matrix passes without clipped text, inaccessible controls, or incoherent overlap.
