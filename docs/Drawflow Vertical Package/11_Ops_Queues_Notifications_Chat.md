# Vertical 11 — Operations Queues, Notifications, and Chat

## I. Actual agile epic / Linear project

### Objective

Build the operational convenience layer: work queues, optional kanban visualization, notifications, and chat/comments. These features improve usability but must not become authoritative workflow state.

### In scope

- Work item / work order projection.
- Queue/table view for lender operations.
- Optional kanban presentation.
- Notifications for required actions.
- Chat/comment implementation reuse.
- Entity-scoped chat threads.
- Chat attachments as ordinary attachments unless promoted to evidence.

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
  | 'revision_approval';

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
