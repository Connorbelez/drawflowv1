# Dynamic Workflows Plugin Post-Mortem

Date: 2026-06-25

Thread under review: `019f0037-42c4-7543-86e1-f45a6a08e586`

Plugin inspected: `/Users/connor/.codex/plugins/cache/connor-local/dynamic-workflows/0.1.0+codex.20260623012246`

## Executive Summary

The agent did not primarily struggle with the DrawFlow assistant problem. It struggled with the Dynamic Workflows plugin's planning model.

The user's request was a broad product/architecture workflow: discover the DrawFlow assistant surface, understand platform personas and domain actions, ideate level-3 assistant capabilities, dispatch isolated research/review subagents, synthesize durable research, then produce a high-fidelity workflow design.

The plugin instead starts from a single summarized `--goal` string and renders a deterministic template. That renderer infers workflow packets from narrow keyword families. When the agent summarized the user request into a generic "DrawFlow AI assistant usefulness upgrade" objective, the runtime produced:

- workflow type: `generic`
- deliverables: `completed workflow deliverables`
- named skills: none
- packet count: `0`
- risk gates: none
- fidelity checks: all passing

That is the core failure: the runtime accepted an empty, generic strict workflow design as valid.

The agent then compensated manually: it rejected the bad design, did ad hoc repo discovery, inspected plugin internals, discovered there was no supported design-edit path, and created a replacement run with keyword stuffing (`backend/frontend/docs/tests/security UX`) so the heuristic generator would produce packets. That replacement was still generic: it produced provider/backend/frontend/tests/docs/final-verification packets, not a DrawFlow assistant workflow.

## What The Agent Was Struggling With

1. Preserving intent through plugin initialization

   The user gave a rich prompt with examples, personas, HITL constraints, and "level 3 for everything." The initialized run used a compressed objective:

   `Design and execute a comprehensive DrawFlow AI assistant usefulness upgrade...`

   That compression dropped terms the generator depends on, such as backend, frontend, docs, tests, security, WorkOS, draw release, evidence package, site visit, and concrete domain surfaces.

2. The workflow design generator is keyword-driven

   In `workflow-design.mjs`, `inferPackets` chooses from a few hard-coded families: FairLend landing page experiments, migration, generic parallel research/backend/frontend/docs, audit, simulated review, or frontend visual polish. There is no product discovery stage and no assistant-platform-upgrade pattern.

   The result is brittle. Adding the words `backend/frontend/docs/tests/security` changed the generated packet count from zero to six, without any actual understanding of DrawFlow.

3. The first-class workflow does not start with research

   The skill requires `classify`, `init`, then `design render`. It says the design should include repo context, but the runtime does not collect repo context. The agent had to do discovery after the first design failed.

   For a major feature workflow, the plugin should first create durable research artifacts:

   - raw prompt preservation
   - intent extraction
   - codebase/external research requirements
   - senior-engineer question bank
   - isolated subagent research jobs
   - aggregated `research.md`
   - high-level `workflow-plan.md`

4. The plugin has no supported design revision/import API

   CLI support is limited to:

   - `dwf design render`
   - `dwf design approve`
   - `dwf design reject`
   - `dwf design status`

   There is no `design revise`, `design import`, `design patch`, or `design render --from-research`.

   Worse, `approveWorkflowDesign` force-regenerates a rejected design before approval. That made the agent worry that a manually patched rejected design would be overwritten.

5. The MCP surface is too thin

   The MCP server exposes only:

   - list runs
   - get status
   - render UI
   - classify
   - export
   - integrate

   It does not expose `init`, `design render`, `design approve/reject/status`, `grill`, `contract`, `approvals`, `compile`, or research/plan lifecycle commands. The agent had to fall back to CLI and source spelunking.

6. Fidelity checks are too weak

   A strict workflow with zero packets passed all fidelity checks because `packet-intent-preserved` treats `packets.length === 0` as passing. `named-skills-preserved` also passes vacuously when no skills are detected. `deliverables-preserved` only checks that at least one generic deliverable exists.

   For this prompt, fidelity should have failed on:

   - no codebase research artifact
   - no assistant/domain capability map
   - no persona coverage
   - no mutating-action/HITL risk gates
   - no backend/frontend/client-bridge/action-catalog/tests/docs packets
   - no Convex/WorkOS/DrawFlow domain references

7. Risk detection missed the user's main risk model

   The original prompt explicitly said all mutating actions need HITL safeguards. The failed design still produced no risk gates.

   `inferRiskGates` currently keys off words like delete, migration, deploy, secret, billing, customer, production data, and account. It does not catch:

   - mutating action
   - HITL checkpoint
   - approval
   - draw release
   - WorkOS organization/member/role changes
   - customer data access by assistant tools
   - external webhook events

8. Generated packet path ownership is not DrawFlow-aware

   The replacement run generated generic backend/frontend packets. The backend packet allowed `src/server/**`, `server/**`, `api/**`, `lib/**`, `packages/**`, and `tests/**`, but DrawFlow's backend is Convex under `convex/**`. The output looked structured but would route workers to the wrong ownership boundaries.

## Proposed Fix

Replace the current "single goal string to template" design path with a staged research-to-design compiler for non-trivial workflows.

### New Major Feature Pipeline

For strict or broad workflows, the plugin should run this sequence before final workflow design approval:

1. Preserve the raw user prompt

   Write `source-prompt.md` and `intent.json`. Do not initialize from a lossy agent summary unless the summary is explicitly stored as derived data.

2. Determine intent

   Produce `intent.md` with:

   - primary outcome
   - implied deliverables
   - non-negotiable constraints
   - risk-bearing actions
   - named skills/workflows
   - target repository and likely domains

3. Determine research requirements

   Produce `research-plan.json` and `research.md` scaffold listing:

   - codebase areas to inspect
   - docs to read
   - external research needed
   - product/domain unknowns
   - verification commands likely required

4. Generate senior-engineer planning questions

   Produce `questions.json` with high-leverage questions a senior engineer would ask before planning. Questions should be about architecture, domain workflows, data ownership, risk gates, UX surfaces, test strategy, and rollout.

5. Dispatch isolated research subagents

   Each subagent receives only:

   - one question or one bounded question group
   - repo path
   - relevant file/search hints
   - required output schema

   Do not pass the original prompt, desired answer, or the agent's suspected fix. This prevents context pollution.

6. Aggregate research

   Write subagent result files and synthesize them into `research.md`.

7. Dispatch a high-level workflow architect subagent

   Give it `intent.md`, `research.md`, and the question results. It writes `workflow-plan.md` with packet topology, ownership, gates, and verification strategy.

8. Generate final workflow design

   `workflow-design.md` and `workflow-design.json` are rendered from:

   - raw prompt
   - structured intent
   - research synthesis
   - workflow plan
   - plugin pattern registry

   The design approval gate remains, but it now reviews a researched design instead of a template.

### CLI/API Changes

Add commands:

- `dwf init --goal-file <path>` to preserve long prompts and avoid shell escaping or agent summary loss.
- `dwf research init --run <run-id>`
- `dwf research questions --run <run-id>`
- `dwf research write-jobs --run <run-id>`
- `dwf research record-result --run <run-id> --job <job-id> --file <result.json>`
- `dwf research synthesize --run <run-id>`
- `dwf plan render --run <run-id>`
- `dwf plan record-result --run <run-id> --file <workflow-plan.md>`
- `dwf design render --run <run-id> --from-plan`
- `dwf design revise --run <run-id> --reason <text>`
- `dwf design import --run <run-id> --file <workflow-design.json>`

Expose equivalent MCP tools so the agent does not need to source-spelunk or shell out for core lifecycle operations.

### New DrawFlow/Assistant Pattern

Add an assistant-platform-upgrade pattern triggered by terms such as:

- assistant
- natural language interface
- multi-step workflow
- HITL
- mutating action
- generative UI
- action toolkit
- platform capabilities
- personas

For this prompt, it should generate packets like:

- product-domain-discovery
- existing-assistant-architecture-map
- route-and-capability-inventory
- persona-workflow-ideation
- action-toolkit-architecture
- Convex-assistant-backend
- client-action-bridge
- inline-generative-HITL-UI
- selector-and-form-components
- audit-risk-policy
- WorkOS-and-permission-review
- docs-and-specs
- test-fixtures-and-simulated-workflows
- browser-verification
- independent-security-review
- final-integration-verification

Allowed paths should be repo-aware for DrawFlow:

- `convex/**`
- `convex/_generated/ai/guidelines.md`
- `src/features/assistant/**`
- `src/components/ui/**`
- `src/routes/**`
- `docs/**`
- `tests/**`
- `src/**/*.test.ts`
- `src/**/*.test.tsx`

### Stronger Fidelity Gates

Strict workflow designs should fail closed when any of these are true:

- packet count is zero for a broad/strict request
- no research artifact exists before design
- no packet owns implementation when implementation is requested
- no packet owns tests when tests/verification are requested
- no risk gates exist when mutating actions, approvals, production/customer data, WorkOS, draw release, publishing, or migrations are mentioned
- no named domain entities are preserved for a domain-specific product request
- generated allowed paths do not match discovered repo backend/frontend locations
- fidelity checks pass only vacuously because a field is empty

### Tests To Add

1. Regression test with the original DrawFlow assistant prompt:

   - mode: `strict`
   - workflow type: `assistant-platform-upgrade`
   - packet count at least 12
   - includes Convex/backend, assistant UI, client bridge, action catalog, docs, tests, security/risk, persona ideation, and final verification packets
   - includes mutating-action, WorkOS/account, draw-release/approval, sensitive-data, and expensive-fanout risk gates

2. Raw prompt preservation test:

   - `--goal-file` writes `source-prompt.md`
   - derived objective may be shorter, but `sourceObjective` remains exact

3. Research-before-design test:

   - strict major feature cannot be approved until `research.md` and `workflow-plan.md` exist

4. Design revision test:

   - rejected design can be revised without losing user rejection reason
   - approved imported design is not silently regenerated

5. MCP parity test:

   - MCP exposes the same lifecycle needed by the skill: init, research, design status/render/approve/reject/revise, goal attach, grill, contract, approvals, compile, subagent job writing, status, export

## Bottom Line

The plugin currently enforces useful gates after a workflow exists, but it does not reliably create the right workflow for complex product work. It needs a research-first compiler, stronger fidelity validation, full lifecycle MCP tooling, and domain-aware pattern support. The agent's visible confusion was a symptom of that mismatch: it was trying to force a deterministic keyword template into a job that required senior-engineer discovery and workflow architecture.
