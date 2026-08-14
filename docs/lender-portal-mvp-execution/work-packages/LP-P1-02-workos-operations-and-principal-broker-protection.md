# LP-P1-02 — WorkOS operations and Principal Broker protection

Status: in-progress

Depends on: LP-P1-01

## Objective

Reuse the existing WorkOS-first membership operations, constrain them to the
active organization and supported role set, and add the protected Principal
Broker transfer transition. Accepted external commands must expose pending
canonical synchronization without optimistic product-owned projection writes.

## Ownership

Extend `convex/workosManagement.ts`, `convex/brokerageProvisioning.ts`, existing
audit ownership, and focused tests. WorkOS remains the identity authority;
webhook/sync remains the projection writer.

## Traceability selectors

- `LP-PERM-01..LP-PERM-04`
- `LP-AC-ORG-03..LP-AC-ORG-05`
- `LP-DEC-01`
- `LP-DEC-03`
- `LP-US-001`
- `LP-US-004..LP-US-012`
- `LP-US-077..LP-US-078`
- `LP-US-087`
- `LP-E2E-08`
- `LP-P1-W04..LP-P1-W06`
- `LP-P1-W09`
- `LP-P1-T02..LP-P1-T04`
- `LP-P1-T06`
- `LP-P1-X02..LP-P1-X03`
- `LP-QG-06..LP-QG-07`

## Context pointers

Load these sections only:

- `docs/lender_portal_mvp_feature_brief.md`: Lender Organizations and users,
  Permissions, Organization and access acceptance criteria, Phase Zero decisions.
- `docs/lender-portal-prototype-promotion.md`: Lender Organization Management.
- `docs/lender_portal_mvp_spec.md`: User Stories 1–14, E2E-08, Testing Decisions.
- `docs/lender_portal_mvp_implementation_plan.md`: Phase 1 and transition row
  for membership deactivation.
- `convex/workosManagement.ts`, `convex/workosProjection.ts`,
  `convex/brokerageProvisioning.ts`, and their focused tests.
- `convex/_generated/ai/guidelines.md` and repository `AGENTS.md`.

## Steps and completion criteria

1. Verify current invite, role-change, membership creation, deactivation, and
   projection-reconciliation behavior. Completion criterion: accepted, failed,
   and delayed-sync states are explicitly distinguished and no product flow
   writes a webhook-owned projection table.
2. Restrict supported lender role inputs to `admin`, `principle-broker`,
   `broker`, and `broker-staff`, preserving the canonical misspelled slug.
   Completion criterion: unsupported and cross-organization operations fail at
   the server boundary before an external command is sent.
3. Guard normal role removal and deactivation for the active Principal Broker.
   Completion criterion: every normal command fails closed with a typed
   transfer-required result and cannot temporarily leave zero active owners.
4. Implement one idempotent protected transfer transition through the WorkOS
   authority boundary. Completion criterion: retries converge, exactly one
   active Principal Broker remains after reconciliation, partial external
   failure is recoverable, and no application-owned role record is introduced.
5. Append material audit history for invitation, role change, activation,
   deactivation, and transfer. Completion criterion: actor, role, tenant,
   organization, prior/new state, warning, timestamp, and reason where required
   are asserted at the highest available command seam.
6. Exercise failure and concurrency cases. Completion criterion: competing
   deactivation/transfer, repeated commands, WorkOS rejection, and delayed
   webhook/sync produce one deterministic, recoverable result.

## Required verification

- Focused `convex-test` WorkOS management and projection suites
- Negative cross-tenant, cross-organization, unsupported-role, and protected-target tests
- Idempotency and partial-failure tests for transfer
- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json`
- `bun run validate:lender-portal-execution`

## Completion gate

The packet is complete only when the canonical WorkOS commands implement all
supported operations, the active Principal Broker can change only through one
protected transition, projection state follows canonical reconciliation, and
exact-commit evidence proves history is retained.
