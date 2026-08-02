# Action-Item Collaboration Landscape

**Product context:** DrawFlow V1 active Build collaboration and construction-draw workflow  
**Research date:** 2026-08-02  
**Evidence rule:** only official vendor documentation and product/developer material is used. A capability is **verified** only when explicitly described in a cited first-party source. A DrawFlow recommendation is a product inference, not a claim about an existing implementation.


## Why this scan

The selected DrawFlow Action Item experience is not a generic task list. It has to coordinate a homeowner, contractor, builder, manager, lender, inspector, and supporting documents without allowing the operational discussion to silently redefine the work, evidence, budget, or draw decision.

This scan looks for transferable interaction and domain patterns across construction-management, field-issue, and construction-lending products. It is intended for inspiration and domain modeling, not UI copying.

## Living decision record

This section is the maintained record of product and architecture decisions made after the initial research scan. It separates **confirmed decisions** from **working proposals** so the note never turns an exploratory recommendation into an approved implementation mandate.

### Confirmed decisions

#### Action Item collaboration contract

- An Action Item has a title-first detail experience. Its rich TipTap work description is the canonical body, and the composer and detail sheet read and write that same document and references.
- The compact List/Kanban card stays concise: title, preset tags, one accountable assignee, age, unread activity count, and conditional due-date/dependency/blocked indicators. Kanban is the default; each viewer's most recent List/Kanban choice is browser-local.
- The Action Item detail is a URL-addressable, non-modal side sheet over an interactive board. It has its own scroll and sticky header, supports local back/forward history while following linked Action Items, and becomes full-screen on narrow screens.
- The creator owns the task definition (title, tags, canonical brief, due date, and dependencies). The creator and assignee may move permitted status; managers have an auditable override. Comments, replies, reactions, mentions, and governed uploads are detail-only collaboration affordances.
- Brief edits use a dedicated task-definition revision boundary. An unrelated status or assignment mutation must not produce a false description conflict; a genuinely stale definition save must still fail clearly and preserve the losing editor's unsaved content for retry/copy.
- Comments, replies, assignments, mentions, dependency-unblocked events, and material workflow events can create actionable unread state. Opening detail marks eligible visible activity as read for that viewer. Reactions and a viewer's own activity do not increase unread count.
- Tags are global preset taxonomy only for now. Dependencies are Build-local, directed, cycle-safe, editable from either end, and gate Done until unresolved prerequisites are cleared. Blocked is a first-class board state and requires a visible reason; Cancel is non-destructive and restorable.

#### Cross-domain navigation and authority

- Collaboration is not the system of record for a milestone, draw, evidence decision, site visit, or schedule change. It may reference those records and launch their authoritative surfaces.
- A relevant surface anywhere in DrawFlow can open an entity's canonical mutable interface. A link from collaboration is a navigation affordance; the destination sheet performs live authorization and exposes only its domain's real commands.
- Canonical entity interfaces use URL-addressable side sheets, not blocking modals. The shell is consistent (identity, status, key actions, authorization, activity/references, back/close); the operational body remains entity-specific.
- Current schemas are not treated as protected territory. When a clearer and more extensible canonical model is warranted, DrawFlow may migrate core models rather than preserve pivot-era boundaries through permanent adapters.

### Working architecture proposal — pending explicit approval

Do **not** add a universal entity table and do **not** simply place a sheet compatibility layer over every current record. The proposed end state is:

1. Retain distinct canonical aggregates for genuinely different business concepts: Milestone/Sub-milestone, Planned Draw, Draw Request, Evidence Package, Evidence Asset, Site Visit, Action Item, and Informational Reminder.
2. Introduce one typed `BuildEntityRef` protocol for cross-surface navigation and one typed relationship-edge model for meaningful links between aggregates.
3. Make entity sheets, Calendar, Timeline, collaboration, inbox, and reminders routing/projection surfaces over those records—never competing stores of operational state.
4. Resolve current accidental overlaps before the sheet layer becomes ubiquitous: ambiguous `draw` records, presentation-synthesized Evidence Packages, duplicated schedule history, stringly calendar targets, timeline-owned mutations, and demo timeline tables overlapping production concepts.
5. Migrate tenant-by-tenant through idempotent shadow backfill, invariant comparison, a single-authority cutover with compatibility projections, and retirement. Do not retain indefinite bidirectional synchronization.

### Entity-sheet registry posture

The initial registry under consideration is Action Item, Sub-milestone, Milestone, Draw Request, Evidence Package, and Site Visit. Evidence Assets remain preview-first within their owning package; Material/Equipment and Schedule Change stay contextual unless they acquire an independent lifecycle, authorization model, and audit history. This registry is a discussion starting point, not implementation scope.

### Open questions for the next brainstorm

1. Approve, reject, or adjust the canonicalization-and-migration proposal above.
2. Define the typed relationship vocabulary and distinguish display-only links from links that affect command eligibility or workflow blocking.
3. Confirm the first entity-sheet registry after the canonical ownership boundary is approved.
4. Specify shared-sheet history/URL semantics across nested linked entities and entry contexts.

## Executive takeaways

The strongest transferable patterns are:
Autodesk Construction Cloud: a typed, access-checked reference graph connecting issues/RFIs to files, sheets, photos, forms, assets, schedules, and related work.
Fieldwire: one field-work object can coordinate quality, inspection, safety, RFI, progress, and evidence—without turning its text body into proof.
Built and Rabbet: Action Items may surface operational blockers around a draw, but draw approval, policy gates, budget truth, and audit evidence remain owned by their dedicated lending workflows.
TrustPoint: human collaboration and machine workflow events should share a timeline but remain distinct domain objects.
Recommended DrawFlow model: keep BuildActionItem, activity/read state, assets/evidence, Draw Requests, and dependency edges as separate but typed and linked domains. That gives us a real foundation for your Action Item UI instead of a generic task board.
[COMPLETE] The research baseline is complete, using official Autodesk, Fieldwire, Built, Rabbet, and TrustPoint material only. It gives us a clean source set for the next domain-modeling and interface-inspiration pass.

1. **Use one durable work object with typed references.** Autodesk Issues and RFIs can reference files, sheets, photos, forms, assets, other issues/RFIs, schedule data, and related records. That supports a link graph rather than document copies or isolated comments. [Autodesk: About Issues](https://help.autodesk.com/view/BUILD/KOR/?guid=Issues_About&l=ENG) [Autodesk: Create an RFI](https://help.autodesk.com/cloudhelp/ENG/Build-Rfis/files/work-rfis/Create_RFI.html)
2. **Keep the workflow record and the finance record connected.** Built, Rabbet, and TrustPoint each document draw-centric workflows where requests, documents, reviews/approvals, budgets, inspections, and/or service orders are connected rather than handled through email and spreadsheets. [Built: lender solution](https://getbuilt.com/solutions/lenders/) [Rabbet: budget monitoring](https://rabbet.com/lenders/solutions/budget-monitoring) [TrustPoint: API documentation](https://developer.trustpoint.ai/)
3. **Model state, responsibility, and visibility separately.** Autodesk gives Issues configurable categories/types, fields, assignees, watchers, dates, and permissions; its RFI workflow distinguishes creation, review, answer, and closure. This reinforces DrawFlow's decision to keep a canonical task definition, accountable assignee, watchers/participants, and an activity stream as distinct concepts. [Autodesk: About Issues](https://help.autodesk.com/view/BUILD/KOR/?guid=Issues_About&l=ENG) [Autodesk: Work with RFIs](https://help.autodesk.com/cloudhelp/ENG/Build-Rfis/files/Work_RFIs.html)
4. **Treat auditability as a natural by-product of work.** Built explicitly positions time-stamped, attributed draw, inspection, approval, and document history as the audit record. In DrawFlow, every policy-relevant Action Item mutation should therefore emit a durable event; the conversation timeline should not be the sole source of truth. [Built: construction-loan monitoring](https://getbuilt.com/blog/construction-loan-monitoring-software/)

## Verified product patterns

### 1. Autodesk Construction Cloud: a cross-tool issue/reference graph

**Verified.** Autodesk Build Issues are used to track and communicate problems through the construction lifecycle. They include preconfigured or configurable categories and types, default/custom attributes, root cause, and configurable permissions. Issues may be created from sheets/files as markups and referenced from RFIs, submittals, and assets. [Autodesk: About Issues](https://help.autodesk.com/view/BUILD/KOR/?guid=Issues_About&l=ENG) [Autodesk: Create Issues](https://help.autodesk.com/cloudhelp/ENG/Build-Issues/files/Issues_Create.html)

**Verified.** Autodesk's Issue form includes description, assignee, watchers (members, roles, or companies), location, due/start dates, attachments, and references to other tools; mobile supports photo capture and file attachment. [Autodesk: Issues on mobile](https://help.autodesk.com/cloudhelp/ENG/Build-Issues/files/issues-on-autodesk-construction-cloud-mobile-app/Issues_Mobile_iOS.html)

**Verified.** Autodesk RFIs use a workflow that can span draft, submission, review, answering, and closure. An RFI can reference files, sheets, photos, submittals, issues, schedule, assets, forms, and other RFIs, while the selection of the ``ball in court`` assigns the next responsible reviewers. [Autodesk: Work with RFIs](https://help.autodesk.com/cloudhelp/ENG/Build-Rfis/files/Work_RFIs.html) [Autodesk: Create an RFI](https://help.autodesk.com/cloudhelp/ENG/Build-Rfis/files/work-rfis/Create_RFI.html)

**Verified.** Autodesk’s export surfaces include activity logs, comments, references, and official response attachments for RFIs; As-built exports can include linked issues, RFIs, files, forms, photos, and references. [Autodesk: Export RFIs](https://help.autodesk.com/cloudhelp/ENU/Build-Rfis/files/work-rfis/Export_RFIs.html) [Autodesk: As-built export](https://help.autodesk.com/cloudhelp/ENG/Docs-Admin/files/project-administration/handover/asbuilt-export-build.html)

**DrawFlow recommendation.** Treat references as typed, permission-checked edges from an Action Item to a Build asset, document, draw, milestone, action item, or participant—not copied content embedded independently in each object. Preserve an immutable reference snapshot in the action history when a workflow decision relies on it.

**UI/workflow pattern to adapt.** The side-sheet detail should make references first-class, with a compact collapsed summary and an expanded list where each related item can be opened in the sheet. This directly supports the approved “open linked Action Item” history behavior without taking users away from the board.

### 2. Fieldwire: one task can carry field evidence and multi-purpose work

**Verified.** Fieldwire describes its Tasks as a project-wide work-tracking mechanism for QA/QC, inspections, punch work, safety, RFIs/change orders, progress, delays, coordination, and general communication. Tasks can be placed directly on plan sheets; attachments can include progress photos, forms/files, and cropped plans showing an exact location. [Fieldwire: Introduction to Tasks](https://help.fieldwire.com/hc/en-us/articles/360003458332-Introduction-to-Tasks)

**DrawFlow recommendation.** Do not create a separate “issue,” “comment,” “request,” and “field evidence” system for each collaboration use case. Keep the Action Item as the operational coordination object, then relate it to typed domain records when it escalates into a draw exception, inspection finding, document request, or milestone decision.

**UI/workflow pattern to adapt.** Add a clearly named location/reference affordance when plans, photos, or inspection evidence are linked. Avoid pretending a generic task body is itself proof of physical progress; present verified evidence as a distinct, traceable relationship.

### 3. Built and Rabbet: draw approval as a connected evidence, policy, and budget flow

**Verified.** Built documents centralized draw workflows, documentation, approvals, policy checks, inspection ordering/tracking, borrower status visibility, and a complete audit trail. Its partner API documents draw files and the ability to link an inspection to a draw, with a same-loan validation before creating the relationship. [Built: lender solution](https://getbuilt.com/solutions/lenders/) [Built: partner API](https://partners.getbuilt.com/)

**Verified.** Built describes a centralized record in which draw requests, budget validation, inspection reports, lien waivers, approvals, and exception flags are timestamped and attributed, and says that required-document gaps can prevent a draw from progressing. This is a vendor description of Built’s product behavior. [Built: construction-loan monitoring](https://getbuilt.com/blog/construction-loan-monitoring-software/)

**Verified.** Rabbet documents budget-to-draw reconciliation, over-draw alerts, interest-reserve monitoring, retainage release, and cost-to-complete monitoring. It also states that it classifies documents into an audit-ready record. [Rabbet: budget monitoring](https://rabbet.com/lenders/solutions/budget-monitoring)

**DrawFlow recommendation.** An Action Item may block a Draw, but it must not itself become the loan-control record. Model the link explicitly, e.g. ``ActionItem -> affects -> DrawRequest`` and ``ActionItem -> evidencedBy -> BuildEvidenceAsset``. A Blocked Action Item can signal an operational dependency; a policy gate on a draw must remain enforced by the draw state machine and append an audit event.

**UI/workflow pattern to adapt.** When an Action Item is tied to a draw, show a small provenance row: linked draw, current decision state, decisive document/evidence, and latest responsible reviewer. Keep this as a structured projection, not free-form text pasted into the brief.

### 4. TrustPoint: events and service orders are integration-grade domain objects

**Verified.** TrustPoint’s public API exposes projects and draw requests, including draw status and workflow timestamps. It documents outbound draw events for creation, submission, review, approval, return, and deletion. [TrustPoint: API documentation](https://developer.trustpoint.ai/)

**Verified.** TrustPoint documents service-order REST endpoints and webhook events for ordering, completion, and cancellation across inspection, title, appraisal, and other service types. [TrustPoint: API documentation](https://developer.trustpoint.ai/)

**DrawFlow recommendation.** Introduce a generic, auditable ``BuildServiceOrder`` only when DrawFlow actually begins provider orchestration. Until then, Action Items should reference an existing Site Visit/inspection or document workflow rather than imitate a service-order lifecycle in the collaboration UI.

**UI/workflow pattern to adapt.** Show event-derived state as read-only system activity (“inspection ordered”, “review returned”, “draw approved”) alongside human comments, but style it distinctly. This lets unread counts remain actionable without counting reactions or passive system noise.

## Proposed domain map for DrawFlow

The following is a **DrawFlow recommendation**, synthesized from the patterns above and the approved Action Item product contract.

| Domain object | Owns | Must not own |
|---|---|---|
| `BuildActionItem` | Task definition, preset tags, creator, assignee, status, due date, blocked reason, dependency edges, canonical brief | Draw approval, budget truth, raw asset bytes, participant access grants |
| `ActionItemActivity` | Human comment/reply/reaction, state-change record, assignment event, system-event projection | The canonical brief or authorization truth |
| `ActionItemReadState` | Per-viewer last-seen activity cursor/version | Global notification state |
| `BuildCollaborationAsset` | File metadata, storage linkage, Build visibility, publication/audit record | Independent Action Item permissions |
| `BuildEvidenceAsset` / `SiteVisit` | Field/evidence provenance, capture and review data | Conversation semantics |
| `DrawRequest` | Draw approval/rejection/release and policy gates | Ad-hoc task management |
| `ActionItemDependency` | Build-local directed prerequisite edge and cycle prevention | A replacement for formal draw or milestone dependency rules |

### Non-negotiable invariants

These are **DrawFlow recommendations** for the production implementation:

- All Action Item references and dependencies must remain Build-local and access-checked.
- The creator owns task-definition fields; the assignee can execute through permitted status changes and collaboration, not silently rewrite the brief.
- A genuinely stale brief submission must not silently overwrite the canonical definition. It fails clearly and leaves the editor’s unsaved content recoverable client-side; unrelated workflow metadata changes must not create that conflict.
- Reactions are visible timeline detail but do not create unread work; comments/replies, mentions, assignments, dependency-unblocked events, and material state changes may do so.
- Dependencies block completion but should not fabricate a Blocked status: an authorized user explicitly records the reason for an operational block.
- Cancel is non-destructive and restorable to the prior active state; history remains auditable.
- Every lifecycle mutation writes a durable activity/audit event. UI unread counters are a projection of eligible events, never the audit ledger.

## UI patterns worth validating next

All items below are **DrawFlow recommendations**:

1. **Reference composer in the rich brief.** Keep the existing collaboration editor’s mention/reference grammar, but render typed links in a compact token form; opening a linked Action Item swaps the non-modal sheet and adds to local sheet history.
2. **Split the compact card from the operational detail.** The card should expose title, preset tags, assignee, age, unread count, and conditional due/dependency indicators. The sheet owns full brief, relationship detail, audit/activity, attachments, and permissions-aware controls.
3. **Use a relationship summary before disclosure.** Collapsed dependency rows show chips and overflow. Expanded rows become readable item lines with open and remove controls, so dense graphs stay scannable without hiding management actions.
4. **Differentiate human activity from authoritative workflow events.** Comments feel conversational; status transitions, draw/policy facts, and service/inspection events need a structured system-event treatment with actor/time/provenance.
5. **Keep background context live.** The approved non-modal sheet over an interactive Kanban preserves spatial context. The URL should identify the selected Action Item, while List/Kanban preference stays browser-local as agreed.

## Sources examined

- [Autodesk Build — Issues](https://help.autodesk.com/view/BUILD/KOR/?guid=Issues_About&l=ENG)
- [Autodesk Build — Create Issues](https://help.autodesk.com/cloudhelp/ENG/Build-Issues/files/Issues_Create.html)
- [Autodesk Build — Issues on mobile](https://help.autodesk.com/cloudhelp/ENG/Build-Issues/files/issues-on-autodesk-construction-cloud-mobile-app/Issues_Mobile_iOS.html)
- [Autodesk Build — Work with RFIs](https://help.autodesk.com/cloudhelp/ENG/Build-Rfis/files/Work_RFIs.html)
- [Autodesk Build — Create an RFI](https://help.autodesk.com/cloudhelp/ENG/Build-Rfis/files/work-rfis/Create_RFI.html)
- [Autodesk Build — Export RFIs](https://help.autodesk.com/cloudhelp/ENU/Build-Rfis/files/work-rfis/Export_RFIs.html)
- [Autodesk Build — As-built export](https://help.autodesk.com/cloudhelp/ENG/Docs-Admin/files/project-administration/handover/asbuilt-export-build.html)
- [Fieldwire — Introduction to Tasks](https://help.fieldwire.com/hc/en-us/articles/360003458332-Introduction-to-Tasks)
- [Built — Solutions for Lenders](https://getbuilt.com/solutions/lenders/)
- [Built — Partner API Documentation](https://partners.getbuilt.com/)
- [Built — Construction Loan Monitoring](https://getbuilt.com/blog/construction-loan-monitoring-software/)
- [Rabbet — Budget Monitoring](https://rabbet.com/lenders/solutions/budget-monitoring)
- [TrustPoint — API Documentation](https://developer.trustpoint.ai/)

## Boundary

This is a research note. It does not change production product behavior, authorize copying vendor interfaces, or establish a compliance/legal interpretation. Lending, inspection, construction-payment, and document-retention controls require jurisdiction-specific review before being positioned as policy enforcement.
