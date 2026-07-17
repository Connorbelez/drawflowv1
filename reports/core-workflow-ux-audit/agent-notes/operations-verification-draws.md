# Operations, milestone verification, draw, and integrations UX audit notes

Browser-observed audit of `WF-OPS-001`, `WF-MIL-001`, `WF-DRW-001`, and `WF-INT-001`. State-changing actions were exercised in the dev environment with explicit user authorization. Production behavior is reported only where it was visible in a browser; blocked persona segments are not inferred from source code.

## Coverage matrix

| Workflow | Persona segments accounted for | Browser-observed paths and states | Viewports | Handoffs | Status | Findings | Required major improvement | Evidence |
|---|---|---|---|---|---|---:|---|---|
| `WF-OPS-001` | `WF-OPS-001.LADM.01`, `WF-OPS-001.BRKR.01`, `WF-OPS-001.LOPS.01`, `WF-OPS-001.SYS.01` | Authenticated production portfolio home; production draw queue entry; public portfolio/list equivalents; protected isolated-session entry | 1422x800 authenticated desktop; 1440x900, 1024x768, 390x844 public equivalents | `WF-OPS-001.HO-01`, `WF-OPS-001.HO-02` visible only as dashboard review surfaces; claim/decision acknowledgement blocked | Partially audited | 1 MAJOR | Replace aggregate-only dashboard review with a canonical work queue that exposes owner, claim state, age/SLA, blocking reason, authority boundary, recommendation, and acknowledgement. | `evidence/_preflight/backoffice-home-desktop.png` |
| `WF-MIL-001` | `WF-MIL-001.LADM.01`, `WF-MIL-001.LOPS.01`, `WF-MIL-001.BLDR.01`, `WF-MIL-001.INSP.01`, `WF-MIL-001.SYS.01` | Builder completion panel; lender review; site-visit request; generated token; inspector capture/upload/report success; consumed-token error; cross-persona return | 1440x900, 1024x768, 390x844 | `WF-MIL-001.HO-04` and `HO-05` fully exercised but misrouted; `HO-01`–`HO-03`, `HO-06`, `HO-07` partially visible or role-blocked | Partially audited with critical handoff failure | 1 BLOCKER, 1 MAJOR, 1 MODERATE | Make every visit token immutable to the initiating organization/build/milestone/work-order tuple and show that tuple at request, capture, submission, and receiving review. | `evidence/operations-verification-draws/live-build-site-visit-requested-desktop.png`; `site-visit-empty-desktop-1440x900.png`; `site-visit-submitted-success-mobile.png` |
| `WF-DRW-001` | `WF-DRW-001.LADM.01`, `WF-DRW-001.LOPS.01`, `WF-DRW-001.BLDR.01`, `WF-DRW-001.SYS.01` | Requested draw with zero availability; lender review; rejection without reason; raw persistence failure; release/readiness display; responsive live-build review | 1440x900, 1024x768, 390x844 | `WF-DRW-001.HO-01` and `HO-02` exercised in demo role switch; `HO-03`–`HO-05` represented but release/receipt actions blocked | Partially audited with integrity failures | 2 BLOCKER, 1 CRITICAL, 1 MAJOR | Enforce one authoritative draw state machine server-side: impossible requests never become `requested`, material decisions require reasons, failed writes roll back visible state, and users receive typed recovery instead of raw exceptions. | `evidence/operations-verification-draws/draw-request-invalid-requested-state-desktop.png`; `draw-rejected-without-required-reason-desktop.png`; `live-build-lender-mobile-390x844.png` |
| `WF-INT-001` | `WF-INT-001.TADM.01`, `WF-INT-001.SYS.01` | Direct production settings/integration entry; WorkOS sign-in wall; no public integration equivalent | 1440x900 | `WF-INT-001.HO-01`, `WF-INT-001.HO-02` blocked before configuration or delivery-log state | Blocked | 1 MAJOR | Provide one tenant-scoped Integration Operations surface for key/secret lifecycle, endpoint/subscription validation, dangerous-change confirmation, delivery logs, retry/repair, and secret-safe diagnostics. | `evidence/operations-verification-draws/production-integrations-settings-auth-wall.png` |

## Segment and step accounting

| Segment | Manifest step coverage | Browser result | Last successful step / blocker |
|---|---|---|---|
| `WF-OPS-001.LADM.01` | STEP-01–STEP-04 | Partial | Production home exposed review aggregates and proposal review, but final decision/reason/returned outcome could not be exercised in the available authenticated tab. |
| `WF-OPS-001.BRKR.01` | STEP-01–STEP-05 | Partial | Portfolio health and next-action affordances were visible; assignment/claim and final escalation were not available to the observed persona. |
| `WF-OPS-001.LOPS.01` | STEP-01–STEP-05 | Partial | Full dashboard context was visible; no accountable claim/assignment/recommendation/acknowledgement control was visible in the captured home state. |
| `WF-OPS-001.SYS.01` | STEP-01–STEP-04 | Partial | Aggregated counts and risk/status projections rendered; routing, assignment aging, and resolution events were not directly inspectable. |
| `WF-MIL-001.BLDR.01` | STEP-01–STEP-06 | Partial | Completion day, actual cost, quality, note, evidence upload, and submit controls were visible. The audited milestone did not expose geofence confidence/history or version-comparison UI. |
| `WF-MIL-001.LOPS.01` | STEP-01–STEP-05 | Partial | Lender review, revision, approval, and visit-request controls rendered; claim/recommendation-to-admin package was not separately represented. |
| `WF-MIL-001.INSP.01` | STEP-01–STEP-06 | Exercised | Scope/permit/location review, responsive capture, local staging, Convex upload, structured report, submit, and consumed-token re-entry were exercised. Offline save/sync failure was not exposed. |
| `WF-MIL-001.LADM.01` | STEP-01–STEP-04 | Partial | Final-review controls rendered in lender role, but the misrouted site-visit report never reached the initiating milestone, preventing a valid final decision. |
| `WF-MIL-001.SYS.01` | STEP-01–STEP-06 | Failed at routing integrity | Token creation, upload persistence, report submission, and token consumption executed, but the token was bound to the wrong build/milestone context. |
| `WF-DRW-001.BLDR.01` | STEP-01–STEP-06 | Partial | Availability and request state rendered; the current invalid requested amount could not be corrected because update was disabled. Withdraw/receipt exception controls were not exposed. |
| `WF-DRW-001.LOPS.01` | STEP-01–STEP-05 | Partial | Review context was visible through the lender role; separate claim/recommendation/settlement-exception controls were not exposed. |
| `WF-DRW-001.LADM.01` | STEP-01–STEP-04 | Partially exercised | Reject executed without the required reason; approve was disabled; release execution/result was unavailable. |
| `WF-DRW-001.SYS.01` | STEP-01–STEP-06 | Failed validation/state consistency | A requested record existed at zero available limit, and the workspace repeatedly reported a Convex validator mismatch while preserving contradictory local UI state. |
| `WF-INT-001.TADM.01` | STEP-01–STEP-05 | Blocked | Direct `/backoffice/settings` entry redirected to WorkOS sign-in; no Technical Admin session or public equivalent existed. |
| `WF-INT-001.SYS.01` | STEP-01–STEP-05 | Blocked | No integration configuration or delivery attempt could be created, observed, failed, retried, or repaired in-browser. |

## Workflow summaries

### `WF-OPS-001` — Backoffice Portfolio and Work-Queue Triage

- **Audit status:** Partially audited.
- **Observed strengths:** The production home clearly aggregates Draw Requests, Active Builds, Proposals, and Milestones; provides build filters; separates submitted proposals; and keeps schedule context nearby.
- **Primary risk:** Aggregates and review links do not visibly establish accountable work ownership, claim state, age/SLA, blocking reason, authority boundary, or acknowledgement. This leaves `WF-OPS-001.HO-01` and `HO-02` operationally implicit.
- **Required major improvement:** A canonical queue shared by Operations and Admin with claim/assignment, priority/age, blocking artifact, next action, recommendation, authority boundary, and returned-decision acknowledgement.
- **Blocker / last successful step:** The authenticated in-app tab exposed the production home at desktop, then its control channel timed out after responsive overrides. Isolated sessions redirected to WorkOS, so destructive queue actions and responsive production states were not safely observable.

### `WF-MIL-001` — Milestone Completion, Evidence Review, Site Visit, and Final Decision

- **Audit status:** Partially audited; inspector flow complete; cross-persona routing failed.
- **Observed strengths:** The inspector surface is unusually good on mobile: a dedicated capture stage, visible compression totals, local staging, scope tags, uploaded-file count, structured report, clear success receipt, and consumed-token enforcement. Tablet layout maintains location, capture, and report context in parallel.
- **Primary risk:** A visit requested from the `ready-ledger-v06j` Drywall review generated a token for `ACTIVE-MAPLE-RIDGE`, Maple Ridge Townhomes, milestone `M-16 Aluminum Windows`. The submitted report did not appear on the initiating Drywall review.
- **Required major improvement:** Bind and display organization/build/milestone/work-order identity at every handoff boundary; reject any mismatch server-side before issuing or accepting a token.
- **Blocker / last successful step:** `WF-MIL-001.HO-04` created a usable token and `WF-MIL-001.INSP.01.STEP-01`–`STEP-06` completed. `WF-MIL-001.HO-05` failed because the report returned to a different context; therefore `HO-06`, `HO-07`, and final draw eligibility could not be validly completed.

### `WF-DRW-001` — Draw Request, Review, Approval, Release, and Receipt Confirmation

- **Audit status:** Partially audited with state-machine and governance failures.
- **Observed strengths:** The workspace explains unlocked value, prior releases, available limit, remaining capacity, interest-bearing amounts, fees, cash position, and timeline markers in a single context. Builder and lender perspectives can be switched without changing routes.
- **Primary risks:** The UI labeled a `$180,000` request “ready for review” while available limit was `$0`; the server was simultaneously reporting a validator mismatch; and lender rejection succeeded with an empty reason even though the domain requires one.
- **Required major improvement:** Make the server transition result authoritative, atomically reconcile availability and request status, require reasoned material decisions, and render typed recovery states rather than optimistic contradictions/raw backend errors.
- **Blocker / last successful step:** Lender rejection completed, but approval/release/receipt steps were not reachable. The invalid request and save failure prevent the audit from treating later financial projections as reliable.

### `WF-INT-001` — API/Webhook Configuration, Lifecycle Delivery, and Failure Review

- **Audit status:** Blocked.
- **Observed strengths:** The production shell exposes a Settings destination and authentication itself is clean and responsive.
- **Primary risk:** No Technical Admin session or public integration equivalent was available, so key/secret lifecycle, endpoint/subscription setup, dangerous-change confirmation, delivery logs, retry, repair, and secret-safe failure handling remain unverified.
- **Required major improvement:** A dedicated Integration Operations console that makes configuration and delivery state explicit and recoverable, including rotation/revocation, test delivery, versioned payload metadata, attempt timeline, retry/backoff state, and disabled/dead-letter outcomes.
- **Blocker / last successful step:** Direct `/backoffice/settings` entry reached WorkOS sign-in. Blocked before `WF-INT-001.TADM.01.STEP-01`; `WF-INT-001.SYS.01` and both handoffs were not observable.

## Detailed findings

### UX-WF-OPS-001-001

1. **Finding ID:** `UX-WF-OPS-001-001`
2. **Workflow ID:** `WF-OPS-001`
3. **Persona-specific segment ID:** `WF-OPS-001.LOPS.01`
4. **Workflow step ID:** `WF-OPS-001.LOPS.01.STEP-01`
5. **Handoff ID, if applicable:** `WF-OPS-001.HO-01`, `WF-OPS-001.HO-02`
6. **Persona:** Lender Operations / Backoffice Staff
7. **Page, route, dialog, or interface:** Authenticated `/backoffice` production home
8. **Finding title:** Portfolio aggregates do not establish an accountable operational queue
9. **Severity:** `MAJOR`
10. **Finding type:** Professional recommendation grounded in observed information architecture and handoff feedback
11. **Observed behavior:** The home showed four aggregate cards, an active-build table, submitted-proposal review, schedule, and an empty Milestone Kanban. The captured state did not expose item owner, claim state, age/SLA, blocking artifact, recommendation status, authority boundary, or returned-decision acknowledgement.
12. **Expected professional experience:** An operations dashboard should answer who owns each material item, how long it has waited, why it is blocked, what non-final action is permitted, and whether Admin has acknowledged or returned the escalation.
13. **User impact:** High-value proposal, milestone, draw, and visit work can remain visible but operationally unowned, undermining `WF-OPS-001`'s core promise of accountable next action.
14. **Evidence and screenshot reference:** `evidence/_preflight/backoffice-home-desktop.png`
15. **Reproduction steps:** Open the authenticated production Backoffice home; inspect aggregate cards, active builds, submitted proposals, schedule, and milestone kanban; look for claim/assignment/aging/authority/acknowledgement metadata.
16. **Recommended improvement:** Add a canonical cross-domain action queue with assignee/claim, priority, age/SLA, blocker, artifact completeness, permitted next action, recommendation, authority boundary, and returned-decision acknowledgement; preserve one-click deep context.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Operational visibility must identify both system state and accountable actor; aggregate counts without ownership or next action create hidden queues.
19. **Acceptance criteria:** Every material item has visible owner/claim state, age, blocker, next action, required authority, recommendation/decision state, and acknowledgement; filters and deep links preserve build context.
20. **Related or duplicate finding IDs:** None

### UX-WF-MIL-001-001

1. **Finding ID:** `UX-WF-MIL-001-001`
2. **Workflow ID:** `WF-MIL-001`
3. **Persona-specific segment ID:** `WF-MIL-001.SYS.01`
4. **Workflow step ID:** `WF-MIL-001.SYS.01.STEP-03`
5. **Handoff ID, if applicable:** `WF-MIL-001.HO-04`, `WF-MIL-001.HO-05`
6. **Persona:** DrawFlow System; Lender Operations; Site Visit Staff / Inspector
7. **Page, route, dialog, or interface:** Live-build lender review → generated `/newsitevisit/...` token → mobile visit report
8. **Finding title:** Site-visit token routes the inspector to the wrong build and milestone
9. **Severity:** `BLOCKER`
10. **Finding type:** Observed defect — cross-persona routing, data integrity, wrong-context mutation
11. **Observed behavior:** From the `ready-ledger-v06j` live-build Drywall review, Request site visit produced a shareable token whose URL contained `active-maple-ridge`. Opening it displayed Maple Ridge Townhomes and `M-16 Aluminum Windows`, not Drywall. The inspector uploaded one file and submitted an Approve report successfully; returning to the initiating Drywall lender review still showed “No completion claim” and no report.
12. **Expected professional experience:** The issued token and all uploaded/submitted artifacts must be bound to the initiating organization, build, milestone, evidence package, and site-visit work order, with the same context visible to requester and inspector.
13. **User impact:** Evidence and recommendations can be attached to the wrong construction project, creating material approval, reimbursement, privacy, and audit risk.
14. **Evidence and screenshot reference:** `evidence/operations-verification-draws/live-build-site-visit-requested-desktop.png`; `site-visit-empty-desktop-1440x900.png`; `site-visit-submitted-success-mobile.png`; `live-build-lender-role-desktop-1440x900.png`
15. **Reproduction steps:** Open `demo-timeline-ready-ledger-v06j`; switch to Lender; select Drywall; request a site visit; open the generated token; compare build/milestone identity; upload evidence; submit; reopen initiating Drywall review.
16. **Recommended improvement:** Generate the token from an immutable server-side work-order tuple; validate organization/build/milestone/package IDs on issuance, asset upload, and report submission; display the tuple in requester and inspector UIs; reject mismatches atomically.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Context integrity is a non-negotiable trust boundary for financial evidence; every handoff requires visible identity continuity and server-enforced referential integrity.
19. **Acceptance criteria:** A visit requested from build A/milestone X can only open, upload, submit, and return to A/X; tampered or mismatched tokens are rejected before data mutation; automated tests cover cross-build and cross-organization mismatch.
20. **Related or duplicate finding IDs:** `UX-WF-MIL-001-002`

### UX-WF-MIL-001-002

1. **Finding ID:** `UX-WF-MIL-001-002`
2. **Workflow ID:** `WF-MIL-001`
3. **Persona-specific segment ID:** `WF-MIL-001.INSP.01`
4. **Workflow step ID:** `WF-MIL-001.INSP.01.STEP-03`
5. **Handoff ID, if applicable:** `WF-MIL-001.HO-05`
6. **Persona:** Site Visit Staff / Inspector
7. **Page, route, dialog, or interface:** Mobile/tablet evidence visit surface
8. **Finding title:** Submitted report omits a clear location-verification result and permit exception acknowledgement
9. **Severity:** `MAJOR`
10. **Finding type:** Observed UX defect — evidence provenance, compliance feedback
11. **Observed behavior:** The visit displayed coordinates, “Site plan pending,” and “No build permit attached,” but exposed no explicit location-attempt control/result, accuracy, timestamp, confidence, permission failure, or location-unverified status. The report could be submitted successfully without an explicit acknowledgement of the missing permit warning.
12. **Expected professional experience:** The inspector should see and record the location attempt/result and explicitly acknowledge unresolved permit/site-plan exceptions before submission, without discarding evidence when verification fails.
13. **User impact:** Operations/Admin cannot distinguish verified on-site capture from coordinates shown without a current verification attempt, and a material permit gap can pass through without a deliberate recorded acknowledgement.
14. **Evidence and screenshot reference:** `evidence/operations-verification-draws/site-visit-empty-desktop-1440x900.png`; `site-visit-empty-tablet-1024x768.png`; `site-visit-empty-mobile-390x844.png`; `site-visit-submitted-success-mobile.png`
15. **Reproduction steps:** Open an active visit token; inspect Location and Permit cards; stage/upload evidence; submit the prefilled report; inspect whether location verification and permit exception acknowledgement are required or recorded.
16. **Recommended improvement:** Add a visible geolocation-attempt component with status/accuracy/time/permission outcome and immutable capture metadata; require a structured acknowledgement/reason for missing permit/site-plan exceptions before submission.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** Evidence provenance and exception visibility must be explicit at capture time; warnings that do not produce structured state are easy to overlook and hard to audit.
19. **Acceptance criteria:** Every report records attempted/not-attempted, verified/unverified, accuracy/time/reason, and immutable asset metadata; missing permit/site-plan warnings require structured acknowledgement; evidence remains retained on verification failure.
20. **Related or duplicate finding IDs:** `UX-WF-MIL-001-001`

### UX-WF-MIL-001-003

1. **Finding ID:** `UX-WF-MIL-001-003`
2. **Workflow ID:** `WF-MIL-001`
3. **Persona-specific segment ID:** `WF-MIL-001.INSP.01`
4. **Workflow step ID:** `WF-MIL-001.INSP.01.STEP-06`
5. **Handoff ID, if applicable:** `WF-MIL-001.HO-04`
6. **Persona:** Site Visit Staff / Inspector
7. **Page, route, dialog, or interface:** Consumed `/newsitevisit/...` token state
8. **Finding title:** Consumed-token error is clear but offers no first-party recovery action
9. **Severity:** `MODERATE`
10. **Finding type:** Observed UX defect — recovery and handoff ownership
11. **Observed behavior:** Reopening the consumed token showed build, token tail, reason, and support email, but no action to request a replacement link, return to assignment, copy diagnostic context, or notify the assigning Operations user.
12. **Expected professional experience:** A legitimate inspector should be able to request regeneration or return to an assignment/contact path without manually transcribing token details into email.
13. **User impact:** Expired/misissued/consumed links create avoidable field delays and off-platform support work.
14. **Evidence and screenshot reference:** `evidence/operations-verification-draws/site-visit-consumed-token-mobile.png`
15. **Reproduction steps:** Complete and submit a visit; reopen the same token; inspect recovery actions.
16. **Recommended improvement:** Add role-safe Request new link, Copy diagnostic, Return to assignment, and Contact requester actions, preserving build/visit identity without revealing secret token material.
17. **Scope of change:** Component-level change
18. **Rationale and applicable UI/UX principle:** A good error state explains the problem and supplies the next safe action; support email alone is not task recovery.
19. **Acceptance criteria:** Invalid/expired/consumed states identify the reason and offer at least one secure in-product recovery; requester receives an auditable regeneration request; full token value is never exposed.
20. **Related or duplicate finding IDs:** None

### UX-WF-DRW-001-001

1. **Finding ID:** `UX-WF-DRW-001-001`
2. **Workflow ID:** `WF-DRW-001`
3. **Persona-specific segment ID:** `WF-DRW-001.SYS.01`
4. **Workflow step ID:** `WF-DRW-001.SYS.01.STEP-03`
5. **Handoff ID, if applicable:** `WF-DRW-001.HO-03`
6. **Persona:** DrawFlow System
7. **Page, route, dialog, or interface:** Live-build timeline workspace and notification toast
8. **Finding title:** Save failure leaks raw Convex internals and leaves the workspace in contradictory state
9. **Severity:** `BLOCKER`
10. **Finding type:** Observed defect — persistence, error containment, trust
11. **Observed behavior:** The live build showed a persistent red “Save failed” badge. The notification region exposed a raw Convex `ArgumentValidationError`, request ID, internal function name, object payload, and validator schema because `minimumCashReserveCents` was sent as an extra field. Role switches and mutations continued to update visible UI despite the failed persistence state.
12. **Expected professional experience:** Invalid client/server contracts should be contained before release; any runtime failure should roll back or reconcile optimistic state and show a plain-language, retryable, correlation-safe error.
13. **User impact:** Users cannot know which milestone/draw/site-visit changes are durable, and internal implementation details are unnecessarily disclosed.
14. **Evidence and screenshot reference:** `evidence/operations-verification-draws/live-build-builder-save-failed-desktop-1440x900.png`; `live-build-lender-mobile-390x844.png`
15. **Reproduction steps:** Open the live-build demo; wait for initial plan-state persistence; inspect header and Notifications; switch roles or mutate visit/draw state; observe continued UI changes alongside Save failed.
16. **Recommended improvement:** Align client/server validators; gate dependent actions until reconciliation; roll back failed optimistic updates; render a typed error with affected action, retry, and safe correlation ID; redact schemas, payloads, and function names.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Financial workflow state must be authoritative and recoverable; raw infrastructure failures and ambiguous durability destroy trust.
19. **Acceptance criteria:** Contract tests prevent validator drift; failed writes do not leave durable-looking local state; user errors are plain-language and actionable; internal schemas/functions never render; retry is idempotent.
20. **Related or duplicate finding IDs:** `UX-WF-DRW-001-002`, `UX-WF-DRW-001-004`

### UX-WF-DRW-001-002

1. **Finding ID:** `UX-WF-DRW-001-002`
2. **Workflow ID:** `WF-DRW-001`
3. **Persona-specific segment ID:** `WF-DRW-001.BLDR.01`
4. **Workflow step ID:** `WF-DRW-001.BLDR.01.STEP-03`
5. **Handoff ID, if applicable:** `WF-DRW-001.HO-01`
6. **Persona:** Builder
7. **Page, route, dialog, or interface:** Draw 01 request panel in live-build timeline
8. **Finding title:** Impossible zero-capacity request is represented as ready for review
9. **Severity:** `CRITICAL`
10. **Finding type:** Observed defect — financial state-machine integrity
11. **Observed behavior:** Draw 01 showed `$180,000`, status `REQUESTED`, and “Request ready for review” while the panel simultaneously showed Available draw limit `$0`, Remaining after request `$0`, warned that submission would clamp to `$0`, and said Foundation must be completed/admin-approved. Update controls were disabled.
12. **Expected professional experience:** A request exceeding available-now value must be prevented or remain an explicit invalid draft; it must never enter requested/review handoff state.
13. **User impact:** Operations can receive a financially impossible request, users cannot tell whether `$180,000` or `$0` is authoritative, and downstream approval/release decisions become unsafe.
14. **Evidence and screenshot reference:** `evidence/operations-verification-draws/draw-request-invalid-requested-state-desktop.png`
15. **Reproduction steps:** Open the audited live build; select Draw 01; inspect request status, amount, unlocked value, available limit, warnings, and enabled actions.
16. **Recommended improvement:** Enforce amount ≤ available-now in the authoritative mutation; keep invalid values in editable draft state; recompute from approved milestone value and reservations atomically; explain the exact blocker and next valid action.
17. **Scope of change:** Cross-product/systemic change
18. **Rationale and applicable UI/UX principle:** Error prevention and financial consistency require impossible states to be unrepresentable, not merely warned about after creation.
19. **Acceptance criteria:** No requested record can exceed available-now; auto-request logic cannot bypass milestone/admin gates; invalid drafts remain editable and never enter review; concurrent reservations are covered by idempotent tests.
20. **Related or duplicate finding IDs:** `UX-WF-DRW-001-001`, `UX-WF-DRW-001-003`

### UX-WF-DRW-001-003

1. **Finding ID:** `UX-WF-DRW-001-003`
2. **Workflow ID:** `WF-DRW-001`
3. **Persona-specific segment ID:** `WF-DRW-001.LADM.01`
4. **Workflow step ID:** `WF-DRW-001.LADM.01.STEP-02`
5. **Handoff ID, if applicable:** `WF-DRW-001.HO-03`
6. **Persona:** Lender Admin / Principal Broker
7. **Page, route, dialog, or interface:** Lender Draw Review side panel
8. **Finding title:** Draw rejection succeeds with an empty required reason
9. **Severity:** `BLOCKER`
10. **Finding type:** Observed defect — approval governance and auditability
11. **Observed behavior:** In Lender role, the approval-condition/audit-note field was empty. Approve was disabled because the request exceeded capacity, but Reject remained enabled. Activating Reject immediately changed Draw 01 from `REQUESTED` to `REJECTED` without requiring a reason or confirmation.
12. **Expected professional experience:** A material draw rejection must require a reason, show the affected amount/request, confirm the irreversible state transition, and return the reason to Operations/Builder.
13. **User impact:** A financially material decision can be recorded without rationale, breaking audit requirements and leaving downstream actors unable to correct or dispute the decision.
14. **Evidence and screenshot reference:** `evidence/operations-verification-draws/draw-request-invalid-requested-state-desktop.png`; `draw-rejected-without-required-reason-desktop.png`
15. **Reproduction steps:** Switch the audited live build to Lender; open Draw 01; leave the audit-note field empty; activate Reject; observe `REJECTED` marker.
16. **Recommended improvement:** Require a non-empty structured reason for reject/override/release; show an impact/identity confirmation; persist actor, role, prior/new state, warnings, and reason atomically; notify Builder/Operations.
17. **Scope of change:** Workflow refactor
18. **Rationale and applicable UI/UX principle:** High-consequence decisions require deliberate confirmation, rationale, and visible handoff feedback.
19. **Acceptance criteria:** Reject is disabled until a valid reason exists; confirmation names request/amount/build; audit records actor/role/time/prior/new/reason; Builder and Operations can view the decision and next action.
20. **Related or duplicate finding IDs:** `UX-WF-DRW-001-002`

### UX-WF-DRW-001-004

1. **Finding ID:** `UX-WF-DRW-001-004`
2. **Workflow ID:** `WF-DRW-001`
3. **Persona-specific segment ID:** `WF-DRW-001.LOPS.01`
4. **Workflow step ID:** `WF-DRW-001.LOPS.01.STEP-02`
5. **Handoff ID, if applicable:** `WF-DRW-001.HO-02`
6. **Persona:** Lender Operations / Backoffice Staff
7. **Page, route, dialog, or interface:** Live-build lender workspace at 1024x768 and 390x844
8. **Finding title:** Responsive lender review clips context and exposes validator text behind the mobile header
9. **Severity:** `MAJOR`
10. **Finding type:** Observed UX defect — responsive layout, error containment, task completion
11. **Observed behavior:** At 1024px the cash graph and right review rail became tightly compressed. At 390px internal validator text appeared behind the header, action labels were clipped, the chart dominated the viewport, and the lender decision panel was displaced far below the initiating context.
12. **Expected professional experience:** Mobile/tablet review should prioritize request identity, amount, availability, evidence status, warnings, and decision actions in a readable stacked layout; internal errors must never enter page content.
13. **User impact:** Reviewers can miss blockers or act without seeing the full amount/evidence context, and mobile rendering communicates a broken/untrusted system.
14. **Evidence and screenshot reference:** `evidence/operations-verification-draws/live-build-lender-tablet-1024x768.png`; `live-build-lender-mobile-390x844.png`
15. **Reproduction steps:** Open the live build in Lender role; set viewport to 1024x768 then 390x844; inspect header, graph, state cards, review rail, and decision actions.
16. **Recommended improvement:** Replace the desktop canvas at smaller widths with an ordered review stack and sticky summary/action bar; collapse charts behind disclosure; keep request identity and warnings together; contain all errors in typed banners.
17. **Scope of change:** Page-level responsive redesign
18. **Rationale and applicable UI/UX principle:** Responsive adaptation must preserve task hierarchy rather than proportionally compress a dense financial canvas.
19. **Acceptance criteria:** At 390px and 1024px, request identity, amount, availability, blockers, evidence, reason field, and legal actions are readable without horizontal clipping; no internal error text overlaps content; keyboard focus follows the visual order.
20. **Related or duplicate finding IDs:** `UX-WF-DRW-001-001`

### UX-WF-INT-001-001

1. **Finding ID:** `UX-WF-INT-001-001`
2. **Workflow ID:** `WF-INT-001`
3. **Persona-specific segment ID:** `WF-INT-001.TADM.01`
4. **Workflow step ID:** `WF-INT-001.TADM.01.STEP-01`
5. **Handoff ID, if applicable:** `WF-INT-001.HO-01`, `WF-INT-001.HO-02`
6. **Persona:** Technical / Organization Admin
7. **Page, route, dialog, or interface:** Direct `/backoffice/settings` entry and WorkOS sign-in
8. **Finding title:** Integration configuration and delivery recovery are not auditable in any available browser persona
9. **Severity:** `MAJOR`
10. **Finding type:** Coverage blocker and professional recommendation grounded in the observed settings entry
11. **Observed behavior:** Direct entry to production Settings redirected to WorkOS sign-in. The public demos exposed no API key, webhook endpoint, subscription, mapping, signing-secret, delivery log, retry, or repair equivalent. No Technical Admin persona could be reached.
12. **Expected professional experience:** An authorized Technical Admin should have one tenant-scoped surface to safely configure credentials and subscriptions, confirm dangerous changes, inspect secret-safe delivery attempts, and repair/retry failures.
13. **User impact:** The complete integration lifecycle remains unverified, including high-risk rotation/revocation and delivery-failure recovery; operators cannot establish whether domain events are traceable externally.
14. **Evidence and screenshot reference:** `evidence/operations-verification-draws/production-integrations-settings-auth-wall.png`
15. **Reproduction steps:** Open `/backoffice/settings` in an isolated browser session; observe WorkOS redirect; inspect all public demo destinations for an integration administration equivalent.
16. **Recommended improvement:** Create an Integration Operations console with endpoint/key/secret states, subscriptions/mappings, dangerous-change confirmation, test delivery, attempt timeline, payload version/ID, secret-safe errors, retry/backoff, disable, rotate/revoke, and audit history.
17. **Scope of change:** New workflow surface / workflow refactor
18. **Rationale and applicable UI/UX principle:** External event delivery is operational infrastructure; configuration, system status, and recovery must be observable and safely controllable by the responsible persona.
19. **Acceptance criteria:** Technical Admin can create/validate/activate/disable endpoints, rotate/revoke credentials, inspect delivered/failed/retry-pending attempts, retry/repair with reason, and verify tenant scope without exposing secrets; both handoffs have explicit acknowledgement.
20. **Related or duplicate finding IDs:** None

## Positive observations

- The site-visit mobile flow provides a clear capture/stage/upload mental model and shows compressed package size before upload.
- The submitted visit receipt names recommendation, file count/size, visit ID, and submission time, then consumes the token.
- The tablet visit layout keeps location, capture, and report context visible in parallel without losing the mobile-specific flow.
- The financial timeline communicates cash requirement, reimbursable/out-of-pocket composition, interest-bearing draw, and milestone timing in one visual model.
- Focus rings are visible on keyboard navigation, although the overall order still traverses floating/devtool controls and off-screen content.

## Evidence inventory

- 25 screenshots under `evidence/operations-verification-draws/`.
- 1 authenticated production Backoffice screenshot under `evidence/_preflight/`.
- Responsive evidence captured at 1440x900, 1024x768, and 390x844 where the workflow was accessible.
- All screenshot references above were opened and visually inspected before use.
