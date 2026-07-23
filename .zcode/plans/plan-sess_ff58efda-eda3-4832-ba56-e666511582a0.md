## Plan: Optional cost per unit + Budget treatment on all 3 cost-item surfaces

### Problem
1. **Cost per unit is required** in `MaterialItemEditor` — `canSubmit` demands `costEntered && costDollarsValid`, and the helper text says "Must be greater than zero." The user wants cost optional (blank → $0, treated as a logged-only/informational line with no budget effect).
2. **The Active Build materials surface omits the Budget treatment dropdown** — `ProductionBuildMaterialsTab` (`ProductionBuildDetailSurface.tsx:5598`) mounts `MaterialPlanningTab` without `budgetTreatmentEnabled`, so it's the one surface of the three that hides the treatment selector. The proposal surface and worksheet editor already show it.

### Confirmed scope (from user)
- **Treatment**: show on all 3 surfaces. Active Build shows it read-only (immutable after closing — server already rejects treatment changes post-closing).
- **Cost optional**: blank cost = $0, logged-only semantics. Quantity stays required (default behavior). Negative cost stays invalid.

### Key finding
The **backend already tolerates `costCents: 0`** — `normalizeCostItemCost` does `Math.max(0, Math.round(value))`, and the schema validator is bare `v.number()`. So this is purely a **frontend validation change**. No Convex schema/mutation/migration changes needed.

---

### Implementation

#### 1. `src/features/material-planning/MaterialPlanningTab.tsx` — make cost optional

**a. `MaterialItemEditor` validation (lines ~590-655):**
- Keep `costInvalid = costEntered && !costDollarsValid` (only flags negative/garbage, not empty).
- In `canSubmit`: remove the `costEntered &&` requirement. Allow empty cost. Keep `!costInvalid` (negative blocked) and `quantityPositive` (quantity still required).
- A blank cost naturally produces `draftItemTotalCents = 0` via `dollarsInputToCents("")` → `numberFromInput("")` → 0. So a blank-cost item contributes a **$0 delta** to add/maintain — effectively logged-only, exactly the requested semantics.

**b. Helper text + aria (lines ~880-895):**
- Change "Must be greater than zero." → "Optional. Leave blank to log this item without a cost; negative amounts are not allowed."
- Error message "Cost per unit cannot be negative." stays (only triggers on negative).

**c. `materialSubmitGuidance` (lines ~1444-1476):**
- Remove `"Cost per unit"` from the `missingFields` array (it's no longer a required field). Quantity stays in the array.
- Keep the `costInvalid` branches (negative-cost guidance).

**d. New `lockBudgetTreatment` prop on `MaterialItemEditor`:**
- Add prop `lockBudgetTreatment?: boolean`.
- In the treatment/target dropdown block (lines ~783-862): when `lockBudgetTreatment` is true, render both `NativeSelect` elements with `disabled` and a helper note "Budget treatment is locked after proposal closing. Cost and quantity remain editable." This keeps the selectors visible (the user can see the chosen treatment + target) but non-editable, matching the server's post-closing immutability.

**e. Thread `lockBudgetTreatment` through `MaterialPlanningTab`:**
- Add `lockBudgetTreatment?: boolean` to `MaterialPlanningTabProps` (default false).
- Pass it to both `MaterialItemEditor` instances (create + edit, lines 494 & 516).

#### 2. `src/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx` — enable treatment, locked

In `ProductionBuildMaterialsTab` (line ~5598):
- Add `budgetTreatmentEnabled` to the `MaterialPlanningTab` props.
- Add `lockBudgetTreatment` (always true here — active builds are post-closing).
- This makes the treatment dropdown render (disabled) and is consistent with the other two surfaces.

#### 3. Tests — update + extend

**`src/features/material-planning/MaterialPlanningTab.test.tsx`:**
- Update `identifies cost and quantity errors independently...` (line 314): the existing assertions still hold (negative cost still invalid, quantity still required), but the final state where cost="0" and quantity="0.5" enables submit is still valid. Add an assertion that blank cost also enables submit (with valid title + quantity).
- New test `submits a cost item with no cost as a zero-value logged line`: leave cost blank, set title + quantity, assert `create` called with `costCents: 0` and that submit is enabled.
- New test `locks the budget treatment selectors on the active build surface`: render with `budgetTreatmentEnabled` + `lockBudgetTreatment`, assert the treatment + budget-submilestone selects are `disabled` and the lock note is present.
- New test `allows editing cost and quantity while budget treatment is locked`: with `lockBudgetTreatment`, assert cost/quantity inputs are still editable (not disabled) while treatment selects are disabled.

**`src/features/material-planning/MaterialPlanningTab.test.tsx` (existing create tests):**
- Verify the existing "submits a cost item payload" test (line 140) and "defaults sub-milestone cost items to log only" test (line 183) still pass unchanged — they enter a cost, so behavior is unaffected. (No edits expected; just confirm.)

#### 4. Verification

- `bun run test` (expect all green, including updated/new tests)
- `bun x tsc -p convex/tsconfig.json` (no Convex changes, but confirm no type drift from the new optional prop)
- `bun run build`

### What is NOT changing
- No Convex schema, mutation, validator, or migration changes (backend already accepts costCents: 0).
- No change to the proposal surface or worksheet editor treatment behavior (already correct).
- No change to active-build server-side treatment immutability (already enforced at `production_proposals.ts:3326-3341`).
- Quantity remains required; negative cost remains blocked.
- Saved cards already display treatment on all surfaces (card renders `budgetTreatmentLabel` unconditionally), so no card changes needed.

### Files touched
1. `src/features/material-planning/MaterialPlanningTab.tsx` (validation, helper text, new `lockBudgetTreatment` prop)
2. `src/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx` (enable + lock treatment on build surface)
3. `src/features/material-planning/MaterialPlanningTab.test.tsx` (update + 3 new tests)