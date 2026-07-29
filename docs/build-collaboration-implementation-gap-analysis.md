# Build Collaboration Implementation Gap Analysis

> **Audit date:** July 29, 2026
>
> **Audited revision:** `535b2eb0f615`
>
> **Verdict:** A meaningful production vertical slice exists, but the approved
> Build Collaboration contract is not fully or correctly implemented end to end.

## Source Contracts

This analysis is subordinate to, and should be read with:

- [Build Collaboration Product Contract](./specs/build-collaboration.md)
- [Build Collaboration Production Implementation Plan](./superpowers/plans/2026-07-28-build-collaboration-production.md)
- [Build Collaboration Cutover Runbook](./runbooks/build-collaboration-cutover.md)

The Product Contract remains the product source of truth. The Implementation
Plan remains the original technical delivery plan. The Cutover Runbook remains
the source of truth for migration, parity, activation, rollback, and production
verification. This document records the delta between those contracts and the
code observed at the audited revision.

## Audit Method

The audit compared the approved contract and plan against:

- the production live-Build composition,
- public and internal Convex collaboration functions,
- collaboration schema and indexes,
- active-Build authorization and role hierarchy,
- TipTap composition and typed-reference behaviour,
- posts, comments, Action Items, receipts, acknowledgements, and drafts,
- notification, migration, and system-event integrations,
- targeted backend and frontend tests,
- current Convex deployment function parity.

The targeted collaboration and production-surface test selection passed 68
tests. Convex typechecking and the application typecheck/build passed. The
deployment parity probe found the four expected collaboration queries. Those
checks prove that the implemented slice is coherent; they do not prove
completion of the Product Contract or execution of the Cutover Runbook.

## Correctly Landed Foundation

The following are credible foundations to preserve:

- Details remains the default live-Build tab.
- Build Overview remains above the Familiar Feed.
- Capital and Term Requests are presented in the Draws section.
- Documents is a first-class Build tab and the duplicate Details content was
  removed from the active composition.
- Collaboration records are Build-, brokerage-, and organization-scoped.
- Active-Build authorization and the collaboration visibility hierarchy are
  centralized.
- Admin and Principal Broker organization-wide access and downward-only audience
  restriction are represented in the authorization model.
- Restricted posts return metadata-free placeholders.
- Human publication creates the initial post revision, audience snapshot,
  references, initial Action Items, audit event, and notification fan-out in one
  mutation.
- TipTap composition, authorized tag-option loading, reference hover previews,
  basic nested comments, post reactions, follows, pins, Seen receipts,
  acknowledgements, drafts, and human approval of an agent-prepared post exist.
- The feed exposes list and board presentations for attached Action Items.
- The Convex collaboration domain was split into focused files rather than
  adding more functions to the already-large production proposal module.

## Gap Summary

| Area | State | Severity | Summary |
| --- | --- | --- | --- |
| Delivery traceability | Missing | High | The approved spec and implementation plan were committed with the implementation, but no collaboration tickets or native blocking graph were created. |
| Tenant activation | Incorrect | Critical | A tenant-setting table exists, but the production feed does not read it and no activation mutation enforces `disabled → migration_ready → active`. |
| Human-in-the-loop publication | Incorrect | Critical | Human identity is inferred from a subject-name prefix rather than trusted actor provenance and a single-use approval bound to the complete publication bundle. |
| Typed-reference integrity | Incorrect | Critical | Public mutations trust client-supplied entity IDs and snapshots without proving existence, same-Build ownership, or entity ACL compatibility. |
| Typed-reference disclosure | Incorrect | Critical | Contractor and Homeowner tag results can include material/cost pricing and supplier information they should not receive. |
| Action Item authorization | Incorrect | Critical | Parent-post readability is effectively treated as edit authority for assignment, content, priority, dates, status, checklists, and relationships. |
| Post and thread lifecycle | Missing | High | Editing, immutable subsequent revisions, tombstones, moderation, resolution/reopening, accepted answers, Decision outcomes, blocker dispositions, and announcement expiry are absent. |
| Discussion completeness | Partial | High | Reply creation and bounded logical nesting exist, but focused ancestor/descendant views and comment edit, delete, reaction, pin, and moderation flows do not. |
| Action Item product | Partial | High | Initial items, basic updates, checklists, relationships, assignment acceptance, list, and board exist; the complete Linear-like daily workflow does not. |
| Reference navigation | Partial | Medium | Milestones, Sub-milestones, and Draws receive meaningful focus; several other types only change tabs and Action Items have no production focus handler. |
| Notifications | Partial | High | Initial post publication can create in-app delivery rows; replies, follows, pins, Action Item transitions, reminders, escalation, digests, email, push, and revocation cancellation are not complete. |
| System events | Missing | High | A system-post mutation exists but is not called by Evidence, Site Visit, Milestone, Draw, or Document transitions. |
| Search | Incorrect | High | Search filters only the currently loaded client page; authorized backend keyword/semantic retrieval and required filters do not exist. |
| Assets and attachments | Missing | High | Governed Build assets, versions, upload finalization, scan/quarantine, attachment ACL validation, and publication integration are not implemented. |
| Scheduling, concurrency, and offline | Partial | High | Drafts can store a scheduled timestamp, but no scheduler executes approved bundles and the full revalidation/conflict/offline contract is absent. |
| Role-complete surfaces | Partial | High | The shared production surface covers current lender/builder paths, but the contract is not proven on complete Builder Staff, Homeowner, and Contractor Build routes. |
| Moderation, export, retention, and closure | Missing | High | Hierarchical moderation/appeal, audited exports, legal hold/retention, and explicit Build close/reopen flows are absent. |
| API and webhooks | Missing | High | The required organization-scoped, signed, idempotent event coverage is not implemented for the collaboration lifecycle. |
| Migration and cutover | Partial | Critical | An idempotent legacy-note migration runner exists, but executable parity reporting, activation, rollback control, and evidence of production backfill are absent. |
| Verification depth | Partial | High | Core publication, hierarchy, restricted placeholder, HITL draft, acknowledgement, receipt, feed, and composition tests exist; the highest-risk missing and incorrect paths are not covered. |

## Detailed Findings

### 1. Delivery provenance stopped at documents

The grill-me decisions were captured in the approved Product Contract and
expanded into the original Implementation Plan and Cutover Runbook. They were
not decomposed into independently tracked tracer tickets before implementation.
There is therefore no durable requirement-to-ticket-to-test chain, no native
blocking graph, and no reliable frontier for agents to work.

This gap analysis and the local tracer-ticket set derived from it restore that
delivery spine. They do not replace the original plan or runbook.

### 2. Tenant rollout state is schema-only

`buildCollaborationTenantSettings` models `disabled`, `migration_ready`, and
`active`, but the collaboration read/write path does not enforce the state. The
feed is mounted unconditionally on the production Details surface. There is no
audited activation command, no fail-closed default, and no operational rollback
control matching the Cutover Runbook.

Until this is corrected, the application cannot guarantee that tenants see
collaboration only after migration parity.

### 3. HITL publication is not a trustworthy security boundary

The implementation rejects a publisher when the authenticated subject is empty
or begins with an `agent_` prefix. That is a naming convention, not actor
attestation. An agent or service identity with another subject format and Build
access can be treated as a human.

The implemented approval flow also covers agent-prepared initial posts, not
every shared mutation listed by the Product Contract. The checkpoint does not
present or bind every effective reader, exclusion, reference, attachment,
Action Item, notification, and shared mutation in a single immutable bundle.

### 4. Typed references are client-authored snapshots

Autocomplete can return all approved reference kinds, but publication does not
resolve the submitted type and ID back to a canonical entity. Post and comment
mutations accept client-supplied labels and summaries and persist them without
proving:

- that the entity exists,
- that it belongs to the same Build and tenant,
- that the author can read it,
- that its ACL is compatible with every mandatory post reader,
- that the label/summary came from the canonical record.

This permits forged or cross-Build reference metadata and breaks the audit
contract. Separately, material/cost items are returned to Contractor and
Homeowner autocomplete with pricing and supplier context despite the lower-role
financial restriction.

### 5. Action Item read access is incorrectly used as mutation authority

The Action Item mutation guard establishes that the caller can read the
originating post. It does not establish that the caller is the creator,
assignee, assigning authority, or authorized coordinator. A reader can
therefore mutate fields and transitions that the Product Contract assigns to
specific actors.

The product surface also lacks much of the approved daily-use model:

- creation on an existing post by any authorized reader,
- rich detail view and nested discussion,
- labels, attachments, and multiple typed references,
- one level of first-class child Action Items,
- complete assignment-request and acceptance UX,
- completion acceptance for governed work,
- reminder and escalation policy,
- personal and referenced-entity queues,
- complete activity history and revision reconciliation.

### 6. Post, comment, and moderation lifecycle is absent

The schema anticipates revisions and lifecycle state, but the public command
surface does not implement the approved lifecycle after initial creation.
Missing behaviour includes:

- author editing with immutable revisions and an `Edited` indicator,
- author tombstones,
- hierarchical moderation with reason, notification, audit, and appeal,
- Open/Resolved transitions and reasoned reopening,
- automatic reopening after a reply,
- accepted answers for Questions,
- outcome and owner requirements for Decisions,
- linked work and disposition requirements for Issues/Blockers,
- Announcement prominence expiry.

Comments support parent links and a logical-depth cap, but not the full focused
thread, comment lifecycle, or comment-level reaction/pin behaviour.

### 7. Search and navigation are presentation-level only

The visible search control filters posts already loaded in the browser. It does
not search authorized posts, comments, Action Items, assets, and references on
the server, and it provides none of the required structured or semantic
filters.

Reference chips provide useful previews. Their click behaviour is complete for
only a subset of reference kinds. Several paths change tabs without focusing
the referenced record, and the Action Item path does not open a production
detail view.

### 8. Notifications stop at initial publication

Notification preferences and initial in-app post fan-out exist. The stored
email, push, and digest options do not correspond to implemented delivery
workers. The collaboration mutations do not consistently emit deliveries for:

- mentions in comments,
- followed-thread replies,
- assignment requests and transitions,
- approvals and governed completion,
- Build-wide pins,
- required-acknowledgement reminders,
- overdue escalation.

Future delivery is not demonstrably cancelled and revalidated when access is
revoked.

### 9. Operational integration is not connected

The system-event publisher is isolated from the production mutations that own
Evidence, Site Visit, Milestone, Draw, and Document transitions. Therefore the
shared feed is not yet the canonical operational record promised by the
Product Contract.

Governed collaboration assets, deterministic policy-created Action Items,
scheduling execution, export, retention/legal hold, Build closure/reopening,
and lifecycle webhooks are also not implemented end to end.

### 10. Migration exists without an executable cutover

The note backfill runner preserves the intended basic mapping and idempotency
key, but the repository does not provide an operator workflow that:

1. previews the exact migration without writes,
2. reports Build-by-Build legacy/import parity,
3. verifies one current revision per imported post,
4. verifies the complete role matrix and opaque restricted behaviour,
5. transitions the tenant to `migration_ready`,
6. activates only after parity,
7. disables the surface without deleting collaboration history,
8. records durable evidence that production migration and activation occurred.

The Cutover Runbook is therefore descriptive, not yet executable.

## Verification Gaps

The current tests do not adequately cover:

- canonical reference resolution and cross-Build forgery,
- autocomplete disclosure by every role and entity kind,
- Action Item operation-by-role authorization,
- post/comment editing, revision history, tombstones, and moderation,
- thread resolution, accepted answers, Decision and blocker invariants,
- comment nesting and focused-thread behaviour,
- Action Item dependencies, cycles, acceptance, reminders, and activity bumps,
- notification classification, delivery, digesting, and access revocation,
- system-event wiring from each operational domain,
- attachment ACL and scan/quarantine state,
- tenant activation and rollback,
- migration preview, parity, replay, and failure recovery,
- complete lender, builder, Builder Staff, Homeowner, and Contractor journeys,
- collaboration webhooks, exports, retention, and Build closure.

The production feed test also reports a missing React list key, demonstrating
that a passing test selection is not currently warning-clean.

## Required Delivery Standard

The remediation ticket set must preserve these rules:

1. Each ticket is a narrow, demoable vertical slice spanning the necessary
   authorization, schema, API, UI, audit, and test changes.
2. Security and cutover prerequisites block broad activation and migration.
3. Existing correctly landed behaviour remains green while missing behaviour is
   added.
4. Shared Fluent Convex helpers remain in the shared builder module; domain
   queries and mutations remain in focused collaboration domain files.
5. Every completed ticket updates its requirement-to-test evidence.
6. No ticket is considered complete solely because schema or UI scaffolding
   exists.
7. The Cutover Runbook is executed only after its prerequisites are implemented
   and verified.

## Completion Definition

Build Collaboration is complete only when:

- every Product Contract requirement is implemented or explicitly superseded,
- every tracer ticket and blocking edge is closed,
- the P0 authorization and disclosure tests pass,
- every shared mutation enforces the human/system/agent publication contract,
- every supported role completes its production journey,
- the migration dry run and parity report are deterministic and replay-safe,
- tenant activation and rollback are executable and audited,
- full tests, typechecking, build, UI audit, deployment parity, and production
  smoke checks pass,
- the production cutover evidence is retained with the deployment record.
