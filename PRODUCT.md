# DrawFlow

> Source of truth derived from `AGENTS.md`, `docs/draw_flow_prd.md`, `docs/draw_flow_production_prd.md`, and `docs/auth-rbac-foundation.md`. This file captures the strategic and brand layer for design work; the PRD remains authoritative for product behavior.

## Register

**product** — DrawFlow is operational software. The design serves the work: planning draws, verifying evidence, approving milestones, releasing capital. Marketing surfaces (the landing route) are the exception and read as **brand**.

## Product Purpose

DrawFlow is FairLend's construction draw-management module: a specialized operating system for reimbursement-based construction lending. It lets builder/developer borrowers and lender/brokerage teams turn a construction roadmap into feasible, economically efficient draw plans, then govern execution through evidence, site visits, staff review, admin approval, and audited capital release.

The core problem is not "manage construction tasks." It is: given a roadmap, milestone dependencies, borrower working-capital limits, lender draw policy, draw fees, and interest rules, find the most economically efficient and operationally feasible draw plan, then govern its execution to reimbursement.

DrawFlow is a FairLend module first but is architected to stand alone: tenant-scoped, WorkOS organization-aware, API-first, webhook-integrated.

## Users

Roles are real WorkOS slugs, not generic "users." Never collapse builder and lender personas.

- **Principal Broker / Broker / Broker Staff** (`principle-broker`, `broker`, `broker-staff`): brokerage operators. Run the backoffice: provision builders, review proposals, manage evidence queues, schedule site visits, approve milestones, release draws. Principal Broker and Admin hold final approval/release authority.
- **Admin** (`admin`): platform god-mode; satisfies both backoffice and builder workspace capability.
- **Builder / Builder Staff** (`builder`, `builder-staff`): borrower-side leads. Enter build location, permits, budget, working-capital limit, milestones, dependencies, and select a draw plan. Later, capture completion evidence and request draws. Often field-based, time-pressured, not finance-native.
- **Contractor** (`contractor`): execution-side participant; profile/account separated, workspace semantics deferred.

A **new builder** is a `builder` who has been provisioned a WorkOS account and a `builderProfile` owner link but has not yet submitted a Build Proposal. Their job-to-be-done in onboarding: reach their first draw plan.

## Brand & Tone

Industrial-precise, not playful. DrawFlow is a control plane for money tied to physical construction; it should feel like instrumentation an operator trusts at 7am on a job site and a broker trusts when releasing six figures.

- **Voice:** direct, operator-grade, domain-fluent. Name the real thing ("Build Proposal," "draw plan," "working-capital limit"), never soften it into generic SaaS ("project," "workspace item").
- **Confidence over hand-holding:** respect that builders know construction and brokers know lending. Onboarding gets them to value fast; it does not teach the category.
- **Calm under stakes:** material decisions (approvals, releases, overrides) are auditable and deliberate. The UI never feels casual about capital.
- **Visual signature:** the established system uses a high-chroma chartreuse/lime primary (`oklch(0.841 0.238 128.85)`) on tinted near-neutral surfaces, with the geometric Oxanium typeface. This reads as technical/engineering instrumentation, not consumer fintech. Keep it.

## Strategic Principles

1. **The Build Workspace is canonical.** Roadmap, draws, evidence, and approval state live in one shared control plane, not disconnected modules.
2. **Reimbursement model is sacred (v1).** Work first, evidence, review, approve, then release. Interest begins only after release. Never imply proactive advance funding.
3. **Auditable over implicit.** Prefer explicit state machines and audit events (actor, role, timestamp, prior/new state, reason) over boolean flags.
4. **Organization-scoped everything.** Every Build, Loan, Budget, Milestone, Draw, Evidence Package, Site Visit, Policy, and Audit Event is WorkOS-organization-scoped.
5. **Time to first value.** For new builders, the aha moment is submitting a first Build Proposal and seeing draw plans (Cheapest Feasible / Fastest / Capital-Constrained). Onboarding exists to reach that, nothing more.
6. **Reuse the system.** Compose existing primitives (`Frame`, `Card`, `Button`, fields) and existing Convex functions; never re-roll wrapper cards or parallel flows.

## Anti-References

What DrawFlow must never feel like:

- **Generic project management** (Asana/Trello/Monday): DrawFlow is opinionated around construction-lending economics, not tasks and boards.
- **Consumer fintech / neobank gloss:** no gradient-drenched marketing chrome, no confetti-grade celebration, no "you're all set!" infantilizing.
- **Dark-mode-because-tools-look-cool:** theme is chosen from the actual scene, not category reflex.
- **Patronizing onboarding:** no forced multi-screen tours, no obvious tooltips on standard patterns, no blocking the product behind a wizard the user cannot skip.
- **Slop signals:** side-stripe accent borders, gradient text, decorative glassmorphism, hero-metric template, identical card grids, modal-as-first-thought.
