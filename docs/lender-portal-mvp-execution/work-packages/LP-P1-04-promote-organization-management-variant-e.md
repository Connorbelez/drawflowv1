# LP-P1-04 — Promote Organization Management Variant E

Status: verified

Depends on: LP-P1-01, LP-P1-02, LP-P1-03

## Objective

Directly promote locked Lender Organization Management Variant E into the
production lender route. Reuse the canonical user-management directory and
member sheet, connect the Phase 1 projections and commands, and preserve the
prototype hierarchy and interaction gates.

## Required ticket language

> Directly promote the selected Lender Portal prototype. Start from its route
> and component structure; do not rebuild an alternative surface from the
> requirements. Replace only representative local data and local-only actions
> with canonical production integrations while preserving the documented
> hierarchy, interaction gates, and authorization boundaries.

## Ownership

Extract the inline Variant E composition from
`src/routes/lender.organization-management-prototype.tsx` into one reusable,
typed component used by both prototype and production call sites. Extend
`UserManagementDirectoryTable` and `UserDetailSheet` through composition and
variants. Preserve their current Back Office behavior.

## Traceability selectors

- `LP-AC-ORG-01`
- `LP-AC-ORG-03..LP-AC-ORG-10`
- `LP-US-004..LP-US-009`
- `LP-US-077..LP-US-078`
- `LP-E2E-08`
- `LP-PROT-ORG`
- `LP-P1-W07..LP-P1-W12`
- `LP-P1-T02..LP-P1-T04`
- `LP-P1-X02`
- `LP-QG-08`

## Context pointers

Load these sections only:

- `docs/lender-portal-prototype-promotion.md`: Promotion rule and Lender
  Organization Management locked implementation contract.
- `src/components/prototypes/README.md`: Lender Organization Management.
- `docs/lender_portal_mvp_feature_brief.md`: Prototype promotion rule,
  Organization management UI behavior, Organization and access acceptance.
- `docs/lender_portal_mvp_implementation_plan.md`: Delivery rule, locked
  Organization Management contract, Phase 1.
- Selected prototype route, shared table, shared sheet, shared user-management
  types, existing production Back Office route, and their focused tests.

Before UI work, use the `reference-visual-parity` workflow. The selected
prototype is the acceptance reference, so visual work may refine production
integration states but may not redesign the locked hierarchy.

## Steps and completion criteria

1. Capture the selected Variant E route at the implementation baseline and map
   its component tree. Completion criterion: hierarchy, toolbar, tabs, staged
   operations, focus order, and responsive behavior have named acceptance
   evidence.
2. Extract the selected composition without changing the prototype call site.
   Completion criterion: the prototype still renders the same selected variant
   and no rejected variant enters the reusable production component.
3. Mount the reusable composition in the production lender route with one
   active-organization loader. Completion criterion: search and status filters
   use permission-shaped canonical projections and direct URLs cannot cross the
   active organization boundary.
4. Compose the lender route through capability props. Completion criterion:
   active same-organization `lender-admin` users can review and save versioned
   proposal, Milestone, and Draw member grants with a required reason; other
   lender roles see assigned and effective grants read-only.
5. Connect assignment-scoped member deactivation. Completion criterion: self,
   last-active-admin, inactive, and cross-organization targets fail closed;
   provider acceptance suspends authority immediately; failure restores access
   and permits safe retry; webhook projection finalizes without deleting
   history.
6. Keep the Back Office-only organization default Review Requirements editor on
   the selected organization detail surface by directly reusing the approved
   Variant A fields. Completion criterion: immutable versions, expected-version
   protection, actor/time/reason, current eligibility, loading/empty/error
   states, and future-assignment scope are visible; lender users have no write
   authority.
7. Verify shared-component safety. Completion criterion: Back Office user
   management tests and visual behavior remain green, with styling differences
   expressed through supported composition or CVA variants.
8. Verify the promoted routes. Completion criterion: SSR/render, loading, empty,
   forbidden, error, keyboard, focus, status announcement, responsive, and
   browser interaction evidence passes against Variant E.

## Required verification

- Focused shared-component and lender production-route tests
- Existing Back Office user-management regression suite
- Keyboard and screen-size browser evidence
- Variant E visual comparison at the exact accepted commit
- `bun run build`
- `bun run validate:lender-portal-execution`

## Completion gate

The packet is complete only when production directly uses the extracted Variant
E composition and shared components, every operational state is canonical,
authorization is server-enforced, Back Office behavior is unchanged, and
independent visual and interaction evidence is attached to one exact commit.
