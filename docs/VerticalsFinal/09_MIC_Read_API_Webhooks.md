# Vertical 09 — MIC Read API and Webhooks

## I. Actual agile epic / Linear project

### Objective

Build the integration vertical required for another FairLend product/MIC portal to display build status, Gantt/workspace state, draw status, documents/images, and lifecycle events. MVP API is read-only, but the architecture must not block future full CRUD API.

### Technology alignment

The read‑only API and webhook delivery are implemented in Convex using `fluent-convex` functions.  Endpoints are exposed via Convex’s HTTP routing mechanism and are consumed by external systems such as the MIC portal.  All payloads are TypeScript DTOs derived from the shared domain models defined in the Foundation and Workspace verticals.  Signed URL generation for evidence assets uses Convex actions to generate time‑limited tokens and ensures that raw storage keys are never exposed.  Webhooks are delivered via the outbox pattern defined in the Foundation vertical, signed using a tenant‑specific secret, and retried with exponential backoff.  There is no separate Node/Express API server.

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

#### Authentication and identification

External consumers (e.g. MIC portals) authenticate using a service‑to‑service API key or integration credentials mapped to their WorkOS organisation.  Each API key corresponds to an observer grant and is scoped to one or more builds.  API responses include DrawFlow’s stable internal identifiers **and** optional external identifiers (e.g. `mortgageNumber` or `extId`) when these are supplied on the Build or related records.  This allows downstream systems to map DrawFlow objects to their own records without exposing tenant secrets.  All authentication and identification fields are subject to normal Convex permission checks.

#### Evidence visibility

Start conservative.

MIC users can see:

- build summary,
- approved/forecast milestone status,
- draw group/release status,
- portal-visible evidence assets,
 - approved completion evidence if explicitly visible,
 - portal‑visible site visit evidence and report items (inspectors must explicitly mark them as visible).

MIC users should not see by default:

- internal reviewer notes,
- rejected/raw evidence packages,
- admin override notes,
- lender-only policy config,
- full chat,
- unapproved claims.

Site visit reports and evidence are hidden by default.  Only site visit assets or report sections explicitly marked as `mic_portal_visible` by the inspector will be included in responses.

#### Webhooks

Webhooks are domain-event driven through outbox delivery. The most useful event is `workspace_projection.updated`, because downstream systems can refetch canonical state.

### Handoffs

| Handoff | From | To |
|---|---|---|
| Projection dirty events | Foundation/Workspace | Projection rebuild |
| Workspace API | MIC portal | `BuildWorkspaceProjection` |
| Evidence access | Evidence vertical | Signed URL endpoint |
| Domain events | Foundation outbox | Webhook delivery |

| Authentication | External integration credentials | Observer grant resolution |

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
  /**
   * Authenticated user ID.  Internal users call the API with their user token and must have the
   * `build.view_workspace` permission on the requested build.
   */
  actorUserId?: UserId;
  /**
   * External observer organisation ID.  When using service‑to‑service API keys, the key is mapped to a
   * WorkOS organisation and an observer grant.  This parameter identifies the external org making the
   * request.  Either `externalObserverOrgId` or `externalObserverApiKeyId` must be provided for MIC
   * callers.
   */
  externalObserverOrgId?: string;
  /**
   * External API key identifier (e.g., API key ID).  When present, the key is looked up to find the
   * associated observer grant and WorkOS organisation.  This allows MIC portals to authenticate via
   * API keys rather than acting as a named user.  The grant must be active and scoped to the build.
   */
  externalObserverApiKeyId?: string;
  tenantOrgId: TenantOrgId;
  buildId: BuildId;
  requestedAccessLevel: ObserverAccessLevel;
}): Promise<boolean> {
  // Internal user permission check
  if (params.actorUserId) {
    return hasBuildPermission(params.actorUserId, params.buildId, 'build.view_workspace');
  }

  // External observer via Org ID or API key
  const observerOrgId = params.externalObserverOrgId ??
    (params.externalObserverApiKeyId ? await getOrgIdForApiKey(params.externalObserverApiKeyId) : undefined);

  if (observerOrgId) {
    return hasActiveObserverGrant({
      buildId: params.buildId,
      observerOrgExternalId: observerOrgId,
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

  /**
   * Optional external identifier used by downstream systems to map this asset to their own records.
   * When present, this value originates from the DrawFlow domain (e.g. Build.extId or mortgageNumber)
   * and is included in the API response purely for convenience.  It is never used for authorization.
   */
  externalId?: string;

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

## IV. Screen and Component Manifest
The MIC Read API and Webhooks vertical is primarily headless: its deliverables are read‑only API endpoints and webhook delivery mechanisms for external consumers such as the MIC portal.  **Administrative screens in this vertical register via the Foundation’s route module contract** and typically live under `/app/:orgSlug/admin/*` or a dedicated `/admin/*` path.  End‑users of DrawFlow do not interact with this API directly.  Nevertheless, a minimal internal administration UI is required to configure webhook endpoints and observer grants.  The table below outlines this support interface and how it maps to the requirements.

| Screen / Route | Components | Purpose & context | Mapped requirements/use‑cases |
|---|---|---|---|
| **`WebhookEndpointListScreen`** (`/admin/webhooks`) | `WebhookEndpointTable`, `AddEndpointButton` | Lists all configured webhook endpoints for the tenant.  Each row in `WebhookEndpointTable` shows the endpoint URL, description, status (active/disabled), subscribed events, last delivery status, and a link to view details.  `AddEndpointButton` opens the create form.  Only users with `webhook.manage` permission can access this screen. | PRD: Webhook endpoint registry; ability to subscribe to selected events; status toggling; out‑of‑scope items such as developer portal deferred. |
| **`WebhookEndpointDetailScreen`** (`/admin/webhooks/:endpointId`) | `EndpointDetail`, `SubscribedEventsSelector`, `SecretDisplay`, `RotateSecretButton`, `DeliveryLogViewer`, `EndpointStatusToggle` | Shows detailed information about a single webhook endpoint.  `EndpointDetail` displays the target URL, description, and created/by details; `SubscribedEventsSelector` allows selecting which domain event types will trigger delivery; `SecretDisplay` reveals the current signing secret and allows copying; `RotateSecretButton` triggers secret rotation via a governed command; `DeliveryLogViewer` lists recent deliveries with status codes and retry attempts; `EndpointStatusToggle` enables or disables the endpoint. | PRD: Webhook configuration and event subscription (Section II Requirements and Spec items 5–8); signed webhook delivery; retry/delivery log; requirement that raw evidence URLs are not exposed. |
| **`ObserverGrantManagementScreen`** (`/admin/observer-grants`) | `ObserverGrantList`, `GrantDetailPanel`, `CreateGrantForm` | Allows support/admin users to manage MIC observer grants.  `ObserverGrantList` shows external observer organisations, the builds they can observe, and their access level; `GrantDetailPanel` displays grant details and allows revocation; `CreateGrantForm` issues new grants.  Observer grants determine which external consumers can call the read‑only API and what level of data redaction is applied. | PRD: MIC observer grant authorisation (Section I In scope and Spec item 2); redaction matrix; ensuring that observers without a grant receive 403 responses. |

**Component notes:**

- **`WebhookEndpointTable`** summarises endpoints and surfaces their operational status (e.g., last delivery success/failure) so support staff can detect issues with downstream integrations.
- **`SubscribedEventsSelector`** offers checkboxes or multi‑select input for the event types listed in Spec item 8 (`workspace_projection.updated`, `completion_claim.submitted`, etc.).  It prevents selection of events outside the allowed list and writes the configuration via a `fluent-convex` action.
- **`DeliveryLogViewer`** paginates through `WebhookDelivery` records and shows timestamp, status, status code, and error message.  It assists debugging of delivery failures and verifies retry behaviour.
- **`ObserverGrantList`** and **`CreateGrantForm`** may be implemented in the Foundation/Workspace admin UI but are documented here for completeness.  Grants tie external MIC organisations to build IDs and access levels and integrate with the `canReadWorkspace` logic (Spec item 2).

External consumption of the read‑only API occurs outside the DrawFlow application.  The MIC portal uses the endpoints defined in Section III (items 1 and 3) and short‑lived signed URLs for evidence access.  No builder or lender UI surfaces are required.  Internal administrators must ensure that webhook endpoints are correctly configured and that observer grants reflect organisational agreements.
