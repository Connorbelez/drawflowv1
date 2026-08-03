# Quote Response Template Version Identity Cutover

Version rows created before immutable identity snapshots may omit `name`,
`description`, or `audience`. The compatibility deployment keeps `name` and
`audience` optional, reads the parent template as a tenant-checked fallback,
and exposes a bounded `@convex-dev/migrations` backfill. `description` remains
optional by product design.

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

5. Read back representative rows from the deployment using the protected
   version query. Verify every version has a durable identity matching the
   version snapshot, including a legacy row, and verify that an organization
   cannot read a version through a template or version ID from another
   organization.

## Narrowing cutover

Only after the live migration status and read-back evidence above are attached
to ENG-385 should a later deployment make `name` and `audience` required in
`convex/schema.ts` and remove the runtime fallback. Run Convex codegen, Convex
typecheck, focused quote-template tests, and the production build again in that
narrowing commit.

Do not run the narrowing change before the migration has completed: Convex
schema validation must not reject legacy rows during the expand/backfill phase.
