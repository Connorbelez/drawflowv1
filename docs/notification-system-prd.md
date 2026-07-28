# DrawFlow Notification System PRD

**Product:** DrawFlow  
**Module:** Platform notification inbox and delivery foundation  
**Surfaces:** Shared app shell/header, builder dashboards, backoffice dashboards, proposal workspaces, active build workspaces  
**Document type:** Product Requirements Document  
**Status:** Product draft for implementation scoping  
**Created:** June 24, 2026  
**Primary audience:** Product, engineering, design, backoffice operations, implementation agents  
**Related documents:** `docs/draw_flow_prd.md`, `docs/draw_flow_production_prd.md`, `docs/auth-rbac-foundation.md`, `docs/drawflow-demo/backoffice-site-visits-and-builds-prd.md`

---

## 1. Purpose

DrawFlow needs a notification system that gives each user a relevant, scoped, action-oriented inbox without turning the audit trail into notification noise.

The system must support:

1. Backoffice staff receiving notifications across all builds in their organization.
2. Builders receiving notifications only for relevant proposal, build, milestone, draw, evidence, and site-visit events.
3. A shared app-shell inbox icon and badge.
4. Transactional in-platform notification delivery now.
5. A future channel architecture for email, SMS, and other delivery mechanisms.

The notification system is not the audit history. Audit events remain the authoritative material-history ledger. Notifications are a user-facing delivery/read-state projection over important domain events and workflow outcomes.

## 2. Product Thesis

Notifications should answer:

1. **What requires my attention?** A builder submitted completion, a draw request needs review, a site visit report arrived, or missing information is requested.
2. **What changed that I need to know?** A milestone was approved, a draw was denied, a proposal was approved, or funds were released.
3. **Where do I go next?** Each notification has a direct action URL to the relevant proposal, build, milestone, draw, evidence package, or site visit.
4. **Has someone already handled this?** Action notifications resolve globally when the underlying work is completed, even if individual users have not read them.

This is an action inbox first and an activity feed second. The default experience should prioritize operational work and important outcomes, not every internal event.

## 3. Non-Negotiable Domain Rules

1. DrawFlow v1 remains reimbursement-only. Notification copy must never imply advance funding before work is completed, evidenced, reviewed, approved, and released.
2. Interest starts only after funds are released. Draw-related notification copy must distinguish draw request, draw approval, and draw release.
3. Builder Working Capital Limit remains distinct from Lender Draw Policy Limit. Notification payloads may reference each, but must not collapse them into one generic limit.
4. Lender/backoffice staff can review, inspect, report, and recommend. Principal broker/admin authority remains distinct for final approval/release where configured.
5. Geofence failure must not discard evidence. Location-unverified evidence should create a review notification when operationally relevant.
6. Budget, milestone, draw, evidence, site visit, proposal, and active build notifications must be organization-scoped.
7. Material decisions still write audit events. Notifications do not replace audit events.
8. WorkOS projection tables remain webhook-owned. Notification recipient resolution may read WorkOS projection tables, but must not mutate them.

## 4. Core Decisions

### 4.1 Notification Purpose

Notifications are a scoped action inbox, not a complete activity log.

V1 should create notifications only for events that create action, resolve action, or deliver an important outcome to the opposite side. Do not notify for every audit event or outbox event.

### 4.2 Canonical Record and Delivery Rows

Use one canonical `notifications` row plus per-user `notificationDeliveries` rows.

The canonical notification stores the domain item:

- event type
- category
- title/body/action copy
- proposal/build/milestone/draw/site-visit refs
- severity
- dedupe key
- global resolution state

Each delivery row stores user/channel state:

- recipient
- channel
- read state
- dismissed state
- delivery status

This keeps notification truth separate from per-user read/dismiss behavior.

### 4.3 Channels

Build a channel architecture now, but implement only the in-platform app inbox channel in v1.

Default behavior:

- All v1 notifications deliver through `app_inbox`.
- App inbox delivery is written transactionally in the same Convex mutation as the domain event.
- Future email/SMS delivery must be asynchronous, retryable, and failure-tolerant.

The first abstraction should be a code-level channel strategy registry, not a database channel registry.

Example strategy shape:

```ts
type NotificationChannel = {
  channel: "app_inbox" | "email" | "sms";
  deliver(ctx: MutationCtx, input: NotificationDeliveryInput): Promise<void>;
  resolve?(ctx: MutationCtx, input: NotificationResolutionInput): Promise<void>;
};
```

V1 should register only `appInboxNotificationChannel`.

### 4.4 External Channel Attempts

Future external channels should use separate delivery-attempt records.

- `notificationDeliveries` is the logical per-recipient/per-channel delivery.
- `notificationDeliveryAttempts` records provider attempts, retries, provider message IDs, and errors.
- App inbox does not need attempt rows.

### 4.5 Recipient Materialization

MVP should materialize per-user app-inbox delivery rows.

Backoffice requirement:

- Backoffice notifications go to all active eligible backoffice users in the organization.
- Eligible roles are `admin`, `principle-broker`, `broker`, and `broker-staff`.
- Assignment metadata can prioritize and filter, but does not limit delivery in v1.

Builder requirement:

- Builder notifications go to active users linked to the relevant `builderProfileId`.
- Builder staff permissions should be respected where they already exist for the target build/proposal/resource.

Future optimization may add role/audience deliveries, but v1 should keep read counts, unread counts, tests, and UI simple with explicit per-user rows.

### 4.6 Resolution vs Read State

Resolution and read state are separate.

- `resolvedAt`: underlying work is no longer actionable for anyone.
- `readAt`: this user has seen the notification.
- `dismissedAt`: this user has hidden the notification from their default inbox.
- `archivedAt`: future cleanup/admin retention marker.

Resolving a notification must not mark it read for everyone.

### 4.7 Badge Counts

The app-shell/header badge should count unread, non-dismissed deliveries.

Action-required counts are separate and should count unresolved action-required items.

This means:

- A builder sees a badge for "Draw approved" even if no action is required.
- Backoffice sees a badge for a builder completion submission, and it also appears in action-required.
- If one backoffice user resolves the item, it leaves action-required for everyone but can remain unread in updates for users who never opened it.

### 4.8 Inbox Read Behavior

Opening the inbox should mark the currently visible delivered items as read.

This clears the badge for what the user has actually seen while leaving unresolved action-required work visible until the underlying domain action is complete.

The UI should also support:

- mark read
- mark unread
- dismiss
- dismiss all read/resolved

### 4.9 Preferences

V1 should include a notification preference foundation but no preference UI.

Rules:

- All required operational notifications deliver in-app.
- `action_required` and `warning` are mandatory in-app.
- `status_update` is in-app on by default and may become user-mutable later.
- `system` can become admin-configurable later.

### 4.10 Copy Storage

Store rendered title/body/action copy at creation time plus structured refs.

Do not generate all visible notification copy dynamically from current domain state.

Reasons:

- Notifications remain stable if build, milestone, draw, or proposal names change.
- Inbox queries stay simple.
- Structured refs still support filtering, grouping, and navigation.

### 4.11 Dedupe

Dedupe unresolved notifications by stable domain action key.

Examples:

- `activeBuild:{buildId}:milestone:{milestoneKey}:completion-submitted`
- `activeBuild:{buildId}:draw:{drawKey}:request-submitted`
- `activeBuild:{buildId}:siteVisit:{visitId}:report-submitted`
- `proposal:{proposalId}:submitted`

If an unresolved notification with the same dedupe key exists, update it rather than inserting a duplicate. If the prior notification is resolved, create a new notification for the new lifecycle occurrence.

### 4.12 Explicit Resolution

Domain mutations should explicitly resolve related notifications in the same transaction.

Do not rely on a background reconciler as the primary resolution path.

A future reconciler may repair stale notifications, but the normal path should be deterministic in the state-changing mutation.

## 5. Schema Requirements

This section describes target schema, not an implementation patch.

### 5.1 `notifications`

Canonical notification item.

Recommended fields:

- `brokerageId`
- `organizationId`
- `eventType`
- `category`: `"action_required" | "status_update" | "warning" | "system"`
- `severity`: `"info" | "success" | "warning" | "critical"`
- `requiresAction`
- `title`
- `body`
- `actionLabel`
- `actionHref`
- `dedupeKey`
- `entityType`
- `entityId`
- `proposalId`
- `buildId`
- `builderProfileId`
- `milestoneKey`
- `drawKey`
- `siteVisitId`
- `actorWorkosUserId`
- `actorRoles`
- `assignedBrokerWorkosUserId`
- `payload`
- `resolvedAt`
- `resolvedByWorkosUserId`
- `resolutionEventType`
- `createdAt`
- `updatedAt`

Recommended indexes:

- `by_brokerage_created`: `["brokerageId", "createdAt"]`
- `by_organization_created`: `["organizationId", "createdAt"]`
- `by_dedupe`: `["organizationId", "dedupeKey"]`
- `by_entity`: `["entityType", "entityId"]`
- `by_build`: `["buildId"]`
- `by_proposal`: `["proposalId"]`

### 5.2 `notificationDeliveries`

Per-user/per-channel delivery state.

Recommended fields:

- `notificationId`
- `brokerageId`
- `organizationId`
- `channel`: `"app_inbox" | "email" | "sms"`
- `recipientType`: `"user" | "role" | "builderProfile" | "brokerage"`
- `recipientWorkosUserId`
- `recipientRole`
- `recipientBuilderProfileId`
- `deliveryStatus`: `"delivered" | "queued" | "failed" | "cancelled"`
- `readAt`
- `dismissedAt`
- `archivedAt`
- `createdAt`
- `updatedAt`

MVP writes `recipientType: "user"` and `channel: "app_inbox"` only.

Recommended indexes:

- `by_user_created`: `["organizationId", "recipientWorkosUserId", "createdAt"]`
- `by_user_channel_created`: `["organizationId", "recipientWorkosUserId", "channel", "createdAt"]`
- `by_notification`: `["notificationId"]`
- `by_user_status`: `["organizationId", "recipientWorkosUserId", "deliveryStatus"]`

### 5.3 `notificationDeliveryAttempts`

Future external-channel provider attempt log.

Recommended fields:

- `notificationDeliveryId`
- `brokerageId`
- `organizationId`
- `channel`: `"email" | "sms"`
- `attemptNumber`
- `status`: `"queued" | "sent" | "failed" | "cancelled"`
- `provider`
- `providerMessageId`
- `error`
- `attemptedAt`
- `createdAt`

V1 does not need app-inbox attempt rows.

### 5.4 `notificationPreferences`

Future user/channel/category preference foundation.

Recommended fields:

- `organizationId`
- `workosUserId`
- `appInboxEnabled`
- `emailEnabled`
- `smsEnabled`
- `mutedCategories`
- `mutedEventTypes`
- `createdAt`
- `updatedAt`

V1 should not expose preference UI. Required operational in-app notifications remain mandatory regardless of preferences.

## 6. Notification Service Boundary

Create a shared notification service layer used by domain mutations.

Target functions:

```ts
createNotification(ctx, spec)
resolveNotificationByDedupeKey(ctx, input)
markNotificationDeliveriesRead(ctx, input)
markNotificationDeliveryUnread(ctx, input)
dismissNotificationDelivery(ctx, input)
dismissReadOrResolvedNotifications(ctx, input)
listMyNotifications(ctx, input)
getMyNotificationCounts(ctx, input)
```

The service should:

- enforce tenant scoping
- find or create canonical notification by dedupe key
- resolve recipients
- invoke registered channel strategies
- avoid duplicate delivery rows
- update deliveries when an unresolved notification is bumped
- keep domain mutations small and explicit

## 7. Recipient Resolvers

### 7.1 Backoffice Recipients

Backoffice recipient resolver:

1. Read active `workosOrganizationMemberships` for `organizationId`.
2. Include users with any of:
   - `admin`
   - `principle-broker`
   - `principal-broker` alias normalized to `principle-broker`
   - `broker`
   - `broker-staff`
3. Exclude inactive/deleted/pending memberships unless the product later decides pending invites should receive email only.
4. Return distinct WorkOS user IDs.

V1 backoffice delivery is all eligible backoffice users, even if a build has an assigned broker.

### 7.2 Builder Recipients

Builder recipient resolver:

1. Resolve `builderProfileId` from the proposal or active build.
2. Read active `builderAccountLinks`.
3. Include owner links.
4. Include staff links if they have view permission for the relevant proposal/build/resource, once existing builder-staff permission checks can be reused cleanly.
5. Return distinct WorkOS user IDs.

### 7.3 Actor Exclusion

Default recommendation: include the actor if they are part of the audience only when the notification is an outcome they need to see later. Exclude the actor from opposite-side action notifications they just created.

Examples:

- Builder submits milestone completion: do not notify the builder actor about their own submission; notify backoffice.
- Backoffice approves draw: notify builder recipients; the approving backoffice actor does not need a status update.
- Backoffice site visit requested: notify builder recipients; backoffice users may also get an action item only if the site visit creates internal work.

This rule should be encoded per notification spec, not hard-coded globally.

## 8. V1 Event Taxonomy

V1 should be selective and actionable. Do not create inbox notifications for every audit/outbox event.

### 8.1 Backoffice Audience

| Event | Category | Requires action | Resolves when |
| --- | --- | --- | --- |
| `proposal.submitted` | `action_required` | Yes | proposal approved, rejected, or changes requested |
| `milestone_completion.submitted` | `action_required` | Yes | milestone completion approved or rejected/revision requested |
| `draw_request.submitted` | `action_required` | Yes | draw request approved or rejected |
| `site_visit.report_submitted` | `action_required` | Yes | site visit/report reviewed or related milestone decision completed |
| `evidence.location_unverified` | `warning` | Yes | evidence accepted with override, rejected, or reviewed |
| `facility_change.requested` | `action_required` | Yes | facility change approved or rejected |

### 8.2 Builder Audience

| Event | Category | Requires action | Resolves when |
| --- | --- | --- | --- |
| `proposal.changes_requested` | `action_required` | Yes | builder resubmits proposal or request is otherwise closed |
| `proposal.approved` | `status_update` | No | N/A |
| `proposal.rejected` | `status_update` | No | N/A |
| `active_build.created` | `status_update` | No | N/A |
| `site_visit.requested` | `status_update` | No | site visit completed/cancelled |
| `missing_info.requested` | `action_required` | Yes | missing information submitted/reviewed |
| `milestone_completion.approved` | `status_update` | No | N/A |
| `milestone_completion.rejected` | `action_required` | Yes | builder resubmits completion/evidence |
| `draw_request.approved` | `status_update` | No | N/A |
| `draw_request.rejected` | `action_required` | Yes | builder submits a revised draw request if allowed |
| `draw.released` | `status_update` | No | N/A |
| `facility_change.approved` | `status_update` | No | N/A |
| `facility_change.rejected` | `status_update` | No | N/A |

### 8.3 Non-Notifications

Do not notify for:

- token opened
- user viewed a report
- ordinary audit-only edits
- internal status recalculations
- duplicate "recorded" events that do not change required action
- no-op idempotency events
- webhook delivery attempts

## 9. Active Build Mutation Hooks

Implementation should add notification create/resolve calls to the existing active-build lifecycle mutations.

Target hooks:

- `submitActiveBuildMilestoneCompletion`
  - create backoffice `milestone_completion.submitted`
- `approveActiveBuildMilestone`
  - resolve backoffice completion notification
  - create builder `milestone_completion.approved`
- `rejectActiveBuildMilestone`
  - resolve backoffice completion notification
  - create builder `milestone_completion.rejected`
- `assignActiveBuildSiteVisit` / `scheduleActiveBuildSiteVisit`
  - create builder `site_visit.requested`
- `submitActiveBuildTokenizedSiteVisitReport`
  - create backoffice `site_visit.report_submitted`
- `reviewActiveBuildEvidence`
  - create/resolve evidence warnings and outcomes as applicable
- `requestActiveBuildDraw`
  - create backoffice `draw_request.submitted`
- `approveActiveBuildDraw`
  - resolve backoffice draw-request notification
  - create builder `draw_request.approved`
- `rejectActiveBuildDraw`
  - resolve backoffice draw-request notification
  - create builder `draw_request.rejected`
- `releaseActiveBuildDraw`
  - create builder `draw.released`
- `requestActiveBuildMilestoneInfo`
  - create builder `missing_info.requested`
- `requestActiveBuildFacilityChange`
  - create backoffice `facility_change.requested`
- `reviewActiveBuildFacilityChangeRequest`
  - resolve backoffice facility-change notification
  - create builder approved/rejected outcome

## 10. Proposal Mutation Hooks

Proposal flow uses the same notification system.

Target hooks:

- proposal submission
  - create backoffice `proposal.submitted`
- request changes
  - resolve backoffice proposal submission notification
  - create builder `proposal.changes_requested`
- proposal approval
  - resolve backoffice proposal submission notification
  - create builder `proposal.approved`
- proposal rejection
  - resolve backoffice proposal submission notification
  - create builder `proposal.rejected`
- offline closing / active build creation
  - create builder `active_build.created`

Proposal notifications should use `proposalId` refs and, where applicable, later `activeBuildId` refs.

## 11. UI Requirements

### 11.1 Shared Header Inbox

Add a shared inbox icon to the app shell/header used by builder and backoffice authenticated surfaces.

Header behavior:

- Badge count = unread, non-dismissed deliveries.
- Secondary action count = unresolved action-required deliveries, where space permits.
- Opening the inbox marks the visible page of deliveries read.

### 11.2 Inbox Panel

The inbox panel should be shared across builder and backoffice.

Recommended grouping:

1. Action required
2. Updates
3. Resolved

Recommended filters:

- All
- Action required
- Updates
- Assigned to me
- Unread
- Resolved

Backoffice-specific:

- All-build notifications appear by default.
- `Assigned to me` filters by `assignedBrokerWorkosUserId` or equivalent payload metadata.

Builder-specific:

- Only the builder user's own delivery rows appear.
- Action links route to builder-accessible proposal/build routes.

### 11.3 Row Behavior

Each notification row should show:

- title
- body
- build/proposal context
- event time
- category/status
- resolved state if applicable
- action button/link
- dismiss control

Clicking a notification should navigate to `actionHref`.

### 11.4 Empty States

Empty states should be operational and concise:

- No action required.
- No unread updates.
- No resolved notifications in this filter.

Do not explain notification system mechanics in the UI.

## 12. Query and Mutation API

Recommended public Convex functions:

- `notifications.listMine`
  - paginated
  - filters by category, unread, resolved, dismissed inclusion, assigned-to-me
- `notifications.getMyCounts`
  - unread count
  - unresolved action-required count
- `notifications.markVisibleRead`
  - accepts delivery IDs visible in the opened panel
- `notifications.markUnread`
- `notifications.dismiss`
- `notifications.dismissReadOrResolved`

Recommended internal/shared helpers:

- `createNotification`
- `resolveNotificationByDedupeKey`
- `resolveNotificationsByEntity`
- `resolveNotification`
- `resolveBackofficeRecipients`
- `resolveBuilderRecipients`

All public reads/writes must derive the viewer from auth. Never accept a user ID argument for user authorization.

## 13. Authorization and Tenant Scoping

All notification functions must:

1. Require authentication.
2. Derive `workosUserId` from the authenticated identity.
3. Use `organizationId` from the authenticated organization context.
4. Only return delivery rows for the viewer.
5. Only mutate delivery rows for the viewer, except domain mutations resolving canonical notifications.
6. Ensure canonical notification organization/brokerage scope matches the domain event scope.

Backoffice users still receive all-build notification deliveries, but public inbox reads should not become broad canonical notification queries. The query path is delivery-first: find my deliveries, join their notification rows, then filter/paginate.

## 14. Data Retention

V1 should not delete notifications automatically.

Recommended future cleanup:

- Keep canonical notifications indefinitely enough for operational traceability, or until a configured retention window exists.
- Keep deliveries until dismissed/archived plus retention window.
- Never delete audit events as part of notification cleanup.

## 15. Implementation Order

1. Add schema tables and validators.
2. Add notification service helpers and app-inbox channel strategy.
3. Add recipient resolvers.
4. Add public inbox query/mutations.
5. Add domain mutation hooks for proposal and active build events.
6. Add shared header inbox UI.
7. Add tests for schema/service/dedupe/resolution/read/dismiss/recipient scoping.
8. Add focused route/component tests for builder and backoffice inbox behavior.
9. Run Convex codegen, Convex TypeScript check, unit tests, and build.

## 16. Test Requirements

Convex tests:

- canonical notification plus per-user delivery creation
- backoffice all-build recipient materialization
- builder recipient materialization from `builderAccountLinks`
- actor exclusion where specified
- dedupe unresolved notifications by dedupe key
- resolved notification no longer counts as action-required
- resolved does not imply read
- opening inbox marks visible deliveries read
- dismiss hides a delivery only for that user
- proposal event notifications
- active build milestone/draw/site-visit notifications
- tenant scoping: users cannot read or mutate another organization's deliveries
- future channel attempts do not affect app-inbox delivery behavior

Frontend tests:

- header badge shows unread count
- action count/filter shows unresolved action-required count
- opening inbox marks visible items read
- builder sees builder-scoped notifications only
- backoffice sees all-build notifications
- dismiss removes row from default inbox without deleting canonical notification
- resolved notification moves out of action-required

Build/test commands:

- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json`
- `bun run test`
- `bun run build`

## 17. Open Implementation Notes

1. The existing role spelling is `principle-broker`. Notification recipient resolution should normalize the common `principal-broker` spelling but persist using existing repo role conventions unless the broader RBAC model is renamed separately.
2. The app-shell inbox should reuse existing header/app-shell primitives and UI components. Do not create duplicate builder/backoffice notification systems.
3. Structural UI containers should use `Frame`/`FramePanel`; row/card-like notification surfaces should use `Card` where a card surface is appropriate.
4. Notification helpers should live in a dedicated Convex domain file unless implementation proves they belong near existing production proposal helpers. Do not move unrelated production functions into `convex/fluent.ts`.
5. External email/SMS delivery should not block the core domain mutation when implemented later.

