## Status chips: hover popover + click-to-open detail sheet tab

### Goal
The three status chips in the table-view Status column (`Contractor`, `Guidance`, `Materials` — rendered by `SummaryStatusChip`) should:
1. **Hover** → show a rich popover with the relevant details (attached contractors / materials / guidance). Currently they use a non-interactive `Tooltip`.
2. **Click/tap** → open the existing right-side detail `<Sheet>` and auto-select the matching tab (contractor → `contractors`, materials → `materials`, guidance → `field-guidance`).

### Files changed (all in `src/features/timeline-workspace/`)

**1. `-TimelineMilestoneWorksheetTable.tsx`**

- **Swap `Tooltip` → `HoverCard` in `SummaryStatusChip`** (lines ~2098-2128). `HoverCard` (Base UI `PreviewCard`) stays open on hover-enter so the user can read the rich content and move into it, and the chip remains a real `<button>` so click works naturally. Remove the now-unused `Tooltip`/`TooltipTrigger`/`TooltipContent` imports (they're used only by these chips).
  - Hover card content = the existing rich card (`heading` + `summary` + the existing `SummaryStatusContractorDetails` / `SummaryStatusGuidanceDetails` / `SummaryStatusMaterialDetails`). Reuse verbatim — no new content.
  - Add a small "Open in detail sheet ↗" affordance row at the bottom of the popover to telegraph the click action.

- **Thread a target tab through the sheet opener.**
  - Extend `TimelineDetailsSheetTarget` (line ~254) with an optional `tab?: TimelineDetailTab`.
  - Define and export `type TimelineDetailTab = "scope" | "submilestones" | "contractors" | "materials" | "field-guidance"`.
  - Extend `openDetailsSheet(rowKey, subMilestoneId?, tab?)` (line ~406) to pass `tab` into the target.
  - Map chip `kind` → tab (`contractor→"contractors"`, `materials→"materials"`, `guidance→"field-guidance"`) in `SummaryStatusSignals` and pass `onOpenDetails` down to `SummaryStatusChip` so the chip's `onClick` calls `onOpenDetails(row.key, subMilestone?.id, tabForKind)`.

- **Make the detail-sheet tabs controllable, scoped to the sheet only.**
  - Add `detailsSheetTab` state (initialized from `detailsSheetTarget?.tab`, falling back to the existing default), passed as `activeTab` to `SubMilestoneFocusedTabs` and `MilestoneExpandedTabs` **only when `placement === "sheet"`**. Inline expanded-row tabs (line ~1187) keep uncontrolled `defaultValue` behavior, so no regression to inline rows.
  - Convert `SubMilestoneFocusedTabs` (line ~3701) and `MilestoneExpandedTabs` (line ~3885) `<Tabs defaultValue=...>` → **controlled-or-uncontrolled hybrid**: when an `activeTab` prop is provided, use `value={activeTab}` + `onValueChange`; otherwise keep `defaultValue`. This keeps the existing default-tab behavior for all other entry points.
  - Tab-value guard: if the requested tab isn't available in the current `mode` (e.g. `contractors`/`materials` only exist when `mode === "setup"`), fall back to the default tab so the sheet still opens cleanly.

**2. `-timeline-setup-flow.css`**
- Add styling for the hover-card variant of the status popover (`.timeline-blueprint-summary-status-hover`) mirroring the existing `…-tooltip` card styles, since `HoverCardContent` renders via portal with different base classes than `TooltipContent`. Adjust cursor from `help` → `pointer` on the chip to signal clickability (keep `:hover`/`:focus-visible` ring/translate as-is).

### Why these choices
- **HoverCard over Tooltip:** tooltips in this stack are non-interactive (pointer-events: none popup, short dwell). The content is a list of contractors/materials — the user needs to read it. HoverCard portals an interactive popup and is the repo's existing pattern (`src/components/ui/hover-card.tsx`).
- **Reuse the existing sheet, not a new panel:** the detail sheet with the contractors/materials/field-guidance tabs already exists; a chip click just needs to open it at the right tab. No new surface.
- **Hybrid controlled/uncontrolled tabs:** `MilestoneExpandedTabs` is shared between inline expanded rows and the sheet. Making tabs controlled *only* when an `activeTab` is passed avoids any behavior change to inline rows and to every other caller of the worksheet.

### Tests
- Extend `src/features/timeline-workspace/-TimelineMilestoneWorksheetTable.test.tsx`:
  - Existing chip `aria-label` assertions (line ~358) stay green (unchanged).
  - New: hover/focus a `…-contractor` chip → hover-card content shows the contractor name (e.g. "Ledger Frame Co.").
  - New: click the `…-contractor` chip → the detail sheet opens (existing `data-testid` `timeline-setup-details-sheet-${rowKey}`) **and** the contractors tab is active (`role=tab[name="Contractors"][aria-selected=true]`).
  - Same for materials → materials tab, and guidance → field-guidance tab.
  - Regression: opening the sheet via the existing "Details" button still lands on the default tab.

### Out of scope
- The duplicate at `src/routes/demo/timeline/-TimelineMilestoneWorksheetTable.tsx` (a standalone demo copy, not imported by the app) — left untouched unless you want parity.
- No schema/Convex changes; this is presentation + local UI state only.