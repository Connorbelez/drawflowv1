# DrawFlow

DrawFlow is a FairLend construction draw-management module. It helps builder/developer borrowers and lender teams plan construction milestones, optimize reimbursement-based draw schedules, verify completed work, manage site visits, approve milestones, and release loan draws from a shared operational workspace.

This repo is the v1 DrawFlow application codebase. Product source of truth: [`docs/draw_flow_prd.md`](docs/draw_flow_prd.md).

## Product Summary

DrawFlow is built around one primary interface: the **Build Workspace**. It is a dense shared control plane for builder leads and lender admins, combining:

- milestone-card rail,
- Gantt-style construction roadmap,
- draw group bounding boxes,
- budget and duration estimates,
- dependency and blocker status,
- evidence and geofence status,
- draw release readiness,
- role-aware builder/lender actions.

v1 uses a strict reimbursement model: builders complete work first, upload evidence, lender staff review or inspect where required, lender admins approve completion, then draws become eligible for release. Interest begins only after funds are released.

DrawFlow is a FairLend module first, but architecture must remain standalone-ready: WorkOS organization scoping, tenant-scoped domain entities, RBAC, API-first boundaries, external ID mapping, webhook events, and clean separation between FairLend-specific workflows and generic construction-lending workflows.

## Canonical Milestone Detail and Review

Builder, Back Office, and Lender routes must use the same canonical Milestone
detail surface and Milestone record. The accepted interface is Variant A of the
Lender Milestone Review prototype, promoted through the existing
`MilestoneDetailSheet`; it is not a separate lender-owned implementation.

The shared information architecture is Overview, Evidence, Receipts / invoices,
and Collaboration. The active route selects the available actions, while the
actor's permissions cap those actions. Builder routes must not expose reviewer
identity or private rejection rationale. Back Office and Lender routes must use
the existing governed review, revision, authorization, and audit boundaries.

Future work must modify this shared sheet instead of rebuilding it or creating
persona-specific Milestone, evidence, Site Visit, cost-document, collaboration,
or approval state. Read the normative
[Milestone Review and Decision specification](docs/specs/lender-milestone-review-and-decision.md)
and the [accepted design decision](docs/lender_milestone_detail_sheet_default_decision.md)
before changing any Milestone detail or review surface.

## Core Concepts

- **Build**: top-level construction project financed by a construction loan.
- **Loan**: approved credit facility and draw policy context.
- **Build Proposal**: borrower-created package with site details, permits, budget, milestones, dependencies, working-capital input, and selected draw plan.
- **Budget**: approved financial plan, versioned for audit.
- **Construction Roadmap**: milestone dependency model that drives optimizer and approvals.
- **Milestone**: primary unit of roadmap planning and draw eligibility.
- **Draw**: reimbursement tranche released after included work is approved.
- **Draw Group**: planned grouping of milestones expected to reimburse together.
- **Evidence Package**: proof supporting completion, site visit verification, or draw release.
- **Site Visit**: lender-controlled inspection workflow.
- **Borrower Working Capital Limit**: max unreimbursed amount builder can carry before needing reimbursement.
- **Lender Draw Policy Limit**: lender-controlled draw constraints, separate from borrower working capital.

## Key v1 Rules

- Draws are reimbursement-only; no advance funding before work completion.
- Draw release is blocked until included milestones satisfy approval requirements.
- Lender staff may review, report, inspect, and recommend; lender admin has final approval authority.
- Geofence failure does not discard evidence. It flags evidence as location-unverified for lender/admin review.
- Budget revisions are versioned, not destructive overwrites.
- Admin overrides require audited reasons.
- Tenant boundaries and RBAC must be enforced everywhere.
- Material actions must be recorded in audit history.

## MVP Scope

In scope:

- WorkOS organization scoping and RBAC.
- Builder Build Proposal flow.
- Permit/document upload.
- Build site location capture.
- Borrower working-capital input.
- Milestone template selection and editing.
- Dependency editing and cycle prevention.
- Core Build Workspace.
- Draw plan generation and comparison: Cheapest Feasible, Fastest, Capital-Constrained.
- Lender proposal review.
- Builder milestone progress and evidence submission.
- Geofenced proof-of-completion verification.
- Lender operations kanban.
- Staff evidence review and recommendations.
- Site visit request and mobile/tablet workflow with offline save/sync.
- Admin milestone approval and draw release approval.
- Configurable draw fee and interest model.
- Audit trail.
- Initial API and webhook foundation.

Out of scope for MVP:

- Full standalone commercial packaging.
- Accounting ledger.
- Actual payment rails.
- Full loan servicing.
- Holdbacks/retainage.
- Contractor marketplace.
- Municipal inspection integration.
- Automated lien waiver tracking.
- Full offline Build Workspace editing.
- Complex subtask-based partial reimbursement unless explicitly pulled into scope.

## Tech Stack

- Runtime/package manager: Bun.
- Frontend: React 19, TypeScript, Vite 8, TanStack Router/Start, TanStack Query.
- Backend: Convex.
- Convex function authoring: `fluent-convex`.
- Auth: WorkOS AuthKit and WorkOS Organizations.
- Styling/UI: Tailwind CSS 4, shadcn-style components, Base UI, lucide-react, Hugeicons, Motion, Sonner.
- Validation: Convex validators and Zod via `fluent-convex/zod` where refinement validation is needed.
- Tests: Vitest.

## Development

Install dependencies:

```bash
bun install
```

Run app:

```bash
bun run dev
```

Run tests:

```bash
bun run test
```

Build production bundle:

```bash
bun run build
```

Generate Convex code:

```bash
bun x convex codegen
```

Typecheck Convex code:

```bash
bun x tsc -p convex/tsconfig.json
```

## Convex Setup

Set Convex environment variables in `.env.local`:

```bash
VITE_CONVEX_URL=...
CONVEX_DEPLOYMENT=...
CONVEX_DEPLOY_KEY=...
```

Start Convex dev server when backend work requires it:

```bash
bun x convex dev
```

Before promoting a frontend release that introduces new Convex calls, deploy
the matching backend and verify the configured deployment:

```bash
bun x convex dev --once
bun run verify:convex-deployment
```

Vercel production builds run the same deployment-parity probe before compiling
the frontend. The probe uses `CONVEX_DEPLOY_KEY` to inspect deployed function
metadata without invoking application queries. A release fails instead of
shipping a client bundle that calls missing Build Collaboration queries.

Before changing Convex code, read `convex/_generated/ai/guidelines.md`. This repo requires `fluent-convex` for application functions.

## Project Structure

```text
src/                 React/TanStack app
src/routes/          File-based routes
src/components/      Shared UI and product components
src/integrations/    Convex, WorkOS, TanStack integrations
convex/              Convex schema and backend functions
docs/                Product docs and specs
```

## Reference Docs

- [docs/cmux-codex-teams-workflow.md](docs/cmux-codex-teams-workflow.md): cmux and Codex team setup, worktree ownership, and verification workflow.
- [`docs/draw_flow_prd.md`](docs/draw_flow_prd.md): product requirements and domain source of truth.
- [`AGENTS.md`](AGENTS.md): agent implementation rules, domain constraints, and repo conventions.
