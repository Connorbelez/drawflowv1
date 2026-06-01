# Timeline Workspace — Mobile Redesign Spec

**Product:** DrawFlow
**Surfaces affected:** every route that renders `TimelineWorkspace` — `/backoffice/proposals/$planId`, `/backoffice/builds/$buildId`, the builder-side proposal/build workspace, and the demo timeline.
**Shared component:** `src/features/timeline-workspace/TimelineWorkspace.tsx` (+ adapters `ActiveBuildTimelineWorkspace.tsx`, `ActiveBuildGanttWorkspace.tsx`).
**Document type:** Mobile redesign spec
**Status:** Design input draft (pre-implementation)
**Last updated:** May 29, 2026
**Chosen direction:** Hybrid **A+C** — Milestone Feed by default, tap into per-milestone Focus Mode. Full capability parity via explicit form sheets (no drag, no hover, no context menus on touch).

---

## 1. Problem

The timeline workspace is a **spatial financial instrument**: a horizontal day-axis where X-position encodes time, draw markers sit at exact days, milestone cards float above their schedule position, and the cashflow / draw-availability charts share that axis. On desktop the spatial encoding *is* the value — you literally see a capital-shortfall line dip beneath a draw marker.

On phones today (`useMediaQuery("max-sm")`, `getTimelineResponsiveSizing` → `pixelsPerUnit: 5.35`) we kept the spatial encoding but stripped what makes it operable:

| Desktop affordance | Current phone behavior | Why it fails on touch |
|---|---|---|
| Horizontal pan across ~200 days | Same axis, shrunk → ~1000px+ side-scroll | Competes with vertical page scroll; no overview; users lose their place |
| Hover labels (shortfall amount, draw copy, metrics) | Suppressed (`isPhoneLayout ? undefined`) | Touch has no hover → **the information is gone, not relocated** |
| Context-menu delete (`TimelineDeleteContextMenu`, right-click / long-press) | Inherited unchanged | Long-press fights scroll; discoverability ≈ 0 |
| Drag draw markers (`DrawTimelineMarker`) & milestone dates | Inherited unchanged | 14px bar, fat-finger; drag fights the scroll container |
| 320px side context panel | Replaced by bottom `Drawer` (`SelectedDrawMobileDrawer`) | This part is already correct — keep and extend it |

**Root cause:** on mobile, *spatial position is being used as the primary interaction model.* It must be demoted to a **read-only overview**, and real work must move to a **linear, list-driven, sheet-per-action** flow.

**Parity principle:** Feature parity ≠ pixel parity. Every desktop capability must be **reachable** on mobile, but through touch-native patterns (lists, sheets, explicit forms), never a shrunken chart or a hover/long-press.

---

## 2. Capability parity checklist (the bar)

Derived from the workspace adapter callbacks (`ActiveBuildGanttWorkspace` omit-list and `SelectedContextPanel` props). Every item below must have a touch-native path on mobile.

**Read**
- Milestone schedule, day ranges, status, dependencies, dependency-blocker warnings.
- Draw markers and states: `planned` / `requested` / `rejected` / `happened` (`getDrawTimelineMarkerState`).
- Cashflow curve, draw-availability curve, financial overview, capital-shortfall warnings (`buildCashShortfallPoints`).

**Builder writes**
- Submit completion claim + evidence upload (`CompletionClaimPanel`, `EvidencePackagePanel`, `addEvidenceFiles`, `onCompleteMilestone`).
- Request draw (`DrawRequestPanel`, `onSubmitDrawRequest`).
- Update progress, update forecast dates (`updateProgress`, `updateForecastDates`).
- Request timeline modification (`proposalTimelineModificationRequests`).

**Broker / lender writes**
- Review completion: approve / request revision (`onReviewMilestoneCompletion`, `LenderMilestoneReviewPanel`).
- Review draw request: approve / reject (`onReviewDrawRequest`, `LenderDrawReviewPanel`).
- Request / create / record site visit (`onRequestMilestoneSiteVisit`, `onCreateMilestoneSiteVisit`, `onRecordMilestoneSiteVisit`).
- Review modification requests (`onReviewModificationRequest`, `TimelineModificationRequestsPanel`).

**Structural (desktop drag / context-menu today)**
- Move milestone dates (`moveMilestoneDates`, `batchMoveMilestoneDates`, `updateForecastDates`).
- Edit / reposition draw timing & amount (`onUpdatePlannedDraw`, `DrawTimelineMarker` drag, `CapitalSpikeTimelineMarker`).
- Delete milestone / draw (`TimelineDeleteContextMenu`).
- Reorder milestone (`reorderMilestone`, `reorderMilestoneAbsolute`).
- Dependencies: add / remove / set hardness (`addDependency`, `removeDependency`, `setDependencyHardness`).
- Draw groups: merge / split / move milestone between groups (`mergeDrawGroups`, `splitDrawGroup`, `moveMilestoneToDrawGroup`).
- Add milestone / add capital spike / lock drag (`addMilestone`, capital-spike insert, `setMilestoneDragLocked`).

> The first three buckets are ~90% of daily mobile use. The structural bucket gets **full parity via explicit form sheets** (per your decision): every drag/context-menu action becomes a labeled control reachable from a milestone's or draw's `⋯` menu.

---

## 3. The mobile model: Feed + Focus (Hybrid A+C)

Two stacked levels of navigation, both vertical-scroll-native, with the timeline reduced to a glanceable minimap.

### 3.1 Level 0 — Sticky Minimap (read-only spatial overview)

A compact, **non-interactive-for-editing** strip pinned to the top of the workspace. It preserves the "shape" of the plan without making position an edit target.

- Renders the full day-axis at a fit-to-width scale (no horizontal scroll): current-day marker, milestone tick density, draw dots colored by state, and a thin capital-shortfall sparkline beneath.
- **Only gesture: tap-to-jump.** Tapping a region scrolls the feed to the nearest milestone; tapping a draw dot opens that draw's action sheet. No drag, no pan-to-act.
- Collapses to a 1-line progress rail when the user scrolls the feed down (frees vertical space); expands on scroll-to-top or a tap.
- Reuses the existing chart/axis renderers in read-only mode; this is the one place spatial encoding survives on mobile.

### 3.2 Level 1 — Milestone Feed (default surface)

A vertical scroll of **milestone rows in schedule order** — the primary surface. Each row is the existing `MilestoneCard` collapsed-state content, re-flowed full-width, with **every former hover-only datum rendered inline as text**:

- Title, day range (planned + actual/forecast), status chip (`StatusIndicator` tone), budget, % progress.
- **Evidence state** chip, **draw state** chip (planned/requested/rejected/released), **dependency-blocker** warning line ("Blocked by Foundation").
- A single **role-aware primary action button** on the row:
  - builder: "Submit completion" / "Request draw" / "Upload evidence" depending on state.
  - broker: "Review claim" / "Review draw" / "Request site visit" depending on state.
- A `⋯` **menu** (real menu component, not context-menu) for secondary + structural + destructive actions.

Tapping the **body** of a row → opens **Focus Mode** for that milestone. Tapping the **primary button** → opens the relevant **action sheet** directly (skip Focus when the intent is one specific action).

Above the feed, two **collapsible sections** (collapsed by default on phone to keep the feed dominant):
- **Financials** — cashflow + draw-availability charts stacked full-width, **read-only**, with *tap-a-day* to inspect the values that used to be hover labels (replaces `DrawAvailabilityDeltaReadout` / shortfall hover). Plus the `FinancialOverviewCard` and a shortfall list (each shortfall a tappable row that jumps the minimap + feed to that day).
- **Requests & reviews** — pending modification requests and items awaiting the viewer's review, as a worklist (so a broker isn't hunting the feed for what needs action).

### 3.3 Level 2 — Focus Mode (one milestone, swipe to advance)

Full-height view for a single milestone — turns the side-scroll *into intentional paged navigation* instead of fighting it.

- Thin progress rail at top shows position in the sequence ("4 / 11") + prev/next; **horizontal swipe** moves between adjacent milestones (paged, snapping — not free pan).
- One screen contains everything for that milestone: schedule (with edit affordance), draws tied to it (as rows), evidence package, dependencies, and the full role-aware action set — i.e. the contents of `SelectedContextPanel` / `LenderMilestoneReviewPanel` / `MilestoneOperationsPanel` re-flowed vertically.
- All writes open as **bottom sheets** stacked over Focus Mode (reuse `SelectedDrawMobileDrawer` infra). Focus Mode is the context; sheets are the actions.

### 3.4 Action sheets (every write, role-aware)

All writes are **bottom sheets**, reusing the existing `Drawer`/`DrawerPanel` + the panel components already built. No drag, no hover, no context-menu anywhere in the touch path.

| Action | Sheet contents | Reuses |
|---|---|---|
| Submit completion | claim form + evidence uploader | `CompletionClaimPanel`, `EvidencePackagePanel` |
| Request draw | amount (validated to limit), note | `DrawRequestPanel`, `calculateDrawRequestLimit` |
| Review completion | evidence review + approve / request-revision + reason | `LenderMilestoneReviewPanel` |
| Review draw | approve / reject + note | `LenderDrawReviewPanel` |
| Site visit | request / create token / record | site-visit handlers in `SelectedContextPanel` |
| **Edit milestone dates** | start-day / end-day number inputs (replaces drag) | `InlineEditableMetric`, `moveMilestoneDates` |
| **Edit draw** | timing-day + amount inputs (replaces marker drag) | `onUpdatePlannedDraw` |
| **Delete** milestone/draw | confirm + reason (replaces context-menu) | the `onDelete` from `TimelineDeleteContextMenu`, rehosted in a sheet |
| **Reorder** | move up/down stepper or position input | `reorderMilestoneAbsolute` |
| **Dependencies** | add/remove from a milestone picker + hardness toggle | `addDependency`/`removeDependency`/`setDependencyHardness` |
| **Draw groups** | merge-with / split / move-to picker | `mergeDrawGroups`/`splitDrawGroup`/`moveMilestoneToDrawGroup` |

Material decisions (approve, reject, release, delete, override) **collect the reason inside the sheet** before commit, consistent with the product's audit rule.

---

## 4. Interaction replacements (explicit mapping)

| Desktop interaction | Mobile replacement |
|---|---|
| Hover for shortfall / draw / metric labels | Inline text on the feed row; tap-a-day inspector on charts |
| Right-click / long-press context menu | `⋯` menu on the row / in Focus Mode → opens labeled sheet |
| Drag draw marker to reschedule | "Edit draw" sheet with timing-day input |
| Drag milestone to move dates | "Edit dates" sheet with start/end number inputs |
| Drag to reorder | "Reorder" stepper / position input in `⋯` |
| Horizontal pan to navigate time | Tap minimap to jump; swipe in Focus Mode to page milestones |
| 320px side panel | Bottom sheet (already in place) |
| Drag-lock toggle | Irrelevant on touch (no drag); omitted from mobile UI |

---

## 5. Responsive boundaries & behavior

- **`max-sm` (phone):** Feed + Focus + minimap, as above. No timeline chart as an interaction surface.
- **`max-md` (small tablet):** Feed default, but minimap may be slightly taller; side sheet may dock. Decision: treat `max-md` as "feed-first" too, since the desktop drag model still doesn't suit touch — but allow the read-only timeline to be expandable.
- **`min-lg` (desktop):** unchanged — full spatial timeline, drag, hover, side panel.
- The breakpoint hooks already exist (`isCompactLayout`/`isMobileDrawerLayout`/`isPhoneLayout`); the redesign branches on these, it does not add a new detection mechanism.

---

## 6. Reuse & build plan (no new domain, no parallel flows)

**Reuse wholesale:** `SelectedDrawMobileDrawer`, `SelectedContextPanel`, `CompletionClaimPanel`, `EvidencePackagePanel`, `EvidenceAssetCard`, `DrawRequestPanel`, `LenderMilestoneReviewPanel`, `LenderDrawReviewPanel`, `TimelineModificationRequestsPanel`, `FinancialOverviewCard`, `MilestoneCard` (collapsed content), `InlineEditableMetric`, the chart components (read-only mode), and all existing mutation callbacks. **No new Convex functions** — this is a presentation-layer redesign over the existing workspace state and callbacks.

**Net-new (presentation only):**
1. `TimelineMinimap` — read-only fit-to-width axis + draw dots + shortfall sparkline + tap-to-jump.
2. `MilestoneFeed` — vertical list of re-flowed `MilestoneCard` rows with inline data + primary action + `⋯`.
3. `MilestoneFocusView` — paged single-milestone view (swipe to advance) hosting the existing panels vertically.
4. **Structural-edit sheets** for date / draw / delete / reorder / dependencies / draw-groups (forms wrapping existing callbacks).
5. A `mobileMode` branch in `TimelineWorkspace`'s render that, under `isPhoneLayout` (and `max-md` per §5), renders Minimap + Feed instead of the spatial timeline grid, while the desktop path is untouched.

**Extraction note:** the structural-edit callbacks currently reachable only via drag/context-menu must be surfaced through props the mobile sheets can call. Where a callback is buried in the desktop render closure, lift it to a stable handler so both desktop and the new sheets call the same function — no duplicated logic.

---

## 7. Acceptance criteria

1. On `max-sm`, no surface requires horizontal scrolling to *read or act*; the only horizontal gesture is intentional paged swipe in Focus Mode.
2. Every capability in §2 is reachable on phone via tap → list/sheet/form. Zero capabilities are desktop-only.
3. No hover-dependent information is lost — every former hover label is inline text or a tap-inspector value.
4. No context-menu and no drag in the touch path; structural edits go through labeled form sheets.
5. Material decisions collect a reason in-sheet and produce the same mutations/audit as desktop.
6. Desktop (`min-lg`) rendering and behavior are byte-for-byte unchanged.
7. Role-awareness preserved: builder vs. broker primary actions and review gates match desktop authority exactly.
8. Charts render read-only on mobile with a tap-a-day inspector; no chart drag/hover.

---

## 8. Test plan

- **Component:** Feed renders one row per milestone in schedule order; row shows correct status/evidence/draw/dependency state for each milestone state permutation; primary action label is role- and state-correct.
- **Parity:** each action sheet invokes the same callback as its desktop counterpart with equivalent payloads (assert on the handler, not the DOM chrome) — completion, draw request, both reviews, site visit, and each structural edit (dates, draw, delete, reorder, dependency, draw-group).
- **Navigation:** tap row → Focus Mode for that milestone; swipe advances to adjacent milestone; minimap tap jumps feed + minimap to the right day; draw-dot tap opens that draw's sheet.
- **Responsive:** `max-sm` renders Feed/minimap and never the spatial grid; `min-lg` renders the existing grid unchanged (snapshot/structure guard so desktop can't regress).
- **Charts:** tap-a-day inspector returns the same values the desktop hover label would show (reuse the interpolation helpers' outputs as the oracle).
- **Audit:** destructive/decision sheets require a reason before the commit handler fires.

---

## 9. Non-goals

1. Changing the desktop spatial timeline, drag model, or its visual design.
2. New Convex functions or schema changes.
3. Offline behavior beyond what the existing evidence-capture flow provides.
4. Native gestures beyond standard touch (paged swipe, tap, scroll); no pinch-zoom on the timeline.
5. Re-theming — industrial/Oxanium/chartreuse system stays; this is layout/interaction only.

---

## 10. Open questions for review

1. **`max-md` (tablet):** feed-first (this spec's default) vs. keep the spatial timeline but enlarge touch targets? I lean feed-first because drag is the core touch pain and a tablet still can't drag a 14px marker comfortably.
2. **Focus Mode swipe vs. prev/next only:** swipe is delightful but can conflict with sheet gestures; do we ship prev/next buttons first and add swipe second?
3. **Minimap permanence:** always-visible collapsing strip vs. a pull-down overview the user summons. Default in this spec is the collapsing strip.
