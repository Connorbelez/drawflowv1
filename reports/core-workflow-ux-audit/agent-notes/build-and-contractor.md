# Build and Contractor Workflow UX Audit Notes

Browser-observed audit scope: `WF-BLD-001`, `WF-CTR-002`, and `WF-COM-001` only. Product source code was not inspected and no fixes were implemented.

## Audit log

- Chrome session: `🔎 Build contractor UX audit`; authenticated organization: FairLendBrokerage; authenticated persona: Builder.
- Isolated `agent-browser` session: `build-contractor-audit`; used to verify the unauthenticated WorkOS wall.
- Application: `http://localhost:3000`.
- Viewports exercised: 1440×900, 1024×768, and 390×844.
- Browser-observed production surfaces: Builder dashboard; active Build Details, Milestones, Contractors, Timeline, Evidence, Staff, Events/audit log; contractor and backoffice protected-access routes; public `/demo/drawflow` route.
- End-of-run environmental blocker: `localhost:3000` began returning `ERR_CONNECTION_REFUSED` during the final responsive protected-access capture. After the server resumed listening, the single requested retry to `/backoffice` still failed: Chrome timed out waiting for `Page.navigate` before a responsive state rendered. The last successful production interaction remained `WF-CTR-002.BLDR.01.STEP-02`, which returned a rendered invitation authorization error. The responsive protected-access files from this outage/retry are not treated as valid protected-access evidence.

## Detailed findings

### UX-WF-BLD-001-001

1. **Finding ID:** `UX-WF-BLD-001-001`
2. **Workflow ID:** `WF-BLD-001`
3. **Persona-specific segment ID:** `WF-BLD-001.BLDR.01`
4. **Workflow step ID:** `WF-BLD-001.BLDR.01.STEP-01`
5. **Handoff ID, if applicable:** None
6. **Persona:** Builder (`BLDR`)
7. **Page, route, dialog, or interface:** `/builder/builds/ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r`, Details and Milestones tabs
8. **Finding title:** The same milestone presents contradictory completion, subtask, assignment, and financial states
9. **Severity:** `CRITICAL`
10. **Finding type:** Usability; Information Architecture; System Feedback; Trust and Safety; Consistency
11. **Observed behavior:** “Permits, demo & foundation” is simultaneously shown as “Completion submitted,” 100% complete, unassigned, and `0/7` sub-milestones done. Details labels its Budget `$120,049`, while the Milestone Kanban labels the same milestone Budget `$88K`; `$88,008` is separately shown as Draw unlock, strongly indicating the kanban is presenting draw unlock as budget.
12. **Expected professional experience:** A canonical milestone state should drive all surfaces, distinguish milestone cost from reimbursable draw unlock, and prevent completion confidence from contradicting unfinished scope and missing assignments.
13. **User impact:** Builders and lender reviewers cannot trust whether work is actually complete or which amount is the approved milestone cost, creating approval, draw, and audit risk.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.BLDR.01.STEP-01-active-build-current-desktop-1440x900.png`; `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.BLDR.01.STEP-01-details-mobile-390x844.png`.
15. **Reproduction steps:** Open Builder dashboard → open `4-plex Proposal` live build → inspect Details/Current → open Milestones → compare the Site Visit card for `FOUR-PLEX-DRAW-01`.
16. **Recommended improvement:** Refactor Build Workspace to use one canonical milestone summary model with separately named Planned cost, Actual cost, Eligible reimbursement/Draw unlock, sub-milestone completion, assignment coverage, evidence state, and submission/review state. Add a blocking reconciliation banner when source records disagree.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Consistency, visibility of system status, and error prevention are foundational for a financial control plane; conflicting canonical state is materially worse than a local display defect.
19. **Acceptance criteria:** Every milestone surface shows the same lifecycle state and sub-milestone counts; `$120,049` and `$88,008` are consistently labeled by their actual meanings; submission cannot appear equivalent to completed/approved; any legacy discrepancy is surfaced as an actionable reconciliation state.
20. **Related or duplicate finding IDs:** `UX-WF-BLD-001-002`

### UX-WF-BLD-001-002

1. **Finding ID:** `UX-WF-BLD-001-002`
2. **Workflow ID:** `WF-BLD-001`
3. **Persona-specific segment ID:** `WF-BLD-001.SYS.01`
4. **Workflow step ID:** `WF-BLD-001.SYS.01.STEP-05`
5. **Handoff ID, if applicable:** None
6. **Persona:** DrawFlow System (`SYS`), observed by Builder
7. **Page, route, dialog, or interface:** Active Build Timeline and “Events and audit log” drawer
8. **Finding title:** Passive timeline viewing floods the audit log with identical state-update events
9. **Severity:** `CRITICAL`
10. **Finding type:** System Feedback; Performance Perception; Trust and Safety; Workflow Design; Content Design
11. **Observed behavior:** Without a deliberate timeline edit, the Events count rose from 170 to 229 during observation. The drawer showed eight identical “active build timeline state updated” quick actions timestamped “just now,” each with the same raw JSON route state, and an Event Log count of 237 that continued increasing.
12. **Expected professional experience:** Audit history should append only meaningful, durable state transitions, dedupe no-op writes, identify the actor in human terms, and distinguish user actions from transient view state.
13. **User impact:** Material decisions are buried under noise, audit history becomes unusable, users may resolve meaningless events, and storage/notification volume can grow without bound.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.SYS.01.STEP-05-audit-event-flood-desktop-1440x900.png`.
15. **Reproduction steps:** Open the `4-plex Proposal` Timeline tab → make no edit → observe Events count → open Events → compare consecutive “active build timeline state updated” entries and payloads.
16. **Recommended improvement:** Separate ephemeral route/view state from auditable domain state; debounce persistence, compare normalized prior/new values server-side, suppress no-op events, and aggregate rapid legitimate edits into one human-readable audit record.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Auditability depends on signal integrity. A no-op event storm violates traceability, system feedback, and the product’s own material-decision audit contract.
19. **Acceptance criteria:** Leaving Timeline open for five minutes without edits creates zero audit events; one substantive change creates exactly one event; events show human actor, field-level diff, reason, timestamp, and affected entity; ephemeral panel/selection state never enters the material audit log.
20. **Related or duplicate finding IDs:** `UX-WF-COM-001-002`

### UX-WF-BLD-001-003

1. **Finding ID:** `UX-WF-BLD-001-003`
2. **Workflow ID:** `WF-BLD-001`
3. **Persona-specific segment ID:** `WF-BLD-001.BLDR.01`
4. **Workflow step ID:** `WF-BLD-001.BLDR.01.STEP-01`
5. **Handoff ID, if applicable:** None
6. **Persona:** Builder (`BLDR`)
7. **Page, route, dialog, or interface:** Active Build shell and tabbed workspace at 1024×768 and 390×844
8. **Finding title:** Active Build does not reflow reliably at tablet and mobile breakpoints
9. **Severity:** `MAJOR`
10. **Finding type:** Responsive Design; Accessibility; Navigation; Interaction Design
11. **Observed behavior:** At 1024×768 the Details header and Current milestone content overflow to the right, hiding the Budget/Event area and the `Complete Milestone` action. At 390×844 only the first five of nine tabs are visible; the strip is horizontally clipped with no affordance that Evidence, Staff, Calendar, and Gantt exist. Floating assistant/devtool controls cover financial and action content.
12. **Expected professional experience:** The workspace should prioritize header state and the current action, adapt its tab navigation for touch, and avoid horizontal clipping or floating-control obstruction.
13. **User impact:** Tablet users can miss or be unable to reach the primary completion action; mobile field users cannot discover several core work areas.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.BLDR.01.STEP-01-details-tablet-1024x768.png`; `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.BLDR.01.STEP-01-details-mobile-390x844.png`; `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.BLDR.01.STEP-02-timeline-mobile-rendered-390x844.png`.
15. **Reproduction steps:** Set viewport to 1024×768 and open Details → inspect right edge/current action → set 390×844 → inspect tab strip and scroll content.
16. **Recommended improvement:** Introduce a responsive Build Workspace shell: collapse header metrics into a two-column summary, keep the primary next action sticky, replace the nine-tab strip with a scroll-snap tab rail plus overflow indicator or grouped mobile navigation, and reserve safe areas for floating utilities.
17. **Scope of change:** Page redesign
18. **Rationale and applicable UI/UX principle:** Responsive reflow and target reachability are WCAG 2.2 AA expectations and are essential for field-oriented construction workflows.
19. **Acceptance criteria:** No horizontal page overflow at 1024 or 390 widths; Events, Budget, and current action are visible/reachable without horizontal page scrolling; all nine sections are discoverable by keyboard and touch; fixed controls never obscure actionable content at 200% zoom.
20. **Related or duplicate finding IDs:** None

### UX-WF-BLD-001-004

1. **Finding ID:** `UX-WF-BLD-001-004`
2. **Workflow ID:** `WF-BLD-001`
3. **Persona-specific segment ID:** `WF-BLD-001.BLDR.01`
4. **Workflow step ID:** `WF-BLD-001.BLDR.01.STEP-01`
5. **Handoff ID, if applicable:** None
6. **Persona:** Builder (`BLDR`)
7. **Page, route, dialog, or interface:** Builder dashboard → Live builds table
8. **Finding title:** A listed live Build opens a terminal “Build detail unavailable” dead end
9. **Severity:** `MAJOR`
10. **Finding type:** Navigation; Error Handling; Workflow Design; System Feedback
11. **Observed behavior:** `Seed Scenario - Approved With Permit` appears in the Live builds table with an enabled `Open live build` action, but navigating opens `/builder/builds/demo-timeline-k571m35kbnarzebf8acerr8vkn87km8a` and only “Build detail unavailable.” No recovery action returns to the live-build list or identifies whether the record is missing versus unauthorized. `4-plex Proposal` does open successfully.
12. **Expected professional experience:** Every live-build list row should be access-valid before display; any race/deletion error should preserve context and offer a recovery route.
13. **User impact:** Builders cannot distinguish corrupt seeded data from a permissions problem and hit a dead end from a trusted dashboard.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.BLDR.01.STEP-01-builder-dashboard-desktop-1440x900.png`; `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.BLDR.01.STEP-01-live-build-unavailable-desktop-1440x900.png`.
15. **Reproduction steps:** Open `/builder` → under Live builds choose `Seed Scenario - Approved With Permit` → select `Open live build`.
16. **Recommended improvement:** Validate dashboard records against accessible active Builds, remove stale demo identifiers from production lists, and replace the dead end with a contextual error containing Build name, reason category, retry, and “Back to live builds.”
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Navigation must preserve user orientation and recovery; an enabled action must not knowingly lead to a terminal state.
19. **Acceptance criteria:** Every displayed live-build action opens an accessible Build; stale entries are excluded or labeled unavailable before click; the error state provides retry and return actions and never conflates absence with authorization.
20. **Related or duplicate finding IDs:** None

### UX-WF-CTR-002-001

1. **Finding ID:** `UX-WF-CTR-002-001`
2. **Workflow ID:** `WF-CTR-002`
3. **Persona-specific segment ID:** `WF-CTR-002.BLDR.01`
4. **Workflow step ID:** `WF-CTR-002.BLDR.01.STEP-01`
5. **Handoff ID, if applicable:** `WF-CTR-002.HO-01`
6. **Persona:** Builder (`BLDR`)
7. **Page, route, dialog, or interface:** Active Build Milestones and Contractors assignment dialogs
8. **Finding title:** Both Builder assignment surfaces fail backend authorization and expose raw server internals
9. **Severity:** `BLOCKER`
10. **Finding type:** Workflow Design; Error Handling; Trust and Safety; Cross-Persona Handoff; Permissions
11. **Observed behavior:** The UI presents enabled `Assign contractor`/`Assign crew` controls. After selecting a contractor, role, milestone, and sub-milestone, both confirmation paths fail with `Forbidden: role` from `requireBackofficeActiveBuildWrite`, rendering the full Convex mutation name, request ID, source paths, middleware stack, and internal function names.
12. **Expected professional experience:** Builder-authorized assignment should succeed per the workflow contract, or the action should be absent/clearly read-only. Any failure should be safe, human-readable, and recoverable.
13. **User impact:** `WF-CTR-002.HO-01` cannot start, contractor schedule acknowledgement can never be requested, and technical details undermine trust and leak implementation structure.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-CTR-002.BLDR.01.STEP-01-HO-01-raw-server-error-desktop-1440x900.png`; `reports/core-workflow-ux-audit/evidence/build-contractor/WF-CTR-002.BLDR.01.STEP-01-crew-confirm-forbidden-desktop-1440x900.png`.
15. **Reproduction steps:** Open `4-plex Proposal` → Milestones → open MEP rough-ins → Assign contractor → select Oscar → enter role → Attach; alternatively Contractors → select Test1 → fourth Assign crew (MEP rough-ins) → Confirm assignment.
16. **Recommended improvement:** Align the server authorization contract with `WF-CTR-002.BLDR.01`; use one shared assignment service from both surfaces; preflight permission/scope before rendering the CTA; map authorization failures to a concise explanation and escalation/retry path.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** The interface must accurately reflect permissions and prevent impossible actions; security failures must not disclose internal stack traces.
19. **Acceptance criteria:** An authorized Builder can create/update/remove an own-Build assignment from either surface and receives a success confirmation; an unauthorized actor never sees an enabled CTA; errors contain no mutation names, request IDs, filesystem paths, or stack traces; `WF-CTR-002.HO-01` delivery is created exactly once.
20. **Related or duplicate finding IDs:** `UX-WF-CTR-002-002`, `UX-WF-CTR-002-003`

### UX-WF-CTR-002-002

1. **Finding ID:** `UX-WF-CTR-002-002`
2. **Workflow ID:** `WF-CTR-002`
3. **Persona-specific segment ID:** `WF-CTR-002.BLDR.01`
4. **Workflow step ID:** `WF-CTR-002.BLDR.01.STEP-02`
5. **Handoff ID, if applicable:** `WF-CTR-002.HO-01`
6. **Persona:** Builder (`BLDR`)
7. **Page, route, dialog, or interface:** Active Build Contractors roster, mobile and desktop
8. **Finding title:** “Proposal roster” invitation action fails because the contractor is not actually attached to Builder scope
9. **Severity:** `BLOCKER`
10. **Finding type:** Cross-Persona Handoff; Workflow Design; Consistency; Error Handling; Trust and Safety
11. **Observed behavior:** The Contractors tab reports `Proposal roster 3/3`, presents Test1 as `Not invited`, and exposes `Invite Test1 to platform`. Selecting it returns `Forbidden: contractor is not attached to any of your proposals/builds`, again rendering the full Convex stack trace. The roster and authorization model directly contradict each other.
12. **Expected professional experience:** A contractor shown in the scoped Build roster should be invite-eligible, or be explicitly labeled as a brokerage-directory result that must first be attached.
13. **User impact:** The Builder cannot notify the contractor or request acknowledgement, and the mobile error consumes most of the viewport with technical text.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-CTR-002.BLDR.01.STEP-02-HO-01-invite-forbidden-mobile-390x844.png`.
15. **Reproduction steps:** Open `4-plex Proposal` → Contractors → in Proposal roster choose `Invite` on Test1.
16. **Recommended improvement:** Define one explicit state progression—Brokerage directory → attached to Build → assigned to scope → invited → acknowledgement pending—and show only actions valid for the current state. Make “Attach and invite” atomic when permitted and rollback safely on failure.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Users need a clear object lifecycle and accurate affordances; cross-persona handoffs must not depend on hidden backend scope distinctions.
19. **Acceptance criteria:** Roster terminology matches authorization scope; invitation is enabled only after attachment; atomic attach/invite succeeds or leaves neither partial state; the receiving contractor gets one scoped notification; mobile errors are concise and actionable.
20. **Related or duplicate finding IDs:** `UX-WF-CTR-002-001`

### UX-WF-CTR-002-003

1. **Finding ID:** `UX-WF-CTR-002-003`
2. **Workflow ID:** `WF-CTR-002`
3. **Persona-specific segment ID:** `WF-CTR-002.BLDR.01`
4. **Workflow step ID:** `WF-CTR-002.BLDR.01.STEP-01`
5. **Handoff ID, if applicable:** `WF-CTR-002.HO-01`
6. **Persona:** Builder (`BLDR`)
7. **Page, route, dialog, or interface:** Milestone card, contractor roster, milestone-detail drawer, and assignment dialog
8. **Finding title:** Contractor coordination uses nested interactive controls and an ambiguous stacked-dialog form
9. **Severity:** `MAJOR`
10. **Finding type:** Accessibility; Interaction Design; Information Architecture; Content Design; Consistency
11. **Observed behavior:** Accessibility snapshots show `Assign contractor` buttons nested inside clickable milestone-card buttons and `Invite` buttons nested inside contractor-selection buttons. The assignment dialog stacks over the milestone drawer, uses machine slug `four-plex-draw-04` instead of “MEP rough-ins,” duplicates Pay rate and Agreed rate concepts, retains a hidden prior search when switching New/Existing, and leaves disabled submit actions unexplained.
12. **Expected professional experience:** Cards and secondary actions should be separate semantic controls; the flow should use one focused surface with human scope context, explicit required fields, and a single cost/rate model.
13. **User impact:** Keyboard and assistive-technology users face invalid focus/activation behavior; all users must reason about two overlays and unclear financial inputs before a consequential handoff.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-CTR-002.BLDR.01.STEP-01-HO-01-assignment-forbidden-desktop-1440x900.png`; `reports/core-workflow-ux-audit/evidence/build-contractor/WF-CTR-002.BLDR.01.STEP-01-contractors-mobile-390x844.png`.
15. **Reproduction steps:** Open Milestones → inspect a clickable card with its inner Assign action → open MEP rough-ins → Assign contractor → switch Existing/New → inspect fields and focus structure; compare Contractors roster cards.
16. **Recommended improvement:** Rebuild assignment as a single full-height workflow panel with semantic listbox/card selection, separately rendered secondary actions, a plain-language milestone summary, required-field annotations, and one normalized commercial-terms section.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Valid semantics, one task per surface, recognition over recall, and progressive disclosure reduce errors and meet WCAG focus/operable requirements.
19. **Acceptance criteria:** No interactive element contains another interactive element; keyboard focus order is deterministic and trapped in one dialog; selected Existing/New and contractor states are programmatically exposed; all required/disabled reasons are visible; only one rate/cost concept exists per assignment.
20. **Related or duplicate finding IDs:** `UX-WF-CTR-002-001`

### UX-WF-COM-001-001

1. **Finding ID:** `UX-WF-COM-001-001`
2. **Workflow ID:** `WF-COM-001`
3. **Persona-specific segment ID:** `WF-COM-001.BLDR.01`
4. **Workflow step ID:** `WF-COM-001.BLDR.01.STEP-01`
5. **Handoff ID, if applicable:** `WF-COM-001.HO-01`
6. **Persona:** Builder (`BLDR`)
7. **Page, route, dialog, or interface:** Global header `Notifications` button across Builder dashboard/active Build
8. **Finding title:** Notifications entry point produces no visible or accessible inbox state
9. **Severity:** `BLOCKER`
10. **Finding type:** Interaction Design; System Feedback; Navigation; Accessibility; Cross-Persona Handoff
11. **Observed behavior:** Clicking the uniquely named `Notifications` button at desktop and mobile produced no dialog, drawer, popover, route change, focus change, empty state, toast, or error. Repeated DOM snapshots remained unchanged.
12. **Expected professional experience:** The entry point should always open a delivery-first inbox or a clear empty/error state and move focus into it.
13. **User impact:** Builder deliveries cannot be read, filtered, dismissed, or followed; `WF-COM-001.HO-01` cannot be acknowledged and actionable work is undiscoverable.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-COM-001.BLDR.01.STEP-01-notifications-no-op-desktop-1440x900.png`; `reports/core-workflow-ux-audit/evidence/build-contractor/WF-COM-001.BLDR.01.STEP-01-notifications-no-op-mobile-390x844.png`.
15. **Reproduction steps:** Open any authenticated Builder page → activate header Notifications → wait for rendered state → inspect DOM and viewport.
16. **Recommended improvement:** Implement a dedicated notification center with unread/action-required counts, explicit loading/empty/error states, category filters, preserved entity context, reliable action links, focus management, and domain-driven resolution.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** A global action must acknowledge activation and expose current state; cross-persona coordination requires visible ownership and next action.
19. **Acceptance criteria:** Activation opens an accessible named inbox within 300 ms or shows a loading state; focus enters the inbox and returns to the trigger on close; empty/error states are explicit; a seeded delivery can be read, followed, dismissed, and resolved from canonical domain state.
20. **Related or duplicate finding IDs:** `UX-WF-COM-001-002`

### UX-WF-COM-001-002

1. **Finding ID:** `UX-WF-COM-001-002`
2. **Workflow ID:** `WF-COM-001`
3. **Persona-specific segment ID:** `WF-COM-001.SYS.01`
4. **Workflow step ID:** `WF-COM-001.SYS.01.STEP-05`
5. **Handoff ID, if applicable:** `WF-COM-001.HO-01`
6. **Persona:** DrawFlow System (`SYS`), observed by Builder
7. **Page, route, dialog, or interface:** “Events and audit log” → `EVENTS + QUICK ACTION`
8. **Finding title:** The only visible action feed exposes raw JSON and duplicated system events instead of actionable notification context
9. **Severity:** `MAJOR`
10. **Finding type:** Content Design; Information Architecture; System Feedback; Cross-Persona Handoff; Consistency
11. **Observed behavior:** The Events drawer renders repeated `active build timeline state updated` cards with raw serialized internal state, `View` and `Resolve` actions, and no human explanation of ownership or required next action. Identical events appear as separate quick actions even though the global Notifications control does nothing.
12. **Expected professional experience:** Notifications and audit history should be separate but cross-linked: concise notification copy should explain why the item arrived and the canonical action, while the audit log preserves a human-readable immutable decision history.
13. **User impact:** Users cannot distinguish action-required work from technical telemetry and may “resolve” noise while missing material items.
14. **Evidence and screenshot reference:** `reports/core-workflow-ux-audit/evidence/build-contractor/WF-BLD-001.SYS.01.STEP-05-audit-event-flood-desktop-1440x900.png`.
15. **Reproduction steps:** Open active Build → Timeline → Events → inspect `EVENTS + QUICK ACTION` cards.
16. **Recommended improvement:** Build a shared event-to-delivery presentation layer that dedupes supported domain events, generates persona-specific title/body/context/action, excludes telemetry, and resolves only from canonical domain outcomes; keep audit payload details behind an admin disclosure.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Information scent, progressive disclosure, and separation of operational work from forensic history materially improve comprehension and prevent accidental resolution.
19. **Acceptance criteria:** Quick actions contain human title, entity, cause, sender/system source, age, owner, and next action; no raw JSON or internal IDs are shown by default; duplicates collapse; resolving requires or reflects a canonical domain outcome; audit history remains immutable and separately navigable.
20. **Related or duplicate finding IDs:** `UX-WF-BLD-001-002`, `UX-WF-COM-001-001`

## Per-workflow summaries

### WF-BLD-001 — Active Build Schedule, Progress, Cost, and Participant Management

- **Persona and category:** Cross-persona Build execution; segments exercised/attempted: `BLDR`, `SYS`, `LOPS`, `LADM`, `CNTR`.
- **Audit status:** Partially audited.
- **Paths and states tested:** Builder dashboard list/success and unavailable-detail path; active Build Details current state; Milestones backlog, empty columns, Site Visit state, milestone detail, contractor assignment error; Evidence pending/approved/location-unverified/HEIC-loading/zero-file states; Timeline cash-risk, selected completion, saved state; Staff empty-email validation and permission matrix; Events audit feed. `LOPS`/`LADM` protected-access routes and `CNTR` dependency were attempted but not authorized.
- **Browser viewport sizes tested:** 1440×900, 1024×768, 390×844.
- **Handoffs tested:** `WF-BLD-001.HO-01` was attempted through both assignment surfaces and blocked by authorization; `WF-BLD-001.HO-02` and `WF-BLD-001.HO-03` could not be completed because the authenticated session lacks backoffice/admin access.
- **Overall usability assessment:** Strong breadth but unsafe state inconsistency and multiple dead ends prevent confident task completion.
- **Overall polish assessment:** Visually coherent at desktop, but internal labels, audit telemetry, breakpoint overflow, and inaccessible control composition make the production experience feel unfinished.
- **Findings by severity:** 0 BLOCKER, 2 CRITICAL, 2 MAJOR, 0 MODERATE, 0 MINOR.
- **Most consequential point of friction:** Canonical milestone state and financial meaning disagree across the workspace.
- **Required major improvement:** Refactor Build Workspace around a single canonical milestone/read model and responsive next-action shell, with reconciled state and human-readable audit history.
- **Relevant evidence:** `WF-BLD-001.BLDR.01.STEP-01-active-build-current-desktop-1440x900.png`, `WF-BLD-001.SYS.01.STEP-05-audit-event-flood-desktop-1440x900.png`, `WF-BLD-001.BLDR.01.STEP-01-details-tablet-1024x768.png`, `WF-BLD-001.BLDR.01.STEP-01-details-mobile-390x844.png`.
- **Blockers or coverage gaps:** Last successful Builder step was review/interaction through `WF-BLD-001.BLDR.01.STEP-04`; schedule/cost mutation, evidence upload, threshold routing, and downstream lender resolution were not completed. Public `/demo/drawflow/active` rendered only the global header and blank body. The final server outage prevented repeating all protected-access screens at every breakpoint; a single retry after port 3000 resumed listening still timed out waiting for `Page.navigate`.

### WF-CTR-002 — Contractor Assignment, Schedule Acknowledgement, Scope Clarification, and Supporting Evidence

- **Persona and category:** Cross-persona Contractor execution; segments exercised/attempted: `BLDR`, `CNTR`, `LOPS`, `SYS`.
- **Audit status:** Partially audited; primary handoff blocked.
- **Paths and states tested:** Builder roster search/result/empty state; Existing/New assignment paths; contractor selection; role/sub-milestone/cost fields; assignment confirmation error; invitation confirmation error; unassigned roster and milestone states; tablet/mobile layouts; direct contractor and backoffice protected-access routes.
- **Browser viewport sizes tested:** 1440×900, 1024×768, 390×844.
- **Handoffs tested:** `WF-CTR-002.HO-01` attempted and failed at both assignment and invitation backend gates. `WF-CTR-002.HO-02`, `HO-03`, and `HO-04` were not reachable because no assignment/handoff could be created and the session has no Contractor/LOPS workspace role.
- **Overall usability assessment:** The Builder can discover and fill the workflow, but cannot complete it; permission and scope contracts contradict the visible UI.
- **Overall polish assessment:** Dense but understandable layouts are undermined by nested controls, stacked dialogs, machine identifiers, ambiguous cost fields, and raw server errors.
- **Findings by severity:** 2 BLOCKER, 0 CRITICAL, 1 MAJOR, 0 MODERATE, 0 MINOR.
- **Most consequential point of friction:** An enabled, fully populated assignment flow always terminates in `Forbidden: role`.
- **Required major improvement:** Implement one authoritative contractor lifecycle and shared assignment service—directory, attached, assigned, invited, acknowledged—with state-valid CTAs and safe error mapping.
- **Relevant evidence:** `WF-CTR-002.BLDR.01.STEP-01-crew-confirm-forbidden-desktop-1440x900.png`, `WF-CTR-002.BLDR.01.STEP-02-HO-01-invite-forbidden-mobile-390x844.png`, `WF-CTR-002.CNTR.01.STEP-01-protected-access-desktop-1440x900.png`.
- **Blockers or coverage gaps:** Last successful assignment action was selecting contractor/role/sub-milestone and invoking Confirm; server rejected before state creation. Contractor direct entry redirected to `protected-access?reason=no-workspace-access&workspace=contractor`. No acknowledgement, clarification, dispute, evidence upload, feedback, replacement, or recovery state could be exercised.

### WF-COM-001 — Actionable Notification Inbox and Resolution

- **Persona and category:** Cross-persona Notifications; segments exercised/attempted: `BLDR`, `SYS`, `LOPS`, `LADM`, `CNTR`.
- **Audit status:** Blocked.
- **Paths and states tested:** Global Builder Notifications activation at desktop/mobile; no-response state; Events + Quick Action feed; raw/deduplicated system-event behavior; isolated WorkOS sign-in wall; Contractor and backoffice protected-access routes.
- **Browser viewport sizes tested:** 1440×900, 1024×768 protected-access attempt, 390×844.
- **Handoffs tested:** `WF-COM-001.HO-01` could not be acknowledged because the Builder inbox did not open. `HO-02` and `HO-03` were blocked by missing recipient-workspace access and the failed upstream contractor assignment/invitation.
- **Overall usability assessment:** No notification workflow can be completed from the global entry point.
- **Overall polish assessment:** The visible action feed is technical telemetry, not persona-oriented notification UX.
- **Findings by severity:** 1 BLOCKER, 0 CRITICAL, 1 MAJOR, 0 MODERATE, 0 MINOR.
- **Most consequential point of friction:** Notifications has no rendered interaction result.
- **Required major improvement:** Deliver a dedicated, delivery-first, accessible notification center that translates deduped domain events into persona-owned next actions and resolves from canonical workflow outcomes.
- **Relevant evidence:** `WF-COM-001.BLDR.01.STEP-01-notifications-no-op-desktop-1440x900.png`, `WF-COM-001.BLDR.01.STEP-01-notifications-no-op-mobile-390x844.png`, `WF-BLD-001.SYS.01.STEP-05-audit-event-flood-desktop-1440x900.png`.
- **Blockers or coverage gaps:** Last successful step was activating `WF-COM-001.BLDR.01.STEP-01`; no inbox state rendered. Read/filter/follow/dismiss/resolve, external delivery failure, stale link, dedupe, and actor-exclusion behavior were not observable. Backoffice/admin/contractor recipient segments were role-protected.
