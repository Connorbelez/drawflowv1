# DrawFlow Assistant QA Follow-up — 2026-06-25

Source of truth: `docs/assistant-qa-report-2026-06-25.md`

## Summary

The assistant workflow runtime now treats navigation, generated UI, user input, HITL preview generation, commit, and self-check as one ordered workflow. AGUI selector/form/table/briefing interactions are emitted as workflow events, `wait_for_agui_submit` is a hard barrier, route-changing workflows resume after navigation, and deterministic Convex planner fallbacks now produce DrawFlow-specific summaries, controls, and action rows for the reported QA paths.

## Findings Closed

| Original finding | What changed | Regression coverage | New observed browser behavior |
| --- | --- | --- | --- |
| Garden Suite workflow must remain green and launcher behavior must work after selection. | Preserved deterministic Garden Suite workflow and sequential self-check. Assistant launcher open state now persists across shell remounts, while close/reopen still resets session state. | `assistantWorkflow.test.ts`, `app-shell.test.tsx`, `assistant-qa-regression.spec.ts`. | Browser spec opens Garden Suite workflow, sees `/builder/proposals/new`, sees `Garden Suite selected`, closes, and reopens the launcher successfully. |
| Unscoped reminders advanced to HITL before target selection. | `nextRunnableWorkflowStep` is strictly sequential. `wait_for_agui_submit` now enters `needs_input` and never times out into downstream HITL work. Reminder selectors render real autocomplete selector controls. | `assistantWorkflow.test.ts`, `convex/assistant.test.ts`, `AssistantGenerativeUI.test.tsx`, `assistant-qa-regression.spec.ts`. | Browser spec shows target selector, verifies no HITL preview exists before selection, then creates the scoped preview only after target selection. |
| Scoped live-build reminder commit had no durable visible state and title whitespace leaked. | HITL preview now tracks `idle`, `committing`, `committed`, and `failed`; buttons lock after commit; success/failure state remains visible. Reminder titles are trimmed before action input. | `DrawFlowAssistant.test.ts`, `app-shell.test.tsx`, `convex/assistant.test.ts`, `assistant-qa-regression.spec.ts`. | Browser spec confirms accepted reminder batch shows a durable committed state. |
| Material fill-in asked passive questions despite quantity/unit/price being supplied. | Convex planner now extracts quantity, unit, unit price, supplier intent, title, description, item type, and likely milestone into a structured cost-item form. The form includes unit and prepares HITL only after valid submit. | `convex/assistant.test.ts`, `AssistantGenerativeUI.test.tsx`, `DrawFlowAssistant.test.ts`, `assistant-qa-regression.spec.ts`. | Browser spec shows `60`, `bags`, `1800`, `Unspecified supplier`, `Stucco mix`, then prepares a HITL preview. |
| Contractor recommendations contradicted themselves with “0 items” while prose named Oscar. | Contractor fallback ranks internal contractor data into review tables with confidence, trade match, location, availability, and assignment action rows. Adjacent envelope/exterior trades now remain visible instead of zeroing out. | `convex/assistant.test.ts`, `AssistantGenerativeUI.test.tsx`, `assistant-qa-regression.spec.ts`. | Browser spec shows Oscar Masonry, adjacent confidence, and a `Review assignment` row that navigates to the build. |
| Backoffice briefings navigated without being asked and lacked clickable actions. | Planner prompt and fallback suppress briefing navigation unless explicitly requested. Briefing items render button action rows from href/actions and emit workflow events before navigation. | `convex/assistant.test.ts`, `AssistantGenerativeUI.test.tsx`, `assistant-qa-regression.spec.ts`. | Browser spec keeps route at `/backoffice` until `Open review` is clicked, then navigates to `/backoffice/site-visits`. |
| Draw queue prompt navigated but did not summarize. | Added org-scoped operational queue context and deterministic draw queue planner output with navigation, summary counts, review table, and next action. Route workflows resume and render post-navigation output before self-check. | `convex/assistant.test.ts`, `assistantWorkflow.test.ts`, `assistant-qa-regression.spec.ts`. | Browser spec lands on `/backoffice/draws` and shows `0 requested`, `8 planned`, plus an action row. |
| Site visit queue prompt navigated then panel disappeared/no summary. | Assistant open state persists across route remounts. Site visit queue planner ranks expired and geofence-flagged visits and renders action rows after navigation. | `app-shell.test.tsx`, `convex/assistant.test.ts`, `assistantWorkflow.test.ts`, `assistant-qa-regression.spec.ts`. | Browser spec lands on `/backoffice/site-visits`, shows expired/geofence flags, and keeps the assistant surface active. |
| Submitted proposal review navigated but gave no reason/checklist. | Proposal review planner selects the oldest submitted proposal, navigates to it, and renders checklist rationale/action rows. | `convex/assistant.test.ts`, `assistantWorkflow.test.ts`, `assistant-qa-regression.spec.ts`. | Browser spec lands on `/backoffice/proposals/proposal_123`, shows waiting-longest rationale and review checklist. |
| Highest-risk build triage needed exact ranked action card over review controls. | Risk build planner ranks active builds from overdue milestones, pending claims, requested draws, expired visits, and geofence flags; output includes route navigation and action rows. | `convex/assistant.test.ts`, `assistantWorkflow.test.ts`, `assistant-qa-regression.spec.ts`. | Browser spec lands on `/backoffice/builds/build_123`, shows `Highest-risk build: Garden Suite`, and exposes `Open build review`. |

## Cross-cutting Fixes

- Multi-step workflows now run in order and do not skip running/needs-input gates.
- Post-navigation workflows now include route wait, rendered follow-up output, and self-check before success.
- `render_agui` stamps workflow metadata into generated UI; selector/form submits are validated before the workflow advances.
- HITL commits expose durable success/failure state and lock accepted batches after commit.
- Model-backed planner responses inherit deterministic DrawFlow fallback UI/navigation for known operational intents.
- Backoffice operational queues are organization-scoped and brokerage-scoped before entering assistant context.

## Verification

- `bun run test src/features/assistant/assistantWorkflow.test.ts src/features/assistant/AssistantGenerativeUI.test.tsx src/features/assistant/DrawFlowAssistant.test.ts src/components/app-shell.test.tsx convex/assistant.test.ts` — 58 passing.
- `bun run test:e2e tests/e2e/assistant-qa-regression.spec.ts` — 10 passing browser workflow regressions.
- `bun x convex codegen` — passed.
- `bun x tsc -p convex/tsconfig.json` — passed.
- `bun run test` — 121 files, 878 tests passing.
- `bun run build` — passed.
