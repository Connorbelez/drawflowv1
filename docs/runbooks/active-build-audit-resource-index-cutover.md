# Active-Build Audit Resource Index Cutover

## Purpose

Activate the Build/resource/created-at index used by the Event Rail, backfill
legacy active-Build audit rows with validated canonical identity, and verify
that tenant and permission boundaries remain intact.

## Phase A prerequisite

Deploy commit `f42dfd7b` first. It adds the optional `auditEvents.resourceType`
field, the optional explicit site-visit child identity, and the staged index
declaration. Wait for the Convex deployment to report the staged index ready
before deploying the reader and writer cutover.

## Phase B deployment and backfill

Deploy the Phase B application/schema commit with the active index declaration:

```ts
.index("by_buildId_and_resourceType_and_createdAt", [
  "buildId",
  "resourceType",
  "createdAt",
])
```

After the deployment is healthy, run the idempotent migration:

```sh
bun x convex run audit_event_migrations:runAuditEventBuildIdBackfill
```

For a production deployment, use the deployment selector and authenticated
operator identity required by the release process (for example,
`bun x convex run --prod --identity "$OPERATOR_IDENTITY_JSON" ...`). Repeat the
command after an interrupted run; the migrations component resumes from its
durable cursor.

Verify the migration runner reports `complete` and that subsequent runs make
zero additional writes. Inspect representative Builds in the Event Rail and
confirm that:

- canonical rows are returned from the Build/resource index and ordered by
  `createdAt`;
- the final history is capped at 100 relevant events;
- parent, draw, site-visit, evidence, material, contractor, and Sub-milestone
  permissions are enforced independently;
- child names, IDs, reasons, warnings, and canonical targets are absent when
  either the resource grant or `submilestone:view` is missing; and
- organization, brokerage, and Build mismatches remain excluded.

## Rollback boundary

Before the migration starts, rollback is a code/schema redeploy to the last
known-good release. After backfill writes begin, do not drop or rewrite audit
rows to roll back. Pause the Event Rail cutover, redeploy the previous reader
while retaining the additive fields/index, preserve the migration run evidence,
and perform an operator-reviewed repair or forward migration. Re-run the
backfill and Event Rail verification before reactivating the new reader.
