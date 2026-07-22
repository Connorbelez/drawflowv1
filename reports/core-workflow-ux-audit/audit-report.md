# DrawFlow Core Workflow UI/UX Audit

> Status: **COMPLETE WITH EXPLICIT ROLE/ENVIRONMENT BLOCKERS** — browser-observed evidence only. No product code was changed.

> **Remediation update (2026-07-22):** This report remains the immutable browser-observed defect baseline. Current dispositions are maintained in `remediation-summary.json`; automated, deterministic-browser, and production-backed authenticated Builder/Admin proof is in `final-qa-report.md`, `authenticated-browser-qa-report.md`, `evidence/final-qa/`, and `evidence/authenticated-qa/`; the current gap analysis is `../../gap-analyis.md`. The original readiness conclusion below must not be read as the current working-tree state.

## Executive summary

The audit accounted for all **16 parent workflows**, **63 persona segments**, **52 cross-persona handoffs**, and the manifest's **409 stable step IDs**. Browser execution produced **108 screenshots**, **22 saved DOM snapshots**, and **39 validated findings**: **4 CRITICAL**, **9 BLOCKER**, **23 MAJOR**, and **3 MODERATE**. Every finding has a complete 20-field record tied to a workflow, persona segment, step, route/surface, reproduction, recommendation, acceptance criteria, and evidence.

DrawFlow's strongest surface is the mobile site-visit capture flow: it stages and compresses files, shows package size, uploads to Convex, accepts a structured report, returns a clear receipt, and consumes the token. Proposal material creation, proposal submission, reminder create/cancel, responsive contractor onboarding, and the production Builder workspace were also exercised successfully.

The product is not ready for controlled construction-loan operations because several failures cross the trust boundary between presentation and authoritative domain state:

1. A Drywall site visit requested from one live Build generated a token for a different Build and milestone; the resulting evidence/report never returned to the initiating review.
2. The same active milestone shows contradictory completion, subtask, assignment, and financial values across Build surfaces.
3. A `$180,000` draw was `REQUESTED` and “ready for review” while its available limit was `$0`; a lender could reject it without a required reason.
4. Passive Timeline viewing flooded the audit log with identical state-update events.
5. Proposal Builder surfaces expose lender decision and backoffice draw-editing controls, blurring final authority.
6. Multiple authorization failures expose raw Convex request IDs, function names, validators, payloads, file paths, and stack traces.
7. Notifications are inert, contractor assignment is blocked by contradictory authorization, and an approved live Build can resolve to “Build detail unavailable.”

The first remediation program should therefore be a **state-integrity and authority-boundary cutover**, not isolated visual polish: canonical server-side state machines, immutable handoff context, role-correct action surfaces, reasoned material decisions, typed/redacted errors, and transactionally valid navigation targets. Responsive and accessibility improvements should follow on the same canonical task models.

## Audit scope and method

- Product: local DrawFlow dev environment at `http://localhost:3000`.
- Source of workflow truth: [`core-product-workflow-manifest.md`](../../docs/core-product-workflow-manifest.md).
- Viewports: desktop `1440×900` (plus authenticated `1422×800` preflight), tablet `1024×768`, mobile `390×844`.
- Personas reached: authenticated Builder; authenticated Backoffice preflight; public Builder/Lender demo roles; token-scoped Inspector; unauthenticated/role-gated error states.
- State coverage: success, alternate, invalid input, forbidden/unauthorized, missing artifact, save failure, stale record, responsive overflow, destructive reject/cancel, token consumption, and cross-persona return.
- Mutation policy: the user explicitly authorized mutating/destructive operations in the dev environment; reject, cancel, create, upload, submit, invite, attach, and token-consumption branches were exercised where available.
- Evidence policy: source inspection was not used to infer UI behavior. Unreachable states are marked blocked with the last browser-observed step.
- Accessibility scope: keyboard focus order/visibility, accessible names/tree duplication, disabled/error semantics, responsive reflow, and reduced-motion behavior were inspected where exposed. This is not a full WCAG conformance certification.

## Workflow coverage matrix

| Parent workflow | Browser-observed paths and states | Responsive coverage | Segment/handoff status | Findings | Required MAJOR improvement | Detailed evidence |
|---|---|---|---|---:|---|---|
| `WF-TEN-001` Brokerage provisioning | Production entry and no-workspace-access denial | D/T/M | All 3 segments and 2 handoffs accounted; activation roles blocked | 1 | Contextual principal-activation recovery with org, invitation, role-sync, sender, and safe retry/switch/escalation | [Identity/onboarding notes](agent-notes/identity-and-onboarding.md#wf-ten-001--brokerage-provisioning-and-principal-authority-activation) |
| `WF-TEN-002` Builder onboarding | Active Builder org context; fresh-session raw Unauthorized error | D/T/M | Builder postcondition partial; Broker/System and return handoff blocked | 2 | Durable brokerage/Broker assignment and onboarding state with typed recovery | [Identity/onboarding notes](agent-notes/identity-and-onboarding.md#wf-ten-002--builder-onboarding-and-broker-assignment) |
| `WF-TEN-003` Builder reassignment | Production access denial; public demo has no transfer equivalent | D/T/M | All 4 segments and 2 handoffs accounted as blocked | 1 | Governed transfer entry naming source/destination scope, authority, affected work, and owner | [Identity/onboarding notes](agent-notes/identity-and-onboarding.md#wf-ten-003--builder-reassignment-and-cross-brokerage-transfer) |
| `WF-TEN-004` Brokerage staff access | Production access denial | D/T/M | All 4 segments and 3 handoffs accounted as blocked | 1 | Role-projection diagnostics, capability delta, affected-work routing, and repair | [Identity/onboarding notes](agent-notes/identity-and-onboarding.md#wf-ten-004--brokerage-staff-invitation-role-change-and-deactivation) |
| `WF-CTR-001` Contractor identity/onboarding | Search, empty, reuse, new profile, invite, attach, invalid email, detail Forbidden | D/T/M | Builder sender exercised; Contractor/Ops/System and acknowledgements blocked | 4 | Durable attach/invite/claim/review/sync state plus mobile-first workflow sheet | [Identity/onboarding notes](agent-notes/identity-and-onboarding.md#wf-ctr-001--contractor-profile-invitation-onboarding-claim-and-review) |
| `WF-CTR-002` Contractor execution | Assignment/invite dialogs; backend authorization failures; responsive stacked dialog | D/T/M | Builder begins; `LOPS`, `CNTR`, `SYS`, and later handoffs blocked | 3 | One explicit directory→attach→assign→invite→acknowledge state machine and shared authorization service | [Build/contractor notes](agent-notes/build-and-contractor.md#ux-wf-ctr-002-001) |
| `WF-PRP-001` Proposal lifecycle | Draft edit, packet/timeline/review/draw schedule, missing permit, submit, frozen state, failed live-Build projection | D/T/M shell; desktop mutations | Builder/System partial; lender/admin decisions and closing blocked | 3 | Separate Builder submission from lender decision workbench; require named three-plan comparison/selection | [Proposal/planning notes](agent-notes/proposal-planning.md#ux-wf-prp-001-001) |
| `WF-MAT-001` Material planning | Empty state, create, invalid numeric input, recovery, recalculation, submit | Desktop mutations; D/T/M shared shell | Builder/System partial; lender review and active-Build copy blocked | 2 | Single milestone-scoped cost workspace with live budget/draw impact preview | [Proposal/planning notes](agent-notes/proposal-planning.md#ux-wf-mat-001-001) |
| `WF-BLD-001` Active Build execution | Production workspace, tabs, milestone contradictions, audit flood, stale live-Build dead end | D/T/M | Builder/System exercised; Lender/Ops/Contractor segments explicitly blocked | 4 | Canonical Build Workspace summary model and transactionally valid Build activation/navigation | [Build/contractor notes](agent-notes/build-and-contractor.md#ux-wf-bld-001-001) |
| `WF-MIL-001` Milestone verification | Builder completion, lender review, visit request, inspector upload/report, consumed token, return to lender | D/T/M | Inspector complete; `HO-04/05` exercised but wrong-context; final decision blocked | 3 | Immutable org/build/milestone/work-order identity across every evidence handoff | [Verification notes](agent-notes/operations-verification-draws.md#wf-mil-001--milestone-completion-evidence-review-site-visit-and-final-decision) |
| `WF-DRW-001` Draw lifecycle | Zero-capacity request, lender review, reasonless reject, raw save failure, release projection | D/T/M | Builder/Lender/System partial; release/receipt/exception handoffs blocked | 4 | One authoritative draw state machine with reasoned decisions, rollback/reconciliation, and typed errors | [Verification notes](agent-notes/operations-verification-draws.md#wf-drw-001--draw-request-review-approval-release-and-receipt-confirmation) |
| `WF-BUD-001` Budget revision | Live-build dashboard, stale navigation, Build detail unavailable | Desktop dashboard; mobile blocker | All 3 segments/handoffs accounted; workflow blocked before revision draft | 2 | Transactional activation plus version/variance/revision governance surface | [Proposal/planning notes](agent-notes/proposal-planning.md#ux-wf-bud-001-001) |
| `WF-OPS-001` Backoffice operations | Authenticated portfolio home; production queue entry; public list equivalents | Authenticated desktop; public D/T/M | All 4 segments/2 handoffs accounted; claim/acknowledgement blocked | 1 | Canonical work queue with owner, claim, age/SLA, blocker, authority, and returned decision | [Verification notes](agent-notes/operations-verification-draws.md#wf-ops-001--backoffice-portfolio-and-work-queue-triage) |
| `WF-CAL-001` Calendar coordination | Month/agenda, stale-date recovery, filters, edit rejection, reminder create/cancel, export failure | D/T/M | Builder/System broad; Lender/Ops/Contractor/Inspector and handoffs blocked | 5 | Event-type state machines, reliable export, and agenda-first responsive layouts | [Proposal/planning notes](agent-notes/proposal-planning.md#ux-wf-cal-001-001) |
| `WF-COM-001` Notification inbox | Notifications entry no-op; raw JSON/duplicated system event feed | D/M primary; desktop event drawer | Builder/System observed; Lender/Ops/Contractor and resolution handoffs blocked | 2 | Domain-driven notification center with actionable context, dedupe, preserved entity state, and reliable resolution | [Build/contractor notes](agent-notes/build-and-contractor.md#ux-wf-com-001-001) |
| `WF-INT-001` API/webhook integrations | Direct Settings entry reaches WorkOS; no public equivalent | Desktop | Technical Admin/System and both handoffs blocked before config | 1 | Tenant-scoped Integration Operations console with secret lifecycle, delivery logs, retry/repair, and audit | [Verification notes](agent-notes/operations-verification-draws.md#wf-int-001--apiwebhook-configuration-lifecycle-delivery-and-failure-review) |

## Detailed findings register

The linked family notes contain the canonical 20-field record for each finding. This register is the prioritized cross-workflow index.

| Finding | Severity | Segment | Finding title | Canonical record |
|---|---|---|---|---|
| `UX-WF-BLD-001-001` | CRITICAL | `WF-BLD-001.BLDR.01` | Same milestone has contradictory completion, subtask, assignment, and financial states | [Record](agent-notes/build-and-contractor.md#ux-wf-bld-001-001) |
| `UX-WF-BLD-001-002` | CRITICAL | `WF-BLD-001.SYS.01` | Passive Timeline viewing floods the audit log with identical events | [Record](agent-notes/build-and-contractor.md#ux-wf-bld-001-002) |
| `UX-WF-DRW-001-002` | CRITICAL | `WF-DRW-001.BLDR.01` | Impossible zero-capacity request is ready for review | [Record](agent-notes/operations-verification-draws.md#ux-wf-drw-001-002) |
| `UX-WF-PRP-001-001` | CRITICAL | `WF-PRP-001.BLDR.01` | Builder sees lender decisions and backoffice draw controls | [Record](agent-notes/proposal-planning.md#ux-wf-prp-001-001) |
| `UX-WF-TEN-002-001` | BLOCKER | `WF-TEN-002.BLDR.01` | Fresh Builder entry exposes raw Convex authorization stack | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ten-002-001) |
| `UX-WF-CTR-001-001` | BLOCKER | `WF-CTR-001.BLDR.01` | Builder cannot open the contractor just invited/attached | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ctr-001-001) |
| `UX-WF-CTR-002-001` | BLOCKER | `WF-CTR-002.BLDR.01` | Both assignment surfaces fail authorization and expose internals | [Record](agent-notes/build-and-contractor.md#ux-wf-ctr-002-001) |
| `UX-WF-CTR-002-002` | BLOCKER | `WF-CTR-002.BLDR.01` | Roster invitation fails because contractor is not attached to Builder scope | [Record](agent-notes/build-and-contractor.md#ux-wf-ctr-002-002) |
| `UX-WF-COM-001-001` | BLOCKER | `WF-COM-001.BLDR.01` | Notifications entry produces no visible or accessible inbox | [Record](agent-notes/build-and-contractor.md#ux-wf-com-001-001) |
| `UX-WF-MIL-001-001` | BLOCKER | `WF-MIL-001.SYS.01` | Site-visit token routes to the wrong Build and milestone | [Record](agent-notes/operations-verification-draws.md#ux-wf-mil-001-001) |
| `UX-WF-DRW-001-001` | BLOCKER | `WF-DRW-001.SYS.01` | Save failure leaks Convex internals and leaves contradictory state | [Record](agent-notes/operations-verification-draws.md#ux-wf-drw-001-001) |
| `UX-WF-DRW-001-003` | BLOCKER | `WF-DRW-001.LADM.01` | Draw rejection succeeds with an empty required reason | [Record](agent-notes/operations-verification-draws.md#ux-wf-drw-001-003) |
| `UX-WF-BUD-001-001` | BLOCKER | `WF-BUD-001.BLDR.01` | Approved live-Build entry opens a nonexistent/inaccessible record | [Record](agent-notes/proposal-planning.md#ux-wf-bud-001-001) |
| `UX-WF-BLD-001-003` | MAJOR | `WF-BLD-001.BLDR.01` | Active Build does not reflow at tablet/mobile | [Record](agent-notes/build-and-contractor.md#ux-wf-bld-001-003) |
| `UX-WF-BLD-001-004` | MAJOR | `WF-BLD-001.BLDR.01` | Listed live Build opens a terminal dead end | [Record](agent-notes/build-and-contractor.md#ux-wf-bld-001-004) |
| `UX-WF-CTR-002-003` | MAJOR | `WF-CTR-002.BLDR.01` | Contractor coordination uses nested controls and ambiguous stacked dialog | [Record](agent-notes/build-and-contractor.md#ux-wf-ctr-002-003) |
| `UX-WF-COM-001-002` | MAJOR | `WF-COM-001.SYS.01` | Visible feed exposes raw JSON and duplicated system events | [Record](agent-notes/build-and-contractor.md#ux-wf-com-001-002) |
| `UX-WF-TEN-001-001` | MAJOR | `WF-TEN-001.LADM.01` | Principal activation terminates at context-free access wall | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ten-001-001) |
| `UX-WF-TEN-002-002` | MAJOR | `WF-TEN-002.BLDR.01` | Post-onboarding UI never confirms assigned Broker | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ten-002-002) |
| `UX-WF-TEN-003-001` | MAJOR | `WF-TEN-003.LADM.01` | Transfer denial omits tenant scope, authority, and owner | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ten-003-001) |
| `UX-WF-TEN-004-001` | MAJOR | `WF-TEN-004.LADM.01` | Projection/deactivation failures look like generic missing access | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ten-004-001) |
| `UX-WF-CTR-001-002` | MAJOR | `WF-CTR-001.BLDR.01` | Invitation handoff has no durable pending/acknowledgement state | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ctr-001-002) |
| `UX-WF-CTR-001-003` | MAJOR | `WF-CTR-001.BLDR.01` | Mobile contractor sheet overflows and utilities obstruct actions | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ctr-001-003) |
| `UX-WF-OPS-001-001` | MAJOR | `WF-OPS-001.LOPS.01` | Portfolio aggregates do not establish accountable queue | [Record](agent-notes/operations-verification-draws.md#ux-wf-ops-001-001) |
| `UX-WF-MIL-001-002` | MAJOR | `WF-MIL-001.INSP.01` | Report omits clear location result and permit acknowledgement | [Record](agent-notes/operations-verification-draws.md#ux-wf-mil-001-002) |
| `UX-WF-DRW-001-004` | MAJOR | `WF-DRW-001.LOPS.01` | Responsive lender review clips context and leaks validator text | [Record](agent-notes/operations-verification-draws.md#ux-wf-drw-001-004) |
| `UX-WF-INT-001-001` | MAJOR | `WF-INT-001.TADM.01` | Integration configuration/delivery recovery cannot be audited | [Record](agent-notes/operations-verification-draws.md#ux-wf-int-001-001) |
| `UX-WF-PRP-001-002` | MAJOR | `WF-PRP-001.BLDR.01` | Proposal navigation is clipped without overflow affordance | [Record](agent-notes/proposal-planning.md#ux-wf-prp-001-002) |
| `UX-WF-PRP-001-003` | MAJOR | `WF-PRP-001.BLDR.01` | Required three-plan comparison/selection is not discoverable | [Record](agent-notes/proposal-planning.md#ux-wf-prp-001-003) |
| `UX-WF-MAT-001-001` | MAJOR | `WF-MAT-001.BLDR.01` | Material planning duplicates actions and obscures milestone context | [Record](agent-notes/proposal-planning.md#ux-wf-mat-001-001) |
| `UX-WF-BUD-001-002` | MAJOR | `WF-BUD-001.BLDR.01` | Live Build lacks Budget version/variance/revision-risk status | [Record](agent-notes/proposal-planning.md#ux-wf-bud-001-002) |
| `UX-WF-CAL-001-001` | MAJOR | `WF-CAL-001.SYS.01` | Calendar export has no download or failure feedback | [Record](agent-notes/proposal-planning.md#ux-wf-cal-001-001) |
| `UX-WF-CAL-001-002` | MAJOR | `WF-CAL-001.BLDR.01` | Schedule edits appear editable but silently revert | [Record](agent-notes/proposal-planning.md#ux-wf-cal-001-002) |
| `UX-WF-CAL-001-003` | MAJOR | `WF-CAL-001.BLDR.01` | Tablet/mobile clip primary controls and calendar context | [Record](agent-notes/proposal-planning.md#ux-wf-cal-001-003) |
| `UX-WF-CAL-001-004` | MAJOR | `WF-CAL-001.BLDR.01` | Reminder menu mixes unrelated mutations and cancels immediately | [Record](agent-notes/proposal-planning.md#ux-wf-cal-001-004) |
| `UX-WF-CAL-001-005` | MAJOR | `WF-CAL-001.SYS.01` | Long events repeat across agenda days in accessibility tree | [Record](agent-notes/proposal-planning.md#ux-wf-cal-001-005) |
| `UX-WF-CTR-001-004` | MODERATE | `WF-CTR-001.BLDR.01` | Invalid email silently disables Create and add | [Record](agent-notes/identity-and-onboarding.md#ux-wf-ctr-001-004) |
| `UX-WF-MIL-001-003` | MODERATE | `WF-MIL-001.INSP.01` | Consumed-token error has no first-party recovery | [Record](agent-notes/operations-verification-draws.md#ux-wf-mil-001-003) |
| `UX-WF-MAT-001-002` | MODERATE | `WF-MAT-001.BLDR.01` | Numeric validation is generic and delayed | [Record](agent-notes/proposal-planning.md#ux-wf-mat-001-002) |

## Prioritized improvement backlog

| Priority | Program | Scope and outcome | Findings / workflows |
|---|---|---|---|
| P0 | Canonical domain-state integrity | Define authoritative state machines and invariant tests for Build/Milestone/Draw/Budget; make impossible combinations unrepresentable; reconcile or block legacy contradictions. | `WF-BLD-001`, `WF-MIL-001`, `WF-DRW-001`, `WF-BUD-001`; BLD-001/002, MIL-001, DRW-001/002/003, BUD-001 |
| P0 | Immutable handoff identity | Bind organization, Build, milestone, work order, evidence package, and actor scope at every token/queue/notification boundary; reject mismatches before mutation. | `WF-MIL-001.HO-01`–`HO-07`, `WF-CTR-001/002`, `WF-DRW-001`; MIL-001, CTR-001/002 |
| P0 | Authority-correct UI and audit | Remove foreign-role controls from the DOM; require reason/confirmation for material decisions; capture actor/role/time/prior/new/warnings/reason atomically. | `WF-PRP-001`, `WF-DRW-001`, `WF-BUD-001`, `WF-TEN-004`; PRP-001, DRW-003 |
| P0 | Typed error containment | Replace raw Convex exceptions/stacks/schemas/payloads with domain errors, safe correlation IDs, preserved context, rollback, retry, and escalation. | TEN-002, CTR-001/002, DRW-001, BUD-001, COM-002 |
| P0 | Transactional Build activation/navigation | Do not publish Open live build until record creation, org scope, route, and authorization checks all pass; expose repair tasks for partial activation. | `WF-PRP-001.HO-05`, `WF-BLD-001`, `WF-BUD-001`; BLD-004, BUD-001 |
| P0 | Audit-signal repair | Stop no-op/view-state event creation; dedupe and aggregate; show human-readable field diffs; separate audit, notification, and telemetry streams. | BLD-002, COM-002 |
| P1 | Actionable operations queue and inbox | One queue/inbox model with owner, claim, age/SLA, blocker, authority, entity context, next action, acknowledgement, unread/action-required state, and reliable resolution. | `WF-OPS-001`, `WF-COM-001`, all admin handoffs |
| P1 | Contractor relationship lifecycle | Unify directory, attach, assign, invite, claim, review, sync, acknowledgement, resend/cancel/repair, and authorized detail views. | `WF-CTR-001`, `WF-CTR-002` |
| P1 | Proposal decision architecture | Require Cheapest Feasible/Fastest/Capital-Constrained comparison and explicit selection; separate Builder readiness/submission from lender review/closing. | `WF-PRP-001`, `WF-MAT-001` |
| P1 | Budget governance | Add active version, variance, threshold, affected milestones/draws, current owner, diff, deadline, and revision decision history to Build Workspace. | `WF-BUD-001`, `WF-MAT-001` |
| P1 | Calendar state and responsive redesign | Use event-type actions, explicit change requests/impact preview, reliable export state, agenda-first mobile, unique accessible event semantics, and confirmation for cancellation. | `WF-CAL-001` |
| P1 | Tenant access recovery | Make invite, activation, transfer, role change, deactivation, and projection states explicit with org/role, sender/owner, expiry/effective time, capability delta, and safe recovery. | `WF-TEN-001`–`WF-TEN-004` |
| P1 | Integration Operations console | Build key/secret lifecycle, endpoint/subscription/mapping validation, dangerous-change confirmation, test delivery, secret-safe logs, retry/backoff/dead-letter, rotate/revoke, and audit. | `WF-INT-001` |
| P1 | Responsive task-priority layouts | Replace compressed desktop canvases with ordered mobile/tablet task stacks, sticky identity/next action, safe-area handling, scroll-snap/overflow navigation, and unobstructed 44px targets. | BLD-003, CTR-001/003, DRW-004, PRP-002, CAL-003 |
| P2 | Field recovery and validation semantics | Add field-specific errors, `aria-invalid`/descriptions, focus movement, token regeneration/request-new-link, and secret-safe diagnostics. | CTR-004, MAT-002, MIL-003 |

## Systemic recommendations

1. **Treat Build Workspace as the canonical control plane.** Proposal activation, Budget version, milestone state, evidence, visits, draws, assignments, calendar impacts, and communications should resolve from shared canonical read models rather than independent labels/calculations.
2. **Make handoffs first-class records.** Every sender/receiver transition needs explicit sender, receiver, artifacts, acknowledgement, due/age, next action, and failure/recovery state. URLs and tokens must carry opaque IDs but resolve against immutable server-side scope.
3. **Enforce role authority structurally.** Unauthorized actions should not render as disabled foreign controls. Builder, Contractor, Inspector, Operations, and Lender Admin surfaces should share context but expose only legal actions.
4. **Separate domain state, audit, notifications, and view state.** Domain mutations create reasoned audit/outbox events; notifications are persona-specific projections; telemetry/view state never pollutes material audit history.
5. **Adopt typed domain errors end to end.** Map authorization, validation, conflict, stale record, missing artifact, delivery, and sync failures to safe user states with retry/escalation; never render backend stacks or schemas.
6. **Design responsive variants around the next decision.** On mobile, prioritize identity, status, blocker, required artifact, and legal action. Charts, secondary metrics, and audit detail should progressively disclose below that core.
7. **Create one accessible interaction model per logical object.** Avoid nested buttons/cards and duplicate agenda events; ensure unique accessible names, semantic state, visible focus, deterministic focus order, and responsive reflow without clipped controls.
8. **Ship seeded multi-persona workflow fixtures.** Maintain deterministic Builder, Contractor, Inspector, Operations, Lender Admin, Platform Admin, and Technical Admin dev identities plus success/alternate/error fixtures so every handoff can be regression-tested without ad hoc auth state.

## Coverage gaps and explicit blockers

Every manifest segment and handoff is accounted for. The following were not executable end to end and are intentionally marked blocked rather than inferred:

### Persona segments blocked before their primary action

- `WF-BLD-001.CNTR.01`, `WF-BLD-001.LOPS.01`, `WF-BLD-001.LADM.01` — no corresponding authenticated Contractor/Operations/Admin Build Workspace.
- `WF-CAL-001.CNTR.01`, `WF-CAL-001.LOPS.01`, `WF-CAL-001.LADM.01`, `WF-CAL-001.INSP.01` — Builder/System calendar was available; receiver/authority personas were not.
- `WF-COM-001.CNTR.01`, `WF-COM-001.LOPS.01`, `WF-COM-001.LADM.01` — notification center did not open from the available Builder and no other inbox persona was reachable.
- `WF-CTR-002.LOPS.01`, `WF-CTR-002.SYS.01` — Builder assignment/invite failed authorization before downstream review/orchestration.
- `WF-INT-001.TADM.01`, `WF-INT-001.SYS.01` — production Settings required an unavailable Technical Admin session.

### Handoffs blocked before receiver acknowledgement

- `WF-COM-001.HO-02`, `WF-COM-001.HO-03` — no functional notification delivery/resolution surface.
- `WF-CAL-001.HO-02` — Operations-to-Inspector visit dispatch could not be exercised with production personas.
- `WF-DRW-001.HO-04`, `WF-DRW-001.HO-05` — release, receipt confirmation, and settlement exception were not reachable from the invalid request.
- `WF-BUD-001.HO-02`, `WF-BUD-001.HO-03` — live-Build/Budget revision entry failed before Admin decision and Builder return.
- `WF-MIL-001.HO-01`, `WF-MIL-001.HO-02`, `WF-MIL-001.HO-03`, `WF-MIL-001.HO-06`, `WF-MIL-001.HO-07` — Builder submission/revision and final Admin package/decision could not be completed; `WF-MIL-001.HO-04`/`WF-MIL-001.HO-05` were exercised but misrouted.
- `WF-CTR-002.HO-03`, `WF-CTR-002.HO-04` — assignment failed before contractor evidence and lender follow-up.
- `WF-PRP-001.HO-04` — no Lender Admin closing authority; active-Build projection later failed.

Environment-specific interruptions were recorded separately and not treated as product findings unless the rendered product state itself was observed: temporary Vite `ECONNRESET`, intermittent browser-control navigation timeouts, and WorkOS sign-in walls for isolated sessions.

## Evidence and validation audit

- Manifest baseline: 16 parents, 63 persona segments, 52 handoffs, 409 stable steps.
- Findings: 39 unique IDs; no duplicates.
- Severity distribution: 4 CRITICAL, 9 BLOCKER, 23 MAJOR, 3 MODERATE.
- Evidence: 108 PNG screenshots and 22 saved DOM snapshots.
- Every parent workflow has at least one credible MAJOR-or-higher recommendation.
- Every finding block contains exactly 20 required fields.
- Every screenshot cited in a finding was saved under [`evidence/`](evidence/) and visually inspected by the auditing agent before citation.
- Family notes:
  - [Identity and onboarding](agent-notes/identity-and-onboarding.md)
  - [Proposal and planning](agent-notes/proposal-planning.md)
  - [Build, contractor, and communications](agent-notes/build-and-contractor.md)
  - [Operations, milestone verification, draws, and integrations](agent-notes/operations-verification-draws.md)
