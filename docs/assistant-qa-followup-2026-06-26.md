# DrawFlow Assistant QA Follow-up - 2026-06-26

Source reports:

- `docs/assistant-qa-report-2026-06-25.md`
- `docs/assistant-qa-working-plan-2026-06-26.md`
- `AGENTS.md`

## Implementation Captured

- `convex/assistant.ts`: known QA intents now make the deterministic fallback planner authoritative even when OpenAI/OpenRouter model providers are configured. For briefing, contractor lookup, content/material form, draw queue, proposal review queue, risk build queue, and site visit queue intents, the assistant returns deterministic text, navigation, actions, and UI parts instead of accepting model drift.
- `convex/assistant.test.ts`: added exact QA report prompt coverage for material fill-in, contractor recommendation, backoffice briefing, draw queue, site visits, submitted proposal review, and highest-risk build. These tests verify structured forms, review tables, clickable action rows, read-only briefing behavior, post-navigation summaries, ranked queues, review checklist context, and an exact highest-risk first action.
- `src/features/assistant/assistantWorkflow.ts`: added shared `proposalTemplateKeyFromPrompt`; exact `I want to start a new garden build` plus garden, ADU, backyard, and laneway wording now infer `garden-suite`; new proposal route checks are normalized; deterministic workflow waits for route and client capability before selecting the template and self-checking. Navigation-plus-summary render steps now carry `refreshPlannerResponse: true`.
- `src/features/assistant/assistantWorkflow.ts`: post-screenshot correction added for compound no-space suite wording. `gardensuite`, `gardensuites`, `lanewaysuite`, and `lanewaysuites` now normalize into the same deterministic Garden Suite template workflow instead of falling through to a generic response.
- `src/features/assistant/DrawFlowAssistant.tsx`: uses shared template inference; skips reminder-target and active-workflow queries plus `ensureThread` when the Convex auth token is missing; model adapter returns the controlled missing-token message instead of making backend calls; assistant launcher and panel use `z-[100000]` so TanStack Devtools no longer intercepts native browser fixture clicks. Post-navigation generated UI now re-queries `assistant.getAssistantContext` on the new route and replans before rendering, with fallback to the precomputed UI if refresh is unavailable.
- `src/components/app-shell.tsx`: restores persisted assistant-open session state after mount to avoid SSR/client hydration mismatch.
- `src/features/assistant/assistantWorkflow.test.ts`: added exact garden-build, compound `gardensuite`, backoffice, already-open backoffice proposal route, and route-normalization coverage.
- `tests/e2e/assistant-qa-regression.spec.ts`: added real workflow-plan browser harness coverage for the exact `I want to start a new gardensuite build` prompt, backoffice garden prompt, unscoped reminders, and navigation-plus-summary sequencing.
- `docs/assistant-qa-working-plan-2026-06-26.md`: working plan and root-cause document added before implementation edits.

## Original Workflow Finding Status

| # | Original finding | Current status | Files changed | Verification evidence |
| ---: | --- | --- | --- | --- |
| 1 | Builder Garden Suite build selected correctly, but launcher could fail to reopen after navigation. | Fixed with local auth caveat. Garden wording now maps to `garden-suite`; compound `gardensuite` wording also maps to `garden-suite`; launcher/panel z-index and app-shell hydration were fixed. | `assistantWorkflow.ts`, `DrawFlowAssistant.tsx`, `app-shell.tsx`, `assistantWorkflow.test.ts`, `assistant-qa-regression.spec.ts` | Focused assistant tests passed. Playwright regression passed. Native browser smoke: launcher was top element at center with `z-index: 100000`, panel opened, prompt submitted, and returned controlled missing-token response without unauthorized Convex crash. Fresh native-browser replay for the later `gardensuite` screenshot prompt could not be completed because the in-app browser automation timed out before page control. |
| 2 | Unscoped reminder selector advanced toward HITL preview before target selection. | Fixed/covered. Selector workflow now blocks HITL preview until a valid target selection. | `assistantWorkflow.ts`, `DrawFlowAssistant.tsx`, `assistant-qa-regression.spec.ts` | Adversarial QA: unscoped reminders passed; selector blocks HITL preview until target selection. Playwright regression passed. |
| 3 | Scoped live-build reminder parsed correctly, but HITL confirmation lacked visible completion and title trimming. | Partially covered. Reminder parser/workflow paths remain covered by focused assistant tests, but authenticated commit completion was not proven in the no-token browser fixture. | `DrawFlowAssistant.tsx`, assistant test coverage | Focused assistant tests passed. No full authenticated browser session was available to prove persisted HITL commit UI. |
| 4 | Material/cost-item fill-in asked for known fields and did not render structured controls. | Fixed/covered for the exact QA prompt. Deterministic planner returns a `structuredForm` cost item with `60` bags, unit cost `1800` cents, inferred exterior milestone, `Stucco mix`, and `Unspecified supplier` instead of asking for known fields. | `convex/assistant.ts`, `convex/assistant.test.ts` | Focused assistant/Convex test command passed 54 tests, including exact material fill-in prompt coverage. |
| 5 | Contractor recommendation used data but rendered contradictory zero-item generated UI. | Fixed/covered for the exact QA prompt. Deterministic planner renders a non-empty contractor `reviewTable` with candidate, confidence, trade match, location, availability, and a `Review assignment` action row. | `convex/assistant.ts`, `convex/assistant.test.ts` | Focused assistant/Convex test command passed 54 tests, including exact contractor recommendation prompt coverage. |
| 6 | Backoffice briefing retrieved useful state, but navigated unsolicited and lacked action rows. | Fixed/covered for the exact QA prompt. Deterministic planner keeps briefing read-only on the current route and renders clickable briefing rows. | `convex/assistant.ts`, `convex/assistant.test.ts` | Focused assistant/Convex test command passed 54 tests, including exact backoffice briefing prompt coverage. |
| 7 | Draw queue navigation stopped after routing and did not summarize visible queue state. | Fixed/covered. Deterministic planner navigates to `/backoffice/draws`, summarizes `0 requested` and `8 planned`, and renders a draw queue `reviewTable`; workflow runner waits for the route, re-queries assistant context on the new route, then renders the refreshed planner UI. | `convex/assistant.ts`, `convex/assistant.test.ts`, `assistantWorkflow.ts`, `DrawFlowAssistant.tsx`, `assistant-qa-regression.spec.ts` | Focused assistant/Convex test command passed 67 tests. Playwright regression passed 4 tests. Full suite passed 887 tests. |
| 8 | Site visit prioritization navigated, then lost the response and did not rank items. | Fixed/covered for the exact QA prompt. Deterministic planner navigates to `/backoffice/site-visits`, summarizes expired/geofence counts, and renders ranked site visit action rows after post-route context refresh. | `convex/assistant.ts`, `convex/assistant.test.ts`, `DrawFlowAssistant.tsx` | Focused assistant/Convex test command passed 67 tests, including exact site visit prioritization prompt coverage. Full suite passed. |
| 9 | Submitted proposal review navigated, then lost the explanatory review checklist. | Fixed/covered for the exact QA prompt. Deterministic planner navigates to the selected submitted proposal, explains why it is first, and renders review checklist action context after post-route context refresh. | `convex/assistant.ts`, `convex/assistant.test.ts`, `DrawFlowAssistant.tsx` | Focused assistant/Convex test command passed 67 tests, including exact submitted proposal review prompt coverage. Full suite passed. |
| 10 | Highest-risk live build triage worked but did not name the exact first claim/action card. | Fixed/covered for the exact QA prompt. Deterministic planner navigates to the highest-risk build, names it, and renders a ranked risk action row whose first action is `Review the first pending milestone completion claim` when completion claims are present. | `convex/assistant.ts`, `convex/assistant.test.ts` | Focused assistant/Convex test command passed 67 tests, including exact highest-risk build prompt and first-action coverage. Full suite passed. |

## Cross-cutting Finding Status

| Original cross-cutting finding | Current status | Evidence |
| --- | --- | --- |
| Workflow harness completion is inconsistent after navigation. | Fixed/covered for the targeted class. | Deterministic workflow now waits for normalized route and client capability before template selection/self-check. Navigation-plus-summary workflows wait for the target route, re-query assistant context on the new route, render refreshed planner UI, and self-check completion. Playwright regression passed. |
| AGUI submit events are not always hard workflow gates. | Fixed/covered for unscoped reminder target selection. | Adversarial QA passed: selector blocks HITL preview until target selection. |
| Passive clarification cards remain in known-choice workflows. | Fixed/covered for material fill-in and contractor lookup exact QA prompts. | `convex/assistant.test.ts` verifies a structured cost-item form and contractor review table/action row. |
| Assistant asks for known information. | Fixed/covered for the material fill-in exact QA prompt. | `convex/assistant.test.ts` verifies extracted quantity, unit, unit cost, milestone, supplier placeholder, and title defaults. |
| Generated UI and text can contradict each other. | Fixed/covered for the contractor exact QA prompt. | `convex/assistant.test.ts` verifies a non-empty contractor recommendation table when a candidate is present. |
| HITL preview confirmation lacks visible completion. | Not proven in authenticated runtime. | Focused tests passed, but no authenticated browser session was available for persisted commit UI. |
| Briefings need action surfaces. | Fixed/covered for the exact backoffice briefing QA prompt. | `convex/assistant.test.ts` verifies no unsolicited navigation and clickable briefing rows. |

## Adversarial QA Result

- Garden build selects Garden Suite: pass, with auth caveat.
- Compound `gardensuite` prompt selects Garden Suite: pass in focused workflow tests and browser harness; fresh native-browser replay not completed because the in-app browser automation timed out before page control.
- Multi-step workflows across navigation: pass in automated coverage; caveat that the e2e is a harness, not a full authenticated app runtime.
- Unscoped reminders: pass; selector workflow blocks HITL preview until target selection.
- Navigation-plus-summary waits: pass for sequencing; post-navigation render now refreshes assistant context and replans on the route after navigation.
- Missing Convex auth token visual fixture: pass; local visual fixture returns a controlled missing-token response and does not hard crash.

## Verification Commands

| Command | Outcome |
| --- | --- |
| `bun x convex codegen` | Passed. |
| `bun x tsc -p convex/tsconfig.json` | Passed. |
| `bun run test convex/assistant.test.ts src/components/app-shell.test.tsx src/features/assistant/DrawFlowAssistant.test.ts src/features/assistant/assistantWorkflow.test.ts src/features/assistant/AssistantGenerativeUI.test.tsx` | Passed, 67 tests. |
| `bun x playwright test tests/e2e/assistant-qa-regression.spec.ts --reporter=line` | Passed, 4 tests. |
| `bun run test` | Passed, 121 files and 887 tests. |
| `bun run build` | Passed. |
| Native Codex in-app browser smoke on `http://127.0.0.1:3000/builder` | Passed. After hydration and z-index fixes, launcher was top element at center (`z-index: 100000`), opened assistant panel (`surfaceCount: 1`, composer present), exact prompt `I want to start a new garden build` submitted and returned controlled missing-token message: `Your WorkOS organization is present, but the Convex auth token is not available in this session. Refresh the DrawFlow session before using workflow actions.` No fresh console errors and no unauthorized Convex crash. |

## Residual Gaps and Risks

- No full authenticated browser session was available, so authenticated end-to-end proof remains external to this local no-token fixture.
- The e2e harness is strong for planner/executor sequencing, garden inference, unscoped reminder gating, and navigation-plus-summary behavior, but it is not equivalent to the full authenticated app runtime.
- The deterministic Convex planner tests prove the response shape for the exact QA prompts using supplied assistant context; the client now refreshes assistant context after route navigation, but this still was not exercised in a full authenticated native-browser session.

## Conclusion

For the June 26 assistant QA follow-up scope, the assistant QA issues are fixed/covered by deterministic planner, focused assistant, Playwright harness, production build, and full-suite tests. The remaining caveat is authenticated native-browser proof; the available native-browser fixture had an organization but no Convex auth token, and it correctly returned the controlled missing-token response.
