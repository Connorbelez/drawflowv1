# Optimized Ultracode prompt: core-workflow UX audit remediation

Run this prompt from the repository root in an Ultracode-enabled Claude Code session.

---

## Mission

Remediate the current, still-valid findings in `@reports/core-workflow-ux-audit/audit-report.md` and its linked canonical records. Fix root causes before presentation symptoms, apply the established DrawFlow product/design system, and leave every finding with truthful test and browser evidence or a precise blocker.

The audit is historical evidence, not unquestionable current truth. Some findings, acceptance criteria, source paths, fixtures, or recommendations may now be stale. Reproduce and reconcile every finding before changing code. Update the report and canonical notes whenever current behavior or product truth differs from the original record.

## Non-negotiable constraints

- Read `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `docs/core-product-workflow-manifest.md`, `docs/vocabulary.md`, the audit report, and every linked 20-field finding record before implementation.
- Read `convex/_generated/ai/guidelines.md` before inspecting or modifying Convex code.
- Use Bun for project package scripts and dependency commands. Node is allowed for repository-owned skill/setup scripts that explicitly require `node`. Inspect current `package.json` and skill instructions before running commands.
- Preserve auth-derived actor and WorkOS organization boundaries end to end.
- Never hand-edit `convex/_generated/**`; only the coordinator may regenerate it through the project’s codegen command when required.
- Preserve unrelated local changes. Never reset, clean, stash-pop, discard, or overwrite user work.
- Do not commit, push, open a PR, or publish artifacts unless explicitly asked.
- Do not infer browser behavior from code or tests. Do not claim a command, persona, viewport, screenshot, or flow was verified unless observed in this run.
- A hidden illegal action is still a defect. Unauthorized controls must be absent from the DOM and accessibility tree, while backend authorization remains authoritative.
- Never render raw Convex request IDs, function names, validators, schemas, payloads, file paths, or stack traces.
- Findings are accounting units, not implementation units. Group findings by shared root cause; do not create 39 independent, conflicting fixes.
- Map thin route files to the real implementation under `src/features/**` before editing. Prefer fixing the owning feature/shared component over adding route-level patches.
- Keep authenticated product-register UI separate from `/marketing` and other public brand-register surfaces.

## Dirty-tree and worktree safety

This repository may already contain extensive uncommitted work.

1. Capture the current branch, `git status`, staged diff, unstaged diff, and untracked-file manifest.
2. Create an isolated implementation worktree from the current branch `HEAD`. This prompt explicitly requires worktree isolation.
3. Mirror the current working-tree snapshot into the implementation worktree before edits:
   - apply the combined tracked diff against `HEAD`;
   - copy relevant untracked project files while excluding `.git`, ignored dependencies, caches, and runtime output;
   - preserve the dirty root unchanged.
4. Verify hashes for every source, test, product/design, and audit file in the initial target manifest. The worktree must represent the current working state, not merely the last commit.
5. If the snapshot cannot be mirrored and verified, stop with a discovery-only blocker. If the dirty root changes during the run, re-check affected hashes and stop only the conflicting workstream.

All edits, tests, evidence, and remediation artifacts must live in the isolated worktree.

## Use deterministic Workflow orchestration

Use the `Workflow` tool for substantive fan-out. This is an explicit Ultracode/workflow requirement; if the tool is unavailable in the launched session, stop with an environment blocker instead of silently degrading to an unstructured swarm of `Agent` calls. Run separate, inspectable workflows for the phases below rather than one opaque mega-workflow. Every workflow script must declare `meta`, use structured schemas for findings/verdicts, label agents by workstream/finding, and log any bounded or skipped coverage. Default to `pipeline()`; use `parallel()` as a barrier only when full-set deduplication, DAG construction, or integration judgment genuinely requires every prior result.

### Workflow A — Revalidate and map

Fan out read-only agents by workflow family:

1. tenancy, onboarding, and contractor identity;
2. proposals, materials, budgets, and calendar;
3. Build Workspace, contractors, notifications, and audit timeline;
4. operations, milestones/site visits, draws, and integrations;
5. codebase/design-system/test-infrastructure mapping.

Each agent must return structured records with:

- `findingId`
- canonical record path
- original severity and acceptance criteria
- current disposition: `active | already-resolved | stale-spec | no-longer-applicable | environment-blocked | uncertain`
- exact repro seam and command or browser path
- fresh observed evidence
- likely root-cause cluster
- dependencies
- candidate source/test files
- current product-truth sources that agree or conflict
- audit/note updates required

Use a barrier only after all revalidation agents finish, because deduplication, root-cause clustering, file ownership, and the dependency DAG require the complete set. The initial audit expects 39 findings, but recount from the current register and canonical notes. Report discrepancies instead of forcing stale counts.

For every `active` or `uncertain` finding, establish a tight red-capable feedback loop before hypothesizing. Use `/mattpocock-skills:diagnosing-bugs` when the repro, root cause, or correct seam is unclear. Distinguish product defects from fixture drift, unavailable personas, environment failures, and obsolete recommendations.

Revalidate likely partial-fix candidates early rather than re-implementing them blindly:

- `UX-WF-DRW-001-001`: the cited validator path may be partially corrected, but rollback/reconciliation and typed redacted errors still require proof;
- `UX-WF-MIL-001-001`: production milestone-key mapping has tests, but immutable Build/work-order/evidence identity and return routing still require end-to-end proof;
- `UX-WF-PRP-001-002`: horizontal scrolling may exist, but navigation discoverability and responsive affordance still require browser proof.

Inspect these known risk boundaries during mapping:

- current uncommitted access-portal, contractor-workspace, Build Funding, and site-visit work may already satisfy parts of the audit;
- notification support may exist in Convex without a usable frontend inbox;
- frontend/backend FairLend organization constants may mask multi-tenant scope defects;
- backoffice Settings may mix production tenant operations with demo settings;
- demo/live duality must not be used as production proof;
- public token routes for site visits and proposal claims require separate threat, expiry, scope, and recovery verification from authenticated workspaces.

### Coordinator synthesis gate

Before mutation, the coordinator must produce:

- `reports/core-workflow-ux-audit/remediation-ledger.md`
- `reports/core-workflow-ux-audit/verification-matrix.md`
- `reports/core-workflow-ux-audit/target-manifest.json`
- `reports/core-workflow-ux-audit/file-lock-manifest.md`

The ledger must contain one entry for every reconciled finding and track:

`findingId | disposition/status | rootCauseCluster | phase | dependsOn | owner | acceptance checklist | files | tests | browser evidence | audit updates | blocker`

Allowed completion statuses are:

- `fixed` — behavior changed and has fresh regression/browser proof;
- `verified-existing` — current code already satisfies the acceptance criteria, with fresh proof and no unnecessary edit;
- `not-applicable` — current authoritative product behavior intentionally supersedes the finding, with the conflicting audit text updated and source of truth cited;
- `blocked` — exact unmet criteria, blocker, attempted recovery, and required input are recorded;
- `regressed` — a previously passing finding failed later verification.

Build a dependency DAG and cluster by root cause. Shared files such as schema, auth utilities, route registries, common design primitives, test fixtures, ledgers, and audit documents remain coordinator-owned. Give every mutable path/glob exactly one current owner. Mutating agents may run concurrently only with disjoint ownership; otherwise serialize them. Use one coordinator, at most two concurrent implementation agents, and an independent verification agent only after owners release their locks. Reserve at least 25% of the run for verification, integration, and report updates.

### Workflow B — Implement root-cause clusters

Implement in this order unless current code proves a different dependency:

1. canonical Build/Milestone/Draw/Budget invariants and transactional activation/navigation;
2. immutable organization/Build/milestone/work-order/evidence/handoff identity;
3. authority-correct actions, role projection, typed/redacted errors, and reasoned material decisions;
4. audit-signal separation and notification/outbox semantics;
5. contractor relationship lifecycle, operations queue, inbox, and integrations;
6. proposal decision architecture, material planning, budget governance, and calendar state machines;
7. responsive, accessibility, copy, and visual refinement after dependent contracts are stable.

Within each cluster use vertical slices, not horizontal bulk implementation:

1. reproduce the current symptom;
2. define the public seam and write one failing behavior test when a correct seam exists;
3. make the smallest coherent domain/server change;
4. make the dependent UI change;
5. run targeted tests;
6. exercise the real app;
7. update the ledger immediately;
8. continue to the next acceptance criterion.

Use `/mattpocock-skills:tdd` at these pre-agreed seams so the run does not pause for seam selection:

- public Convex query/mutation/action/HTTP behavior;
- route or shared-component behavior observable by a persona;
- Playwright handoff behavior between sender and receiver personas.

Tests must assert outcomes and invariants, not private helpers or brittle visual snapshots. Use semantic DOM, accessible-name/state, focus, network, persisted-domain-state, and explicit known-good values.

Use `/mattpocock-skills:domain-modeling` only when a finding exposes unresolved or contradictory domain language/invariants. Reconcile with the existing `docs/vocabulary.md` and manifest; do not create a duplicate glossary or speculative ADR.

Copy the full canonical acceptance checklist from each linked record into the ledger; do not replace it with a vague one-line summary. Minimum invariant and operational coverage where applicable:

- passive Timeline viewing for five minutes creates no durable domain/audit mutation or contradictory state drift;
- the notification inbox opens within 300 ms, moves focus into the surface, and returns focus to the invoking control on close;
- calendar export shows visible progress within 100 ms and creates exactly one download/job per invocation;
- impossible or over-capacity draws cannot become reviewable;
- concurrent/idempotent draw reservation yields one authoritative result;
- rejection/approval requiring a reason cannot succeed without it;
- cross-org and cross-Build token/handoff mismatches are rejected before mutation;
- Build activation publishes navigation only after record, scope, and authorization checks succeed;
- illegal role controls are absent from DOM and accessibility tree;
- typed user errors preserve safe recovery context without leaking internals;
- sender, receiver, entity identity, acknowledgement, and return path survive each handoff.

### Frontend skill routing

DrawFlow is application UI with an established product register and design system. Preserve Oxanium, the chartreuse “one voltage” rule, `Frame`/`FramePanel` chassis layering, existing primitives, and operator-grade density. Do not import a generic design language.

Use a minimal, sequenced skill set; never run competing taste skills on the same surface. This repo contains a vendored Impeccable workflow whose setup/command dialect differs from the globally installed skill. Read and follow `.agents/skills/impeccable/SKILL.md`; do not mix its `load-context`/preflight flow with the global `context.mjs`/`init` flow.

1. Complete the repo-local Impeccable context and preflight gates before every UI workstream edits files. Run exactly one baseline assessment per surface:
   - `critique <surface>` for workflow clarity, hierarchy, information architecture, and generic-design risk;
   - `audit <surface>` for measurable accessibility, responsiveness, theming, interaction markup, or performance;
   - use both only for a broad/high-risk surface when each answers a distinct question.
2. After that preflight and after the relevant domain contract, authority boundary, and canonical state are stable, use `/redesign-existing-projects` as the single primary remediation method for existing app UI. It does not replace or bypass the repo-local Impeccable mutation gates, and it must reuse the existing stack and primitives rather than redesign from scratch.
3. Invoke one narrow repo-local Impeccable follow-up only when the baseline evidence calls for it:
   - `harden <surface>` for raw errors, loading/empty/error states, overflow, resilience, and edge cases;
   - `adapt <surface>` for responsive task order and mobile/tablet findings;
   - `clarify <surface>` for labels, validation, recovery, and safe error copy;
   - `polish <surface>` only after functionality, accessibility, and verification gates pass.
4. Use `/dataviz` before changing charts, KPI tiles, timelines, calendar visualization, or dashboard data encoding.
5. Use `/apple-design` only for interaction mechanics such as sheets/drawers, immediate press feedback, spatially consistent enter/exit paths, interruptible motion, touch behavior, and reduced-motion fallbacks. Do not make the UI look like an Apple clone and do not add motion to compensate for unclear state.
6. Do not invoke broad aesthetic skills merely to “make it premium.” Correct hierarchy, wayfinding, focus, validation, responsive task order, legal actions, and state clarity first.

Frontend closure requirements:

- one obvious legal next action per persona and state;
- no nested interactive controls;
- visible keyboard focus and deterministic focus order/return;
- field-specific validation with `aria-invalid` and described errors;
- touch targets of at least 44px where the responsive audit requires them;
- no clipped primary controls at `1024x768`, `390x844`, or 200% zoom;
- one logical accessible object per calendar/agenda event, with no duplicated focusable or announced item;
- reduced-motion alternatives for every new animation;
- empty/loading/error/blocked states that preserve entity context and recovery;
- charts, metrics, status, and audit history all derived from the same canonical read model.

### Workflow C — Adversarial verification

After each root-cause cluster integrates, launch an independent verifier that did not implement it. The verifier must try to refute closure by replaying the original repro, alternate/unauthorized states, and relevant handoffs. For CRITICAL/BLOCKER findings, use two distinct verification lenses: domain/authority correctness and real-persona reproduction. A finding closes only if every acceptance item survives verification; disagreement reopens the finding rather than averaging it away.

Run a final completeness critic for at most two rounds. It should look for:

- unaccounted finding IDs;
- stale audit text or counts;
- acceptance criteria collapsed into vague summaries;
- code-only claims without browser proof;
- UI fixes masking server defects;
- missing receiver-persona verification;
- leaked internals;
- contradictory states across surfaces;
- generated files edited by hand;
- unowned or overlapping file changes;
- tests that pass without exercising the original symptom.

If a critic finds a real gap, reopen the relevant ledger entry and route it through the smallest appropriate workflow stage. Do not loop indefinitely. After two critic rounds, unresolved items become explicit blockers or risks.

## Verification policy

Use the current package scripts and test layout discovered in Workflow A; do not trust stale command lists in the audit. Run targeted tests first, then relevant repository verification scripts, then smoke suites, then final typecheck. Typical commands will include `bun run typecheck`, targeted `bun x vitest run ...`, and targeted `bun x playwright test ...`. Reuse existing evidence tooling when relevant, including `visual:production`, `perf:backoffice`, `ui:html:audit`, and `verify:build-warnings`, after confirming their current definitions in `package.json`.

Do not use `bun run check` or `bun run fix` as passive verification gates: they mutate files. Only the coordinator runs codegen, mutating format/fix commands when deliberately required, broad integration suites, and final typecheck.

Use `/run` for baseline reproduction and real-app checks. Use `/verify` after each completed runtime surface family and once more at the end when product source changed; skip it for documentation-only, test-only, or no-runtime-surface dispositions and record why it was not applicable. Browser proof is mandatory for user-visible findings.

Evidence scope is risk-based:

- responsive/shared-shell findings: verify `1440x900`, `1024x768`, and `390x844`;
- authority, focus, form, and workflow findings: verify the original/relevant viewport plus any breakpoint affected by the change;
- backend-only invariant fixes: targeted tests plus fresh proof on the primary affected UI surface;
- handoff findings: verify both sender and receiver when fixtures/personas exist;
- unavailable personas remain blocked; never substitute a demo role and call it production proof.

Store fresh evidence under `reports/core-workflow-ux-audit/evidence/remediation/<findingId>/`. Preserve original failing evidence as historical proof; append dated remediation references rather than overwriting it.

A blocked finding must record the exact unmet criteria, blocker, persona/surface, repro, files inspected, commands attempted with results, failed-proof artifact, recovery attempts, and the specific human decision or fixture/access required.

## Audit and documentation updates

Update documentation continuously, not only at the end:

- Keep original finding records and evidence intact.
- Append a dated remediation section to each canonical note when its status changes.
- Recalculate report counts and severity/status summaries from the reconciled ledger.
- Mark recommendations that were stale or superseded and cite the current product source of truth.
- Update `audit-report.md` status, coverage, backlog, and blockers to reflect this run.
- Update `docs/vocabulary.md` or the workflow manifest only when implementation genuinely changes authoritative product language or behavior.
- Never represent an environment interruption as a product fix or product defect without browser-observed evidence.

## Stop and escalation conditions

Stop only the affected cluster, not the whole run, when possible. Record a blocker if:

- the current working-tree snapshot cannot be mirrored safely;
- the root changes concurrently in an affected file;
- a required persona/fixture/external integration is unavailable after two evidence-driven recovery attempts;
- no correct test or browser seam exists and creating one would require an architectural decision outside the finding;
- the proposed fix would violate current PRODUCT/PRD/manifest truth;
- targeted tests or typecheck remain failing for the touched cluster;
- the flow still leaks internals, permits an illegal action, creates contradictory durable-looking state, or lacks one authoritative return path.

Do not spend repeated rounds on the same environment-only failure without new evidence. Move to an independent cluster and surface the unresolved dependency.

## Definition of done

The run is complete when:

- every reconciled finding has exactly one ledger entry and a truthful final status;
- every active finding is fixed or precisely blocked;
- already-resolved and not-applicable findings have fresh proof and updated audit records;
- P0 state, identity, authority, error, activation, and audit-signal prerequisites close before dependent visual polish;
- targeted tests, relevant smoke suites, and typecheck pass for touched code;
- applicable real-app persona, handoff, focus, and viewport verification is recorded;
- the audit report and canonical notes match current observed reality;
- no unrelated local work was modified and no generated file was hand-edited.

Write a machine-readable summary to `reports/core-workflow-ux-audit/remediation-summary.json` containing:

- worktree and baseline snapshot metadata;
- reconciled finding count and disposition totals;
- root-cause clusters and dependency order;
- ownership map;
- commands with `passed | failed | not-run` and exact notes;
- one entry per finding with status, files, tests, evidence, audit updates, and blocker;
- remaining risks and required human decisions.

Final chat response: lead with the outcome, then list artifact paths, verification performed, unresolved blockers, and any required human decisions. Do not recap routine tool activity or claim unobserved success.
