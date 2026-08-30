import {
  common,
  type ParentWorkflow,
  segment,
  src,
} from "./core-workflow-manifest-model";

export const workflowsPart05: ParentWorkflow[] = [
  {
    id: "WF-TEN-003",
    name: "Builder Reassignment and Cross-Brokerage Transfer",
    persona: "CROSS",
    category: "Relationship governance",
    purpose:
      "Move builder responsibility without erasing assignment, audit, document, active-work, or tenant history.",
    preconditions: [
      "Builder and current assignment exist.",
      "Requestor has authority appropriate to an intra- or cross-brokerage move.",
    ],
    trigger:
      "Principal Broker requests reassignment, or Platform Admin initiates/approves a cross-brokerage transfer.",
    steps: [
      "Select builder and destination broker/brokerage.",
      "Capture reason.",
      "Evaluate source/destination policy and active work.",
      "Close prior assignment and open the new assignment.",
      "Explicitly reroute or close work queues.",
      "Record prior/new ownership and retention outcome.",
    ],
    inputs: [
      "Builder, prior/new assignment, reason.",
      "Active proposals/builds/documents/contractors/work queues.",
      "Source/destination policy.",
    ],
    outputs: [
      "Historical closed assignment.",
      "New active assignment.",
      "Explicit work-item routing.",
      "Transfer audit event.",
    ],
    states: [
      "assignment: active → closed; destination: absent → active",
      "transfer: requested → evaluated → completed/rejected",
    ],
    gates: [
      "Principal Broker authority for intra-brokerage reassignment.",
      "Platform Admin authority for cross-brokerage transfer.",
      "No blind organizationId rewrite.",
    ],
    exceptions: [
      "Destination rejects/ineligible.",
      "Active work cannot be safely routed.",
      "Retention/visibility conflict leaves transfer pending.",
    ],
    permissions: [
      "Principal Broker: own-brokerage reassignment.",
      "Platform Admin: cross-brokerage transfer.",
      "Historical access follows retention policy.",
    ],
    upstream: ["WF-TEN-002"],
    downstream: ["WF-PRP-001", "WF-BLD-001", "WF-OPS-001"],
    handoffs: ["WF-TEN-003.HO-01", "WF-TEN-003.HO-02"],
    events: [
      "assignment.closed/created",
      "transfer audit event",
      "queue reroute/close events",
      "affected-party notifications",
    ],
    success: [
      "One current responsible assignment exists and all historical/active work remains traceable.",
    ],
    failure: [
      "Transfer remains pending/rejected; prior assignment and work routing remain intact.",
    ],
    sources: [`${src.production} §8.4, §12 Open Product Decisions`],
    status: "NEEDS_VALIDATION",
    validationNote:
      "The production PRD defines the transfer skeleton but leaves source/destination consent, document ownership, historical visibility, and active-work routing policy unresolved.",
    participants: ["LADM", "PADM", "BRKR", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-TEN-003.HO-01",
        from: "LADM",
        to: "PADM",
        trigger: "A requested move crosses brokerage boundaries.",
        artifacts:
          "Builder, source/destination, reason, active proposals/builds/documents/assignments/work queues, policy findings.",
        acknowledgement:
          "Platform Admin approves, rejects, or requests resolution of policy conflicts.",
      },
      {
        id: "WF-TEN-003.HO-02",
        from: "SYS",
        to: "BRKR",
        trigger: "The new assignment activates and work routing completes.",
        artifacts:
          "Assignment scope, transferred/retained records, rerouted work, effective timestamp.",
        acknowledgement:
          "Destination Broker accepts operational ownership and addresses assigned work.",
      },
    ],
    segments: [
      segment(
        "WF-TEN-003.LADM.01",
        "Request or execute builder reassignment",
        "LADM",
        "Assignment governance",
        common({
          purpose:
            "Reassign within the brokerage or submit a cross-brokerage transfer package.",
          trigger: "Relationship ownership must change.",
          steps: [
            "Select builder/destination.",
            "Review active work.",
            "Enter reason.",
            "Execute intra-brokerage reassignment or send cross-brokerage request.",
            "Review result.",
          ],
          inputs: ["Builder/assignment and reason."],
          outputs: ["Closed/new assignment or transfer request."],
          states: ["active → closed/new active; or transfer requested"],
          gates: ["Principal authority and active-work review."],
          exceptions: ["Policy/retention/routing conflict."],
          permissions: ["Principal Broker within own brokerage."],
          upstream: ["WF-TEN-002"],
          downstream: ["WF-TEN-003.PADM.01", "WF-TEN-003.BRKR.01"],
          handoffs: ["WF-TEN-003.HO-01"],
          events: ["reassignment/transfer audit"],
          success: ["Request is completed or formally queued."],
          failure: ["Prior assignment remains active."],
          sources: [`${src.production} §8.4`],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Cross-brokerage request/consent UI and policy are not specified.",
        })
      ),
      segment(
        "WF-TEN-003.PADM.01",
        "Govern cross-brokerage transfer",
        "PADM",
        "Cross-tenant governance",
        common({
          purpose:
            "Approve and execute a transfer as a controlled migration, not a tenant-ID rewrite.",
          trigger: "Cross-brokerage package is received.",
          steps: [
            "Evaluate both brokerage rules.",
            "Determine record/visibility retention.",
            "Approve/reject.",
            "Execute controlled transfer.",
            "Verify work routing and audit.",
          ],
          inputs: ["Transfer package and policies."],
          outputs: ["Transfer outcome and retention/routing record."],
          states: ["requested → evaluated → completed/rejected"],
          gates: ["Platform authority; explicit record-by-record handling."],
          exceptions: [
            "Unresolved consent, retention, or active-work conflict.",
          ],
          permissions: ["Platform Admin only."],
          upstream: ["WF-TEN-003.LADM.01"],
          downstream: ["WF-TEN-003.BRKR.01"],
          handoffs: ["WF-TEN-003.HO-01"],
          events: ["cross_tenant.transfer audit"],
          success: ["Controlled transfer completes."],
          failure: ["Transfer is rejected/pending with reason."],
          sources: [`${src.production} §8.4`],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Detailed transfer policy remains an open product decision.",
        })
      ),
      segment(
        "WF-TEN-003.BRKR.01",
        "Accept reassigned builder workload",
        "BRKR",
        "Relationship ownership",
        common({
          purpose:
            "Assume the new builder relationship and explicitly triage rerouted work.",
          trigger: "New assignment becomes active.",
          steps: [
            "Review assignment and effective scope.",
            "Review rerouted proposals/builds/work items.",
            "Acknowledge ownership.",
            "Resolve urgent queue items.",
          ],
          inputs: ["Assignment and routed-work summary."],
          outputs: ["Acknowledged operational ownership."],
          states: ["assigned → acknowledged"],
          gates: ["Destination Broker membership and scope."],
          exceptions: [
            "Missing access or incorrectly routed work escalates to authority.",
          ],
          permissions: ["Assigned destination Broker."],
          upstream: ["WF-TEN-003.PADM.01"],
          downstream: ["WF-OPS-001"],
          handoffs: ["WF-TEN-003.HO-02"],
          events: ["assignment notification/acknowledgement"],
          success: ["Work has a responsible owner."],
          failure: ["Routing exception remains open."],
          sources: [`${src.production} §8.4`],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Acknowledgement mechanics are inferred from the acceptance criterion requiring explicit work-queue rerouting.",
        })
      ),
      segment(
        "WF-TEN-003.SYS.01",
        "Preserve history and reroute active work",
        "SYS",
        "Transfer orchestration",
        common({
          purpose:
            "Apply the approved assignment/transfer atomically enough to preserve ownership and audit invariants.",
          trigger: "Authorized transfer/reassignment command is approved.",
          steps: [
            "Close prior assignment.",
            "Create new assignment.",
            "Apply approved record visibility/ownership rules.",
            "Reroute/close work items.",
            "Emit audit and recipient notifications.",
          ],
          inputs: ["Authorized transfer decision and routing plan."],
          outputs: ["Assignments, routing, audit/outbox events."],
          states: ["transfer approved → completed or repair_required"],
          gates: [
            "No destructive history rewrite; organization scope validation.",
          ],
          exceptions: [
            "Partial execution creates repair-required task and preserves prior trace.",
          ],
          permissions: ["System under Platform/Principal authorization."],
          upstream: ["WF-TEN-003.PADM.01"],
          downstream: ["WF-OPS-001"],
          handoffs: ["WF-TEN-003.HO-02"],
          events: [
            "transfer completed/failed",
            "work rerouted",
            "audit/outbox",
          ],
          success: ["History and active responsibility are coherent."],
          failure: ["Repair task is visible; no silent partial transfer."],
          sources: [`${src.production} §8.4`],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Atomicity and repair contract are not fully specified.",
        })
      ),
    ],
  },
  {
    id: "WF-CTR-001",
    name: "Contractor Profile, Invitation, Onboarding, Claim, and Review",
    persona: "CROSS",
    category: "Contractor identity",
    purpose:
      "Create a canonical contractor profile with or without an account, prevent unsafe auto-linking, and grant workspace access only after explicit claim/review and WorkOS role sync.",
    preconditions: [
      "Initiator is authorized in the brokerage or contractor begins self-service onboarding.",
      "Canonical email and tenant rules are available.",
    ],
    trigger:
      "Builder/backoffice creates a contractor, sends an invite, or a contractor starts self-service onboarding.",
    steps: [
      "Search/match canonical profile.",
      "Create unclaimed/profile candidate when needed.",
      "Invite explicitly or collect self-service profile.",
      "Contractor accepts and confirms claim or submits onboarding.",
      "Backoffice reviews ambiguous/self-service cases.",
      "Request WorkOS contractor role and wait for sync.",
      "Activate linked workspace access.",
    ],
    inputs: [
      "Identity, normalized verified email when present, trade/profile/compliance data.",
      "Invitation/claim metadata.",
      "Duplicate candidates and brokerage relationship.",
    ],
    outputs: [
      "Canonical contractor profile/alias.",
      "Claim intent and account link.",
      "Review outcome.",
      "Active contractor role/profile link or rejected/merged state.",
    ],
    states: [
      "onboarding: draft → pending_backoffice_review → changes_requested/approved_pending_workos/rejected/merged → active",
      "claim: not_invited → invited → accepted_pending_confirmation → claimed (or revoked/expired)",
    ],
    gates: [
      "Email match alone never auto-links an account.",
      "Multiple matches route to review.",
      "Full workspace requires contractor role plus active profile link.",
    ],
    exceptions: [
      "No email creates record-only profile.",
      "Ambiguous duplicates route to merge/review.",
      "Invitation expires/revokes.",
      "WorkOS promotion/sync remains pending.",
    ],
    permissions: [
      "Builder/backoffice may create/invite under scoped permissions.",
      "Backoffice/Lender Admin reviews self-service/ambiguous cases.",
      "Contractor can confirm only the bound claim.",
    ],
    upstream: ["WF-TEN-001"],
    downstream: ["WF-CTR-002", "WF-PRP-001", "WF-BLD-001"],
    handoffs: [
      "WF-CTR-001.HO-01",
      "WF-CTR-001.HO-02",
      "WF-CTR-001.HO-03",
      "WF-CTR-001.HO-04",
    ],
    events: [
      "Invitation/claim/review/merge/link audit events.",
      "WorkOS invitation and role-sync events.",
      "Onboarding review notifications.",
    ],
    success: [
      "One canonical, organization-related contractor profile is safely linked and access is correctly scoped.",
    ],
    failure: [
      "Profile remains unclaimed/pending/rejected without unauthorized workspace access.",
    ],
    sources: [
      `${src.production} §8.5`,
      `${src.contractor} §6–§7, §9, §14.1–14.2`,
    ],
    status: "SUPPORTED",
    participants: ["BLDR", "LOPS", "CNTR", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-CTR-001.HO-01",
        from: "BLDR",
        to: "CNTR",
        trigger: "An explicit contractor invite is sent.",
        artifacts:
          "Profile identity, normalized invited email, brokerage organization, claim intent, WorkOS invitation, expiry.",
        acknowledgement:
          "Contractor accepts and confirms the specific profile claim.",
      },
      {
        id: "WF-CTR-001.HO-02",
        from: "CNTR",
        to: "LOPS",
        trigger:
          "Self-service onboarding is submitted or a match/claim needs review.",
        artifacts:
          "Profile fields, email match result, compliance data/docs, duplicate candidates, claim metadata.",
        acknowledgement:
          "Backoffice approves, rejects, requests changes, merges, or sets compliance outcome with reason.",
      },
      {
        id: "WF-CTR-001.HO-03",
        from: "LOPS",
        to: "CNTR",
        trigger: "Backoffice records a review outcome.",
        artifacts:
          "Decision, reason/change request, canonical profile/merge target, compliance status, next step.",
        acknowledgement:
          "Contractor revises/resubmits or awaits/refreshes role synchronization.",
      },
      {
        id: "WF-CTR-001.HO-04",
        from: "SYS",
        to: "CNTR",
        trigger:
          "WorkOS contractor role and profile link both become active, or activation fails.",
        artifacts: "Workspace access state and actionable sync/link failure.",
        acknowledgement:
          "Contractor enters workspace or follows repair guidance.",
      },
    ],
    segments: [
      segment(
        "WF-CTR-001.BLDR.01",
        "Create/reuse contractor profile and invite",
        "BLDR",
        "Contractor onboarding",
        common({
          purpose:
            "Establish a record-only contractor or explicitly invite a contractor for assigned project scope.",
          trigger: "A proposal/build needs a contractor relationship.",
          steps: [
            "Search contractor bank.",
            "Reuse canonical profile or create unclaimed record.",
            "Attach initial scope if applicable.",
            "Optionally send explicit invite.",
            "Monitor claim.",
          ],
          inputs: ["Name/trade/email and assignment context."],
          outputs: ["Profile/alias, relationship, optional invitation."],
          states: ["absent → unclaimed; not_invited → invited"],
          gates: ["No automatic account link from email; invite permission."],
          exceptions: ["Duplicate ambiguity routes to backoffice."],
          permissions: [
            "Builder Lead or builder staff with contractor-management permission; own proposal/build only.",
          ],
          downstream: ["WF-CTR-001.CNTR.01", "WF-CTR-002"],
          handoffs: ["WF-CTR-001.HO-01"],
          events: ["contractor.created/invited audit"],
          success: ["Contractor is recordable/claimable without duplication."],
          failure: [
            "Creation/invite is blocked with duplicate or permission reason.",
          ],
          sources: [
            `${src.production} §8.5`,
            `${src.contractor} §7.3–7.4, §11.3`,
          ],
        })
      ),
      segment(
        "WF-CTR-001.CNTR.01",
        "Complete onboarding or confirm invited claim",
        "CNTR",
        "Contractor onboarding",
        common({
          purpose:
            "Submit an identity/profile for review or explicitly confirm ownership of an invited profile.",
          trigger: "Self-service start or WorkOS invitation acceptance.",
          steps: [
            "Authenticate.",
            "Complete/save profile or accept invite.",
            "Review exact profile match.",
            "Confirm claim or submit onboarding.",
            "Respond to changes.",
            "Wait for role/link activation.",
          ],
          inputs: [
            "Profile/compliance data, verified identity/email, invitation/claim.",
          ],
          outputs: ["Submitted onboarding or confirmed claim."],
          states: [
            "draft → pending_backoffice_review; invited → accepted_pending_confirmation → claimed",
          ],
          gates: [
            "Exact/bound claim confirmation; single-use invite; role plus profile link for access.",
          ],
          exceptions: [
            "Multiple match, expiry/revocation, changes requested, rejection, sync pending.",
          ],
          permissions: [
            "Authenticated contractor/onboarding user; target profile only.",
          ],
          upstream: ["WF-CTR-001.BLDR.01"],
          downstream: ["WF-CTR-001.LOPS.01", "WF-CTR-002.CNTR.01"],
          handoffs: [
            "WF-CTR-001.HO-01",
            "WF-CTR-001.HO-02",
            "WF-CTR-001.HO-03",
            "WF-CTR-001.HO-04",
          ],
          events: [
            "onboarding.submitted",
            "claim.confirmed",
            "profile changes",
          ],
          success: ["Active, correctly linked contractor access."],
          failure: [
            "No workspace access; state remains actionable or final rejected.",
          ],
          sources: [`${src.contractor} §7.1, §7.3, §14.1–14.2`],
        })
      ),
      segment(
        "WF-CTR-001.LOPS.01",
        "Review contractor onboarding, claim, or duplicate",
        "LOPS",
        "Contractor operations",
        common({
          purpose:
            "Resolve self-service, ambiguous-match, compliance, and duplicate cases without unsafe linking.",
          trigger: "Onboarding/claim review task enters contractor operations.",
          steps: [
            "Review identity/match/compliance/assignments/audit.",
            "Approve, reject, request changes, merge, or set compliance result.",
            "Record reason.",
            "Initiate WorkOS promotion when approved.",
            "Monitor activation.",
          ],
          inputs: ["Review package and canonical candidates."],
          outputs: ["Audited review/merge/compliance outcome."],
          states: [
            "pending_review → changes_requested/approved_pending_workos/rejected/merged",
          ],
          gates: ["No guess on ambiguous match; reason for material outcome."],
          exceptions: [
            "Insufficient data requests changes; merge migrates assignments and aliases.",
          ],
          permissions: [
            "Backoffice/Lender Admin within brokerage; high-authority actions remain audited.",
          ],
          upstream: ["WF-CTR-001.CNTR.01"],
          downstream: ["WF-CTR-002"],
          handoffs: ["WF-CTR-001.HO-02", "WF-CTR-001.HO-03"],
          events: [
            "contractor.reviewed/merged",
            "role promotion requested",
            "notification",
          ],
          success: ["Safe canonical resolution and activation path."],
          failure: ["Rejected or pending with explicit reason."],
          sources: [`${src.contractor} §7.2, §9, §14.1`],
        })
      ),
      segment(
        "WF-CTR-001.SYS.01",
        "Resolve canonical profile and synchronize contractor access",
        "SYS",
        "Identity synchronization",
        common({
          purpose:
            "Enforce canonical matching, claim intent, organization relationship, and dual role/profile access gate.",
          trigger:
            "Profile creation, invite acceptance, review approval, or WorkOS webhook.",
          steps: [
            "Normalize/match email.",
            "Create/reuse candidate without unsafe linking.",
            "Persist claim/review state.",
            "Project WorkOS role.",
            "Activate only when role and link are valid.",
            "Notify outcome.",
          ],
          inputs: ["Profile/claim/review and WorkOS events."],
          outputs: [
            "Canonical link, relationship, access state, audit/outbox.",
          ],
          states: ["pending → active/rejected/merged/sync_pending"],
          gates: [
            "Verified normalized email rules; explicit confirmation; webhook-owned projections.",
          ],
          exceptions: [
            "Ambiguous duplicate, stale/duplicate webhook, failed invitation/promotion.",
          ],
          permissions: ["System under organization scope."],
          upstream: ["WF-CTR-001.LOPS.01"],
          downstream: ["WF-CTR-002"],
          handoffs: ["WF-CTR-001.HO-04"],
          events: ["claim/role/link audit and notifications"],
          success: ["Access and canonical identity agree."],
          failure: ["Access remains locked with repairable state."],
          sources: [`${src.contractor} §6–§7, §11`, `${src.auth}`],
        })
      ),
    ],
  },
];
