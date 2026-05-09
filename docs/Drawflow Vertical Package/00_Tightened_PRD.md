# DrawFlow Tightened MVP PRD

**Product:** DrawFlow  
**Document type:** Tightened PRD  
**Status:** Scope-clarified MVP draft  
**Last updated:** May 8, 2026  
**Inputs:** Original DrawFlow PRD plus follow-up scoping decisions from the product review conversation.

---

## 1. Executive summary

DrawFlow is a tenant-scoped construction draw workflow product for lenders, builders, and authorized observers. The MVP should not attempt to be a generic construction-management suite. Its wedge is narrower:

> DrawFlow records planned construction milestones, lender-approved milestone values, builder completion claims, uploaded proof, discretionary verification decisions, optional site visits, draw eligibility, manual draw-release approvals, operational audit history, and read-only project state for downstream portals.

The MVP is reimbursement-only in the workflow sense: builders complete milestone work first, upload proof, and only after completion approval can the associated approved milestone value become eligible for draw release. DrawFlow is not the authoritative system for ledger balances, servicing interest, accounting entries, payments, settlement, or funds movement. It is closer to a specialized construction draw CRM / workflow control plane.

Implementation should be organized as **verticals**, not loose agile epics. The first vertical must establish contracts: authenticated shell, tenant model, canonical schemas, shared TypeScript types, governed transition architecture, policy contracts, audit events, domain events, and outbox/webhook primitives. Later verticals should be buildable against stubs if they respect those contracts.

---

## 2. Core MVP lifecycle

```text
Proposal build
→ approved baseline budget / roadmap / draw plan
→ active Build Workspace
→ builder claims milestone completion
→ builder/staff uploads proof
→ verifier reviews evidence
→ discretionary site visit if evidence is insufficient or policy requires it
→ verifier approves or rejects milestone completion
→ draw group becomes eligible when included milestones are approved
→ admin separately approves draw release
→ admin manually records draw as released
→ audit + events + read-model projections preserve the history
```

The system does **not** claim to objectively prove construction quality. It records evidence and human verification decisions.

---

## 3. Locked scope decisions

| Area | MVP decision |
|---|---|
| Offline sync | Out of scope. Online responsive/PWA-style capture only. |
| Geofencing | Out of scope. No physical-presence verification claims. |
| Verification model | Evidence-first, site visit discretionary. |
| Completion proof | Required for every milestone completion claim. |
| Completion approval vs draw release | Decoupled. Completion approval creates eligibility; draw release requires separate admin action. |
| Reimbursement basis | Approved milestone value, not documented actual cost. |
| Cost evidence | Not required for v1. |
| Overruns | Not reimbursed in v1. Builder can pursue other loan products outside DrawFlow. |
| Under-budget/lower draw | Builder can request a lower draw amount than approved milestone value. This is in MVP. |
| Financial authority | DrawFlow is workflow/CRM truth, not payment/ledger/servicing truth. |
| Fees | Configurable and estimated separately. Fees are not capitalized and do not compound. |
| Interest | Planning estimate only. Interest compounds. |
| Timeline | Approved baseline separated from active forecast/actual reality. |
| Gantt drag | Allowed in proposal-building mode for planned dates. Active build drift updates forecast/actual only. |
| Site visits | Admin/verifier can order if evidence is insufficient. Not default-required for all milestones. |
| API/webhook | Read-only API and webhook registry/event publishing are in MVP. Future CRUD should be architecturally supported. |
| MIC portal | Required. Provide workspace projection and conservative evidence access. |
| Chat | Convenience feature only; not workflow state. |
| White label | Deferred. Tenant-safe architecture remains mandatory. |
| Contractor registry/analytics | Deferred/stretch only. |

---

## 4. Goals

1. Let builders construct a proposal with milestone budgets, dates, dependencies, and working-capital assumptions.
2. Generate deterministic draw-plan recommendations as editable starting points.
3. Freeze an approved baseline after lender/admin approval.
4. Provide a shared Build Workspace showing approved baseline, actual/forecast state, milestone status, draw group status, warnings, and actions.
5. Let builders claim milestone completion by uploading structured proof.
6. Let authorized verifiers review evidence, request more information, order site visits, approve completion, or reject completion.
7. Let admins separately approve and manually record draw releases.
8. Preserve audit history and domain events for decisions and integrations.
9. Provide a read-only workspace API for a MIC portal or other FairLend product.
10. Use WorkOS for identity/org primitives while keeping domain-specific resource authorization in DrawFlow.

---

## 5. Non-goals / deferred

DrawFlow MVP is not:

- a full construction project-management suite,
- a contractor marketplace,
- contractor smart selection,
- contractor analytics,
- superintendent daily updates,
- offline-first field software,
- geofence/anti-spoofing software,
- native mobile app,
- payment rails,
- ledger/accounting/servicing authority,
- full public CRUD API,
- developer portal,
- white-label SaaS admin,
- compliance-certified audit product,
- cost-evidence reimbursement workflow,
- budget-overrun financing workflow,
- builder receipt/double-confirmation workflow.

---

## 6. Users and authorization

| Persona | Responsibilities |
|---|---|
| Builder / developer principal | Proposal, budget/milestones, working-capital inputs, completion claims, lower-draw request. |
| Builder staff | Upload proof, assist claims, update progress where allowed; restricted financial visibility. |
| Lender verifier/staff | Review evidence, request more info, order site visits, verify completion where permitted. |
| Lender admin | Approve activation, verify/override completion, approve release, record release, configure policy. |
| Site visitor / inspector | Complete online site visit report and upload site evidence. |
| MIC observer | Read-only status/evidence view via API with conservative visibility. |
| Platform admin | Support/ops access with strict audit requirements. |

Authorization should layer:

```text
WorkOS authenticated identity
→ WorkOS org/RBAC/FGA primitive
→ DrawFlow tenant/resource grant
→ build participant or observer grant
→ transition-specific guard
→ domain mutation + audit + event
```

---

## 7. Requirements by module

### 7.1 Proposal and activation

A builder can create a draft proposal with build identity, location metadata, milestones, approved value candidates, dates, dependencies, working capital, and selected draw plan. Proposal-mode Gantt date dragging mutates draft planned dates.

Admin approval activates the build and freezes:

```text
ApprovedPlanVersionSet = BudgetVersion + RoadmapVersion + DrawPlanVersion
```

### 7.2 Draw Planning Engine

The engine generates deterministic starting plans using milestone approved values, dependencies, working-capital constraints, draw fees, compound interest estimates, draw policy, and takeout/payoff horizon. Outputs must include assumptions, warnings, explanation steps, total fees, estimated compound interest, total estimated financing cost, and peak unreimbursed exposure.

Use language like **recommended starting plan**, not “perfect optimizer.”

### 7.3 Build Workspace

The workspace should expose approved baseline, actual/forecast reality, milestone state, draw groups, completion claims, evidence/verification state, release state, warnings, and role-specific actions. It should avoid both excessive screen fragmentation and a single god-screen.

Behind-schedule milestones should be visually alarming at a glance.

### 7.4 Completion claims and evidence

To claim a milestone complete, the builder/staff uploads proof and optionally requests a lower draw amount. Completion proof is required. Cost evidence is not required in v1.

### 7.5 Verification and site visits

An authorized verifier/admin reviews proof and can approve completion, reject completion, request more info, or order a site visit. Site visits are evidence-first/discretionary by default.

### 7.6 Draw release

Completion approval does not automatically release funds. A draw group becomes eligible when included milestones have approved completion. Admin separately approves release and manually records release. DrawFlow must use language such as “release approved” and “manual release recorded,” not “funds disbursed” unless an authoritative external system confirms it.

### 7.7 Policy and finance

Policies must be versioned and snapshot-driven. MVP policy defaults:

```text
reimbursement basis = approved_milestone_value
cost evidence required = false
overrun treatment = not_reimbursable
builder lower draw request = allowed
fees = configurable, not capitalized
interest = compound planning estimate
```

### 7.8 API / MIC / webhooks

Expose read-only workspace projections and conservative evidence access. Webhooks are driven by the domain outbox. The most important event for downstream portals is `workspace_projection.updated`, letting the portal refetch canonical state.

---

## 8. Critical open questions

1. Daily or monthly compounding?
2. Actual/365 or Actual/360?
3. Does interest accrue on release date or day after release?
4. How are draw fees paid/charged operationally if not capitalized?
5. Which exact roles can verify completion?
6. Which evidence is visible to MIC observers?
7. If builder requests less than approved amount, is the remaining approved balance waived, preserved, or manually recoverable?
8. How much material revision workflow is needed in v1?
9. Can dependencies/draw groups change after activation?
10. Should policy configuration be support-managed or minimally self-serve?

---

## 9. MVP definition of done

DrawFlow MVP is done when a production-like build can complete this loop:

```text
Builder creates proposal
→ planning engine recommends draw plan with working-capital and compound-interest estimates
→ admin approves proposal and activates Build
→ workspace shows approved baseline and active forecast state
→ builder claims milestone completion with proof and optional lower draw amount
→ verifier reviews proof and optionally orders site visit
→ verifier/admin approves completion
→ draw group becomes eligible
→ admin approves release
→ admin manually records release
→ MIC portal can read permitted workspace state/evidence
→ audit/events/webhooks record the lifecycle
```

All material state transitions must be guarded server-side, audited, and covered by tests.
