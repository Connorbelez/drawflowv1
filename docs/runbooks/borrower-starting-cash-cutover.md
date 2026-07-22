# Borrower Starting Cash Cutover

This cutover replaces the overloaded `borrowerWorkingCapitalLimitCents` name
with `borrowerStartingCashCents` for the borrower's own opening cash balance.
The legacy field remains dual-written during the expand/backfill phase so old
clients can be drained without downtime.

## Deployment sequence

1. Deploy the widened schema and dual-read/dual-write application code.
2. Validate the migration against the target deployment:

   ```sh
   bun x convex run migrations:runBorrowerStartingCashCutover '{"dryRun":true}'
   ```

3. Run the backfill:

   ```sh
   bun x convex run migrations:runBorrowerStartingCashCutover
   ```

4. Confirm each migration reports `isDone: true` and no failures.
5. Keep the legacy compatibility input and dual-write in place until every
   deployed client sends `borrowerStartingCashCents`.
6. In a later narrowing deployment, remove the legacy input, legacy storage
   field, `timelineStartingCashCents` fallback, and dual-write statements.

## Backfill precedence

- Build Proposal: canonical field, then `timelineStartingCashCents`, then the
  legacy `borrowerWorkingCapitalLimitCents` value.
- Active Build: canonical field, then build timeline value, then its proposal.
- Build Capital Plan: canonical field, then the legacy field.

The migration copies numeric values only. It does not reinterpret starting cash
as Required Working Capital. Required Working Capital / Peak Unreimbursed
Exposure remains a derived plan metric.
