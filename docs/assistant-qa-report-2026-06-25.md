# DrawFlow AI Assistant QA Report - 2026-06-25

## Scope

This report covers a browser-driven QA pass against the local DrawFlow app at `http://localhost:3000` on June 25, 2026, using the signed-in admin test account (`Connor Beleznay`, organization `org_01KSNW6JHW9P9YS41DZX1YHHGS`). All data was treated as test data and mutation-capable workflows were allowed.

The goal was to test whether the assistant behaves like a route-aware AI operations partner for builder and backoffice personas: understand intent, plan multi-step workflows, use app context, render AGUI controls where helpful, navigate across permitted surfaces, prepare HITL previews, and avoid unnecessary clarification friction.

## Executive Summary

The assistant is no longer just a closed deterministic chatbot. It can now perform several high-value behaviors:

- It successfully created and executed the Garden Suite setup workflow, including route navigation and template selection.
- It correctly scoped a reminder from a live build route and produced a HITL preview with parsed date, time, timezone, and `allDay: false`.
- It produced a genuinely useful backoffice briefing from operational state, not just notification text.
- It used internal contractor data for trade matching.
- It identified and opened a high-risk live build for backoffice triage.

The remaining failures are concentrated in three areas:

1. **Workflow continuation after navigation is inconsistent.** Some workflows navigate and then stop, losing the rest of the user's request.
2. **AGUI is not consistently treated as part of workflow state.** Selectors can stall, questions are often passive text, and generated UI sometimes contradicts the answer.
3. **The assistant still asks for information it can infer.** This is most visible in material/content filling and unscoped reminder target selection.

## Severity Summary

| Severity | Count | Workflows |
| --- | ---: | --- |
| High | 4 | Unscoped reminder selector, material fill-in, site visit prioritization, submitted proposal review |
| Medium | 5 | Garden Suite launcher friction, scoped reminder confirmation feedback, contractor recommendation, backoffice briefing actionability, draw queue summary |
| Low | 1 | Highest-risk build triage precision |

## Workflow Results

### 1. Builder: Start a New Garden Suite Build

**Route:** `/builder`  
**Prompt:** `Start a new Garden Suite build.`

**Observed behavior**

The assistant created a workflow, navigated to `/builder/proposals/new`, selected the Garden Suite template, and showed the setup screen with `Garden Suite selected`. The assistant workflow card showed all steps as succeeded:

- Open New Build
- Wait for new proposal route
- Wait for proposal template controls
- Select Garden Suite
- Confirm Garden Suite is selected

**Result:** Mostly successful  
**Severity:** Medium

**Failures or avoidable friction**

- The original root bug appears fixed: it did not stop at navigation; it selected the Garden Suite option.
- After closing the assistant on the setup route, clicking the visible assistant launcher did not reopen it in this browser run. `Cmd+J` did reopen it. This makes the assistant feel unreliable on exactly the screen where the user is supposed to continue setup.

**Recommended fix**

Keep this workflow as a regression test. Add a browser test that opens `/builder`, asks for Garden Suite, asserts `/builder/proposals/new`, asserts selected template key `garden-suite`, closes assistant, clicks the visible launcher, and verifies the assistant reopens.

### 2. Builder: Create Timed Reminder from Unscoped Dashboard

**Route:** `/builder`  
**Prompt:** `Add a reminder for me to purchase stucco from my supplier tomorrow at 9am`

**Observed behavior**

The assistant recognized a reminder intent and rendered a reminder target selector:

`Which live build or Build Proposal should this reminder belong to?`

It also showed a workflow:

- Show reminder target selector: succeeded
- Wait for reminder target selection: needs input
- Prepare reminder preview: needs input

But before a valid target was selected, it also emitted failure text such as:

`I could not derive a valid HITL action preview from the workflow state.`

Typing a build name into the selector did not expose selectable options in this run, and no HITL preview was created.

**Result:** Failed  
**Severity:** High

**Failures or avoidable friction**

- The workflow advanced toward HITL preview before the required AGUI selection was submitted.
- The build/proposal autocomplete appeared but did not produce usable selectable options.
- The assistant ended in a mixed state: it both asked for a target and reported failure.
- This directly violates the desired UX: ask only for the build/proposal target, then prepare the reminder HITL preview.

**Recommended fix**

Make `wait_for_agui_submit` a hard barrier. `prepare_hitl_action_plan` must not run until the selector emits a valid `{ targetKind, targetId }`. The selector should load permitted proposals and live builds eagerly, show fallback options when search is empty, and keep the workflow in `needs_input` without failure text.

### 3. Builder: Create Timed Reminder from Scoped Live Build

**Route:** `/builder/builds/ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r`  
**Prompt:** `Add a reminder for me to purchase stucco supplies tomorrow at 9am.`

**Observed behavior**

The assistant correctly detected live build context and prepared a HITL reminder preview:

```json
{
  "allDay": false,
  "startsAt": "2026-06-26T09:00:00",
  "timezone": "America/Toronto",
  "title": "purchase stucco supplies "
}
```

The preview was scoped to the live build calendar and did not ask for supplier, quantity, milestone, cost, or notes.

**Result:** Mostly successful  
**Severity:** Medium

**Failures or avoidable friction**

- The scoped parsing and HITL preview are correct.
- Clicking `Confirm accepted batch` did not visibly complete, clear the preview, or show a committed success state. Clicking `Accept` and then `Confirm accepted batch` also left the UI unchanged.
- The title has a trailing space.

**Recommended fix**

Add explicit HITL commit states: `committing`, `committed`, `failed`. On success, show a durable confirmation with the created reminder details and remove or lock the preview. Also trim parsed reminder titles before preview generation.

### 4. Builder: Draft Material/Cost Item Content for a Live Build

**Route:** `/builder/builds/ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r`  
**Prompt:** `Help me add the stucco materials for the exterior finish milestone on this build. I need 60 bags of stucco mix at $18 per bag from my supplier.`

**Observed behavior**

The assistant responded that it could help prepare the cost item and asked:

`should this be tied to milestone four-plex-draw-03 (Service upgrade & envelope) or another milestone on this build?`

It then rendered passive questionnaire text:

1. Which milestone should this be added to?
2. Supplier name
3. Quantity
4. Unit
5. Unit price
6. Item description

No form controls, milestone dropdown, or HITL preview appeared.

**Result:** Failed  
**Severity:** High

**Failures or avoidable friction**

- It asked for quantity and unit price even though the user already supplied `60 bags` and `$18 per bag`.
- It asked for supplier even though the user said `my supplier`; if supplier identity is unknown, that should be a supplier selector or "use unspecified supplier" option, not free text.
- It identified the likely milestone but did not render a dropdown or one-click confirmation.
- It did not produce a best-effort HITL draft even though only milestone/supplier identity needed confirmation.

**Recommended fix**

For material/content fill-in, extract fields first and only ask for missing blockers. Render a structured AGUI form with:

- Milestone dropdown preselected to the inferred milestone.
- Supplier selector if internal supplier data exists, otherwise an explicit "Unspecified supplier" option.
- Quantity `60`, unit `bags`, unit cost `1800` cents.
- Description prefilled from the prompt.
- A `Prepare HITL batch` action.

### 5. Builder: Contractor/Trade Recommendation

**Route:** `/builder/builds/ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r`  
**Prompt:** `Which contractors in my org can handle exterior stucco or envelope work on this build, and who looks best to assign?`

**Observed behavior**

The assistant used internal contractor data and answered:

`I only see one contractor with an envelope-adjacent trade match: Oscar Concreate & Handyman (Toronto) - trades: Foundation, Concrete. No contractor is explicitly tagged for stucco or envelope work, so I can't confidently rank a best fit from this data.`

It then displayed `Contractor match summary0 items` and passive follow-up questions about scope, prioritization, and geography.

**Result:** Partial success  
**Severity:** Medium

**Failures or avoidable friction**

- It used org contractor data, which is correct.
- The generated summary UI contradicted the answer by showing `0 items` after naming one candidate.
- It did not provide an actionable shortlist, assignment review card, or one-click next step.
- Follow-up questions were passive text, not selectable priority controls.

**Recommended fix**

Render contractor recommendations as a review table with confidence, trade match, location, availability/assignment signals, and actions. If only one partial match exists, show it as a candidate with a warning badge instead of returning a zero-item UI.

### 6. Backoffice: Today's Operational Briefing

**Route started:** `/backoffice`  
**Route after assistant response:** `/backoffice/site-visits`  
**Prompt:** `What are my tasks for today? Give me a backoffice briefing with what needs attention first.`

**Observed behavior**

The assistant produced a strong briefing:

- 6 outstanding site visits on the 4-plex Proposal.
- 3 milestone completion claims needing review.
- Submitted proposals needing review.
- Reminders such as `1st Payment for GSuite Drawing`, `Book Plumber`, and `Submit GSuite permits to survey`.
- Missing build documents for the 4-plex Proposal.

It rendered a task-list style summary with `Today's Backoffice Priorities7 items`.

**Result:** Partial success  
**Severity:** Medium

**Failures or avoidable friction**

- The briefing included real workflow state beyond notifications, which is exactly the right direction.
- It navigated to `/backoffice/site-visits` even though the user asked for a briefing, not navigation.
- The final next steps were plain text (`I can open...`) rather than clickable action buttons or route cards.
- The task list did not expose deep links/actions for each priority.

**Recommended fix**

Briefing should be read-only unless navigation is explicitly requested. Each briefing item should include a generated action row: `Open queue`, `Open build`, `Review milestone`, `Schedule site visit`, or `Dismiss for now`, filtered by permissions.

### 7. Backoffice: Navigate to Draw Queue and Summarize Requests

**Route started:** `/backoffice`  
**Route after assistant response:** `/backoffice/draws`  
**Prompt:** `Take me to the draw queue and show me what draw requests need review.`

**Observed behavior**

The assistant navigated to `/backoffice/draws` and responded:

`Opening the draw queue. I can't preview the draw requests from the current context, but the queue should show items needing review.`

The page itself showed draw queue filters and counts:

- Needs review: 0
- Approved: 0
- Planned: 8
- Released: 0
- Rejected: 0
- All: 8

**Result:** Partial success  
**Severity:** Medium

**Failures or avoidable friction**

- Navigation worked.
- The assistant stopped after navigation and did not inspect or summarize the resulting queue.
- The page had enough visible state to say there were no draw requests needing review and 8 planned draws.
- No review table or action card was rendered.

**Recommended fix**

Post-navigation workflows need a route-mounted resume step. After `/backoffice/draws` loads, the assistant should query or read draw queue state, then answer: "There are no draw requests needing review; 8 planned draws are visible." If the user asked for review work and none exists, offer the next useful action.

### 8. Backoffice: Site Visit Queue Prioritization

**Route started:** `/backoffice`  
**Route after assistant response:** `/backoffice/site-visits`  
**Prompt:** `Open the site visits that need action and tell me which one I should handle first.`

**Observed behavior**

The assistant navigated to `/backoffice/site-visits`, then the assistant panel disappeared. Reopening the assistant showed only route context. There was no response to the prioritization request.

The page showed actionable site visit data:

- Expired: 6
- Geofence flagged: 2
- 4-plex Proposal: 6 active visits
- Several expired Service upgrade & envelope visits
- Two expired/geofence Permits, demo & foundation visits

**Result:** Failed  
**Severity:** High

**Failures or avoidable friction**

- The assistant did not remain open or provide a response after navigation.
- It did not summarize visible queue data.
- It did not identify which item should be handled first.
- No action card, repair action, or workflow resume state appeared.

**Recommended fix**

Use the workflow harness for navigation plus post-route analysis:

1. Navigate to `/backoffice/site-visits`.
2. Wait for route and queue data.
3. Retrieve site visit state.
4. Rank by expired/geofence/assigned/build priority.
5. Render a task list with `Open build`, `Copy link`, and `Review geofence` actions.

### 9. Backoffice: Open Submitted Proposal Needing Review

**Route started:** `/backoffice`  
**Route after assistant response:** `/backoffice/proposals/k578xas58jqa24bkqp83eddg6s897qpq`  
**Prompt:** `Open the submitted proposal that needs review first and tell me why it is the right one to handle now.`

**Observed behavior**

The assistant navigated to a proposal detail page with review controls visible:

- Request Changes
- Reject
- Approve Proposal
- Review tab
- Milestones, Calendar, Contractors, Materials, Staff

But the assistant panel disappeared. Reopening it only showed route context for the proposal. It did not explain why this proposal was chosen or what to review first.

**Result:** Failed  
**Severity:** High

**Failures or avoidable friction**

- It navigated to a specific proposal, which is useful.
- It lost the explanatory part of the user's request.
- It did not self-check after route mount.
- It did not render a review checklist, missing-document summary, or proposal action preview.

**Recommended fix**

Navigation is only one step. The workflow should resume on the proposal route, retrieve proposal review context, and render a checklist: permits/docs, budget, timeline, draw schedule, policy warnings, missing information, and recommended first review action.

### 10. Backoffice: Highest-Risk Live Build Triage

**Route started:** `/backoffice`  
**Route after assistant response:** `/backoffice/builds/ks7n0k9bhpe2qzzd3h2r9fg6ah87xg4r`  
**Prompt:** `Which live build is most behind schedule or highest risk right now? Open it and tell me what action I should take first.`

**Observed behavior**

The assistant opened the 4-plex Proposal live build and answered:

`Most at-risk live build appears to be 4-plex Proposal: it has multiple high-priority outstanding site visits and milestone completion items needing review. First action: open the build and review the highest-priority milestone completion claim, then verify the overdue site visit(s).`

The page showed matching controls:

- 3 `Review milestone completion` buttons.
- Site/evidence/workspace tabs.
- Contractor/material/draw controls.

**Result:** Mostly successful  
**Severity:** Low

**Failures or avoidable friction**

- This workflow mostly worked: it picked the highest-risk build, navigated there, and gave a useful action.
- It did not identify the exact milestone completion claim to click first.
- It did not render an action card over the visible review controls.

**Recommended fix**

Enhance risk triage with a ranked action card:

- `Review Service upgrade & envelope claim`
- `Review Permits, demo & foundation geofence flagged site visits`
- `Open site visit queue for this build`

The assistant should attach route/action metadata so the user can click directly.

## Cross-Cutting Findings

### 1. Workflow harness completion is inconsistent

Garden Suite and highest-risk build triage prove the assistant can run multi-step workflows. But draw queue, site visits, and proposal review show it often stops after navigation. The harness needs a mandatory self-check step for any user request containing both navigation and post-navigation work.

**Fix priority:** P0

### 2. AGUI submit events are not always hard workflow gates

The unscoped reminder selector rendered but the workflow advanced into preview preparation before receiving a valid selection. This created confusing failure text while still showing an input control.

**Fix priority:** P0

### 3. Passive clarification cards remain in known-choice workflows

Material fill-in and contractor recommendation still rendered numbered text questions where controls were obvious:

- Milestone dropdown
- Supplier selector
- Quantity/unit/cost form
- Scope/prioritization segmented controls

**Fix priority:** P1

### 4. The assistant asks for known information

The material workflow asked for quantity and unit price after the user supplied both. This makes the assistant feel like a form parser instead of an AI assistant.

**Fix priority:** P1

### 5. Generated UI and text can contradict each other

The contractor response named Oscar Concreate & Handyman as a candidate, but the generated summary said `0 items`.

**Fix priority:** P1

### 6. HITL preview confirmation lacks visible completion

The live-build reminder HITL preview parsed correctly, but confirmation did not visibly complete or clear the preview. Users need durable feedback that the batch committed, failed, or is still pending.

**Fix priority:** P1

### 7. Briefings need action surfaces

The backoffice briefing was the strongest evidence that operational state retrieval is working. The next improvement is actionability: each priority should include a route/action button, not just prose.

**Fix priority:** P1

## Recommended Regression Tests

Add browser-level assistant tests for these flows:

1. Garden Suite workflow: prompt from `/builder`, assert `/builder/proposals/new`, assert Garden Suite selected, assert assistant launcher still works.
2. Unscoped reminder: prompt from `/builder`, assert selector renders, assert no preview failure appears before target submit, select target, assert HITL preview.
3. Scoped live-build reminder: prompt from live build route, assert parsed timed reminder, confirm batch, assert committed state.
4. Material fill-in: prompt with quantity and cost, assert form is prefilled and does not ask for known fields.
5. Contractor recommendation: assert non-empty candidate table when the prose names a candidate.
6. Backoffice briefing: assert no unsolicited navigation, assert task list contains action buttons.
7. Draw queue navigation: assert post-route summary after `/backoffice/draws` loads.
8. Site visit prioritization: assert route plus ranked site visit summary.
9. Submitted proposal review: assert route plus review checklist and reason for selection.
10. Highest-risk build triage: assert route plus exact first action item.

## Final Assessment

The assistant is moving in the right direction: it has enough route awareness and domain retrieval to be useful. The failures are not mostly knowledge failures. They are orchestration and interaction failures:

- It needs to finish multi-step goals after navigation.
- It needs AGUI events to be first-class workflow steps.
- It needs to draft confidently and ask only for blockers.
- It needs every briefing/navigation result to produce clickable operational next steps.

The highest-value next implementation target is the workflow runner's self-check/resume loop, followed by AGUI submit gating and replacing passive questionnaires with controls.
