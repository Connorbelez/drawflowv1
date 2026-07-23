# Timeline Demo Settings

Timeline demo settings are a demo-only Convex-backed configuration surface for `/backoffice/settings` and `/demo/timeline`.

## Seeding

Use **Seed defaults** in `/backoffice/settings` to insert missing timeline demo templates, PoC worksheet rows, draw scenarios, scenario draws, and settings events. Seeding is idempotent: it inserts missing defaults only and does not overwrite local edits. Reset actions are separate and intentionally destructive for one confirmed template or scenario.

## Template Worksheets

Templates represent construction roadmap assumptions. Each template milestone stores:

- name, type, constrained icon, duration, include/exclude state, and order,
- PoC percentage in basis points,
- nested sub-milestones with description, duration, and PoC basis points.

Included milestone PoC must total `10_000` basis points before a template can be saved.

## Draw Scenarios

Draw scenarios are scoped to a selected timeline template and control reimbursement timing for the demo only. In v1 they control draw label, timing day, amount percentage, review note, and active scenario state. They do not change milestone timing or production draw entities.

Scenario draw percentages must total `10_000` basis points. Active scenario deletion is blocked.

## Timeline Route Mapping

`/demo/timeline` reads the active settings through `timeline-demo-settings-adapter`:

- worksheet PoC allocates the entered project budget across generated timeline milestones,
- worksheet durations drive milestone schedule,
- worksheet sub-milestones populate the setup-generated milestone details,
- active scenario draws override generated reimbursement markers.

If settings are missing, `/demo/timeline` remains usable with the local read-only fallback and shows a configuration notice.

## Scope Decision

This release has no authz and no organization scoping for the timeline demo settings tables or functions. The schema is intentionally demo-only and isolated from production DrawFlow Build, Loan, Budget, Milestone, Draw, Evidence Package, Site Visit, Policy, Webhook Config, and Audit Event tables.
