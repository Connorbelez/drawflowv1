import {
  common,
  type ParentWorkflow,
  segment,
  src,
} from "./core-workflow-manifest-model";

export const workflowsPart03: ParentWorkflow[] = [
  {
    id: "WF-BLD-001",
    name: "Active Build Schedule, Progress, Cost, and Participant Management",
    persona: "CROSS",
    category: "Build execution",
    purpose:
      "Maintain the canonical live Build Workspace as field reality changes while preserving schedule/cost variance, approved versions, assignments, and downstream eligibility.",
    preconditions: [
      "Proposal is closed and active Build exists (`WF-PRP-001`).",
      "Actor has organization/build scope.",
    ],
    trigger:
      "Builder enters the live workspace or field reality changes progress, dates, costs, dependencies, notes, subtasks, contractors, or evidence.",
    steps: [
      "Review current roadmap/draw groups/next work.",
      "Update progress, dates, notes, subtasks, and in-progress evidence.",
      "Manage contractor assignments.",
      "Capture reason for material schedule/cost changes.",
      "Record variances and recompute plan impacts where required.",
      "Route threshold breaches to Budget Revision and completed work to Milestone Completion.",
    ],
    inputs: [
      "Active roadmap/Budget/Draw Plan.",
      "Progress, planned/actual dates, notes/subtasks/evidence.",
      "Actual/projected costs and contractor assignments.",
    ],
    outputs: [
      "Updated Build Workspace projection.",
      "Schedule/cost variance and assignment history.",
      "Recompute/notification/audit events.",
      "Eligibility to start `WF-MIL-001` or `WF-BUD-001`.",
    ],
    states: [
      "milestone: planned/blocked/ready → in_progress on_schedule/behind/critical → complete_pending_submission",
      "schedule variance records append; approved Budget is never overwritten",
    ],
    gates: [
      "Dependencies and role permissions.",
      "Reason/audit for material changes.",
      "Actual immutable timestamps are not silently edited.",
      "Threshold/policy may require revision.",
    ],
    exceptions: [
      "Illegal dependency/date transition rejected.",
      "Variance breach creates revision work.",
      "Contractor scope dispute follows `WF-CTR-002`.",
      "Offline evidence remains pending sync.",
    ],
    permissions: [
      "Builder updates own Build within granular permissions.",
      "Contractor only assigned scope.",
      "Lender roles monitor/review; final decisions remain separate.",
    ],
    upstream: ["WF-PRP-001", "WF-MAT-001", "WF-CTR-002"],
    downstream: ["WF-MIL-001", "WF-BUD-001", "WF-CAL-001", "WF-OPS-001"],
    handoffs: ["WF-BLD-001.HO-01", "WF-BLD-001.HO-02", "WF-BLD-001.HO-03"],
    events: [
      "Progress/date/cost/assignment/evidence audit events.",
      "Schedule/variance/assignment notifications.",
      "Plan recompute/outbox events.",
    ],
    success: [
      "Live Build accurately reflects current execution and next required action.",
    ],
    failure: [
      "Invalid update is rejected or an explicit exception/revision work item is open.",
    ],
    sources: [
      `${src.core} §10, §11.3, §13.6–13.7`,
      `${src.production} §8.8`,
      `${src.calendar} §8.2, §12`,
    ],
    status: "SUPPORTED",
    participants: ["BLDR", "CNTR", "LOPS", "LADM", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-BLD-001.HO-01",
        from: "BLDR",
        to: "CNTR",
        trigger:
          "Contractor assignment or material schedule/scope change is published.",
        artifacts:
          "Assigned milestone/submilestone, dates, dependencies, documents, acknowledgement request.",
        acknowledgement:
          "Contractor responds through `WF-CTR-002` acknowledgement/clarification state.",
      },
      {
        id: "WF-BLD-001.HO-02",
        from: "SYS",
        to: "LOPS",
        trigger:
          "Schedule/cost/evidence condition creates operational risk or review need.",
        artifacts:
          "Build/milestone context, variance, behind/critical flag, working-capital/draw impact, actor/timestamp.",
        acknowledgement:
          "Operations triages/claims/escalates the item in `WF-OPS-001`.",
      },
      {
        id: "WF-BLD-001.HO-03",
        from: "SYS",
        to: "LADM",
        trigger:
          "Material cost variance requires/recommends Budget Revision or a policy override.",
        artifacts:
          "Current approved Budget version, actual/projected variance, recomputed draw-plan impact, warnings.",
        acknowledgement:
          "Lender Admin routes/reviews `WF-BUD-001` or records an authorized override.",
      },
    ],
    segments: [
      segment(
        "WF-BLD-001.BLDR.01",
        "Maintain live Build execution",
        "BLDR",
        "Build workspace management",
        common({
          purpose:
            "Keep roadmap, progress, dates, costs, notes, evidence, and contractor scope current.",
          trigger: "Work starts/progresses or field conditions change.",
          steps: [
            "Review next milestones/dependencies.",
            "Update progress/dates/notes/subtasks.",
            "Upload in-progress evidence.",
            "Manage contractors.",
            "Enter actual/projected cost and reasoned changes.",
            "Start completion or revision workflow when indicated.",
          ],
          inputs: ["Field progress/schedule/cost/evidence."],
          outputs: ["Current Build state and routed next actions."],
          states: [
            "planned/ready/blocked → in_progress/behind/critical → complete_pending_submission",
          ],
          gates: ["Own Build, dependency and granular permission rules."],
          exceptions: ["Illegal transition, offline upload, threshold breach."],
          permissions: ["Builder Lead; Builder Staff only where permissioned."],
          upstream: ["WF-PRP-001.BLDR.01"],
          downstream: [
            "WF-MIL-001.BLDR.01",
            "WF-BUD-001.BLDR.01",
            "WF-CTR-002.BLDR.01",
          ],
          handoffs: ["WF-BLD-001.HO-01"],
          events: ["progress/schedule/cost/evidence/assignment events"],
          success: ["Workspace reflects field reality."],
          failure: ["Update rejected or exception visible."],
          sources: [`${src.core} §11.3`, `${src.production} §8.8`],
        })
      ),
      segment(
        "WF-BLD-001.CNTR.01",
        "Execute assigned Build scope",
        "CNTR",
        "Assigned build work",
        common({
          purpose:
            "Track assigned work, schedule, dependencies, and supporting evidence.",
          trigger: "Assignment/change is received.",
          steps: [
            "Review assigned work.",
            "Acknowledge/clarify through `WF-CTR-002`.",
            "Perform work.",
            "Upload supporting evidence/notes.",
            "Monitor schedule changes.",
          ],
          inputs: ["Assigned scope and schedule."],
          outputs: [
            "Acknowledgement, coordination state, supporting evidence.",
          ],
          states: [
            "assignment pending → acknowledged/resolved; work visible by milestone state",
          ],
          gates: ["Active linked profile and assignment."],
          exceptions: ["Dispute/removal/offline upload."],
          permissions: [
            "Assigned scope only; no formal completion/draw authority.",
          ],
          upstream: ["WF-CTR-002"],
          downstream: ["WF-MIL-001"],
          handoffs: ["WF-BLD-001.HO-01"],
          events: ["contractor schedule/evidence events"],
          success: ["Assigned work is coordinated."],
          failure: ["Scope issue remains explicit."],
          sources: [`${src.contractor} §8.5–8.7`],
        })
      ),
      segment(
        "WF-BLD-001.LOPS.01",
        "Monitor and triage Build execution risk",
        "LOPS",
        "Portfolio operations",
        common({
          purpose:
            "Identify schedule, evidence, working-capital, and draw risks and route action without changing final authority.",
          trigger: "Risk/variance signal or portfolio triage cycle.",
          steps: [
            "Review build health and next action.",
            "Claim/assign operational work.",
            "Request status/info where supported.",
            "Escalate policy/material issues.",
            "Track resolution.",
          ],
          inputs: [
            "Build health, variances, dependencies, evidence/draw state.",
          ],
          outputs: ["Claimed/routed work and recommendation."],
          states: ["untriaged → claimed/in_review → routed/resolved"],
          gates: ["Organization/assignment access."],
          exceptions: ["Stale data, no assignee, authority-required action."],
          permissions: [
            "Backoffice non-destructive write/recommendation; no final release/override.",
          ],
          upstream: ["WF-BLD-001.BLDR.01"],
          downstream: ["WF-OPS-001", "WF-MIL-001", "WF-BUD-001"],
          handoffs: ["WF-BLD-001.HO-02"],
          events: ["work claimed/routed; audit/notification"],
          success: ["Risk has an accountable next action."],
          failure: ["Exception remains visible in queue."],
          sources: [`${src.production} §8.8–8.9`, `${src.backoffice}`],
        })
      ),
      segment(
        "WF-BLD-001.LADM.01",
        "Govern material Build changes",
        "LADM",
        "Build governance",
        common({
          purpose:
            "Review material variance/policy implications and direct revision/override paths.",
          trigger: "System/operations escalates a material change.",
          steps: [
            "Review approved version and variance.",
            "Determine revision/policy path.",
            "Record decision/override reason where allowed.",
            "Monitor downstream resolution.",
          ],
          inputs: ["Variance/policy package."],
          outputs: ["Revision direction or audited override."],
          states: [
            "flagged → revision_required/recommended or override_resolved",
          ],
          gates: ["Final authority and configured thresholds."],
          exceptions: ["Insufficient data requests more information."],
          permissions: ["Lender Admin/Principal Broker."],
          upstream: ["WF-BLD-001.LOPS.01"],
          downstream: ["WF-BUD-001.LADM.01"],
          handoffs: ["WF-BLD-001.HO-03"],
          events: ["variance/revision/override audit"],
          success: ["Material change has governed path."],
          failure: ["Build remains flagged; approved version unchanged."],
          sources: [`${src.core} §8.9, §11.7`],
        })
      ),
      segment(
        "WF-BLD-001.SYS.01",
        "Project Build state and route variances",
        "SYS",
        "Build state orchestration",
        common({
          purpose:
            "Validate live updates, append variance/history, recompute impacts, and route next work.",
          trigger: "Authorized Build mutation or time/threshold condition.",
          steps: [
            "Authorize/validate transition.",
            "Persist update/history.",
            "Recompute schedule/capital/draw effects.",
            "Create threshold/risk work.",
            "Emit audit/outbox/notifications.",
          ],
          inputs: ["Build update and policy/current approved versions."],
          outputs: ["Updated projection, variance/work items, events."],
          states: ["Per milestone/build state model."],
          gates: [
            "No overwrite of approved Budget; immutable actuals protected.",
          ],
          exceptions: ["Illegal/stale/conflicting update rejected."],
          permissions: ["System under actor organization scope."],
          upstream: ["WF-BLD-001.BLDR.01"],
          downstream: ["WF-MIL-001", "WF-BUD-001", "WF-OPS-001"],
          handoffs: ["WF-BLD-001.HO-02", "WF-BLD-001.HO-03"],
          events: ["audit/outbox/notifications"],
          success: ["Consistent current state and routed work."],
          failure: ["No silent partial update."],
          sources: [`${src.production} §8.8`, `${src.core} §17–§18`],
        })
      ),
    ],
  },
  {
    id: "WF-MIL-001",
    name: "Milestone Completion, Evidence Review, Site Visit, and Final Decision",
    persona: "CROSS",
    category: "Milestone verification",
    purpose:
      "Verify completed reimbursement-eligible work through versioned evidence, lender review, optional inspection, and final lender-admin decision without discarding location-unverified proof.",
    preconditions: [
      "Active Build/milestone exists and work is complete pending submission.",
      "Required evidence/site-visit policies are resolvable.",
    ],
    trigger:
      "Builder marks a milestone complete and submits actual cost, completion report, required proof, and location attempt where applicable.",
    steps: [
      "Validate and create Milestone Completion Package plus one active Evidence Review Work Order.",
      "Lender Operations claims and reviews evidence/cost/geofence/dependency/draw-group context.",
      "Request/resubmit more information as needed.",
      "Request/assign/perform site visit when required; preserve offline drafts and sync.",
      "Operations submits recommendation and Admin Approval Package.",
      "Lender Admin reviews all proof/reports/warnings, resolves geofence/site-visit gates, and approves/rejects/requests more work.",
      "On approval recompute draw availability/readiness.",
    ],
    inputs: [
      "Actual cost, completion report, required evidence/checklist, capture metadata/geofence result.",
      "Staff review/recommendation.",
      "Site Visit Report when applicable.",
      "Budget variance/warnings/overrides.",
    ],
    outputs: [
      "Versioned completion package.",
      "Evidence/Site Visit work orders and reports.",
      "Admin Approval Package and final decision.",
      "Updated milestone and draw eligibility.",
    ],
    states: [
      "milestone: complete_pending_submission → submitted_for_review → more_information_requested/site_visit_requested → site_visit_complete/recommended_for_approval|rejection → approved/rejected/revision_required",
      "site visit: requested → assigned/claimed → in_progress/offline_draft → submitted → accepted/rework/cancelled",
    ],
    gates: [
      "Required evidence unless policy permits explicit exception submission.",
      "Exactly one active Evidence Review Work Order per attempt.",
      "Staff/Inspector recommendations are not final.",
      "Admin satisfies policy gates or records explicit audited override.",
    ],
    exceptions: [
      "Missing evidence; failed/unavailable/low-confidence geofence or suspected spoofed location; cost variance; rejection recommendation; incomplete/inconclusive visit; admin requests information/reopens visit; sync failure.",
    ],
    permissions: [
      "Builder submits/responds.",
      "Operations reviews/recommends/requests visit/info.",
      "Inspector has assignment/token scope.",
      "Only Lender Admin final-approves/rejects or overrides.",
    ],
    upstream: ["WF-BLD-001", "WF-CTR-002"],
    downstream: ["WF-DRW-001", "WF-BUD-001", "WF-OPS-001"],
    handoffs: [
      "WF-MIL-001.HO-01",
      "WF-MIL-001.HO-02",
      "WF-MIL-001.HO-03",
      "WF-MIL-001.HO-04",
      "WF-MIL-001.HO-05",
      "WF-MIL-001.HO-06",
      "WF-MIL-001.HO-07",
    ],
    events: [
      "Completion submitted, review claimed/recommendation, missing-info request/response, visit requested/assigned/submitted, location-unverified warning, final decision/override audit, notifications/outbox.",
    ],
    success: [
      "Milestone is approved and draw eligibility is recomputed from complete, auditable evidence/review context.",
    ],
    failure: [
      "Milestone is rejected/revision-required or remains in an explicit actionable exception state; evidence is retained.",
    ],
    sources: [
      `${src.core} §11.3–11.6, §15.1, §18.3.4–18.3.8, §18.3.12`,
      `${src.production} §8.9–8.10`,
      `${src.evidenceVisit}`,
    ],
    status: "SUPPORTED",
    participants: ["BLDR", "LOPS", "INSP", "LADM", "SYS"],
    handoffDefinitions: [
      {
        id: "WF-MIL-001.HO-01",
        from: "BLDR",
        to: "LOPS",
        trigger:
          "Completion package is submitted and work order enters New Submission.",
        artifacts:
          "Build/milestone/draw-group IDs, actual cost, report, evidence/checklist, geofence result, variance, actor/timestamp.",
        acknowledgement: "Operations claims the work order and begins review.",
      },
      {
        id: "WF-MIL-001.HO-02",
        from: "LOPS",
        to: "BLDR",
        trigger: "Reviewer requests more information.",
        artifacts:
          "Specific missing/unclear items, original package/evidence context, due/owner metadata.",
        acknowledgement:
          "Builder appends proof/clarification and resubmits; original package remains versioned.",
      },
      {
        id: "WF-MIL-001.HO-03",
        from: "BLDR",
        to: "LOPS",
        trigger: "Builder resubmits requested information.",
        artifacts:
          "Appended evidence/clarification, new geofence results, response timestamp/version.",
        acknowledgement:
          "Original reviewer/queue reopens and compares original vs response.",
      },
      {
        id: "WF-MIL-001.HO-04",
        from: "LOPS",
        to: "INSP",
        trigger:
          "Site visit is required/requested and work order assigned or claimable.",
        artifacts:
          "Build location, milestone scope/checklist, prior evidence, geofence requirement, schedule/token/assignment.",
        acknowledgement: "Inspector claims/accepts and performs the visit.",
      },
      {
        id: "WF-MIL-001.HO-05",
        from: "INSP",
        to: "LOPS",
        trigger: "Structured Site Visit Report is submitted/synced.",
        artifacts:
          "Photos/videos/notes, geofence attempt, checklist, recommendation, actor/timestamp, sync state.",
        acknowledgement:
          "Operations reviews report and completes recommendation/escalation.",
      },
      {
        id: "WF-MIL-001.HO-06",
        from: "LOPS",
        to: "LADM",
        trigger:
          "Evidence review is ready and required visit is completed or requires authority waiver.",
        artifacts:
          "Admin Approval Package: builder proof, geofence, staff report/recommendation, visit report, variance, warnings, prior overrides.",
        acknowledgement:
          "Lender Admin records final decision or routes specific additional work.",
      },
      {
        id: "WF-MIL-001.HO-07",
        from: "LADM",
        to: "BLDR",
        trigger: "Final milestone decision is recorded.",
        artifacts:
          "Approved/rejected/revision/more-info outcome, reason, accepted override, next action, eligibility impact.",
        acknowledgement:
          "Builder views outcome and proceeds to draw request or correction/resubmission.",
      },
    ],
    segments: [
      segment(
        "WF-MIL-001.BLDR.01",
        "Submit and supplement milestone completion",
        "BLDR",
        "Completion submission",
        common({
          purpose:
            "Assert completed work with required actual cost, report, evidence, and location attempt; respond to formal deficiencies.",
          trigger:
            "Work is complete pending submission or more information/revision is requested.",
          steps: [
            "Enter actual cost/report.",
            "Attach required evidence.",
            "Allow/attempt location verification.",
            "Submit.",
            "Review requests/decision.",
            "Append and resubmit corrections without deleting history.",
          ],
          inputs: ["Completion report/cost/evidence/location."],
          outputs: ["Completion package or versioned response."],
          states: [
            "complete_pending_submission → submitted_for_review; more_info/rejected/revision → resubmitted",
          ],
          gates: ["Builder permission and required evidence policy."],
          exceptions: [
            "Missing evidence, location failure retained/flagged, upload/sync issue.",
          ],
          permissions: [
            "Builder Lead or permissioned Builder Staff on own Build.",
          ],
          upstream: ["WF-BLD-001.BLDR.01"],
          downstream: ["WF-MIL-001.LOPS.01", "WF-DRW-001.BLDR.01"],
          handoffs: [
            "WF-MIL-001.HO-01",
            "WF-MIL-001.HO-02",
            "WF-MIL-001.HO-03",
            "WF-MIL-001.HO-07",
          ],
          events: [
            "milestone_completion.submitted/resubmitted",
            "missing-info resolved",
            "notifications",
          ],
          success: ["Approved completion or actionable review state."],
          failure: ["Rejected/revision state with retained evidence."],
          sources: [`${src.core} §18.3.4, §18.3.6`],
        })
      ),
      segment(
        "WF-MIL-001.LOPS.01",
        "Review completion evidence and recommend",
        "LOPS",
        "Evidence review",
        common({
          purpose:
            "Assess evidence integrity/completeness/cost/context, request missing work or inspection, and prepare a recommendation.",
          trigger: "Evidence Review Work Order is new/reopened.",
          steps: [
            "Claim.",
            "Review milestone/report/proof/geofence/cost/dependencies/draw group.",
            "Recommend approval/rejection, request info, or request visit.",
            "Review responses/report.",
            "Send Admin Approval Package.",
          ],
          inputs: ["Completion package and response/visit artifacts."],
          outputs: ["Audited review/recommendation and approval package."],
          states: [
            "new → claimed/in_review → missing_info/site_visit/ready_for_admin",
          ],
          gates: [
            "Recommendation required before ready-for-admin; never final approval.",
          ],
          exceptions: [
            "Integrity/variance/deficiency/inconclusive visit routes work item.",
          ],
          permissions: ["Lender Operations within organization/assignment."],
          upstream: ["WF-MIL-001.BLDR.01", "WF-MIL-001.INSP.01"],
          downstream: ["WF-MIL-001.LADM.01"],
          handoffs: [
            "WF-MIL-001.HO-01",
            "WF-MIL-001.HO-02",
            "WF-MIL-001.HO-03",
            "WF-MIL-001.HO-04",
            "WF-MIL-001.HO-05",
            "WF-MIL-001.HO-06",
          ],
          events: ["review claimed/recommendation/info/visit/ready events"],
          success: ["Complete decision package reaches authority."],
          failure: [
            "Explicit missing-info/visit/rejection recommendation remains open.",
          ],
          sources: [`${src.core} §18.3.5–18.3.8`],
        })
      ),
      segment(
        "WF-MIL-001.INSP.01",
        "Perform and submit site visit",
        "INSP",
        "Field inspection",
        common({
          purpose:
            "Verify target milestone work and submit structured evidence/recommendation, including offline-safe capture.",
          trigger: "Visit is assigned/claimed and scheduled/token is valid.",
          steps: [
            "Review scope/site/prior evidence/checklist.",
            "Travel/open mobile flow.",
            "Capture photos/video/notes/location.",
            "Complete structured report/recommendation.",
            "Save offline if needed and sync.",
            "Submit.",
          ],
          inputs: ["Assignment/token, site/scope/checklist/prior evidence."],
          outputs: ["Site Visit Report/evidence/geofence/recommendation."],
          states: [
            "requested → assigned/claimed → in_progress/offline_draft → submitted; rework/cancel as routed",
          ],
          gates: ["Target-scoped token/assignment; required report fields."],
          exceptions: [
            "Expired token, offline sync, location unavailable/failed, inconclusive/rework, cancellation.",
          ],
          permissions: [
            "Target visit only; recommendation not final approval.",
          ],
          upstream: ["WF-MIL-001.LOPS.01"],
          downstream: ["WF-MIL-001.LOPS.01", "WF-MIL-001.LADM.01"],
          handoffs: ["WF-MIL-001.HO-04", "WF-MIL-001.HO-05"],
          events: ["visit claimed/started/offline/submitted/location events"],
          success: ["Reviewable submitted report."],
          failure: [
            "Rework/incomplete/cancelled state; captured evidence retained.",
          ],
          sources: [`${src.core} §11.5, §18.3.7`, `${src.evidenceVisit}`],
        })
      ),
      segment(
        "WF-MIL-001.LADM.01",
        "Make final milestone decision and overrides",
        "LADM",
        "Milestone approval",
        common({
          purpose:
            "Resolve the formal completion decision with all evidence, recommendations, visits, warnings, and override controls.",
          trigger:
            "Admin Approval Package is ready or additional authority action is requested.",
          steps: [
            "Review all artifacts/variance/warnings.",
            "Accept/reject location-unverified evidence when authorized.",
            "Approve, reject, request info, reopen visit, or waive visit with reason.",
            "Verify work-order closure/routing and eligibility recompute.",
          ],
          inputs: ["Admin Approval Package and override reason."],
          outputs: ["Final milestone decision and draw-eligibility update."],
          states: [
            "ready_for_decision → approved/rejected/more_info/site_visit/revision_required",
          ],
          gates: [
            "Only Lender Admin; policy gate or explicit reasoned override.",
          ],
          exceptions: [
            "Insufficient evidence, failed geofence, incomplete visit, variance.",
          ],
          permissions: ["Lender Admin/Principal Broker final authority."],
          upstream: ["WF-MIL-001.LOPS.01"],
          downstream: ["WF-DRW-001", "WF-BUD-001"],
          handoffs: ["WF-MIL-001.HO-06", "WF-MIL-001.HO-07"],
          events: [
            "milestone approved/rejected/revision; override audit; notification",
          ],
          success: ["Audited decision and correct eligibility."],
          failure: ["Routed actionable state, not hidden comment/chat."],
          sources: [`${src.core} §18.3.8`],
        })
      ),
      segment(
        "WF-MIL-001.SYS.01",
        "Orchestrate completion work and preserve evidence",
        "SYS",
        "Verification orchestration",
        common({
          purpose:
            "Validate packages, manage one active work order, attempt geofence, route queues, preserve versions, and recompute eligibility.",
          trigger: "Completion/review/visit/admin mutation or sync occurs.",
          steps: [
            "Validate/authorize.",
            "Persist versioned package/assets/geofence.",
            "Create/route work orders.",
            "Write audit/outbox/notifications.",
            "Close/reroute on decision.",
            "Recompute draw availability/readiness on approval.",
          ],
          inputs: ["All workflow commands/artifacts."],
          outputs: ["Packages/work orders/states/events/eligibility."],
          states: ["Per milestone/site-visit/work-order models."],
          gates: [
            "Geofence failure never deletes evidence; one active review work order; legal transitions.",
          ],
          exceptions: [
            "Duplicate submit, failed sync, missing policy, illegal transition.",
          ],
          permissions: ["System under scoped authorized commands."],
          upstream: ["WF-MIL-001.BLDR.01"],
          downstream: ["WF-DRW-001", "WF-COM-001"],
          handoffs: [],
          events: ["audit/outbox/notification/webhook candidates"],
          success: ["Traceable end-to-end verification state."],
          failure: ["Actionable exception without data loss."],
          sources: [`${src.core} §17–§18.3`],
        })
      ),
    ],
  },
];
