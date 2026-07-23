# DrawFlow Route Manifest

This manifest maps DrawFlow product screens to a minimal TanStack Router file-based route tree. A screen in `uiManifest/screenManifest.md` is not automatically a route: many screens are tabs, drawers, sheets, panels, or full-workspace content inside a broader route.

This revision uses TanStack route group directories, such as `(builder)`, `(lender)`, and `(staff)`, to organize routes by primary persona without changing URL paths or the component tree.

Reference docs:

- `draw_flow_prd.md` §10 Core Build Workspace
- `draw_flow_prd.md` §11 User Flows
- `draw_flow_prd.md` §12 Screens and Interfaces
- `draw_flow_prd.md` §13 Functional Requirements
- `draw_flow_prd.md` §14 RBAC and Permissions
- `draw_flow_prd.md` §18.3 Kanban-Based Operational Workflows
- `uiManifest/screenManifest.md` §25.1 Screen Manifest
- Convex React auth helpers: `Authenticated`, `Unauthenticated`, `AuthLoading` from `convex/react`
- TanStack Router file-based default route token: use `route.tsx` files for directory routes.
- TanStack route group directories: `(group)` directories are purely organizational and do not affect route path, route tree, or component tree.

---

## 28. Route Manifest

## 28.1 Audit Findings

| Finding | Prior issue | Revised decision |
|---|---|---|
| Proposal intake was over-routed | Site, documents, working capital, template, draw plan, and final review were separate URLs. This splits the proposal package even though PRD §11.1 is one guided proposal flow and admin review needs full context. | Use one builder Proposal Package route for identity, site, documents, working capital, template, readiness, and submit. |
| Roadmap needs full workspace | Draft roadmap has milestone rail + Gantt + draw groups; it is too heavy for a small drawer. | Keep one dedicated builder Draft Roadmap route. Draw Plan Comparison lives in this route as overlay/panel because draw plan is visualized on the Gantt. |
| Build panels were over-routed | Map, chat, and activity were standalone routes despite screen spec saying panels/drawers inside Build Workspace. | Keep them as Build Workspace panels under shared live-build context, not routes. Audit History remains a global lender/admin route. |
| More-info was over-routed | Missing-information response was a separate route even though it is tied to the evidence review package. | Fold into Evidence Review Detail as a staff work-order tab/panel with workflow state. |
| Routes were not persona-organized | Product routes mixed builder, lender, staff, and shared concerns in one tree. | Add route group directories: `(builder)`, `(lender)`, `(staff)`, `(shared)`, and `(public)`. |
| Build Workspace must be central | Manifest treated Build Workspace as one route among peers, while PRD defines it as the shared control plane between builder leads and lender admins. | Make `/app/builds/:buildId` the canonical Build Workspace route. It owns milestone-card rail, Gantt roadmap, draw group bounding boxes, budget/duration estimates, dependency status, milestone evidence status, and draw release readiness; kanban queues, focused review screens, mobile site-visit flows, and approval screens are subordinate operational surfaces that deep-link back into it. |

## 28.2 Routing Principles

1. Start minimal; add routes only when a route earns its URL.
2. Route boundaries are for shareable workflow locations, independent loaders, RBAC gates, offline/mobile shells, or materially different page shells.
3. Screens can be route pages, full-workspace tabs, drawers, sheets, panels, or modal-like confirmation content.
4. Use TanStack Router file-based routing under `src/routes`.
5. Use TanStack Router's default file-based route token: each route directory uses `route.tsx` as the route file.
6. Every route directory that owns loader/guard/boundary/component behavior must include `route.tsx`.
7. Route group directories `(builder)`, `(lender)`, `(staff)`, `(shared)`, and `(public)` are not route directories and do not need `route.tsx`.
8. Every parent `route.tsx` must render a TanStack `<Outlet />` for child routes.
9. Public auth routes live under `(public)/_public/route.tsx`.
10. Use Convex auth helpers for client auth gates: `<Authenticated>`, `<Unauthenticated>`, and `<AuthLoading>`.
11. Use route loaders before render for tenant scope, RBAC grants, redirect decisions, and shell-critical data.
12. Route groups are organizational only; they must not be used as authorization. Guards belong in `route.tsx` loaders and route-level policies.
13. Route params must never be treated as authorization; every loader must verify organization scope and entity membership.
14. Ignore scaffold-only wrapper routes such as `_authenticated`; document user-facing/product routes instead.
15. Build Workspace is the central product interface and shared control plane between builder leads and lender admins. Operational routes exist only when they need their own queue, mobile/offline shell, approval boundary, or audit-sensitive loader; they must preserve links back to the canonical Build Workspace context.

## 28.3 Persona Route Groups

| Route group | Persona owner | Contains | Notes |
|---|---|---|---|
| `(public)` | Unauthenticated user | Landing/auth routes | Organizational only; `_public/route.tsx` handles Convex unauthenticated gate. |
| `(builder)` | Builder Lead / Builder Staff | Builder proposal status/authoring and draw receipt tasks | Builder-facing URLs such as `/builder/proposals`; group directory does not affect URL path. |
| `(lender)` | Lender Admin / underwriter / organization admin | Proposal intake/review, approvals, draw release, policies, audit, integrations | Lender-facing URLs such as `/lender/proposals`; group directory does not affect URL path. |
| `(staff)` | Lender Staff / Site Visit Staff | Evidence review queue/detail, site visit queue/detail | Operational work-order routes without final approval authority. |
| `(shared)` | Cross-persona | Live builds, app index, shared URL namespace layouts | Canonical Build Workspace and neutral parent route files used by multiple persona groups. |

Builder and lender proposal routes intentionally use separate URL namespaces: `/builder/proposals` for builder proposal status and authoring, and `/lender/proposals` for lender intake/review. Route group directories like `(builder)` and `(lender)` are organizational only; the concrete `builder/` and `lender/` path segments create the URL namespaces.

## 28.4 Route-vs-UI Heuristics

| UI surface | Route? | Rule |
|---|---:|---|
| Primary app shell | Yes | Auth, org, role navigation boundary. |
| Kanban queue | Yes | Shareable operational work surface with independent loader/filter state. |
| Admin final decision page | Yes | Audit-sensitive workflow boundary with strict RBAC. |
| Mobile/offline capture flow | Yes | Distinct shell, caching, device capabilities, and failure modes. |
| Heavy Gantt/milestone workspace | Yes | Dominates full screen and owns roadmap/draw-plan context. |
| Canonical Build Workspace | Yes | Central shared control plane for builder leads and lender admins; owns milestone rail, Gantt roadmap, draw group boxes, budget/duration estimates, dependencies, evidence status, and draw release readiness. |
| Small input such as working capital | No | Section, drawer, or sheet inside proposal/workspace context. |
| Documents/site map inside proposal | No | Related proposal package context; underwriters need it together. |
| Draw plan comparison | Usually no | Overlay/panel on Gantt because draw groups are spatially represented there. |
| Build map/chat/activity | No for MVP | Drawer/panel inside Build Workspace unless external deep-link pressure appears. |
| More-info request/response | No for MVP | Tab/panel inside Evidence Review Detail. |

## 28.5 Route File Contract

Every guard/parent route `route.tsx` follows this shape:

```tsx
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/auth/login", search: { redirectTo: location.href } });
    }
  },
  component: AppShellRoute,
  pendingComponent: AppShellPending,
  errorComponent: AppShellError,
});

function AppShellRoute() {
  return (
    <>
      <AuthLoading>Loading session…</AuthLoading>
      <Authenticated>
        <Outlet />
      </Authenticated>
      <Unauthenticated>{/* redirect handled in beforeLoad */}</Unauthenticated>
    </>
  );
}
```

Public auth route uses inverse gate. Scaffold-only wrappers like `_authenticated` are omitted from this manifest:

```tsx
function PublicAuthLayout() {
  return (
    <>
      <AuthLoading>Loading session…</AuthLoading>
      <Unauthenticated>
        <Outlet />
      </Unauthenticated>
      <Authenticated>{/* redirect to /app handled in beforeLoad */}</Authenticated>
    </>
  );
}
```

Route-specific route files add stricter guards before `<Outlet />`: selected organization, Build membership, proposal access, work-order ownership, Lender Admin role, Organization Admin role, and workflow-state redirects. If a scaffolder created `_authenticated`, treat it as implementation detail, not product route surface.

## 28.6 File Naming Conventions

| File / directory | Meaning | Required |
|---|---|---:|
| `__root.tsx` | Root document, providers, router context, Convex provider, global error boundary | Yes |
| `(persona)/` | Route group directory; pure organization by persona | Recommended for product routes |
| `route.tsx` | Path boundary, auth gate, redirect logic, loader, pending/error boundary, `<Outlet />` | Yes for every route directory that owns route behavior |
| `index.tsx` | Index screen/content for current folder path | Where route has index content |
| `route.lazy.tsx` | Lazy-loaded heavy route component | Optional |
| `$param/route.tsx` | Dynamic resource route file and resource guard | Yes for dynamic resource folders |

## 28.7 Minimal Persona-Grouped Route Tree

```txt
src/routes/
  __root.tsx
  (public)/
    index.tsx
    _public/
      route.tsx
      auth/
        route.tsx
        login/
          route.tsx
          index.tsx
        callback/
          route.tsx
          index.tsx
        logout/
          route.tsx
          index.tsx
  (builder)/
    builder/
      route.tsx
      proposals/
        route.tsx
        index.tsx
        new/
          route.tsx
          index.tsx
          roadmap/
            route.tsx
            index.tsx
  (lender)/
    lender/
      route.tsx
      proposals/
        route.tsx
        index.tsx
        $proposalId/
          route.tsx
          index.tsx
  app/
    route.tsx
    (shared)/
      index.tsx
      builds/
        route.tsx
        index.tsx
        $buildId/
          route.tsx
          index.tsx
          milestones/
            route.tsx
            $milestoneId/
              route.tsx
              index.tsx
              proof/
                route.tsx
                index.tsx
          budget-revisions/
            route.tsx
            new/
              route.tsx
              index.tsx
            $revisionId/
              route.tsx
              index.tsx
      draw-releases/
        route.tsx
        $drawId/
          route.tsx
      policies/
        route.tsx
      audit/
        route.tsx
      integrations/
        route.tsx
    (builder)/
      draw-releases/
        $drawId/
          receipt/
            route.tsx
            index.tsx
    (lender)/
      approvals/
        route.tsx
        milestones/
          route.tsx
          index.tsx
          $workOrderId/
            route.tsx
            index.tsx
      draw-releases/
        index.tsx
        $drawId/
          index.tsx
      policies/
        index.tsx
      audit/
        index.tsx
      integrations/
        index.tsx
    (staff)/
      operations/
        route.tsx
        evidence/
          route.tsx
          index.tsx
          $workOrderId/
            route.tsx
            index.tsx
      site-visits/
        route.tsx
        index.tsx
        $siteVisitId/
          route.tsx
          index.tsx
``````

## 28.8 Route Records

| Route ID | Persona group | Route file | Screen file | URL path | Screen IDs | Primary users | Purpose |
|---|---|---|---|---|---|---|---|
| RTE-001 | root | `src/routes/__root.tsx` | — | — | SCR-001 | All users | Root providers, Convex provider, router context, global boundary. |
| RTE-002 | `(public)` | — | `src/routes/(public)/index.tsx` | `/` | SCR-001 | All users | Public landing or redirect to authenticated app. |
| RTE-003 | `(public)` | `src/routes/(public)/_public/auth/login/route.tsx` | `src/routes/(public)/_public/auth/login/index.tsx` | `/auth/login` | SCR-001 | Unauthenticated users | WorkOS AuthKit sign-in entry; authenticated users redirect to `/app`. |
| RTE-004 | `(public)` | `src/routes/(public)/_public/auth/callback/route.tsx` | `src/routes/(public)/_public/auth/callback/index.tsx` | `/auth/callback` | SCR-001 | Unauthenticated users | WorkOS callback, session creation, organization resolution. |
| RTE-005 | `(public)` | `src/routes/(public)/_public/auth/logout/route.tsx` | `src/routes/(public)/_public/auth/logout/index.tsx` | `/auth/logout` | SCR-001 | Authenticated users | Sign-out route; clears session and redirects to login. |
| RTE-007 | `(shared)` | `src/routes/app/route.tsx` | `src/routes/app/(shared)/index.tsx` | `/app` | SCR-001 | All authenticated users | Tenant-scoped app shell, org switcher, role-aware navigation, role-aware home. |
| RTE-008 | `(shared)` | `src/routes/app/(shared)/builds/route.tsx` | `src/routes/app/(shared)/builds/index.tsx` | `/app/builds` | SCR-012 | Builder Lead, Builder Staff, Lender Staff, Lender Admin | Active Builds list and entry into Build Workspace. |
| RTE-009 | `(shared)` | `src/routes/app/(shared)/builds/$buildId/route.tsx` | `src/routes/app/(shared)/builds/$buildId/index.tsx` | `/app/builds/:buildId` | SCR-012, SCR-013, SCR-022, SCR-029, SCR-030 | Builder Lead, Builder Staff, Lender Staff, Lender Admin | Canonical Build Workspace shared by builder leads and lender admins: milestone-card rail, Gantt construction roadmap, draw group bounding boxes, budget/duration estimates, dependency status, milestone evidence status, draw release readiness, plus map/chat/activity drawers. |
| RTE-010 | `(shared)` | `src/routes/app/(shared)/builds/$buildId/milestones/$milestoneId/route.tsx` | `src/routes/app/(shared)/builds/$buildId/milestones/$milestoneId/index.tsx` | `/app/builds/:buildId/milestones/:milestoneId` | SCR-013 | Builder Lead, Builder Staff, Lender Staff, Lender Admin | Deep-linkable milestone detail drawer/page. |
| RTE-011 | `(shared)` | `src/routes/app/(shared)/builds/$buildId/milestones/$milestoneId/proof/route.tsx` | `src/routes/app/(shared)/builds/$buildId/milestones/$milestoneId/proof/index.tsx` | `/app/builds/:buildId/milestones/:milestoneId/proof` | SCR-014 | Builder Lead, Builder Staff | Mobile proof upload and completion submission within Build context. |
| RTE-012 | `(shared)` | `src/routes/app/(shared)/builds/$buildId/budget-revisions/new/route.tsx` | `src/routes/app/(shared)/builds/$buildId/budget-revisions/new/index.tsx` | `/app/builds/:buildId/budget-revisions/new` | SCR-025 | Builder Lead, Lender Admin | Budget Revision Request. |
| RTE-013 | `(shared)` | `src/routes/app/(shared)/builds/$buildId/budget-revisions/$revisionId/route.tsx` | `src/routes/app/(shared)/builds/$buildId/budget-revisions/$revisionId/index.tsx` | `/app/builds/:buildId/budget-revisions/:revisionId` | SCR-008, SCR-025 | Builder Lead, Lender Admin | Budget Revision Review with recomputed draw-plan impact. |
| RTE-014 | `(builder)` | `src/routes/(builder)/builder/proposals/new/route.tsx` | `src/routes/(builder)/builder/proposals/new/index.tsx` | `/builder/proposals/new` | SCR-002, SCR-003, SCR-004, SCR-005, SCR-006, SCR-009 | Builder Lead, optional Builder Staff, Lender Admin | Proposal Package workspace: identity, site, documents, working capital, template, readiness, submit. |
| RTE-015 | `(builder)` | `src/routes/(builder)/builder/proposals/new/roadmap/route.tsx` | `src/routes/(builder)/builder/proposals/new/roadmap/index.tsx` | `/builder/proposals/new/roadmap` | SCR-007, SCR-008 | Builder Lead, Lender Admin | Draft Build Workspace / Roadmap Wizard with draw-plan overlay/comparison. |
| RTE-016 | `(lender)` | `src/routes/(lender)/lender/proposals/route.tsx` | `src/routes/(lender)/lender/proposals/index.tsx` | `/lender/proposals` | SCR-010 | Lender Admin | Admin Proposal Review Queue. |
| RTE-017 | `(lender)` | `src/routes/(lender)/lender/proposals/$proposalId/route.tsx` | `src/routes/(lender)/lender/proposals/$proposalId/index.tsx` | `/lender/proposals/:proposalId` | SCR-011 | Lender Admin | Admin Proposal Review Detail with full proposal context. |
| RTE-030 | `(builder)` | `src/routes/(builder)/builder/proposals/route.tsx` | `src/routes/(builder)/builder/proposals/index.tsx` | `/builder/proposals` | SCR-009 | Builder Lead, Builder Staff | Builder proposal status list and return point for drafts/submissions. |
| RTE-018 | `(staff)` | `src/routes/app/(staff)/operations/evidence/route.tsx` | `src/routes/app/(staff)/operations/evidence/index.tsx` | `/app/operations/evidence` | SCR-015 | Lender Staff, Lender Admin | Lender Evidence Review Kanban. |
| RTE-019 | `(staff)` | `src/routes/app/(staff)/operations/evidence/$workOrderId/route.tsx` | `src/routes/app/(staff)/operations/evidence/$workOrderId/index.tsx` | `/app/operations/evidence/:workOrderId` | SCR-016, SCR-017 | Lender Staff, Lender Admin, Builder participants where requested | Evidence Review Detail, including more-information request/response state. |
| RTE-020 | `(staff)` | `src/routes/app/(staff)/site-visits/route.tsx` | `src/routes/app/(staff)/site-visits/index.tsx` | `/app/site-visits` | SCR-018 | Site Visit Staff, Lender Staff, Lender Admin | Site Visit Kanban. |
| RTE-021 | `(staff)` | `src/routes/app/(staff)/site-visits/$siteVisitId/route.tsx` | `src/routes/app/(staff)/site-visits/$siteVisitId/index.tsx` | `/app/site-visits/:siteVisitId` | SCR-019, SCR-030 | Site Visit Staff, Lender Admin | Mobile Site Visit Detail with build map context and offline support. |
| RTE-022 | `(lender)` | `src/routes/app/(lender)/approvals/milestones/route.tsx` | `src/routes/app/(lender)/approvals/milestones/index.tsx` | `/app/approvals/milestones` | SCR-020 | Lender Admin | Admin Approval Kanban. |
| RTE-023 | `(lender)` | `src/routes/app/(lender)/approvals/milestones/$workOrderId/route.tsx` | `src/routes/app/(lender)/approvals/milestones/$workOrderId/index.tsx` | `/app/approvals/milestones/:workOrderId` | SCR-021 | Lender Admin | Admin Milestone Approval Detail. |
| RTE-024 | `(lender)` | `src/routes/app/(shared)/draw-releases/route.tsx` | `src/routes/app/(lender)/draw-releases/index.tsx` | `/app/draw-releases` | SCR-022 | Lender Admin, finance/ops users | Draw Release Kanban. |
| RTE-025 | `(lender)` | `src/routes/app/(shared)/draw-releases/$drawId/route.tsx` | `src/routes/app/(lender)/draw-releases/$drawId/index.tsx` | `/app/draw-releases/:drawId` | SCR-023 | Lender Admin | Draw Release Approval Detail. |
| RTE-026 | `(builder)` | `src/routes/app/(builder)/draw-releases/$drawId/receipt/route.tsx` | `src/routes/app/(builder)/draw-releases/$drawId/receipt/index.tsx` | `/app/draw-releases/:drawId/receipt` | SCR-024 | Builder Lead | Builder Draw Receipt Confirmation. |
| RTE-027 | `(lender)` | `src/routes/app/(shared)/policies/route.tsx` | `src/routes/app/(lender)/policies/index.tsx` | `/app/policies` | SCR-026 | Lender Admin, Organization Admin | Policy Configuration. |
| RTE-028 | `(lender)` | `src/routes/app/(shared)/audit/route.tsx` | `src/routes/app/(lender)/audit/index.tsx` | `/app/audit` | SCR-027 | Lender Admin, Organization Admin, auditors | Audit History. |
| RTE-029 | `(lender)` | `src/routes/app/(shared)/integrations/route.tsx` | `src/routes/app/(lender)/integrations/index.tsx` | `/app/integrations` | SCR-028 | Organization Admin, technical admin | API and Webhook Configuration. |

## 28.9 Non-Route Screen Treatment

| Screen ID | Screen | Treatment | Reason |
|---|---|---|---|
| SCR-003 | Build Site Location and Map Setup | Section/drawer in Proposal Package | Needs proposal identity, documents, and admin review context. |
| SCR-004 | Permit and Document Upload | Section/drawer in Proposal Package | Documents are part of one governed proposal package. |
| SCR-005 | Borrower Starting Cash Input | Inline section/sheet in Proposal Package and Draft Roadmap | Too small for a dedicated page; impact belongs beside feasibility/draw-plan context. |
| SCR-006 | Milestone Template Selection | Section in Proposal Package before opening Draft Roadmap | Template is setup input, not a durable route boundary. |
| SCR-008 | Draw Plan Comparison | Overlay/panel in Draft Roadmap and Budget Revision | Draw groups are visualized directly on Gantt; separate route would disconnect spatial context. |
| SCR-009 | Proposal Review and Submit | Review tab/section in Proposal Package | Final review should keep build details, site, documents, budget, roadmap, draw plan, and warnings together. |
| SCR-017 | More Information Request / Builder Response | Tab/panel in Evidence Review Detail | Formal state belongs to evidence work order, not a separate destination. |
| SCR-029 | Secure Deal Chat Panel | Drawer in Build Workspace and operational details | Chat must not become formal approval/workflow route. |
| SCR-030 | Build Site Map Panel | Drawer/panel in Build Workspace and Site Visit Detail | Map supports context; not primary navigation. |

## 28.10 Route Guard Matrix

| Route file | Gate wrapper | Redirect / guard responsibility |
|---|---|---|
| `(public)/_public/route.tsx` | `<Unauthenticated>` | Redirect authenticated users to `/app` or `redirectTo` target. |
| `(public)/_public/auth/route.tsx` | `<Unauthenticated>` | Keep login/callback/logout outside app shell. |
| `app/route.tsx` | `<Authenticated>` | Redirect unauthenticated users to `/auth/login`; load user/org/role grants; render AppShell and `<Outlet />`. |
| `(shared)/builds/route.tsx` | `<Authenticated>` | Require Build list access. |
| `(shared)/builds/$buildId/route.tsx` | `<Authenticated>` | Verify tenant-scoped Build access and load Build shell summary. |
| `(shared)/builds/$buildId/milestones/$milestoneId/route.tsx` | `<Authenticated>` | Verify milestone belongs to Build and current user can view/update/review. |
| `(builder)/builder/proposals/route.tsx` | `<Authenticated>` | Load builder-visible proposal statuses and drafts. |
| `(builder)/builder/proposals/new/route.tsx` | `<Authenticated>` | Create/resume draft proposal; enforce proposal creation policy. |
| `(builder)/builder/proposals/new/roadmap/route.tsx` | `<Authenticated>` | Require draft proposal ownership/access and load roadmap optimizer context. |
| `(lender)/lender/proposals/route.tsx` | `<Authenticated>` | Require Lender Admin proposal queue access. |
| `(lender)/lender/proposals/$proposalId/route.tsx` | `<Authenticated>` | Require Lender Admin proposal review access. |
| `(staff)/operations/route.tsx` | `<Authenticated>` | Require lender operations access. |
| `(staff)/operations/evidence/$workOrderId/route.tsx` | `<Authenticated>` | Verify Evidence Review Work Order access and current workflow state. |
| `(staff)/site-visits/$siteVisitId/route.tsx` | `<Authenticated>` | Verify site visit assignment or lender oversight permission; support cache-first assigned work. |
| `(lender)/approvals/route.tsx` | `<Authenticated>` | Require Lender Admin role. |
| `(lender)/approvals/milestones/$workOrderId/route.tsx` | `<Authenticated>` | Require final milestone approval permission; redirect incomplete packages. |
| `(shared)/draw-releases/$drawId/route.tsx` | `<Authenticated>` | Load draw context for lender approval or builder receipt; child route enforces action-specific role. |
| `(builder)/draw-releases/$drawId/receipt/route.tsx` | `<Authenticated>` | Require builder receipt task ownership. |
| `(shared)/policies/route.tsx` | `<Authenticated>` | Require Lender Admin or Organization Admin policy access. |
| `(shared)/audit/route.tsx` | `<Authenticated>` | Require audit read permission; enforce tenant-scoped filters. |
| `(shared)/integrations/route.tsx` | `<Authenticated>` | Require Organization Admin or technical admin; never expose API secrets after creation. |

## 28.11 Loader and Boundary Contracts

| Route file | Loader contract | Boundary contract |
|---|---|---|
| `app/route.tsx` | Load/validate Convex auth state, current user, organizations, active organization, role grants, and navigation grants. | Expired session, unauthenticated, missing org selection, forbidden organization. |
| `(shared)/builds/$buildId/route.tsx` | Load Build summary, Loan summary, approved Budget version, Roadmap summary, Draw Plan summary, milestone-card rail state, Gantt roadmap data, draw group bounding boxes, budget/duration estimates, dependency status, milestone evidence status, draw release readiness, and role actions. | Build not found, tenant mismatch, build access denied. |
| `(shared)/builds/$buildId/milestones/$milestoneId/route.tsx` | Load Milestone, related Draw Group, dependencies, evidence summary, review/approval state. | Milestone not found or not in Build. |
| `(builder)/builder/proposals/route.tsx` | Load builder proposal list, draft status, submitted review state, and lender decisions. | Builder proposal access denied. |
| `(builder)/builder/proposals/new/route.tsx` | Create or resume draft proposal for org/user; load proposal policy, package completeness, and readiness status. | Proposal creation denied, draft unavailable. |
| `(builder)/builder/proposals/new/roadmap/route.tsx` | Load draft proposal, milestones, dependencies, budget assumptions, working-capital input, optimizer outputs. | Draft unavailable, dependency cycle, optimizer unavailable. |
| `(lender)/lender/proposals/route.tsx` | Load submitted proposal queue, risk/completeness filters, assignments, and review-ready counts. | Proposal queue access denied. |
| `(lender)/lender/proposals/$proposalId/route.tsx` | Load proposal package summary, documents, site map summary, roadmap preview, draw plan comparison, warnings. | Proposal not found, admin access denied. |
| `(staff)/operations/evidence/$workOrderId/route.tsx` | Load Evidence Review Work Order, milestone completion package, evidence, geofence state, budget variance, more-info state, allowed staff/builder actions. | Work order not found, stale/superseded work order, final approval attempted by non-admin. |
| `(staff)/site-visits/$siteVisitId/route.tsx` | Load Site Visit Work Order, cached field package, target milestones, checklist, prior evidence, offline sync metadata. | Site visit not assigned, offline cache unavailable, tenant mismatch. |
| `(lender)/approvals/milestones/$workOrderId/route.tsx` | Load Admin Approval Package, staff recommendation, site visit report, budget variance, warnings, prior overrides. | Package incomplete, admin access denied, stale recommendation. |
| `(shared)/draw-releases/$drawId/route.tsx` | Load Draw Release Work Order, included milestones, release amount, fee treatment, loan availability, ledger integration state, receipt state. | Draw not found, draw access denied, tenant mismatch. |
| `(shared)/policies/route.tsx` | Load tenant policy configuration, editable sections, policy version metadata. | Policy access denied, concurrent policy version conflict. |
| `(shared)/audit/route.tsx` | Load paginated audit events with tenant-scoped filters. | Audit access denied, invalid filter. |
| `(shared)/integrations/route.tsx` | Load API key metadata, webhook endpoints, subscriptions, delivery summaries, external ID mappings. | Integration access denied, secret display disallowed. |

## 28.12 Navigation Model

| Nav item | Route | Persona group | Visibility |
|---|---|---|---|
| Builds | `/app/builds` | `(shared)` | All users with Build access. |
| Builder Proposals | `/builder/proposals` | `(builder)` | Builder users tracking proposal status and returning to drafts. |
| New Proposal | `/builder/proposals/new` | `(builder)` | Builder users and lender admins creating on behalf of builder. |
| Proposal Review | `/lender/proposals` | `(lender)` | Lender Admin. |
| Operations | `/app/operations/evidence` | `(staff)` | Lender Staff, Lender Admin. |
| Site Visits | `/app/site-visits` | `(staff)` | Site Visit Staff, Lender Staff, Lender Admin. |
| Approvals | `/app/approvals/milestones` | `(lender)` | Lender Admin. |
| Draw Releases | `/app/draw-releases` | `(lender)` | Lender Admin, finance/ops users where configured. |
| Policies | `/app/policies` | `(lender)` | Lender Admin, Organization Admin. |
| Audit | `/app/audit` | `(lender)` | Lender Admin, Organization Admin, auditors where supported. |
| Integrations | `/app/integrations` | `(lender)` | Organization Admin, technical admin. |

## 28.13 Screen-to-Route Coverage

| Screen ID | Covered by route IDs | Route treatment |
|---|---|---|
| SCR-001 | RTE-001 through RTE-005, RTE-007 | Route/route file |
| SCR-002 | RTE-014 | Proposal Package section |
| SCR-003 | RTE-014 | Proposal Package section/drawer |
| SCR-004 | RTE-014 | Proposal Package section/drawer |
| SCR-005 | RTE-014, RTE-015 | Inline/sheet; referenced by optimizer context |
| SCR-006 | RTE-014 | Proposal Package section |
| SCR-007 | RTE-015 | Full route; heavy workspace |
| SCR-008 | RTE-015, RTE-013 | Overlay/panel on Gantt or budget revision |
| SCR-009 | RTE-014, RTE-030 | Proposal Package review section and builder proposal status list |
| SCR-010 | RTE-016 | Route |
| SCR-011 | RTE-017 | Route |
| SCR-012 | RTE-008, RTE-009 | Active Builds list plus canonical Build Workspace route |
| SCR-013 | RTE-009, RTE-010 | Milestone status in Build Workspace; deep-linkable milestone drawer/page |
| SCR-014 | RTE-011 | Mobile route |
| SCR-015 | RTE-018 | Route |
| SCR-016 | RTE-019 | Route |
| SCR-017 | RTE-019 | Evidence detail tab/panel |
| SCR-018 | RTE-020 | Route |
| SCR-019 | RTE-021 | Mobile/offline route |
| SCR-020 | RTE-022 | Route |
| SCR-021 | RTE-023 | Route |
| SCR-022 | RTE-009, RTE-024 | Draw release readiness inside Build Workspace; kanban route for lender operations |
| SCR-023 | RTE-025 | Focused approval route subordinate to Build Workspace draw readiness context |
| SCR-024 | RTE-026 | Route |
| SCR-025 | RTE-012, RTE-013 | Route |
| SCR-026 | RTE-027 | Route |
| SCR-027 | RTE-028, RTE-009 | Global audit route; build activity drawer |
| SCR-028 | RTE-029 | Route |
| SCR-029 | RTE-009 | Build Workspace drawer |
| SCR-030 | RTE-009, RTE-021 | Build Workspace/Site Visit panel |

## 28.14 Implementation Notes

- Use TanStack Router default `routeToken` (`route`): directory route files are named `route.tsx`. Do not use the Next.js layout-file convention.
- Use `(persona)` route group directories for organization only. They do not create route, URL, or component boundaries. Ignore scaffold-only wrappers like `_authenticated` in product route documentation.
- Do not duplicate same URL route files across persona groups. Use explicit URL namespaces such as `/builder/*` and `/lender/*` when the user mental models are different, even if underlying domain objects are related.
- Prefer correct Convex component names: `<Authenticated>` and `<Unauthenticated>`.
- `AuthLoading` should render skeletons that match route level: AppShell skeleton, workspace skeleton, kanban skeleton, or mobile capture skeleton.
- Heavy workspace, Gantt, Mapbox, evidence gallery, and mobile capture screens should use lazy route components below their `route.tsx` guard.
- Build Workspace remains the central shared control plane. Kanban queues, focused evidence review screens, mobile site-visit flows, and focused approval screens are subordinate operational surfaces; they should route back to `/app/builds/:buildId` with focused milestone/draw context whenever useful. 
- Builder proposal routes own status, drafts, intake surfaces, and draft roadmap work; lender proposal routes own intake review and decisioning.
- Staff recommendation routes must not expose final approval mutations unless current user has Lender Admin role.
- Chat route must not exist for MVP; chat is a panel and cannot perform formal approvals.
- Offline site visit route must support cache-first rendering for assigned work only; it must not expose unrelated build data while offline.
