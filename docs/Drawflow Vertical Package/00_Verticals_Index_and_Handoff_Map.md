# DrawFlow Vertical Package Index and Handoff Map

This package decomposes DrawFlow into implementation **verticals**. A vertical is a complete module boundary that includes backend, frontend, tests, contracts, and integration handoffs. Each vertical contains:

1. **Actual agile epic / Linear project** — outcome, verifiability, definition of done.
2. **PRD for that vertical** — requirements, use cases, context, boundaries, and handoffs.
3. **Spec** — contracts, types, schemas, UX flows, and explicit integration points.

The Foundation vertical must land first. Other verticals can be developed against stubs if they respect its contracts.

---

## Files

| File | Vertical |
|---|---|
| `00_Tightened_PRD.md` | Single tightened MVP PRD. |
| `01_Foundation_Contracts_State_Machines.md` | Auth shell, tenancy, schema/types, governed transitions, audit, outbox. |
| `02_Proposal_Building_Activation.md` | Proposal builder, draft Gantt, activation, approved baseline. |
| `03_Draw_Planning_Engine.md` | Deterministic planning engine, capital constraints, compound interest estimates. |
| `04_Build_Workspace_Timeline.md` | Workspace, Gantt/timeline, approved-vs-actual/forecast, warnings. |
| `05_Completion_Claims_Evidence.md` | Completion claims, structured proof upload, lower draw request, evidence pipeline. |
| `06_Verification_Site_Visits.md` | Evidence-first verification and discretionary site visits. |
| `07_Draw_Release_Manual_Recording.md` | Draw eligibility, admin release approval, manual release record. |
| `08_Policy_Financial_Estimates.md` | Versioned policies, fee/interest estimates, reimbursement policy. |
| `09_MIC_Read_API_Webhooks.md` | Read-only API, MIC projection, evidence access, webhook registry. |
| `10_Revisions_Forecasts_Corrections.md` | Approved baseline vs forecast/actual, slippage, corrections, material revisions. |
| `11_Ops_Queues_Notifications_Chat.md` | Queues, kanban-as-visualization, notifications, chat as non-state communication. |
| `12_Open_Questions_and_Decision_Log.md` | Remaining product ambiguities and recommended defaults. |

---

## Dependency model

```text
01 Foundation
  ├─ 02 Proposal Building and Activation
  ├─ 03 Draw Planning Engine
  ├─ 04 Build Workspace and Timeline
  ├─ 05 Completion Claims and Evidence
  ├─ 06 Verification and Site Visits
  ├─ 07 Draw Release and Manual Recording
  ├─ 08 Policy and Financial Estimates
  ├─ 09 MIC Read API and Webhooks
  ├─ 10 Revisions, Forecasts, and Corrections
  └─ 11 Ops Queues, Notifications, and Chat
```

Recommended real implementation order after Foundation:

1. Proposal Building and Activation.
2. Policy and Financial Estimates.
3. Draw Planning Engine.
4. Build Workspace and Timeline.
5. Completion Claims and Evidence.
6. Verification and Site Visits.
7. Draw Release and Manual Recording.
8. MIC Read API and Webhooks.
9. Revisions, Forecasts, and Corrections.
10. Ops Queues, Notifications, and Chat.

---

## Handoff map

| Consumer vertical | Required handoff contract | Producer/source |
|---|---|---|
| Proposal | Tenant/session/contracts/policies | Foundation |
| Planning Engine | Milestones, dependencies, policy snapshots, working capital | Proposal + Policy |
| Workspace | `BuildWorkspaceProjection` | Workspace projection service |
| Completion Claims | `Milestone`, `EvidenceRequirement`, transition service | Foundation + Policy + Workspace context |
| Verification | `CompletionClaim`, `EvidencePackage`, `SiteVisit` | Claims/Evidence |
| Draw Release | Approved completion claims and draw groups | Verification + Planning |
| MIC API | Workspace projection, observer grants, evidence visibility | Workspace + Evidence + Foundation |
| Webhooks | Domain event outbox | Foundation |
| Forecast/Revisions | Approved baseline version set | Proposal + Foundation |
| Queues/Notifications | Domain events and work items | Foundation + all vertical events |

---

## Contract-first rule

Before implementation, every vertical must identify:

1. consumed Foundation types,
2. emitted domain events,
3. emitted audit events,
4. owned state machines,
5. command/transition endpoints,
6. required permissions,
7. workspace projection fields it reads/writes,
8. user/role visibility rules,
9. test fixtures proving boundary behavior.
