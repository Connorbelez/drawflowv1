export type Status = "SUPPORTED" | "NEEDS_VALIDATION";
export type PersonaCode =
  | "PADM"
  | "LADM"
  | "BRKR"
  | "LOPS"
  | "BLDR"
  | "CNTR"
  | "INSP"
  | "TADM"
  | "SYS";

export interface Handoff {
  acknowledgement: string;
  artifacts: string;
  from: PersonaCode;
  id: string;
  to: PersonaCode;
  trigger: string;
}

export interface Entry {
  category: string;
  downstream: string[];
  events: string[];
  exceptions: string[];
  failure: string[];
  gates: string[];
  handoffs: string[];
  id: string;
  inputs: string[];
  name: string;
  outputs: string[];
  parentWorkflowId?: string;
  permissions: string[];
  persona: PersonaCode | "CROSS";
  preconditions: string[];
  purpose: string;
  sources: string[];
  states: string[];
  status?: Status;
  steps: string[];
  success: string[];
  trigger: string;
  upstream: string[];
  validationNote?: string;
}

export interface ParentWorkflow extends Entry {
  handoffDefinitions: Handoff[];
  participants: PersonaCode[];
  persona: "CROSS";
  segments: Entry[];
}

export const personas: Record<
  PersonaCode,
  { name: string; definition: string }
> = {
  PADM: {
    name: "Platform Admin",
    definition:
      "FairLend platform-level tenant provisioning, cross-brokerage transfer, support, and platform audit authority.",
  },
  LADM: {
    name: "Lender Admin / Principal Broker",
    definition:
      "Organization-scoped final authority for proposal closing, milestone decisions, policy overrides, material revisions, and draw release.",
  },
  BRKR: {
    name: "Broker",
    definition:
      "Assigned relationship owner who onboards builders, manages assigned proposals/builds, and coordinates operational work without inheriting final authority.",
  },
  LOPS: {
    name: "Lender Operations / Backoffice Staff",
    definition:
      "Brokerage operators who claim queues, review evidence, request information or visits, prepare packages, and recommend decisions.",
  },
  BLDR: {
    name: "Builder",
    definition:
      "Builder/developer principal and permissioned builder staff. Role constraints within a segment identify lead-only or staff-permitted actions.",
  },
  CNTR: {
    name: "Contractor",
    definition:
      "Contractor profile/account holder participating only in assigned proposal, build, milestone, schedule, and supporting-evidence scope.",
  },
  INSP: {
    name: "Site Visit Staff / Inspector",
    definition:
      "Internal, contracted, or external field verifier with assignment/token-scoped access and recommendation-only authority.",
  },
  TADM: {
    name: "Technical / Organization Admin",
    definition:
      "Organization-scoped integration administrator for API keys, webhooks, subscriptions, secrets, mappings, and delivery diagnostics.",
  },
  SYS: {
    name: "DrawFlow System",
    definition:
      "Automated actor for validation, optimization, state projection, notification, audit/outbox creation, geofence checks, and integration delivery.",
  },
};

export const src = {
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

export function segment(
  id: string,
  name: string,
  persona: PersonaCode,
  category: string,
  details: Omit<
    Entry,
    "id" | "name" | "persona" | "category" | "parentWorkflowId"
  >
): Entry {
  return {
    id,
    name,
    persona,
    category,
    parentWorkflowId: id.split(".")[0],
    ...details,
  };
}

export function common(
  details: Partial<Omit<Entry, "id" | "name" | "persona" | "category">>
): Omit<Entry, "id" | "name" | "persona" | "category" | "parentWorkflowId"> {
  return {
    purpose:
      details.purpose ??
      "Participate in the parent workflow within the persona's authority boundary.",
    preconditions: details.preconditions ?? [
      "The actor is authenticated in the correct WorkOS organization and the target record is organization-scoped.",
    ],
    trigger:
      details.trigger ??
      "The preceding workflow state makes this segment actionable.",
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
