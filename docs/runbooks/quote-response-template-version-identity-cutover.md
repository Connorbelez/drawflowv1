# Quote Response Template Version Identity Cutover

Version rows created before immutable identity snapshots may omit `name` or
`audience`. The expand deployment kept those fields optional, read the parent
template as a tenant-checked fallback, and exposed a bounded
`@convex-dev/migrations` backfill. `description` remains optional by product
design; the strict deployment now requires `name` and `audience`.

## Expand and validate

1. Deploy the compatibility schema, runtime fallback, migration, and read-only
   history query together.
2. Preview one migration batch against the target deployment:

   ```sh
   bun x convex run --prod quote_response_template_migrations:runQuoteResponseTemplateVersionIdentityBackfill '{"dryRun":true,"oneBatchOnly":true}'
   ```

   Confirm the preview reports the expected batch and no tenant-scope errors.
3. Run the backfill to completion:

   ```sh
   bun x convex run --prod quote_response_template_migrations:runQuoteResponseTemplateVersionIdentityBackfill
   ```

4. Read migration status and require `state: "success"`, `isDone: true`, and
   no `error`:

   ```sh
   bun x convex run --prod --component migrations lib:getStatus '{"names":["quote_response_template_migrations:backfillQuoteResponseTemplateVersionIdentity"]}'
   ```

5. Inspect stored rows directly so the compatibility read fallback cannot mask
   an incomplete backfill:

   ```sh
   bun x convex data --prod quoteResponseTemplateVersions --limit 100
   ```

   Verify every stored version has `name` and `audience`. If the table contains
   more than 100 rows, continue with the Convex dashboard export or a protected
   internal invariant query until every page is checked. Separately verify the
   public version query rejects a template or version ID from another
   organization.

## Compatibility evidence

The compatibility deployment was applied in commit `b4c1414c`. The migration
dry-run processed `0` rows, the apply run processed `0` rows, the component
reported `state: "success"` and `isDone: true`, and the live
`quoteResponseTemplateVersions` table was empty. The pure resolver regression
test retains evidence that legacy identity resolution was tenant-safe before
the strict schema was enabled.

## Narrowing cutover

The strict narrowing deployment makes `name` and `audience` required in
`convex/schema.ts` and removes the runtime legacy fallback. Run Convex codegen,
Convex typecheck, focused quote-template tests, and the production build again
in that narrowing commit.

Do not run the narrowing change before the migration has completed: Convex
schema validation must not reject legacy rows during the expand/backfill phase.
