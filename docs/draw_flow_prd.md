# DrawFlow PRD

**Product:** DrawFlow  
**Module:** FairLend Construction Draw Management  
**Document type:** Product Requirements Document  
**Status:** Revised product draft  
**Primary audience:** Product, engineering, lender operations, builder operations, executive stakeholders, future implementation agents  
**Last updated:** May 25, 2026

**Productionization companion:** `docs/draw_flow_production_prd.md` is authoritative for the May 25 production model covering WorkOS auth, brokerage tenancy, Principal Broker/Broker/Backoffice/Builder/Contractor roles, RBAC, contractor profile/account separation, production schema, and organization/workflow management. Where this older PRD uses generic lender-side role language, the production companion defines the current target model.

---

## 1. Executive Summary

DrawFlow is a construction lending draw-management module for FairLend. It enables builder/developer borrowers and lender teams to plan construction milestones, model reimbursement-based draw schedules, verify completed work, manage site visits, approve milestones, and release loan draws through a shared operational workspace.

DrawFlow is initially a FairLend module, but it must be designed as a modular, tenant-scoped software product that can later be licensed independently. The system must support WorkOS organization scoping, role-based access control, API-first domain boundaries, and webhook-based integration with external CRMs, loan-management systems, servicing platforms, and lender operational tools.

The product is built around one central interface: the **Build Workspace**. This workspace is the shared control plane between builder leads and lender admins. It combines a milestone-card rail, Gantt-style construction roadmap, draw group bounding boxes, budget and duration estimates, dependency status, milestone evidence status, and draw release readiness. Other interfaces are subordinate operational surfaces: kanban queues for lender operations, focused evidence review screens, mobile site-visit flows, and focused approval screens for budget revisions, milestone approvals, and draw releases.

In v1, DrawFlow uses a strict reimbursement model. Builders complete work first, upload evidence, lender staff review and inspect the work where required, lender admins approve completion, and only then is the draw released. Interest begins accruing only after funds are released. Draw fees and interest rules are lender-configurable.

The core product problem is not simply “manage construction tasks.” The core product problem is: **given a construction roadmap, milestone dependencies, borrower working-capital constraints, lender draw policy, draw fees, and interest rules, determine the most economically efficient and operationally feasible draw plan, then govern the execution of that plan through evidence, inspection, approval, and reimbursement.**

---

## 2. Product Positioning

### 2.1 FairLend Module First

DrawFlow is part of the FairLend product ecosystem. It should support FairLend’s construction lending workflows, borrower/builder portals, lender admin tools, and broader financing operations.

Within FairLend, DrawFlow manages:

- construction build proposals,
- milestone budgets,
- construction roadmaps,
- reimbursement-based draw plans,
- builder proof-of-completion uploads,
- lender staff review,
- geofenced evidence capture,
- site visits,
- lender admin approvals,
- and draw release readiness.

### 2.2 Standalone Software Later

DrawFlow must also be architected so it can later be licensed as standalone software.

This requires:

- organization-level tenancy,
- WorkOS AuthKit / WorkOS Organizations integration,
- explicit tenant scoping on all domain entities,
- API-first domain boundaries,
- external ID mapping for integrated systems,
- webhook registry for outbound events,
- clear separation between FairLend-specific workflows and generic construction-lending workflows,
- and deployability as a lender-facing SaaS product independent of the broader FairLend platform.

### 2.3 Product Category

DrawFlow is best understood as a specialized construction lending operating system for draw management.

It combines elements of:

- construction loan administration,
- milestone-based project planning,
- draw schedule optimization,
- evidence and inspection workflow,
- lender operations queue management,
- reimbursement governance,
- and borrower/lender collaboration.

It should not become a generic project-management tool. It should remain opinionated around construction lending economics and lender-controlled reimbursement workflows.

---

## 3. Problem Statement

Construction draw management is typically coordinated through spreadsheets, email threads, PDFs, phone calls, site visit notes, photo dumps, lender checklists, and manually maintained draw schedules. This creates fragmentation across planning, evidence, approval, and capital release.

Builders need to understand:

- what work must happen next,
- which milestones are blocked,
- how much work they can afford to complete before reimbursement,
- when the next draw will become available,
- what evidence is required,
- and how draw timing affects financing cost.

Lenders need to understand:

- whether the borrower’s proposed budget is credible,
- whether milestone sequencing is operationally realistic,
- whether draw groupings are economically rational,
- whether completed work has been properly evidenced,
- whether a site visit is required,
- whether approval can be defended later,
- and whether funds should be released.

The core difficulty is that construction lending has two coupled plans:

1. **The construction plan** — what work happens, in what order, with what dependencies, costs, and durations.
2. **The capital release plan** — when completed work becomes eligible for reimbursement, how milestones are bundled into draws, and how those decisions affect fees, interest, cash-flow pressure, and project feasibility.

DrawFlow makes these two plans explicit, interactive, auditable, and optimizable.

---

## 4. Product Goals

### 4.1 Primary Goals

1. Provide a structured self-serve Build Proposal flow for builder/developer borrowers.
2. Produce an explicit Construction Roadmap from a milestone template, borrower inputs, cost estimates, duration estimates, and dependencies.
3. Generate reimbursement-based Draw Plans that optimize for total financing cost while respecting dependencies, lender policy, inspection/review assumptions, and borrower working-capital constraints.
4. Create a shared Build Workspace where builder leads and lender admins can collaborate around the live construction roadmap and draw plan.
5. Allow builder leads and builder staff to update milestone progress, submit proof of completed work, and provide completion reports.
6. Support geofenced proof-of-completion upload so the system can verify whether the submitter is physically at or near the build site at upload time.
7. Provide lender staff with kanban-based operational queues for evidence review, site visits, missing information, and ready-for-admin work.
8. Preserve separation of duties: lender staff may review, report, inspect, and recommend; lender admin has final approval authority.
9. Record auditable evidence for proposal submission, budget changes, milestone updates, geofence verification, site visits, admin overrides, milestone approvals, and draw releases.
10. Support WorkOS-based organization scoping and RBAC from the beginning.

### 4.2 Secondary Goals

1. Reduce draw cycle time.
2. Reduce missing or low-quality evidence.
3. Reduce manual spreadsheet-based draw planning.
4. Improve builder understanding of reimbursement timing and cash-flow exposure.
5. Improve lender visibility into budget variance, schedule delays, and dependency risk.
6. Provide a future-ready integration layer for external CRMs, LMS systems, servicing platforms, and lender operations tooling.

---

## 5. Non-Goals

DrawFlow v1 is not intended to be:

1. A complete construction project-management suite.
2. A contractor/vendor marketplace.
3. A procurement platform.
4. A general-purpose CRM.
5. A full loan origination system for all loan types.
6. A full servicing platform.
7. A payment processor.
8. A general ledger or accounting system.
9. A legal document-generation platform.
10. A municipal permit-management integration layer.
11. A full appraisal-management system.
12. A full contractor scheduling/resource-leveling system.
13. A homeowner renovation app for small projects.

DrawFlow may integrate with systems in these categories, but they are not the core product in v1.

---

## 6. Target Users and Personas

## 6.1 Builder / Developer Principal

A professional builder, developer, or sophisticated custom-home borrower responsible for managing a ground-up construction project financed through a construction loan.

For v1, this is the primary borrower persona.

Responsibilities:

- submit Build Proposal,
- provide permits and supporting documents,
- define or edit the construction budget,
- define or edit milestone estimates,
- maintain construction progress,
- submit milestone completion evidence,
- understand reimbursement timing,
- manage working-capital exposure.

Needs:

- clear milestone and draw roadmap,
- low-friction evidence upload,
- visibility into upcoming reimbursements,
- ability to model cost/time assumptions,
- understanding of how cash on hand affects feasible sequencing,
- fewer lender back-and-forth cycles.

## 6.2 Builder Staff

Employees, project coordinators, site supervisors, or trusted staff working under the builder/developer.

Responsibilities:

- update milestone progress,
- upload photos/documents,
- submit proof-of-work packages where permitted,
- provide field reports,
- support evidence collection.

Needs:

- mobile-first interface,
- direct camera upload,
- geofenced proof capture,
- offline-friendly field capture,
- restricted access that does not expose unnecessary loan economics.

Open policy configuration: builder staff may either submit final milestone completion packages or prepare them for builder principal submission, depending on organization settings.

## 6.3 Lender Admin

A lender-side user with final authority over proposal approval, budget acceptance, milestone completion approval, draw release approval, site-visit override, and lender policy configuration.

Responsibilities:

- review Build Proposals,
- approve/reject/request changes,
- review roadmaps and draw plans,
- approve or reject milestone completion,
- approve or reject draw release,
- override staff recommendations with audited reason,
- configure draw/interest/evidence policies,
- maintain operational control and audit defensibility.

Needs:

- dense control-plane workspace,
- clear milestone and draw status,
- risk and warning visibility,
- evidence review summary,
- final approval controls,
- audit trail.

## 6.4 Lender Staff / Operations Analyst

A lender-side operations user who reviews borrower submissions, evaluates evidence, requests missing information, requests or performs site visits, and submits recommendations to lender admins.

Responsibilities:

- review proof-of-completion evidence,
- compare actual costs to approved budget,
- request missing information,
- request site visits,
- submit review reports,
- make recommendations.

Cannot in v1:

- final approve milestone completion,
- final approve draw release.

Needs:

- kanban work queue,
- review checklist,
- evidence package viewer,
- report/recommendation workflow,
- easy escalation to admin.

## 6.5 Site Visit Staff / Inspector

A field user, internal or external, responsible for visiting the build site, verifying milestone completion, capturing evidence, and submitting a structured report.

Responsibilities:

- claim or receive site visit assignment,
- inspect target milestones,
- capture photos/videos/notes,
- submit structured report,
- provide recommendation.

Needs:

- mobile/tablet optimized workflow,
- offline support,
- camera capture,
- geofence/location verification where permitted,
- clear checklist of required evidence.

---

## 7. Core Product Concepts

## 7.1 Build

A Build is a specific construction project financed by a construction loan.

A Build includes:

- tenant / organization scope,
- borrower/builder identity,
- project name,
- site location,
- linked Loan,
- Build Proposal,
- approved Budget,
- Construction Roadmap,
- Draw Plan,
- milestone records,
- evidence packages,
- site visits,
- approval history,
- audit trail,
- external integration references.

The Build is the top-level operational object in DrawFlow.

## 7.2 Loan

A Loan is the credit facility or credit pool available to the borrower for the Build.

A Loan includes:

- approved principal / credit limit,
- interest configuration,
- draw fee configuration,
- lender draw policy,
- drawn balance,
- available undrawn capacity,
- released draw history,
- repayment / interest reporting references,
- external loan ID mapping.

In v1, draws are reimbursement-only. The Loan provides reimbursement capacity after approved work completion.

## 7.3 Build Proposal

A Build Proposal is the borrower-created application package for a construction project.

A Build Proposal includes:

- borrower/builder details,
- build site details,
- permits and supporting documents,
- requested loan amount or construction budget,
- selected milestone template,
- edited milestones,
- proposed dependency graph,
- borrower working-capital input,
- generated Draw Plan options,
- selected proposed plan,
- warnings and anomalies,
- submission history,
- lender review decision.

A Build Proposal becomes an active Build only after lender admin approval.

## 7.4 Budget

A Budget is the approved financial plan for the Build.

A Budget includes:

- total expected construction cost,
- milestone-level estimated costs,
- optional subtask-level cost breakdowns,
- contingency assumptions where enabled,
- budget version,
- approval status,
- variance thresholds,
- revision history.

Budgets must be versioned, not overwritten. Any material revision must preserve previous approved versions for audit.

## 7.5 Construction Roadmap

The Construction Roadmap is the milestone-based plan for how the Build is expected to progress.

It includes:

- milestone list,
- soft sequence order,
- hard dependencies,
- soft dependencies,
- milestone durations,
- parallel work lanes,
- status,
- blockers,
- warnings,
- draw group membership.

The Construction Roadmap is not merely a visual Gantt chart. It is the domain model used by the optimizer and approval workflows.

## 7.6 Milestone

A Milestone is a meaningful vertical of construction work, such as site work, foundation, framing, roofing, plumbing, electrical, HVAC, insulation, drywall, finishing, or landscaping.

A Milestone includes:

- milestone ID,
- milestone name,
- milestone code,
- draw group membership,
- estimated cost,
- actual cost,
- estimated duration,
- actual start/end dates,
- current status,
- dependencies,
- blocking count,
- blocked-by count,
- warnings,
- required evidence checklist,
- submitted evidence,
- review state,
- approval state.

Milestones are the primary units of roadmap planning and draw eligibility in v1.

## 7.7 Subtask

A Subtask is an optional lower-level work unit inside a Milestone.

Subtasks may be used for:

- internal builder progress tracking,
- evidence checklist decomposition,
- partial completion reporting,
- future partial draw support.

For MVP, milestone-level completion is the default draw eligibility model. Subtask-based partial reimbursement is a lender-configurable future/stretched capability unless explicitly pulled into v1.

## 7.8 Draw

A Draw is a reimbursement tranche released to the borrower after completed work has been verified and approved.

A Draw includes:

- draw ID,
- associated Build,
- associated Loan,
- Draw Release Work Order key,
- immutable Milestone and Draw Group source allocations,
- planned amount,
- requested reimbursement amount,
- approved reimbursement amount,
- draw fee,
- status,
- evidence package references,
- site visit status,
- approval history,
- release date,
- interest accrual start date.

In v1, a Draw cannot be released before the relevant work is completed and approved.

## 7.9 Draw Group

A Draw Group is the planned grouping of milestones that are expected to be reimbursed together through a Draw.

Draw Groups are visualized in the Build Workspace as bounded regions over the Gantt schedule.

A Draw Group includes:

- draw group ID,
- included milestones,
- planned reimbursement amount,
- expected eligibility date,
- planned release date,
- fee estimate,
- interest estimate,
- status,
- warnings.

## 7.10 Borrower Starting Cash

Borrower Starting Cash is the borrower's own cash available at the start of the build, before any reimbursement draws are released.

This is a builder-provided opening balance in the build capital model. It is not a draw, a loan advance, a lender policy limit, or a recurring allowance that resets after each reimbursement.

Because v1 is reimbursement-based, the borrower must use this cash to fund eligible work before reimbursement. Released reimbursements replenish the build's cash balance. Additional borrower cash infusions are modeled as separate capital events.

The optimizer derives **Required Working Capital** (also called **Peak Unreimbursed Exposure**) from the schedule and draw plan. That derived metric is the greatest amount of borrower cash tied up at any point before eligible reimbursements are released. A plan is capital-feasible only when the projected cash ledger remains above the configured minimum reserve.

Borrower Starting Cash affects:

- feasible milestone sequencing,
- feasible parallelization,
- draw group size,
- project stall risk,
- capital-constrained plan generation,
- and schedule feasibility.

Borrower Starting Cash, Required Working Capital, and Lender Draw Policy Limit are three distinct concepts and must be stored, calculated, and displayed separately.

## 7.11 Lender Draw Policy Limit

The Lender Draw Policy Limit is a lender-controlled policy constraint.

It may include:

- maximum draw amount,
- minimum draw amount,
- maximum number of draws,
- required milestone approval rules,
- required site visit rules,
- partial draw policy,
- draw fee policy.

This is distinct from Borrower Starting Cash and derived Required Working Capital.

## 7.12 Evidence Package

An Evidence Package is the collection of borrower/staff-submitted proof used to support milestone completion, site visit verification, or draw release.

Evidence may include:

- photos,
- videos,
- PDFs,
- invoices,
- receipts,
- permits,
- inspection records,
- structured reports,
- notes,
- geofence verification result,
- timestamp,
- uploader identity,
- device/source metadata where available and permitted.

## 7.13 Site Visit

A Site Visit is a lender-controlled inspection workflow used to verify completed work.

A Site Visit includes:

- assigned staff/inspector,
- target Build,
- target milestone(s),
- required evidence checklist,
- site notes,
- captured proof,
- geofence/location verification where permitted,
- report,
- recommendation,
- submission timestamp,
- admin review state.

---

## 8. Core Business Rules

## 8.1 Reimbursement-Only Draw Model

In v1, all draws are reimbursement-based.

Rules:

- Builder completes work first.
- Builder uploads proof of completed work.
- Lender staff reviews evidence.
- Site visit occurs where required or requested.
- Lender admin approves milestone completion.
- Each approved Milestone contributes its approved reimbursement amount to an organization-scoped availability source bucket.
- Builder may request a partial or full reimbursement from the pooled available balance.
- System creates one Draw Release Work Order for the request and deterministically attributes its exact amount across approved Milestone / Draw Group source buckets.
- Lender operations reviews the work order and submits a recommendation.
- Lender admin approves draw release.
- Funds are released after approval.
- Interest begins only after release.

No v1 workflow should allow proactive advance funding before work completion. A partial draw means a partial request against fully approved Milestone value; it never means reimbursement for partially completed or unapproved work.

## 8.2 Interest Accrual

Interest accrual begins only after a draw is released.

The interest model is lender-configurable.

Configuration may include:

- annual rate,
- day-count convention,
- accrual frequency,
- compounding/capitalization rules,
- interest-only calculation method,
- reporting period,
- lender-specific rounding rules.

The product must display interest estimates for planning purposes and must clearly distinguish estimates from actual accounting/servicing values if an external servicing/ledger system is authoritative.

## 8.3 Draw Fee

Draw fee amount and treatment are lender-configurable.

Possible treatments:

- deducted from draw proceeds,
- billed separately to borrower,
- added to loan balance,
- recorded as separate receivable,
- waived by admin override.

The optimizer must include draw fees in plan comparisons.

## 8.4 Lender Draw Policy

Lender draw policy may define:

- maximum draw amount,
- minimum draw amount,
- whether partial draws are allowed,
- required evidence by milestone type,
- site visit requirements,
- admin approval requirements,
- draw fee treatment,
- variance thresholds,
- override rules.

## 8.5 Borrower Cash-Flow Feasibility Constraint

Because v1 is reimbursement-only, the borrower must have enough capital to complete work before reimbursement.

The borrower cash ledger is a primary feasibility rule. It begins with Borrower Starting Cash, decreases as work is paid for, and increases only when a borrower cash infusion or an eligible reimbursement is actually released.

The optimizer must derive Required Working Capital and use the cash ledger to determine:

- which milestones can be completed before the next reimbursement,
- whether parallel work is feasible,
- whether a planned draw group is too large,
- whether the build schedule stalls,
- whether the fastest plan is executable,
- and whether the cheapest plan is feasible.

## 8.6 Milestone Dependencies

Milestones can have dependencies.

Dependency types:

1. **Hard blocker** — downstream work cannot proceed until the blocker is complete and approved.
2. **Soft dependency** — sequencing preference that affects layout and warnings but does not strictly block work.
3. **Operational preference** — construction-practical ordering preference based on ease of work, contractor flow, inspection sequencing, or reduced rework risk.

Rules:

- The dependency graph must not contain cycles.
- Hard blockers constrain plan feasibility.
- Soft dependencies influence recommendations and warnings.
- Suspicious dependencies should be flagged.
- Admin may override warnings with audited reason where policy allows.

## 8.7 Site Visit Control

Site visits may be required by lender policy, requested by staff, or required by admin.

Rules:

- Lender staff can recommend site visit required or not required.
- Lender staff can submit review reports and recommendations.
- Lender admin has final decision authority.
- Lender admin can skip or override a site visit requirement only with an audited reason.
- Site visit skip/override must preserve actor, timestamp, prior recommendation, decision, and reason.

## 8.8 Geofenced Proof-of-Completion

Direct proof-of-completion upload must support geofencing.

Rules:

- The system should verify whether the submitter is physically at or near the Build site at upload time.
- The result must be attached to the evidence record.
- Evidence should not be silently discarded if geofence verification fails.
- Failed, missing, spoof-suspected, or low-confidence verification should mark evidence as location-unverified and flag it for lender review.
- Lender admin may accept location-unverified evidence with audited reason.

Geofencing is a control signal, not the only source of truth.

## 8.9 Budget Overrun and Revision

If actual or projected costs materially exceed the approved Budget, a Budget Revision may be required.

Rules:

- Thresholds are lender-configurable.
- Budget revisions must be versioned.
- Historical budgets must remain available.
- Active draw plan may need recomputation after budget revision.
- Admin must approve material revisions.
- The system must clearly show planned vs actual variance.

Holdbacks, retainage, and formal contingency accounting are stretch goals, not MVP requirements.

---

## 9. Optimization Requirements

## 9.1 Optimization Purpose

The optimizer exists to determine feasible and economically rational construction/draw plans under reimbursement-based lending constraints.

The optimizer must not blindly parallelize every milestone that has no hard dependency. In real construction lending, parallelization is constrained by borrower working capital, draw reimbursement timing, site visit lag, lender review lag, contractor sequencing, and cost exposure.

## 9.2 Optimization Inputs

Required inputs:

- milestone cost estimates,
- milestone duration estimates,
- milestone dependencies,
- hard blockers,
- soft ordering preferences,
- borrower working-capital limit,
- loan amount / approved credit limit,
- lender draw policy limits,
- draw fee configuration,
- interest configuration,
- fixed five-calendar-day draw-unlock lag after milestone completion,
- site visit lag assumptions,
- milestone template variance thresholds,
- current actual progress for active builds.

## 9.3 Optimization Outputs

Each generated plan should output:

- milestone sequence,
- parallel work lanes,
- draw groupings,
- planned draw amounts,
- estimated draw eligibility dates,
- estimated release dates,
- expected draw fees,
- estimated interest cost,
- total estimated financing cost,
- peak unreimbursed borrower exposure,
- working-capital feasibility,
- warnings, including any auto-generated draw scheduled above cumulative
  unlocked draw availability,
- repair controls that allow an existing over-capacity forecast draw to move
  later and/or decrease in amount without requiring the intermediate schedule
  to be feasible; new draws and edits that move earlier or increase the amount
  remain subject to the unlocked-availability gate,
- plan explanation.

## 9.4 Default Recommendation: Cheapest Feasible Plan

The default recommended plan is the **Cheapest Feasible Plan**.

This plan minimizes total estimated borrower financing cost while respecting:

- milestone dependencies,
- borrower working-capital limit,
- lender draw policy,
- draw fees,
- interest rules,
- review/site-visit lag assumptions,
- and reimbursement-only release rules.

The plan should explain when it bundles milestones because the saved draw fee exceeds the incremental interest cost, and when it splits milestones because the incremental fee is cheaper than drawing a larger amount earlier.

## 9.5 Fastest Plan

The Fastest Plan minimizes expected construction timeline.

It should:

- maximize feasible parallel work,
- respect hard blockers,
- account for review/site-visit lag,
- account for borrower working-capital constraints,
- and show incremental financing cost relative to the Cheapest Feasible Plan.

A fastest plan that exceeds borrower working capital should be marked infeasible or conditionally feasible, not presented as an executable plan.

## 9.6 Capital-Constrained Plan

The Capital-Constrained Plan is not a secondary vanity mode. It is central to v1 because all draws are reimbursement-based.

This plan answers:

- How much unreimbursed capital must the builder carry?
- Which milestones can be completed before reimbursement?
- Where does the project stall if cash is insufficient?
- Which draw grouping keeps the build feasible under the builder’s cash-on-hand limit?
- What is the cost of reducing borrower capital pressure?

## 9.7 Plan Comparison

The Build Workspace and Draw Plan Comparison screen should allow users to compare:

- Cheapest Feasible Plan,
- Fastest Plan,
- Capital-Constrained Plan.

For now, all optimizer outputs are visible to both builder leads and lender admins.

The system may later support lender configuration for hiding internal-only scenarios or risk flags.

---

## 10. Core Build Workspace

## 10.1 Product Role

The Build Workspace is the core interface of DrawFlow.

It is the canonical shared workspace between builder leads and lender admins for:

- building the roadmap,
- reviewing the roadmap,
- updating progress,
- viewing dependencies,
- managing milestone estimates,
- tracking actual cost and duration,
- visualizing draw groupings,
- reviewing draw eligibility,
- coordinating evidence submission,
- understanding capital impact,
- and controlling approvals.

The interface is anchored by the product vision image: a dark, dense, productivity-oriented workspace with a left milestone-card rail and a right Gantt-style schedule containing draw group bounding boxes.

## 10.2 Layout

The Build Workspace uses a two-column layout.

### Left Column: Milestone Rail

Approximately 25 percent of the screen width.

Contains vertically stacked milestone cards.

Each milestone card should show:

- milestone name,
- milestone code,
- draw group tag such as D1/D2/D3,
- status,
- blocking count,
- blocked-by count,
- warning count,
- estimated cost,
- estimated duration,
- drag handle,
- quick actions where permissioned.

The card style should be compact, dense, and inspired by Linear-style productivity cards. Avoid noisy decorative badges. Use badges only where they communicate domain state.

### Right Column: Schedule / Gantt Roadmap

Approximately 75 percent of the screen width.

Shows:

- timeline header,
- milestone task blocks,
- parallel work lanes,
- milestone status markers,
- estimated costs on task blocks,
- draw group bounding boxes,
- draw labels and draw amounts,
- grid lines for time orientation,
- visual warnings for late/blocked/critical tasks.

Dependency arrows are not required by default. The layout, blocking counts, warnings, and detail drawers should communicate dependency state without visual clutter.

### Top Bar

Shows:

- product/module identity,
- build name,
- phase/project label,
- add milestone action,
- loan/budget/draw summary,
- role-aware primary actions.

### Bottom Status Region

Shows:

- total draw amount,
- status counts,
- milestone count,
- compact plan summary,
- warnings summary.

## 10.3 Draw Group Visualization

Draws are represented as bounded visual regions over the schedule.

Each draw group should show:

- draw ID,
- draw amount,
- included milestone region,
- eligibility status,
- warning state,
- release readiness.

The user should be able to understand at a glance:

- which milestones are included in each draw,
- when each draw may become eligible,
- which draw is blocked,
- which draw has pending evidence,
- and which draw is ready for admin release approval.

## 10.4 Core Workspace Interactions

Depending on role and state, the workspace should support:

- add milestone,
- reorder milestones,
- edit estimated cost,
- edit estimated duration,
- add/remove dependencies,
- mark dependency as hard or soft,
- move milestone between draw groups,
- split draw group,
- merge draw groups,
- view optimization impact,
- open milestone detail,
- update progress,
- upload evidence,
- submit completion report,
- review evidence,
- request more information,
- request site visit,
- submit staff recommendation,
- approve milestone,
- approve draw release,
- request budget revision.

## 10.5 Builder Lead Usage

Builder leads use the workspace to:

- understand project sequence,
- see blocked work,
- see which milestones roll into which draw,
- understand expected reimbursement timing,
- monitor working-capital exposure,
- update actual progress,
- upload proof,
- submit completion evidence,
- respond to lender requests.

## 10.6 Lender Admin Usage

Lender admins use the workspace to:

- review proposed and active roadmaps,
- inspect draw groupings,
- compare planned vs actual progress,
- detect budget variance,
- review dependency risk,
- inspect evidence status,
- review staff recommendations,
- override with audited reason,
- approve milestones,
- approve draw releases.

## 10.7 Relationship to Other Interfaces

The Build Workspace is the primary domain workspace.

Other interfaces should exist only where they support focused operational execution:

- kanban queues for lender operations,
- evidence review detail pages,
- mobile site-visit flows,
- draw release approval pages,
- budget revision review pages,
- policy configuration pages.

The product should avoid splitting roadmap, draw, evidence, and approval state into disconnected modules.

---

## 11. User Flows

## 11.1 Builder Application / Build Proposal Flow

1. Builder creates a new Build Proposal.
2. Builder enters project/build details.
3. Builder enters build site location.
4. Builder uploads required permits and documents.
5. Builder enters requested loan amount or total build budget.
6. Builder enters Borrower Starting Cash.
7. Builder selects a milestone template.
8. System generates default milestones, cost percentages, duration assumptions, and default dependencies.
9. Builder edits milestones, costs, durations, and dependencies.
10. Builder removes irrelevant milestones.
11. Builder adds milestones from autocomplete or creates custom milestones.
12. System validates dependency graph.
13. System flags abnormal costs, abnormal durations, suspicious dependencies, missing expected milestones, and infeasible working-capital assumptions.
14. System generates Draw Plan options.
15. Builder reviews Cheapest Feasible, Fastest, and Capital-Constrained plans.
16. Builder selects preferred plan or accepts system recommendation.
17. Builder submits Build Proposal.
18. Lender admin reviews and approves/rejects/requests changes.
19. Approved proposal becomes an active Build.

## 11.2 Lender Admin Proposal Review Flow

1. Admin opens proposal review queue.
2. Admin reviews builder identity and build details.
3. Admin reviews permits and documents.
4. Admin reviews Budget.
5. Admin reviews Construction Roadmap.
6. Admin reviews Draw Plan options.
7. Admin reviews borrower working-capital assumption.
8. Admin reviews warnings and infeasibility flags.
9. Admin accepts, rejects, or requests changes.
10. Admin may override warnings with audited reason.
11. Approved proposal becomes active Build.

## 11.3 Active Build Update Flow

1. Builder opens Build Workspace.
2. Builder reviews current roadmap and next milestones.
3. Builder updates milestone progress.
4. Builder adds work notes or subtasks.
5. Builder uploads photos/documents during work.
6. Builder marks milestone complete when work is finished.
7. Builder enters actual cost incurred.
8. Builder submits proof-of-completion package.
9. System performs geofence verification for direct proof upload.
10. Milestone moves to lender evidence review queue.

## 11.4 Evidence Review Flow

1. Lender staff opens kanban queue.
2. Staff selects submitted milestone evidence package.
3. Staff reviews proof, actual cost, budget variance, geofence result, and milestone context.
4. Staff chooses one of:
   - recommend approval without site visit,
   - request site visit,
   - request more information,
   - recommend rejection.
5. Staff submits review report and recommendation.
6. Admin receives milestone approval package.

## 11.5 Site Visit Flow

1. Staff or admin requests site visit.
2. Site visit appears in kanban queue.
3. Site staff claims or receives assignment.
4. Staff opens mobile/tablet site visit flow.
5. Staff views target milestone(s), site address, checklist, and prior evidence.
6. Staff captures photos/videos/notes.
7. System attempts geofence/location verification where permitted.
8. Staff submits structured site visit report.
9. If offline, report and evidence are stored locally and synced when connection returns.
10. Admin reviews report before final approval.

## 11.6 Milestone Approval and Draw Release Flow

1. Admin opens milestone approval package.
2. Admin reviews builder evidence.
3. Admin reviews geofence verification status.
4. Admin reviews staff report/recommendation.
5. Admin reviews site visit report if applicable.
6. Admin approves or rejects milestone completion.
7. Approved Milestone value enters the pooled reimbursement balance with its Draw Group source attribution.
8. Builder submits a partial or full request; system creates the Draw Release Work Order and deterministic allocations.
9. Lender operations reviews the request and submits it for admin decision.
10. Admin opens the `ready_for_admin` Draw Release Work Order.
11. Admin reviews amount, allocations, fee treatment, loan availability, and interest implications.
12. Admin approves the work order for release.
13. System records draw release, draw fee, and interest accrual start date.
14. Webhook events are emitted where configured.

## 11.7 Budget Revision Flow

1. Actual or projected cost variance exceeds configured threshold, or builder manually requests revision.
2. System flags Budget Revision required or recommended.
3. Builder submits revised milestone costs/durations and explanation.
4. System recomputes draw plan impact.
5. Admin reviews variance, revised budget, and updated draw plan.
6. Admin approves/rejects/requests changes.
7. Approved revision creates a new Budget version.
8. Active Build Workspace reflects new approved version while preserving historical plan.

---

## 12. Screens and Interfaces

## 12.1 Core Shared Interface

### Build Workspace

The central screen for builder leads and lender admins.

Must include:

- milestone card rail,
- Gantt-style schedule,
- draw group bounding boxes,
- milestone status,
- draw status,
- budget/time estimates,
- actual progress,
- warnings,
- role-specific actions.

## 12.2 Builder Interfaces

1. Build Proposal Start.
2. Permit and Document Upload.
3. Construction Roadmap Wizard.
4. Draw Plan Comparison.
5. Proposal Review and Submit.
6. Active Build Workspace.
7. Milestone Detail / Completion Submission.
8. Mobile Proof Upload.
9. Draw Status View.
10. Budget Revision Request.

## 12.3 Lender Admin Interfaces

1. Proposal Review Queue.
2. Proposal Review Detail.
3. Active Build Workspace.
4. Milestone Approval Detail.
5. Draw Release Approval.
6. Budget Revision Review.
7. Policy Configuration.
8. Audit History.

## 12.4 Lender Staff Interfaces

1. Operations Kanban.
2. Evidence Review Detail.
3. Missing Information Request.
4. Site Visit Request.
5. Staff Recommendation Form.

## 12.5 Site Visit Interfaces

1. Site Visit Kanban / Assignment Queue.
2. Mobile Site Visit Detail.
3. Camera Capture Flow.
4. Offline Draft Report.
5. Site Visit Submission Confirmation.

---

## 13. Functional Requirements

## 13.1 Multi-Tenancy and Organization Scoping

- Every Build, Loan, Budget, Milestone, Draw, Evidence Package, Site Visit, Policy, and Audit Event must be scoped to an organization/tenant.
- WorkOS Organizations must be supported for tenant membership and role assignment.
- Users may belong to multiple organizations.
- Cross-tenant data access must be impossible through normal application paths.
- External API keys/webhook configs must be tenant-scoped.

## 13.2 Proposal Intake

- Builder can create Build Proposal.
- Builder can enter build site location.
- Builder can upload required permits/documents.
- Builder can select milestone template.
- Builder can enter Borrower Starting Cash.
- Builder can edit milestone cost/duration.
- Builder can edit dependencies.
- Builder can submit proposal.
- Admin can approve/reject/request changes.

## 13.3 Milestone Templates

- Templates include default milestones.
- Templates include expected cost percentages.
- Templates include expected duration percentages.
- Templates include default dependency patterns.
- Templates support autocomplete milestone creation.
- Templates allow custom milestones.
- Deviations are flagged.

## 13.4 Dependency Management

- Users can create dependencies between milestones.
- Dependencies can be hard or soft.
- System prevents dependency cycles.
- System displays blocked-by and blocking counts.
- System flags suspicious dependencies.
- Hard blockers constrain scheduling and draw eligibility.

## 13.5 Draw Planning

- System generates draw groupings.
- System respects lender draw policy.
- System respects borrower working-capital limit.
- System estimates fees and interest.
- System compares Cheapest Feasible, Fastest, and Capital-Constrained plans.
- System shows plan explanations.
- When an optimizer preset is applied, admin can override that optional preset metadata with an audited reason.

## 13.6 Milestone Progress

- Builder can update milestone status.
- Builder can add notes/subtasks.
- Builder can upload evidence.
- Builder can mark milestone complete.
- Builder can enter actual cost.
- Builder can submit completion package.
- System flags cost/time variance.

## 13.7 Evidence Upload

- Users can upload photos, videos, PDFs, and documents.
- Mobile users can upload directly from camera.
- Proof-of-completion upload must support geofence verification.
- Evidence records must store geofence status.
- Location-unverified evidence must be flagged.
- Evidence must link to Build, Milestone, Draw, Site Visit, uploader, timestamp, and review state.

## 13.8 Site Visits

- Staff/admin can request site visit.
- Site visit appears in kanban queue.
- Site staff can claim or receive assignment.
- Mobile site visit flow supports camera capture.
- Offline save/sync is required.
- Staff submits report and recommendation.
- Admin reviews before final approval.

## 13.9 Milestone Approval

- Lender staff can recommend.
- Lender admin final approves/rejects.
- Admin can request more information.
- Admin can override staff/site visit recommendation with reason.
- Approval history is audited.

## 13.10 Draw Release

- Draw cannot be released until required milestones are approved.
- Admin approves release.
- System records draw fee treatment.
- System records release date.
- System records interest accrual start date.
- System emits configured webhook events.

## 13.11 Offline Sync

Offline sync is required for field workflows.

Minimum supported offline actions:

- open assigned site visit,
- view cached site/milestone details,
- capture photos,
- capture location verification attempt/status where permitted,
- add notes,
- fill checklist,
- save draft report locally,
- sync report/evidence when online.

Full offline editing of the Build Workspace is not required for MVP.

---

## 14. RBAC and Permissions

## 14.1 Roles

Minimum roles:

- Builder Principal / Builder Lead.
- Builder Staff.
- Lender Staff.
- Site Visit Staff / Inspector.
- Lender Admin.
- Organization Admin.

## 14.2 Permission Principles

- Builder users can manage their own build progress and evidence.
- Lender staff can review, report, inspect, and recommend.
- Lender admin has final approval authority.
- Policy configuration is admin-only.
- Sensitive override actions require audited reason.
- Tenant boundaries must be enforced everywhere.

## 14.3 Permissions Matrix

| Capability | Builder Lead | Builder Staff | Lender Staff | Site Visit Staff | Lender Admin |
|---|---:|---:|---:|---:|---:|
| Create Build Proposal | Yes | Configurable | No | No | Yes |
| Upload permits/docs | Yes | Yes | Yes | No | Yes |
| Enter working-capital limit | Yes | Configurable | No | No | Yes |
| Edit proposal milestones | Yes | Configurable | No | No | Yes |
| Edit approved budget | No | No | No | No | Via revision |
| Update milestone progress | Yes | Yes | No | No | Yes |
| Upload evidence | Yes | Yes | Yes | Yes | Yes |
| Submit completion package | Yes | Configurable | No | No | Yes |
| Review evidence | No | No | Yes | Optional | Yes |
| Request more information | No | No | Yes | No | Yes |
| Request site visit | No | No | Yes | No | Yes |
| Complete site visit | No | No | Optional | Yes | Yes |
| Submit recommendation | No | No | Yes | Yes | Yes |
| Final approve milestone | No | No | No | No | Yes |
| Final approve draw release | No | No | No | No | Yes |
| Override site visit requirement | No | No | No | No | Yes, audited |
| Configure policy | No | No | No | No | Yes |

---

## 15. Status Models

## 15.1 Milestone Statuses

Recommended milestone statuses:

1. Draft.
2. Planned.
3. Blocked.
4. Ready.
5. In Progress — On Schedule.
6. In Progress — Behind Schedule.
7. Critical Issue.
8. Complete Pending Submission.
9. Submitted for Review.
10. More Information Requested.
11. Site Visit Requested.
12. Site Visit Complete.
13. Recommended for Approval.
14. Recommended for Rejection.
15. Approved.
16. Rejected.
17. Revision Required.

## 15.2 Draw Statuses

Canonical Draw Release Work Order statuses:

1. `requested` — builder submitted; availability is reserved.
2. `in_review` — lender operations is reviewing evidence, attribution, policy, and availability.
3. `ready_for_admin` — operations recommendation is complete.
4. `approved_for_release` — lender admin approved the final release decision.
5. `released` — funds were released; interest starts according to lender configuration.
6. `rejected` — lender admin rejected the work order; its allocations no longer reserve availability.
7. `withdrawn` — builder withdrew before review; its allocations no longer reserve availability.

`planned` belongs to mutable draw schedule forecasts, not the Draw Release Work Order lifecycle.

## 15.3 Site Visit Statuses

Recommended site visit statuses:

1. Requested.
2. Assigned.
3. Claimed.
4. In Progress.
5. Draft Saved Offline.
6. Submitted.
7. Accepted by Admin.
8. Rework Requested.
9. Cancelled.

## 15.4 Budget Revision Statuses

Recommended budget revision statuses:

1. Not Required.
2. Recommended.
3. Required.
4. Draft.
5. Submitted.
6. Under Review.
7. Approved.
8. Rejected.
9. Superseded.

---

## 16. API and Webhook Requirements

## 16.1 API-First Requirement

DrawFlow must expose a comprehensive tenant-scoped API so it can integrate with FairLend systems and later operate as standalone licensed software.

API capabilities should eventually include:

- create/read/update Builds,
- create/read/update Build Proposals,
- read Loans and draw status,
- create/read/update Budgets,
- create/read/update Milestones,
- update milestone progress,
- upload evidence metadata,
- create/read Site Visits,
- read Draw Plans,
- read Draw status,
- create Budget Revision requests,
- read audit events,
- manage external ID mappings.

Write operations that affect approval state must enforce RBAC and audit rules.

## 16.2 External ID Mapping

The system must support external IDs for integration with:

- CRM records,
- loan-management systems,
- servicing systems,
- document systems,
- inspection systems,
- FairLend internal modules.

## 16.3 Webhook Registry

DrawFlow must support tenant-configurable webhooks.

Minimum webhook events:

- build.created
- build.activated
- proposal.created
- proposal.submitted
- proposal.approved
- proposal.rejected
- proposal.changes_requested
- budget.revision_requested
- budget.revision_submitted
- budget.revision_approved
- budget.revision_rejected
- milestone.created
- milestone.updated
- milestone.submitted_for_review
- milestone.more_information_requested
- milestone.site_visit_requested
- milestone.recommended_for_approval
- milestone.recommended_for_rejection
- milestone.approved
- milestone.rejected
- evidence.uploaded
- evidence.geofence_verified
- evidence.geofence_failed
- site_visit.requested
- site_visit.assigned
- site_visit.submitted
- site_visit.accepted
- draw.planned
- draw.ready_for_release
- draw.approved_for_release
- draw.released
- draw.replanned

Webhook delivery should include retry behavior, signing secrets, tenant scoping, and delivery logs in later implementation specs.

---

## 17. Audit and Compliance Requirements

The system must preserve an audit trail for:

- proposal creation,
- document upload,
- budget creation,
- budget version changes,
- milestone edits,
- dependency changes,
- working-capital input changes,
- optimizer plan generation,
- optional optimizer preset selection,
- admin overrides,
- evidence upload,
- geofence verification result,
- staff review,
- site visit report,
- recommendation submission,
- milestone approval/rejection,
- site visit skip/override,
- draw release approval,
- draw release event,
- interest accrual start event,
- webhook delivery where relevant.

Each material audit event should capture:

- tenant/org,
- actor,
- role,
- timestamp,
- entity type,
- entity ID,
- previous state,
- new state,
- reason/comment where applicable,
- linked evidence/documents,
- visible warnings at decision time.

---

## 18. Notifications and Work Queues

## 18.1 Notifications

The system should notify relevant users when:

- proposal is submitted,
- proposal is approved/rejected/changes requested,
- milestone is submitted for review,
- more information is requested,
- site visit is requested,
- site visit is assigned,
- site visit is completed,
- milestone is approved/rejected,
- draw becomes ready for release,
- draw is released,
- budget variance threshold is breached,
- budget revision is required,
- geofence verification fails.

## 18.2 Lender Operations Kanban

Lender operations should be kanban-based.

Recommended columns:

- New Evidence Review.
- Needs More Information.
- Site Visit Required.
- Site Visit In Progress.
- Ready for Admin.
- Completed.

The kanban is not the primary Build Workspace. It is an operations queue that routes users into focused review/action screens.

---

## 18.3 Kanban-Based Operational Workflows

### 18.3.1 Purpose

The kanban views are the lender operations execution layer. They are not the canonical Build planning surface; the Build Workspace remains the canonical shared context for the Build, Roadmap, Milestones, Draw Groups, budget, and approval state.

Kanban boards exist to move operational work through review, inspection, recommendation, admin approval, draw release, and borrower receipt confirmation.

The core operational flow is:

1. Builder marks a milestone complete.
2. Builder uploads proof of completed work.
3. System creates lender work order(s).
4. Lender staff pick up work from kanban board.
5. Staff complete review or site visit and upload their own proof/report.
6. Staff submit recommendation.
7. Lender admin reviews the complete approval package.
8. Admin approves milestone completion.
9. Approved Milestone value enters the pooled reimbursement balance with its Draw Group attribution.
10. Builder submits a partial or full reimbursement request.
11. System creates the Draw Release Work Order and exact source allocations.
12. Lender operations reviews the work order and submits a recommendation.
13. Lender admin approves and releases the draw.
14. Builder confirms receipt of funds.
15. System closes the draw workflow or routes exceptions if receipt is disputed/missing.

### 18.3.2 Operational Objects

#### Milestone Completion Package

Created when a builder submits a completed milestone for review.

Contains:

- Build ID.
- Milestone ID.
- Draw Group ID.
- Builder-submitted actual cost.
- Builder completion report.
- Builder-uploaded evidence.
- Geofence verification result.
- Timestamp.
- Uploader identity.
- Budget variance.
- Required evidence checklist status.

#### Evidence Review Work Order

Created automatically after milestone completion submission.

Owned by lender operations.

Purpose:

- review builder proof,
- verify evidence completeness,
- inspect actual-vs-budget variance,
- evaluate geofence status,
- decide whether site visit is required,
- submit staff recommendation.

#### Site Visit Work Order

Created when staff/admin requires physical inspection.

Owned by site visit staff or inspector.

Purpose:

- visit build site,
- verify milestone completion,
- capture site evidence,
- complete structured inspection report,
- submit recommendation.

#### Admin Approval Package

Created once the staff review path is complete.

Contains:

- original builder evidence,
- geofence status,
- staff review report,
- staff recommendation,
- site visit report if applicable,
- budget variance,
- warning flags,
- prior admin overrides,
- final approve/reject controls.

#### Draw Release Work Order

Created when a builder submits a reimbursement request against available value from one or more fully approved Milestones.

Reviewed by lender operations; final decision and release are owned by lender admin.

Purpose:

- preserve the builder's exact requested amount,
- preserve deterministic source allocations back to approved Milestones and Draw Groups,
- review draw amount,
- review draw fee treatment,
- verify loan availability,
- confirm included milestones,
- approve release,
- record release event.

#### Draw Receipt Confirmation

Created after draw release.

Owned by builder lead, with lender visibility.

Purpose:

- builder confirms funds received,
- builder reports non-receipt or discrepancy,
- lender tracks operational settlement completion.

Builder confirmation is an operational acknowledgement. The authoritative financial settlement state should come from the payment/servicing/ledger system where integrated.

### 18.3.3 Kanban Board Types

#### Lender Evidence Review Board

Used by lender operations staff.

Recommended columns:

1. **New Submission**
   - Milestone completion package was submitted by builder.
   - Evidence Review Work Order has been created.
   - No staff owner yet.

2. **Claimed / In Review**
   - Staff member has picked up the work order.
   - Staff is reviewing evidence, geofence status, budget variance, and completion report.

3. **Needs More Information**
   - Staff requested additional evidence or clarification from builder.
   - Builder action is required.

4. **Site Visit Required**
   - Staff determined physical verification is required.
   - Site Visit Work Order has been created.

5. **Ready for Admin**
   - Staff review is complete.
   - Staff has submitted recommendation.
   - No further staff action is required.

6. **Closed**
   - Admin has made final milestone decision or work order was cancelled/superseded.

#### Site Visit Board

Used by site visit staff / inspectors.

Recommended columns:

1. **Requested**
   - Site Visit Work Order exists.
   - No assigned/claimed owner yet.

2. **Assigned / Claimed**
   - Inspector or staff member owns the site visit.

3. **Scheduled**
   - Site visit has planned date/time where scheduling is used.

4. **In Progress**
   - Staff is performing field workflow.
   - Mobile/offline capture may be active.

5. **Submitted**
   - Site visit report and proof have been uploaded or synced.

6. **Needs Rework**
   - Admin/staff found report incomplete.
   - Inspector must amend or resubmit.

7. **Accepted / Closed**
   - Site visit report is accepted into the Admin Approval Package.

#### Admin Approval Board

Used by lender admins.

Recommended columns:

1. **Ready for Milestone Decision**
   - Staff recommendation is complete.
   - Site visit path, if required, is complete.
   - Admin can approve/reject milestone completion.

2. **Admin Reviewing**
   - Admin has opened or claimed the approval package.

3. **Changes Requested**
   - Admin requires more builder evidence, staff review, or site visit rework.

4. **Milestone Approved**
   - Admin approved milestone completion.
   - System adds the Milestone's approved amount to the attributed reimbursement availability ledger.

5. **Milestone Rejected**
   - Admin rejected completion claim.
   - Builder must correct, redo, or resubmit.

6. **Closed**
   - Final decision recorded and downstream work routed.

#### Draw Release Board

Used by lender admins and finance/ops users where applicable.

Recommended columns:

1. **Requested**
   - Builder submitted a Draw Release Work Order.
   - Exact source allocations reserve approved availability.

2. **In Review**
   - Lender operations is reviewing evidence, source attribution, policy, and loan availability.

3. **Ready for Admin**
   - Operations recommendation is complete.
   - Lender admin can make the final approve/reject decision.

4. **Approved for Release**
   - Admin has approved the draw release.
   - Release is pending execution/recording.

5. **Released**
   - Draw release event has been recorded.
   - Interest accrual start date has been recorded.
   - Builder receipt confirmation is pending.

6. **Receipt Confirmed**
   - Builder confirmed receipt of funds.
   - Draw workflow is operationally closed.

7. **Receipt Exception**
   - Builder reports missing funds, short amount, wrong account, or other discrepancy.
   - Lender ops must investigate.

### 18.3.4 Flow 1 — Builder Marks Milestone Complete

Trigger:

- Builder Lead or permissioned Builder Staff marks a milestone complete from the Build Workspace or Milestone Detail screen.

Builder must provide:

- actual cost incurred,
- completion report or notes,
- required proof-of-completion evidence,
- direct camera uploads where applicable,
- geofence/location permission where applicable.

System actions:

1. Validate required fields.
2. Validate required evidence checklist.
3. Attempt geofence verification for direct proof uploads.
4. Record geofence result as verified, failed, unavailable, low-confidence, or suspected spoofing where supported.
5. Create Milestone Completion Package.
6. Transition milestone to **Submitted for Review**.
7. Create Evidence Review Work Order.
8. Place work order in **New Submission** column of Lender Evidence Review Board.
9. Notify lender operations.

Acceptance criteria:

- Builder cannot submit completion package if required evidence is missing unless policy allows exception submission.
- Submission creates exactly one active Evidence Review Work Order for the milestone completion attempt.
- Geofence failure does not delete evidence; it flags the package for review.
- Build Workspace immediately reflects submitted review state.

### 18.3.5 Flow 2 — Staff Picks Up Evidence Review Work Order

Trigger:

- Lender staff opens Evidence Review Board and claims a New Submission.

Staff actions:

1. Claim work order.
2. Review milestone context.
3. Review builder completion report.
4. Review uploaded proof.
5. Review geofence verification status.
6. Review actual cost vs approved budget.
7. Review dependency/draw-group context.
8. Choose next action.

Possible staff outcomes:

1. **Recommend approval without site visit**
   - Staff believes evidence is sufficient.
   - Work order moves to Ready for Admin.

2. **Request more information**
   - Staff identifies missing/unclear evidence.
   - Work order moves to Needs More Information.
   - Builder receives a request.

3. **Request site visit**
   - Staff determines physical verification is required.
   - Evidence Review Work Order moves to Site Visit Required.
   - Site Visit Work Order is created.

4. **Recommend rejection**
   - Staff believes milestone is not complete or evidence is materially deficient.
   - Work order moves to Ready for Admin with rejection recommendation.

System actions:

- Record staff actor, timestamp, recommendation, comments, and reviewed evidence.
- Preserve all staff review decisions in audit trail.
- Notify builder if more information is required.
- Notify site visit queue if site visit is requested.
- Notify admin if package becomes ready for decision.

Acceptance criteria:

- Staff recommendation never final-approves milestone completion.
- Work order cannot move to Ready for Admin without staff recommendation.
- Requesting a site visit creates a linked Site Visit Work Order.
- All staff actions are auditable.

### 18.3.6 Flow 3 — Builder Responds to More Information Request

Trigger:

- Staff requests more information.

Builder actions:

1. Open request from notification or Build Workspace.
2. Review missing information request.
3. Upload additional proof or clarify completion report.
4. Resubmit response.

System actions:

1. Append new evidence to Milestone Completion Package.
2. Attempt geofence verification for new direct uploads.
3. Move Evidence Review Work Order back to New Submission or Claimed/In Review depending on ownership policy.
4. Notify original staff owner where applicable.

Acceptance criteria:

- Original completion package remains versioned.
- Additional evidence is appended, not destructive.
- Staff can compare original submission and response.

### 18.3.7 Flow 4 — Site Visit Work Order Fulfillment

Trigger:

- Staff or admin requests site visit.

Site staff actions:

1. Open Site Visit Board.
2. Claim or accept assigned Site Visit Work Order.
3. Review Build location, milestone context, prior evidence, and checklist.
4. Travel to site.
5. Open mobile/tablet site visit flow.
6. Capture photos/videos/notes.
7. Complete structured report.
8. Submit recommendation.
9. Sync offline data if captured without connectivity.

System actions:

1. Record claim/assignment.
2. Track site visit status.
3. Attempt location/geofence verification where permitted.
4. Store captured proof and report.
5. Attach Site Visit Report to Admin Approval Package.
6. Move Site Visit Work Order to Submitted.
7. Notify admin or staff reviewer.

Possible site visit outcomes:

1. **Recommend approval**
   - Work appears complete.
   - Evidence supports builder claim.

2. **Recommend rejection**
   - Work incomplete, deficient, or inconsistent with claim.

3. **Needs rework / inconclusive**
   - Site visit evidence is incomplete.
   - More inspection or builder evidence is required.

Acceptance criteria:

- Site visit can be completed on mobile/tablet.
- Site visit supports offline draft capture and later sync.
- Site visit report includes evidence, notes, recommendation, timestamp, and actor.
- Admin can review site visit report before final milestone decision.

### 18.3.8 Flow 5 — Admin Reviews Proof and Recommendation

Trigger:

- Evidence Review Work Order is Ready for Admin, and any required Site Visit Work Order is completed or waived by admin override.

Admin actions:

1. Open Admin Approval Board.
2. Select Ready for Milestone Decision item.
3. Review milestone details.
4. Review builder evidence.
5. Review geofence result.
6. Review staff report and recommendation.
7. Review site visit report where applicable.
8. Review budget variance and warnings.
9. Choose final decision.

Possible admin decisions:

1. **Approve milestone completion**
   - Milestone transitions to Approved.
   - System checks Draw Group eligibility.

2. **Reject milestone completion**
   - Milestone transitions to Rejected.
   - Builder must correct work or resubmit.

3. **Request more information**
   - Milestone returns to More Information Requested.
   - Builder receives request.

4. **Request/reopen site visit**
   - Site Visit Work Order is created or moved to Needs Rework.

5. **Override site visit requirement**
   - Admin waives site visit with audited reason.
   - Approval can proceed based on available evidence.

System actions:

- Record final decision.
- Record admin actor, timestamp, and reason where required.
- Update milestone status.
- Close or route operational work orders.
- Update Build Workspace.
- If milestone approved, recompute the facility-capped reimbursement source ledger while retaining its Draw Group attribution.

Acceptance criteria:

- Only lender admin can final approve or reject milestone completion.
- Admin cannot approve without satisfying required policy gates unless using explicit override.
- Overrides require audited reason.
- Milestone approval immediately updates associated Draw Group eligibility.

### 18.3.9 Flow 6 — Draw Release Work Order Is Requested and Reviewed

Trigger:

- Builder submits an amount no greater than the current pooled balance from lender-admin-approved Milestones.

System actions:

1. Recalculate source-bucket availability in deterministic Milestone order.
2. Create one organization-scoped Draw Release Work Order in `requested`.
3. Persist immutable source allocations whose sum exactly equals the requested amount.
4. Place the work order in the Draw Release Board.
5. Lender operations transitions it to `in_review`, reviews the package, and submits a recommendation.
6. Transition the work order to `ready_for_admin`.
7. Calculate draw fee according to lender configuration.
8. Show interest accrual implications.
9. Notify lender admin.

Acceptance criteria:

- Unapproved, rejected, or under-review Milestones contribute no availability.
- The request cannot exceed current availability or consume the facility beyond its principal cap.
- Source ordering and allocation are deterministic for the same committed ledger state.
- The Draw Release Work Order links to every contributing approved Milestone and Draw Group.
- The Build Workspace shows pooled totals and the exact persisted source attribution.

### 18.3.10 Flow 7 — Admin Approves and Releases Draw

Trigger:

- Draw Release Work Order is `ready_for_admin`.

Admin actions:

1. Open Draw Release Work Order.
2. Review included milestones.
3. Review approved evidence package summary.
4. Review approved draw amount.
5. Review draw fee treatment.
6. Review loan available balance.
7. Review interest accrual start implications.
8. Approve draw release.

System actions:

1. Transition draw to Approved for Release.
2. Record release approval event.
3. Execute or record release depending on integration maturity.
4. Transition draw to Released once release is recorded.
5. Record release date.
6. Record draw fee treatment.
7. Record interest accrual start date.
8. Emit webhook events.
9. Create Draw Receipt Confirmation task for builder.
10. Notify builder.

Acceptance criteria:

- Draw release requires lender admin approval.
- Release action records date, amount, fee treatment, and interest start.
- System emits draw lifecycle events where webhook registry is enabled.
- Builder is notified that funds have been released and confirmation is requested.

### 18.3.11 Flow 8 — Builder Confirms Receipt of Draw

Trigger:

- Draw is marked Released.

Builder actions:

1. Receive release notification.
2. Open Draw Receipt Confirmation task.
3. Confirm funds received, or report issue.

Possible builder outcomes:

1. **Confirm received**
   - Builder confirms funds were received.
   - Draw transitions to Receipt Confirmed.
   - Draw workflow is operationally closed.

2. **Report not received**
   - Builder says funds have not arrived.
   - Draw moves to Receipt Exception.
   - Lender ops is notified.

3. **Report amount discrepancy**
   - Builder says amount received differs from expected.
   - Draw moves to Receipt Exception.
   - Lender ops investigates.

System actions:

- Record builder confirmation or exception.
- Notify lender ops if exception.
- Preserve receipt confirmation in audit trail.
- Keep Build Workspace updated.

Acceptance criteria:

- Builder confirmation is captured as operational acknowledgement.
- Missing/disputed receipt creates lender exception work item.
- Receipt confirmation does not overwrite authoritative payment/ledger records where integrated.

### 18.3.12 Exception Paths

The kanban workflows must explicitly support exception routing.

Common exceptions:

- missing required evidence,
- failed geofence verification,
- low-confidence location,
- suspected spoofed location,
- budget variance above threshold,
- actual cost exceeds approved milestone budget,
- staff recommends rejection,
- site visit incomplete,
- admin requests more information,
- milestone rejected,
- draw release blocked by loan availability issue,
- draw payment execution failure,
- builder reports non-receipt,
- builder reports amount discrepancy.

Each exception should create or route a work item rather than leaving the issue hidden in comments or chat.

### 18.3.13 Kanban Card Requirements

Each kanban card should show enough context for staff/admin to triage without opening the full detail view.

Recommended card fields:

- Build name.
- Milestone name.
- Draw Group ID.
- Borrower/builder name.
- Work order type.
- Current status.
- Priority.
- SLA/due date where applicable.
- Assigned user.
- Evidence count.
- Geofence status.
- Budget variance indicator.
- Site visit required indicator.
- Last activity timestamp.

### 18.3.14 Audit Events for Kanban Flow

The following events should be audited:

- milestone marked complete,
- completion package submitted,
- evidence uploaded,
- geofence verification result recorded,
- evidence review work order created,
- work order claimed,
- staff requested more information,
- staff requested site visit,
- site visit work order created,
- site visit claimed,
- site visit report submitted,
- staff recommendation submitted,
- admin approval package opened/claimed where tracked,
- admin approved milestone,
- admin rejected milestone,
- admin override recorded,
- draw release work order created,
- draw approved for release,
- draw released,
- builder receipt confirmed,
- receipt exception reported.

## 19. Analytics and Reporting

## 19.1 Builder-Facing Metrics

- approved loan amount,
- drawn amount,
- undrawn available balance,
- upcoming draw amount,
- estimated reimbursement date,
- current unreimbursed exposure,
- working-capital utilization,
- estimated interest cost,
- draw fees incurred,
- budget remaining,
- milestone variance.

## 19.2 Lender-Facing Metrics

- active builds,
- proposals awaiting review,
- milestones awaiting review,
- site visits pending,
- draws ready for release,
- average draw cycle time,
- budget variance by build,
- delayed milestones,
- released principal,
- interest exposure,
- draw fee revenue.

## 19.3 Operational Metrics

- time from milestone submission to staff review,
- time from review to site visit request,
- time from site visit request to completion,
- time from approval to release,
- missing evidence rate,
- geofence failure rate,
- recommendation-to-admin-approval conversion,
- budget revision frequency,
- average draws per build.

---

## 20. MVP Scope

## 20.1 In Scope

1. FairLend module implementation with standalone-ready tenant boundaries.
2. WorkOS organization scoping and RBAC.
3. Builder/developer Build Proposal flow.
4. Permit/document upload.
5. Build site location capture.
6. Borrower Starting Cash input.
7. Milestone template selection.
8. Milestone editing.
9. Dependency editing.
10. Core Build Workspace with milestone rail, Gantt roadmap, and draw group bounding boxes.
11. Draw Plan generation.
12. Cheapest Feasible, Fastest, and Capital-Constrained plan comparison.
13. Admin proposal review.
14. Active Build state.
15. Builder milestone progress updates.
16. Completion evidence upload.
17. Geofenced proof-of-completion verification.
18. Lender operations kanban.
19. Staff evidence review and recommendation.
20. Site visit request workflow.
21. Mobile/tablet site visit flow.
22. Offline save/sync for site visit workflow.
23. Admin milestone approval.
24. Admin draw release approval.
25. Configurable draw fee model.
26. Configurable interest model.
27. Audit trail.
28. Initial API and webhook foundation.

## 20.2 Out of Scope for MVP

1. Full standalone commercial packaging.
2. Full accounting ledger.
3. Actual payment rail integration.
4. Full loan servicing.
5. Holdbacks/retainage.
6. Formal contingency accounting.
7. Advanced contractor resource scheduling.
8. Contractor/vendor marketplace.
9. Municipal inspection integration.
10. Automated lien waiver tracking.
11. Full offline Build Workspace editing.
12. Complex subtask-based partial reimbursement unless explicitly pulled into scope.

## 20.3 Stretch Goals

- holdbacks/retainage,
- contingency tracking,
- subtask-based partial draws,
- AI-assisted budget anomaly detection,
- invoice OCR,
- geofenced anti-spoofing enhancements,
- portfolio-level lender risk dashboard,
- external CRM/LMS integrations beyond foundational API/webhooks.

---

## 21. MVP Definition of Done

The MVP is complete when:

1. A builder can create and submit a Build Proposal with build location, permits, budget, working-capital input, milestones, dependencies, and selected draw plan.
2. The system can generate Cheapest Feasible, Fastest, and Capital-Constrained plans.
3. The Build Workspace displays milestone cards, Gantt roadmap, parallel tasks, draw group bounding boxes, status, warnings, costs, durations, and role-specific actions.
4. A lender admin can review, approve, reject, or request changes on a proposal.
5. An approved proposal becomes an active Build.
6. Builder users can update progress and submit proof of completed work.
7. Direct proof upload attempts geofence verification and records verification status.
8. Location-unverified evidence is flagged for lender review rather than silently rejected.
9. Lender staff can review evidence and submit a recommendation.
10. Lender staff or admin can request a site visit.
11. Site staff can complete a mobile/tablet site visit report with camera evidence and offline save/sync.
12. Lender admin has final milestone approval authority.
13. Lender admin can override site visit requirements or staff recommendations only with audited reason.
14. Draw release is blocked until included milestones satisfy approval requirements.
15. Lender admin can approve draw release.
16. System records release date, draw fee treatment, and interest accrual start date.
17. RBAC and tenant scoping prevent unauthorized access.
18. Material actions are recorded in the audit trail.
19. Foundational webhook events can be emitted for core lifecycle changes.

---

## 22. Success Metrics

## 22.1 Adoption Metrics

- percentage of construction builds created through DrawFlow,
- percentage of proposals submitted without missing required documents,
- percentage of milestones updated through the Build Workspace,
- percentage of draw requests managed through DrawFlow rather than email/manual process.

## 22.2 Efficiency Metrics

- reduction in average draw cycle time,
- reduction in missing evidence incidents,
- reduction in manual spreadsheet usage,
- reduction in lender-builder back-and-forth,
- time saved per draw review.

## 22.3 Financial Planning Metrics

- average estimated financing cost by plan type,
- actual vs estimated milestone cost variance,
- actual vs estimated duration variance,
- average working-capital utilization,
- frequency of project stalls due to insufficient working capital,
- frequency of budget revisions.

## 22.4 Control Metrics

- percentage of draw releases with complete evidence packages,
- percentage of direct proof uploads with geofence verification,
- geofence failure / location-unverified rate,
- number of admin overrides,
- number of post-release disputes/corrections,
- audit completeness score.

---

## 23. Product Decisions

The following decisions are authoritative for v1 unless superseded by a later approved product decision.

## 23.1 Partial Draws

Resolved:

- Milestones are atomic for reimbursement eligibility: only lender-admin-approved Milestone value enters availability.
- Builders may submit a partial or full Draw Release Work Order against the pooled approved balance.
- Every request is attributed FIFO across approved Milestone source buckets ordered by Milestone order, key, and ID; the facility cap is applied in the same order.
- Each allocation records the source Milestone, Draw Group, amount, and order. Allocation amounts must sum exactly to the request amount.
- Request and allocation records are organization-scoped and remain the source of truth through operations review, admin decision, and release.
- Subtask-based or partially completed-work reimbursement is out of v1 scope.

## 23.2 Geofence Strictness

Decision needed:

- What radius qualifies as at the Build site?
- What happens when GPS is unavailable?
- What happens when location confidence is low?
- What happens when spoofing is suspected?

Recommendation: allow upload, flag as location-unverified, require lender/admin review.

## 23.3 Borrower Starting Cash UX

Decision:

- The builder-provided input is called **Borrower Starting Cash**.
- Helper text: **The borrower's own cash available at the start of the build, before any reimbursement draws are released.**
- **Required Working Capital / Peak Unreimbursed Exposure** is a system-derived plan metric, never an alias for starting cash.
- Any later borrower contribution is recorded as an explicit capital-infusion event rather than silently increasing starting cash.

## 23.4 Post-Approval Builder Edit Rules

Decision needed:

- Which fields can builder edit after proposal approval?
- Which changes require admin approval?
- Which changes trigger re-optimization?
- Which changes force Budget Revision?

Recommendation: progress updates and evidence are freely updateable; cost/duration/dependency changes after activation create proposed changes or Budget Revision workflows.

## 23.5 API/Webhook MVP Depth

Decision needed:

- Is API/webhook support only internal foundation in MVP?
- Or must an external integration be demonstrated in MVP?

Recommendation: build the event model and webhook registry foundation now, but avoid committing to broad third-party integrations until the core product workflow is stable.

## 23.6 Build Collaboration Workspace

Decision:

- The live Build Details tab keeps Build Overview as its operational header and
  places the Build-local Collaboration feed directly beneath it.
- Collaboration replaces Public Notes and Internal Notes. Posts never cross
  Builds.
- Milestone review remains canonical in the Milestones tab. Documents and
  Contractors are first-class tabs. Capital and term requests live under Build
  Overview → Draws.
- The feed supports rich TipTap posts and replies, nested discussions, personal
  and Build pins, follows, reactions, timestamped role-safe Seen receipts,
  required acknowledgements, and Linear-style Action Items.
- `@` references cover participants, milestones, submilestones, draws,
  Evidence Packages/assets, Site Visits, Documents, materials, and readable
  Action Items. Non-person references provide a live preview and route into the
  existing focused Build workspace or detail sheet.
- Audience restriction is downward-only. A participant cannot exclude peer or
  higher authority. Admin and Principal Broker authority applies throughout the
  tenant organization.
- The originating brokerage/lender organization permanently owns the Build
  tenant boundary.
- Agents may prepare and revise private bundles, but shared publication always
  requires a human-in-the-loop approval. The approving human is the author.
- Material publication, moderation, acknowledgement, Action Item, migration,
  and system-event changes are auditable and organization-scoped.

---

## 24. Recommended Next Document

The next document should be a technical specification covering:

1. system context and C4 architecture,
2. tenant/org model,
3. WorkOS auth/RBAC model,
4. domain schema,
5. state machines,
6. Build Workspace interaction model,
7. optimizer architecture,
8. geofenced evidence capture,
9. offline sync design,
10. API and webhook registry,
11. audit/event model,
12. implementation phases,
13. acceptance criteria by subsystem.
