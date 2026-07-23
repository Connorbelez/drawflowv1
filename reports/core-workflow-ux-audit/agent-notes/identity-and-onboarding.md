# Identity and onboarding workflow UX audit notes

Browser-only audit of `WF-TEN-001`, `WF-TEN-002`, `WF-TEN-003`, `WF-TEN-004`, and `WF-CTR-001`. Production behavior was exercised only where visible in the browser. No source-code behavior is inferred.

## Coverage matrix

| Workflow | Persona segments | Tested paths and states | Viewports | Handoffs | Status | Findings | Required major improvement | Evidence |
|---|---|---|---|---|---|---:|---|---|
| `WF-TEN-001` | `WF-TEN-001.PADM.01`, `WF-TEN-001.LADM.01`, `WF-TEN-001.SYS.01` | Production backoffice entry; no-workspace-access denial | 1440x900, 1024x768, 390x844 | `WF-TEN-001.HO-01`, `WF-TEN-001.HO-02` blocked before sender action | Blocked | 1 MAJOR | Replace the terminal access wall with a principal-activation recovery surface that identifies the active organization, invitation/membership state, required role, and a role-safe retry, switch-organization, or support action. | `evidence/identity-onboarding/WF-TEN-001.PADM.01.STEP-01-desktop-1440x900-protected-access.png` |
| `WF-TEN-002` | `WF-TEN-002.BRKR.01`, `WF-TEN-002.BLDR.01`, `WF-TEN-002.SYS.01` | Active Builder workspace; active-organization menu; fresh-session `/builder` authorization error | 1440x900, 1024x768, 390x844 | Receiver-side postcondition of `WF-TEN-002.HO-01` partially inspected; sending Broker and `WF-TEN-002.HO-02` unavailable | Partially audited | 1 BLOCKER, 1 MAJOR | Add a durable onboarding/relationship status surface that confirms the assigned Broker, brokerage, invite/profile state, next action, and recoverable exception state without exposing raw backend failures. | `evidence/identity-onboarding/WF-TEN-002.BLDR.01.STEP-04-*` |
| `WF-TEN-003` | `WF-TEN-003.LADM.01`, `WF-TEN-003.PADM.01`, `WF-TEN-003.BRKR.01`, `WF-TEN-003.SYS.01` | Production backoffice entry; no-workspace-access denial; public demo inspected but exposes no transfer equivalent | 1440x900, 1024x768, 390x844 | `WF-TEN-003.HO-01`, `WF-TEN-003.HO-02` blocked before sender action | Blocked | 1 MAJOR | Provide a governed transfer entry and access-recovery surface that names source/destination organization scope, required authority, retained/rerouted work, and the responsible next actor. | `evidence/identity-onboarding/WF-TEN-003.LADM.01.STEP-01-desktop-1440x900-protected-access.png` |
| `WF-TEN-004` | `WF-TEN-004.LADM.01`, `WF-TEN-004.BRKR.01`, `WF-TEN-004.LOPS.01`, `WF-TEN-004.SYS.01` | Production backoffice entry; no-workspace-access denial | 1440x900, 1024x768, 390x844 | `WF-TEN-004.HO-01`, `WF-TEN-004.HO-02`, `WF-TEN-004.HO-03` blocked before sender action | Blocked | 1 MAJOR | Replace generic denial with role-projection diagnostics and repair: current org/role, intended role, effective capability delta, affected assignments/queues, and a clear switch/request/retry escalation. | `evidence/identity-onboarding/WF-TEN-004.LADM.01.STEP-01-desktop-1440x900-protected-access.png` |
| `WF-CTR-001` | `WF-CTR-001.BLDR.01`, `WF-CTR-001.CNTR.01`, `WF-CTR-001.LOPS.01`, `WF-CTR-001.SYS.01` | Builder search, empty state, canonical reuse, explicit invite, attach, new unclaimed profile, invalid email, monitoring failure; responsive sheet/form | 1440x900, 1024x768, 390x844 | Sender half of `WF-CTR-001.HO-01` exercised; Contractor acknowledgement plus `WF-CTR-001.HO-02`, `WF-CTR-001.HO-03`, and `WF-CTR-001.HO-04` blocked | Partially audited | 1 BLOCKER, 2 MAJOR, 1 MODERATE | Create a durable contractor onboarding status model in the Builder UI and a mobile-first sheet: separate relationship attachment from platform invitation, show invited/pending/claimed/review/sync states, expose the receiving actor and next action, and make the detail/status destination readable to the initiating Builder. | `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-05-WF-CTR-001.HO-01-desktop-attached.png` |

## Workflow summaries

### `WF-TEN-001` — Brokerage Provisioning and Principal Authority Activation

- **Persona and category:** Platform Admin / tenant provisioning; Lender Admin / Principal Broker / tenant activation; DrawFlow System / identity synchronization.
- **Audit status:** Blocked.
- **Paths and states tested:** Browser entry to `/backoffice`; redirect to `protected-access?reason=no-workspace-access&workspace=backoffice`; responsive denial layout.
- **Browser viewports:** 1440x900, 1024x768, 390x844.
- **Overall usability:** The denial message is readable, but it is terminal and does not support principal-invitation or membership recovery.
- **Overall polish:** Visually clean, operationally under-specified.
- **Findings by severity:** MAJOR 1.
- **Most consequential friction:** A user who believes they have been invited cannot determine the active organization, current membership/role projection, invitation state, or responsible next actor.
- **Required major improvement:** Contextual principal-activation recovery with organization, invited identity, invitation/membership state, required role, and switch/retry/support actions.
- **Relevant evidence:** `WF-TEN-001.PADM.01.STEP-01-desktop-1440x900-protected-access.png`, `WF-TEN-001.PADM.01.STEP-01-tablet-1024x768-protected-access.png`, `WF-TEN-001.PADM.01.STEP-01-mobile-390x844-protected-access.png`.
- **Blocker / last successful step:** No Platform Admin or Principal Broker membership was available. Blocked before `WF-TEN-001.PADM.01.STEP-01` and `WF-TEN-001.LADM.01.STEP-01`; the last observable state was the role-gated entry denial. `WF-TEN-001.SYS.01` and both handoffs were not browser-observable.

### `WF-TEN-002` — Builder Onboarding and Broker Assignment

- **Persona and category:** Broker / builder relationship management; Builder / builder onboarding; DrawFlow System / identity and assignment projection.
- **Audit status:** Partially audited.
- **Paths and states tested:** Existing active Builder entered a production Build; active organization menu inspected; new isolated tab navigated to `/builder` and returned a route-level raw Convex `Unauthorized` error.
- **Browser viewports:** 1440x900, 1024x768, 390x844.
- **Overall usability:** Existing Builder access is recognizable, but the required Broker-assignment confirmation is absent and a fresh context fails catastrophically.
- **Overall polish:** The organization menu is responsive and legible; onboarding feedback and failure containment are not production-ready.
- **Findings by severity:** BLOCKER 1, MAJOR 1.
- **Most consequential friction:** The Builder cannot confirm who their assigned Broker is, while the recovery path can expose a backend stack trace instead of a role-aware onboarding state.
- **Required major improvement:** Durable onboarding/relationship status showing brokerage, assigned Broker, invite/profile/assignment state, next action, and recoverable exception guidance.
- **Relevant evidence:** `WF-TEN-002.BLDR.01.STEP-04-desktop-1440x900-no-broker-confirmation.png`, `WF-TEN-002.BLDR.01.STEP-04-tablet-1024x768-no-broker-confirmation.png`, `WF-TEN-002.BLDR.01.STEP-04-mobile-390x844-no-broker-confirmation.png`, `WF-TEN-002.BLDR.01.STEP-04-desktop-unauthorized.png`.
- **Blocker / last successful step:** `WF-TEN-002.BLDR.01.STEP-04` was observable for an already-active Builder. Steps 01–03, `WF-TEN-002.BRKR.01`, and `WF-TEN-002.SYS.01` were unavailable. `WF-TEN-002.HO-01` was inspected only from the receiving Builder's postcondition; `WF-TEN-002.HO-02` was not testable.

### `WF-TEN-003` — Builder Reassignment and Cross-Brokerage Transfer

- **Persona and category:** Lender Admin / assignment governance; Platform Admin / cross-tenant governance; Broker / relationship ownership; DrawFlow System / transfer orchestration.
- **Audit status:** Blocked.
- **Paths and states tested:** Production backoffice entry and role denial; `/demo/drawflow` inspected as an audit aid but exposed no browser-visible transfer equivalent.
- **Browser viewports:** 1440x900, 1024x768, 390x844.
- **Overall usability:** The access wall gives no tenant, authority, transfer, or escalation context.
- **Overall polish:** Clean denial card, insufficient workflow recovery.
- **Findings by severity:** MAJOR 1.
- **Most consequential friction:** A transfer initiator cannot tell whether the blocker is the wrong organization, missing Principal authority, a pending Platform Admin handoff, or a role-sync failure.
- **Required major improvement:** Governed transfer/access recovery surface with source/destination scope, required authority, affected work, retention/routing implications, and responsible next actor.
- **Relevant evidence:** `WF-TEN-003.LADM.01.STEP-01-desktop-1440x900-protected-access.png`, `WF-TEN-003.LADM.01.STEP-01-tablet-1024x768-protected-access.png`, `WF-TEN-003.LADM.01.STEP-01-mobile-390x844-protected-access.png`, `public-demo-drawflow-tablet-1024x768.png`, `public-demo-drawflow-mobile-390x844-blank.png`.
- **Blocker / last successful step:** No LADM, PADM, or BRKR role was available. Blocked before `WF-TEN-003.LADM.01.STEP-01`, `WF-TEN-003.PADM.01.STEP-01`, and `WF-TEN-003.BRKR.01.STEP-01`; `WF-TEN-003.SYS.01` and both handoffs were not browser-observable.

### `WF-TEN-004` — Brokerage Staff Invitation, Role Change, and Deactivation

- **Persona and category:** Lender Admin / brokerage administration; Broker / broker membership; Lender Operations / backoffice membership; DrawFlow System / authorization projection.
- **Audit status:** Blocked.
- **Paths and states tested:** Production backoffice entry and no-workspace-access denial across viewports.
- **Browser viewports:** 1440x900, 1024x768, 390x844.
- **Overall usability:** The denial is understandable at a high level but does not explain an invitation, role change, deactivation, or projection failure.
- **Overall polish:** Responsive card presentation is adequate; system feedback and recovery are incomplete.
- **Findings by severity:** MAJOR 1.
- **Most consequential friction:** An invited, changed, or deactivated staff member cannot distinguish expected deactivation from erroneous role projection or affected-work routing risk.
- **Required major improvement:** Role-projection diagnostics with intended/current role, effective capability delta, affected builders/queues, timestamp, and switch/request/retry/escalation actions.
- **Relevant evidence:** `WF-TEN-004.LADM.01.STEP-01-desktop-1440x900-protected-access.png`, `WF-TEN-004.LADM.01.STEP-01-tablet-1024x768-protected-access.png`, `WF-TEN-004.LADM.01.STEP-01-mobile-390x844-protected-access.png`.
- **Blocker / last successful step:** No LADM, BRKR, or LOPS role was available. Blocked before all persona segment STEP-01 actions; `WF-TEN-004.SYS.01` and `WF-TEN-004.HO-01`–`HO-03` were not browser-observable.

### `WF-CTR-001` — Contractor Profile, Invitation, Onboarding, Claim, and Review

- **Persona and category:** Builder / contractor onboarding; Contractor / contractor onboarding; Lender Operations / contractor operations; DrawFlow System / identity synchronization.
- **Audit status:** Partially audited.
- **Paths and states tested:** Existing profile search; no-match empty state; canonical profile selection; optional invite; attach success; new unclaimed profile creation; invalid email; responsive existing/new sheets; post-invite monitoring via contractor detail link.
- **Browser viewports:** 1440x900, 1024x768, 390x844.
- **Overall usability:** The Builder can create/reuse and invite, but the handoff status is not durable and monitoring fails with `Forbidden`.
- **Overall polish:** Desktop form is structured; mobile overflow, clipped status content, and floating controls overlapping primary actions are not production-ready.
- **Findings by severity:** BLOCKER 1, MAJOR 2, MODERATE 1.
- **Most consequential friction:** The Builder completes `WF-CTR-001.HO-01` but cannot see a pending/claimed acknowledgement state and cannot open the linked contractor detail.
- **Required major improvement:** A durable onboarding status model plus mobile-first sheet, separating attach/invite concepts and exposing receiving actor, pending acknowledgement, review/sync state, and an authorized detail/status destination.
- **Relevant evidence:** `WF-CTR-001.BLDR.01.STEP-01-desktop-search-dialog.png`, `WF-CTR-001.BLDR.01.STEP-04-WF-CTR-001.HO-01-desktop-invite-ready.png`, `WF-CTR-001.BLDR.01.STEP-05-WF-CTR-001.HO-01-desktop-attached.png`, `WF-CTR-001.BLDR.01.STEP-05-desktop-contractor-detail-forbidden.png`, `WF-CTR-001.BLDR.01.STEP-01-tablet-1024x768-overflow.png`, `WF-CTR-001.BLDR.01.STEP-01-mobile-390x844-sheet.png`, `WF-CTR-001.BLDR.01.STEP-02-mobile-390x844-form-overflow.png`.
- **Blocker / last successful step:** `WF-CTR-001.BLDR.01.STEP-01` through `WF-CTR-001.BLDR.01.STEP-04` completed; `WF-CTR-001.BLDR.01.STEP-05` reached the attached contractor card but its detail link failed with `Forbidden`. Only the Builder sender side of `WF-CTR-001.HO-01` was observed. `WF-CTR-001.CNTR.01`, `WF-CTR-001.LOPS.01`, `WF-CTR-001.SYS.01`, Contractor acknowledgement for `WF-CTR-001.HO-01`, `WF-CTR-001.HO-02`, `WF-CTR-001.HO-03`, and `WF-CTR-001.HO-04` were role-blocked.

## Detailed findings

### UX-WF-TEN-001-001

1. **Finding ID:** `UX-WF-TEN-001-001`
2. **Workflow ID:** `WF-TEN-001`
3. **Persona-specific segment ID:** `WF-TEN-001.LADM.01`
4. **Workflow step ID:** `WF-TEN-001.LADM.01.STEP-01`
5. **Handoff ID, if applicable:** `WF-TEN-001.HO-01`
6. **Persona:** Lender Admin / Principal Broker
7. **Page, route, dialog, or interface:** `/protected-access?reason=no-workspace-access&workspace=backoffice`
8. **Finding title:** Principal activation failures terminate at a context-free access wall
9. **Severity:** `MAJOR`
10. **Finding type:** Observed UX defect — system feedback, recovery, cross-persona handoff
11. **Observed behavior:** Opening the backoffice entry displayed “Workspace access required” and only Home/Demos actions. The page did not identify the active organization, invited identity, invitation status, current membership/role, required Principal role, expiry, or the sender responsible for repair.
12. **Expected professional experience:** A principal invitee should see which brokerage and role are expected, whether acceptance or synchronization is pending/failed, and a safe next action such as accept/retry, switch organization, or contact the Platform Admin.
13. **User impact:** A legitimate invitee cannot distinguish a wrong account from an expired invite or failed role sync, so tenant activation stalls without actionable recovery.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-TEN-001.LADM.01.STEP-01-desktop-1440x900-protected-access.png`; tablet and mobile variants with the same prefix.
15. **Reproduction steps:** Open the production backoffice entry with the available WorkOS session lacking backoffice membership; observe redirect to protected access; inspect available context and actions.
16. **Recommended improvement:** Replace the generic wall for invitation/membership failures with a principal-activation diagnostic card showing brokerage, invited email, invitation/membership/role-sync state, expiry, required role, sender, and role-safe accept/retry/switch/escalate actions.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Visibility of system status and actionable error recovery are critical at an authority handoff; a denial without state or ownership creates an organizational dead end.
19. **Acceptance criteria:** The page identifies organization, invited identity, required/current role, invitation and sync state, responsible sender, and at least one actionable recovery; no sensitive cross-tenant data is exposed.
20. **Related or duplicate finding IDs:** `UX-WF-TEN-003-001`, `UX-WF-TEN-004-001`

### UX-WF-TEN-002-001

1. **Finding ID:** `UX-WF-TEN-002-001`
2. **Workflow ID:** `WF-TEN-002`
3. **Persona-specific segment ID:** `WF-TEN-002.BLDR.01`
4. **Workflow step ID:** `WF-TEN-002.BLDR.01.STEP-04`
5. **Handoff ID, if applicable:** Not applicable
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** `/builder` route error boundary
8. **Finding title:** Fresh Builder entry exposes a raw Convex authorization stack trace
9. **Severity:** `BLOCKER`
10. **Finding type:** Observed defect — broken workflow, error handling, trust
11. **Observed behavior:** A new isolated browser tab navigating to `/builder` failed while loading `getBuilderOnboardingState`, displayed “Unauthorized,” request ID, backend file paths, middleware stack frames, and only Try again / Back to backoffice actions.
12. **Expected professional experience:** The application should resolve the user's onboarding state or present a role-safe, plain-language sign-in/accept/switch/request-access recovery without internal implementation details.
13. **User impact:** Builder onboarding/proposal entry cannot be completed in the affected context, and internal stack details erode trust and may disclose unnecessary implementation information.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-TEN-002.BLDR.01.STEP-04-desktop-unauthorized.png`
15. **Reproduction steps:** Open a new isolated tab; navigate to `http://localhost:3000/`; allow redirect to `/builder`; wait for onboarding-state query; observe route error.
16. **Recommended improvement:** Contain authorization failures in a typed onboarding/access state, redact internal errors, preserve the intended Builder destination, and offer sign in, accept invitation, switch organization, or request help based on the detected state.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Error prevention, least-privilege disclosure, and recoverability require domain-specific failure states instead of raw infrastructure exceptions.
19. **Acceptance criteria:** Unauthorized onboarding queries never render stack traces; every state has a plain-language explanation and actionable recovery; retries do not loop to another inaccessible workspace.
20. **Related or duplicate finding IDs:** `UX-WF-TEN-001-001`

### UX-WF-TEN-002-002

1. **Finding ID:** `UX-WF-TEN-002-002`
2. **Workflow ID:** `WF-TEN-002`
3. **Persona-specific segment ID:** `WF-TEN-002.BLDR.01`
4. **Workflow step ID:** `WF-TEN-002.BLDR.01.STEP-04`
5. **Handoff ID, if applicable:** `WF-TEN-002.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Authenticated Builder workspace profile/organization menu
8. **Finding title:** Post-onboarding UI never confirms the assigned Broker
9. **Severity:** `MAJOR`
10. **Finding type:** Professional recommendation grounded in observed information architecture and handoff feedback
11. **Observed behavior:** The active organization menu showed `FairLendBrokerage` and role `Builder` at all tested widths, but no assigned Broker, relationship status, onboarding completion state, or contact/escalation action. The Build workspace likewise did not surface Broker assignment in the inspected view.
12. **Expected professional experience:** Completion of Builder onboarding should explicitly confirm both brokerage membership and the Broker relationship, including who owns the relationship and what the Builder should do next.
13. **User impact:** The Builder cannot verify that the correct relationship was materialized or know whom to contact if assignment or proposal access is wrong.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-TEN-002.BLDR.01.STEP-04-desktop-1440x900-no-broker-confirmation.png`; tablet and mobile variants with the same suffix.
15. **Reproduction steps:** Open an authenticated Builder Build; open the profile/organization menu; inspect organization, role, and relationship context; repeat at 1024x768 and 390x844.
16. **Recommended improvement:** Add a durable Builder relationship summary in onboarding completion and account/workspace context showing brokerage, assigned Broker, effective timestamp, status, and contact/report-assignment-issue actions.
17. **Scope of change:** Component-level change
18. **Rationale and applicable UI/UX principle:** Closure and handoff acknowledgement require confirming the precise relationship created, not merely a generic organization role.
19. **Acceptance criteria:** An active Builder can identify their assigned Broker and assignment status within one interaction from the workspace; incorrect/missing assignment has a clear escalation path.
20. **Related or duplicate finding IDs:** None

### UX-WF-TEN-003-001

1. **Finding ID:** `UX-WF-TEN-003-001`
2. **Workflow ID:** `WF-TEN-003`
3. **Persona-specific segment ID:** `WF-TEN-003.LADM.01`
4. **Workflow step ID:** `WF-TEN-003.LADM.01.STEP-01`
5. **Handoff ID, if applicable:** `WF-TEN-003.HO-01`
6. **Persona:** Lender Admin / Principal Broker
7. **Page, route, dialog, or interface:** Backoffice protected-access page
8. **Finding title:** Transfer entry denial omits tenant scope, required authority, and escalation owner
9. **Severity:** `MAJOR`
10. **Finding type:** Professional recommendation grounded in observed access recovery and cross-persona handoff
11. **Observed behavior:** The only visible production response for the available session was a generic backoffice access denial. It contained no source/destination brokerage context, current organization/role, required Principal authority, pending transfer state, or Platform Admin escalation path.
12. **Expected professional experience:** A governed transfer entry should identify whether the user is in the wrong organization, lacks required authority, or is awaiting Platform Admin review, without revealing unauthorized builder data.
13. **User impact:** A legitimate initiator cannot determine how to start or resume a transfer, and the `LADM → PADM` handoff has no visible ownership or recovery signal.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-TEN-003.LADM.01.STEP-01-desktop-1440x900-protected-access.png`; tablet and mobile variants.
15. **Reproduction steps:** Open the production backoffice entry with the available non-backoffice WorkOS session; inspect denial context and available actions.
16. **Recommended improvement:** Provide a role-safe transfer access diagnostic that shows active organization/role, required authority, whether a transfer request is pending, and a request-access/switch-organization/contact-Platform-Admin action.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Cross-tenant governance requires explicit scope and handoff ownership; generic access denial provides neither while still stopping the workflow.
19. **Acceptance criteria:** An unauthorized-but-authenticated initiator can identify current scope, required authority, request status, and responsible escalation path without seeing protected builder records.
20. **Related or duplicate finding IDs:** `UX-WF-TEN-001-001`, `UX-WF-TEN-004-001`

### UX-WF-TEN-004-001

1. **Finding ID:** `UX-WF-TEN-004-001`
2. **Workflow ID:** `WF-TEN-004`
3. **Persona-specific segment ID:** `WF-TEN-004.LADM.01`
4. **Workflow step ID:** `WF-TEN-004.LADM.01.STEP-01`
5. **Handoff ID, if applicable:** `WF-TEN-004.HO-03`
6. **Persona:** Lender Admin / Principal Broker
7. **Page, route, dialog, or interface:** Backoffice protected-access page
8. **Finding title:** Role projection and deactivation failures are indistinguishable from generic missing access
9. **Severity:** `MAJOR`
10. **Finding type:** Professional recommendation grounded in observed system feedback and access-change handoff
11. **Observed behavior:** The denial page stated only that the current session lacked backoffice access. It did not distinguish a new invitation, pending role projection, changed capability, intentional deactivation, or sync failure, and did not identify affected work or an administrator recovery action.
12. **Expected professional experience:** Staff access changes should have an explicit state and effective capability summary, with changed/deactivated work routing and a repair or escalation path for unexpected outcomes.
13. **User impact:** Staff and administrators cannot verify whether access loss is intended, whether queues/builders need rerouting, or who must repair a failed projection.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-TEN-004.LADM.01.STEP-01-desktop-1440x900-protected-access.png`; tablet and mobile variants.
15. **Reproduction steps:** Open backoffice with a session lacking backoffice membership; inspect whether the page explains invitation/access-change/deactivation state or affected work.
16. **Recommended improvement:** Add an access-change result surface with current/intended role, effective timestamp, capability delta, affected work warnings, projection status, and verify/reroute/retry/request-help actions.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Authorization changes are material system events; visibility of system status and safe recovery must match their operational impact.
19. **Acceptance criteria:** Invitations, pending projections, successful changes, deactivations, and failures are visually and semantically distinct; administrators can verify affected work and take the appropriate next action.
20. **Related or duplicate finding IDs:** `UX-WF-TEN-001-001`, `UX-WF-TEN-003-001`

### UX-WF-CTR-001-001

1. **Finding ID:** `UX-WF-CTR-001-001`
2. **Workflow ID:** `WF-CTR-001`
3. **Persona-specific segment ID:** `WF-CTR-001.BLDR.01`
4. **Workflow step ID:** `WF-CTR-001.BLDR.01.STEP-05`
5. **Handoff ID, if applicable:** `WF-CTR-001.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** `/builder/contractors/{contractorId}` from the newly attached contractor card
8. **Finding title:** Builder cannot open the contractor they just invited and attached
9. **Severity:** `BLOCKER`
10. **Finding type:** Observed defect — broken workflow, authorization, handoff monitoring
11. **Observed behavior:** After inviting and attaching `Seed Scenario Contractor LLC`, the Build showed a linked contractor card. Activating that link produced a route error with `Forbidden: contractor detail`, request ID, backend file paths, and stack frames.
12. **Expected professional experience:** The initiating Builder should reach an authorized, builder-scoped contractor relationship/status view or a plain-language restricted view that still exposes invitation/claim status and next action.
13. **User impact:** `WF-CTR-001.BLDR.01.STEP-05` cannot be completed; the Builder cannot monitor or repair the handoff they initiated.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-05-desktop-contractor-detail-forbidden.png`
15. **Reproduction steps:** Open Add contractor; select `Seed Scenario Contractor LLC`; click Invite; wait for the sheet to close and contractor count to increase; activate the new contractor link.
16. **Recommended improvement:** Align link visibility with read authorization and provide a builder-scoped contractor relationship view containing invite, claim, compliance, profile-link, and assignment status; redact internal stack details on failure.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** An offered navigation affordance must lead to a usable destination; authorization and UI capability must be consistent.
19. **Acceptance criteria:** Every rendered contractor link is readable by the current Builder or replaced by a non-link status card; the initiating Builder can monitor invite/claim state; raw stack traces never render.
20. **Related or duplicate finding IDs:** `UX-WF-CTR-001-002`

### UX-WF-CTR-001-002

1. **Finding ID:** `UX-WF-CTR-001-002`
2. **Workflow ID:** `WF-CTR-001`
3. **Persona-specific segment ID:** `WF-CTR-001.BLDR.01`
4. **Workflow step ID:** `WF-CTR-001.BLDR.01.STEP-05`
5. **Handoff ID, if applicable:** `WF-CTR-001.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Add contractor sheet and attached-contractor list in Build Workspace
8. **Finding title:** Contractor invitation handoff has no durable pending or acknowledgement state
9. **Severity:** `MAJOR`
10. **Finding type:** Observed UX defect — cross-persona handoff, system feedback, information architecture
11. **Observed behavior:** Selecting a “Not invited” contractor revealed an Invite button. Clicking it showed transient “Sending...” / “Saving...” states, closed the sheet, and added the contractor. The resulting card displayed name, role, trades, and email but no invited/pending/claimed/review/failed state, expiry, receiving actor, or next action.
12. **Expected professional experience:** The Builder should see that the invitation was sent, who must acknowledge it, current claim/review/sync state, expiry/failure, and resend or repair actions until the handoff terminates.
13. **User impact:** The Builder cannot tell whether the Contractor received or accepted the handoff, whether backoffice review is needed, or whether activation failed.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-04-WF-CTR-001.HO-01-desktop-invite-ready.png`; `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-05-WF-CTR-001.HO-01-desktop-attached.png`
15. **Reproduction steps:** Open Add contractor; select the Not invited candidate; click Invite; observe Sending/Saving; inspect the contractor card after the sheet closes.
16. **Recommended improvement:** Model and render explicit invitation/claim/review/sync states with recipient, sent/expiry timestamps, required acknowledgement, and resend/cancel/repair actions. Separate “attach relationship” and “invite platform access” in confirmation copy even when one transaction performs both.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Cross-persona work requires persistent handoff state; transient progress is not acknowledgement or closure.
19. **Acceptance criteria:** The Builder can distinguish not invited, sending, invited, accepted-pending-confirmation, claimed, review-required, changes-requested, sync-pending, active, expired, and failed states and can take only valid next actions.
20. **Related or duplicate finding IDs:** `UX-WF-CTR-001-001`

### UX-WF-CTR-001-003

1. **Finding ID:** `UX-WF-CTR-001-003`
2. **Workflow ID:** `WF-CTR-001`
3. **Persona-specific segment ID:** `WF-CTR-001.BLDR.01`
4. **Workflow step ID:** `WF-CTR-001.BLDR.01.STEP-02`
5. **Handoff ID, if applicable:** Not applicable
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Add contractor side sheet, Existing and New modes
8. **Finding title:** Mobile contractor sheet overflows horizontally and floating utilities obstruct primary actions
9. **Severity:** `MAJOR`
10. **Finding type:** Observed defect — responsive behavior, interaction design, accessibility
11. **Observed behavior:** At 390x844, the sheet began at x=48 with a 342px client width but 389px content width; a horizontal scrollbar was visible. Candidate status chips and “Brokerage scoped” text were clipped. The floating AI control overlapped the primary Attach/Create action and TanStack control overlapped Cancel. The document measured 413px wide in a 390px viewport. At 1024x768, the document measured 1280px wide.
12. **Expected professional experience:** The sheet should be full-width on mobile, use a single responsive content column, wrap status metadata, avoid horizontal scrolling, and reserve an unobstructed safe area for sticky actions.
13. **User impact:** Critical status and controls are partially hidden, scanning requires horizontal movement, and primary/cancel actions have reduced visibility and touch reliability.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-01-mobile-390x844-sheet.png`; `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-02-mobile-390x844-form-overflow.png`; `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-01-tablet-1024x768-overflow.png`
15. **Reproduction steps:** Set viewport to 390x844; open Add contractor; inspect Existing mode; switch to New; inspect horizontal scrollbar, clipped metadata, and bottom controls; repeat at 1024x768.
16. **Recommended improvement:** Use a full-viewport mobile sheet with `min-width: 0` descendants, wrapping chips, one-column fields, internal vertical scroll, and a sticky action safe area that offsets or suppresses floating utilities while modal content is active; remove document-level horizontal overflow at tablet widths.
17. **Scope of change:** Component-level change
18. **Rationale and applicable UI/UX principle:** Responsive reflow and unobstructed touch targets are foundational accessibility and task-completion requirements.
19. **Acceptance criteria:** At 390x844 and 1024x768, document and sheet have no horizontal overflow; every label/status is readable; all fields and actions are reachable; no floating control overlaps the modal action region; primary/cancel targets meet 44px minimum touch size.
20. **Related or duplicate finding IDs:** None

### UX-WF-CTR-001-004

1. **Finding ID:** `UX-WF-CTR-001-004`
2. **Workflow ID:** `WF-CTR-001`
3. **Persona-specific segment ID:** `WF-CTR-001.BLDR.01`
4. **Workflow step ID:** `WF-CTR-001.BLDR.01.STEP-02`
5. **Handoff ID, if applicable:** Not applicable
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Add contractor sheet, New mode
8. **Finding title:** Invalid email silently disables Create and add
9. **Severity:** `MODERATE`
10. **Finding type:** Observed defect — validation, system feedback
11. **Observed behavior:** After entering a contractor name, role, and `not-an-email`, Create and add remained disabled. No inline error, required-field marker, validation summary, or explanation identified the blocking field. Replacing it with a syntactically valid email enabled submission.
12. **Expected professional experience:** Invalid input should receive immediate, field-specific, accessible guidance explaining the accepted format and how to recover.
13. **User impact:** The Builder must infer why submission is blocked and may abandon or repeatedly edit unrelated fields.
14. **Evidence and screenshot reference:** `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-02-desktop-invalid-email-no-error.png`; responsive form context: `evidence/identity-onboarding/WF-CTR-001.BLDR.01.STEP-02-mobile-390x844-form-overflow.png`
15. **Reproduction steps:** Open Add contractor; select New; enter Name and Role; enter `not-an-email` in Email; observe disabled Create and add with no explanation; replace with a valid address and observe enablement.
16. **Recommended improvement:** Show inline email validation on input/blur, connect help/error text using `aria-describedby`, mark invalid state with `aria-invalid`, and expose a concise validation summary when submission is unavailable.
17. **Scope of change:** Component-level change
18. **Rationale and applicable UI/UX principle:** Error identification and recovery require explaining constraints rather than relying on a disabled action as the only signal.
19. **Acceptance criteria:** Invalid email renders persistent plain-language guidance, is announced to assistive technology, and clears when corrected; disabled submit always has a discoverable reason.
20. **Related or duplicate finding IDs:** None

## Audit-only route observations

- `/demo/drawflow` rendered a fully populated Builder demo at 1440x900 in one browser context, but the same route rendered only the global header and a blank body at 1024x768 and 390x844 in the available responsive context. No identity, staff administration, transfer, or contractor-claim equivalent was visible, so it was not treated as evidence that any assigned production workflow works. Evidence: `evidence/identity-onboarding/public-demo-drawflow-desktop-1440x900.png`, `evidence/identity-onboarding/public-demo-drawflow-tablet-1024x768.png`, and `evidence/identity-onboarding/public-demo-drawflow-mobile-390x844-blank.png`.
- `/demo/timeline` rendered only the global header and blank body in the isolated context. Evidence: `public-demo-timeline-desktop-1440x900.png`.
- The public demo observations are coverage aids only; they do not replace production persona-segment or handoff testing.

## Destructive and recovery branch coverage

- No revoke, remove, deactivate, reset, merge, reject, request-changes, reinvite, or role-transfer control was exposed to the available Builder identity. Those branches could not be exercised without the blocked LADM, PADM, BRKR, LOPS, or CNTR roles.
- The visible Contractor flow exposed first-time Invite but no resend/revoke/cancel-invite control after attachment; the attached card also omitted invitation status. Recovery therefore terminated at `WF-CTR-001.BLDR.01.STEP-05` with the observed Forbidden detail route.
- The production protected-access page exposed only Home and Demos. It provided no switch-organization, retry role sync, request access, or contact responsible administrator recovery branch.
