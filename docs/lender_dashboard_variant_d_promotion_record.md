# Lender Dashboard Variant D promotion record

## Decision lock

- Requirement: `LP-PROT-DASH`; GAP-14, Dashboard is live but partial and still owned by a prototype route module.
- Selected source: `src/routes/lender.prototype.tsx`, Variant D.
- Production consumer: authenticated lender workspace at `/lender`.
- Source commit: `62b8eb75e9c1ebfa6ac3323a38e303d9af2b1df4`.
- Frozen source SHA-256: `5df045fa8271ed400e1b839dd17e0f2909a504eb486f609fba020a887ebf6e9f`.
- Source condition: the file had a pre-existing user-owned waived diff. GAP-14 did not edit it.
- Rejected variants A, B, and C remain prototype-only comparison history.

## Copy checkpoint

- The source file was copied byte-for-byte to `src/features/lender-dashboard/LenderDashboardVariantD.tsx` before productionization.
- Source and initial copy SHA-256 values matched.
- `git diff --no-index` returned no difference at the copy checkpoint.
- Productionization then removed prototype routing, rejected variants, fixtures, and prototype chrome only from the production-owned copy.

## Canonical wiring ledger

| Contract element | Canonical owner | Scope and transformation | Empty or unavailable behavior | Evidence |
| --- | --- | --- | --- | --- |
| Current lender organization | `lenderOrganizations.getCurrentLenderOrganization` | WorkOS-authenticated application Lender Organization | Shows the support-directed unassigned state and skips portfolio data | Route test |
| Needs-my-attention rows | `lender_portal.getLenderDashboard` | Current membership, assignment, policy, eligibility, revision or cycle, and canonical proposal, Milestone, Draw, and Site Visit state | Shows no-action copy without invented rows | Convex and route tests |
| Assigned proposal count | `proposalLenderAssignments` through the existing dashboard projection | Current tenant, Brokerage, and Lender Organization assignment boundary | Zero when no authorized assignment exists | Convex scope test |
| Active-Build count and ledger | `listAccessibleLenderBuilds` and canonical Build records | Exhaustive current assignment authorization; no prototype fallback | Empty table row when no authorized active Build exists | Convex and authenticated route evidence |
| Milestone count | Canonical `buildMilestones` already loaded for each authorized Build | Exact bounded authorized collection length; fail closed above the dashboard record limit | Zero when no authorized Milestones exist | Convex and route tests |
| Draw count | Canonical `activeBuildDrawRequests` already loaded for each authorized Build | Exact bounded authorized collection length; fail closed above the dashboard record limit | Zero when no authorized Draws exist | Convex and route tests |
| Proposal action link | `/lender/proposals/$proposalId` with exact assignment ID | Supported lender proposal authorization boundary | No link is created without its canonical target tuple | Route test |
| Milestone and Draw action links | `/lender/builds/$buildId` | Supported lender Build authorization boundary | No link is created without an authorized Build target | Route test |

The Dashboard is a read-only rebuildable projection. It owns no lifecycle mutation, audit event, notification, outbox event, or state transition.

## Production states and interface review

- Loading: stable production Card while organization/dashboard queries resolve.
- Ready: locked Variant D order, with Needs my attention before the durable portfolio ledger.
- Empty: explicit no-action and no-active-Build states.
- Unassigned: portfolio query is skipped and the operator receives a supported admin contact path.
- Forbidden/error: lender parent-route authorization and the shared route error boundary fail closed; the component does not render fixture data.
- `better-interface`: no actionable findings remain after semantic heading, accessible support-link, progress-label, and responsive count-group checks.
- `make-interfaces-feel-better`: no actionable findings remain; count and monetary values use tabular numerals, transitions are property-scoped, icons are decorative, and targets retain visible focus treatment.
- `impeccable harden`: long rows use truncation with full accessible link names, tables use the shared horizontal-overflow primitive, count badges wrap, and ready/loading/empty/unassigned/error ownership remains explicit.
- `impeccable polish`: preserved the locked action-first hierarchy and incumbent token/component system; no redesign was introduced.
- Mechanical Impeccable detector: no findings for the production component and route.

## Verification and status

- Focused production route tests cover production-owned import wiring, canonical queries, all rows beyond the former visual cap, explicit Milestone/Draw counts, and unassigned-query skipping.
- Focused Convex tests cover canonical counts and cross-tenant/cross-Brokerage exclusion.
- Authenticated local `/lender` route rendered the production hierarchy, explicit counts, canonical action links, and no prototype banner or root error.
- Scoped Biome check, Convex/app typecheck, and production build passed.
- Final status: Wired. Deployed-SHA, narrow-viewport screenshot, zoom, and screen-reader evidence remain release evidence, so this record does not claim Verified.
