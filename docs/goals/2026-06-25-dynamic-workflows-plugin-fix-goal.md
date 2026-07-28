# Goal Prompt: Fix Dynamic Workflows Plugin Planning Failures

Copy-paste this as the goal prompt for the implementation agent.

```text
You are fixing the Dynamic Workflows Codex plugin itself.

Primary source of truth:
- Read `/Users/connor/Dev/drawFlow/v1/drawflowv1/docs/dynamic_workflows_plugin_postmortem.md` completely before making changes.
- Fix the canonical plugin source at `/Users/connor/plugins/dynamic-workflows`.
- Treat `/Users/connor/.codex/plugins/cache/connor-local/dynamic-workflows/0.1.0+codex.20260623012246` only as the installed cache copy for comparison/verification, not as the source to edit.

Important constraint:
- Do not rely on the Dynamic Workflows plugin as the planner for this task. It is the broken system under repair. Use ordinary repo/source inspection, code edits, deterministic tests, and evidence.

Objective:
Implement the fixes described in `dynamic_workflows_plugin_postmortem.md` so Dynamic Workflows can reliably create high-fidelity, research-grounded workflow designs for broad product/architecture requests. The plugin must no longer accept an empty or generic strict workflow design for a major feature request like the DrawFlow AI assistant upgrade. It must preserve raw intent, run a research-first design compiler, create durable artifacts, support design revision/import, expose the lifecycle through MCP, add a DrawFlow assistant upgrade pattern, and enforce strong fidelity/risk gates with regression tests.

Background failure to fix:
In Codex thread `019f0037-42c4-7543-86e1-f45a6a08e586`, the agent summarized a rich DrawFlow AI assistant request into a generic goal string. The plugin generated a strict workflow design with:
- workflow type `generic`
- deliverables `completed workflow deliverables`
- no named skills
- packet count `0`
- no risk gates
- all fidelity checks passing

That must become impossible.

Required implementation work:

1. Raw prompt preservation
- Add `dwf init --goal-file <path>` support.
- Preserve the exact raw prompt as `source-prompt.md` in the run directory.
- Store both raw source prompt and derived/normalized objective separately in state.
- Avoid shell escaping and lossy summarization as the only input path for long goals.
- Update help output and tests.

2. Research-first workflow compiler for strict/broad work
- Add a major-feature pre-design pipeline that runs before final workflow design approval.
- Create durable artifacts:
  - `intent.md`
  - `intent.json`
  - `research-plan.json`
  - `research.md`
  - `questions.json`
  - research subagent job files
  - research subagent result files
  - `workflow-plan.md`
  - `workflow-plan.json` if useful
- The pipeline must:
  - determine user intent
  - determine required codebase and external research
  - generate senior-engineer planning questions
  - dispatch isolated research jobs where each job receives only its bounded question, repo path, hints, and output schema
  - aggregate results into `research.md`
  - create a high-level workflow plan before rendering final `workflow-design.md`
- If actual subagent spawning is not available in this plugin runtime, create deterministic file-backed job packets and result-recording commands consistent with existing subagent protocols. Do not fake completion silently.

3. Design lifecycle improvements
- Add CLI support for:
  - `dwf research init --run <run-id>`
  - `dwf research questions --run <run-id>`
  - `dwf research write-jobs --run <run-id>`
  - `dwf research record-result --run <run-id> --job <job-id> --file <result.json>`
  - `dwf research synthesize --run <run-id>`
  - `dwf plan render --run <run-id>`
  - `dwf plan record-result --run <run-id> --file <workflow-plan.md-or-json>`
  - `dwf design render --run <run-id> --from-plan`
  - `dwf design revise --run <run-id> --reason <text>`
  - `dwf design import --run <run-id> --file <workflow-design.json>`
- Rejected designs must be revisable without silently losing the rejection reason.
- Imported or revised designs must not be silently regenerated on approval.
- Approval should approve the exact design under review unless the operator explicitly asks for regeneration.

4. MCP parity
- Extend `mcp/server.mjs` so agents do not have to source-spelunk or shell out for core lifecycle operations.
- Expose MCP tools for:
  - init
  - research init/questions/write-jobs/record-result/synthesize
  - plan render/record-result
  - design render/status/approve/reject/revise/import
  - goal attach
  - grill next/answer/defaults
  - contract render/accept
  - approvals list/answer
  - compile
  - subagents write-jobs/list/record-result
  - gates evaluate
  - complete check
  - status/list/export/render UI
- Add tests that verify the MCP tool list includes the lifecycle tools needed by the skill.

5. DrawFlow assistant platform upgrade pattern
- Add a first-class workflow pattern/type for `assistant-platform-upgrade`.
- Trigger it from terms like:
  - assistant
  - natural language interface
  - multi-step workflow
  - HITL
  - mutating action
  - generative UI
  - action toolkit
  - platform capabilities
  - personas
  - DrawFlow
  - FairLend
  - build/milestone/draw/evidence/site visit/proposal/reminder
- For the DrawFlow assistant prompt, generate a concrete packet topology with at least these packet families:
  - product-domain-discovery
  - existing-assistant-architecture-map
  - route-and-capability-inventory
  - persona-workflow-ideation
  - action-toolkit-architecture
  - convex-assistant-backend
  - client-action-bridge
  - inline-generative-hitl-ui
  - selector-and-form-components
  - audit-risk-policy
  - workos-and-permission-review
  - docs-and-specs
  - test-fixtures-and-simulated-workflows
  - browser-verification
  - independent-security-review
  - final-integration-verification
- Make allowed path ownership repo-aware for DrawFlow:
  - `convex/**`
  - `convex/_generated/ai/guidelines.md`
  - `src/features/assistant/**`
  - `src/components/ui/**`
  - `src/routes/**`
  - `docs/**`
  - `tests/**`
  - `src/**/*.test.ts`
  - `src/**/*.test.tsx`
- Do not route Convex backend work to generic `src/server/**` paths for this repo.

6. Stronger risk gates
- Expand risk detection so the following trigger explicit gates:
  - mutating action
  - HITL checkpoint
  - approval/admin approval
  - draw release
  - WorkOS organization/member/role/permission/account changes
  - production/customer data
  - evidence packages
  - site visits/geofence overrides
  - webhook events
  - external publishing
  - destructive filesystem/database/schema work
  - expensive fanout
- For the DrawFlow assistant prompt, required risk gates must include at least:
  - mutating-actions-hitl
  - approvals-and-draw-release
  - workos-account-permissions
  - sensitive-production-customer-data
  - external-publishing-webhooks
  - expensive-fanout

7. Stronger fidelity checks
- Strict or broad workflow designs must fail closed when:
  - packet count is zero
  - no research artifact exists before design
  - no workflow plan exists before design
  - implementation is requested but no implementation packet exists
  - tests/verification are requested but no test/verification packet exists
  - mutating/HITL/risk-bearing work is mentioned but no relevant risk gates exist
  - domain-specific product terms are lost
  - named skills/workflows are lost
  - fidelity checks only pass vacuously because an array is empty
  - allowed paths do not match discovered repo backend/frontend structure
- Keep direct/lightweight small-task flows working; do not over-orchestrate one-line edits.

8. Documentation updates
- Update `skills/dynamic-workflow/SKILL.md` so the mandatory workflow explains the new research-first phase for strict/broad work.
- Document the new commands and MCP lifecycle.
- Document when raw prompt preservation, research jobs, plan rendering, and design revision/import should be used.

9. Tests and verification
- Add regression tests using the exact DrawFlow assistant prompt below.
- Existing tests must still pass.
- Add focused tests for:
  - `--goal-file` raw prompt preservation
  - research artifacts before final design approval
  - isolated research job/result workflow
  - workflow-plan rendering before final design
  - design revise/import without silent regeneration
  - MCP lifecycle tool exposure
  - assistant-platform-upgrade classification/pattern
  - DrawFlow-aware packet allowed paths
  - required mutating/HITL/WorkOS/draw-release risk gates
  - zero-packet strict workflow designs fail fidelity
- Run:
  - `node --test tests/*.test.mjs` from the plugin root
  - `node skills/dynamic-workflow/scripts/dwf validate self` from the plugin root
  - any package script that wraps those checks
- If you modify this DrawFlow repo only for docs/prompts, run no unrelated DrawFlow app tests. If you modify DrawFlow code, use Bun per repo rules.

Regression prompt that must be used in tests:

I want to significantly improve the AI assistant's usefulness. I want it to essentially be a natural language interface to the platform and capable of handling multi-step workflows. The system should provide the agent very high levels of autonomy, but use HITL safeguards for any mutating action. This means planning out multi-step actions/workflows. I want it to be able to do things beyond hardcoded workflows, it should have a toolkit that when composed together can carry out any action or workflow done on the platform.

For the dynamic workflow I want you to create I want you to work to think of every possible way we can maximize the AI assistant's functionality. Stop and think: what would be useful here? What would be helpful? What would reduce friction? What would amaze someone using it of its capabilities?

I want you then iterate on every possible idea you have with subagents, and develop and test each of those possibilities.

I do not want these to be half-assed. These capabilities should go the extra mile. For each capability ask: how can we reduce friction, how can this be improved, and how can we lower the amount of work the human has to do?

For instance, if I ask it to create a new garden suite build:
- Level 1: Navigate the user to the new build page.
- Level 2: Navigate the user to the new build page and select the garden suite option.
- Level 3: Generate the complete form required to create a garden suite build as an inline chat UI with the proposed start date selector, total budget field, max cash on hand field, co-pay amount, autocomplete address selection, build permit upload field, and a submit button that acts as a HITL checkpoint.

I want level 3 for everything.

Another example: "add a reminder to purchase stucco for my supplier" from a random route other than an active build.
- Level 1: Say an active build is needed.
- Level 2: Plan the workflow and ask which build and milestone the reminder is for.
- Level 3: Present generative UI inline in the chat that lets the user select the build from an autocomplete selector, optionally select an attached milestone, drafts editable title/content/time/date fields, and provides a HITL confirmation checkpoint.

Once again, I want level 3.

The examples are illustrative only. The agent must look at all capabilities of the DrawFlow platform, consider all user personas, and brainstorm what would make each person's work easier and genuinely impressive.

Definition of done:
- The original failed prompt can no longer produce a strict workflow with zero packets and no risk gates.
- The generated design is research-grounded and DrawFlow-aware.
- The workflow design contains durable research and plan artifacts before final approval.
- The plugin exposes the needed lifecycle through CLI and MCP.
- Design revision/import is supported and does not regenerate reviewed designs unexpectedly.
- Fidelity and risk gates fail closed for generic/empty strict designs.
- All plugin tests and self-validation pass.
- The final response lists changed files, tests run, and any remaining risks. Do not claim completion without evidence.
```
