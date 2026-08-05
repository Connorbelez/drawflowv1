# Build Collaboration Product Contract

> **Status:** Approved implementation contract
>
> **Approved direction:** Variant A — Familiar Build Feed
>
> **Approved:** July 28, 2026
>
> **Scope:** Production active Builds only. Posts, discussions, references, and
> audiences are entirely Build-local.

## 1. Outcome

The Build Collaboration workspace is the persistent, permission-aware shared
record for everyone involved in a Build: brokerage/lender staff, builders and
builder staff, homeowners, and contractors.

It replaces Public Notes and Internal Notes with one familiar feed while keeping
construction operations—not social engagement—as the governing model. Posts can
reference Build work, host nested discussions, and carry post-scoped Action
Items. Every shared mutation is authorized, revisioned where applicable, and
auditable.

Success is measured by:

- shorter blocker-resolution time,
- shorter evidence-to-approval and milestone/draw approval time,
- fewer decisions and assignments occurring outside DrawFlow,
- fewer overdue Action Items,
- more material decisions with linked Build entities, accountable owners, and
  complete audit history,
- zero cross-audience disclosure incidents.

Post count, comment count, reactions, and time in feed are diagnostic metrics,
not success targets.

## 2. Production Surface

The canonical live-Build shell remains unchanged:

- **Details remains the default live-Build tab.**
- **Build Overview remains unchanged at the top of Details.**
- The approved Familiar Feed renders below Build Overview.
- Capital and Term Requests move into **Build Overview → Draws**.
- The duplicate Milestone Review Board leaves Details; Milestones remains the
  canonical milestone board.
- The duplicate contractor card leaves Details; Contractors remains canonical.
- Documents becomes a first-class live-Build tab.
- Public Notes and Internal Notes are removed from Details after migration.

The feed is not a separate room hierarchy, direct-message system, or generic
cross-Build social product.

## 3. Tenancy, Identity, and Participation

The Build's originating brokerage/lender organization permanently owns the
tenant scope. A Build never moves organizations.

Every collaboration record stores:

- `organizationId`,
- `brokerageId`,
- `buildId`.

WorkOS remains authoritative for users, organization memberships, and
organization roles. DrawFlow owns Build-scoped participation grants for
external and Build-specific roles.

Admin and Principal Broker roles apply across every Build in their
organization. Other access is derived from the user's current organization role
plus their explicit Build relationship or participation grant.

Removed participants lose access and notifications immediately. Their authored
content, revisions, receipts, assets, and audit records remain. Open assignments
become `Unassigned — participant removed`; they are never silently reassigned.
A reinvitation creates a new participation period without rewriting history.

## 4. Permission Hierarchy

The visibility hierarchy is:

1. Admin
2. Principal Broker
3. Broker / Builder / Broker Staff
4. Builder Staff / Homeowner
5. Contractor

A post author may restrict visibility only downward from the mandatory audience
implied by their effective Build role:

- a lower-tier participant cannot hide a post from a peer or higher tier,
- a Contractor post is always visible upward,
- Homeowner is fixed at the Builder Staff tier,
- a custom audience cannot remove mandatory higher-tier readers.

The effective Build visibility tier is the highest active role held by the
human. Capabilities still require the specific permission authorizing the
operation, and audit events record which role was exercised.

Dynamic policy audiences are evaluated against current access. Fixed custom
audiences retain their selected membership, subject to current Build and entity
authorization. Publication-time resolved readers are stored for audit only and
are never an authorization cache.

Restricted posts retain their chronological feed slot but reveal only
`Restricted update`. The placeholder exposes no author, audience, timestamp,
references, counts, reason, or other metadata. Restricted content is completely
absent from search, filters, counts, autocomplete, exports, notifications, and
AI retrieval.

## 5. Posts and Lifecycle

Human and system posts share one canonical post model.

Human post intents are:

- **Update** — the default, with no special resolution requirement.
- **Question** — the author or coordinator may accept one reply as the answer;
  accepting resolves the thread.
- **Decision** — requires a concise outcome and decision owner before
  resolution; the resolved outcome is revision-controlled and prominent.
- **Issue / Blocker** — requires a linked entity or Action Item and a recorded
  disposition before resolution.
- **Announcement** — coordinating roles only; may expire from prominence while
  remaining in history.

Threads are Open or Resolved. The author or an authorized coordinator can
resolve a thread. A new reply automatically reopens it and records the actor.
Reopening otherwise requires a reason. Thread resolution never changes Action
Item or referenced-entity state.

Authors can edit their own posts and comments. Every edit creates an immutable
revision and the UI displays `Edited`. Deletion is a soft tombstone. Admin
moderation and hierarchical moderation require a reason and retain revisions,
attachments, references, and audit history.

## 6. Discussions, Following, Reactions, and Receipts

Replies support unlimited logical nesting but only three visual indentation
levels. Deeper replies flatten visually with `Replying to` context. A focused
thread view exposes ancestors and descendants. Replies cannot be reparented,
moved, or split.

Following rules:

- authors automatically follow their posts,
- commenters automatically follow after participating,
- mentioned people and Action Item assignees automatically follow,
- other readers can follow or unfollow,
- unfollowing cannot suppress mandatory assignment, approval, compliance, or
  blocker notifications,
- losing access removes the follow and all future notifications.

Posts and comments support:

- Acknowledged,
- Agree,
- Question.

Reactions are intentional communication visible to the full post audience. They
do not count as approval, acceptance, resolution, Action Item completion, or
formal acknowledgement, and they do not bump the thread.

Seen markers store first-view timestamp and latest viewed revision. Receipt
visibility flows only up the hierarchy: a participant can see receipts from
their own tier or lower, never from a higher tier. Only an Admin peer can see an
Admin receipt. A new revision marks the content unread without erasing the
historical receipt.

Formal required acknowledgement is separate from Seen and reactions.
Authorized coordinators can require acknowledgement on Decisions,
Announcements, and compliance-critical Updates, with named recipients or
eligible roles and an optional deadline. Acknowledgement confirms receipt only;
it is not approval or agreement. Reminders, escalation, waivers, withdrawals,
and timestamps are audited.

## 7. Typed References and Rich Content

The `@` index contains authorized, same-Build:

- participants,
- Milestones,
- Sub-milestones,
- Draws,
- Evidence Packages and Evidence Assets,
- Site Visits,
- Documents,
- Materials,
- Action Items.

Non-person references are immutable type-and-ID nodes. Hovering exposes a rich
current-state preview. Clicking deep-links to the relevant page and focused
entity, or opens the existing entity detail sheet. One canonical post projects
onto every referenced entity's collaboration/activity view; no post is copied.

A primary reference is optional for a manual Build post, automatic for posts
created on an entity surface, and required for system posts. Primary context
affects card headline, deep link, grouping, and notification wording only; it
never grants access.

References can only narrow access through the referenced entity's ACL. A
reference that would exclude a mandatory higher-tier reader is blocked before
publication. Person mentions never grant access and notify only existing
readers.

Archived referenced entities remain available through read-only detail.
Renames are displayed live while audit history preserves former labels.
Referenced entities cannot be hard-deleted.

TipTap content supports structured text, headings, lists, checklists,
blockquotes, code snippets, validated links, governed images/files, and typed
`@` nodes. Pasted content is normalized. Arbitrary HTML, scripts, iframes,
tracking pixels, data URLs, and uncontrolled embeds are rejected. Canonical
TipTap JSON and derived plain text are stored.

## 8. Assets

Uploads cannot exist as orphan post blobs. Every upload becomes one of:

- a general Build collaboration asset,
- a typed and versioned Document,
- an Evidence Asset linked to an Evidence Package, Milestone, or
  Sub-milestone.

The maximum visibility inherits the post audience and intersects the referenced
entity ACL. Replacement creates a new asset version. Detaching an asset from a
post does not destroy its audited record.

Files are quarantined until malware scanning completes. Quarantined files
cannot be downloaded or attached to evidence.

## 9. Action Items

Any reader of a post may create an Action Item on it. The originating post is
immutable. One Action Item may reference multiple same-Build entities and is
projected into post, personal, Build, and entity queues rather than copied.

Action Items support:

- rich-text title and description,
- status and priority,
- creator and assignee,
- due date and labels,
- attachments and Build references,
- dependencies, related, and duplicate relationships,
- nested discussion and full activity history,
- acceptance requirements,
- list, board, personal, and entity views,
- one level of first-class child Action Items,
- lightweight, non-assignable checklists.

Software-team abstractions such as cycles, sprints, story points, and software
project roadmaps are excluded.

The canonical workflow is:

`To do → In progress → In review → Done`

Exceptional states are:

- **Blocked** — requires a reason and may name a dependency; unblocking restores
  the preceding active state.
- **Cancelled** — terminal until the creator or authorized coordinator reopens
  it with a reason.

`Assignment requested` is an assignment-acceptance condition, not a status.
Overdue is computed from the due date.

Assignment rules:

- a participant may directly assign self, same tier, or lower tier,
- upward assignment creates `Assignment requested`,
- the higher-tier participant must accept,
- coordinating roles may reassign laterally or downward with audit history,
- assignment never changes the parent audience.

Ordinary items can be marked Done by the assignee and reopened by the creator or
higher-tier coordinator with a reason. Upward requests, approvals, evidence
work, site-visit remediation, and draw blockers require acceptance: the
assignee moves the item to In review and the assigner or responsible authority
accepts Done.

Due dates are optional for ordinary work and required for approval, evidence,
site-visit remediation, and draw-blocking items. Policy-derived due dates can be
overridden only with authorization and a reason. Reminders occur before, at,
and after the deadline. Overdue work escalates without automatically changing
assignment, audience, or state.

Dependencies are same-Build only, cycle-free, and permitted only when every
reader of the dependent item can read the blocker. A later permission conflict
suspends the relationship for coordinator repair without deleting its audit
history.

## 10. Pins, Saves, Ordering, and Search

Admin, Principal Broker, Broker, Builder, Broker Staff, and Builder Staff can
create Build-wide pins. All participants can create private saves. The author or
an authorized Build-wide pinner may pin a reply. Pins never widen visibility.

The default feed order is latest meaningful activity. A thread bumps for:

- a new comment,
- Action Item creation, assignment, status change, or completion,
- a material linked-entity state change surfaced into the thread.

Views, follows, personal saves, reactions, and edits do not bump. Build-wide
pins appear separately. The UI shows original and latest activity timestamps
and offers an optional Newest posts sort.

Search is entirely Build-local. It supports authorized keyword and semantic
search across posts, comments, Action Items, assets, and references, with
filters for type, author, assignee, entity, status, audience policy, date,
resolution, and attachment presence. Search authorization occurs before
retrieval and ranking.

Only a personal Action Item queue may aggregate a participant's assigned work
across Builds. Posts, comments, references, search, and threads never cross
Builds.

## 11. System Events, Automation, and Agents

Material operational transitions create immutable, discussable system posts:

- evidence submitted, rejected, or completed,
- Site Visit scheduled, rescheduled, completed, or flagged,
- Milestone submitted, approved, rejected, or blocked,
- Draw submitted, approved, released, or returned,
- governing Document added or superseded.

Each upstream transition carries an idempotency key. Retries do not duplicate
posts. Distinct material transitions remain separate records and may be
visually grouped. Non-material changes remain audit-only.

Deterministic lender policy and explicit workflow rules may automatically
create idempotent system Action Items. AI-inferred or ad hoc Action Items remain
drafts until a human approves publication.

An agent may draft and prepare every publication operation but cannot publish.
Publishing means any shared mutation, including posts, comments, Action Items,
assets, audience/reference changes, pins, acknowledgement requirements,
resolution, or notifications.

The HITL checkpoint displays the final atomic publication bundle: content,
effective readers and exclusions, references, attachments, Action Items,
notifications, and shared mutations. A material change invalidates approval.
The approving human is always the author. Agent involvement is retained only as
internal drafting provenance.

Deterministic system events and pre-authorized workflow automation are authored
by the system and do not require HITL.

## 12. Notifications

In-app notifications are canonical.

Immediate notifications include:

- direct mentions,
- assignments and assignment requests,
- followed-thread replies,
- approval, evidence, Site Visit, and Draw blockers requiring authority,
- Build-wide pins.

General feed activity is bundled into configurable digests. Email is enabled by
default for direct and critical events. Push is opt-in where supported. SMS is
excluded initially.

Users may mute ordinary notifications but not compliance-critical assignments
or approvals. Notification previews include only content the recipient can
currently read. Access revocation immediately cancels future delivery.

Notification and publishing limits are generous and burst-tolerant. They exist
to stop abuse and runaway automation, not ordinary Build coordination.

## 13. Drafts, Scheduling, Concurrency, and Offline Work

Drafts autosave privately and are visible only to their human owner and an agent
acting for that human. Drafts may stage content, audience, references,
attachments, and Action Items without creating shared records or
notifications.

Coordinating roles may schedule Updates and Announcements. Human approval of the
complete scheduled bundle is the HITL checkpoint. At execution, membership,
hierarchy, audience, entity ACLs, and revisions are revalidated. A material
conflict pauses publication for renewed approval.

Shared mutable records carry expected revisions. Stale writes are rejected; the
UI presents the latest state and the user's draft for reconciliation. Comments
append rather than overwrite. Stale Action Item board moves snap back with
actor context.

Offline mode supports private drafts, camera capture, and attachment staging.
Reconnect revalidates access and revisions before publishing. It never fabricates
timestamps, notifications, receipts, assignments, or shared state.

Feed pagination is cursor-based with stable latest-meaningful-activity ordering.
Real-time updates do not move the reader's scroll position. New activity above
the viewport appears behind a control. Deep links hydrate the focused post and
surrounding context. Revoked content is removed from loaded state and caches
immediately.

## 14. Moderation, Export, Retention, and Build Closure

Moderation follows the hierarchy:

- authors may tombstone their own content,
- Admin may moderate any content,
- Principal Broker may moderate lower tiers,
- Broker, Builder, and Broker Staff may moderate lower tiers,
- Builder Staff may moderate Contractor content,
- Homeowner and Contractor cannot moderate others.

Moderation preserves the record, requires a reason, notifies the author, and
supports appeal to the next tier.

Export rules:

- Admin and Principal Broker: full Build archive,
- Broker, Builder, and Broker Staff: bulk export of authorized content,
- Builder Staff and Homeowner: individual visible threads/assets only,
- Contractor: individual contractor-visible assets only.

Exports are audited, capture an ACL snapshot, use expiring links, and omit
restricted placeholders.

Build completion does not immediately lock collaboration. Admin or Principal
Broker explicitly closes the Build after open Action Items are completed,
cancelled, or waived. Closed Builds are read-only but remain searchable and
exportable to authorized users. Reopening requires Admin or Principal Broker,
a reason, and audit history.

Retention follows the tenant's regulatory policy. Legal hold prevents purge.

## 15. API and Webhooks

Application interfaces and webhooks enforce the same Build scope, RBAC,
hierarchy, entity ACL, optimistic concurrency, and HITL rules as the UI.

Webhooks cover:

- post and comment publication,
- thread resolution/reopening,
- Action Item transitions,
- asset versions,
- moderation.

Seen receipts are excluded by default. Payloads contain identifiers and
metadata; authorized consumers fetch bodies and assets through the application
interface. Webhooks are organization-scoped, signed, idempotent, and replayable.

