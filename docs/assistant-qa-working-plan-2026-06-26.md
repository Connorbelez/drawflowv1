# DrawFlow Assistant QA Working Plan - 2026-06-26

Source of truth: `docs/assistant-qa-report-2026-06-25.md`.

## Root Causes

1. New-build template inference is too narrow. `templateKeyFromPrompt` only recognizes `garden suite` and `laneway suite`, so `I want to start a new garden build` can fall back to plain route navigation and leave `Single Family Full Build` selected.
2. New proposal route checks are exact string comparisons in the workflow planner. They need the same normalization used by queued client actions so trailing slashes, query strings, and model-provided route variants still count as `/builder/proposals/new` or `/backoffice/proposals/new`.
3. Existing browser regression coverage for the QA report is currently a static fixture. It does not exercise the real assistant planner/executor path that caused false-green navigation.
4. The previous QA report classes remain the verification target: AGUI waits must remain hard barriers, HITL commits need durable success/failure UI, generated UI must be actionable, and navigation-plus-summary requests must wait for route and rendered follow-up output before self-check succeeds.

## Affected Files

- `src/features/assistant/assistantWorkflow.ts`: Garden Suite intent inference, normalized route checks, workflow unit tests.
- `src/features/assistant/assistantRouteRegistry.ts`: route matching tests for new-build variants if needed.
- `src/features/assistant/DrawFlowAssistant.tsx`: workflow executor/HITL behavior only if verification shows regressions.
- `src/features/assistant/AssistantGenerativeUI.tsx`: generated selector/form/table behavior only if verification shows regressions.
- `convex/assistant.ts` and `convex/assistant.test.ts`: deterministic planner fallback coverage for QA workflows and model guardrails.
- `tests/e2e/assistant-qa-regression.spec.ts`: replace static fixture coverage with real app-shell/planner or actual app runtime checks.
- `docs/assistant-qa-followup-2026-06-26.md`: final QA follow-up with automated and manual evidence.

## Verification

- Focused unit tests for `I want to start a new garden build`, `garden suite build`, `garden suite`, `laneway suite`, and route variants with trailing slash/query strings.
- Existing assistant workflow tests must still prove AGUI wait barriers and post-navigation self-check behavior.
- Browser-level QA must exercise the actual assistant runtime or faithful app-shell/planner harness, not a static HTML fixture.
- Required commands before completion: `bun x convex codegen`, `bun x tsc -p convex/tsconfig.json`, `bun run test`, and `bun run build`.
- Fresh adversarial QA subagent and separate report-update subagent must run after implementation passes; any failure loops back into this plan.
