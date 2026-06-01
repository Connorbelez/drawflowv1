# Contractors v1 Implementation Notes

Created: 2026-05-31

## Scope Landed

- Added brokerage-scoped contractor profiles that can exist without an authenticated WorkOS account, while preserving a first-class link path to associate a contractor profile with an onboarded WorkOS user later.
- Added contractor operating data for kind, city, pay rate, pay unit, capabilities, equipment, availability windows, onboarding status, and work history.
- Added build-level contractor attachment first, then milestone and submilestone assignment from the contractor pool attached to that active build.
- Added post-hoc assignment support so backoffice can attach contractors to completed milestones for performance tracking and historical reporting.
- Added assignment-level cost monitoring fields for agreed rate, rate unit, estimated hours, actual hours, estimated cost, actual cost, and cost notes.
- Added contractor quality ratings from builder milestone completion and site visit report flows.
- Added evidence contractor tagging with optional submilestone keys so contractor detail pages show only work-relevant photos, not every photo from the broader site visit.
- Added contractor roster, contractor detail, contractor onboarding, and active-build milestone assignment surfaces.

## Production Data Model

Contractors are intentionally scoped to `brokerageId`, not a builder, proposal, or build. A contractor can be reused across multiple builders and active builds inside the same brokerage.

Core contractor tables:

- `contractorProfiles`: canonical profile, contact info, role, kind, city, default pay profile, onboarding status, and optional WorkOS user linkage.
- `contractorCapabilities`: trade, specialty, rating, and notes used for future cost, quality, and timeline estimation.
- `contractorEquipment`: owned/available equipment records with availability and notes.
- `contractorAvailabilityWindows`: recurring or dated capacity windows.
- `buildContractorAssignments`: contractor membership on an active build.
- `milestoneContractorAssignments`: contractor assignment to a build milestone or specific submilestone, including rate, hours, estimated cost, actual cost, and cost notes.
- `contractorQualityRatings`: quality score and note captured from builder completion claims or site visits.

Evidence tables now store optional `contractorIds` and `submilestoneKey` values. This is the contract that powers scoped work-history photo retrieval.

## Workflows

### Contractor Creation

Backoffice can create contractor profiles from the contractor roster, the onboarding page, or the active-build assignment drawer. The quick-add drawer captures basic identity plus capabilities, equipment, schedule, and pay profile in one pass.

### Build Attachment

Contractors must be attached to an active build before they can be assigned to a milestone. This keeps build-level access, planning, and assignment state explicit instead of treating every brokerage contractor as available everywhere.

### Milestone Assignment

Active build milestone cards and milestone detail sheets expose an `Assign contractor` action. The assignment flow can reuse an already attached contractor or quick-create a new contractor, attach them to the build, and assign them to the selected milestone or submilestone.

### Evidence and Ratings

Builder milestone completion now captures a 1-5 work quality rating and optional note. If contractors are assigned to that milestone or submilestone, the backend records per-contractor quality rows.

Site visit reports can also submit contractor ratings. Evidence captured during a site visit can be tagged to the selected milestone or submilestone, and the backend derives matching contractor IDs from the target assignment scope.

### Contractor Detail

The contractor detail page aggregates:

- profile and WorkOS link state,
- build and milestone/submilestone work history,
- tagged evidence assets relevant to the contractor's assigned scope,
- quality rating averages and samples,
- assignment cost totals, hour totals, and estimated-vs-actual variance,
- capabilities, equipment, availability, and pay profile.

## Identity and Future Cross-Brokerage Linking

`contractorProfiles.workosUserId` is optional by design. Backoffice can link a profile during onboarding, but non-authenticated contractor records remain valid for historical tracking and planning.

Cross-brokerage identity linking is intentionally not implemented in v1. The current data shape supports adding a later identity-resolution table that links multiple brokerage-scoped contractor profiles to a shared contractor identity while preserving brokerage ownership and auditability.

## Authorization and Audit

All production contractor functions use the authenticated fluent-convex chains in `convex/production_proposals.ts` and resolve brokerage scope from the active WorkOS organization projection.

Material contractor actions write production audit events and event outbox rows:

- profile creation,
- build attachment,
- milestone assignment,
- WorkOS profile linking,
- quality rating capture.

## UI Surfaces

- `/backoffice/contractors`: contractor management roster with filters, ratings, capacity signals, and quick-add access.
- `/backoffice/contractors/$contractorId`: contractor detail page with work history, tagged photos, ratings, operating profile, and WorkOS link form.
- `/backoffice/onboard-contractor`: contractor onboarding workspace using the same quick-add component and WorkOS linking path.
- `/backoffice/builds/$buildId`: active build milestone cards and milestone sheets expose contractor assignment controls where production mutations are available.
- Site visit token flow: supports quality scoring and milestone/submilestone evidence tagging for contractor-specific work history.
- Timeline workspace milestone completion: supports builder-side work quality scoring and note capture.

## Verification

Latest completed run on 2026-05-31:

- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json`
- `bun x vitest run convex/contractors_v1.test.ts`
- `bun run test src/components/nav-user.test.tsx src/components/app-shared.test.tsx src/features/backoffice-build-detail/ProductionBuildDetailSurface.test.tsx`
- `bun run build`
- `bun run test`

Final full-suite result:

- 69 test files passed.
- 443 tests passed.

Browser smoke verification covered:

- `/backoffice/contractors`
- `/backoffice/onboard-contractor`
- `/backoffice/contractors/contractor_visual_masonry`

All three rendered under visual parity fixture mode with no console errors.
