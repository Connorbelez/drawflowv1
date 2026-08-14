# LP-P1-01 — Canonical organization context and authorization

Status: in-progress

Review candidate: `4fb59b5743be08936705cad2bb3ccda3ca3dabad`

Review status: CodeRabbit CLI completed five committed-range review passes and
every actionable finding from those passes was resolved. The exact-candidate
closure retry was refused by CodeRabbit's review rate limit. Independent
acceptance evidence remains unattached until that read-only retry completes.

Depends on: current-checkout preflight

## Objective

Extend the existing fluent-convex authorization boundary so every lender-facing
query and command derives and validates one active WorkOS organization context,
canonical active membership, supported roles, tenant scope, and the applicable
product-resource authority. Preserve legitimate multi-organization membership.

## Ownership

Extend `convex/authz.ts`, `convex/fluent.ts`, `convex/workosProjection.ts`, and
their focused tests. Reuse `convex/workos_permission_access.ts`. Do not create
an identity, organization, membership, or role source of truth.

## Traceability selectors

- `LP-SCOPE-01`
- `LP-INV-01..LP-INV-02`
- `LP-INV-12`
- `LP-PERM-03..LP-PERM-04`
- `LP-AC-ORG-02`
- `LP-AC-ORG-05`
- `LP-AC-ORG-07`
- `LP-US-002..LP-US-003`
- `LP-US-007`
- `LP-US-010..LP-US-014`
- `LP-US-088`
- `LP-P1-W01..LP-P1-W03`
- `LP-P1-W05`
- `LP-P1-T01..LP-P1-T02`
- `LP-P1-T05..LP-P1-T06`
- `LP-P1-X01`
- `LP-P1-X03..LP-P1-X04`
- `LP-QG-01..LP-QG-02`

## Context pointers

Load these sections only:

- `docs/lender_portal_mvp_feature_brief.md`: Lender Organizations and users,
  Domain invariants, Permissions, Organization and access acceptance criteria.
- `docs/lender_portal_mvp_spec.md`: User Stories 1–14, Domain ownership and
  identity, Testing Decisions, E2E-08.
- `docs/lender_portal_mvp_implementation_plan.md`: Delivery rule, Mandatory
  current-checkout gate, Cross-phase quality gates, Phase 1.
- `docs/auth-rbac-foundation.md`.
- `convex/_generated/ai/guidelines.md` and repository `AGENTS.md`; the
  repository fluent-convex rules take precedence over generated syntax examples.

## Steps and completion criteria

1. Re-run the authorization and projection inventory against the actual
   implementation checkout. Completion criterion: every existing organization,
   membership, role, permission, brokerage, and identity owner is accounted for
   and discrepancies from `current-checkout-preflight.md` are recorded.
2. Define one typed active-organization context resolved from authenticated
   identity plus canonical projections. Completion criterion: missing,
   inactive, ambiguous, foreign-tenant, and foreign-organization contexts fail
   closed while a valid selected membership resolves deterministically.
3. Extend shared fluent authorization helpers with tenant, organization,
   membership-status, role/permission, and product-resource checks. Completion
   criterion: lender feature files consume the shared helpers and no feature
   implements its own identity lookup or membership authority.
4. Preserve Back Office tenant authority separately from lender
   organization-local authority. Completion criterion: allow/deny tests prove
   each permission-matrix path without granting Principal Broker or Admin
   cross-organization self-service.
5. Test the authenticated command/query boundary. Completion criterion:
   multi-membership, inactive membership, unsupported role, tenant mismatch,
   organization mismatch, and allowed cases all pass through fluent-convex tests.

## Required verification

- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json`
- Focused `convex-test` suites for `authz` and WorkOS projection context
- `bun run validate:lender-portal-execution`

## Completion gate

The packet is complete only when every lender authorization consumer can use
one canonical organization-context helper, forbidden cases fail at the server
boundary, existing Back Office and Builder authorization tests remain green,
and evidence is attached to one exact commit.
