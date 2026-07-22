# Production Build Detail Workspace Migration

## Outcome

`/backoffice/builds/$buildId` now resolves production `activeBuilds` only. Invalid,
inaccessible, or non-production build IDs render a production missing state instead
of falling back to the demo route.

The production detail surface restores the previous build workspace composition:
site photo carousel, build and loan details, reimbursement draw actions,
milestone kanban, milestone review sheet, contractors, documents, internal/public
notes, and the actionable event rail.

## Production Data

The active build detail query now includes build-owned operational rows:

- `buildDocuments`
- `buildEvidenceAssets`
- `buildNotes`
- `buildContractorAssignments`
- `buildSiteVisits`
- active-build audit events and quick-action events

Loan closing copies proposal documents and evidence assets into active-build
tables so the workspace remains durable after proposal closure.

## Production Actions

The route wires production mutations for:

- adding build documents and notes
- attaching or creating contractors
- requesting, approving, rejecting, and releasing reimbursement draws
- requesting milestone info
- assigning site visits
- approving or rejecting milestones

All mutations write production audit events on the active build entity.

## Verification

Completed gates:

- `bun x convex codegen`
- `bun x vitest run convex/production_proposals.test.ts`
- `bun x vitest run src/features/backoffice-build-detail/ProductionBuildDetailSurface.test.tsx`
- `bun x tsc -p convex/tsconfig.json --noEmit`
- `bun run test`
- `bun run build`

Browser smoke check reached the production active build route and rendered the
production Timeline tab at:

`http://localhost:3000/backoffice/builds/ks7rnjvrn3sjs7mxdzzn91cf7h87k5zw?rail=closed&tab=timeline`

A fresh unauthenticated browser tab still shows the expected AuthKit
`Unauthorized` state.
