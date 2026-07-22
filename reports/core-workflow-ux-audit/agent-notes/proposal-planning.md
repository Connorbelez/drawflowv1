# Proposal and planning workflow UX audit notes

Audit scope: `WF-PRP-001`, `WF-MAT-001`, `WF-BUD-001`, and `WF-CAL-001` only. All observations below came from the rendered application in an interactive browser. No product source was used to infer behavior.

Browser session: authenticated production Builder workspace in Chrome at `http://localhost:3000`, followed by explicit attempts to enter the production live-Build and lender workspaces. Viewports exercised: desktop `1440x900`, tablet `1024x768`, and mobile `390x844`. The Builder proposal shell was observed at all three sizes; the Materials form was fully exercised on desktop; Calendar was exercised at all three sizes; the live-Build Budget route failed on mobile before its first workflow screen. A late local connection reset and subsequent browser-control timeout prevented additional authenticated tablet/mobile mutation passes. These gaps are called out rather than inferred.

## Detailed findings

### UX-WF-PRP-001-001

1. **Finding ID:** `UX-WF-PRP-001-001`
2. **Workflow ID:** `WF-PRP-001`
3. **Persona-specific segment ID:** `WF-PRP-001.BLDR.01`
4. **Workflow step ID:** `WF-PRP-001.BLDR.01.STEP-04`
5. **Handoff ID:** `WF-PRP-001.HO-02`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Builder proposal workspace, Review and Draw schedule tabs, `/builder/proposals/k576cjjvp3xqptqrp8s4yq9qtn87kqw6`
8. **Finding title:** Builder is shown lender decision and backoffice draw-editing controls
9. **Severity:** `CRITICAL`
10. **Finding type:** Usability; Information Architecture; Workflow Design; Trust and Safety; Cross-Persona Handoff
11. **Observed behavior:** In a workspace explicitly labeled DrawFlow Builder, the Review tab rendered `Request Changes`, `Reject`, `Approve Proposal`, `Decision reason`, and `Audited permit waiver`. The Draw schedule tab was headed `Backoffice draw schedule` and exposed editable draw labels, amounts, timing, a change-reason field, and disabled Save controls. The controls were not reframed as read-only lender context; several inputs appeared editable even though the final actions were disabled.
12. **Expected professional experience:** The Builder should see submission readiness, the frozen package, lender-review status, and clearly read-only decision history. Lender-only decisions, overrides, and audited draw-row mutations should exist only in role-authorized lender surfaces.
13. **User impact:** The interface blurs authority boundaries, invites the Builder to manipulate controls they cannot complete, undermines confidence in proposal governance, and makes the Builder-to-Lender Operations handoff ambiguous.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-PRP-001_WF-PRP-001.BLDR.01_WF-PRP-001.BLDR.01.STEP-04_desktop-review-role-confusion.png`; `evidence/proposal-planning/WF-PRP-001_WF-PRP-001.BLDR.01_WF-PRP-001.BLDR.01.STEP-04_desktop-backoffice-controls.png`
15. **Reproduction steps:** Sign in as the Builder; open `Seed Scenario - Draft`; open Review; inspect decision/waiver controls; open Draw schedule; inspect backoffice row editors and reason field.
16. **Recommended improvement:** Split the proposal workspace into an explicitly Builder-owned submission/readiness experience and role-gated lender review workbench. Render the decision package as immutable status/history for Builders, remove lender mutation controls from the Builder DOM, and show the handoff owner, queue state, last reviewer activity, and expected next action after submission.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Least privilege, clear ownership, and visibility of system status require role-appropriate actions rather than disabled foreign controls.
19. **Acceptance criteria:** A Builder cannot discover or focus lender decision, waiver, or draw-row mutation fields; the submitted package is read-only; the page names the receiving lender role and current review state; authorized lender personas retain their controls in a separate surface; automated accessibility checks confirm hidden controls are absent from the Builder accessibility tree.
20. **Related or duplicate finding IDs:** None

### UX-WF-PRP-001-002

1. **Finding ID:** `UX-WF-PRP-001-002`
2. **Workflow ID:** `WF-PRP-001`
3. **Persona-specific segment ID:** `WF-PRP-001.BLDR.01`
4. **Workflow step ID:** `WF-PRP-001.BLDR.01.STEP-01`
5. **Handoff ID:** Not applicable
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Proposal workspace primary tab navigation
8. **Finding title:** Core proposal workflow navigation is clipped without an overflow affordance
9. **Severity:** `MAJOR`
10. **Finding type:** Navigation; Responsive Design; Accessibility; Information Architecture
11. **Observed behavior:** At `1440x900`, the ten-item tab strip already clipped the trailing tabs and displayed a partial label after Review. At `1024x768`, both trailing tabs and header metrics disappeared beyond the right edge. At `390x844`, the strip ended at a partial `Ca`, with no visible scroll indicator, overflow button, or compact menu.
12. **Expected professional experience:** Every required proposal stage should remain discoverable through a responsive navigation pattern with a clear current stage, stage grouping, and reachable overflow controls.
13. **User impact:** Users can miss Draw schedule, Materials, Staff, or Calendar entirely, cannot reliably understand the workflow sequence, and may submit without reviewing mandatory sections.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-PRP-001_WF-PRP-001.BLDR.01_WF-PRP-001.BLDR.01.STEP-01_desktop-draft-packet.png`; `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.BLDR.01_WF-CAL-001.BLDR.01.STEP-01_tablet-calendar-top.png`; `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.BLDR.01_WF-CAL-001.BLDR.01.STEP-01_mobile-calendar.png`
15. **Reproduction steps:** Open any proposal; inspect the full tab strip at desktop; resize to tablet and mobile; attempt to locate every workflow tab without knowing its name in advance.
16. **Recommended improvement:** Replace the flat ten-tab strip with a responsive stage navigator grouped into Plan, Cost, Team, Review, and Execution-preview stages. Use a compact select or accessible overflow menu below the tablet breakpoint, preserve the active stage label, and surface incomplete/blocked badges.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Recognition over recall and responsive progressive disclosure are required for a multi-stage workflow; clipping primary navigation silently removes functionality.
19. **Acceptance criteria:** All stages are reachable and named at 1440, 1024, and 390 widths; no label is visually truncated; keyboard users can reach overflow items in logical order; the active stage is announced; viewport tests show no horizontal content loss.
20. **Related or duplicate finding IDs:** `UX-WF-MAT-001-001`, `UX-WF-CAL-001-003`

### UX-WF-PRP-001-003

1. **Finding ID:** `UX-WF-PRP-001-003`
2. **Workflow ID:** `WF-PRP-001`
3. **Persona-specific segment ID:** `WF-PRP-001.BLDR.01`
4. **Workflow step ID:** `WF-PRP-001.BLDR.01.STEP-04`
5. **Handoff ID:** `WF-PRP-001.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Packet, Timeline, Review, and Draw schedule proposal tabs
8. **Finding title:** The required three-plan comparison and selection step is not discoverable
9. **Severity:** `MAJOR`
10. **Finding type:** Workflow Design; Information Architecture; Content Design; System Feedback
11. **Observed behavior:** The audit inspected Packet, Timeline, Review, and Draw schedule. Timeline offered `Optimize scenario`, cash metrics, and a risk flag, but no clearly labeled Cheapest Feasible, Fastest, or Capital-Constrained comparison and no explicit preferred-plan selection. Review showed lender decision controls instead of a Builder plan comparison. The proposal could be submitted directly from Packet.
12. **Expected professional experience:** Optimization should produce a dedicated, side-by-side comparison of all three named options, explain tradeoffs and infeasibility, identify the recommendation, and require an explicit Builder selection before submission.
13. **User impact:** Builders cannot make or verify the product's central financing decision, and the receiving lender cannot tell whether the submitted schedule reflects a deliberate option choice.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-PRP-001_WF-PRP-001.BLDR.01_WF-PRP-001.BLDR.01.STEP-02_desktop-timeline.png`; `evidence/proposal-planning/WF-PRP-001_WF-PRP-001.BLDR.01_WF-PRP-001.BLDR.01.STEP-06_WF-PRP-001.HO-02_desktop-submitted.png`
15. **Reproduction steps:** Open the draft; inspect Timeline and trigger no hidden knowledge; inspect Review and Draw schedule; return to Packet; submit the proposal.
16. **Recommended improvement:** Add a required Plan Comparison stage after validation with three standardized cards/table columns, shared metrics, constraint explanations, recommendation rationale, scenario diffs, and an explicit `Select this plan` action. Carry the selected plan name and metrics into the frozen submission header and lender queue.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Decision support requires comparable alternatives, explicit commitment, and feedback that the selection is part of the immutable review snapshot.
19. **Acceptance criteria:** All three named plans render after optimization; infeasible plans explain why; one plan must be explicitly selected before Submit enables; selection is summarized in Packet and frozen after submit; both sides of `WF-PRP-001.HO-01` and `HO-02` show identical selected-plan context.
20. **Related or duplicate finding IDs:** None

### UX-WF-MAT-001-001

1. **Finding ID:** `UX-WF-MAT-001-001`
2. **Workflow ID:** `WF-MAT-001`
3. **Persona-specific segment ID:** `WF-MAT-001.BLDR.01`
4. **Workflow step ID:** `WF-MAT-001.BLDR.01.STEP-02`
5. **Handoff ID:** `WF-MAT-001.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Proposal Materials tab and Add cost item dialog
8. **Finding title:** Material planning duplicates actions and obscures the selected milestone context
9. **Severity:** `MAJOR`
10. **Finding type:** Usability; Interaction Design; Information Architecture; Consistency
11. **Observed behavior:** An empty two-milestone plan rendered four identically named `Add cost item` buttons: a primary and an empty-state duplicate for each milestone. The page also exposed a separate milestone combobox while both milestone sections remained visible. Opening the first identical button required positional disambiguation even in the accessibility tree. The created item correctly recalculated to `$250`, but the action hierarchy did not make it obvious whether the combobox filtered, selected, or scoped creation.
12. **Expected professional experience:** One unambiguous add action should operate within a clearly selected milestone context, with a single empty-state CTA per scoped collection and persistent budget-impact preview.
13. **User impact:** Users can attach cost items to the wrong milestone, keyboard/screen-reader users cannot distinguish duplicated controls, and the dense page adds avoidable decision friction to every item entry.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-MAT-001_WF-MAT-001.BLDR.01_WF-MAT-001.BLDR.01.STEP-01_desktop-materials-empty.png`; `evidence/proposal-planning/WF-MAT-001_WF-MAT-001.BLDR.01_WF-MAT-001.BLDR.01.STEP-03_desktop-rollup-after-add.png`
15. **Reproduction steps:** Open Materials on the draft; select Foundation; count the identically named add actions; open the first; create `Audit concrete package`, unit cost `125`, quantity `2`, supplier `Audit Supplier`, linked to Forms and pour.
16. **Recommended improvement:** Refactor Materials into a milestone-scoped workspace: milestone rail/select with counts and variance badges, one persistent `Add material/equipment item` action, one contextual empty state, and an inline before/after budget and draw-availability preview before commit.
17. **Scope of change:** Page redesign
18. **Rationale and applicable UI/UX principle:** Strong context, one primary action, and prevention of scope errors are more important than duplicating convenience controls.
19. **Acceptance criteria:** Only one add action is exposed for the selected milestone; its accessible name includes the milestone; changing milestone updates a single item list; the form previews item total and milestone/proposal budget delta; keyboard and screen-reader users can identify scope without positional inference.
20. **Related or duplicate finding IDs:** `UX-WF-PRP-001-002`

### UX-WF-MAT-001-002

1. **Finding ID:** `UX-WF-MAT-001-002`
2. **Workflow ID:** `WF-MAT-001`
3. **Persona-specific segment ID:** `WF-MAT-001.BLDR.01`
4. **Workflow step ID:** `WF-MAT-001.BLDR.01.STEP-02`
5. **Handoff ID:** Not applicable
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Add cost item dialog validation
8. **Finding title:** Numeric validation feedback is generic and delayed
9. **Severity:** `MODERATE`
10. **Finding type:** Error Handling; Accessibility; Content Design; System Feedback
11. **Observed behavior:** Entering unit cost `-25` and quantity `0` disabled Add item. The visible feedback was the same generic `Must be greater than zero.` message as focus moved between numeric fields; the submit action simply remained disabled. The fields were textboxes rather than clearly numeric spin controls.
12. **Expected professional experience:** Each invalid field should expose a field-specific, programmatically associated message, valid range/format, and a summary when submission is attempted.
13. **User impact:** Users must infer which value is invalid and what formats or partial quantities are accepted; screen-reader users may not receive a useful error association.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-MAT-001_WF-MAT-001.BLDR.01_WF-MAT-001.BLDR.01.STEP-02_desktop-invalid-cost.png`
15. **Reproduction steps:** Open Add cost item; enter a title; set cost to `-25`; set quantity to `0`; inspect messages and Add item state; correct cost, then quantity.
16. **Recommended improvement:** Use numeric inputs with currency/quantity semantics, inline field-specific errors referenced by `aria-describedby`, accepted-range helper text, and an error summary/focus movement on attempted submission.
17. **Scope of change:** Component-level change
18. **Rationale and applicable UI/UX principle:** WCAG error identification requires specific, associated guidance rather than relying on a disabled action and generic copy.
19. **Acceptance criteria:** Invalid cost and quantity produce distinct messages; the invalid field exposes `aria-invalid`; messages are announced; valid partial quantity examples are shown; Add item state explains unmet requirements.
20. **Related or duplicate finding IDs:** None

### UX-WF-BUD-001-001

1. **Finding ID:** `UX-WF-BUD-001-001`
2. **Workflow ID:** `WF-BUD-001`
3. **Persona-specific segment ID:** `WF-BUD-001.BLDR.01`
4. **Workflow step ID:** `WF-BUD-001.BLDR.01.STEP-01`
5. **Handoff ID:** `WF-BUD-001.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Builder dashboard Live builds table to `/builder/builds/demo-timeline-k571m35kbnarzebf8acerr8vkn87km8a`
8. **Finding title:** Approved live-Build entry point opens a nonexistent or inaccessible record
9. **Severity:** `BLOCKER`
10. **Finding type:** Workflow Design; Navigation; Error Handling; System Feedback
11. **Observed behavior:** The dashboard listed `Seed Scenario - Approved With Permit` as `moved to live build` and provided `Open live build`. Activating it changed the URL while initially leaving stale dashboard content. After direct reload, the route displayed `Build detail unavailable — No production active build was found for this ID, or your builder account cannot access it.` No Budget Revision entry point was reachable.
12. **Expected professional experience:** A live-Build row must link to an organization-scoped record the Builder can open, or be disabled with an explicit provisioning/remediation status before navigation.
13. **User impact:** The complete Budget Revision workflow, active Materials verification, and active Calendar workflow are blocked at entry; the dashboard makes a false claim that the proposal moved to a usable Build.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-BUD-001_WF-BUD-001.BLDR.01_WF-BUD-001.BLDR.01.STEP-01_mobile-live-build-unavailable.png`
15. **Reproduction steps:** Open Builder dashboard; activate `Open live build` for Seed Scenario - Approved With Permit; observe URL change with stale content; reload the route; observe Build detail unavailable.
16. **Recommended improvement:** Make closing/provisioning transactional and surface a durable activation state machine on the dashboard. Only render Open live build after the access check and all Build records succeed; otherwise expose a recoverable `Activation failed` task with correlation ID, retry/escalation, and preserved proposal link.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** A navigation promise must match backend state; transactional integrity and actionable recovery are core trust requirements for financial software.
19. **Acceptance criteria:** Every `moved to live build` row opens an accessible Build; failed/incomplete closing never displays as moved; activation errors show owner and recovery action; `WF-PRP-001.HO-05` and `WF-BUD-001.HO-01` can be completed from the resulting workspace.
20. **Related or duplicate finding IDs:** None

### UX-WF-BUD-001-002

1. **Finding ID:** `UX-WF-BUD-001-002`
2. **Workflow ID:** `WF-BUD-001`
3. **Persona-specific segment ID:** `WF-BUD-001.BLDR.01`
4. **Workflow step ID:** `WF-BUD-001.BLDR.01.STEP-01`
5. **Handoff ID:** `WF-BUD-001.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Builder dashboard Live builds overview
8. **Finding title:** Live-build overview has no Budget version, variance, or revision-risk status
9. **Severity:** `MAJOR`
10. **Finding type:** Information Architecture; Workflow Design; System Feedback; Cross-Persona Handoff
11. **Observed behavior:** The Live builds table showed Build, generic lifecycle status, Budget total, Milestones/draws, Open requests, Updated, and Action. It did not expose the active Budget version, actual/projected variance, revision recommended/required state, governing-plan status, or pending Lender Admin decision. Seed rows showed `0 / 0` milestones/draws despite being labeled live.
12. **Expected professional experience:** Material variance and Budget governance should be first-class operational status with a direct, contextual revision action and visible version lineage.
13. **User impact:** Builders cannot discover that revision work is required, understand which Budget governs, or tell whether lender action is pending; cross-persona ownership remains invisible.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-PRP-001_WF-PRP-001.BLDR.01_WF-PRP-001.BLDR.01.STEP-01_desktop-builder-dashboard.png`
15. **Reproduction steps:** Open Builder dashboard; inspect every Live builds table column and status; look for Budget version/variance/revision indicators or action.
16. **Recommended improvement:** Add a Budget governance summary to each live Build and a dedicated revision task surface: active version, variance amount/percentage, threshold state, affected milestones/draws, deadline, current owner, and `Review variance`/`Continue revision` action. Carry a version-diff summary through admin decision and back to the Builder.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Exception-driven dashboards should prioritize risk, ownership, and next action over generic totals.
19. **Acceptance criteria:** Required/recommended revisions are visible without opening the Build; active and proposed versions are named; current owner and decision status are shown; the Builder can enter the exact revision at `STEP-01`; admin decision updates the same task and preserves prior governing version.
20. **Related or duplicate finding IDs:** `UX-WF-BUD-001-001`

### UX-WF-CAL-001-001

1. **Finding ID:** `UX-WF-CAL-001-001`
2. **Workflow ID:** `WF-CAL-001`
3. **Persona-specific segment ID:** `WF-CAL-001.SYS.01`
4. **Workflow step ID:** `WF-CAL-001.SYS.01.STEP-05`
5. **Handoff ID:** Not applicable
6. **Persona:** DrawFlow System
7. **Page, route, dialog, or interface:** Proposal Calendar, Export ICS action
8. **Finding title:** Calendar export produces no download and no failure feedback
9. **Severity:** `MAJOR`
10. **Finding type:** Error Handling; System Feedback; Integration; Workflow Design
11. **Observed behavior:** Activating `Export ICS` produced no browser download within ten seconds, no toast, no progress state, and no visible error. The button returned to the same static state.
12. **Expected professional experience:** Export should immediately communicate generation progress, deliver a named `.ics` file or subscription, and show actionable error/retry feedback with the exported scope.
13. **User impact:** Users cannot tell whether export is working, may click repeatedly, and cannot coordinate schedules through the promised external-calendar workflow.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.SYS.01_WF-CAL-001.SYS.01.STEP-05_desktop-export-no-feedback.png`
15. **Reproduction steps:** Open Calendar; click Export ICS; wait for a download; inspect toast/alert region and button state.
16. **Recommended improvement:** Implement an explicit export job state with scope summary, loading indicator, deduplicated action, successful download/subscription confirmation, retry, and diagnostic error copy. Include filename, event count, date range, and timezone.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Every asynchronous command needs immediate acknowledgement and a terminal success/failure state.
19. **Acceptance criteria:** One click shows progress within 100 ms; exactly one `.ics` download or subscription result is produced; success names event count/range/timezone; failures are announced and retryable; repeat clicks cannot create duplicate jobs.
20. **Related or duplicate finding IDs:** None

### UX-WF-CAL-001-002

1. **Finding ID:** `UX-WF-CAL-001-002`
2. **Workflow ID:** `WF-CAL-001`
3. **Persona-specific segment ID:** `WF-CAL-001.BLDR.01`
4. **Workflow step ID:** `WF-CAL-001.BLDR.01.STEP-03`
5. **Handoff ID:** `WF-CAL-001.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Submitted proposal Calendar, Foundation detail dialog
8. **Finding title:** Schedule edit fields appear editable but silently revert and never enable preview
9. **Severity:** `MAJOR`
10. **Finding type:** Interaction Design; System Feedback; Error Handling; Cross-Persona Handoff
11. **Observed behavior:** The Foundation event dialog exposed Start date, End date, Audit reason, and Preview schedule edit. Changing End date on the submitted proposal silently reverted to the original value. Entering a reason still left Preview disabled. No copy explained immutability, permission, state, or why the edit was rejected.
12. **Expected professional experience:** Immutable/submitted state should be read-only with a clear explanation and a role-appropriate `Request schedule change` path; editable state should accept the change and show an impact preview.
13. **User impact:** Users lose work without feedback and cannot distinguish a validation problem from a permission or lifecycle restriction. Contractor acknowledgement handoff cannot begin.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.BLDR.01_WF-CAL-001.BLDR.01.STEP-03_desktop-disabled-preview.png`
15. **Reproduction steps:** Submit the proposal; open Calendar; click Today; open Foundation start; change End date; enter an audit reason; observe reversion and disabled Preview.
16. **Recommended improvement:** Render submitted canonical fields as read-only. Provide an explicit change-request flow that captures proposed dates/reason, computes dependency/draw/capital impacts, identifies required authority and affected assignees, and starts acknowledgement only after a valid proposal is submitted.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Controls must accurately advertise affordance; silent reversion violates error prevention and visibility of system status.
19. **Acceptance criteria:** Immutable dates cannot receive focus as editable inputs; explanatory copy names the lifecycle restriction; authorized draft edits persist and enable Preview; submitted changes use a distinct request state; `HO-01` only fires after a committed material change.
20. **Related or duplicate finding IDs:** None

### UX-WF-CAL-001-003

1. **Finding ID:** `UX-WF-CAL-001-003`
2. **Workflow ID:** `WF-CAL-001`
3. **Persona-specific segment ID:** `WF-CAL-001.BLDR.01`
4. **Workflow step ID:** `WF-CAL-001.BLDR.01.STEP-01`
5. **Handoff ID:** Not applicable
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Calendar responsive layout
8. **Finding title:** Tablet and mobile layouts clip primary controls and calendar context
9. **Severity:** `MAJOR`
10. **Finding type:** Responsive Design; Accessibility; Navigation; Visual Design
11. **Observed behavior:** At `1024x768`, the page had a `1265px` document width; proposal tabs, header metrics, calendar presets, timeframe controls, and filter controls were cut off to the right with no visible overflow affordance. At `390x844`, the active Calendar tab label was reduced to `Ca`, the Capital release preset was clipped, and the action/header stack consumed most of the first viewport.
12. **Expected professional experience:** Calendar should switch to a deliberately compact mobile/tablet layout: reachable navigation, prioritized controls, agenda-first content, and no clipped actions.
13. **User impact:** Users cannot discover or activate essential filters/timeframes, lose proposal identity context, and must fight a desktop calendar compressed into a small viewport.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.BLDR.01_WF-CAL-001.BLDR.01.STEP-01_tablet-calendar-top.png`; `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.BLDR.01_WF-CAL-001.BLDR.01.STEP-01_mobile-calendar.png`
15. **Reproduction steps:** Open proposal Calendar; set viewport to 1024x768 and scroll to top; inspect right edge and document width; set 390x844; inspect stage navigation, actions, presets, and calendar header.
16. **Recommended improvement:** Introduce responsive calendar compositions: collapse proposal stages into a stage picker; move export/sync/reconcile into an Actions menu; show Agenda/Day as mobile defaults; put filters in a bottom sheet; preserve a sticky identity/date header and 44px targets.
17. **Scope of change:** Page redesign
18. **Rationale and applicable UI/UX principle:** Responsive design is content prioritization, not shrink-to-fit; touch reachability and reflow are WCAG 2.2 AA requirements.
19. **Acceptance criteria:** No page-level horizontal overflow at 1024 or 390; every action is reachable and fully named; mobile defaults to an agenda/day view; controls meet 44px targets; 200% zoom and keyboard navigation preserve context and focus order.
20. **Related or duplicate finding IDs:** `UX-WF-PRP-001-002`

### UX-WF-CAL-001-004

1. **Finding ID:** `UX-WF-CAL-001-004`
2. **Workflow ID:** `WF-CAL-001`
3. **Persona-specific segment ID:** `WF-CAL-001.BLDR.01`
4. **Workflow step ID:** `WF-CAL-001.BLDR.01.STEP-05`
5. **Handoff ID:** Not applicable
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Reminder detail action menu and cancellation
8. **Finding title:** Reminder action menu mixes unrelated mutations and cancels immediately
9. **Severity:** `MAJOR`
10. **Finding type:** Interaction Design; Information Architecture; Trust and Safety; Consistency
11. **Observed behavior:** A reminder-only event action menu contained two Open detail entries plus Copy link, Export event, Edit reminder, Cancel reminder, New reminder event, Move proposal dates, and Edit draw timing. Selecting Cancel reminder applied cancellation immediately without confirmation or reason, while the dialog stayed open and changed to a retained cancelled state.
12. **Expected professional experience:** A reminder menu should expose reminder-relevant actions only; destructive cancellation should confirm intent, explain history retention, and optionally capture a reason when participants are affected.
13. **User impact:** Users can trigger the wrong domain mutation from an overloaded menu or cancel a coordination event accidentally, weakening schedule trust and audit quality.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.BLDR.01_WF-CAL-001.BLDR.01.STEP-05_desktop-reminder-created.png`; `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.BLDR.01_WF-CAL-001.BLDR.01.STEP-05_desktop-reminder-cancelled.png`
15. **Reproduction steps:** Create `UX audit coordination reminder`; open the event; open its actions; inspect all menu items; choose Cancel reminder; observe immediate cancellation and toast.
16. **Recommended improvement:** Derive action menus from event type and lifecycle. For reminders, keep Open/Edit/Export/Cancel only, remove duplicate and milestone/draw actions, and use a confirmation dialog that names participant/notification impact and history retention.
17. **Scope of change:** Component-level change
18. **Rationale and applicable UI/UX principle:** Contextual menus should minimize error-prone choices and destructive actions should be deliberate, reversible, or confirmed.
19. **Acceptance criteria:** Reminder menus contain no proposal-date or draw-timing actions; duplicate entries are removed; Cancel requires confirmation and announces retention/notifications; Escape returns focus to the invoking action; cancelled state is clearly read-only and auditable.
20. **Related or duplicate finding IDs:** None

### UX-WF-CAL-001-005

1. **Finding ID:** `UX-WF-CAL-001-005`
2. **Workflow ID:** `WF-CAL-001`
3. **Persona-specific segment ID:** `WF-CAL-001.SYS.01`
4. **Workflow step ID:** `WF-CAL-001.SYS.01.STEP-01`
5. **Handoff ID:** `WF-CAL-001.HO-03`
6. **Persona:** DrawFlow System
7. **Page, route, dialog, or interface:** Calendar month grid plus Agenda accessibility tree
8. **Finding title:** Long-running events are repeated across many agenda days in the accessibility tree
9. **Severity:** `MAJOR`
10. **Finding type:** Accessibility; Information Architecture; Performance Perception
11. **Observed behavior:** The DOM snapshot exposed the same Foundation and Shell and Dry-In milestone buttons repeatedly for successive agenda dates across their full ranges, in addition to the month-grid copies. A seven-event calendar produced dozens of repeated interactive entries, each with its own action button.
12. **Expected professional experience:** A milestone spanning a range should be represented once per logical view/agenda grouping, with start/end dates and duration, while duplicate visual instances are hidden from assistive technology.
13. **User impact:** Screen-reader and keyboard users face an extremely long, repetitive focus sequence and cannot efficiently distinguish seven logical events from dozens of rendered instances.
14. **Evidence and screenshot reference:** `evidence/proposal-planning/_WF-CAL-001-BLDR-proposal-calendar-snapshot.md`; `evidence/proposal-planning/WF-CAL-001_WF-CAL-001.BLDR.01_WF-CAL-001.BLDR.01.STEP-01_desktop-month-calendar.png`
15. **Reproduction steps:** Open the month Calendar with Foundation and Shell and Dry-In spanning multiple days; inspect the accessibility tree or tab through the Agenda; count repeated milestone buttons/actions.
16. **Recommended improvement:** Model agenda items as unique logical events with range labels and one action target. Mark decorative day-span fragments `aria-hidden`, avoid duplicate nested action controls, and virtualize long agendas without losing semantic ordering.
17. **Scope of change:** Component-level change
18. **Rationale and applicable UI/UX principle:** WCAG focus order and operable navigation require a concise semantic model that matches user-perceived objects.
19. **Acceptance criteria:** Seven logical events produce seven agenda items; each range is announced once with start/end/duration; month fragments are excluded from sequential focus; no duplicate accessible names exist for the same logical event in one view.
20. **Related or duplicate finding IDs:** None

## Per-workflow audit summaries

### WF-PRP-001 — Build Proposal Planning, Review, Approval, Closing, and Build Activation

- **Persona and category:** Builder — Proposal intake and planning; Lender Operations — Proposal review operations; Lender Admin — Proposal approval and closing; DrawFlow System — Proposal orchestration.
- **Audit status:** Partially audited.
- **Paths and states tested:** Builder dashboard discovery; draft Packet; Timeline/cash-risk view; Materials/contractor context; Review; Draw schedule; missing-permit state; direct successful submission; frozen Submitted state; success toast; post-submit Calendar immutability; late route-error recovery. Lender/admin production entry was not reachable with the authenticated Builder membership.
- **Browser viewport sizes tested:** 1440x900 primary path; 1024x768 and 390x844 shared proposal shell/navigation. A mobile tab action encountered the captured Vite `read ECONNRESET` overlay; the route later recovered as an unauthorized/error shell before the Builder dashboard became available again.
- **Segments:** `WF-PRP-001.BLDR.01` exercised through `STEP-06`; `STEP-07` not reached because changes-request decision could not be made. `WF-PRP-001.SYS.01` observed through validation/recalculation, submission snapshot, lifecycle toast, and failed live-Build projection. `WF-PRP-001.LOPS.01` and `WF-PRP-001.LADM.01` blocked at persona access.
- **Handoffs:** `WF-PRP-001.HO-01` only partially observable because the named three-plan result was not exposed. `WF-PRP-001.HO-02` sender side completed via successful proposal submission; receiving lender acknowledgement blocked. `WF-PRP-001.HO-03` and `HO-04` blocked by missing lender/admin membership. `WF-PRP-001.HO-05` contradicted by dashboard/live-Build route mismatch.
- **Overall usability assessment:** The Builder can edit and submit, but the product's central plan-comparison decision and ownership boundaries are not clear.
- **Overall polish assessment:** Visually coherent on desktop, but the stage navigation clips and foreign role controls materially reduce production readiness.
- **Findings by severity:** 1 CRITICAL, 2 MAJOR.
- **Most consequential point of friction:** Builder and lender governance surfaces are collapsed together.
- **Required major improvement:** Separate role-gated submission and lender decision workbenches, then make plan comparison/selection a mandatory explicit stage.
- **Relevant evidence:** PRP screenshots listed in findings `001`–`003`.
- **Blockers or coverage gaps:** No accessible Lender Operations/Admin persona; no decision/request-changes/rejection/closing path; active Build projection failed.

### WF-MAT-001 — Proposal Material and Equipment Cost Planning

- **Persona and category:** Builder — Proposal cost planning; Lender Operations — Proposal cost review; DrawFlow System — Budget projection.
- **Audit status:** Partially audited with successful Builder primary path.
- **Paths and states tested:** Empty milestone collections; add dialog; invalid negative cost and zero quantity; corrected recovery; submilestone link; create success; `$250` item/milestone/proposal rollup; proposal submission carrying the updated total.
- **Browser viewport sizes tested:** 1440x900 form and rollup. Shared proposal navigation was inspected at 1024x768 and 390x844, but Materials-specific responsive interaction was cut short by the late browser/server interruption.
- **Segments:** `WF-MAT-001.BLDR.01` exercised through `STEP-04` sender side. `WF-MAT-001.SYS.01` observed through validation, budget delta, recalculation, and proposal event; closing copy was blocked. `WF-MAT-001.LOPS.01` blocked at persona access.
- **Handoffs:** `WF-MAT-001.HO-01` Builder sender side completed by submission, receiving review blocked. `WF-MAT-001.HO-02` blocked because the advertised live Build could not open.
- **Overall usability assessment:** Arithmetic and creation work, but ambiguous scoping and duplicated actions make wrong-milestone entry too easy.
- **Overall polish assessment:** Strong dialog/rollup styling with weak action hierarchy and validation semantics.
- **Findings by severity:** 1 MAJOR, 1 MODERATE.
- **Most consequential point of friction:** The page does not establish one authoritative selected-milestone context.
- **Required major improvement:** Redesign as a single milestone-scoped cost workspace with one add action and live impact preview.
- **Relevant evidence:** MAT screenshots listed in findings `001`–`002`.
- **Blockers or coverage gaps:** Post-submission backoffice amendment, reason/audit path, active Build copy verification, tablet/mobile dialog pass.

### WF-BUD-001 — Budget Revision and Draw Plan Recalculation

- **Persona and category:** Builder — Budget revision; Lender Admin — Budget approval; DrawFlow System — Budget orchestration.
- **Audit status:** Blocked at production workflow entry after dashboard discovery.
- **Paths and states tested:** Live builds dashboard; approved-with-permit row; Open live build action; stale-page navigation state; direct reload; explicit Build detail unavailable terminal error; dashboard inspection for version/variance/revision indicators.
- **Browser viewport sizes tested:** Dashboard at 1440x900; blocker at 390x844. Tablet workflow screen could not be reached because no active Build record loaded.
- **Segments:** `WF-BUD-001.BLDR.01` blocked before `STEP-01`; `WF-BUD-001.SYS.01` observed only in contradictory activation/error projection; `WF-BUD-001.LADM.01` blocked at persona access.
- **Handoffs:** `WF-BUD-001.HO-01` failed because the system exposed no revision flag/task and the live Build route was unavailable. `HO-02` and `HO-03` not reachable.
- **Overall usability assessment:** The workflow is not operable from the production Builder surface.
- **Overall polish assessment:** The dashboard looks finished but advertises records/actions that do not resolve, a high-trust failure.
- **Findings by severity:** 1 BLOCKER, 1 MAJOR.
- **Most consequential point of friction:** The live-Build entry point does not resolve to an accessible Build.
- **Required major improvement:** Make activation transactional and add a first-class, version-aware Budget governance task surface on the dashboard/workspace.
- **Relevant evidence:** BUD screenshots listed in findings `001`–`002`.
- **Blockers or coverage gaps:** Every Budget draft/recompute/submit/admin decision/version-history state; all cross-persona handoffs; tablet/live workspace responsive checks.

### WF-CAL-001 — Calendar Scheduling, Material Change, Reminder, and Export

- **Persona and category:** Builder — Calendar planning; Contractor — Contractor calendar; Lender Operations — Operations calendar; Lender Admin — Schedule governance; Inspector — Inspection scheduling; DrawFlow System — Calendar projection.
- **Audit status:** Partially audited with broad Builder/System coverage and blocked cross-persona branches.
- **Paths and states tested:** Month view; Today recovery from stale June range to July; filters/presets; milestone detail; submitted-date edit rejection; audit reason; reminder creation; reminder action menu; immediate cancellation and retained history; ICS export failure; desktop/tablet/mobile layouts; accessibility-tree duplication.
- **Browser viewport sizes tested:** 1440x900, 1024x768, and 390x844.
- **Segments:** `WF-CAL-001.BLDR.01` exercised through view/open/edit attempt/reason/reminder management; legal material commit and acknowledgement were blocked by submitted-state behavior. `WF-CAL-001.SYS.01` observed through projection, validation rejection, reminder persistence/cancellation, and export failure. `LOPS`, `LADM`, `CNTR`, and `INSP` segments blocked by persona access.
- **Handoffs:** `WF-CAL-001.HO-01` could not fire because the material schedule change never previewed/committed and no Contractor persona was available. `HO-02` blocked at both lender operations and inspector access. `HO-03` only observed through general notification affordance; no due reminder delivery/acknowledgement could be forced.
- **Overall usability assessment:** Rich functionality is discoverable on desktop, but state rules, action menus, export feedback, and responsive composition are not production-grade.
- **Overall polish assessment:** Visually ambitious but too dense, semantically repetitive, and poorly adapted below desktop.
- **Findings by severity:** 5 MAJOR.
- **Most consequential point of friction:** The interface advertises editable/exportable actions without reliable terminal feedback.
- **Required major improvement:** Recompose Calendar around event-type-specific actions, explicit edit state machines, reliable export feedback, and agenda-first responsive layouts.
- **Relevant evidence:** CAL screenshots and snapshots listed in findings `001`–`005`.
- **Blockers or coverage gaps:** No successful material schedule commit/impact preview; no contractor acknowledgement; no visit dispatch/acceptance; no lender/admin schedule decision; no successful external-calendar download.

## Browser interruption log

- **Last successful destructive/recovery branch:** `WF-CAL-001.BLDR.01.STEP-05` — created `UX audit coordination reminder`, opened its action menu, selected Cancel reminder, observed immediate cancelled state, retained history, and success toast.
- **Last successful cross-persona sender action:** `WF-PRP-001.BLDR.01.STEP-06` / `WF-PRP-001.HO-02` — proposal submitted and Submitted state/toast observed.
- **Production entry blocker:** `WF-BUD-001.BLDR.01.STEP-01` — live-Build row opened `/builder/builds/demo-timeline-k571m35kbnarzebf8acerr8vkn87km8a`, then rendered Build detail unavailable after reload.
- **Late environment interruption:** At mobile width, a proposal tab transition displayed Vite overlay `read ECONNRESET`; a reload temporarily produced an unauthorized route error, then the Builder dashboard recovered. Subsequent browser-control navigation to backoffice/public demo routes timed out. This was treated as an environment/browser blocker, not evidence that unobserved product states work or fail.
