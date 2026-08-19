/// <reference types="vite/client" />

import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_LEASE_MS } from "./build_collaboration_lifecycle_state";
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
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    vi.setSystemTime(BASE_TIME + 10);
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
    for (const [
      actor,
      expectedScope,
      visibleRestrictedText,
    ] of expectedBuildScopes) {
      const created = await actor.mutation(
        (api as any).build_collaboration_exports
          .requestBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          scope: "build",
        },
      );
      expect(created.scope).toBe(expectedScope);
      if (created.state === "building") {
        await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
      }
      const downloaded = await actor.mutation(
        (api as any).build_collaboration_exports
          .downloadBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        },
      );
      const exportText =
        expectedScope === "full_archive"
          ? await readArchiveText(fixture.base, created.exportId)
          : downloaded.manifestJson;
      expect(exportText).not.toContain("restricted_placeholder");
      if (visibleRestrictedText) {
        expect(exportText).toContain(visibleRestrictedText);
      } else {
        expect(exportText).not.toContain("Admin-only retained record");
      }
      expect(JSON.parse(downloaded.aclSnapshotJson)).toMatchObject({
        effectiveRole: expect.any(String),
        organizationId: ORGANIZATION_ID,
        viewerWorkosUserId: expect.any(String),
      });
    }

    for (const actor of [fixture.builderStaff, fixture.homeowner]) {
      const threadExport = await actor.mutation(
        (api as any).build_collaboration_exports
          .requestBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: fixture.sharedPostId,
          scope: "thread",
        },
      );
      expect(threadExport.scope).toBe("thread");
      await expect(
        actor.mutation(
          (api as any).build_collaboration_exports
            .requestBuildCollaborationExport,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            scope: "build",
          },
        ),
      ).rejects.toThrow("individual visible record");
    }

    const contractorAsset = await fixture.contractor.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        assetId: fixture.assetId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "asset",
      },
    );
    expect(contractorAsset.scope).toBe("asset");
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_exports
          .requestBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: fixture.sharedPostId,
          scope: "thread",
        },
      ),
    ).rejects.toThrow("Contractors may export only");

    const audits = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "buildCollaborationExport"),
        )
        .collect(),
    );
    expect(audits).toHaveLength(8);
    expect(
      audits.every((audit) => audit.organizationId === ORGANIZATION_ID),
    ).toBe(true);
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
      },
    );
    vi.setSystemTime(created.expiresAt + 1);
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_exports
          .downloadBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        },
      ),
    ).rejects.toThrow("expired");
  });

  test("creates a bounded full-archive shell before incrementally planning a near-limit Build", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      const template = await ctx.db.get(fixture.sharedPostId);
      if (!template) {
        throw new Error("Expected archive planning post template.");
      }
      const { _creationTime, _id, currentRevisionId, ...post } = template;
      for (let index = 0; index < 1990; index += 1) {
        await ctx.db.insert("buildCollaborationPosts", {
          ...post,
          createdAt: BASE_TIME - index - 1,
          updatedAt: BASE_TIME - index - 1,
        });
      }
    });

    const created = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    const shell = await fixture.base.run(async (ctx) => ({
      exportRow: await ctx.db.get(
        created.exportId as Id<"buildCollaborationExports">,
      ),
      planRecords: await ctx.db
        .query("buildCollaborationExportArchivePlanRecords")
        .withIndex("by_exportId_and_ordinal", (query) =>
          query.eq("exportId", created.exportId),
        )
        .collect(),
    }));
    expect(shell.exportRow).toMatchObject({
      archivePlanNextOrdinal: 0,
      archivePlanPhase: "posts",
      archivePlannedPostCount: 0,
      recordCount: 0,
      state: "building",
    });
    expect(JSON.parse(shell.exportRow!.manifestJson)).toMatchObject({
      planning: true,
      scope: "full_archive",
    });
    expect(shell.planRecords).toEqual([]);
  });

  test("snapshots the exact post entity and asset attachment ACL decisions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    // Use a subject that is not present in the seeded WorkOS projection so the
    // second identity below exercises a real server-derived role change.
    const archiveAdmin = withIdentity(
      fixture.base,
      "admin",
      "user_export_acl_admin",
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.sharedPostId, {
        primaryReferenceKind: "draw",
        primaryReferenceId: "draw-fixture",
        source: "system",
      });
      const asset = await ctx.db.get(fixture.assetId);
      if (!asset) {
        throw new Error("Expected export ACL asset fixture.");
      }
      await ctx.db.patch(asset._id, {
        readerWorkosUserIds: [
          ...(asset.readerWorkosUserIds ?? []),
          "user_export_acl_admin",
        ],
      });
    });
    const created = await archiveAdmin.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const downloaded = await archiveAdmin.mutation(
      (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        exportId: created.exportId,
        organizationId: ORGANIZATION_ID,
        token: created.token,
      },
    );
    const acl = JSON.parse(downloaded.aclSnapshotJson);
    expect(acl).toMatchObject({ decisionsInArchive: true });
    const archiveRecords = (await readArchiveText(
      fixture.base,
      created.exportId,
    ))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const postDecision = archiveRecords.find(
      (record) =>
        record.kind === "post" &&
        record.section === "core" &&
        record.aclDecision?.postId === fixture.sharedPostId,
    )?.aclDecision;
    expect(
      postDecision,
    ).toMatchObject({
      decision: "authorized",
      entityAclAuthorized: true,
      entityAclDecision: { basis: "role", role: "admin" },
      entityAclRequired: true,
    });
    const assetDecision = archiveRecords.find(
      (record) =>
        record.kind === "asset" &&
        record.aclDecision?.assetId === fixture.assetId,
    )?.aclDecision;
    expect(assetDecision).toMatchObject({
      basis: "published_reader_snapshot_and_attachment_acl",
      decision: "authorized",
      postId: fixture.sharedPostId,
      readerSnapshotIncludedViewer: true,
    });
    const demotedAdmin = withIdentity(
      fixture.base,
      "principle-broker",
      "user_export_acl_admin",
    );
    await expect(
      demotedAdmin.mutation(
        (api as any).build_collaboration_exports
          .authorizeBuildCollaborationExportArchiveChunkDownload,
        {
          buildId: fixture.buildId,
          chunkIndex: 0,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        },
      ),
    ).rejects.toThrow("access changed");
  });

  test("holds a renewable request-time snapshot fence and revokes the archive after later writes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const created = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    await expect(
      publishAsBuilder(fixture, "This write must wait for the snapshot fence."),
    ).rejects.toThrow("archive snapshot");
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(
      fixture.principal.mutation(
        (api as any).build_collaboration_exports
          .authorizeBuildCollaborationExportArchiveChunkDownload,
        {
          buildId: fixture.buildId,
          chunkIndex: 0,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        },
      ),
    ).resolves.toMatchObject({ content: expect.any(ArrayBuffer) });

    await publishAsBuilder(fixture, "This write invalidates the prior snapshot.");
    await expect(
      fixture.principal.mutation(
        (api as any).build_collaboration_exports
          .authorizeBuildCollaborationExportArchiveChunkDownload,
        {
          buildId: fixture.buildId,
          chunkIndex: 0,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        },
      ),
    ).rejects.toThrow("access changed");
  });

  test("snapshots the exact Builder Staff draw permission grant", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const permission = await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.sharedPostId, {
        audienceFloorTier: 2,
        primaryReferenceKind: "draw",
        primaryReferenceId: "draw-fixture",
        source: "system",
      });
      const linkId = await ctx.db.insert("builderAccountLinks", {
        brokerageId: fixture.brokerageId,
        builderProfileId: fixture.builderProfileId,
        createdAt: BASE_TIME,
        role: "staff",
        status: "active",
        updatedAt: BASE_TIME,
        workosUserId: "user_builder_staff",
      });
      const grantId = await ctx.db.insert("builderStaffPermissionGrants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        builderAccountLinkId: linkId,
        builderProfileId: fixture.builderProfileId,
        canCreate: false,
        canDelete: false,
        canUpdate: false,
        canView: true,
        createdAt: BASE_TIME,
        createdByWorkosUserId: "user_admin",
        organizationId: ORGANIZATION_ID,
        resourceType: "draw",
        scope: "activeBuild",
        updatedAt: BASE_TIME,
        updatedByWorkosUserId: "user_admin",
        workosUserId: "user_builder_staff",
      });
      return { grantId, linkId };
    });
    const created = await fixture.builderStaff.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.sharedPostId,
        scope: "thread",
      },
    );
    const downloaded = await fixture.builderStaff.mutation(
      (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        exportId: created.exportId,
        organizationId: ORGANIZATION_ID,
        token: created.token,
      },
    );
    const acl = JSON.parse(downloaded.aclSnapshotJson);
    expect(acl.postDecisions[0]).toMatchObject({
      entityAclAuthorized: true,
      entityAclDecision: {
        basis: "builder_staff_permission_grant",
        builderAccountLinkId: permission.linkId,
        permissionGrantId: permission.grantId,
      },
      entityAclRequired: true,
      postId: fixture.sharedPostId,
    });
  });

  test("omits draw revision history from an unauthorized archive while retaining eligible access", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.sharedPostId, {
        primaryReferenceKind: "draw",
        primaryReferenceId: "draw-fixture",
        source: "system",
        systemPostKind: "draw",
      });
    });

    // The principal-broker is Draw-authorized by role, but this fixture does
    // not enroll that identity in the internal coordination membership. The
    // archive must therefore retain the redacted core shell without exposing
    // revision bodies or revision history.
    const created = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const records = (await readArchiveText(fixture.base, created.exportId))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const revisions = records
      .filter(
        (record: any) =>
          record.kind === "post" &&
          record.section === "revisions" &&
          Array.isArray(record.data),
      )
      .flatMap((record: any) => record.data)
      .filter((entry: any) => entry.postId === fixture.sharedPostId);
    const core = records.find(
      (record: any) =>
        record.kind === "post" &&
        record.section === "core" &&
        record.data?.[0]?.postId === fixture.sharedPostId,
    );
    expect(revisions).toEqual([]);
    expect(core.data[0]).toMatchObject({
      postId: fixture.sharedPostId,
      redacted: true,
    });
    expect(JSON.stringify(records)).not.toContain("Foundation archive update");
    await expect(
      fixture.principal.query(
        (api as any).build_collaboration_editing
          .listBuildCollaborationPostRevisionHistory,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: fixture.sharedPostId,
        },
      ),
    ).rejects.toThrow("Forbidden");
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
      },
    );
    const downloaded = await fixture.brokerStaff.mutation(
      (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        exportId: created.exportId,
        organizationId: ORGANIZATION_ID,
        token: created.token,
      },
    );
    expect(downloaded.assets).toHaveLength(1);
    expect(downloaded.assets[0]?.url).toContain(
      "/api/build-collaboration/export-asset",
    );
    expect(downloaded.assets[0]?.url).not.toContain("/api/storage/");
    expect(
      JSON.parse(downloaded.aclSnapshotJson).assetDecisions[0],
    ).toMatchObject({
      assetId: fixture.assetId,
      basis: "published_reader_snapshot_and_attachment_acl",
      postId: fixture.sharedPostId,
    });

    const assetDownloadUrl = new URL(
      downloaded.assets[0]!.url,
      "https://some.convex.site",
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
      "http://localhost:3000",
    );
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("archive evidence", {
        headers: { "Content-Type": "text/plain" },
        status: 200,
      }),
    );
    const assetResponse = await fixture.brokerStaff.fetch(assetDownloadPath, {
      headers: {
        Authorization: "Bearer test-auth-token",
        Origin: "http://localhost:3000",
      },
    });
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3000",
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
      },
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
            .eq("workosUserId", "user_broker_staff"),
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
      "user_broker_staff",
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
        },
      ),
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
        },
      ),
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
        },
      ),
    ).rejects.toThrow("Admin or Principal Broker");
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
        {
          buildId: fixture.buildId,
          expectedRevision: 0,
          organizationId: ORGANIZATION_ID,
          reason: "Operational work is complete.",
        },
      ),
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
      },
    );
    await expect(
      publishAsBuilder(fixture, "Closed Builds reject shared writes."),
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
        },
      ),
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
        },
      ),
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
        },
      ),
    ).rejects.toThrow("closed and read-only");
    await expect(
      fixture.base.mutation(
        (internal as any).build_collaboration_system_events
          .publishBuildCollaborationSystemEvent,
        {
          buildId: fixture.buildId,
          idempotencyKey: `milestone-system:${fixture.buildId}:closed`,
          organizationId: ORGANIZATION_ID,
          plainText: "Closed system event.",
          postType: "update",
          systemLabel: "DrawFlow",
          systemPostKind: "milestone",
        },
      ),
    ).rejects.toThrow("closed and read-only");

    const archivedExport = await fixture.homeowner.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.sharedPostId,
        scope: "thread",
      },
    );
    expect(archivedExport.scope).toBe("thread");
    const searchResponse = await fixture.builder.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "foundation",
      },
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
        },
      ),
    ).rejects.toThrow("Admin or Principal Broker");
    await fixture.principal.mutation(
      (api as any).build_collaboration_lifecycle.reopenBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Additional governed coordination is required.",
      },
    );
    await expect(
      publishAsBuilder(fixture, "Reopened Builds accept shared writes."),
    ).resolves.toBeDefined();
    const history = await fixture.base.run((ctx) =>
      ctx.db
        .query("buildCollaborationBuildLifecycleEvents")
        .withIndex("by_buildId_and_createdAt", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .collect(),
    );
    expect(history.map((event) => event.eventType)).toEqual([
      "closed",
      "reopened",
    ]);
  });

  test("refuses closure until an active retention policy can be snapshotted", async () => {
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      const policies = await ctx.db
        .query("buildCollaborationRetentionPolicies")
        .withIndex("by_organizationId_and_state", (query) =>
          query.eq("organizationId", ORGANIZATION_ID).eq("state", "active"),
        )
        .collect();
      for (const policy of policies) {
        await ctx.db.delete(policy._id);
      }
    });
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
        {
          buildId: fixture.buildId,
          expectedRevision: 0,
          organizationId: ORGANIZATION_ID,
          reason: "Attempt closure without a durable retention contract.",
          waivers: [
            {
              actionItemId: fixture.actionItemId,
              reason: "Administrative archive exception.",
            },
          ],
        },
      ),
    ).rejects.toThrow("retention policy before closure");
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
      },
    );
    const pendingStorageId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected lifecycle Build fixture.");
      }
      const storageId = await ctx.storage.store(
        new Blob(["unfinalized upload"], { type: "text/plain" }),
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
      },
    );
    const closedState = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .unique(),
    );
    expect(closedState).toMatchObject({
      retentionEligibleAt: BASE_TIME + 30 * 86_400_000,
      retentionPolicyId: expect.any(String),
      retentionPolicyVersion: 2,
      state: "closed",
    });
    const holdId = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .placeBuildCollaborationLegalHold,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        reason: "Preserve records for pending legal review.",
        reference: "LEGAL-2026-001",
      },
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
        },
      ),
    ).rejects.toThrow("Legal hold blocks");
    expect(
      await fixture.base.run((ctx) => ctx.db.get(fixture.sharedPostId)),
    ).not.toBeNull();

    await fixture.principal.mutation(
      (api as any).build_collaboration_retention
        .releaseBuildCollaborationLegalHold,
      {
        buildId: fixture.buildId,
        holdId,
        organizationId: ORGANIZATION_ID,
        reason: "Counsel released the preservation requirement.",
      },
    );
    const purged = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        expectedLifecycleRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Execute expired retention policy.",
      },
    );
    expect(purged).toMatchObject({ complete: true });
    const retained = await fixture.base.run(async (ctx) => ({
      audit: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "buildCollaborationBuildState"),
        )
        .collect(),
      lifecycle: await ctx.db
        .query("buildCollaborationBuildLifecycleEvents")
        .withIndex("by_buildId_and_createdAt", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .collect(),
      post: await ctx.db.get(fixture.sharedPostId),
      pendingStorageUrl: await ctx.storage.getUrl(pendingStorageId),
      state: await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId),
        )
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

  test("retains legacy system document events without systemPostKind", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const documentPostId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected lifecycle Build fixture.");
      }
      const documentId = await ctx.db.insert("buildDocuments", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: BASE_TIME,
        documentType: "permit",
        fileName: "legacy-permit.pdf",
        mimeType: "application/pdf",
        organizationId: build.organizationId,
        proposalId: build.proposalId,
        sizeBytes: 1024,
        status: "uploaded",
        updatedAt: BASE_TIME,
        uploadedByWorkosUserId: "user_admin",
      });
      await ctx.db.insert("buildCollaborationPosts", {
        acknowledgementRequired: false,
        agentDrafted: false,
        announcementProminent: false,
        audienceFloorTier: 0,
        audienceMode: "build_wide",
        authorDisplayNameSnapshot: "DrawFlow Operations",
        authorRolesSnapshot: ["system"],
        brokerageId: build.brokerageId,
        buildId: build._id,
        commentCount: 0,
        contentState: "active",
        createdAt: BASE_TIME,
        lastMeaningfulActivityAt: BASE_TIME,
        openActionItemCount: 0,
        organizationId: build.organizationId,
        postType: "update",
        readRevision: 1,
        revision: 1,
        source: "system",
        systemEventKey: `operational:document:${documentId}:v1:added`,
        threadRevision: 0,
        threadState: "open",
        updatedAt: BASE_TIME,
      });
      const post = await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_systemEventKey", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq(
              "systemEventKey",
              `operational:document:${documentId}:v1:added`,
            ),
        )
        .unique();
      if (!post) {
        throw new Error("Expected legacy document System Post fixture.");
      }
      return post._id;
    });
    await closeLifecycleFixtureForRetention(fixture);
    vi.setSystemTime(BASE_TIME + 31 * 86_400_000);

    const purged = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        expectedLifecycleRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Preserve legacy system document events during purge.",
      },
    );
    expect(purged).toMatchObject({ complete: true, deletedPostCount: 2 });

    const retainedPost = await fixture.base.run((ctx) =>
      ctx.db.get(documentPostId),
    );
    expect(retainedPost).toMatchObject({ source: "system" });
    expect(retainedPost?.systemPostKind).toBeUndefined();
    expect(
      await fixture.base.run((ctx) => ctx.db.get(fixture.sharedPostId)),
    ).toBeNull();
    expect(
      await fixture.base.run((ctx) => ctx.db.get(fixture.secretPostId)),
    ).toBeNull();
  });

  test("excludes retention purge and full-archive capture in both race orderings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const archiveFirst = await seedLifecycleFixture();
    await closeLifecycleFixtureForRetention(archiveFirst);
    vi.setSystemTime(BASE_TIME + 31 * 86_400_000);

    const archive = await archiveFirst.principal.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: archiveFirst.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    await expect(
      archiveFirst.admin.mutation(
        (api as any).build_collaboration_retention
          .purgeExpiredBuildCollaborationContent,
        {
          buildId: archiveFirst.buildId,
          expectedLifecycleRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Purge must wait for the governed archive snapshot.",
        },
      ),
    ).rejects.toThrow("archive snapshot");
    await archiveFirst.base.finishAllScheduledFunctions(() =>
      vi.runAllTimers(),
    );
    expect(
      await archiveFirst.base.run(
        async (ctx) =>
          (
            await ctx.db.get(
              archive.exportId as Id<"buildCollaborationExports">,
            )
          )?.state,
      ),
    ).toBe("active");
    await expect(
      archiveFirst.admin.mutation(
        (api as any).build_collaboration_retention
          .purgeExpiredBuildCollaborationContent,
        {
          buildId: archiveFirst.buildId,
          expectedLifecycleRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Purge proceeds after the archive lease releases.",
        },
      ),
    ).resolves.toMatchObject({ complete: true });

    vi.setSystemTime(BASE_TIME);
    const purgeFirst = await seedLifecycleFixture();
    for (let index = 0; index < 12; index += 1) {
      await publishAsBuilder(purgeFirst, `Retention batch post ${index + 1}.`);
    }
    await closeLifecycleFixtureForRetention(purgeFirst);
    vi.setSystemTime(BASE_TIME + 31 * 86_400_000);
    await expect(
      purgeFirst.admin.mutation(
        (api as any).build_collaboration_retention
          .purgeExpiredBuildCollaborationContent,
        {
          buildId: purgeFirst.buildId,
          expectedLifecycleRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Start a bounded retention purge.",
        },
      ),
    ).resolves.toMatchObject({ complete: false });
    await expect(
      purgeFirst.principal.mutation(
        (api as any).build_collaboration_exports
          .requestBuildCollaborationExport,
        {
          buildId: purgeFirst.buildId,
          organizationId: ORGANIZATION_ID,
          scope: "build",
        },
      ),
    ).rejects.toThrow("retention purge is in progress");
    expect(
      await purgeFirst.base.run(async (ctx) =>
        ctx.db
          .query("buildCollaborationExports")
          .withIndex("by_buildId_and_createdAt", (query) =>
            query.eq("buildId", purgeFirst.buildId),
          )
          .collect(),
      ),
    ).toEqual([]);
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
          },
        );
        await ctx.db.patch(postId, { currentRevisionId: revisionId });
      }
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected bounded archive residue Build.");
      }
      const exportId = await ctx.db.insert("buildCollaborationExports", {
        accessCount: 0,
        aclSnapshotJson: "{}",
        brokerageId: build.brokerageId,
        buildId: fixture.buildId,
        createdAt: BASE_TIME,
        expiresAt: BASE_TIME + 60_000,
        manifestJson: "{}",
        organizationId: ORGANIZATION_ID,
        recordCount: 0,
        requestedByRole: "admin",
        requestedByWorkosUserId: "user_admin",
        scope: "full_archive",
        state: "active",
        tokenHash: "bounded-archive-residue",
      });
      for (let index = 0; index < 205; index += 1) {
        await ctx.db.insert("buildCollaborationExportArchiveChunks", {
          brokerageId: build.brokerageId,
          buildId: fixture.buildId,
          byteLength: 1,
          content: new Uint8Array([index % 255]).buffer,
          contentHashSha256: `bounded-${index}`,
          createdAt: BASE_TIME,
          exportId,
          organizationId: ORGANIZATION_ID,
          partIndex: 0,
          recordIndex: index,
          sequence: index,
          state: "stored",
          storedAt: BASE_TIME,
        });
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
      },
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
      },
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
      args,
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
          query.eq("buildId", fixture.buildId).eq("state", "in_progress"),
        )
        .unique(),
    );
    expect(progress).toMatchObject({ batchCount: 1, deletedPostCount: 10 });
    const progressAudits = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "buildCollaborationRetentionPurge"),
        )
        .collect(),
    );
    expect(progressAudits.map((event) => event.eventType)).toEqual([
      "build.collaboration.retention_purge.started",
      "build.collaboration.retention_purge.batch_completed",
    ]);

    const second = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      args,
    );
    expect(second).toMatchObject({
      complete: false,
      deletedPostCount: 12,
      hasRemainingPosts: false,
    });
    const third = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      args,
    );
    expect(third).toMatchObject({ complete: false, deletedPostCount: 12 });
    const completed = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      args,
    );
    expect(completed).toMatchObject({
      complete: true,
      deletedPostCount: 12,
      hasRemainingPosts: false,
    });
    const replay = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      args,
    );
    expect(replay).toEqual(completed);
  });

  test("skips more than 5,000 permanent System Posts while purging human content", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected retention overflow Build fixture.");
      }
      for (let index = 0; index < 5_001; index += 1) {
        const createdAt = BASE_TIME - 10_000 + index;
        await ctx.db.insert("buildCollaborationPosts", {
          acknowledgementRequired: false,
          agentDrafted: false,
          audienceFloorTier: 3,
          audienceMode: "build_wide",
          authorDisplayNameSnapshot: "DrawFlow System",
          authorRole: "admin",
          authorRolesSnapshot: ["admin"],
          brokerageId: build.brokerageId,
          buildId: fixture.buildId,
          commentCount: 0,
          contentState: "active",
          createdAt,
          lastMeaningfulActivityAt: createdAt,
          openActionItemCount: 0,
          organizationId: ORGANIZATION_ID,
          postType: "update",
          readRevision: 1,
          revision: 1,
          source: "system",
          systemEventKey: `retention-overflow:${index}`,
          systemPostKind: "milestone",
          threadRevision: 0,
          threadState: "open",
          updatedAt: createdAt,
        });
      }
    });
    await closeLifecycleFixtureForRetention(fixture);
    vi.setSystemTime(BASE_TIME + 31 * 86_400_000);

    const first = await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .purgeExpiredBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        expectedLifecycleRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Exercise cursor-based permanent System Post retention.",
      },
    );
    expect(first).toMatchObject({
      complete: true,
      deletedPostCount: 2,
      hasRemainingPosts: false,
    });
    const permanentPosts = await fixture.base.run((ctx) =>
      ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_source_and_createdAt", (query) =>
          query.eq("buildId", fixture.buildId).eq("source", "system"),
        )
        .collect(),
    );
    expect(permanentPosts).toHaveLength(5_001);
    expect(
      await fixture.base.run((ctx) => ctx.db.get(fixture.sharedPostId)),
    ).toBeNull();
    expect(
      await fixture.base.run((ctx) => ctx.db.get(fixture.secretPostId)),
    ).toBeNull();
  });

  test("exports immutable full-archive history instead of only current projections", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
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
      const revisionId = await ctx.db.insert(
        "buildCollaborationPostRevisions",
        {
          ...revisionFields,
          contentHash: "full-archive-revision-2",
          createdAt: current.createdAt + 1,
          plainText: "Immutable second revision.",
          revision: 2,
          tiptapJson: textDocument("Immutable second revision."),
        },
      );
      await ctx.db.patch(post._id, {
        currentRevisionId: revisionId,
        revision: 2,
      });
      for (const workosUserId of ["user_principle_broker", "user_broker"]) {
        await ctx.db.insert("buildCollaborationFollows", {
          active: true,
          brokerageId: post.brokerageId,
          buildId: post.buildId,
          createdAt: BASE_TIME,
          organizationId: post.organizationId,
          postId: post._id,
          reason: "manual",
          updatedAt: BASE_TIME,
          workosUserId,
        });
        await ctx.db.insert("buildCollaborationPins", {
          brokerageId: post.brokerageId,
          buildId: post.buildId,
          createdAt: BASE_TIME,
          kind: "personal",
          organizationId: post.organizationId,
          postId: post._id,
          workosUserId,
        });
      }
      const replyId = await ctx.db.insert("buildCollaborationComments", {
        authorDisplayNameSnapshot: "Broker",
        authorRole: "broker",
        authorWorkosUserId: "user_broker",
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        contentState: "active",
        createdAt: BASE_TIME,
        logicalDepth: 0,
        organizationId: post.organizationId,
        postId: post._id,
        revision: 1,
        updatedAt: BASE_TIME,
      });
      await ctx.db.insert("buildCollaborationPins", {
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        createdAt: BASE_TIME,
        kind: "build",
        organizationId: post.organizationId,
        postId: post._id,
        workosUserId: "user_broker",
      });
      await ctx.db.insert("buildCollaborationPins", {
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        commentId: replyId,
        createdAt: BASE_TIME,
        kind: "reply",
        organizationId: post.organizationId,
        postId: post._id,
        workosUserId: "user_broker",
      });
      for (const [workosUserId, viewerRole] of [
        ["user_admin", "admin"],
        ["user_principle_broker", "principle-broker"],
        ["user_broker", "broker"],
      ] as const) {
        await ctx.db.insert("buildCollaborationReceipts", {
          brokerageId: post.brokerageId,
          buildId: post.buildId,
          firstViewedAt: BASE_TIME,
          lastViewedAt: BASE_TIME,
          latestRevisionViewed: 2,
          organizationId: post.organizationId,
          postId: post._id,
          viewerRole,
          workosUserId,
        });
      }
      await ctx.db.insert("buildActionItemChecklistItems", {
        actionItemId: fixture.actionItemId,
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        completed: true,
        completedAt: BASE_TIME,
        completedByWorkosUserId: "user_builder",
        createdAt: BASE_TIME,
        label: "Mutable completion state is not archive history.",
        order: 0,
        organizationId: post.organizationId,
        required: true,
        updatedAt: BASE_TIME,
      });
      const postModerationCaseId = await ctx.db.insert(
        "buildCollaborationModerationCases",
        {
        appealReviewerMinimumTier: 4,
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        contentAuthorRole: post.authorRole ?? "builder",
        contentAuthorWorkosUserId: post.authorWorkosUserId ?? "user_builder",
        createdAt: BASE_TIME,
        currentReason: "Preserve the permission-filtered evidence snapshot.",
        entityId: post._id,
        entityKind: "post",
        evidenceSnapshotJson: JSON.stringify({
          attachmentIds: [],
          receiptSnapshots: [
            {
              buildId: post.buildId,
              displayNameSnapshot: "admin-secret-receipt",
              firstViewedAt: BASE_TIME,
              lastViewedAt: BASE_TIME,
              organizationId: post.organizationId,
              postId: post._id,
              viewerRole: "admin",
              workosUserId: "user_admin",
            },
            {
              buildId: post.buildId,
              displayNameSnapshot: "broker-visible-receipt",
              firstViewedAt: BASE_TIME,
              lastViewedAt: BASE_TIME,
              organizationId: post.organizationId,
              postId: post._id,
              viewerRole: "broker",
              workosUserId: "user_broker",
            },
          ],
          referenceIds: [],
        }),
        moderatorRole: "principle-broker",
        moderatorTier: 4,
        moderatorWorkosUserId: "user_principle_broker",
        organizationId: post.organizationId,
        postId: post._id,
        status: "moderated",
          updatedAt: BASE_TIME,
        },
      );
      const commentModerationCaseId = await ctx.db.insert(
        "buildCollaborationModerationCases",
        {
          appealReviewerMinimumTier: 4,
          brokerageId: post.brokerageId,
          buildId: post.buildId,
          contentAuthorRole: "broker",
          contentAuthorWorkosUserId: "user_broker",
          createdAt: BASE_TIME + 1,
          currentReason: "Preserve comment moderation history.",
          entityId: replyId,
          entityKind: "comment",
          evidenceSnapshotJson: JSON.stringify({
            attachmentIds: [],
            receiptSnapshots: [],
            referenceIds: [],
          }),
          moderatorRole: "principle-broker",
          moderatorTier: 4,
          moderatorWorkosUserId: "user_principle_broker",
          organizationId: post.organizationId,
          postId: post._id,
          status: "moderated",
          updatedAt: BASE_TIME + 1,
        },
      );
      for (const [caseId, entityKind] of [
        [postModerationCaseId, "post"],
        [commentModerationCaseId, "comment"],
      ] as const) {
        await ctx.db.insert("buildCollaborationModerationEvents", {
          actorRole: "principle-broker",
          actorWorkosUserId: "user_principle_broker",
          brokerageId: post.brokerageId,
          buildId: post.buildId,
          caseId,
          createdAt: BASE_TIME + 2,
          eventType: "moderated",
          newState: JSON.stringify({ entityKind, status: "moderated" }),
          organizationId: post.organizationId,
          priorState: JSON.stringify({ entityKind, status: "active" }),
          reason: `Moderate ${entityKind} fixture.`,
        });
      }
    });
    vi.setSystemTime(BASE_TIME + 10);
    const created = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    expect(created.state).toBe("building");
    await expect(
      fixture.principal.mutation(
        (api as any).build_collaboration_exports
          .downloadBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        },
      ),
    ).rejects.toThrow("still generating");
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const completedExport = await fixture.base.run((ctx) =>
      ctx.db.get(created.exportId as Id<"buildCollaborationExports">),
    );
    expect(completedExport?.state).toBe("active");
    expect(completedExport?.archiveFailure).toBeUndefined();
    const downloaded = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        exportId: created.exportId,
        organizationId: ORGANIZATION_ID,
        token: created.token,
      },
    );
    const manifest = JSON.parse(downloaded.manifestJson);
    expect(JSON.stringify(manifest).length).toBeLessThan(100_000);
    expect(manifest.archive).toEqual(
      expect.objectContaining({
        chunkCount: expect.any(Number),
        chunkUrlTemplate: expect.stringContaining("%7BchunkIndex%7D"),
        format: "application/x-ndjson",
        schemaVersion: 1,
      }),
    );
    const firstChunk = await fixture.base.run(async (ctx) => {
      const chunk = await ctx.db
        .query("buildCollaborationExportArchiveChunks")
        .withIndex("by_exportId_and_sequence", (query) =>
          query.eq("exportId", created.exportId).eq("sequence", 0),
        )
        .unique();
      if (!chunk?.content) {
        throw new Error("Expected first archive chunk.");
      }
      return {
        hash: chunk.contentHashSha256,
        text: new TextDecoder().decode(chunk.content),
      };
    });
    const chunkDownloadUrl = new URL(
      manifest.archive.chunkUrlTemplate.replace("%7BchunkIndex%7D", "0"),
      "https://some.convex.site",
    );
    const chunkDownloadPath = `${chunkDownloadUrl.pathname}${chunkDownloadUrl.search}`;
    const chunkPreflight = await fixture.base.fetch(chunkDownloadPath, {
      headers: {
        "Access-Control-Request-Headers": "Authorization",
        "Access-Control-Request-Method": "GET",
        Origin: "http://localhost:3000",
      },
      method: "OPTIONS",
    });
    expect(chunkPreflight.status).toBe(204);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(firstChunk.text, { status: 200 }),
    );
    const chunkResponse = await fixture.principal.fetch(chunkDownloadPath, {
      headers: {
        Authorization: "Bearer test-auth-token",
        Origin: "http://localhost:3000",
      },
    });
    expect(chunkResponse.status).toBe(200);
    expect(chunkResponse.headers.get("X-Content-SHA256")).toBe(firstChunk.hash);
    expect(await chunkResponse.text()).toBe(firstChunk.text);
    const archiveRecords = await fixture.base.run(async (ctx) => {
      const chunks = await ctx.db
        .query("buildCollaborationExportArchiveChunks")
        .withIndex("by_exportId_and_sequence", (query) =>
          query.eq("exportId", created.exportId),
        )
        .collect();
      let ndjson = "";
      for (const chunk of chunks.sort((a, b) => a.sequence - b.sequence)) {
        if (!chunk.content) {
          throw new Error("Expected persisted archive chunk content.");
        }
        ndjson += new TextDecoder().decode(chunk.content);
      }
      return ndjson
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    });
    const sectionRows = (section: string) =>
      archiveRecords
        .filter(
          (entry: any) =>
            entry.kind === "post" &&
            entry.section === section &&
            Array.isArray(entry.data),
        )
        .flatMap((entry: any) => entry.data);
    const revisions = sectionRows("revisions");
    const follows = sectionRows("follows");
    const pins = sectionRows("pins");
    const receipts = sectionRows("receipts");
    const checklistItems = sectionRows("action_item_checklist");
    const moderation = sectionRows("moderation");
    const moderationEvents = sectionRows("moderation_events");
    const actionItems = sectionRows("action_items");
    expect(revisions.map((entry: any) => entry.revision)).toEqual([1, 2]);
    expect(follows.map((entry: any) => entry.workosUserId)).toEqual([
      "user_principle_broker",
    ]);
    expect(pins.map((entry: any) => [entry.kind, entry.workosUserId])).toEqual([
      ["personal", "user_principle_broker"],
      ["build", "user_broker"],
      ["reply", "user_broker"],
    ]);
    expect(receipts.map((entry: any) => entry.workosUserId)).toEqual([
      "user_broker",
    ]);
    for (const field of [
      "lastViewedAt",
      "latestRevisionViewed",
      "updatedAt",
      "viewerRole",
      "viewCount",
    ]) {
      expect(receipts[0]).not.toHaveProperty(field);
    }
    expect(checklistItems).toHaveLength(1);
    expect(checklistItems[0]).toMatchObject({
      actionItemId: fixture.actionItemId,
      row: {
        label: "Mutable completion state is not archive history.",
        order: 0,
        required: true,
      },
    });
    for (const field of [
      "completed",
      "completedAt",
      "completedByWorkosUserId",
      "updatedAt",
    ]) {
      expect(checklistItems[0].row).not.toHaveProperty(field);
    }
    const moderationSnapshot = JSON.parse(
      moderation[0].evidenceSnapshotJson,
    );
    expect(
      moderationSnapshot.receiptSnapshots.map(
        (entry: any) => entry.displayNameSnapshot,
      ),
    ).toEqual(["broker-visible-receipt"]);
    expect(moderation.map((entry: any) => entry.entityKind)).toEqual([
      "post",
      "comment",
    ]);
    expect(
      moderationEvents.map((entry: any) => entry.row.eventType),
    ).toEqual(["moderated", "moderated"]);
    expect(actionItems[0]).toEqual(
      expect.objectContaining({
        actionItemId: expect.any(String),
        snapshot: expect.objectContaining({ title: "Final archive task" }),
      }),
    );
    for (const section of [
      "action_item_attachments",
      "action_item_checklist",
      "action_item_comments",
      "action_item_events",
      "action_item_labels",
      "action_item_post_links",
      "action_item_references",
      "action_item_relations_incoming",
      "action_item_relations_outgoing",
      "action_item_revisions",
    ]) {
      expect(sectionRows(section)).toEqual(expect.any(Array));
    }
    for (const section of [
      "acknowledgements",
      "acknowledgement_events",
      "moderation",
      "moderation_events",
      "post_revision_attachments",
      "post_revision_audience_snapshots",
      "post_revision_references",
      "comment_revision_attachments",
      "comment_revision_references",
      "receipts",
      "references",
      "thread_events",
    ]) {
      expect(sectionRows(section)).toEqual(expect.any(Array));
    }
    expect(
      archiveRecords.some(
        (entry: any) =>
          entry.kind === "build_history" &&
          entry.section === "closure_waivers" &&
          Array.isArray(entry.data),
      ),
    ).toBe(true);
    expect(
      archiveRecords.some(
        (entry: any) =>
          entry.kind === "build_history" &&
          entry.section === "lifecycle_events" &&
          Array.isArray(entry.data),
      ),
    ).toBe(true);
  });

  test("paginates large thread bodies before serialization and cleans expired archive blobs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const largeText = "x".repeat(120_000);
    await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(fixture.sharedPostId);
      if (!post) {
        throw new Error("Expected large archive post fixture.");
      }
      for (let index = 0; index < 12; index += 1) {
        const commentId = await ctx.db.insert("buildCollaborationComments", {
          authorDisplayNameSnapshot: "Builder",
          authorRole: "builder",
          authorWorkosUserId: "user_builder",
          brokerageId: post.brokerageId,
          buildId: post.buildId,
          contentState: "active",
          createdAt: BASE_TIME + index,
          logicalDepth: 0,
          organizationId: post.organizationId,
          postId: post._id,
          revision: 1,
          updatedAt: BASE_TIME + index,
        });
        const revisionId = await ctx.db.insert(
          "buildCollaborationCommentRevisions",
          {
            authorRole: "builder",
            authorWorkosUserId: "user_builder",
            brokerageId: post.brokerageId,
            buildId: post.buildId,
            commentId,
            contentHash: `large-comment-${index}`,
            createdAt: BASE_TIME + index,
            organizationId: post.organizationId,
            plainText: largeText,
            postId: post._id,
            revision: 1,
            tiptapJson: textDocument(largeText),
          },
        );
        await ctx.db.patch(commentId, { currentRevisionId: revisionId });
      }
      const actionItem = await ctx.db
        .query("buildActionItems")
        .withIndex("by_originatingPostId_and_createdAt", (query) =>
          query.eq("originatingPostId", post._id),
        )
        .first();
      if (!actionItem) {
        throw new Error("Expected large archive Action Item fixture.");
      }
      for (let index = 0; index < 12; index += 1) {
        await ctx.db.insert("buildActionItemComments", {
          actionItemId: actionItem._id,
          authorDisplayNameSnapshot: "Builder",
          authorRole: "builder",
          authorWorkosUserId: "user_builder",
          brokerageId: post.brokerageId,
          buildId: post.buildId,
          createdAt: BASE_TIME + index,
          organizationId: post.organizationId,
          plainText: largeText,
          tiptapJson: textDocument(largeText),
        });
      }
    });
    vi.setSystemTime(BASE_TIME + 20);
    const created = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const downloaded = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.downloadBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        exportId: created.exportId,
        organizationId: ORGANIZATION_ID,
        token: created.token,
      },
    );
    const archiveText = await readArchiveText(fixture.base, created.exportId);
    const commentRevisionPages = archiveText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter(
        (record) =>
          record.kind === "post" && record.section === "comment_revisions",
      );
    expect(commentRevisionPages).toHaveLength(6);
    expect(
      commentRevisionPages.every((record) => record.data.length <= 2),
    ).toBe(true);
    expect(
      commentRevisionPages.reduce(
        (count, record) => count + record.data.length,
        0,
      ),
    ).toBe(12);
    const actionItemCommentPages = archiveText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter(
        (record) =>
          record.kind === "post" &&
          record.section === "action_item_comments" &&
          record.data.length > 0,
      );
    expect(actionItemCommentPages).toHaveLength(6);
    expect(
      actionItemCommentPages.every((record) => record.data.length <= 2),
    ).toBe(true);
    expect(
      actionItemCommentPages.reduce(
        (count, record) => count + record.data.length,
        0,
      ),
    ).toBe(12);
    expect(downloaded.manifestJson.length).toBeLessThan(100_000);

    const beforeCleanup = await fixture.base.run(async (ctx) => {
      const row = await ctx.db.get(
        created.exportId as Id<"buildCollaborationExports">,
      );
      const chunk = await ctx.db
        .query("buildCollaborationExportArchiveChunks")
        .withIndex("by_exportId_and_sequence", (query) =>
          query.eq("exportId", created.exportId),
        )
        .first();
      return { content: chunk?.content, expiresAt: row?.expiresAt };
    });
    if (!(beforeCleanup.expiresAt && beforeCleanup.content)) {
      throw new Error("Expected generated archive cleanup fixture.");
    }
    vi.setSystemTime(beforeCleanup.expiresAt + 1);
    await fixture.base.mutation(
      (internal as any).build_collaboration_export_archive
        .cleanupExpiredBuildCollaborationExportArchives,
      {},
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const cleaned = await fixture.base.run(async (ctx) => ({
      chunks: await ctx.db
        .query("buildCollaborationExportArchiveChunks")
        .withIndex("by_exportId_and_sequence", (query) =>
          query.eq("exportId", created.exportId),
        )
        .collect(),
      planPosts: await ctx.db
        .query("buildCollaborationExportArchivePlanPosts")
        .withIndex("by_exportId_and_postId", (query) =>
          query.eq("exportId", created.exportId),
        )
        .collect(),
      planRecords: await ctx.db
        .query("buildCollaborationExportArchivePlanRecords")
        .withIndex("by_exportId_and_ordinal", (query) =>
          query.eq("exportId", created.exportId),
        )
        .collect(),
      row: await ctx.db.get(
        created.exportId as Id<"buildCollaborationExports">,
      ),
    }));
    expect(cleaned.chunks).toEqual([]);
    expect(cleaned.planPosts).toEqual([]);
    expect(cleaned.planRecords).toEqual([]);
    expect(cleaned.row?.state).toBe("expired");
  });

  test("keeps healthy archive builders past their original expiry and cleans only an abandoned lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const exportId = await fixture.base.run(async (ctx) => {
      const exportId = await ctx.db.insert("buildCollaborationExports", {
        accessCount: 0,
        aclSnapshotJson: "{}",
        archiveContentRevision: 0,
        archiveHeartbeatAt: BASE_TIME,
        archivePlanNextOrdinal: 0,
        archivePlanPhase: "posts",
        archivePlannedAssetCount: 0,
        archivePlannedPostCount: 0,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: BASE_TIME - BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_LEASE_MS,
        expiresAt: BASE_TIME - 1,
        manifestJson: "{}",
        organizationId: ORGANIZATION_ID,
        recordCount: 0,
        requestedByRole: "principle-broker",
        requestedByWorkosUserId: "user_principle_broker",
        scope: "full_archive",
        state: "building",
        tokenHash: "healthy-building-archive",
      });
      const existingState = await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .unique();
      if (existingState) {
        await ctx.db.patch(existingState._id, {
          archiveSnapshotExportId: exportId,
          archiveSnapshotLeaseExpiresAt:
            BASE_TIME + BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_LEASE_MS,
          archiveSnapshotStartedAt: BASE_TIME,
        });
      } else {
        await ctx.db.insert("buildCollaborationBuildStates", {
          archiveSnapshotExportId: exportId,
          archiveSnapshotLeaseExpiresAt:
            BASE_TIME + BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_LEASE_MS,
          archiveSnapshotStartedAt: BASE_TIME,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          contentRevision: 0,
          createdAt: BASE_TIME,
          organizationId: ORGANIZATION_ID,
          revision: 0,
          state: "open",
          updatedAt: BASE_TIME,
        });
      }
      return exportId;
    });

    const cleanupsWhileHealthy = await fixture.base.mutation(
      (internal as any).build_collaboration_export_archive
        .cleanupExpiredBuildCollaborationExportArchives,
      {},
    );
    expect(cleanupsWhileHealthy).toBe(0);
    expect(
      await fixture.base.run(async (ctx) => (await ctx.db.get(exportId))?.state),
    ).toBe("building");

    vi.setSystemTime(
      BASE_TIME + BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_LEASE_MS + 1,
    );
    const abandonedCleanups = await fixture.base.mutation(
      (internal as any).build_collaboration_export_archive
        .cleanupExpiredBuildCollaborationExportArchives,
      {},
    );
    expect(abandonedCleanups).toBe(1);
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const cleaned = await fixture.base.run(async (ctx) => ({
      exportRow: await ctx.db.get(exportId),
      lifecycle: await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .unique(),
    }));
    expect(cleaned.exportRow).toMatchObject({
      archiveFailure: "Archive generation lease expired before completion.",
      state: "cleanup_complete",
    });
    expect(cleaned.lifecycle?.archiveSnapshotExportId).toBeUndefined();
    expect(cleaned.lifecycle?.archiveSnapshotLeaseExpiresAt).toBeUndefined();
  });

  test("marks failed archive cleanup terminal so later failures cannot starve", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected failed cleanup Build.");
      }
      for (let index = 0; index < 25; index += 1) {
        await ctx.db.insert("buildCollaborationExports", {
          accessCount: 0,
          aclSnapshotJson: "{}",
          archiveFailure: "fixture failure",
          brokerageId: build.brokerageId,
          buildId: fixture.buildId,
          createdAt: BASE_TIME + index,
          expiresAt: BASE_TIME + 60_000,
          manifestJson: "{}",
          organizationId: ORGANIZATION_ID,
          recordCount: 0,
          requestedByRole: "principle-broker",
          requestedByWorkosUserId: "user_principle_broker",
          scope: "full_archive",
          state: "failed",
          tokenHash: `failed-cleanup-${index}`,
        });
      }
    });
    const cleanup = () =>
      fixture.base.mutation(
        (internal as any).build_collaboration_export_archive
          .cleanupExpiredBuildCollaborationExportArchives,
        {},
      );
    await cleanup();
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const firstPass = await fixture.base.run(async (ctx) => ({
      failed: (
        await ctx.db
          .query("buildCollaborationExports")
          .withIndex("by_state_and_expiresAt", (query) =>
            query.eq("state", "failed"),
          )
          .collect()
      ).length,
      terminal: (
        await ctx.db
          .query("buildCollaborationExports")
          .withIndex("by_state_and_expiresAt", (query) =>
            query.eq("state", "cleanup_complete"),
          )
          .collect()
      ).length,
    }));
    expect(firstPass).toEqual({ failed: 5, terminal: 20 });
    await cleanup();
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const terminalCount = await fixture.base.run(async (ctx) =>
      (
        await ctx.db
          .query("buildCollaborationExports")
          .withIndex("by_state_and_expiresAt", (query) =>
            query.eq("state", "cleanup_complete"),
          )
          .collect()
      ).length,
    );
    expect(terminalCount).toBe(25);
  });

  test("freezes archive revisions and core projection at request time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME + 10);
    const fixture = await seedLifecycleFixture();
    const created = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    vi.setSystemTime(BASE_TIME + 20);
    await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(fixture.sharedPostId);
      if (!post?.currentRevisionId) {
        throw new Error("Expected request-time post revision.");
      }
      const current = await ctx.db.get(post.currentRevisionId);
      if (!current) {
        throw new Error("Expected request-time revision row.");
      }
      const revisionId = await ctx.db.insert(
        "buildCollaborationPostRevisions",
        {
          authorRole: "builder",
          authorWorkosUserId: "user_builder",
          brokerageId: current.brokerageId,
          buildId: current.buildId,
          contentHash: "after-export-request",
          createdAt: BASE_TIME + 20,
          organizationId: current.organizationId,
          plainText: "This edit happened after the export request.",
          postId: current.postId,
          revision: 2,
          tiptapJson: textDocument(
            "This edit happened after the export request.",
          ),
        },
      );
      await ctx.db.patch(post._id, {
        currentRevisionId: revisionId,
        revision: 2,
        updatedAt: BASE_TIME + 20,
      });
    });
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const records = (await readArchiveText(fixture.base, created.exportId))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const core = records.find(
      (record) =>
        record.kind === "post" &&
        record.section === "core" &&
        record.data[0]?.postId === fixture.sharedPostId,
    );
    const revisionRows = records
      .filter(
        (record) =>
          record.kind === "post" &&
          record.section === "revisions" &&
          Array.isArray(record.data),
      )
      .flatMap((record) => record.data)
      .filter((entry) => entry.postId === fixture.sharedPostId);
    expect(core.data[0]).toMatchObject({
      currentRevisionId: expect.any(String),
      revision: 1,
    });
    expect(revisionRows.map((entry) => entry.revision)).toEqual([1]);
  });

  test("claims archive chunks before storage and replays completed claims idempotently", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME + 10);
    const fixture = await seedLifecycleFixture();
    const created = await fixture.principal.mutation(
      (api as any).build_collaboration_exports.requestBuildCollaborationExport,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        scope: "build",
      },
    );
    const reserve = (claimToken: string) =>
      fixture.base.mutation(
        (internal as any).build_collaboration_export_archive
          .reserveBuildCollaborationArchiveChunk,
        {
          byteLength: 7,
          claimToken,
          contentHashSha256: "fixture-hash",
          exportId: created.exportId,
          partIndex: 0,
          recordIndex: 999,
          sequence: 999,
        },
      );
    await expect(reserve("claim-a")).resolves.toEqual({ state: "owned" });
    await expect(reserve("claim-b")).resolves.toEqual({ state: "busy" });
    const content = new TextEncoder().encode("archive").buffer;
    await expect(
      fixture.base.mutation(
        (internal as any).build_collaboration_export_archive
          .completeBuildCollaborationArchiveChunk,
        {
          claimToken: "claim-a",
          content,
          exportId: created.exportId,
          sequence: 999,
        },
      ),
    ).resolves.toEqual({ accepted: true });
    await expect(reserve("claim-b")).resolves.toEqual({ state: "stored" });
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
      },
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
      },
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
      },
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
        },
      ),
    ).rejects.toThrow("not yet eligible");
    expect(
      await fixture.base.run(async (ctx) =>
        ctx.db
          .query("buildCollaborationBuildStates")
          .withIndex("by_buildId", (query) =>
            query.eq("buildId", fixture.buildId),
          )
          .unique(),
      ),
    ).toMatchObject({
      retentionEligibleAt: BASE_TIME + 3650 * 86_400_000,
      retentionPolicyVersion: 2,
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
      },
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
      },
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
      },
    );
    const residue = await fixture.base.run(async (ctx) => ({
      activity: await ctx.db
        .query("buildCollaborationActivityProjections")
        .withIndex("by_buildId_and_projectionKey", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .collect(),
      requests: await ctx.db
        .query("buildActionItemCreationRequests")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .collect(),
      state: await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .unique(),
    }));
    expect(residue.activity).toEqual([]);
    expect(residue.requests).toEqual([]);
    expect(residue.state).toMatchObject({ state: "purged" });
  });

  test("refuses to reopen after a destructive retention purge has started", async () => {
    const fixture = await seedLifecycleFixture();
    await closeLifecycleFixture(fixture, "Close before destructive purge.");
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      const lifecycle = await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .unique();
      if (!(build && lifecycle?.retentionPolicyId)) {
        throw new Error("Expected closed lifecycle purge fixture.");
      }
      await ctx.db.insert("buildCollaborationRetentionPurges", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        deletedAssetCount: 1,
        deletedPostCount: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Partial destructive batch already committed.",
        requestedByRole: "admin",
        requestedByWorkosUserId: "user_admin",
        retainedAuditEventCount: 1,
        retentionPolicyId: lifecycle.retentionPolicyId,
        startedAt: Date.now(),
        state: "in_progress",
        updatedAt: Date.now(),
      });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_lifecycle.reopenBuildCollaboration,
        {
          buildId: fixture.buildId,
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Attempt reopening after destructive work began.",
        },
      ),
    ).rejects.toThrow("purge is in progress");
  });

  test("keeps asset scan and staging maintenance read-only after Build closure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const maintenance = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      const sourceAsset = await ctx.db.get(fixture.assetId);
      if (!(build && sourceAsset)) {
        throw new Error("Expected asset maintenance fixture.");
      }
      const pendingStorageId = await ctx.storage.store(
        new Blob(["pending-private-upload"], { type: "text/plain" }),
      );
      const pendingSessionId = await ctx.db.insert(
        "buildCollaborationAssetStagingSessions",
        {
          brokerageId: build.brokerageId,
          buildId: build._id,
          contextKind: "composer",
          createdAt: BASE_TIME - 10,
          expiresAt: BASE_TIME - 1,
          organizationId: ORGANIZATION_ID,
          ownerWorkosUserId: "user_builder",
          pendingStorageId,
          state: "open",
          updatedAt: BASE_TIME - 10,
        },
      );
      const scanStorageId = await ctx.storage.store(
        new Blob(["quarantined-private-upload"], { type: "text/plain" }),
      );
      const scanSessionId = await ctx.db.insert(
        "buildCollaborationAssetStagingSessions",
        {
          brokerageId: build.brokerageId,
          buildId: build._id,
          contextKind: "composer",
          createdAt: BASE_TIME - 10,
          expiresAt: BASE_TIME + 86_400_000,
          organizationId: ORGANIZATION_ID,
          ownerWorkosUserId: "user_builder",
          state: "finalized",
          updatedAt: BASE_TIME - 10,
        },
      );
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...assetFields
      } = sourceAsset;
      const scanAssetId = await ctx.db.insert("buildCollaborationAssets", {
        ...assetFields,
        contentHashSha256: "closed-scan-hash",
        createdAt: BASE_TIME - 10,
        fileName: "closed-scan.txt",
        originatingPostId: undefined,
        publishedAt: undefined,
        publishedOwnerKind: undefined,
        publishedOwnerRecordId: undefined,
        readerWorkosUserIds: undefined,
        scanCompletedAt: undefined,
        scanState: "pending",
        stagingSessionId: scanSessionId,
        state: "quarantined",
        storageId: scanStorageId,
        updatedAt: BASE_TIME - 10,
      });
      await ctx.db.patch(scanSessionId, { assetId: scanAssetId });
      return {
        pendingSessionId,
        pendingStorageId,
        scanAssetId,
        scanSessionId,
        scanStorageId,
      };
    });
    await closeLifecycleFixture(fixture, "Freeze asset maintenance state.");
    expect(
      await fixture.base.query(
        (internal as any).build_collaboration_asset_maintenance
          .getBuildCollaborationAssetScanInput,
        { assetId: maintenance.scanAssetId },
      ),
    ).toBeNull();
    await fixture.base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId: maintenance.scanAssetId,
        computedHashSha256: "closed-scan-hash",
        outcome: "clean",
        provider: "test-scanner",
      },
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .expireBuildCollaborationAssetStagingSession,
      { stagingSessionId: maintenance.pendingSessionId },
    );
    const frozen = await fixture.base.run(async (ctx) => ({
      pendingSession: await ctx.db.get(maintenance.pendingSessionId),
      pendingStorageExists: Boolean(
        await ctx.storage.get(maintenance.pendingStorageId),
      ),
      scanAsset: await ctx.db.get(maintenance.scanAssetId),
      scanSession: await ctx.db.get(maintenance.scanSessionId),
      scanStorageExists: Boolean(
        await ctx.storage.get(maintenance.scanStorageId),
      ),
    }));
    expect(frozen.pendingSession?.state).toBe("open");
    expect(frozen.pendingStorageExists).toBe(true);
    expect(frozen.scanAsset).toMatchObject({
      scanState: "pending",
      state: "quarantined",
    });
    expect(frozen.scanSession?.state).toBe("finalized");
    expect(frozen.scanStorageExists).toBe(true);
  });

  test("snapshots the exact private asset authorization path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedLifecycleFixture();
    const privateAssets = await fixture.base.run(async (ctx) => {
      const sourceAsset = await ctx.db.get(fixture.assetId);
      if (!sourceAsset) {
        throw new Error("Expected source asset fixture.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...assetFields
      } = sourceAsset;
      const draftId = await ctx.db.insert("buildCollaborationDrafts", {
        approvalOwnerWorkosUserId: "user_builder",
        brokerageId: sourceAsset.brokerageId,
        buildId: sourceAsset.buildId,
        bundleHash: "private-approval-draft",
        bundleJson: "{}",
        createdAt: BASE_TIME,
        organizationId: ORGANIZATION_ID,
        ownerWorkosUserId: "user_broker",
        revision: 1,
        state: "active",
        updatedAt: BASE_TIME,
      });
      const makePrivateAsset = async (
        contextKind: "composer" | "draft",
        ownerWorkosUserId: string,
        contextRecordId?: string,
      ) => {
        const storageId = await ctx.storage.store(
          new Blob([`${contextKind}-private`], { type: "text/plain" }),
        );
        const sessionId = await ctx.db.insert(
          "buildCollaborationAssetStagingSessions",
          {
            brokerageId: sourceAsset.brokerageId,
            buildId: sourceAsset.buildId,
            contextKind,
            contextRecordId,
            createdAt: BASE_TIME,
            expiresAt: BASE_TIME + 86_400_000,
            organizationId: ORGANIZATION_ID,
            ownerWorkosUserId,
            state: "finalized",
            updatedAt: BASE_TIME,
          },
        );
        const assetId = await ctx.db.insert("buildCollaborationAssets", {
          ...assetFields,
          contentHashSha256: `${contextKind}-private-hash`,
          createdAt: BASE_TIME,
          fileName: `${contextKind}-private.txt`,
          originatingPostId: undefined,
          publishedAt: undefined,
          publishedOwnerKind: undefined,
          publishedOwnerRecordId: undefined,
          readerWorkosUserIds: undefined,
          stagingSessionId: sessionId,
          storageId,
          updatedAt: BASE_TIME,
        });
        await ctx.db.patch(sessionId, { assetId });
        return assetId;
      };
      return {
        approvalAssetId: await makePrivateAsset(
          "draft",
          "user_broker",
          draftId,
        ),
        ownerAssetId: await makePrivateAsset("composer", "user_builder"),
      };
    });
    for (const [assetId, expectedBasis] of [
      [privateAssets.ownerAssetId, "staging_session_owner"],
      [privateAssets.approvalAssetId, "draft_approval_owner"],
    ] as const) {
      const created = await fixture.builder.mutation(
        (api as any).build_collaboration_exports
          .requestBuildCollaborationExport,
        {
          assetId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          scope: "asset",
        },
      );
      const downloaded = await fixture.builder.mutation(
        (api as any).build_collaboration_exports
          .downloadBuildCollaborationExport,
        {
          buildId: fixture.buildId,
          exportId: created.exportId,
          organizationId: ORGANIZATION_ID,
          token: created.token,
        },
      );
      expect(
        JSON.parse(downloaded.aclSnapshotJson).assetDecisions[0],
      ).toMatchObject({ assetId, basis: expectedBasis });
    }
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
      },
    );
    const before = await fixture.base.run(async (ctx) => ({
      events: await ctx.db
        .query("buildActionItemEvents")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", fixture.actionItemId),
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
      },
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
      },
    );
    await fixture.base.mutation(
      (internal as any).build_action_item_queues
        .processOneBuildActionItemDeadline,
      { actionItemId: fixture.actionItemId, asOf: BASE_TIME },
    );
    const after = await fixture.base.run(async (ctx) => ({
      events: await ctx.db
        .query("buildActionItemEvents")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", fixture.actionItemId),
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
  subject = `user_${role.replace("-", "_")}`,
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
  workpoolTest.register(base, "buildCollaborationSearchWorkpool");
  const admin = withIdentity(base, "admin");
  const foundation = await admin.mutation(
    (internal as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID },
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
      },
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
    await ctx.db.patch(proposalId, {
      activeBuildId: buildId,
      workflowRuleSnapshotId,
    });
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
    await ctx.db.insert("buildCollaborationRetentionPolicies", {
      brokerageId: foundation.brokerageId,
      createdAt: now,
      createdByRole: "admin",
      createdByWorkosUserId: "user_admin",
      organizationId: ORGANIZATION_ID,
      policyKey: "fixture-default",
      reason: "Provide a purgeable closure baseline for lifecycle tests.",
      retentionDays: 3650,
      state: "active",
      version: 1,
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
      },
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
      },
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
      new Blob(["archive evidence"], { type: "text/plain" }),
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
    return {
      actionItemId,
      assetId,
      brokerageId: foundation.brokerageId,
      buildId,
      builderProfileId: foundation.builderProfileId,
      secretPostId,
      sharedPostId,
    };
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
  text: string,
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
    },
  );
}

async function closeLifecycleFixtureForRetention(
  fixture: Awaited<ReturnType<typeof seedLifecycleFixture>>,
) {
  await fixture.admin.mutation(
    (api as any).build_collaboration_retention
      .setBuildCollaborationRetentionPolicy,
    {
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      policyKey: "archive-purge-exclusion",
      reason: "Govern archive and purge exclusion coverage.",
      retentionDays: 30,
    },
  );
  await closeLifecycleFixture(
    fixture,
    "Close the Build for archive and purge exclusion coverage.",
  );
}

async function closeLifecycleFixture(
  fixture: Awaited<ReturnType<typeof seedLifecycleFixture>>,
  reason: string,
) {
  await fixture.admin.mutation(
    (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
    {
      buildId: fixture.buildId,
      expectedRevision: 0,
      organizationId: ORGANIZATION_ID,
      reason,
      waivers: [
        {
          actionItemId: fixture.actionItemId,
          reason: "Administrative archive exception.",
        },
      ],
    },
  );
}

async function readArchiveText(
  base: Awaited<ReturnType<typeof seedLifecycleFixture>>["base"],
  exportId: Id<"buildCollaborationExports">,
) {
  return await base.run(async (ctx) => {
    const chunks = await ctx.db
      .query("buildCollaborationExportArchiveChunks")
      .withIndex("by_exportId_and_sequence", (query) =>
        query.eq("exportId", exportId),
      )
      .collect();
    let text = "";
    for (const chunk of chunks.sort(
      (left, right) => left.sequence - right.sequence,
    )) {
      if (chunk.content) {
        text += new TextDecoder().decode(chunk.content);
      } else if (chunk.storageId) {
        const body = await ctx.storage.get(chunk.storageId);
        if (!body) {
          throw new Error("Expected persisted archive chunk body.");
        }
        text += await body.text();
      } else {
        throw new Error("Expected persisted archive chunk content.");
      }
    }
    return text;
  });
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
