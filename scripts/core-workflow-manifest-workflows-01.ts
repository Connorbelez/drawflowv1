import {
  common,
  type ParentWorkflow,
  segment,
  src,
} from "./core-workflow-manifest-model";

export const workflowsPart01: ParentWorkflow[] = [
  {
    id: "WF-TEN-001",
    name: "Brokerage Provisioning and Principal Authority Activation",
    persona: "CROSS",
    category: "Tenancy and identity",
    purpose:
      "Provision one organization-scoped brokerage with exactly one active Principal Broker before product operations begin.",
    preconditions: [
      "Platform Admin is authenticated with platform scope.",
      "No conflicting active brokerage or Principal Broker assignment exists.",
    ],
    trigger:
      "Platform Admin elects to provision a brokerage or replace its Principal Broker.",
    steps: [
      "Create the brokerage and WorkOS Organization.",
      "Invite the first Principal Broker.",
      "Principal Broker accepts and establishes an active membership.",
      "Activate the brokerage only after the principal is active.",
      "Record provisioning and authority assignment.",
    ],
    inputs: [
      "Brokerage identity and organization metadata.",
      "Principal Broker identity/email.",
      "Replacement reason when transferring principal authority.",
    ],
    outputs: [
      "WorkOS Organization.",
      "Active brokerage.",
      "Single active Principal Broker assignment.",
      "Audit history.",
    ],
    states: [
      "brokerage: unprovisioned → pending_principal → active",
      "principal invitation: pending → accepted/expired/revoked",
      "replacement: prior_active → historical; new_pending → active",
    ],
    gates: [
      "A brokerage cannot activate without one active Principal Broker.",
      "A brokerage cannot have two active Principal Brokers.",
    ],
    exceptions: [
      "Expired/revoked invitation is reissued.",
      "Duplicate principal assignment is rejected.",
      "Principal transfer preserves historical authority.",
    ],
    permissions: [
      "Only Platform Admin provisions brokerages or performs platform-level principal replacement.",
      "Principal acceptance is limited to the invited identity.",
    ],
    upstream: [],
    downstream: ["WF-TEN-002", "WF-INT-001"],
    handoffs: ["WF-TEN-001.HO-01", "WF-TEN-001.HO-02"],
    events: [
      "WorkOS organization/invitation events.",
      "Brokerage provisioned/activated audit events.",
      "Principal assigned/replaced audit events.",
    ],
    success: [
      "Brokerage is active with exactly one active Principal Broker and complete audit history.",
    ],
    failure: [
      "Brokerage remains pending/inactive; no organization-scoped product work may start.",
    ],
    sources: [
      `${src.production} §4.1–4.2, §8.1`,
      `${src.auth} (WorkOS organization and RBAC foundation)`,
    ],
    status: "SUPPORTED",
    participants: ["PADM", "LADM", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-TEN-001.HO-01",
        from: "PADM",
        to: "LADM",
        trigger: "Principal invitation is created.",
        artifacts:
          "Brokerage identity, WorkOS Organization invitation, assigned principal role, expiry metadata.",
        acknowledgement:
          "Invitee accepts through WorkOS/AuthKit and obtains active organization membership.",
      },
      {
        id: "WF-TEN-001.HO-02",
        from: "SYS",
        to: "PADM",
        trigger:
          "Principal membership becomes active or the invitation fails/expires.",
        artifacts:
          "Membership/role sync result, brokerage activation eligibility, failure metadata.",
        acknowledgement:
          "Platform Admin verifies activation or reissues/repairs the assignment.",
      },
    ],
    segments: [
      segment(
        "WF-TEN-001.PADM.01",
        "Provision brokerage and assign Principal Broker",
        "PADM",
        "Tenant provisioning",
        common({
          purpose:
            "Create the tenant boundary and initiate its accountable authority assignment.",
          trigger:
            "A new brokerage is approved for DrawFlow or principal authority must transfer.",
          steps: [
            "Enter brokerage metadata.",
            "Create/confirm the WorkOS Organization.",
            "Invite or replace the Principal Broker.",
            "Review activation result and audit trail.",
          ],
          inputs: [
            "Brokerage metadata.",
            "Principal identity.",
            "Transfer reason when applicable.",
          ],
          outputs: [
            "Pending/active brokerage.",
            "Principal invitation/assignment.",
          ],
          states: ["unprovisioned → pending_principal → active"],
          gates: ["Exactly one active principal."],
          exceptions: [
            "Invitation expiry, duplicate principal, failed WorkOS sync.",
          ],
          permissions: [
            "Platform Admin only; support access does not bypass audit.",
          ],
          downstream: ["WF-TEN-001.LADM.01", "WF-TEN-002"],
          handoffs: ["WF-TEN-001.HO-01", "WF-TEN-001.HO-02"],
          events: [
            "brokerage.provisioned",
            "principal.invited",
            "principal.replaced",
            "audit event",
          ],
          success: ["Tenant is active and accountable."],
          failure: ["Tenant remains inactive."],
          sources: [`${src.production} §8.1`],
        })
      ),
      segment(
        "WF-TEN-001.LADM.01",
        "Accept principal authority",
        "LADM",
        "Tenant activation",
        common({
          purpose:
            "Accept the organization invitation and establish the brokerage's first active authority.",
          trigger: "WorkOS invitation arrives.",
          steps: [
            "Open invitation.",
            "Authenticate/accept membership.",
            "Confirm Principal Broker role is synchronized.",
            "Enter the brokerage workspace.",
          ],
          inputs: ["Invitation and invited identity."],
          outputs: ["Active organization membership and principal assignment."],
          states: ["invited → accepted → active"],
          gates: [
            "Authenticated email/identity must match invitation and role sync must complete.",
          ],
          exceptions: [
            "Expired, revoked, mismatched, or sync-pending invitation.",
          ],
          permissions: ["Invited Principal Broker only."],
          upstream: ["WF-TEN-001.PADM.01"],
          downstream: ["WF-TEN-002", "WF-PRP-001"],
          handoffs: ["WF-TEN-001.HO-01"],
          events: ["WorkOS invitation accepted", "membership synchronized"],
          success: ["Principal authority is active."],
          failure: ["No product authority is granted."],
          sources: [`${src.production} §8.1`],
        })
      ),
      segment(
        "WF-TEN-001.SYS.01",
        "Synchronize principal membership and activate tenant",
        "SYS",
        "Identity synchronization",
        common({
          purpose:
            "Project webhook-owned WorkOS identity state and enforce brokerage activation invariants.",
          trigger:
            "WorkOS organization/invitation/membership event is received.",
          steps: [
            "Project the WorkOS event.",
            "Verify one active Principal Broker.",
            "Activate or keep brokerage pending.",
            "Write audit result.",
          ],
          inputs: ["WorkOS webhook event."],
          outputs: [
            "Projection rows, brokerage activation state, audit event.",
          ],
          states: ["pending_principal → active or pending_principal"],
          gates: [
            "Webhook-owned identity tables are not directly mutated by product flows.",
          ],
          exceptions: [
            "Out-of-order/duplicate webhook, missing role, multiple principals.",
          ],
          permissions: ["System/webhook sync only."],
          upstream: ["WF-TEN-001.LADM.01"],
          downstream: ["WF-TEN-002"],
          handoffs: ["WF-TEN-001.HO-02"],
          events: ["identity projection and brokerage activation audit"],
          success: ["Consistent active tenancy."],
          failure: ["Activation withheld and repair remains actionable."],
          sources: [`${src.production} §5, §8.1`, `${src.auth}`],
        })
      ),
    ],
  },
  {
    id: "WF-COM-001",
    name: "Actionable Notification Inbox and Resolution",
    persona: "CROSS",
    category: "Notifications",
    purpose:
      "Deliver selective organization-scoped action/update notifications to the correct recipient and resolve them from canonical domain outcomes rather than treating notifications as workflow state.",
    preconditions: [
      "A supported domain event occurs and recipient resolver can materialize scoped deliveries.",
    ],
    trigger:
      "Proposal, milestone, draw, site visit, missing-info, location, or facility event matches the V1 taxonomy.",
    steps: [
      "Create/dedupe canonical notification.",
      "Materialize per-recipient deliveries with actor exclusion.",
      "Deliver mandatory in-app channel and optional external attempts.",
      "Recipient opens/reads/dismisses and follows actionHref.",
      "Domain mutation completes or rejects action.",
      "Resolve delivery from canonical domain state.",
    ],
    inputs: [
      "Domain event, organization/entity/actor/payload, recipient resolution, preferences/channel configuration.",
    ],
    outputs: [
      "Canonical notification, recipient deliveries/attempts, read/dismissed/resolved state, action navigation.",
    ],
    states: [
      "delivery: unread → read; active → dismissed; unresolved → resolved",
      "external attempt: queued → delivered/failed/retried",
      "notification state never replaces domain state",
    ],
    gates: [
      "Authenticated delivery-first reads for viewer only.",
      "action_required/warning mandatory in-app.",
      "Selective event taxonomy/dedupe/actor exclusion.",
    ],
    exceptions: [
      "No eligible recipient, duplicate/no-op event, external delivery failure, stale action link, unauthorized access.",
    ],
    permissions: [
      "Recipients read/mutate own delivery rows.",
      "Domain mutations resolve canonical notifications.",
      "No broad canonical notification query from public inbox.",
    ],
    upstream: [
      "WF-PRP-001",
      "WF-BLD-001",
      "WF-MIL-001",
      "WF-DRW-001",
      "WF-BUD-001",
      "WF-CAL-001",
      "WF-CTR-001",
      "WF-CTR-002",
    ],
    downstream: [
      "WF-PRP-001",
      "WF-MIL-001",
      "WF-DRW-001",
      "WF-BUD-001",
      "WF-CTR-002",
    ],
    handoffs: ["WF-COM-001.HO-01", "WF-COM-001.HO-02", "WF-COM-001.HO-03"],
    events: [
      "Notification/delivery/attempt lifecycle; read/dismiss; domain-driven resolution. Ordinary audit/no-op/token-open/webhook-attempt events do not create inbox items.",
    ],
    success: [
      "Correct recipient reaches and completes the canonical next action; delivery resolves.",
    ],
    failure: [
      "Delivery remains unread/unresolved or external attempt fails visibly; domain record remains authoritative.",
    ],
    sources: [`${src.notifications} §3–§13`, `${src.contractor} §10`],
    status: "SUPPORTED",
    participants: ["SYS", "BLDR", "LOPS", "LADM", "CNTR"],
    handoffDefinitions: [
      {
        id: "WF-COM-001.HO-01",
        from: "SYS",
        to: "BLDR",
        trigger:
          "Builder-audience event is materialized (changes/missing info/rejection/release/etc.).",
        artifacts:
          "Category, title/body, entity context, event time, actionHref, resolution semantics.",
        acknowledgement:
          "Builder reads/dismisses and, when actionable, completes the linked domain step.",
      },
      {
        id: "WF-COM-001.HO-02",
        from: "SYS",
        to: "LOPS",
        trigger: "Backoffice action-required/warning event is materialized.",
        artifacts:
          "Proposal/build/work context, category, assignment metadata, actionHref, resolution semantics.",
        acknowledgement:
          "Operations claims/reviews the canonical work and domain outcome resolves the notification.",
      },
      {
        id: "WF-COM-001.HO-03",
        from: "SYS",
        to: "CNTR",
        trigger:
          "Contractor assignment/schedule/evidence/onboarding event requires attention.",
        artifacts:
          "Assigned scope/profile/evidence context, required response, action link, outcome/reason.",
        acknowledgement:
          "Contractor acknowledges, revises, claims, or addresses feedback in the canonical workflow.",
      },
    ],
    segments: [
      segment(
        "WF-COM-001.BLDR.01",
        "Triage builder notifications",
        "BLDR",
        "Builder inbox",
        common({
          purpose:
            "Receive status and act on proposal/build/milestone/draw tasks.",
          trigger: "Builder delivery appears.",
          steps: [
            "Open inbox.",
            "Filter/action required.",
            "Read context.",
            "Follow action.",
            "Complete canonical workflow.",
            "Dismiss/read as appropriate.",
          ],
          inputs: ["Builder delivery."],
          outputs: ["Read/dismiss plus domain response."],
          states: ["unread/unresolved → read/resolved"],
          gates: ["Own delivery and builder-accessible action."],
          exceptions: ["Stale/unauthorized link."],
          permissions: ["Authenticated builder recipient."],
          upstream: ["WF-COM-001.SYS.01"],
          downstream: ["WF-PRP-001", "WF-MIL-001", "WF-DRW-001", "WF-BUD-001"],
          handoffs: ["WF-COM-001.HO-01"],
          events: ["delivery read/dismiss; domain resolution"],
          success: ["Action completed/resolved."],
          failure: ["Delivery remains actionable."],
          sources: [`${src.notifications} §8.2, §11`],
        })
      ),
      segment(
        "WF-COM-001.LOPS.01",
        "Triage backoffice notifications",
        "LOPS",
        "Backoffice inbox",
        common({
          purpose: "Convert actionable deliveries into claimed canonical work.",
          trigger: "Backoffice delivery appears.",
          steps: [
            "Open/filter inbox.",
            "Review entity/assignment.",
            "Follow action.",
            "Claim/perform domain work.",
            "Let domain outcome resolve delivery.",
          ],
          inputs: ["Backoffice delivery."],
          outputs: ["Claim/action/read/resolution."],
          states: ["unread/unresolved → read/resolved"],
          gates: ["Viewer delivery; organization work access."],
          exceptions: ["Unassigned/stale/authority-only routes."],
          permissions: ["Authenticated backoffice recipient."],
          upstream: ["WF-COM-001.SYS.01"],
          downstream: ["WF-OPS-001"],
          handoffs: ["WF-COM-001.HO-02"],
          events: ["read/claim/domain resolution"],
          success: ["Work owned/resolved."],
          failure: ["Unresolved item remains visible."],
          sources: [`${src.notifications} §8.1, §11`],
        })
      ),
      segment(
        "WF-COM-001.LADM.01",
        "Consume authority notifications",
        "LADM",
        "Admin inbox",
        common({
          purpose:
            "Open final-decision/release/override work from a scoped delivery.",
          trigger: "Authority-targeted delivery appears.",
          steps: [
            "Review delivery/context.",
            "Open canonical package.",
            "Decide or route more work.",
            "Confirm resolution.",
          ],
          inputs: ["Authority delivery/package."],
          outputs: ["Domain decision and resolved delivery."],
          states: ["unresolved → resolved"],
          gates: ["Final authority and domain policy."],
          exceptions: ["Insufficient package."],
          permissions: ["Lender Admin recipient."],
          upstream: ["WF-COM-001.SYS.01"],
          downstream: ["WF-PRP-001", "WF-MIL-001", "WF-DRW-001", "WF-BUD-001"],
          handoffs: [],
          events: ["read/domain decision"],
          success: ["Decision delivery resolves."],
          failure: ["Follow-up remains explicit."],
          sources: [`${src.notifications}`],
        })
      ),
      segment(
        "WF-COM-001.CNTR.01",
        "Act on contractor notifications",
        "CNTR",
        "Contractor inbox",
        common({
          purpose:
            "Respond to onboarding, assignment, schedule, and evidence feedback.",
          trigger: "Contractor notification arrives.",
          steps: [
            "Open action.",
            "Review scoped context.",
            "Acknowledge/revise/claim/address.",
            "Confirm canonical state.",
          ],
          inputs: ["Contractor delivery."],
          outputs: ["Canonical contractor response."],
          states: ["unresolved → resolved by contractor workflow"],
          gates: ["Active/appropriate onboarding identity and scoped action."],
          exceptions: ["Revoked/expired/removed scope."],
          permissions: ["Target contractor only."],
          upstream: ["WF-COM-001.SYS.01"],
          downstream: ["WF-CTR-001", "WF-CTR-002"],
          handoffs: ["WF-COM-001.HO-03"],
          events: ["contractor delivery/domain response"],
          success: ["Requested action completed."],
          failure: ["Action remains unresolved or terminally invalid."],
          sources: [`${src.contractor} §10`],
        })
      ),
      segment(
        "WF-COM-001.SYS.01",
        "Create, deliver, dedupe, and resolve notifications",
        "SYS",
        "Notification service",
        common({
          purpose:
            "Materialize selective recipient deliveries and derive resolution from domain truth.",
          trigger: "Supported domain event.",
          steps: [
            "Validate taxonomy/scope.",
            "Dedupe.",
            "Resolve recipients/exclude actor.",
            "Create deliveries/attempts.",
            "Serve delivery-first inbox.",
            "Resolve from domain outcome.",
          ],
          inputs: ["Domain event and recipient/preference context."],
          outputs: ["Notification/deliveries/attempts."],
          states: [
            "unread/read/dismissed/resolved; attempts queued/delivered/failed",
          ],
          gates: ["Mandatory in-app categories; tenant/recipient scope."],
          exceptions: ["No recipient/duplicate/external failure."],
          permissions: ["System; public users only own deliveries."],
          upstream: ["WF-PRP-001", "WF-MIL-001", "WF-DRW-001"],
          downstream: [],
          handoffs: [
            "WF-COM-001.HO-01",
            "WF-COM-001.HO-02",
            "WF-COM-001.HO-03",
          ],
          events: ["notification service events"],
          success: ["Correct deliveries and resolution."],
          failure: ["Retryable delivery failure without domain corruption."],
          sources: [`${src.notifications} §4–§13`],
        })
      ),
    ],
  },
  {
    id: "WF-INT-001",
    name: "API/Webhook Configuration, Lifecycle Delivery, and Failure Review",
    persona: "CROSS",
    category: "Integrations",
    purpose:
      "Configure tenant-scoped integrations and deliver signed lifecycle events with observable logs without weakening domain authorization or audit.",
    preconditions: [
      "Organization is active and Technical Admin is authorized.",
    ],
    trigger:
      "Technical Admin creates/changes API key, endpoint, subscription, secret, or external mapping; or a subscribed lifecycle event enters outbox.",
    steps: [
      "Configure credentials/endpoint/subscriptions/mappings.",
      "Validate and confirm dangerous changes.",
      "Persist organization-scoped configuration and audit.",
      "Publish subscribed outbox event with signature and stable identifiers.",
      "Record delivery result/log.",
      "Technical Admin reviews failure and retries/repairs configuration according to supported controls.",
    ],
    inputs: [
      "API key/webhook endpoint/events/signing secret/external mappings.",
      "Organization-scoped lifecycle event/outbox payload.",
    ],
    outputs: [
      "Secure config, signed delivery attempt/log, external mapping, retry/repair outcome.",
    ],
    states: [
      "endpoint/config: draft/active/disabled",
      "delivery: pending → delivered/failed/retry_pending",
      "secret/key: active → rotated/revoked",
    ],
    gates: [
      "Organization scope, secret protection, event subscription, signing, dangerous-change confirmation, audit.",
    ],
    exceptions: [
      "Invalid endpoint/secret/event, delivery timeout/non-2xx, duplicate/out-of-order delivery, mapping failure, revoked credential.",
    ],
    permissions: [
      "Technical/Organization Admin configures.",
      "System delivers.",
      "External systems receive only subscribed tenant-scoped payloads.",
    ],
    upstream: ["WF-PRP-001", "WF-MIL-001", "WF-DRW-001", "WF-BUD-001"],
    downstream: [],
    handoffs: ["WF-INT-001.HO-01", "WF-INT-001.HO-02"],
    events: [
      "Config/key/secret/mapping audit.",
      "Lifecycle webhook events including proposal, milestone, evidence, site visit, draw, budget, build, policy where enabled.",
      "Delivery log/attempts (not inbox notifications).",
    ],
    success: [
      "Subscribed lifecycle event is securely delivered and traceable.",
    ],
    failure: [
      "Failure is logged/retryable or config disabled; domain transaction remains committed and auditable.",
    ],
    sources: [
      `${src.core} §16–§17`,
      `${src.screens} SCR-028`,
      `${src.notifications} §8.3`,
    ],
    status: "NEEDS_VALIDATION",
    validationNote:
      "Configuration surface and registry requirements are specified, but retry/backoff/dead-letter policy and exact MVP event payload/version contract remain open in the core PRD.",
    participants: ["TADM", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-INT-001.HO-01",
        from: "TADM",
        to: "SYS",
        trigger: "Integration configuration is saved/activated.",
        artifacts:
          "Organization, endpoint, subscriptions, signing-secret/key state, external mappings, confirmation/audit reason.",
        acknowledgement:
          "System validates/activates configuration or returns a specific error.",
      },
      {
        id: "WF-INT-001.HO-02",
        from: "SYS",
        to: "TADM",
        trigger:
          "Delivery fails, secret/key nears invalid state, or log review is requested.",
        artifacts:
          "Event/delivery ID, endpoint, attempt time/status/error, payload metadata (secret-safe), retry/config action.",
        acknowledgement:
          "Technical Admin repairs/disables/rotates/retries using supported controls.",
      },
    ],
    segments: [
      segment(
        "WF-INT-001.TADM.01",
        "Configure and operate tenant integrations",
        "TADM",
        "Integration administration",
        common({
          purpose:
            "Securely configure webhooks/API state and resolve delivery failures.",
          trigger: "Integration setup/change or failed delivery.",
          steps: [
            "Create/rotate/revoke key/secret.",
            "Configure endpoint/subscriptions/mappings.",
            "Confirm dangerous change.",
            "Review delivery logs.",
            "Repair/disable/retry as supported.",
          ],
          inputs: ["Integration config and failure log."],
          outputs: ["Active/disabled config and operator outcome."],
          states: ["draft → active/disabled; key active → rotated/revoked"],
          gates: [
            "Organization Admin authority, confirmation, secret handling.",
          ],
          exceptions: ["Invalid endpoint/secret/mapping/failure."],
          permissions: ["Technical/Organization Admin only."],
          upstream: ["WF-TEN-001"],
          downstream: [],
          handoffs: ["WF-INT-001.HO-01", "WF-INT-001.HO-02"],
          events: ["integration config audit"],
          success: ["Secure active config/delivery repair."],
          failure: ["Config disabled/failure remains logged."],
          sources: [`${src.screens} SCR-028`, `${src.core} §16`],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Retry and payload-version controls need specification.",
        })
      ),
      segment(
        "WF-INT-001.SYS.01",
        "Deliver signed lifecycle webhooks",
        "SYS",
        "Webhook delivery",
        common({
          purpose:
            "Publish subscribed tenant lifecycle events independently of committed domain transactions.",
          trigger: "Subscribed outbox event is ready.",
          steps: [
            "Resolve config/subscription.",
            "Build versioned payload/stable IDs.",
            "Sign/send.",
            "Record result.",
            "Schedule supported retry or surface failure.",
          ],
          inputs: ["Outbox event and config."],
          outputs: ["Attempt/log/delivery result."],
          states: ["pending → delivered/failed/retry_pending"],
          gates: ["Tenant scope, subscription, signature, secret safety."],
          exceptions: ["Network/non-2xx/timeout/revocation/duplicate."],
          permissions: ["System only."],
          upstream: ["WF-PRP-001", "WF-MIL-001", "WF-DRW-001", "WF-BUD-001"],
          downstream: [],
          handoffs: ["WF-INT-001.HO-01", "WF-INT-001.HO-02"],
          events: ["webhook delivery attempts/logs"],
          success: ["Traceable delivered event."],
          failure: ["Logged failure; domain state unaffected."],
          sources: [`${src.core} §16`, `${src.screens} SCR-028`],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Backoff/dead-letter and exact payload schema are unresolved.",
        })
      ),
    ],
  },
  {
    id: "WF-OPS-001",
    name: "Backoffice Portfolio and Work-Queue Triage",
    persona: "CROSS",
    category: "Lender operations",
    purpose:
      "Continuously turn cross-build risk and queued domain work into claimed, prioritized, authority-correct next actions.",
    preconditions: [
      "Organization has active proposals/builds and work queues.",
      "Operator has backoffice access.",
    ],
    trigger:
      "Operator opens dashboard/portfolio/site-visit/kanban surface or a new work/risk event arrives.",
    steps: [
      "Filter/sort portfolio and queues by urgency/risk/assignment.",
      "Open full Build/milestone/draw/evidence/visit context.",
      "Claim/assign/annotate.",
      "Perform non-final action: request info/visit, review evidence, prepare package/recommendation.",
      "Escalate final decision/override/release to Lender Admin.",
      "Track acknowledgement/outcome and close/reroute item.",
    ],
    inputs: [
      "Proposal/evidence/missing-info/site-visit/admin/draw/receipt work items.",
      "Build health, schedule, capital, geofence, token expiry, assignment.",
    ],
    outputs: [
      "Claim/assignment/recommendation/escalation/closure and portfolio audit.",
    ],
    states: [
      "new/unassigned → claimed/in_review → waiting/requested/ready_for_admin → resolved/closed or rerouted",
    ],
    gates: [
      "Organization/assignment access.",
      "Staff actions stop at recommendation/preparation.",
      "Reason required for material actions.",
    ],
    exceptions: [
      "No assignee, expiring token, stale/missing info, geofence warning, authority-only action, failed settlement, cross-build workload aging.",
    ],
    permissions: [
      "Broker/Backoffice non-destructive write according to assignment.",
      "Lender Admin final authority/override/release.",
      "Builders/contractors cannot access backoffice surfaces.",
    ],
    upstream: [
      "WF-PRP-001",
      "WF-BLD-001",
      "WF-MIL-001",
      "WF-DRW-001",
      "WF-BUD-001",
    ],
    downstream: ["WF-MIL-001", "WF-DRW-001", "WF-BUD-001", "WF-COM-001"],
    handoffs: ["WF-OPS-001.HO-01", "WF-OPS-001.HO-02"],
    events: [
      "work claimed/assigned/routed/recommended/closed",
      "reasoned audit/outbox",
      "authority/assignee notifications",
    ],
    success: [
      "Every material item has an accountable next action or terminal resolution.",
    ],
    failure: [
      "Item remains visibly overdue/blocked/unassigned; never hidden in comments/chat.",
    ],
    sources: [
      `${src.production} §8.9, §9.3, §9.6`,
      `${src.core} §18.2–18.3`,
      `${src.backoffice}`,
    ],
    status: "SUPPORTED",
    participants: ["BRKR", "LOPS", "LADM", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-OPS-001.HO-01",
        from: "LOPS",
        to: "LADM",
        trigger:
          "A complete package is ready for final decision, override, cancellation, reassignment, or release.",
        artifacts:
          "Target domain record, all evidence/reports/recommendation, warnings, prior/new state preview, required reason/action.",
        acknowledgement: "Lender Admin claims/decides/routes the item.",
      },
      {
        id: "WF-OPS-001.HO-02",
        from: "LADM",
        to: "LOPS",
        trigger:
          "Final decision or request for additional operational work is recorded.",
        artifacts:
          "Decision/reason, resulting states, follow-up assignment, notification/audit references.",
        acknowledgement:
          "Operations closes/reroutes queue items and performs requested follow-up.",
      },
    ],
    segments: [
      segment(
        "WF-OPS-001.BRKR.01",
        "Triage assigned builder portfolio",
        "BRKR",
        "Relationship operations",
        common({
          purpose:
            "Identify hot assigned builds/proposals and coordinate operational ownership.",
          trigger: "Dashboard cycle or alert.",
          steps: [
            "Review assigned portfolio health.",
            "Open next action.",
            "Assign/claim within authority.",
            "Coordinate builder/backoffice.",
            "Escalate final actions.",
          ],
          inputs: ["Assigned portfolio and work queues."],
          outputs: ["Prioritized/assigned work."],
          states: ["untriaged → assigned/routed"],
          gates: ["Assigned relationship and non-final authority."],
          exceptions: ["Unassigned/cross-brokerage/authority-only."],
          permissions: ["Broker scoped to assigned work."],
          upstream: ["WF-TEN-002", "WF-BLD-001"],
          downstream: ["WF-OPS-001.LOPS.01"],
          handoffs: [],
          events: ["assignment/triage audit"],
          success: ["Assigned risks have owners."],
          failure: ["Escalated visible exception."],
          sources: [`${src.production} §9.3`, `${src.backoffice}`],
        })
      ),
      segment(
        "WF-OPS-001.LOPS.01",
        "Operate cross-build work queues",
        "LOPS",
        "Queue operations",
        common({
          purpose:
            "Claim, investigate, and prepare domain work for resolution.",
          trigger: "New/aging/assigned work appears.",
          steps: [
            "Filter/claim.",
            "Review full context.",
            "Perform permitted request/review/assignment action.",
            "Capture recommendation/reason.",
            "Escalate or close/reroute.",
          ],
          inputs: ["Work item and domain context."],
          outputs: ["Recommendation/escalation/closure."],
          states: ["new → claimed/in_review → ready/waiting/resolved"],
          gates: ["No final milestone approval/draw release/silent override."],
          exceptions: [
            "Missing info, unassigned visit, expired token, location warning, failed receipt.",
          ],
          permissions: ["Backoffice/Broker staff non-destructive authority."],
          upstream: [
            "WF-BLD-001.LOPS.01",
            "WF-MIL-001.LOPS.01",
            "WF-DRW-001.LOPS.01",
          ],
          downstream: ["WF-OPS-001.LADM.01"],
          handoffs: ["WF-OPS-001.HO-01", "WF-OPS-001.HO-02"],
          events: ["queue/audit/notification events"],
          success: ["Item resolved or decision-ready."],
          failure: ["Explicit blocked/aging state."],
          sources: [`${src.production} §8.9`, `${src.core} §18.3`],
        })
      ),
      segment(
        "WF-OPS-001.LADM.01",
        "Resolve escalated operational decisions",
        "LADM",
        "Operational authority",
        common({
          purpose:
            "Make final decisions and send explicit outcomes/follow-up back to operations.",
          trigger: "Decision-ready item is escalated.",
          steps: [
            "Review package.",
            "Approve/reject/override/release/reassign/request work within domain rules.",
            "Record reason.",
            "Return outcome.",
          ],
          inputs: ["Decision package."],
          outputs: ["Final outcome/follow-up."],
          states: ["ready_for_admin → decided/rerouted"],
          gates: ["Final authority and policy."],
          exceptions: ["Insufficient package returns for more work."],
          permissions: ["Lender Admin/Principal Broker."],
          upstream: ["WF-OPS-001.LOPS.01"],
          downstream: ["WF-OPS-001.LOPS.01"],
          handoffs: ["WF-OPS-001.HO-01", "WF-OPS-001.HO-02"],
          events: ["decision/override audit"],
          success: ["Authority-required item resolved."],
          failure: ["Specific follow-up remains assigned."],
          sources: [`${src.backoffice}`, `${src.core} §18.3`],
        })
      ),
      segment(
        "WF-OPS-001.SYS.01",
        "Aggregate portfolio risk and queue state",
        "SYS",
        "Operational projection",
        common({
          purpose:
            "Compute organization-wide actionable views and route domain events without duplicating canonical records.",
          trigger: "Domain event or dashboard query.",
          steps: [
            "Aggregate/join scoped records.",
            "Derive risk/urgency.",
            "Materialize/route work and notification.",
            "Track assignments/aging/resolution.",
          ],
          inputs: ["Organization-scoped domain records/events."],
          outputs: ["Portfolio/queue projections and alerts."],
          states: ["Derived queue lifecycle."],
          gates: ["Tenant scope and canonical domain state."],
          exceptions: ["Stale projection/retry remains observable."],
          permissions: [
            "System; builders/contractors excluded from backoffice reads.",
          ],
          upstream: ["WF-BLD-001", "WF-MIL-001", "WF-DRW-001"],
          downstream: ["WF-COM-001"],
          handoffs: [],
          events: ["queue/notification/outbox"],
          success: ["Actionable consistent operations view."],
          failure: [
            "Source record remains canonical; projection error observable.",
          ],
          sources: [`${src.backoffice}`, `${src.production} §8.9`],
        })
      ),
    ],
  },
];
