# Builder Draw Request Workspace

## Purpose

The builder Draws workspace presents approved, reimbursement-eligible milestone value as one pooled available balance. Builders may request any amount up to that balance, but the pool is only a presentation: every request is deterministically attributed to specific approved Milestone and Draw Group source buckets. Planned draw dates remain planning context and never become request records by implication.

The production surface lives in `Details → Draws` on `/builder/builds/$buildId`. Builder staff share the same route and receive either full or read-only behavior from the existing draw permission.

## Domain separation

Three records intentionally represent different facts:

- `plannedDrawScheduleRows` are mutable forecasts. They describe expected timing and amount, do not reserve availability, and remain `planned`.
- `activeBuildDrawRequests` are actual builder requests and the authoritative Draw Release Work Orders. Each has an immutable request key, `workOrderKey`, idempotency key, amount, audit trail, and review/release lifecycle.
- `activeBuildDrawRequestAllocations` are the immutable source ledger for a request. Each row attributes whole Canadian cents to one approved Milestone and its Draw Group.

The UI can temporarily project legacy planned rows as forecast data during cutover, but new writes never mutate a forecast row into a request.

## Availability equation

All values use whole Canadian cents.

```text
eligible source buckets
  = approved milestones ordered by milestone.order, milestone.key, milestone._id

approved milestone value
  = sum(eligible source bucket drawAvailabilityCents)

unlocked value
  = min(approved milestone value, facility principal) when a facility exists

reserved value
  = sum(allocation amounts for requests with status requested, in_review,
        ready_for_admin, approved_for_release, or released)

available now
  = max(0, unlocked value - reserved value)
```

The facility cap is applied to source buckets in the same deterministic order. A request consumes each bucket's remaining amount FIFO until its exact amount is attributed. The allocation sum must equal the request amount or the mutation fails without creating a request. Rejected and withdrawn requests do not reserve money. Planned draw rows never reserve money. Released requests remain part of the historical money-out total so previously disbursed capital cannot become requestable again.

This supports partial draw requests against fully approved Milestones; it does not make partially completed work reimbursement-eligible. v1 remains reimbursement-only.

## Request lifecycle

```text
requested ── start review ──> in_review ── recommend ──> ready_for_admin
    │                                                   │
    └── withdraw ──> withdrawn                          ├── reject ──> rejected
                                                        └── approve ──> approved_for_release
                                                                          │
                                                                          └── release ──> released
```

- Builders and authorized builder staff can create a request.
- Requests can be partial or for the full current balance.
- A client operation ID makes retries idempotent. The same operation ID cannot be reused for a different amount.
- Only `requested` records can be withdrawn or moved into operations review.
- Lender operations can move `requested → in_review → ready_for_admin` and must record a recommendation.
- Only lender admins can move `ready_for_admin → approved_for_release | rejected`.
- Only `approved_for_release` records can be released by a lender admin.
- Release creates the capital event once and retains the request history.
- Every transition writes an organization-scoped audit event with actor, roles, timestamp, prior/new state, reason where required, and warnings.

## UI behavior

- The first value is `Available now`, with exact cents.
- Expandable statement groups reconcile approved milestone money in against submitted and completed money out.
- Expanded records use the shared Card primitive; the surrounding statement remains flat.
- Pending milestone verification and behind-plan values are summarized and also shown against dated milestone rows.
- Past planned draw dates are removed from `Future planned draws`.
- Mobile order is balance, request/status controls, then the milestone schedule.
- A request uses amount → review → receipt steps. A failed retry preserves the input and reuses the same operation ID.
- Receipts, request cards, lender review queues, and release history show the Draw Release Work Order key and exact Milestone / Draw Group source allocations.
- Before approval, a request can be withdrawn. Successful withdrawal closes the confirmation and announces that the amount is available again.
- Blocked users receive a reason and a native email/phone handoff to Fairlend. The application does not send messages itself.

## Legacy data migration

`migrateActiveBuildDrawRequests` is an explicit, idempotent, backoffice-only mutation. It first backfills source allocations and work-order keys for existing request-ledger rows, normalizes legacy `approved` records to `approved_for_release`, then copies non-planned lifecycle rows out of `plannedDrawScheduleRows` and restores the source rows to planning-only state.

The migration is intentionally not automatic and has not been run by this implementation. Run it once per active build only after the operator selects the target deployment and validates a backup or export.

Example shape:

```bash
bun x convex run --deployment <dev-or-staging> --identity '<admin UserIdentity JSON>' \
  production_proposals:migrateActiveBuildDrawRequests \
  '{"buildId":"<active build id>","workosOrganizationId":"<organization id>"}'
```

Do not add `--prod` until the operator has validated counts and representative requests in a non-production deployment.

### Migration verification

For each migrated build, verify:

1. The mutation result reports the expected `attributed`, `migrated`, and `skipped` counts.
2. Every former lifecycle row appears once in `activeBuildDrawRequests` with a unique `workOrderKey`.
3. Every reserving request has allocation rows whose amount sum exactly equals the request amount.
4. Every source forecast row is `planned` and has its original proposal amount.
5. Available-now arithmetic matches the approved milestone allocation ledger.
6. Timeline, calendar, builder detail, and brokerage draw-control projections show actual requests separately from forecasts.
6. Re-running the mutation reports the existing rows as skipped and creates no duplicates.

## Rollback

Application rollback is code-only: redeploy the previous application and Convex function bundle. Data migration rollback is not automatic because request records may receive legitimate reviews after cutover. If rollback is required after migration, pause draw writes, export both tables, reconcile by `clientOperationId` and `plannedDrawKey`, and apply an operator-reviewed repair mutation rather than deleting records ad hoc.

## Verification coverage

- Projection tests cover exact availability, pending/backlog classification, and past-forecast filtering.
- Component tests cover partial submission, authoritative receipts, and idempotent retry behavior.
- Convex tests cover independent request records, over-limit rejection, fractional-cent rejection, note limits, withdrawal, and forecast preservation.
- Existing builder-route and production build-detail suites protect the surrounding Details workflow.
