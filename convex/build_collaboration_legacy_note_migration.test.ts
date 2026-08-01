/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_legacy_note_migration";

describe("Build collaboration legacy-note migration", () => {
  test("previews deterministically without writing and reports exact mappings", async () => {
    const fixture = await seedMigrationFixture();
    const before = await collaborationWriteCounts(fixture.base);

    const first = await preview(fixture);
    const second = await preview(fixture);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      builds: [
        {
          buildId: fixture.buildId,
          buildName: "Legacy notes fixture",
          sourceNoteCount: 2,
        },
      ],
      planVersion: "build-collaboration-legacy-notes/v1",
      sourceNoteCount: 2,
      tenant: {
        brokerageId: fixture.brokerageId,
        organizationId: ORGANIZATION_ID,
        rolloutStatus: "disabled",
      },
      warnings: [],
    });
    expect(first.planToken).toMatch(
      /^build-collaboration-legacy-notes\/v1:[a-f0-9]{64}$/
    );
    expect(first.sourceNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          audienceFloorTier: 0,
          audienceMode: "build_wide",
          expectedRevision: 1,
          visibility: "public",
        }),
        expect.objectContaining({
          audienceFloorTier: 3,
          audienceMode: "author_tier_and_higher",
          authorRole: "broker",
          expectedRevision: 1,
          visibility: "internal",
        }),
      ])
    );
    expect(await collaborationWriteCounts(fixture.base)).toEqual(before);
  });

  test("requires the exact token and recovers safely from preview drift after a partial batch", async () => {
    const fixture = await seedMigrationFixture();
    const initial = await preview(fixture);
    const partial = await apply(fixture, initial.planToken, 1);
    expect(partial).toMatchObject({
      complete: false,
      nextOffset: 1,
      processedInBatch: 1,
    });

    const changedNoteId = initial.sourceNotes[1].sourceNoteId;
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(changedNoteId, {
        body: "Internal note changed after preview.",
        updatedAt: fixture.now + 500,
      });
    });
    await expect(apply(fixture, initial.planToken, 50)).rejects.toThrow(
      "Migration plan changed after preview"
    );
    const afterRejectedBatch = await migrationState(fixture.base);
    expect(afterRejectedBatch.runs).toEqual([
      expect.objectContaining({ nextOffset: 1, status: "running" }),
    ]);
    expect(afterRejectedBatch.posts).toHaveLength(1);

    const refreshed = await preview(fixture);
    expect(refreshed.planToken).not.toBe(initial.planToken);
    const recovered = await apply(fixture, refreshed.planToken, 50);
    expect(recovered).toMatchObject({
      complete: true,
      nextOffset: 2,
      processedInBatch: 2,
    });
    const state = await migrationState(fixture.base);
    expect(state.posts).toHaveLength(2);
    expect(state.revisions).toHaveLength(2);
    expect(new Set(state.posts.map((post) => post.importedSourceId)).size).toBe(2);
  });

  test("is replay-idempotent and persists Build-by-Build role parity evidence", async () => {
    const fixture = await seedMigrationFixture();
    const plan = await preview(fixture);
    const completed = await apply(fixture, plan.planToken, 50);
    expect(completed.complete).toBe(true);
    const replay = await apply(fixture, plan.planToken, 50);
    expect(replay).toMatchObject({
      complete: true,
      nextOffset: 2,
      processedInBatch: 0,
      runId: completed.runId,
    });

    const parity = await fixture.admin.mutation(
      (api as any).build_collaboration_legacy_note_migration
        .verifyBuildCollaborationLegacyNoteMigrationParity,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        planToken: plan.planToken,
        reason: "Automated Build-by-Build migration parity verification.",
      }
    );
    expect(parity).toMatchObject({
      buildReportCount: 1,
      importedPostCount: 2,
      mismatchCount: 0,
      parityPassed: true,
      sourceRecordCount: 2,
    });
    const durableReport = await fixture.admin.query(
      (api as any).build_collaboration_legacy_note_migration
        .getBuildCollaborationLegacyNoteMigrationParityReport,
      {
        buildId: fixture.buildId,
        evidenceId: parity.evidenceId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(durableReport).toMatchObject({
      buildReports: [
        {
          buildId: fixture.buildId,
          importedPostCount: 2,
          mismatchCount: 0,
          parityPassed: true,
          sourceRecordCount: 2,
        },
      ],
      evidence: {
        evidenceId: parity.evidenceId,
        parityPassed: true,
        planToken: plan.planToken,
      },
    });

    const state = await fixture.base.run(async (ctx) => {
      const evidence = await ctx.db.get(parity.evidenceId);
      const reports = await ctx.db
        .query("buildCollaborationLegacyNoteParityBuildReports")
        .withIndex("by_evidenceId_and_buildId", (query) =>
          query.eq("evidenceId", parity.evidenceId)
        )
        .collect();
      const posts = await ctx.db.query("buildCollaborationPosts").collect();
      const revisions = await ctx.db
        .query("buildCollaborationPostRevisions")
        .collect();
      const receipts = await ctx.db
        .query("buildCollaborationReceipts")
        .collect();
      const actionItems = await ctx.db
        .query("buildActionItems")
        .collect();
      const notificationEvents = await ctx.db
        .query("buildCollaborationExternalDeliveries")
        .collect();
      return {
        actionItems,
        evidence,
        notificationEvents,
        posts,
        receipts,
        reports,
        revisions,
      };
    });
    expect(state.evidence).toMatchObject({
      parityPassed: true,
      planToken: plan.planToken,
      reportVersion: "build-collaboration-legacy-note-parity/v1",
      verificationSource: "legacy_note_migration_v1",
    });
    expect(state.reports).toHaveLength(1);
    const roleMatrix = JSON.parse(state.reports[0].roleMatrixJson);
    const publicMatrix = roleMatrix.find(
      (entry: { visibility: string }) => entry.visibility === "public"
    );
    const internalMatrix = roleMatrix.find(
      (entry: { visibility: string }) => entry.visibility === "internal"
    );
    expect(publicMatrix.readableBy).toMatchObject({
      admin: true,
      contractor: true,
      homeowner: true,
    });
    expect(internalMatrix.readableBy).toMatchObject({
      admin: true,
      broker: true,
      "broker-staff": true,
      builder: true,
      "builder-staff": false,
      contractor: false,
      homeowner: false,
      "principle-broker": true,
    });
    expect(state.posts).toHaveLength(2);
    expect(state.revisions).toHaveLength(2);
    expect(state.receipts).toEqual([]);
    expect(state.actionItems).toEqual([]);
    expect(state.notificationEvents).toEqual([]);
    for (const post of state.posts) {
      const source = fixture.notes.find(
        (note) => `buildNote:${note.noteId}` === post.importedSourceId
      );
      expect(post).toMatchObject({
        authorWorkosUserId: source?.authorWorkosUserId,
        createdAt: source?.createdAt,
        lastMeaningfulActivityAt: source?.createdAt,
        revision: 1,
        source: "imported",
        updatedAt: source?.updatedAt,
      });
    }

    const contractor = withRoleIdentity(
      fixture.base,
      "contractor",
      "user_migration_contractor"
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.insert("buildCollaborationTenantSettings", {
        activatedAt: fixture.now,
        activatedByWorkosUserId: "user_migration_admin",
        brokerageId: fixture.brokerageId,
        createdAt: fixture.now,
        generousRateLimitMultiplier: 1,
        migrationCompletedAt: fixture.now,
        organizationId: ORGANIZATION_ID,
        status: "active",
        updatedAt: fixture.now,
      });
      await ctx.db.insert("buildParticipants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: fixture.now,
        displayNameSnapshot: "Migration Contractor",
        joinedAt: fixture.now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: "contractor",
        status: "active",
        updatedAt: fixture.now,
        validFrom: fixture.now,
        workosUserId: "user_migration_contractor",
      });
    });
    const contractorFeed = await contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(contractorFeed.page).toHaveLength(2);
    expect(contractorFeed.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "restricted" }),
        expect.objectContaining({
          kind: "post",
          post: expect.objectContaining({ source: "imported" }),
        }),
      ])
    );
    const restricted = contractorFeed.page.find(
      (item: { kind: string }) => item.kind === "restricted"
    );
    expect(JSON.stringify(restricted)).not.toMatch(
      /Internal lender note|user_broker|author|timestamp|reference|action/i
    );
  });

  test("rejects cross-tenant scope and blocks activation from operator-attested counts", async () => {
    const fixture = await seedMigrationFixture();
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_legacy_note_migration
          .previewBuildCollaborationLegacyNoteMigration,
        {
          buildId: fixture.buildId,
          organizationId: "org_foreign",
        }
      )
    ).rejects.toThrow("Forbidden: brokerage");

    await fixture.admin.mutation(
      (api as any).build_collaboration_rollout
        .recordBuildCollaborationMigrationParityEvidence,
      {
        buildId: fixture.buildId,
        importedPostCount: 2,
        mismatchCount: 0,
        organizationId: ORGANIZATION_ID,
        reportHash: "operator-supplied-hash",
        sourceRecordCount: 2,
      }
    );
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_rollout
          .transitionBuildCollaborationTenantStatus,
        {
          buildId: fixture.buildId,
          expectedStatus: "disabled",
          nextStatus: "migration_ready",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("durable passing migration parity evidence");
  });
});

function withAdminIdentity(base: ReturnType<typeof convexTest>) {
  return withRoleIdentity(base, "admin", "user_migration_admin");
}

function withRoleIdentity(
  base: ReturnType<typeof convexTest>,
  role: "admin" | "contractor",
  subject: string
) {
  return base.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORGANIZATION_ID,
    role,
    roles: [role],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

async function seedMigrationFixture() {
  const base = convexTest(schema, modules);
  const admin = withAdminIdentity(base);
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const now = Date.parse("2026-08-03T12:00:00.000Z");
  const seeded = await base.run(async (ctx) => {
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      buildName: "Legacy notes fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_migration_admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "24 Migration Lane",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "user_migration_admin",
    });
    const workflowRuleSnapshotId = await ctx.db.insert(
      "workflowRuleSnapshots",
      {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId: foundation.brokerageId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        proposalId,
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: false,
        ruleKey: "default",
        settings: {},
        version: 1,
        workflowRuleId: foundation.workflowRuleId,
      }
    );
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Legacy notes fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "24 Migration Lane",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-03",
      status: "active",
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId, workflowRuleSnapshotId });
    const publicNoteId = await ctx.db.insert("buildNotes", {
      authorRoles: ["builder"],
      authorWorkosUserId: "user_builder",
      body: "Public construction update.",
      brokerageId: foundation.brokerageId,
      buildId,
      createdAt: now - 20_000,
      organizationId: ORGANIZATION_ID,
      updatedAt: now - 19_000,
      visibility: "public",
    });
    const internalNoteId = await ctx.db.insert("buildNotes", {
      authorRoles: ["broker"],
      authorWorkosUserId: "user_broker",
      body: "Internal lender note.",
      brokerageId: foundation.brokerageId,
      buildId,
      createdAt: now - 10_000,
      organizationId: ORGANIZATION_ID,
      updatedAt: now - 9_000,
      visibility: "internal",
    });
    return { buildId, internalNoteId, publicNoteId };
  });
  return {
    admin,
    base,
    brokerageId: foundation.brokerageId,
    buildId: seeded.buildId,
    notes: [
      {
        authorWorkosUserId: "user_builder",
        createdAt: now - 20_000,
        noteId: seeded.publicNoteId,
        updatedAt: now - 19_000,
      },
      {
        authorWorkosUserId: "user_broker",
        createdAt: now - 10_000,
        noteId: seeded.internalNoteId,
        updatedAt: now - 9_000,
      },
    ],
    now,
  };
}

async function preview(fixture: Awaited<ReturnType<typeof seedMigrationFixture>>) {
  return await fixture.admin.query(
    (api as any).build_collaboration_legacy_note_migration
      .previewBuildCollaborationLegacyNoteMigration,
    { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
  );
}

async function apply(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  planToken: string,
  maxNotes: number
) {
  return await fixture.admin.mutation(
    (api as any).build_collaboration_legacy_note_migration
      .applyBuildCollaborationLegacyNoteMigrationBatch,
    {
      buildId: fixture.buildId,
      maxNotes,
      organizationId: ORGANIZATION_ID,
      planToken,
    }
  );
}

async function collaborationWriteCounts(base: ReturnType<typeof convexTest>) {
  return await base.run(async (ctx) => ({
    audits: (await ctx.db.query("auditEvents").collect()).length,
    parityEvidence: (
      await ctx.db.query("buildCollaborationMigrationParityEvidence").collect()
    ).length,
    posts: (await ctx.db.query("buildCollaborationPosts").collect()).length,
    revisions: (
      await ctx.db.query("buildCollaborationPostRevisions").collect()
    ).length,
    runs: (
      await ctx.db.query("buildCollaborationLegacyNoteMigrationRuns").collect()
    ).length,
  }));
}

async function migrationState(base: ReturnType<typeof convexTest>) {
  return await base.run(async (ctx) => ({
    posts: await ctx.db.query("buildCollaborationPosts").collect(),
    revisions: await ctx.db.query("buildCollaborationPostRevisions").collect(),
    runs: await ctx.db
      .query("buildCollaborationLegacyNoteMigrationRuns")
      .collect(),
  }));
}
