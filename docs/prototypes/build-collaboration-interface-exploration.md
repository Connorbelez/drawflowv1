# Build Collaboration Home — Interface Exploration

> **Status:** Variant A approved on July 28, 2026. The route remains a
> throwaway prototype and is not production implementation.
>
> **Prototype:** `/prototype/build-collaboration?variant=A`

## Approval verdict — Variant A approved

The Familiar Build Feed is the approved direction. The validated design keeps
the operational **Build Overview unchanged**, replaces Public and Internal
Notes with one permission-aware collaboration feed, and treats people and Build
work as first-class references. The interactive prototype exercises the
collaboration layer with in-memory data:

- participant role switching and redacted restricted-post placeholders,
- policy-backed audience presets, custom recipients, and effective-recipient
  previews,
- one permission-filtered `@` index for participants, Milestones,
  Sub-milestones, Evidence Packages, Site Visits, Documents, Draws, Materials,
  and live Action Items,
- rich hover previews for non-person references, with clicks dispatching into
  the existing Milestone or Action Item sheet when available and a shared
  entity-detail sheet for the remaining Build entities,
- references that narrow effective recipients to the referenced work's access
  boundary; people tags notify only when that participant already has access,
- feed search, following, mentions, pinned, and assigned-to-me filters,
- persistent-looking posts, post/reply pins, follows, and nested replies,
- post-scoped Action Items with list, detail editor, and draggable kanban views,
- a personal Action Item rail aggregated from posts visible to the selected
  participant.

All prototype mutations intentionally reset on refresh.

## Decisions already locked

- The existing **Build Overview** remains unchanged at the top of the default
  live-build surface.
- Capital and Term Requests move into **Build Overview → Draws**.
- The duplicated Milestone Review Board leaves the default surface; Milestones
  remains its canonical home.
- The duplicated contractor card leaves the default surface; Contractors
  remains its canonical home.
- Documents becomes a first-class live-build tab.
- Public Notes and Internal Notes are retired. Permission-aware collaboration
  replaces both concepts.
- Collaboration supports persistent posts, nested replies, post/reply pinning,
  people and entity mentions, restricted placeholders, and Linear-like Action
  Items attached to each post with list and kanban views.

## Users and callers

The human users are builder principals and staff, homeowners, contractors,
lender admins and staff, brokers, and broker staff participating in a Build.

The software callers are Build Home, Milestones, Materials, Evidence, Site
Visits, Draws, Documents, notification delivery, audit history, search, and
tests. Every record and operation is organization- and Build-scoped.

## Design A — Familiar Build Feed

This design exposes one chronological, permission-aware feed. Domain entities
are mentions and previews inside posts rather than separate conversation
containers.

### Interface

```ts
interface BuildCollaboration {
  read<Q extends CollaborationQuery>(
    query: Q
  ): Promise<QueryResult<Q>>;

  execute(command: CollaborationCommand): Promise<CommandResult>;
}

type CollaborationQuery =
  | { kind: "feed"; organizationId: string; buildId: string; cursor?: string }
  | { kind: "postThread"; organizationId: string; buildId: string; postId: string }
  | { kind: "postActions"; organizationId: string; buildId: string; postId: string }
  | { kind: "mentions"; organizationId: string; buildId: string; query: string };

type CollaborationCommand =
  | { kind: "post.create"; buildId: string; body: RichBody; audience: AudienceIntent; references: EntityRef[] }
  | { kind: "comment.add"; buildId: string; postId: string; parentCommentId?: string; body: RichBody }
  | { kind: "pin.set"; buildId: string; target: PostOrCommentRef; pinned: boolean }
  | { kind: "action.create"; buildId: string; postId: string; input: ActionItemInput }
  | { kind: "action.update"; buildId: string; postId: string; actionItemId: string; patch: ActionItemPatch };
```

### Usage

```ts
const home = await collaboration.read({
  kind: "feed",
  organizationId,
  buildId,
});

await collaboration.execute({
  kind: "post.create",
  buildId,
  body,
  audience: { kind: "allBuildParticipants" },
  references: [
    { kind: "siteVisit", id: siteVisitId },
    { kind: "draw", id: drawId },
  ],
});
```

### What it hides

The interface hides WorkOS membership expansion, entity authorization,
effective-audience calculation, notification filtering, restricted-slot
redaction, cursor ordering, comment-tree materialization, Action Item state
rules, and audit writes.

Replies expose no audience field. Action Items inherit the post audience and
may narrow, but never widen it:

```ts
effectiveReaders(child) ⊆ effectiveReaders(parentPost)
```

### Trade-offs

This has the lowest learning cost and most directly replaces Public/Internal
Notes. The feed is strong for “what happened?” and weak for “show me everything
about this site visit.” Entity chips and filters mitigate that weakness without
introducing more navigation.

Its primary misuse risk is an author overlooking the audience selector.
Audience resolution must therefore stay visible before and after publishing.

## Design B — Explicit Audience Rooms

This design requires the author to enter a policy-backed room before composing.
Privacy is navigation, not a dropdown.

### Interface

```ts
interface BuildRoomCollaboration {
  getRooms(input: BuildScope): Promise<CollaborationRoom[]>;
  getRoomTimeline(input: BuildScope & { roomId: string; cursor?: string }): Promise<RoomTimeline>;
  previewAudience(input: BuildScope & { roomId: string; body: RichBody }): Promise<AudiencePreview>;
  createPost(input: BuildScope & { roomId: string; expectedPolicyVersion: number; body: RichBody }): Promise<Post>;
  addComment(input: BuildScope & { postId: string; parentCommentId?: string; body: RichBody }): Promise<Comment>;
  createAction(input: BuildScope & { postId: string; item: ActionItemInput }): Promise<ActionItem>;
}
```

### Usage

```ts
const rooms = await collaboration.getRooms({ organizationId, buildId });
const room = rooms.find((candidate) => candidate.kind === "lenderBrokerTeam");

const preview = await collaboration.previewAudience({
  organizationId,
  buildId,
  roomId: room.id,
  body,
});

await collaboration.createPost({
  organizationId,
  buildId,
  roomId: room.id,
  expectedPolicyVersion: preview.policyVersion,
  body,
});
```

### What it hides

The module hides room membership calculation, policy versions, historical
access rules, entity/mention validation, audit reconstruction, notification
fan-out, and safe redaction. A comment or Action Item belongs to exactly one
parent post and cannot supply a different room.

### Trade-offs

This is hardest to misuse. The audience is obvious before the author types, and
the model is straightforward to test and audit.

Its cost is fragmentation. A participant may need to inspect several rooms,
cross-team discussions may be duplicated, and unmanaged custom rooms can become
a second organizational hierarchy. Inaccessible rooms should be absent; a
restricted placeholder is only safe inside a thread the viewer can already
access.

## Design C — Contextual Work Graph

This design attaches collaboration to operational entities. Build Home is a
prioritized projection over milestone, material, evidence, site-visit, draw,
and document workstreams rather than the source of truth.

### Interface

```ts
interface ContextualCollaboration {
  project(surface: CollaborationSurface): Promise<CollaborationProjection>;
  execute(command: CollaborationCommand): Promise<{
    affectedIds: string[];
    auditEventId: string;
  }>;
}

type CollaborationSurface =
  | { kind: "buildHome"; buildId: string; attention?: AttentionState[] }
  | { kind: "contextWorkstream"; buildId: string; context: EntityRef }
  | { kind: "thread"; buildId: string; postId: string }
  | { kind: "postActions"; buildId: string; postId: string; view: "list" | "kanban" };

type CollaborationCommand =
  | { kind: "publishPost"; buildId: string; primaryContext: EntityRef; relatedContexts: EntityRef[]; body: RichBody; visibility: AudienceIntent }
  | { kind: "reply"; buildId: string; postId: string; parentCommentId?: string; body: RichBody }
  | { kind: "pin"; buildId: string; target: PostOrCommentRef; scope: PinScope }
  | { kind: "createAction"; buildId: string; postId: string; input: ActionItemInput }
  | { kind: "updateAction"; buildId: string; actionItemId: string; patch: ActionItemPatch };
```

### Usage

```ts
const home = await collaboration.project({
  kind: "buildHome",
  buildId,
  attention: ["decisionRequired", "blocked", "actionDue"],
});

await collaboration.execute({
  kind: "publishPost",
  buildId,
  primaryContext: { kind: "subMilestone", id: inspectionId },
  relatedContexts: [
    { kind: "evidence", id: evidenceId },
    { kind: "siteVisit", id: siteVisitId },
    { kind: "draw", id: drawId },
  ],
  body,
  visibility,
});
```

### What it hides

The module hides graph traversal and deduplication, context-participant
resolution, cross-surface projections, policy intersections, safe mention
rendering, pin scopes, optimistic concurrency, notifications, and audit writes.
The same workstream can be projected from Milestones, Draws, Evidence,
Materials, Site Visits, Documents, and Build Home without copying posts.

### Trade-offs

This creates the strongest operational memory and prevents important decisions
from disappearing into chronology. It is also the most conceptually demanding:
authors must identify the work context, multi-context discussions need a
deterministic primary context, and the projection engine is more complex.

Good defaults—particularly preselecting the context from the surface where the
composer opened—are mandatory to keep this from feeling bureaucratic.

## Comparison

The Familiar Feed has the simplest user interface and a deep two-operation
software boundary. Its failure mode is retrieval and accidental disclosure if
the audience affordance becomes visually secondary.

Audience Rooms make correct privacy behavior easiest and authorization audits
clearest. Their failure mode is fragmented collaboration and duplicated
discussions.

Context Workstreams provide the most reusable domain model and the best answer
to “what is blocking this work?” Their failure mode is front-loading product
complexity onto occasional users such as homeowners and contractors.

All three can support efficient internals. The meaningful divergence is not
implementation effort; it is what users must decide before they can speak:

- Feed: **who should see this?**
- Rooms: **which audience am I speaking inside?**
- Workstreams: **what work is this about?**

## Recommended synthesis to test

Start with the Familiar Feed as the default Build Home interaction, but borrow
two constraints from the other designs:

1. Borrow the Room model’s policy-backed audience presets and visible recipient
   summary. Do not expose raw ACL editing in the composer.
2. Borrow the Work Graph’s typed entity references and reusable contextual
   projections. A post may have a primary context, but Build-level updates do
   not require one.

This preserves the Facebook-style mental model while keeping authorization and
domain retrieval strong. The prototype intentionally keeps the three extremes
separate so this synthesis is earned through comparison rather than assumed.

## Decisions the prototype must settle

1. Should the default experience be one feed, explicit rooms, or workstreams?
2. Is audience selection sufficiently legible in the feed variant?
3. Should a primary domain context be optional, inferred, or required?
4. Where should cross-post Action Items aggregate: personal rail, room summary,
   selected workstream docket, or a future Build-level surface?
5. Should standalone restricted posts appear in shared chronology, or should
   placeholders exist only inside already-visible threads?
