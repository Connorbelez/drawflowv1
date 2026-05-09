# Vertical 11 — Operations Queues, Notifications, and Chat

## I. Actual agile epic / Linear project

### Objective

Build the operational convenience layer: work queues, optional kanban visualization, notifications, and chat/comments. These features improve usability but must not become authoritative workflow state.

### Technology alignment

Work queues, notifications, and chat are implemented on top of Convex projections and actions.  The queue projection reads domain events from the outbox and materialises `WorkItem` documents in Convex collections.  The frontend uses React 19, TanStack Router, and TanStack Query to display queues and issue actions.  Notifications are delivered via Sonner in the client and via webhook/email integrations (future) triggered by Convex functions.  Chat threads are stored in Convex and rendered with shadcn/Base UI components.  Chat attachments use the same file storage pipeline as evidence assets and can be promoted to evidence through governed commands.  All interactions must use `fluent-convex` actions and respect RBAC defined in the Foundation vertical.

### In scope

- Work item / work order projection.
- Queue/table view for lender operations.
- Optional kanban presentation.
- Notifications for required actions.
- Chat/comment implementation reuse.
- Entity-scoped chat threads.
- Chat attachments as ordinary attachments unless promoted to evidence.

Additional responsibilities:

- **Receipt confirmation work items.**  After a draw release is recorded, the builder lead must confirm receipt of funds or report a discrepancy.  Unconfirmed receipts should appear as work items in the operations queue so that operations staff can follow up.  These items remain open until the builder confirms receipt or reports an exception through the draw release workflow.

### Out of scope

- Drag/drop state mutation bypassing governed transitions.
- Chat-driven approvals.
- Chat as audit replacement.
- Complex SLA automation.
- Analytics dashboard.
- Contractor work orders.

### Definition of done

1. Submitted claims, site visits, and ready draw releases appear as work items.
2. Queue filters by type/status/assignee/build.
3. Kanban, if used, is visual only; final state transitions invoke governed actions.
4. Notifications are emitted from domain events.
5. Chat can be scoped to Build/milestone/claim/draw release.
6. Chat messages do not change workflow state.
7. Chat attachments are not evidence unless explicitly promoted to `EvidenceAsset`.
8. Tests cover queue projection updates, notification triggers, and chat/evidence separation.
9. Tests cover receipt confirmation work items: when a draw release is recorded, a `receipt_confirmation` work item is created; when the builder confirms or reports an exception, the work item is closed; unauthorized users cannot modify receipt state.

---

## II. PRD for this vertical

### Context

Lender operations needs a way to see what needs attention. Kanban can be a nice visualization, but the domain object is a work item/work order, not a kanban card. Workflow transitions must go through the governed transition service.

Chat is a convenience feature. It should improve collaboration without weakening decision provenance.

### Requirements

#### Work queues

Work items should be created/projected from domain state:

- completion claim needs review,
- more info requested,
- site visit requested/assigned/submitted,
- completion ready for decision,
- draw group ready for release,
- manual release awaiting record,
- revision awaiting approval.

#### Kanban visualization

If implemented, kanban columns map to work item statuses. Dragging should be disabled or should open an action modal that invokes the proper governed transition.

#### Notifications

Notifications should be event-driven:

- builder notified when more info requested,
- verifier notified when claim submitted,
- site visitor notified when assigned,
- admin notified when draw ready,
- downstream MIC/webhook refresh handled separately.

#### Chat

Chat is communication, not state.

Rules:

- “Looks good” in chat is not approval.
- Attachments in chat are not evidence until promoted.
- Important decisions use state-changing controls tied to transition commands.
- Chat is entity-scoped.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Domain events | Foundation | Queue/notification projection |
| Work item actions | Queue UI | Module transition endpoints |
| Chat attachment promotion | Chat | Evidence vertical |

---

## III. Spec

### 1. Work item model

```ts
export type WorkItemType =
  | 'completion_claim_review'
  | 'more_info_response'
  | 'site_visit'
  | 'completion_decision'
  | 'draw_release_approval'
  | 'manual_release_recording'
  | 'revision_approval'
  | 'receipt_confirmation';

export type WorkItemStatus =
  | 'open'
  | 'claimed'
  | 'blocked'
  | 'waiting_on_builder'
  | 'waiting_on_site_visit'
  | 'ready_for_admin'
  | 'closed';

export interface WorkItem {
  id: Id<'WorkItem'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  type: WorkItemType;
  status: WorkItemStatus;

  entityType: string;
  entityId: string;

  title: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';

  assignedToUserId?: UserId;
  dueAt?: ISODateTime;

  createdFromDomainEventId: DomainEventId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  closedAt?: ISODateTime;
}
```

### 2. Queue projection rules

```text
completion_claim.submitted -> create completion_claim_review work item
completion_claim.more_info_requested -> create waiting_on_builder work item
completion_claim.more_info_submitted -> reopen/route review work item
site_visit.requested -> create site_visit work item
site_visit.assigned -> assign site_visit work item
site_visit.submitted -> close site_visit item; create/reopen completion_decision item
draw_group.ready_for_release -> create draw_release_approval item
draw_release.approved -> create manual_release_recording item
draw_release.recorded -> close release work items
revision.submitted -> create revision_approval item
draw_release.recorded -> create receipt_confirmation item
```

### 3. Notification model

```ts
export interface Notification {
  id: Id<'Notification'>;
  tenantOrgId: TenantOrgId;
  recipientUserId: UserId;
  buildId?: BuildId;

  type:
    | 'claim_submitted'
    | 'more_info_requested'
    | 'site_visit_assigned'
    | 'completion_approved'
    | 'completion_rejected'
    | 'draw_ready_for_release'
    | 'draw_release_recorded';
    | 'receipt_confirmation_requested'
    | 'receipt_confirmed'
    | 'receipt_exception';

  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: ISODateTime;
  readAt?: ISODateTime;
}
```

### 4. Chat model

```ts
export interface ChatThread {
  id: Id<'ChatThread'>;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;

  scope:
    | { type: 'build'; buildId: BuildId }
    | { type: 'milestone'; milestoneId: MilestoneId }
    | { type: 'completion_claim'; completionClaimId: CompletionClaimId }
    | { type: 'draw_release'; drawReleaseId: DrawReleaseId };

  createdAt: ISODateTime;
}

export interface ChatMessage {
  id: Id<'ChatMessage'>;
  tenantOrgId: TenantOrgId;
  threadId: Id<'ChatThread'>;
  authorUserId: UserId;
  body: string;
  attachmentIds: Id<'ChatAttachment'>[];
  createdAt: ISODateTime;
  editedAt?: ISODateTime;
  deletedAt?: ISODateTime;
}

export interface ChatAttachment {
  id: Id<'ChatAttachment'>;
  tenantOrgId: TenantOrgId;
  uploadedByUserId: UserId;
  fileName: string;
  mimeType: string;
  storageKey: string;
  createdAt: ISODateTime;
  promotedEvidenceAssetId?: EvidenceAssetId;
}
```

### 5. Promotion to evidence

```ts
export interface PromoteChatAttachmentToEvidenceCommand {
  tenantOrgId: TenantOrgId;
  actorUserId: UserId;
  chatAttachmentId: Id<'ChatAttachment'>;
  buildId: BuildId;
  milestoneId?: MilestoneId;
  completionClaimId?: CompletionClaimId;
  purpose: 'completion_verification' | 'site_visit' | 'admin_internal';
  visibility: EvidenceAsset['visibility'];
  correlationId: string;
}
```

Promotion creates a real `EvidenceAsset` and emits `evidence_asset.created`. The chat attachment alone does not satisfy evidence requirements.

### 6. UX rules

```text
- Queue row/card has action buttons: Review, Request More Info, Request Site Visit, Approve Completion, Approve Release.
- Buttons call module transition endpoints.
- Kanban drag is disabled for final/status-changing transitions unless it opens the same action modal.
- Chat panel appears in build/milestone/claim context.
- Chat approvals are visually discouraged; state-changing actions use dedicated controls.
```

### 7. Events

```text
work_item.created
work_item.assigned
work_item.closed
notification.created
chat_message.created
chat_attachment.promoted_to_evidence
```

### 8. Tests

| Test | Expected |
|---|---|
| Claim submitted | Review work item created. |
| Site visit submitted | Site visit item closed; decision item created. |
| Drag card to approved | Not allowed without transition command. |
| Chat message says approved | No domain state change. |
| Chat attachment uploaded | Does not satisfy evidence requirement. |
| Chat attachment promoted | Evidence asset created and can satisfy requirement. |

## IV. Screen and Component Manifest

All screens in this vertical must register their routes via the Foundation route‑module contract.  In practice, the operations queue and kanban live at routes like `/app/:orgSlug/ops/queue` and `/app/:orgSlug/ops/kanban`; the notification centre is implemented as a shell component or side panel attached to the `AuthenticatedLayout`; the chat thread panel is mounted under the build‑scoped path `/app/:orgSlug/builds/:buildId/chat` using `BuildScopedLayout`.  Following the Foundation contract ensures that these screens inherit authentication, tenant context, permissions, and navigation.  The Operations Queues, Notifications, and Chat vertical delivers user interfaces that improve operational efficiency without changing authoritative workflow state.  Work queues surface tasks that require action, notifications alert users when something needs their attention, and chat enables contextual collaboration.  The screens and components below map these capabilities to the requirements and use cases in the PRD.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
|---|---|---|---|
| **`OperationsQueueScreen`** (`/app/:orgSlug/ops/queue`) | `QueueFilterBar`, `WorkItemTable`, `WorkItemRow`, `WorkItemActionsDropdown`, `KanbanToggle` | Displays work items projected from domain events.  Users can filter by type (completion claim review, site visit, draw release, revision approval), status, assignee, or build.  `WorkItemTable` lists items with columns for title, type, priority, due date, assignee, and status; clicking a row opens the relevant screen from its vertical.  `WorkItemActionsDropdown` provides context‑specific actions (e.g., Review, Request More Info, Assign Site Visit) which invoke the proper governed transition endpoints.  `KanbanToggle` switches to the visual kanban presentation. | PRD: Work queues projection (Section II Requirements: Work queues); queue filtering; requirement that drag/drop cannot mutate domain state; mapping of domain events to work items (Spec item 2). |
| **`KanbanBoardScreen`** (alternate view at `/app/:orgSlug/ops/kanban`) | `KanbanColumn`, `KanbanCard`, `ActionModal` | Provides an optional visual representation of work items grouped by status (e.g., Open, Waiting on Builder, Ready for Admin, Closed).  Dragging a card does not directly change status; instead, dropping prompts `ActionModal` to select the appropriate governed action, preserving auditability. | PRD: Kanban visualisation (Section II Requirements: Kanban visualization); ensures state changes still go through controlled actions; definition‑of‑done items 2–3. |
| **`NotificationCenter`** (header/side panel) | `NotificationList`, `NotificationItem`, `NotificationFilter`, `MarkAsReadButton` | Presents a list of notifications generated from domain events.  Each `NotificationItem` shows a title, body, timestamp, and link to the related entity.  Users can filter by type (e.g., claim submitted, site visit assigned, draw ready) and mark notifications as read.  This panel appears in the app shell or as a slide‑in drawer. | PRD: Notifications (Section II Requirements: Notifications); ensures that builders, verifiers, site visitors, and admins are alerted when actions are required; definition‑of‑done item 4. |
| **`ChatThreadPanel`** (contextual panel or `/app/:orgSlug/builds/:buildId/chat`) | `ChatMessageList`, `MessageComposer`, `AttachmentUploader`, `PromoteAttachmentButton`, `ThreadSelector` | Enables contextual conversation scoped to a build, milestone, completion claim, or draw release.  `ChatMessageList` renders messages; `MessageComposer` allows rich‑text entry via TipTap; `AttachmentUploader` uploads files to the chat (not evidence); `PromoteAttachmentButton` promotes an attachment to an `EvidenceAsset` via a governed command; `ThreadSelector` switches between entity‑scoped threads.  Chat does not affect domain state; approvals and other transitions must be performed via dedicated controls. | PRD: Chat rules (Section II Requirements: Chat) — chat is communication only and cannot change workflow state; attachments in chat are not evidence until promoted; definition‑of‑done items 5–7. |

**Component notes:**

- **`WorkItemActionsDropdown`** inspects the `WorkItem.type` and surfaces only the actions permitted by the actor’s role and the current state of the entity.  For example, a `site_visit` item may show Assign or Cancel actions, whereas a `draw_release_approval` item shows Approve Release.  Each action triggers an API call to a governed transition endpoint in the corresponding vertical.
- **`KanbanCard`** displays a concise summary of the work item and includes quick action buttons.  Dragging to another column opens `ActionModal`, which ensures users provide required inputs (e.g., more‑info reason) before the transition occurs.
- **`NotificationItem`** includes subtle icons to differentiate notification types and ensures that clicking the item navigates to the correct screen (e.g., claim review, site visit assignment).  Notification read state is persisted via a mutation.
- **`ChatMessageList`** streams messages in real time via TanStack Query subscriptions or websocket channels.  It groups messages by day and includes user avatars.  Deleted messages show a placeholder indicating deletion.
- **`PromoteAttachmentButton`** triggers the `PromoteChatAttachmentToEvidenceCommand` defined in Spec item 5, converting the uploaded file into a proper `EvidenceAsset` and emitting the `evidence_asset.created` event.

Work queues and chat are auxiliary conveniences; they do not bypass the governed transition service.  All actions surfaced in the queue or kanban view call the underlying APIs in their respective verticals (Verification, Draw Release, Revisions, etc.).  Notification delivery uses Sonner on the client and may later integrate email/webhook channels.  Chat attachments share the evidence file storage pipeline but are not counted toward evidence requirements until promoted.
