# Codex Goal Prompt — Implement and Review Milestone Start End to End

Copy and paste the complete prompt below into a Codex task opened in the DrawFlow repository.

```text
/goal Implement and independently review the complete builder Milestone and submilestone work-start feature defined by Linear parent ENG-373 and child tickets ENG-374 through ENG-382. Work through the native blocker graph until every acceptance criterion is implemented in production code, the selected Variant A interaction is verified in the real Build Workspace, all required automated checks pass, and a fresh final diff review has no unresolved material findings. Do not stop at a prototype, partial ticket, plan, or progress report.

Repository:
/Users/connor/Dev/drawFlow/v1/drawflowv1-core-workflow-remediation-20260717

Authoritative sources — read all of these before editing:

1. Linear parent specification:
   https://linear.app/fairlend/issue/ENG-373/drawflow-record-milestone-and-submilestone-work-start
2. Linear implementation tickets ENG-374 through ENG-382, including their complete descriptions, acceptance criteria, comments, and native blocking relationships.
3. Local implementation specification:
   docs/specs/builder-milestone-start-spec.md
4. Local interface manifest:
   docs/specs/builder-milestone-start-interface-manifest.md
5. Immutable selected prototype capture:
   https://github.com/Connorbelez/drawflowv1/commit/06200b3e95a09b93e0de962a6b07e5e151578801
6. Repository AGENTS.md and, before changing Convex code, convex/_generated/ai/guidelines.md.

Source precedence:

- ENG-373 and its approved local specification define product behavior.
- ENG-374 through ENG-382 define the implementation slices and acceptance criteria.
- Prototype Variant A defines the selected compact-confirmation interaction and in-context placement.
- The prototype is interaction evidence, not production architecture or acceptance evidence.
- If sources appear inconsistent, preserve the explicit grilled decisions below and investigate the surrounding repository before escalating.

Non-negotiable product decisions:

- Record reality. Early, late, current, backdated, concurrent, and dependency-violating starts are valid facts.
- A future actual start is invalid.
- Backdating alone never requires a reason.
- A reason is required if and only if a declared predecessor Milestone is incomplete at confirmation time.
- An incomplete predecessor creates an audited exception and lender notification; it does not block an authorized builder from recording the start.
- Starting work transitions planned work to in progress.
- Starting work must not infer progress, change Evidence Package state, rewrite planned dates or durations, move downstream work, change Draw Groups, or alter draw eligibility.
- Planned and actual dates remain distinct.
- Use the selected Variant A compact confirmation everywhere. Do not ship prototype Variants B or C.
- The confirmation must appear in the real Build Workspace context and be shared by parent Milestone and submilestone sources.
- Parent Milestone sources are the Milestone rail or card, Milestone detail, Gantt, calendar, and assistant structured confirmation.
- Submilestone sources are ledger, detail, and guided field scopes.
- Assistant text may prepare a structured confirmation but may never commit the lifecycle mutation without explicit human confirmation.
- Builder Lead and permitted Builder Staff may start parent Milestones and builder-controlled submilestones.
- Assigned contractors may start only assigned submilestones and may never transition the parent Milestone.
- When an authorized builder starts the first submilestone while its parent is planned, the confirmation must explicitly disclose the parent-plus-child transition and the server must apply it atomically.
- Completion without a recorded start must disclose and atomically capture the missing start.
- Corrections and retractions append immutable audit history; they never delete or silently overwrite prior events.
- Historical records without a trustworthy actual start remain explicitly unknown. Never synthesize an actual start from planned dates, progress, evidence, completion, or update timestamps.
- Every state change, audit event, notification, activity item, and webhook event must be organization-scoped.
- Normal starts create activity, audit history, and a webhook outbox event but no lender inbox work.
- Dependency-exception starts additionally notify assigned lender staff and Lender Admin users, with fallback queue routing when no assignee exists.
- Integration events are milestone.started, milestone.start_corrected, and milestone.start_retracted and must be idempotent.
- The flow is online-only for this release and must expose honest pending, failure, retry, and success states without optimistic lifecycle mutation.
- Dashboard, proposal, activity, and evidence surfaces may display state or deep-link to canonical context but must not introduce direct start mutations.

Implementation sequence:

Work the native Linear frontier in dependency order. Complete and verify each slice before starting a ticket it blocks:

1. ENG-374 — Canonical parent milestone start from milestone detail.
2. ENG-375 — Backdated starts and dependency exceptions.
3. After ENG-375, complete ENG-376, ENG-377, and ENG-378.
4. After ENG-378, complete ENG-379, ENG-380, ENG-381, and ENG-382.

Treat each ticket as a vertical tracer bullet through the required schema, fluent-convex domain command, authorization, audit/activity/outbox behavior, production UI, and tests. Reuse the canonical domain command and shared confirmation controller; do not create source-specific lifecycle mutations.

Engineering constraints:

- Inspect git status, the current branch, and existing changes before editing.
- Preserve all unrelated user changes. Never reset, revert, overwrite, or stage them.
- Work on a dedicated codex/eng-373-milestone-start branch or isolated worktree from the intended integration base when it is safe to do so.
- If the intended integration base cannot be determined from git and Linear, stop and ask before branching.
- Use Bun commands and repository conventions.
- Author Convex functions only through fluent-convex.
- Derive actor, role, permissions, and organization from authenticated server context.
- Never write to WorkOS webhook-owned projection tables.
- Re-read target lifecycle, authorization, and dependency state inside the mutation transaction.
- Prefer a clean cutover from existing incorrect start behavior. Do not preserve behavior that blocks early or dependency-violating starts, infers progress, or changes evidence state.
- Reuse and extend existing UI primitives and production components. Structural wrappers use Frame primitives; interactive content cards use Card primitives.
- Do not duplicate the prototype as a parallel implementation.
- Keep milestone, submilestone, audit, activity, notification, and outbox behavior cohesive within the canonical Build Workspace domain.
- Do not push, deploy, open a pull request, or modify production data unless the user separately authorizes it.

Required automated evidence:

1. Add focused domain tests for every lifecycle, temporal, dependency, permission, idempotency, atomicity, correction, retraction, and legacy-unknown acceptance criterion in ENG-374 through ENG-382.
2. Add production component and route tests for Milestone detail, rail or card, Gantt, calendar, assistant confirmation, submilestone ledger, submilestone detail, guided field, contractor authorization, completion catch-up, and correction/retraction.
3. Test observable behavior and persisted effects, not helper names, component nesting, or internal call order.
4. Run the targeted tests after each ticket-sized checkpoint.
5. Before completion, run all applicable repository checks and require successful exit status:
   - bun x convex codegen
   - bun x tsc -p convex/tsconfig.json
   - bun run test
   - bun run build
6. Inspect package scripts and run any additional established lint, formatting, or typecheck command that applies to changed files.
7. If a full-suite failure predates the change, reproduce and document the baseline before relying on that claim. The new targeted tests, generated types, Convex typecheck, and production build must still pass. Do not dismiss a failure as unrelated without evidence.

Required production-route review:

- Run the application on port 3001 because port 3000 belongs to another project.
- Verify the real production Build Workspace route, not only the prototype route or local-only prototype state.
- Use build_visual_hamilton or another seeded active Build that exercises the complete workflow.
- Verify a normal parent start.
- Verify a backdated parent start with no reason.
- Verify an incomplete-predecessor start with a required reason and lender exception outcome.
- Verify parent entry points from Milestone detail, rail or card, Gantt, calendar, and assistant.
- Verify submilestone entry points from ledger, detail, and guided field scopes.
- Verify the explicit atomic builder parent-plus-first-submilestone transition.
- Verify an assigned contractor can start only the assigned child while the parent remains unchanged.
- Verify completion catch-up, correction, retraction, retry, and idempotent outcomes.
- Verify every affected projection agrees after mutation.
- Verify the compact confirmation at phone, tablet, and desktop widths, including long names, multiple dependency warnings, validation errors, pending state, and on-screen keyboard constraints.
- Confirm proposal and dashboard surfaces do not expose a direct start mutation.
- Capture concise verification evidence for the final handoff.

Independent review pass:

After implementation and the first successful validation run, stop editing temporarily and review the complete diff as if it were authored by someone else.

Review for:

- divergence from ENG-373 or Variant A;
- incorrect state transitions or implicit progress/evidence changes;
- missing organization scope or authorization gaps;
- trusted client identity or stale client dependency checks;
- non-atomic parent/child or start/completion behavior;
- missing idempotency or duplicate side effects;
- incomplete audit lineage, notifications, or webhook payloads;
- incorrect backdating-reason behavior;
- contractor privilege escalation;
- legacy actual-start synthesis;
- source-specific UI or mutation duplication;
- loading, error, retry, accessibility, responsive, and projection-consistency regressions;
- weak tests that assert implementation details rather than behavior.

Resolve every confirmed P0, P1, and P2 finding and any correctness, security, authorization, data-integrity, accessibility, or acceptance-criteria defect. Then rerun the affected targeted tests and the complete required validation suite. Repeat review and validation until no material finding remains.

Progress contract:

- Work autonomously through ordinary implementation decisions using repository precedent.
- At each checkpoint, report only the current Linear ticket, what is now demonstrably working, validation evidence, what remains, and any real blocker.
- Do not stop because the work is large, tests require iteration, the first approach fails, or context is compacted.
- Do not declare the goal complete because code was written or one surface works.

Stop and ask only when:

- the intended integration base cannot be safely determined;
- two authoritative product requirements remain materially incompatible after inspecting their full context;
- required credentials, permissions, or external services prevent meaningful progress after safe local alternatives and repeated verification attempts;
- continuing would require destructive handling of unrelated user work or an external mutation that was not authorized.

Verifiable stopping condition:

Mark the goal complete only when all of the following are true:

1. Every acceptance criterion in ENG-374 through ENG-382 is implemented in production code.
2. The complete ENG-373 product contract is satisfied without known exceptions.
3. Variant A is present in all approved parent and submilestone contexts and discarded variants are absent from production behavior.
4. Targeted tests and every required repository command pass with recorded exit-status evidence.
5. Production-route review on port 3001 passes the complete parent, submilestone, dependency, contractor, completion, correction, retraction, retry, and responsive matrix.
6. A fresh independent diff review has no unresolved material findings.
7. The final handoff maps each Linear ticket to implemented behavior and test evidence, identifies the branch and changed modules, reports exact commands and results, and clearly states any pre-existing unrelated repository condition.

Do not mark the goal complete while any required behavior, validation command, production-route check, or material review finding remains unresolved.
```

This follows OpenAI's current Goals guidance: use `/goal` for long-running work with one durable objective, a clear validation loop, explicit source material, checkpoint reporting, and a verifiable stopping condition.

Reference: [Follow a goal — OpenAI](https://learn.chatgpt.com/use-cases/follow-goals)
