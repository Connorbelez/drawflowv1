# Sub-milestone Scope and Field Guidance Cutover

This runbook moves disposable development data from the legacy direct
Sub-milestone fields to the canonical Scope contract and Field Guidance
domains. The first migration series is additive. A separately gated cleanup
series unsets only the two legacy Scope fields. Neither series rewrites
historical Quote Package Revision labour lines, Site Visits, or Site Visit
Guidance snapshots.

Run this cutover only against the configured development deployment. Do not
add `--prod` to these commands.

## Data policy

The migration applies these rules for every `proposalSubmilestones` row:

- Create at most one `submilestoneScopeContracts` row and one
  `submilestoneFieldGuidance` row.
- Import non-empty valid Proposal Scope first. If it is unavailable, import
  non-empty valid linked Build Scope. Otherwise create labeled test Scope that
  names the Sub-milestone.
- Never read `buildSubmilestones.fieldNote` as contractual Scope.
- When Proposal and Build Scope bytes differ, preserve Proposal Scope as `v1`
  and Build Scope as published effective `v2` with a migration actor and
  change reason.
- Keep a draft Proposal on one mutable `v1` draft. A submitted, approved, or
  closed Proposal receives published effective Scope using `submittedAt`, then
  `approvedAt`, then `closedAt`, then `updatedAt` as timestamp precedence.
- Keep existing canonical Field Guidance bytes unchanged. Otherwise seed both
  Guidance sections from the linked Proposal Milestone guidance or create
  labeled test Guidance for a missing section.
- Link Scope and Guidance only to the single exact active Build owner resolved
  through `proposalSubmilestoneId`. Duplicate, cross-tenant, or inconsistent
  lineage fails closed.
- Fill missing mutable `quoteRoundDraftLabourScope` pins from the exact current
  effective published Scope revision. A fully pinned draft row is unchanged.
- Do not modify `quotePackageRevisionLabourLines`, `buildSiteVisits`, or
  `buildSiteVisitGuidanceSections`.
- Do not write WorkOS webhook-owned projection tables.

## Phase 1: expand and preflight

The expand deployment must retain both legacy Scope columns and the three
mutable Quote draft Scope pin fields as optional while it adds the canonical
tables, indexes, and migration functions. Do not deploy a schema that removes
the legacy columns or requires the draft pins before the backfill and
verification finish. The migration file uses explicit legacy-row access casts
only so the later narrowing source tree can still compile; those casts do not
make an early narrowing deployment safe.

1. Record the branch, commit, configured deployment, and dirty state.
2. Confirm the target is the disposable development deployment.
3. Generate functions and validate the expand deployment:

   ```sh
   git branch --show-current
   git rev-parse HEAD
   git status --short
   bun x convex codegen
   bun x tsc -p convex/tsconfig.json --noEmit
   bun run test -- convex/submilestone_scope_guidance_migrations.test.ts
   ```

4. Capture a complete Convex ZIP export before applying the migration. Unlike
   `convex data`, `convex export` has no row limit and includes every table. The
   archive integrity check validates the full export; the manifest helper then
   validates each protected immutable and WorkOS projection table entry and
   hashes its sorted `documents.jsonl` records. Sorting records makes the
   per-table digest deterministic even if export order changes. Do not use a
   limited dashboard or `convex data` response as parity evidence:

   ```sh
   export DRAWFLOW_DEV_DEPLOYMENT='dev'
   export DRAWFLOW_CUTOVER_DIR="/tmp/submilestone-cutover"
   mkdir -p "$DRAWFLOW_CUTOVER_DIR"
   export DRAWFLOW_BEFORE_ZIP="$DRAWFLOW_CUTOVER_DIR/before.zip"
   export DRAWFLOW_BEFORE_MANIFEST="$DRAWFLOW_CUTOVER_DIR/before.tables.sha256"
   test ! -e "$DRAWFLOW_BEFORE_ZIP"
   bun x convex export --deployment "$DRAWFLOW_DEV_DEPLOYMENT" --path "$DRAWFLOW_BEFORE_ZIP"
   test -s "$DRAWFLOW_BEFORE_ZIP"
   unzip -t "$DRAWFLOW_BEFORE_ZIP"
   ```

   Define the manifest helper once in the shell used for this cutover. It
   fails closed when a protected table is absent from the complete export:

   ```sh
   snapshot_table_manifest() {
     archive="$1"
     manifest="$2"
     : > "$manifest"
     for table in \
       quotePackageRevisionLabourLines \
       buildSiteVisits \
       buildSiteVisitGuidanceSections \
       users \
       workosOrganizations \
       workosOrganizationMemberships \
       workosRoles \
       workosOrganizationRoles \
       workosPermissions
     do
       entry="$table/documents.jsonl"
       if ! unzip -Z1 "$archive" | grep -Fqx "$entry"; then
         printf 'missing %s in %s\n' "$entry" "$archive" >&2
         return 1
       fi
       digest="$(unzip -p "$archive" "$entry" | LC_ALL=C sort | shasum -a 256 | awk '{print $1}')"
       printf '%s  %s\n' "$digest" "$table" >> "$manifest"
     done
     LC_ALL=C sort -k2,2 "$manifest" -o "$manifest"
   }
   snapshot_table_manifest "$DRAWFLOW_BEFORE_ZIP" "$DRAWFLOW_BEFORE_MANIFEST"
   cat "$DRAWFLOW_BEFORE_MANIFEST"
   ```

   Keep the ZIP and manifest paths. The ZIP is the complete-table source of
   truth; the manifest is only the deterministic digest of the protected
   table records.

## Phase 2: dry-run and apply

Preview one bounded batch. `dryRun` makes the migrations component roll the
transaction back. The `processed` count reports the source rows inspected. The
Scope and Guidance migrations write other tables, so the library may also log
that the source `proposalSubmilestones` row itself did not change.

```sh
bun x convex run submilestone_scope_guidance_migrations:runSubmilestoneScopeGuidanceBackfill '{"dryRun":true,"oneBatchOnly":true}'
```

Require the dry-run to finish without lineage, tenant, TipTap, or missing
effective-Scope errors. Then start the ordered series:

```sh
bun x convex run submilestone_scope_guidance_migrations:runSubmilestoneScopeGuidanceBackfill
```

The runner executes these migrations in order:

1. `backfillSubmilestoneScopeContracts`
2. `backfillSubmilestoneFieldGuidance`
3. `linkBuildSubmilestoneLineage`
4. `backfillQuoteRoundDraftScopePins`

Read component status and require `state: "success"`, `isDone: true`, and no
`error` for every name:

```sh
bun x convex run --component migrations lib:getStatus '{"names":["submilestone_scope_guidance_migrations:backfillSubmilestoneScopeContracts","submilestone_scope_guidance_migrations:backfillSubmilestoneFieldGuidance","submilestone_scope_guidance_migrations:linkBuildSubmilestoneLineage","submilestone_scope_guidance_migrations:backfillQuoteRoundDraftScopePins"]}'
```

## Phase 3: verification gates

Verify stored rows directly. Runtime fallbacks are not acceptable evidence.

- Contract count equals Proposal Sub-milestone count.
- Exactly one contract and one Field Guidance row exist per
  `proposalSubmilestoneId`.
- Each contract has one `v1`; a distinct legacy Build value is its ordered
  published `v2` on the same contract.
- Each draft Proposal lineage has an active `v1` draft and no effective
  revision.
- Each submitted, approved, or closed lineage has a published effective
  revision.
- Each exact active Build owner appears on both its contract and Guidance row.
- Every mutable Quote Round draft labour row has exact Scope revision ID,
  version, rich-text bytes, and matching change reason.
- No generated Scope contains a legacy `fieldNote` value.
- WorkOS projection row counts and contents are unchanged.

Run each definition directly from the beginning after the apply. The commands
must process their bounded batch without creating or patching any row; continue
with the returned cursor if more than 25 source rows exist. This is the replay
zero-write gate:

```sh
bun x convex run submilestone_scope_guidance_migrations:backfillSubmilestoneScopeContracts '{"cursor":null,"dryRun":true,"oneBatchOnly":true}'
bun x convex run submilestone_scope_guidance_migrations:backfillSubmilestoneFieldGuidance '{"cursor":null,"dryRun":true,"oneBatchOnly":true}'
bun x convex run submilestone_scope_guidance_migrations:linkBuildSubmilestoneLineage '{"cursor":null,"dryRun":true,"oneBatchOnly":true}'
bun x convex run submilestone_scope_guidance_migrations:backfillQuoteRoundDraftScopePins '{"cursor":null,"dryRun":true,"oneBatchOnly":true}'
```

Capture another complete ZIP export and compare the protected immutable and
WorkOS projection table manifest with the Phase 1 baseline. The archive test
and helper must succeed before the comparison:

```sh
export DRAWFLOW_AFTER_ZIP="$DRAWFLOW_CUTOVER_DIR/after-additive.zip"
export DRAWFLOW_AFTER_MANIFEST="$DRAWFLOW_CUTOVER_DIR/after-additive.tables.sha256"
test ! -e "$DRAWFLOW_AFTER_ZIP"
bun x convex export --deployment "$DRAWFLOW_DEV_DEPLOYMENT" --path "$DRAWFLOW_AFTER_ZIP"
test -s "$DRAWFLOW_AFTER_ZIP"
unzip -t "$DRAWFLOW_AFTER_ZIP"
snapshot_table_manifest "$DRAWFLOW_AFTER_ZIP" "$DRAWFLOW_AFTER_MANIFEST"
diff -u "$DRAWFLOW_BEFORE_MANIFEST" "$DRAWFLOW_AFTER_MANIFEST"
```

`diff` must produce no output and exit 0. This compares one deterministic
SHA-256 digest per complete protected table, not a potentially truncated row
listing. Also run the focused migration test, which proves MG-01 through MG-05
plus mutable Quote draft pin dry-run and replay behavior.

## Phase 4: destructive legacy-field cleanup

Run this phase only after the additive runner and every Phase 3 parity, replay,
tenant, and immutable-hash gate have passed. Keep the expand schema deployed
while cleanup runs because stored documents still contain the optional legacy
fields.

Dry-run one batch of the separate cleanup series:

```sh
bun x convex run submilestone_scope_guidance_migrations:runSubmilestoneLegacyScopeFieldCleanup '{"dryRun":true,"oneBatchOnly":true}'
```

The dry-run must roll back both legacy-field unsets and report no unexpected
field changes. Apply the cleanup series:

```sh
bun x convex run submilestone_scope_guidance_migrations:runSubmilestoneLegacyScopeFieldCleanup
```

Read status and require `state: "success"`, `isDone: true`, and no `error` for
both cleanup definitions:

```sh
bun x convex run --component migrations lib:getStatus '{"names":["submilestone_scope_guidance_migrations:cleanupProposalSubmilestoneLegacyScopeFields","submilestone_scope_guidance_migrations:cleanupBuildSubmilestoneLegacyScopeFields"]}'
```

Verify one bounded replay batch directly. Both commands must report no source
row changes. Continue with returned cursors if either table has more than 25
rows:

```sh
bun x convex run submilestone_scope_guidance_migrations:cleanupProposalSubmilestoneLegacyScopeFields '{"cursor":null,"dryRun":true,"oneBatchOnly":true}'
bun x convex run submilestone_scope_guidance_migrations:cleanupBuildSubmilestoneLegacyScopeFields '{"cursor":null,"dryRun":true,"oneBatchOnly":true}'
```

Inspect Proposal and Build Sub-milestone documents directly. Require
`scopeOfWorkTiptapJson` to be absent from every row. Confirm all other fields,
including `buildSubmilestones.fieldNote`, are unchanged. Then capture a third
complete ZIP export and compare its protected-table manifest with the Phase 1
baseline (and the Phase 3 manifest):

```sh
export DRAWFLOW_CLEANUP_ZIP="$DRAWFLOW_CUTOVER_DIR/after-cleanup.zip"
export DRAWFLOW_CLEANUP_MANIFEST="$DRAWFLOW_CUTOVER_DIR/after-cleanup.tables.sha256"
test ! -e "$DRAWFLOW_CLEANUP_ZIP"
bun x convex export --deployment "$DRAWFLOW_DEV_DEPLOYMENT" --path "$DRAWFLOW_CLEANUP_ZIP"
test -s "$DRAWFLOW_CLEANUP_ZIP"
unzip -t "$DRAWFLOW_CLEANUP_ZIP"
snapshot_table_manifest "$DRAWFLOW_CLEANUP_ZIP" "$DRAWFLOW_CLEANUP_MANIFEST"
diff -u "$DRAWFLOW_BEFORE_MANIFEST" "$DRAWFLOW_CLEANUP_MANIFEST"
diff -u "$DRAWFLOW_AFTER_MANIFEST" "$DRAWFLOW_CLEANUP_MANIFEST"
```

Both `diff` commands must produce no output and exit 0. These complete-table
hashes prove that cleanup did not rewrite Quote Package Revision labour lines,
Site Visits, Site Visit Guidance snapshots, or WorkOS projection rows.

## Phase 5: narrow

Only after the destructive cleanup has completed and its status and data gates
pass:

1. Remove all runtime reads and writes of Proposal and Build direct Scope.
2. Require Scope pins on new and mutable Quote Round draft labour rows.
3. Keep historical Package Revision source identity optional and immutable.
4. Remove the legacy Proposal and Build Scope fields from the schema.
5. Deploy the narrowed schema and require schema validation to succeed.
6. Run codegen, Convex TypeScript, focused tests, the full test suite, and the
   production build.

## Failure and rollback

Stop on any failed migration status or verification mismatch. Do not continue
to the narrowing deployment. The additive rows can remain while the failure is
investigated; canonical readers are tenant-checked and the migration is
idempotent. Cancel an in-progress migration through the migrations component if
needed, fix the exact lineage or source data, and resume from its recorded
cursor. Do not delete historical Quote or Site Visit snapshots to repair a
migration failure.
