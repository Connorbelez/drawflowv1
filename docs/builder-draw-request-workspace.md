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

`migrateActiveBuildDrawRequests` is an explicit, per-build,
backoffice-only mutation. It:

- assigns a unique `workOrderKey` to every legacy request;
- creates deterministic FIFO source allocations against approved, unlocked
  milestones;
- normalizes legacy `approved` requests to `approved_for_release`;
- copies lifecycle rows out of `plannedDrawScheduleRows` and restores those rows
  to their original planning-only amount and status; and
- writes one organization-scoped audit event only when an apply changes data.

The migration rejects cross-organization data, non-reimbursement requests,
non-positive or fractional-cent amounts, duplicate work orders, partial
allocations, and reservations that cannot be covered by approved milestone
sources. It is bounded to one build and executes atomically.

During the widened-schema release, active-build detail queries tolerate only
fully unattributed legacy requests. They reserve those requests against the
same deterministic FIFO sources used by the migration and return
`drawFunding.requiresAttributionMigration: true`, so legacy builds remain
visible without overstating availability. Partial attribution is still treated
as corruption. Draw-request mutations remain strict and reject new requests
until the build is migrated.

### Exact production execution

Complete these steps once for every active build that reports
`requiresAttributionMigration: true`.

1. Deploy the widened schema, the legacy-aware read path, and the migration
   mutation through the normal production release. Do not run `convex run` with
   `--push`. Confirm the affected build loads before changing data; new draw
   requests should remain blocked by the attribution integrity error.
2. Export production and verify the archive before the first apply:

   ```bash
   export DRAWFLOW_MIGRATION_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
   export DRAWFLOW_BACKUP_ZIP="artifacts/convex-prod-pre-draw-attribution-${DRAWFLOW_MIGRATION_STAMP}.zip"
   mkdir -p artifacts
   bun x convex export --prod --include-file-storage --path "$DRAWFLOW_BACKUP_ZIP"
   test -s "$DRAWFLOW_BACKUP_ZIP"
   unzip -t "$DRAWFLOW_BACKUP_ZIP"
   ```

3. Set the target values. `DRAWFLOW_ADMIN_IDENTITY_JSON` must be the exact
   WorkOS `UserIdentity` JSON for an authenticated lender administrator in the
   target organization; do not synthesize or edit its claims.

   ```bash
   export DRAWFLOW_ADMIN_IDENTITY_JSON='<admin UserIdentity JSON>'
   export DRAWFLOW_ORGANIZATION_ID='<WorkOS organization id>'
   export DRAWFLOW_BUILD_ID='<activeBuilds document id>'
   export DRAWFLOW_MIGRATION_REASON='Production backfill of legacy Draw Release Work Order attribution.'
   ```

4. Dry-run the exact build and save the immutable plan token:

   ```bash
   export DRAWFLOW_PREVIEW_ARGS="$(
     jq -cn \
       --arg buildId "$DRAWFLOW_BUILD_ID" \
       --arg reason "$DRAWFLOW_MIGRATION_REASON" \
       --arg workosOrganizationId "$DRAWFLOW_ORGANIZATION_ID" \
       '{
         buildId: $buildId,
         dryRun: true,
         reason: $reason,
         workosOrganizationId: $workosOrganizationId
       }'
   )"
   export DRAWFLOW_PREVIEW_JSON="artifacts/draw-attribution-preview-${DRAWFLOW_BUILD_ID}.json"
   bun x convex run --prod --codegen disable \
     --identity "$DRAWFLOW_ADMIN_IDENTITY_JSON" \
     production_proposals:migrateActiveBuildDrawRequests \
     "$DRAWFLOW_PREVIEW_ARGS" | tee "$DRAWFLOW_PREVIEW_JSON"
   jq -e '
     .dryRun == true and
     .applied == false and
     .replayed == false and
     (.planToken | type == "string" and length > 0)
   ' "$DRAWFLOW_PREVIEW_JSON"
   export DRAWFLOW_PLAN_TOKEN="$(jq -er '.planToken' "$DRAWFLOW_PREVIEW_JSON")"
   ```

   Stop if any count, warning, organization, availability amount, or expected
   work-order total is unexpected. Resolve the source data and repeat the
   dry-run; never reuse an older token.

5. Apply the exact confirmed plan. The mutation rejects the write if any
   migration input changed after the dry-run.

   ```bash
   export DRAWFLOW_APPLY_ARGS="$(
     jq -cn \
       --arg buildId "$DRAWFLOW_BUILD_ID" \
       --arg expectedPlanToken "$DRAWFLOW_PLAN_TOKEN" \
       --arg reason "$DRAWFLOW_MIGRATION_REASON" \
       --arg workosOrganizationId "$DRAWFLOW_ORGANIZATION_ID" \
       '{
         buildId: $buildId,
         dryRun: false,
         expectedPlanToken: $expectedPlanToken,
         reason: $reason,
         workosOrganizationId: $workosOrganizationId
       }'
   )"
   export DRAWFLOW_APPLY_JSON="artifacts/draw-attribution-apply-${DRAWFLOW_BUILD_ID}.json"
   bun x convex run --prod --codegen disable \
     --identity "$DRAWFLOW_ADMIN_IDENTITY_JSON" \
     production_proposals:migrateActiveBuildDrawRequests \
     "$DRAWFLOW_APPLY_ARGS" | tee "$DRAWFLOW_APPLY_JSON"
   jq -e '
     .dryRun == false and
     .applied == true and
     .replayed == false
   ' "$DRAWFLOW_APPLY_JSON"
   ```

6. Replay the identical apply command. A safe replay makes no writes and must
   return `applied: false`, `replayed: true`, and zero values for `attributed`,
   `migrated`, `normalized`, and `restoredForecasts`.

   ```bash
   export DRAWFLOW_REPLAY_JSON="artifacts/draw-attribution-replay-${DRAWFLOW_BUILD_ID}.json"
   bun x convex run --prod --codegen disable \
     --identity "$DRAWFLOW_ADMIN_IDENTITY_JSON" \
     production_proposals:migrateActiveBuildDrawRequests \
     "$DRAWFLOW_APPLY_ARGS" | tee "$DRAWFLOW_REPLAY_JSON"
   jq -e '
     .dryRun == false and
     .applied == false and
     .replayed == true and
     .attributed == 0 and
     .migrated == 0 and
     .normalized == 0 and
     .restoredForecasts == 0
   ' "$DRAWFLOW_REPLAY_JSON"
   ```

### Migration verification

1. Query the same production detail projection and save the result:

   ```bash
   export DRAWFLOW_DETAIL_ARGS="$(
     jq -cn \
       --arg buildId "$DRAWFLOW_BUILD_ID" \
       --arg workosOrganizationId "$DRAWFLOW_ORGANIZATION_ID" \
       '{
         buildId: $buildId,
         workosOrganizationId: $workosOrganizationId
       }'
   )"
   export DRAWFLOW_DETAIL_JSON="artifacts/draw-attribution-detail-${DRAWFLOW_BUILD_ID}.json"
   bun x convex run --prod --codegen disable \
     --identity "$DRAWFLOW_ADMIN_IDENTITY_JSON" \
     production_proposals:getActiveBuildDetailByString \
     "$DRAWFLOW_DETAIL_ARGS" | tee "$DRAWFLOW_DETAIL_JSON"
   jq -e '
     .drawFunding.requiresAttributionMigration == false and
     .drawFunding.legacyUnattributedRequestCount == 0 and
     .drawFunding.legacyUnattributedRequestCents == 0 and
     .drawFunding.attributionShortfallCents == 0
   ' "$DRAWFLOW_DETAIL_JSON"
   ```

2. Compare `availableCents`, `reservedCents`, and `unlockedCents` in the preview,
   apply, replay, and detail artifacts. The values must be unchanged by
   attribution alone and must satisfy
   `availableCents + reservedCents == unlockedCents`.
3. Confirm every non-cancelled/non-rejected request has one unique
   `workOrderKey` and source allocations whose cents sum exactly to the request
   amount. Confirm every allocation, request, milestone, build, and audit event
   has the target organization ID.
4. Confirm every migrated forecast row is back to `planned` with its original
   proposal amount, and that no `draw_release` capital event was created by the
   migration.
5. Confirm exactly one `migrateActiveBuildDrawRequests` audit event was added by
   the apply and that it contains the authenticated administrator, role,
   timestamp, prior/new state, warnings, and the supplied reason. The replay
   must not add another audit event.
6. Reload builder detail, lender/admin draw controls, timeline, and calendar.
   Actual requests must appear separately from forecasts, and a new
   reimbursement draw request must no longer hit the attribution integrity
   guard.
7. Keep `workOrderKey` optional until every production active build passes this
   checklist. Make it required only in the later narrow-schema release.

## Rollback

Application rollback is code-only: redeploy the previous application and Convex function bundle. Data migration rollback is not automatic because request records may receive legitimate reviews after cutover. If rollback is required after migration, pause draw writes, export both tables, reconcile by `clientOperationId` and `plannedDrawKey`, and apply an operator-reviewed repair mutation rather than deleting records ad hoc.

## Verification coverage

- Projection tests cover exact availability, pending/backlog classification, and past-forecast filtering.
- Component tests cover partial submission, authoritative receipts, and idempotent retry behavior.
- Convex tests cover independent request records, over-limit rejection, fractional-cent rejection, note limits, withdrawal, and forecast preservation.
- Existing builder-route and production build-detail suites protect the surrounding Details workflow.
