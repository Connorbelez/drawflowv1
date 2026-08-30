import {
  common,
  type ParentWorkflow,
  segment,
  src,
} from "./core-workflow-manifest-model";

export const workflowsPart02: ParentWorkflow[] = [
  {
    id: "WF-CAL-001",
    name: "Calendar Scheduling, Material Change, Reminder, and Export",
    persona: "CROSS",
    category: "Scheduling and coordination",
    purpose:
      "Provide role-aware proposal/build scheduling, impact preview, audited material edits, reminders, and scoped external calendar export without mutating immutable actual events.",
    preconditions: [
      "Proposal or active Build events exist and viewer can access them.",
    ],
    trigger:
      "User views/edits a projected event, schedules a visit/coordination event, or subscribes/exports calendar data.",
    steps: [
      "Project/filter calendar events.",
      "Open detail/context action.",
      "Preview dependency/draw/working-capital impact for material change.",
      "Capture reason when required and commit legal mutation.",
      "Notify/seek acknowledgement from affected participants.",
      "Create reminders or tokenized scoped ICS/export/sync subscription.",
    ],
    inputs: [
      "Proposal/build/milestone/draw/evidence/visit events, edit/action, reason, reminder/export scope.",
    ],
    outputs: [
      "Updated domain dates/actions, variance/audit, acknowledgements/reminders, ICS/webhook/export state.",
    ],
    states: [
      "planned/proposed dates editable by authority; immutable actual timestamps remain immutable",
      "reminder: scheduled → delivered/cancelled",
      "acknowledgement follows `WF-CTR-002`",
    ],
    gates: [
      "Impact preview before material edit.",
      "Reason/prior-new audit.",
      "Role-aware disabled states.",
      "No silent direct facility/payback edit.",
    ],
    exceptions: [
      "Illegal dependency/date change, stale concurrent edit, immutable event, denied role, expired subscription token, failed reminder.",
    ],
    permissions: [
      "Builder edits permitted own dates.",
      "Backoffice/admin actions by authority.",
      "Contractor sees assigned scope.",
      "Inspector sees assigned visits.",
    ],
    upstream: ["WF-PRP-001", "WF-BLD-001", "WF-CTR-002", "WF-MIL-001"],
    downstream: ["WF-BLD-001", "WF-CTR-002", "WF-MIL-001", "WF-COM-001"],
    handoffs: ["WF-CAL-001.HO-01", "WF-CAL-001.HO-02", "WF-CAL-001.HO-03"],
    events: [
      "Schedule changed, reasoned audit, acknowledgement requested, reminder delivery, site-visit scheduled/assigned/dispatched, export/webhook events.",
    ],
    success: [
      "All affected schedules/actions are consistent, acknowledged where required, and auditable.",
    ],
    failure: [
      "Edit/action rejected or reminder/export failure remains visible; canonical dates remain intact.",
    ],
    sources: [`${src.calendar} §7–§17, §23`, `${src.contractor} §8.6, §10`],
    status: "SUPPORTED",
    participants: ["BLDR", "CNTR", "LOPS", "LADM", "INSP", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-CAL-001.HO-01",
        from: "BLDR",
        to: "CNTR",
        trigger:
          "Assigned milestone/submilestone date materially changes or acknowledgement is requested.",
        artifacts:
          "Old/new dates, dependency/assignment context, reason, acknowledgement action.",
        acknowledgement:
          "Contractor acknowledges/clarifies/disputes via `WF-CTR-002`.",
      },
      {
        id: "WF-CAL-001.HO-02",
        from: "LOPS",
        to: "INSP",
        trigger: "Site visit is scheduled/assigned/dispatched.",
        artifacts:
          "Visit scope, date/time, site, token/assignment, checklist/prior evidence.",
        acknowledgement:
          "Inspector accepts/claims and performs `WF-MIL-001.INSP.01`.",
      },
      {
        id: "WF-CAL-001.HO-03",
        from: "SYS",
        to: "BLDR",
        trigger:
          "Builder-visible reminder or schedule-impact notification is due.",
        artifacts: "Event/date/context, action link, impact/status.",
        acknowledgement:
          "Builder opens/acts or notification remains unread/unresolved according to `WF-COM-001`.",
      },
    ],
    segments: [
      segment(
        "WF-CAL-001.BLDR.01",
        "Plan and adjust builder schedule",
        "BLDR",
        "Calendar planning",
        common({
          purpose:
            "View and edit permitted proposal/build schedules with impact awareness.",
          trigger: "Builder opens calendar or changes a planned date.",
          steps: [
            "Filter/view.",
            "Open event.",
            "Preview impact.",
            "Enter reason when material.",
            "Commit.",
            "Review acknowledgements/reminders.",
          ],
          inputs: ["Event/edit/reason."],
          outputs: ["Updated date/variance/notifications."],
          states: ["planned date old → new"],
          gates: ["Own scope; dependency and immutable-actual rules."],
          exceptions: ["Illegal/stale/denied edit."],
          permissions: ["Builder by granular permission."],
          upstream: ["WF-PRP-001", "WF-BLD-001"],
          downstream: ["WF-CTR-002"],
          handoffs: ["WF-CAL-001.HO-01", "WF-CAL-001.HO-03"],
          events: ["schedule audit/notification"],
          success: ["Legal schedule committed."],
          failure: ["Prior schedule retained."],
          sources: [`${src.calendar} §8, §12`],
        })
      ),
      segment(
        "WF-CAL-001.CNTR.01",
        "Consume assigned contractor schedule",
        "CNTR",
        "Contractor calendar",
        common({
          purpose: "Track only assigned work and respond to material changes.",
          trigger: "Assignment/change/reminder arrives.",
          steps: [
            "View assigned schedule/ICS.",
            "Review change.",
            "Acknowledge/clarify/dispute.",
            "Track coordination event.",
          ],
          inputs: ["Scoped schedule/change."],
          outputs: ["Acknowledgement/clarification."],
          states: ["pending acknowledgement → resolved"],
          gates: ["Assigned scope/tokenized feed."],
          exceptions: ["Revoked assignment/token."],
          permissions: ["Contractor assigned scope only."],
          upstream: ["WF-CAL-001.BLDR.01"],
          downstream: ["WF-CTR-002.CNTR.01"],
          handoffs: ["WF-CAL-001.HO-01"],
          events: ["acknowledgement/reminder"],
          success: ["Schedule understood."],
          failure: ["Dispute visible."],
          sources: [`${src.contractor} §8.6`],
        })
      ),
      segment(
        "WF-CAL-001.LOPS.01",
        "Schedule operational work and visits",
        "LOPS",
        "Operations calendar",
        common({
          purpose: "Coordinate evidence/review/admin targets and site visits.",
          trigger: "Operational action needs scheduling.",
          steps: [
            "Open event/work.",
            "Schedule/assign/reschedule/cancel within authority.",
            "Capture reason.",
            "Dispatch token/notification.",
            "Track acceptance.",
          ],
          inputs: ["Work item/date/assignee/reason."],
          outputs: ["Scheduled work/visit."],
          states: ["requested → scheduled/assigned/cancelled"],
          gates: ["Authority and immutable-actual rules."],
          exceptions: ["No assignee, token expiry, authority-required cancel."],
          permissions: ["Backoffice within non-final authority."],
          upstream: ["WF-OPS-001"],
          downstream: ["WF-MIL-001.INSP.01"],
          handoffs: ["WF-CAL-001.HO-02"],
          events: ["visit schedule/dispatch audit"],
          success: ["Work has schedule/assignee."],
          failure: ["Visible unscheduled exception."],
          sources: [`${src.calendar} §8.2, §11–§12`],
        })
      ),
      segment(
        "WF-CAL-001.INSP.01",
        "Accept scheduled site visit",
        "INSP",
        "Inspection scheduling",
        common({
          purpose: "Receive and act on assigned visit schedule.",
          trigger: "Visit dispatch arrives.",
          steps: [
            "Review date/scope/site/token.",
            "Accept/claim or surface conflict.",
            "Open field workflow at visit time.",
          ],
          inputs: ["Visit assignment."],
          outputs: ["Claim/acceptance or conflict."],
          states: ["assigned → claimed/in_progress"],
          gates: ["Valid target assignment/token."],
          exceptions: ["Expiry/conflict/cancellation."],
          permissions: ["Assigned Inspector only."],
          upstream: ["WF-CAL-001.LOPS.01"],
          downstream: ["WF-MIL-001.INSP.01"],
          handoffs: ["WF-CAL-001.HO-02"],
          events: ["visit claimed"],
          success: ["Visit proceeds."],
          failure: ["Reassignment needed."],
          sources: [`${src.core} §11.5`],
        })
      ),
      segment(
        "WF-CAL-001.LADM.01",
        "Authorize material calendar actions",
        "LADM",
        "Schedule governance",
        common({
          purpose:
            "Perform or approve authority-gated schedule/visit/draw actions.",
          trigger: "Calendar action requires final authority.",
          steps: [
            "Review event/impact.",
            "Enter reason.",
            "Approve/commit or reject.",
            "Verify audit.",
          ],
          inputs: ["Action/impact/reason."],
          outputs: ["Governed domain mutation."],
          states: ["pending authority → committed/rejected"],
          gates: ["Lender Admin authority."],
          exceptions: ["Policy/immutable event."],
          permissions: ["Principal Broker/admin."],
          upstream: ["WF-CAL-001.LOPS.01"],
          downstream: ["WF-BLD-001", "WF-MIL-001", "WF-DRW-001"],
          handoffs: [],
          events: ["authority action audit"],
          success: ["Legal action committed."],
          failure: ["Prior state retained."],
          sources: [`${src.calendar} §9.3, §12, §16`],
        })
      ),
      segment(
        "WF-CAL-001.SYS.01",
        "Project events, validate edits, and deliver reminders/exports",
        "SYS",
        "Calendar projection",
        common({
          purpose:
            "Unify domain events without duplicating canonical state and enforce edit/export scope.",
          trigger: "Calendar query/edit/reminder/export.",
          steps: [
            "Project/filter.",
            "Compute impact.",
            "Validate/commit canonical mutation.",
            "Write audit/notifications.",
            "Deliver reminders/ICS/webhooks.",
          ],
          inputs: ["Domain records and command."],
          outputs: ["Projection/mutation/delivery."],
          states: ["Derived event/reminder/subscription states."],
          gates: ["Canonical domain mutation and token/tenant scope."],
          exceptions: ["Stale edit/delivery/token failure."],
          permissions: ["System under actor scope."],
          upstream: ["WF-PRP-001", "WF-BLD-001"],
          downstream: ["WF-COM-001"],
          handoffs: ["WF-CAL-001.HO-03"],
          events: ["calendar/reminder/export/webhook"],
          success: ["Consistent schedule/delivery."],
          failure: ["Canonical state preserved; failure observable."],
          sources: [`${src.calendar} §13, §17, §21`],
        })
      ),
    ],
  },
  {
    id: "WF-DRW-001",
    name: "Draw Request, Review, Approval, Release, and Receipt Confirmation",
    persona: "CROSS",
    category: "Draw disbursement",
    purpose:
      "Convert approved milestone value into an idempotent reimbursement request, obtain final release authority, record money-out/fees/interest only at release, and settle receipt exceptions.",
    preconditions: [
      "Active Build and loan/capital context exist.",
      "Milestone completion value has been approved under `WF-MIL-001`.",
      "Available-now balance is positive.",
    ],
    trigger:
      "Builder requests any valid amount up to available-now balance, or configured planning logic exposes an eligible draw action.",
    steps: [
      "Calculate unlocked, reserved, and available value separately from planned forecast rows.",
      "Builder enters amount, reviews, and submits with idempotent operation ID.",
      "Operations reviews/prepares recommendation; builder may withdraw while requested.",
      "Lender Admin approves/rejects requested record.",
      "Only approved record is released/executed or recorded.",
      "Record release date/amount/fee treatment and start interest at funds_released.",
      "Notify builder and create receipt confirmation.",
      "Builder confirms, reports non-receipt, or reports discrepancy; operations resolves exceptions.",
    ],
    inputs: [
      "Approved milestone drawAvailability, facility principal/balance, reserved requests.",
      "Requested amount/note/client operation ID.",
      "Evidence/milestone context, fees, interest implications, release result.",
    ],
    outputs: [
      "Independent activeBuildDrawRequest and immutable request key/history.",
      "Approval/rejection/withdrawal/release capital event.",
      "Receipt confirmation/exception task.",
      "Webhooks/audit/notifications.",
    ],
    states: [
      "request: requested → approved → released; requested → rejected/withdrawn",
      "draw PRD projection: not_eligible/partially_eligible/pending_review/pending_visit/ready_for_admin/approved_for_release/released/rejected/replanned",
      "forecast plannedDrawScheduleRows remain planning-only",
    ],
    gates: [
      "Amount ≤ available now and uses whole cents.",
      "Operation ID is idempotent and cannot be reused for a different amount.",
      "Only requested can withdraw/approve/reject; only approved can release.",
      "Lender Admin final release; interest starts only when funds released.",
    ],
    exceptions: [
      "Over-limit/invalid amount, duplicate ID mismatch, loan availability block, rejection/withdrawal, payment execution failure, non-receipt, amount discrepancy.",
    ],
    permissions: [
      "Builder/authorized staff creates/withdraws own request.",
      "Operations prepares/recommends.",
      "Lender Admin approves/rejects/releases.",
      "Migration is explicit backoffice-only.",
    ],
    upstream: ["WF-MIL-001", "WF-PRP-001"],
    downstream: ["WF-COM-001", "WF-INT-001", "WF-OPS-001"],
    handoffs: [
      "WF-DRW-001.HO-01",
      "WF-DRW-001.HO-02",
      "WF-DRW-001.HO-03",
      "WF-DRW-001.HO-04",
      "WF-DRW-001.HO-05",
    ],
    events: [
      "draw_request.submitted/approved/rejected/withdrawn",
      "draw approved_for_release/released",
      "capital event",
      "fee/interest start",
      "receipt confirmed/exception",
      "audit/outbox/webhooks/notifications",
    ],
    success: [
      "Released reimbursement is recorded once, interest starts on release, and receipt is confirmed.",
    ],
    failure: [
      "Request is rejected/withdrawn/blocked or settlement exception remains assigned; balance/history remain correct.",
    ],
    sources: [
      `${src.drawRequest} §Domain separation–§Request lifecycle`,
      `${src.core} §8.1–8.3, §18.3.9–18.3.12`,
      `${src.notifications} §8`,
    ],
    status: "NEEDS_VALIDATION",
    validationNote:
      "The newer production request ledger allows builder-selected partial requests against pooled approved-milestone value; the original PRD models Draw Group readiness creating a Draw Release Work Order. Product policy must confirm whether requests consume pooled value, a specific Draw Group, or both, and when operations preparation is mandatory.",
    participants: ["BLDR", "LOPS", "LADM", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-DRW-001.HO-01",
        from: "BLDR",
        to: "LOPS",
        trigger: "Idempotent draw request is submitted.",
        artifacts:
          "Request ID/key, amount, note, available/reserved/unlocked reconciliation, eligible milestone context.",
        acknowledgement:
          "Operations claims/reviews and prepares recommendation or requests correction.",
      },
      {
        id: "WF-DRW-001.HO-02",
        from: "LOPS",
        to: "LADM",
        trigger: "Request/release package is ready for final decision.",
        artifacts:
          "Request, approved milestones/evidence summary, amount, fee treatment, facility availability, interest implications, recommendation/warnings.",
        acknowledgement:
          "Lender Admin approves, rejects, or leaves blocked with reason.",
      },
      {
        id: "WF-DRW-001.HO-03",
        from: "LADM",
        to: "SYS",
        trigger: "Release is authorized or rejection is recorded.",
        artifacts:
          "Decision, actor/reason, approved amount, fee treatment, execution/recording instruction.",
        acknowledgement:
          "System records final state/capital event or returns execution failure without duplicate money-out.",
      },
      {
        id: "WF-DRW-001.HO-04",
        from: "SYS",
        to: "BLDR",
        trigger: "Funds release is recorded.",
        artifacts:
          "Released amount/date, fee treatment, request/reference, receipt-confirmation task; interest-start fact (not pre-release interest).",
        acknowledgement:
          "Builder confirms receipt or reports non-receipt/discrepancy.",
      },
      {
        id: "WF-DRW-001.HO-05",
        from: "BLDR",
        to: "LOPS",
        trigger: "Builder reports non-receipt or amount discrepancy.",
        artifacts:
          "Request/release reference, expected/received amount, receipt status, notes/supporting proof.",
        acknowledgement:
          "Operations claims settlement exception, investigates, and records resolution/escalation.",
      },
    ],
    segments: [
      segment(
        "WF-DRW-001.BLDR.01",
        "Request reimbursement and confirm receipt",
        "BLDR",
        "Builder draws",
        common({
          purpose:
            "Request eligible reimbursement, optionally withdraw before decision, and close the loop on actual receipt.",
          trigger:
            "Available-now value is positive or release notification arrives.",
          steps: [
            "Review available balance/statement/forecasts.",
            "Enter amount and review.",
            "Submit with stable operation ID.",
            "Withdraw while requested if needed.",
            "Review decision/release.",
            "Confirm receipt or report exception.",
          ],
          inputs: ["Amount/note/idempotency ID and receipt result."],
          outputs: ["Request/withdrawal/receipt response."],
          states: [
            "requested → withdrawn/approved/rejected → released → receipt confirmed/exception",
          ],
          gates: ["Draw permission, whole cents, within available balance."],
          exceptions: [
            "Over-limit, retry failure preserves input/ID, blocked user receives reason, non-receipt/discrepancy.",
          ],
          permissions: ["Builder Lead/authorized Builder Staff on own Build."],
          upstream: ["WF-MIL-001.BLDR.01"],
          downstream: ["WF-DRW-001.LOPS.01"],
          handoffs: [
            "WF-DRW-001.HO-01",
            "WF-DRW-001.HO-04",
            "WF-DRW-001.HO-05",
          ],
          events: ["request/withdraw/receipt events and notifications"],
          success: ["Receipt confirmed."],
          failure: [
            "Closed rejection/withdrawal or open settlement exception.",
          ],
          sources: [`${src.drawRequest}`],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Draw Group attribution remains unresolved across source documents.",
        })
      ),
      segment(
        "WF-DRW-001.LOPS.01",
        "Review request and resolve settlement exceptions",
        "LOPS",
        "Draw operations",
        common({
          purpose:
            "Prepare a complete release package and own non-receipt/discrepancy operations without final release authority.",
          trigger: "Request or receipt exception enters queue.",
          steps: [
            "Claim.",
            "Review eligibility/amount/evidence/facility/fees.",
            "Request correction or recommend decision.",
            "Send to authority.",
            "Investigate receipt exception and record resolution/escalation.",
          ],
          inputs: ["Request/release/receipt package."],
          outputs: ["Recommendation/release package or settlement resolution."],
          states: [
            "requested → in_review → ready_for_admin; exception open → resolved/escalated",
          ],
          gates: ["Cannot final release; request state/amount revalidated."],
          exceptions: [
            "Loan availability, execution failure, discrepancy/non-receipt.",
          ],
          permissions: ["Backoffice/Broker within organization/assignment."],
          upstream: ["WF-DRW-001.BLDR.01"],
          downstream: ["WF-DRW-001.LADM.01"],
          handoffs: [
            "WF-DRW-001.HO-01",
            "WF-DRW-001.HO-02",
            "WF-DRW-001.HO-05",
          ],
          events: ["work claimed/recommended/exception resolved"],
          success: ["Authority package complete or exception resolved."],
          failure: ["Blocked/escalated item remains visible."],
          sources: [`${src.production} §8.9`, `${src.core} §18.3.9–18.3.12`],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Exact relationship between builder request review and legacy Draw Release Work Order is not fully specified.",
        })
      ),
      segment(
        "WF-DRW-001.LADM.01",
        "Approve, reject, and release draw",
        "LADM",
        "Draw authority",
        common({
          purpose:
            "Exercise final money-out authority after reviewing eligibility, fees, facility balance, and interest implications.",
          trigger: "Request/release package is ready.",
          steps: [
            "Review request/milestones/evidence/amount/fees/facility/interest.",
            "Approve or reject with required reason.",
            "Authorize release of approved request.",
            "Review execution result.",
          ],
          inputs: ["Release package and decision/release instruction."],
          outputs: ["Approval/rejection/release authorization."],
          states: ["requested → approved/rejected; approved → released"],
          gates: [
            "Lender Admin only; facility/eligibility; only legal state transitions.",
          ],
          exceptions: [
            "Availability block, policy concern, execution failure.",
          ],
          permissions: ["Principal Broker/admin final authority."],
          upstream: ["WF-DRW-001.LOPS.01"],
          downstream: ["WF-INT-001"],
          handoffs: ["WF-DRW-001.HO-02", "WF-DRW-001.HO-03"],
          events: ["decision/release audit and outbox"],
          success: ["Release recorded once."],
          failure: [
            "Rejected/blocked/failed with reason; no interest start before release.",
          ],
          sources: [
            `${src.core} §18.3.10`,
            `${src.drawRequest} §Request lifecycle`,
          ],
        })
      ),
      segment(
        "WF-DRW-001.SYS.01",
        "Calculate availability and record release",
        "SYS",
        "Draw ledger orchestration",
        common({
          purpose:
            "Maintain separate forecast/request ledgers, enforce idempotency/availability, record capital once, and drive receipt/webhook events.",
          trigger:
            "Availability query, request/decision/release/receipt command.",
          steps: [
            "Calculate approved/unlocked/reserved/available.",
            "Validate/idempotently create request.",
            "Apply legal decision transition.",
            "Execute/record release once.",
            "Record fee/date/interest start.",
            "Create receipt task and emit events.",
          ],
          inputs: [
            "Milestone/facility/request ledgers and authorized commands.",
          ],
          outputs: ["Request/capital/receipt records and events."],
          states: [
            "requested → approved/rejected/withdrawn; approved → released",
          ],
          gates: [
            "Forecast never mutates into request; released remains reserved; no duplicate capital event.",
          ],
          exceptions: [
            "ID mismatch, over-limit, concurrent reservation, execution failure.",
          ],
          permissions: ["System under scoped authorized actor."],
          upstream: ["WF-MIL-001.SYS.01"],
          downstream: ["WF-COM-001", "WF-INT-001"],
          handoffs: ["WF-DRW-001.HO-03", "WF-DRW-001.HO-04"],
          events: ["draw lifecycle/capital/audit/outbox/webhook/notification"],
          success: ["Ledger reconciles exactly and receipt task exists."],
          failure: [
            "No duplicate/partial money-out; actionable failure recorded.",
          ],
          sources: [
            `${src.drawRequest} §Domain separation–§Request lifecycle`,
            `${src.core} §18.3.10–11`,
          ],
          status: "NEEDS_VALIDATION",
          validationNote:
            "Draw Group attribution/release-work-order policy requires confirmation.",
        })
      ),
    ],
  },
  {
    id: "WF-BUD-001",
    name: "Budget Revision and Draw Plan Recalculation",
    persona: "CROSS",
    category: "Budget governance",
    purpose:
      "Version material cost/schedule changes, recompute reimbursement feasibility, and obtain final lender approval without overwriting the approved Budget history.",
    preconditions: [
      "Active Build has an approved Budget version.",
      "Variance threshold/policy is available.",
    ],
    trigger:
      "Actual/projected cost variance breaches threshold, system recommends/requires revision, or builder manually requests revision.",
    steps: [
      "Flag recommended/required revision.",
      "Builder drafts revised milestone costs/durations and explanation.",
      "System recomputes Draw Plan/working-capital/policy impact.",
      "Builder submits.",
      "Lender Admin reviews and approves/rejects/requests changes.",
      "Approved revision creates new Budget version and supersedes prior active version in workspace while preserving history.",
    ],
    inputs: [
      "Current Budget version, actual/projected variance, revised costs/durations, explanation, recomputed plans/warnings.",
    ],
    outputs: [
      "Revision record/decision.",
      "New approved Budget version and updated active plan projection.",
      "Preserved historical versions/audit.",
    ],
    states: [
      "not_required → recommended/required → draft → submitted → under_review → approved/rejected; prior approved → superseded",
    ],
    gates: [
      "Configured materiality threshold.",
      "Admin approval for material revision.",
      "No overwrite of historical Budget.",
      "Recomputed feasibility/policy review.",
    ],
    exceptions: [
      "Missing explanation/data, infeasible revised plan, changes requested, rejection, concurrent newer revision.",
    ],
    permissions: [
      "Builder drafts/submits own Build revision.",
      "Lender Admin final decision.",
      "Operations may support review but final authority stays admin.",
    ],
    upstream: ["WF-BLD-001", "WF-MIL-001", "WF-MAT-001"],
    downstream: ["WF-BLD-001", "WF-DRW-001", "WF-COM-001"],
    handoffs: ["WF-BUD-001.HO-01", "WF-BUD-001.HO-02", "WF-BUD-001.HO-03"],
    events: [
      "variance threshold/revision required, submitted/changes/approved/rejected/superseded audit/outbox/notifications.",
    ],
    success: [
      "New approved version and recomputed plan govern the workspace; history remains available.",
    ],
    failure: [
      "Revision is rejected/changes-requested; prior approved Budget remains governing and risk flag stays visible.",
    ],
    sources: [`${src.core} §8.9, §11.7, §15.4`, `${src.production} §8.8`],
    status: "SUPPORTED",
    participants: ["BLDR", "LADM", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-BUD-001.HO-01",
        from: "SYS",
        to: "BLDR",
        trigger: "Variance threshold marks revision recommended/required.",
        artifacts:
          "Current Budget version, variance details, affected milestones/draws, required fields, deadline/policy warnings.",
        acknowledgement:
          "Builder opens revision and submits revised costs/durations/explanation.",
      },
      {
        id: "WF-BUD-001.HO-02",
        from: "BLDR",
        to: "LADM",
        trigger: "Budget Revision is submitted.",
        artifacts:
          "Base version, revised milestone costs/durations, explanation, variance, recomputed plan options/working-capital/policy impacts.",
        acknowledgement:
          "Lender Admin moves under review and decides or requests changes.",
      },
      {
        id: "WF-BUD-001.HO-03",
        from: "LADM",
        to: "BLDR",
        trigger: "Revision decision is recorded.",
        artifacts:
          "Approved/rejected/changes outcome, reason, new version/plan or requested corrections.",
        acknowledgement:
          "Builder adopts new active version or revises/resubmits while prior version remains governing.",
      },
    ],
    segments: [
      segment(
        "WF-BUD-001.BLDR.01",
        "Draft and submit Budget Revision",
        "BLDR",
        "Budget revision",
        common({
          purpose:
            "Explain material variance and propose revised milestone costs/durations.",
          trigger: "Revision flagged or builder requests it.",
          steps: [
            "Review variance/base version.",
            "Edit costs/durations.",
            "Explain change.",
            "Review recomputed plan/warnings.",
            "Submit.",
            "Respond to changes/decision.",
          ],
          inputs: ["Base Budget, revised values, explanation."],
          outputs: ["Submitted/revised revision."],
          states: ["recommended/required → draft → submitted; changes → draft"],
          gates: ["Own Build, required explanation, valid values."],
          exceptions: ["Infeasible plan, missing data, rejection."],
          permissions: ["Builder Lead/permissioned staff."],
          upstream: ["WF-BLD-001.BLDR.01"],
          downstream: ["WF-BUD-001.LADM.01"],
          handoffs: [
            "WF-BUD-001.HO-01",
            "WF-BUD-001.HO-02",
            "WF-BUD-001.HO-03",
          ],
          events: ["revision drafted/submitted/resubmitted"],
          success: ["Approved new version."],
          failure: ["Prior Budget remains active."],
          sources: [`${src.core} §11.7`],
        })
      ),
      segment(
        "WF-BUD-001.LADM.01",
        "Review and decide Budget Revision",
        "LADM",
        "Budget approval",
        common({
          purpose:
            "Protect lender policy/capital exposure while approving a versioned change when justified.",
          trigger: "Revision submitted.",
          steps: [
            "Review base/variance/revised values/explanation.",
            "Review recomputed plans/working capital/policy.",
            "Approve, reject, or request changes with reason.",
            "Verify new active version on approval.",
          ],
          inputs: ["Revision package."],
          outputs: ["Decision and approved version instruction."],
          states: [
            "submitted → under_review → approved/rejected/changes_requested",
          ],
          gates: ["Lender Admin authority and policy/feasibility."],
          exceptions: ["Infeasible/unsupported change or newer revision."],
          permissions: ["Lender Admin/Principal Broker."],
          upstream: ["WF-BUD-001.BLDR.01"],
          downstream: ["WF-BLD-001", "WF-DRW-001"],
          handoffs: ["WF-BUD-001.HO-02", "WF-BUD-001.HO-03"],
          events: ["revision decision/audit/notification"],
          success: ["New Budget version approved."],
          failure: ["Prior approved version remains."],
          sources: [`${src.core} §11.7`],
        })
      ),
      segment(
        "WF-BUD-001.SYS.01",
        "Detect variance, recompute plan, and version Budget",
        "SYS",
        "Budget orchestration",
        common({
          purpose:
            "Detect materiality, recalculate feasibility, and atomically create/switch versions without destroying history.",
          trigger: "Cost update, revision edit/submission, or decision.",
          steps: [
            "Calculate variance/threshold.",
            "Flag revision.",
            "Recompute plans.",
            "Persist revision/version states.",
            "On approval create new version and mark prior superseded.",
            "Emit events.",
          ],
          inputs: ["Costs, policy, working capital, revision commands."],
          outputs: ["Flags/plans/versions/events."],
          states: ["Per Budget Revision model."],
          gates: ["Version immutability and legal transitions."],
          exceptions: [
            "Concurrent/stale base, infeasible plan, transaction failure.",
          ],
          permissions: ["System under authorized actor."],
          upstream: ["WF-BLD-001.SYS.01"],
          downstream: ["WF-BLD-001", "WF-COM-001"],
          handoffs: ["WF-BUD-001.HO-01"],
          events: ["variance/revision/version audit/outbox/notifications"],
          success: ["Consistent governing version and history."],
          failure: ["Prior version remains and exception is visible."],
          sources: [`${src.core} §8.9, §15.4`],
        })
      ),
    ],
  },
];
