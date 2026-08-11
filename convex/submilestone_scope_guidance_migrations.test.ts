/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { v } from "convex/values";
import type { GenericValidator } from "convex/values";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
// The production schema is narrowed after the additive backfill. This isolated
// expand-phase schema keeps the two legacy source columns available so the
// migration precedence remains regression-testable after cutover.
function extendTableValidator<T>(
  table: T,
  fields: Record<string, GenericValidator>,
): T {
  const validator = (
    table as unknown as {
      validator: {
        extend: (newFields: Record<string, GenericValidator>) => unknown;
      };
    }
  ).validator.extend(fields);
  return Object.assign(Object.create(Object.getPrototypeOf(table)), table, {
    validator,
  });
}

const legacyMigrationSchema = {
  ...schema,
  tables: {
    ...schema.tables,
    buildSubmilestones: extendTableValidator(
      schema.tables.buildSubmilestones,
      {
        scopeOfWorkTiptapJson: v.optional(v.string()),
      },
    ),
    proposalSubmilestones: extendTableValidator(
      schema.tables.proposalSubmilestones,
      {
        scopeOfWorkTiptapJson: v.optional(v.string()),
      },
    ),
    quoteRoundDraftLabourScope: extendTableValidator(
      schema.tables.quoteRoundDraftLabourScope,
      {
        scopeOfWorkTiptapJson: v.optional(v.string()),
        sourceScopeRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
        sourceScopeVersion: v.optional(v.number()),
      },
    ),
  },
} as typeof schema;
const ORGANIZATION_ID = "org_scope_guidance_migration";
const MIGRATION_ACTOR = "migration:submilestone-scope-guidance-cutover";

function tiptap(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

type SeedOptions = {
  buildScope?: string;
  fieldNote?: string;
  milestoneGuidance?: {
    cameraAngles: string | string[];
    whatToVerify: string | string[];
  };
  proposalScope?: string;
  snapshots?: boolean;
  status?: "approved" | "closed" | "draft" | "submitted";
};

async function seedFixture(options: SeedOptions = {}) {
  const base = convexTest(legacyMigrationSchema, modules);
  const admin = base.withIdentity({
    email: "migration-admin@example.com",
    name: "Migration Admin",
    organizationId: ORGANIZATION_ID,
    role: "admin",
    roles: ["admin"],
    subject: "user_migration_admin",
    tokenIdentifier: "https://api.workos.com/|user_migration_admin",
  } as any);
  const fixture = await base.run(async (ctx) => {
    const now = 1_786_440_000_000;
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Migration Brokerage",
      legalName: "Migration Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: ORGANIZATION_ID,
    });
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId,
      createdAt: now,
      displayName: "Migration Builder",
      legalName: "Migration Builder Inc.",
      organizationId: ORGANIZATION_ID,
      status: "active",
      updatedAt: now,
    });
    const status = options.status ?? "approved";
    const proposalId = await ctx.db.insert("buildProposals", {
      approvedAt:
        status === "approved" || status === "closed" ? now - 2_000 : undefined,
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 35_000_000,
      borrowerWorkingCapitalLimitCents: 35_000_000,
      brokerageId,
      buildName: "Scope migration fixture",
      builderProfileId,
      closedAt: status === "closed" ? now - 1_000 : undefined,
      createdAt: now - 10_000,
      createdByWorkosUserId: "user_builder",
      lenderDrawPolicyLimitCents: 55_000_000,
      location: "10 Migration Lane",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: status === "draft" ? "none" : "approved",
      status,
      submittedAt: status === "draft" ? undefined : now - 3_000,
      totalBudgetCents: 25_000_000,
      updatedAt: now - 500,
      updatedByWorkosUserId: "user_builder",
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId,
      budgetCents: 25_000_000,
      createdAt: now - 9_000,
      dayEnd: 10,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 20_000_000,
      durationDays: 10,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalId,
      siteVisitGuidance: options.milestoneGuidance,
      updatedAt: now - 400,
    });
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId,
        budgetCents: 25_000_000,
        createdAt: now - 8_000,
        durationDays: 10,
        key: "excavation",
        milestoneKey: "foundation",
        name: "Excavation",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalId,
        proposalMilestoneId,
        scopeOfWorkTiptapJson: options.proposalScope,
        startDay: 0,
        updatedAt: now - 300,
      } as any,
    );

    let buildId: Id<"activeBuilds"> | undefined;
    let buildMilestoneId: Id<"buildMilestones"> | undefined;
    let buildSubmilestoneId: Id<"buildSubmilestones"> | undefined;
    let quoteLabourLineId: Id<"quotePackageRevisionLabourLines"> | undefined;
    let siteVisitId: Id<"buildSiteVisits"> | undefined;
    let siteVisitSectionId: Id<"buildSiteVisitGuidanceSections"> | undefined;
    if (status !== "draft") {
      const workflowRuleId = await ctx.db.insert("workflowRules", {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: false,
        ruleKey: "migration",
        settings: {},
        status: "active",
        updatedAt: now,
        version: 1,
      });
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
          allowPermitWaiverByRoles: ["admin"],
          brokerageId,
          createdAt: now,
          organizationId: ORGANIZATION_ID,
          proposalId,
          proposalStates: ["draft", "submitted", "approved", "closed"],
          requirePermitForApproval: false,
          ruleKey: "migration",
          settings: {},
          version: 1,
          workflowRuleId,
        },
      );
      buildId = await ctx.db.insert("activeBuilds", {
        brokerageId,
        buildName: "Migration active Build",
        builderProfileId,
        createdAt: now - 7_000,
        location: "10 Migration Lane",
        organizationId: ORGANIZATION_ID,
        proposalId,
        startDate: "2026-08-01",
        status: "active",
        totalBudgetCents: 25_000_000,
        updatedAt: now - 200,
        workflowRuleSnapshotId,
      });
      await ctx.db.patch(proposalId, { activeBuildId: buildId });
      buildMilestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId,
        budgetCents: 25_000_000,
        buildId,
        createdAt: now - 6_000,
        dayEnd: 10,
        dayStart: 0,
        dependencyKeys: [],
        drawAvailabilityCents: 20_000_000,
        durationDays: 10,
        key: "foundation",
        name: "Foundation",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalMilestoneId,
        status: "planned",
        updatedAt: now - 150,
      });
      buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
        brokerageId,
        budgetCents: 25_000_000,
        buildId,
        buildMilestoneId,
        createdAt: now - 5_000,
        durationDays: 10,
        fieldNote: options.fieldNote,
        key: "excavation",
        milestoneKey: "foundation",
        name: "Excavation",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalSubmilestoneId,
        scopeOfWorkTiptapJson: options.buildScope,
        startDay: 0,
        status: "planned",
        updatedAt: now - 100,
      } as any);

      if (options.snapshots) {
        const templateId = await ctx.db.insert("quoteResponseTemplates", {
          audience: "contractor",
          brokerageId,
          createdAt: now - 4_000,
          createdByWorkosUserId: "user_admin",
          name: "Historical quote",
          organizationId: ORGANIZATION_ID,
          status: "active",
          templateKey: "historical-quote",
          updatedAt: now - 4_000,
        });
        const templateVersionId = await ctx.db.insert(
          "quoteResponseTemplateVersions",
          {
            audience: "contractor",
            brokerageId,
            createdAt: now - 4_000,
            createdByWorkosUserId: "user_admin",
            name: "Historical quote",
            organizationId: ORGANIZATION_ID,
            publishedAt: now - 4_000,
            publishedByWorkosUserId: "user_admin",
            status: "published",
            templateId,
            updatedAt: now - 4_000,
            validationState: "valid",
            version: 1,
          },
        );
        const quoteRoundId = await ctx.db.insert("quoteRounds", {
          brokerageId,
          buildId,
          createdAt: now - 4_000,
          createdByWorkosUserId: "user_admin",
          mode: "labour",
          organizationId: ORGANIZATION_ID,
          proposalId,
          revision: 1,
          state: "open",
          title: "Historical quote",
          updatedAt: now - 4_000,
        });
        const permitDocumentId = await ctx.db.insert("buildDocuments", {
          brokerageId,
          buildId,
          contractorVisible: true,
          createdAt: now - 4_000,
          documentType: "permit",
          fileName: "permit.pdf",
          mimeType: "application/pdf",
          organizationId: ORGANIZATION_ID,
          proposalId,
          sizeBytes: 512,
          status: "uploaded",
          updatedAt: now - 4_000,
          uploadedByWorkosUserId: "user_admin",
          version: 1,
        });
        const packageRevisionId = await ctx.db.insert("quotePackageRevisions", {
          brokerageId,
          buildId,
          organizationId: ORGANIZATION_ID,
          permitDocumentId,
          permitDocumentVersion: 1,
          publishedAt: now - 3_500,
          publishedByWorkosUserId: "user_admin",
          quoteRoundId,
          responseDeadline: now + 86_400_000,
          revision: 1,
          roadmapSnapshotFingerprint: "historical-roadmap-fingerprint",
          siteAddressSnapshot: "10 Migration Lane",
          siteMapUrlSnapshot: "https://maps.example/migration",
          sourceDraftRevision: 1,
          templateId,
          templateVersionId,
          timelineStartDateSnapshot: "2026-08-01",
        });
        quoteLabourLineId = await ctx.db.insert(
          "quotePackageRevisionLabourLines",
          {
            brokerageId,
            budgetCents: 25_000_000,
            buildId,
            buildMilestoneId,
            buildSubmilestoneId,
            createdAt: now - 3_500,
            durationDays: 10,
            milestoneKey: "foundation",
            milestoneName: "Foundation",
            order: 1,
            organizationId: ORGANIZATION_ID,
            quotePackageRevisionId: packageRevisionId,
            quoteRoundId,
            scopeOfWorkTiptapJson: tiptap("Immutable historical Quote Scope."),
            startDay: 0,
            submilestoneKey: "excavation",
            submilestoneName: "Excavation",
          },
        );
        siteVisitId = await ctx.db.insert("buildSiteVisits", {
          brokerageId,
          buildId,
          buildMilestoneId,
          createdAt: now - 3_000,
          milestoneKey: "foundation",
          organizationId: ORGANIZATION_ID,
          requestedAt: "2026-08-10T12:00:00.000Z",
          requestedDay: 9,
          siteVisitGuidance: {
            cameraAngles: "Immutable historical camera guidance.",
            whatToVerify: "Immutable historical verification guidance.",
          },
          status: "requested",
          submilestoneKeys: ["excavation"],
          tokenExpiresAt: now + 86_400_000,
          updatedAt: now - 3_000,
          url: "https://visit.example/historical",
          visitId: "historical-visit",
        });
        siteVisitSectionId = await ctx.db.insert(
          "buildSiteVisitGuidanceSections",
          {
            brokerageId,
            buildId,
            buildMilestoneId,
            buildSiteVisitId: siteVisitId,
            buildSubmilestoneId,
            cameraAnglesTiptapJson: tiptap(
              "Immutable historical camera snapshot.",
            ),
            capturedAt: now - 3_000,
            milestoneKey: "foundation",
            order: 1,
            organizationId: ORGANIZATION_ID,
            proposalSubmilestoneId,
            submilestoneKey: "excavation",
            submilestoneName: "Excavation",
            whatToVerifyTiptapJson: tiptap(
              "Immutable historical verification snapshot.",
            ),
          },
        );
      }
    }
    return {
      brokerageId,
      buildId,
      buildMilestoneId,
      buildSubmilestoneId,
      proposalId,
      proposalMilestoneId,
      proposalSubmilestoneId,
      quoteLabourLineId,
      siteVisitId,
      siteVisitSectionId,
    };
  });
  return { admin, base, ...fixture };
}

const migrationApi = (internal as any)
  .submilestone_scope_guidance_migrations;

async function runOneBatch(admin: any, migration: any, dryRun = false) {
  return await admin.mutation(migration, {
    batchSize: 25,
    cursor: null,
    dryRun,
    oneBatchOnly: true,
  });
}

async function runFullBackfill(admin: any) {
  for (const migration of [
    migrationApi.backfillSubmilestoneScopeContracts,
    migrationApi.backfillSubmilestoneFieldGuidance,
    migrationApi.linkBuildSubmilestoneLineage,
  ]) {
    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const result: { continueCursor: string; isDone: boolean } =
        await admin.mutation(migration, {
          batchSize: 25,
          cursor,
          dryRun: false,
          oneBatchOnly: true,
        });
      cursor = result.continueCursor;
      isDone = result.isDone;
    }
  }
}

async function canonicalState(base: ReturnType<typeof convexTest>) {
  return await base.run(async (ctx) => ({
    contracts: await ctx.db.query("submilestoneScopeContracts").collect(),
    guidance: await ctx.db.query("submilestoneFieldGuidance").collect(),
    revisions: await ctx.db.query("submilestoneScopeRevisions").collect(),
  }));
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function omitLegacyScopeField(row: unknown) {
  if (!row || typeof row !== "object") {
    return row;
  }
  const copy = { ...(row as Record<string, unknown>) };
  delete copy.scopeOfWorkTiptapJson;
  return copy;
}

describe("Sub-milestone Scope and Field Guidance migration", () => {
  test("MG-01 dry-run reports a bounded batch and rolls every write back", async () => {
    const fixture = await seedFixture({ fieldNote: "Do not copy this note." });
    const before = await canonicalState(fixture.base);
    for (const migration of [
      migrationApi.backfillSubmilestoneScopeContracts,
      migrationApi.backfillSubmilestoneFieldGuidance,
      migrationApi.linkBuildSubmilestoneLineage,
    ]) {
      let error: unknown;
      try {
        await runOneBatch(fixture.admin, migration, true);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeDefined();
      expect(String(error)).toContain("DRY RUN");
      expect(error).toMatchObject({
        data: { kind: "DRY RUN", result: { processed: 1 } },
      });
    }
    expect(await canonicalState(fixture.base)).toEqual(before);
  });

  test("MG-02 full backfill is idempotent, links the exact Build owner, and never writes WorkOS projections", async () => {
    const proposalScope = tiptap("Canonical migration Scope.");
    const fixture = await seedFixture({
      buildScope: proposalScope,
      milestoneGuidance: {
        cameraAngles: ["North elevation", "Footing close-up"],
        whatToVerify: "Confirm depth and bearing soil.",
      },
      proposalScope,
    });
    await runFullBackfill(fixture.admin);
    const first = await canonicalState(fixture.base);
    expect(first.contracts).toHaveLength(1);
    expect(first.revisions).toHaveLength(1);
    expect(first.guidance).toHaveLength(1);
    expect(first.contracts[0]).toMatchObject({
      buildId: fixture.buildId,
      buildSubmilestoneId: fixture.buildSubmilestoneId,
      effectiveRevisionId: first.revisions[0]?._id,
      latestVersion: 1,
    });
    expect(first.revisions[0]).toMatchObject({
      publishedAt: 1_786_439_997_000,
      scopeOfWorkTiptapJson: proposalScope,
      status: "published",
      version: 1,
    });
    expect(first.guidance[0]).toMatchObject({
      buildId: fixture.buildId,
      buildSubmilestoneId: fixture.buildSubmilestoneId,
      updatedByWorkosUserId: MIGRATION_ACTOR,
    });

    await runFullBackfill(fixture.admin);
    expect(await canonicalState(fixture.base)).toEqual(first);
    const workosProjectionCounts = await fixture.base.run(async (ctx) => ({
      memberships: (await ctx.db.query("workosOrganizationMemberships").collect())
        .length,
      organizations: (await ctx.db.query("workosOrganizations").collect()).length,
      permissions: (await ctx.db.query("workosPermissions").collect()).length,
      roles: (await ctx.db.query("workosRoles").collect()).length,
      users: (await ctx.db.query("users").collect()).length,
    }));
    expect(workosProjectionCounts).toEqual({
      memberships: 0,
      organizations: 0,
      permissions: 0,
      roles: 0,
      users: 0,
    });
  });

  test("MG-03 fieldNote-only legacy rows receive labeled generated Scope without copying fieldNote", async () => {
    const fieldNote = "Pour on Thursday after inspector confirms access.";
    const fixture = await seedFixture({ fieldNote });
    await runFullBackfill(fixture.admin);
    const state = await canonicalState(fixture.base);
    const scope = state.revisions[0]?.scopeOfWorkTiptapJson ?? "";
    expect(scope).toContain("Migration-generated test Scope");
    expect(scope).toContain("Excavation");
    expect(scope).not.toContain(fieldNote);
  });

  test("MG-04 distinct Proposal and Build Scope bytes become ordered v1 and v2 on one lineage", async () => {
    const proposalScope = tiptap("Proposal excavation Scope bytes.");
    const buildScope = tiptap("Build-refined excavation Scope bytes.");
    const fixture = await seedFixture({ buildScope, proposalScope });
    await runFullBackfill(fixture.admin);
    const state = await canonicalState(fixture.base);
    expect(state.contracts).toHaveLength(1);
    expect(state.revisions).toHaveLength(2);
    const revisions = state.revisions.sort((left, right) => left.version - right.version);
    expect(revisions[0]).toMatchObject({
      scopeOfWorkTiptapJson: proposalScope,
      status: "published",
      version: 1,
    });
    expect(revisions[1]).toMatchObject({
      authoredByWorkosUserId: MIGRATION_ACTOR,
      basedOnRevisionId: revisions[0]?._id,
      changeReason: "Migration preserved distinct active Build Scope content.",
      scopeOfWorkTiptapJson: buildScope,
      status: "published",
      version: 2,
    });
    expect(state.contracts[0]).toMatchObject({
      effectiveRevisionId: revisions[1]?._id,
      latestVersion: 2,
      proposalSubmilestoneId: fixture.proposalSubmilestoneId,
    });
  });

  test("MG-05 Quote Package and Site Visit snapshot hashes are unchanged", async () => {
    const fixture = await seedFixture({
      buildScope: tiptap("Build Scope used only as a migration source."),
      proposalScope: tiptap("Proposal Scope used only as a migration source."),
      snapshots: true,
    });
    const readSnapshots = async () =>
      await fixture.base.run(async (ctx) => ({
        labourLine: await ctx.db.get(fixture.quoteLabourLineId!),
        siteVisit: await ctx.db.get(fixture.siteVisitId!),
        siteVisitSection: await ctx.db.get(fixture.siteVisitSectionId!),
      }));
    const before = await sha256(await readSnapshots());
    await runFullBackfill(fixture.admin);
    const after = await sha256(await readSnapshots());
    expect(after).toBe(before);
  });

  test("mutable Quote Round draft Scope pins dry-run safely and replay with zero writes", async () => {
    const scope = tiptap("Effective Scope for a legacy Quote Round draft.");
    const fixture = await seedFixture({ buildScope: scope, proposalScope: scope });
    await runFullBackfill(fixture.admin);
    const quoteDraftId = await fixture.base.run(async (ctx) => {
      const quoteRoundId = await ctx.db.insert("quoteRounds", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId!,
        createdAt: 1_786_440_001_000,
        createdByWorkosUserId: "user_admin",
        mode: "labour",
        organizationId: ORGANIZATION_ID,
        proposalId: fixture.proposalId,
        revision: 1,
        state: "draft",
        title: "Legacy mutable draft",
        updatedAt: 1_786_440_001_000,
      });
      return await ctx.db.insert(
        "quoteRoundDraftLabourScope",
        {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId!,
          buildSubmilestoneId: fixture.buildSubmilestoneId!,
          createdAt: 1_786_440_001_000,
          order: 1,
          organizationId: ORGANIZATION_ID,
          quoteRoundId,
          updatedAt: 1_786_440_001_000,
        } as any,
      );
    });
    const before = await fixture.base.run((ctx) => ctx.db.get(quoteDraftId));
    let dryRunError: unknown;
    try {
      await runOneBatch(
        fixture.admin,
        migrationApi.backfillQuoteRoundDraftScopePins,
        true,
      );
    } catch (error) {
      dryRunError = error;
    }
    expect(dryRunError).toMatchObject({
      data: { kind: "DRY RUN", result: { processed: 1 } },
    });
    expect(await fixture.base.run((ctx) => ctx.db.get(quoteDraftId))).toEqual(
      before,
    );

    await runOneBatch(
      fixture.admin,
      migrationApi.backfillQuoteRoundDraftScopePins,
    );
    const canonical = await canonicalState(fixture.base);
    const after = await fixture.base.run((ctx) => ctx.db.get(quoteDraftId));
    expect(after).toMatchObject({
      scopeOfWorkTiptapJson: scope,
      sourceScopeChangeReason: "Migration imported proposal Scope content.",
      sourceScopeRevisionId: canonical.revisions[0]?._id,
      sourceScopeVersion: 1,
    });
    await runOneBatch(
      fixture.admin,
      migrationApi.backfillQuoteRoundDraftScopePins,
    );
    expect(await fixture.base.run((ctx) => ctx.db.get(quoteDraftId))).toEqual(
      after,
    );
  });

  test("legacy Scope cleanup dry-runs, unsets only source fields, preserves immutable hashes, and replays with zero writes", async () => {
    const fixture = await seedFixture({
      buildScope: tiptap("Legacy Build Scope to unset."),
      fieldNote: "Keep this execution note exactly.",
      proposalScope: tiptap("Legacy Proposal Scope to unset."),
      snapshots: true,
    });
    await runFullBackfill(fixture.admin);
    const readLegacyRows = async () =>
      await fixture.base.run(async (ctx) => ({
        build: await ctx.db.get(fixture.buildSubmilestoneId!),
        proposal: await ctx.db.get(fixture.proposalSubmilestoneId),
      }));
    const readSnapshots = async () =>
      await fixture.base.run(async (ctx) => ({
        labourLine: await ctx.db.get(fixture.quoteLabourLineId!),
        siteVisit: await ctx.db.get(fixture.siteVisitId!),
        siteVisitSection: await ctx.db.get(fixture.siteVisitSectionId!),
      }));
    const beforeRows = await readLegacyRows();
    const beforeSnapshotHash = await sha256(await readSnapshots());
    const cleanupMigrations = [
      migrationApi.cleanupProposalSubmilestoneLegacyScopeFields,
      migrationApi.cleanupBuildSubmilestoneLegacyScopeFields,
    ];

    for (const migration of cleanupMigrations) {
      let dryRunError: unknown;
      try {
        await runOneBatch(fixture.admin, migration, true);
      } catch (error) {
        dryRunError = error;
      }
      expect(dryRunError).toMatchObject({
        data: { kind: "DRY RUN", result: { processed: 1 } },
      });
    }
    expect(await readLegacyRows()).toEqual(beforeRows);

    for (const migration of cleanupMigrations) {
      await runOneBatch(fixture.admin, migration);
    }
    const cleanedRows = await readLegacyRows();
    expect(cleanedRows).toEqual({
      build: omitLegacyScopeField(beforeRows.build),
      proposal: omitLegacyScopeField(beforeRows.proposal),
    });
    expect(cleanedRows.build).toMatchObject({
      fieldNote: "Keep this execution note exactly.",
    });
    expect(await sha256(await readSnapshots())).toBe(beforeSnapshotHash);

    for (const migration of cleanupMigrations) {
      await runOneBatch(fixture.admin, migration);
    }
    expect(await readLegacyRows()).toEqual(cleanedRows);
  });
});
