# Agent Guide

DrawFlow is a FairLend construction draw-management product, not a generic TanStack demo app. Treat `docs/draw_flow_prd.md` as the product source of truth

## Product Context

DrawFlow helps builder/developer borrowers and lender teams plan, verify, approve, and release reimbursement-based construction loan draws.

Core product promise:

- turn a construction roadmap into feasible draw plans,
- optimize draw groupings against borrower working-capital limits, draw fees, interest rules, lender policy, dependencies, and review/site-visit lag,
- govern execution through evidence, geofence signals, staff review, site visits, admin approvals, audit history, and webhook events.

DrawFlow is a FairLend module first, but must stay standalone-ready: tenant-scoped, API-first, WorkOS organization-aware, and integration-friendly.

## Domain Rules That Must Not Drift

- v1 draws are reimbursement-only. No proactive advance funding before work completion.
- Interest begins only after funds are released.
- Draw fees and interest rules are lender-configurable.
- Borrower Working Capital Limit is distinct from Lender Draw Policy Limit.
- Lender staff can review, inspect, report, and recommend. Lender admin has final milestone and draw-release authority.
- Geofence failure must not discard evidence. Mark evidence location-unverified and route for lender/admin review.
- Budgets must be versioned, not overwritten.
- Material decisions and overrides require audit events with actor, role, timestamp, prior/new state, warnings, and reason where applicable.
- Every Build, Loan, Budget, Milestone, Draw, Evidence Package, Site Visit, Policy, Webhook Config, and Audit Event must be organization-scoped.

## Primary Surfaces

- Build Proposal flow: borrower enters build location, permits/docs, budget, working capital, milestones, dependencies, and selected draw plan.
- Build Workspace: canonical shared control plane with milestone-card rail, Gantt-style roadmap, draw group bounding boxes, budget/duration estimates, dependency state, evidence state, and role-aware actions.
- Draw Plan Comparison: Cheapest Feasible, Fastest, and Capital-Constrained plans.
- Lender operations kanban: evidence review, missing info, site visits, ready-for-admin work.
- Mobile/tablet site-visit flow: offline draft capture, camera evidence, geofence/location attempt, structured report.
- Admin approval flows: proposal review, milestone approval, site-visit override, budget revision, draw release.
- Draw Request review: before changing Builder, Back Office, or lender review surfaces, read `docs/specs/lender-portal-draw-review.md`; all personas extend the same role-aware `DrawReviewSheet` over pooled Build availability.

## Canonical Milestone Detail and Review Sheet

The accepted Lender Milestone Review prototype Variant A is the canonical
Milestone detail and review sheet for Builder, Back Office, and Lender personas.
Production owns one shared `MilestoneDetailSheet` and one canonical Milestone
record. Do not build a parallel persona-specific sheet or copy Milestone,
Sub-milestone, Evidence Package, Site Visit, cost-document, collaboration,
review, approval, or audit state.

Preserve the locked Overview, Evidence, Receipts / invoices, and Collaboration
information architecture. Role awareness is additive: the active route selects
the Builder, Back Office, or Lender action set, and canonical permissions cap
what the actor may do. Builder routes never expose reviewer identity or private
rejection rationale. Reviewer decisions must reuse the governed review owner,
revision checks, authorization, persistence, and audit events.

Before changing this surface, read
`docs/specs/lender-milestone-review-and-decision.md` and
`docs/lender_milestone_detail_sheet_default_decision.md`. The prototype route is
a locked visual and interaction contract, not a second production model.

## Tech Stack

- Package manager/runtime: Bun. Use `bun install`, `bun add`, `bun run <script>`, and `bun x <binary>` rather than npm, pnpm, or yarn unless a tool explicitly requires otherwise.
- Frontend: React 19, ShadCn + CossUI, TypeScript, Vite 8, TanStack Router/Start, and TanStack Query.
- Styling/UI: Tailwind CSS 4, shadcn-style components, Base UI, lucide-react, Hugeicons, Motion, and Sonner.
- Backend: Convex with `fluent-convex` as the required function authoring API.
- Auth: WorkOS AuthKit through `@convex-dev/workos-authkit` on the Convex side and `@workos/authkit-tanstack-react-start` for TanStack Start. Do not use `@workos-inc/authkit-react`; this is a TanStack Start app and needs the server-side AuthKit middleware/session package.
- Validation: Convex validators from `convex/values`; use Zod through `fluent-convex/zod` when refinement validation is needed.
- Rich text/editor surface: TipTap and lowlight.
- Testing/build scripts: `bun run build`, `bun run test`, `bun x convex codegen`, and `bun x tsc -p convex/tsconfig.json`.


## Prompt Clarifications
### Adapt | Use | re-use
If your human tells you to "adapt <component>" or "use <component>" or "re-use <component>" that means use it, modify it, import it, refactor it etc directly. Do not try to replicate the behaviour or use it as a reference to create something new unless that is what's explicitly asked.
If the component is not already in it's own file, find where it's defined and extract it into a re-usable, composable and extensible component. Preserve the current styling as a tailwind cva variant, with the styling of the new use case as a seperate cva configuration.
Importing and modifying via composition, tailwind, props IS VALID
Directly editing a compound component (non-primative component) IS VALID
Extracting the component into it's own file as an extensible and re-usable component IS VALID
Using it as a reference to create your own version NOT VALID (unless explicitly told to use it as a reference)

## Convex Rules

When working on Convex code, always read `convex/_generated/ai/guidelines.md` first. It contains repo-specific Convex API and pattern rules that override model training data.

`fluent-convex` is the only allowed way to author Convex functions in this repo. Feature queries, mutations, actions, internal queries, internal mutations, and internal actions should live in normal domain files, but they must be defined with fluent-convex chains.

The `@convex-dev/migrations` `migrations.define` and `migrations.runner` APIs are the permitted exception for data-migration definitions and runners in `convex/migrations.ts` and domain `*_migrations.ts` files. This exception does not apply to application functions; the fluent-convex requirement and the generated-server import prohibition above remain in force for all product/runtime code.

Tables populated from WorkOS webhooks are webhook-owned. Never write directly to WorkOS projection tables such as `users`, `workosOrganizations`, `workosOrganizationMemberships`, `workosOrganizationRoles`, `workosRoles`, or `workosPermissions` from product flows, tests for product flows, onboarding shortcuts, claim flows, or local provisioning code. Change WorkOS state through the WorkOS Management API and let the webhook/sync projection update those tables.

Use `convex/fluent.ts` as the reference implementation for fluent-convex best practices and as the home for shared builders, reusable chains, middleware, and validators. Do not move unrelated feature functions into `convex/fluent.ts`; import shared fluent helpers from it.

Do not import or call `query`, `mutation`, `action`, `internalQuery`, `internalMutation`, or `internalAction` from `convex/_generated/server` in application function files. If a new Convex function needs a reusable pattern that `convex/fluent.ts` does not expose yet, add only that shared pattern to `convex/fluent.ts`, then use it from the appropriate domain function file.

Direct imports from `convex/server` are still appropriate for schema, HTTP routing, app configuration, generated files, and non-function utilities such as validators like `paginationOptsValidator`.

## Convex Architecture and Ownership

Use a Convex-native Ports and Adapters architecture:

```text
Convex function / HTTP / webhook / cron
        -> auth + validation adapter
        -> application use case
        -> pure domain decision
        -> Convex persistence / external adapters
```

- **Domain core:** pure state transitions, policies, invariants, value objects,
  and domain errors. Do not import `ctx`, generated Convex types, WorkOS, UI,
  storage, wall-clock time, or randomness. Pass time and identifiers as input.
- **Application module:** owns one use case or lifecycle transition. It loads
  state, calls the domain decision, persists the result, and orders required
  audit, outbox, idempotency, and scheduling effects. It does not register a
  Convex function or decide public versus internal visibility.
- **Inbound adapters:** fluent queries, mutations, actions, HTTP handlers,
  webhooks, crons, and UI callers. They authenticate, validate, translate
  arguments, call one application interface, and translate the result.
- **Outbound adapters:** narrow Convex database readers/writers, WorkOS
  management and projection adapters, storage, fetch, schedulers, and
  components. Create a port only for a real substitution seam; do not create a
  generic repository for every table.

Keep the original `QueryCtx` or `MutationCtx` flowing through the adapter and
application module. Extracting a database read into a plain helper does not
break Convex reactivity when the helper still uses that context. Do not replace
Convex reads with a second cache or a stale projection. A database read in
query middleware is part of that query's dependency set, so broad context
loaders can cause broad invalidation.

Fluent middleware is for cross-cutting adapter policy: identity, actor and
tenant context, named capabilities, validation, timing, tracing, and error
normalization. It must not silently own domain transitions, audit ordering, or
required writes. Do not hide transactional invariants in `onSuccess`-style
callbacks. Use fluent callable chains or plain helpers for reuse inside one
execution; use `ctx.runQuery` and `ctx.runMutation` only for a real transaction,
component, or workflow boundary.

Queries must remain deterministic, indexed, bounded, and projection-oriented.
Do not use `Date.now()` as an implicit query input, unbounded `.collect()`, or a
database `.filter()` where an index is required. Mutations should commit one
canonical state change and required audit/outbox state together. Actions are for
external I/O or runtime boundaries: record intent in a mutation, schedule the
action, make external effects idempotent, and finish with one focused internal
mutation. React custom hooks may compose Convex subscriptions but are not
business-logic owners or a second cache.

## Architecture Linting Policy

Architecture can be partly enforced by linting. Lint should enforce dependency
direction and unsafe mechanics; it cannot prove canonical ownership, correct
domain language, aggregate boundaries, authorization intent, realtime behavior,
or idempotency. Those require ownership review and focused Convex tests.

### Enforce mechanically

- Scope `style/noRestrictedImports` overrides to future `convex/domain/**` and
  pure application modules. Ban generated server decorators, `ctx`-owning
  modules, WorkOS SDKs, UI modules, storage, and other infrastructure imports.
- Use `style/noRestrictedGlobals` in the domain core to ban `Date`, `crypto`,
  and other nondeterministic globals where appropriate. Do not ban `Date` across
  all Convex code; mutations and migrations need server timestamps.
- Use `nursery/noFloatingPromises` for Convex code so database writes and
  scheduler calls cannot silently escape their execution boundary.
- Use `suspicious/noImportCycles` for new domain/application directories, then
  reduce the existing baseline before making it a repository-wide blocking
  rule. A full Convex scan on 2026-08-25 reported 187 existing cycle warnings;
  enabling it as an error today would obscure new violations.
- Keep `nursery/noExcessiveLinesPerFile` and cognitive-complexity rules as
  warning signals for shallow handlers, not as proof that a module violates
  ownership. A long projection may be intentional; a short handler may still
  duplicate a lifecycle rule.
- Keep the existing fluent-only rule and direct generated-server import
  prohibition. Allow explicit exceptions only for HTTP registration, types,
  generated infrastructure, schema, and other documented adapters.

### Use a dedicated architecture check for semantic mechanics

When the layer directories and naming convention are stable, add a focused Bun
or TypeScript AST check rather than extending the React-only ESLint config. It
should report, with explicit allowlists:

- registered query/mutation/action handlers that contain direct external I/O;
- query handlers or their reachable helpers that use `Date.now()`;
- sequential or looped `ctx.runMutation`/`ctx.runQuery` calls;
- database `.filter()` and unbounded `.collect()` patterns;
- new public handlers without argument validators or an authorization wrapper;
- writes to tables owned by another bounded context;
- multiple modules writing the same lifecycle table or transition symbol;
- actions and webhooks whose effect lacks an idempotency key or reconciliation
  path.

This check should produce a machine-readable report and support a reviewed
baseline. It must not infer that every repeated database operation is a bug;
exceptions must name the component, migration, projection, or bounded
workflow. Add fixture tests for the checker before making it blocking.

### Do not pretend lint can prove

Lint cannot reliably decide whether two implementations represent the same
business rule, whether a projection is canonical, whether a wrapper broadens
reactive invalidation, whether a mutation preserves transaction semantics, or
whether the intended route can reach an authorized function. Those remain
architecture-review and `convex-test` concerns. Use the deletion test and
record the owner, adapters, authoritative records, and observable consumer in
the architecture report.

## Implementation Bias

- Lender Portal promotion: before planning or implementing a lender-facing
  surface or Back Office review-requirements surface, read
  `docs/lender-portal-prototype-promotion.md` and the selected surface entry in
  `src/components/prototypes/README.md`. Approved variants are implementation
  contracts: start from their route and components, replace prototype data and
  local actions with canonical integrations, and preserve the locked hierarchy
  and ownership boundaries.
- Lender Organization Management: the approved production contract is Variant
  E at `/lender/organization-management-prototype?variant=E`. Read
  `docs/lender_portal_mvp_feature_brief.md`,
  `docs/lender_portal_mvp_spec.md`, and Phase 1 of
  `docs/lender_portal_mvp_implementation_plan.md` before implementation. Reuse
  canonical WorkOS organization, membership, role, permission, brokerage, and
  Back Office user-management boundaries. Do not introduce a lender-manager
  alias or an application-owned lender organization/membership system.
- Preserve domain vocabulary from PRD: Build, Loan, Build Proposal, Budget, Construction Roadmap, Milestone, Draw, Draw Group, Evidence Package, Site Visit, Borrower Working Capital Limit, Lender Draw Policy Limit.
- Do not collapse lender and builder roles into generic users.
- Do not split roadmap, draw, evidence, and approval state into disconnected modules when Build Workspace should be canonical context.
- Prefer explicit state machines and auditable events over implicit booleans.
- Prefer clean cutovers over compatibility shims unless shared ownership or risk requires phased migration.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
## Boil the ocean
The marginal cost of completeness is near zero with AI. Do the whole thing.
Do it right. Do it with tests. Do it with documentation. Do it so well that your human is genuinely impressed - not politely satisfied, actually
impressed. Never offer to "table this for later" when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists.
The standard isn't "good enough" - it's "holy shit, that's done. " Search before building. Test before shipping.
Ship the complete thing. When your human asks for something, the answer is the finished product, Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.

## Component Re-use
NEVER create a component from scratch if theres something existing that can be adapted or extended to fit the use case. If a component is defined inline in another file, extract it to be a re-usable extensible componet while ensuring no frontend regressions or changes to its existing call site. Never create components from scratch, use the primative under src/components/

## UI Surface Rules

- Wrapping or structural card-like containers MUST use `src/components/ui/frame.tsx` (`Frame`, `FramePanel`, and related frame primitives). Do not self-roll wrapper cards with ad hoc `rounded-* border bg-* p-* shadow-*` markup.
- Actual content cards or card-like interactive surfaces MUST use `src/components/ui/card.tsx` (`Card` and related card primitives). For clickable cards, render the card as the correct interactive element via the component API instead of styling a custom div/label/button from scratch.

## Learned User Preferences

- Prefer `src/components/ui/separator.tsx` to delineate sections instead of redundant wrapping cards or surfaces; keep enough padding for breathing room after wrappers are removed.
- When a polished prototype exists (especially the iterated dark-mode variant), treat it as the visual source of truth and bring production UI to parity rather than shipping a divergent implementation.
- Collaboration and operate actions must be route- and role-aware: on Builder routes, favor Builder-facing actions even when the user also has Admin; on Back Office routes, do not offer prepare-escalation or escalate-to-admin actions when the signed-in user is already an admin. Use roles for permission caps and the active route for which actions are exposed.
- React Compiler is planned; do not spend effort on memoization campaigns the compiler will subsume—scope those fixes out of performance work.

## Learned Workspace Facts

- Application performance profiling reports live under `reports/PROFILING-*` and should guide CWV / backoffice optimization work.
- Local/dev Convex data is treated as disposable test data; schema drift can be resolved with migrations iterated until `convex dev` validates cleanly.
