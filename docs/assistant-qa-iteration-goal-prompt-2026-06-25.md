# Goal Prompt: DrawFlow Assistant QA Iteration Loop

Use this prompt with `/goal`.

```text
/goal Use `/Users/connor/Dev/drawFlow/v1/drawflowv1/docs/assistant-qa-report-2026-06-25.md` as the QA source of truth.

The DrawFlow AI assistant is still failing real product workflows. Do not treat the previous fixes, follow-up report, or tests as sufficient. The current observed failure is:

- Prompt: `I want to start a new garden build`
- Route changed to `/backoffice/proposals/new`
- The assistant marked the workflow complete after navigation and a generic post-navigation summary
- The proposal setup screen still had `Single Family Full Build` selected
- `Garden Suite` was visible but not selected
- The assistant rendered a useless blank `New build workflow` next-step card
- Screenshots:
  - `/Users/connor/Library/Application Support/CleanShot/media/media_atsSxIj3uy/CleanShot 2026-06-25 at 21.41.26@2x.png`
  - `/Users/connor/Library/Application Support/CleanShot/media/media_QTF3WRkga0/CleanShot 2026-06-25 at 21.41.40@2x.png`

Your job is to iterate until every workflow in the QA report is brought inline to the ideal product state. This is not a one-pass patch. Keep looping until adversarial manual QA finds no failures, friction, false success claims, bad UX, stale UI, or missing workflow completion.

Project rules:

- Work in `/Users/connor/Dev/drawFlow/v1/drawflowv1`.
- Read `AGENTS.md` and obey it.
- Before touching Convex code, read `/Users/connor/Dev/drawFlow/v1/drawflowv1/convex/_generated/ai/guidelines.md`.
- Use Bun commands: `bun run ...`, `bun x ...`.
- Use existing DrawFlow domain model, route registry, HITL action patterns, AGUI components, COSS/ShadCN primitives, and Convex fluent-convex rules.
- Preserve WorkOS organization scoping, permissions, and role boundaries.
- Do not write directly to WorkOS projection tables.
- Do not create static fixture browser tests that merely hardcode expected states. Browser tests must exercise the real assistant runtime or a faithful app-shell/planner harness that can fail for the actual bug class.

Ideal product state:

1. Multi-step workflows must complete the user's actual goal, not just navigate.
   - Navigation is never completion when the user asked to start/select/create/review/summarize/prioritize/act.
   - After route changes, workflows must resume, verify route, verify required client capability, perform the action, and self-check the actual UI/domain state.
   - The assistant must not claim success until the requested goal is complete.

2. New build/template workflows must be first-class.
   - `garden build`, `garden suite build`, `garden suite`, `laneway suite`, and close variants must infer the Garden Suite template when the user asks to start a new build/proposal.
   - The assistant must select the `Garden Suite` template card on `/builder/proposals/new` or `/backoffice/proposals/new`.
   - It must not leave `Single Family Full Build` selected.
   - It must not render unrelated material/sub-milestone forms or blank next-step cards.
   - Self-check must verify the selected template, not just route or rendered text.
   - Route matching must tolerate trailing slashes, query strings, model-provided routes, and planner/navigation normalization.

3. AGUI interactions must be workflow steps.
   - Selectors, forms, action cards, briefing rows, review tables, and confirmation previews must emit workflow events.
   - `wait_for_agui_submit` must block downstream steps until valid input exists.
   - Never advance into HITL preview generation before required AGUI input exists.
   - No passive numbered-question cards for known-choice workflows.

4. The assistant should infer and draft aggressively, using HITL as correction.
   - Ask clarifying questions only when a required field cannot be inferred.
   - Known choices use controls: dropdowns, buttons, segmented controls, autocomplete, or actionable tables.
   - Every generated UI control must have an obvious next action and valid submit behavior.

5. Fix every QA workflow in `/Users/connor/Dev/drawFlow/v1/drawflowv1/docs/assistant-qa-report-2026-06-25.md`, including:
   - Garden Suite/new garden build workflow remains green and launcher behavior works after selection.
   - Unscoped reminders render a usable build/proposal selector and then create a scoped HITL preview.
   - Scoped live-build reminders commit visibly and show success/failure state.
   - Material fill-in extracts quantity, unit, price, supplier intent, description, and likely milestone into a structured prefilled form/HITL draft.
   - Contractor recommendations render consistent internal-data tables with actionable assignment next steps.
   - Backoffice briefings do not navigate unless asked and include clickable action rows.
   - Draw queue, site visit queue, proposal review, and high-risk build prompts navigate, resume, summarize, and provide next best action.

Required iteration loop:

1. Plan
   - Read the QA report, current assistant code, existing tests, and the latest screenshots.
   - Identify every failing behavior and every weak test seam.
   - Write/update a concise working plan before editing.
   - Include root causes, affected files, and expected verification.

2. Execute
   - Implement permanent fixes end to end across Convex planner/fallbacks, frontend AGUI, workflow state, HITL previews, route navigation, client action registration, and tests.
   - Prefer deterministic product logic over model hope for known DrawFlow workflows.
   - Normalize routes everywhere route identity matters.
   - Clear or gate planner UI when a deterministic workflow owns the user goal.
   - Do not mark workflow self-checks complete unless the actual route/UI/domain state proves completion.

3. Manual QA through subagents
   - Dispatch a fresh-context adversarial QA subagent after each implementation pass.
   - The QA subagent must use Codex Browser/browser automation against the actual app wherever practical.
   - The QA subagent must not rely on your implementation summary.
   - The QA subagent must read only:
     - `/Users/connor/Dev/drawFlow/v1/drawflowv1/docs/assistant-qa-report-2026-06-25.md`
     - relevant current code only as needed to operate the app
     - the two CleanShot screenshots above
   - The QA subagent must play a critical product/user role: look for false success, incomplete actions, wrong route, wrong selected template, stale UI, bad UX, passive controls, confusing copy, missing submit behavior, and bad HITL states.
   - The QA subagent must manually run the workflows from the QA report, including at least these exact prompts:
     - `I want to start a new garden build`
     - `I want to start a new garden suite build`
     - unscoped reminder prompt from the report
     - scoped live-build reminder prompt from the report
     - material fill-in prompt from the report
     - contractor recommendation prompt from the report
     - backoffice briefing prompt from the report
     - draw queue prompt from the report
     - site visit queue prompt from the report
     - proposal review prompt from the report
     - highest-risk build prompt from the report
   - The QA subagent must produce a written finding report with screenshots/evidence where possible, clear pass/fail per workflow, reproduction steps, and UX criticism.

4. Report update through subagent
   - Dispatch a separate fresh-context report subagent after adversarial QA.
   - The report subagent must update or create a QA follow-up document in `/Users/connor/Dev/drawFlow/v1/drawflowv1/docs/`.
   - It must map every original QA finding to:
     - current status
     - what changed
     - what automated test covers it
     - what manual browser behavior was observed
     - remaining friction/failure, if any
   - It must not soften failures. If the workflow is awkward, incomplete, misleading, or falsely green, mark it failing.

5. Loop
   - Read the adversarial QA report and updated follow-up document.
   - If any workflow fails or has material friction, go back to step 1.
   - Continue plan -> execute -> adversarial QA subagent -> report subagent until all workflows are truly inline.
   - Do not stop at “known limitation” unless there is a real external blocker that cannot be worked around locally.

Automated regression coverage required:

- Focused unit tests for workflow planning, route normalization, Garden Suite/new garden build inference, and AGUI event gating.
- Frontend tests for generated UI controls, submit behavior, blank-card prevention, and template-selection workflow execution.
- Browser-level tests for the QA workflows where practical; they must not be static HTML fixtures that hardcode the expected result.
- Convex planner/fallback tests for deterministic known workflows and model-output guardrails.
- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json`
- `bun run test`
- `bun run build`

Completion condition:

You are done only when:

- Every original QA workflow passes in automated coverage and adversarial manual browser QA.
- The prompt `I want to start a new garden build` selects the Garden Suite template and does not falsely mark navigation as completion.
- The prompt `I want to start a new garden suite build` selects the Garden Suite template.
- No unrelated material/sub-milestone form or blank next-step card appears in new-build/template workflows.
- The QA follow-up document has been updated with evidence and current behavior.
- All required commands pass.
- A fresh adversarial QA subagent finds no remaining failures or meaningful UX friction.

Final response requirements:

- Summarize the implemented fixes.
- Link the updated QA follow-up document.
- List the exact automated commands and manual QA passes.
- Include any screenshots or browser evidence paths created by the QA subagent.
- Do not claim completion if any workflow is still false-green, incomplete, confusing, or manually unverified.
```
