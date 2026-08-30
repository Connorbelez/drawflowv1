import {
  common,
  type ParentWorkflow,
  segment,
  src,
} from "./core-workflow-manifest-model";

export const workflowsPart04: ParentWorkflow[] = [
  {
    id: "WF-CTR-002",
    name: "Contractor Assignment, Schedule Acknowledgement, Scope Clarification, and Supporting Evidence",
    persona: "CROSS",
    category: "Contractor execution",
    purpose:
      "Coordinate assigned contractor work while keeping contractor uploads advisory until builder completion submission and lender approval.",
    preconditions: [
      "Contractor profile exists (`WF-CTR-001`).",
      "Proposal/build/milestone is organization-scoped and the initiator can manage contractor scope.",
    ],
    trigger:
      "Builder/backoffice assigns contractor scope or materially changes the assigned schedule.",
    steps: [
      "Assign proposal/build/milestone/submilestone scope.",
      "Notify contractor and request acknowledgement when required.",
      "Contractor acknowledges, requests clarification, or disputes scope.",
      "Builder/backoffice resolves clarification/dispute.",
      "Contractor uploads supporting evidence/notes within assigned scope.",
      "Builder/backoffice reviews feedback and requests context/replacement when needed.",
      "Builder later chooses evidence for formal completion package.",
    ],
    inputs: [
      "Assignment and schedule scope.",
      "Contractor acknowledgement/clarification.",
      "Supporting photos/files/notes and feedback.",
    ],
    outputs: [
      "Historical assignment.",
      "Acknowledgement state.",
      "Resolved scope thread.",
      "Supporting evidence with feedback state.",
    ],
    states: [
      "assignment acknowledgement: pending_acknowledgement → acknowledged/clarification_requested/scope_disputed → resolved → acknowledged",
      "evidence: submitted → useful/not_relevant/more_context_requested/replacement_requested → addressed → useful/not_relevant",
    ],
    gates: [
      "Contractor can access only assigned scope.",
      "Contractor evidence never independently unlocks completion/draw eligibility.",
      "Formal evidence inclusion remains builder-controlled.",
    ],
    exceptions: [
      "Scope dispute remains unresolved.",
      "Assignment removed/reassigned with history.",
      "Evidence needs context/replacement or falls outside scope.",
    ],
    permissions: [
      "Builder/backoffice manages assignments.",
      "Contractor reads/writes only assigned scope.",
      "Lender review remains recommendation-only until admin decision.",
    ],
    upstream: ["WF-CTR-001", "WF-PRP-001"],
    downstream: ["WF-BLD-001", "WF-MIL-001"],
    handoffs: [
      "WF-CTR-002.HO-01",
      "WF-CTR-002.HO-02",
      "WF-CTR-002.HO-03",
      "WF-CTR-002.HO-04",
    ],
    events: [
      "Assignment create/update/remove audit.",
      "Schedule acknowledgement and clarification notifications.",
      "Evidence upload/view/comment/flag audit and notifications.",
    ],
    success: [
      "Assigned scope is acknowledged/resolved and useful evidence is available to the builder without bypassing formal review.",
    ],
    failure: [
      "Scope remains disputed or evidence remains unaddressed; no completion eligibility is granted.",
    ],
    sources: [`${src.contractor} §8.3–§8.7, §10, §14.3–14.4, §15`],
    status: "SUPPORTED",
    participants: ["BLDR", "CNTR", "LOPS", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-CTR-002.HO-01",
        from: "BLDR",
        to: "CNTR",
        trigger:
          "Assignment is created/changed or a material schedule change requires acknowledgement.",
        artifacts:
          "Proposal/build/milestone scope, dates, dependencies, documents, acknowledgement request.",
        acknowledgement:
          "Contractor acknowledges, requests clarification, or disputes the scope.",
      },
      {
        id: "WF-CTR-002.HO-02",
        from: "CNTR",
        to: "BLDR",
        trigger:
          "Contractor records acknowledgement, clarification request, or dispute.",
        artifacts:
          "Acknowledgement state, comments, disputed scope/date/dependency context.",
        acknowledgement:
          "Builder clarifies/amends scope and records resolution; contractor then acknowledges.",
      },
      {
        id: "WF-CTR-002.HO-03",
        from: "CNTR",
        to: "LOPS",
        trigger: "Supporting evidence is uploaded or enters review context.",
        artifacts:
          "Assigned scope, evidence asset, capture metadata, notes, author/timestamp.",
        acknowledgement:
          "Reviewer marks usefulness or requests context/replacement; builder retains formal inclusion authority.",
      },
      {
        id: "WF-CTR-002.HO-04",
        from: "LOPS",
        to: "CNTR",
        trigger: "Evidence feedback requires contractor action.",
        artifacts:
          "Feedback state, comments, requested context/replacement, linked evidence/scope.",
        acknowledgement:
          "Contractor addresses the request with context or replacement evidence.",
      },
    ],
    segments: [
      segment(
        "WF-CTR-002.BLDR.01",
        "Assign contractor and resolve scope",
        "BLDR",
        "Contractor coordination",
        common({
          purpose:
            "Define contractor scope, manage schedule acknowledgement, and decide which supporting evidence enters builder-controlled completion.",
          trigger: "Contractor is needed or assigned scope/schedule changes.",
          steps: [
            "Create/update/remove assignment.",
            "Request acknowledgement.",
            "Review response/dispute.",
            "Clarify/amend and resolve.",
            "Review contractor evidence.",
            "Select evidence later for completion package.",
          ],
          inputs: [
            "Contractor profile, project scope, dates, supporting evidence.",
          ],
          outputs: ["Assignment, resolution, evidence selection decision."],
          states: ["assignment pending → acknowledged/resolved/removed"],
          gates: [
            "Own proposal/build; contractor-management permission; history preserved.",
          ],
          exceptions: [
            "Dispute, unresponsive contractor, reassignment, irrelevant evidence.",
          ],
          permissions: ["Builder Lead or permissioned Builder Staff."],
          upstream: ["WF-CTR-001", "WF-PRP-001"],
          downstream: ["WF-BLD-001", "WF-MIL-001.BLDR.01"],
          handoffs: ["WF-CTR-002.HO-01", "WF-CTR-002.HO-02"],
          events: ["assignment/schedule/evidence audit and notifications"],
          success: ["Scope is acknowledged and history retained."],
          failure: [
            "Unresolved dispute blocks reliable coordination but not silently.",
          ],
          sources: [`${src.contractor} §8.4–§8.7, §14.3–14.4`],
        })
      ),
      segment(
        "WF-CTR-002.CNTR.01",
        "Acknowledge scope and contribute supporting evidence",
        "CNTR",
        "Assigned work",
        common({
          purpose:
            "Understand assigned work, surface scope problems, and contribute field evidence without asserting completion authority.",
          trigger:
            "Assignment/acknowledgement request or evidence-feedback request is received.",
          steps: [
            "Review assigned scope/schedule/dependencies/docs.",
            "Acknowledge, clarify, or dispute.",
            "Review resolution and acknowledge.",
            "Upload assigned-scope photos/files/notes.",
            "Address context/replacement feedback.",
          ],
          inputs: ["Assigned scope and feedback."],
          outputs: [
            "Acknowledgement/resolution response and supporting evidence.",
          ],
          states: [
            "pending_acknowledgement → acknowledged/clarification_requested/scope_disputed → resolved",
            "evidence submitted → addressed/useful/not_relevant",
          ],
          gates: ["Active contractor role/profile link and assigned scope."],
          exceptions: [
            "Removed assignment, out-of-scope upload, offline/upload failure.",
          ],
          permissions: [
            "Assigned contractor only; no milestone completion, lender approval, or draw authority.",
          ],
          upstream: ["WF-CTR-002.BLDR.01"],
          downstream: ["WF-MIL-001"],
          handoffs: [
            "WF-CTR-002.HO-01",
            "WF-CTR-002.HO-02",
            "WF-CTR-002.HO-03",
            "WF-CTR-002.HO-04",
          ],
          events: [
            "acknowledgement, clarification, evidence upload/addressed events",
          ],
          success: ["Scope understood and evidence available."],
          failure: ["Dispute/feedback remains open."],
          sources: [`${src.contractor} §8, §14.3–14.4`],
        })
      ),
      segment(
        "WF-CTR-002.LOPS.01",
        "Review contractor evidence in operational context",
        "LOPS",
        "Contractor evidence review",
        common({
          purpose:
            "Assess contractor-contributed evidence as context while preserving builder submission and lender decision boundaries.",
          trigger: "Contractor evidence is submitted or linked to review work.",
          steps: [
            "Verify assignment/scope.",
            "View/comment/flag evidence.",
            "Mark useful/not relevant or request context/replacement.",
            "Review response.",
            "Keep formal milestone gate unchanged until builder submission.",
          ],
          inputs: ["Contractor evidence and assignment context."],
          outputs: ["Evidence feedback state and audit."],
          states: ["submitted → feedback → addressed/final usefulness"],
          gates: [
            "Evidence does not unlock milestone/draw eligibility by itself.",
          ],
          exceptions: [
            "Out-of-scope, deficient, missing context, suspected integrity issue.",
          ],
          permissions: [
            "Authorized backoffice/lender staff; no final approval.",
          ],
          upstream: ["WF-CTR-002.CNTR.01"],
          downstream: ["WF-MIL-001.LOPS.01"],
          handoffs: ["WF-CTR-002.HO-03", "WF-CTR-002.HO-04"],
          events: [
            "evidence viewed/commented/flagged; contractor notification",
          ],
          success: ["Evidence disposition is explicit."],
          failure: [
            "Feedback remains unresolved; evidence is excluded from formal sufficiency.",
          ],
          sources: [`${src.contractor} §8.7, §9, §14.4`],
        })
      ),
      segment(
        "WF-CTR-002.SYS.01",
        "Enforce assigned-scope visibility and feedback state",
        "SYS",
        "Authorization and notifications",
        common({
          purpose:
            "Project assignments, visibility, acknowledgement, feedback, and notifications without promoting supporting evidence to approval evidence.",
          trigger:
            "Assignment, schedule, evidence, or feedback mutation occurs.",
          steps: [
            "Authorize against active assignment.",
            "Persist state/history.",
            "Resolve visibility.",
            "Notify affected parties.",
            "Keep completion/draw eligibility unchanged.",
          ],
          inputs: ["Assignment/evidence mutation and organization context."],
          outputs: ["State projection, audit, notifications."],
          states: ["Per assignment/evidence state machines."],
          gates: [
            "Tenant and assigned-scope authorization; explicit non-eligibility rule.",
          ],
          exceptions: ["Stale assignment or illegal transition is rejected."],
          permissions: ["System under authorized actor context."],
          upstream: ["WF-CTR-001"],
          downstream: ["WF-MIL-001"],
          handoffs: [],
          events: ["assignment/evidence/notification events"],
          success: ["Least-privilege collaboration is enforced."],
          failure: ["Mutation is rejected without partial promotion."],
          sources: [`${src.contractor} §11–§14`],
        })
      ),
    ],
  },
  {
    id: "WF-PRP-001",
    name: "Build Proposal Planning, Review, Approval, Closing, and Build Activation",
    persona: "CROSS",
    category: "Proposal and origination",
    purpose:
      "Turn builder inputs into a validated reimbursement roadmap and draw-plan snapshot, obtain lender decision, then close the approved proposal into an active Build.",
    preconditions: [
      "Builder is onboarded and assigned (`WF-TEN-002`).",
      "Organization, lender policy, templates, and required-document rules are available.",
    ],
    trigger:
      "Builder creates a new Build Proposal or reopens a draft after changes are requested.",
    steps: [
      "Capture build/site/permits/budget/working capital/template.",
      "Edit milestones, dependencies, costs, contractors, and material/equipment plan.",
      "Validate graph, warnings, policy, and feasibility.",
      "Generate/compare Cheapest Feasible, Fastest, and Capital-Constrained plans.",
      "Select preferred plan and submit immutable review snapshot.",
      "Lender operations supports review and Principal Broker/admin approves, rejects, or requests changes.",
      "Builder revises/resubmits when requested.",
      "After approval, authorized closer records reason/start date and creates active Build plus loan/capital/roadmap records.",
    ],
    inputs: [
      "Build identity/site/permits/documents.",
      "Budget, Borrower Working Capital Limit, requested Loan Percentage.",
      "Milestones/costs/durations/dependencies/contractors/materials.",
      "Lender policy and optimizer assumptions.",
    ],
    outputs: [
      "Versioned proposal package and selected Draw Plan.",
      "Review decision/events.",
      "On closing: active Build, loan facility, capital plan, milestones/submilestones, planned draw rows, assignments, audit/outbox.",
    ],
    states: [
      "proposal: draft → submitted → approved → closed",
      "request changes: submitted → draft",
      "rejection: submitted with reviewOutcome=rejected; no fifth lifecycle state and no Build",
      "approval does not itself create active Build; closing does",
    ],
    gates: [
      "Required fields/documents and dependency graph.",
      "Feasible working-capital/policy constraints or explicit audited override.",
      "Permit waiver only by admin/Principal Broker.",
      "Closing requires approved proposal, reason, and build start date.",
    ],
    exceptions: [
      "Validation/warning/infeasibility blocks or requires override.",
      "Changes requested returns to editable draft.",
      "Rejected outcome creates no Build.",
      "Approved proposal remains awaiting closing.",
      "Closing failure creates no partial active Build.",
    ],
    permissions: [
      "Builder edits own draft and submits; cannot edit submitted snapshot.",
      "Backoffice with write authority may edit submitted/approved draw rows with reason and audit.",
      "Principal Broker/admin approves and closes.",
    ],
    upstream: ["WF-TEN-002", "WF-CTR-001", "WF-MAT-001"],
    downstream: ["WF-BLD-001", "WF-CTR-002", "WF-CAL-001", "WF-COM-001"],
    handoffs: [
      "WF-PRP-001.HO-01",
      "WF-PRP-001.HO-02",
      "WF-PRP-001.HO-03",
      "WF-PRP-001.HO-04",
      "WF-PRP-001.HO-05",
    ],
    events: [
      "proposal draft/submitted/changes_requested/approved/rejected/closed events.",
      "Audit events and eventOutbox rows.",
      "Builder/backoffice notifications.",
      "Closing capital event; interest explicitly not started until funds_released.",
    ],
    success: [
      "Closed proposal is materialized as an active, organization-scoped Build with preserved proposal snapshot/history.",
    ],
    failure: [
      "Proposal remains draft/submitted/approved-awaiting-close/rejected; no unintended Build exists.",
    ],
    sources: [
      `${src.core} §9, §11.1–11.2`,
      `${src.production} §8.6–8.7`,
      `${src.proposal} §7–§10`,
      `${src.proposalImpl} Lifecycle Rules`,
    ],
    status: "SUPPORTED",
    participants: ["BLDR", "LOPS", "LADM", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-PRP-001.HO-01",
        from: "SYS",
        to: "BLDR",
        trigger: "Validation/optimization completes or finds infeasibility.",
        artifacts:
          "Three plan options, recommendation, draw groups, cost/schedule/capital metrics, warnings and invalid dependencies.",
        acknowledgement:
          "Builder corrects inputs or selects a plan and proceeds to submission.",
      },
      {
        id: "WF-PRP-001.HO-02",
        from: "BLDR",
        to: "LOPS",
        trigger: "Builder submits the proposal.",
        artifacts:
          "Frozen proposal snapshot: identity/site, permits/docs, budget, roadmap, dependencies, contractors/materials, working capital, plan options/selection, warnings.",
        acknowledgement:
          "Lender queue claims/reviews the submission or routes it to final authority.",
      },
      {
        id: "WF-PRP-001.HO-03",
        from: "LOPS",
        to: "LADM",
        trigger:
          "Review support is complete and a final decision/override is required.",
        artifacts:
          "Proposal package, review notes/recommendation, warnings, permit/waiver need, edited draw rows with prior/new state.",
        acknowledgement:
          "Lender Admin approves, rejects, or requests changes and records required reason.",
      },
      {
        id: "WF-PRP-001.HO-04",
        from: "LADM",
        to: "BLDR",
        trigger: "Final review outcome is recorded.",
        artifacts:
          "Approval/rejection/changes-requested outcome, reasons, requested fields/documents, warning overrides.",
        acknowledgement:
          "Builder views outcome; for changes, edits draft and resubmits.",
      },
      {
        id: "WF-PRP-001.HO-05",
        from: "SYS",
        to: "BLDR",
        trigger: "Authorized closing transaction creates the active Build.",
        artifacts:
          "Build ID, start date, approved Budget/roadmap/Draw Plan, loan/capital context, assignments, workspace link.",
        acknowledgement:
          "Builder enters live Build Workspace and begins execution.",
      },
    ],
    segments: [
      segment(
        "WF-PRP-001.BLDR.01",
        "Plan and submit Build Proposal",
        "BLDR",
        "Proposal intake and planning",
        common({
          purpose:
            "Create a feasible reimbursement proposal and select the preferred Draw Plan.",
          trigger: "New proposal or changes-requested draft is opened.",
          steps: [
            "Enter build/site/documents/budget/working capital.",
            "Select/edit roadmap and dependencies.",
            "Add contractors/material items.",
            "Review validation and three plan options.",
            "Select preferred plan.",
            "Submit frozen snapshot.",
            "Revise/resubmit if requested.",
          ],
          inputs: ["Proposal package inputs and corrections."],
          outputs: ["Submitted review snapshot and selected plan."],
          states: ["draft → submitted; submitted → draft on changes request"],
          gates: [
            "Required fields/evidence; valid dependency graph; feasible or acknowledged warnings.",
          ],
          exceptions: [
            "Missing/abnormal/infeasible inputs; requested changes; rejection.",
          ],
          permissions: [
            "Builder Lead or permissioned Builder Staff on own proposal; draft edits only.",
          ],
          upstream: ["WF-TEN-002", "WF-MAT-001"],
          downstream: ["WF-PRP-001.LOPS.01", "WF-BLD-001"],
          handoffs: [
            "WF-PRP-001.HO-01",
            "WF-PRP-001.HO-02",
            "WF-PRP-001.HO-04",
            "WF-PRP-001.HO-05",
          ],
          events: [
            "proposal.saved/submitted/resubmitted",
            "audit/outbox",
            "notification resolution",
          ],
          success: ["Submitted or closed/active proposal."],
          failure: [
            "Draft remains actionable or rejection is final with no Build.",
          ],
          sources: [`${src.core} §11.1`, `${src.production} §8.6`],
        })
      ),
      segment(
        "WF-PRP-001.LOPS.01",
        "Support proposal review and prepare final decision",
        "LOPS",
        "Proposal review operations",
        common({
          purpose:
            "Review completeness/feasibility, request missing work, and prepare a decision package without assuming final authority.",
          trigger: "Proposal enters submitted queue.",
          steps: [
            "Claim/review builder/site/docs/budget/roadmap/plans/warnings.",
            "Request information or annotate.",
            "If authorized, edit draw rows with reason and prior/new state.",
            "Prepare recommendation/package.",
            "Send to final authority.",
          ],
          inputs: ["Submitted snapshot and policy/warning context."],
          outputs: [
            "Review notes, corrections, recommendation, final-decision package.",
          ],
          states: [
            "submitted → in review → ready for decision or draft via changes request",
          ],
          gates: [
            "Reason/audit for submitted/approved edits; staff recommendation is not final approval.",
          ],
          exceptions: [
            "Missing permit, infeasibility, unresolved documents or policy warnings.",
          ],
          permissions: [
            "Organization-scoped backoffice/Broker according to assignment and write capability.",
          ],
          upstream: ["WF-PRP-001.BLDR.01"],
          downstream: ["WF-PRP-001.LADM.01"],
          handoffs: ["WF-PRP-001.HO-02", "WF-PRP-001.HO-03"],
          events: [
            "review claimed/updated, change request, draw-row edit audit",
          ],
          success: ["Complete decision package reaches authority."],
          failure: ["Submission remains in missing-info/review state."],
          sources: [
            `${src.production} §8.7–8.9`,
            `${src.proposalImpl} Lifecycle Rules`,
          ],
        })
      ),
      segment(
        "WF-PRP-001.LADM.01",
        "Decide and close Build Proposal",
        "LADM",
        "Proposal approval and closing",
        common({
          purpose:
            "Make the final proposal decision, control overrides, and separately record closing to activate the Build.",
          trigger:
            "Decision package is ready or an approved proposal reaches closing.",
          steps: [
            "Review full package/recommendation/warnings.",
            "Approve, reject, or request changes.",
            "Record audited override/permit waiver where allowed.",
            "For approved proposal, later record closing reason/start date.",
            "Verify active Build creation.",
          ],
          inputs: [
            "Decision package, override/waiver reason, closing date/reason.",
          ],
          outputs: [
            "Review outcome; approved proposal; closed proposal and active Build.",
          ],
          states: [
            "submitted → approved or reviewOutcome rejected or draft",
            "approved → closed",
          ],
          gates: [
            "Principal/admin authority; permit waiver authorization; approved-only closing.",
          ],
          exceptions: [
            "Policy gate unmet; future start date is allowed; failed closing must not partially create Build.",
          ],
          permissions: ["Principal Broker/admin final authority."],
          upstream: ["WF-PRP-001.LOPS.01"],
          downstream: ["WF-BLD-001", "WF-OPS-001"],
          handoffs: ["WF-PRP-001.HO-03", "WF-PRP-001.HO-04"],
          events: [
            "proposal.approved/rejected/changes_requested/closed",
            "override/waiver audit",
            "outbox",
          ],
          success: [
            "Decision is final/audited and closing activates complete Build records.",
          ],
          failure: ["Proposal remains in prior valid state with reason."],
          sources: [
            `${src.core} §11.2`,
            `${src.proposal} §8–§10`,
            `${src.proposalImpl} Lifecycle Rules`,
          ],
        })
      ),
      segment(
        "WF-PRP-001.SYS.01",
        "Validate, optimize, freeze, and activate proposal",
        "SYS",
        "Proposal orchestration",
        common({
          purpose:
            "Provide deterministic validation/optimization and atomic lifecycle materialization.",
          trigger:
            "Proposal inputs change, submit/decision occurs, or closing is recorded.",
          steps: [
            "Validate fields/graph/policy/working capital.",
            "Generate three plans and recommendation.",
            "Freeze submitted snapshot.",
            "Write lifecycle/audit/outbox/notifications.",
            "On closing, create all active Build/loan/capital/roadmap records.",
          ],
          inputs: ["Proposal inputs, policies, lifecycle command."],
          outputs: ["Plans/warnings, snapshots, events, active Build records."],
          states: ["draft/submitted/approved/closed plus rejection outcome"],
          gates: [
            "Idempotency/validation; no active Build on approval alone; interest begins only on funds_released.",
          ],
          exceptions: [
            "Invalid dependency/constraint, duplicate submission/closing, partial transaction rollback.",
          ],
          permissions: [
            "System under authenticated organization and authorized command.",
          ],
          upstream: ["WF-PRP-001.BLDR.01", "WF-PRP-001.LADM.01"],
          downstream: ["WF-BLD-001", "WF-COM-001"],
          handoffs: ["WF-PRP-001.HO-01", "WF-PRP-001.HO-05"],
          events: [
            "proposal lifecycle, audit, capital, outbox, notification events",
          ],
          success: ["Consistent proposal or complete active Build projection."],
          failure: ["Command rejects without invalid partial state."],
          sources: [`${src.core} §9`, `${src.proposalImpl} Lifecycle Rules`],
        })
      ),
    ],
  },
  {
    id: "WF-MAT-001",
    name: "Proposal Material and Equipment Cost Planning",
    persona: "CROSS",
    category: "Budget planning",
    purpose:
      "Plan milestone-linked material/equipment cost items, keep proposal totals/draw availability synchronized, and carry the approved plan into the active Build at closing.",
    preconditions: [
      "Draft proposal and milestones exist, or an authorized backoffice editor is modifying a submitted/approved proposal.",
    ],
    trigger:
      "Builder/backoffice adds, updates, or removes a material/equipment item.",
    steps: [
      "Select proposal milestone/submilestones.",
      "Enter item, supplier, unit cost, quantity, and type.",
      "Recalculate item/milestone/proposal totals and draw availability.",
      "Review rollup.",
      "Audit change according to proposal state.",
      "At closing copy items to active Build.",
    ],
    inputs: [
      "Item metadata, unit cost in cents, quantity, supplier, milestone/submilestone keys.",
    ],
    outputs: [
      "proposalCostItems/buildCostItems, adjusted milestone/total budget, draw availability, proposal/audit events.",
    ],
    states: [
      "cost item: absent → active → updated/deleted",
      "proposal items → copied build items on closing",
    ],
    gates: [
      "Draft edit needs no reason.",
      "Submitted/approved edit requires backoffice role and reason.",
      "Totals use costCents × quantity.",
    ],
    exceptions: [
      "Invalid amount/quantity/scope rejected.",
      "Closing copy failure must not silently omit cost items.",
    ],
    permissions: [
      "Builder edits own draft.",
      "Backoffice edits submitted/approved proposal with reason.",
      "Active Build copy is created by closing.",
    ],
    upstream: ["WF-PRP-001"],
    downstream: ["WF-PRP-001", "WF-BLD-001", "WF-BUD-001"],
    handoffs: ["WF-MAT-001.HO-01", "WF-MAT-001.HO-02"],
    events: [
      "Proposal events and audit events for changes.",
      "Closing copies cost items.",
    ],
    success: [
      "Proposal/build material rollups match milestone budgets and remain auditable.",
    ],
    failure: [
      "Invalid edit/copy is rejected and prior totals/items remain intact.",
    ],
    sources: [
      `${src.materials} §Data Model, §Workflow`,
      `${src.proposalImpl} Lifecycle Rules`,
    ],
    status: "SUPPORTED",
    participants: ["BLDR", "LOPS", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-MAT-001.HO-01",
        from: "BLDR",
        to: "LOPS",
        trigger:
          "A proposal containing material/equipment items is submitted, or a post-submission change is needed.",
        artifacts:
          "Item rollup, supplier/cost/quantity/type, milestone/submilestone links, budget/draw-availability impact.",
        acknowledgement:
          "Backoffice reviews within proposal context and records any post-submission edit with reason.",
      },
      {
        id: "WF-MAT-001.HO-02",
        from: "SYS",
        to: "BLDR",
        trigger:
          "Proposal closing copies approved cost items to the active Build.",
        artifacts:
          "buildCostItems and active-build material rollup linked to source proposal/milestones.",
        acknowledgement:
          "Builder verifies the live Build Materials tab/rollup.",
      },
    ],
    segments: [
      segment(
        "WF-MAT-001.BLDR.01",
        "Plan proposal materials and equipment",
        "BLDR",
        "Proposal cost planning",
        common({
          purpose:
            "Define itemized material/equipment inputs in the proposal Budget.",
          trigger: "Builder opens Materials for a draft proposal.",
          steps: [
            "Choose milestone scope.",
            "Create/edit/delete items.",
            "Review supplier, unit cost, quantity, total, and rollup.",
            "Submit through parent proposal.",
          ],
          inputs: ["Item/cost/supplier/scope."],
          outputs: ["Draft cost-item plan and recalculated budget."],
          states: ["draft items created/updated/deleted"],
          gates: ["Own draft and valid cents/quantity/scope."],
          exceptions: ["Invalid input or submitted-state lock."],
          permissions: ["Builder Lead/permissioned Builder Staff on draft."],
          upstream: ["WF-PRP-001.BLDR.01"],
          downstream: ["WF-PRP-001.LOPS.01", "WF-BLD-001.BLDR.01"],
          handoffs: ["WF-MAT-001.HO-01", "WF-MAT-001.HO-02"],
          events: ["proposal event/audit as applicable"],
          success: ["Accurate itemized plan enters review and active Build."],
          failure: ["Prior plan remains unchanged."],
          sources: [`${src.materials}`],
        })
      ),
      segment(
        "WF-MAT-001.LOPS.01",
        "Review or amend submitted material plan",
        "LOPS",
        "Proposal cost review",
        common({
          purpose:
            "Review itemized cost assumptions and, when authorized, make reasoned post-submission corrections.",
          trigger:
            "Submitted/approved proposal includes material items or requires correction.",
          steps: [
            "Review rollup and milestone impact.",
            "Validate supplier/cost/quantity links.",
            "Edit only with backoffice authority and reason.",
            "Confirm recalculation/audit.",
          ],
          inputs: ["Submitted item plan and change reason."],
          outputs: ["Reviewed/corrected plan and audit."],
          states: [
            "submitted/approved lifecycle preserved while item state changes",
          ],
          gates: ["Backoffice role plus reason; prior/new state captured."],
          exceptions: ["Unauthorized or invalid edit rejected."],
          permissions: ["Backoffice write authority in organization."],
          upstream: ["WF-MAT-001.BLDR.01"],
          downstream: ["WF-PRP-001.LADM.01"],
          handoffs: ["WF-MAT-001.HO-01"],
          events: ["proposal/audit/outbox change events"],
          success: ["Decision package contains correct material plan."],
          failure: ["Edit rejected without lifecycle drift."],
          sources: [`${src.materials} §Workflow`],
        })
      ),
      segment(
        "WF-MAT-001.SYS.01",
        "Recalculate and copy material cost plan",
        "SYS",
        "Budget projection",
        common({
          purpose:
            "Maintain cost arithmetic and copy approved proposal items to active Build at closing.",
          trigger: "Cost item mutation or proposal closing.",
          steps: [
            "Validate cents/quantity/scope.",
            "Apply budget delta.",
            "Recompute milestone draw availability and proposal total.",
            "Write events.",
            "Copy items on closing.",
          ],
          inputs: ["Cost-item mutation or closing command."],
          outputs: ["Recalculated totals/items/events."],
          states: ["proposal item → build item at closing"],
          gates: [
            "Organization/proposal/milestone scope; authorized lifecycle edit.",
          ],
          exceptions: ["Invalid link/arithmetic/closing transaction failure."],
          permissions: ["System under authorized command."],
          upstream: ["WF-MAT-001.BLDR.01", "WF-MAT-001.LOPS.01"],
          downstream: ["WF-BLD-001"],
          handoffs: ["WF-MAT-001.HO-02"],
          events: ["proposal/audit events"],
          success: ["Consistent proposal/build cost-item projection."],
          failure: ["No partial arithmetic/copy state."],
          sources: [`${src.materials}`],
        })
      ),
    ],
  },
];
