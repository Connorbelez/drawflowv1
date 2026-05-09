# Vertical 09 — MIC Read API and Webhooks

## I. Actual agile epic / Linear project

### Objective

Build the integration vertical required for another FairLend product/MIC portal to display build status, Gantt/workspace state, draw status, documents/images, and lifecycle events. MVP API is read-only, but the architecture must not block future full CRUD API.

### In scope

- Canonical workspace projection API.
- MIC observer grant authorization.
- Portal-safe evidence visibility.
- Short-lived signed evidence access URLs.
- Build event timeline read API.
- Webhook endpoint registry.
- Event subscription config.
- Signed webhook delivery.
- Retry/delivery log.
- `workspace_projection.updated` event for downstream refresh.

### Out of scope

- Public write API.
- Developer portal.
- API-key self-service UI unless trivial.
- Raw evidence URLs in webhook payloads.
- Internal review notes exposed by default.
- Rejected claims/evidence exposed by default.

### Definition of done

1. MIC portal can call read-only workspace endpoint for authorized build.
2. MIC portal can render milestone/draw/timeline state from projection without reproducing domain logic.
3. MIC portal can request short-lived signed URL for portal-visible evidence.
4. Unauthorized observer cannot access build or evidence.
5. Webhook endpoint can subscribe to selected events.
6. Webhooks are signed, retried, and logged.
7. `workspace_projection.updated` lets downstream product refetch state.
8. Tests cover authorization, redaction, signed URL behavior, webhook retry, and idempotency.

---

## II. PRD for this vertical

### Context

The MIC portal integration is required for MVP. Another product must show build status and a similar Gantt/workspace view. DrawFlow therefore needs a stable read model early.

The read API exposes canonical projections, not raw tables. The MIC portal should not reconstruct DrawFlow domain logic.

### Requirements

#### Read-only API

MVP external API is read-only. Future CRUD architecture should remain possible, but future write operations must route through governed transition commands.

#### Evidence visibility

Start conservative.

MIC users can see:

- build summary,
- approved/forecast milestone status,
- draw group/release status,
- portal-visible evidence assets,
- approved completion evidence if explicitly visible.

MIC users should not see by default:

- internal reviewer notes,
- rejected/raw evidence packages,
- admin override notes,
- lender-only policy config,
- full chat,
- unapproved claims.

#### Webhooks

Webhooks are domain-event driven through outbox delivery. The most useful event is `workspace_projection.updated`, because downstream systems can refetch canonical state.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Projection dirty events | Foundation/Workspace | Projection rebuild |
| Workspace API | MIC portal | `BuildWorkspaceProjection` |
| Evidence access | Evidence vertical | Signed URL endpoint |
| Domain events | Foundation outbox | Webhook delivery |

---

## III. Spec

### 1. Read-only endpoints

```http
GET /api/v1/builds/:buildId/workspace
GET /api/v1/builds/:buildId/events
GET /api/v1/builds/:buildId/evidence-assets
GET /api/v1/evidence-assets/:assetId/access-url
GET /api/v1/builds/:buildId/draw-releases
GET /api/v1/builds/:buildId/milestones
```

### 2. Authorization

```ts
export async function canReadWorkspace(params: {
  actorUserId?: UserId;
  externalObserverOrgId?: string;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  requestedAccessLevel: ObserverAccessLevel;
}): Promise<boolean> {
  if (params.actorUserId) {
    return hasBuildPermission(params.actorUserId, params.buildId, 'build.view_workspace');
  }

  if (params.externalObserverOrgId) {
    return hasActiveObserverGrant({
      buildId: params.buildId,
      observerOrgExternalId: params.externalObserverOrgId,
      accessLevel: params.requestedAccessLevel,
    });
  }

  return false;
}
```

### 3. Evidence descriptor DTO

```ts
export interface EvidenceAssetDescriptorDTO {
  id: EvidenceAssetId;
  buildId: BuildId;
  milestoneId?: MilestoneId;
  completionClaimId?: CompletionClaimId;
  siteVisitId?: SiteVisitId;

  fileName: string;
  mimeType: string;
  sizeBytes: number;

  uploadedAt: ISODateTime;
  uploadedByDisplayName: string;

  source:
    | 'builder_upload'
    | 'builder_staff_upload'
    | 'site_visit_upload'
    | 'admin_upload';

  purpose:
    | 'completion_verification'
    | 'site_visit'
    | 'cost_support'
    | 'admin_internal';

  visibility:
    | 'builder_and_lender'
    | 'lender_internal'
    | 'mic_portal_visible'
    | 'admin_only';

  access: {
    method: 'signed_url';
    accessUrlEndpoint: string;
    expiresInSeconds: number;
  };
}
```

### 4. Evidence access flow

```text
1. Caller requests /evidence-assets/:assetId/access-url.
2. Server loads asset.
3. Server verifies tenant/build/observer grant.
4. Server verifies asset visibility is allowed for caller.
5. Server returns short-lived signed URL.
6. Server audits evidence access if policy requires it.
```

Never return raw storage keys.

### 5. Webhook endpoint and delivery

```ts
export interface WebhookEndpoint {
  id: Id<'WebhookEndpoint'>;
  tenantOrgId: TenantOrgId;
  url: string;
  description?: string;
  status: 'active' | 'disabled';
  secretRef: string;
  subscribedEventTypes: string[];
  createdByUserId: UserId;
  createdAt: ISODateTime;
}

export interface WebhookDelivery {
  id: Id<'WebhookDelivery'>;
  tenantOrgId: TenantOrgId;
  webhookEndpointId: Id<'WebhookEndpoint'>;
  domainEventId: DomainEventId;

  status: 'pending' | 'delivered' | 'failed' | 'abandoned';
  attemptCount: number;
  nextAttemptAt?: ISODateTime;
  lastAttemptAt?: ISODateTime;
  lastStatusCode?: number;
  lastError?: string;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

### 6. Webhook event envelope

```json
{
  "id": "evt_...",
  "type": "workspace_projection.updated",
  "version": "2026-05-08",
  "tenant_org_id": "org_...",
  "build_id": "bld_...",
  "occurred_at": "2026-05-08T14:30:00Z",
  "actor": {
    "type": "user",
    "user_id": "usr_..."
  },
  "data": {
    "projection_version": 42
  }
}
```

### 7. Webhook signing

Recommended headers:

```text
DrawFlow-Event-Id: evt_...
DrawFlow-Timestamp: 2026-05-08T14:30:00Z
DrawFlow-Signature: v1=<hmac_sha256>
```

Signature base string:

```text
<timestamp>.<raw_body>
```

### 8. Events exposed in MVP

```text
workspace_projection.updated
build.activated
completion_claim.submitted
milestone_completion.approved
milestone_completion.rejected
site_visit.requested
site_visit.submitted
draw_group.ready_for_release
draw_release.approved
draw_release.recorded
```

### 9. Redaction matrix

| Caller | Evidence | Financials | Notes |
|---|---|---|---|
| Builder principal | Builder/lender-visible | Builder-facing | No internal notes |
| Builder staff | Assigned/allowed | Limited/redacted | No internal notes |
| Lender admin | Full tenant/build | Full | Full except platform-only |
| Verifier | Review-relevant | Permission-dependent | Review notes |
| MIC observer | Portal-visible only | Observer-grant dependent | No internal notes |
| Platform admin | Support access | As permitted | Fully audited |

### 10. Tests

| Test | Expected |
|---|---|
| MIC without grant | 403. |
| MIC summary grant | No evidence URLs; limited financials. |
| MIC evidence grant | Portal-visible descriptors only. |
| Rejected evidence | Hidden by default. |
| Signed URL for lender-internal asset by MIC | 403. |
| Webhook receives 500 | Retry scheduled. |
| Duplicate delivery | Same event ID; receiver can dedupe. |
| Disabled endpoint | No delivery created. |
