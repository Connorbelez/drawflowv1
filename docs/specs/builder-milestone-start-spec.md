# Builder Milestone and Submilestone Work Start

## Problem Statement

Builders can currently report that milestone work is complete, but they cannot reliably record when work actually began. The missing lifecycle event forces DrawFlow to infer reality from completion, progress, evidence, or planned dates. Those inferences are inaccurate when work begins early, late, out of sequence, or on only one submilestone.

The missing start event also creates inconsistent interaction behavior. Builders encounter milestones in the Build Workspace milestone rail, detail sheet, Gantt roadmap, calendar, assistant, and submilestone scopes, but there is no canonical confirmation flow that preserves the target, actual start date, dependency context, actor, and source across those interfaces.

DrawFlow must record the reality of work beginning without rewriting the approved Construction Roadmap or turning dependency policy into a hard blocker. A backdated start is ordinary reporting and does not require a reason. A reason is required only when a declared predecessor milestone is not complete. That dependency exception must remain visible to lender operations and the audit trail without preventing an authorized builder from recording what happened.

## Solution

Add an explicit, auditable work-start transition for milestones and submilestones in the canonical Build Workspace.

Every eligible entry point opens the same compact confirmation dialog selected in the prototype. The dialog identifies the milestone or submilestone, defaults the actual start to now, allows a current or backdated value, shows the planned date and variance, and shows declared predecessor state. It requires a reason only when at least one declared predecessor milestone is incomplete.

Confirmation records the user-supplied actual start separately from the server-recorded report time and authenticated actor. It transitions planned work to in progress without inferring progress, changing evidence state, rewriting planned dates, moving downstream work, or regrouping draws. Normal starts create activity and audit history. Starts with incomplete predecessors additionally create lender-facing exception notifications. Corrections and retractions preserve immutable history.

The same domain command and the same confirmation controller serve milestone cards, the milestone detail sheet, Gantt, calendar, assistant confirmation, and submilestone scopes. Completion of work that has no recorded start captures the missing start atomically as part of the completion confirmation.

## User Stories

1. As a Builder Lead, I want to record that a milestone has started, so that the Build Workspace reflects actual construction activity.
2. As Builder Staff with milestone update permission, I want to record a milestone start, so that the team is not dependent on the Builder Lead for routine reporting.
3. As an authorized builder, I want to record a submilestone start, so that partial work within a larger milestone is represented accurately.
4. As an assigned contractor, I want to start my assigned submilestone, so that my work can be tracked without granting me authority over the parent milestone.
5. As a contractor, I want parent milestone controls to remain unavailable to me, so that I cannot change builder-governed lifecycle state.
6. As a builder, I want the start action available in milestone scope, so that I can act where I already review milestone details.
7. As a builder, I want the start action available in submilestone scope, so that the interaction is not limited to parent milestones.
8. As a builder, I want the milestone rail or card action to open the canonical start confirmation, so that the action behaves consistently.
9. As a builder, I want the milestone detail sheet action to open the canonical start confirmation, so that I can report from the detailed work view.
10. As a builder, I want the Gantt roadmap action to open the canonical start confirmation, so that I can report from the schedule context.
11. As a builder, I want the calendar action to open the canonical start confirmation, so that I can report from the date context.
12. As a builder, I want each submilestone ledger row to expose the canonical start confirmation, so that I can record work at the correct scope.
13. As a builder, I want the submilestone detail view to expose the canonical start confirmation, so that detail and list interactions stay aligned.
14. As a builder in a guided field workflow, I want to start the selected submilestone, so that site reporting uses the same lifecycle event.
15. As a builder using the assistant, I want a proposed start to resolve to a structured confirmation, so that natural language cannot silently mutate lifecycle state.
16. As a builder, I want every entry point to show the same compact confirmation dialog, so that source-specific behavior does not create mistakes.
17. As a builder, I want the dialog to identify the Build and target milestone, so that I can verify what I am changing.
18. As a builder, I want a submilestone dialog to identify both parent milestone and child submilestone, so that scope is unambiguous.
19. As a builder, I want the actual start field to default to the current time, so that same-day reporting is fast.
20. As a builder, I want to backdate the actual start, so that DrawFlow records reality when reporting happens later.
21. As a builder, I want backdating to require no explanation by itself, so that normal delayed reporting is not treated as an exception.
22. As a builder, I want future actual start values rejected, so that the event cannot claim work that has not begun.
23. As a builder, I want the planned start shown beside the actual start, so that I understand schedule variance before confirming.
24. As a builder, I want early and late starts accepted, so that the system records facts rather than enforcing the plan as reality.
25. As a builder, I want a start to leave planned dates and durations unchanged, so that actual reporting does not silently rewrite the approved Construction Roadmap.
26. As a builder, I want a start to leave downstream milestone dates unchanged, so that schedule replanning remains an explicit workflow.
27. As a builder, I want a start to leave Draw Groups unchanged, so that lifecycle reporting does not alter financing structure.
28. As a builder, I want a start to leave progress unchanged, so that beginning work is not mistaken for a percentage complete.
29. As a builder, I want a start to leave Evidence Package state unchanged, so that work beginning is not treated as evidence submission.
30. As a builder, I want concurrent milestones permitted, so that DrawFlow can represent overlapping construction activity.
31. As a builder, I want incomplete declared predecessor milestones called out before confirmation, so that I understand the exception I am recording.
32. As a builder, I want a reason required when a declared predecessor is incomplete, so that the out-of-sequence decision is auditable.
33. As a builder, I want no reason field when all declared predecessors are complete, so that ordinary starts stay compact.
34. As a builder, I want the dependency warning to list the incomplete predecessor milestones, so that the requested reason has concrete context.
35. As a builder, I want an out-of-sequence start to succeed after I provide a reason, so that DrawFlow records reality rather than rejecting it.
36. As a builder, I want a failed confirmation to preserve my entered date and reason, so that a transient failure does not destroy my work.
37. As a builder, I want retrying the same confirmation to avoid duplicate lifecycle events, so that network retries do not corrupt history.
38. As a Builder Lead, I want the first builder-started submilestone to be able to start its planned parent in the same explicit confirmation, so that parent and child state remain coherent.
39. As a Builder Lead, I want the dialog to state when both parent and submilestone will start, so that the atomic transition is explicit.
40. As an assigned contractor, I want starting a submilestone to leave the planned parent unchanged, so that my limited authority is respected.
41. As a builder completing work with no recorded start, I want completion to capture the missing start atomically, so that completion does not leave an impossible lifecycle history.
42. As a builder, I want completion confirmation to make the inferred missing start explicit, so that the recorded fact is visible before submission.
43. As a lender staff member, I want normal starts visible in Build activity, so that I can understand execution without receiving unnecessary inbox work.
44. As a lender staff member assigned to the Build, I want an alert when work starts before a declared predecessor is complete, so that I can assess the exception.
45. As a Lender Admin, I want dependency-exception starts visible in the operations queue, so that material execution deviations receive oversight.
46. As a lender operations user, I want unassigned dependency exceptions routed to a fallback queue, so that no exception is silently lost.
47. As a lender staff member, I want to inspect start facts without originating builder declarations, so that reporting authority remains correctly separated.
48. As a Lender Admin, I want to correct an erroneous start after completion, so that material records can be repaired under elevated authority.
49. As an authorized actor, I want a mistaken start retracted rather than deleted, so that the audit history remains complete.
50. As an auditor, I want each start to record actual start time, report time, actor, role, prior state, new state, source, warnings, and reason when applicable, so that the decision is reconstructable.
51. As an auditor, I want dependency state snapshotted at confirmation time, so that later schedule changes do not rewrite the historical exception.
52. As an auditor, I want corrections and retractions linked to the original event, so that the full event lineage is traceable.
53. As an integration consumer, I want a milestone-started webhook, so that connected systems can react to actual execution.
54. As an integration consumer, I want start-corrected and start-retracted webhooks, so that downstream state remains reconcilable.
55. As an integration consumer, I want stable event and idempotency identifiers, so that delivery retries are safe.
56. As an organization administrator, I want every start fact, audit event, notification, and webhook scoped to the owning organization, so that tenant boundaries are preserved.
57. As a builder without milestone update permission, I want the start control hidden or disabled and server submission rejected, so that client rendering cannot bypass authorization.
58. As a builder, I want activity and timeline views to deep-link to the relevant milestone, so that I can inspect the source context of a start event.
59. As a builder, I want evidence and activity timelines to display start events without offering a second mutation implementation, so that lifecycle writes remain centralized.
60. As a proposal author, I want milestone-start actions absent before a proposal becomes an active Build, so that proposed work is not confused with executed work.
61. As a dashboard user, I want dashboard status to reflect starts without introducing a direct one-click start action, so that consequential writes remain in canonical Build context.
62. As a mobile builder, I want the compact confirmation to remain usable at phone and tablet widths, so that site reporting does not require desktop.
63. As a field user, I want a clear online-only state when the start command cannot be submitted, so that I do not mistake a local draft for a recorded event.
64. As a builder, I want the confirmed start reflected consistently in milestone cards, Gantt, calendar, submilestones, and activity, so that every projection agrees.
65. As a product owner, I want the selected prototype preserved as primary-source interaction evidence, so that implementation does not drift toward discarded variants.

## Implementation Decisions

- The selected interaction is prototype Variant A: a compact confirmation dialog presented over the current Build Workspace context. Variants B and C remain decision evidence only and must not be implemented as alternate production flows.
- A milestone or submilestone start is a consequential lifecycle mutation and is never a one-click action. Every source opens the same confirmation controller before any write.
- The Build Workspace remains the canonical control plane. Milestone cards or rail, milestone detail, Gantt, calendar, assistant, and submilestone scopes adapt into one shared open-confirmation input and one shared domain command.
- The shared confirmation input identifies the Build, parent milestone, optional submilestone, and originating source. Supported sources are milestone card, milestone detail, Gantt, calendar, submilestone ledger, submilestone detail, guided field workflow, assistant, and completion catch-up.
- The canonical milestone-start command accepts the Build identifier, milestone identifier, optional submilestone identifier, actual start time, optional dependency-exception reason, source, and an idempotency key. Organization and actor identity are derived from the authenticated server context rather than trusted client input.
- The server re-reads the target, permissions, lifecycle state, and declared dependency state in the mutation transaction. UI warnings are informative; server evaluation is authoritative.
- The lifecycle transition is explicit: planned work becomes in progress. A start does not infer or change completion percentage, Evidence Package state, planned dates, planned duration, downstream dates, Draw Group membership, or draw eligibility.
- Early, on-time, and late starts are valid. Concurrent milestone execution is valid. A start value later than the server's accepted current-time tolerance is invalid.
- The actual start is user-supplied and normalized to a stored UTC instant. The report time is server-generated. The authenticated WorkOS user, resolved role, and organization are stored with the event.
- Backdating alone never requires a reason. The reason is required if and only if one or more milestones referenced by the target's declared dependency keys are incomplete at confirmation time.
- An incomplete dependency is a warning and audited exception, not a hard lifecycle blocker. The mutation succeeds when an authorized actor supplies a non-empty reason.
- The dependency audit snapshot stores the identifiers, display names, and lifecycle states of incomplete declared predecessors as evaluated by the server.
- Normal start events create Build activity, audit history, and integration outbox events but do not create lender inbox work.
- Dependency-exception starts additionally notify assigned lender staff and Lender Admin users. When no eligible assignee exists, the exception is routed to the lender operations fallback queue.
- Integration events use the names `milestone.started`, `milestone.start_corrected`, and `milestone.start_retracted`. Payloads include stable event identity, organization, Build, milestone, optional submilestone, actor, actual and report times, prior and new lifecycle states, source, warnings, dependency snapshot, and reason when applicable.
- Current start fields are stored on the milestone or submilestone projection for efficient reads. Immutable lifecycle audit events remain the source of historical truth, including corrections and retractions.
- A repeated command with the same idempotency key returns the original result and creates no duplicate audit event, notification, activity item, or webhook outbox entry.
- A second start against already-started work is not treated as an ordinary overwrite. Authorized users enter the correction flow, which records prior and new values and a correction reason.
- Retraction never deletes history. It appends a linked retraction event and updates the current projection to the latest valid lifecycle state.
- Lender Admin can correct or retract starts after completion. Builder correction authority follows existing milestone-update authorization and lifecycle policy; it must not permit rewriting completed work when current policy reserves that authority for Lender Admin.
- Builder Lead and Builder Staff with milestone update permission can start parent milestones and builder-controlled submilestones.
- Assigned contractors can start or update only their assigned submilestones. They cannot transition the parent milestone.
- When an authorized builder starts the first submilestone while its parent is planned, the compact dialog explicitly states that both records will start. One transaction applies both transitions and emits linked audit facts.
- When a contractor starts the first submilestone while its parent is planned, only the child transitions. The UI does not imply that the parent was started.
- Completion of a milestone or submilestone with no start fact uses the same domain logic to record a missing start and completion atomically. The completion confirmation must disclose the actual start value that will be recorded.
- Existing in-progress or completed records without a trustworthy start fact are not silently backfilled from planned dates, progress, evidence, or update timestamps. They display an unknown actual start until an authorized correction records one.
- Assistant language can prepare a structured confirmation input but cannot commit the command from unconfirmed free text.
- Activity and evidence timelines render lifecycle events and deep-link back to the target. They do not own separate start mutations.
- Dashboard and proposal surfaces can project start state, but direct start actions are intentionally excluded. Start actions exist only for active Builds in canonical Build context.
- The confirmation is online-only for this release. The client exposes pending, failure, retry, and success states and does not optimistically change lifecycle state before server success.
- The implementation is a clean cutover from any existing start behavior that rejects early or dependency-violating work, infers progress, or changes evidence state. All callers route through the canonical command.
- Convex functions are authored through the repository's fluent-convex builders and shared authorization middleware. WorkOS webhook-owned projection tables are read for identity and authorization but never written by this feature.
- Existing Frame, Card, Dialog, form, date-time, alert, badge, and activity primitives are extended or composed. No parallel card or modal primitives are introduced.
- The interaction prototype informed the source model, compact dialog structure, dependency-reason conditional, and parent/submilestone context. Production implementation must preserve those decisions while replacing prototype-only local state with the canonical domain command.

## Testing Decisions

- Good tests assert externally observable behavior: authorized state transitions, persisted facts, audit history, notifications, webhook outbox records, rendered confirmation content, and consistent projections. Tests must not couple to internal helper names, component nesting, or implementation-specific call order.
- The primary domain seam is the canonical milestone-start command. Domain tests exercise the command with authenticated organization and role context and assert the resulting milestone or submilestone projection plus audit, activity, notification, and outbox effects.
- The primary UI seam is the shared confirmation controller rendered from the production Build Workspace route. UI tests open it through each adapter and assert that identical target, date, dependency, and submit behavior is presented.
- A small number of focused component tests can cover source-specific adapter wiring where route-level tests cannot cheaply distinguish a milestone from a submilestone target.
- Domain happy-path coverage includes current-time milestone start, current-time submilestone start, planned-to-in-progress transition, actor and report timestamps, organization scope, activity creation, and normal webhook creation.
- Date coverage includes early start, on-time start, late start, backdated start without a reason, timezone normalization, and rejection of a future value.
- Dependency coverage includes all predecessors complete, one incomplete predecessor, multiple incomplete predecessors, missing reason rejection, whitespace-only reason rejection, successful exception with reason, authoritative server re-evaluation, stored dependency snapshot, lender notification, and fallback queue routing.
- Non-side-effect coverage asserts that a start does not modify progress, evidence state, planned dates, durations, downstream schedule, Draw Groups, or draw eligibility.
- Authorization coverage includes Builder Lead, permitted Builder Staff, unpermitted builder user, assigned contractor child start, unassigned contractor denial, contractor parent denial, lender staff origin denial, cross-organization denial, and Lender Admin correction authority.
- Parent-child coverage includes builder-confirmed atomic parent and first-submilestone start, child-only contractor start, later child start when parent is already in progress, and transaction rollback when either linked write fails.
- Completion catch-up coverage includes atomic start and completion, disclosed actual start, dependency reason enforcement when applicable, and no partial start if completion fails.
- Idempotency coverage asserts that a retry returns the original result without duplicate activity, audit, notification, or webhook records.
- Correction and retraction coverage asserts immutable event lineage, prior and new values, required correction reason, projection updates, role enforcement, and corrected/retracted webhooks.
- Existing-record coverage asserts that legacy in-progress or completed work with no trustworthy start fact remains explicitly unknown rather than receiving a synthesized date.
- Confirmation component coverage includes target identity, parent and child identity, default actual time, planned time, variance, dependency list, conditional reason field, future-value error, pending state, retained values after failure, retry, cancel, and successful close.
- Source coverage opens the same confirmation from the milestone rail or card, milestone detail sheet, Gantt, calendar, submilestone ledger, submilestone detail, guided field workflow, and assistant structured confirmation.
- Projection coverage confirms that one successful command is reflected consistently in milestone summary, detail, Gantt, calendar, submilestone views, and activity without source-specific writes.
- Negative surface coverage confirms that proposal and dashboard views do not expose a direct start mutation and that lender views remain read-only unless entering an authorized correction flow.
- Responsive coverage verifies the compact dialog at phone, tablet, and desktop breakpoints, including long milestone names, multiple dependency warnings, validation errors, and on-screen keyboard constraints.
- Prior art for domain behavior is the existing production proposal and active-build Convex test style, including authenticated organization setup and assertions across domain projections.
- Prior art for production route behavior is the existing Production Build Detail Surface and Milestone Detail Sheet test style.
- Prior art for calendar and roadmap entry points is the existing Calendar Workspace, production proposal Gantt, and timeline milestone worksheet test style.
- Prior art for assistant confirmation is the existing assistant route-context and structured action test style.
- Browser acceptance uses the production Build Workspace route and real query or mutation wiring. Prototype routes and local-only state are not acceptance evidence.
- The browser acceptance matrix covers a normal parent start, a backdated parent start without reason, an incomplete-dependency start with reason, a submilestone start from each supported submilestone scope, an assistant-proposed confirmation, cross-projection consistency, failure and retry, and responsive layouts.

## Out of Scope

- Replanning planned milestone dates, durations, dependencies, or downstream schedule as a consequence of recording a start.
- Changing Draw Groups, Draw Plans, Borrower Working Capital Limit calculations, Lender Draw Policy Limit calculations, draw eligibility, approval, or release behavior.
- Inferring percentage complete, creating Evidence Packages, changing evidence review state, or treating a start as proof of reimbursable work.
- Adding proactive funding or changing DrawFlow's reimbursement-only v1 model.
- Allowing lender staff to originate builder milestone-start declarations.
- Giving contractors authority to start parent milestones or unassigned submilestones.
- A generic social feed, comments redesign, or broader collaboration-surface implementation.
- Offline queued milestone-start writes. Site-visit offline draft behavior remains separate.
- Direct one-click start actions from dashboards, notifications, activity timelines, evidence timelines, or proposal editing.
- Automatic historical start-date backfills from planned dates, progress, evidence, or modification timestamps.
- Implementing prototype Variants B or C as production alternatives.
- General milestone completion redesign beyond the atomic missing-start catch-up required for lifecycle consistency.

## Further Notes

- Product contract and interface inventory: `docs/specs/builder-milestone-start-interface-manifest.md`.
- The captured prototype is a primary source for implementation, not acceptance evidence.
- Selected prototype branch: [codex/prototype-builder-milestone-start-20260728](https://github.com/Connorbelez/drawflowv1/tree/codex/prototype-builder-milestone-start-20260728).
- Immutable prototype capture: [commit 06200b3e95a09b93e0de962a6b07e5e151578801](https://github.com/Connorbelez/drawflowv1/commit/06200b3e95a09b93e0de962a6b07e5e151578801).
- The selected route state in the prototype is `variant=start-dialog`; this is Variant A, the compact confirmation.
- The prototype deliberately supports normal, backdated, dependency-exception, and completion-catch-up scenarios plus milestone card, calendar, Gantt, submilestone, and assistant sources.
- The prototype's submilestone trigger appears in ledger, detail, and guided field scopes. Production implementation must retain all three placements.
- The local prototype URL used during design review was `http://localhost:3001/builder/builds/build_visual_hamilton?tab=milestones&variant=start-dialog&milestone=rough-in`; it is convenience-only and is not the durable reference.
- The complete grilling session is closed. There are no outstanding product questions blocking implementation.
