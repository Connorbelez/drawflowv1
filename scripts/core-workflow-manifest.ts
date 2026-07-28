import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Status = "SUPPORTED" | "NEEDS_VALIDATION";
type PersonaCode =
  | "PADM"
  | "LADM"
  | "BRKR"
  | "LOPS"
  | "BLDR"
  | "CNTR"
  | "INSP"
  | "TADM"
  | "SYS";

type Handoff = {
  id: string;
  from: PersonaCode;
  to: PersonaCode;
  trigger: string;
  artifacts: string;
  acknowledgement: string;
};

type Entry = {
  id: string;
  name: string;
  persona: PersonaCode | "CROSS";
  category: string;
  parentWorkflowId?: string;
  purpose: string;
  preconditions: string[];
  trigger: string;
  steps: string[];
  inputs: string[];
  outputs: string[];
  states: string[];
  gates: string[];
  exceptions: string[];
  permissions: string[];
  upstream: string[];
  downstream: string[];
  handoffs: string[];
  events: string[];
  success: string[];
  failure: string[];
  sources: string[];
  status?: Status;
  validationNote?: string;
};

type ParentWorkflow = Entry & {
  persona: "CROSS";
  participants: PersonaCode[];
  handoffDefinitions: Handoff[];
  segments: Entry[];
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "docs/core-product-workflow-manifest.md");

const personas: Record<PersonaCode, { name: string; definition: string }> = {
  PADM: { name: "Platform Admin", definition: "FairLend platform-level tenant provisioning, cross-brokerage transfer, support, and platform audit authority." },
  LADM: { name: "Lender Admin / Principal Broker", definition: "Organization-scoped final authority for proposal closing, milestone decisions, policy overrides, material revisions, and draw release." },
  BRKR: { name: "Broker", definition: "Assigned relationship owner who onboards builders, manages assigned proposals/builds, and coordinates operational work without inheriting final authority." },
  LOPS: { name: "Lender Operations / Backoffice Staff", definition: "Brokerage operators who claim queues, review evidence, request information or visits, prepare packages, and recommend decisions." },
  BLDR: { name: "Builder", definition: "Builder/developer principal and permissioned builder staff. Role constraints within a segment identify lead-only or staff-permitted actions." },
  CNTR: { name: "Contractor", definition: "Contractor profile/account holder participating only in assigned proposal, build, milestone, schedule, and supporting-evidence scope." },
  INSP: { name: "Site Visit Staff / Inspector", definition: "Internal, contracted, or external field verifier with assignment/token-scoped access and recommendation-only authority." },
  TADM: { name: "Technical / Organization Admin", definition: "Organization-scoped integration administrator for API keys, webhooks, subscriptions, secrets, mappings, and delivery diagnostics." },
  SYS: { name: "DrawFlow System", definition: "Automated actor for validation, optimization, state projection, notification, audit/outbox creation, geofence checks, and integration delivery." },
};

const src = {
  core: "docs/draw_flow_prd.md",
  production: "docs/draw_flow_production_prd.md",
  proposal: "docs/production-foundation-proposal-flow-prd.md",
  proposalImpl: "docs/production-foundation-proposal-flow-implementation.md",
  contractor: "docs/contractor-workspace-prd.md",
  drawRequest: "docs/builder-draw-request-workspace.md",
  materials: "docs/build-material-planning.md",
  notifications: "docs/notification-system-prd.md",
  calendar: "docs/drawflow-calendar-tab-prd.md",
  backoffice: "docs/drawflow-demo/backoffice-site-visits-and-builds-prd.md",
  evidenceVisit: "docs/drawflow-demo/evidence-site-visit-screen-prd.md",
  screens: "docs/uiManifest/screenManifest.md",
  auth: "docs/auth-rbac-foundation.md",
};

function segment(
  id: string,
  name: string,
  persona: PersonaCode,
  category: string,
  details: Omit<Entry, "id" | "name" | "persona" | "category" | "parentWorkflowId">,
): Entry {
  return { id, name, persona, category, parentWorkflowId: id.split(".")[0], ...details };
}

function common(
  details: Partial<Omit<Entry, "id" | "name" | "persona" | "category">>,
): Omit<Entry, "id" | "name" | "persona" | "category" | "parentWorkflowId"> {
  return {
    purpose: details.purpose ?? "Participate in the parent workflow within the persona's authority boundary.",
    preconditions: details.preconditions ?? ["The actor is authenticated in the correct WorkOS organization and the target record is organization-scoped."],
    trigger: details.trigger ?? "The preceding workflow state makes this segment actionable.",
    steps: details.steps ?? [],
    inputs: details.inputs ?? [],
    outputs: details.outputs ?? [],
    states: details.states ?? [],
    gates: details.gates ?? [],
    exceptions: details.exceptions ?? [],
    permissions: details.permissions ?? [],
    upstream: details.upstream ?? [],
    downstream: details.downstream ?? [],
    handoffs: details.handoffs ?? [],
    events: details.events ?? [],
    success: details.success ?? [],
    failure: details.failure ?? [],
    sources: details.sources ?? [],
    status: details.status ?? "SUPPORTED",
    validationNote: details.validationNote,
  };
}

const workflows: ParentWorkflow[] = [
  {
    id: "WF-TEN-001",
    name: "Brokerage Provisioning and Principal Authority Activation",
    persona: "CROSS",
    category: "Tenancy and identity",
    purpose: "Provision one organization-scoped brokerage with exactly one active Principal Broker before product operations begin.",
    preconditions: ["Platform Admin is authenticated with platform scope.", "No conflicting active brokerage or Principal Broker assignment exists."],
    trigger: "Platform Admin elects to provision a brokerage or replace its Principal Broker.",
    steps: ["Create the brokerage and WorkOS Organization.", "Invite the first Principal Broker.", "Principal Broker accepts and establishes an active membership.", "Activate the brokerage only after the principal is active.", "Record provisioning and authority assignment."],
    inputs: ["Brokerage identity and organization metadata.", "Principal Broker identity/email.", "Replacement reason when transferring principal authority."],
    outputs: ["WorkOS Organization.", "Active brokerage.", "Single active Principal Broker assignment.", "Audit history."],
    states: ["brokerage: unprovisioned → pending_principal → active", "principal invitation: pending → accepted/expired/revoked", "replacement: prior_active → historical; new_pending → active"],
    gates: ["A brokerage cannot activate without one active Principal Broker.", "A brokerage cannot have two active Principal Brokers."],
    exceptions: ["Expired/revoked invitation is reissued.", "Duplicate principal assignment is rejected.", "Principal transfer preserves historical authority."],
    permissions: ["Only Platform Admin provisions brokerages or performs platform-level principal replacement.", "Principal acceptance is limited to the invited identity."],
    upstream: [],
    downstream: ["WF-TEN-002", "WF-INT-001"],
    handoffs: ["WF-TEN-001.HO-01", "WF-TEN-001.HO-02"],
    events: ["WorkOS organization/invitation events.", "Brokerage provisioned/activated audit events.", "Principal assigned/replaced audit events."],
    success: ["Brokerage is active with exactly one active Principal Broker and complete audit history."],
    failure: ["Brokerage remains pending/inactive; no organization-scoped product work may start."],
    sources: [`${src.production} §4.1–4.2, §8.1`, `${src.auth} (WorkOS organization and RBAC foundation)`],
    status: "SUPPORTED",
    participants: ["PADM", "LADM", "SYS"],
    handoffDefinitions: [
      { id: "WF-TEN-001.HO-01", from: "PADM", to: "LADM", trigger: "Principal invitation is created.", artifacts: "Brokerage identity, WorkOS Organization invitation, assigned principal role, expiry metadata.", acknowledgement: "Invitee accepts through WorkOS/AuthKit and obtains active organization membership." },
      { id: "WF-TEN-001.HO-02", from: "SYS", to: "PADM", trigger: "Principal membership becomes active or the invitation fails/expires.", artifacts: "Membership/role sync result, brokerage activation eligibility, failure metadata.", acknowledgement: "Platform Admin verifies activation or reissues/repairs the assignment." },
    ],
    segments: [
      segment("WF-TEN-001.PADM.01", "Provision brokerage and assign Principal Broker", "PADM", "Tenant provisioning", common({
        purpose: "Create the tenant boundary and initiate its accountable authority assignment.",
        trigger: "A new brokerage is approved for DrawFlow or principal authority must transfer.",
        steps: ["Enter brokerage metadata.", "Create/confirm the WorkOS Organization.", "Invite or replace the Principal Broker.", "Review activation result and audit trail."],
        inputs: ["Brokerage metadata.", "Principal identity.", "Transfer reason when applicable."], outputs: ["Pending/active brokerage.", "Principal invitation/assignment."],
        states: ["unprovisioned → pending_principal → active"], gates: ["Exactly one active principal."], exceptions: ["Invitation expiry, duplicate principal, failed WorkOS sync."],
        permissions: ["Platform Admin only; support access does not bypass audit."], downstream: ["WF-TEN-001.LADM.01", "WF-TEN-002"], handoffs: ["WF-TEN-001.HO-01", "WF-TEN-001.HO-02"],
        events: ["brokerage.provisioned", "principal.invited", "principal.replaced", "audit event"], success: ["Tenant is active and accountable."], failure: ["Tenant remains inactive."], sources: [`${src.production} §8.1`],
      })),
      segment("WF-TEN-001.LADM.01", "Accept principal authority", "LADM", "Tenant activation", common({
        purpose: "Accept the organization invitation and establish the brokerage's first active authority.", trigger: "WorkOS invitation arrives.",
        steps: ["Open invitation.", "Authenticate/accept membership.", "Confirm Principal Broker role is synchronized.", "Enter the brokerage workspace."],
        inputs: ["Invitation and invited identity."], outputs: ["Active organization membership and principal assignment."], states: ["invited → accepted → active"],
        gates: ["Authenticated email/identity must match invitation and role sync must complete."], exceptions: ["Expired, revoked, mismatched, or sync-pending invitation."], permissions: ["Invited Principal Broker only."],
        upstream: ["WF-TEN-001.PADM.01"], downstream: ["WF-TEN-002", "WF-PRP-001"], handoffs: ["WF-TEN-001.HO-01"], events: ["WorkOS invitation accepted", "membership synchronized"],
        success: ["Principal authority is active."], failure: ["No product authority is granted."], sources: [`${src.production} §8.1`],
      })),
      segment("WF-TEN-001.SYS.01", "Synchronize principal membership and activate tenant", "SYS", "Identity synchronization", common({
        purpose: "Project webhook-owned WorkOS identity state and enforce brokerage activation invariants.", trigger: "WorkOS organization/invitation/membership event is received.",
        steps: ["Project the WorkOS event.", "Verify one active Principal Broker.", "Activate or keep brokerage pending.", "Write audit result."],
        inputs: ["WorkOS webhook event."], outputs: ["Projection rows, brokerage activation state, audit event."], states: ["pending_principal → active or pending_principal"], gates: ["Webhook-owned identity tables are not directly mutated by product flows."],
        exceptions: ["Out-of-order/duplicate webhook, missing role, multiple principals."], permissions: ["System/webhook sync only."], upstream: ["WF-TEN-001.LADM.01"], downstream: ["WF-TEN-002"], handoffs: ["WF-TEN-001.HO-02"],
        events: ["identity projection and brokerage activation audit"], success: ["Consistent active tenancy."], failure: ["Activation withheld and repair remains actionable."], sources: [`${src.production} §5, §8.1`, `${src.auth}`],
      })),
    ],
  },
  {
    id: "WF-COM-001",
    name: "Actionable Notification Inbox and Resolution",
    persona: "CROSS",
    category: "Notifications",
    purpose: "Deliver selective organization-scoped action/update notifications to the correct recipient and resolve them from canonical domain outcomes rather than treating notifications as workflow state.",
    preconditions: ["A supported domain event occurs and recipient resolver can materialize scoped deliveries."], trigger: "Proposal, milestone, draw, site visit, missing-info, location, or facility event matches the V1 taxonomy.",
    steps: ["Create/dedupe canonical notification.", "Materialize per-recipient deliveries with actor exclusion.", "Deliver mandatory in-app channel and optional external attempts.", "Recipient opens/reads/dismisses and follows actionHref.", "Domain mutation completes or rejects action.", "Resolve delivery from canonical domain state."],
    inputs: ["Domain event, organization/entity/actor/payload, recipient resolution, preferences/channel configuration."], outputs: ["Canonical notification, recipient deliveries/attempts, read/dismissed/resolved state, action navigation."],
    states: ["delivery: unread → read; active → dismissed; unresolved → resolved", "external attempt: queued → delivered/failed/retried", "notification state never replaces domain state"],
    gates: ["Authenticated delivery-first reads for viewer only.", "action_required/warning mandatory in-app.", "Selective event taxonomy/dedupe/actor exclusion."],
    exceptions: ["No eligible recipient, duplicate/no-op event, external delivery failure, stale action link, unauthorized access."],
    permissions: ["Recipients read/mutate own delivery rows.", "Domain mutations resolve canonical notifications.", "No broad canonical notification query from public inbox."],
    upstream: ["WF-PRP-001", "WF-BLD-001", "WF-MIL-001", "WF-DRW-001", "WF-BUD-001", "WF-CAL-001", "WF-CTR-001", "WF-CTR-002"], downstream: ["WF-PRP-001", "WF-MIL-001", "WF-DRW-001", "WF-BUD-001", "WF-CTR-002"], handoffs: ["WF-COM-001.HO-01", "WF-COM-001.HO-02", "WF-COM-001.HO-03"],
    events: ["Notification/delivery/attempt lifecycle; read/dismiss; domain-driven resolution. Ordinary audit/no-op/token-open/webhook-attempt events do not create inbox items."], success: ["Correct recipient reaches and completes the canonical next action; delivery resolves."], failure: ["Delivery remains unread/unresolved or external attempt fails visibly; domain record remains authoritative."],
    sources: [`${src.notifications} §3–§13`, `${src.contractor} §10`], status: "SUPPORTED",
    participants: ["SYS", "BLDR", "LOPS", "LADM", "CNTR"],
    handoffDefinitions: [
      { id: "WF-COM-001.HO-01", from: "SYS", to: "BLDR", trigger: "Builder-audience event is materialized (changes/missing info/rejection/release/etc.).", artifacts: "Category, title/body, entity context, event time, actionHref, resolution semantics.", acknowledgement: "Builder reads/dismisses and, when actionable, completes the linked domain step." },
      { id: "WF-COM-001.HO-02", from: "SYS", to: "LOPS", trigger: "Backoffice action-required/warning event is materialized.", artifacts: "Proposal/build/work context, category, assignment metadata, actionHref, resolution semantics.", acknowledgement: "Operations claims/reviews the canonical work and domain outcome resolves the notification." },
      { id: "WF-COM-001.HO-03", from: "SYS", to: "CNTR", trigger: "Contractor assignment/schedule/evidence/onboarding event requires attention.", artifacts: "Assigned scope/profile/evidence context, required response, action link, outcome/reason.", acknowledgement: "Contractor acknowledges, revises, claims, or addresses feedback in the canonical workflow." },
    ],
    segments: [
      segment("WF-COM-001.BLDR.01", "Triage builder notifications", "BLDR", "Builder inbox", common({purpose:"Receive status and act on proposal/build/milestone/draw tasks.",trigger:"Builder delivery appears.",steps:["Open inbox.","Filter/action required.","Read context.","Follow action.","Complete canonical workflow.","Dismiss/read as appropriate."],inputs:["Builder delivery."],outputs:["Read/dismiss plus domain response."],states:["unread/unresolved → read/resolved"],gates:["Own delivery and builder-accessible action."],exceptions:["Stale/unauthorized link."],permissions:["Authenticated builder recipient."],upstream:["WF-COM-001.SYS.01"],downstream:["WF-PRP-001","WF-MIL-001","WF-DRW-001","WF-BUD-001"],handoffs:["WF-COM-001.HO-01"],events:["delivery read/dismiss; domain resolution"],success:["Action completed/resolved."],failure:["Delivery remains actionable."],sources:[`${src.notifications} §8.2, §11`]})),
      segment("WF-COM-001.LOPS.01", "Triage backoffice notifications", "LOPS", "Backoffice inbox", common({purpose:"Convert actionable deliveries into claimed canonical work.",trigger:"Backoffice delivery appears.",steps:["Open/filter inbox.","Review entity/assignment.","Follow action.","Claim/perform domain work.","Let domain outcome resolve delivery."],inputs:["Backoffice delivery."],outputs:["Claim/action/read/resolution."],states:["unread/unresolved → read/resolved"],gates:["Viewer delivery; organization work access."],exceptions:["Unassigned/stale/authority-only routes."],permissions:["Authenticated backoffice recipient."],upstream:["WF-COM-001.SYS.01"],downstream:["WF-OPS-001"],handoffs:["WF-COM-001.HO-02"],events:["read/claim/domain resolution"],success:["Work owned/resolved."],failure:["Unresolved item remains visible."],sources:[`${src.notifications} §8.1, §11`]})),
      segment("WF-COM-001.LADM.01", "Consume authority notifications", "LADM", "Admin inbox", common({purpose:"Open final-decision/release/override work from a scoped delivery.",trigger:"Authority-targeted delivery appears.",steps:["Review delivery/context.","Open canonical package.","Decide or route more work.","Confirm resolution."],inputs:["Authority delivery/package."],outputs:["Domain decision and resolved delivery."],states:["unresolved → resolved"],gates:["Final authority and domain policy."],exceptions:["Insufficient package."],permissions:["Lender Admin recipient."],upstream:["WF-COM-001.SYS.01"],downstream:["WF-PRP-001","WF-MIL-001","WF-DRW-001","WF-BUD-001"],handoffs:[],events:["read/domain decision"],success:["Decision delivery resolves."],failure:["Follow-up remains explicit."],sources:[`${src.notifications}`]})),
      segment("WF-COM-001.CNTR.01", "Act on contractor notifications", "CNTR", "Contractor inbox", common({purpose:"Respond to onboarding, assignment, schedule, and evidence feedback.",trigger:"Contractor notification arrives.",steps:["Open action.","Review scoped context.","Acknowledge/revise/claim/address.","Confirm canonical state."],inputs:["Contractor delivery."],outputs:["Canonical contractor response."],states:["unresolved → resolved by contractor workflow"],gates:["Active/appropriate onboarding identity and scoped action."],exceptions:["Revoked/expired/removed scope."],permissions:["Target contractor only."],upstream:["WF-COM-001.SYS.01"],downstream:["WF-CTR-001","WF-CTR-002"],handoffs:["WF-COM-001.HO-03"],events:["contractor delivery/domain response"],success:["Requested action completed."],failure:["Action remains unresolved or terminally invalid."],sources:[`${src.contractor} §10`]})),
      segment("WF-COM-001.SYS.01", "Create, deliver, dedupe, and resolve notifications", "SYS", "Notification service", common({purpose:"Materialize selective recipient deliveries and derive resolution from domain truth.",trigger:"Supported domain event.",steps:["Validate taxonomy/scope.","Dedupe.","Resolve recipients/exclude actor.","Create deliveries/attempts.","Serve delivery-first inbox.","Resolve from domain outcome."],inputs:["Domain event and recipient/preference context."],outputs:["Notification/deliveries/attempts."],states:["unread/read/dismissed/resolved; attempts queued/delivered/failed"],gates:["Mandatory in-app categories; tenant/recipient scope."],exceptions:["No recipient/duplicate/external failure."],permissions:["System; public users only own deliveries."],upstream:["WF-PRP-001","WF-MIL-001","WF-DRW-001"],downstream:[],handoffs:["WF-COM-001.HO-01","WF-COM-001.HO-02","WF-COM-001.HO-03"],events:["notification service events"],success:["Correct deliveries and resolution."],failure:["Retryable delivery failure without domain corruption."],sources:[`${src.notifications} §4–§13`]})),
    ],
  },
  {
    id: "WF-INT-001",
    name: "API/Webhook Configuration, Lifecycle Delivery, and Failure Review",
    persona: "CROSS",
    category: "Integrations",
    purpose: "Configure tenant-scoped integrations and deliver signed lifecycle events with observable logs without weakening domain authorization or audit.",
    preconditions: ["Organization is active and Technical Admin is authorized."], trigger: "Technical Admin creates/changes API key, endpoint, subscription, secret, or external mapping; or a subscribed lifecycle event enters outbox.",
    steps: ["Configure credentials/endpoint/subscriptions/mappings.", "Validate and confirm dangerous changes.", "Persist organization-scoped configuration and audit.", "Publish subscribed outbox event with signature and stable identifiers.", "Record delivery result/log.", "Technical Admin reviews failure and retries/repairs configuration according to supported controls."],
    inputs: ["API key/webhook endpoint/events/signing secret/external mappings.", "Organization-scoped lifecycle event/outbox payload."], outputs: ["Secure config, signed delivery attempt/log, external mapping, retry/repair outcome."],
    states: ["endpoint/config: draft/active/disabled", "delivery: pending → delivered/failed/retry_pending", "secret/key: active → rotated/revoked"],
    gates: ["Organization scope, secret protection, event subscription, signing, dangerous-change confirmation, audit."],
    exceptions: ["Invalid endpoint/secret/event, delivery timeout/non-2xx, duplicate/out-of-order delivery, mapping failure, revoked credential."],
    permissions: ["Technical/Organization Admin configures.", "System delivers.", "External systems receive only subscribed tenant-scoped payloads."],
    upstream: ["WF-PRP-001", "WF-MIL-001", "WF-DRW-001", "WF-BUD-001"], downstream: [], handoffs: ["WF-INT-001.HO-01", "WF-INT-001.HO-02"],
    events: ["Config/key/secret/mapping audit.", "Lifecycle webhook events including proposal, milestone, evidence, site visit, draw, budget, build, policy where enabled.", "Delivery log/attempts (not inbox notifications)."], success: ["Subscribed lifecycle event is securely delivered and traceable."], failure: ["Failure is logged/retryable or config disabled; domain transaction remains committed and auditable."],
    sources: [`${src.core} §16–§17`, `${src.screens} SCR-028`, `${src.notifications} §8.3`], status: "NEEDS_VALIDATION",
    validationNote: "Configuration surface and registry requirements are specified, but retry/backoff/dead-letter policy and exact MVP event payload/version contract remain open in the core PRD.",
    participants: ["TADM", "SYS"],
    handoffDefinitions: [
      { id: "WF-INT-001.HO-01", from: "TADM", to: "SYS", trigger: "Integration configuration is saved/activated.", artifacts: "Organization, endpoint, subscriptions, signing-secret/key state, external mappings, confirmation/audit reason.", acknowledgement: "System validates/activates configuration or returns a specific error." },
      { id: "WF-INT-001.HO-02", from: "SYS", to: "TADM", trigger: "Delivery fails, secret/key nears invalid state, or log review is requested.", artifacts: "Event/delivery ID, endpoint, attempt time/status/error, payload metadata (secret-safe), retry/config action.", acknowledgement: "Technical Admin repairs/disables/rotates/retries using supported controls." },
    ],
    segments: [
      segment("WF-INT-001.TADM.01", "Configure and operate tenant integrations", "TADM", "Integration administration", common({purpose:"Securely configure webhooks/API state and resolve delivery failures.",trigger:"Integration setup/change or failed delivery.",steps:["Create/rotate/revoke key/secret.","Configure endpoint/subscriptions/mappings.","Confirm dangerous change.","Review delivery logs.","Repair/disable/retry as supported."],inputs:["Integration config and failure log."],outputs:["Active/disabled config and operator outcome."],states:["draft → active/disabled; key active → rotated/revoked"],gates:["Organization Admin authority, confirmation, secret handling."],exceptions:["Invalid endpoint/secret/mapping/failure."],permissions:["Technical/Organization Admin only."],upstream:["WF-TEN-001"],downstream:[],handoffs:["WF-INT-001.HO-01","WF-INT-001.HO-02"],events:["integration config audit"],success:["Secure active config/delivery repair."],failure:["Config disabled/failure remains logged."],sources:[`${src.screens} SCR-028`,`${src.core} §16`],status:"NEEDS_VALIDATION",validationNote:"Retry and payload-version controls need specification."})),
      segment("WF-INT-001.SYS.01", "Deliver signed lifecycle webhooks", "SYS", "Webhook delivery", common({purpose:"Publish subscribed tenant lifecycle events independently of committed domain transactions.",trigger:"Subscribed outbox event is ready.",steps:["Resolve config/subscription.","Build versioned payload/stable IDs.","Sign/send.","Record result.","Schedule supported retry or surface failure."],inputs:["Outbox event and config."],outputs:["Attempt/log/delivery result."],states:["pending → delivered/failed/retry_pending"],gates:["Tenant scope, subscription, signature, secret safety."],exceptions:["Network/non-2xx/timeout/revocation/duplicate."],permissions:["System only."],upstream:["WF-PRP-001","WF-MIL-001","WF-DRW-001","WF-BUD-001"],downstream:[],handoffs:["WF-INT-001.HO-01","WF-INT-001.HO-02"],events:["webhook delivery attempts/logs"],success:["Traceable delivered event."],failure:["Logged failure; domain state unaffected."],sources:[`${src.core} §16`,`${src.screens} SCR-028`],status:"NEEDS_VALIDATION",validationNote:"Backoff/dead-letter and exact payload schema are unresolved."})),
    ],
  },
  {
    id: "WF-OPS-001",
    name: "Backoffice Portfolio and Work-Queue Triage",
    persona: "CROSS",
    category: "Lender operations",
    purpose: "Continuously turn cross-build risk and queued domain work into claimed, prioritized, authority-correct next actions.",
    preconditions: ["Organization has active proposals/builds and work queues.", "Operator has backoffice access."],
    trigger: "Operator opens dashboard/portfolio/site-visit/kanban surface or a new work/risk event arrives.",
    steps: ["Filter/sort portfolio and queues by urgency/risk/assignment.", "Open full Build/milestone/draw/evidence/visit context.", "Claim/assign/annotate.", "Perform non-final action: request info/visit, review evidence, prepare package/recommendation.", "Escalate final decision/override/release to Lender Admin.", "Track acknowledgement/outcome and close/reroute item."],
    inputs: ["Proposal/evidence/missing-info/site-visit/admin/draw/receipt work items.", "Build health, schedule, capital, geofence, token expiry, assignment."], outputs: ["Claim/assignment/recommendation/escalation/closure and portfolio audit."],
    states: ["new/unassigned → claimed/in_review → waiting/requested/ready_for_admin → resolved/closed or rerouted"],
    gates: ["Organization/assignment access.", "Staff actions stop at recommendation/preparation.", "Reason required for material actions."],
    exceptions: ["No assignee, expiring token, stale/missing info, geofence warning, authority-only action, failed settlement, cross-build workload aging."],
    permissions: ["Broker/Backoffice non-destructive write according to assignment.", "Lender Admin final authority/override/release.", "Builders/contractors cannot access backoffice surfaces."],
    upstream: ["WF-PRP-001", "WF-BLD-001", "WF-MIL-001", "WF-DRW-001", "WF-BUD-001"], downstream: ["WF-MIL-001", "WF-DRW-001", "WF-BUD-001", "WF-COM-001"], handoffs: ["WF-OPS-001.HO-01", "WF-OPS-001.HO-02"],
    events: ["work claimed/assigned/routed/recommended/closed", "reasoned audit/outbox", "authority/assignee notifications"], success: ["Every material item has an accountable next action or terminal resolution."], failure: ["Item remains visibly overdue/blocked/unassigned; never hidden in comments/chat."],
    sources: [`${src.production} §8.9, §9.3, §9.6`, `${src.core} §18.2–18.3`, `${src.backoffice}`], status: "SUPPORTED",
    participants: ["BRKR", "LOPS", "LADM", "SYS"],
    handoffDefinitions: [
      { id: "WF-OPS-001.HO-01", from: "LOPS", to: "LADM", trigger: "A complete package is ready for final decision, override, cancellation, reassignment, or release.", artifacts: "Target domain record, all evidence/reports/recommendation, warnings, prior/new state preview, required reason/action.", acknowledgement: "Lender Admin claims/decides/routes the item." },
      { id: "WF-OPS-001.HO-02", from: "LADM", to: "LOPS", trigger: "Final decision or request for additional operational work is recorded.", artifacts: "Decision/reason, resulting states, follow-up assignment, notification/audit references.", acknowledgement: "Operations closes/reroutes queue items and performs requested follow-up." },
    ],
    segments: [
      segment("WF-OPS-001.BRKR.01", "Triage assigned builder portfolio", "BRKR", "Relationship operations", common({
        purpose: "Identify hot assigned builds/proposals and coordinate operational ownership.", trigger: "Dashboard cycle or alert.", steps: ["Review assigned portfolio health.", "Open next action.", "Assign/claim within authority.", "Coordinate builder/backoffice.", "Escalate final actions."], inputs: ["Assigned portfolio and work queues."], outputs: ["Prioritized/assigned work."], states: ["untriaged → assigned/routed"], gates: ["Assigned relationship and non-final authority."], exceptions: ["Unassigned/cross-brokerage/authority-only."], permissions: ["Broker scoped to assigned work."], upstream: ["WF-TEN-002", "WF-BLD-001"], downstream: ["WF-OPS-001.LOPS.01"], handoffs: [], events: ["assignment/triage audit"], success: ["Assigned risks have owners."], failure: ["Escalated visible exception."], sources: [`${src.production} §9.3`, `${src.backoffice}`],
      })),
      segment("WF-OPS-001.LOPS.01", "Operate cross-build work queues", "LOPS", "Queue operations", common({
        purpose: "Claim, investigate, and prepare domain work for resolution.", trigger: "New/aging/assigned work appears.", steps: ["Filter/claim.", "Review full context.", "Perform permitted request/review/assignment action.", "Capture recommendation/reason.", "Escalate or close/reroute."], inputs: ["Work item and domain context."], outputs: ["Recommendation/escalation/closure."], states: ["new → claimed/in_review → ready/waiting/resolved"], gates: ["No final milestone approval/draw release/silent override."], exceptions: ["Missing info, unassigned visit, expired token, location warning, failed receipt."], permissions: ["Backoffice/Broker staff non-destructive authority."], upstream: ["WF-BLD-001.LOPS.01", "WF-MIL-001.LOPS.01", "WF-DRW-001.LOPS.01"], downstream: ["WF-OPS-001.LADM.01"], handoffs: ["WF-OPS-001.HO-01", "WF-OPS-001.HO-02"], events: ["queue/audit/notification events"], success: ["Item resolved or decision-ready."], failure: ["Explicit blocked/aging state."], sources: [`${src.production} §8.9`, `${src.core} §18.3`],
      })),
      segment("WF-OPS-001.LADM.01", "Resolve escalated operational decisions", "LADM", "Operational authority", common({
        purpose: "Make final decisions and send explicit outcomes/follow-up back to operations.", trigger: "Decision-ready item is escalated.", steps: ["Review package.", "Approve/reject/override/release/reassign/request work within domain rules.", "Record reason.", "Return outcome."], inputs: ["Decision package."], outputs: ["Final outcome/follow-up."], states: ["ready_for_admin → decided/rerouted"], gates: ["Final authority and policy."], exceptions: ["Insufficient package returns for more work."], permissions: ["Lender Admin/Principal Broker."], upstream: ["WF-OPS-001.LOPS.01"], downstream: ["WF-OPS-001.LOPS.01"], handoffs: ["WF-OPS-001.HO-01", "WF-OPS-001.HO-02"], events: ["decision/override audit"], success: ["Authority-required item resolved."], failure: ["Specific follow-up remains assigned."], sources: [`${src.backoffice}`, `${src.core} §18.3`],
      })),
      segment("WF-OPS-001.SYS.01", "Aggregate portfolio risk and queue state", "SYS", "Operational projection", common({
        purpose: "Compute organization-wide actionable views and route domain events without duplicating canonical records.", trigger: "Domain event or dashboard query.", steps: ["Aggregate/join scoped records.", "Derive risk/urgency.", "Materialize/route work and notification.", "Track assignments/aging/resolution."], inputs: ["Organization-scoped domain records/events."], outputs: ["Portfolio/queue projections and alerts."], states: ["Derived queue lifecycle."], gates: ["Tenant scope and canonical domain state."], exceptions: ["Stale projection/retry remains observable."], permissions: ["System; builders/contractors excluded from backoffice reads."], upstream: ["WF-BLD-001", "WF-MIL-001", "WF-DRW-001"], downstream: ["WF-COM-001"], handoffs: [], events: ["queue/notification/outbox"], success: ["Actionable consistent operations view."], failure: ["Source record remains canonical; projection error observable."], sources: [`${src.backoffice}`, `${src.production} §8.9`],
      })),
    ],
  },
  {
    id: "WF-CAL-001",
    name: "Calendar Scheduling, Material Change, Reminder, and Export",
    persona: "CROSS",
    category: "Scheduling and coordination",
    purpose: "Provide role-aware proposal/build scheduling, impact preview, audited material edits, reminders, and scoped external calendar export without mutating immutable actual events.",
    preconditions: ["Proposal or active Build events exist and viewer can access them."], trigger: "User views/edits a projected event, schedules a visit/coordination event, or subscribes/exports calendar data.",
    steps: ["Project/filter calendar events.", "Open detail/context action.", "Preview dependency/draw/working-capital impact for material change.", "Capture reason when required and commit legal mutation.", "Notify/seek acknowledgement from affected participants.", "Create reminders or tokenized scoped ICS/export/sync subscription."],
    inputs: ["Proposal/build/milestone/draw/evidence/visit events, edit/action, reason, reminder/export scope."], outputs: ["Updated domain dates/actions, variance/audit, acknowledgements/reminders, ICS/webhook/export state."],
    states: ["planned/proposed dates editable by authority; immutable actual timestamps remain immutable", "reminder: scheduled → delivered/cancelled", "acknowledgement follows `WF-CTR-002`"],
    gates: ["Impact preview before material edit.", "Reason/prior-new audit.", "Role-aware disabled states.", "No silent direct facility/payback edit."],
    exceptions: ["Illegal dependency/date change, stale concurrent edit, immutable event, denied role, expired subscription token, failed reminder."],
    permissions: ["Builder edits permitted own dates.", "Backoffice/admin actions by authority.", "Contractor sees assigned scope.", "Inspector sees assigned visits."],
    upstream: ["WF-PRP-001", "WF-BLD-001", "WF-CTR-002", "WF-MIL-001"], downstream: ["WF-BLD-001", "WF-CTR-002", "WF-MIL-001", "WF-COM-001"], handoffs: ["WF-CAL-001.HO-01", "WF-CAL-001.HO-02", "WF-CAL-001.HO-03"],
    events: ["Schedule changed, reasoned audit, acknowledgement requested, reminder delivery, site-visit scheduled/assigned/dispatched, export/webhook events."], success: ["All affected schedules/actions are consistent, acknowledged where required, and auditable."], failure: ["Edit/action rejected or reminder/export failure remains visible; canonical dates remain intact."],
    sources: [`${src.calendar} §7–§17, §23`, `${src.contractor} §8.6, §10`], status: "SUPPORTED",
    participants: ["BLDR", "CNTR", "LOPS", "LADM", "INSP", "SYS"],
    handoffDefinitions: [
      { id: "WF-CAL-001.HO-01", from: "BLDR", to: "CNTR", trigger: "Assigned milestone/submilestone date materially changes or acknowledgement is requested.", artifacts: "Old/new dates, dependency/assignment context, reason, acknowledgement action.", acknowledgement: "Contractor acknowledges/clarifies/disputes via `WF-CTR-002`." },
      { id: "WF-CAL-001.HO-02", from: "LOPS", to: "INSP", trigger: "Site visit is scheduled/assigned/dispatched.", artifacts: "Visit scope, date/time, site, token/assignment, checklist/prior evidence.", acknowledgement: "Inspector accepts/claims and performs `WF-MIL-001.INSP.01`." },
      { id: "WF-CAL-001.HO-03", from: "SYS", to: "BLDR", trigger: "Builder-visible reminder or schedule-impact notification is due.", artifacts: "Event/date/context, action link, impact/status.", acknowledgement: "Builder opens/acts or notification remains unread/unresolved according to `WF-COM-001`." },
    ],
    segments: [
      segment("WF-CAL-001.BLDR.01", "Plan and adjust builder schedule", "BLDR", "Calendar planning", common({purpose:"View and edit permitted proposal/build schedules with impact awareness.",trigger:"Builder opens calendar or changes a planned date.",steps:["Filter/view.","Open event.","Preview impact.","Enter reason when material.","Commit.","Review acknowledgements/reminders."],inputs:["Event/edit/reason."],outputs:["Updated date/variance/notifications."],states:["planned date old → new"],gates:["Own scope; dependency and immutable-actual rules."],exceptions:["Illegal/stale/denied edit."],permissions:["Builder by granular permission."],upstream:["WF-PRP-001","WF-BLD-001"],downstream:["WF-CTR-002"],handoffs:["WF-CAL-001.HO-01","WF-CAL-001.HO-03"],events:["schedule audit/notification"],success:["Legal schedule committed."],failure:["Prior schedule retained."],sources:[`${src.calendar} §8, §12`]})),
      segment("WF-CAL-001.CNTR.01", "Consume assigned contractor schedule", "CNTR", "Contractor calendar", common({purpose:"Track only assigned work and respond to material changes.",trigger:"Assignment/change/reminder arrives.",steps:["View assigned schedule/ICS.","Review change.","Acknowledge/clarify/dispute.","Track coordination event."],inputs:["Scoped schedule/change."],outputs:["Acknowledgement/clarification."],states:["pending acknowledgement → resolved"],gates:["Assigned scope/tokenized feed."],exceptions:["Revoked assignment/token."],permissions:["Contractor assigned scope only."],upstream:["WF-CAL-001.BLDR.01"],downstream:["WF-CTR-002.CNTR.01"],handoffs:["WF-CAL-001.HO-01"],events:["acknowledgement/reminder"],success:["Schedule understood."],failure:["Dispute visible."],sources:[`${src.contractor} §8.6`]})),
      segment("WF-CAL-001.LOPS.01", "Schedule operational work and visits", "LOPS", "Operations calendar", common({purpose:"Coordinate evidence/review/admin targets and site visits.",trigger:"Operational action needs scheduling.",steps:["Open event/work.","Schedule/assign/reschedule/cancel within authority.","Capture reason.","Dispatch token/notification.","Track acceptance."],inputs:["Work item/date/assignee/reason."],outputs:["Scheduled work/visit."],states:["requested → scheduled/assigned/cancelled"],gates:["Authority and immutable-actual rules."],exceptions:["No assignee, token expiry, authority-required cancel."],permissions:["Backoffice within non-final authority."],upstream:["WF-OPS-001"],downstream:["WF-MIL-001.INSP.01"],handoffs:["WF-CAL-001.HO-02"],events:["visit schedule/dispatch audit"],success:["Work has schedule/assignee."],failure:["Visible unscheduled exception."],sources:[`${src.calendar} §8.2, §11–§12`]})),
      segment("WF-CAL-001.INSP.01", "Accept scheduled site visit", "INSP", "Inspection scheduling", common({purpose:"Receive and act on assigned visit schedule.",trigger:"Visit dispatch arrives.",steps:["Review date/scope/site/token.","Accept/claim or surface conflict.","Open field workflow at visit time."],inputs:["Visit assignment."],outputs:["Claim/acceptance or conflict."],states:["assigned → claimed/in_progress"],gates:["Valid target assignment/token."],exceptions:["Expiry/conflict/cancellation."],permissions:["Assigned Inspector only."],upstream:["WF-CAL-001.LOPS.01"],downstream:["WF-MIL-001.INSP.01"],handoffs:["WF-CAL-001.HO-02"],events:["visit claimed"],success:["Visit proceeds."],failure:["Reassignment needed."],sources:[`${src.core} §11.5`]})),
      segment("WF-CAL-001.LADM.01", "Authorize material calendar actions", "LADM", "Schedule governance", common({purpose:"Perform or approve authority-gated schedule/visit/draw actions.",trigger:"Calendar action requires final authority.",steps:["Review event/impact.","Enter reason.","Approve/commit or reject.","Verify audit."],inputs:["Action/impact/reason."],outputs:["Governed domain mutation."],states:["pending authority → committed/rejected"],gates:["Lender Admin authority."],exceptions:["Policy/immutable event."],permissions:["Principal Broker/admin."],upstream:["WF-CAL-001.LOPS.01"],downstream:["WF-BLD-001","WF-MIL-001","WF-DRW-001"],handoffs:[],events:["authority action audit"],success:["Legal action committed."],failure:["Prior state retained."],sources:[`${src.calendar} §9.3, §12, §16`]})),
      segment("WF-CAL-001.SYS.01", "Project events, validate edits, and deliver reminders/exports", "SYS", "Calendar projection", common({purpose:"Unify domain events without duplicating canonical state and enforce edit/export scope.",trigger:"Calendar query/edit/reminder/export.",steps:["Project/filter.","Compute impact.","Validate/commit canonical mutation.","Write audit/notifications.","Deliver reminders/ICS/webhooks."],inputs:["Domain records and command."],outputs:["Projection/mutation/delivery."],states:["Derived event/reminder/subscription states."],gates:["Canonical domain mutation and token/tenant scope."],exceptions:["Stale edit/delivery/token failure."],permissions:["System under actor scope."],upstream:["WF-PRP-001","WF-BLD-001"],downstream:["WF-COM-001"],handoffs:["WF-CAL-001.HO-03"],events:["calendar/reminder/export/webhook"],success:["Consistent schedule/delivery."],failure:["Canonical state preserved; failure observable."],sources:[`${src.calendar} §13, §17, §21`]})),
    ],
  },
  {
    id: "WF-DRW-001",
    name: "Draw Request, Review, Approval, Release, and Receipt Confirmation",
    persona: "CROSS",
    category: "Draw disbursement",
    purpose: "Convert approved milestone value into an idempotent reimbursement request, obtain final release authority, record money-out/fees/interest only at release, and settle receipt exceptions.",
    preconditions: ["Active Build and loan/capital context exist.", "Milestone completion value has been approved under `WF-MIL-001`.", "Available-now balance is positive."],
    trigger: "Builder requests any valid amount up to available-now balance, or configured planning logic exposes an eligible draw action.",
    steps: ["Calculate facility-capped source-bucket availability in deterministic Milestone order, separately from planned forecast rows.", "Builder enters amount, reviews, and submits with idempotent operation ID.", "Create one Draw Release Work Order and immutable Milestone / Draw Group allocations whose sum equals the request.", "Operations transitions requested → in_review → ready_for_admin and records its recommendation; builder may withdraw while requested.", "Lender Admin transitions ready_for_admin → approved_for_release or rejected.", "Only approved_for_release is released/executed or recorded.", "Record release date/amount/fee treatment and start interest at funds_released.", "Notify builder and create receipt confirmation.", "Builder confirms, reports non-receipt, or reports discrepancy; operations resolves exceptions."],
    inputs: ["Approved Milestone drawAvailability source buckets, Draw Group attribution, facility principal/balance, persisted allocations.", "Requested amount/note/client operation ID.", "Evidence/milestone context, fees, interest implications, release result."],
    outputs: ["Authoritative activeBuildDrawRequest / Draw Release Work Order and immutable work-order key/history.", "Organization-scoped activeBuildDrawRequestAllocations with exact Milestone, Draw Group, amount, and order.", "Approval/rejection/withdrawal/release capital event.", "Receipt confirmation/exception task.", "Webhooks/audit/notifications."],
    states: ["requested → in_review → ready_for_admin → approved_for_release → released", "requested → withdrawn; ready_for_admin → rejected", "forecast plannedDrawScheduleRows remain planning-only"],
    gates: ["Amount ≤ available now, uses whole cents, and allocation sum equals amount.", "Operation ID is idempotent and cannot be reused for a different amount.", "Only requested can withdraw/start review; only in_review can become ready_for_admin; only ready_for_admin can approve/reject; only approved_for_release can release.", "Operations prepares/recommends; Lender Admin decides/releases; interest starts only when funds released."],
    exceptions: ["Over-limit/invalid amount, duplicate ID mismatch, loan availability block, rejection/withdrawal, payment execution failure, non-receipt, amount discrepancy."],
    permissions: ["Builder/authorized staff creates/withdraws own request.", "Operations prepares/recommends.", "Lender Admin approves/rejects/releases.", "Migration is explicit backoffice-only."],
    upstream: ["WF-MIL-001", "WF-PRP-001"], downstream: ["WF-COM-001", "WF-INT-001", "WF-OPS-001"], handoffs: ["WF-DRW-001.HO-01", "WF-DRW-001.HO-02", "WF-DRW-001.HO-03", "WF-DRW-001.HO-04", "WF-DRW-001.HO-05"],
    events: ["draw requested/review_started/ready_for_admin/approved_for_release/rejected/withdrawn/released", "capital event", "fee/interest start", "receipt confirmed/exception", "audit/outbox/webhooks/notifications"],
    success: ["Released reimbursement is recorded once, interest starts on release, and receipt is confirmed."], failure: ["Request is rejected/withdrawn/blocked or settlement exception remains assigned; balance/history remain correct."],
    sources: [`${src.drawRequest} §Domain separation–§Request lifecycle`, `${src.core} §8.1–8.3, §18.3.9–18.3.12, §23.1`, `${src.notifications} §8`],
    participants: ["BLDR", "LOPS", "LADM", "SYS"],
    handoffDefinitions: [
      { id: "WF-DRW-001.HO-01", from: "BLDR", to: "LOPS", trigger: "Idempotent Draw Release Work Order is submitted.", artifacts: "Request/work-order keys, amount, note, available/reserved/unlocked reconciliation, immutable Milestone / Draw Group source allocations.", acknowledgement: "Operations claims/reviews and prepares recommendation or requests correction." },
      { id: "WF-DRW-001.HO-02", from: "LOPS", to: "LADM", trigger: "Work order is ready_for_admin.", artifacts: "Work order, source allocations, approved milestones/evidence summary, amount, fee treatment, facility availability, interest implications, recommendation/warnings.", acknowledgement: "Lender Admin approves, rejects, or leaves blocked with reason." },
      { id: "WF-DRW-001.HO-03", from: "LADM", to: "SYS", trigger: "Release is authorized or rejection is recorded.", artifacts: "Decision, actor/reason, approved amount, fee treatment, execution/recording instruction.", acknowledgement: "System records final state/capital event or returns execution failure without duplicate money-out." },
      { id: "WF-DRW-001.HO-04", from: "SYS", to: "BLDR", trigger: "Funds release is recorded.", artifacts: "Released amount/date, fee treatment, request/reference, receipt-confirmation task; interest-start fact (not pre-release interest).", acknowledgement: "Builder confirms receipt or reports non-receipt/discrepancy." },
      { id: "WF-DRW-001.HO-05", from: "BLDR", to: "LOPS", trigger: "Builder reports non-receipt or amount discrepancy.", artifacts: "Request/release reference, expected/received amount, receipt status, notes/supporting proof.", acknowledgement: "Operations claims settlement exception, investigates, and records resolution/escalation." },
    ],
    segments: [
      segment("WF-DRW-001.BLDR.01", "Request reimbursement and confirm receipt", "BLDR", "Builder draws", common({
        purpose: "Request eligible reimbursement, optionally withdraw before decision, and close the loop on actual receipt.", trigger: "Available-now value is positive or release notification arrives.", steps: ["Review available balance/statement/forecasts.", "Enter amount and review.", "Submit with stable operation ID.", "Withdraw while requested if needed.", "Review decision/release.", "Confirm receipt or report exception."],
        inputs: ["Amount/note/idempotency ID and receipt result."], outputs: ["Request/work-order key, exact source allocations, withdrawal/receipt response."], states: ["requested → withdrawn or operations review; approved_for_release → released → receipt confirmed/exception"], gates: ["Draw permission, whole cents, within facility-capped approved Milestone availability."], exceptions: ["Over-limit, attribution mismatch, retry failure preserves input/ID, blocked user receives reason, non-receipt/discrepancy."], permissions: ["Builder Lead/authorized Builder Staff on own Build."],
        upstream: ["WF-MIL-001.BLDR.01"], downstream: ["WF-DRW-001.LOPS.01"], handoffs: ["WF-DRW-001.HO-01", "WF-DRW-001.HO-04", "WF-DRW-001.HO-05"], events: ["request/withdraw/receipt events and notifications"], success: ["Receipt confirmed."], failure: ["Closed rejection/withdrawal or open settlement exception."], sources: [`${src.drawRequest}`],
      })),
      segment("WF-DRW-001.LOPS.01", "Review request and resolve settlement exceptions", "LOPS", "Draw operations", common({
        purpose: "Prepare a complete release package and own non-receipt/discrepancy operations without final release authority.", trigger: "Request or receipt exception enters queue.", steps: ["Claim.", "Review eligibility/amount/evidence/facility/fees.", "Request correction or recommend decision.", "Send to authority.", "Investigate receipt exception and record resolution/escalation."],
        inputs: ["Request/release/receipt package."], outputs: ["Recommendation/release package or settlement resolution."], states: ["requested → in_review → ready_for_admin; exception open → resolved/escalated"], gates: ["Cannot final release; request state/amount revalidated."], exceptions: ["Loan availability, execution failure, discrepancy/non-receipt."], permissions: ["Backoffice/Broker within organization/assignment."],
        upstream: ["WF-DRW-001.BLDR.01"], downstream: ["WF-DRW-001.LADM.01"], handoffs: ["WF-DRW-001.HO-01", "WF-DRW-001.HO-02", "WF-DRW-001.HO-05"], events: ["review started/recommendation submitted/exception resolved"], success: ["Authority package complete or exception resolved."], failure: ["Blocked/escalated item remains visible."], sources: [`${src.production} §8.9`, `${src.core} §18.3.9–18.3.12`],
      })),
      segment("WF-DRW-001.LADM.01", "Approve, reject, and release draw", "LADM", "Draw authority", common({
        purpose: "Exercise final money-out authority after reviewing eligibility, fees, facility balance, and interest implications.", trigger: "Request/release package is ready.", steps: ["Review request/milestones/evidence/amount/fees/facility/interest.", "Approve or reject with required reason.", "Authorize release of approved request.", "Review execution result."],
        inputs: ["Ready-for-admin work order, source allocations, and decision/release instruction."], outputs: ["Approval/rejection/release authorization."], states: ["ready_for_admin → approved_for_release/rejected; approved_for_release → released"], gates: ["Lender Admin only; facility/eligibility; only legal state transitions."], exceptions: ["Availability block, policy concern, execution failure."], permissions: ["Principal Broker/admin final authority."],
        upstream: ["WF-DRW-001.LOPS.01"], downstream: ["WF-INT-001"], handoffs: ["WF-DRW-001.HO-02", "WF-DRW-001.HO-03"], events: ["decision/release audit and outbox"], success: ["Release recorded once."], failure: ["Rejected/blocked/failed with reason; no interest start before release."], sources: [`${src.core} §18.3.10`, `${src.drawRequest} §Request lifecycle`],
      })),
      segment("WF-DRW-001.SYS.01", "Calculate availability and record release", "SYS", "Draw ledger orchestration", common({
        purpose: "Maintain separate forecast and request/allocation ledgers, enforce idempotency and deterministic availability, record capital once, and drive receipt/webhook events.", trigger: "Availability query, request/review/decision/release/receipt command.", steps: ["Order approved Milestone source buckets and apply the facility cap.", "Subtract persisted allocations for reserving states.", "Validate/idempotently create the Draw Release Work Order and exact FIFO allocations.", "Apply legal review/decision transitions.", "Execute/record release once.", "Record fee/date/interest start.", "Create receipt task and emit events."],
        inputs: ["Organization-scoped Milestone/Draw Group/facility/request/allocation ledgers and authorized commands."], outputs: ["Work-order/allocation/capital/receipt records and events."], states: ["requested → in_review → ready_for_admin → approved_for_release → released; requested → withdrawn; ready_for_admin → rejected"], gates: ["Forecast never mutates into request; allocations sum exactly to request; released remains reserved; no duplicate capital event."], exceptions: ["ID mismatch, over-limit, attribution invariant failure, concurrent reservation, execution failure."], permissions: ["System under scoped authorized actor."],
        upstream: ["WF-MIL-001.SYS.01"], downstream: ["WF-COM-001", "WF-INT-001"], handoffs: ["WF-DRW-001.HO-03", "WF-DRW-001.HO-04"], events: ["draw lifecycle/capital/audit/outbox/webhook/notification"], success: ["Ledger reconciles exactly and receipt task exists."], failure: ["No duplicate/partial money-out; actionable failure recorded."], sources: [`${src.drawRequest} §Domain separation–§Request lifecycle`, `${src.core} §18.3.9–11, §23.1`],
      })),
    ],
  },
  {
    id: "WF-BUD-001",
    name: "Budget Revision and Draw Plan Recalculation",
    persona: "CROSS",
    category: "Budget governance",
    purpose: "Version material cost/schedule changes, recompute reimbursement feasibility, and obtain final lender approval without overwriting the approved Budget history.",
    preconditions: ["Active Build has an approved Budget version.", "Variance threshold/policy is available."],
    trigger: "Actual/projected cost variance breaches threshold, system recommends/requires revision, or builder manually requests revision.",
    steps: ["Flag recommended/required revision.", "Builder drafts revised milestone costs/durations and explanation.", "System recomputes Draw Plan/working-capital/policy impact.", "Builder submits.", "Lender Admin reviews and approves/rejects/requests changes.", "Approved revision creates new Budget version and supersedes prior active version in workspace while preserving history."],
    inputs: ["Current Budget version, actual/projected variance, revised costs/durations, explanation, recomputed plans/warnings."], outputs: ["Revision record/decision.", "New approved Budget version and updated active plan projection.", "Preserved historical versions/audit."],
    states: ["not_required → recommended/required → draft → submitted → under_review → approved/rejected; prior approved → superseded"],
    gates: ["Configured materiality threshold.", "Admin approval for material revision.", "No overwrite of historical Budget.", "Recomputed feasibility/policy review."],
    exceptions: ["Missing explanation/data, infeasible revised plan, changes requested, rejection, concurrent newer revision."],
    permissions: ["Builder drafts/submits own Build revision.", "Lender Admin final decision.", "Operations may support review but final authority stays admin."],
    upstream: ["WF-BLD-001", "WF-MIL-001", "WF-MAT-001"], downstream: ["WF-BLD-001", "WF-DRW-001", "WF-COM-001"], handoffs: ["WF-BUD-001.HO-01", "WF-BUD-001.HO-02", "WF-BUD-001.HO-03"],
    events: ["variance threshold/revision required, submitted/changes/approved/rejected/superseded audit/outbox/notifications."], success: ["New approved version and recomputed plan govern the workspace; history remains available."], failure: ["Revision is rejected/changes-requested; prior approved Budget remains governing and risk flag stays visible."],
    sources: [`${src.core} §8.9, §11.7, §15.4`, `${src.production} §8.8`], status: "SUPPORTED",
    participants: ["BLDR", "LADM", "SYS"],
    handoffDefinitions: [
      { id: "WF-BUD-001.HO-01", from: "SYS", to: "BLDR", trigger: "Variance threshold marks revision recommended/required.", artifacts: "Current Budget version, variance details, affected milestones/draws, required fields, deadline/policy warnings.", acknowledgement: "Builder opens revision and submits revised costs/durations/explanation." },
      { id: "WF-BUD-001.HO-02", from: "BLDR", to: "LADM", trigger: "Budget Revision is submitted.", artifacts: "Base version, revised milestone costs/durations, explanation, variance, recomputed plan options/working-capital/policy impacts.", acknowledgement: "Lender Admin moves under review and decides or requests changes." },
      { id: "WF-BUD-001.HO-03", from: "LADM", to: "BLDR", trigger: "Revision decision is recorded.", artifacts: "Approved/rejected/changes outcome, reason, new version/plan or requested corrections.", acknowledgement: "Builder adopts new active version or revises/resubmits while prior version remains governing." },
    ],
    segments: [
      segment("WF-BUD-001.BLDR.01", "Draft and submit Budget Revision", "BLDR", "Budget revision", common({
        purpose: "Explain material variance and propose revised milestone costs/durations.", trigger: "Revision flagged or builder requests it.", steps: ["Review variance/base version.", "Edit costs/durations.", "Explain change.", "Review recomputed plan/warnings.", "Submit.", "Respond to changes/decision."],
        inputs: ["Base Budget, revised values, explanation."], outputs: ["Submitted/revised revision."], states: ["recommended/required → draft → submitted; changes → draft"], gates: ["Own Build, required explanation, valid values."], exceptions: ["Infeasible plan, missing data, rejection."], permissions: ["Builder Lead/permissioned staff."],
        upstream: ["WF-BLD-001.BLDR.01"], downstream: ["WF-BUD-001.LADM.01"], handoffs: ["WF-BUD-001.HO-01", "WF-BUD-001.HO-02", "WF-BUD-001.HO-03"], events: ["revision drafted/submitted/resubmitted"], success: ["Approved new version."], failure: ["Prior Budget remains active."], sources: [`${src.core} §11.7`],
      })),
      segment("WF-BUD-001.LADM.01", "Review and decide Budget Revision", "LADM", "Budget approval", common({
        purpose: "Protect lender policy/capital exposure while approving a versioned change when justified.", trigger: "Revision submitted.", steps: ["Review base/variance/revised values/explanation.", "Review recomputed plans/working capital/policy.", "Approve, reject, or request changes with reason.", "Verify new active version on approval."],
        inputs: ["Revision package."], outputs: ["Decision and approved version instruction."], states: ["submitted → under_review → approved/rejected/changes_requested"], gates: ["Lender Admin authority and policy/feasibility."], exceptions: ["Infeasible/unsupported change or newer revision."], permissions: ["Lender Admin/Principal Broker."],
        upstream: ["WF-BUD-001.BLDR.01"], downstream: ["WF-BLD-001", "WF-DRW-001"], handoffs: ["WF-BUD-001.HO-02", "WF-BUD-001.HO-03"], events: ["revision decision/audit/notification"], success: ["New Budget version approved."], failure: ["Prior approved version remains."], sources: [`${src.core} §11.7`],
      })),
      segment("WF-BUD-001.SYS.01", "Detect variance, recompute plan, and version Budget", "SYS", "Budget orchestration", common({
        purpose: "Detect materiality, recalculate feasibility, and atomically create/switch versions without destroying history.", trigger: "Cost update, revision edit/submission, or decision.", steps: ["Calculate variance/threshold.", "Flag revision.", "Recompute plans.", "Persist revision/version states.", "On approval create new version and mark prior superseded.", "Emit events."],
        inputs: ["Costs, policy, working capital, revision commands."], outputs: ["Flags/plans/versions/events."], states: ["Per Budget Revision model."], gates: ["Version immutability and legal transitions."], exceptions: ["Concurrent/stale base, infeasible plan, transaction failure."], permissions: ["System under authorized actor."],
        upstream: ["WF-BLD-001.SYS.01"], downstream: ["WF-BLD-001", "WF-COM-001"], handoffs: ["WF-BUD-001.HO-01"], events: ["variance/revision/version audit/outbox/notifications"], success: ["Consistent governing version and history."], failure: ["Prior version remains and exception is visible."], sources: [`${src.core} §8.9, §15.4`],
      })),
    ],
  },
  {
    id: "WF-BLD-001",
    name: "Active Build Schedule, Progress, Cost, and Participant Management",
    persona: "CROSS",
    category: "Build execution",
    purpose: "Maintain the canonical live Build Workspace as field reality changes while preserving schedule/cost variance, approved versions, assignments, and downstream eligibility.",
    preconditions: ["Proposal is closed and active Build exists (`WF-PRP-001`).", "Actor has organization/build scope."],
    trigger: "Builder enters the live workspace or field reality changes progress, dates, costs, dependencies, notes, subtasks, contractors, or evidence.",
    steps: ["Review current roadmap/draw groups/next work.", "Update progress, dates, notes, subtasks, and in-progress evidence.", "Manage contractor assignments.", "Capture reason for material schedule/cost changes.", "Record variances and recompute plan impacts where required.", "Route threshold breaches to Budget Revision and completed work to Milestone Completion."],
    inputs: ["Active roadmap/Budget/Draw Plan.", "Progress, planned/actual dates, notes/subtasks/evidence.", "Actual/projected costs and contractor assignments."],
    outputs: ["Updated Build Workspace projection.", "Schedule/cost variance and assignment history.", "Recompute/notification/audit events.", "Eligibility to start `WF-MIL-001` or `WF-BUD-001`."],
    states: ["milestone: planned/blocked/ready → in_progress on_schedule/behind/critical → complete_pending_submission", "schedule variance records append; approved Budget is never overwritten"],
    gates: ["Dependencies and role permissions.", "Reason/audit for material changes.", "Actual immutable timestamps are not silently edited.", "Threshold/policy may require revision."],
    exceptions: ["Illegal dependency/date transition rejected.", "Variance breach creates revision work.", "Contractor scope dispute follows `WF-CTR-002`.", "Offline evidence remains pending sync."],
    permissions: ["Builder updates own Build within granular permissions.", "Contractor only assigned scope.", "Lender roles monitor/review; final decisions remain separate."],
    upstream: ["WF-PRP-001", "WF-MAT-001", "WF-CTR-002"], downstream: ["WF-MIL-001", "WF-BUD-001", "WF-CAL-001", "WF-OPS-001"], handoffs: ["WF-BLD-001.HO-01", "WF-BLD-001.HO-02", "WF-BLD-001.HO-03"],
    events: ["Progress/date/cost/assignment/evidence audit events.", "Schedule/variance/assignment notifications.", "Plan recompute/outbox events."], success: ["Live Build accurately reflects current execution and next required action."], failure: ["Invalid update is rejected or an explicit exception/revision work item is open."],
    sources: [`${src.core} §10, §11.3, §13.6–13.7`, `${src.production} §8.8`, `${src.calendar} §8.2, §12`], status: "SUPPORTED",
    participants: ["BLDR", "CNTR", "LOPS", "LADM", "SYS"],
    handoffDefinitions: [
      { id: "WF-BLD-001.HO-01", from: "BLDR", to: "CNTR", trigger: "Contractor assignment or material schedule/scope change is published.", artifacts: "Assigned milestone/submilestone, dates, dependencies, documents, acknowledgement request.", acknowledgement: "Contractor responds through `WF-CTR-002` acknowledgement/clarification state." },
      { id: "WF-BLD-001.HO-02", from: "SYS", to: "LOPS", trigger: "Schedule/cost/evidence condition creates operational risk or review need.", artifacts: "Build/milestone context, variance, behind/critical flag, working-capital/draw impact, actor/timestamp.", acknowledgement: "Operations triages/claims/escalates the item in `WF-OPS-001`." },
      { id: "WF-BLD-001.HO-03", from: "SYS", to: "LADM", trigger: "Material cost variance requires/recommends Budget Revision or a policy override.", artifacts: "Current approved Budget version, actual/projected variance, recomputed draw-plan impact, warnings.", acknowledgement: "Lender Admin routes/reviews `WF-BUD-001` or records an authorized override." },
    ],
    segments: [
      segment("WF-BLD-001.BLDR.01", "Maintain live Build execution", "BLDR", "Build workspace management", common({
        purpose: "Keep roadmap, progress, dates, costs, notes, evidence, and contractor scope current.", trigger: "Work starts/progresses or field conditions change.", steps: ["Review next milestones/dependencies.", "Update progress/dates/notes/subtasks.", "Upload in-progress evidence.", "Manage contractors.", "Enter actual/projected cost and reasoned changes.", "Start completion or revision workflow when indicated."],
        inputs: ["Field progress/schedule/cost/evidence."], outputs: ["Current Build state and routed next actions."], states: ["planned/ready/blocked → in_progress/behind/critical → complete_pending_submission"], gates: ["Own Build, dependency and granular permission rules."], exceptions: ["Illegal transition, offline upload, threshold breach."], permissions: ["Builder Lead; Builder Staff only where permissioned."],
        upstream: ["WF-PRP-001.BLDR.01"], downstream: ["WF-MIL-001.BLDR.01", "WF-BUD-001.BLDR.01", "WF-CTR-002.BLDR.01"], handoffs: ["WF-BLD-001.HO-01"], events: ["progress/schedule/cost/evidence/assignment events"], success: ["Workspace reflects field reality."], failure: ["Update rejected or exception visible."], sources: [`${src.core} §11.3`, `${src.production} §8.8`],
      })),
      segment("WF-BLD-001.CNTR.01", "Execute assigned Build scope", "CNTR", "Assigned build work", common({
        purpose: "Track assigned work, schedule, dependencies, and supporting evidence.", trigger: "Assignment/change is received.", steps: ["Review assigned work.", "Acknowledge/clarify through `WF-CTR-002`.", "Perform work.", "Upload supporting evidence/notes.", "Monitor schedule changes."],
        inputs: ["Assigned scope and schedule."], outputs: ["Acknowledgement, coordination state, supporting evidence."], states: ["assignment pending → acknowledged/resolved; work visible by milestone state"], gates: ["Active linked profile and assignment."], exceptions: ["Dispute/removal/offline upload."], permissions: ["Assigned scope only; no formal completion/draw authority."],
        upstream: ["WF-CTR-002"], downstream: ["WF-MIL-001"], handoffs: ["WF-BLD-001.HO-01"], events: ["contractor schedule/evidence events"], success: ["Assigned work is coordinated."], failure: ["Scope issue remains explicit."], sources: [`${src.contractor} §8.5–8.7`],
      })),
      segment("WF-BLD-001.LOPS.01", "Monitor and triage Build execution risk", "LOPS", "Portfolio operations", common({
        purpose: "Identify schedule, evidence, working-capital, and draw risks and route action without changing final authority.", trigger: "Risk/variance signal or portfolio triage cycle.", steps: ["Review build health and next action.", "Claim/assign operational work.", "Request status/info where supported.", "Escalate policy/material issues.", "Track resolution."],
        inputs: ["Build health, variances, dependencies, evidence/draw state."], outputs: ["Claimed/routed work and recommendation."], states: ["untriaged → claimed/in_review → routed/resolved"], gates: ["Organization/assignment access."], exceptions: ["Stale data, no assignee, authority-required action."], permissions: ["Backoffice non-destructive write/recommendation; no final release/override."],
        upstream: ["WF-BLD-001.BLDR.01"], downstream: ["WF-OPS-001", "WF-MIL-001", "WF-BUD-001"], handoffs: ["WF-BLD-001.HO-02"], events: ["work claimed/routed; audit/notification"], success: ["Risk has an accountable next action."], failure: ["Exception remains visible in queue."], sources: [`${src.production} §8.8–8.9`, `${src.backoffice}`],
      })),
      segment("WF-BLD-001.LADM.01", "Govern material Build changes", "LADM", "Build governance", common({
        purpose: "Review material variance/policy implications and direct revision/override paths.", trigger: "System/operations escalates a material change.", steps: ["Review approved version and variance.", "Determine revision/policy path.", "Record decision/override reason where allowed.", "Monitor downstream resolution."],
        inputs: ["Variance/policy package."], outputs: ["Revision direction or audited override."], states: ["flagged → revision_required/recommended or override_resolved"], gates: ["Final authority and configured thresholds."], exceptions: ["Insufficient data requests more information."], permissions: ["Lender Admin/Principal Broker."],
        upstream: ["WF-BLD-001.LOPS.01"], downstream: ["WF-BUD-001.LADM.01"], handoffs: ["WF-BLD-001.HO-03"], events: ["variance/revision/override audit"], success: ["Material change has governed path."], failure: ["Build remains flagged; approved version unchanged."], sources: [`${src.core} §8.9, §11.7`],
      })),
      segment("WF-BLD-001.SYS.01", "Project Build state and route variances", "SYS", "Build state orchestration", common({
        purpose: "Validate live updates, append variance/history, recompute impacts, and route next work.", trigger: "Authorized Build mutation or time/threshold condition.", steps: ["Authorize/validate transition.", "Persist update/history.", "Recompute schedule/capital/draw effects.", "Create threshold/risk work.", "Emit audit/outbox/notifications."],
        inputs: ["Build update and policy/current approved versions."], outputs: ["Updated projection, variance/work items, events."], states: ["Per milestone/build state model."], gates: ["No overwrite of approved Budget; immutable actuals protected."], exceptions: ["Illegal/stale/conflicting update rejected."], permissions: ["System under actor organization scope."],
        upstream: ["WF-BLD-001.BLDR.01"], downstream: ["WF-MIL-001", "WF-BUD-001", "WF-OPS-001"], handoffs: ["WF-BLD-001.HO-02", "WF-BLD-001.HO-03"], events: ["audit/outbox/notifications"], success: ["Consistent current state and routed work."], failure: ["No silent partial update."], sources: [`${src.production} §8.8`, `${src.core} §17–§18`],
      })),
    ],
  },
  {
    id: "WF-MIL-001",
    name: "Milestone Completion, Evidence Review, Site Visit, and Final Decision",
    persona: "CROSS",
    category: "Milestone verification",
    purpose: "Verify completed reimbursement-eligible work through versioned evidence, lender review, optional inspection, and final lender-admin decision without discarding location-unverified proof.",
    preconditions: ["Active Build/milestone exists and work is complete pending submission.", "Required evidence/site-visit policies are resolvable."],
    trigger: "Builder marks a milestone complete and submits actual cost, completion report, required proof, and location attempt where applicable.",
    steps: ["Validate and create Milestone Completion Package plus one active Evidence Review Work Order.", "Lender Operations claims and reviews evidence/cost/geofence/dependency/draw-group context.", "Request/resubmit more information as needed.", "Request/assign/perform site visit when required; preserve offline drafts and sync.", "Operations submits recommendation and Admin Approval Package.", "Lender Admin reviews all proof/reports/warnings, resolves geofence/site-visit gates, and approves/rejects/requests more work.", "On approval recompute draw availability/readiness."],
    inputs: ["Actual cost, completion report, required evidence/checklist, capture metadata/geofence result.", "Staff review/recommendation.", "Site Visit Report when applicable.", "Budget variance/warnings/overrides."],
    outputs: ["Versioned completion package.", "Evidence/Site Visit work orders and reports.", "Admin Approval Package and final decision.", "Updated milestone and draw eligibility."],
    states: ["milestone: complete_pending_submission → submitted_for_review → more_information_requested/site_visit_requested → site_visit_complete/recommended_for_approval|rejection → approved/rejected/revision_required", "site visit: requested → assigned/claimed → in_progress/offline_draft → submitted → accepted/rework/cancelled"],
    gates: ["Required evidence unless policy permits explicit exception submission.", "Exactly one active Evidence Review Work Order per attempt.", "Staff/Inspector recommendations are not final.", "Admin satisfies policy gates or records explicit audited override."],
    exceptions: ["Missing evidence; failed/unavailable/low-confidence geofence or suspected spoofed location; cost variance; rejection recommendation; incomplete/inconclusive visit; admin requests information/reopens visit; sync failure."],
    permissions: ["Builder submits/responds.", "Operations reviews/recommends/requests visit/info.", "Inspector has assignment/token scope.", "Only Lender Admin final-approves/rejects or overrides."],
    upstream: ["WF-BLD-001", "WF-CTR-002"], downstream: ["WF-DRW-001", "WF-BUD-001", "WF-OPS-001"], handoffs: ["WF-MIL-001.HO-01", "WF-MIL-001.HO-02", "WF-MIL-001.HO-03", "WF-MIL-001.HO-04", "WF-MIL-001.HO-05", "WF-MIL-001.HO-06", "WF-MIL-001.HO-07"],
    events: ["Completion submitted, review claimed/recommendation, missing-info request/response, visit requested/assigned/submitted, location-unverified warning, final decision/override audit, notifications/outbox."],
    success: ["Milestone is approved and draw eligibility is recomputed from complete, auditable evidence/review context."], failure: ["Milestone is rejected/revision-required or remains in an explicit actionable exception state; evidence is retained."],
    sources: [`${src.core} §11.3–11.6, §15.1, §18.3.4–18.3.8, §18.3.12`, `${src.production} §8.9–8.10`, `${src.evidenceVisit}`], status: "SUPPORTED",
    participants: ["BLDR", "LOPS", "INSP", "LADM", "SYS"],
    handoffDefinitions: [
      { id: "WF-MIL-001.HO-01", from: "BLDR", to: "LOPS", trigger: "Completion package is submitted and work order enters New Submission.", artifacts: "Build/milestone/draw-group IDs, actual cost, report, evidence/checklist, geofence result, variance, actor/timestamp.", acknowledgement: "Operations claims the work order and begins review." },
      { id: "WF-MIL-001.HO-02", from: "LOPS", to: "BLDR", trigger: "Reviewer requests more information.", artifacts: "Specific missing/unclear items, original package/evidence context, due/owner metadata.", acknowledgement: "Builder appends proof/clarification and resubmits; original package remains versioned." },
      { id: "WF-MIL-001.HO-03", from: "BLDR", to: "LOPS", trigger: "Builder resubmits requested information.", artifacts: "Appended evidence/clarification, new geofence results, response timestamp/version.", acknowledgement: "Original reviewer/queue reopens and compares original vs response." },
      { id: "WF-MIL-001.HO-04", from: "LOPS", to: "INSP", trigger: "Site visit is required/requested and work order assigned or claimable.", artifacts: "Build location, milestone scope/checklist, prior evidence, geofence requirement, schedule/token/assignment.", acknowledgement: "Inspector claims/accepts and performs the visit." },
      { id: "WF-MIL-001.HO-05", from: "INSP", to: "LOPS", trigger: "Structured Site Visit Report is submitted/synced.", artifacts: "Photos/videos/notes, geofence attempt, checklist, recommendation, actor/timestamp, sync state.", acknowledgement: "Operations reviews report and completes recommendation/escalation." },
      { id: "WF-MIL-001.HO-06", from: "LOPS", to: "LADM", trigger: "Evidence review is ready and required visit is completed or requires authority waiver.", artifacts: "Admin Approval Package: builder proof, geofence, staff report/recommendation, visit report, variance, warnings, prior overrides.", acknowledgement: "Lender Admin records final decision or routes specific additional work." },
      { id: "WF-MIL-001.HO-07", from: "LADM", to: "BLDR", trigger: "Final milestone decision is recorded.", artifacts: "Approved/rejected/revision/more-info outcome, reason, accepted override, next action, eligibility impact.", acknowledgement: "Builder views outcome and proceeds to draw request or correction/resubmission." },
    ],
    segments: [
      segment("WF-MIL-001.BLDR.01", "Submit and supplement milestone completion", "BLDR", "Completion submission", common({
        purpose: "Assert completed work with required actual cost, report, evidence, and location attempt; respond to formal deficiencies.", trigger: "Work is complete pending submission or more information/revision is requested.", steps: ["Enter actual cost/report.", "Attach required evidence.", "Allow/attempt location verification.", "Submit.", "Review requests/decision.", "Append and resubmit corrections without deleting history."],
        inputs: ["Completion report/cost/evidence/location."], outputs: ["Completion package or versioned response."], states: ["complete_pending_submission → submitted_for_review; more_info/rejected/revision → resubmitted"], gates: ["Builder permission and required evidence policy."], exceptions: ["Missing evidence, location failure retained/flagged, upload/sync issue."], permissions: ["Builder Lead or permissioned Builder Staff on own Build."],
        upstream: ["WF-BLD-001.BLDR.01"], downstream: ["WF-MIL-001.LOPS.01", "WF-DRW-001.BLDR.01"], handoffs: ["WF-MIL-001.HO-01", "WF-MIL-001.HO-02", "WF-MIL-001.HO-03", "WF-MIL-001.HO-07"], events: ["milestone_completion.submitted/resubmitted", "missing-info resolved", "notifications"], success: ["Approved completion or actionable review state."], failure: ["Rejected/revision state with retained evidence."], sources: [`${src.core} §18.3.4, §18.3.6`],
      })),
      segment("WF-MIL-001.LOPS.01", "Review completion evidence and recommend", "LOPS", "Evidence review", common({
        purpose: "Assess evidence integrity/completeness/cost/context, request missing work or inspection, and prepare a recommendation.", trigger: "Evidence Review Work Order is new/reopened.", steps: ["Claim.", "Review milestone/report/proof/geofence/cost/dependencies/draw group.", "Recommend approval/rejection, request info, or request visit.", "Review responses/report.", "Send Admin Approval Package."],
        inputs: ["Completion package and response/visit artifacts."], outputs: ["Audited review/recommendation and approval package."], states: ["new → claimed/in_review → missing_info/site_visit/ready_for_admin"], gates: ["Recommendation required before ready-for-admin; never final approval."], exceptions: ["Integrity/variance/deficiency/inconclusive visit routes work item."], permissions: ["Lender Operations within organization/assignment."],
        upstream: ["WF-MIL-001.BLDR.01", "WF-MIL-001.INSP.01"], downstream: ["WF-MIL-001.LADM.01"], handoffs: ["WF-MIL-001.HO-01", "WF-MIL-001.HO-02", "WF-MIL-001.HO-03", "WF-MIL-001.HO-04", "WF-MIL-001.HO-05", "WF-MIL-001.HO-06"], events: ["review claimed/recommendation/info/visit/ready events"], success: ["Complete decision package reaches authority."], failure: ["Explicit missing-info/visit/rejection recommendation remains open."], sources: [`${src.core} §18.3.5–18.3.8`],
      })),
      segment("WF-MIL-001.INSP.01", "Perform and submit site visit", "INSP", "Field inspection", common({
        purpose: "Verify target milestone work and submit structured evidence/recommendation, including offline-safe capture.", trigger: "Visit is assigned/claimed and scheduled/token is valid.", steps: ["Review scope/site/prior evidence/checklist.", "Travel/open mobile flow.", "Capture photos/video/notes/location.", "Complete structured report/recommendation.", "Save offline if needed and sync.", "Submit."],
        inputs: ["Assignment/token, site/scope/checklist/prior evidence."], outputs: ["Site Visit Report/evidence/geofence/recommendation."], states: ["requested → assigned/claimed → in_progress/offline_draft → submitted; rework/cancel as routed"], gates: ["Target-scoped token/assignment; required report fields."], exceptions: ["Expired token, offline sync, location unavailable/failed, inconclusive/rework, cancellation."], permissions: ["Target visit only; recommendation not final approval."],
        upstream: ["WF-MIL-001.LOPS.01"], downstream: ["WF-MIL-001.LOPS.01", "WF-MIL-001.LADM.01"], handoffs: ["WF-MIL-001.HO-04", "WF-MIL-001.HO-05"], events: ["visit claimed/started/offline/submitted/location events"], success: ["Reviewable submitted report."], failure: ["Rework/incomplete/cancelled state; captured evidence retained."], sources: [`${src.core} §11.5, §18.3.7`, `${src.evidenceVisit}`],
      })),
      segment("WF-MIL-001.LADM.01", "Make final milestone decision and overrides", "LADM", "Milestone approval", common({
        purpose: "Resolve the formal completion decision with all evidence, recommendations, visits, warnings, and override controls.", trigger: "Admin Approval Package is ready or additional authority action is requested.", steps: ["Review all artifacts/variance/warnings.", "Accept/reject location-unverified evidence when authorized.", "Approve, reject, request info, reopen visit, or waive visit with reason.", "Verify work-order closure/routing and eligibility recompute."],
        inputs: ["Admin Approval Package and override reason."], outputs: ["Final milestone decision and draw-eligibility update."], states: ["ready_for_decision → approved/rejected/more_info/site_visit/revision_required"], gates: ["Only Lender Admin; policy gate or explicit reasoned override."], exceptions: ["Insufficient evidence, failed geofence, incomplete visit, variance."], permissions: ["Lender Admin/Principal Broker final authority."],
        upstream: ["WF-MIL-001.LOPS.01"], downstream: ["WF-DRW-001", "WF-BUD-001"], handoffs: ["WF-MIL-001.HO-06", "WF-MIL-001.HO-07"], events: ["milestone approved/rejected/revision; override audit; notification"], success: ["Audited decision and correct eligibility."], failure: ["Routed actionable state, not hidden comment/chat."], sources: [`${src.core} §18.3.8`],
      })),
      segment("WF-MIL-001.SYS.01", "Orchestrate completion work and preserve evidence", "SYS", "Verification orchestration", common({
        purpose: "Validate packages, manage one active work order, attempt geofence, route queues, preserve versions, and recompute eligibility.", trigger: "Completion/review/visit/admin mutation or sync occurs.", steps: ["Validate/authorize.", "Persist versioned package/assets/geofence.", "Create/route work orders.", "Write audit/outbox/notifications.", "Close/reroute on decision.", "Recompute draw availability/readiness on approval."],
        inputs: ["All workflow commands/artifacts."], outputs: ["Packages/work orders/states/events/eligibility."], states: ["Per milestone/site-visit/work-order models."], gates: ["Geofence failure never deletes evidence; one active review work order; legal transitions."], exceptions: ["Duplicate submit, failed sync, missing policy, illegal transition."], permissions: ["System under scoped authorized commands."],
        upstream: ["WF-MIL-001.BLDR.01"], downstream: ["WF-DRW-001", "WF-COM-001"], handoffs: [], events: ["audit/outbox/notification/webhook candidates"], success: ["Traceable end-to-end verification state."], failure: ["Actionable exception without data loss."], sources: [`${src.core} §17–§18.3`],
      })),
    ],
  },
  {
    id: "WF-CTR-002",
    name: "Contractor Assignment, Schedule Acknowledgement, Scope Clarification, and Supporting Evidence",
    persona: "CROSS",
    category: "Contractor execution",
    purpose: "Coordinate assigned contractor work while keeping contractor uploads advisory until builder completion submission and lender approval.",
    preconditions: ["Contractor profile exists (`WF-CTR-001`).", "Proposal/build/milestone is organization-scoped and the initiator can manage contractor scope."],
    trigger: "Builder/backoffice assigns contractor scope or materially changes the assigned schedule.",
    steps: ["Assign proposal/build/milestone/submilestone scope.", "Notify contractor and request acknowledgement when required.", "Contractor acknowledges, requests clarification, or disputes scope.", "Builder/backoffice resolves clarification/dispute.", "Contractor uploads supporting evidence/notes within assigned scope.", "Builder/backoffice reviews feedback and requests context/replacement when needed.", "Builder later chooses evidence for formal completion package."],
    inputs: ["Assignment and schedule scope.", "Contractor acknowledgement/clarification.", "Supporting photos/files/notes and feedback."],
    outputs: ["Historical assignment.", "Acknowledgement state.", "Resolved scope thread.", "Supporting evidence with feedback state."],
    states: ["assignment acknowledgement: pending_acknowledgement → acknowledged/clarification_requested/scope_disputed → resolved → acknowledged", "evidence: submitted → useful/not_relevant/more_context_requested/replacement_requested → addressed → useful/not_relevant"],
    gates: ["Contractor can access only assigned scope.", "Contractor evidence never independently unlocks completion/draw eligibility.", "Formal evidence inclusion remains builder-controlled."],
    exceptions: ["Scope dispute remains unresolved.", "Assignment removed/reassigned with history.", "Evidence needs context/replacement or falls outside scope."],
    permissions: ["Builder/backoffice manages assignments.", "Contractor reads/writes only assigned scope.", "Lender review remains recommendation-only until admin decision."],
    upstream: ["WF-CTR-001", "WF-PRP-001"], downstream: ["WF-BLD-001", "WF-MIL-001"], handoffs: ["WF-CTR-002.HO-01", "WF-CTR-002.HO-02", "WF-CTR-002.HO-03", "WF-CTR-002.HO-04"],
    events: ["Assignment create/update/remove audit.", "Schedule acknowledgement and clarification notifications.", "Evidence upload/view/comment/flag audit and notifications."],
    success: ["Assigned scope is acknowledged/resolved and useful evidence is available to the builder without bypassing formal review."], failure: ["Scope remains disputed or evidence remains unaddressed; no completion eligibility is granted."],
    sources: [`${src.contractor} §8.3–§8.7, §10, §14.3–14.4, §15`], status: "SUPPORTED",
    participants: ["BLDR", "CNTR", "LOPS", "SYS"],
    handoffDefinitions: [
      { id: "WF-CTR-002.HO-01", from: "BLDR", to: "CNTR", trigger: "Assignment is created/changed or a material schedule change requires acknowledgement.", artifacts: "Proposal/build/milestone scope, dates, dependencies, documents, acknowledgement request.", acknowledgement: "Contractor acknowledges, requests clarification, or disputes the scope." },
      { id: "WF-CTR-002.HO-02", from: "CNTR", to: "BLDR", trigger: "Contractor records acknowledgement, clarification request, or dispute.", artifacts: "Acknowledgement state, comments, disputed scope/date/dependency context.", acknowledgement: "Builder clarifies/amends scope and records resolution; contractor then acknowledges." },
      { id: "WF-CTR-002.HO-03", from: "CNTR", to: "LOPS", trigger: "Supporting evidence is uploaded or enters review context.", artifacts: "Assigned scope, evidence asset, capture metadata, notes, author/timestamp.", acknowledgement: "Reviewer marks usefulness or requests context/replacement; builder retains formal inclusion authority." },
      { id: "WF-CTR-002.HO-04", from: "LOPS", to: "CNTR", trigger: "Evidence feedback requires contractor action.", artifacts: "Feedback state, comments, requested context/replacement, linked evidence/scope.", acknowledgement: "Contractor addresses the request with context or replacement evidence." },
    ],
    segments: [
      segment("WF-CTR-002.BLDR.01", "Assign contractor and resolve scope", "BLDR", "Contractor coordination", common({
        purpose: "Define contractor scope, manage schedule acknowledgement, and decide which supporting evidence enters builder-controlled completion.", trigger: "Contractor is needed or assigned scope/schedule changes.", steps: ["Create/update/remove assignment.", "Request acknowledgement.", "Review response/dispute.", "Clarify/amend and resolve.", "Review contractor evidence.", "Select evidence later for completion package."],
        inputs: ["Contractor profile, project scope, dates, supporting evidence."], outputs: ["Assignment, resolution, evidence selection decision."], states: ["assignment pending → acknowledged/resolved/removed"], gates: ["Own proposal/build; contractor-management permission; history preserved."], exceptions: ["Dispute, unresponsive contractor, reassignment, irrelevant evidence."], permissions: ["Builder Lead or permissioned Builder Staff."],
        upstream: ["WF-CTR-001", "WF-PRP-001"], downstream: ["WF-BLD-001", "WF-MIL-001.BLDR.01"], handoffs: ["WF-CTR-002.HO-01", "WF-CTR-002.HO-02"], events: ["assignment/schedule/evidence audit and notifications"], success: ["Scope is acknowledged and history retained."], failure: ["Unresolved dispute blocks reliable coordination but not silently."], sources: [`${src.contractor} §8.4–§8.7, §14.3–14.4`],
      })),
      segment("WF-CTR-002.CNTR.01", "Acknowledge scope and contribute supporting evidence", "CNTR", "Assigned work", common({
        purpose: "Understand assigned work, surface scope problems, and contribute field evidence without asserting completion authority.", trigger: "Assignment/acknowledgement request or evidence-feedback request is received.", steps: ["Review assigned scope/schedule/dependencies/docs.", "Acknowledge, clarify, or dispute.", "Review resolution and acknowledge.", "Upload assigned-scope photos/files/notes.", "Address context/replacement feedback."],
        inputs: ["Assigned scope and feedback."], outputs: ["Acknowledgement/resolution response and supporting evidence."], states: ["pending_acknowledgement → acknowledged/clarification_requested/scope_disputed → resolved", "evidence submitted → addressed/useful/not_relevant"], gates: ["Active contractor role/profile link and assigned scope."], exceptions: ["Removed assignment, out-of-scope upload, offline/upload failure."], permissions: ["Assigned contractor only; no milestone completion, lender approval, or draw authority."],
        upstream: ["WF-CTR-002.BLDR.01"], downstream: ["WF-MIL-001"], handoffs: ["WF-CTR-002.HO-01", "WF-CTR-002.HO-02", "WF-CTR-002.HO-03", "WF-CTR-002.HO-04"], events: ["acknowledgement, clarification, evidence upload/addressed events"], success: ["Scope understood and evidence available."], failure: ["Dispute/feedback remains open."], sources: [`${src.contractor} §8, §14.3–14.4`],
      })),
      segment("WF-CTR-002.LOPS.01", "Review contractor evidence in operational context", "LOPS", "Contractor evidence review", common({
        purpose: "Assess contractor-contributed evidence as context while preserving builder submission and lender decision boundaries.", trigger: "Contractor evidence is submitted or linked to review work.", steps: ["Verify assignment/scope.", "View/comment/flag evidence.", "Mark useful/not relevant or request context/replacement.", "Review response.", "Keep formal milestone gate unchanged until builder submission."],
        inputs: ["Contractor evidence and assignment context."], outputs: ["Evidence feedback state and audit."], states: ["submitted → feedback → addressed/final usefulness"], gates: ["Evidence does not unlock milestone/draw eligibility by itself."], exceptions: ["Out-of-scope, deficient, missing context, suspected integrity issue."], permissions: ["Authorized backoffice/lender staff; no final approval."],
        upstream: ["WF-CTR-002.CNTR.01"], downstream: ["WF-MIL-001.LOPS.01"], handoffs: ["WF-CTR-002.HO-03", "WF-CTR-002.HO-04"], events: ["evidence viewed/commented/flagged; contractor notification"], success: ["Evidence disposition is explicit."], failure: ["Feedback remains unresolved; evidence is excluded from formal sufficiency."], sources: [`${src.contractor} §8.7, §9, §14.4`],
      })),
      segment("WF-CTR-002.SYS.01", "Enforce assigned-scope visibility and feedback state", "SYS", "Authorization and notifications", common({
        purpose: "Project assignments, visibility, acknowledgement, feedback, and notifications without promoting supporting evidence to approval evidence.", trigger: "Assignment, schedule, evidence, or feedback mutation occurs.", steps: ["Authorize against active assignment.", "Persist state/history.", "Resolve visibility.", "Notify affected parties.", "Keep completion/draw eligibility unchanged."],
        inputs: ["Assignment/evidence mutation and organization context."], outputs: ["State projection, audit, notifications."], states: ["Per assignment/evidence state machines."], gates: ["Tenant and assigned-scope authorization; explicit non-eligibility rule."], exceptions: ["Stale assignment or illegal transition is rejected."], permissions: ["System under authorized actor context."],
        upstream: ["WF-CTR-001"], downstream: ["WF-MIL-001"], handoffs: [], events: ["assignment/evidence/notification events"], success: ["Least-privilege collaboration is enforced."], failure: ["Mutation is rejected without partial promotion."], sources: [`${src.contractor} §11–§14`],
      })),
    ],
  },
  {
    id: "WF-PRP-001",
    name: "Build Proposal Planning, Review, Approval, Closing, and Build Activation",
    persona: "CROSS",
    category: "Proposal and origination",
    purpose: "Turn builder inputs into a validated reimbursement roadmap and draw-plan snapshot, obtain lender decision, then close the approved proposal into an active Build.",
    preconditions: ["Builder is onboarded and assigned (`WF-TEN-002`).", "Organization, lender policy, templates, and required-document rules are available."],
    trigger: "Builder creates a new Build Proposal or reopens a draft after changes are requested.",
    steps: ["Capture build/site/permits/budget/working capital/template.", "Edit milestones, dependencies, costs, contractors, and material/equipment plan.", "Validate graph, warnings, policy, and feasibility.", "Generate/compare Cheapest Feasible, Fastest, and Capital-Constrained plans.", "Select preferred plan and submit immutable review snapshot.", "Lender operations supports review and Principal Broker/admin approves, rejects, or requests changes.", "Builder revises/resubmits when requested.", "After approval, authorized closer records reason/start date and creates active Build plus loan/capital/roadmap records."],
    inputs: ["Build identity/site/permits/documents.", "Budget, Borrower Working Capital Limit, requested loan/co-pay.", "Milestones/costs/durations/dependencies/contractors/materials.", "Lender policy and optimizer assumptions."],
    outputs: ["Versioned proposal package and selected Draw Plan.", "Review decision/events.", "On closing: active Build, loan facility, capital plan, milestones/submilestones, planned draw rows, assignments, audit/outbox."],
    states: ["proposal: draft → submitted → approved → closed", "request changes: submitted → draft", "rejection: submitted with reviewOutcome=rejected; no fifth lifecycle state and no Build", "approval does not itself create active Build; closing does"],
    gates: ["Required fields/documents and dependency graph.", "Feasible working-capital/policy constraints or explicit audited override.", "Permit waiver only by admin/Principal Broker.", "Closing requires approved proposal, reason, and build start date."],
    exceptions: ["Validation/warning/infeasibility blocks or requires override.", "Changes requested returns to editable draft.", "Rejected outcome creates no Build.", "Approved proposal remains awaiting closing.", "Closing failure creates no partial active Build."],
    permissions: ["Builder edits own draft and submits; cannot edit submitted snapshot.", "Backoffice with write authority may edit submitted/approved draw rows with reason and audit.", "Principal Broker/admin approves and closes."],
    upstream: ["WF-TEN-002", "WF-CTR-001", "WF-MAT-001"], downstream: ["WF-BLD-001", "WF-CTR-002", "WF-CAL-001", "WF-COM-001"],
    handoffs: ["WF-PRP-001.HO-01", "WF-PRP-001.HO-02", "WF-PRP-001.HO-03", "WF-PRP-001.HO-04", "WF-PRP-001.HO-05"],
    events: ["proposal draft/submitted/changes_requested/approved/rejected/closed events.", "Audit events and eventOutbox rows.", "Builder/backoffice notifications.", "Closing capital event; interest explicitly not started until funds_released."],
    success: ["Closed proposal is materialized as an active, organization-scoped Build with preserved proposal snapshot/history."], failure: ["Proposal remains draft/submitted/approved-awaiting-close/rejected; no unintended Build exists."],
    sources: [`${src.core} §9, §11.1–11.2`, `${src.production} §8.6–8.7`, `${src.proposal} §7–§10`, `${src.proposalImpl} Lifecycle Rules`], status: "SUPPORTED",
    participants: ["BLDR", "LOPS", "LADM", "SYS"],
    handoffDefinitions: [
      { id: "WF-PRP-001.HO-01", from: "SYS", to: "BLDR", trigger: "Validation/optimization completes or finds infeasibility.", artifacts: "Three plan options, recommendation, draw groups, cost/schedule/capital metrics, warnings and invalid dependencies.", acknowledgement: "Builder corrects inputs or selects a plan and proceeds to submission." },
      { id: "WF-PRP-001.HO-02", from: "BLDR", to: "LOPS", trigger: "Builder submits the proposal.", artifacts: "Frozen proposal snapshot: identity/site, permits/docs, budget, roadmap, dependencies, contractors/materials, working capital, plan options/selection, warnings.", acknowledgement: "Lender queue claims/reviews the submission or routes it to final authority." },
      { id: "WF-PRP-001.HO-03", from: "LOPS", to: "LADM", trigger: "Review support is complete and a final decision/override is required.", artifacts: "Proposal package, review notes/recommendation, warnings, permit/waiver need, edited draw rows with prior/new state.", acknowledgement: "Lender Admin approves, rejects, or requests changes and records required reason." },
      { id: "WF-PRP-001.HO-04", from: "LADM", to: "BLDR", trigger: "Final review outcome is recorded.", artifacts: "Approval/rejection/changes-requested outcome, reasons, requested fields/documents, warning overrides.", acknowledgement: "Builder views outcome; for changes, edits draft and resubmits." },
      { id: "WF-PRP-001.HO-05", from: "SYS", to: "BLDR", trigger: "Authorized closing transaction creates the active Build.", artifacts: "Build ID, start date, approved Budget/roadmap/Draw Plan, loan/capital context, assignments, workspace link.", acknowledgement: "Builder enters live Build Workspace and begins execution." },
    ],
    segments: [
      segment("WF-PRP-001.BLDR.01", "Plan and submit Build Proposal", "BLDR", "Proposal intake and planning", common({
        purpose: "Create a feasible reimbursement proposal and select the preferred Draw Plan.", trigger: "New proposal or changes-requested draft is opened.", steps: ["Enter build/site/documents/budget/working capital.", "Select/edit roadmap and dependencies.", "Add contractors/material items.", "Review validation and three plan options.", "Select preferred plan.", "Submit frozen snapshot.", "Revise/resubmit if requested."],
        inputs: ["Proposal package inputs and corrections."], outputs: ["Submitted review snapshot and selected plan."], states: ["draft → submitted; submitted → draft on changes request"], gates: ["Required fields/evidence; valid dependency graph; feasible or acknowledged warnings."], exceptions: ["Missing/abnormal/infeasible inputs; requested changes; rejection."], permissions: ["Builder Lead or permissioned Builder Staff on own proposal; draft edits only."],
        upstream: ["WF-TEN-002", "WF-MAT-001"], downstream: ["WF-PRP-001.LOPS.01", "WF-BLD-001"], handoffs: ["WF-PRP-001.HO-01", "WF-PRP-001.HO-02", "WF-PRP-001.HO-04", "WF-PRP-001.HO-05"], events: ["proposal.saved/submitted/resubmitted", "audit/outbox", "notification resolution"], success: ["Submitted or closed/active proposal."], failure: ["Draft remains actionable or rejection is final with no Build."], sources: [`${src.core} §11.1`, `${src.production} §8.6`],
      })),
      segment("WF-PRP-001.LOPS.01", "Support proposal review and prepare final decision", "LOPS", "Proposal review operations", common({
        purpose: "Review completeness/feasibility, request missing work, and prepare a decision package without assuming final authority.", trigger: "Proposal enters submitted queue.", steps: ["Claim/review builder/site/docs/budget/roadmap/plans/warnings.", "Request information or annotate.", "If authorized, edit draw rows with reason and prior/new state.", "Prepare recommendation/package.", "Send to final authority."],
        inputs: ["Submitted snapshot and policy/warning context."], outputs: ["Review notes, corrections, recommendation, final-decision package."], states: ["submitted → in review → ready for decision or draft via changes request"], gates: ["Reason/audit for submitted/approved edits; staff recommendation is not final approval."], exceptions: ["Missing permit, infeasibility, unresolved documents or policy warnings."], permissions: ["Organization-scoped backoffice/Broker according to assignment and write capability."],
        upstream: ["WF-PRP-001.BLDR.01"], downstream: ["WF-PRP-001.LADM.01"], handoffs: ["WF-PRP-001.HO-02", "WF-PRP-001.HO-03"], events: ["review claimed/updated, change request, draw-row edit audit"], success: ["Complete decision package reaches authority."], failure: ["Submission remains in missing-info/review state."], sources: [`${src.production} §8.7–8.9`, `${src.proposalImpl} Lifecycle Rules`],
      })),
      segment("WF-PRP-001.LADM.01", "Decide and close Build Proposal", "LADM", "Proposal approval and closing", common({
        purpose: "Make the final proposal decision, control overrides, and separately record closing to activate the Build.", trigger: "Decision package is ready or an approved proposal reaches closing.", steps: ["Review full package/recommendation/warnings.", "Approve, reject, or request changes.", "Record audited override/permit waiver where allowed.", "For approved proposal, later record closing reason/start date.", "Verify active Build creation."],
        inputs: ["Decision package, override/waiver reason, closing date/reason."], outputs: ["Review outcome; approved proposal; closed proposal and active Build."], states: ["submitted → approved or reviewOutcome rejected or draft", "approved → closed"], gates: ["Principal/admin authority; permit waiver authorization; approved-only closing."], exceptions: ["Policy gate unmet; future start date is allowed; failed closing must not partially create Build."], permissions: ["Principal Broker/admin final authority."],
        upstream: ["WF-PRP-001.LOPS.01"], downstream: ["WF-BLD-001", "WF-OPS-001"], handoffs: ["WF-PRP-001.HO-03", "WF-PRP-001.HO-04"], events: ["proposal.approved/rejected/changes_requested/closed", "override/waiver audit", "outbox"], success: ["Decision is final/audited and closing activates complete Build records."], failure: ["Proposal remains in prior valid state with reason."], sources: [`${src.core} §11.2`, `${src.proposal} §8–§10`, `${src.proposalImpl} Lifecycle Rules`],
      })),
      segment("WF-PRP-001.SYS.01", "Validate, optimize, freeze, and activate proposal", "SYS", "Proposal orchestration", common({
        purpose: "Provide deterministic validation/optimization and atomic lifecycle materialization.", trigger: "Proposal inputs change, submit/decision occurs, or closing is recorded.", steps: ["Validate fields/graph/policy/working capital.", "Generate three plans and recommendation.", "Freeze submitted snapshot.", "Write lifecycle/audit/outbox/notifications.", "On closing, create all active Build/loan/capital/roadmap records."],
        inputs: ["Proposal inputs, policies, lifecycle command."], outputs: ["Plans/warnings, snapshots, events, active Build records."], states: ["draft/submitted/approved/closed plus rejection outcome"], gates: ["Idempotency/validation; no active Build on approval alone; interest begins only on funds_released."], exceptions: ["Invalid dependency/constraint, duplicate submission/closing, partial transaction rollback."], permissions: ["System under authenticated organization and authorized command."],
        upstream: ["WF-PRP-001.BLDR.01", "WF-PRP-001.LADM.01"], downstream: ["WF-BLD-001", "WF-COM-001"], handoffs: ["WF-PRP-001.HO-01", "WF-PRP-001.HO-05"], events: ["proposal lifecycle, audit, capital, outbox, notification events"], success: ["Consistent proposal or complete active Build projection."], failure: ["Command rejects without invalid partial state."], sources: [`${src.core} §9`, `${src.proposalImpl} Lifecycle Rules`],
      })),
    ],
  },
  {
    id: "WF-MAT-001",
    name: "Proposal Material and Equipment Cost Planning",
    persona: "CROSS",
    category: "Budget planning",
    purpose: "Plan milestone-linked material/equipment cost items, keep proposal totals/draw availability synchronized, and carry the approved plan into the active Build at closing.",
    preconditions: ["Draft proposal and milestones exist, or an authorized backoffice editor is modifying a submitted/approved proposal."],
    trigger: "Builder/backoffice adds, updates, or removes a material/equipment item.",
    steps: ["Select proposal milestone/submilestones.", "Enter item, supplier, unit cost, quantity, and type.", "Recalculate item/milestone/proposal totals and draw availability.", "Review rollup.", "Audit change according to proposal state.", "At closing copy items to active Build."],
    inputs: ["Item metadata, unit cost in cents, quantity, supplier, milestone/submilestone keys."], outputs: ["proposalCostItems/buildCostItems, adjusted milestone/total budget, draw availability, proposal/audit events."],
    states: ["cost item: absent → active → updated/deleted", "proposal items → copied build items on closing"],
    gates: ["Draft edit needs no reason.", "Submitted/approved edit requires backoffice role and reason.", "Totals use costCents × quantity."],
    exceptions: ["Invalid amount/quantity/scope rejected.", "Closing copy failure must not silently omit cost items."],
    permissions: ["Builder edits own draft.", "Backoffice edits submitted/approved proposal with reason.", "Active Build copy is created by closing."],
    upstream: ["WF-PRP-001"], downstream: ["WF-PRP-001", "WF-BLD-001", "WF-BUD-001"], handoffs: ["WF-MAT-001.HO-01", "WF-MAT-001.HO-02"],
    events: ["Proposal events and audit events for changes.", "Closing copies cost items."], success: ["Proposal/build material rollups match milestone budgets and remain auditable."], failure: ["Invalid edit/copy is rejected and prior totals/items remain intact."],
    sources: [`${src.materials} §Data Model, §Workflow`, `${src.proposalImpl} Lifecycle Rules`], status: "SUPPORTED",
    participants: ["BLDR", "LOPS", "SYS"],
    handoffDefinitions: [
      { id: "WF-MAT-001.HO-01", from: "BLDR", to: "LOPS", trigger: "A proposal containing material/equipment items is submitted, or a post-submission change is needed.", artifacts: "Item rollup, supplier/cost/quantity/type, milestone/submilestone links, budget/draw-availability impact.", acknowledgement: "Backoffice reviews within proposal context and records any post-submission edit with reason." },
      { id: "WF-MAT-001.HO-02", from: "SYS", to: "BLDR", trigger: "Proposal closing copies approved cost items to the active Build.", artifacts: "buildCostItems and active-build material rollup linked to source proposal/milestones.", acknowledgement: "Builder verifies the live Build Materials tab/rollup." },
    ],
    segments: [
      segment("WF-MAT-001.BLDR.01", "Plan proposal materials and equipment", "BLDR", "Proposal cost planning", common({
        purpose: "Define itemized material/equipment inputs in the proposal Budget.", trigger: "Builder opens Materials for a draft proposal.", steps: ["Choose milestone scope.", "Create/edit/delete items.", "Review supplier, unit cost, quantity, total, and rollup.", "Submit through parent proposal."],
        inputs: ["Item/cost/supplier/scope."], outputs: ["Draft cost-item plan and recalculated budget."], states: ["draft items created/updated/deleted"], gates: ["Own draft and valid cents/quantity/scope."], exceptions: ["Invalid input or submitted-state lock."], permissions: ["Builder Lead/permissioned Builder Staff on draft."],
        upstream: ["WF-PRP-001.BLDR.01"], downstream: ["WF-PRP-001.LOPS.01", "WF-BLD-001.BLDR.01"], handoffs: ["WF-MAT-001.HO-01", "WF-MAT-001.HO-02"], events: ["proposal event/audit as applicable"], success: ["Accurate itemized plan enters review and active Build."], failure: ["Prior plan remains unchanged."], sources: [`${src.materials}`],
      })),
      segment("WF-MAT-001.LOPS.01", "Review or amend submitted material plan", "LOPS", "Proposal cost review", common({
        purpose: "Review itemized cost assumptions and, when authorized, make reasoned post-submission corrections.", trigger: "Submitted/approved proposal includes material items or requires correction.", steps: ["Review rollup and milestone impact.", "Validate supplier/cost/quantity links.", "Edit only with backoffice authority and reason.", "Confirm recalculation/audit."],
        inputs: ["Submitted item plan and change reason."], outputs: ["Reviewed/corrected plan and audit."], states: ["submitted/approved lifecycle preserved while item state changes"], gates: ["Backoffice role plus reason; prior/new state captured."], exceptions: ["Unauthorized or invalid edit rejected."], permissions: ["Backoffice write authority in organization."],
        upstream: ["WF-MAT-001.BLDR.01"], downstream: ["WF-PRP-001.LADM.01"], handoffs: ["WF-MAT-001.HO-01"], events: ["proposal/audit/outbox change events"], success: ["Decision package contains correct material plan."], failure: ["Edit rejected without lifecycle drift."], sources: [`${src.materials} §Workflow`],
      })),
      segment("WF-MAT-001.SYS.01", "Recalculate and copy material cost plan", "SYS", "Budget projection", common({
        purpose: "Maintain cost arithmetic and copy approved proposal items to active Build at closing.", trigger: "Cost item mutation or proposal closing.", steps: ["Validate cents/quantity/scope.", "Apply budget delta.", "Recompute milestone draw availability and proposal total.", "Write events.", "Copy items on closing."],
        inputs: ["Cost-item mutation or closing command."], outputs: ["Recalculated totals/items/events."], states: ["proposal item → build item at closing"], gates: ["Organization/proposal/milestone scope; authorized lifecycle edit."], exceptions: ["Invalid link/arithmetic/closing transaction failure."], permissions: ["System under authorized command."],
        upstream: ["WF-MAT-001.BLDR.01", "WF-MAT-001.LOPS.01"], downstream: ["WF-BLD-001"], handoffs: ["WF-MAT-001.HO-02"], events: ["proposal/audit events"], success: ["Consistent proposal/build cost-item projection."], failure: ["No partial arithmetic/copy state."], sources: [`${src.materials}`],
      })),
    ],
  },
  {
    id: "WF-TEN-003",
    name: "Builder Reassignment and Cross-Brokerage Transfer",
    persona: "CROSS",
    category: "Relationship governance",
    purpose: "Move builder responsibility without erasing assignment, audit, document, active-work, or tenant history.",
    preconditions: ["Builder and current assignment exist.", "Requestor has authority appropriate to an intra- or cross-brokerage move."],
    trigger: "Principal Broker requests reassignment, or Platform Admin initiates/approves a cross-brokerage transfer.",
    steps: ["Select builder and destination broker/brokerage.", "Capture reason.", "Evaluate source/destination policy and active work.", "Close prior assignment and open the new assignment.", "Explicitly reroute or close work queues.", "Record prior/new ownership and retention outcome."],
    inputs: ["Builder, prior/new assignment, reason.", "Active proposals/builds/documents/contractors/work queues.", "Source/destination policy."],
    outputs: ["Historical closed assignment.", "New active assignment.", "Explicit work-item routing.", "Transfer audit event."],
    states: ["assignment: active → closed; destination: absent → active", "transfer: requested → evaluated → completed/rejected"],
    gates: ["Principal Broker authority for intra-brokerage reassignment.", "Platform Admin authority for cross-brokerage transfer.", "No blind organizationId rewrite."],
    exceptions: ["Destination rejects/ineligible.", "Active work cannot be safely routed.", "Retention/visibility conflict leaves transfer pending."],
    permissions: ["Principal Broker: own-brokerage reassignment.", "Platform Admin: cross-brokerage transfer.", "Historical access follows retention policy."],
    upstream: ["WF-TEN-002"], downstream: ["WF-PRP-001", "WF-BLD-001", "WF-OPS-001"], handoffs: ["WF-TEN-003.HO-01", "WF-TEN-003.HO-02"],
    events: ["assignment.closed/created", "transfer audit event", "queue reroute/close events", "affected-party notifications"],
    success: ["One current responsible assignment exists and all historical/active work remains traceable."], failure: ["Transfer remains pending/rejected; prior assignment and work routing remain intact."],
    sources: [`${src.production} §8.4, §12 Open Product Decisions`], status: "NEEDS_VALIDATION",
    validationNote: "The production PRD defines the transfer skeleton but leaves source/destination consent, document ownership, historical visibility, and active-work routing policy unresolved.",
    participants: ["LADM", "PADM", "BRKR", "SYS"],
    handoffDefinitions: [
      { id: "WF-TEN-003.HO-01", from: "LADM", to: "PADM", trigger: "A requested move crosses brokerage boundaries.", artifacts: "Builder, source/destination, reason, active proposals/builds/documents/assignments/work queues, policy findings.", acknowledgement: "Platform Admin approves, rejects, or requests resolution of policy conflicts." },
      { id: "WF-TEN-003.HO-02", from: "SYS", to: "BRKR", trigger: "The new assignment activates and work routing completes.", artifacts: "Assignment scope, transferred/retained records, rerouted work, effective timestamp.", acknowledgement: "Destination Broker accepts operational ownership and addresses assigned work." },
    ],
    segments: [
      segment("WF-TEN-003.LADM.01", "Request or execute builder reassignment", "LADM", "Assignment governance", common({
        purpose: "Reassign within the brokerage or submit a cross-brokerage transfer package.", trigger: "Relationship ownership must change.", steps: ["Select builder/destination.", "Review active work.", "Enter reason.", "Execute intra-brokerage reassignment or send cross-brokerage request.", "Review result."],
        inputs: ["Builder/assignment and reason."], outputs: ["Closed/new assignment or transfer request."], states: ["active → closed/new active; or transfer requested"], gates: ["Principal authority and active-work review."], exceptions: ["Policy/retention/routing conflict."], permissions: ["Principal Broker within own brokerage."],
        upstream: ["WF-TEN-002"], downstream: ["WF-TEN-003.PADM.01", "WF-TEN-003.BRKR.01"], handoffs: ["WF-TEN-003.HO-01"], events: ["reassignment/transfer audit"], success: ["Request is completed or formally queued."], failure: ["Prior assignment remains active."], sources: [`${src.production} §8.4`], status: "NEEDS_VALIDATION", validationNote: "Cross-brokerage request/consent UI and policy are not specified.",
      })),
      segment("WF-TEN-003.PADM.01", "Govern cross-brokerage transfer", "PADM", "Cross-tenant governance", common({
        purpose: "Approve and execute a transfer as a controlled migration, not a tenant-ID rewrite.", trigger: "Cross-brokerage package is received.", steps: ["Evaluate both brokerage rules.", "Determine record/visibility retention.", "Approve/reject.", "Execute controlled transfer.", "Verify work routing and audit."],
        inputs: ["Transfer package and policies."], outputs: ["Transfer outcome and retention/routing record."], states: ["requested → evaluated → completed/rejected"], gates: ["Platform authority; explicit record-by-record handling."], exceptions: ["Unresolved consent, retention, or active-work conflict."], permissions: ["Platform Admin only."],
        upstream: ["WF-TEN-003.LADM.01"], downstream: ["WF-TEN-003.BRKR.01"], handoffs: ["WF-TEN-003.HO-01"], events: ["cross_tenant.transfer audit"], success: ["Controlled transfer completes."], failure: ["Transfer is rejected/pending with reason."], sources: [`${src.production} §8.4`], status: "NEEDS_VALIDATION", validationNote: "Detailed transfer policy remains an open product decision.",
      })),
      segment("WF-TEN-003.BRKR.01", "Accept reassigned builder workload", "BRKR", "Relationship ownership", common({
        purpose: "Assume the new builder relationship and explicitly triage rerouted work.", trigger: "New assignment becomes active.", steps: ["Review assignment and effective scope.", "Review rerouted proposals/builds/work items.", "Acknowledge ownership.", "Resolve urgent queue items."],
        inputs: ["Assignment and routed-work summary."], outputs: ["Acknowledged operational ownership."], states: ["assigned → acknowledged"], gates: ["Destination Broker membership and scope."], exceptions: ["Missing access or incorrectly routed work escalates to authority."], permissions: ["Assigned destination Broker."],
        upstream: ["WF-TEN-003.PADM.01"], downstream: ["WF-OPS-001"], handoffs: ["WF-TEN-003.HO-02"], events: ["assignment notification/acknowledgement"], success: ["Work has a responsible owner."], failure: ["Routing exception remains open."], sources: [`${src.production} §8.4`], status: "NEEDS_VALIDATION", validationNote: "Acknowledgement mechanics are inferred from the acceptance criterion requiring explicit work-queue rerouting.",
      })),
      segment("WF-TEN-003.SYS.01", "Preserve history and reroute active work", "SYS", "Transfer orchestration", common({
        purpose: "Apply the approved assignment/transfer atomically enough to preserve ownership and audit invariants.", trigger: "Authorized transfer/reassignment command is approved.", steps: ["Close prior assignment.", "Create new assignment.", "Apply approved record visibility/ownership rules.", "Reroute/close work items.", "Emit audit and recipient notifications."],
        inputs: ["Authorized transfer decision and routing plan."], outputs: ["Assignments, routing, audit/outbox events."], states: ["transfer approved → completed or repair_required"], gates: ["No destructive history rewrite; organization scope validation."], exceptions: ["Partial execution creates repair-required task and preserves prior trace."], permissions: ["System under Platform/Principal authorization."],
        upstream: ["WF-TEN-003.PADM.01"], downstream: ["WF-OPS-001"], handoffs: ["WF-TEN-003.HO-02"], events: ["transfer completed/failed", "work rerouted", "audit/outbox"], success: ["History and active responsibility are coherent."], failure: ["Repair task is visible; no silent partial transfer."], sources: [`${src.production} §8.4`], status: "NEEDS_VALIDATION", validationNote: "Atomicity and repair contract are not fully specified.",
      })),
    ],
  },
  {
    id: "WF-CTR-001",
    name: "Contractor Profile, Invitation, Onboarding, Claim, and Review",
    persona: "CROSS",
    category: "Contractor identity",
    purpose: "Create a canonical contractor profile with or without an account, prevent unsafe auto-linking, and grant workspace access only after explicit claim/review and WorkOS role sync.",
    preconditions: ["Initiator is authorized in the brokerage or contractor begins self-service onboarding.", "Canonical email and tenant rules are available."],
    trigger: "Builder/backoffice creates a contractor, sends an invite, or a contractor starts self-service onboarding.",
    steps: ["Search/match canonical profile.", "Create unclaimed/profile candidate when needed.", "Invite explicitly or collect self-service profile.", "Contractor accepts and confirms claim or submits onboarding.", "Backoffice reviews ambiguous/self-service cases.", "Request WorkOS contractor role and wait for sync.", "Activate linked workspace access."],
    inputs: ["Identity, normalized verified email when present, trade/profile/compliance data.", "Invitation/claim metadata.", "Duplicate candidates and brokerage relationship."],
    outputs: ["Canonical contractor profile/alias.", "Claim intent and account link.", "Review outcome.", "Active contractor role/profile link or rejected/merged state."],
    states: ["onboarding: draft → pending_backoffice_review → changes_requested/approved_pending_workos/rejected/merged → active", "claim: not_invited → invited → accepted_pending_confirmation → claimed (or revoked/expired)"],
    gates: ["Email match alone never auto-links an account.", "Multiple matches route to review.", "Full workspace requires contractor role plus active profile link."],
    exceptions: ["No email creates record-only profile.", "Ambiguous duplicates route to merge/review.", "Invitation expires/revokes.", "WorkOS promotion/sync remains pending."],
    permissions: ["Builder/backoffice may create/invite under scoped permissions.", "Backoffice/Lender Admin reviews self-service/ambiguous cases.", "Contractor can confirm only the bound claim."],
    upstream: ["WF-TEN-001"], downstream: ["WF-CTR-002", "WF-PRP-001", "WF-BLD-001"], handoffs: ["WF-CTR-001.HO-01", "WF-CTR-001.HO-02", "WF-CTR-001.HO-03", "WF-CTR-001.HO-04"],
    events: ["Invitation/claim/review/merge/link audit events.", "WorkOS invitation and role-sync events.", "Onboarding review notifications."],
    success: ["One canonical, organization-related contractor profile is safely linked and access is correctly scoped."], failure: ["Profile remains unclaimed/pending/rejected without unauthorized workspace access."],
    sources: [`${src.production} §8.5`, `${src.contractor} §6–§7, §9, §14.1–14.2`], status: "SUPPORTED",
    participants: ["BLDR", "LOPS", "CNTR", "SYS"],
    handoffDefinitions: [
      { id: "WF-CTR-001.HO-01", from: "BLDR", to: "CNTR", trigger: "An explicit contractor invite is sent.", artifacts: "Profile identity, normalized invited email, brokerage organization, claim intent, WorkOS invitation, expiry.", acknowledgement: "Contractor accepts and confirms the specific profile claim." },
      { id: "WF-CTR-001.HO-02", from: "CNTR", to: "LOPS", trigger: "Self-service onboarding is submitted or a match/claim needs review.", artifacts: "Profile fields, email match result, compliance data/docs, duplicate candidates, claim metadata.", acknowledgement: "Backoffice approves, rejects, requests changes, merges, or sets compliance outcome with reason." },
      { id: "WF-CTR-001.HO-03", from: "LOPS", to: "CNTR", trigger: "Backoffice records a review outcome.", artifacts: "Decision, reason/change request, canonical profile/merge target, compliance status, next step.", acknowledgement: "Contractor revises/resubmits or awaits/refreshes role synchronization." },
      { id: "WF-CTR-001.HO-04", from: "SYS", to: "CNTR", trigger: "WorkOS contractor role and profile link both become active, or activation fails.", artifacts: "Workspace access state and actionable sync/link failure.", acknowledgement: "Contractor enters workspace or follows repair guidance." },
    ],
    segments: [
      segment("WF-CTR-001.BLDR.01", "Create/reuse contractor profile and invite", "BLDR", "Contractor onboarding", common({
        purpose: "Establish a record-only contractor or explicitly invite a contractor for assigned project scope.", trigger: "A proposal/build needs a contractor relationship.", steps: ["Search contractor bank.", "Reuse canonical profile or create unclaimed record.", "Attach initial scope if applicable.", "Optionally send explicit invite.", "Monitor claim."],
        inputs: ["Name/trade/email and assignment context."], outputs: ["Profile/alias, relationship, optional invitation."], states: ["absent → unclaimed; not_invited → invited"], gates: ["No automatic account link from email; invite permission."], exceptions: ["Duplicate ambiguity routes to backoffice."], permissions: ["Builder Lead or builder staff with contractor-management permission; own proposal/build only."],
        downstream: ["WF-CTR-001.CNTR.01", "WF-CTR-002"], handoffs: ["WF-CTR-001.HO-01"], events: ["contractor.created/invited audit"], success: ["Contractor is recordable/claimable without duplication."], failure: ["Creation/invite is blocked with duplicate or permission reason."], sources: [`${src.production} §8.5`, `${src.contractor} §7.3–7.4, §11.3`],
      })),
      segment("WF-CTR-001.CNTR.01", "Complete onboarding or confirm invited claim", "CNTR", "Contractor onboarding", common({
        purpose: "Submit an identity/profile for review or explicitly confirm ownership of an invited profile.", trigger: "Self-service start or WorkOS invitation acceptance.", steps: ["Authenticate.", "Complete/save profile or accept invite.", "Review exact profile match.", "Confirm claim or submit onboarding.", "Respond to changes.", "Wait for role/link activation."],
        inputs: ["Profile/compliance data, verified identity/email, invitation/claim."], outputs: ["Submitted onboarding or confirmed claim."], states: ["draft → pending_backoffice_review; invited → accepted_pending_confirmation → claimed"], gates: ["Exact/bound claim confirmation; single-use invite; role plus profile link for access."], exceptions: ["Multiple match, expiry/revocation, changes requested, rejection, sync pending."], permissions: ["Authenticated contractor/onboarding user; target profile only."],
        upstream: ["WF-CTR-001.BLDR.01"], downstream: ["WF-CTR-001.LOPS.01", "WF-CTR-002.CNTR.01"], handoffs: ["WF-CTR-001.HO-01", "WF-CTR-001.HO-02", "WF-CTR-001.HO-03", "WF-CTR-001.HO-04"], events: ["onboarding.submitted", "claim.confirmed", "profile changes"], success: ["Active, correctly linked contractor access."], failure: ["No workspace access; state remains actionable or final rejected."], sources: [`${src.contractor} §7.1, §7.3, §14.1–14.2`],
      })),
      segment("WF-CTR-001.LOPS.01", "Review contractor onboarding, claim, or duplicate", "LOPS", "Contractor operations", common({
        purpose: "Resolve self-service, ambiguous-match, compliance, and duplicate cases without unsafe linking.", trigger: "Onboarding/claim review task enters contractor operations.", steps: ["Review identity/match/compliance/assignments/audit.", "Approve, reject, request changes, merge, or set compliance result.", "Record reason.", "Initiate WorkOS promotion when approved.", "Monitor activation."],
        inputs: ["Review package and canonical candidates."], outputs: ["Audited review/merge/compliance outcome."], states: ["pending_review → changes_requested/approved_pending_workos/rejected/merged"], gates: ["No guess on ambiguous match; reason for material outcome."], exceptions: ["Insufficient data requests changes; merge migrates assignments and aliases."], permissions: ["Backoffice/Lender Admin within brokerage; high-authority actions remain audited."],
        upstream: ["WF-CTR-001.CNTR.01"], downstream: ["WF-CTR-002"], handoffs: ["WF-CTR-001.HO-02", "WF-CTR-001.HO-03"], events: ["contractor.reviewed/merged", "role promotion requested", "notification"], success: ["Safe canonical resolution and activation path."], failure: ["Rejected or pending with explicit reason."], sources: [`${src.contractor} §7.2, §9, §14.1`],
      })),
      segment("WF-CTR-001.SYS.01", "Resolve canonical profile and synchronize contractor access", "SYS", "Identity synchronization", common({
        purpose: "Enforce canonical matching, claim intent, organization relationship, and dual role/profile access gate.", trigger: "Profile creation, invite acceptance, review approval, or WorkOS webhook.", steps: ["Normalize/match email.", "Create/reuse candidate without unsafe linking.", "Persist claim/review state.", "Project WorkOS role.", "Activate only when role and link are valid.", "Notify outcome."],
        inputs: ["Profile/claim/review and WorkOS events."], outputs: ["Canonical link, relationship, access state, audit/outbox."], states: ["pending → active/rejected/merged/sync_pending"], gates: ["Verified normalized email rules; explicit confirmation; webhook-owned projections."], exceptions: ["Ambiguous duplicate, stale/duplicate webhook, failed invitation/promotion."], permissions: ["System under organization scope."],
        upstream: ["WF-CTR-001.LOPS.01"], downstream: ["WF-CTR-002"], handoffs: ["WF-CTR-001.HO-04"], events: ["claim/role/link audit and notifications"], success: ["Access and canonical identity agree."], failure: ["Access remains locked with repairable state."], sources: [`${src.contractor} §6–§7, §11`, `${src.auth}`],
      })),
    ],
  },
  {
    id: "WF-TEN-002",
    name: "Builder Onboarding and Broker Assignment",
    persona: "CROSS",
    category: "Relationship onboarding",
    purpose: "Create or link a builder identity and establish an active broker/brokerage assignment before proposal submission.",
    preconditions: ["Brokerage is active (`WF-TEN-001`).", "Broker is an authorized brokerage member."],
    trigger: "Broker invites a builder or starts an application on the builder's behalf.",
    steps: ["Initiate builder invitation/application.", "Builder signs up or accepts invite.", "Link or create builderProfile.", "Create active builderBrokerAssignment.", "Unlock proposal intake."],
    inputs: ["Builder identity/contact.", "Inviting broker and brokerage.", "Existing profile match data."],
    outputs: ["Linked builder account/profile.", "Active assignment.", "Proposal intake eligibility."],
    states: ["builder identity: absent/invited → linked", "assignment: absent → active"],
    gates: ["Builder must be tied to a broker and brokerage before proposal submission.", "WorkOS-derived tenancy and role checks."],
    exceptions: ["Existing profile is linked instead of duplicated.", "Invitation expiry/mismatch routes to repair.", "Cross-brokerage conflicts route to `WF-TEN-003`."],
    permissions: ["Broker may onboard within own brokerage.", "Builder sees own profile/proposals only.", "WorkOS projection tables remain webhook-owned."],
    upstream: ["WF-TEN-001"], downstream: ["WF-PRP-001", "WF-TEN-003"],
    handoffs: ["WF-TEN-002.HO-01", "WF-TEN-002.HO-02"],
    events: ["Builder invitation/account link.", "Assignment created audit event.", "Onboarding notification."],
    success: ["Builder has an active, traceable broker assignment and can create a proposal."], failure: ["Builder remains unable to submit a proposal."],
    sources: [`${src.production} §4.3, §4.5, §8.3`, `${src.proposal} §4–§6`], status: "SUPPORTED",
    participants: ["BRKR", "BLDR", "SYS"],
    handoffDefinitions: [
      { id: "WF-TEN-002.HO-01", from: "BRKR", to: "BLDR", trigger: "Invitation/application start is recorded.", artifacts: "Invite or application link, brokerage/broker identity, onboarding requirements.", acknowledgement: "Builder authenticates, accepts, and completes required identity/profile data." },
      { id: "WF-TEN-002.HO-02", from: "SYS", to: "BRKR", trigger: "Profile link and assignment become active or fail validation.", artifacts: "Builder profile ID, assignment state, organization scope, error/duplicate context.", acknowledgement: "Broker confirms onboarding completion or resolves the exception." },
    ],
    segments: [
      segment("WF-TEN-002.BRKR.01", "Initiate builder onboarding", "BRKR", "Builder relationship management", common({
        purpose: "Invite a builder and own the initial brokerage relationship.", trigger: "A prospective builder is ready for intake.", steps: ["Search for existing builder.", "Invite or start application.", "Monitor acceptance/linking.", "Confirm assignment."],
        inputs: ["Builder contact and brokerage context."], outputs: ["Invite/application and assignment intent."], states: ["prospect → invited → assigned"], gates: ["Broker is active in brokerage."], exceptions: ["Duplicate/mismatched identity, expired invitation."], permissions: ["Brokerage-scoped Broker/Principal Broker."],
        upstream: ["WF-TEN-001"], downstream: ["WF-PRP-001"], handoffs: ["WF-TEN-002.HO-01", "WF-TEN-002.HO-02"], events: ["builder.invited", "assignment.created"], success: ["Assigned builder is ready for proposal intake."], failure: ["Onboarding remains pending/blocked."], sources: [`${src.production} §8.3`],
      })),
      segment("WF-TEN-002.BLDR.01", "Accept onboarding and establish builder profile", "BLDR", "Builder onboarding", common({
        purpose: "Join the correct brokerage and establish the builder-side account/profile.", trigger: "Broker invitation or application link is received.", steps: ["Authenticate/create account.", "Accept organization invitation.", "Complete/confirm builder profile.", "Confirm assigned broker and enter proposal intake."],
        inputs: ["Invitation/application link and identity data."], outputs: ["Linked builder profile and active membership."], states: ["invited → authenticated → linked/assigned"], gates: ["Identity and organization match."], exceptions: ["Expired/mismatched invite or existing-profile conflict."], permissions: ["Invited builder identity; own profile only."],
        upstream: ["WF-TEN-002.BRKR.01"], downstream: ["WF-PRP-001.BLDR.01"], handoffs: ["WF-TEN-002.HO-01"], events: ["invitation.accepted", "builder.linked"], success: ["Proposal intake is available."], failure: ["Access remains blocked with reason."], sources: [`${src.production} §8.3`],
      })),
      segment("WF-TEN-002.SYS.01", "Link profile and materialize assignment", "SYS", "Identity and assignment projection", common({
        purpose: "Resolve the builder identity and persist the active relationship without duplicating webhook-owned users.", trigger: "Builder account/invite acceptance is synchronized.", steps: ["Resolve/create builderProfile.", "Validate organization/broker.", "Create active assignment.", "Publish onboarding result."],
        inputs: ["WorkOS identity projection, builder profile candidate, broker assignment intent."], outputs: ["Profile link, assignment, audit/outbox rows."], states: ["pending → active or exception"], gates: ["One current assignment per applicable policy; organization scope."], exceptions: ["Duplicate profile, cross-tenant conflict, missing broker."], permissions: ["System mutation with authenticated organization context."],
        upstream: ["WF-TEN-002.BLDR.01"], downstream: ["WF-PRP-001"], handoffs: ["WF-TEN-002.HO-02"], events: ["assignment audit/outbox", "onboarding status notification"], success: ["Builder/broker relationship is queryable and historical."], failure: ["No active assignment; exception is surfaced."], sources: [`${src.production} §8.3`, `${src.auth}`],
      })),
    ],
  },
  {
    id: "WF-TEN-004",
    name: "Brokerage Staff Invitation, Role Change, and Deactivation",
    persona: "CROSS",
    category: "Brokerage administration",
    purpose: "Let the Principal Broker administer broker/backoffice membership and roles while making access changes immediate, audited, and historically non-destructive.",
    preconditions: ["Brokerage is active with one Principal Broker (`WF-TEN-001`).", "Target identity is not the active Principal Broker being transferred through a different authority workflow."],
    trigger: "Principal Broker invites a broker/backoffice user, changes a member role, or deactivates future access.",
    steps: ["Open Brokerage Management and review staff/roles/assignments/work.", "Invite broker or backoffice staff, or select an existing member.", "Assign/change role or deactivate with required audit context.", "Invitee accepts when applicable.", "System projects WorkOS membership/role state.", "Update navigation/query/write access immediately while preserving history.", "Review affected builder assignments/work queues and reroute explicitly if needed."],
    inputs: ["Target identity, WorkOS organization, role, activation/deactivation intent.", "Affected assignments/work queues and audit actor/timestamp/reason where applicable."],
    outputs: ["Invitation or updated membership/role/access state.", "Preserved historical activity.", "Role/deactivation audit event and affected-work review."],
    states: ["membership: absent → invited → active", "role: prior_active → changed_active", "access: active → deactivated; historical records retained"],
    gates: ["Principal Broker organization authority.", "Role changes require audit.", "Webhook-owned WorkOS projection tables are not directly mutated."],
    exceptions: ["Expired/revoked/mismatched invite.", "Attempt to create a second Principal Broker is rejected/routed to `WF-TEN-001`.", "Deactivation with active assignments requires explicit reroute through `WF-TEN-003`/`WF-OPS-001`."],
    permissions: ["Principal Broker administers own-brokerage members.", "Invitee accepts only bound invitation.", "Deactivated user loses future access but history remains."],
    upstream: ["WF-TEN-001"], downstream: ["WF-TEN-002", "WF-TEN-003", "WF-OPS-001"], handoffs: ["WF-TEN-004.HO-01", "WF-TEN-004.HO-02", "WF-TEN-004.HO-03"],
    events: ["WorkOS invitation/membership/role events.", "Role change/deactivation audit.", "Access/assignment/work-routing notifications."], success: ["Correct member has correct immediate access and accountable work ownership; history remains readable."], failure: ["Invitation/change is rejected or pending; prior valid access remains unless an authorized deactivation completed."],
    sources: [`${src.production} §8.2`, `${src.auth}`], status: "SUPPORTED",
    participants: ["LADM", "BRKR", "LOPS", "SYS"],
    handoffDefinitions: [
      { id: "WF-TEN-004.HO-01", from: "LADM", to: "BRKR", trigger: "Broker invitation is issued or broker role/access changes.", artifacts: "Organization invitation/role, effective access, affected builder assignments/work, deactivation/change context.", acknowledgement: "Broker accepts invitation or reviews changed access and assumes/reroutes assigned work." },
      { id: "WF-TEN-004.HO-02", from: "LADM", to: "LOPS", trigger: "Backoffice invitation is issued or operations role/access changes.", artifacts: "Organization invitation/role, queue capabilities, affected assignments/work, deactivation/change context.", acknowledgement: "Operations user accepts invitation or reviews changed access and addresses affected work." },
      { id: "WF-TEN-004.HO-03", from: "SYS", to: "LADM", trigger: "WorkOS membership/role projection applies or fails.", artifacts: "Projected membership/role, route/query/write capability result, affected work/assignment warning, sync failure.", acknowledgement: "Principal Broker verifies access and reroutes work or repairs the invitation/role." },
    ],
    segments: [
      segment("WF-TEN-004.LADM.01", "Administer brokerage staff access", "LADM", "Brokerage administration", common({purpose:"Invite, re-role, or deactivate brokerage members with immediate, audited access effects.",trigger:"Staffing or authority needs change.",steps:["Review staff/assignments/work.","Invite/select member.","Assign/change role or deactivate.","Review audit/access projection.","Reroute affected work."],inputs:["Identity/role/change and affected work."],outputs:["Authorized membership/role command and routing action."],states:["absent → invited/active; active → changed/deactivated"],gates:["Principal Broker authority; audit required."],exceptions:["Principal transfer, active-work conflict, failed sync."],permissions:["Principal Broker own brokerage."],upstream:["WF-TEN-001.LADM.01"],downstream:["WF-TEN-003","WF-OPS-001"],handoffs:["WF-TEN-004.HO-01","WF-TEN-004.HO-02","WF-TEN-004.HO-03"],events:["invitation/role/deactivation audit"],success:["Access and work ownership are correct."],failure:["Prior valid state or explicit pending repair."],sources:[`${src.production} §8.2`]})),
      segment("WF-TEN-004.BRKR.01", "Accept or respond to broker access change", "BRKR", "Broker membership", common({purpose:"Activate broker membership or respond to changed/deactivated access and work scope.",trigger:"Invitation/access-change notice arrives.",steps:["Accept/authenticate if invited.","Review role/navigation/assigned builders/work.","Acknowledge operational ownership or surface routing issue."],inputs:["Invitation/role/access/work scope."],outputs:["Active membership/acknowledgement or routing issue."],states:["invited → active; active → changed/deactivated"],gates:["Bound identity and projected role."],exceptions:["Expiry/mismatch/missing access/work routing."],permissions:["Target Broker only."],upstream:["WF-TEN-004.LADM.01"],downstream:["WF-TEN-002","WF-OPS-001"],handoffs:["WF-TEN-004.HO-01"],events:["invite accepted/access acknowledgement"],success:["Broker access/work scope is understood."],failure:["Access/routing exception remains explicit."],sources:[`${src.production} §8.2`]})),
      segment("WF-TEN-004.LOPS.01", "Accept or respond to backoffice access change", "LOPS", "Backoffice membership", common({purpose:"Activate operations membership or respond to changed/deactivated queue capabilities.",trigger:"Invitation/access-change notice arrives.",steps:["Accept/authenticate if invited.","Review role/navigation/queue capability/work.","Acknowledge or surface routing issue."],inputs:["Invitation/role/access/work scope."],outputs:["Active membership/acknowledgement or routing issue."],states:["invited → active; active → changed/deactivated"],gates:["Bound identity and projected role."],exceptions:["Expiry/mismatch/missing access/work routing."],permissions:["Target backoffice user only."],upstream:["WF-TEN-004.LADM.01"],downstream:["WF-OPS-001"],handoffs:["WF-TEN-004.HO-02"],events:["invite accepted/access acknowledgement"],success:["Operations access/work scope is understood."],failure:["Access/routing exception remains explicit."],sources:[`${src.production} §8.2`]})),
      segment("WF-TEN-004.SYS.01", "Project role changes and enforce immediate access", "SYS", "Authorization projection", common({purpose:"Synchronize WorkOS-owned membership/role changes into route/query/write access and preserve historical records.",trigger:"Invitation/membership/role webhook or authorized admin command occurs.",steps:["Initiate WorkOS change where applicable.","Project webhook state.","Recompute capabilities/navigation/query access.","Preserve historical actor records.","Flag affected active work.","Emit audit/notification."],inputs:["Authorized change and WorkOS events."],outputs:["Access projection, audit, routing warning."],states:["pending projection → active/changed/deactivated or sync_error"],gates:["Webhook-owned projection and organization scope."],exceptions:["Duplicate/out-of-order webhook, failed role sync, active work without owner."],permissions:["System under Principal Broker authorization."],upstream:["WF-TEN-004.LADM.01"],downstream:["WF-OPS-001"],handoffs:["WF-TEN-004.HO-03"],events:["identity projection/access/audit/notification"],success:["Immediate correct access with preserved history."],failure:["Sync error visible; no silent privilege drift."],sources:[`${src.production} §8.2`,`${src.auth}`]})),
    ],
  },
];

const resolvedDecisions = [
  "RESOLVED — `WF-DRW-001` uses a pooled builder-facing balance backed by deterministic, immutable FIFO allocations to lender-admin-approved Milestones and their Draw Groups. The request record is the Draw Release Work Order; operations prepares `ready_for_admin`, lender admin decides/releases, and every transition is organization-scoped and audited.",
  "RESOLVED — v1 permits partial request amounts against fully approved Milestone value. Subtask-based or partially completed-work reimbursement remains out of scope.",
];

const validationGaps = [
  "NEEDS_VALIDATION — Cross-brokerage transfer: define source/destination consent, document ownership, historical visibility, and active-work repair/atomicity policy.",
  "NEEDS_VALIDATION — Lender Policy administration: configuration values are required and a Policy entity is organization-scoped, but no complete create/version/approve/activate workflow is specified; therefore no unsupported workflow was invented.",
  "NEEDS_VALIDATION — Webhook operations: define payload/version contract, retry/backoff, dead-letter/replay, secret rotation, and MVP event depth.",
  "NEEDS_VALIDATION — Notification preferences: V1 has a schema foundation but explicitly no preference UI, so preference-management is not modeled as a user workflow.",
  "NEEDS_VALIDATION — Material procurement: documentation supports planning and closing copy only; purchasing, delivery, receipt, and supplier-payment workflows are intentionally excluded.",
];

const sourceCoverage: { source: string; workflows: string[] }[] = [
  { source: `${src.production} §8.1`, workflows: ["WF-TEN-001"] },
  { source: `${src.production} §8.2`, workflows: ["WF-TEN-004", "WF-TEN-002", "WF-TEN-003", "WF-OPS-001"] },
  { source: `${src.production} §8.3–8.4`, workflows: ["WF-TEN-002", "WF-TEN-003"] },
  { source: `${src.production} §8.5`, workflows: ["WF-CTR-001"] },
  { source: `${src.production} §8.6–8.7`, workflows: ["WF-PRP-001"] },
  { source: `${src.production} §8.8`, workflows: ["WF-BLD-001", "WF-CTR-002", "WF-MAT-001", "WF-CAL-001", "WF-BUD-001"] },
  { source: `${src.production} §8.9`, workflows: ["WF-OPS-001", "WF-MIL-001", "WF-DRW-001"] },
  { source: `${src.production} §8.10`, workflows: ["WF-MIL-001", "WF-DRW-001"] },
  { source: `${src.core} §11.1–11.2`, workflows: ["WF-PRP-001"] },
  { source: `${src.core} §11.3`, workflows: ["WF-BLD-001", "WF-MIL-001"] },
  { source: `${src.core} §11.4–11.5`, workflows: ["WF-MIL-001", "WF-CAL-001"] },
  { source: `${src.core} §11.6`, workflows: ["WF-MIL-001", "WF-DRW-001"] },
  { source: `${src.core} §11.7`, workflows: ["WF-BUD-001"] },
  { source: `${src.core} §18.3.4–18.3.8`, workflows: ["WF-MIL-001"] },
  { source: `${src.core} §18.3.9–18.3.12`, workflows: ["WF-DRW-001", "WF-MIL-001", "WF-BUD-001", "WF-OPS-001"] },
  { source: `${src.contractor} §7, §9, §14.1–14.2`, workflows: ["WF-CTR-001"] },
  { source: `${src.contractor} §8, §10, §14.3–14.4`, workflows: ["WF-CTR-002", "WF-CAL-001", "WF-COM-001"] },
  { source: src.materials, workflows: ["WF-MAT-001"] },
  { source: src.drawRequest, workflows: ["WF-DRW-001"] },
  { source: src.calendar, workflows: ["WF-CAL-001"] },
  { source: src.notifications, workflows: ["WF-COM-001"] },
  { source: `${src.screens} SCR-028`, workflows: ["WF-INT-001"] },
];

function stepId(entry: Entry, index: number): string {
  const base = entry.persona === "CROSS" ? `${entry.id}.PARENT.00` : entry.id;
  return `${base}.STEP-${String(index + 1).padStart(2, "0")}`;
}

function allEntries(): Entry[] {
  return workflows.flatMap((workflow) => [workflow, ...workflow.segments]);
}

function validate(): string[] {
  const errors: string[] = [];
  const entries = allEntries();
  const workflowIds = new Set(entries.map((entry) => entry.id));
  const parentIds = new Set(workflows.map((workflow) => workflow.id));
  const handoffs = workflows.flatMap((workflow) => workflow.handoffDefinitions);
  const handoffIds = new Set(handoffs.map((handoff) => handoff.id));
  const allIds: string[] = [
    ...entries.map((entry) => entry.id),
    ...handoffs.map((handoff) => handoff.id),
    ...entries.flatMap((entry) => entry.steps.map((_, index) => stepId(entry, index))),
  ];
  const duplicates = allIds.filter((id, index) => allIds.indexOf(id) !== index);
  if (duplicates.length) errors.push(`Duplicate identifiers: ${[...new Set(duplicates)].join(", ")}`);
  const normalizedNames = entries.map((entry) => entry.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  const duplicateNames = normalizedNames.filter((name, index) => normalizedNames.indexOf(name) !== index);
  if (duplicateNames.length) errors.push(`Duplicate workflow entry names: ${[...new Set(duplicateNames)].join(", ")}`);
  const idSet = new Set(allIds);
  const referencedIds = JSON.stringify({ workflows, resolvedDecisions, validationGaps, sourceCoverage }).match(/WF-[A-Z]{3}-\d{3}(?:\.(?:[A-Z]{3,4}\.\d{2}|HO-\d{2})(?:\.STEP-\d{2})?)?/g) ?? [];
  for (const reference of referencedIds) if (!idSet.has(reference)) errors.push(`Free-text/data reference does not exist: ${reference}`);

  for (const workflow of workflows) {
    if (!/^WF-[A-Z]{3}-\d{3}$/.test(workflow.id)) errors.push(`Invalid parent ID: ${workflow.id}`);
    const normalized = workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (workflows.some((other) => other !== workflow && other.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalized)) {
      errors.push(`Duplicate parent workflow name: ${workflow.name}`);
    }
    for (const segmentEntry of workflow.segments) {
      if (!new RegExp(`^${workflow.id.replace(/-/g, "\\-")}\\.[A-Z]{3,4}\\.\\d{2}$`).test(segmentEntry.id)) errors.push(`Invalid segment ID: ${segmentEntry.id}`);
      if (segmentEntry.parentWorkflowId !== workflow.id) errors.push(`${segmentEntry.id} has wrong parent ${segmentEntry.parentWorkflowId}`);
      if (!workflow.participants.includes(segmentEntry.persona as PersonaCode)) errors.push(`${segmentEntry.id} persona absent from parent participants`);
    }
    for (const handoff of workflow.handoffDefinitions) {
      if (!new RegExp(`^${workflow.id.replace(/-/g, "\\-")}\\.HO-\\d{2}$`).test(handoff.id)) errors.push(`Invalid handoff ID: ${handoff.id}`);
      const fromRefs = workflow.segments.filter((entry) => entry.persona === handoff.from && entry.handoffs.includes(handoff.id));
      const toRefs = workflow.segments.filter((entry) => entry.persona === handoff.to && entry.handoffs.includes(handoff.id));
      if (!fromRefs.length) errors.push(`${handoff.id} missing sender-side reference (${handoff.from})`);
      if (!toRefs.length) errors.push(`${handoff.id} missing receiver-side reference (${handoff.to})`);
      if (![handoff.trigger, handoff.artifacts, handoff.acknowledgement].every(Boolean)) errors.push(`${handoff.id} missing required handoff detail`);
    }
  }

  const requiredArrayFields: (keyof Entry)[] = ["preconditions", "steps", "inputs", "outputs", "states", "gates", "exceptions", "permissions", "events", "success", "failure", "sources"];
  for (const entry of entries) {
    if (!entry.name || !entry.category || !entry.purpose || !entry.trigger) errors.push(`${entry.id} missing required scalar field`);
    for (const field of requiredArrayFields) {
      if (!Array.isArray(entry[field]) || (entry[field] as string[]).length === 0) errors.push(`${entry.id} missing ${field}`);
    }
    for (const dependency of [...entry.upstream, ...entry.downstream]) {
      if (!workflowIds.has(dependency)) errors.push(`${entry.id} references missing dependency ${dependency}`);
    }
    for (const handoffId of entry.handoffs) {
      if (!handoffIds.has(handoffId)) errors.push(`${entry.id} references missing handoff ${handoffId}`);
    }
    entry.steps.forEach((_, index) => {
      const id = stepId(entry, index);
      if (!/^WF-[A-Z]{3}-\d{3}\.(?:PARENT\.00|[A-Z]{3,4}\.\d{2})\.STEP-\d{2}$/.test(id)) errors.push(`Invalid step ID: ${id}`);
    });
    if (entry.status === "NEEDS_VALIDATION" && !entry.validationNote) errors.push(`${entry.id} lacks NEEDS_VALIDATION reasoning`);
    for (const source of entry.sources) {
      const path = source.split(" ")[0].replaceAll("`", "");
      if (!existsSync(resolve(ROOT, path))) errors.push(`${entry.id} source path does not exist: ${path}`);
    }
  }

  for (const workflow of workflows) {
    if (!workflow.participants.every((code) => workflow.segments.some((entry) => entry.persona === code))) {
      errors.push(`${workflow.id} participant has no persona-specific segment`);
    }
    if (!parentIds.has(workflow.id)) errors.push(`Missing parent registry entry ${workflow.id}`);
  }
  for (const coverage of sourceCoverage) {
    for (const workflowId of coverage.workflows) if (!parentIds.has(workflowId)) errors.push(`Coverage map references missing parent ${workflowId}`);
    const path = coverage.source.split(" ")[0];
    if (!existsSync(resolve(ROOT, path))) errors.push(`Coverage source path does not exist: ${path}`);
  }
  return errors;
}

function bullets(values: string[]): string {
  return values.map((value) => `  - ${value}`).join("\n");
}

function renderEntry(entry: Entry, parent?: ParentWorkflow): string {
  const status = entry.status ?? "SUPPORTED";
  const lines = [
    `### ${entry.id} — ${entry.name}`,
    "",
    `1. **Unique workflow ID:** \`${entry.id}\``,
    `2. **Workflow name:** ${entry.name}`,
    `3. **Persona:** ${entry.persona === "CROSS" ? "Cross-persona parent workflow" : `${personas[entry.persona].name} (\`${entry.persona}\`)`}`,
    `4. **Functional category:** ${entry.category}`,
    `5. **Parent workflow ID:** ${entry.parentWorkflowId ? `\`${entry.parentWorkflowId}\`` : "Not applicable — this is the parent workflow."}`,
    `6. **Purpose and intended outcome:** ${entry.purpose}`,
    "7. **Preconditions:**",
    bullets(entry.preconditions),
    `8. **Trigger:** ${entry.trigger}`,
    "9. **Ordered workflow steps:**",
    ...entry.steps.map((value, index) => `  ${index + 1}. \`${stepId(entry, index)}\` — ${value}`),
    "10. **Inputs and required artifacts:**",
    bullets(entry.inputs),
    "11. **Outputs and generated artifacts:**",
    bullets(entry.outputs),
    "12. **System states and state transitions:**",
    bullets(entry.states),
    "13. **Decisions, validations, and approval gates:**",
    bullets(entry.gates),
    "14. **Exceptions, rejection paths, and recovery flows:**",
    bullets(entry.exceptions),
    "15. **Permissions and role constraints:**",
    bullets(entry.permissions),
    "16. **Upstream and downstream workflow dependencies:**",
    `  - Upstream: ${entry.upstream.length ? entry.upstream.map((id) => `\`${id}\``).join(", ") : "None."}`,
    `  - Downstream: ${entry.downstream.length ? entry.downstream.map((id) => `\`${id}\``).join(", ") : "None."}`,
    "17. **Cross-persona handoffs:**",
  ];
  if (entry.persona === "CROSS") {
    const workflow = entry as ParentWorkflow;
    lines.push(...workflow.handoffDefinitions.map((handoff) => `  - \`${handoff.id}\` — **${personas[handoff.from].name} → ${personas[handoff.to].name}.** Trigger: ${handoff.trigger} Artifacts: ${handoff.artifacts} Required acknowledgement/next action: ${handoff.acknowledgement}`));
  } else {
    if (!entry.handoffs.length) lines.push("  - None directly in this segment; related cross-persona routing is owned by the parent workflow or an explicitly referenced dependency.");
    lines.push(...entry.handoffs.map((id) => {
      const handoff = parent?.handoffDefinitions.find((candidate) => candidate.id === id);
      const direction = handoff ? `${personas[handoff.from].name} → ${personas[handoff.to].name}` : "See parent";
      return `  - \`${id}\` — ${direction}; see parent handoff registry for the shared trigger, artifacts, and acknowledgement contract.`;
    }));
  }
  lines.push(
    "18. **Audit, notification, and integration events:**",
    bullets(entry.events),
    "19. **Terminal success and failure states:**",
    "  - Success:",
    bullets(entry.success).replace(/^  /gm, "    "),
    "  - Failure:",
    bullets(entry.failure).replace(/^  /gm, "    "),
    "20. **Source references:**",
    bullets(entry.sources.map((source) => `\`${source}\``)),
    `**Support status:** \`${status}\`${entry.validationNote ? ` — ${entry.validationNote}` : ""}`,
    "",
  );
  return lines.join("\n");
}

function render(): string {
  const entries = allEntries();
  const summaryRows = entries
    .slice()
    .sort((a, b) => {
      const personaA = a.persona === "CROSS" ? "00" : personas[a.persona].name;
      const personaB = b.persona === "CROSS" ? "00" : personas[b.persona].name;
      return personaA.localeCompare(personaB) || a.category.localeCompare(b.category) || a.id.localeCompare(b.id);
    })
    .map((entry) => {
      const parent = entry.parentWorkflowId ? workflows.find((workflow) => workflow.id === entry.parentWorkflowId)! : entry as ParentWorkflow;
      const persona = entry.persona === "CROSS" ? "Cross-persona parent" : personas[entry.persona].name;
      return `| \`${entry.id}\` | ${entry.name} | ${persona} | ${entry.category} | ${entry.parentWorkflowId ? `\`${entry.parentWorkflowId}\`` : "—"} | ${parent.participants.map((code) => personas[code].name).join("; ")} | \`${entry.status ?? "SUPPORTED"}\` |`;
    });

  const personaSections: string[] = [];
  for (const [code, persona] of Object.entries(personas) as [PersonaCode, (typeof personas)[PersonaCode]][]) {
    const segments = workflows.flatMap((workflow) => workflow.segments.map((entry) => ({ entry, workflow }))).filter(({ entry }) => entry.persona === code);
    if (!segments.length) continue;
    personaSections.push(`## Persona: ${persona.name} (\`${code}\`)`, "", persona.definition, "");
    const categories = [...new Set(segments.map(({ entry }) => entry.category))].sort();
    for (const category of categories) {
      personaSections.push(`### Functional category: ${category}`, "");
      for (const { entry, workflow } of segments.filter(({ entry }) => entry.category === category).sort((a, b) => a.entry.id.localeCompare(b.entry.id))) {
        personaSections.push(renderEntry(entry, workflow));
      }
    }
  }

  return [
    "# DrawFlow Core Product Workflow Manifest",
    "",
    "> Canonical, source-backed workflow inventory. Generated by `scripts/core-workflow-manifest.ts`; do not edit the generated file by hand.",
    "",
    "## Scope and conventions",
    "",
    "This manifest models reimbursement-only DrawFlow workflows from tenant provisioning through build execution, evidence verification, draw release, receipt, notifications, and integrations. Parent workflows are end-to-end processes; persona segments are the only persona-specific views of those parents. Shared handoff IDs are defined once on the parent and referenced by both sending and receiving segments.",
    "",
    "Identifiers use `WF-{DOMAIN}-{NNN}` for parents, `WF-{DOMAIN}-{NNN}.{PERSONA}.{NN}` for segments, `WF-{DOMAIN}-{NNN}.HO-{NN}` for handoffs, and `{workflow-or-segment}.STEP-{NN}` for steps. `SUPPORTED` means directly supported by cited documentation. `NEEDS_VALIDATION` means the source is incomplete or conflicting; the exact gap is stated and no unsupported behavior is silently asserted.",
    "",
    "### Domain invariants applied throughout",
    "",
    "- V1 is reimbursement-only: work is completed, evidenced, reviewed, approved, and only then released.",
    "- Interest starts only after funds are released; request and approval do not start interest.",
    "- Borrower Working Capital Limit and Lender Draw Policy Limit are distinct constraints and are never collapsed.",
    "- Lender Operations may review, inspect, report, prepare, and recommend; Lender Admin/Principal Broker retains final milestone and release authority.",
    "- Geofence failure, low confidence, or suspected spoofed location never discards evidence; it creates an explicit review/override path.",
    "- Approved Budgets are versioned, never overwritten.",
    "- Material decisions/overrides capture actor, role, timestamp, prior/new state, warnings, and reason where applicable.",
    "- Every domain record and workflow action is organization-scoped; WorkOS projection tables remain webhook-owned.",
    "",
    "## Persona catalog",
    "",
    "| Code | Persona | Boundary |",
    "|---|---|---|",
    ...Object.entries(personas).map(([code, persona]) => `| \`${code}\` | ${persona.name} | ${persona.definition} |`),
    "",
    "# Part 1 — Summary matrix",
    "",
    "| Workflow ID | Workflow | Persona | Functional category | Parent workflow | Participating personas | Status |",
    "|---|---|---|---|---|---|---|",
    ...summaryRows,
    "",
    "## Authoritative source coverage map",
    "",
    "| Source workflow section | Canonical parent workflow(s) |",
    "|---|---|",
    ...sourceCoverage.map((row) => `| \`${row.source}\` | ${row.workflows.map((id) => `\`${id}\``).join(", ")} |`),
    "",
    "# Part 2 — Detailed workflow manifest",
    "",
    "## Cross-persona parent workflows",
    "",
    ...workflows.map((workflow) => renderEntry(workflow)),
    "# Persona-indexed workflow segments",
    "",
    ...personaSections,
    "# Resolved product conflicts",
    "",
    ...resolvedDecisions.map((decision) => `- ${decision}`),
    "",
    "# Unresolved gaps and explicitly excluded unsupported workflows",
    "",
    ...validationGaps.map((gap) => `- ${gap}`),
    "",
    "# Validation contract",
    "",
    "Run `bun run scripts/core-workflow-manifest.ts --check`. The validator proves unique IDs; valid identifier formats; existing parent, dependency, and handoff references; both sender and receiver references for every handoff; parent/segment traceability; nonempty required fields; unique parent names; source-file existence; and exact generated-file parity.",
    "",
    `**Last generated validation result:** ${workflows.length} parent workflows, ${workflows.reduce((count, workflow) => count + workflow.segments.length, 0)} persona segments, ${workflows.reduce((count, workflow) => count + workflow.handoffDefinitions.length, 0)} handoffs, and ${allEntries().reduce((count, entry) => count + entry.steps.length, 0)} unique workflow steps passed all invariants.`,
    "",
  ].join("\n");
}

const errors = validate();
if (errors.length) {
  console.error(`Workflow manifest validation failed (${errors.length}):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

const generated = render();
if (process.argv.includes("--write")) {
  writeFileSync(OUTPUT, generated);
  console.log(`Wrote ${OUTPUT} (${workflows.length} parents, ${workflows.reduce((count, workflow) => count + workflow.segments.length, 0)} segments, ${workflows.reduce((count, workflow) => count + workflow.handoffDefinitions.length, 0)} handoffs).`);
} else if (process.argv.includes("--check")) {
  if (!existsSync(OUTPUT)) {
    console.error(`Generated manifest is missing: ${OUTPUT}`);
    process.exit(1);
  }
  const current = readFileSync(OUTPUT, "utf8");
  if (current !== generated) {
    console.error("Generated manifest is stale. Run: bun run scripts/core-workflow-manifest.ts --write");
    process.exit(1);
  }
  console.log(`Validated ${workflows.length} parents, ${workflows.reduce((count, workflow) => count + workflow.segments.length, 0)} persona segments, ${workflows.reduce((count, workflow) => count + workflow.handoffDefinitions.length, 0)} handoffs, and ${allEntries().reduce((count, entry) => count + entry.steps.length, 0)} uniquely identified steps.`);
} else {
  console.log(generated);
}
