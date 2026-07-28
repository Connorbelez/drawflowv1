# DrawFlow AI Assistant

## Architecture

The DrawFlow assistant is a global authenticated workflow layer mounted in
`AppShell`. The visible chat surface uses Assistant UI primitives for the modal,
thread, messages, composer, message parts, and HITL preview UI. AG-UI event
types are used for persisted product traces and client action lifecycle records.
TanStack AI `toolDefinition` declarations define the closed v1 tool catalog.

Convex owns persistence and execution:

- `assistantThreads` stores organization-scoped assistant threads.
- `assistantMessages` stores sanitized thread messages.
- `assistantActionPlans` stores preview batches, per-item accept/reject/edit
  state, validation results, commit outcomes, actor roles, and route context.
- `assistantTraceEvents` stores user-facing AG-UI-style status/tool events.
- `scheduleRevisionRecords`, `auditEvents`, `calendarTargetDates`,
  `calendarReminderEvents`, `proposalMilestones`, and
  `proposalDrawScheduleRows` remain the product tables for committed effects.

The Convex Agent component is registered in `convex/convex.config.ts` so agent
thread/message persistence can be expanded without changing the public assistant
surface. DrawFlow-specific action plans remain in first-party tables because
they are product audit records, not generic chat transcript data.

## Provider Configuration

Model credentials stay server-side. The browser calls Convex actions and never
receives provider API keys.

Required for model-backed turns:

```bash
OPENAI_API_KEY=...
DRAWFLOW_ASSISTANT_MODEL=gpt-4.1-mini
```

Optional fallback:

```bash
OPENROUTER_API_KEY=...
DRAWFLOW_ASSISTANT_MODEL=openai/gpt-5.4-mini
```

OpenAI is the first-class provider. OpenRouter is only used when OpenAI is not
configured. If neither key is configured, the assistant degrades to read-only
help and the UI states that model-backed actions are unavailable.

OpenRouter model IDs must include their provider namespace. DrawFlow normalizes
unqualified OpenAI model IDs such as `gpt-5.4-mini` to
`openai/gpt-5.4-mini` when OpenRouter is selected, but an explicit canonical ID
is preferred in deployment configuration.

Provider credentials are Convex deployment environment variables, not Vite
client variables. Validate an OpenRouter key against
`https://openrouter.ai/api/v1/auth/key` after provisioning it; a `401` means the
key must be rotated. Site-visit guidance is intentionally fail-soft: missing,
invalid, rate-limited, or unavailable model providers return deterministic,
scope-aware field guidance instead of failing the site-visit workflow. The
server logs only the provider and HTTP status, never the credential or provider
response body.

## Closed Action Catalog

Read-only client tools can execute immediately:

- `open_proposal_route`
- `open_active_build_route`
- `open_calendar_surface`
- `focus_milestone`
- `focus_draw`
- `focus_calendar_event`
- `explain_current_surface`

Data-changing actions always create a HITL preview first:

- `update_proposal_milestone_schedule`
- `update_proposal_milestone_budget`
- `create_proposal_planned_draw`
- `update_proposal_planned_draw`
- `delete_proposal_planned_draw`
- `create_proposal_reminder`
- `update_proposal_reminder`
- `cancel_proposal_reminder`
- `set_calendar_target_date`
- `schedule_active_build_site_visit`
- `reschedule_active_build_site_visit`
- `cancel_active_build_site_visit`
- `request_active_build_milestone_schedule_revision`
- `request_active_build_milestone_budget_revision`
- `request_active_build_draw_plan_revision`

Excluded v1 actions are intentionally absent: evidence/document upload, WorkOS
admin actions, user/role management, external calendar sync reconciliation,
loan facility changes, draw approval/release, final milestone approval, permit
waivers, and final budget revision approval.

## HITL Semantics

Each proposed item stores before/after values, entity labels, validation
warnings, reason requirements, and status. Users can accept or reject individual
items and can submit edited field values. The commit mutation re-reads current
state and validates the accepted set again before applying anything.

Accepted commits are atomic at the action-plan level. If any accepted item fails
commit-time validation, no accepted item is applied. The plan is marked `failed`
with the failed `clientRequestId` and validation reason so the user can edit or
remove that item and retry.

Proposal/draft actions may apply directly when the actor has normal edit
permission. Active-build schedule, budget, and draw-plan changes create
auditable revision request records instead of directly mutating live plan rows.
Reminder-only events write `calendarReminderEvents` and do not mutate schedules.
Calendar target dates write explicit `calendarTargetDates` records and do not
silently change milestone or draw timing.

## Security Rules

- All records are organization-scoped.
- Cross-organization thread/action-plan reads are denied.
- Contractors are read-only for v1 assistant mutation batches.
- Model output cannot call arbitrary Convex functions.
- All mutation actions pass through the closed catalog validator before preview
  and before commit.
- Product traces persist status labels, tool names, sanitized metadata,
  validation results, and commit outcomes only.
- Raw chain-of-thought, reasoning, and raw thought fields are stripped before
  persistence.

## Verification Flow

Required commands:

```bash
bun x convex codegen
bun x tsc -p convex/tsconfig.json
bun run test convex/assistant.test.ts
bun run test src/components/app-shell.test.tsx
bun run test
bun run build
```
