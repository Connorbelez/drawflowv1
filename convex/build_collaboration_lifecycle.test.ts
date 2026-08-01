/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_collaboration_lifecycle";
const BASE_TIME = Date.parse("2026-08-01T12:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Build collaboration export and lifecycle governance", () => {
  test("enforces every role's export scope and omits restricted records", async () => {
    const fixture = await seedLifecycleFixture();
    const expectedBuildScopes: Array<
      [
        typeof fixture.admin,
        "authorized_build" | "full_archive",
        string | undefined,
      ]
    > = [
      [fixture.admin, "full_archive", "Admin-only retained record"],
      [fixture.principal, "full_archive", undefined],
      [fixture.broker, "authorized_build", undefined],
      [fixture.builder, "authorized_build", undefined],
      [fixture.brokerStaff, "authorized_build", undefined],
    ];
    for (const [actor, expectedScope, visibleRestrictedText] of expectedBuildScopes) {
      const created = await actor.mutation(
        (api as any).build_collaboration_exports.requestBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          scope: "build",
        }
      );
      expect(created.scope).toBe(expectedScope);
      const downloaded = await actor.mutation(
        (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        }
      );
      expect(downloaded.manifestJson).not.toContain("restricted_placeholder");
      if (visibleRestrictedText) {
        expect(downloaded.manifestJson).toContain(visibleRestrictedText);
      } else {
        expect(downloaded.manifestJson).not.toContain(
          "Admin-only retained record"
        );
      }
      expect(JSON.parse(downloaded.aclSnapshotJson)).toMatchObject({
        effectiveRole: expect.any(String),
        organizationId: ORGANIZATION_ID,
        viewerWorkosUserId: expect.any(String),
      });
    }

    for (const actor of [fixture.builderStaff, fixture.homeowner]) {
      const threadExport = await actor.mutation(
        (api as any).build_collaboration_exports.requestBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: fixture.sharedPostId,
          scope: "thread",
        }
      );
      expect(threadExport.scope).toBe("thread");
      await expect(
        actor.mutation(
          (api as any).build_collaboration_exports.requestBuildCollaborationExport,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            scope: "build",
          }
        )
      ).rejects.toThrow("individual visible record");
    }

    const contractorAsset = await fixture.contractor.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        assetId: fixture.assetId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "asset",
      }
    );
    expect(contractorAsset.scope).toBe("asset");
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_exports.requestBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: fixture.sharedPostId,
          scope: "thread",
        }
      )
    ).rejects.toThrow("Contractors may export only");

    const audits = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "buildCollaborationExport")
        )
        .collect()
    );
    expect(audits).toHaveLength(8);
    expect(audits.every((audit) => audit.organizationId === ORGANIZATION_ID)).toBe(
      true
    );
  });

  test("rejects expired export links without disclosing their manifest", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const created = await fixture.builder.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      }
    );
    vi.setSystemTime(created.expiresAt + 1);
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        }
      )
    ).rejects.toThrow("expired");
  });

  test("revalidates export scope and every exported asset download", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const created = await fixture.brokerStaff.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      }
    );
    const downloaded = await fixture.brokerStaff.mutation(
      (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        exportId: created.exportId,
        organizationId: ORGANIZATION_ID,
        token: created.token,
      }
    );
    expect(downloaded.assets).toHaveLength(1);
    expect(downloaded.assets[0]?.url).toContain(
      "/api/build-collaboration/export-asset"
    );
    expect(downloaded.assets[0]?.url).not.toContain("/api/storage/");

    const assetDownloadUrl = new URL(
      downloaded.assets[0]!.url,
      "https://some.convex.site"
    );
    const assetDownloadPath = `${assetDownloadUrl.pathname}${assetDownloadUrl.search}`;
    const preflight = await fixture.base.fetch(assetDownloadPath, {
      headers: {
        "Access-Control-Request-Headers": "Authorization",
        "Access-Control-Request-Method": "GET",
        Origin: "http://localhost:3000",
      },
      method: "OPTIONS",
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000"
    );
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization"
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("archive evidence", {
        headers: { "Content-Type": "text/plain" },
        status: 200,
      })
    );
    const assetResponse = await fixture.brokerStaff.fetch(assetDownloadPath, {
      headers: {
        Authorization: "Bearer test-auth-token",
        Origin: "http://localhost:3000",
      },
    });
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000"
    );
    expect(assetResponse.headers.get("Cache-Control")).toContain("no-store");
    expect(await assetResponse.text()).toBe("archive evidence");

    const authorizedAsset = await fixture.brokerStaff.mutation(
      (api as any).build_collaboration_exports
        .authorizeBuildCollaborationExportAssetDownload,
      {
        assetId: fixture.assetId,
        buildId: fixture.buildId,
        exportId: created.exportId,
        organizationId: ORGANIZATION_ID,
        token: created.token,
      }
    );
    expect(authorizedAsset).toMatchObject({
      expiresAt: created.expiresAt,
      fileName: "foundation.txt",
      mimeType: "text/plain",
    });

    await fixture.base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_broker_staff")
        )
        .unique();
      if (!participant) {
        throw new Error("Expected Broker Staff participant fixture.");
      }
      await ctx.db.patch(participant._id, {
        role: "builder-staff",
        updatedAt: Date.now(),
      });
    });
    const demoted = withIdentity(
      fixture.base,
      "builder-staff",
      "user_broker_staff"
    );
    await expect(
      demoted.mutation(
        (api as any).build_collaboration_exports
          .downloadBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        }
      )
    ).rejects.toThrow("scope changed");

    vi.setSystemTime(created.expiresAt + 1);
    await expect(
      fixture.brokerStaff.mutation(
        (api as any).build_collaboration_exports
          .authorizeBuildCollaborationExportAssetDownload,
        {
          assetId: fixture.assetId,
          buildId: fixture.buildId,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        }
      )
    ).rejects.toThrow("expired");
  });

  test("requires explicit authority and closure waivers, preserves archive reads, and audits reopen", async () => {
    const fixture = await seedLifecycleFixture();
    await expect(
      fixture.broker.mutation(
        (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
        {
          buildId: fixture.buildId,
          expectedRevision: 0,
          organizationId: ORGANIZATION_ID,
          reason: "Broker attempted closure.",
        }
      )
    ).rejects.toThrow("Admin or Principal Broker");
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
        {
          buildId: fixture.buildId,
          expectedRevision: 0,
          organizationId: ORGANIZATION_ID,
          reason: "Operational work is complete.",
        }
      )
    ).rejects.toThrow("Action Item");

    await fixture.admin.mutation(
      (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 0,
        organizationId: ORGANIZATION_ID,
        reason: "Operational work is complete.",
        waivers: [
          {
            actionItemId: fixture.actionItemId,
            reason: "Accepted as a documented post-close exception.",
          },
        ],
      }
    );
    await expect(
      publishAsBuilder(fixture, "Closed Builds reject shared writes.")
    ).rejects.toThrow("closed and read-only");
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_threads.addBuildCollaborationComment,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Closed reply.",
          postId: fixture.sharedPostId,
          references: [],
          tiptapJson: textDocument("Closed reply."),
        }
      )
    ).rejects.toThrow("closed and read-only");
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId: fixture.actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 1,
          nextStatus: "in_progress",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("closed and read-only");
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_assets
          .beginBuildCollaborationAssetUpload,
        {
          buildId: fixture.buildId,
          contextKind: "composer",
          fileName: "closed.txt",
          mimeType: "text/plain",
          organizationId: ORGANIZATION_ID,
          sizeBytes: 12,
        }
      )
    ).rejects.toThrow("closed and read-only");
    await expect(
      fixture.base.mutation(
        (internal as any).build_collaboration_system_events
          .publishBuildCollaborationSystemEvent,
        {
          buildId: fixture.buildId,
          idempotencyKey: "closed-system-event",
          organizationId: ORGANIZATION_ID,
          plainText: "Closed system event.",
          postType: "update",
          systemLabel: "DrawFlow",
        }
      )
    ).rejects.toThrow("closed and read-only");

    const archivedExport = await fixture.homeowner.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.sharedPostId,
        scope: "thread",
      }
    );
    expect(archivedExport.scope).toBe("thread");
    const searchResponse = await fixture.builder.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "foundation",
      }
    );
    expect(searchResponse).toHaveProperty("page");

    await expect(
      fixture.broker.mutation(
        (api as any).build_collaboration_lifecycle.reopenBuildCollaboration,
        {
          buildId: fixture.buildId,
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Broker attempted reopen.",
        }
      )
    ).rejects.toThrow("Admin or Principal Broker");
    await fixture.principal.mutation(
      (api as any).build_collaboration_lifecycle.reopenBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Additional governed coordination is required.",
      }
    );
    await expect(
      publishAsBuilder(fixture, "Reopened Builds accept shared writes.")
    ).resolves.toBeDefined();
    const history = await fixture.base.run((ctx) =>
      ctx.db
        .query("buildCollaborationBuildLifecycleEvents")
        .withIndex("by_buildId_and_createdAt", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .collect()
    );
    expect(history.map((event) => event.eventType)).toEqual([
      "closed",
      "reopened",
    ]);
  });

  test("applies tenant retention, blocks purge under legal hold, and retains audit history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .setBuildCollaborationRetentionPolicy,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        policyKey: "regulatory-30-day-test",
        reason: "Tenant regulatory archive policy.",
        retentionDays: 30,
      }
    );
    const pendingStorageId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected lifecycle Build fixture.");
      }
      const storageId = await ctx.storage.store(
        new Blob(["unfinalized upload"], { type: "text/plain" })
      );
      await ctx.db.insert("buildCollaborationAssetStagingSessions", {
        brokerageId: build.brokerageId,
        buildId: fixture.buildId,
        contextKind: "composer",
        createdAt: BASE_TIME,
        expiresAt: BASE_TIME + 86_400_000,
        organizationId: ORGANIZATION_ID,
        ownerWorkosUserId: "user_builder",
        pendingStorageId: storageId,
        state: "open",
        updatedAt: BASE_TIME,
      });
      return storageId;
    });
    await fixture.admin.mutation(
      (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 0,
        organizationId: ORGANIZATION_ID,
        reason: "Build archive approved for closure.",
        waivers: [
          {
            actionItemId: fixture.actionItemId,
            reason: "Final exception accepted by Admin.",
          },
        ],
      }
    );
    const closedState = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique()
    );
    expect(closedState).toMatchObject({
      retentionEligibleAt: BASE_TIME + 30 * 86_400_000,
      retentionPolicyId: expect.any(String),
      retentionPolicyVersion: 1,
      state: "closed",
    });
    const holdId = await fixture.admin.mutation(
      (api as any).build_collaboration_retention.placeBuildCollaborationLegalHold,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        reason: "Preserve records for pending legal review.",
        reference: "LEGAL-2026-001",
      }
    );
    vi.setSystemTime(BASE_TIME + 31 * 86_400_000);
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_retention
          .purgeExpiredBuildCollaborationContent,
        {
          buildId: fixture.buildId,
          expectedLifecycleRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Execute expired retention policy.",
        }
      )
    ).rejects.toThrow("Legal hold blocks");
    expect(
      await fixture.base.run((ctx) => ctx.db.get(fixture.sharedPostId))
    ).not.toBeNull();

    await fixture.principal.mutation(
      (api as any).build_collaboration_retention
        .releaseBuildCollaborationLegalHold,
      {
        buildId: fixture.buildId,
        holdId,
        organizationId: ORGANIZATION_ID,
        reason: "Counsel released the preservation requirement.",
      }
    );
    const purged = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        expectedLifecycleRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Execute expired retention policy.",
      }
    );
    expect(purged).toMatchObject({ complete: true });
    const retained = await fixture.base.run(async (ctx) => ({
      audit: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "buildCollaborationBuildState")
        )
        .collect(),
      lifecycle: await ctx.db
        .query("buildCollaborationBuildLifecycleEvents")
        .withIndex("by_buildId_and_createdAt", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .collect(),
      post: await ctx.db.get(fixture.sharedPostId),
      pendingStorageUrl: await ctx.storage.getUrl(pendingStorageId),
      state: await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique(),
    }));
    expect(retained.post).toBeNull();
    expect(retained.pendingStorageUrl).toBeNull();
    expect(retained.state).toMatchObject({ state: "purged" });
    expect(retained.lifecycle.map((event) => event.eventType)).toEqual([
      "closed",
      "purged",
    ]);
    expect(retained.audit.length).toBeGreaterThanOrEqual(2);
  });

  test("persists cumulative audited progress across bounded purge retries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      for (let index = 0; index < 10; index += 1) {
        const now = BASE_TIME + 100 + index;
        const postId = await ctx.db.insert("buildCollaborationPosts", {
          acknowledgementRequired: false,
          agentDrafted: false,
          audienceFloorTier: 3,
          audienceMode: "build_wide",
          authorDisplayNameSnapshot: "Builder",
          authorRole: "builder",
          authorRolesSnapshot: ["builder"],
          authorWorkosUserId: "user_builder",
          brokerageId: (await ctx.db.get(fixture.buildId))!.brokerageId,
          buildId: fixture.buildId,
          commentCount: 0,
          contentState: "active",
          createdAt: now,
          lastMeaningfulActivityAt: now,
          openActionItemCount: 0,
          organizationId: ORGANIZATION_ID,
          postType: "update",
          readRevision: 1,
          revision: 1,
          source: "human",
          threadRevision: 0,
          threadState: "open",
          updatedAt: now,
        });
        const revisionId = await ctx.db.insert(
          "buildCollaborationPostRevisions",
          {
            authorRole: "builder",
            authorWorkosUserId: "user_builder",
            brokerageId: (await ctx.db.get(fixture.buildId))!.brokerageId,
            buildId: fixture.buildId,
            contentHash: `purge-batch-${index}`,
            createdAt: now,
            organizationId: ORGANIZATION_ID,
            plainText: `Purge batch ${index}`,
            postId,
            revision: 1,
            tiptapJson: textDocument(`Purge batch ${index}`),
          }
        );
        await ctx.db.patch(postId, { currentRevisionId: revisionId });
      }
    });
    await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .setBuildCollaborationRetentionPolicy,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        policyKey: "bounded-purge-test",
        reason: "Exercise durable bounded purge progress.",
        retentionDays: 30,
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 0,
        organizationId: ORGANIZATION_ID,
        reason: "Prepare the Build for bounded retention purge.",
        waivers: [
          {
            actionItemId: fixture.actionItemId,
            reason: "Administrative archive exception.",
          },
        ],
      }
    );
    vi.setSystemTime(BASE_TIME + 31 * 86_400_000);
    const args = {
      buildId: fixture.buildId,
      expectedLifecycleRevision: 1,
      organizationId: ORGANIZATION_ID,
      reason: "Execute bounded retention purge.",
    };
    const first = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      args
    );
    expect(first).toMatchObject({
      complete: false,
      deletedPostCount: 10,
      hasRemainingPosts: true,
    });
    const progress = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationRetentionPurges")
        .withIndex("by_buildId_and_state", (query) =>
          query.eq("buildId", fixture.buildId).eq("state", "in_progress")
        )
        .unique()
    );
    expect(progress).toMatchObject({ batchCount: 1, deletedPostCount: 10 });
    const progressAudits = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "buildCollaborationRetentionPurge")
        )
        .collect()
    );
    expect(progressAudits.map((event) => event.eventType)).toEqual([
      "build.collaboration.retention_purge.started",
      "build.collaboration.retention_purge.batch_completed",
    ]);

    const completed = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      args
    );
    expect(completed).toMatchObject({
      complete: true,
      deletedPostCount: 12,
      hasRemainingPosts: false,
    });
    const replay = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      args
    );
    expect(replay).toEqual(completed);
  });

  test("exports immutable full-archive history instead of only current projections", async () => {
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(fixture.sharedPostId);
      if (!post?.currentRevisionId) {
        throw new Error("Expected an export fixture post revision.");
      }
      const current = await ctx.db.get(post.currentRevisionId);
      if (!current) {
        throw new Error("Expected the current export fixture revision.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...revisionFields
      } = current;
      const revisionId = await ctx.db.insert("buildCollaborationPostRevisions", {
        ...revisionFields,
        contentHash: "full-archive-revision-2",
        createdAt: current.createdAt + 1,
        plainText: "Immutable second revision.",
        revision: 2,
        tiptapJson: textDocument("Immutable second revision."),
      });
      await ctx.db.patch(post._id, {
        currentRevisionId: revisionId,
        revision: 2,
      });
    });
    const created = await fixture.admin.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      }
    );
    const downloaded = await fixture.admin.mutation(
      (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        exportId: created.exportId,
        organizationId: ORGANIZATION_ID,
        token: created.token,
      }
    );
    const manifest = JSON.parse(downloaded.manifestJson);
    const archivedPost = manifest.fullArchive.posts.find(
      (entry: any) => entry.post._id === fixture.sharedPostId
    );
    expect(archivedPost.revisions.map((entry: any) => entry.revision.revision)).toEqual([
      1, 2,
    ]);
    expect(archivedPost.actionItems[0]).toEqual(
      expect.objectContaining({
        events: expect.any(Array),
        revisions: expect.any(Array),
        checklist: expect.any(Array),
        relations: expect.any(Array),
      })
    );
    expect(archivedPost).toEqual(
      expect.objectContaining({
        acknowledgements: expect.any(Array),
        moderation: expect.any(Array),
        receipts: expect.any(Array),
        references: expect.any(Array),
        threadEvents: expect.any(Array),
      })
    );
    expect(manifest.fullArchive.buildHistory).toEqual(
      expect.objectContaining({
        closureWaivers: expect.any(Array),
        lifecycleEvents: expect.any(Array),
      })
    );
  });

  test("keeps the retention window snapshotted at Build closure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .setBuildCollaborationRetentionPolicy,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        policyKey: "ten-year-archive",
        reason: "Preserve the closure-time regulatory window.",
        retentionDays: 3650,
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 0,
        organizationId: ORGANIZATION_ID,
        reason: "Close under the ten-year archive policy.",
        waivers: [
          {
            actionItemId: fixture.actionItemId,
            reason: "Administrative archive exception.",
          },
        ],
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .setBuildCollaborationRetentionPolicy,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        policyKey: "new-thirty-day-policy",
        reason: "Apply a shorter policy only to future closures.",
        retentionDays: 30,
      }
    );
    vi.setSystemTime(BASE_TIME + 31 * 86_400_000);
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_retention
          .purgeExpiredBuildCollaborationContent,
        {
          buildId: fixture.buildId,
          expectedLifecycleRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Attempt premature purge under replacement policy.",
        }
      )
    ).rejects.toThrow("not yet eligible");
    expect(
      await fixture.base.run(async (ctx) =>
        ctx.db
          .query("buildCollaborationBuildStates")
          .withIndex("by_buildId", (query) =>
            query.eq("buildId", fixture.buildId)
          )
          .unique()
      )
    ).toMatchObject({
      retentionEligibleAt: BASE_TIME + 3650 * 86_400_000,
      retentionPolicyVersion: 1,
      state: "closed",
    });
  });

  test("removes idempotency and activity residue before marking a Build purged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected residue fixture Build.");
      }
      await ctx.db.insert("buildActionItemCreationRequests", {
        actionItemId: fixture.actionItemId,
        brokerageId: build.brokerageId,
        buildId: fixture.buildId,
        createdAt: BASE_TIME,
        creatorWorkosUserId: "user_builder",
        organizationId: ORGANIZATION_ID,
        postId: fixture.sharedPostId,
        requestId: "purge-residue-request",
      });
      await ctx.db.insert("buildCollaborationActivityProjections", {
        actionItemId: fixture.actionItemId,
        actorWorkosUserId: "user_builder",
        brokerageId: build.brokerageId,
        buildId: fixture.buildId,
        createdAt: BASE_TIME,
        eventType: "action_item_created",
        organizationId: ORGANIZATION_ID,
        postId: fixture.sharedPostId,
        projectionKey: "purge-residue-projection",
        targetId: fixture.sharedPostId,
        targetKind: "post",
      });
    });
    await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .setBuildCollaborationRetentionPolicy,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        policyKey: "residue-test",
        reason: "Verify destructive completion integrity.",
        retentionDays: 30,
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 0,
        organizationId: ORGANIZATION_ID,
        reason: "Close for residue verification.",
        waivers: [
          {
            actionItemId: fixture.actionItemId,
            reason: "Administrative archive exception.",
          },
        ],
      }
    );
    vi.setSystemTime(BASE_TIME + 31 * 86_400_000);
    await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        expectedLifecycleRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Execute residue-safe purge.",
      }
    );
    const residue = await fixture.base.run(async (ctx) => ({
      activity: await ctx.db
        .query("buildCollaborationActivityProjections")
        .withIndex("by_buildId_and_projectionKey", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .collect(),
      requests: await ctx.db
        .query("buildActionItemCreationRequests")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .collect(),
      state: await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .unique(),
    }));
    expect(residue.activity).toEqual([]);
    expect(residue.requests).toEqual([]);
    expect(residue.state).toMatchObject({ state: "purged" });
  });

  test("prevents internal prominence and deadline jobs from mutating a closed archive", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.sharedPostId, {
        announcementExpiresAt: BASE_TIME,
        announcementProminent: true,
        postType: "announcement",
      });
      await ctx.db.patch(fixture.actionItemId, {
        deadlineNextAt: BASE_TIME,
        deadlineNextStage: "due",
        deadlineProcessingState: "pending",
        dueAt: BASE_TIME,
      });
    });
    await fixture.admin.mutation(
      (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 0,
        organizationId: ORGANIZATION_ID,
        reason: "Freeze all archived shared state.",
        waivers: [
          {
            actionItemId: fixture.actionItemId,
            reason: "Administrative archive exception.",
          },
        ],
      }
    );
    const before = await fixture.base.run(async (ctx) => ({
      events: await ctx.db
        .query("buildActionItemEvents")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", fixture.actionItemId)
        )
        .collect(),
      item: await ctx.db.get(fixture.actionItemId),
      post: await ctx.db.get(fixture.sharedPostId),
    }));
    await fixture.base.mutation(
      (internal as any).build_collaboration_resolution
        .expireBuildCollaborationAnnouncementProminence,
      {
        announcementExpiresAt: BASE_TIME,
        postId: fixture.sharedPostId,
      }
    );
    await fixture.base.mutation(
      (internal as any).build_action_item_queues
        .applyBuildActionItemPolicyDueDate,
      {
        actionItemId: fixture.actionItemId,
        buildId: fixture.buildId,
        dueAt: BASE_TIME + 86_400_000,
        organizationId: ORGANIZATION_ID,
        policyKey: "closed-archive-policy",
      }
    );
    await fixture.base.mutation(
      (internal as any).build_action_item_queues
        .processOneBuildActionItemDeadline,
      { actionItemId: fixture.actionItemId, asOf: BASE_TIME }
    );
    const after = await fixture.base.run(async (ctx) => ({
      events: await ctx.db
        .query("buildActionItemEvents")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", fixture.actionItemId)
        )
        .collect(),
      item: await ctx.db.get(fixture.actionItemId),
      post: await ctx.db.get(fixture.sharedPostId),
    }));
    expect(after.post).toMatchObject({
      announcementProminent: before.post?.announcementProminent,
      threadRevision: before.post?.threadRevision,
    });
    expect(after.item).toMatchObject({
      currentRevision: before.item?.currentRevision,
      deadlineNextAt: before.item?.deadlineNextAt,
      dueAt: before.item?.dueAt,
    });
    expect(after.events).toHaveLength(before.events.length);
  });
});

function withIdentity(
  t: ReturnType<typeof convexTest>,
  role: BuildCollaborationRole,
  subject = `user_${role.replace("-", "_")}`
) {
  return t.withIdentity({
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

async function seedLifecycleFixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, "admin");
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const seeded = await admin.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      buildName: "Lifecycle fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "12 Archive Lane",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "user_admin",
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
      buildName: "Lifecycle fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "12 Archive Lane",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-01",
      status: "active",
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId, workflowRuleSnapshotId });
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "user_admin",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      migrationCompletedAt: now,
      organizationId: ORGANIZATION_ID,
      status: "active",
      updatedAt: now,
    });
    const participants: Array<[string, BuildCollaborationRole]> = [
      ["user_principle_broker", "principle-broker"],
      ["user_broker", "broker"],
      ["user_builder", "builder"],
      ["user_broker_staff", "broker-staff"],
      ["user_builder_staff", "builder-staff"],
      ["user_homeowner", "homeowner"],
      ["user_contractor", "contractor"],
    ];
    for (const [workosUserId, role] of participants) {
      await ctx.db.insert("buildParticipants", {
        brokerageId: foundation.brokerageId,
        buildId,
        createdAt: now,
        displayNameSnapshot: role,
        joinedAt: now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role,
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId,
      });
    }
    const sharedPostId = await ctx.db.insert("buildCollaborationPosts", {
      acknowledgementRequired: false,
      agentDrafted: false,
      audienceFloorTier: 3,
      audienceMode: "build_wide",
      authorDisplayNameSnapshot: "Builder",
      authorRole: "builder",
      authorRolesSnapshot: ["builder"],
      authorWorkosUserId: "user_builder",
      brokerageId: foundation.brokerageId,
      buildId,
      commentCount: 0,
      contentState: "active",
      createdAt: now,
      lastMeaningfulActivityAt: now,
      openActionItemCount: 1,
      organizationId: ORGANIZATION_ID,
      postType: "update",
      readRevision: 1,
      revision: 1,
      source: "human",
      threadRevision: 0,
      threadState: "open",
      updatedAt: now,
    });
    const sharedRevisionId = await ctx.db.insert(
      "buildCollaborationPostRevisions",
      {
        authorRole: "builder",
        authorWorkosUserId: "user_builder",
        brokerageId: foundation.brokerageId,
        buildId,
        contentHash: "fixture-shared",
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        plainText: "Foundation archive update",
        postId: sharedPostId,
        revision: 1,
        tiptapJson: textDocument("Foundation archive update"),
      }
    );
    await ctx.db.patch(sharedPostId, { currentRevisionId: sharedRevisionId });
    const secretPostId = await ctx.db.insert("buildCollaborationPosts", {
      acknowledgementRequired: false,
      agentDrafted: false,
      audienceFloorTier: 5,
      audienceMode: "custom",
      authorDisplayNameSnapshot: "Admin",
      authorRole: "admin",
      authorRolesSnapshot: ["admin"],
      authorWorkosUserId: "user_admin",
      brokerageId: foundation.brokerageId,
      buildId,
      commentCount: 0,
      contentState: "active",
      createdAt: now + 1,
      lastMeaningfulActivityAt: now + 1,
      openActionItemCount: 0,
      organizationId: ORGANIZATION_ID,
      postType: "decision",
      readRevision: 1,
      revision: 1,
      source: "human",
      threadRevision: 0,
      threadState: "open",
      updatedAt: now + 1,
    });
    const secretRevisionId = await ctx.db.insert(
      "buildCollaborationPostRevisions",
      {
        authorRole: "admin",
        authorWorkosUserId: "user_admin",
        brokerageId: foundation.brokerageId,
        buildId,
        contentHash: "fixture-secret",
        createdAt: now + 1,
        organizationId: ORGANIZATION_ID,
        plainText: "Admin-only retained record",
        postId: secretPostId,
        revision: 1,
        tiptapJson: textDocument("Admin-only retained record"),
      }
    );
    await ctx.db.patch(secretPostId, { currentRevisionId: secretRevisionId });
    const actionItemId = await ctx.db.insert("buildActionItems", {
      assignmentState: "assigned",
      brokerageId: foundation.brokerageId,
      buildId,
      createdAt: now,
      creatorRole: "builder",
      creatorWorkosUserId: "user_builder",
      currentRevision: 1,
      descriptionPlainText: "Complete final archive task.",
      descriptionTiptapJson: textDocument("Complete final archive task."),
      originatingPostId: sharedPostId,
      organizationId: ORGANIZATION_ID,
      priority: "medium",
      requiresAcceptance: false,
      status: "todo",
      title: "Final archive task",
      updatedAt: now,
    });
    const storageId = await ctx.storage.store(
      new Blob(["archive evidence"], { type: "text/plain" })
    );
    const assetId = await ctx.db.insert("buildCollaborationAssets", {
      brokerageId: foundation.brokerageId,
      buildId,
      contentHashSha256: "fixture-asset-sha256",
      createdAt: now,
      fileName: "foundation.txt",
      maximumAudienceMode: "build_wide",
      mimeType: "text/plain",
      organizationId: ORGANIZATION_ID,
      originatingPostId: sharedPostId,
      publishedAt: now,
      publishedOwnerKind: "postRevision",
      publishedOwnerRecordId: sharedRevisionId,
      readerWorkosUserIds: participants.map(([workosUserId]) => workosUserId),
      scanCompletedAt: now,
      scanState: "clean",
      sizeBytes: 16,
      state: "available",
      storageId,
      updatedAt: now,
      uploadedByWorkosUserId: "user_builder",
      version: 1,
    });
    await ctx.db.insert("buildCollaborationAttachments", {
      attachmentId: assetId,
      attachmentKind: "collaborationAsset",
      brokerageId: foundation.brokerageId,
      buildId,
      createdAt: now,
      createdByWorkosUserId: "user_builder",
      organizationId: ORGANIZATION_ID,
      ownerKind: "postRevision",
      ownerRecordId: sharedRevisionId,
    });
    return { actionItemId, assetId, buildId, sharedPostId };
  });
  return {
    admin,
    base,
    broker: withIdentity(base, "broker"),
    brokerStaff: withIdentity(base, "broker-staff"),
    builder: withIdentity(base, "builder"),
    builderStaff: withIdentity(base, "builder-staff"),
    contractor: withIdentity(base, "contractor"),
    homeowner: withIdentity(base, "homeowner"),
    principal: withIdentity(base, "principle-broker"),
    ...seeded,
  };
}

async function publishAsBuilder(
  fixture: Awaited<ReturnType<typeof seedLifecycleFixture>>,
  text: string
) {
  return await fixture.builder.mutation(
    (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
    {
      actionItems: [],
      audienceMode: "build_wide",
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      plainText: text,
      postType: "update",
      references: [],
      requestedReaderIds: [],
      tiptapJson: textDocument(text),
    }
  );
}

function textDocument(text: string) {
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
