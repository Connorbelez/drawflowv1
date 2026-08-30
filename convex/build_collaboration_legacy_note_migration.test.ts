/// <reference types="vite/client" />

import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./types";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_legacy_note_migration";
const ADMIN_USER_ID = "user_migration_admin";
const PLAN_VERSION = "build-collaboration-legacy-notes/v2";
const PARITY_VERSION = "build-collaboration-legacy-note-parity/v2";

interface PreviewPage {
  accumulator: string;
  continueCursor: string;
  isDone: boolean;
  items: Record<string, unknown>[];
  planToken?: string;
  warnings: string[];
}

describe("Build collaboration legacy-note migration", () => {
  test("previews deterministically in bounded pages without writing", async () => {
    const fixture = await seedMigrationFixture();
    const before = await collaborationWriteCounts(fixture.base);

    const first = await previewAll(fixture, 1);
    const second = await previewAll(fixture, 1);

    expect(second).toEqual(first);
    expect(first.planToken).toMatch(
      /^build-collaboration-legacy-notes\/v2:[a-f0-9]{64}$/
    );
    expect(first.warnings).toEqual([]);
    expect(first.builds).toEqual([
      expect.objectContaining({
        buildId: fixture.buildId,
        buildName: "Legacy notes fixture",
        kind: "build",
      }),
    ]);
    expect(first.notes).toEqual(
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

  test("freezes the confirmed manifest and recovers safely after partial-import drift", async () => {
    const fixture = await seedMigrationFixture();
    const initialPreview = await previewAll(fixture, 1);
    const initialRun = await preparePlan(fixture, initialPreview.planToken, 1);
    const partial = await applyBatch(fixture, initialRun.runId, 1);
    expect(partial).toMatchObject({
      complete: false,
      nextImportOrdinal: 1,
      processedInBatch: 1,
    });

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.notes[1].noteId, {
        body: "Internal note changed after validation.",
        updatedAt: fixture.now + 500,
      });
    });
    await expect(
      applyBatch(fixture, initialRun.runId, 25)
    ).rejects.toThrow("changed after validation");
    const rejectedState = await migrationState(fixture.base);
    expect(rejectedState.posts).toHaveLength(1);
    expect(
      rejectedState.runs.find((run) => run._id === initialRun.runId)
    ).toMatchObject({ nextImportOrdinal: 1, status: "importing" });

    const refreshedPreview = await previewAll(fixture, 1);
    expect(refreshedPreview.planToken).not.toBe(initialPreview.planToken);
    const recoveredRun = await preparePlan(
      fixture,
      refreshedPreview.planToken,
      1
    );
    const recovered = await applyAll(fixture, recoveredRun.runId, 1);
    expect(recovered).toMatchObject({
      complete: true,
      nextImportOrdinal: 2,
    });
    const recoveredState = await migrationState(fixture.base);
    expect(recoveredState.posts).toHaveLength(2);
    expect(recoveredState.revisions).toHaveLength(2);
    expect(
      new Set(recoveredState.posts.map((post) => post.importedSourceId)).size
    ).toBe(2);
  });

  test("bounds every plan, import, and parity transaction", async () => {
    const fixture = await seedMigrationFixture();
    await fixture.base.run(async (ctx) => {
      for (let index = 0; index < 37; index += 1) {
        await ctx.db.insert("buildNotes", {
          authorRoles: [index % 2 === 0 ? "builder" : "broker"],
          authorWorkosUserId: `user_bulk_${index}`,
          body: `Bounded note ${index}`,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: fixture.now + index,
          organizationId: ORGANIZATION_ID,
          updatedAt: fixture.now + index,
          visibility: index % 2 === 0 ? "public" : "internal",
        });
      }
    });
    const plan = await previewAll(fixture, 7);
    const started = await startPlan(fixture, plan.planToken);
    let current = started;
    let previousTotal = 0;
    for (let guard = 0; current.status === "validating"; guard += 1) {
      expect(guard).toBeLessThan(30);
      current = await advancePlan(fixture, current.runId, 4);
      const processedTotal =
        current.processedBuildCount + current.processedNoteCount;
      expect(processedTotal - previousTotal).toBeLessThanOrEqual(4);
      previousTotal = processedTotal;
      const manifestCounts = await fixture.base.run(async (ctx) => ({
        builds: (
          await ctx.db
            .query("buildCollaborationLegacyNotePlanBuilds")
            .withIndex("by_runId_and_ordinal", (query) =>
              query.eq("runId", current.runId)
            )
            .collect()
        ).length,
        notes: (
          await ctx.db
            .query("buildCollaborationLegacyNotePlanNotes")
            .withIndex("by_runId_and_ordinal", (query) =>
              query.eq("runId", current.runId)
            )
            .collect()
        ).length,
      }));
      expect(manifestCounts).toEqual({
        builds: current.processedBuildCount,
        notes: current.processedNoteCount,
      });
    }
    expect(current).toMatchObject({
      processedBuildCount: 1,
      processedNoteCount: 39,
      status: "importing",
    });

    let imported = await applyBatch(fixture, current.runId, 3);
    while (!imported.complete) {
      expect(imported.processedInBatch).toBeLessThanOrEqual(3);
      imported = await applyBatch(fixture, current.runId, 3);
    }
    expect(imported.processedInBatch).toBeLessThanOrEqual(3);

    let parity = await startParity(fixture, current.runId, plan.planToken);
    for (let guard = 0; parity.status !== "complete"; guard += 1) {
      expect(guard).toBeLessThan(100);
      const before = await parityProgress(fixture.base, parity.parityRunId);
      parity = await advanceParity(fixture, parity.parityRunId, 2);
      const after = await parityProgress(fixture.base, parity.parityRunId);
      expect(after.reportCount - before.reportCount).toBeLessThanOrEqual(2);
      expect(after.nextBuildOrdinal - before.nextBuildOrdinal).toBeLessThanOrEqual(
        2
      );
      expect(after.nextNoteOrdinal - before.nextNoteOrdinal).toBeLessThanOrEqual(
        2
      );
      expect(
        after.orphanBuildOrdinal - before.orphanBuildOrdinal
      ).toBeLessThanOrEqual(2);
      expect(
        after.finalizeBuildOrdinal - before.finalizeBuildOrdinal
      ).toBeLessThanOrEqual(2);
    }
    expect(parity).toMatchObject({
      importedPostCount: 39,
      mismatchCount: 0,
      sourceRecordCount: 39,
    });
  });

  test("is replay-idempotent and observes canonical ACL parity for every role", async () => {
    const fixture = await seedMigrationFixture();
    const plan = await previewAll(fixture, 1);
    const run = await preparePlan(fixture, plan.planToken, 1);
    const completed = await applyAll(fixture, run.runId, 1);
    const replay = await applyBatch(fixture, run.runId, 25);
    expect(replay).toMatchObject({
      complete: true,
      nextImportOrdinal: 2,
      processedInBatch: 0,
      runId: completed.runId,
    });

    const parity = await runParity(fixture, run.runId, plan.planToken, 1);
    expect(parity).toMatchObject({
      importedPostCount: 2,
      mismatchCount: 0,
      sourceRecordCount: 2,
      status: "complete",
    });
    const durableReport = await fixture.admin.query(
      (api as any).build_collaboration_legacy_note_parity
        .getBuildCollaborationLegacyNoteMigrationParityReport,
      {
        buildId: fixture.buildId,
        evidenceId: parity.evidenceId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 1 },
      }
    );
    expect(durableReport.evidence).toMatchObject({
      evidenceId: parity.evidenceId,
      importedPostCount: 2,
      mismatchCount: 0,
      parityPassed: true,
      planToken: plan.planToken,
      reportVersion: PARITY_VERSION,
      sourceRecordCount: 2,
    });
    expect(durableReport.reports.page).toHaveLength(1);

    const state = await fixture.base.run(async (ctx) => ({
      actionItems: await ctx.db.query("buildActionItems").collect(),
      evidence: await ctx.db.get(parity.evidenceId),
      notificationEvents: await ctx.db
        .query("buildCollaborationExternalDeliveries")
        .collect(),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
      receipts: await ctx.db.query("buildCollaborationReceipts").collect(),
      reports: await ctx.db
        .query("buildCollaborationLegacyNoteParityBuildReports")
        .withIndex("by_parityRunId_and_buildOrdinal", (query) =>
          query.eq("parityRunId", parity.parityRunId)
        )
        .collect(),
      revisions: await ctx.db
        .query("buildCollaborationPostRevisions")
        .collect(),
    }));
    expect(state.evidence).toMatchObject({
      migrationRunId: run.runId,
      parityPassed: true,
      parityRunId: parity.parityRunId,
      planToken: plan.planToken,
      reportVersion: PARITY_VERSION,
      verificationSource: "legacy_note_migration_v1",
    });
    const roleMatrix = JSON.parse(state.reports[0].roleMatrixJson) as Record<
      string,
      {
        expectedReadable: number;
        expectedRestricted: number;
        mismatchCount: number;
        observedReadable: number;
        observedRestricted: number;
      }
    >;
    expect(Object.keys(roleMatrix).sort()).toEqual(
      [
        "admin",
        "broker",
        "broker-staff",
        "builder",
        "builder-staff",
        "contractor",
        "homeowner",
        "principle-broker",
      ].sort()
    );
    for (const cell of Object.values(roleMatrix)) {
      expect(cell.mismatchCount).toBe(0);
      expect(cell.observedReadable).toBe(cell.expectedReadable);
      expect(cell.observedRestricted).toBe(cell.expectedRestricted);
      expect(cell.observedReadable + cell.observedRestricted).toBe(2);
    }
    expect(roleMatrix.contractor).toMatchObject({
      observedReadable: 1,
      observedRestricted: 1,
    });
    expect(state.posts).toHaveLength(2);
    expect(state.revisions).toHaveLength(2);
    expect(state.receipts).toEqual([]);
    expect(state.actionItems).toEqual([]);
    expect(state.notificationEvents).toEqual([]);

    await fixture.admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId: fixture.buildId,
        expectedStatus: "disabled",
        nextStatus: "migration_ready",
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (!setting) {
        throw new Error("Expected rollout setting.");
      }
      await ctx.db.patch(setting._id, { status: "active" });
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
    const contractor = withRoleIdentity(
      fixture.base,
      "contractor",
      "user_migration_contractor"
    );
    const contractorFeed = await contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
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

  test("retains a durable tenant-wide rollback rehearsal and executes the real legacy-write denial", async () => {
    const fixture = await seedMigrationFixture();
    process.env.BUILD_COLLABORATION_RELEASE_APPLICATION_URL =
      "https://drawflow.example.com";
    process.env.BUILD_COLLABORATION_RELEASE_APPLICATION_VERSION =
      "release-2026-08-01";
    process.env.BUILD_COLLABORATION_RELEASE_CONVEX_DEPLOYMENT =
      "fairlend:drawflow:prod";
    process.env.BUILD_COLLABORATION_RELEASE_GIT_SHA =
      "0123456789abcdef0123456789abcdef01234567";
    process.env.CONVEX_CLOUD_URL = "https://example.convex.cloud";
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (setting) {
        await ctx.db.patch(setting._id, { cutoverEpoch: 3, status: "active" });
      } else {
        await ctx.db.insert("buildCollaborationTenantSettings", {
          brokerageId: fixture.brokerageId,
          createdAt: fixture.now,
          cutoverEpoch: 3,
          generousRateLimitMultiplier: 1,
          organizationId: ORGANIZATION_ID,
          status: "active",
          updatedAt: fixture.now,
        });
      }
    });
    const started = await fixture.admin.mutation(
      (api as any).build_collaboration_cutover_rehearsals
        .beginBuildCollaborationRollbackRehearsal,
      {
        applicationUrl: "https://drawflow.example.com",
        applicationVersion: "release-2026-08-01",
        buildId: fixture.buildId,
        convexDeployment: "fairlend:drawflow:prod",
        convexUrl: "https://example.convex.cloud",
        gitCommit: "0123456789abcdef0123456789abcdef01234567",
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_rollout
          .transitionBuildCollaborationTenantStatus,
        {
          buildId: fixture.buildId,
          expectedStatus: "active",
          nextStatus: "disabled",
          organizationId: ORGANIZATION_ID,
          reason: "Adversarial partial-snapshot transition",
        }
      )
    ).rejects.toThrow("snapshot is incomplete");
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration.listBuildCollaborationFeed,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 1 },
        }
      )
    ).rejects.toThrow("temporarily frozen");
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (!setting) throw new Error("Expected tenant setting.");
      await ctx.db.patch(setting._id, { cutoverEpoch: 4, status: "disabled" });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_cutover_rehearsals
          .advanceBuildCollaborationRollbackSnapshot,
        {
          buildId: fixture.buildId,
          limit: 1,
          organizationId: ORGANIZATION_ID,
          snapshotId: started.snapshotId,
        }
      )
    ).rejects.toThrow("snapshot state changed");
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (!setting) throw new Error("Expected tenant setting.");
      await ctx.db.patch(setting._id, { cutoverEpoch: 3, status: "active" });
    });
    let beforeComplete = false;
    for (let guard = 0; !beforeComplete; guard += 1) {
      expect(guard).toBeLessThan(20);
      const page = await fixture.admin.mutation(
        (api as any).build_collaboration_cutover_rehearsals
          .advanceBuildCollaborationRollbackSnapshot,
        {
          buildId: fixture.buildId,
          limit: 1,
          organizationId: ORGANIZATION_ID,
          snapshotId: started.snapshotId,
        }
      );
      beforeComplete = page.isComplete;
    }
    await fixture.admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId: fixture.buildId,
        expectedStatus: "active",
        nextStatus: "disabled",
        organizationId: ORGANIZATION_ID,
        reason: "Production rollback rehearsal",
      }
    );
    await expect(
      fixture.admin.action(
        (api as any).build_collaboration_cutover_rehearsals
          .executeBuildCollaborationLegacyWriteDenialCanary,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          rehearsalId: started.rehearsalId,
        }
      )
    ).resolves.toBe("denied");
    const afterSnapshotId = await fixture.admin.mutation(
      (api as any).build_collaboration_cutover_rehearsals
        .beginBuildCollaborationRollbackAfterSnapshot,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        rehearsalId: started.rehearsalId,
      }
    );
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (!setting) throw new Error("Expected tenant setting.");
      await ctx.db.patch(setting._id, { status: "active" });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_cutover_rehearsals
          .advanceBuildCollaborationRollbackSnapshot,
        {
          buildId: fixture.buildId,
          limit: 1,
          organizationId: ORGANIZATION_ID,
          snapshotId: afterSnapshotId,
        }
      )
    ).rejects.toThrow("snapshot state changed");
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration.listBuildCollaborationFeed,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 1 },
        }
      )
    ).rejects.toThrow("temporarily frozen");
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (!setting) throw new Error("Expected tenant setting.");
      await ctx.db.patch(setting._id, { status: "disabled" });
    });
    let afterComplete = false;
    for (let guard = 0; !afterComplete; guard += 1) {
      expect(guard).toBeLessThan(20);
      const page = await fixture.admin.mutation(
        (api as any).build_collaboration_cutover_rehearsals
          .advanceBuildCollaborationRollbackSnapshot,
        {
          buildId: fixture.buildId,
          limit: 1,
          organizationId: ORGANIZATION_ID,
          snapshotId: afterSnapshotId,
        }
      );
      afterComplete = page.isComplete;
      if (afterComplete) expect(page.retentionMatched).toBe(true);
    }
    const rehearsal = await fixture.base.run(async (ctx) =>
      ctx.db.get(started.rehearsalId)
    );
    expect(rehearsal).toMatchObject({
      beforeCutoverEpoch: 3,
      disabledCutoverEpoch: 4,
      legacyWriteDenialError:
        "Public/Internal Notes are retired. Publish a governed collaboration post instead.",
      status: "complete",
    });
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      if (!setting) throw new Error("Expected tenant setting.");
      await ctx.db.patch(setting._id, {
        activatedAt: fixture.now + 10_000,
        activatedByWorkosUserId: ADMIN_USER_ID,
        status: "active",
      });
    });
    const attestationId = await fixture.admin.mutation(
      (api as any).build_collaboration_cutover_rehearsals
        .attestBuildCollaborationCutoverArtifact,
      {
        artifactSha256: "A".repeat(64),
        buildId: fixture.buildId,
        kind: "migration_preview",
        organizationId: ORGANIZATION_ID,
        rehearsalId: started.rehearsalId,
      }
    );
    const attestation = await fixture.base.run(async (ctx) =>
      ctx.db.get(attestationId)
    );
    expect(attestation).toMatchObject({
      artifactSha256: "a".repeat(64),
      attestedByWorkosUserId: ADMIN_USER_ID,
      kind: "migration_preview",
      rehearsalId: started.rehearsalId,
    });
    const certificationState = await fixture.admin.query(
      (api as any).build_collaboration_cutover_certification
        .getBuildCollaborationCutoverCertificationState,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(certificationState.artifactAttestations).toEqual([
      expect.objectContaining({
        artifactSha256: "a".repeat(64),
        attestedByWorkosUserId: ADMIN_USER_ID,
        kind: "migration_preview",
      }),
    ]);
  });

  test("detects orphaned imports even when a new plan has zero source notes", async () => {
    const fixture = await seedMigrationFixture();
    const firstPlan = await previewAll(fixture, 2);
    const firstRun = await preparePlan(fixture, firstPlan.planToken, 2);
    await applyAll(fixture, firstRun.runId, 2);
    await fixture.base.run(async (ctx) => {
      for (const note of fixture.notes) {
        await ctx.db.delete(note.noteId);
      }
    });

    const emptyPlan = await previewAll(fixture, 1);
    expect(emptyPlan.notes).toEqual([]);
    const emptyRun = await preparePlan(fixture, emptyPlan.planToken, 1);
    expect(emptyRun).toMatchObject({
      processedNoteCount: 0,
      status: "complete",
    });
    const parity = await runParity(
      fixture,
      emptyRun.runId,
      emptyPlan.planToken,
      1
    );
    expect(parity.mismatchCount).toBeGreaterThanOrEqual(2);
    expect(parity.importedPostCount).toBe(2);
    const evidence = await fixture.base.run((ctx) =>
      ctx.db.get(parity.evidenceId)
    );
    expect(evidence).toMatchObject({ parityPassed: false });
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

  test("creates a fresh parity attempt after a failed report is repaired", async () => {
    const fixture = await seedMigrationFixture();
    const plan = await previewAll(fixture, 2);
    const migration = await preparePlan(fixture, plan.planToken, 2);
    await applyAll(fixture, migration.runId, 2);
    const publicPostId = await fixture.base.run(async (ctx) => {
      const post = await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_importedSourceId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("importedSourceId", `buildNote:${fixture.notes[0].noteId}`)
        )
        .unique();
      if (!post) {
        throw new Error("Expected imported public note.");
      }
      await ctx.db.patch(post._id, { audienceFloorTier: 9 });
      return post._id;
    });
    const failed = await runParity(
      fixture,
      migration.runId,
      plan.planToken,
      2
    );
    expect(failed.mismatchCount).toBeGreaterThan(0);

    await fixture.base.run((ctx) =>
      ctx.db.patch(publicPostId, { audienceFloorTier: 0 })
    );
    const repaired = await runParity(
      fixture,
      migration.runId,
      plan.planToken,
      2
    );
    expect(repaired.parityRunId).not.toBe(failed.parityRunId);
    expect(repaired).toMatchObject({ mismatchCount: 0, status: "complete" });
    const evidence = await fixture.base.run((ctx) =>
      ctx.db.get(repaired.evidenceId)
    );
    expect(evidence).toMatchObject({ parityPassed: true });
  });

  test("invalidates prior parity after rollback and requires a fresh destination check", async () => {
    const fixture = await seedMigrationFixture();
    const initialPlan = await previewAll(fixture, 2);
    const migration = await preparePlan(fixture, initialPlan.planToken, 2);
    await applyAll(fixture, migration.runId, 2);
    await runParity(fixture, migration.runId, initialPlan.planToken, 2);
    await fixture.admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId: fixture.buildId,
        expectedStatus: "disabled",
        nextStatus: "migration_ready",
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      const post = await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_importedSourceId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("importedSourceId", `buildNote:${fixture.notes[0].noteId}`)
        )
        .unique();
      if (!(setting && post)) {
        throw new Error("Expected cutover setting and imported post.");
      }
      await ctx.db.patch(setting._id, { status: "active" });
      await ctx.db.patch(post._id, { audienceFloorTier: 9 });
    });
    await fixture.admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId: fixture.buildId,
        expectedStatus: "active",
        nextStatus: "disabled",
        organizationId: ORGANIZATION_ID,
        reason: "Rollback after destination drift regression.",
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

    const nextPlan = await previewAll(fixture, 2);
    expect(nextPlan.planToken).not.toBe(initialPlan.planToken);
    const nextMigration = await preparePlan(fixture, nextPlan.planToken, 2);
    await expect(
      applyAll(fixture, nextMigration.runId, 2)
    ).rejects.toThrow("Existing import does not match");
  });

  test("rejects parity evidence created before the latest tenant Build", async () => {
    const fixture = await seedMigrationFixture();
    const plan = await previewAll(fixture, 2);
    const migration = await preparePlan(fixture, plan.planToken, 2);
    await applyAll(fixture, migration.runId, 2);
    await runParity(fixture, migration.runId, plan.planToken, 2);
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected migration fixture Build.");
      }
      const { _creationTime, _id, ...buildFields } = build;
      await ctx.db.insert("activeBuilds", {
        ...buildFields,
        buildName: "Build created after legacy-note parity",
        createdAt: fixture.now + 10_000,
        updatedAt: fixture.now + 10_000,
      });
      expect(_creationTime).toEqual(expect.any(Number));
      expect(_id).toBe(fixture.buildId);
    });
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
    ).rejects.toThrow("fresh migration parity for the current Build set");
  });

  test("rejects cross-tenant scope, attested evidence, oversized batches, and legacy note writes", async () => {
    const fixture = await seedMigrationFixture();
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_legacy_note_plan
          .previewBuildCollaborationLegacyNoteMigrationPage,
        {
          buildId: fixture.buildId,
          organizationId: "org_foreign",
          paginationOpts: { cursor: null, numItems: 1 },
          phase: "builds",
        }
      )
    ).rejects.toThrow("Forbidden: brokerage");
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_legacy_note_plan
          .previewBuildCollaborationLegacyNoteMigrationPage,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 51 },
          phase: "builds",
        }
      )
    ).rejects.toThrow("between 1 and 50");
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.addActiveBuildNote,
        {
          body: "This legacy write must never land.",
          buildId: fixture.buildId,
          visibility: "public",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Public/Internal Notes are retired");
    const detail = await fixture.admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      {
        buildId: String(fixture.buildId),
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(detail).not.toHaveProperty("notes");

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
  return withRoleIdentity(base, "admin", ADMIN_USER_ID);
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
  workpoolTest.register(base, "buildCollaborationSearchWorkpool");
  const admin = withAdminIdentity(base);
  const foundation = await admin.mutation(
    (internal as any).production_proposals.dev_seedProductionFoundation,
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
    await ctx.db.patch(proposalId, {
      activeBuildId: buildId,
      workflowRuleSnapshotId,
    });
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
      { noteId: seeded.publicNoteId },
      { noteId: seeded.internalNoteId },
    ],
    now,
  };
}

async function previewAll(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  pageSize: number
) {
  const builds: Record<string, unknown>[] = [];
  const notes: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  let accumulator: string | undefined;
  let cursor: string | null = null;
  for (const phase of ["builds", "notes"] as const) {
    cursor = null;
    for (let guard = 0; guard < 100; guard += 1) {
      const page: PreviewPage = await fixture.admin.query(
        (api as any).build_collaboration_legacy_note_plan
          .previewBuildCollaborationLegacyNoteMigrationPage,
        {
          accumulator,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor, numItems: pageSize },
          phase,
        }
      );
      accumulator = page.accumulator;
      warnings.push(...page.warnings);
      (phase === "builds" ? builds : notes).push(...page.items);
      if (page.isDone) {
        if (phase === "notes") {
          return {
            accumulator,
            builds,
            notes,
            planToken: page.planToken as string,
            planVersion: PLAN_VERSION,
            warnings,
          };
        }
        break;
      }
      cursor = page.continueCursor;
    }
  }
  throw new Error("Preview pagination did not complete.");
}

async function startPlan(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  planToken: string
) {
  return await fixture.admin.mutation(
    (api as any).build_collaboration_legacy_note_plan
      .startBuildCollaborationLegacyNoteMigration,
    {
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      planToken,
    }
  );
}

async function advancePlan(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  runId: Id<"buildCollaborationLegacyNoteMigrationRuns">,
  maxItems: number
) {
  return await fixture.admin.mutation(
    (api as any).build_collaboration_legacy_note_plan
      .advanceBuildCollaborationLegacyNotePlan,
    {
      buildId: fixture.buildId,
      maxItems,
      organizationId: ORGANIZATION_ID,
      runId,
    }
  );
}

async function preparePlan(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  planToken: string,
  maxItems: number
) {
  let run = await startPlan(fixture, planToken);
  for (let guard = 0; run.status === "validating"; guard += 1) {
    if (guard >= 100) {
      throw new Error("Plan validation did not complete.");
    }
    run = await advancePlan(fixture, run.runId, maxItems);
  }
  if (run.status === "blocked") {
    throw new Error(run.blockedReason);
  }
  return run;
}

async function applyBatch(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  runId: Id<"buildCollaborationLegacyNoteMigrationRuns">,
  maxNotes: number
) {
  const run = await fixture.base.run((ctx) => ctx.db.get(runId));
  if (!run) {
    throw new Error("Expected migration run.");
  }
  return await fixture.admin.mutation(
    (api as any).build_collaboration_legacy_note_import
      .applyBuildCollaborationLegacyNoteMigrationBatch,
    {
      buildId: fixture.buildId,
      maxNotes,
      organizationId: ORGANIZATION_ID,
      planToken: run.planToken,
      runId,
    }
  );
}

async function applyAll(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  runId: Id<"buildCollaborationLegacyNoteMigrationRuns">,
  maxNotes: number
) {
  let result = await applyBatch(fixture, runId, maxNotes);
  for (let guard = 0; !result.complete; guard += 1) {
    if (guard >= 100) {
      throw new Error("Import did not complete.");
    }
    result = await applyBatch(fixture, runId, maxNotes);
  }
  return result;
}

async function startParity(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  migrationRunId: Id<"buildCollaborationLegacyNoteMigrationRuns">,
  planToken: string
) {
  return await fixture.admin.mutation(
    (api as any).build_collaboration_legacy_note_parity
      .startBuildCollaborationLegacyNoteParity,
    {
      buildId: fixture.buildId,
      migrationRunId,
      organizationId: ORGANIZATION_ID,
      planToken,
    }
  );
}

async function advanceParity(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  parityRunId: Id<"buildCollaborationLegacyNoteParityRuns">,
  maxItems: number
) {
  return await fixture.admin.mutation(
    (api as any).build_collaboration_legacy_note_parity
      .advanceBuildCollaborationLegacyNoteParity,
    {
      buildId: fixture.buildId,
      maxItems,
      organizationId: ORGANIZATION_ID,
      parityRunId,
      reason: "Automated Build-by-Build migration parity verification.",
    }
  );
}

async function runParity(
  fixture: Awaited<ReturnType<typeof seedMigrationFixture>>,
  migrationRunId: Id<"buildCollaborationLegacyNoteMigrationRuns">,
  planToken: string,
  maxItems: number
) {
  let run = await startParity(fixture, migrationRunId, planToken);
  for (let guard = 0; run.status !== "complete"; guard += 1) {
    if (guard >= 100 || run.status === "blocked") {
      throw new Error(run.blockedReason ?? "Parity did not complete.");
    }
    run = await advanceParity(fixture, run.parityRunId, maxItems);
  }
  return run;
}

async function collaborationWriteCounts(base: ReturnType<typeof convexTest>) {
  return await base.run(async (ctx) => ({
    audits: (await ctx.db.query("auditEvents").collect()).length,
    parityEvidence: (
      await ctx.db.query("buildCollaborationMigrationParityEvidence").collect()
    ).length,
    parityRuns: (
      await ctx.db.query("buildCollaborationLegacyNoteParityRuns").collect()
    ).length,
    planBuilds: (
      await ctx.db.query("buildCollaborationLegacyNotePlanBuilds").collect()
    ).length,
    planNotes: (
      await ctx.db.query("buildCollaborationLegacyNotePlanNotes").collect()
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

async function parityProgress(
  base: ReturnType<typeof convexTest>,
  parityRunId: Id<"buildCollaborationLegacyNoteParityRuns">
) {
  return await base.run(async (ctx) => {
    const run = await ctx.db.get(parityRunId);
    if (!run) {
      throw new Error("Expected parity run.");
    }
    const reportCount = (
      await ctx.db
        .query("buildCollaborationLegacyNoteParityBuildReports")
        .collect()
    ).filter((report) => report.parityRunId === parityRunId).length;
    return {
      finalizeBuildOrdinal: run.finalizeBuildOrdinal,
      nextBuildOrdinal: run.nextBuildOrdinal,
      nextNoteOrdinal: run.nextNoteOrdinal,
      orphanBuildOrdinal: run.orphanBuildOrdinal,
      reportCount,
    };
  });
}
