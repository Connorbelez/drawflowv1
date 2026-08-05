# Homeowner Workspace v1 Product Specification

## Problem Statement

Homeowners currently lack a first-class authenticated workspace for following and participating in their Build. The existing Homeowner Portal concept is a narrow, read-only publication surface, while the Builder and Backoffice experiences are gaining a shared Build Collaboration system that holds the actual conversation, questions, Action Items, attachments, and participant activity around a live Build.

That split would force homeowners into a secondary communication channel, duplicate collaboration state, and make the builder responsible for manually republishing information that already exists in governed Build state. It would also make it difficult for homeowners to ask questions, upload context, follow progress, or receive accountable responses without falling back to email and text messages.

The product needs an authenticated Homeowner Workspace that makes the existing social collaboration feature the homeowner's primary place to interact and view Build activity. It must provide useful progress, schedule, document, commercial, and participant context without exposing lender-internal information or granting homeowners authority over lender, construction, or financing workflows.

## Solution

Create a first-class Homeowner Workspace for authenticated members of the originating brokerage organization who hold the new `homeowner` organization role and an explicit assignment to the requested Build.

The workspace has two entry levels:

- A homeowner portfolio landing surface for people assigned to multiple Builds, showing only authorization-safe status and attention signals.
- A Build-scoped Homeowner Workspace whose default Home surface directly embeds the same Build Collaboration interface used by Builder and Backoffice workspaces.

The collaboration interface is reused unchanged in v1. There is no homeowner-specific feed, fork, presentation variant, ranking model, or parallel social data model. Existing collaboration controls are shown or omitted according to the homeowner's effective capabilities.

The Build-scoped workspace provides these supporting views around the Home collaboration surface:

- Progress
- Schedule
- Documents & Media
- Costs & Decisions
- People

These supporting views are read-only, role-filtered projections of canonical Build state in v1. Homeowners ask questions, request corrections, and coordinate work through entity-linked collaboration posts and Action Items. Dedicated governed submission flows may remain available where the homeowner already has explicit authorization, but the workspace does not create a second mutation path for canonical Build records.

Homeowners are full collaboration authors. They may write freeform posts and comments, react, upload authorized attachments, reference authorized Build entities, mention eligible participants, edit or tombstone their own content, report visible content, and create permitted Action Items. Their content does not require Builder preapproval. They cannot moderate other participants or access lender-internal content.

Every homeowner-authored post is visible to all co-homeowners assigned to the Build and to mandatory authorized Builder and Backoffice/Lender readers. Eligible Contractors participate only when explicitly included and currently authorized through an active Build assignment covering the relevant scope. The workspace does not provide direct messages or private homeowner-to-builder conversations in v1.

The existing limited private-link Homeowner Portal becomes a read-only Share View for unprovisioned guests. It is not the primary homeowner experience and never permits posting or other mutations.

## User Stories

1. As a homeowner, I want to authenticate with my own identity, so that my activity is attributable and auditable.
2. As a homeowner, I want my brokerage organization membership to carry a distinct Homeowner role, so that DrawFlow can give me an explicit, understandable capability set.
3. As a homeowner, I want access only to Builds to which I am explicitly assigned, so that organization membership does not expose unrelated customers or projects.
4. As a homeowner assigned to Builds in multiple brokerage organizations, I want each organization membership and Build assignment evaluated independently, so that tenant boundaries remain intact.
5. As a homeowner with multiple Builds, I want a portfolio landing page, so that I can enter the correct project without guessing from URLs.
6. As a homeowner with one Build, I want to enter that Build directly, so that I do not have to pass through an unnecessary portfolio step.
7. As a homeowner, I want each portfolio card to show safe status, unread activity, my next appointment, open Action Items, and the latest published progress, so that I can prioritize attention quickly.
8. As a homeowner, I want the collaboration feed to be the default Home surface, so that the place where I view the Build is also the place where I interact.
9. As a homeowner, I want the same collaboration interface used by Builder and Backoffice participants, so that everyone communicates through one shared record.
10. As a homeowner, I want to create a freeform post without Builder preapproval, so that I can raise any question, update, or concern relevant to my Build.
11. As a homeowner, I want to comment and reply within existing conversations, so that context is not lost across separate channels.
12. As a homeowner, I want to use the shared collaboration reactions available to my role, so that I can communicate acknowledgement or sentiment without creating unnecessary replies.
13. As a homeowner, I want reactions to remain non-binding, so that an Agree reaction is never mistaken for a commercial, construction, or lender approval.
14. As a homeowner, I want to edit my posts and comments, so that I can correct mistakes while retaining immutable revision history.
15. As a homeowner, I want to remove my own content through a tombstone, so that the visible feed reflects my intent without destroying audit history.
16. As a homeowner, I want to report visible content, so that an authorized Builder or Backoffice moderator can review a concern.
17. As a homeowner, I want ordinary reports to preserve the reported content until a moderator acts, so that reporting cannot be abused as unilateral deletion.
18. As a homeowner, I want confirmed malicious attachments quarantined, so that the shared workspace remains safe.
19. As a co-homeowner, I want all homeowner-authored collaboration on our Build visible to me, so that one homeowner cannot create a hidden parallel record.
20. As a homeowner, I want authorized Builder and Backoffice participants to be mandatory readers of my posts, so that questions and issues reach accountable project participants.
21. As a homeowner, I want Contractors excluded by default, so that they see my post only when I explicitly include an eligible Contractor.
22. As a homeowner, I want only actively assigned Contractors with authorized scope to be selectable, so that former or unrelated Contractors cannot receive Build information.
23. As a homeowner, I want no direct-message feature in v1, so that Build communication remains shared, searchable, and auditable.
24. As a homeowner, I want to mention eligible co-homeowners, Builder participants, and authorized Backoffice participants, so that I can direct attention within the shared record.
25. As a homeowner, I want to mention an eligible Contractor only when their active assignment authorizes the referenced scope, so that mentions cannot leak unrelated Build information.
26. As a participant, I want mentions to notify only people who can already view the post and every referenced object, so that a mention never grants access.
27. As a homeowner, I want to reference authorized Milestones, appointments, documents, quotes, Cost Documents, selections, change orders, and other homeowner-visible Build entities, so that conversations retain precise context.
28. As a homeowner, I want restricted typed references omitted from selection, search, notifications, and retrieval, so that hidden metadata cannot leak through collaboration tooling.
29. As a homeowner, I want to attach photos and files from desktop or mobile, so that I can share context directly in the Build conversation.
30. As a homeowner, I want collaboration attachments scanned and authorized at every view or download, so that storage URLs never become authorization credentials.
31. As a Builder or Backoffice participant, I want homeowner-posted files to remain collaboration assets until explicitly promoted or linked into Evidence, Cost Documents, or canonical Documents, so that an informal upload cannot silently mutate governed Build records.
32. As a homeowner, I want any dedicated governed submission flow for which I am authorized to remain distinct, so that formal submissions retain their validation and audit requirements.
33. As a homeowner, I want to create Action Items assigned to myself, so that I can track my own commitments.
34. As a homeowner, I want to assign permitted Action Items to the Builder or Builder Staff, so that requests have accountable owners and due dates.
35. As a homeowner, I want to assign an Action Item to an actively assigned Contractor included in the post audience, so that field coordination can be tracked without exposing unrelated Contractors.
36. As a homeowner, I want to request Backoffice or Lender attention, so that an authorized staff member can claim or convert the request into a governed workflow.
37. As a lender-side participant, I want homeowners prevented from assigning authoritative approval, compliance, Draw-release, or funding obligations to lender roles, so that collaboration cannot bypass lender governance.
38. As a homeowner, I want homeowner-safe Milestone start and completion events to appear automatically, so that routine progress does not depend on manual republication.
39. As a homeowner, I want homeowner-visible schedule changes and upcoming appointments to appear automatically, so that I can prepare for relevant activity.
40. As a homeowner, I want newly published documents and media to appear automatically, so that the feed reflects information intentionally shared with me.
41. As a homeowner, I want my Action Item status changes to appear automatically, so that accountable work remains visible.
42. As a lender-side participant, I want automatic homeowner events generated only from an explicit safe allowlist, so that internal workflow state cannot leak through system posts.
43. As a homeowner, I want lender comments, lender policy limits, working-capital analysis, interest calculations, internal evidence review, geofence details, risk flags, approval deliberation, and internal Draw state excluded, so that I see only homeowner-authorized information.
44. As a homeowner, I want the Progress view to show an understandable projection of homeowner-visible Milestones and published progress, so that I can understand where the Build stands.
45. As a homeowner, I want the Schedule view to show homeowner-visible construction dates and appointments, so that I can understand what is expected next.
46. As a homeowner, I want the Documents & Media view to collect files explicitly shared with me, so that I do not have to rediscover them in old conversations.
47. As a homeowner, I want the Costs & Decisions view to show explicitly shared quotes, Cost Documents, selections, change orders, and homeowner obligations, so that I can understand the project's commercial context.
48. As a homeowner, I want commercial records to be read-only in v1, so that viewing or discussing an item cannot create a binding decision accidentally.
49. As a homeowner, I want to discuss or request a correction from any supporting view through an entity-linked collaboration post, so that every conversation returns to the shared Build record.
50. As a participant, I want each supporting view to reuse canonical Build state, so that the homeowner experience cannot drift into a parallel project model.
51. As a homeowner, I want the People view to show names, Build roles, approved company or trade labels, avatars, and approved contact actions, so that I know who is involved.
52. As a participant, I want personal contact details, organization membership details, permissions, internal titles, availability, assignment economics, performance data, and lender-only metadata hidden unless explicitly shared, so that the People view respects privacy.
53. As a homeowner, I want an in-app unread inbox, so that relevant Build activity does not disappear in a busy feed.
54. As a homeowner, I want immediate email for mentions, replies, assigned Action Items, direct Builder or Backoffice posts, access changes, and appointment changes, so that time-sensitive activity reaches me.
55. As a homeowner, I want routine automatic progress and general activity delivered through a configurable daily digest, so that notifications remain useful rather than noisy.
56. As a homeowner, I want notification links to reauthorize me when opened, so that an old notification cannot preserve revoked access.
57. As a participant, I want notification subjects and previews to contain only safe projected content, so that restricted information cannot leak outside DrawFlow.
58. As a homeowner, I want to manage my permitted notification preferences, so that I can control ordinary delivery without suppressing mandatory assignments or critical notices.
59. As a homeowner on a phone, I want a responsive workspace and camera/file upload, so that I can participate without switching to a desktop.
60. As a homeowner, I want post and comment drafts preserved locally, so that navigation or a temporary connection loss does not destroy my work.
61. As a homeowner, I want failed uploads to retry safely, so that an unreliable mobile connection does not require starting over.
62. As a homeowner, I want publishing, commenting, Action Item mutation, and upload completion to require a confirmed connection in v1, so that the product does not pretend an uncommitted offline mutation succeeded.
63. As a homeowner, I want a closed Build to become a read-only archive, so that I can retain an accessible project record without changing completed work.
64. As a homeowner, I want to search and download content still authorized under the Build's retention policy, so that the archive remains useful.
65. As an authorized Builder or Backoffice participant, I want to reopen collaboration with an audited reason, so that exceptional post-close coordination remains governed.
66. As a Builder or Backoffice participant, I want to invite a homeowner by person-bound email to the originating brokerage organization and a specific Build, so that access cannot be transferred through a shareable authenticated invite.
67. As a homeowner, I want my WorkOS organization membership to persist even if my final Build assignment is revoked, so that memberships are never silently removed as an access-control side effect.
68. As an administrator, I want WorkOS organization membership removed only as part of explicit account deletion, so that DrawFlow never automatically removes members.
69. As an administrator, I want revoking a Build assignment to remove workspace access and future notifications immediately, so that durable organization membership does not imply durable Build access.
70. As an auditor, I want revoked homeowners' authored content, revisions, attachments, receipts, and audit events preserved, so that history is not rewritten.
71. As a homeowner, I want an invitation to reuse my existing WorkOS identity and organization membership when present, so that duplicate users and memberships are not created.
72. As an administrator, I want WorkOS to remain authoritative for users, organization memberships, roles, and role assignments, so that product flows do not write directly to webhook-owned projections.
73. As a homeowner without an authenticated workspace invitation, I want an authorized private Share View when a Builder provides one, so that I can read explicitly published information without gaining mutation access.
74. As an administrator, I want private Share View tokens to remain hashed, scoped, revocable, rate-limited, and audited, so that the fallback surface is safe.
75. As a homeowner, I want understandable loading, empty, restricted, revoked, and unavailable states, so that authorization failures do not expose internal diagnostics.
76. As an administrator, I want every Homeowner Workspace read and mutation organization-scoped and Build-authorized, so that no cross-tenant or cross-Build access is possible.
77. As a Builder or Backoffice user, I want homeowner participation to use the same Build Collaboration graph I already use, so that no synchronization or duplicate moderation process is required.
78. As a product owner, I want the v1 collaboration interface reused unchanged, so that Homeowner Workspace delivery does not become an unbounded social UI redesign.

## Implementation Decisions

- Add `homeowner` as a recognized WorkOS organization role. WorkOS remains authoritative for the role, user, organization membership, and role assignment.
- A Homeowner Workspace request requires both an active `homeowner` organization role in the originating brokerage organization and an active explicit assignment to the requested Build. Either condition missing fails closed.
- Organization membership is durable. DrawFlow must never remove a WorkOS membership because a Build assignment is revoked, expires, or becomes inaccessible. Membership removal occurs only as part of an explicit account-deletion workflow.
- Homeowner invitation and provisioning use a WorkOS-first management flow that creates or reuses the user, creates or reuses the organization membership, adds the `homeowner` role without stripping other roles, and records the returned external identifiers on DrawFlow assignment metadata. Webhooks or explicit directory synchronization remain the only writers to WorkOS projection tables.
- Authorized Builder and Backoffice roles may invite Homeowners in v1. Homeowners cannot self-register into a Build, reuse a shareable authenticated invitation, or invite other Homeowners.
- The Homeowner organization role grants capabilities but no resource access by itself. Explicit Build assignment is the resource relationship and may coexist across multiple Builds or brokerage organizations.
- The authenticated route family consists of a homeowner portfolio entry and a Build-scoped Homeowner Workspace. A single eligible Build may route directly to its Build Home surface.
- The Build-scoped navigation is Home, Progress, Schedule, Documents & Media, Costs & Decisions, and People.
- Home is the default surface and embeds the existing shared Build Collaboration component directly. The component, feed presentation, interaction patterns, sorting, filtering, and visual design are unchanged in v1.
- Do not fork, clone, wrap with a homeowner-specific behavior variant, or create a parallel collaboration store. Capability gates determine which existing controls render.
- Homeowners are human collaboration authors. Their ordinary content is not subject to Builder preapproval or topic restrictions beyond shared safety, authorization, and file-policy enforcement.
- The existing collaboration lifecycle remains authoritative: immutable revisions, tombstone removal, auditable moderation, reporting, reactions, receipts, thread state, follows, notifications, and Action Items.
- Homeowners cannot moderate other participants. Authorized hierarchical moderators may moderate Homeowner content with a reason and retained audit history. Homeowners may report content without automatically hiding it.
- Co-homeowners assigned to the same Build are mandatory peer readers. Homeowners cannot exclude peers or mandatory authorized Builder and Backoffice/Lender readers.
- Contractors are optional readers. They may be included only when actively assigned to the Build and authorized for every referenced entity, attachment, and Action Item scope.
- V1 has no direct messages or private homeowner-to-builder conversations. All Homeowner collaboration is Build-scoped, searchable, exportable according to policy, and auditable.
- Mentions and recipient selection never grant access. Every recipient is reauthorized against the current Build, audience, entity references, and attachment ACLs before notification or delivery.
- Supporting views are read-only projections in v1. They compose canonical Build records and do not introduce homeowner-owned copies of Milestones, schedules, documents, costs, participants, or commercial records.
- Contextual actions from supporting views create or open entity-linked collaboration conversations. The supporting views do not gain independent comment systems.
- Homeowner-posted files remain governed collaboration assets unless an authorized actor explicitly promotes or links them into Evidence, Cost Documents, or canonical Documents. Promotion preserves source-post provenance and does not rewrite the original collaboration record.
- Dedicated governed submission flows may remain available where already authorized. They are not replaced by attachments or freeform collaboration.
- Homeowners may assign Action Items to themselves, Builder participants, Builder Staff, and eligible active Contractors included in the post audience. They may request Backoffice/Lender attention, but cannot assign authoritative lender obligations or mutate lender workflow state.
- Safe system events use an explicit allowlist. V1 may automatically project Homeowner-visible Milestone starts/completions, safe schedule changes, appointments, published documents/media, and Action Item updates.
- Raw lender-internal data never serializes into the Homeowner Workspace, collaboration projection, notifications, search, exports, autocomplete, or AI retrieval. This includes lender comments, policy limits, working-capital analysis, interest calculations, internal evidence review, geofence details, risk flags, approval deliberation, and internal Draw state.
- Project-commercial information is distinct from lender-financing information. The Costs & Decisions view may show explicitly shared quotes, Cost Documents, selections, change orders, and Homeowner obligations, while lender financing remains excluded.
- Binding commercial decisions are not supported in v1. Comments, reactions, acknowledgements, Action Items, and discussion cannot accept a quote, approve a selection, acknowledge a change order as binding, or commit an obligation.
- The People projection exposes only Build-relevant fields intentionally approved for Homeowner visibility. Contact actions must not reveal unshared personal details.
- Notifications reuse the shared collaboration notification and delivery model. In-app unread state and email ship in v1; push is deferred.
- Immediate email applies to mentions, replies, assignments, direct Builder/Backoffice posts, access changes, and appointment changes. Routine safe events and general activity use configurable digest delivery.
- Notification generation, preview rendering, opening, retry, and replay reauthorize against current access. Revocation cancels queued deliveries and prevents deep-link access.
- V1 is responsive and supports mobile camera/file selection, durable local drafts, and retryable uploads. Mutations require a confirmed connection; there is no offline mutation queue or reconciliation engine.
- Closing a Build makes Homeowner collaboration read-only but does not revoke the Build assignment or WorkOS membership. Authorized reopening requires a reason and audit event.
- Revoking a Build assignment immediately removes all Homeowner Workspace access and future notifications while preserving authored records. It does not remove organization membership.
- The existing private-link Homeowner Portal is retained as a limited read-only Share View. It uses the same safe projection boundary but has no collaboration mutations and is not the primary Homeowner experience.
- Existing Build Collaboration restricted-placeholder behavior remains unchanged. Unauthorized content is absent from search, filters, counts, autocomplete, exports, notifications, and retrieval; where the shared feed intentionally preserves chronology, it exposes only the metadata-free restricted placeholder defined by the collaboration contract.
- Existing issue #40 is a v2 design/prototype dependency, not a v1 blocker. V1 does not redesign the social collaboration interface.

## Testing Decisions

- Tests assert external behavior and security boundaries rather than component internals, database helper calls, or incidental markup. The main acceptance seam is an authenticated Homeowner request flowing through WorkOS role resolution, explicit Build assignment, the Homeowner Workspace route, and the shared Build Collaboration API/component.
- Prefer one end-to-end Homeowner Workspace workflow over separate synthetic seams: provision a Homeowner role and Build assignment, enter the workspace, read safe projections, create collaboration content and an allowed Action Item, verify Builder/Backoffice visibility, verify Contractor exclusion/inclusion, verify lender-internal non-disclosure, revoke the Build assignment, and verify immediate access and notification loss while WorkOS membership remains.
- Extend the existing Build Collaboration participant browser workflow rather than creating an unrelated Homeowner-only harness. Exercise desktop and mobile viewports because mobile participation and upload are v1 requirements.
- Add route-level tests for zero-Build, single-Build, multi-Build, wrong-organization, missing-role, missing-assignment, pending-invitation, revoked-assignment, closed-Build, and account-deletion states.
- Add WorkOS management-adapter contract tests proving user/membership reuse, additive `homeowner` role assignment, returned identifier persistence, webhook-owned projection writes, and the invariant that assignment revocation never removes organization membership.
- Add authorization matrix tests proving that the `homeowner` role alone grants no Build access and a Build assignment without the role grants no Homeowner Workspace access.
- Extend existing Build Collaboration model tests for mandatory co-homeowner, Builder, and Backoffice readers; optional active Contractor readers; prohibited custom private audiences; and recipient reauthorization.
- Extend existing collaboration mutation tests for Homeowner post/comment creation, reactions, edits, tombstones, reports, attachments, entity references, mentions, follows, and permitted Action Items.
- Test that Homeowners cannot moderate other users, create coordinating-only operations, assign lender-governed obligations, or mutate canonical Build state through collaboration.
- Add request-time file authorization tests for upload, preview, download, edit, promotion/linking, assignment change, Build revocation, and Build closure.
- Add projection contract tests that serialize every Homeowner Workspace view, system event, notification preview, export, search result, autocomplete result, and retrieval payload and fail if any lender-internal field appears.
- Add safe-event allowlist tests proving eligible events publish automatically and non-allowlisted lender or evidence events produce no Homeowner content or metadata.
- Add supporting-view tests proving Progress, Schedule, Documents & Media, Costs & Decisions, and People are read-only, role-filtered projections and that contextual discussion opens the shared entity-linked collaboration flow.
- Add commercial-boundary tests proving visible quotes, selections, change orders, and obligations remain non-binding and that reactions, acknowledgements, comments, or Action Items cannot change authoritative status.
- Extend collaboration notification tests for immediate versus digest classification, preview redaction, recipient authorization, access-change delivery, queued-delivery cancellation, and deep-link reauthorization after revocation.
- Add archive tests proving Build closure produces read-only access, preserves search/download according to retention policy, rejects mutations, and allows only authorized audited reopening.
- Add regression coverage proving the same shared collaboration component continues to serve Builder and Backoffice workspaces without changed behavior or presentation.
- Browser acceptance requires fresh-context review and manual mobile/desktop QA in addition to automated tests because this feature introduces a new role-gated workspace and responsive navigation shell.

## Out of Scope

- Any redesign, reordering, new filtering, ranking, or visual enhancement of the shared social collaboration interface.
- Homeowner-specific forks, variants, copied components, or parallel collaboration data models.
- The design/prototype work tracked by issue #40; it is deferred to v2.
- Binding quote acceptance, selection approval, change-order approval, obligation confirmation, electronic signatures, or other legally or operationally binding Homeowner decisions.
- Homeowner authority over Milestone completion, Evidence approval, Site Visits, Draw review, lender policy, funding, or fund release.
- Lender financing visibility, including working-capital analysis, policy limits, interest, risk, internal review, approval deliberation, and internal Draw state.
- Direct messages, private Homeowner-to-Builder conversations, or audiences that hide Homeowner content from co-homeowners or mandatory authorized readers.
- Homeowner self-registration, shareable authenticated invitations, or Homeowner-managed invitations.
- Push notifications.
- Full offline mutation synchronization, conflict resolution, or background upload completion without a confirmed connection.
- Automatic promotion of collaboration uploads into Evidence, Cost Documents, or canonical Documents.
- New per-tab discussion systems or mutations of canonical Build records from read-only supporting views.
- Automatic WorkOS organization-membership removal for assignment revocation, Build closure, inactivity, or retention expiry.
- Replacement of the limited read-only private Share View.

## Further Notes

- This specification supersedes the earlier framing of Homeowner Portal v1 as the primary Homeowner product. The authenticated Homeowner Workspace is primary; the token-based Portal survives only as a read-only Share View.
- The approved Build Collaboration Product Contract remains authoritative for shared post lifecycle, visibility hierarchy, revisions, moderation, Action Items, typed references, notifications, exports, retention, and restricted placeholders except where this specification explicitly adds the Homeowner organization-role and workspace requirements.
- The product vocabulary should distinguish Homeowner Workspace, Homeowner organization role, Build–Homeowner assignment, and Homeowner Share View. “Portal” should not be used for the authenticated workspace.
- The originating brokerage organization remains the tenant owner of every Homeowner Workspace record and Build Collaboration record.
- The highest-value implementation strategy is to extend existing WorkOS provisioning, Build Collaboration authorization, shared feed, participant-revocation, notification, and participant E2E seams rather than adding a parallel Homeowner subsystem.
- UI/UX enhancement work remains intentionally deferred to v2. The v1 Homeowner shell must still be responsive, accessible, role-safe, and built from existing shared primitives, but it does not reopen the approved social collaboration interface.
