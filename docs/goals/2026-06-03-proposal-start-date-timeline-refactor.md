# Goal Contract: Proposal Start-Date Timeline Refactor

Status: Approved
Created: 2026-06-03
Source request: Replace proposal planning's primary T# duration display with proposed calendar dates while preserving a T# display toggle.
Target workspace: /Users/connor/.codex/worktrees/360f/drawflowv1

## Source Context

- User intent: New proposal planning should start from a proposed start date, store schedule offsets/durations, and present editable milestone and submilestone start/end dates by default with a local toggle back to T#.
- Source artifacts inspected:
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/AGENTS.md`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/docs/draw_flow_prd.md`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/docs/production-foundation-proposal-flow-implementation.md`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/docs/production-proposal-gantt-workspace.md`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/convex/schema.ts`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/convex/production_proposals.ts`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/convex/production_proposals.test.ts`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/routes/builder/proposals/new.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/routes/backoffice/proposals/new.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/routes/builder/proposals/$proposalId/index.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/timeline-workspace/-TimelineSetupFlow.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/timeline-workspace/-timeline-milestone-schedule.ts`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/production-proposals/timelineSetupAdapter.ts`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/production-proposals/ProductionProposalGanttWorkspace.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/production-proposals/ProductionProposalSurfaces.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/build-workspace-demo/BuildWorkspaceDemo.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/build-workspace-demo/SortableMilestoneRailRow.tsx`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/build-workspace-demo/types.ts`
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/src/features/calendar-workspace/adapters/proposalCalendarAdapter.ts`
  - Existing tests for setup, worksheet, adapter, Gantt, proposal surfaces, and Convex production proposal flow.
- Standing instructions relied on:
  - `/Users/connor/.codex/worktrees/360f/drawflowv1/AGENTS.md`
  - Product truth from `/Users/connor/.codex/worktrees/360f/drawflowv1/docs/draw_flow_prd.md`
  - Repo package/runtime guidance: Bun, React 19, TanStack, Convex, Tailwind 4, CossUI/shadcn-style components.
  - UI surface rules requiring wrapper frames through `src/components/ui/frame.tsx` and content cards through `src/components/ui/card.tsx`.
- Boilerplate intentionally not repeated in `/goal`: Bun commands, default build/test/typecheck expectations, component reuse rules, WorkOS projection table rules, fluent-convex requirements, and domain rules already present in AGENTS.md.
- Codebase findings:
  - New proposal routes `/builder/proposals/new` and `/backoffice/proposals/new` both reuse `TimelineSetupFlow`, convert the `TimelineSetupResult` with `timelineSetupResultToDraftPackage`, then call `saveDraftProposalPackage`.
  - `TimelineSetupFlow` currently starts from template selection, budget/cash/co-pay/address/permit inputs, then builds rows from template durations.
  - `TimelineMilestoneWorksheetTable` currently edits milestone and submilestone durations as `T#` text and is reused by setup and production proposal editing.
  - `buildTimelineItemsFromSetupRows` currently schedules included setup rows sequentially from T0 using duration plus a default 5-day handoff gap.
  - `timelineSetupResultToDraftPackage` currently saves milestone `dayStart`, `dayEnd`, `durationDays`, and submilestone `startDay`/`durationDays` offsets; it currently synthesizes each non-first milestone dependency from the previous item.
  - `buildProposals` currently has no proposed start date; `activeBuilds.startDate` exists only after closing.
  - `ProductionProposalGanttWorkspace` uses a hardcoded `BASE_DATE = new Date(2026, 5, 1)` to convert proposal offsets into `Date` objects for the embedded Build Workspace.
  - Proposal calendar adapters currently fall back to `"2026-06-01"` when no active build start date exists.
  - `recordOfflineClosing` accepts `buildStartDate` and materializes closed proposal offsets into active build rows.
  - Convex guideline file `/convex/_generated/ai/guidelines.md` is referenced by AGENTS.md but is absent in this worktree.

## Shared Understanding

### Desired End State

When creating a production Build Proposal, builder and backoffice users select a required proposed start date during template selection. Proposal planning stores `buildProposals.proposedStartDate` as an optional `YYYY-MM-DD` date string and continues to persist milestone/submilestone schedules as day offsets and durations. The default proposal setup, blueprint worksheet, proposal Gantt/timeline workspace, milestone rail/sidebar, detail sheets, draw date labels, calendar adapter, and closing workflow present proposed calendar dates by default, with a local non-persisted toggle to display the old T# day-offset labels where relevant. Users can edit milestone and submilestone start/end dates directly in the blueprint table to model parallel work; explicit dependency keys, not row order, are the sequencing constraint.

### In Scope

- Add `proposedStartDate?: string` to `buildProposals` schema and generated Convex types.
- Add a required proposed start date input to the shared `TimelineSetupFlow` template selection step, prefilled to the current local date.
- Allow valid backdated proposed start dates; do not enforce today-or-future.
- Include proposed start date in `TimelineSetupResult`, `ProductionProposalDraftSavePayload`, `timelineSetupResultToDraftPackage`, builder proposal creation, and backoffice proposal creation.
- Set or patch `buildProposals.proposedStartDate` through draft proposal save flows.
- Expose `proposedStartDate` in proposal detail and proposal timeline/workspace view models used by builder, backoffice, calendar, Gantt, and visual fixtures.
- Replace hardcoded proposal Gantt base date fallbacks with `detail.activeBuild?.startDate` after closing, otherwise `proposal.proposedStartDate`.
- Keep `activeBuild.startDate` separate from `buildProposals.proposedStartDate`.
- Prefill the closing start-date field from `buildProposals.proposedStartDate` when no active build exists; still allow admins to override it, and save only the admin-confirmed closing value to `activeBuild.startDate`.
- Add a local non-persisted display toggle for date vs T# in proposal setup and proposal timeline views, defaulting to calendar date mode.
- Update `TimelineMilestoneWorksheetTable` by adapting the existing shared component, not replacing it, so date-mode columns show editable start and inclusive end dates for milestones and submilestones.
- Preserve T# mode in the worksheet table and proposal timeline surfaces for users who prefer day-offset planning.
- Use inclusive user-facing end dates. A 30-day milestone starting `2026-06-01` displays and edits as ending `2026-06-30`.
- Centralize conversion between date-only UI values and stored offsets/durations so UI does not leak exclusive `dayEnd` semantics.
- Permit overlapping/parallel milestones and submilestones unless explicit dependency rules require sequencing.
- Stop auto-creating previous-row dependencies during proposal setup save. Preserve template-defined `dependencyKeys` and dependencies created or removed through explicit Gantt dependency actions.
- Ensure row order remains presentation/order metadata, not an implicit dependency graph.
- Update draw labels, markers, detail sheets, hover cards, rail/sidebar rows, and proposal calendar subtitles that currently say only day/T# so they use the active display mode where the user is in a proposal planning context.
- Update or add tests covering schema, adapter conversion, setup flow input/validation, editable date rows, T# toggle behavior, Gantt base date conversion, dependency behavior, backdated proposed dates, and closing prefill.

### Out of Scope

- Do not migrate real production data; existing DB data is test/demo data.
- Do not alter reimbursement-only domain rules.
- Do not change interest-start semantics; interest still begins only after funds are released.
- Do not merge `proposedStartDate` into `activeBuild.startDate`.
- Do not persist the display-mode toggle to user profile, local storage, WorkOS, or Convex.
- Do not rewrite the Build Workspace or Gantt engine from scratch.
- Do not introduce a separate duplicate worksheet table.
- Do not require future-only dates.
- Do not redesign unrelated proposal, calendar, active build, contractor, material planning, or backoffice surfaces except where necessary to display proposal schedule dates consistently.

### Constraints

- Date strings stored in Convex must be date-only `YYYY-MM-DD`.
- User-facing schedule end dates are inclusive.
- Stored planning values remain numeric offsets/durations: milestone `dayStart`, `dayEnd`, `durationDays`; submilestone `startDay`, `durationDays`.
- If existing internal calculations use exclusive `dayEnd`, do not silently change all storage semantics. Add named helpers that make conversion explicit and update call sites that render or accept user-facing dates.
- Proposal setup and timeline views default to calendar-date display.
- T# display is local React state per surface.
- Parallel schedule entries are valid when they do not violate explicit dependency rules.
- Existing component reuse rules apply: adapt `TimelineSetupFlow`, `TimelineMilestoneWorksheetTable`, `ProductionProposalGanttWorkspace`, `BuildWorkspaceDemo`, and existing UI primitives.
- Convex application functions must continue using fluent-convex patterns already established in this repo.
- WorkOS projection tables remain webhook-owned and must not be manually written.
- Every new/changed proposal field remains organization scoped through its parent `buildProposals` row.

### Decisions

| Decision | Answer | Source |
| --- | --- | --- |
| Primary display mode | Default to calendar dates with local non-persisted T# toggle per setup/timeline surface. | User |
| Proposed date persistence | Add optional `buildProposals.proposedStartDate` separate from `activeBuild.startDate`. | User |
| Editable setup dates | Make milestone and submilestone start/end dates directly editable in the blueprint table. | User |
| Parallel work | Allow overlapping/parallel work unless explicit dependency rules require sequencing. | User |
| End-date semantics | User-facing/editable end dates are inclusive; centralize conversion to storage offsets/durations. | User |
| Backdating | Allow backdated proposed start dates. | User |
| Setup requirement | Require proposed start date before continuing, prefilled to today. | User |
| Auto dependencies | Stop synthesizing previous-row dependencies; preserve template and explicit dependencies only. | User |
| Closing behavior | Prefill closing start date from proposed start date, allow admin override, persist override to active build only. | User |
| Data migration posture | Existing DB data is test data and should not block clean schema/model changes. | User |

### Assumptions

- "Today" for prefill means the browser user's local date as a date-only input value.
- Date formatting can use existing app patterns such as `MMM d`, `MMM dd, yyyy`, and `yyyy-MM-dd` input values as long as displayed text is unambiguous.
- Existing test/visual fixture data may be updated directly to include `proposedStartDate`.
- Active build surfaces should keep using `activeBuild.startDate`; the new T#/date display toggle is required only for proposal setup and proposal timeline planning surfaces.
- If an old proposal lacks `proposedStartDate`, execution may use a deterministic fallback such as current local date for draft editing display while making new saves populate the field.

## Completion Contract

Use this compact prompt to start the executing run. It points back to this Markdown file instead of duplicating every detail.

```text
/goal Execute the contract in /Users/connor/.codex/worktrees/360f/drawflowv1/docs/goals/2026-06-03-proposal-start-date-timeline-refactor.md to refactor Build Proposal planning around a required proposed start date with editable inclusive milestone/submilestone calendar dates by default and a local T# display toggle. Treat that Markdown file as authoritative for decisions, scope, constraints, verification evidence, iteration policy, blocked policy, assumptions, and exclusions. Preserve explicit-dependency scheduling, proposal/active-build start-date separation, and existing component reuse. Use the source artifacts listed in the contract. If blocked or no valid paths remain, report the exact blocker and unlock condition from the contract.
```

## Verification Evidence

- `bun x convex codegen` succeeds after schema/API changes.
- `bun x tsc -p convex/tsconfig.json` succeeds.
- `bun run test` succeeds, or every remaining failure is unrelated and documented with exact failing test names and why.
- `bun run build` succeeds.
- Add/update Convex tests proving:
  - `saveDraftProposalPackage` accepts and persists a backdated valid `proposedStartDate`.
  - `getProposalDetail` and `getProposalDetailByString` expose `proposal.proposedStartDate`.
  - `recordOfflineClosing` uses the admin-supplied `buildStartDate` for `activeBuild.startDate` and does not overwrite `buildProposals.proposedStartDate`.
  - Proposal setup/save no longer auto-creates previous-row dependencies.
- Add/update adapter tests proving:
  - `TimelineSetupResult` carries `proposedStartDate`.
  - `timelineSetupResultToDraftPackage` preserves `proposedStartDate`.
  - Inclusive date conversion maps start `2026-06-01`, end `2026-06-30` to a 30-day user-facing milestone while keeping storage consistent.
  - Parallel milestones preserve overlapping offset ranges when no explicit dependency blocks them.
- Add/update `TimelineSetupFlow` tests proving:
  - Proposed start date input renders in template selection, defaults to today's local date, is required to continue, accepts past dates, and reaches `onComplete`.
  - Date display is the default and T# toggle changes visible schedule labels without persisting.
- Add/update `TimelineMilestoneWorksheetTable` tests proving:
  - Milestone start/end date cells edit stored schedule offsets/durations.
  - Submilestone start/end date cells edit `startDay`/`durationDays`.
  - T# mode keeps the old duration-oriented controls visible.
  - Parallel rows are not normalized back into a sequential handoff schedule.
- Add/update proposal Gantt/workspace tests proving:
  - Proposal Gantt dates are anchored to `proposal.proposedStartDate` before closing.
  - Closed proposals/active builds use `activeBuild.startDate`.
  - Milestone rail/sidebar/detail labels reflect the active display mode.
  - Dragging/moving still persists offsets relative to the active proposal base date.
- Add/update proposal calendar adapter tests proving:
  - Proposal events use `proposal.proposedStartDate` before closing and `activeBuild.startDate` after closing.
- Browser/manual QA evidence:
  - Run the local app and create a new builder proposal with a backdated proposed start date.
  - Verify template selection requires the proposed start date.
  - Verify blueprint table default date mode shows editable start/end dates for milestones and submilestones.
  - Verify switching to T# mode shows day-offset/duration labels.
  - Verify two milestones can overlap in date mode and remain overlapping after save/reload.
  - Verify the proposal timeline view defaults to dates, can toggle to T#, and keeps the same underlying schedule.
  - Verify closing prepopulates from proposed start date and can be overridden.

## Iteration Policy

1. First implement the data model and typed adapter path: schema, Convex save/query payloads, generated code, TypeScript interfaces, visual fixtures, and tests.
2. Then implement centralized date/offset conversion helpers with direct tests before touching UI rendering.
3. Then update setup flow state and `TimelineMilestoneWorksheetTable`, preserving existing call sites and adding only props needed for proposed start date and display mode.
4. Then update production proposal adapters and Gantt workspace base-date conversion.
5. Then update visible labels and controls in proposal setup/timeline surfaces, including the milestone rail/sidebar/detail sheets and draw labels.
6. Then update closing prefill and proposal calendar adapter.
7. After each implementation slice, run the narrowest relevant tests first, fix regressions, then broaden to full verification.
8. If two approaches both satisfy the contract, choose the one that reuses existing components and minimizes new state/storage.

## Blocked Policy

Only report blocked when no valid implementation path remains after inspecting the relevant code and attempting a narrow prototype. The blocker report must include:

- The exact file/function or missing artifact causing the block.
- The contract clause that cannot be satisfied.
- The concrete user decision, repo artifact, permission, or dependency needed to proceed.
- Any partial changes already made and verification already run.

Known non-blockers:

- Existing DB rows are test data.
- Missing `/convex/_generated/ai/guidelines.md` should be reported in verification notes but does not block using the established Convex patterns in `convex/fluent.ts` and current domain files.
- Existing tests assuming sequential `T#` scheduling should be updated when they contradict this contract.

## Ambiguity Audit

- No material ambiguity remains for execution.
- Accepted ambiguity: exact visual layout of the date/T# toggle is left to the executing agent, constrained to existing controls, icons, Coss/shadcn-style primitives, responsive fit, and no persisted preference.
- Accepted ambiguity: old proposals without `proposedStartDate` may receive a deterministic UI fallback and should populate the field on next draft save; no production migration is required because current data is test/demo data.
