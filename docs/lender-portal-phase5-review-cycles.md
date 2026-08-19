# Lender Portal Phase 5 review cycles

Phase 5 keeps the canonical `buildMilestones` and `activeBuildDrawRequests`
records as the stable Milestone Completion and Draw Request identities. It does
not create a second request aggregate.

`lenderPortalReviewCycles` stores immutable, monotonic submission snapshots for
those identities. Each cycle captures the submitted Milestone or Draw data,
the copied Build review-policy requirements, and the relevant canonical
Evidence Asset or Evidence Package references. `lenderPortalReviewDecisions`
stores append-only Back Office and lender decisions for one exact cycle.

The public backend seams are in `convex/lender_portal_phase5.ts`:

- `submitBuilderReviewRequest` opens cycle 1 or resubmits a
  `correction_required` request as cycle N+1. The stable canonical request ID is
  unchanged and the new cycle begins without current approvals.
- `decideBackofficeReviewRequest` and `decideLenderReviewRequest` require the
  exact current cycle. Rejection requires Builder-visible revision
  instructions; reviewer-only rationale remains on the authorized decision
  record.
- Builder, Back Office, and lender query seams use separate explicit response
  validators. Builder payloads expose requirements, submission state,
  eligibility, and published revision instructions, but never reviewer identity
  or private rationale.
- Back Office and lender queue/detail projections derive from the same current
  cycle and append-only history. Lender access also requires the current
  Proposal assignment and the canonical Lender Organization permission.

Queue and history queries require native Convex pagination options. Queue
responses expose the standard `page`, `continueCursor`, and `isDone` contract;
review-detail responses expose the same contract under `cycles`, while Phase 4
proposal-confirmation responses expose it under `history`. Callers must follow
`continueCursor` until `isDone` is true when complete authorized history is
required. Current-cycle queue rows use an indexed `isCurrent` projection and
bounded decision summaries. A missing or superseded target is returned as an
unavailable, non-actionable row and does not fail the rest of the page.

Milestone submission rejects malformed or cross-scope Evidence Package
revision references before a review cycle is written. Every referenced package
and Sub-milestone must match the canonical Build, organization, Brokerage,
Milestone, keys, frozen revision, and completion-claim revision metadata.

Material submission, resubmission, approval, and correction transitions write
the canonical Build-scoped audit stream. Command idempotency is scoped to the
stable request identity. Convex transaction rechecks reject stale cycles and
competing decisions safely.

Phase 6 remains responsible for evidence qualification and final policy
enforcement beyond the Phase 5 cycle substrate. Phase 7 remains responsible for
product UI promotion.
