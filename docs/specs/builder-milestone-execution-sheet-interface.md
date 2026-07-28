# Builder Milestone Execution Sheet Interface

**Status:** Interface recommendation
**Surface:** Builder Live Build → Milestones → Milestone detail sheet
**Primary user:** Builder lead or authorized builder staff executing an active Build
**Decision:** Replace the generic milestone summary with a completion ledger and one in-sheet sub-milestone focus state.

## 1. Problem and outcome

The current builder sheet does not support milestone execution. It shows the milestone status, draw value, submission date, milestone-level contractor assignments, and recent audit events. It does not expose the sub-milestones that the builder must actually deliver, nor does it provide a coherent way to assign the responsible contractor, inspect materials, record actual cost, attach evidence, or claim work complete.

The redesigned sheet must let a builder answer, without leaving the milestone:

- What work is included in this milestone?
- Who is responsible for each sub-milestone?
- What materials and equipment are attached to that scope?
- What was planned for budget and schedule?
- What evidence has already been attached, and is its location verified?
- What did the work actually cost?
- Which sub-milestones are complete?
- Why can or cannot the entire milestone be submitted as complete?

The builder action is a completion **submission/claim**. It must never be presented as lender approval or draw release. Lender admin retains final milestone and draw-release authority.

## 2. Codebase findings

### Current production surface

The annotated surface is `src/features/backoffice-build-detail/MilestoneDetailSheet.tsx`, opened by `ProductionBuildDetailSurface.tsx`. It is:

- a 640 px right-side sheet on desktop;
- a full-width bottom sheet capped at 92dvh on mobile;
- populated by a narrow `MilestoneSheetData` projection;
- limited to milestone-level summary, contractors, events, and generic footer actions.

The live production route currently wires the milestone-completion mutation, but the sheet does not expose it. The builder `startMilestoneWork` action is currently a no-op.

There is also a different inline component with the same name in `BuildWorkspaceDemo.tsx`. It is not the annotated production sheet and must not become a second competing implementation. Any implementation should adapt the production component and extract/share genuinely reusable pieces where the demo also needs them.

### Data already available to the production surface

`ProductionBuildDetail` already carries enough data to render most of the requested read model:

- Build start date.
- Sub-milestones: key, name, order, planned budget, planned start day, planned duration, and work status.
- Evidence assets: optional `submilestoneKey`, label, file name, MIME type, size, preview URL, location-verification state, contractor attribution, tag, source, and timestamps.
- Contractor assignments: optional `submilestoneKey`, contractor, role, status, rate, estimated/actual hours, estimated/actual assignment cost, cost notes, and assignment note.
- Materials and equipment: `relevantSubmilestoneKeys`, title, description, type, supplier, quantity, and cost.
- Milestone completion claim/review, site visits, review reports, audit events, and build-level notes.

Planned calendar dates can be derived centrally from Build start date + sub-milestone `startDay` + `durationDays`.

### Existing reusable UI

The implementation should adapt and compose:

- `Sheet`, `SheetPanel`, and related sheet primitives;
- `Frame` / `FramePanel` for structural wrappers;
- `Card` and card subcomponents for sub-milestone work items and content records;
- `ContractorQuickAddDrawer` and the existing contractor planning list;
- `MaterialPlanningTab`, filtered to a selected sub-milestone;
- existing evidence preview/upload UI;
- rich-text preview/editor primitives;
- existing badges, inputs, currency formatting, and status vocabulary.

Do not create ad hoc bordered card wrappers. The project UI rules require `Frame` for structural containers and `Card` for content or interactive card surfaces.

### Data and command gaps

The redesign cannot be made correct through JSX alone:

1. `buildSubmilestones` has no sub-milestone actual realized cost.
2. There is no sub-milestone-scoped field-note model.
3. Planned sub-milestone descriptions are not preserved on the production proposal/build records used by this surface.
4. There is no audited active-Build mutation for transitioning one sub-milestone through work states.
5. Milestone completion currently permits incomplete children and emits a reconciliation warning. The requested rule requires a hard transactional guard.
6. Site visits, audit events, and build notes are not consistently scoped to a sub-milestone. The UI must not imply a relationship that is absent from the data.
7. The completion mutation is wired in the builder route through an `any` cast but is absent from the typed `ProductionBuildDetailActions` contract.
8. The builder start-work action is exposed as a no-op and must either call the real audited mutation or be removed.

## 3. Design A — Completion Ledger

### Interface shape

```ts
type BuilderMilestoneExecutionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: BuilderMilestoneExecutionModel;
  activeSubmilestoneKey?: string;
  onActiveSubmilestoneChange: (key?: string) => void;
  dispatch: (command: BuilderMilestoneCommand) => Promise<CommandResult>;
};

type BuilderMilestoneExecutionModel = {
  milestone: {
    key: string;
    name: string;
    plannedBudgetCents: number;
    plannedStartDate: string;
    plannedEndDate: string;
    submittedActualCostCents?: number;
    completedCount: number;
    totalCount: number;
    canSubmitCompletion: boolean;
    completionBlockers: CompletionBlocker[];
  };
  submilestones: BuilderSubmilestoneWorkItem[];
  permissions: BuilderMilestonePermissions;
};

type BuilderSubmilestoneWorkItem = {
  key: string;
  name: string;
  order: number;
  workState:
    | "not_started"
    | "in_progress"
    | "builder_completed"
    | "reopened";
  plannedBudgetCents: number;
  plannedStartDate: string;
  plannedEndDate: string;
  reportedActualCostCents?: number;
  descriptionRichText?: RichTextDocument;
  contractors: ContractorAssignmentDetail[];
  materials: MaterialPlanningItem[];
  evidence: EvidenceAssetDetail[];
  fieldNotes: SubmilestoneFieldNote[];
  linkedSiteVisits: ScopedSiteVisitDetail[];
  auditEvents: ScopedAuditEventDetail[];
  completionBlockers: CompletionBlocker[];
};

type BuilderMilestoneCommand =
  | { type: "assign_contractor"; submilestoneKey: string }
  | {
      type: "report_actual_cost";
      submilestoneKey: string;
      actualCostCents: number | null;
      note?: string;
      expectedVersion: number;
    }
  | {
      type: "attach_evidence";
      submilestoneKey: string;
      files: File[];
      idempotencyKey: string;
    }
  | {
      type: "set_work_state";
      submilestoneKey: string;
      workState: "in_progress" | "builder_completed";
      expectedVersion: number;
    }
  | {
      type: "reopen_submilestone";
      submilestoneKey: string;
      reason: string;
      expectedVersion: number;
    }
  | {
      type: "submit_milestone_completion";
      expectedVersion: number;
      idempotencyKey: string;
    };
```

The public component stays deep: one assembled model and one discriminated command channel hide joins, permissions, policy, optimistic state, audit metadata, and upload orchestration.

### User experience

The sheet opens to a roadmap-ordered ledger. Its header shows:

- milestone name and current execution state;
- `completed / total` progress;
- planned budget and date range;
- reported actual-cost total;
- evidence count and location-unverified warning count.

Each sub-milestone is an interactive `Card`, but the whole card is not a single button because it contains nested controls. The title and chevron enter focus mode. The card itself shows:

- explicit work-state control and name;
- assigned contractor avatar/name/role or a quick **Assign contractor** action;
- attached materials, with the first two labels and a `+N` overflow count;
- planned budget and planned start/end dates;
- optional **Actual realized cost** currency input;
- evidence count, location warning, and **Attach evidence** action;
- explicit **Mark work complete** action.

Selecting the title replaces the sheet body with one sub-milestone focus view. A visible **Back to milestone** action restores the ledger and its prior scroll position. The focus view has these tabs:

1. **Overview** — description, work state, planned budget/dates, actual cost, and blockers.
2. **Evidence** — every scoped asset, preview/download, metadata, tags, source, contractor attribution, and location state.
3. **Contractors** — every scoped assignment, role, status, rates, estimated/actual hours and costs, cost notes, and assignment notes.
4. **Materials** — filtered material/equipment records, descriptions, supplier, quantity, type, and cost.
5. **Notes & history** — scoped field notes, scoped site-visit findings, and scoped audit events. Unscoped build context may appear only under a separately labeled **Build context** section.

The footer is sticky and remains part of the parent milestone sheet. It shows progress and the names of incomplete work items. The primary control is never a dead end: while scope remains incomplete it reads **Complete remaining scope** and opens the guided field walk at the first incomplete child; when the server-provided eligibility says every sub-milestone is complete and no policy blocker is outstanding, the same control becomes **Submit milestone completion**.

### Responsive behavior

Keep the current 640 px desktop rail for the ledger. On mobile, stack card fields into full-width rows and keep the footer above the safe-area inset. Focus mode replaces the body at both widths instead of stacking another sheet.

The **Complete remaining scope** escape hatch is available at every viewport. It opens the first incomplete sub-milestone, advances only after an explicit successful completion, and returns to the ledger when the last incomplete child is finished.

### What this design hides

- Scoping evidence, assignments, and materials to the selected sub-milestone.
- Deriving planned dates.
- Separating reported sub-milestone cost from contractor-assignment cost.
- Completion eligibility and state-machine rules.
- Upload lifecycle, location attempt, retries, and idempotency.
- RBAC, organization isolation, and audit-event construction.

### Trade-offs

This design fits the existing sheet and makes the most common builder actions visible with minimal navigation. It is less efficient than a table for comparing a very large number of sub-milestones, but substantially easier to use on touch devices and at 640 px. Replacing the body for focus mode prevents side-by-side comparison, but avoids stacked drawers and preserves a simple mental model.

## 4. Design B — Milestone Operations Console

### Interface shape

This design widens the sheet to approximately `min(1180px, calc(100vw - 32px))` and uses a split layout:

```text
┌──────────────── milestone summary and filters ────────────────┐
│ operations table, 62%             │ inspector, 38%            │
│ all sub-milestones                 │ selected sub-milestone    │
│ sticky columns + inline controls   │ tabbed rich detail        │
├──────────────── completion eligibility footer ────────────────┤
```

The table has one row per sub-milestone with columns for status, scope, dates, planned budget, actual cost, contractor, material count, evidence count, warnings, and quick actions. Selecting a row opens the persistent inspector without losing table scroll or filters.

The inspector uses the same Overview, Evidence, Contractors & costs, Materials, and Notes & history structure as Design A.

### Usage

An experienced builder can filter to incomplete, unassigned, overdue, over-budget, or location-unverified work. Actual cost is editable inline. Contractor names and evidence counts open the appropriate inspector tab. The footer can filter directly to the remaining incomplete rows.

### What this design hides

The console still consumes one organization-scoped aggregate model. The feature layer owns joins, derived dates, validation, version-conflict handling, completion eligibility, and audit construction.

### Trade-offs

This is the fastest design for cross-row comparison and bulk operational scanning. It is also the largest departure from the current sheet, has the highest density, and requires a separate stacked-list interaction at smaller widths. It is better suited to a dedicated milestone operations page or a future desktop expansion than to the annotated 640 px sheet.

## 5. Design C — Guided Field Walk

### Interface shape

This design treats milestone execution as a site walk. The sheet opens to a checklist, with **Continue field walk** launching the first incomplete work item into a five-stage stepper:

1. Confirm scope, description, dates, budget, and materials.
2. Confirm or assign responsible people.
3. Capture evidence and location attempt; add field notes.
4. Enter optional actual cost and cost note.
5. Review and mark the sub-milestone complete.

Desktop/tablet keeps a narrow checklist beside the active work item. Mobile replaces the checklist with the active step. Full rich detail remains available through the same five inspector tabs.

### Usage

A builder walking the site can work through one sub-milestone at a time, using camera capture as the primary evidence action. After a successful completion the next incomplete item is suggested. The builder can always return to the full checklist and is never trapped in the sequence.

### What this design hides

The field workflow hides upload retries, local draft persistence, idempotency, location-attempt metadata, pending synchronization, and completion eligibility.

### Trade-offs

This is the strongest mobile execution experience and the best basis for future offline field capture. It is more opinionated, introduces more steps for simple updates, and is inefficient when a builder wants to compare several sub-milestones at once. It should be an optional continuation mode, not the only sheet interface.

## 6. Comparison and recommendation

Design A has the smallest interface and the deepest encapsulation. It presents all execution-critical data while hiding policy and join complexity behind one model and command channel. It fits the current 640 px sheet without forcing separate desktop and mobile products. Its primary failure mode is card density when milestones contain many children, which can be mitigated with concise summaries and a `Show incomplete` filter.

Design B maximizes flexibility and scan efficiency, but its value depends on a much wider surface. Within the annotated rail it would either overflow or degrade into a different mobile list, increasing interface and implementation complexity. Its table and inspector pattern is valuable if DrawFlow later adds a dedicated full-page milestone operations surface.

Design C optimizes the field-completion path and cleanly accommodates camera-first evidence. Its stepper is excellent for completing one work item but slower for assigning contractors, reviewing materials, or comparing budget variance across several items. Its guided flow should be the ledger's explicit escape hatch whenever incomplete work blocks milestone submission, rather than a separate primary surface.

### Recommended synthesis

Implement **Design A: Completion Ledger** as the canonical sheet, with two borrowed ideas:

- From Design B: use the five consistent inspector tabs and expose a `Show incomplete` filter.
- From Design C: turn the incomplete parent action into **Complete remaining scope**, opening a guided walk at the first blocker on every viewport; return to the ledger after the last child completes and preserve offline-ready command/idempotency boundaries.

This synthesis keeps the public interface small, makes correct use obvious, supports every requested field, preserves the existing sheet footprint, and gives the future mobile capture flow a clean extension point.

## 7. Recommended data contract

### Aggregate query

Add one organization-scoped query such as:

```ts
getBuilderMilestoneExecutionSheet({
  buildId,
  milestoneKey,
}) => BuilderMilestoneExecutionModel
```

The query must own authorization-sensitive joins and return:

- normalized planned dates;
- filtered assignments, materials, evidence, field notes, site visits, and audit events;
- permissions per action;
- version numbers for optimistic concurrency;
- server-computed completion blockers and milestone eligibility;
- explicit scoping metadata so inherited milestone/build context cannot be mistaken for sub-milestone data.

### Execution state

Keep planned roadmap/budget data separate from realized execution data. Add an organization-scoped `submilestoneExecution` table rather than overloading versioned planning records:

```ts
type SubmilestoneExecution = {
  organizationId: string;
  buildId: Id<"activeBuilds">;
  buildMilestoneId: Id<"buildMilestones">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  milestoneKey: string;
  submilestoneKey: string;
  workState: "not_started" | "in_progress" | "builder_completed" | "reopened";
  reportedActualCostCents?: number;
  actualCostNote?: string;
  builderCompletedAt?: number;
  builderCompletedByWorkosUserId?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
};
```

Actual realized cost must be labeled and stored independently from contractor-assignment actual cost. Do not silently derive one from the other.

Add a scoped notes table if notes need independent authorship, editing, attachments, or audit history:

```ts
type SubmilestoneFieldNote = {
  organizationId: string;
  buildId: Id<"activeBuilds">;
  milestoneKey: string;
  submilestoneKey: string;
  body: RichTextDocument;
  authorWorkosUserId: string;
  createdAt: number;
  updatedAt?: number;
};
```

Preserve the planned description on proposal sub-milestones and copy it to Build sub-milestones when the proposal closes. Do not read a mutable template description as the active Build's historical scope.

### Mutations

Add fluent-convex mutations for:

```ts
setActiveBuildSubmilestoneWorkState({
  buildId,
  milestoneKey,
  submilestoneKey,
  workState,
  expectedVersion,
  reason?,
})

reportActiveBuildSubmilestoneActualCost({
  buildId,
  milestoneKey,
  submilestoneKey,
  actualCostCents,
  note?,
  expectedVersion,
})

upsertActiveBuildSubmilestoneFieldNote({
  buildId,
  milestoneKey,
  submilestoneKey,
  noteId?,
  body,
  expectedVersion?,
})

submitActiveBuildMilestoneCompletion({
  buildId,
  milestoneKey,
  expectedVersion,
  idempotencyKey,
  note?,
})
```

The milestone-completion mutation must transactionally re-read all current children and reject with structured `incompleteSubmilestoneKeys` when any child is incomplete. Client-side disabling is explanatory, not authoritative.

Evidence creation already accepts `submilestoneKey`. The sheet must always provide it for sub-milestone uploads and add a client idempotency key/capture identifier. A failed location attempt must still persist the asset with an explicit unverified state and route it for review.

Every work-state change, reopen, actual-cost change, field-note mutation, contractor assignment, evidence attachment, and milestone completion submission must emit an organization-scoped audit event containing actor, role, timestamp, prior/new state, warnings, and reason where required.

## 8. Interaction and state rules

1. **Builder completion is not approval.** Use **Mark work complete** for a child and **Submit milestone completion** for the parent. Never use **Approve** on the builder surface.
2. **The parent gate is strict without becoming a dead end.** Parent submission remains server-rejected until every current child is complete. While blockers remain, the footer action opens guided completion instead of attempting submission. Policy-required evidence or unsynchronized completion commands may add blockers.
3. **Geofence failure preserves evidence.** The upload succeeds with **Location unverified**; evidence is never discarded.
4. **Planned data is contextual.** Planned budget and dates are read-only in this execution sheet. Budget revisions remain versioned workflows.
5. **Actual cost is optional.** Empty is distinct from zero. Negative or malformed values are rejected. Save state, error, retry, and version conflicts are visible.
6. **Interactive targets are separate.** Card title/chevron opens detail; inline assignment, cost, evidence, and completion controls do not accidentally navigate.
7. **Reopening is audited.** Once parent completion has been submitted, reopening a child requires an explicit reason and returns the milestone to a non-submitted state according to the domain state machine.
8. **Inherited context is labeled.** Build-level notes and milestone-level site visits are not shown as sub-milestone records without an explicit relation.
9. **URL state is durable.** Use `milestone`, optional `submilestone`, and optional detail tab in route search so refresh, browser Back, and shared links preserve context.
10. **Focus is restored.** Opening detail focuses its heading; Back returns focus to the originating child card. Escape exits focus mode before closing the outer sheet.

## 9. Accessibility and responsive acceptance criteria

- The ledger is an ordered list with a heading for every work item.
- Status uses text and icon, never color alone.
- Every contractor, cost, evidence, and completion control has a label containing the sub-milestone name.
- Touch targets are at least 44 px on mobile.
- Progress is exposed as text such as `3 of 5 sub-milestones complete`.
- The incomplete-state footer action has `aria-describedby` pointing to the blocker summary and clearly announces that it opens guided completion.
- Save, upload, and completion outcomes announce through a polite live region.
- Evidence previews expose label/file-name alternatives and explicit location state.
- The footer stays visible above the mobile safe-area inset without covering the last card.
- The focus view is reachable and operable by keyboard, restores focus on Back, and does not create a stacked modal trap.
- Long contractor, material, and file names wrap or truncate with an accessible full name.

## 10. Verification contract for implementation

The implementation should add tests proving:

- all production sub-milestones render in roadmap order;
- each row displays contractor, materials, planned budget, planned dates, evidence state, actual-cost input, and completion action;
- an unassigned row opens the existing contractor assignment flow with the exact `submilestoneKey`;
- uploads are persisted against the exact child and survive location-verification failure;
- child detail includes all scoped evidence, assignments, materials, field notes, and explicitly related history;
- empty and zero actual costs remain distinct;
- completing a child updates progress and restores focus correctly;
- while any child is incomplete, the footer opens guided completion and does not issue a parent submission command;
- finishing the last guided child returns to the ledger and promotes the footer control to **Submit milestone completion**;
- direct server calls reject parent submission with incomplete children;
- builder submission never changes the lender-admin approval state;
- RBAC and organization boundaries are enforced for query and mutation paths;
- every material transition emits the required audit record;
- desktop and mobile layouts preserve the sticky footer and usable scroll area;
- the current production route uses the typed completion action and no longer exposes a no-op start action.

## 11. Decision request

Proceed with the **Completion Ledger** as the canonical sheet and the **Guided Field Walk** as its blocker-resolution escape hatch on every viewport. Reserve the wide Operations Console for a future full-page surface if builders later need bulk milestone execution across many rows.
