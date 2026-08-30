import {
  common,
  type ParentWorkflow,
  segment,
  src,
} from "./core-workflow-manifest-model";

export const workflowsPart06: ParentWorkflow[] = [
  {
    id: "WF-TEN-002",
    name: "Builder Onboarding and Broker Assignment",
    persona: "CROSS",
    category: "Relationship onboarding",
    purpose:
      "Create or link a builder identity and establish an active broker/brokerage assignment before proposal submission.",
    preconditions: [
      "Brokerage is active (`WF-TEN-001`).",
      "Broker is an authorized brokerage member.",
    ],
    trigger:
      "Broker invites a builder or starts an application on the builder's behalf.",
    steps: [
      "Initiate builder invitation/application.",
      "Builder signs up or accepts invite.",
      "Link or create builderProfile.",
      "Create active builderBrokerAssignment.",
      "Unlock proposal intake.",
    ],
    inputs: [
      "Builder identity/contact.",
      "Inviting broker and brokerage.",
      "Existing profile match data.",
    ],
    outputs: [
      "Linked builder account/profile.",
      "Active assignment.",
      "Proposal intake eligibility.",
    ],
    states: [
      "builder identity: absent/invited → linked",
      "assignment: absent → active",
    ],
    gates: [
      "Builder must be tied to a broker and brokerage before proposal submission.",
      "WorkOS-derived tenancy and role checks.",
    ],
    exceptions: [
      "Existing profile is linked instead of duplicated.",
      "Invitation expiry/mismatch routes to repair.",
      "Cross-brokerage conflicts route to `WF-TEN-003`.",
    ],
    permissions: [
      "Broker may onboard within own brokerage.",
      "Builder sees own profile/proposals only.",
      "WorkOS projection tables remain webhook-owned.",
    ],
    upstream: ["WF-TEN-001"],
    downstream: ["WF-PRP-001", "WF-TEN-003"],
    handoffs: ["WF-TEN-002.HO-01", "WF-TEN-002.HO-02"],
    events: [
      "Builder invitation/account link.",
      "Assignment created audit event.",
      "Onboarding notification.",
    ],
    success: [
      "Builder has an active, traceable broker assignment and can create a proposal.",
    ],
    failure: ["Builder remains unable to submit a proposal."],
    sources: [`${src.production} §4.3, §4.5, §8.3`, `${src.proposal} §4–§6`],
    status: "SUPPORTED",
    participants: ["BRKR", "BLDR", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-TEN-002.HO-01",
        from: "BRKR",
        to: "BLDR",
        trigger: "Invitation/application start is recorded.",
        artifacts:
          "Invite or application link, brokerage/broker identity, onboarding requirements.",
        acknowledgement:
          "Builder authenticates, accepts, and completes required identity/profile data.",
      },
      {
        id: "WF-TEN-002.HO-02",
        from: "SYS",
        to: "BRKR",
        trigger:
          "Profile link and assignment become active or fail validation.",
        artifacts:
          "Builder profile ID, assignment state, organization scope, error/duplicate context.",
        acknowledgement:
          "Broker confirms onboarding completion or resolves the exception.",
      },
    ],
    segments: [
      segment(
        "WF-TEN-002.BRKR.01",
        "Initiate builder onboarding",
        "BRKR",
        "Builder relationship management",
        common({
          purpose:
            "Invite a builder and own the initial brokerage relationship.",
          trigger: "A prospective builder is ready for intake.",
          steps: [
            "Search for existing builder.",
            "Invite or start application.",
            "Monitor acceptance/linking.",
            "Confirm assignment.",
          ],
          inputs: ["Builder contact and brokerage context."],
          outputs: ["Invite/application and assignment intent."],
          states: ["prospect → invited → assigned"],
          gates: ["Broker is active in brokerage."],
          exceptions: ["Duplicate/mismatched identity, expired invitation."],
          permissions: ["Brokerage-scoped Broker/Principal Broker."],
          upstream: ["WF-TEN-001"],
          downstream: ["WF-PRP-001"],
          handoffs: ["WF-TEN-002.HO-01", "WF-TEN-002.HO-02"],
          events: ["builder.invited", "assignment.created"],
          success: ["Assigned builder is ready for proposal intake."],
          failure: ["Onboarding remains pending/blocked."],
          sources: [`${src.production} §8.3`],
        })
      ),
      segment(
        "WF-TEN-002.BLDR.01",
        "Accept onboarding and establish builder profile",
        "BLDR",
        "Builder onboarding",
        common({
          purpose:
            "Join the correct brokerage and establish the builder-side account/profile.",
          trigger: "Broker invitation or application link is received.",
          steps: [
            "Authenticate/create account.",
            "Accept organization invitation.",
            "Complete/confirm builder profile.",
            "Confirm assigned broker and enter proposal intake.",
          ],
          inputs: ["Invitation/application link and identity data."],
          outputs: ["Linked builder profile and active membership."],
          states: ["invited → authenticated → linked/assigned"],
          gates: ["Identity and organization match."],
          exceptions: [
            "Expired/mismatched invite or existing-profile conflict.",
          ],
          permissions: ["Invited builder identity; own profile only."],
          upstream: ["WF-TEN-002.BRKR.01"],
          downstream: ["WF-PRP-001.BLDR.01"],
          handoffs: ["WF-TEN-002.HO-01"],
          events: ["invitation.accepted", "builder.linked"],
          success: ["Proposal intake is available."],
          failure: ["Access remains blocked with reason."],
          sources: [`${src.production} §8.3`],
        })
      ),
      segment(
        "WF-TEN-002.SYS.01",
        "Link profile and materialize assignment",
        "SYS",
        "Identity and assignment projection",
        common({
          purpose:
            "Resolve the builder identity and persist the active relationship without duplicating webhook-owned users.",
          trigger: "Builder account/invite acceptance is synchronized.",
          steps: [
            "Resolve/create builderProfile.",
            "Validate organization/broker.",
            "Create active assignment.",
            "Publish onboarding result.",
          ],
          inputs: [
            "WorkOS identity projection, builder profile candidate, broker assignment intent.",
          ],
          outputs: ["Profile link, assignment, audit/outbox rows."],
          states: ["pending → active or exception"],
          gates: [
            "One current assignment per applicable policy; organization scope.",
          ],
          exceptions: [
            "Duplicate profile, cross-tenant conflict, missing broker.",
          ],
          permissions: [
            "System mutation with authenticated organization context.",
          ],
          upstream: ["WF-TEN-002.BLDR.01"],
          downstream: ["WF-PRP-001"],
          handoffs: ["WF-TEN-002.HO-02"],
          events: ["assignment audit/outbox", "onboarding status notification"],
          success: ["Builder/broker relationship is queryable and historical."],
          failure: ["No active assignment; exception is surfaced."],
          sources: [`${src.production} §8.3`, `${src.auth}`],
        })
      ),
    ],
  },
  {
    id: "WF-TEN-004",
    name: "Brokerage Staff Invitation, Role Change, and Deactivation",
    persona: "CROSS",
    category: "Brokerage administration",
    purpose:
      "Let the Principal Broker administer broker/backoffice membership and roles while making access changes immediate, audited, and historically non-destructive.",
    preconditions: [
      "Brokerage is active with one Principal Broker (`WF-TEN-001`).",
      "Target identity is not the active Principal Broker being transferred through a different authority workflow.",
    ],
    trigger:
      "Principal Broker invites a broker/backoffice user, changes a member role, or deactivates future access.",
    steps: [
      "Open Brokerage Management and review staff/roles/assignments/work.",
      "Invite broker or backoffice staff, or select an existing member.",
      "Assign/change role or deactivate with required audit context.",
      "Invitee accepts when applicable.",
      "System projects WorkOS membership/role state.",
      "Update navigation/query/write access immediately while preserving history.",
      "Review affected builder assignments/work queues and reroute explicitly if needed.",
    ],
    inputs: [
      "Target identity, WorkOS organization, role, activation/deactivation intent.",
      "Affected assignments/work queues and audit actor/timestamp/reason where applicable.",
    ],
    outputs: [
      "Invitation or updated membership/role/access state.",
      "Preserved historical activity.",
      "Role/deactivation audit event and affected-work review.",
    ],
    states: [
      "membership: absent → invited → active",
      "role: prior_active → changed_active",
      "access: active → deactivated; historical records retained",
    ],
    gates: [
      "Principal Broker organization authority.",
      "Role changes require audit.",
      "Webhook-owned WorkOS projection tables are not directly mutated.",
    ],
    exceptions: [
      "Expired/revoked/mismatched invite.",
      "Attempt to create a second Principal Broker is rejected/routed to `WF-TEN-001`.",
      "Deactivation with active assignments requires explicit reroute through `WF-TEN-003`/`WF-OPS-001`.",
    ],
    permissions: [
      "Principal Broker administers own-brokerage members.",
      "Invitee accepts only bound invitation.",
      "Deactivated user loses future access but history remains.",
    ],
    upstream: ["WF-TEN-001"],
    downstream: ["WF-TEN-002", "WF-TEN-003", "WF-OPS-001"],
    handoffs: ["WF-TEN-004.HO-01", "WF-TEN-004.HO-02", "WF-TEN-004.HO-03"],
    events: [
      "WorkOS invitation/membership/role events.",
      "Role change/deactivation audit.",
      "Access/assignment/work-routing notifications.",
    ],
    success: [
      "Correct member has correct immediate access and accountable work ownership; history remains readable.",
    ],
    failure: [
      "Invitation/change is rejected or pending; prior valid access remains unless an authorized deactivation completed.",
    ],
    sources: [`${src.production} §8.2`, `${src.auth}`],
    status: "SUPPORTED",
    participants: ["LADM", "BRKR", "LOPS", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-TEN-004.HO-01",
        from: "LADM",
        to: "BRKR",
        trigger: "Broker invitation is issued or broker role/access changes.",
        artifacts:
          "Organization invitation/role, effective access, affected builder assignments/work, deactivation/change context.",
        acknowledgement:
          "Broker accepts invitation or reviews changed access and assumes/reroutes assigned work.",
      },
      {
        id: "WF-TEN-004.HO-02",
        from: "LADM",
        to: "LOPS",
        trigger:
          "Backoffice invitation is issued or operations role/access changes.",
        artifacts:
          "Organization invitation/role, queue capabilities, affected assignments/work, deactivation/change context.",
        acknowledgement:
          "Operations user accepts invitation or reviews changed access and addresses affected work.",
      },
      {
        id: "WF-TEN-004.HO-03",
        from: "SYS",
        to: "LADM",
        trigger: "WorkOS membership/role projection applies or fails.",
        artifacts:
          "Projected membership/role, route/query/write capability result, affected work/assignment warning, sync failure.",
        acknowledgement:
          "Principal Broker verifies access and reroutes work or repairs the invitation/role.",
      },
    ],
    segments: [
      segment(
        "WF-TEN-004.LADM.01",
        "Administer brokerage staff access",
        "LADM",
        "Brokerage administration",
        common({
          purpose:
            "Invite, re-role, or deactivate brokerage members with immediate, audited access effects.",
          trigger: "Staffing or authority needs change.",
          steps: [
            "Review staff/assignments/work.",
            "Invite/select member.",
            "Assign/change role or deactivate.",
            "Review audit/access projection.",
            "Reroute affected work.",
          ],
          inputs: ["Identity/role/change and affected work."],
          outputs: ["Authorized membership/role command and routing action."],
          states: ["absent → invited/active; active → changed/deactivated"],
          gates: ["Principal Broker authority; audit required."],
          exceptions: [
            "Principal transfer, active-work conflict, failed sync.",
          ],
          permissions: ["Principal Broker own brokerage."],
          upstream: ["WF-TEN-001.LADM.01"],
          downstream: ["WF-TEN-003", "WF-OPS-001"],
          handoffs: [
            "WF-TEN-004.HO-01",
            "WF-TEN-004.HO-02",
            "WF-TEN-004.HO-03",
          ],
          events: ["invitation/role/deactivation audit"],
          success: ["Access and work ownership are correct."],
          failure: ["Prior valid state or explicit pending repair."],
          sources: [`${src.production} §8.2`],
        })
      ),
      segment(
        "WF-TEN-004.BRKR.01",
        "Accept or respond to broker access change",
        "BRKR",
        "Broker membership",
        common({
          purpose:
            "Activate broker membership or respond to changed/deactivated access and work scope.",
          trigger: "Invitation/access-change notice arrives.",
          steps: [
            "Accept/authenticate if invited.",
            "Review role/navigation/assigned builders/work.",
            "Acknowledge operational ownership or surface routing issue.",
          ],
          inputs: ["Invitation/role/access/work scope."],
          outputs: ["Active membership/acknowledgement or routing issue."],
          states: ["invited → active; active → changed/deactivated"],
          gates: ["Bound identity and projected role."],
          exceptions: ["Expiry/mismatch/missing access/work routing."],
          permissions: ["Target Broker only."],
          upstream: ["WF-TEN-004.LADM.01"],
          downstream: ["WF-TEN-002", "WF-OPS-001"],
          handoffs: ["WF-TEN-004.HO-01"],
          events: ["invite accepted/access acknowledgement"],
          success: ["Broker access/work scope is understood."],
          failure: ["Access/routing exception remains explicit."],
          sources: [`${src.production} §8.2`],
        })
      ),
      segment(
        "WF-TEN-004.LOPS.01",
        "Accept or respond to backoffice access change",
        "LOPS",
        "Backoffice membership",
        common({
          purpose:
            "Activate operations membership or respond to changed/deactivated queue capabilities.",
          trigger: "Invitation/access-change notice arrives.",
          steps: [
            "Accept/authenticate if invited.",
            "Review role/navigation/queue capability/work.",
            "Acknowledge or surface routing issue.",
          ],
          inputs: ["Invitation/role/access/work scope."],
          outputs: ["Active membership/acknowledgement or routing issue."],
          states: ["invited → active; active → changed/deactivated"],
          gates: ["Bound identity and projected role."],
          exceptions: ["Expiry/mismatch/missing access/work routing."],
          permissions: ["Target backoffice user only."],
          upstream: ["WF-TEN-004.LADM.01"],
          downstream: ["WF-OPS-001"],
          handoffs: ["WF-TEN-004.HO-02"],
          events: ["invite accepted/access acknowledgement"],
          success: ["Operations access/work scope is understood."],
          failure: ["Access/routing exception remains explicit."],
          sources: [`${src.production} §8.2`],
        })
      ),
      segment(
        "WF-TEN-004.SYS.01",
        "Project role changes and enforce immediate access",
        "SYS",
        "Authorization projection",
        common({
          purpose:
            "Synchronize WorkOS-owned membership/role changes into route/query/write access and preserve historical records.",
          trigger:
            "Invitation/membership/role webhook or authorized admin command occurs.",
          steps: [
            "Initiate WorkOS change where applicable.",
            "Project webhook state.",
            "Recompute capabilities/navigation/query access.",
            "Preserve historical actor records.",
            "Flag affected active work.",
            "Emit audit/notification.",
          ],
          inputs: ["Authorized change and WorkOS events."],
          outputs: ["Access projection, audit, routing warning."],
          states: [
            "pending projection → active/changed/deactivated or sync_error",
          ],
          gates: ["Webhook-owned projection and organization scope."],
          exceptions: [
            "Duplicate/out-of-order webhook, failed role sync, active work without owner.",
          ],
          permissions: ["System under Principal Broker authorization."],
          upstream: ["WF-TEN-004.LADM.01"],
          downstream: ["WF-OPS-001"],
          handoffs: ["WF-TEN-004.HO-03"],
          events: ["identity projection/access/audit/notification"],
          success: ["Immediate correct access with preserved history."],
          failure: ["Sync error visible; no silent privilege drift."],
          sources: [`${src.production} §8.2`, `${src.auth}`],
        })
      ),
    ],
  },
];
