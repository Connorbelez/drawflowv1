# Timeline Proposal Submission & Backoffice Review — Design Spec

**Date:** 2026-05-25
**Status:** Revised after repo-trace review
**Scope:** Builder timeline-demo → submit proposal → admin review/adjust/approve → operational build promotion.

---

## 1. Problem Statement

Today `/demo/timeline` builds a `demo_timelinePlans` row at `status="draft"`. There is no path from a generated timeline plan to admin review or to an operational/approved build. The existing backoffice "Submitted Proposals" surface reads `demo_backofficeProposalCards` populated by the older `demo_drawflow` builds flow, not by timeline plans. There is no admin review screen for timeline-shaped proposals.

This spec defines:
- Builder "Submit Proposal" action on `/demo/timeline`.
- Immutable normalized snapshot of plan + milestones + draws + capital events at submit time.
- Backoffice review screen for admin to inspect, adjust, set start date, then approve or reject/archive.
- Approval promotion of timeline plan rows into operational build rows (`demo_builds`, `demo_milestones`, `demo_drawGroups`, `demo_capitalEvents`).

## 2. Goals

- Builder can submit a generated timeline plan; once submitted, plan is locked.
- Admin sees submitted plans on backoffice dashboard and reviews each on a dedicated screen.
- Admin can edit working copy of plan (milestones, draws, plan-level fields) without mutating the immutable snapshot.
- Admin sets a required `startDate` (≥ today) on approval.
- Approval atomically promotes the working copy into operational rows; rejection archives the plan with a reason.

## 3. Non-goals

- Multi-round revision (reject → back-to-draft → resubmit).
- Builder editing after approval.
- Notification delivery (in-app/email). Admin note is stored only.
- Snapshot history beyond a single submitted→approved/archived cycle.
- Authentication hardening (matches existing demo identity posture).

## 4. User Stories

### 4.1 Builder
- **US-B1** After generating timeline, builder sees "Submit Proposal" CTA. Click → confirm modal → plan flips `draft`→`submitted`, snapshot frozen.
- **US-B2** While `submitted`, timeline route renders read-only banner ("Submitted, awaiting review"); all edit controls disabled.
- **US-B3** On approval, builder sees approved state with absolute calendar dates derived from admin-set `startDate` + admin's adjusted values. Read-only.
- **US-B4** On rejection/archive, builder sees archived state with admin note. (Re-start flow out of scope.)

### 4.2 Backoffice admin
- **US-A1** Submitted Proposals kanban shows one card per `submitted` timeline plan with builder name, build name, total budget, submitted-at, draw count, milestone count.
- **US-A2** Card click → `/backoffice/proposals/$planId` review screen.
- **US-A3** Review screen exposes editable working copy beside immutable snapshot. Admin edits:
  - Milestones: `name`, `budget`, `dayStart`, `dayEnd` (duration), `order`, `included`.
  - Draws: `label`, `amount`, `dayOffset`; add/remove draws.
  - Plan-level: `totalBudget`, `workingCapitalLimit`, `borrowerCoPay`, `lenderDrawPolicyLimit`, `flatDrawFee`, `interestRate`, `planName`.
- **US-A4** Admin MUST set `startDate` (≥ floor(today UTC)) before approve; UI gates approve button on validation.
- **US-A5** Admin writes optional `adminNote` to builder.
- **US-A6** Approve → plan `submitted`→`approved`; linked `demo_builds` row becomes `active`; `demo_milestones`, `demo_drawGroups`, and `demo_capitalEvents` materialized with absolute dates; kanban card moves out of Submitted column.
- **US-A7** Reject → plan `submitted`→`archived` with note; card disappears from Submitted column.
- **US-A8** Diff indicator next to each working-copy field differing from snapshot value.

## 5. State Machine

```
draft ──submit──▶ submitted ──approve──▶ approved (terminal)
                       │
                       └──reject──▶ archived (terminal)
```

Transition guards:
- `draft → submitted`: requires plan row with all child rows non-empty (at least one included milestone).
- `submitted → approved`: requires `startDate >= floor(now to UTC midnight)`.
- `submitted → archived`: no required field beyond optional `archivedReason`.

Invariants:
- `status === "submitted"` ⇒ `submittedSnapshotId !== null` AND `submittedAt !== null`.
- `status === "approved"` ⇒ `startDate !== null` AND `approvedAt !== null`.
- `status === "archived"` ⇒ `archivedAt !== null`.
- Snapshot docs are write-once (enforced in mutation layer).
- Working-copy mutations gated on `status === "submitted"`; builder mutations gated on `status === "draft"`.

## 6. Data Model

### 6.1 New normalized snapshot tables

Convex documents should not carry unbounded child arrays. Submission writes one snapshot header and one row per frozen child.

```ts
demo_timelinePlanSnapshots: defineTable({
  orgKey: v.string(),
  planId: v.id("demo_timelinePlans"),
  buildId: v.id("demo_builds"),
  submittedAt: v.number(),
  submittedByPersona: v.string(),
  planName: v.string(),
  totalBudget: v.number(),
  workingCapitalLimit: v.number(),
  borrowerCoPay: v.number(),
  lenderDrawPolicyLimit: v.number(),
  flatDrawFee: v.number(),
  interestRate: v.number(),
})
  .index("by_plan", ["planId"])
  .index("by_build", ["buildId"])
  .index("by_org_status", ["orgKey", "submittedAt"]);

demo_timelinePlanSnapshotMilestones: defineTable({
  orgKey: v.string(),
  snapshotId: v.id("demo_timelinePlanSnapshots"),
  planId: v.id("demo_timelinePlans"),
  buildId: v.id("demo_builds"),
  sourceTimelineMilestoneId: v.id("demo_timelineMilestones"),
  name: v.string(),
  budget: v.number(),
  dayStart: v.number(),
  dayEnd: v.number(),
  order: v.number(),
  included: v.boolean(),
  iconKey: v.optional(v.string()),
}).index("by_snapshot", ["snapshotId"]);

demo_timelinePlanSnapshotDraws: defineTable({
  orgKey: v.string(),
  snapshotId: v.id("demo_timelinePlanSnapshots"),
  planId: v.id("demo_timelinePlans"),
  buildId: v.id("demo_builds"),
  sourceTimelineDrawId: v.id("demo_timelineDraws"),
  label: v.string(),
  amount: v.number(),
  dayOffset: v.number(),
  kind: v.string(),
}).index("by_snapshot", ["snapshotId"]);

demo_timelinePlanSnapshotCapitalEvents: defineTable({
  orgKey: v.string(),
  snapshotId: v.id("demo_timelinePlanSnapshots"),
  planId: v.id("demo_timelinePlans"),
  buildId: v.id("demo_builds"),
  sourceTimelineCapitalEventId: v.id("demo_timelineCapitalEvents"),
  kind: v.string(),
  dayOffset: v.number(),
  amount: v.number(),
  label: v.optional(v.string()),
}).index("by_snapshot", ["snapshotId"]);
```

### 6.2 Added fields on `demo_timelinePlans`

| Field | Type | Purpose |
| --- | --- | --- |
| `orgKey` | `v.optional(v.string())` during migration, then required | demo org-scope stand-in |
| `ownerPersona` | `v.optional(v.string())` during migration, then required | builder dashboard ownership (`mock_builder`) |
| `submittedAt` | `v.optional(v.number())` | epoch ms of submit |
| `submittedByPersona` | `v.optional(v.string())` | submitter persona (`mock_builder`) |
| `submittedSnapshotId` | `v.optional(v.id("demo_timelinePlanSnapshots"))` | snapshot back-reference |
| `approvedAt` | `v.optional(v.number())` | epoch ms of approve |
| `approvedByPersona` | `v.optional(v.string())` | admin persona (`mock_staff`) |
| `archivedAt` | `v.optional(v.number())` | epoch ms of archive |
| `archivedReason` | `v.optional(v.string())` | admin reason for reject |
| `adminNote` | `v.optional(v.string())` | free-text from admin → builder |
| `startDate` | `v.optional(v.string())` | ISO date anchor for absolute dates; set on approve |

Persona constants live in backend-safe `convex/demo_personas.ts`. Convex must not import constants from `src/`.

### 6.3 Approval translation

On approve, day offsets in working copy materialize as absolute ISO date strings:
- `plannedStartDate = addDaysIso(startDate, dayStart)`
- `plannedEndDate = addDaysIso(startDate, dayEnd)`
- `scheduledDate = addDaysIso(startDate, dayOffset)` (capital events)
- draw groups store `plannedStartDate` / `plannedEndDate` based on their source day offsets.

Upserts into operational tables MUST key on `(buildId, sourceTimelineMilestoneId)` / `(buildId, sourceTimelineDrawId)` / `(buildId, sourceTimelineCapitalEventId)` to avoid duplicating any pre-seeded operational rows. The operational draw table is `demo_drawGroups`; there is no `demo_draws` table.

## 7. Convex API Surface

All in `convex/demo_timeline_plans.ts` unless noted.

### 7.1 Mutations

| Name | Args | Preconditions | Effect |
| --- | --- | --- | --- |
| `demo_submitTimelinePlan` | `{ planId }` | `status === "draft"`; ≥1 included milestone | Insert snapshot header + child rows; patch plan to `submitted` with `submittedAt`, `submittedByPersona`, `submittedSnapshotId`. |
| `demo_adminUpdateTimelinePlan` | `{ planId, patch: { totalBudget?, workingCapitalLimit?, borrowerCoPay?, lenderDrawPolicyLimit?, flatDrawFee?, interestRate?, planName?, adminNote?, startDate? } }` | `status === "submitted"` | Shallow patch plan row. |
| `demo_adminUpdateTimelineMilestone` | `{ milestoneId, patch: { name?, budget?, dayStart?, dayEnd?, order?, included? } }` | parent plan `status === "submitted"` | Patch milestone row. |
| `demo_adminUpdateTimelineDraw` | `{ drawId, patch: { label?, amount?, dayOffset? } }` | parent plan `status === "submitted"` | Patch draw row. |
| `demo_adminAddTimelineDraw` | `{ planId, draw: { label, amount, dayOffset, kind } }` | `status === "submitted"` | Insert draw row. |
| `demo_adminRemoveTimelineDraw` | `{ drawId }` | parent plan `status === "submitted"` | Delete draw row. |
| `demo_approveTimelinePlan` | `{ planId, startDate, adminNote? }` | `status === "submitted"`; `startDate >= floor(now to UTC midnight)` | Patch plan to `approved`; promote `demo_builds`/`demo_milestones`/`demo_drawGroups`/`demo_capitalEvents`; return `{ planId, buildId, buildKey }`; reconcile kanban. |
| `demo_rejectTimelinePlan` | `{ planId, reason? }` | `status === "submitted"` | Patch plan to `archived` with `archivedAt`, `archivedReason`, `approvedByPersona: MOCK_STAFF_PERSONA`; reconcile kanban. |

### 7.2 Queries

| Name | Args | Returns |
| --- | --- | --- |
| `demo_listBuilderTimelinePlans` | `{ persona?: string }` | `Array<{ timelineId, planId, buildId, buildName, planName, status, totalBudget, milestoneCount, drawCount, updatedAt }>` filtered by `ownerPersona` |
| `demo_getTimelinePlanWorkspace` | `{ timelineId }` | workspace view model for `/demo/timeline/$timelineId`, including `status`, `readOnly`, plan, milestones, draws, and capital events |
| `demo_getSubmittedProposalsForBackoffice` | `{}` | `Array<{ planId, buildId, planName, ownerPersona, builderName, buildName, totalBudget, submittedAt, milestoneCount, drawCount }>` |
| `demo_getProposalReviewViewModel` | `{ planId }` | `{ plan, workingCopy: { milestones, draws, capitalEvents }, snapshot, build, builder }` |

### 7.3 Existing surfaces

- `demo_drawflow.demo_submitProposal` / `demo_drawflow.demo_approveProposal` remain untouched — orthogonal old-flow demo path.
- `convex/schema.ts` already has `demo_timelinePlanStatusValidator` with `draft|submitted|approved|archived`; no change required.

## 8. Routes & Screens

### 8.1 New route

`/backoffice/proposals/$planId` → `src/routes/backoffice/proposals.$planId.tsx`

Layout:
- **Header:** build name, builder name, submitted-at, status badge.
- **Left column (snapshot, read-only):** plan-level fields, milestones table (name, budget, dayStart, dayEnd, order, included), draws table (label, amount, dayOffset).
- **Right column (working copy, editable):** same shape, inline editable cells, diff badges where value ≠ snapshot.
- **Footer toolbar:** start-date picker (required, ≥ today), admin-note textarea, `[Reject / Archive]` button, `[Approve]` button (disabled until `startDate` set and ≥ today).

### 8.2 Modified routes

- `src/routes/demo/timeline/$timelineId.tsx` and its wrapped `TimelineDemoWorkspace` in `src/routes/demo/timeline/index.tsx`
  - Add "Submit Proposal" CTA visible when `status === "draft"`; opens confirm modal that calls `demo_submitTimelinePlan`.
  - When `status === "submitted"`: banner + edit-control lockdown (read-only views for milestones, draws, plan summary).
  - When `status === "approved"`: read-only view with absolute dates derived from `startDate` + offsets; render `adminNote`.
  - When `status === "archived"`: archived empty state with `archivedReason` and `adminNote`.
  - Thread explicit `readOnly` / `mode` props so locked screens do not receive edit mutation handlers.
  - Extract the inline draw-availability `EvilComposedChart` usage into a reusable route module and import that same chart in builder, submitted, and review tabs.

- `src/routes/backoffice/index.tsx`
  - `SubmittedProposalsCard`, `ProposalKanban`, and proposal metrics switch data source from `api.demo_drawflow.*` to `api.demo_timeline_plans.demo_getSubmittedProposalsForBackoffice`.
  - Card click → `navigate({ to: "/backoffice/proposals/$planId", params: { planId } })`.
  - Inline approve action removed; approval lives on review screen.

- `src/routes/demo/drawflow/builder-dashboard.tsx`
  - Lists `demo_listBuilderTimelinePlans({ persona: MOCK_BUILDER_PERSONA })`.
  - Open action routes to `/demo/timeline/$timelineId`.
  - Start-new action routes to the existing setup route `/demo/timeline`; it does not reuse the builder-proposal `startDraft` flow unless a bridge is implemented.

- `src/routes/backoffice/proposals.$planId.tsx`
  - After approval, terminal success state links to `/backoffice/builds/$buildKey`.
  - This spec does not claim `/demo/drawflow/active` can open newly promoted dynamic builds; that route remains the existing scenario route unless separately extended.

## 9. Edge Cases

- **Empty plan submit:** plan with zero `included` milestones rejected by `demo_submitTimelinePlan` with explicit error.
- **Concurrent admin edits:** demo single-user; no optimistic locking required. Last write wins.
- **`startDate` in past at approve time:** validated server-side; mutation throws. UI also gates button.
- **Pre-seeded operational rows:** approval upserts MUST be keyed on source timeline ids; add/verify `sourceTimelineMilestoneId`, `sourceTimelineDrawId`, and `sourceTimelineCapitalEventId` plus indexes on the operational tables.
- **Snapshot–working-copy divergence after admin add/remove draws:** snapshot rows w/o working-copy counterpart show as "removed by admin"; working-copy rows w/o snapshot id show as "added by admin".
- **Reject without reason:** allowed; `archivedReason` optional.

## 10. Open Questions

1. `demo_backofficeProposalCards` — confirm derived vs materialized; if materialized, explicit reconcile required in submit/approve/reject mutations.
2. Which demo seeds participate — inventory every demo seed/route that creates submittable `demo_timelinePlans` rows and update each for blast-radius parity.

Resolved decisions:
- Operational capital events table: add `demo_capitalEvents`.
- Operational draws table: use existing `demo_drawGroups`; no `demo_draws` table exists.
- Identity capture: use hardcoded `mock_builder` / `mock_staff` persona constants from backend-safe `convex/demo_personas.ts`; do not introduce `submittedByUserId` / `approvedByUserId`.
- Lock UX: banner + disabled affordances plus server mutation guards.

## 11. Verification Plan

- Unit: snapshot insert produces deep-equal header + child-row copy of plan + children at submit time.
- Unit: `demo_approveTimelinePlan` rejects past `startDate`.
- Unit: approval upsert idempotent (run twice, no duplicate milestone/drawGroup/capital-event rows).
- Integration: builder submit → admin edit → admin approve produces `demo_builds.status === "active"` with materialized milestones, draw groups, and capital events whose absolute dates match `startDate + offset`.
- Integration: admin reject sets `status === "archived"` and removes plan from `demo_getSubmittedProposalsForBackoffice` result.
- Manual: `/demo/timeline/$timelineId` round-trip across all four statuses; `/backoffice/proposals/$planId` diff display; approval success links to `/backoffice/builds/$buildKey`; builder dashboard Open routes to `/demo/timeline/$timelineId`.
