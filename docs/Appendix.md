
---

## 26. Contractor Profiles, Assignment, Smart Selection, and Site Superintendent Workflows

This section extends DrawFlow beyond lender/builder draw administration into a richer construction execution layer. The intent is not to turn DrawFlow into a generic contractor marketplace. The intent is to make milestone planning, budget estimation, field updates, and draw evidence more accurate by explicitly modeling the people and companies performing the work.

Contractor data should improve milestone cost estimates, assignment decisions, risk assessment, work history, and lender/admin visibility into who performed which work. Site superintendent workflows should provide day-by-day operational updates from the field and create a structured bridge between construction execution and draw approval workflows.

---

### 26.1 Product Rationale

Construction draw risk is strongly affected by who performs the work. Two milestones with the same name and estimated budget can have very different execution risk depending on contractor quality, availability, skill fit, safety history, project experience, and location.

DrawFlow should therefore support a contractor intelligence layer that can answer questions such as:

- Which contractor is assigned to this milestone?
- Is this contractor qualified for this trade and project type?
- Has this contractor performed similar work before?
- How accurate are this contractor’s estimates historically?
- Does this contractor usually finish on time?
- What is the contractor’s quality history?
- What is the contractor’s safety/incident history?
- Is the contractor available during the required milestone window?
- Is the contractor within reasonable working distance of the Build site?
- How does this contractor’s rate affect the milestone budget?
- Which contractor should the builder choose for this milestone?

This data should eventually support **Smart Selection**: a recommendation system that ranks contractors for a milestone based on fit, availability, performance history, cost, trade skills, location, and risk factors.

---

### 26.2 New User Type: Site Superintendent

A **Site Superintendent** is a field-side user responsible for day-by-day build updates, progress reporting, issue escalation, contractor coordination notes, and operational communication from the construction site.

The Site Superintendent may be employed by the builder, developer, general contractor, or another organization associated with the Build.

#### Responsibilities

A Site Superintendent can:

- provide daily progress updates,
- upload site photos and notes,
- report milestone progress,
- report blockers/issues,
- confirm contractor presence or work activity,
- respond to automated prompts,
- receive DMs or secure chat messages,
- receive assigned work requests through kanban,
- submit field reports,
- support proof-of-completion packages,
- flag safety incidents or site issues,
- confirm whether scheduled work occurred.

#### Role Boundaries

A Site Superintendent should not automatically have lender-side approval authority.

By default, the Site Superintendent can provide operational evidence and field updates, but cannot:

- approve milestone completion,
- approve draw release,
- override site visit requirements,
- modify lender policy,
- or make final budget decisions.

Their updates may feed into milestone status, evidence packages, staff review, and admin approval packages.

---

### 26.3 Contractor Domain Model

#### Contractor

A **Contractor** is an individual or company that performs work on one or more Builds.

A Contractor may be:

- an individual tradesperson,
- a subcontractor company,
- a general contractor,
- a crew,
- a site superintendent,
- or a guest contractor record used only for audit/history.

A Contractor profile should include:

- contractor ID,
- tenant/org scope,
- contractor type: individual, company, crew, guest/audit-only,
- legal/business name,
- display name,
- contact information,
- location/address,
- service radius / driving-distance range,
- trades/skills,
- skill ranking by trade,
- years of experience,
- estimated skill level,
- estimated quality of work,
- hourly rate,
- rate history,
- availability,
- work schedule,
- attachments,
- notes,
- incident history,
- workplace safety violations,
- insurance/license fields where later required,
- profile completeness score,
- active/inactive status.

#### Contractor Skill

A **Contractor Skill** describes a trade or capability the contractor can perform.

Examples:

- framing,
- drywall,
- plumbing,
- electrical,
- HVAC,
- roofing,
- insulation,
- excavation,
- concrete/foundation,
- finishing,
- landscaping,
- site supervision.

Each skill can include:

- skill name,
- skill category/trade group,
- ranking/score,
- years of experience for that skill,
- certification/license reference where applicable,
- notes,
- evidence/attachments.

#### Contractor Assignment

A **Contractor Assignment** links a Contractor to a Build, Milestone, Subtask, Work Order, or Site Update.

Assignment fields should include:

- contractor ID,
- Build ID,
- milestone ID,
- optional subtask ID,
- assignment role,
- planned start date,
- planned end date,
- actual start/end dates,
- assigned budget amount,
- hourly rate or contracted amount,
- expected quantity of work,
- status,
- assigned by,
- assignment timestamp,
- notes,
- attachments,
- related work orders.

Assignment statuses may include:

- proposed,
- assigned,
- scheduled,
- active,
- completed,
- replaced,
- cancelled,
- disputed.

#### Guest Contractor

A **Guest Contractor** is a lightweight contractor record used when the system needs to preserve audit history but does not yet have a full contractor profile.

Guest contractors are useful when:

- a builder mentions a contractor who is not in the database,
- historical work must be attributed,
- a site superintendent reports a contractor presence,
- invoices/evidence reference a contractor,
- or the lender wants an audit trail without onboarding the contractor as a platform user.

Guest contractors should be convertible into full contractor profiles later.

---

### 26.4 Contractor Performance History

DrawFlow should build a historical performance database for contractors over time.

Performance should be broken down by:

- project type,
- build type,
- square footage,
- quantity of work,
- milestone type,
- trade/skill,
- geographic area,
- budget size,
- contractor role,
- complexity level,
- schedule performance,
- cost performance,
- quality outcome,
- incident/safety history.

#### Performance Metrics

Recommended metrics:

- average schedule variance,
- average cost variance,
- completion rate,
- rework frequency,
- admin rejection rate,
- site visit issue rate,
- safety incident count,
- safety incident severity,
- evidence quality score,
- lender satisfaction/rating,
- builder satisfaction/rating,
- milestone approval success rate,
- draw delay contribution,
- estimate accuracy,
- repeat assignment rate.

#### Project-Type Context

Performance scores should not be global-only. Contractor quality should be contextual.

Example:

- A contractor may perform well on small residential drywall but poorly on large multi-unit commercial drywall.
- A framing crew may be fast on detached homes but not suitable for complex custom builds.
- A contractor may be cost-effective but frequently create inspection delays.

Therefore, contractor rankings should be filterable and explainable by project type, milestone category, work quantity, square footage, and location.

---

### 26.5 Contractor Cost and Budget Integration

Contractor data should feed milestone cost estimation, and milestone budgets should also feed contractor assignment planning.

There are two valid cost flows:

#### Contractor-to-Budget Flow

A contractor’s rate and work estimate can inform milestone cost.

Example:

- contractor hourly rate,
- expected labor hours,
- quantity of work,
- material assumptions,
- expected crew size,
- and historical variance

feed into the milestone budget estimate.

#### Budget-to-Contractor Flow

A milestone’s approved budget can be allocated to one or more contractors.

Example:

- milestone budget: $80,000,
- framing contractor allocation: $52,000,
- material supplier allocation: $20,000,
- contingency/other: $8,000.

The product should support both directions because early-stage planning may start from milestone budgets, while execution-stage assignment may start from contractor quotes/rates.

#### Required Cost Fields

At minimum, contractor assignment should support:

- hourly rate,
- estimated hours,
- fixed quote amount,
- assigned budget amount,
- actual cost incurred,
- variance from assigned amount,
- variance from milestone budget,
- invoice/evidence attachments.

---

### 26.6 Contractor Categorization, Search, and Quick Assignment

DrawFlow should provide fast contractor lookup and assignment from the Build Workspace and Milestone Detail.

Required capabilities:

- contractor directory,
- skill/trade categories,
- quick search,
- autocomplete assignment,
- filtering by trade/skill,
- filtering by location/range,
- filtering by availability,
- filtering by rating/performance,
- filtering by hourly rate or cost band,
- filtering by safety/incident status,
- quick-create guest contractor,
- quick-assign to milestone,
- assignment history.

The assignment experience should be optimized for speed. A builder or site superintendent should be able to type “drywall” or a contractor name and quickly assign the right contractor to a milestone without leaving the Build Workspace.

---

### 26.7 Smart Selection and AI-Assisted Contractor Recommendation

**Smart Selection** is the recommendation layer for contractor assignment.

The system should recommend contractors for a milestone based on:

- required milestone trade/skill,
- contractor skill ranking,
- historical performance on similar work,
- project type fit,
- square footage / quantity-of-work fit,
- location and driving range,
- availability during milestone window,
- hourly rate / expected cost,
- quality history,
- safety/incident history,
- prior work with the builder/lender,
- budget compatibility,
- schedule risk,
- evidence/review quality history.

#### Recommendation Output

A Smart Selection recommendation should include:

- ranked contractor list,
- fit score,
- cost estimate,
- availability signal,
- relevant historical evidence,
- risk flags,
- explanation of recommendation,
- tradeoffs between recommended options.

Example explanation:

> “Recommended because this contractor has completed 7 similar framing milestones on detached residential builds between 2,500–4,000 sq ft, averaged 4 percent cost variance, finished within 3 days of schedule on average, and is within the configured service radius. Risk: hourly rate is 12 percent above the median contractor in this category.”

#### AI Guardrails

AI selection must be explainable and non-authoritative.

Rules:

- AI can recommend; users assign.
- Recommendations must show underlying factors.
- Users must be able to override recommendations.
- Assignment decisions should be audited.
- Sensitive or compliance-relevant claims must be backed by stored data, not hallucinated inference.

---

### 26.8 Site Superintendent Daily Update Workflow

Site Superintendents should be able to provide day-by-day updates.

#### Daily Update Contents

A daily update may include:

- date,
- Build ID,
- milestone(s) affected,
- contractors present,
- work performed,
- estimated percent complete,
- blockers/issues,
- safety incidents,
- weather/site conditions,
- photos/videos,
- notes,
- next-day plan,
- geofence/location status where required.

#### Update Triggers

Daily updates can be triggered by:

- manual submission,
- scheduled automation,
- milestone state changes,
- draw-related conditions,
- missed update reminders,
- lender/admin request,
- work order assignment,
- site visit preparation,
- issue escalation.

#### Automation Examples

- Ping Site Superintendent every weekday at 4:00 PM for daily progress update.
- Ping Site Superintendent when a milestone is marked In Progress for more than X days without update.
- Ping Site Superintendent when a milestone is behind schedule.
- Create a work request when geofenced proof fails and a field update is required.
- Ask Site Superintendent to confirm contractor presence for a milestone scheduled today.
- Ask Site Superintendent for photo evidence when milestone reaches expected completion date.

---

### 26.9 Site Superintendent Communication and Work Requests

Site Superintendents should be reachable through secure deal communication and assignable work orders.

Supported interaction models:

1. **Direct Message / Secure Deal Chat**
   - Admin, lender staff, builder lead, or permitted users can message the Site Superintendent in context.

2. **Automation Prompt**
   - System sends prompt based on schedule or condition.

3. **Kanban Work Request**
   - A work item is created and assigned to the Site Superintendent.

4. **Milestone-Linked Task**
   - A request is attached directly to a milestone or subtask.

5. **Evidence Request**
   - Site Superintendent is asked to upload photos, notes, or report.

Site Superintendent work requests should appear on a kanban board or assigned-task list, depending on product surface.

---

### 26.10 New Screens

#### SCR-031 — Contractor Directory

**Purpose:** Search, filter, and manage contractor profiles.

**Primary users:** Builder Lead, Builder Staff, Site Superintendent, Lender Admin where permitted.

**UI / design description:**

- Dense searchable directory.
- Filters for trade, skill, location, availability, rate, project type, performance score, safety status, and active/inactive state.
- Contractor rows/cards should show name, type, primary trades, location, service radius, rate, rating/performance summary, availability, and risk flags.
- Quick actions: view profile, assign to milestone, create guest contractor.

**Key components:** `Appendix.md` §26.11 CMP-137 — ContractorDirectory, `Appendix.md` §26.11 CMP-138 — ContractorSearchAutocomplete, `Appendix.md` §26.11 CMP-139 — ContractorFilterBar, `Appendix.md` §26.11 CMP-140 — ContractorSummaryCard, `Appendix.md` §26.11 CMP-141 — ContractorRiskFlags.

**Workflow references:** `Appendix.md` §§26.3–26.7 (Contractor Domain Model through Smart Selection and AI-Assisted Contractor Recommendation).

---

#### SCR-032 — Contractor Profile

**Purpose:** Full contractor record with skills, rates, assignments, history, performance, incidents, and attachments.

**Primary users:** Builder Lead, Lender Admin, Site Superintendent where permitted.

**UI / design description:**

- Profile layout with header summary, skill matrix, availability, rate history, performance analytics, assignment history, incidents, safety violations, notes, and attachments.
- Should support both individual and company contractor profiles.
- Guest contractor profiles should be visibly marked as lightweight/audit-only.

**Key components:** `Appendix.md` §26.11 CMP-142 — ContractorProfileHeader, `Appendix.md` §26.11 CMP-143 — ContractorSkillMatrix, `Appendix.md` §26.11 CMP-144 — ContractorRatePanel, `Appendix.md` §26.11 CMP-145 — ContractorAvailabilityPanel, `Appendix.md` §26.11 CMP-146 — ContractorPerformanceAnalytics, `Appendix.md` §26.11 CMP-147 — ContractorIncidentHistory, `Appendix.md` §26.11 CMP-148 — ContractorAttachmentList.

**Workflow references:** `Appendix.md` §§26.3–26.5 (Contractor Domain Model through Contractor Cost and Budget Integration).

---

#### SCR-033 — Assign Contractor to Milestone

**Purpose:** Fast assignment flow from Build Workspace or Milestone Detail.

**Primary users:** Builder Lead, Site Superintendent, Builder Staff where permitted.

**UI / design description:**

- Drawer/modal from milestone context.
- Search/autocomplete first.
- Shows relevant contractors by trade fit.
- Supports Smart Selection recommendations.
- Allows guest contractor creation.
- Captures assignment role, planned dates, rate/quote, assigned budget, notes, and attachments.

**Key components:** `Appendix.md` §26.11 CMP-149 — ContractorAssignmentDrawer, `Appendix.md` §26.11 CMP-138 — ContractorSearchAutocomplete, `Appendix.md` §26.11 CMP-150 — SmartSelectionPanel, `Appendix.md` §26.11 CMP-151 — AssignmentCostAllocator, `Appendix.md` §26.11 CMP-152 — GuestContractorQuickCreate, `Appendix.md` §26.11 CMP-153 — ContractorFitScore.

**Workflow references:** `Appendix.md` §§26.5–26.7 (Contractor Cost and Budget Integration through Smart Selection and AI-Assisted Contractor Recommendation).

---

#### SCR-034 — Contractor Smart Selection

**Purpose:** Compare and select recommended contractors for a milestone.

**Primary users:** Builder Lead, Site Superintendent, Lender Admin where permitted.

**UI / design description:**

- Ranked recommendation view.
- Shows fit score, cost estimate, availability, skill match, historical performance, safety flags, and explanation.
- Must make clear that AI recommends but the user assigns.
- Should support compare mode between shortlisted contractors.

**Key components:** `Appendix.md` §26.11 CMP-150 — SmartSelectionPanel, `Appendix.md` §26.11 CMP-154 — ContractorRankingTable, `Appendix.md` §26.11 CMP-155 — RecommendationExplanation, `Appendix.md` §26.11 CMP-156 — ContractorComparisonDrawer, `Appendix.md` §26.11 CMP-153 — ContractorFitScore.

**Workflow references:** `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

#### SCR-035 — Site Superintendent Daily Update

**Purpose:** Field update submission workflow for Site Superintendents.

**Primary users:** Site Superintendent.

**UI / design description:**

- Mobile/tablet-first form.
- Should be fast enough for daily use.
- Shows today’s scheduled milestones, assigned contractors, expected work, update prompts, photo capture, issue reporting, and submit action.
- Can be launched from notification, automation prompt, kanban task, or Build Workspace.

**Key components:** `Appendix.md` §26.11 CMP-157 — DailyUpdateForm, `Appendix.md` §26.11 CMP-158 — ContractorPresencePicker, `Appendix.md` §26.11 CMP-159 — WorkPerformedChecklist, `Appendix.md` §26.11 CMP-160 — SiteIssueReporter, `uiManifest/componentManifest.md` §25.2 CMP-072 — CameraCapture, `uiManifest/componentManifest.md` §25.2 CMP-073 — GeofenceCaptureGate, `uiManifest/componentManifest.md` §25.2 CMP-096 — SyncStatusIndicator.

**Workflow references:** `Appendix.md` §§26.8–26.9 (Site Superintendent Daily Update Workflow through Site Superintendent Communication and Work Requests).

---

#### SCR-036 — Site Superintendent Work Queue

**Purpose:** Assigned task/work-request queue for Site Superintendents.

**Primary users:** Site Superintendent.

**UI / design description:**

- Lightweight kanban or task list focused on field execution.
- Items may include daily update request, photo request, contractor confirmation, blocker report, site issue follow-up, or milestone progress confirmation.
- Should be optimized for mobile but usable on desktop.

**Key components:** `uiManifest/componentManifest.md` §25.2 CMP-078 — KanbanBoard, `uiManifest/componentManifest.md` §25.2 CMP-080 — WorkOrderCard, `Appendix.md` §26.11 CMP-161 — SiteSuperTaskCard, `Appendix.md` §26.11 CMP-162 — AutomationPromptCard, `uiManifest/componentManifest.md` §25.2 CMP-082 — ClaimWorkOrderButton.

**Workflow references:** `Appendix.md` §§26.8–26.9 (Site Superintendent Daily Update Workflow through Site Superintendent Communication and Work Requests); `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows.

---

#### SCR-037 — Contractor Performance Dashboard

**Purpose:** Portfolio-level analysis of contractor performance.

**Primary users:** Builder Lead, Lender Admin, Organization Admin.

**UI / design description:**

- Analytics dashboard broken down by contractor, trade, project type, square footage, work quantity, location, cost variance, schedule variance, quality, and incidents.
- Should support filtering and ranking.
- Should make the “best contractor” database visible and actionable.

**Key components:** `Appendix.md` §26.11 CMP-146 — ContractorPerformanceAnalytics, `Appendix.md` §26.11 CMP-154 — ContractorRankingTable, `Appendix.md` §26.11 CMP-163 — PerformanceBreakdownFilters, `Appendix.md` §26.11 CMP-164 — ContractorBenchmarkChart, `Appendix.md` §26.11 CMP-165 — IncidentRatePanel.

**Workflow references:** `Appendix.md` §26.4 Contractor Performance History; `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

### 26.11 New Components

#### CMP-137 — ContractorDirectory

**Description:** Directory/list surface for contractor records.

**UI/design:** Dense searchable table/card hybrid with filters and quick actions.

**Used in screens:** `Appendix.md` §25.1 SCR-031 — Contractor Directory.

**Workflow references:** `Appendix.md` §26.3 Contractor Domain Model; `Appendix.md` §26.6 Contractor Categorization, Search, and Quick Assignment.

---

#### CMP-138 — ContractorSearchAutocomplete

**Description:** Fast contractor search and assignment autocomplete.

**UI/design:** Search by name, company, trade, skill, location, or tag. Should support quick guest creation when no result matches.

**Used in screens:** `Appendix.md` §25.1 SCR-031 — Contractor Directory, `Appendix.md` §25.1 SCR-033 — Assign Contractor to Milestone.

**Workflow references:** `Appendix.md` §26.6 Contractor Categorization, Search, and Quick Assignment.

---

#### CMP-139 — ContractorFilterBar

**Description:** Filter controls for contractor discovery.

**UI/design:** Filter chips for trade, skill, availability, location/range, rate, performance, safety flags, project type.

**Used in screens:** `Appendix.md` §25.1 SCR-031 — Contractor Directory, `Appendix.md` §25.1 SCR-037 — Contractor Performance Dashboard.

**Workflow references:** `Appendix.md` §26.4 Contractor Performance History; `Appendix.md` §26.6 Contractor Categorization, Search, and Quick Assignment.

---

#### CMP-140 — ContractorSummaryCard

**Description:** Compact contractor card for directory/search results.

**UI/design:** Shows name, type, primary trade, rate, location, availability, score, and risk flags.

**Used in screens:** `Appendix.md` §25.1 SCR-031 — Contractor Directory, `Appendix.md` §25.1 SCR-033 — Assign Contractor to Milestone.

**Workflow references:** `Appendix.md` §26.3 Contractor Domain Model; `Appendix.md` §26.6 Contractor Categorization, Search, and Quick Assignment.

---

#### CMP-141 — ContractorRiskFlags

**Description:** Compact display of contractor risk signals.

**UI/design:** Shows safety incidents, high variance, low availability, distance issue, expired/incomplete profile, or low confidence data.

**Used in screens:** `Appendix.md` §25.1 SCR-031 — Contractor Directory, `Appendix.md` §25.1 SCR-032 — Contractor Profile, `Appendix.md` §25.1 SCR-034 — Contractor Smart Selection.

**Workflow references:** `Appendix.md` §26.4 Contractor Performance History; `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

#### CMP-142 — ContractorProfileHeader

**Description:** Header summary for contractor profile.

**UI/design:** Name, type, location, primary trades, active status, rate, availability, profile completeness.

**Used in screens:** `Appendix.md` §25.1 SCR-032 — Contractor Profile.

**Workflow references:** `Appendix.md` §26.3 Contractor Domain Model.

---

#### CMP-143 — ContractorSkillMatrix

**Description:** Skill/trade matrix for contractor profile.

**UI/design:** Trade rows with ranking, experience, notes, certifications/attachments where available.

**Used in screens:** `Appendix.md` §25.1 SCR-032 — Contractor Profile.

**Workflow references:** `Appendix.md` §26.3 Contractor Domain Model.

---

#### CMP-144 — ContractorRatePanel

**Description:** Displays contractor hourly rate, quote history, and rate changes.

**UI/design:** Current rate summary plus historical table/chart.

**Used in screens:** `Appendix.md` §25.1 SCR-032 — Contractor Profile, `Appendix.md` §25.1 SCR-033 — Assign Contractor to Milestone.

**Workflow references:** `Appendix.md` §26.5 Contractor Cost and Budget Integration.

---

#### CMP-145 — ContractorAvailabilityPanel

**Description:** Shows availability and work schedule.

**UI/design:** Calendar/list summary with available/unavailable/conflict states.

**Used in screens:** `Appendix.md` §25.1 SCR-032 — Contractor Profile, `Appendix.md` §25.1 SCR-034 — Contractor Smart Selection.

**Workflow references:** `Appendix.md` §26.6 Contractor Categorization, Search, and Quick Assignment; `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

#### CMP-146 — ContractorPerformanceAnalytics

**Description:** Performance summary for contractor history.

**UI/design:** Breakdowns by project type, square footage, milestone type, cost variance, schedule variance, quality, incidents.

**Used in screens:** `Appendix.md` §25.1 SCR-032 — Contractor Profile, `Appendix.md` §25.1 SCR-037 — Contractor Performance Dashboard.

**Workflow references:** `Appendix.md` §26.4 Contractor Performance History.

---

#### CMP-147 — ContractorIncidentHistory

**Description:** Incident and workplace safety history component.

**UI/design:** Timeline/table of incidents, severity, date, build, notes, attachments, resolution.

**Used in screens:** `Appendix.md` §25.1 SCR-032 — Contractor Profile.

**Workflow references:** `Appendix.md` §26.3 Contractor Domain Model; `Appendix.md` §26.4 Contractor Performance History.

---

#### CMP-148 — ContractorAttachmentList

**Description:** Attachments on contractor profile.

**UI/design:** Secure document list for licenses, insurance, certifications, notes, contracts, incident attachments.

**Used in screens:** `Appendix.md` §25.1 SCR-032 — Contractor Profile.

**Workflow references:** `Appendix.md` §26.3 Contractor Domain Model.

---

#### CMP-149 — ContractorAssignmentDrawer

**Description:** Assignment drawer from milestone context.

**UI/design:** Search, recommendation, assignment details, cost allocation, notes, and confirm action.

**Used in screens:** `Appendix.md` §25.1 SCR-033 — Assign Contractor to Milestone, `uiManifest/screenManifest.md` §25.1 SCR-012 — Active Build Workspace, `uiManifest/screenManifest.md` §25.1 SCR-013 — Milestone Detail Drawer / Page.

**Workflow references:** `Appendix.md` §26.6 Contractor Categorization, Search, and Quick Assignment.

---

#### CMP-150 — SmartSelectionPanel

**Description:** AI-assisted recommendation panel for contractor assignment.

**UI/design:** Ranked list with explainability, risk flags, and user override.

**Used in screens:** `Appendix.md` §25.1 SCR-033 — Assign Contractor to Milestone, `Appendix.md` §25.1 SCR-034 — Contractor Smart Selection.

**Workflow references:** `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

#### CMP-151 — AssignmentCostAllocator

**Description:** Allocates milestone budget to contractor assignment.

**UI/design:** Shows milestone budget, assigned contractor amount, rate/quote, remaining unallocated budget, variance warnings.

**Used in screens:** `Appendix.md` §25.1 SCR-033 — Assign Contractor to Milestone.

**Workflow references:** `Appendix.md` §26.5 Contractor Cost and Budget Integration.

---

#### CMP-152 — GuestContractorQuickCreate

**Description:** Lightweight contractor creation for audit-only records.

**UI/design:** Minimal form: name/company, trade, contact optional, notes, reason. Clearly marked as guest/audit-only.

**Used in screens:** `Appendix.md` §25.1 SCR-033 — Assign Contractor to Milestone, `Appendix.md` §25.1 SCR-031 — Contractor Directory.

**Workflow references:** `Appendix.md` §26.3 Contractor Domain Model.

---

#### CMP-153 — ContractorFitScore

**Description:** Fit score indicator for a contractor relative to a milestone.

**UI/design:** Score plus short explanation. Should not appear as black-box magic.

**Used in screens:** `Appendix.md` §25.1 SCR-033 — Assign Contractor to Milestone, `Appendix.md` §25.1 SCR-034 — Contractor Smart Selection.

**Workflow references:** `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

#### CMP-154 — ContractorRankingTable

**Description:** Ranked table of contractors for selection or performance analysis.

**UI/design:** Sortable table with score, cost, availability, location, performance, safety, and explanation columns.

**Used in screens:** `Appendix.md` §25.1 SCR-034 — Contractor Smart Selection, `Appendix.md` §25.1 SCR-037 — Contractor Performance Dashboard.

**Workflow references:** `Appendix.md` §26.4 Contractor Performance History; `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

#### CMP-155 — RecommendationExplanation

**Description:** Explanation of why a contractor is recommended.

**UI/design:** Concise evidence-backed explanation with expandable details and source factors.

**Used in screens:** `Appendix.md` §25.1 SCR-034 — Contractor Smart Selection.

**Workflow references:** `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

#### CMP-156 — ContractorComparisonDrawer

**Description:** Side-by-side comparison of shortlisted contractors.

**UI/design:** Compare rate, availability, skill fit, historical performance, incidents, distance, notes.

**Used in screens:** `Appendix.md` §25.1 SCR-034 — Contractor Smart Selection.

**Workflow references:** `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

#### CMP-157 — DailyUpdateForm

**Description:** Site Superintendent daily progress update form.

**UI/design:** Mobile-first, fast, structured. Captures work performed, progress, blockers, evidence, contractor presence.

**Used in screens:** `Appendix.md` §25.1 SCR-035 — Site Superintendent Daily Update.

**Workflow references:** `Appendix.md` §26.8 Site Superintendent Daily Update Workflow.

---

#### CMP-158 — ContractorPresencePicker

**Description:** Allows Site Superintendent to mark which contractors/crews were on site.

**UI/design:** Quick checklist/autocomplete from assigned contractors plus guest contractor option.

**Used in screens:** `Appendix.md` §25.1 SCR-035 — Site Superintendent Daily Update.

**Workflow references:** `Appendix.md` §26.8 Site Superintendent Daily Update Workflow; `Appendix.md` §26.9 Site Superintendent Communication and Work Requests.

---

#### CMP-159 — WorkPerformedChecklist

**Description:** Checklist of work performed that day by milestone/contractor.

**UI/design:** Grouped by milestone and contractor. Supports percentage/progress notes.

**Used in screens:** `Appendix.md` §25.1 SCR-035 — Site Superintendent Daily Update.

**Workflow references:** `Appendix.md` §26.8 Site Superintendent Daily Update Workflow.

---

#### CMP-160 — SiteIssueReporter

**Description:** Reports blockers, incidents, safety issues, or field exceptions.

**UI/design:** Issue type, severity, notes, photos, contractor involved, milestone link.

**Used in screens:** `Appendix.md` §25.1 SCR-035 — Site Superintendent Daily Update.

**Workflow references:** `Appendix.md` §26.8 Site Superintendent Daily Update Workflow; `Appendix.md` §26.9 Site Superintendent Communication and Work Requests.

---

#### CMP-161 — SiteSuperTaskCard

**Description:** Work request card for Site Superintendent queue.

**UI/design:** Shows requested action, related milestone, due time, requester, priority, evidence requirement.

**Used in screens:** `Appendix.md` §25.1 SCR-036 — Site Superintendent Work Queue.

**Workflow references:** `Appendix.md` §26.9 Site Superintendent Communication and Work Requests.

---

#### CMP-162 — AutomationPromptCard

**Description:** Card generated by an automation asking the Site Superintendent for an update/action.

**UI/design:** Shows automation trigger, requested response, due time, linked milestone/build.

**Used in screens:** `Appendix.md` §25.1 SCR-036 — Site Superintendent Work Queue.

**Workflow references:** `Appendix.md` §26.8 Site Superintendent Daily Update Workflow.

---

#### CMP-163 — PerformanceBreakdownFilters

**Description:** Filters contractor analytics by project type, square footage, work quantity, milestone type, geography, and time period.

**UI/design:** Analytics filter bar with saved views later.

**Used in screens:** `Appendix.md` §25.1 SCR-037 — Contractor Performance Dashboard.

**Workflow references:** `Appendix.md` §26.4 Contractor Performance History.

---

#### CMP-164 — ContractorBenchmarkChart

**Description:** Visual comparison of contractor performance against category benchmarks.

**UI/design:** Chart/table hybrid showing cost variance, schedule variance, quality, incidents.

**Used in screens:** `Appendix.md` §25.1 SCR-037 — Contractor Performance Dashboard.

**Workflow references:** `Appendix.md` §26.4 Contractor Performance History.

---

#### CMP-165 — IncidentRatePanel

**Description:** Summarizes incident and safety violation rate.

**UI/design:** Shows incident count, severity mix, trend, and drilldown.

**Used in screens:** `Appendix.md` §25.1 SCR-037 — Contractor Performance Dashboard.

**Workflow references:** `Appendix.md` §26.4 Contractor Performance History; `Appendix.md` §26.7 Smart Selection and AI-Assisted Contractor Recommendation.

---

### 26.12 Workflow Additions

#### Flow — Assign Contractor to Milestone

1. User opens milestone from Build Workspace.
2. User clicks Assign Contractor.
3. System opens Contractor Assignment Drawer.
4. User searches by name, trade, skill, company, or location.
5. System shows matching contractors and Smart Selection recommendations.
6. User selects contractor or creates guest contractor.
7. User enters planned dates, rate/quote, assignment role, and assigned budget amount.
8. System validates assignment against milestone budget, contractor availability, location/range, and skill fit.
9. User confirms assignment.
10. Assignment is recorded and reflected in milestone cost/budget context.

#### Flow — Smart Contractor Selection

1. User opens Smart Selection for a milestone.
2. System identifies required trade/skill and project context.
3. System ranks contractors by fit.
4. User reviews explanation, cost, availability, history, and risk flags.
5. User selects contractor or overrides recommendation.
6. System records selected contractor and assignment reason/metadata.

#### Flow — Site Superintendent Daily Update

1. Automation, schedule, user action, or kanban work request prompts update.
2. Site Superintendent opens Daily Update flow.
3. Site Superintendent marks contractors present.
4. Site Superintendent records work performed by milestone.
5. Site Superintendent uploads photos/notes.
6. Site Superintendent reports blockers or incidents.
7. System geofence-verifies where required.
8. Update is submitted.
9. Build Workspace, milestone history, contractor history, and audit trail are updated.
10. Any critical issue creates work order or notification.

#### Flow — Site Superintendent Work Request

1. Admin, lender staff, builder lead, or automation creates a work request.
2. Request is assigned to Site Superintendent.
3. Request appears in Site Superintendent Work Queue.
4. Site Superintendent completes requested update/evidence/action.
5. Completion attaches to Build/Milestone/Work Order.
6. Request closes or routes for review.

---

### 26.13 Permissions Additions

Recommended role permissions:

| Capability | Builder Lead | Builder Staff | Site Superintendent | Lender Staff | Lender Admin |
|---|---:|---:|---:|---:|---:|
| View assigned contractors on own Build | Yes | Yes | Yes | Yes | Yes |
| Create contractor profile | Yes | Configurable | Configurable | No | Yes |
| Create guest contractor | Yes | Yes | Yes | Yes | Yes |
| Edit contractor profile | Yes, own org | Configurable | Configurable | No | Yes |
| Assign contractor to milestone | Yes | Configurable | Configurable | No | Yes |
| View contractor performance analytics | Yes, own org | Configurable | Configurable | Configurable | Yes |
| View safety/incident history | Configurable | Configurable | Configurable | Configurable | Yes |
| Submit daily update | Optional | Optional | Yes | No | Yes |
| Receive automation prompt | Optional | Optional | Yes | Optional | Yes |
| Receive kanban work request | Optional | Optional | Yes | Yes | Yes |
| Final approve milestone/draw | No | No | No | No | Yes |

---

### 26.14 Audit Events Additions

The following events should be audited:

- contractor profile created,
- contractor profile updated,
- guest contractor created,
- contractor assigned to milestone,
- contractor removed/replaced on milestone,
- contractor rate changed,
- contractor availability changed,
- contractor skill ranking changed,
- contractor incident recorded,
- safety violation recorded,
- Smart Selection recommendation viewed,
- Smart Selection recommendation accepted,
- Smart Selection recommendation overridden,
- site superintendent daily update submitted,
- contractor presence confirmed,
- site issue reported,
- automation prompt sent,
- automation prompt completed,
- site superintendent work request created,
- site superintendent work request completed.

---

### 26.15 MVP Recommendation

Contractor management is valuable, but the full contractor intelligence layer is large. Recommended implementation sequencing:

#### MVP-Compatible Slice

- Contractor profile basics.
- Guest contractor creation.
- Assign contractor to milestone.
- Contractor search/autocomplete.
- Contractor hourly rate / quote attached to milestone assignment.
- Basic contractor presence in Site Superintendent daily update.
- Site Superintendent role.
- Site Superintendent daily update flow.
- Site Superintendent work requests.

#### Phase 2

- Contractor performance analytics.
- Historical ranking by project type/square footage/work quantity.
- Availability calendar.
- Incident/safety tracking.
- Contractor cost benchmarking.

#### Phase 3

- Smart Selection.
- AI-assisted contractor recommendations.
- Advanced contractor fit scoring.
- Predictive milestone cost estimation from contractor history.
- Cross-build contractor intelligence dashboard.

The data model should be designed now so that Phase 2 and Phase 3 are natural extensions, but the MVP should avoid blocking core draw-management workflows on sophisticated contractor analytics.



---

### 26.16 Stretch Goal Data Strategy — Contractor-Informed Estimation and Cross-Job Optimization

Contractor analytics, Smart Selection, and cross-job allocation are stretch goals, but the required data must be captured from the beginning. If DrawFlow does not collect structured contractor, work-quantity, schedule, cost, and outcome data during normal milestone execution, later optimization will be impossible or will rely on low-quality manual backfill.

This section defines the data strategy needed to support future contractor-informed price estimation, time estimation, sanity checks, capacity forecasting, and multi-build contractor allocation.

#### Product Thesis

Milestone estimates become more accurate when the system knows:

- what type of build is being performed,
- the square footage and physical scale of the build,
- the quantity of each type of work required,
- which contractor or crew performed the work,
- what rate or quote was used,
- how long the work actually took,
- how much it actually cost,
- what quality/rework/safety outcomes occurred,
- and how similar work performed across historical builds.

The long-term goal is for DrawFlow to use accumulated operational history to produce better estimates and better contractor assignment recommendations.

The system should eventually answer:

- What should this milestone cost for this build type, size, geography, and work quantity?
- How long should this milestone take with this contractor or crew?
- Is the proposed budget materially outside historical norms?
- Is the proposed duration materially unrealistic?
- Which contractors have available capacity for the required work window?
- Which contractor allocation across multiple active builds minimizes delay, travel waste, budget variance, and quality risk?
- Which contractor is best suited for this milestone given trade, quantity, location, schedule, cost, quality, and historical performance?

#### Required Data to Track Now

The following data should be captured during MVP-compatible workflows even if advanced optimization is deferred.

##### Build-Level Attributes

Track structured build descriptors:

- build type,
- project type,
- property type,
- square footage,
- number of floors,
- number of units where applicable,
- construction class/category,
- site location,
- geography/market,
- lot/site complexity,
- target start/end dates,
- approved budget,
- approved loan amount,
- borrower working-capital limit.

##### Milestone-Level Work Quantity

Each milestone should support quantity descriptors, not just cost and duration.

Examples:

- framing: square footage, linear feet, number of floors, roof complexity,
- drywall: board count, square footage, finish level,
- electrical: number of panels, circuits, fixtures, rough-in points,
- plumbing: fixture count, rough-in points, line length,
- roofing: square footage, pitch, material type,
- excavation: cubic yards, depth, soil/rock complexity,
- concrete/foundation: cubic meters/yards, linear feet, wall height,
- flooring: square footage, material type,
- painting: square footage, coats, interior/exterior.

The product should support a trade-specific quantity schema over time. For MVP, this can start as optional structured fields plus notes, but the model should anticipate normalized quantity types.

##### Contractor Assignment Data

Track each contractor assignment with:

- contractor ID,
- milestone ID,
- trade/skill being performed,
- assigned work quantity,
- assigned budget amount,
- quoted amount,
- hourly rate,
- estimated hours,
- planned start/end dates,
- actual start/end dates,
- crew size where known,
- assigned role,
- replacement/substitution events,
- assignment status.

##### Actual Performance Data

Track actual execution outcomes:

- actual cost incurred,
- actual labor hours where available,
- actual duration,
- start delay,
- completion delay,
- schedule variance,
- cost variance,
- quantity completed,
- productivity rate where calculable,
- rework required,
- site visit issues,
- milestone rejection events,
- quality notes,
- safety incidents,
- blocker events,
- weather/site condition notes where captured.

##### Outcome and Review Data

Track lender/admin review outcomes:

- evidence accepted/rejected,
- geofence verification result,
- site visit required or waived,
- site visit findings,
- staff recommendation,
- admin approval/rejection,
- reasons for rejection,
- reasons for override,
- draw delay attributable to milestone/contractor/evidence issue.

##### Capacity and Availability Data

Track contractor capacity signals:

- declared availability,
- working calendar,
- unavailable dates,
- current assignments,
- planned future assignments,
- overlapping commitments,
- service radius,
- distance to build site,
- travel burden estimate,
- crew size or capacity units where known,
- max concurrent jobs where known.

This data supports future cross-job allocation.

#### Future Estimation Capabilities

With sufficient data, DrawFlow should support contractor-informed estimation.

Possible estimation outputs:

- expected milestone cost range,
- expected milestone duration range,
- expected cost by contractor,
- expected duration by contractor,
- confidence interval,
- historical comparable projects,
- sanity check warning,
- estimate explanation.

Example sanity checks:

- “Drywall estimate is 28 percent below historical median for similar square footage and finish level.”
- “Framing duration is shorter than 90 percent of comparable detached builds of this size.”
- “This contractor’s historical schedule variance on similar work is +18 percent.”
- “Assigned contractor is outside preferred driving range for this site.”

#### Future Capacity Optimization

DrawFlow should eventually support allocation optimization across multiple active builds.

The optimization problem should consider:

- contractor availability,
- milestone required skills,
- milestone time windows,
- dependency constraints,
- working-capital constraints,
- location/travel distance,
- hourly rate/quote,
- historical cost variance,
- historical schedule variance,
- quality/rework risk,
- safety/incident risk,
- contractor capacity limits,
- builder/lender preferences.

Future output should include:

- recommended contractor assignment per milestone,
- conflict warnings,
- projected capacity bottlenecks,
- alternative assignment scenarios,
- cost/time tradeoffs,
- risk-adjusted recommendation explanations.

This should be treated as a planning recommendation layer, not an autonomous assignment system. Users remain responsible for final contractor assignment.

#### Data Model Implication

DrawFlow should avoid modeling milestones as only `{name, cost, duration}`. That is too thin for future optimization.

The model should support:

- milestone category,
- trade/skill requirements,
- quantity-of-work fields,
- unit types,
- complexity factors,
- assigned contractor(s),
- planned vs actual cost,
- planned vs actual time,
- contractor performance outcomes,
- review outcomes,
- and site conditions.

Even if the UI exposes only a simplified version in MVP, the schema and event model should preserve enough structure to support later estimator and allocation engines.

#### MVP Data Capture Requirement

MVP does not need to implement advanced contractor estimation or allocation optimization, but MVP should capture the foundational data required for those systems.

Minimum recommended MVP data capture:

- contractor assigned to milestone,
- contractor trade/skill category,
- contractor hourly rate or quote,
- assigned budget amount,
- milestone work quantity notes or structured quantity field,
- planned start/end,
- actual start/end,
- actual cost,
- site superintendent daily updates,
- contractor presence on site,
- incident/safety notes,
- staff/admin review outcome,
- milestone approval/rejection outcome.

This is the compromise: keep the advanced intelligence as a stretch goal, but make the normal workflow generate clean training/analytics data from day one.



---

