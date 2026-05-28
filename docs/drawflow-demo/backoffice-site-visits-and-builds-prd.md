# Backoffice Site Visits & Builds PRD

**Product:** DrawFlow (FairLend construction draw-management module)
**Surfaces:** `/backoffice/site-visits` (Site Visit Control Room) and `/backoffice/builds` (Build Portfolio Console)
**Document type:** Product Requirements Document
**Status:** Maximalist design input draft
**Last updated:** May 29, 2026

---

## 0. Why these two screens, together

These are the two surfaces a broker lives in *after* a proposal closes and capital is actually moving. The proposal flow gets a builder to a draw plan; the build detail workspace governs one build; the dashboard triages what is hot today. But there is no screen that answers the two questions that actually keep a backoffice team up at night:

1. **"Where is the verification work, and is any of it about to rot?"** — the site-visit pipeline across *every* build, with tokens that expire in one hour, evidence that may be location-unverified, and recommendations waiting on a human with release authority.
2. **"Across my whole portfolio, where is capital exposed, behind, or blocked, and what is the single next action on each build?"** — a portfolio console, not a list of names.

Today both routes are stubs (`<div>Site Visits</div>`; `/backoffice/builds` has only a `$buildId` detail route, no index). The data model, mutations, audit trail, and tokenized field-capture flow already exist (`activeBuilds`, `buildMilestones`, `buildSiteVisits`, `plannedDrawScheduleRows`, `auditEvents`, `eventOutbox`, the `getActiveBuildSiteVisitByToken` token state machine, and the `assign/record/submit` site-visit mutations in `production_proposals.ts`). **These screens are aggregation, orchestration, and decision surfaces over data that is already there.** Nothing here requires inventing a new core domain object; it requires *seeing the whole field at once* and acting on it without leaving the screen.

The bar: a broker should be able to run an entire day of verification-and-release work from these two screens, on a Monday with 40 active builds, without ever feeling like they are reconstructing state in their head.

---

## 1. Personas & jobs-to-be-done

Roles are real WorkOS slugs (`convex/authz.ts`). Authority is not cosmetic — it gates writes server-side.

| Persona | Slugs | Capability | What they do on these screens |
|---|---|---|---|
| **Principal Broker** | `principle-broker` | `backoffice` + `destructiveWrite` | Final authority: approve milestones, release draws, override geofence-failed evidence, cancel/reschedule visits, reassign builds. Owns portfolio risk. |
| **Broker** | `broker` | `backoffice` + `nonDestructiveWrite` | Runs day-to-day: requests/schedules site visits, dispatches tokens, reviews evidence, recommends, prepares draws for release. Cannot release or override (escalates). |
| **Broker Staff** | `broker-staff` | `backoffice` + `nonDestructiveWrite` | Queue operators: triage the inbox, assign visits, chase missing info, annotate. Same write ceiling as Broker. |
| **Admin** | `admin` | god-mode | Everything, plus cross-brokerage visibility where org scope allows. |

Builders/contractors never see these screens. They appear *in* them (as the field party who opened a token, the assignee on a build) but have no access.

**Primary JTBD**

- *"Get every requested visit a real assignee and a live token before it expires."*
- *"Turn a submitted field report into an approve/reject decision in under two minutes, with the evidence and audit trail right there."*
- *"Find the three builds that are bleeding (behind schedule, draw stuck, working-capital pressure) before the borrower calls."*
- *"Release the draw I'm authorized to release, and make the one I'm not authorized for escalate cleanly to the Principal Broker."*

---

## 2. Domain constraints that must not drift

Pulled from `AGENTS.md` / `PRODUCT.md`. These are hard rules the UI must encode, not soften:

1. **Reimbursement-only (v1).** Work → evidence → review → site visit (if required) → admin approve → release. Interest starts only after release. No surface may imply advance funding.
2. **Geofence failure must not discard evidence.** Location-unverified evidence is *retained* and routed for principal-broker/admin review. The Site Visit Control Room must surface `locationVerified=false` as a first-class review state, never a silent drop.
3. **Authority is real.** `broker`/`broker-staff` recommend; `principle-broker`/`admin` approve milestones and release draws. The UI must show recommend vs. release as distinct affordances and disable (with explanation) what the viewer cannot do.
4. **Everything is org-scoped.** Every query takes `workosOrganizationId`; no cross-org leakage.
5. **Material decisions are audited.** Approve, reject, release, override, cancel, reschedule, reassign → an `auditEvents` row (actor, role, timestamp, prior/new state, reason) and, where relevant, an `eventOutbox` webhook. The UI must *collect the reason at the point of action*, never after.
6. **Budgets are versioned, not overwritten** (`buildCapitalPlans.version`). Any capital-plan display reflects the current version and links to history.
7. **Tokens are short-lived and single-use.** `buildSiteVisits.tokenExpiresAt` (one hour by default), `tokenOpenedAt`, `tokenConsumedAt`. The token lifecycle is the spine of the site-visit screen.
8. **Reuse the system.** `Frame`/`FramePanel` for containers, `Card` for content/interactive cards, existing kanban/table/sheet primitives, existing Convex functions. No parallel wrapper cards, no re-rolled flows.

---

## 3. Screen A — Site Visit Control Room (`/backoffice/site-visits`)

### 3.1 One-line definition

A live, org-wide command surface for the entire site-visit lifecycle: **request → assign → dispatch token → field capture → evidence review → recommend → decide**, with token-expiry as the dominant urgency signal and geofence integrity as a non-negotiable review gate.

### 3.2 Information architecture

A three-zone layout inside a `Frame`:

```
┌───────────────────────────────────────────────────────────────────────┐
│  HEADER STRIP — live pipeline pulse                                     │
│  [Unassigned 4] [Token live 7] [Expiring <15m 2] [Awaiting review 5]    │
│  [Geofence flagged 1] [Completed today 9]   ·   view: Pipeline | Map |  │
│                                              Calendar | Table   · filters │
├──────────────────────────────────┬────────────────────────────────────┤
│  PIPELINE (kanban, default view)  │  DETAIL RAIL (selected visit)       │
│                                   │                                     │
│  Requested │ Scheduled │ In field │  Build · milestone scope            │
│  ───────── │ ───────── │ ──────── │  Token state + countdown            │
│  card      │ card      │ card     │  Map: requested vs. evidence GPS    │
│  card      │ card      │ card     │  Evidence grid (geofence badges)    │
│            │           │          │  Field report + recommendation      │
│  Submitted │ In review │ Decided  │  Decision bar (role-aware)          │
│            │           │          │  Audit timeline                     │
└──────────────────────────────────┴────────────────────────────────────┘
```

**Pipeline columns** map to the real visit state machine derived from `buildSiteVisits.status` + token fields + milestone `completionReview`:

| Column | Derivation | Dominant signal |
|---|---|---|
| **Requested** | `status="requested"`, no assignee, `tokenOpenedAt` null | "needs a human" — oldest first |
| **Scheduled** | requested + assignee set + token live, `tokenOpenedAt` null | token countdown |
| **In field** | `tokenOpenedAt` set, `tokenConsumedAt` null | live; "opened 6m ago" |
| **Submitted** | `tokenConsumedAt` set, report present, milestone review still `revisionRequested` | freshness |
| **In review** | report read by a broker, recommendation present, awaiting decision authority | who can decide |
| **Decided** | milestone `completionReview.status` ∈ {approved, rejected}, or visit `cancelled` | outcome |

A visit's column is computed, not stored — same pattern as `productionMilestoneColumn()` already in `production_proposals.ts`. This screen needs one new aggregation query (`listBrokerageSiteVisits`) that fans out `buildSiteVisits` across the org's `activeBuilds` and joins milestone/build context; everything it returns already exists per-build.

### 3.3 The header pulse (the "impress" moment #1)

Not vanity metrics — **a triage instrument.** Each chip is a saved filter that also encodes urgency color from the design system (chartreuse primary, `warning`, `destructive`):

- **Expiring < 15m** (destructive) — tokens about to die. Clicking filters the pipeline to only those; each card shows a live `mm:ss` countdown. This is the single most valuable number on the screen: an expired token means a field visitor at a job site who can no longer submit, i.e. a wasted truck-roll.
- **Geofence flagged** (warning) — any submitted visit with `locationVerified=false` evidence. Per domain rule #2 this is a mandatory principal-broker/admin review path; the chip is always visible even at zero so the absence is *affirmed*, not ambiguous.
- **Unassigned**, **Token live**, **Awaiting review**, **Completed today** round out the day's shape.

### 3.4 Visit card (pipeline)

Built on the existing `Card` primitive, never a custom div. Each card carries exactly what a triager needs to decide *without opening it*:

- Build name + milestone scope (e.g. "Maple Ridge · Framing + Rough-in"), `displayId`.
- Assignee avatar (or a pulsing "Unassigned" pill).
- **Token lozenge**: `Not sent` / `Live · 47m` / `Opened · in field` / `Consumed` / `Expired` — color-coded, countdown when live.
- Risk flags: geofence-flagged, expedited (milestone on critical path), repeat visit (a prior visit for this milestone was rejected).
- Recommended outcome badge once a report lands (`approve` / `request revision`), so the column reads at a glance.

Cards are draggable only where the transition is legal and the viewer is authorized — dragging "Submitted → Decided" is gated to release-authority roles and opens the decision sheet with a reason field (audit rule #5).

### 3.5 Detail rail — the verification cockpit (the "impress" moment #2)

Selecting any card opens a right-hand rail (existing `Sheet`/rail pattern) that is the entire review surface in one scroll:

1. **Scope header** — build, milestone, included sub-milestones, requested day, who requested it and why (`buildSiteVisits.note`).
2. **Token panel** — live state machine view (mirrors `getActiveBuildSiteVisitByToken`): `Live · expires 4:51pm`, `Opened 6m ago`, `Consumed`, `Expired`. Actions: **Copy link**, **Regenerate + extend** (issues a fresh token, supersedes the old, audited), **Send via SMS/email** (writes to `eventOutbox` for the integration layer), **Cancel visit** (reason required, authority-gated).
3. **Evidence integrity map** — a split view: the *requested* build location vs. the *captured* evidence GPS, with the geofence radius drawn. Each evidence asset (`buildEvidenceAssets`) renders as a thumbnail with a **verified / location-unverified** badge driven by `locationVerified`. This is where domain rule #2 becomes visible and actionable: unverified evidence is shown prominently with an **Accept despite location / Reject** decision that only `principle-broker`/`admin` can take, each writing an audit event with the override reason. Reuse `SitePhotoCarousel` for the gallery.
4. **Field report** — the visitor's structured report + recommended outcome, rendered read-only with the recommender's identity.
5. **Decision bar** — role-aware, the heart of the screen:
   - `broker`/`broker-staff`: **Endorse recommendation** (advances to In review, notifies authority via outbox) + **Request another visit** (re-issues scope, audited).
   - `principle-broker`/`admin`: **Approve milestone** / **Reject** / **Approve & queue draw release**. Each demands a reason inline, calls the existing `approveActiveBuildMilestone` / `rejectActiveBuildMilestone` / `releaseActiveBuildDraw` mutations, and writes audit + outbox.
   - Anything the viewer cannot do is shown disabled with a one-line "Requires Principal Broker" explanation and a **Request approval** escalation that pings the authority (outbox). Never hide authority — show the ceiling.
6. **Audit timeline** — the visit's full history from `auditEvents` (requested → assigned → token opened → submitted → decided), each with actor, role, timestamp, reason. This is the defensible record; it lives *with* the decision, not three clicks away.

### 3.6 Alternate views

- **Map view** — every live/requested visit pinned at its build location, clustered, colored by urgency. A dispatcher's view: "who's near what today." Reuse the same map component as the evidence integrity map.
- **Calendar view** — visits by `requestedDay`/scheduled slot; drag to reschedule (authority-gated, audited). Lets staff load-balance a week.
- **Table view** — dense, sortable, exportable (CSV) for ops reporting and the audit-minded principal broker. Columns: build, milestone, status, assignee, token state, time-to-expiry, recommendation, location-verified, decided-by.

### 3.7 Bulk + keyboard (operator-grade)

- Multi-select cards → **bulk assign**, **bulk dispatch token**, **bulk extend expiring tokens**. A Monday-morning superpower: select all 7 "Requested" → assign to a field rep → one token batch out the door.
- Keyboard: `j/k` move selection, `a` assign, `t` dispatch token, `enter` open rail, `e` endorse, `⌘↵` approve (if authorized). Calm, fast, no mouse required.

### 3.8 Empty / edge states

- Zero visits org-wide: not a sad empty state — a "create the first verification request" CTA that deep-links into the relevant build's milestone (reuses `assignActiveBuildSiteVisit`).
- Expired tokens stay visible in a collapsed "Expired — re-issue" tray, never silently vanish.
- Offline field visitor (token opened, no submit, expiry passed): card flips to **Stalled — truck-rolled, no evidence**, prompting re-issue. This is a real money event (wasted visit) and is treated as one.

---

## 4. Screen B — Build Portfolio Console (`/backoffice/builds`)

### 4.1 One-line definition

A portfolio-level operating console for every active build in the brokerage: capital exposure, schedule health, draw pipeline, verification load, and **the single next action per build**, with drill-through to the existing `$buildId` detail workspace.

### 4.2 Information architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  PORTFOLIO HEADER — exposure & health roll-up                           │
│  Capital deployed $X.XM · Committed $Y.YM · Released MTD $Z             │
│  Builds: On track 22 · Behind 9 · Blocked 3 · Over budget 2            │
│  Draws: Awaiting review 6 · Ready to release $480k · Released today $90k│
├───────────────────────────────────────────────────────────────────────┤
│  CONTROLS — search · saved segments · group-by · view toggle           │
├───────────────────────────────────────────────────────────────────────┤
│  VIEW (default: smart table) — one row per build, "next action" column │
│   · Grid view   · Map view   · Capital timeline view                   │
└───────────────────────────────────────────────────────────────────────┘
        click row → drill into existing /backoffice/builds/$buildId
```

### 4.3 Portfolio header — exposure roll-up (the "impress" moment #3)

A broker's actual mental model is money-at-risk, not build count. The header computes, org-scoped, from existing tables:

- **Capital deployed** = Σ released draws (`plannedDrawScheduleRows.status="released"`).
- **Committed** = Σ `loanFacilities.principalCents`.
- **Released MTD / today** from release timestamps.
- **Interest accruing** = facilities where funds released (interest starts at release per domain rule #1) — surfaced as a live exposure figure, the thing that makes lending real.
- **Working-capital pressure** — builds where borrower co-pay obligations vs. `borrowerWorkingCapitalLimitCents` are tight; a leading indicator of a draw about to stall.

Each figure is a filter into the rows below. The roll-up is honest about the reimbursement model: it shows released vs. committed vs. remaining, never implies money out the door before work is verified.

### 4.4 The build row — "what is the one next action?" (the "impress" moment #4)

Each row (smart table, built on the existing `Table` primitives and the dashboard's column patterns) is a build's health in a glance, but the column that earns the screen is **Next Action** — a computed, role-aware, single most-important action per build:

- "Approve Framing milestone" (review complete, awaiting authority)
- "Release $42k draw — ready" (approved, release-authorized viewer)
- "Dispatch site-visit token (expires soon)"
- "Chase permit doc — blocking draw"
- "Escalate to Principal Broker" (viewer lacks authority)

Clicking Next Action performs it inline (reusing the existing build-detail mutations: `approveActiveBuildMilestone`, `releaseActiveBuildDraw`, `assignActiveBuildSiteVisit`, `requestActiveBuildMilestoneInfo`) with the required reason capture — *the broker clears the portfolio without opening each build.* This is the difference between a list and a console.

Other columns: build + builder + `displayId`; status (on track / behind / blocked / over budget, derived from milestone schedule vs. plan); % budget released vs. committed (a small inline bar); active draws by state; open site visits (links into Screen A pre-filtered); assigned broker; last activity.

### 4.5 Health derivation (must be defensible, not vibes)

- **Behind** = current day past a milestone's `dayEnd` while `status≠complete`.
- **Blocked** = a milestone whose `dependencyKeys` are unmet, or a draw stuck in `requested`/`approved` beyond a threshold, or missing required document.
- **Over budget** = released + committed > plan, or a forecast update exceeding budget.
- **Verification debt** = milestones marked complete-claimed but with no completed site visit where `requiresSiteVisit`.

Each health badge is explainable on hover ("Behind: Framing due day 41, now day 47") — never an opaque color.

### 4.6 Alternate views

- **Grid view** — `Card`-based, photo-forward (latest site photo per build), for a more visual portfolio scan; good for the principal broker doing a morning sweep.
- **Map view** — builds geographically; cluster by region; color by health. Pairs with the site-visit map for "what's hot in this metro."
- **Capital timeline view** — a portfolio-wide Gantt-of-money: each build's planned vs. released draws on a shared time axis, so a broker sees the *cash-release calendar* across all builds at once and can anticipate liquidity needs. Reuses the timeline/Gantt rendering already built in `ActiveBuildGanttWorkspace` / `ActiveBuildTimelineWorkspace`, aggregated.

### 4.7 Segments, grouping, bulk

- **Saved segments**: "My builds", "Behind & blocked", "Awaiting my approval", "Ready to release", "Verification debt". Persisted per user.
- **Group by**: assigned broker, builder, region, health, phase.
- **Bulk**: assign/reassign primary broker across selected builds (`buildBrokerAssignments`, authority-gated, audited); export portfolio CSV; bulk request status updates.

### 4.8 Drill-through

A row click navigates to the existing `/backoffice/builds/$buildId` workspace (already built: tabs for details/timeline/calendar/gantt, milestone kanban, draws, contractors, evidence, audit rail). The console is the *index and triage layer* over that detail surface — it does not duplicate it. Deep links preserve filter/segment context for back-navigation.

---

## 5. Cross-cutting requirements

### 5.1 Authority & safety (non-negotiable)

- Every write is server-authorized via the existing `backoffice` / `nonDestructiveWrite` / `destructiveWrite` middleware. The client disables what the viewer cannot do and explains why; it never relies on hiding alone.
- Release, approval, override, cancel, reschedule, reassign all **collect a reason at the point of action** and write `auditEvents` + (where relevant) `eventOutbox`. No silent state changes.
- Geofence-failed evidence is never auto-rejected and never dropped; it routes to a visible override decision restricted to release authority.

### 5.2 Real-time

Both screens use Convex live queries — tokens count down, a field submission lands in "Submitted" without refresh, a peer's approval moves a card live. Optimistic UI on the operator's own actions with rollback on server rejection.

### 5.3 Performance & scale

- Org-scoped, indexed queries (`by_brokerage`, `by_build`, `by_build_milestone`, `by_visit`). Portfolio aggregation paginated; pipeline virtualized for large columns.
- Avoid per-card N+1: aggregation queries pre-join milestone/build/assignee context server-side (one fan-out, like the existing detail aggregators) rather than the client issuing a query per card.

### 5.4 Design language

Industrial-precise, Oxanium, chartreuse primary on tinted neutrals (`PRODUCT.md` §Brand). Urgency uses `warning`/`destructive` tones; calm under stakes for money actions (deliberate confirm + reason, no confetti). Containers are `Frame`/`FramePanel`; content/interactive cards are `Card`; tables/sheets/kanban reuse existing primitives. No side-stripe accents, no gradient text, no glassmorphism (anti-references in `PRODUCT.md`).

### 5.5 Accessibility & input

Full keyboard operation on both screens, focus-visible, ARIA on live regions (countdowns, pipeline moves announced), color never the sole signal (icons + text on every health/token state), 44px touch targets where staff use tablets.

---

## 6. Backend surface (what's reused vs. net-new)

**Reused as-is:** `assignActiveBuildSiteVisit`, `recordActiveBuildSiteVisit`, `getActiveBuildSiteVisitByToken`, `submitActiveBuildTokenizedSiteVisitReport`, `markActiveBuildSiteVisitTokenOpened`, `approveActiveBuildMilestone`, `rejectActiveBuildMilestone`, `releaseActiveBuildDraw`, `requestActiveBuildDraw`, `requestActiveBuildMilestoneInfo`, `getActiveBuildDetail*`, audit + outbox helpers.

**Net-new (thin aggregation/orchestration over existing data; all fluent-convex, org-scoped, capability-gated):**

1. `listBrokerageSiteVisits(workosOrganizationId, filters)` — fans `buildSiteVisits` across the org's `activeBuilds`, joins milestone/build/assignee, computes pipeline column + token state + geofence flag. Returns the pipeline/table/map view models.
2. `listBrokeragePortfolio(workosOrganizationId, segment, groupBy, page)` — per-build roll-up (capital, health, draw states, open visits, next action) over `activeBuilds` + `buildMilestones` + `plannedDrawScheduleRows` + `loanFacilities` + `buildCapitalPlans`.
3. `getBrokerageExposureSummary(workosOrganizationId)` — portfolio header figures (deployed/committed/released/interest-accruing/wc-pressure).
4. `regenerateSiteVisitToken(buildId, visitId, reason)` — supersede + re-issue + extend expiry, audited (extends the existing assign path).
5. `reassignBuildBroker(buildId, brokerWorkosUserId, reason)` — `buildBrokerAssignments` write, audited (likely already partially present; verify before adding).
6. `dispatchSiteVisitToken(visitId, channel, recipient)` — writes `eventOutbox` for SMS/email delivery via the integration layer.

Each net-new query is a read aggregation or a thin audited write — no new core entity, consistent with "reuse the system."

---

## 7. Success metrics

1. **Token waste rate** — % of issued tokens that expire unopened (truck-rolls saved). Target: drive toward zero via expiry chip + bulk extend.
2. **Time-to-decision** — submitted report → milestone decided. Target: median under 1 working day; the rail makes sub-2-minute decisions possible.
3. **Geofence-override discipline** — 100% of `locationVerified=false` acceptances carry an audit reason and a release-authority actor.
4. **Portfolio next-action clearance** — % of "ready to release" / "awaiting approval" cleared same-day from the console without opening detail.
5. **Zero unaudited material actions** — every approve/release/override/cancel has a matching `auditEvents` row.

---

## 8. Non-goals (this iteration)

1. Real SMS/email *delivery* (we write `eventOutbox`; the integration layer ships it).
2. Live satellite/aerial imagery beyond the requested-vs-captured GPS map.
3. AI photo-quality scoring of evidence.
4. Cross-brokerage portfolio rollups for non-admins.
5. Editing milestone/draw structure here — that stays in the `$buildId` detail workspace; these screens triage and decide, then drill in for structural edits.

---

## 9. Phasing

- **Phase 1 — Site Visit Control Room core:** pipeline view + detail rail + token lifecycle + geofence review + role-aware decision bar + audit timeline. Highest operational pain, fully backed by existing mutations.
- **Phase 2 — Build Portfolio Console core:** exposure header + smart table with Next Action + health derivation + drill-through + segments.
- **Phase 3 — Force multipliers:** map + calendar + capital-timeline views, bulk operations, keyboard layer, CSV export, saved segments persistence, token dispatch via outbox.
