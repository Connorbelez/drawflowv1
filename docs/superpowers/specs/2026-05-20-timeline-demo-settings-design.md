# Timeline Demo Settings Design

## Status

Approved for local specification review on May 20, 2026.

## Context

DrawFlow needs a professional backoffice settings page at `/backoffice/settings`. The first settings section will be `Demos`, and the first configurable demo will be the timeline demo at `/demo/timeline`.

Today the timeline demo owns most template behavior locally. The setup flow already includes the right interaction model for template selection and a milestone worksheet in Step 2 of 4, but that worksheet is budget-oriented and hard-coded into the demo route. Staff need a durable settings surface where they can configure demo templates and draw scenarios once, then have those changes persist across sessions and machines through Convex.

This feature should keep DrawFlow's domain language intact:

- templates describe construction roadmap assumptions,
- percentage-of-completion worksheets describe milestone and sub-milestone contribution to total project value,
- draw scenarios describe reimbursement timing and amount assumptions for a selected template,
- active scenarios drive what staff demos show.

## Goals

- Create a beautiful, professional `/backoffice/settings` page with a `Demos` section.
- Add a Timeline Demo settings workspace.
- Persist timeline template settings and draw scenarios in Convex.
- Reuse/adapt the existing timeline setup milestone table behavior for a PoC worksheet.
- Let staff explicitly save canonical template changes through confirmation modals.
- Let staff create, edit, duplicate, delete, and activate per-template draw scenarios.
- Add an admin-triggered `Seed defaults` action for missing Convex defaults.
- Refactor `/demo/timeline` to consume the Convex-backed settings through reusable adapter logic.
- Cover the new behavior with Convex, frontend, and end-to-end tests.

## Non-Goals

- Do not build a general production settings framework beyond the `Demos` section.
- Do not add a draft/publish workflow for template settings.
- Do not let draw scenarios override milestone timing or completion assumptions in v1.
- Do not replace DrawFlow production entities with demo settings tables.
- Do not make this a generic project-management configuration surface.

## Recommended Approach

Use Convex-backed demo settings with reusable worksheet logic.

Create dedicated Convex tables and functions for timeline demo templates and draw scenarios. Seed those tables from the current timeline defaults. Refactor the timeline setup flow to read settings through a shared adapter. Build the settings page by adapting the existing Step 2 milestone table into a PoC worksheet, replacing `Budget` with `PoC %`.

This gives staff one source of truth for the demo while keeping the configuration isolated from production DrawFlow data.

## Architecture

Add a new Convex module at `convex/demo_settings.ts`, authored with `fluent-convex` only. It uses shared builders and timing middleware from `convex/fluent.ts`.

Add these schema tables in `convex/schema.ts`:

- `demo_timelineTemplates`
- `demo_timelineTemplateMilestones`
- `demo_timelineTemplateSubmilestones`
- `demo_timelineDrawScenarios`
- `demo_timelineDrawScenarioDraws`
- `demo_timelineSettingsEvents`

Every row must be scoped by `orgKey`. For this demo, the first implementation can use the existing demo org key convention, but the schema and functions should remain organization-ready.

The settings page and timeline demo should both consume a shared frontend adapter that converts Convex settings into the existing timeline setup shapes. The adapter should be tested independently so UI changes do not silently drift the demo configuration model.

## Convex Tables

### `demo_timelineTemplates`

One row per timeline template.

Fields:

- `orgKey`
- `templateKey`
- `title`
- `description`
- `summary`
- `isDefault`
- `sortOrder`
- `seedVersion`
- `createdAt`
- `updatedAt`

Indexes:

- `by_org`
- `by_template`, using `orgKey` and `templateKey`

### `demo_timelineTemplateMilestones`

One row per milestone in a template worksheet.

Fields:

- `orgKey`
- `templateKey`
- `milestoneKey`
- `name`
- `type`
- `icon`
- `order`
- `durationDays`
- `percentageBps`
- `included`
- `dependencyKeys`
- `createdAt`
- `updatedAt`

Indexes:

- `by_template`
- `by_template_and_order`
- `by_milestone`, using `orgKey`, `templateKey`, and `milestoneKey`

### `demo_timelineTemplateSubmilestones`

One row per sub-milestone in a milestone worksheet.

Fields:

- `orgKey`
- `templateKey`
- `milestoneKey`
- `submilestoneKey`
- `name`
- `description`
- `order`
- `durationDays`
- `percentageBps`
- `createdAt`
- `updatedAt`

Indexes:

- `by_milestone`
- `by_milestone_and_order`

### `demo_timelineDrawScenarios`

One row per draw scenario for a template.

Fields:

- `orgKey`
- `templateKey`
- `scenarioKey`
- `name`
- `description`
- `isActive`
- `isDefault`
- `sortOrder`
- `seedVersion`
- `createdAt`
- `updatedAt`

Indexes:

- `by_template`
- `by_scenario`, using `orgKey`, `templateKey`, and `scenarioKey`
- `by_template_active`, using `orgKey`, `templateKey`, and `isActive`

### `demo_timelineDrawScenarioDraws`

One row per editable draw inside a scenario.

Fields:

- `orgKey`
- `templateKey`
- `scenarioKey`
- `drawKey`
- `label`
- `order`
- `timingDay`
- `amountBps`
- `amountMode`
- `reviewNote`
- `createdAt`
- `updatedAt`

`amountMode` is `percentage` in v1. Scenario draw amounts are stored in basis points so a scenario remains reusable across different entered project budgets.

Indexes:

- `by_scenario`
- `by_scenario_and_order`

### `demo_timelineSettingsEvents`

Lightweight audit events for settings changes.

Fields:

- `orgKey`
- `entityType`
- `entityKey`
- `eventType`
- `command`
- `actorPersona`
- `priorState`
- `newState`
- `reason`
- `warnings`
- `createdAt`

Events should be recorded for seeding, template save, template reset, scenario create, scenario save, scenario delete, scenario reset, and active scenario changes.

## Convex Functions

### Queries

`getTimelineDemoSettings`

Returns templates, milestones, sub-milestones, scenarios, scenario draws, active scenario state, and completeness flags.

The response should be bounded to timeline demo settings only. It should not expose unrelated demo workspace data.

### Mutations

`seedTimelineDemoDefaults`

Creates missing default templates, template rows, default scenarios, and scenario draws. It must be idempotent and must not overwrite existing staff edits.

`saveTimelineTemplateWorksheet`

Replaces the canonical worksheet for a template after validating the full submitted structure.

`resetTimelineTemplateToDefaults`

Overwrites a single template worksheet with seeded defaults after confirmation.

`createTimelineDrawScenario`

Creates a scenario from blank, duplicate, or generated-standard mode.

`saveTimelineDrawScenario`

Saves scenario metadata and replaces its draw rows.

`setActiveTimelineDrawScenario`

Marks exactly one scenario active for a template.

`deleteTimelineDrawScenario`

Deletes a non-active scenario and its draw rows.

`resetTimelineDrawScenarioToDefaults`

Overwrites a default scenario with seeded defaults after confirmation.

## Seed Defaults

The settings page must include a `Seed defaults` button for admins. It appears prominently when required timeline demo templates or scenarios do not exist in Convex.

The button opens a confirmation modal. The copy should explain that seeding creates missing defaults only and does not overwrite existing staff edits.

The seed mutation must be safe to press more than once. It should:

- insert missing default templates,
- insert missing default template milestones,
- insert missing default sub-milestones,
- insert missing default draw scenarios,
- insert missing default scenario draws,
- ensure a seeded template has one active scenario when scenarios are created,
- record a settings event.

It should not:

- overwrite an existing template,
- overwrite an existing milestone row,
- overwrite an existing staff-created scenario,
- reset active scenario selection if a valid active scenario already exists.

Reset actions are separate and always require confirmation.

## Settings Page UI

The `/backoffice/settings` page should be a restrained operational admin surface. It should use the existing backoffice shell and sidebar.

Top-level layout:

- page title: `Settings`
- compact description
- status strip for demo settings health
- section navigation with `Demos` active
- main `Timeline demo` settings workspace

The page starts with one settings section only, but the structure should allow future sections without redesign.

## Timeline Demo Workspace

The workspace has three regions.

### Template Selector Rail

Displays the available templates:

- Single Family Full Build
- Single Family Renovation
- Multi-plex Build

Each template item shows:

- title,
- milestone count,
- total PoC,
- total duration,
- active scenario name,
- missing-data warning,
- unsaved-change indicator.

Selecting a template updates the editor panes without discarding local dirty state for other templates.

### Template Settings Tab

This adapts the existing Step 2 milestone table from `/demo/timeline`, using PoC instead of Budget.

Columns:

- Name
- Sub-milestones
- PoC %
- Duration
- Include/Exclude
- Expand

Capabilities:

- reorder milestone rows,
- edit milestone names,
- edit milestone type and icon through a constrained selector backed by the existing `IsometricIconKey` values,
- edit milestone duration,
- edit milestone PoC percentage,
- include/exclude rows,
- add custom milestones,
- expand rows,
- edit sub-milestones in a two-pane editor,
- add and remove sub-milestones.

Footer metrics:

- included milestone count,
- total PoC,
- total duration,
- active scenario.

Save behavior:

- Staff edits remain local until `Save template` is pressed.
- Save is blocked until included milestone PoC equals `100.00%`.
- Pressing Save opens a confirmation modal.
- Confirming calls the Convex save mutation and updates the canonical demo template.

Confirmation modal copy should make the impact clear: this updates the canonical timeline demo template used by staff demos.

### Draw Scenarios Tab

Draw scenarios are scoped to the selected template.

Left side:

- scenario list or cards,
- active badge,
- draw count,
- total draw percentage,
- create, duplicate, delete actions.

Right side:

- editable scenario metadata,
- editable draw table.

Draw table columns:

- label,
- timing day,
- amount percentage,
- review note,
- order,
- row actions.

Capabilities:

- create scenario,
- duplicate scenario,
- rename scenario,
- edit description,
- add draw,
- remove draw,
- reorder draws,
- set scenario active,
- delete non-active scenario,
- save scenario,
- reset default scenario.

For v1, scenario edits control draw timing, draw amount, label, note, and active scenario only. The template PoC worksheet remains the source for milestone timing and budget allocation.

## Data Flow

### Read Flow

`/backoffice/settings` calls `getTimelineDemoSettings`.

The response is normalized into editable client state:

- template metadata,
- worksheet milestones,
- sub-milestones,
- scenarios,
- scenario draws,
- completeness status,
- dirty flags.

The UI tracks template worksheet dirty state separately from scenario dirty state.

### Template Save Flow

Staff edits a worksheet locally, then presses `Save template`.

The client validates:

- included PoC total,
- row names,
- durations,
- sub-milestone names,
- dependency consistency.

The confirmation modal summarizes:

- template title,
- included milestone count,
- total PoC,
- total duration,
- affected demo.

On confirm, `saveTimelineTemplateWorksheet` replaces the canonical template worksheet and records an event.

### Scenario Save Flow

Staff edits scenario metadata or draw rows locally, then presses `Save scenario`.

The client validates:

- scenario name,
- unique scenario name within the template,
- draw labels,
- non-negative timing days,
- positive draw percentages.

On confirm, `saveTimelineDrawScenario` replaces scenario rows and records an event.

### Active Scenario Flow

Staff presses `Set active`.

The confirmation modal explains that the selected scenario will drive the template's timeline demo. On confirm, `setActiveTimelineDrawScenario` makes exactly one scenario active for that template and records an event.

## Validation Rules

### Template PoC Worksheet

- Included milestone PoC must total exactly `10_000` bps, displayed as `100.00%`.
- Each included milestone must have a positive duration.
- Included milestones must have non-empty names.
- Milestone keys must be stable.
- Sub-milestones must have non-empty names.
- Excluded rows can have `0` PoC and are not counted in the included total.
- Custom milestone keys are generated once and remain stable.
- Dependencies referencing removed or excluded rows are removed during save validation and reported in the confirmation modal.

### Draw Scenarios

- Scenario name is required.
- Scenario name must be unique within a template.
- Draw labels are required.
- Draw timing day must be non-negative.
- Draw amount percentage must be positive.
- Total draw percentage should equal `100.00%`; if not, show a blocking validation error for v1 to keep demo interpretation clear.
- Active scenario cannot be deleted.
- A seeded template must have exactly one active scenario.

## Timeline Demo Integration

`/demo/timeline` should read the active template/scenario settings from Convex.

When staff selects a template in the setup flow:

- template worksheet rows come from Convex settings,
- PoC percentages allocate the entered project budget into milestone amounts,
- milestone durations come from the worksheet,
- sub-milestones come from the worksheet,
- active scenario draw rows override generated draw markers for that template.

If settings are missing:

- `/backoffice/settings` shows a configuration-needed state and Seed defaults action.
- `/demo/timeline` uses a read-only local fallback for the current request and shows a non-blocking configuration notice, so the public demo route remains usable while defaults are being seeded.

## Error Handling

Recoverable states should keep staff edits intact.

Cases:

- Missing all templates: show Seed defaults, no editor.
- Missing worksheet rows: show Worksheet missing with Seed defaults and Reset template.
- Missing scenarios: show No draw scenarios with Seed defaults and Create scenario.
- Missing active scenario: show a blocking warning until staff sets one active.
- Scenario has no draws: show an empty draw table with Add draw and Generate standard draws.
- Validation failure: show row-level errors and footer summary.
- Mutation failure: keep local edits, show Sonner toast, and show inline action-bar error.

## Component Boundaries

Suggested frontend units:

- `TimelineDemoSettingsPage`
- `DemoSettingsStatusStrip`
- `TimelineTemplateSelector`
- `TimelineTemplateSettingsTab`
- `TimelinePocWorksheetTable`
- `TimelineSubmilestoneEditor`
- `TimelineDrawScenariosTab`
- `TimelineScenarioList`
- `TimelineScenarioDrawTable`
- `ConfirmSettingsMutationDialog`
- `timelineDemoSettingsAdapter`

The worksheet table should share behavior with the existing setup flow table where practical. The implementation can extract shared row types, PoC/budget allocation helpers, and sub-milestone editing primitives rather than copying the table wholesale.

## Testing Plan

### Convex Tests

- `seedTimelineDemoDefaults` is idempotent.
- Seeding fills missing defaults without overwriting edited rows.
- Saving a template worksheet requires exactly `100.00%` included PoC.
- Saving a template replaces milestone and sub-milestone rows for that template only.
- Saving scenarios validates names and draw rows.
- Setting an active scenario leaves exactly one active scenario per template.
- Deleting an active scenario is blocked.
- Reset to defaults overwrites only the confirmed template or scenario.

### Frontend Unit Tests

- PoC table totals and validation states.
- Dirty state is isolated between template and scenario tabs.
- Adapter converts Convex template settings into timeline setup template shape.
- Adapter converts active scenario draws into timeline draw markers.
- Confirmation dialog blocks accidental canonical saves.

### E2E Tests

- Settings page seeds defaults, reloads, and displays seeded templates.
- Staff edits a template PoC value, balances totals, saves through confirmation, reloads, and sees persistence.
- Staff creates a non-optimized draw scenario, sets it active, and reloads.
- `/demo/timeline` uses the active scenario for the selected template.
- Missing-data state leads the admin to seed defaults.

## Documentation

Add an implementation note in `docs/drawflow-demo/` explaining:

- how timeline demo settings are seeded,
- how templates map to PoC worksheets,
- how draw scenarios map to demo draw markers,
- how active scenario selection affects `/demo/timeline`,
- how reset differs from seed.

## Open Decisions Resolved

- Persistence must be through Convex, across sessions and machines.
- Draw scenarios only control draw timing, draw amount, label, note, and active scenario in v1.
- Template changes update the canonical demo template only after explicit Save and confirmation.
- Admins need a Seed defaults button for missing Convex defaults.

## Implementation Notes

- Read `convex/_generated/ai/guidelines.md` before editing Convex code.
- Use `fluent-convex` only for Convex functions.
- Use Bun commands for install, test, build, codegen, and TypeScript checks.
- Preserve existing user changes in the working tree.
- Keep the first implementation scoped to Timeline Demo settings while leaving room for future settings sections.
